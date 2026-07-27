import { Report } from "../../models/healthSafety/reportModel.js";
import { Incident } from "../../models/healthSafety/incidentModel.js";
import { Inspection } from "../../models/healthSafety/inspectionModel.js";
import { Training } from "../../models/healthSafety/trainingModel.js";
import { Certificate } from "../../models/healthSafety/certificateModel.js";
import { PolicyDocument } from "../../models/healthSafety/policyDocumentModel.js";
import { CAPA } from "../../models/healthSafety/capaModel.js";
import { Hazard } from "../../models/healthSafety/hazardModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// Helper function to get date range based on period type
const getDateRange = (periodType, customStartDate, customEndDate) => {
  const now = new Date();
  let startDate, endDate;

  if (customStartDate && customEndDate) {
    startDate = new Date(customStartDate);
    endDate = new Date(customEndDate);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }

  switch (periodType) {
    case 'daily':
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'weekly':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'monthly':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'quarterly':
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'yearly':
      startDate = new Date(now.getFullYear(), 0, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), 11, 31);
      endDate.setHours(23, 59, 59, 999);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
};

// Format period string
const formatPeriod = (periodType, startDate, endDate) => {
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (periodType === 'monthly') {
      return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (periodType === 'quarterly') {
      const quarter = Math.floor(start.getMonth() / 3) + 1;
      return `Q${quarter} ${start.getFullYear()}`;
    } else if (periodType === 'yearly') {
      return start.getFullYear().toString();
    } else if (periodType === 'weekly') {
      return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    } else if (periodType === 'daily') {
      return start.toLocaleDateString();
    }
  }
  return 'Custom Period';
};

// ✅ Get Analytics Statistics
export const getAnalyticsStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { periodType = 'monthly', startDate, endDate } = req.query;
    const { startDate: rangeStart, endDate: rangeEnd } = getDateRange(periodType, startDate, endDate);

    const query = {};
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    // Date queries - use appropriate date fields for each model, with fallback to createdAt
    const incidentDateQuery = {
      $or: [
        { date: { $gte: rangeStart, $lte: rangeEnd } },
        { createdAt: { $gte: rangeStart, $lte: rangeEnd } }
      ]
    };
    const inspectionDateQuery = {
      $or: [
        { date: { $gte: rangeStart, $lte: rangeEnd } },
        { createdAt: { $gte: rangeStart, $lte: rangeEnd } }
      ]
    };
    const trainingDateQuery = {
      $or: [
        { date: { $gte: rangeStart, $lte: rangeEnd } },
        { createdAt: { $gte: rangeStart, $lte: rangeEnd } }
      ]
    };

    // Get all statistics in parallel
    const [
      totalIncidents,
      openIncidents,
      totalInspections,
      passedInspections,
      totalTraining,
      completedTraining,
      activePolicies,
      expiringCertificates
    ] = await Promise.all([
      // Total Incidents (use date field)
      Incident.countDocuments({ ...query, ...incidentDateQuery }),
      
      // Open Incidents
      Incident.countDocuments({ 
        ...query, 
        ...incidentDateQuery,
        status: { $in: ['open', 'investigating', 'action-required'] }
      }),
      
      // Total Inspections (use date field)
      Inspection.countDocuments({ ...query, ...inspectionDateQuery }),
      
      // Passed Inspections (completed status)
      Inspection.countDocuments({
        ...query,
        ...inspectionDateQuery,
        status: 'completed'
      }),
      
      // Total Training Programs (use date field)
      Training.countDocuments({ ...query, ...trainingDateQuery }),
      
      // Completed Training
      Training.countDocuments({
        ...query,
        ...trainingDateQuery,
        status: 'completed'
      }),
      
      // Active Policies (no date filter - all active policies)
      PolicyDocument.countDocuments({
        ...query,
        status: 'active'
      }),
      
      // Expiring Certificates (within next 30 days)
      Certificate.countDocuments({
        ...query,
        expiryDate: {
          $gte: new Date(),
          $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        status: { $ne: 'expired' }
      })
    ]);

    res.json({
      success: true,
      data: {
        totalIncidents,
        openIncidents,
        totalInspections,
        passedInspections,
        totalTraining,
        completedTraining,
        activePolicies,
        expiringCertificates,
        period: formatPeriod(periodType, rangeStart, rangeEnd),
        startDate: rangeStart,
        endDate: rangeEnd
      }
    });
  } catch (err) {
    console.error('Get analytics stats error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch analytics statistics"
    });
  }
};

