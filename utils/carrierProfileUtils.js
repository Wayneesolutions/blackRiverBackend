// Helpers that turn raw AI output from a carrier profile document into clean,
// consistent CVSA inspection rows. The AI is good at reading the table but
// inconsistent about formats, so everything here is deterministic clean-up.

const CANADA_CODES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
const USA_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

const CANADA_NAMES = {
  alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB', 'new brunswick': 'NB', newfoundland: 'NL',
  'newfoundland and labrador': 'NL', 'nova scotia': 'NS', 'northwest territories': 'NT', nunavut: 'NU',
  ontario: 'ON', 'prince edward island': 'PE', quebec: 'QC', 'québec': 'QC', saskatchewan: 'SK', yukon: 'YT'
};

const USA_NAMES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC'
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());

/** Returns { code, country } for a province/state code or name, or null. */
export const resolveJurisdiction = (value) => {
  const raw = clean(value);
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/[^A-Z ]/g, '').trim();
  if (CANADA_CODES.includes(upper)) return { code: upper, country: 'canada' };
  if (USA_CODES.includes(upper)) return { code: upper, country: 'usa' };
  const lower = raw.toLowerCase();
  if (CANADA_NAMES[lower]) return { code: CANADA_NAMES[lower], country: 'canada' };
  if (USA_NAMES[lower]) return { code: USA_NAMES[lower], country: 'usa' };
  return null;
};

/** Infers the country from a free-text location such as "Headingley, MB" or "Emerson Port". */
export const countryFromLocation = (location) => {
  const text = clean(location);
  if (!text) return null;
  // Places outside Canada/USA ("Headingley, Leeds, UK") must not match Canadian town names
  if (/\b(uk|u\.k\.|united kingdom|england|scotland|wales|mexico)\b/i.test(text)) return null;
  // Trailing 2-letter code: "Brandon, MB", "Fargo ND". Only the last token is
  // trusted, since words like "IN" or "OR" appear in ordinary location text.
  const tokens = text.toUpperCase().split(/[\s,/()-]+/).filter(Boolean);
  const last = tokens[tokens.length - 1];
  if (last && last.length === 2) {
    if (CANADA_CODES.includes(last)) return 'canada';
    if (USA_CODES.includes(last)) return 'usa';
  }
  const lower = text.toLowerCase();
  for (const name of Object.keys(CANADA_NAMES)) {
    if (lower.includes(name)) return 'canada';
  }
  if (/\b(canada|winnipeg|toronto|calgary|edmonton|regina|saskatoon|vancouver|montreal|ottawa|brandon|emerson|headingley|kenora|thunder bay)\b/.test(lower)) {
    return 'canada';
  }
  if (/\b(usa|u\.s\.a\.|united states)\b/.test(lower)) return 'usa';
  // Full US state names ("Texas", "North Dakota"). Checked after Canadian names so
  // "New Brunswick" etc. still resolve to Canada; word boundaries avoid partial matches.
  for (const name of Object.keys(USA_NAMES)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) return 'usa';
  }
  return null;
};

