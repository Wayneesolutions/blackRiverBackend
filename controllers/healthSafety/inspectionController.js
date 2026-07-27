import { Inspection } from "../../models/healthSafety/inspectionModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Create Inspection
export const createInspection = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const {
      date,
      type,
      inspector,
      location,
      status,
      findings,
      hazards,
      notes,
      scheduledDate,
      completedDate
    } = req.body;

    if (!date || !type || !inspector || !location) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: date, type, inspector, and location are required."
      });
    }

    // Generate inspection number before validation
    const year = new Date().getFullYear();
    let inspectionNumber;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const count = await Inspection.countDocuments({
        inspectionNumber: new RegExp(`^INS-${year}-`)
      });
      inspectionNumber = `INS-${year}-${String(count + 1).padStart(4, '0')}`;
      
      // Check if this number already exists (race condition protection)
      const exists = await Inspection.findOne({ inspectionNumber });
      if (!exists) {
        break;
      }
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate unique inspection number. Please try again."
      });
    }

    const payload = {
      inspectionNumber,
      date: new Date(date),
      type,
      inspector: inspector.trim(),
      location: location.trim(),
      status: status || 'scheduled',
      findings: findings || [],
      hazards: hazards || [],
      notes: notes || '',
      scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(date),
      completedDate: completedDate ? new Date(completedDate) : null,
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    };

    const inspection = new Inspection(payload);
    await inspection.save();
    
    await inspection.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: "Inspection created successfully",
      data: inspection
    });
  } catch (err) {
    console.error('Create inspection error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create inspection"
    });
  }
};

// ✅ Get All Inspections
export const getInspections = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { status, type, search } = req.query;
    const query = {};

    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (type && type !== 'all') {
      query.type = { $regex: type, $options: 'i' };
    }

    if (search) {
      query.$or = [
        { inspectionNumber: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } },
        { inspector: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } }
      ];
    }

    const inspections = await Inspection.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Add counts to each inspection for frontend display
    const inspectionsWithCounts = inspections.map(inspection => ({
      ...inspection,
      findings: Array.isArray(inspection.findings) ? inspection.findings.length : 0,
      hazards: Array.isArray(inspection.hazards) ? inspection.hazards.length : 0
    }));

    res.json({
      success: true,
      data: inspectionsWithCounts
    });
  } catch (err) {
    console.error('Get inspections error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch inspections"
    });
  }
};

// ✅ Get Inspection By ID
export const getInspectionById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const inspection = await Inspection.findOne(query)
      .populate('createdBy', 'name email')
      .lean();

    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: "Inspection not found"
      });
    }

    // Add counts for frontend display
    inspection.findings = Array.isArray(inspection.findings) ? inspection.findings.length : 0;
    inspection.hazards = Array.isArray(inspection.hazards) ? inspection.hazards.length : 0;

    res.json({
      success: true,
      data: inspection
    });
  } catch (err) {
    console.error('Get inspection by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch inspection"
    });
  }
};

// ✅ Update Inspection
export const updateInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const inspection = await Inspection.findOne(query);
    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: "Inspection not found"
      });
    }

    const updateData = {};
    
    if (req.body.date) updateData.date = new Date(req.body.date);
    if (req.body.type) updateData.type = req.body.type;
    if (req.body.inspector) updateData.inspector = req.body.inspector.trim();
    if (req.body.location) updateData.location = req.body.location.trim();
    if (req.body.status) updateData.status = req.body.status;
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;
    if (req.body.scheduledDate) updateData.scheduledDate = new Date(req.body.scheduledDate);
    if (req.body.completedDate) updateData.completedDate = new Date(req.body.completedDate);
    // Only update findings/hazards if explicitly provided (arrays)
    if (req.body.findings && Array.isArray(req.body.findings)) updateData.findings = req.body.findings;
    if (req.body.hazards && Array.isArray(req.body.hazards)) updateData.hazards = req.body.hazards;

    Object.assign(inspection, updateData);
    await inspection.save();

    await inspection.populate('createdBy', 'name email');

    res.json({
      success: true,
      message: "Inspection updated successfully",
      data: inspection
    });
  } catch (err) {
    console.error('Update inspection error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update inspection"
    });
  }
};

// ✅ Delete Inspection
export const deleteInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const inspection = await Inspection.findOneAndDelete(query);
    if (!inspection) {
      return res.status(404).json({
        success: false,
        message: "Inspection not found"
      });
    }

    res.json({
      success: true,
      message: "Inspection deleted successfully"
    });
  } catch (err) {
    console.error('Delete inspection error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete inspection"
    });
  }
};

