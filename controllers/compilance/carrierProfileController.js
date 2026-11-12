// Carrier profiles (Canadian NSC / US FMCSA SMS) as stand-alone records.
//
// The client asked for carrier profiles to be kept completely separate from CVSA
// inspections: uploading a profile must not create or change CVSA inspection records.
// Each upload is stored whole on a CarrierProfileImport (version 2) and the Carrier
// Performance dashboard is calculated only from what the profile itself says.

import mongoose from "mongoose";
import { CarrierProfileImport } from "../../models/compliance/carrierProfileImportModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { extractCarrierProfileData } from "../../services/openaiService.js";
import { normalizeCarrierProfileExtraction, parseDocumentDate } from "../../utils/carrierProfileUtils.js";

const toObjectId = (value) =>
  value && mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : value;

const companyQuery = (companyId) => {
  const oid = toObjectId(companyId);
  return { company: oid && oid !== companyId ? { $in: [oid, companyId] } : companyId };
};

// NSC "Result" column → our status
const NSC_STATUS = { PASS: 'pass', FAIL: 'fail', OOS: 'out-of-service', WARNING: 'warning', 'REQ ATTN': 'fail', 'REQ. ATTN.': 'fail' };

// Status → dashboard bucket. On US SMS profiles "warning" means violations were written up
// but the vehicle wasn't put out of service; it is counted in the "fail" bucket.
const bucketOf = (status) => (status === 'pass' ? 'pass' : status === 'out-of-service' ? 'oos' : 'fail');

const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** Turns any extraction result into the stored profile shape. */
export const buildProfileRecord = (raw) => {
  const checks = [];

  if (raw?.format === 'nsc') {
    const inspections = raw.inspections.map((r) => ({
      reportNumber: r.reportNumber,
      date: r.date,
      jurisdiction: r.province,
      location: r.location,
      level: r.level,
      status: NSC_STATUS[r.result] || 'fail',
      vehicleUnitNo: r.vehicleUnitNo,
      driverName: r.driverName,
      weight: r.weight,
      violations: []
    }));
    const t = raw.printedTotals || {};
    const counted = { pass: 0, fail: 0, oos: 0 };
    inspections.forEach((r) => { counted[bucketOf(r.status)]++; });
    if (t.inspections !== null && t.inspections !== undefined && t.inspections !== inspections.length) {
      checks.push(`The profile lists ${t.inspections} inspections but ${inspections.length} rows were read`);
    }
    for (const k of ['pass', 'fail', 'oos']) {
      if (typeof t[k] === 'number' && t[k] !== counted[k]) checks.push(`Printed ${k.toUpperCase()} count is ${t[k]}, rows read: ${counted[k]}`);
    }
    return {
      country: 'canada',
      format: 'nsc',
      readBy: 'parser',
      carrierName: raw.carrier?.name || null,
      nscNumber: raw.carrier?.nscNumber || null,
      usdotNumber: raw.carrier?.usdotNumber || null,
      safetyRating: raw.carrier?.safetyRating || null,
      profileDate: raw.profileDate || null,
      thresholds: raw.thresholds || null,
      printedTotals: t,
      inspections,
      convictions: raw.convictions || [],
      defects: raw.defects || [],
      accidents: raw.accidents ?? null,
      fleet: raw.fleet || null,
      checks
    };
  }

  if (raw?.format === 'sms') {
    const inspections = raw.inspections.map((r) => ({
      reportNumber: r.reportNumber,
      date: r.date,
      jurisdiction: r.state,
      location: r.location,
      level: null,
      status: r.result,
      vehicleUnitNo: r.vehicleUnitNo,
      driverName: null,
      violations: r.violations || []
    }));
    const t = raw.printedTotals || {};
    if (typeof t.inspections === 'number' && t.inspections !== inspections.length) {
      checks.push(`The profile lists ${t.inspections} inspections but ${inspections.length} rows were read`);
    }
    const violationCount = inspections.reduce((n, r) => n + r.violations.length, 0);
    if (typeof t.violations === 'number' && t.violations !== violationCount) {
      checks.push(`The profile lists ${t.violations} violations but ${violationCount} were read`);
    }
    return {
      country: 'usa',
      format: 'sms',
      readBy: 'parser',
      carrierName: raw.carrier?.name || null,
      nscNumber: null,
      usdotNumber: raw.carrier?.usdotNumber || null,
      safetyRating: raw.carrier?.safetyRating || null,
      profileDate: raw.profileDate || null,
      period: raw.summary?.period || null,
      thresholds: null,
      printedTotals: t,
      inspections,
      convictions: [],
      defects: [],
      accidents: null,
      fleet: null,
      checks
    };
  }

  // Any other layout: AI extraction, normalised. Less exact, so it is flagged as such.
  const n = normalizeCarrierProfileExtraction(raw);
  const byCountry = n.inspections.reduce((acc, r) => { if (r.country) acc[r.country] = (acc[r.country] || 0) + 1; return acc; }, {});
  const country = (byCountry.usa || 0) > (byCountry.canada || 0) ? 'usa' : 'canada';
  checks.push('This profile layout was read by AI. Compare the totals with the document.');
  return {
    country,
    format: 'ai',
    readBy: 'ai',
    carrierName: n.carrier?.name || null,
    nscNumber: n.carrier?.nscNumber || null,
    usdotNumber: n.carrier?.usdotNumber || null,
    safetyRating: n.carrier?.safetyRating || null,
    profileDate: n.period?.end || null,
    thresholds: null,
    printedTotals: {
      inspections: n.documentTotals.totalInspections,
      pass: n.documentTotals.totalPass,
      fail: n.documentTotals.totalFail,
      oos: n.documentTotals.totalOutOfService
    },
    inspections: n.inspections.map((r) => ({
      reportNumber: r.reportNumber,
      date: r.date,
      jurisdiction: r.jurisdiction,
      location: r.location,
      level: r.inspectionType,
      status: r.status || 'fail',
      vehicleUnitNo: r.vehicleUnitNo,
      driverName: r.driverName,
      violations: r.violations || []
    })),
    convictions: [],
    defects: [],
    accidents: null,
    fleet: null,
    checks
  };
};

