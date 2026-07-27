import { Subscription } from "../models/subscriptionModel.js";
import { User } from "../models/driver/userModel.js";
import { Plan } from "../models/planModel.js";
import moment from "moment";
import mongoose from "mongoose";
import  SuperAdminInvoice  from "../models/superAdminInvoice.js";

/**
 * Get Super Admin Revenue Data
 * Returns comprehensive revenue information including:
 * - Revenue metrics (total, monthly recurring, overdue, trial potential)
 * - Revenue entries with customer details
 * - Filtering by status
 */
export const getSuperAdminRevenue = async (req, res) => {
  try {
    // Get query parameters
    const { status, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Get current date once for reuse throughout the function
    const now = new Date();
    const nowUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Build filter for subscriptions
    const filter = {};
    const isTrialFilter = (status === 'trial');
    const includeTrialAdmins = (status === 'all' || status === 'trial' || !status);
    
    // If filtering by trial, don't fetch subscriptions (only trial admins)
    if (!isTrialFilter) {
      if (status && status !== 'all') {
        if (status === 'paid') {
          filter.paymentStatus = 'paid';
        } else if (status === 'overdue') {
          filter.status = 'past_due';
        } else if (status === 'pending') {
          filter.paymentStatus = 'pending';
        }
      }

      // Get all subscriptions with populated admin and plan
      var subscriptions = await Subscription.find(filter)
        .populate({
          path: 'admin',
          select: 'name email internalId company',
          populate: {
            path: 'company',
            select: 'companyName'
          }
        })
        .populate('plan', 'planName planType')
        .sort({ createdAt: -1 })
        .lean();
    } else {
      var subscriptions = [];
    }

    // Get admin IDs that already have subscriptions (to exclude from trial admin query)
    // When filtering by trial, only exclude admins with active/paid subscriptions
    // (pending subscriptions don't count - admin is still in trial)
    let adminIdsWithSubscriptions = [];
    if (isTrialFilter) {
      // For trial filter, only exclude admins with active or paid subscriptions
      const activeOrPaidSubs = await Subscription.find({
        $or: [
          { status: 'active' },
          { paymentStatus: 'paid' }
        ]
      })
        .select('admin')
        .lean();
      adminIdsWithSubscriptions = [...new Set(activeOrPaidSubs.map(sub => sub.admin?.toString()).filter(Boolean))]
        .map(id => new mongoose.Types.ObjectId(id));
      console.log(`📊 Trial filter: Excluding ${adminIdsWithSubscriptions.length} admins with active/paid subscriptions`);
    } else {
      adminIdsWithSubscriptions = subscriptions
        .map(sub => sub.admin?._id?.toString())
        .filter(Boolean)
        .map(id => new mongoose.Types.ObjectId(id));
      console.log(`📊 Found ${adminIdsWithSubscriptions.length} admins with subscriptions (to exclude from trial query)`);
    }

    // Get trial period admins (admins with trial dates but no subscriptions)
    let trialAdmins = [];
    if (includeTrialAdmins) {
      const trialQuery = {
        role: 'admin',
        trialStartDate: { $exists: true, $ne: null },
        trialEndDate: { $exists: true, $ne: null }
      };
      
      // Exclude admins who already have subscriptions (only if not filtering by trial)
      // When filtering by trial, we want to show ALL admins in trial, even if they have pending subscriptions
      if (adminIdsWithSubscriptions.length > 0 && !isTrialFilter) {
        trialQuery._id = { $nin: adminIdsWithSubscriptions };
      }
      
      trialAdmins = await User.find(trialQuery)
        .populate({
          path: 'company',
          select: 'companyName'
        })
        .select('name email internalId company trialStartDate trialEndDate createdAt')
        .lean();

      console.log(`🔍 Found ${trialAdmins.length} admins with trial dates (before filtering)`);
      console.log(`📅 Current date (UTC): ${nowUTC.toISOString()}`);

      // Filter to only include active trials (trial not expired)
      trialAdmins = trialAdmins.filter(admin => {
        if (!admin.trialStartDate || !admin.trialEndDate) {
          console.log(`❌ Admin ${admin._id} missing trial dates`);
          return false;
        }
        
        const trialEndDate = new Date(admin.trialEndDate);
        const trialEndDateUTC = new Date(Date.UTC(trialEndDate.getUTCFullYear(), trialEndDate.getUTCMonth(), trialEndDate.getUTCDate()));
        
        // Trial is active if current date is on or before trial end date
        const isActive = nowUTC <= trialEndDateUTC;
        
        if (!isActive) {
          console.log(`⏰ Admin ${admin._id} (${admin.email}) trial expired. End: ${trialEndDateUTC.toISOString()}, Now: ${nowUTC.toISOString()}`);
        } else {
          console.log(`✅ Admin ${admin._id} (${admin.email}) has active trial. End: ${trialEndDateUTC.toISOString()}`);
        }
        
        return isActive;
      });
      
      console.log(`✅ Filtered to ${trialAdmins.length} active trial admins`);
    }

    // Combine subscriptions and trial admins, then sort and paginate
    let allEntries = [...subscriptions];
    
    // Add trial admins as entries
    const trialEntries = trialAdmins.map(admin => ({
      _id: admin._id,
      admin: admin,
      plan: null,
      status: 'pending',
      paymentStatus: 'pending',
      amount: 0,
      planType: null,
      createdAt: admin.createdAt || admin.trialStartDate,
      isTrialAdmin: true,
      trialStartDate: admin.trialStartDate,
      trialEndDate: admin.trialEndDate
    }));
    
    allEntries = [...allEntries, ...trialEntries];
    
    // Sort by creation date (newest first)
    allEntries.sort((a, b) => {
      const dateA = a.createdAt || a.trialStartDate || new Date(0);
      const dateB = b.createdAt || b.trialStartDate || new Date(0);
      return new Date(dateB) - new Date(dateA);
    });

    // Get total count for pagination (including trial admins)
    let totalCount = allEntries.length;

    // Apply pagination
    const paginatedEntries = allEntries.slice(skip, skip + limitNum);

    // Transform subscriptions and trial admins to revenue entries
    const revenueEntries = paginatedEntries.map((entry) => {
      // Handle trial admin entries (no subscription)
      if (entry.isTrialAdmin) {
        const admin = entry.admin || {};
        const company = admin.company || {};
        const trialEndDate = new Date(admin.trialEndDate);
        const trialStartDate = new Date(admin.trialStartDate);
        
        // Calculate days remaining
        const trialEndDateUTC = new Date(Date.UTC(trialEndDate.getUTCFullYear(), trialEndDate.getUTCMonth(), trialEndDate.getUTCDate()));
        const daysRemaining = Math.ceil((trialEndDateUTC - nowUTC) / (1000 * 60 * 60 * 24));
        
        return {
          id: admin._id?.toString() || 'N/A',
          customer: company.companyName || admin.name || 'N/A',
          customerId: admin.internalId || admin._id?.toString() || 'N/A',
          adminName: admin.name || 'N/A',
          companyName: company.companyName || null,
          plan: 'Trial Period',
          amount: 0,
          recurring: false,
          paymentDate: moment(trialStartDate).format('YYYY-MM-DD'),
          nextPayment: `Trial (${daysRemaining} days left)`,
          status: 'Trial',
          method: 'N/A',
          subscriptionStatus: 'pending',
          paymentStatus: 'pending',
          planType: null,
          isTrialAdmin: true,
          trialEndDate: moment(trialEndDate).format('YYYY-MM-DD')
        };
      }
      
      // Handle subscription entries
      const sub = entry;
      const admin = sub.admin || {};
      const plan = sub.plan || {};
      const company = admin.company || {};
      
      // Determine payment date
      const paymentDate = sub.lastPaymentDate || sub.createdAt;
      
      // Determine next payment date
      let nextPayment = null;
      if (sub.planType === 'monthly' && sub.status === 'active') {
        nextPayment = sub.nextBillingDate || moment(paymentDate).add(1, 'month').toDate();
      } else if (sub.status === 'pending') {
        nextPayment = 'Trial';
      }

      // Determine status for display
      let displayStatus = 'Pending';
      if (sub.paymentStatus === 'paid') {
        displayStatus = 'Paid';
      } else if (sub.status === 'past_due') {
        displayStatus = 'Overdue';
      } else if (sub.status === 'pending' && sub.paymentStatus === 'pending') {
        displayStatus = 'Trial';
      } else if (sub.paymentStatus === 'failed') {
        displayStatus = 'Failed';
      }

      // Determine payment method
      let paymentMethod = 'N/A';
      if (sub.stripePaymentIntentId || sub.stripeSubscriptionId) {
        paymentMethod = 'Credit Card';
      } else if (sub.paymentStatus === 'paid' && !sub.stripePaymentIntentId) {
        paymentMethod = 'Bank Transfer';
      }

      return {
        id: sub._id.toString(),
        customer: company.companyName || admin.name || 'N/A',
        customerId: admin.internalId || admin._id?.toString() || 'N/A',
        adminName: admin.name || 'N/A',
        companyName: company.companyName || null,
        plan: plan.planName || 'No Plan',
        amount: sub.amount || 0,
        recurring: sub.planType === 'monthly',
        paymentDate: moment(paymentDate).format('YYYY-MM-DD'),
        nextPayment: nextPayment ? (typeof nextPayment === 'string' ? nextPayment : moment(nextPayment).format('YYYY-MM-DD')) : 'N/A',
        status: displayStatus,
        method: paymentMethod,
        subscriptionStatus: sub.status,
        paymentStatus: sub.paymentStatus,
        planType: sub.planType
      };
    });

    // Calculate revenue metrics
    const allSubscriptions = await Subscription.find({})
      .populate({
        path: 'admin',
        select: 'name company',
        populate: {
          path: 'company',
          select: 'companyName'
        }
      })
      .populate('plan', 'planName planType')
      .lean();

    // Total revenue (paid subscriptions)
    const totalRevenue = allSubscriptions
      .filter(sub => sub.paymentStatus === 'paid')
      .reduce((sum, sub) => sum + (sub.amount || 0), 0);

    // Monthly recurring revenue (active monthly subscriptions that are paid)
    const monthlyRecurring = allSubscriptions
      .filter(sub => 
        sub.planType === 'monthly' && 
        sub.status === 'active' && 
        sub.paymentStatus === 'paid'
      )
      .reduce((sum, sub) => sum + (sub.amount || 0), 0);

    // Overdue amount (past_due subscriptions)
    const overdueAmount = allSubscriptions
      .filter(sub => sub.status === 'past_due')
      .reduce((sum, sub) => sum + (sub.amount || 0), 0);

    // Get all trial admins (for metrics calculation)
    const allTrialAdmins = await User.find({
      role: 'admin',
      trialStartDate: { $exists: true, $ne: null },
      trialEndDate: { $exists: true, $ne: null }
    })
      .select('trialStartDate trialEndDate')
      .lean();
    
    // Filter to only active trials
    const activeTrialAdmins = allTrialAdmins.filter(admin => {
      if (!admin.trialStartDate || !admin.trialEndDate) return false;
      const trialEndDate = new Date(admin.trialEndDate);
      const trialEndDateUTC = new Date(Date.UTC(trialEndDate.getUTCFullYear(), trialEndDate.getUTCMonth(), trialEndDate.getUTCDate()));
      return nowUTC <= trialEndDateUTC;
    });

    // Trial potential (pending subscriptions + trial admins)
    const trialRevenuePotential = allSubscriptions
      .filter(sub => sub.status === 'pending' && sub.paymentStatus === 'pending')
      .reduce((sum, sub) => sum + (sub.amount || 0), 0) + activeTrialAdmins.length * 0; // Trial admins have $0 potential for now

    // Calculate growth (compare with previous month)
    const startOfMonth = moment(now).startOf('month').toDate();
    const startOfLastMonth = moment(now).subtract(1, 'month').startOf('month').toDate();
    const endOfLastMonth = moment(now).subtract(1, 'month').endOf('month').toDate();

    const currentMonthRevenue = allSubscriptions
      .filter(sub => {
        const paymentDate = sub.lastPaymentDate || sub.createdAt;
        return sub.paymentStatus === 'paid' && 
               paymentDate >= startOfMonth;
      })
      .reduce((sum, sub) => sum + (sub.amount || 0), 0);

    const lastMonthRevenue = allSubscriptions
      .filter(sub => {
        const paymentDate = sub.lastPaymentDate || sub.createdAt;
        return sub.paymentStatus === 'paid' && 
               paymentDate >= startOfLastMonth &&
               paymentDate <= endOfLastMonth;
      })
      .reduce((sum, sub) => sum + (sub.amount || 0), 0);

    const revenueGrowth = lastMonthRevenue > 0
      ? (((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
      : currentMonthRevenue > 0 ? 100 : 0;

    const monthlyRecurringGrowth = '8.2'; // Can be calculated similarly if needed

    // Response
    const response = {
      success: true,
      message: "Revenue data fetched successfully",
      data: {
        metrics: {
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          monthlyRecurring: parseFloat(monthlyRecurring.toFixed(2)),
          overdueAmount: parseFloat(overdueAmount.toFixed(2)),
          trialRevenuePotential: parseFloat(trialRevenuePotential.toFixed(2)),
          revenueGrowth: parseFloat(revenueGrowth),
          monthlyRecurringGrowth: parseFloat(monthlyRecurringGrowth)
        },
        revenueEntries,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCount / limitNum)
        }
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Super Admin Revenue Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching revenue data",
      error: error.message
    });
  }
};

export const getSuperAdminInvoices = async (req, res) => {
  try {
    const invoices = await SuperAdminInvoice.find({}).populate('admin').populate('company').populate('subscriptionPlan');
    res.json({
      success: true,
      message: "Invoices fetched successfully",
      data: invoices
    });
  } catch (error) {
    console.error("Super Admin Invoices Error:", error);
    res.status(500).json({ success: false, message: "Error fetching invoices", error: error.message });
  }
};