// ✅ Get Incident Trends (for charts)
export const getIncidentTrends = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { periodType = 'monthly', startDate, endDate } = req.query;
    const { startDate: rangeStart, endDate: rangeEnd } = getDateRange(periodType, startDate, endDate);

    const query = {};
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    // Build date query - try date field first, fallback to createdAt
    const dateQuery = {
      $or: [
        { date: { $gte: rangeStart, $lte: rangeEnd } },
        { createdAt: { $gte: rangeStart, $lte: rangeEnd } }
      ]
    };

    // Group incidents by date
    let trends = await Incident.aggregate([
      {
        $match: {
          ...query,
          ...dateQuery
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { 
              format: "%Y-%m-%d", 
              date: { $ifNull: ["$date", "$createdAt"] }
            }
          },
          count: { $sum: 1 },
          bySeverity: {
            $push: "$severity"
          },
          byType: {
            $push: "$type"
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // If no trends found with date range, try getting all incidents (last 90 days)
    if (trends.length === 0) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      trends = await Incident.aggregate([
        {
          $match: {
            ...query,
            $or: [
              { date: { $gte: ninetyDaysAgo } },
              { createdAt: { $gte: ninetyDaysAgo } }
            ]
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { 
                format: "%Y-%m-%d", 
                date: { $ifNull: ["$date", "$createdAt"] }
              }
            },
            count: { $sum: 1 },
            bySeverity: {
              $push: "$severity"
            },
            byType: {
              $push: "$type"
            }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);
    }
    
    // If still no data, try getting all incidents regardless of date
    if (trends.length === 0) {
      trends = await Incident.aggregate([
        {
          $match: query
        },
        {
          $group: {
            _id: {
              $dateToString: { 
                format: "%Y-%m-%d", 
                date: { $ifNull: ["$date", "$createdAt"] }
              }
            },
            count: { $sum: 1 },
            bySeverity: {
              $push: "$severity"
            },
            byType: {
              $push: "$type"
            }
          }
        },
        {
          $sort: { _id: -1 }
        },
        {
          $limit: 30
        }
      ]);
    }

    // Format trends data
    const formattedTrends = trends.map(trend => ({
      date: trend._id,
      count: trend.count,
      bySeverity: {
        low: trend.bySeverity.filter(s => s === 'low').length,
        medium: trend.bySeverity.filter(s => s === 'medium').length,
        high: trend.bySeverity.filter(s => s === 'high').length,
        critical: trend.bySeverity.filter(s => s === 'critical').length
      },
      byType: {
        'Driver Injury': trend.byType.filter(t => t === 'Driver Injury').length,
        'Vehicle Accident': trend.byType.filter(t => t === 'Vehicle Accident').length,
        'Workplace Incident': trend.byType.filter(t => t === 'Workplace Incident').length,
        'Near Miss': trend.byType.filter(t => t === 'Near Miss').length
      }
    }));

    res.json({
      success: true,
      data: formattedTrends
    });
  } catch (err) {
    console.error('Get incident trends error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch incident trends"
    });
  }
};

// ✅ Get Inspection Status (for charts)
export const getInspectionStatus = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { periodType = 'monthly', startDate, endDate } = req.query;
    const { startDate: rangeStart, endDate: rangeEnd } = getDateRange(periodType, startDate, endDate);

    const query = {};
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    // Build date query - try date field first, fallback to createdAt
    const dateQuery = {
      $or: [
        { date: { $gte: rangeStart, $lte: rangeEnd } },
        { createdAt: { $gte: rangeStart, $lte: rangeEnd } }
      ]
    };

    // Group inspections by status
    let statusData = await Inspection.aggregate([
      {
        $match: {
          ...query,
          ...dateQuery
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // If no data found with date range, try getting all inspections (last 90 days)
    if (statusData.length === 0) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      statusData = await Inspection.aggregate([
        {
          $match: {
            ...query,
            $or: [
              { date: { $gte: ninetyDaysAgo } },
              { createdAt: { $gte: ninetyDaysAgo } }
            ]
          }
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]);
    }
    
    // If still no data, try getting all inspections regardless of date
    if (statusData.length === 0) {
      statusData = await Inspection.aggregate([
        {
          $match: query
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]);
    }

    const formattedStatus = {
      scheduled: 0,
      'in-progress': 0,
      completed: 0,
      overdue: 0
    };

    statusData.forEach(item => {
      if (formattedStatus.hasOwnProperty(item._id)) {
        formattedStatus[item._id] = item.count;
      }
    });

    res.json({
      success: true,
      data: formattedStatus
    });
  } catch (err) {
    console.error('Get inspection status error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch inspection status"
    });
  }
};

// ✅ Get All Reports
export const getReports = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = {};
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const reports = await Report.find(query)
      .populate('generatedBy', 'name email')
      .sort({ generatedDate: -1 })
      .lean();

    res.json({
      success: true,
      data: reports
    });
  } catch (err) {
    console.error('Get reports error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch reports"
    });
  }
};

// ✅ Get Report By ID
export const getReportById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const report = await Report.findOne(query)
      .populate('generatedBy', 'name email')
      .lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (err) {
    console.error('Get report by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch report"
    });
  }
};

