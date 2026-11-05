import SuperAdminInvoice from "../models/superAdminInvoice.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { User } from "../models/driver/userModel.js";
import { Plan } from "../models/planModel.js";
import { Subscription } from "../models/subscriptionModel.js";
import { billingCycleFor, generateInvoiceNumber } from "../utils/planAssignment.js";

export const createSubscriptionInvoice = async ({
  adminId,
  subscription,
  stripeInvoice,
  isFirstPayment = false,
  type
}) => {
  const admin = await User.findOne({ _id: adminId });
  if (!admin) {
    throw new Error("Admin not found");
  }

  const companyId = getUserCompanyId(admin);

  // Calculate subscriptionEndDate if not set
  let subscriptionEndDate = subscription.endDate;
  if (!subscriptionEndDate && subscription.startDate) {
    const startDate = new Date(subscription.startDate);

    switch (subscription.subscriptionType) {
      case 'one-time':
        // Lifetime subscription - set to 100 years from start date
        subscriptionEndDate = new Date(startDate);
        subscriptionEndDate.setFullYear(startDate.getFullYear() + 100);
        break;
      case '3-months':
        subscriptionEndDate = new Date(startDate);
        subscriptionEndDate.setMonth(startDate.getMonth() + 3);
        break;
      case '6-months':
        subscriptionEndDate = new Date(startDate);
        subscriptionEndDate.setMonth(startDate.getMonth() + 6);
        break;
      case 'full-app':
      case 'without-hr':
        // Monthly recurring - use nextBillingDate if available, otherwise add 1 month
        subscriptionEndDate = subscription.nextBillingDate
          ? new Date(subscription.nextBillingDate)
          : (() => {
            const end = new Date(startDate);
            end.setMonth(startDate.getMonth() + 1);
            return end;
          })();
        break;
      case '1-month':
        subscriptionEndDate = new Date(startDate);
        subscriptionEndDate.setMonth(startDate.getMonth() + 1);
        break;
      case '1-year':
        subscriptionEndDate = new Date(startDate);
        subscriptionEndDate.setMonth(startDate.getMonth() + 13);
        break;
      default:
        // Default: 1 month from start date
        subscriptionEndDate = new Date(startDate);
        subscriptionEndDate.setMonth(startDate.getMonth() + 1);
    }
  }

  // Ensure we have a valid end date
  if (!subscriptionEndDate) {
    // Fallback: 1 month from now
    subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
  }

  // Ensure startDate is set
  const subscriptionStartDate = subscription.startDate || new Date();

  return await SuperAdminInvoice.create({
    company: companyId || undefined, // Use undefined instead of null for optional field
    admin: admin._id,

    subscription: subscription._id, // Link invoice to specific subscription
    subscriptionPlan: subscription.plan,
    planName: subscription.planSnapshot?.planName || subscription.plan?.planName || 'Unknown Plan',

    // Map subscriptionType to billingCycle enum (monthly/yearly)
    // billingCycle:
    //  (subscription.subscriptionType === 'full-app' || subscription.subscriptionType === 'without-hr' || subscription.subscriptionType === '1-month')   ? 'monthly' 
    //   : (subscription.subscriptionType === 'one-time' || subscription.subscriptionType === '3-months' || subscription.subscriptionType === '6-months')
    //   ? 'monthly' // Treat installments as monthly for billing cycle
    //   : (subscription.subscriptionType === '1-year') ? 'yearly' : (type === "extra-truck") ? 'one-time'
    //   : 'monthly', // Default to monthly

    billingCycle:
      type === "extra-truck"
        ? "one-time"
        : billingCycleFor(subscription.planType, subscription.subscriptionType),
    invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Add random suffix to ensure uniqueness

    currency: stripeInvoice.currency?.toUpperCase() || "CAD",

    amount: (stripeInvoice.subtotal || 0) / 100,
    taxAmount: (stripeInvoice.tax || 0) / 100,
    discountAmount: (stripeInvoice.total_discount_amounts?.[0]?.amount || 0) / 100,

    totalAmount: (stripeInvoice.total || stripeInvoice.subtotal || 0) / 100,

    paymentStatus: "paid",
    paidAt: new Date(),
    source: "stripe",
    paymentMethod: stripeInvoice.payment_settings?.payment_method_types?.[0] || 'card',

    transactionId: stripeInvoice.payment_intent || null,

    subscriptionStartDate: subscriptionStartDate,
    subscriptionEndDate: subscriptionEndDate,

    invoiceStatus: "generated"
  });
};

const INVOICE_POPULATE = [
  { path: 'admin', select: 'name email internalId phone company' },
  { path: 'company' },
  { path: 'subscriptionPlan' }
];

const MANUAL_BILLING_CYCLES = ["monthly", "6-months", "yearly", "one-time", "installment"];
const MANUAL_PAYMENT_STATUSES = ["pending", "paid"];

const toMoney = (v) => Math.round(Number(v) * 100) / 100;

/**
 * POST /superadmin/invoices
 * Super Admin creates an invoice by hand (offline payment, custom charge, renewal).
 * Body: { adminId, planId?, planName?, billingCycle, amount, taxAmount?, discountAmount?,
 *         paymentStatus?, paymentMethod?, subscriptionStartDate, subscriptionEndDate?, notes? }
 */
