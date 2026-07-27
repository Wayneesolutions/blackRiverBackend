import { DriverViolation } from "../models/driverViolationModel.js";
import { User } from "../models/driver/userModel.js";
import { FleetUnit } from "../models/fleet/fleetUnitModel.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { geotabService } from "../services/geotabService.js";
import mongoose from "mongoose";

/**
 * Get all driver violations with filters
 */
export const getDriverViolations = async (req, res) => {
  try {
    const {
      driver,
      vehicle,
      violationType,
      severity,
      status,
      source,
      fromDate,
      toDate,
      search,
      page = 1,
      limit = 50
    } = req.query;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned",
        data: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 0 }
      });
    }

    const query = {};
    
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    // Filters
    if (driver) query.driver = driver;
    if (vehicle) query.vehicle = vehicle;
    if (violationType) query.violationType = violationType;
    if (severity) query.severity = severity;
    if (status) query.status = status;
    if (source) query.source = source;

    // Date range
    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) query.date.$gte = new Date(fromDate);
      if (toDate) query.date.$lte = new Date(toDate);
    }

    // Search
    if (search) {
      query.$or = [
        { violationId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'ticketInfo.ticketNumber': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const violations = await DriverViolation.find(query)
      .populate('driver', 'name email internalId')
      .populate('vehicle', 'unitNo licensePlate makeModel internalId')
      .populate('reviewedBy', 'name email')
      .populate('resolvedBy', 'name email')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await DriverViolation.countDocuments(query);

    res.json({
      success: true,
      message: "Driver violations fetched successfully",
      data: violations,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("Error fetching driver violations:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get violation statistics
 */
export const getViolationStats = async (req, res) => {
  try {
    const { fromDate, toDate, groupBy = 'type' } = req.query;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        data: {
          total: 0,
          byType: {},
          bySeverity: {},
          byStatus: {},
          bySource: {}
        }
      });
    }

    const query = {};
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    // Date range (default: last 30 days)
    const toDateValue = toDate ? new Date(toDate) : new Date();
    const fromDateValue = fromDate ? new Date(fromDate) : new Date(toDateValue.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    query.date = { $gte: fromDateValue, $lte: toDateValue };

    // Total count
    const total = await DriverViolation.countDocuments(query);

    // By type
    const byType = await DriverViolation.aggregate([
      { $match: query },
      { $group: { _id: '$violationType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // By severity
    const bySeverity = await DriverViolation.aggregate([
      { $match: query },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // By status
    const byStatus = await DriverViolation.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // By source
    const bySource = await DriverViolation.aggregate([
      { $match: query },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Top violators (drivers with most violations)
    const topViolators = await DriverViolation.aggregate([
      { $match: query },
      { $match: { driver: { $exists: true, $ne: null } } },
      { $group: { _id: '$driver', count: { $sum: 1 }, totalPoints: { $sum: '$points' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'driverInfo'
        }
      },
      { $unwind: '$driverInfo' },
      {
        $project: {
          driver: {
            _id: '$driverInfo._id',
            name: '$driverInfo.name',
            email: '$driverInfo.email',
            internalId: '$driverInfo.internalId'
          },
          count: 1,
          totalPoints: 1
        }
      }
    ]);

    // Monthly trend (last 12 months)
    const monthlyTrend = await DriverViolation.aggregate([
      { $match: { ...query, date: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)) } } },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      success: true,
      message: "Violation statistics fetched successfully",
      data: {
        total,
        byType: Object.fromEntries(byType.map(item => [item._id, item.count])),
        bySeverity: Object.fromEntries(bySeverity.map(item => [item._id, item.count])),
        byStatus: Object.fromEntries(byStatus.map(item => [item._id, item.count])),
        bySource: Object.fromEntries(bySource.map(item => [item._id, item.count])),
        topViolators,
        monthlyTrend: monthlyTrend.map(item => ({
          year: item._id.year,
          month: item._id.month,
          count: item.count
        })),
        dateRange: {
          from: fromDateValue.toISOString(),
          to: toDateValue.toISOString()
        }
      }
    });
  } catch (error) {
    console.error("Error fetching violation stats:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get violation by ID
 */
export const getViolationById = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const violation = await DriverViolation.findOne(query)
      .populate('driver', 'name email phone internalId')
      .populate('vehicle', 'unitNo licensePlate makeModel internalId')
      .populate('reviewedBy', 'name email')
      .populate('resolvedBy', 'name email')
      .lean();

    if (!violation) {
      return res.status(404).json({ success: false, message: "Violation not found" });
    }

    res.json({
      success: true,
      message: "Violation fetched successfully",
      data: violation
    });
  } catch (error) {
    console.error("Error fetching violation:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create violation (manual entry)
 */
export const createViolation = async (req, res) => {
  try {
    const {
      driver,
      vehicle,
      violationType,
      title,
      description,
      dateOfIncident,
      date,
      reportedBy,
      severity,
      actionTaken,
      status,
      company
    } = req.body;

    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(400).json({
        success: false,
        message: "Company required to create violation"
      });
    }

    // Validate required fields
    if (!violationType || !dateOfIncident) {
      return res.status(400).json({
        success: false,
        message: "Violation Type and Date of Incident are required"
      });
    }

    // Handle file upload
    let fileMetadata = {};
    if (req.file) {
      const fileUrl = req.file.location || 
        (req.file.path ? `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, '/')}` : null);
      
      fileMetadata = {
        fileUrl: fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      };
    }

    // Use dateOfIncident if provided, otherwise use date
    const incidentDate = dateOfIncident ? new Date(dateOfIncident) : (date ? new Date(date) : new Date());

    const violationData = {
      driver,
      vehicle,
      violationType,
      title: title || '',
      description: description || '',
      date: incidentDate,
      dateOfIncident: incidentDate,
      reportedBy: reportedBy || '',
      severity: severity || 'Low',
      actionTaken: actionTaken || '',
      status: status || 'Open',
      company: companyId || company,
      source: 'manual',
      ...fileMetadata
    };

    const violation = new DriverViolation(violationData);
    await violation.save();

    const populatedViolation = await DriverViolation.findById(violation._id)
      .populate('driver', 'name email internalId')
      .populate('vehicle', 'unitNo licensePlate makeModel internalId');

    res.status(201).json({
      success: true,
      message: "Violation created successfully",
      data: populatedViolation
    });
  } catch (error) {
    console.error("Error creating violation:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update violation
 */
export const updateViolation = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      violationType,
      title,
      description,
      dateOfIncident,
      date,
      reportedBy,
      severity,
      actionTaken,
      status
    } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    // Build update data
    const updateData = {};
    if (violationType) updateData.violationType = violationType;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (reportedBy !== undefined) updateData.reportedBy = reportedBy;
    if (severity) updateData.severity = severity;
    if (actionTaken !== undefined) updateData.actionTaken = actionTaken;
    if (status) updateData.status = status;

    // Handle date
    if (dateOfIncident || date) {
      const incidentDate = dateOfIncident ? new Date(dateOfIncident) : (date ? new Date(date) : null);
      if (incidentDate) {
        updateData.date = incidentDate;
        updateData.dateOfIncident = incidentDate;
      }
    }

    // Handle file upload
    if (req.file) {
      const fileUrl = req.file.location || 
        (req.file.path ? `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, '/')}` : null);
      
      updateData.fileUrl = fileUrl;
      updateData.fileName = req.file.originalname;
      updateData.fileSize = req.file.size;
      updateData.mimeType = req.file.mimetype;
    }

    const violation = await DriverViolation.findOneAndUpdate(
      query,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('driver', 'name email internalId')
      .populate('vehicle', 'unitNo licensePlate makeModel internalId');

    if (!violation) {
      return res.status(404).json({ success: false, message: "Violation not found" });
    }

    res.json({
      success: true,
      message: "Violation updated successfully",
      data: violation
    });
  } catch (error) {
    console.error("Error updating violation:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete violation
 */
export const deleteViolation = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const violation = await DriverViolation.findOneAndDelete(query);

    if (!violation) {
      return res.status(404).json({ success: false, message: "Violation not found" });
    }

    res.json({
      success: true,
      message: "Violation deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting violation:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Sync violations from Geotab
 */
export const syncGeotabViolations = async (req, res) => {
  try {
    const { daysBack = 7 } = req.body;

    const companyId = getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "Company required to sync violations"
      });
    }

    const result = await geotabService.syncViolationsForCompany(companyId, daysBack);

    res.json(result);
  } catch (error) {
    console.error("Error syncing Geotab violations:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get driver's violation summary
 */
export const getDriverViolationSummary = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { months = 12 } = req.query;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { driver: driverId };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    // Date range
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - parseInt(months));
    query.date = { $gte: fromDate, $lte: toDate };

    const totalViolations = await DriverViolation.countDocuments(query);
    const totalPoints = await DriverViolation.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$points' } } }
    ]);

    const byType = await DriverViolation.aggregate([
      { $match: query },
      { $group: { _id: '$violationType', count: { $sum: 1 } } }
    ]);

    const bySeverity = await DriverViolation.aggregate([
      { $match: query },
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        driverId,
        totalViolations,
        totalPoints: totalPoints[0]?.total || 0,
        byType: Object.fromEntries(byType.map(item => [item._id, item.count])),
        bySeverity: Object.fromEntries(bySeverity.map(item => [item._id, item.count])),
        dateRange: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          months: parseInt(months)
        }
      }
    });
  } catch (error) {
    console.error("Error fetching driver violation summary:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

