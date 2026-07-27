import { RegulatorySafety } from "../../models/fleet/regulatorySafetyModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";

const sanitizeString = (value) => (typeof value === "string" ? value.trim() : value);

const buildSearchFilter = (search) => {
  if (!search) return null;
  const regex = new RegExp(search.trim(), "i");
  return {
    $or: [
      { unitNo: regex },
      { makeModel: regex },
      { safetyDecalNumber: regex },
      { safetyPaperNumber: regex },
      { shopName: regex },
      { invoiceNo: regex }
    ]
  };
};

const ensureCompanyContext = (req) => {
  const companyId = getUserCompanyId(req.user);
  const isSuperadmin = req.user?.role === "superadmin";
  return { companyId, isSuperadmin };
};

export const listRegulatorySafetyRecords = async (req, res) => {
  try {
    const { search = "" } = req.query;
    const { companyId, isSuperadmin } = ensureCompanyContext(req);

    if (!isSuperadmin && !companyId) {
      return res.status(200).json({
        success: true,
        data: [],
        requiresCompanySetup: true,
        message: "Please complete company settings first to view safety records."
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const combinedFilter = await getCombinedFilter(req.user, companyFilter);
    const filter = combinedFilter ? { ...combinedFilter } : {};
    const searchFilter = buildSearchFilter(search);
    if (searchFilter) {
      filter.$and = filter.$and || [];
      filter.$and.push(searchFilter);
    }

    const records = await RegulatorySafety.find(filter).sort({ safetyExpiryDate: 1 }).lean();
    return res.json({ success: true, data: records });
  } catch (error) {
    console.error("❌ Error listing regulatory safety records:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch safety records",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const createRegulatorySafetyRecord = async (req, res) => {
  try {
    const { companyId, isSuperadmin } = ensureCompanyContext(req);
    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first to create safety records."
      });
    }

    const payload = {
      unitNo: sanitizeString(req.body.unitNo),
      unitType: sanitizeString(req.body.unitType),
      makeModel: sanitizeString(req.body.makeModel),
      unitSource: sanitizeString(req.body.unitSource) || "unknown",
      unitReference: req.body.unitReference || null,
      safetyExpiryDate: req.body.safetyExpiryDate ? new Date(req.body.safetyExpiryDate) : null,
      safetyDecalNumber: sanitizeString(req.body.safetyDecalNumber),
      safetyPaperNumber: sanitizeString(req.body.safetyPaperNumber),
      shopName: sanitizeString(req.body.shopName),
      invoiceNo: sanitizeString(req.body.invoiceNo),
      notes: sanitizeString(req.body.notes),
      company: companyId || req.body.company,
      createdBy: req.user?._id,
      updatedBy: req.user?._id
    };

    if (!payload.unitNo || !payload.safetyExpiryDate || !payload.safetyDecalNumber || !payload.shopName) {
      return res.status(400).json({
        success: false,
        message: "unitNo, safetyExpiryDate, safetyDecalNumber and shopName are required."
      });
    }

    const record = await RegulatorySafety.create(payload);
    return res.status(201).json({ success: true, message: "Safety record created successfully", data: record });
  } catch (error) {
    console.error("❌ Error creating regulatory safety record:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create safety record",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const updateRegulatorySafetyRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId, isSuperadmin } = ensureCompanyContext(req);

    const existing = await RegulatorySafety.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Safety record not found" });
    }

    if (!isSuperadmin && companyId && existing.company && existing.company.toString() !== companyId.toString()) {
      return res.status(403).json({ success: false, message: "You cannot modify this safety record." });
    }

    const payload = {
      unitNo: sanitizeString(req.body.unitNo),
      unitType: sanitizeString(req.body.unitType),
      makeModel: sanitizeString(req.body.makeModel),
      unitSource: sanitizeString(req.body.unitSource) || existing.unitSource,
      unitReference: req.body.unitReference ?? existing.unitReference,
      safetyExpiryDate: req.body.safetyExpiryDate ? new Date(req.body.safetyExpiryDate) : existing.safetyExpiryDate,
      safetyDecalNumber: sanitizeString(req.body.safetyDecalNumber),
      safetyPaperNumber: sanitizeString(req.body.safetyPaperNumber),
      shopName: sanitizeString(req.body.shopName),
      invoiceNo: sanitizeString(req.body.invoiceNo),
      notes: sanitizeString(req.body.notes),
      updatedBy: req.user?._id
    };

    const updated = await RegulatorySafety.findByIdAndUpdate(id, payload, { new: true });
    return res.json({ success: true, message: "Safety record updated successfully", data: updated });
  } catch (error) {
    console.error("❌ Error updating regulatory safety record:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update safety record",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const deleteRegulatorySafetyRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId, isSuperadmin } = ensureCompanyContext(req);

    const existing = await RegulatorySafety.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Safety record not found" });
    }

    if (!isSuperadmin && companyId && existing.company && existing.company.toString() !== companyId.toString()) {
      return res.status(403).json({ success: false, message: "You cannot delete this safety record." });
    }

    await RegulatorySafety.findByIdAndDelete(id);
    return res.json({ success: true, message: "Safety record deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting regulatory safety record:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete safety record",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

