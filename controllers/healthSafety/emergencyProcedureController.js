import { EmergencyProcedure } from "../../models/healthSafety/emergencyProcedureModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// Helper to process file upload
const processFile = (file) => {
  if (!file) return null;
  
  let fileUrl = null;
  if (file.location) {
    fileUrl = file.location;
  } else if (file.path) {
    fileUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/${file.path.replace(/\\/g, '/')}`;
  }
  
  return fileUrl;
};

// ✅ Create Emergency Procedure
export const createEmergencyProcedure = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const { title, type, procedure, quickReferenceSteps } = req.body;

    if (!title || !type || !procedure) {
      return res.status(400).json({
        success: false,
        message: "Title, type, and procedure are required."
      });
    }

    let documentUrl = null;
    if (req.file) {
      documentUrl = processFile(req.file);
    }

    // Parse quickReferenceSteps if it's a string (from FormData)
    let parsedSteps = [];
    if (quickReferenceSteps) {
      try {
        parsedSteps = typeof quickReferenceSteps === 'string' 
          ? JSON.parse(quickReferenceSteps) 
          : quickReferenceSteps;
        // Filter out empty strings
        parsedSteps = Array.isArray(parsedSteps) ? parsedSteps.filter(step => step && step.trim()) : [];
      } catch (e) {
        // If parsing fails, treat as array or split by comma
        parsedSteps = Array.isArray(quickReferenceSteps) 
          ? quickReferenceSteps.filter(step => step && step.trim())
          : quickReferenceSteps.split(',').map(s => s.trim()).filter(s => s);
      }
    }

    const emergencyProcedure = new EmergencyProcedure({
      title: title.trim(),
      type,
      procedure: procedure.trim(),
      quickReferenceSteps: parsedSteps,
      documentUrl,
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    });

    await emergencyProcedure.save();
    await emergencyProcedure.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: "Emergency procedure created successfully",
      data: emergencyProcedure
    });
  } catch (err) {
    console.error('Create emergency procedure error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create emergency procedure"
    });
  }
};

// ✅ Get All Emergency Procedures
export const getEmergencyProcedures = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { type } = req.query;
    const query = {};

    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    if (type && type !== 'all') {
      query.type = type;
    }

    const procedures = await EmergencyProcedure.find(query)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ type: 1, title: 1 })
      .lean();

    res.json({
      success: true,
      data: procedures
    });
  } catch (err) {
    console.error('Get emergency procedures error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch emergency procedures"
    });
  }
};

// ✅ Update Emergency Procedure
export const updateEmergencyProcedure = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const procedure = await EmergencyProcedure.findOne(query);
    if (!procedure) {
      return res.status(404).json({
        success: false,
        message: "Emergency procedure not found"
      });
    }

    const updateData = { ...req.body };

    // Process file upload if new file provided
    if (req.file) {
      updateData.documentUrl = processFile(req.file);
    }

    // Parse quickReferenceSteps if provided
    if (updateData.quickReferenceSteps) {
      try {
        let parsedSteps = typeof updateData.quickReferenceSteps === 'string' 
          ? JSON.parse(updateData.quickReferenceSteps) 
          : updateData.quickReferenceSteps;
        parsedSteps = Array.isArray(parsedSteps) ? parsedSteps.filter(step => step && step.trim()) : [];
        updateData.quickReferenceSteps = parsedSteps;
      } catch (e) {
        parsedSteps = Array.isArray(updateData.quickReferenceSteps) 
          ? updateData.quickReferenceSteps.filter(step => step && step.trim())
          : updateData.quickReferenceSteps.split(',').map(s => s.trim()).filter(s => s);
        updateData.quickReferenceSteps = parsedSteps;
      }
    }

    updateData.updatedBy = req.user._id;

    Object.assign(procedure, updateData);
    await procedure.save();

    await procedure.populate('createdBy', 'name email');
    await procedure.populate('updatedBy', 'name email');

    res.json({
      success: true,
      message: "Emergency procedure updated successfully",
      data: procedure
    });
  } catch (err) {
    console.error('Update emergency procedure error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update emergency procedure"
    });
  }
};

// ✅ Delete Emergency Procedure
export const deleteEmergencyProcedure = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const procedure = await EmergencyProcedure.findOneAndDelete(query);
    if (!procedure) {
      return res.status(404).json({
        success: false,
        message: "Emergency procedure not found"
      });
    }

    res.json({
      success: true,
      message: "Emergency procedure deleted successfully"
    });
  } catch (err) {
    console.error('Delete emergency procedure error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete emergency procedure"
    });
  }
};

