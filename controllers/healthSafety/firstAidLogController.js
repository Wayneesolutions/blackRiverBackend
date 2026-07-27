import { FirstAidLog } from "../../models/healthSafety/firstAidLogModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Create First Aid Log
export const createFirstAidLog = async (req, res) => {
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
      time,
      location,
      injuredPerson,
      injuryDescription,
      firstAidProvided,
      treatedBy,
      followUpRequired,
      followUpNotes
    } = req.body;

    if (!date || !time || !location || !injuredPerson || !injuryDescription || !firstAidProvided || !treatedBy) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided."
      });
    }

    const log = new FirstAidLog({
      date: new Date(date),
      time: time.trim(),
      location: location.trim(),
      injuredPerson: injuredPerson.trim(),
      injuryDescription: injuryDescription.trim(),
      firstAidProvided: firstAidProvided.trim(),
      treatedBy: treatedBy.trim(),
      followUpRequired: followUpRequired === true || followUpRequired === 'true',
      followUpNotes: followUpNotes?.trim() || '',
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    });

    await log.save();
    await log.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: "First aid log created successfully",
      data: log
    });
  } catch (err) {
    console.error('Create first aid log error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create first aid log"
    });
  }
};

// ✅ Get All First Aid Logs
export const getFirstAidLogs = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { search, startDate, endDate } = req.query;
    const query = {};

    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { location: { $regex: search, $options: 'i' } },
        { injuredPerson: { $regex: search, $options: 'i' } },
        { treatedBy: { $regex: search, $options: 'i' } },
        { injuryDescription: { $regex: search, $options: 'i' } }
      ];
    }

    const logs = await FirstAidLog.find(query)
      .populate('createdBy', 'name email')
      .sort({ date: -1, time: -1 })
      .lean();

    res.json({
      success: true,
      data: logs
    });
  } catch (err) {
    console.error('Get first aid logs error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch first aid logs"
    });
  }
};

// ✅ Get First Aid Log By ID
export const getFirstAidLogById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const log = await FirstAidLog.findOne(query)
      .populate('createdBy', 'name email')
      .lean();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "First aid log not found"
      });
    }

    res.json({
      success: true,
      data: log
    });
  } catch (err) {
    console.error('Get first aid log by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch first aid log"
    });
  }
};

// ✅ Update First Aid Log
export const updateFirstAidLog = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const log = await FirstAidLog.findOne(query);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "First aid log not found"
      });
    }

    const updateData = { ...req.body };
    if (updateData.date) {
      updateData.date = new Date(updateData.date);
    }

    Object.assign(log, updateData);
    await log.save();
    await log.populate('createdBy', 'name email');

    res.json({
      success: true,
      message: "First aid log updated successfully",
      data: log
    });
  } catch (err) {
    console.error('Update first aid log error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update first aid log"
    });
  }
};

// ✅ Delete First Aid Log
export const deleteFirstAidLog = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const log = await FirstAidLog.findOneAndDelete(query);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "First aid log not found"
      });
    }

    res.json({
      success: true,
      message: "First aid log deleted successfully"
    });
  } catch (err) {
    console.error('Delete first aid log error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete first aid log"
    });
  }
};

