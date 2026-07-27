import { User } from "../models/driver/userModel.js";
import { Subscription } from "../models/subscriptionModel.js";
import { Plan } from "../models/planModel.js";
import moment from "moment";

/**
 * Get Super Admin Dashboard Statistics
 * Returns comprehensive dashboard data including:
 * - Total customers (admins)
 * - Active subscriptions
 * - Monthly revenue
 * - Recent customers
 * - Plan distribution
 * - Revenue trends
 */
export const getSuperAdminDashboard = async (req, res) => {
  try {
    // Get time range from query parameter (default: 30d)
    const timeRange = req.query.timeRange || '30d';
    const now = new Date();
    
    // Calculate date ranges based on time range filter
    let startDate;
    let comparisonStartDate;
    let comparisonEndDate;
    
    switch (timeRange) {
      case '7d':
        startDate = moment(now).subtract(7, 'days').toDate();
        comparisonStartDate = moment(now).subtract(14, 'days').toDate();
        comparisonEndDate = moment(now).subtract(7, 'days').toDate();
        break;
      case '30d':
        startDate = moment(now).subtract(30, 'days').toDate();
        comparisonStartDate = moment(now).subtract(60, 'days').toDate();
        comparisonEndDate = moment(now).subtract(30, 'days').toDate();
        break;
      case '90d':
        startDate = moment(now).subtract(90, 'days').toDate();
        comparisonStartDate = moment(now).subtract(180, 'days').toDate();
        comparisonEndDate = moment(now).subtract(90, 'days').toDate();
        break;
      case '1y':
        startDate = moment(now).subtract(1, 'year').toDate();
        comparisonStartDate = moment(now).subtract(2, 'years').toDate();
        comparisonEndDate = moment(now).subtract(1, 'year').toDate();
        break;
      default:
        startDate = moment(now).subtract(30, 'days').toDate();
        comparisonStartDate = moment(now).subtract(60, 'days').toDate();
        comparisonEndDate = moment(now).subtract(30, 'days').toDate();
    }
    
    // Keep these for backward compatibility and specific calculations
    const last30Days = moment(now).subtract(30, 'days').toDate();
    const last7Days = moment(now).subtract(7, 'days').toDate();
    const last90Days = moment(now).subtract(90, 'days').toDate();
    const lastYear = moment(now).subtract(1, 'year').toDate();
    const startOfMonth = moment(now).startOf('month').toDate();
    const startOfLastMonth = moment(now).subtract(1, 'month').startOf('month').toDate();
    const endOfLastMonth = moment(now).subtract(1, 'month').endOf('month').toDate();

    // 1. Get Total Customers (admins) - filtered by time range
    const totalCustomers = await User.countDocuments({ 
      role: 'admin',
      joinDate: { $gte: startDate }
    });
    const activeCustomersInRange = await User.countDocuments({ 
      role: 'admin', 
      status: 'active',
      joinDate: { $gte: startDate }
    });
    const totalActiveCustomers = await User.countDocuments({ 
      role: 'admin', 
      status: 'active'
    });
    const newCustomersInRange = await User.countDocuments({
      role: 'admin',
      joinDate: { $gte: startDate }
    });
    const newCustomersInComparisonRange = await User.countDocuments({
      role: 'admin',
      joinDate: {
        $gte: comparisonStartDate,
        $lt: startDate
      }
    });

    // 2. Get Subscription Statistics - filtered by time range
    const totalSubscriptions = await Subscription.countDocuments({
      createdAt: { $gte: startDate }
    });
    const activeSubscriptions = await Subscription.countDocuments({ 
      status: 'active',
      createdAt: { $gte: startDate }
    });
    const pendingSubscriptions = await Subscription.countDocuments({ 
      status: 'pending',
      createdAt: { $gte: startDate }
    });
    const cancelledSubscriptions = await Subscription.countDocuments({ 
      status: 'cancelled',
      createdAt: { $gte: startDate }
    });

    // 3. Calculate Revenue Metrics - filtered by time range
    // Total lifetime revenue (one-time payments) in range
    const lifetimeRevenue = await Subscription.aggregate([
      {
        $match: {
          planType: 'lifetime',
          paymentStatus: 'paid',
          $or: [
            { lastPaymentDate: { $gte: startDate } },
            { lastPaymentDate: null, createdAt: { $gte: startDate } }
          ]
        }
      },
      {
        $addFields: {
          paymentDate: {
            $ifNull: ['$lastPaymentDate', '$createdAt']
          }
        }
      },
      {
        $match: {
          paymentDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Monthly recurring revenue (active monthly subscriptions) in range
    const monthlyRevenueData = await Subscription.aggregate([
      {
        $match: {
          planType: 'monthly',
          status: 'active',
          paymentStatus: 'paid',
          $or: [
            { lastPaymentDate: { $gte: startDate } },
            { lastPaymentDate: null, createdAt: { $gte: startDate } }
          ]
        }
      },
      {
        $addFields: {
          paymentDate: {
            $ifNull: ['$lastPaymentDate', '$createdAt']
          }
        }
      },
      {
        $match: {
          paymentDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Revenue for selected time range (use lastPaymentDate or createdAt)
    const currentRangeRevenue = await Subscription.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          $or: [
            { lastPaymentDate: { $gte: startDate } },
            { lastPaymentDate: null, createdAt: { $gte: startDate } }
          ]
        }
      },
      {
        $addFields: {
          paymentDate: {
            $ifNull: ['$lastPaymentDate', '$createdAt']
          }
        }
      },
      {
        $match: {
          paymentDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Revenue for comparison period (for percentage change)
    const comparisonRangeRevenue = await Subscription.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          $or: [
            {
              lastPaymentDate: {
                $gte: comparisonStartDate,
                $lt: startDate
              }
            },
            {
              lastPaymentDate: null,
              createdAt: {
                $gte: comparisonStartDate,
                $lt: startDate
              }
            }
          ]
        }
      },
      {
        $addFields: {
          paymentDate: {
            $ifNull: ['$lastPaymentDate', '$createdAt']
          }
        }
      },
      {
        $match: {
          paymentDate: {
            $gte: comparisonStartDate,
            $lt: startDate
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const monthlyRevenue = monthlyRevenueData[0]?.total || 0;
    const totalLifetimeRevenue = lifetimeRevenue[0]?.total || 0;
    const currentRangeTotal = currentRangeRevenue[0]?.total || 0;
    const comparisonRangeTotal = comparisonRangeRevenue[0]?.total || 0;

    // Calculate revenue change percentage
    const revenueChange = comparisonRangeTotal > 0
      ? (((currentRangeTotal - comparisonRangeTotal) / comparisonRangeTotal) * 100).toFixed(1)
      : currentRangeTotal > 0 ? 100 : 0;

    // 4. Get Recent Customers (last 5 admins) - filtered by time range
    const recentCustomers = await User.find({ 
      role: 'admin',
      joinDate: { $gte: startDate }
    })
      .populate('company', 'companyName')
      .sort({ joinDate: -1 })
      .limit(5)
      .select('name email internalId status joinDate company')
      .lean();

    // Get subscription info for recent customers
    const recentCustomersWithSubs = await Promise.all(
      recentCustomers.map(async (customer) => {
        const subscription = await Subscription.findOne({ admin: customer._id })
          .populate('plan', 'planName planType')
          .sort({ createdAt: -1 })
          .lean();

        return {
          id: customer._id.toString(),
          adminName: customer.name || 'N/A',
          companyName: customer.company?.companyName || null,
          plan: subscription?.plan?.planName || 'No Plan',
          status: subscription?.status || 'No Subscription',
          joined: moment(customer.joinDate).format('YYYY-MM-DD'),
          revenue: subscription
            ? `$${subscription.amount.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/${subscription.planType === 'monthly' ? 'mo' : 'one-time'}`
            : '$0/mo',
          instances: 1 // Default, can be enhanced later
        };
      })
    );

    // 5. Plan Distribution (count of subscriptions by plan) - filtered by time range
    const planDistribution = await Subscription.aggregate([
      {
        $match: { 
          status: 'active',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$plan',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'plans',
          localField: '_id',
          foreignField: '_id',
          as: 'planDetails'
        }
      },
      {
        $unwind: '$planDetails'
      },
      {
        $project: {
          planName: '$planDetails.planName',
          count: 1
        }
      }
    ]);

    // 6. Revenue Trend - based on time range
    // For 7d, 30d, 90d: show daily/weekly data
    // For 1y: show monthly data
    let revenueTrend = [];
    let formattedRevenueTrend = [];
    
    if (timeRange === '1y') {
      // Monthly revenue for the year
      const monthlyRevenueTrend = await Subscription.aggregate([
        {
          $match: {
            paymentStatus: 'paid',
            $or: [
              { lastPaymentDate: { $gte: startDate } },
              { lastPaymentDate: null, createdAt: { $gte: startDate } }
            ]
          }
        },
        {
          $addFields: {
            paymentDate: {
              $ifNull: ['$lastPaymentDate', '$createdAt']
            }
          }
        },
        {
          $match: {
            paymentDate: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$paymentDate' },
              month: { $month: '$paymentDate' }
            },
            revenue: { $sum: '$amount' }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1 }
        }
      ]);

      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];

      for (let i = 11; i >= 0; i--) {
        const date = moment(now).subtract(i, 'months');
        const monthData = monthlyRevenueTrend.find(
          r => r._id.year === date.year() && r._id.month === date.month() + 1
        );
        formattedRevenueTrend.push({
          month: monthNames[date.month()],
          revenue: monthData?.revenue || 0
        });
      }
    } else {
      // For shorter ranges, show daily data grouped by week
      const daysInRange = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const dailyRevenueTrend = await Subscription.aggregate([
        {
          $match: {
            paymentStatus: 'paid',
            $or: [
              { lastPaymentDate: { $gte: startDate } },
              { lastPaymentDate: null, createdAt: { $gte: startDate } }
            ]
          }
        },
        {
          $addFields: {
            paymentDate: {
              $ifNull: ['$lastPaymentDate', '$createdAt']
            }
          }
        },
        {
          $match: {
            paymentDate: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$paymentDate' },
              month: { $month: '$paymentDate' },
              day: { $dayOfMonth: '$paymentDate' }
            },
            revenue: { $sum: '$amount' }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
        }
      ]);

      // Group by week for display
      for (let i = daysInRange - 1; i >= 0; i--) {
        const date = moment(now).subtract(i, 'days');
        const dayData = dailyRevenueTrend.find(
          r => r._id.year === date.year() && 
               r._id.month === date.month() + 1 && 
               r._id.day === date.date()
        );
        formattedRevenueTrend.push({
          month: date.format('MMM DD'),
          revenue: dayData?.revenue || 0
        });
      }
    }

    // 7. Activity Feed (recent subscriptions and user registrations) - filtered by time range
    const recentActivities = await Subscription.find({
      createdAt: { $gte: startDate }
    })
      .populate('admin', 'name email')
      .populate('plan', 'planName')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('status planType amount createdAt admin plan')
      .lean();

    const activityFeed = recentActivities.map(sub => ({
      type: sub.status === 'active' ? 'subscription_activated' : 'subscription_created',
      description: `${sub.admin?.name || 'Customer'} ${sub.status === 'active' ? 'activated' : 'created'} ${sub.plan?.planName || 'subscription'}`,
      timestamp: sub.createdAt,
      userId: sub.admin?._id?.toString()
    }));

    // Calculate customer growth based on comparison period
    const customerGrowth = newCustomersInComparisonRange > 0
      ? (((newCustomersInRange - newCustomersInComparisonRange) / newCustomersInComparisonRange) * 100).toFixed(1)
      : newCustomersInRange > 0 ? 100 : 0;

    // Calculate subscription growth based on comparison period
    const subscriptionsInRange = await Subscription.countDocuments({
      createdAt: { $gte: startDate }
    });
    const subscriptionsInComparisonRange = await Subscription.countDocuments({
      createdAt: {
        $gte: comparisonStartDate,
        $lt: startDate
      }
    });

    const subscriptionGrowth = subscriptionsInComparisonRange > 0
      ? (((subscriptionsInRange - subscriptionsInComparisonRange) / subscriptionsInComparisonRange) * 100).toFixed(1)
      : subscriptionsInRange > 0 ? 100 : 0;

    // Response data
    const response = {
      success: true,
      message: "Dashboard data fetched successfully",
      data: {
        stats: {
          totalCustomers, // Customers who joined in selected time range
          activeCustomers: activeCustomersInRange, // Active customers who joined in selected time range
          totalActiveCustomers, // Total active customers (all-time, for Active Customers card)
          activeSubscriptions,
          monthlyRevenue: parseFloat(monthlyRevenue.toFixed(2)),
          currentMonthRevenue: parseFloat(currentRangeTotal.toFixed(2)),
          totalLifetimeRevenue: parseFloat(totalLifetimeRevenue.toFixed(2)),
          revenueChange: parseFloat(revenueChange),
          customerGrowth: parseFloat(customerGrowth),
          subscriptionGrowth: parseFloat(subscriptionGrowth),
          timeRange: timeRange
        },
        recentCustomers: recentCustomersWithSubs,
        planDistribution: planDistribution.map(p => ({
          planName: p.planName,
          count: p.count
        })),
        revenueTrend: formattedRevenueTrend,
        recentActivity: activityFeed,
        subscriptionStats: {
          total: totalSubscriptions,
          active: activeSubscriptions,
          pending: pendingSubscriptions,
          cancelled: cancelledSubscriptions
        }
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Super Admin Dashboard Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard data",
      error: error.message
    });
  }
};
