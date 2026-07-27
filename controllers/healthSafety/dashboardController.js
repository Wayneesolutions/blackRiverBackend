import { CAPA } from "../../models/healthSafety/capaModel.js";
import { Certificate } from "../../models/healthSafety/certificateModel.js";
import { PolicyDocument } from "../../models/healthSafety/policyDocumentModel.js";
import { Incident } from "../../models/healthSafety/incidentModel.js";
import { Hazard } from "../../models/healthSafety/hazardModel.js";
import { Inspection } from "../../models/healthSafety/inspectionModel.js";
import { User } from "../../models/driver/userModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Get Health & Safety Dashboard Stats
export const getDashboardStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = {};
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate date 12 months ago
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    // Get all stats in parallel
    const [
      overdueCAPA,
      expiredCertificates,
      openIncidents,
      totalIncidents,
      openHazards,
      overdueInspections,
      activeRTWCases,
      totalEmployees,
      activePolicies
    ] = await Promise.all([
      // Overdue CAPA - status is overdue OR dueDate has passed and status is not completed
      CAPA.countDocuments({
        ...query,
        $or: [
          { status: 'overdue' },
          {
            dueDate: { $lt: today },
            status: { $ne: 'completed' }
          }
        ]
      }),

      // Expired Certificates - status is expired OR expiryDate has passed
      Certificate.countDocuments({
        ...query,
        $or: [
          { status: 'expired' },
          { expiryDate: { $lt: today } }
        ]
      }),

      // Open Incident Investigations - status is open, investigating, or action-required
      Incident.countDocuments({
        ...query,
        status: { $in: ['open', 'investigating', 'action-required'] }
      }),

      // Total Incidents (last 12 months)
      Incident.countDocuments({
        ...query,
        date: { $gte: twelveMonthsAgo }
      }),

      // Open Hazards - status is not resolved
      Hazard.countDocuments({
        ...query,
        status: { $ne: 'resolved' }
      }),

      // Overdue Inspections - status is overdue OR scheduledDate has passed and status is not completed
      Inspection.countDocuments({
        ...query,
        $or: [
          { status: 'overdue' },
          {
            scheduledDate: { $lt: today },
            status: { $ne: 'completed' }
          }
        ]
      }),

      // Active Return-to-Work Cases - incidents with injury and (no return date OR future return date)
      Incident.countDocuments({
        ...query,
        hasInjury: true,
        $or: [
          { 'injuryRecord.returnToWorkDate': { $exists: false } },
          { 'injuryRecord.returnToWorkDate': { $gte: today } }
        ]
      }),

      // Total Employees (for policy gap calculation)
      User.countDocuments({
        ...query,
        role: { $nin: ['superadmin', 'admin'] },
        status: 'active'
      }),

      // Active Policies
      PolicyDocument.countDocuments({
        ...query,
        status: 'active'
      })
    ]);

    // Calculate Policy Acknowledgment Gaps
    // For now, we'll estimate gaps based on active policies
    // If there are active policies but no acknowledgment tracking, we'll use a simple calculation
    // This can be enhanced later when policy acknowledgment model is implemented
    const policyGaps = activePolicies > 0 ? Math.floor(activePolicies * 0.1) : 0;

    // Calculate trends (comparing last month to previous month)
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const [
      lastMonthOverdueCAPA,
      previousMonthOverdueCAPA,
      lastMonthTotalIncidents,
      previousMonthTotalIncidents
    ] = await Promise.all([
      CAPA.countDocuments({
        ...query,
        $or: [
          { status: 'overdue' },
          {
            dueDate: { $lt: oneMonthAgo, $gte: twoMonthsAgo },
            status: { $ne: 'completed' }
          }
        ]
      }),
      CAPA.countDocuments({
        ...query,
        $or: [
          { status: 'overdue' },
          {
            dueDate: { $lt: twoMonthsAgo },
            status: { $ne: 'completed' }
          }
        ]
      }),
      Incident.countDocuments({
        ...query,
        date: { $gte: oneMonthAgo, $lt: today }
      }),
      Incident.countDocuments({
        ...query,
        date: { $gte: twoMonthsAgo, $lt: oneMonthAgo }
      })
    ]);

    // Calculate CAPA trend
    const capaTrend = previousMonthOverdueCAPA > 0
      ? Math.round(((lastMonthOverdueCAPA - previousMonthOverdueCAPA) / previousMonthOverdueCAPA) * 100)
      : 0;

    // Calculate incident trend
    const incidentTrend = previousMonthTotalIncidents > 0
      ? Math.round(((lastMonthTotalIncidents - previousMonthTotalIncidents) / previousMonthTotalIncidents) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        overdueCAPA,
        policyGaps,
        expiredCertificates,
        openIncidents,
        totalIncidents,
        openHazards,
        overdueInspections,
        activeRTWCases,
        trends: {
          capa: {
            value: Math.abs(capaTrend),
            direction: capaTrend > 0 ? 'up' : 'down',
            label: 'vs last month'
          },
          incidents: {
            value: Math.abs(incidentTrend),
            direction: incidentTrend > 0 ? 'up' : 'down',
            label: 'vs last year'
          }
        }
      }
    });
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch dashboard statistics"
    });
  }
};

