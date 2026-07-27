import { LoadSecurement } from "../../models/healthSafety/loadSecurementModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";

export const createLoadSecurement = async (req, res) => {
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

    const log = new LoadSecurement(payload);

    const generateNextLogNumber = async () => {
      const year = new Date().getFullYear();
      const lastLog = await LoadSecurement.findOne(
        { logNumber: new RegExp(`^LS-${year}-`) },
        {},
        { sort: { logNumber: -1 } }
      ).select('logNumber').lean();
      let nextNum = 1;
      if (lastLog?.logNumber) {
        const match = lastLog.logNumber.match(new RegExp(`^LS-${year}-(\\d+)$`));
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      return `LS-${year}-${String(nextNum).padStart(4, '0')}`;
    };

    let saved = false;
    for (let attempt = 0; attempt < 5 && !saved; attempt++) {
      try {
        if (attempt > 0) {
          log.logNumber = await generateNextLogNumber();
        }
        await log.save();
        saved = true;
      } catch (saveError) {
        const isDupKey = saveError.code === 11000 && (saveError.keyPattern?.logNumber !== undefined);
        if (isDupKey && attempt < 4) {
          log.logNumber = await generateNextLogNumber();
        } else {
          throw saveError;
        }
      }
    }
    
    await log.populate('createdBy', 'name email');
    await log.populate('driverId', 'name email');

    res.status(201).json({
      success: true,
      message: "Load securement log created successfully",
      data: log
    });
  } catch (err) {
    console.error('Create Load Securement error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create load securement log"
    });
  }
};

export const getLoadSecurementLogs = async (req, res) => {
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
        { loadType: { $regex: search, $options: 'i' } }
      ];
    }

    if (status && status !== 'all') {
      if (status === 'compliant') {
        query.meetsStandards = true;
      } else if (status === 'deficiency') {
        query.meetsStandards = false;
      }
    }

    const logs = await LoadSecurement.find(query)
      .populate('createdBy', 'name email')
      .populate('driverId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: logs
    });
  } catch (err) {
    console.error('Get Load Securement Logs error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch load securement logs"
    });
  }
};

export const getLoadSecurementById = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const log = await LoadSecurement.findOne(query)
      .populate('createdBy', 'name email')
      .populate('driverId', 'name email')
      .lean();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Load securement log not found"
      });
    }

    res.json({
      success: true,
      data: log
    });
  } catch (err) {
    console.error('Get Load Securement by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch load securement log"
    });
  }
};

export const updateLoadSecurement = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const log = await LoadSecurement.findOne(query);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Load securement log not found"
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
      message: "Load securement log updated successfully",
      data: log
    });
  } catch (err) {
    console.error('Update Load Securement error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update load securement log"
    });
  }
};

export const deleteLoadSecurement = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const log = await LoadSecurement.findOneAndDelete(query);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Load securement log not found"
      });
    }

    res.json({
      success: true,
      message: "Load securement log deleted successfully"
    });
  } catch (err) {
    console.error('Delete Load Securement error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete load securement log"
    });
  }
};

