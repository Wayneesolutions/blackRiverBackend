import { User } from "../models/driver/userModel.js";
import { Subscription } from "../models/subscriptionModel.js";
import { Plan } from "../models/planModel.js";
import moment from "moment";
import {
  loadRevenueContext, adminExists, statusOf, cycleOf, CYCLE_SUFFIX, paymentsOf, sumPayments,
  monthlyEquivalent, percentChange, round2,
} from "../utils/revenueLedger.js";

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

    // 1. Get Total Customers (admins) - all time, so it can never be lower than Active Customers
    const totalCustomers = await User.countDocuments({ role: 'admin' });
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

    // 2. Subscription statistics + revenue, using the shared rules in utils/revenueLedger.js
    //    (cancelled invoices and deleted customers no longer count).
    const ctx = await loadRevenueContext();
    const liveSubs = ctx.subscriptions.filter((sub) => adminExists(ctx, sub.admin));
    const statusById = new Map(ctx.subscriptions.map((sub) => [sub._id.toString(), statusOf(sub, ctx, now).status]));

    const totalSubscriptions = liveSubs.length;
    const activeSubscriptions = liveSubs.filter((sub) => sub.status === 'active' && statusById.get(sub._id.toString()) !== 'Cancelled').length;
    const pendingSubscriptions = liveSubs.filter((sub) => sub.status === 'pending' && statusById.get(sub._id.toString()) !== 'Cancelled').length;
    const cancelledSubscriptions = ctx.subscriptions.filter((sub) => statusById.get(sub._id.toString()) === 'Cancelled').length;
    const overdueSubscriptions = ctx.subscriptions.filter((sub) => statusById.get(sub._id.toString()) === 'Overdue').length;

    // 3. Revenue
    const payments = paymentsOf(ctx);
    const currentRangeTotal = sumPayments(payments, startDate);
    const comparisonRangeTotal = sumPayments(payments, comparisonStartDate, startDate);
    const revenueChange = percentChange(currentRangeTotal, comparisonRangeTotal);
    const totalLifetimeRevenue = sumPayments(payments); // all money received, all time
    const monthlyRevenue = ctx.subscriptions
      .filter((sub) => statusById.get(sub._id.toString()) === 'Paid')
      .reduce((sum, sub) => sum + monthlyEquivalent(sub), 0); // monthly recurring (MRR)

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
          status: subscription ? statusOf(subscription, ctx, now).status.toLowerCase() : 'No Subscription',
          joined: moment(customer.joinDate).format('YYYY-MM-DD'),
          revenue: subscription
            ? `$${(subscription.amount || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${CYCLE_SUFFIX[cycleOf(subscription)]}`
            : '$0',
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
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      for (let i = 11; i >= 0; i--) {
        const from = moment(now).subtract(i, 'months').startOf('month');
        const to = from.clone().add(1, 'month');
        formattedRevenueTrend.push({
          month: monthNames[from.month()],
          revenue: round2(sumPayments(payments, from.toDate(), to.toDate()))
        });
      }
    } else {
      const daysInRange = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      for (let i = daysInRange - 1; i >= 0; i--) {
        const from = moment(now).subtract(i, 'days').startOf('day');
        const to = from.clone().add(1, 'day');
        formattedRevenueTrend.push({
          month: from.format('MMM DD'),
          revenue: round2(sumPayments(payments, from.toDate(), to.toDate()))
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
    const customerGrowth = percentChange(newCustomersInRange, newCustomersInComparisonRange);

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

    const subscriptionGrowth = percentChange(subscriptionsInRange, subscriptionsInComparisonRange);

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
          monthlyRevenue: round2(monthlyRevenue),
          currentMonthRevenue: round2(currentRangeTotal), // revenue received in the selected range
          totalLifetimeRevenue: round2(totalLifetimeRevenue),
          revenueChange, // null = nothing in the previous period to compare against
          customerGrowth,
          subscriptionGrowth,
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
          cancelled: cancelledSubscriptions,
          overdue: overdueSubscriptions
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