// ✅ Generate Report
export const generateReport = async (req, res) => {
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
      periodType = 'monthly',
      startDate,
      endDate,
      fileType = 'pdf'
    } = req.body;

    if (!title || !type) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: title and type are required."
      });
    }

    const { startDate: rangeStart, endDate: rangeEnd } = getDateRange(periodType, startDate, endDate);
    const period = formatPeriod(periodType, rangeStart, rangeEnd);

    // Collect report data based on type
    let reportData = {};
    const query = isSuperadmin ? {} : { company: companyId };
    const incidentDateQuery = { date: { $gte: rangeStart, $lte: rangeEnd } };
    const inspectionDateQuery = { date: { $gte: rangeStart, $lte: rangeEnd } };
    const trainingDateQuery = { date: { $gte: rangeStart, $lte: rangeEnd } };
    const createdAtQuery = { createdAt: { $gte: rangeStart, $lte: rangeEnd } };

    switch (type) {
      case 'Monthly Summary':
      case 'Custom':
        // Aggregate all data
        const [
          incidents, inspections, trainings, certificates, policies, capas, hazards
        ] = await Promise.all([
          Incident.find({ ...query, ...incidentDateQuery }).lean(),
          Inspection.find({ ...query, ...inspectionDateQuery }).lean(),
          Training.find({ ...query, ...trainingDateQuery }).lean(),
          Certificate.find({ ...query, ...createdAtQuery }).lean(),
          PolicyDocument.find({ ...query }).lean(),
          CAPA.find({ ...query, issueDate: { $gte: rangeStart, $lte: rangeEnd } }).lean(),
          Hazard.find({ ...query, identifiedDate: { $gte: rangeStart, $lte: rangeEnd } }).lean()
        ]);

        reportData = {
          incidents: incidents.length,
          openIncidents: incidents.filter(i => ['open', 'investigating', 'action-required'].includes(i.status)).length,
          inspections: inspections.length,
          completedInspections: inspections.filter(i => i.status === 'completed').length,
          trainings: trainings.length,
          completedTrainings: trainings.filter(t => t.status === 'completed').length,
          certificates: certificates.length,
          activePolicies: policies.filter(p => p.status === 'active').length,
          capas: capas.length,
          openCapas: capas.filter(c => ['open', 'in-progress'].includes(c.status)).length,
          hazards: hazards.length,
          openHazards: hazards.filter(h => ['identified', 'assessed'].includes(h.status)).length,
          details: {
            incidents,
            inspections,
            trainings,
            certificates,
            policies,
            capas,
            hazards
          }
        };
        break;

      case 'Incident Analysis':
        const incidentData = await Incident.find({ ...query, ...incidentDateQuery })
          .populate('reportedBy', 'name email')
          .lean();
        reportData = {
          total: incidentData.length,
          byType: {},
          bySeverity: {},
          byStatus: {},
          incidents: incidentData
        };
        incidentData.forEach(inc => {
          reportData.byType[inc.type] = (reportData.byType[inc.type] || 0) + 1;
          reportData.bySeverity[inc.severity] = (reportData.bySeverity[inc.severity] || 0) + 1;
          reportData.byStatus[inc.status] = (reportData.byStatus[inc.status] || 0) + 1;
        });
        break;

      case 'Inspection Summary':
        const inspectionData = await Inspection.find({ ...query, ...inspectionDateQuery })
          .populate('createdBy', 'name email')
          .lean();
        reportData = {
          total: inspectionData.length,
          byStatus: {},
          byType: {},
          inspections: inspectionData
        };
        inspectionData.forEach(ins => {
          reportData.byStatus[ins.status] = (reportData.byStatus[ins.status] || 0) + 1;
          reportData.byType[ins.type] = (reportData.byType[ins.type] || 0) + 1;
        });
        break;

      case 'Training Report':
        const trainingData = await Training.find({ ...query, ...trainingDateQuery })
          .populate('participants', 'name email')
          .populate('createdBy', 'name email')
          .lean();
        reportData = {
          total: trainingData.length,
          byStatus: {},
          byType: {},
          trainings: trainingData
        };
        trainingData.forEach(tr => {
          reportData.byStatus[tr.status] = (reportData.byStatus[tr.status] || 0) + 1;
          reportData.byType[tr.type] = (reportData.byType[tr.type] || 0) + 1;
        });
        break;

      case 'CAPA Report':
        const capaData = await CAPA.find({ ...query, issueDate: { $gte: rangeStart, $lte: rangeEnd } })
          .populate('assignedTo', 'name email')
          .populate('createdBy', 'name email')
          .lean();
        reportData = {
          total: capaData.length,
          byStatus: {},
          byType: {},
          byPriority: {},
          capas: capaData
        };
        capaData.forEach(capa => {
          reportData.byStatus[capa.status] = (reportData.byStatus[capa.status] || 0) + 1;
          reportData.byType[capa.type] = (reportData.byType[capa.type] || 0) + 1;
          reportData.byPriority[capa.priority] = (reportData.byPriority[capa.priority] || 0) + 1;
        });
        break;
    }

    // Generate report number
    const year = new Date().getFullYear();
    const companyFilter = isSuperadmin ? (req.body.company ? { company: req.body.company } : {}) : { company: companyId };
    const count = await Report.countDocuments({
      reportNumber: new RegExp(`^RPT-${year}-`),
      ...companyFilter
    });
    const reportNumber = `RPT-${year}-${String(count + 1).padStart(4, '0')}`;

    // Create report record
    const report = new Report({
      reportNumber,
      title: title.trim(),
      type,
      period,
      periodType,
      startDate: rangeStart,
      endDate: rangeEnd,
      status: 'generated',
      fileType,
      reportData,
      company: isSuperadmin ? req.body.company || null : companyId,
      generatedBy: req.user._id
    });

    await report.save();
    await report.populate('generatedBy', 'name email');

    res.status(201).json({
      success: true,
      message: "Report generated successfully",
      data: report
    });
  } catch (err) {
    console.error('Generate report error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to generate report"
    });
  }
};

// ✅ Delete Report
export const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const report = await Report.findOneAndDelete(query);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }

    res.json({
      success: true,
      message: "Report deleted successfully"
    });
  } catch (err) {
    console.error('Delete report error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete report"
    });
  }
};