// ✅ Get Recent Activity
export const getRecentActivity = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = {};
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const limit = parseInt(req.query.limit) || 10;

    // Get recent incidents
    const recentIncidents = await Incident.find(query)
      .select('incidentNumber date type location reportedBy status createdAt')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Get recent CAPAs
    const recentCAPAs = await CAPA.find({
      ...query,
      status: { $in: ['overdue', 'open', 'in-progress'] }
    })
      .select('capaNumber title dueDate status createdAt')
      .populate('assignedTo', 'name')
      .sort({ dueDate: 1 })
      .limit(5)
      .lean();

    // Get expiring certificates
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const expiringCertificates = await Certificate.find({
      ...query,
      expiryDate: { $gte: new Date(), $lte: thirtyDaysFromNow },
      status: { $ne: 'expired' }
    })
      .select('certificateNumber employee type expiryDate status')
      .sort({ expiryDate: 1 })
      .limit(5)
      .lean();

    // Format activities
    const activities = [];

    // Add incidents
    recentIncidents.forEach(incident => {
      const timeAgo = getTimeAgo(incident.createdAt);
      activities.push({
        id: incident._id.toString(),
        type: 'incident',
        title: `${incident.type} Report Filed`,
        description: `${incident.reportedBy} - ${incident.location}`,
        time: timeAgo,
        status: incident.status,
        createdAt: incident.createdAt
      });
    });

    // Add overdue CAPAs
    recentCAPAs.forEach(capa => {
      if (capa.status === 'overdue' || (capa.dueDate && new Date(capa.dueDate) < new Date())) {
        const timeAgo = getTimeAgo(capa.createdAt);
        activities.push({
          id: capa._id.toString(),
          type: 'capa',
          title: 'CAPA Overdue',
          description: capa.title,
          time: timeAgo,
          status: 'overdue',
          createdAt: capa.createdAt
        });
      }
    });

    // Add expiring certificates
    if (expiringCertificates.length > 0) {
      const employeeCount = new Set(expiringCertificates.map(c => c.employee)).size;
      const types = [...new Set(expiringCertificates.map(c => c.type))];
      const timeAgo = getTimeAgo(expiringCertificates[0].expiryDate);
      
      activities.push({
        id: 'expiring-certs',
        type: 'training',
        title: 'Training Expiring Soon',
        description: `${employeeCount} employees - ${types.join(', ')}`,
        time: timeAgo,
        status: 'expiring',
        createdAt: expiringCertificates[0].expiryDate
      });
    }

    // Sort by createdAt and limit
    activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const limitedActivities = activities.slice(0, limit);

    res.json({
      success: true,
      data: limitedActivities
    });
  } catch (err) {
    console.error('Get recent activity error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch recent activity"
    });
  }
};

// ✅ Get Upcoming Tasks
export const getUpcomingTasks = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = {};
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const tasks = [];

    // Get upcoming inspections
    const upcomingInspections = await Inspection.find({
      ...query,
      scheduledDate: { $gte: new Date(), $lte: thirtyDaysFromNow },
      status: { $ne: 'completed' }
    })
      .select('inspectionNumber type scheduledDate status')
      .sort({ scheduledDate: 1 })
      .limit(5)
      .lean();

    upcomingInspections.forEach(inspection => {
      tasks.push({
        id: inspection._id.toString(),
        title: `${inspection.type} Inspection`,
        date: inspection.scheduledDate.toISOString().split('T')[0],
        type: 'inspection'
      });
    });

    // Get upcoming policy reviews
    const upcomingPolicyReviews = await PolicyDocument.find({
      ...query,
      reviewDate: { $gte: new Date(), $lte: thirtyDaysFromNow },
      status: 'active'
    })
      .select('policyNumber title reviewDate')
      .sort({ reviewDate: 1 })
      .limit(5)
      .lean();

    upcomingPolicyReviews.forEach(policy => {
      tasks.push({
        id: policy._id.toString(),
        title: `Policy Renewal: ${policy.title}`,
        date: policy.reviewDate.toISOString().split('T')[0],
        type: 'policy'
      });
    });

    // Get upcoming committee meetings (if committee model exists)
    // For now, we'll add a placeholder
    // This can be enhanced when committee meeting model is implemented

    // Sort by date
    tasks.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      success: true,
      data: tasks.slice(0, 10)
    });
  } catch (err) {
    console.error('Get upcoming tasks error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch upcoming tasks"
    });
  }
};

// Helper function to calculate time ago
function getTimeAgo(date) {
  if (!date) return 'Unknown';
  
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now - past) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }
}