/** Parses the date formats seen on carrier profiles into "YYYY-MM-DD" (or null). */
export const parseDocumentDate = (value) => {
  const raw = clean(value);
  if (!raw) return null;

  const build = (y, m, d) => {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() !== m - 1) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  // 2025-12-30 / 2025/12/30 (optionally followed by a time)
  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return build(+m[1], +m[2], +m[3]);

  // 30/Dec/2025, 30-Dec-25, 30 Dec 2025
  m = raw.match(/^(\d{1,2})[\s\-/.]+([A-Za-z]{3,})[\s\-/.,]+(\d{2,4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return build(+m[3], mi + 1, +m[1]);
  }

  // Dec 30, 2025 / December 30 2025
  m = raw.match(/^([A-Za-z]{3,})[\s.]+(\d{1,2})(?:st|nd|rd|th)?[\s,]+(\d{2,4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) return build(+m[3], mi + 1, +m[2]);
  }

  // Numeric with slashes: Canadian documents print day first; only treat as
  // month-first when the first number cannot be a day/month split otherwise.
  m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    if (b > 12) return build(y, a, b); // 12/30/2025 → month first
    return build(y, b, a); // 30/12/2025 or 05/06/2025 → day first
  }

  return null;
};

/** Maps the "Result" column to our status values. */
export const normalizeStatus = (value) => {
  const v = clean(value).toLowerCase().replace(/[^a-z]/g, '');
  if (!v) return null;
  if (['pass', 'passed', 'p', 'nodefect', 'nodefects', 'clean', 'ok'].includes(v)) return 'pass';
  if (v.startsWith('oos') || v.includes('outofservice') || v === 'os') return 'out-of-service';
  if (['fail', 'failed', 'f', 'defect', 'defects', 'reqattn', 'requiresattention'].includes(v) || v.startsWith('fail')) return 'fail';
  if (['warning', 'warn', 'w', 'warned', 'conditional'].includes(v)) return 'warning';
  return null;
};

/** Maps "Level" (1, "III", "Level 3", "level-3") to "level-N". */
export const normalizeLevel = (value) => {
  const v = clean(value).toUpperCase().replace(/LEVEL|[-\s]/g, '');
  const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
  const n = roman[v] || parseInt(v, 10);
  return n >= 1 && n <= 6 ? `level-${n}` : 'level-1';
};

const normalizeSeverity = (value) => {
  const v = clean(value).toLowerCase();
  if (v.includes('crit') || v.includes('oos') || v.includes('out')) return 'critical';
  if (v.includes('maj') || v.includes('high')) return 'major';
  return 'minor';
};

/** Works out an inspection's country from all the hints a row carries. */
export const resolveInspectionCountry = (row) => {
  const jurisdiction =
    resolveJurisdiction(row.province) ||
    resolveJurisdiction(row.state) ||
    resolveJurisdiction(row.jurisdiction);
  if (jurisdiction) return { country: jurisdiction.country, jurisdiction: jurisdiction.code };

  const fromLocation = countryFromLocation(row.location);
  if (fromLocation) return { country: fromLocation, jurisdiction: null };

  // Report numbers often start with the jurisdiction: MBE25-..., ONEA..., AB29...
  const report = clean(row.reportNumber).toUpperCase();
  const prefix = report.slice(0, 2);
  if (CANADA_CODES.includes(prefix)) return { country: 'canada', jurisdiction: prefix };
  if (USA_CODES.includes(prefix) && /^[A-Z]{2}\d/.test(report)) return { country: 'usa', jurisdiction: prefix };

  // The AI's own country guess is the weakest hint, so it comes last
  const explicit = clean(row.country).toLowerCase();
  if (explicit === 'canada' || explicit === 'ca' || explicit === 'can') return { country: 'canada', jurisdiction: null };
  if (explicit === 'usa' || explicit === 'us' || explicit === 'united states') return { country: 'usa', jurisdiction: null };

  return { country: null, jurisdiction: null };
};

const summarize = (rows) => {
  const count = (fn) => rows.filter(fn).length;
  const total = rows.length;
  const pass = count((r) => r.status === 'pass');
  const oos = count((r) => r.status === 'out-of-service');
  return {
    totalInspections: total,
    totalPass: pass,
    totalFail: count((r) => r.status === 'fail'),
    totalWarning: count((r) => r.status === 'warning'),
    totalOutOfService: oos,
    canadaInspections: count((r) => r.country === 'canada'),
    usaInspections: count((r) => r.country === 'usa'),
    passRate: total ? Math.round((pass / total) * 100) : 0,
    oosRate: total ? Math.round((oos / total) * 100) : 0
  };
};

/**
 * Cleans one extraction result. Each row gets a country, a YYYY-MM-DD date and a
 * known status; rows that are not inspections (blank lines, repeated headers) are
 * dropped; the summary is recomputed from the rows so the numbers always add up.
 * What the document itself printed is kept separately in `documentTotals`.
 */
export const normalizeCarrierProfileExtraction = (raw) => {
  const data = raw && typeof raw === 'object' ? raw : {};
  const rawRows = Array.isArray(data.inspections) ? data.inspections : [];
  const seen = new Set();
  const inspections = [];

  for (const row of rawRows) {
    if (!row || typeof row !== 'object') continue;
    const reportNumber = clean(row.reportNumber) || null;
    const date = parseDocumentDate(row.date) || (row.year && row.month ? parseDocumentDate(`1 ${row.month} ${row.year}`) : null);
    const status = normalizeStatus(row.status ?? row.result);
    if (!reportNumber && !date) continue; // not an inspection row
    if (reportNumber && /^report/i.test(reportNumber)) continue; // repeated table header

    const dedupeKey = reportNumber ? `r:${reportNumber.toUpperCase()}` : `d:${date}|${clean(row.location).toLowerCase()}|${clean(row.vehicleUnitNo).toUpperCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const { country, jurisdiction } = resolveInspectionCountry(row);
    inspections.push({
      reportNumber,
      date,
      country,
      jurisdiction: jurisdiction || clean(row.province || row.state).toUpperCase() || null,
      location: clean(row.location) || null,
      status,
      inspectionType: normalizeLevel(row.inspectionType ?? row.level),
      vehicleUnitNo: clean(row.vehicleUnitNo) || null,
      driverName: clean(row.driverName) || null,
      driverLicenseNumber: clean(row.driverLicenseNumber) || null,
      inspectorName: clean(row.inspectorName) || null,
      violations: Array.isArray(row.violations)
        ? row.violations
            .filter((v) => v && (clean(v.code) || clean(v.description)))
            .map((v) => ({
              code: clean(v.code) || 'N/A',
              description: clean(v.description) || 'No description',
              severity: normalizeSeverity(v.severity)
            }))
        : [],
      notes: clean(row.notes) || null
    });
  }

  inspections.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const docSummary = data.summary && typeof data.summary === 'object' ? data.summary : {};
  const toNum = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const dates = inspections.map((r) => r.date).filter(Boolean);

  return {
    carrier: {
      name: clean(data.carrier?.name) || null,
      nscNumber: clean(data.carrier?.nscNumber) || null,
      usdotNumber: clean(data.carrier?.usdotNumber) || null,
      safetyRating: normalizeSafetyRating(data.carrier?.safetyRating || docSummary.safetyRating)
    },
    period: {
      label: clean(docSummary.period) || null,
      start: parseDocumentDate(data.period?.start ?? docSummary.periodStart) || dates[0] || null,
      end: parseDocumentDate(data.period?.end ?? docSummary.periodEnd) || dates[dates.length - 1] || null
    },
    documentTotals: {
      totalInspections: toNum(docSummary.totalInspections),
      totalPass: toNum(docSummary.totalPass),
      totalFail: toNum(docSummary.totalFail),
      totalWarning: toNum(docSummary.totalWarning),
      totalOutOfService: toNum(docSummary.totalOutOfService)
    },
    inspections,
    summary: { ...summarize(inspections), period: clean(docSummary.period) || null, safetyRating: normalizeSafetyRating(data.carrier?.safetyRating || docSummary.safetyRating) }
  };
};

export const summarizeInspectionRows = summarize;

/** Normalizes the safety rating text to the values the UI colours. */
export function normalizeSafetyRating(value) {
  const v = clean(value).toLowerCase();
  if (!v) return null;
  if (v.startsWith('unsat')) return 'Unsatisfactory';
  if (v.startsWith('cond')) return 'Conditional';
  if (v.startsWith('sat') || v.includes('excellent')) return 'Satisfactory';
  return clean(value);
}

// ─── US FMCSA SMS carrier profiles ──────────────────────────────────────────
// The USA profile (FMCSA SMS "Inspection History") is a different document from the
// Canadian NSC carrier profile: dates are printed MONTH first (9/3/2026 = Sept 3), and there
// is no Pass/Fail column — the result has to come from the violations listed under each
// inspection. It also has a clean text layer, so it is parsed directly instead of by AI.

/** True when the PDF text layer looks like an FMCSA SMS profile. */
export const isFmcsaSmsProfile = (text) =>
  typeof text === 'string' && /U\.S\. DOT#/i.test(text) && /INSPECTION HISTORY/i.test(text);

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "9/3/2026" (US, month first) → "2026-09-03" */
const parseUsDate = (value) => {
  const m = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = +m[1];
  const day = +m[2];
  const year = +m[3];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Inspection result for an SMS row: any out-of-service violation → OOS; any other
 * violation → warning (violations noted, vehicle not put out of service); none → pass.
 */
const smsStatus = (violations) => {
  if (violations.some((v) => v.oos)) return 'out-of-service';
  if (violations.length > 0) return 'warning';
  return 'pass';
};

/**
 * Parses the pdf.js text layer of an FMCSA SMS profile (cells joined with " | ") into the
 * same raw shape the AI extraction returns, so it can go through normalizeCarrierProfileExtraction.
 */
export const parseFmcsaSmsProfile = (text) => {
  const lines = String(text || '').split('\n').map((l) => l.trim());
  const inspections = [];
  let current = null;
  let lastViolation = null;
  let inHistory = false;

  const rowRe = /^(\d{1,2}\/\d{1,2}\/\d{4}) \| ([A-Z0-9]+) \| ([A-Z]{2}) \| ([^|]+?) \| ([A-Z]{2}) \| ([^|]+?)(?: \| \d+)?$/;
  const violationRe = /^(.+?) Violation: \| (\S+) (.+?) \| (\d+)(?: \+ (\d+) \(OOS\))?$/;

  for (const line of lines) {
    if (!line) continue;
    if (/^INSPECTION HISTORY/i.test(line)) { inHistory = true; continue; }
    if (!inHistory) continue;
    if (/^Summary of Activities/i.test(line)) break;
    // Repeated column headers / page markers
    if (/^--- Page/.test(line) || /^Report \|/.test(line) || /^Severity \|/.test(line) || /^Inspection Date \|/.test(line) || /^\(SW\)/.test(line)) continue;

    const row = line.match(rowRe);
    if (row) {
      current = {
        reportNumber: row[2],
        date: parseUsDate(row[1]),
        state: row[3],
        location: `${row[3]}, USA`,
        vehicleUnitNo: clean(row[4]),
        notes: `Plate state: ${row[5]} · Vehicle: ${clean(row[6])}`,
        violations: []
      };
      inspections.push(current);
      lastViolation = null;
      continue;
    }

    const viol = line.match(violationRe);
    if (viol && current) {
      const oos = !!viol[5] || /\(OOS\)/.test(viol[3]);
      const weight = Number(viol[4]) || 0;
      lastViolation = {
        code: viol[2],
        description: `${clean(viol[1])}: ${clean(viol[3])}`,
        severity: oos ? 'critical' : weight >= 7 ? 'major' : 'minor',
        oos
      };
      current.violations.push(lastViolation);
      continue;
    }

    // Wrapped description text belongs to the previous violation
    if (lastViolation && !line.includes(' | ')) {
      lastViolation.description = `${lastViolation.description} ${line}`;
    }
  }

  for (const row of inspections) {
    row.result = smsStatus(row.violations);
    row.violations = row.violations.map(({ code, description, severity }) => ({ code, description, severity }));
  }

  const usdot = (String(text).match(/U\.S\. DOT#:?\s*\|?\s*(\d+)/i) || [])[1] || null;
  const nameLine = lines.findIndex((l) => /U\.S\. DOT#/i.test(l));
  const carrierName = nameLine > 0 ? clean(lines[nameLine - 1].split(' | ')[0]) : null;
  const total = (String(text).match(/Total Inspections:\s*\|?\s*(\d+)/i) || [])[1];
  const ending = String(text).match(/record ending (\w+) (\d{1,2}), (\d{4})/i);
  const periodEnd = ending && MONTH_NAMES.includes(ending[1].toLowerCase())
    ? `${ending[3]}-${String(MONTH_NAMES.indexOf(ending[1].toLowerCase()) + 1).padStart(2, '0')}-${String(+ending[2]).padStart(2, '0')}`
    : null;

  const violationTotal = (String(text).match(/VIOLATION SUMMARY[\s\S]*?Violations:\s*\|?\s*(\d+)/i) || [])[1];
  return {
    format: 'sms',
    profileDate: periodEnd,
    printedTotals: {
      inspections: total ? Number(total) : null,
      violations: violationTotal ? Number(violationTotal) : null
    },
    carrier: { name: carrierName, usdotNumber: usdot, safetyRating: null },
    period: { start: null, end: periodEnd },
    inspections,
    summary: {
      totalInspections: total ? Number(total) : null,
      period: ending ? `24-month record ending ${ending[1]} ${ending[2]}, ${ending[3]}` : null
    }
  };
};

// ─── Canadian NSC carrier profiles (Manitoba "Carrier Profile Summary") ─────
// Parsed directly from the PDF text layer so the dashboard shows exactly what the
// profile prints: CVSA Pass / Fail / OOS counts, thresholds, safety rating, every
// inspection row, every conviction (ticket), defects by category and accidents.

/** True when the PDF text layer looks like a Canadian NSC carrier profile. */
export const isNscCarrierProfile = (text) =>
  typeof text === 'string' && /Carrier Profile Summary/i.test(text) && /NSC #/i.test(text);

const field = (text, label) => {
  const m = String(text).match(new RegExp(`${label}\\s*\\|\\s*([^|\\n]+)`, 'i'));
  return m ? clean(m[1]) : null;
};

const pct = (v) => (v === undefined || v === null || v === '' ? null : Number(String(v).replace('%', '')));

/** Section of the text between two headings (start inclusive of nothing, end exclusive). */
const section = (lines, startRe, endRe) => {
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return [];
  const rel = lines.slice(start + 1).findIndex((l) => endRe.test(l));
  return lines.slice(start + 1, rel < 0 ? undefined : start + 1 + rel);
};

const isNoise = (l) =>
  !l || /^--- Page/.test(l) || /^Created:/.test(l) || /^\d+$/.test(l) ||
  /^Report # \|/.test(l) || /^State \| Plate/.test(l) || /^Generic Code \|/.test(l) || /^Description \| Number/.test(l) ||
  /^Weight: Pass=/.test(l);

export const parseNscCarrierProfile = (text) => {
  const raw = String(text || '');
  const lines = raw.split('\n').map((l) => l.trim());

  // ── Header & summary ──
  const ratingIdx = lines.findIndex((l) => /^Safety Rating \| Performance Rating/i.test(l));
  const safetyRating = ratingIdx >= 0 ? clean(lines[ratingIdx + 1].split(' | ')[0]) : null;
  // "78.29% | 0.00%" follows "Inspection Threshold | Accident Threshold";
  // "46.32% | 68.68%" follows "Conviction Threshold | Overall Threshold" (with "Result | Count" between)
  const pctLines = lines.filter((l) => /^\d+(\.\d+)?% \| \d+(\.\d+)?%$/.test(l));
  const [inspectionThreshold, accidentThreshold] = pctLines[0] ? pctLines[0].split(' | ').map(pct) : [null, null];
  const [convictionThreshold, overallThreshold] = pctLines[1] ? pctLines[1].split(' | ').map(pct) : [null, null];
  const countAfter = (label) => {
    const inline = raw.match(new RegExp(`^${label} \\| (\\d+)$`, 'im'));
    if (inline) return Number(inline[1]);
    // Layout sometimes puts the number on the line above the label ("20" / "Fail")
    const i = lines.findIndex((l) => l === label);
    if (i > 0 && /^\d+$/.test(lines[i - 1])) return Number(lines[i - 1]);
    if (i >= 0 && /^\d+$/.test(lines[i + 1] || '')) return Number(lines[i + 1]);
    return null;
  };
  const printedPass = countAfter('Pass');
  const printedFail = countAfter('Fail');
  const printedOos = countAfter('OOS');
  const created = raw.match(/Created:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/); // US order, e.g. 11/2/2026
  const profileDate = created ? `${created[3]}-${created[1].padStart(2, '0')}-${created[2].padStart(2, '0')}` : null;

  // ── Convictions (tickets) ──
  const convictions = [];
  const convRe = /^(.+?) \| ([\w.()/-]+) \| (\w+) \| ([A-Z]{2}) \| (\d{2}\/[A-Za-z]{3}\/\d{4}) \| (\d{2}\/[A-Za-z]{3}\/\d{4}) \| ([^|]+?) \| (\d+) \| ([YN])(?: \| ([^|]+?))?(?: \| ([A-Z]{2}))?$/;
  let lastConv = null;
  for (const l of section(lines, /^Carrier Convictions$/i, /^Carrier Convictions by Offence/i)) {
    if (isNoise(l)) continue;
    const m = l.match(convRe);
    if (m) {
      lastConv = {
        description: clean(m[1]),
        section: m[2],
        ticketNumber: m[3],
        jurisdiction: m[4],
        violationDate: parseDocumentDate(m[5]),
        convictionDate: parseDocumentDate(m[6]),
        plate: clean(m[7]),
        weight: Number(m[8]),
        accidentInvolved: m[9] === 'Y',
        driverLicense: m[10] ? clean(m[10]) : null,
        licenseJurisdiction: m[11] || null
      };
      convictions.push(lastConv);
    } else if (lastConv && !l.includes(' | ')) {
      lastConv.description = `${lastConv.description} ${l}`; // wrapped description
    } else if (lastConv) {
      // A wrapped description line that also carries the end of a long licence number
      // ("A COMMERCIAL | 10")
      const wrap = l.match(/^(.+?) \| (\w+)$/);
      if (wrap) {
        lastConv.description = `${lastConv.description} ${clean(wrap[1])}`;
        if (lastConv.driverLicense) lastConv.driverLicense = `${lastConv.driverLicense}${wrap[2]}`;
      }
    }
  }
  const convTotals = raw.match(/GRAND TOTALS \| (\d+) \| (\d+)/i);

  // ── Inspections ──
  const inspections = [];
  // Long driver names run into the weight column ("SOOR , HARSIMRANSINGH 3"), so the last
  // separator may be a space instead of " | "
  const inspRe = /^(\S+) \| ([1-6]) \| ([A-Z]{2}) \| (.+?) \| (\d{2}\/[A-Za-z]{3}\/\d{4}) \| (\S+) \| (.+?)(?: \| | +)(\d+)$/;
  const resultRe = /^(?:(.+?) \| )?(PASS|FAIL|OOS|WARNING|REQ\.? ?ATTN\.?)$/i;
  let lastInsp = null;
  for (const l of section(lines, /^Carrier Inspections$/i, /^Carrier CVSA Inspection Defects/i)) {
    if (isNoise(l)) continue;
    const m = l.match(inspRe);
    if (m) {
      lastInsp = {
        reportNumber: m[1],
        level: Number(m[2]),
        province: m[3],
        location: clean(m[4]),
        date: parseDocumentDate(m[5]),
        vehicleUnitNo: m[6],
        driverName: clean(m[7]).replace(/\s+,/g, ','),
        weight: Number(m[8]),
        result: null
      };
      inspections.push(lastInsp);
      continue;
    }
    const r = l.match(resultRe);
    if (r && lastInsp && !lastInsp.result) {
      if (r[1]) lastInsp.location = `${lastInsp.location} ${clean(r[1])}`;
      lastInsp.result = r[2].toUpperCase();
    } else if (lastInsp && !l.includes(' | ') && !lastInsp.result) {
      lastInsp.location = `${lastInsp.location} ${l}`;
    }
  }

  // ── Defects by category ──
  const defects = [];
  let category = null;
  for (const l of section(lines, /^Carrier CVSA Inspection Defects/i, /^(No Accidents|Carrier Accidents|Carrier Collisions)/i)) {
    if (/^--- Page|^Created:|^Category$|^Defect Description \|/.test(l)) continue;
    const total = l.match(/^Total for Report \| (\d+)/i);
    if (total) continue;
    if (/^Total for Category/i.test(l)) continue;
    const d = l.match(/^(.+?) \| (\d+)$/);
    if (d && category) defects.push({ category, description: clean(d[1]), count: Number(d[2]) });
    else if (l && !l.includes(' | ')) category = clean(l);
  }
  const defectTotal = raw.match(/Total for Report \| (\d+)/i);

  const noAccidents = /No Accidents for Carrier/i.test(raw);

  return {
    format: 'nsc',
    carrier: {
      name: field(raw, 'Carrier Name:'),
      nscNumber: field(raw, 'NSC #:'),
      usdotNumber: field(raw, 'US DOT #:'),
      safetyRating
    },
    profileDate,
    thresholds: { inspection: inspectionThreshold, accident: accidentThreshold, conviction: convictionThreshold, overall: overallThreshold },
    printedTotals: {
      pass: printedPass,
      fail: printedFail,
      oos: printedOos,
      inspections: [printedPass, printedFail, printedOos].every((n) => typeof n === 'number') ? printedPass + printedFail + printedOos : null,
      convictionsByOffence: convTotals ? Number(convTotals[1]) : null,
      defects: defectTotal ? Number(defectTotal[1]) : null
    },
    inspections,
    convictions,
    defects,
    accidents: noAccidents ? 0 : null,
    fleet: {
      current: Number(field(raw, 'Current MB Fleet:')) || null,
      average: Number(field(raw, 'Average MB Fleet:')) || null
    }
  };
};

/**
 * Country implied by an inspection's jurisdiction or location text ("Texas, USA" → usa,
 * "Brandon, MB" → canada). Returns null when the text does not say.
 * Used so an inspection typed in at a US location cannot be filed under Canada (and the reverse).
 */
export const countryFromInspectionPlace = ({ jurisdiction, location } = {}) =>
  resolveJurisdiction(jurisdiction)?.country || countryFromLocation(location) || null;
