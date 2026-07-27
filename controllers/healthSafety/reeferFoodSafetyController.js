import { ReeferFoodSafety } from "../../models/healthSafety/reeferFoodSafetyModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";

export const createReeferFoodSafety = async (req, res) => {
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
      createdBy: req.user._id,
      // driverId is optional - can be set later or left as null if only driverName is provided
      driverId: req.body.driverId || null
    };

    const log = new ReeferFoodSafety(payload);
    
    try {
      await log.save();
    } catch (saveError) {
      if (saveError.code === 11000 && saveError.keyPattern?.logNumber) {
        const year = new Date().getFullYear();
        const count = await ReeferFoodSafety.countDocuments({
          logNumber: new RegExp(`^RF-${year}-`),
          ...(companyId ? { company: companyId } : {})
        });
        log.logNumber = `RF-${year}-${String(count + 1).padStart(4, '0')}`;
        await log.save();
      } else {
        throw saveError;
      }
    }
    
    await log.populate('createdBy', 'name email');
    await log.populate('driverId', 'name email');

    res.status(201).json({
      success: true,
      message: "Reefer food safety log created successfully",
      data: log
    });
  } catch (err) {
    console.error('Create Reefer Food Safety error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create reefer food safety log"
    });
  }
};

export const getReeferFoodSafetyLogs = async (req, res) => {
  try {
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    
    const { search, status } = req.query;
    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { ...baseFilter };

    if (search) {
      query.$or = [
        { logNumber: { $regex: search, $options: 'i' } },
        { driverName: { $regex: search, $options: 'i' } },
        { vehicleNumber: { $regex: search, $options: 'i' } },
        { trailerNumber: { $regex: search, $options: 'i' } }
      ];
    }

    if (status && status !== 'all') {
      if (status === 'compliant') {
        query.withinRange = true;
        query.deficienciesFound = false;
      } else if (status === 'deficiency') {
        query.deficienciesFound = true;
      }
    }

    const logs = await ReeferFoodSafety.find(query)
      .populate('createdBy', 'name email')
      .populate('driverId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: logs
    });
  } catch (err) {
    console.error('Get Reefer Food Safety Logs error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch reefer food safety logs"
    });
  }
};

export const getReeferFoodSafetyById = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const log = await ReeferFoodSafety.findOne(query)
      .populate('createdBy', 'name email')
      .populate('driverId', 'name email')
      .lean();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Reefer food safety log not found"
      });
    }

    res.json({
      success: true,
      data: log
    });
  } catch (err) {
    console.error('Get Reefer Food Safety by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch reefer food safety log"
    });
  }
};

export const updateReeferFoodSafety = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const log = await ReeferFoodSafety.findOne(query);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Reefer food safety log not found"
      });
    }

    const updateData = { ...req.body };
    if (updateData.date) {
      updateData.date = new Date(updateData.date);
    }

    Object.assign(log, updateData);
    await log.save();
    
    await log.populate('createdBy', 'name email');
    await log.populate('driverId', 'name email');

    res.json({
      success: true,
      message: "Reefer food safety log updated successfully",
      data: log
    });
  } catch (err) {
    console.error('Update Reefer Food Safety error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update reefer food safety log"
    });
  }
};

export const deleteReeferFoodSafety = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const log = await ReeferFoodSafety.findOneAndDelete(query);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Reefer food safety log not found"
      });
    }

    res.json({
      success: true,
      message: "Reefer food safety log deleted successfully"
    });
  } catch (err) {
    console.error('Delete Reefer Food Safety error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete reefer food safety log"
    });
  }
};

