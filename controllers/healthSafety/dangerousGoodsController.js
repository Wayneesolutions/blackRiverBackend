import { DangerousGoods } from "../../models/healthSafety/dangerousGoodsModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";

export const createDangerousGoods = async (req, res) => {
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

    // Handle shipping document file upload
    const files = req.files || {};
    const shippingDocFile = Array.isArray(files.shippingDocument) ? files.shippingDocument[0] : files.shippingDocument;
    if (shippingDocFile) {
      const fileUrl = shippingDocFile.location || (shippingDocFile.path ? `/${shippingDocFile.path.replace(/\\/g, '/')}` : null);
      if (fileUrl) payload.shippingDocument = fileUrl;
    }

    const log = new DangerousGoods(payload);

    const generateNextLogNumber = async () => {
      const year = new Date().getFullYear();
      const lastLog = await DangerousGoods.findOne(
        { logNumber: new RegExp(`^TDG-${year}-`) },
        {},
        { sort: { logNumber: -1 } }
      ).select('logNumber').lean();
      let nextNum = 1;
      if (lastLog?.logNumber) {
        const match = lastLog.logNumber.match(new RegExp(`^TDG-${year}-(\\d+)$`));
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      return `TDG-${year}-${String(nextNum).padStart(4, '0')}`;
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
      message: "Dangerous goods log created successfully",
      data: log
    });
  } catch (err) {
    console.error('Create Dangerous Goods error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create dangerous goods log"
    });
  }
};

export const getDangerousGoodsLogs = async (req, res) => {
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
        { unNumber: { $regex: search, $options: 'i' } },
        { properShippingName: { $regex: search, $options: 'i' } }
      ];
    }

    if (status && status !== 'all') {
      if (status === 'compliant') {
        query.placardingComplete = true;
        query.tdgCertificateCurrent = true;
        query.incidentOccurred = false;
      } else if (status === 'incident') {
        query.incidentOccurred = true;
      } else if (status === 'review') {
        query.$or = [
          { tdgCertificateCurrent: false },
          { placardingComplete: false }
        ];
      }
    }

    const logs = await DangerousGoods.find(query)
      .populate('createdBy', 'name email')
      .populate('driverId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: logs
    });
  } catch (err) {
    console.error('Get Dangerous Goods Logs error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch dangerous goods logs"
    });
  }
};

export const getDangerousGoodsById = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const log = await DangerousGoods.findOne(query)
      .populate('createdBy', 'name email')
      .populate('driverId', 'name email')
      .lean();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Dangerous goods log not found"
      });
    }

    res.json({
      success: true,
      data: log
    });
  } catch (err) {
    console.error('Get Dangerous Goods by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch dangerous goods log"
    });
  }
};

export const updateDangerousGoods = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const log = await DangerousGoods.findOne(query);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Dangerous goods log not found"
      });
    }

    const updateData = { ...req.body };
    if (updateData.date) {
      updateData.date = new Date(updateData.date);
    }

    const files = req.files || {};
    const shippingDocFile = Array.isArray(files.shippingDocument) ? files.shippingDocument[0] : files.shippingDocument;
    if (shippingDocFile) {
      const fileUrl = shippingDocFile.location || (shippingDocFile.path ? `/${shippingDocFile.path.replace(/\\/g, '/')}` : null);
      if (fileUrl) updateData.shippingDocument = fileUrl;
    }

    Object.assign(log, updateData);
    await log.save();
    
    await log.populate('createdBy', 'name email');
    await log.populate('driverId', 'name email');

    res.json({
      success: true,
      message: "Dangerous goods log updated successfully",
      data: log
    });
  } catch (err) {
    console.error('Update Dangerous Goods error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update dangerous goods log"
    });
  }
};

export const deleteDangerousGoods = async (req, res) => {
  try {
    const { id } = req.params;
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};
    
    const query = { _id: id, ...baseFilter };

    const log = await DangerousGoods.findOneAndDelete(query);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Dangerous goods log not found"
      });
    }

    res.json({
      success: true,
      message: "Dangerous goods log deleted successfully"
    });
  } catch (err) {
    console.error('Delete Dangerous Goods error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete dangerous goods log"
    });
  }
};