const monthKey = (iso) => (iso ? String(iso).slice(0, 7) : null);
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const rate = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Everything the Carrier Performance dashboard shows, from one profile (+ the previous one). */
export const computeProfileDashboard = (profile, previous) => {
  const inspections = (profile.inspections || []).filter((r) => r.date);
  const convictions = profile.convictions || [];

  const counts = { pass: 0, fail: 0, oos: 0 };
  inspections.forEach((r) => { counts[bucketOf(r.status)]++; });
  const totalInspections = inspections.length;

  // Month list: the 24 months covered by the profile, ending at its latest month
  const endKey = monthKey(isoDay(profile.profileDate)) ||
    inspections.map((r) => monthKey(r.date)).sort().pop() || monthKey(new Date().toISOString());
  const [ey, em] = endKey.split('-').map(Number);
  const months = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(Date.UTC(ey, em - 1 - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  const monthly = months.map((key) => {
    const rows = inspections.filter((r) => monthKey(r.date) === key);
    const c = { pass: 0, fail: 0, oos: 0 };
    rows.forEach((r) => { c[bucketOf(r.status)]++; });
    const tickets = convictions.filter((cv) => monthKey(cv.violationDate) === key).length;
    return {
      month: key,
      label: monthLabel(key),
      inspections: rows.length,
      pass: c.pass,
      fail: c.fail,
      oos: c.oos,
      passRate: rate(c.pass, rows.length),
      oosRate: rate(c.oos, rows.length),
      tickets
    };
  });
  // Change vs the previous month that had inspections
  let prevWithData = null;
  monthly.forEach((m) => {
    if (m.inspections > 0 && prevWithData) {
      m.passRateChange = Math.round((m.passRate - prevWithData.passRate) * 10) / 10;
      m.trend = m.passRateChange > 0 ? 'up' : m.passRateChange < 0 ? 'down' : 'same';
    } else {
      m.passRateChange = null;
      m.trend = null;
    }
    if (m.inspections > 0) prevWithData = m;
  });

  // Last 12 months vs the 12 before
  const half = (from, to) => {
    const slice = monthly.slice(from, to);
    const sum = (k) => slice.reduce((n, m) => n + m[k], 0);
    const total = sum('inspections');
    return { inspections: total, pass: sum('pass'), fail: sum('fail'), oos: sum('oos'), tickets: sum('tickets'), passRate: rate(sum('pass'), total), oosRate: rate(sum('oos'), total) };
  };
  const last12 = half(12, 24);
  const prior12 = half(0, 12);

  // Violation / defect categories
  let categories = [];
  if ((profile.defects || []).length) {
    const byCat = {};
    profile.defects.forEach((d) => { byCat[d.category] = (byCat[d.category] || 0) + d.count; });
    categories = Object.entries(byCat).map(([name, count]) => ({ name, count }));
  } else {
    const byCat = {};
    inspections.forEach((r) => (r.violations || []).forEach((v) => {
      const name = (String(v.description || '').split(':')[0] || 'Other').trim();
      byCat[name] = (byCat[name] || 0) + 1;
    }));
    categories = Object.entries(byCat).map(([name, count]) => ({ name, count }));
  }
  categories.sort((a, b) => b.count - a.count);

  // Compared with the previous upload for the same country
  let comparison = null;
  if (previous) {
    const prevInsp = (previous.inspections || []).filter((r) => r.date);
    const pc = { pass: 0, fail: 0, oos: 0 };
    prevInsp.forEach((r) => { pc[bucketOf(r.status)]++; });
    const diff = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.round((a - b) * 100) / 100 : null);
    comparison = {
      previousProfileId: previous._id,
      previousProfileDate: previous.profileDate,
      previousUploadedAt: previous.createdAt,
      inspections: diff(totalInspections, prevInsp.length),
      pass: diff(counts.pass, pc.pass),
      fail: diff(counts.fail, pc.fail),
      oos: diff(counts.oos, pc.oos),
      tickets: diff(convictions.length, (previous.convictions || []).length),
      passRate: diff(rate(counts.pass, totalInspections), rate(pc.pass, prevInsp.length)),
      oosRate: diff(rate(counts.oos, totalInspections), rate(pc.oos, prevInsp.length)),
      overallThreshold: diff(profile.thresholds?.overall, previous.thresholds?.overall),
      safetyRatingBefore: previous.safetyRating || null,
      safetyRatingNow: profile.safetyRating || null
    };
  }

  return {
    profile: {
      _id: profile._id,
      country: profile.country,
      format: profile.format,
      readBy: profile.readBy,
      fileName: profile.fileName,
      carrierName: profile.carrierName,
      nscNumber: profile.nscNumber,
      usdotNumber: profile.usdotNumber,
      safetyRating: profile.safetyRating,
      profileDate: profile.profileDate,
      period: profile.period,
      uploadedAt: profile.createdAt,
      thresholds: profile.thresholds,
      printedTotals: profile.printedTotals,
      accidents: profile.accidents,
      fleet: profile.fleet,
      checks: profile.checks || []
    },
    summary: {
      inspections: totalInspections,
      pass: counts.pass,
      fail: counts.fail,
      oos: counts.oos,
      passRate: rate(counts.pass, totalInspections),
      oosRate: rate(counts.oos, totalInspections),
      tickets: convictions.length,
      ticketsLast12: convictions.filter((cv) => monthKey(cv.violationDate) >= months[12]).length,
      violations: inspections.reduce((n, r) => n + (r.violations || []).length, 0)
    },
    last12,
    prior12,
    monthly,
    categories,
    comparison,
    convictions: [...convictions].sort((a, b) => String(b.violationDate).localeCompare(String(a.violationDate))),
    inspections: [...inspections].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  };
};

const summaryOf = (p) => ({
  _id: p._id,
  country: p.country,
  format: p.format,
  readBy: p.readBy,
  fileName: p.fileName,
  carrierName: p.carrierName,
  safetyRating: p.safetyRating,
  profileDate: p.profileDate,
  uploadedAt: p.createdAt,
  uploadedBy: p.createdBy?.name || null,
  inspections: (p.inspections || []).length,
  tickets: (p.convictions || []).length,
  checks: p.checks || []
});

// POST /admin/carrier-profiles/upload  (multipart field: document)
export const uploadCarrierProfile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Please upload the carrier profile PDF" });
    }
    const companyId = getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Please complete company settings first." });
    }

    const extraction = await extractCarrierProfileData(req.file.buffer, req.file.mimetype);
    if (!extraction.success) {
      return res.status(extraction.statusCode || 422).json({ success: false, message: extraction.error || "Could not read this carrier profile" });
    }

    const record = buildProfileRecord(extraction.data);
    if (record.inspections.length === 0 && !(record.printedTotals && record.printedTotals.inspections === 0)) {
      return res.status(422).json({ success: false, message: "No inspections could be read from this document. Please check it is a carrier profile PDF." });
    }

    // The same profile uploaded twice
    if (record.profileDate) {
      const day = new Date(`${record.profileDate}T00:00:00Z`);
      const dup = await CarrierProfileImport.findOne({
        ...companyQuery(companyId),
        version: 2,
        country: record.country,
        profileDate: { $gte: day, $lt: new Date(day.getTime() + 86400000) }
      }).lean();
      if (dup) {
        return res.status(409).json({
          success: false,
          message: `This ${record.country === 'usa' ? 'USA' : 'Canadian'} profile (dated ${record.profileDate}) was already uploaded on ${isoDay(dup.createdAt)}. Delete that upload first to replace it.`
        });
      }
    }

    const saved = await CarrierProfileImport.create({
      company: toObjectId(companyId),
      version: 2,
      fileName: req.file.originalname || null,
      ...record,
      profileDate: record.profileDate ? new Date(`${record.profileDate}T12:00:00Z`) : null,
      period: record.period || null,
      rowsInDocument: record.inspections.length,
      createdCount: 0,
      createdBy: req.user?._id
    });

    const previous = await CarrierProfileImport.findOne({
      ...companyQuery(companyId), version: 2, country: saved.country, _id: { $ne: saved._id },
      profileDate: { $lt: saved.profileDate || new Date() }
    }).sort({ profileDate: -1, createdAt: -1 }).lean();

    res.status(201).json({
      success: true,
      message: `${saved.country === 'usa' ? 'USA' : 'Canadian'} carrier profile saved: ${record.inspections.length} inspection(s)${record.convictions.length ? `, ${record.convictions.length} ticket(s)` : ''}.`,
      data: computeProfileDashboard(saved.toObject(), previous)
    });
  } catch (err) {
    console.error('Error uploading carrier profile:', err);
    res.status(500).json({ success: false, message: err.message || "Failed to process carrier profile" });
  }
};

