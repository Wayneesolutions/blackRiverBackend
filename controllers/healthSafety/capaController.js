import { CAPA } from "../../models/healthSafety/capaModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Create CAPA
export const createCAPA = async (req, res) => {
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
      title,
      type,
      source,
      issueDate,
      dueDate,
      status,
      assignedTo,
      priority,
      description,
      rootCause,
      correctiveAction,
      preventiveAction
    } = req.body;

    if (!title || !type || !source || !issueDate || !dueDate || !assignedTo) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: title, type, source, issueDate, dueDate, and assignedTo are required."
      });
    }

    const capa = new CAPA({
      title: title.trim(),
      type,
      source: source.trim(),
      issueDate: new Date(issueDate),
      dueDate: new Date(dueDate),
      status: status || 'open',
      assignedTo,
      priority: priority || 'medium',
      description: description || '',
      rootCause: rootCause || '',
      correctiveAction: correctiveAction || '',
      preventiveAction: preventiveAction || '',
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    });

    try {
      await capa.save();
    } catch (saveError) {
      // Handle duplicate key error (race condition in capaNumber generation)
      if (saveError.code === 11000 && saveError.keyPattern?.capaNumber) {
        // Retry with a new capaNumber
        const year = new Date().getFullYear();
        const count = await CAPA.countDocuments({
          capaNumber: new RegExp(`^CAPA-${year}-`),
          ...(companyId ? { company: companyId } : {})
        });
        capa.capaNumber = `CAPA-${year}-${String(count + 1).padStart(4, '0')}`;
        await capa.save();
      } else {
        throw saveError;
      }
    }
    
    await capa.populate('createdBy', 'name email');
    await capa.populate('assignedTo', 'name email');

    res.status(201).json({
      success: true,
      message: "CAPA created successfully",
      data: capa
    });
  } catch (err) {
    console.error('Create CAPA error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create CAPA"
    });
  }
};

// ✅ Get All CAPAs
export const getCAPAs = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { status, type, priority, search } = req.query;
    const query = {};

    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (type && type !== 'all') {
      query.type = type;
    }

    if (priority && priority !== 'all') {
      query.priority = priority;
    }

    if (search) {
      query.$or = [
        { capaNumber: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { source: { $regex: search, $options: 'i' } }
      ];
    }

    const capas = await CAPA.find(query)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('verifiedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Update overdue status for all CAPAs
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const updatedCapas = capas.map(capa => {
      if (capa.status !== 'completed' && capa.dueDate) {
        const dueDate = new Date(capa.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        
        if (dueDate < today) {
          capa.status = 'overdue';
        }
      }
      
      // Format assignedTo name for display
      if (capa.assignedTo && typeof capa.assignedTo === 'object') {
        capa.assignedTo = capa.assignedTo.name || capa.assignedTo.email || 'Unknown';
      }
      
      return capa;
    });

    res.json({
      success: true,
      data: updatedCapas
    });
  } catch (err) {
    console.error('Get CAPAs error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch CAPAs"
    });
  }
};

// ✅ Get CAPA By ID
export const getCAPAById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const capa = await CAPA.findOne(query)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('verifiedBy', 'name email')
      .lean();

    if (!capa) {
      return res.status(404).json({
        success: false,
        message: "CAPA not found"
      });
    }

    res.json({
      success: true,
      data: capa
    });
  } catch (err) {
    console.error('Get CAPA by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch CAPA"
    });
  }
};

// ✅ Update CAPA
export const updateCAPA = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const capa = await CAPA.findOne(query);
    if (!capa) {
      return res.status(404).json({
        success: false,
        message: "CAPA not found"
      });
    }

    const updateData = {};
    if (req.body.title) updateData.title = req.body.title.trim();
    if (req.body.type) updateData.type = req.body.type;
    if (req.body.source) updateData.source = req.body.source.trim();
    if (req.body.issueDate) updateData.issueDate = new Date(req.body.issueDate);
    if (req.body.dueDate) updateData.dueDate = new Date(req.body.dueDate);
    if (req.body.status) updateData.status = req.body.status;
    if (req.body.assignedTo) updateData.assignedTo = req.body.assignedTo;
    if (req.body.priority) updateData.priority = req.body.priority;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.rootCause !== undefined) updateData.rootCause = req.body.rootCause;
    if (req.body.correctiveAction !== undefined) updateData.correctiveAction = req.body.correctiveAction;
    if (req.body.preventiveAction !== undefined) updateData.preventiveAction = req.body.preventiveAction;
    if (req.body.completionDate) updateData.completionDate = new Date(req.body.completionDate);
    if (req.body.verifiedBy) updateData.verifiedBy = req.body.verifiedBy;
    if (req.body.verifiedDate) updateData.verifiedDate = new Date(req.body.verifiedDate);
    if (req.body.effectivenessReview !== undefined) updateData.effectivenessReview = req.body.effectivenessReview;

    // Auto-update overdue status
    if (updateData.dueDate || req.body.dueDate) {
      const dueDate = updateData.dueDate ? new Date(updateData.dueDate) : new Date(req.body.dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);
      
      if (dueDate < today && (!updateData.status || updateData.status !== 'completed')) {
        updateData.status = 'overdue';
      }
    }

    Object.assign(capa, updateData);
    await capa.save();
    
    await capa.populate('createdBy', 'name email');
    await capa.populate('assignedTo', 'name email');
    if (capa.verifiedBy) {
      await capa.populate('verifiedBy', 'name email');
    }

    res.json({
      success: true,
      message: "CAPA updated successfully",
      data: capa
    });
  } catch (err) {
    console.error('Update CAPA error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update CAPA"
    });
  }
};

// ✅ Delete CAPA
export const deleteCAPA = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const capa = await CAPA.findOneAndDelete(query);
    if (!capa) {
      return res.status(404).json({
        success: false,
        message: "CAPA not found"
      });
    }

    res.json({
      success: true,
      message: "CAPA deleted successfully"
    });
  } catch (err) {
    console.error('Delete CAPA error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete CAPA"
    });
  }
};

