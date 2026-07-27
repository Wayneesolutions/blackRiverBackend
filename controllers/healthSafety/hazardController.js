import { Hazard } from "../../models/healthSafety/hazardModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Create Hazard
export const createHazard = async (req, res) => {
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
      description,
      severity,
      category,
      location,
      identifiedDate,
      controlMeasures,
      riskRating,
      status,
      assignedTo,
      dueDate,
      resolvedDate,
      inspectionId,
      notes
    } = req.body;

    if (!description || !severity || !location || !identifiedDate) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: description, severity, location, and identifiedDate are required."
      });
    }

    // Generate hazard number before validation
    const year = new Date().getFullYear();
    let hazardNumber;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const count = await Hazard.countDocuments({
        hazardNumber: new RegExp(`^HAZ-${year}-`)
      });
      hazardNumber = `HAZ-${year}-${String(count + 1).padStart(4, '0')}`;
      
      // Check if this number already exists (race condition protection)
      const exists = await Hazard.findOne({ hazardNumber });
      if (!exists) {
        break;
      }
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate unique hazard number. Please try again."
      });
    }

    const payload = {
      hazardNumber,
      description: description.trim(),
      severity,
      category: category || '',
      location: location.trim(),
      identifiedDate: new Date(identifiedDate),
      controlMeasures: controlMeasures || '',
      riskRating: riskRating || '',
      status: status || 'identified',
      assignedTo: assignedTo || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      resolvedDate: resolvedDate ? new Date(resolvedDate) : null,
      inspectionId: inspectionId || null,
      notes: notes || '',
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    };

    const hazard = new Hazard(payload);
    await hazard.save();
    
    await hazard.populate('createdBy', 'name email');
    if (hazard.assignedTo) {
      await hazard.populate('assignedTo', 'name email');
    }
    if (hazard.inspectionId) {
      await hazard.populate('inspectionId', 'inspectionNumber type');
    }

    res.status(201).json({
      success: true,
      message: "Hazard created successfully",
      data: hazard
    });
  } catch (err) {
    console.error('Create hazard error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create hazard"
    });
  }
};

// ✅ Get All Hazards
export const getHazards = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { status, severity, search } = req.query;
    const query = {};

    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (severity && severity !== 'all') {
      query.severity = severity;
    }

    if (search) {
      query.$or = [
        { hazardNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    const hazards = await Hazard.find(query)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('inspectionId', 'inspectionNumber type')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: hazards
    });
  } catch (err) {
    console.error('Get hazards error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch hazards"
    });
  }
};

// ✅ Get Hazard By ID
export const getHazardById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const hazard = await Hazard.findOne(query)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('inspectionId', 'inspectionNumber type')
      .lean();

    if (!hazard) {
      return res.status(404).json({
        success: false,
        message: "Hazard not found"
      });
    }

    res.json({
      success: true,
      data: hazard
    });
  } catch (err) {
    console.error('Get hazard by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch hazard"
    });
  }
};

// ✅ Update Hazard
export const updateHazard = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const hazard = await Hazard.findOne(query);
    if (!hazard) {
      return res.status(404).json({
        success: false,
        message: "Hazard not found"
      });
    }

    const updateData = {};
    
    if (req.body.description) updateData.description = req.body.description.trim();
    if (req.body.severity) updateData.severity = req.body.severity;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.location) updateData.location = req.body.location.trim();
    if (req.body.identifiedDate) updateData.identifiedDate = new Date(req.body.identifiedDate);
    if (req.body.controlMeasures !== undefined) updateData.controlMeasures = req.body.controlMeasures;
    if (req.body.riskRating !== undefined) updateData.riskRating = req.body.riskRating;
    if (req.body.status) updateData.status = req.body.status;
    if (req.body.assignedTo !== undefined) updateData.assignedTo = req.body.assignedTo || null;
    if (req.body.dueDate) updateData.dueDate = new Date(req.body.dueDate);
    if (req.body.resolvedDate) updateData.resolvedDate = new Date(req.body.resolvedDate);
    if (req.body.inspectionId !== undefined) updateData.inspectionId = req.body.inspectionId || null;
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;

    Object.assign(hazard, updateData);
    await hazard.save();

    await hazard.populate('createdBy', 'name email');
    if (hazard.assignedTo) {
      await hazard.populate('assignedTo', 'name email');
    }
    if (hazard.inspectionId) {
      await hazard.populate('inspectionId', 'inspectionNumber type');
    }

    res.json({
      success: true,
      message: "Hazard updated successfully",
      data: hazard
    });
  } catch (err) {
    console.error('Update hazard error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update hazard"
    });
  }
};

// ✅ Delete Hazard
export const deleteHazard = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const hazard = await Hazard.findOneAndDelete(query);
    if (!hazard) {
      return res.status(404).json({
        success: false,
        message: "Hazard not found"
      });
    }

    res.json({
      success: true,
      message: "Hazard deleted successfully"
    });
  } catch (err) {
    console.error('Delete hazard error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete hazard"
    });
  }
};