// GET /admin/carrier-profiles?country=canada|usa
export const listCarrierProfiles = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId) return res.json({ success: true, data: [] });
    const query = { ...companyQuery(companyId), version: 2 };
    if (['canada', 'usa'].includes(req.query.country)) query.country = req.query.country;
    const list = await CarrierProfileImport.find(query)
      .sort({ profileDate: -1, createdAt: -1 })
      .populate('createdBy', 'name')
      .lean();
    res.json({ success: true, data: list.map(summaryOf) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /admin/carrier-profiles/dashboard?country=canada|usa&profileId=
export const getCarrierProfileDashboard = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const country = req.query.country === 'usa' ? 'usa' : 'canada';
    if (!companyId) return res.json({ success: true, data: null });

    const base = { ...companyQuery(companyId), version: 2, country };
    const profile = req.query.profileId && mongoose.Types.ObjectId.isValid(req.query.profileId)
      ? await CarrierProfileImport.findOne({ ...base, _id: req.query.profileId }).lean()
      : await CarrierProfileImport.findOne(base).sort({ profileDate: -1, createdAt: -1 }).lean();
    if (!profile) {
      return res.json({ success: true, data: null, message: `No ${country === 'usa' ? 'USA' : 'Canadian'} carrier profile uploaded yet.` });
    }
    const previous = await CarrierProfileImport.findOne({
      ...base, _id: { $ne: profile._id }, profileDate: { $lt: profile.profileDate || new Date() }
    }).sort({ profileDate: -1, createdAt: -1 }).lean();

    res.json({ success: true, data: computeProfileDashboard(profile, previous) });
  } catch (err) {
    console.error('Error building carrier profile dashboard:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /admin/carrier-profiles/:id
export const deleteCarrierProfile = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    const deleted = await CarrierProfileImport.findOneAndDelete({ ...companyQuery(companyId), version: 2, _id: req.params.id });
    if (!deleted) return res.status(404).json({ success: false, message: "Carrier profile not found" });
    res.json({ success: true, message: "Carrier profile deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Exported for tests
export { bucketOf, parseDocumentDate };