export const createManualInvoice = async (req, res) => {
  try {
    const {
      adminId,
      planId,
      planName,
      billingCycle = "monthly",
      amount,
      taxAmount = 0,
      discountAmount = 0,
      currency = "CAD",
      paymentStatus = "pending",
      paymentMethod,
      transactionId,
      subscriptionStartDate,
      subscriptionEndDate,
      notes
    } = req.body || {};

    if (!adminId) return res.status(400).json({ success: false, message: "Customer is required" });
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== "admin") {
      return res.status(404).json({ success: false, message: "Customer account not found" });
    }

    let plan = null;
    if (planId) {
      plan = await Plan.findById(planId);
      if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });
    }
    const finalPlanName = (plan?.planName || planName || "").trim();
    if (!finalPlanName) {
      return res.status(400).json({ success: false, message: "Choose a plan or enter a description" });
    }

    if (!MANUAL_BILLING_CYCLES.includes(billingCycle)) {
      return res.status(400).json({ success: false, message: "Invalid billing cycle" });
    }
    if (!MANUAL_PAYMENT_STATUSES.includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: "paymentStatus must be 'pending' or 'paid'" });
    }

    const isNonNegative = (v) => v !== null && v !== "" && !isNaN(Number(v)) && Number(v) >= 0;
    if (amount === undefined || !isNonNegative(amount)) {
      return res.status(400).json({ success: false, message: "Amount must be a non-negative number" });
    }
    if (!isNonNegative(taxAmount || 0) || !isNonNegative(discountAmount || 0)) {
      return res.status(400).json({ success: false, message: "Tax and discount must be non-negative numbers" });
    }

    const subtotal = toMoney(amount);
    const tax = toMoney(taxAmount || 0);
    const discount = toMoney(discountAmount || 0);
    const total = toMoney(subtotal + tax - discount);
    if (total < 0) return res.status(400).json({ success: false, message: "Discount can't be more than amount + tax" });

    const start = subscriptionStartDate ? new Date(subscriptionStartDate) : new Date();
    if (isNaN(start.getTime())) return res.status(400).json({ success: false, message: "Invalid start date" });
    let end;
    if (subscriptionEndDate) {
      end = new Date(subscriptionEndDate);
      if (isNaN(end.getTime())) return res.status(400).json({ success: false, message: "Invalid end date" });
      if (end < start) return res.status(400).json({ success: false, message: "End date must be after start date" });
    }

    // Link to the customer's current subscription when there is one
    const currentSub = await Subscription.findOne({ admin: admin._id, status: "active" }).sort({ createdAt: -1 }).select("_id").lean();

    const invoice = await SuperAdminInvoice.create({
      company: getUserCompanyId(admin) || undefined,
      admin: admin._id,
      subscription: currentSub?._id,
      subscriptionPlan: plan?._id,
      planName: finalPlanName,
      billingCycle,
      invoiceNumber: generateInvoiceNumber(),
      currency: String(currency || "CAD").toUpperCase(),
      amount: subtotal,
      taxAmount: tax,
      discountAmount: discount,
      totalAmount: total,
      paymentStatus,
      paymentMethod: paymentMethod || undefined,
      transactionId: transactionId || undefined,
      paidAt: paymentStatus === "paid" ? new Date() : undefined,
      subscriptionStartDate: start,
      subscriptionEndDate: end,
      invoiceStatus: "generated",
      source: "manual",
      createdBy: req.user?._id,
      notes: notes ? String(notes).slice(0, 2000) : undefined
    });

    await invoice.populate(INVOICE_POPULATE);
    res.status(201).json({ success: true, message: "Invoice created", data: invoice });
  } catch (error) {
    console.error("Create manual invoice error:", error);
    res.status(500).json({ success: false, message: "Error creating invoice", error: error.message });
  }
};

/**
 * PATCH /superadmin/invoices/:id
 * Mark an invoice paid / pending / refunded, or cancel it.
 * Body: { paymentStatus?, invoiceStatus?, paymentMethod?, transactionId?, notes? }
 */
export const updateInvoiceStatus = async (req, res) => {
  try {
    const { paymentStatus, invoiceStatus, paymentMethod, transactionId, notes } = req.body || {};
    const update = {};

    if (paymentStatus !== undefined) {
      if (!["pending", "paid", "failed", "refunded"].includes(paymentStatus)) {
        return res.status(400).json({ success: false, message: "Invalid payment status" });
      }
      update.paymentStatus = paymentStatus;
      if (paymentStatus === "paid") update.paidAt = new Date();
    }
    if (invoiceStatus !== undefined) {
      if (!["generated", "cancelled"].includes(invoiceStatus)) {
        return res.status(400).json({ success: false, message: "Invalid invoice status" });
      }
      update.invoiceStatus = invoiceStatus;
    }
    if (paymentMethod !== undefined) update.paymentMethod = paymentMethod;
    if (transactionId !== undefined) update.transactionId = transactionId;
    if (notes !== undefined) update.notes = String(notes).slice(0, 2000);

    if (!Object.keys(update).length) {
      return res.status(400).json({ success: false, message: "Nothing to update" });
    }

    const invoice = await SuperAdminInvoice.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
      .populate(INVOICE_POPULATE);
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    // Keep the subscription's payment state in step when the invoice is for it
    if (paymentStatus && invoice.subscription) {
      const subUpdate = { paymentStatus: paymentStatus === "refunded" ? "refunded" : paymentStatus };
      if (paymentStatus === "paid") subUpdate.lastPaymentDate = new Date();
      await Subscription.updateOne({ _id: invoice.subscription }, { $set: subUpdate });
    }

    res.json({ success: true, message: "Invoice updated", data: invoice });
  } catch (error) {
    console.error("Update invoice error:", error);
    res.status(500).json({ success: false, message: "Error updating invoice", error: error.message });
  }
};
