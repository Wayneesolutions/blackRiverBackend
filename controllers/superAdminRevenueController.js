import { Subscription } from "../models/subscriptionModel.js";
import { User } from "../models/driver/userModel.js";
import { Plan } from "../models/planModel.js";
import moment from "moment";
import mongoose from "mongoose";
import  SuperAdminInvoice  from "../models/superAdminInvoice.js";
import {
  loadRevenueContext, adminExists, statusOf, cycleOf, isRecurringCycle, CYCLE_LABELS,
  nextPaymentOf, paymentsOf, sumPayments, monthlyEquivalent, percentChange, round2,
} from "../utils/revenueLedger.js";

/**
 * Get Super Admin Revenue Data
 * Returns comprehensive revenue information including:
 * - Revenue metrics (total, monthly recurring, overdue, trial potential)
 * - Revenue entries with customer details
 * - Filtering by status
 */
export const getSuperAdminRevenue = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.max(parseInt(limit) || 50, 1);
    const skip = (pageNum - 1) * limitNum;

    const now = new Date();
    const nowUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const ctx = await loadRevenueContext();

    // ---- Subscription rows -------------------------------------------------
    const subscriptionRows = ctx.subscriptions.map((sub) => {
      const admin = sub.admin || {};
      const plan = sub.plan || {};
      const company = admin.company || {};
      const deleted = !adminExists(ctx, sub.admin);
      const { status: displayStatus, reason } = statusOf(sub, ctx, now);
      const cycle = cycleOf(sub);
      const paymentDate = sub.lastPaymentDate || sub.createdAt;
      const next = nextPaymentOf(sub);

      let nextPayment = "N/A";
      if (displayStatus === "Cancelled") nextPayment = "N/A";
      else if (sub.status === "pending" && sub.paymentStatus === "pending") nextPayment = "Trial";
      else if (next) nextPayment = moment(next).format("YYYY-MM-DD");

      let paymentMethod = "N/A";
      if (sub.stripePaymentIntentId || sub.stripeSubscriptionId) paymentMethod = "Credit Card";
      else if (sub.paymentStatus === "paid") paymentMethod = "Bank Transfer";

      const customer = deleted
        ? "Deleted account"
        : company.companyName || admin.name || admin.email || "Unknown customer";

      return {
        id: sub._id.toString(),
        customer,
        customerId: deleted ? "N/A" : admin.internalId || admin._id?.toString() || "N/A",
        adminName: deleted ? "Deleted account" : admin.name || admin.email || "Unknown",
        companyName: deleted ? null : company.companyName || null,
        accountDeleted: deleted,
        plan: plan.planName || sub.planSnapshot?.planName || "No Plan",
        amount: sub.amount || 0,
        recurring: isRecurringCycle(cycle),
        billingCycle: cycle,
        billingCycleLabel: CYCLE_LABELS[cycle],
        paymentDate: moment(paymentDate).format("YYYY-MM-DD"),
        nextPayment,
        status: displayStatus,
        statusReason: reason || null,
        method: paymentMethod,
        subscriptionStatus: sub.status,
        paymentStatus: sub.paymentStatus,
        planType: sub.planType,
        subscriptionType: sub.subscriptionType,
        createdAt: sub.createdAt,
      };
    });

    // ---- Trial admins (no subscription yet) --------------------------------
    const adminsWithSub = new Set(
      ctx.subscriptions
        .filter((s) => s.status === "active" || s.paymentStatus === "paid" || s.status === "pending")
        .map((s) => s.admin?._id?.toString())
        .filter(Boolean)
    );
    const trialAdmins = (await User.find({
      role: "admin",
      trialStartDate: { $exists: true, $ne: null },
      trialEndDate: { $exists: true, $ne: null },
    })
      .populate({ path: "company", select: "companyName" })
      .select("name email internalId company trialStartDate trialEndDate createdAt")
      .lean()).filter((admin) => {
      const end = new Date(admin.trialEndDate);
      const endUTC = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
      return nowUTC <= endUTC;
    });

    const trialRows = trialAdmins
      .filter((admin) => !adminsWithSub.has(admin._id.toString()))
      .map((admin) => {
        const company = admin.company || {};
        const end = new Date(admin.trialEndDate);
        const endUTC = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
        const daysRemaining = Math.ceil((endUTC - nowUTC) / (1000 * 60 * 60 * 24));
        return {
          id: admin._id.toString(),
          customer: company.companyName || admin.name || admin.email || "Unknown customer",
          customerId: admin.internalId || admin._id.toString(),
          adminName: admin.name || admin.email || "Unknown",
          companyName: company.companyName || null,
          accountDeleted: false,
          plan: "Trial Period",
          amount: 0,
          recurring: false,
          billingCycle: null,
          billingCycleLabel: "Trial",
          paymentDate: moment(admin.trialStartDate).format("YYYY-MM-DD"),
          nextPayment: `Trial (${daysRemaining} days left)`,
          status: "Trial",
          statusReason: null,
          method: "N/A",
          subscriptionStatus: "pending",
          paymentStatus: "pending",
          planType: null,
          isTrialAdmin: true,
          trialEndDate: moment(admin.trialEndDate).format("YYYY-MM-DD"),
          createdAt: admin.createdAt || admin.trialStartDate,
        };
      });

    let rows = [...subscriptionRows, ...trialRows];
    if (status && status !== "all") {
      const wanted = String(status).toLowerCase();
      rows = rows.filter((r) => r.status.toLowerCase() === wanted);
    }
    rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const totalCount = rows.length;
    const revenueEntries = rows.slice(skip, skip + limitNum).map(({ createdAt, ...rest }) => rest);

    // ---- Metrics -----------------------------------------------------------
    const payments = paymentsOf(ctx);
    const totalRevenue = sumPayments(payments);

    let monthlyRecurring = 0;
    let overdueAmount = 0;
    let trialRevenuePotential = 0;
    for (const sub of ctx.subscriptions) {
      const { status: st } = statusOf(sub, ctx, now);
      if (st === "Paid") monthlyRecurring += monthlyEquivalent(sub);
      else if (st === "Overdue") overdueAmount += Number(sub.amount) || 0;
      else if (st === "Trial") trialRevenuePotential += Number(sub.amount) || 0;
    }

    const startOfMonth = moment(now).startOf("month").toDate();
    const startOfLastMonth = moment(now).subtract(1, "month").startOf("month").toDate();
    const thisMonth = sumPayments(payments, startOfMonth);
    const lastMonth = sumPayments(payments, startOfLastMonth, startOfMonth);

    res.status(200).json({
      success: true,
      message: "Revenue data fetched successfully",
      data: {
        metrics: {
          totalRevenue: round2(totalRevenue),
          monthlyRecurring: round2(monthlyRecurring),
          overdueAmount: round2(overdueAmount),
          trialRevenuePotential: round2(trialRevenuePotential),
          revenueGrowth: percentChange(thisMonth, lastMonth), // null = no previous month to compare
          monthlyRecurringGrowth: null, // was a hard-coded 8.2; there is no MRR history to compare yet
          revenueThisMonth: round2(thisMonth),
        },
        revenueEntries,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCount / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("Super Admin Revenue Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching revenue data",
      error: error.message,
    });
  }
};

export const getSuperAdminInvoices = async (req, res) => {
  try {
    const invoices = await SuperAdminInvoice.find({}).sort({ createdAt: -1 }).populate('admin').populate('company').populate('subscriptionPlan');
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
