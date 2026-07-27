import { FuelingSpill } from "../../models/healthSafety/fuelingSpillModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";

export const createFuelingSpill = async (req, res) => {
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

    const log = new FuelingSpill(payload);
    
    try {
      await log.save();
    } catch (saveError) {
      if (saveError.code === 11000 && saveError.keyPattern?.logNumber) {
        const year = new Date().getFullYear();
        const count = await FuelingSpill.countDocuments({
          logNumber: new RegExp(`^FP-${year}-`),
          ...(companyId ? { company: companyId } : {})
        });
        log.logNumber = `FP-${year}-${String(count + 1).padStart(4, '0')}`;
        await log.save();
      } else {
        throw saveError;
      }
    }
    
    await log.populate('createdBy', 'name email');
    if (log.performedById) {
      await log.populate('performedById', 'name email');
    }

    res.status(201).json({
      success: true,
      message: "Fueling spill log created successfully",
      data: log
    });
  } catch (err) {
    console.error('Create Fueling Spill error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create fueling spill log"
    });
  }
};

export const getFuelingSpillLogs = async (req, res) => {
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
        { performedBy: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { vehicleNumber: { $regex: search, $options: 'i' } }
      ];
    }

    if (status && status !== 'all') {
      if (status === 'spill') {
        query.spillOccurred = true;
      } else if (status === 'no-spill') {
        query.spillOccurred = false;
      }
    }

    const logs = await FuelingSpill.find(query)
      .populate('createdBy', 'name email')
      .populate('performedById', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: logs
    });
  } catch (err) {
    console.error('Get Fueling Spill Logs error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch fueling spill logs"
    });
  }
};

export const getFuelingSpillById = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const log = await FuelingSpill.findOne(query)
      .populate('createdBy', 'name email')
      .populate('performedById', 'name email')
      .lean();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Fueling spill log not found"
      });
    }

    res.json({
      success: true,
      data: log
    });
  } catch (err) {
    console.error('Get Fueling Spill by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch fueling spill log"
    });
  }
};

export const updateFuelingSpill = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const log = await FuelingSpill.findOne(query);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Fueling spill log not found"
      });
    }

    const updateData = { ...req.body };
    if (updateData.date) {
      updateData.date = new Date(updateData.date);
    }

    Object.assign(log, updateData);
    await log.save();
    
    await log.populate('createdBy', 'name email');
    if (log.performedById) {
      await log.populate('performedById', 'name email');
    }

    res.json({
      success: true,
      message: "Fueling spill log updated successfully",
      data: log
    });
  } catch (err) {
    console.error('Update Fueling Spill error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update fueling spill log"
    });
  }
};

export const deleteFuelingSpill = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const log = await FuelingSpill.findOneAndDelete(query);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Fueling spill log not found"
      });
    }

    res.json({
      success: true,
      message: "Fueling spill log deleted successfully"
    });
  } catch (err) {
    console.error('Delete Fueling Spill error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete fueling spill log"
    });
  }
};
