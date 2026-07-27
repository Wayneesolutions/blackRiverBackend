import { WinterSafety } from "../../models/healthSafety/winterSafetyModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";

export const createWinterSafety = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const payload = {
      ...req.body,
      date: req.body.date ? new Date(req.body.date) : new Date(),
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    };

    const checklist = new WinterSafety(payload);
    
    try {
      await checklist.save();
    } catch (saveError) {
      if (saveError.code === 11000 && saveError.keyPattern?.checklistNumber) {
        const year = new Date().getFullYear();
        const count = await WinterSafety.countDocuments({
          checklistNumber: new RegExp(`^WS-${year}-`),
          ...(companyId ? { company: companyId } : {})
        });
        checklist.checklistNumber = `WS-${year}-${String(count + 1).padStart(4, '0')}`;
        await checklist.save();
      } else {
        throw saveError;
      }
    }
    
    await checklist.populate('createdBy', 'name email');
    if (checklist.performedById) {
      await checklist.populate('performedById', 'name email');
    }

    res.status(201).json({
      success: true,
      message: "Winter safety checklist created successfully",
      data: checklist
    });
  } catch (err) {
    console.error('Create Winter Safety error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create winter safety checklist"
    });
  }
};

export const getWinterSafetyChecklists = async (req, res) => {
  try {
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { search, status } = req.query;
    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { ...baseFilter };

    if (search) {
      query.$or = [
        { checklistNumber: { $regex: search, $options: 'i' } },
        { performedBy: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { vehicleNumber: { $regex: search, $options: 'i' } }
      ];
    }

    if (status && status !== 'all') {
      if (status === 'hazards') {
        query.hazardsIdentified = true;
      } else if (status === 'clear') {
        query.hazardsIdentified = false;
      }
    }

    const checklists = await WinterSafety.find(query)
      .populate('createdBy', 'name email')
      .populate('performedById', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: checklists
    });
  } catch (err) {
    console.error('Get Winter Safety Checklists error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch winter safety checklists"
    });
  }
};

export const getWinterSafetyById = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const checklist = await WinterSafety.findOne(query)
      .populate('createdBy', 'name email')
      .populate('performedById', 'name email')
      .lean();

    if (!checklist) {
      return res.status(404).json({
        success: false,
        message: "Winter safety checklist not found"
      });
    }

    res.json({
      success: true,
      data: checklist
    });
  } catch (err) {
    console.error('Get Winter Safety by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch winter safety checklist"
    });
  }
};

export const updateWinterSafety = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const checklist = await WinterSafety.findOne(query);
    if (!checklist) {
      return res.status(404).json({
        success: false,
        message: "Winter safety checklist not found"
      });
    }

    const updateData = { ...req.body };
    if (updateData.date) {
      updateData.date = new Date(updateData.date);
    }

    Object.assign(checklist, updateData);
    await checklist.save();
    
    await checklist.populate('createdBy', 'name email');
    if (checklist.performedById) {
      await checklist.populate('performedById', 'name email');
    }

    res.json({
      success: true,
      message: "Winter safety checklist updated successfully",
      data: checklist
    });
  } catch (err) {
    console.error('Update Winter Safety error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update winter safety checklist"
    });
  }
};

export const deleteWinterSafety = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const checklist = await WinterSafety.findOneAndDelete(query);
    if (!checklist) {
      return res.status(404).json({
        success: false,
        message: "Winter safety checklist not found"
      });
    }

    res.json({
      success: true,
      message: "Winter safety checklist deleted successfully"
    });
  } catch (err) {
    console.error('Delete Winter Safety error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete winter safety checklist"
    });
  }
};
