import { Subscription } from "../models/subscriptionModel.js";
import { User } from "../models/driver/userModel.js";
import SuperAdminInvoice from "../models/superAdminInvoice.js";

/**
 * One place for the Super Admin money rules, shared by the Dashboard and the
 * Revenue page so the two can never disagree.
 *
 * Money received ("payments"):
 *   - every invoice that is paid, not cancelled, and whose customer account still exists
 *   - plus every paid subscription that has NO invoice at all (older records made
 *     before invoices existed), again only if the customer account still exists
 *
 * So a cancelled invoice, or a deleted customer, no longer counts as revenue.
 */

const RECURRING_CYCLES = ["monthly", "6-months", "yearly"];

export const cycleOf = (sub) => {
  if (!sub) return "monthly";
  if (sub.planType === "lifetime") return sub.subscriptionType === "one-time" ? "lifetime" : "installment";
  if (sub.subscriptionType === "1-year") return "yearly";
  if (sub.subscriptionType === "6-months") return "6-months";
  return "monthly";
};

export const CYCLE_LABELS = {
  monthly: "Monthly",
  "6-months": "6 Months",
  yearly: "Yearly",
  lifetime: "Lifetime",
  installment: "Installment",
};

export const CYCLE_SUFFIX = {
  monthly: "/mo",
  "6-months": "/6 mo",
  yearly: "/yr",
  lifetime: " one-time",
  installment: " installment",
};

export const isRecurringCycle = (cycle) => RECURRING_CYCLES.includes(cycle);

/** What one subscription is worth per month (0 for one-time payments). */
export const monthlyEquivalent = (sub) => {
  const amount = Number(sub?.amount) || 0;
  switch (cycleOf(sub)) {
    case "monthly": return amount;
    case "6-months": return amount / 6;
    case "yearly": return amount / 12;
    default: return 0;
  }
};

const addCycle = (date, cycle) => {
  const d = new Date(date);
  if (cycle === "monthly") d.setMonth(d.getMonth() + 1);
  else if (cycle === "6-months") d.setMonth(d.getMonth() + 6);
  else if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
  else return null;
  return d;
};

const startOfTodayUTC = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/**
 * Loads everything once. `populateAdmin` adds the admin's name/company for display.
 */
export const loadRevenueContext = async () => {
  const [subscriptions, invoices, admins] = await Promise.all([
    Subscription.find({})
      .populate({
        path: "admin",
        select: "name email internalId company",
        populate: { path: "company", select: "companyName" },
      })
      .populate("plan", "planName planType")
      .sort({ createdAt: -1 })
      .lean(),
    SuperAdminInvoice.find({})
      .select("subscription admin paymentStatus invoiceStatus totalAmount amount paidAt createdAt")
      .lean(),
    User.find({ role: "admin" }).select("_id").lean(),
  ]);

  const adminIds = new Set(admins.map((a) => a._id.toString()));
  const invoicesBySub = new Map();
  for (const inv of invoices) {
    if (!inv.subscription) continue;
    const key = inv.subscription.toString();
    if (!invoicesBySub.has(key)) invoicesBySub.set(key, []);
    invoicesBySub.get(key).push(inv);
  }

  return { subscriptions, invoices, adminIds, invoicesBySub };
};

const adminIdOf = (ref) => (ref && ref._id ? ref._id.toString() : ref ? ref.toString() : null);

export const adminExists = (ctx, ref) => {
  const id = adminIdOf(ref);
  return !!id && ctx.adminIds.has(id);
};

/**
 * Display status for one subscription: Paid, Overdue, Trial, Pending, Failed or Cancelled,
 * with a short reason for Cancelled / Overdue.
 */
export const statusOf = (sub, ctx, now = new Date()) => {
  if (!adminExists(ctx, sub.admin)) return { status: "Cancelled", reason: "Customer account deleted" };

  const linked = ctx.invoicesBySub.get(sub._id.toString()) || [];
  if (linked.length && linked.every((inv) => inv.invoiceStatus === "cancelled")) {
    return { status: "Cancelled", reason: "Invoice cancelled" };
  }
  if (sub.status === "cancelled") return { status: "Cancelled", reason: "Subscription cancelled or replaced by a newer plan" };
  if (sub.status === "past_due") return { status: "Overdue", reason: "Payment past due" };

  const cycle = cycleOf(sub);
  if (isRecurringCycle(cycle) && sub.nextBillingDate && (sub.status === "active" || sub.paymentStatus === "paid")) {
    if (new Date(sub.nextBillingDate) < startOfTodayUTC(now)) {
      return { status: "Overdue", reason: "Renewal date has passed" };
    }
  }

  if (sub.paymentStatus === "paid") return { status: "Paid" };
  if (sub.paymentStatus === "failed") return { status: "Failed" };
  if (sub.status === "pending" && sub.paymentStatus === "pending") return { status: "Trial" };
  return { status: "Pending" };
};

/** Next renewal date for a recurring subscription, or null. */
export const nextPaymentOf = (sub) => {
  const cycle = cycleOf(sub);
  if (!isRecurringCycle(cycle)) return null;
  if (sub.nextBillingDate) return new Date(sub.nextBillingDate);
  const base = sub.lastPaymentDate || sub.startDate || sub.createdAt;
  return base ? addCycle(base, cycle) : null;
};

/** Every payment actually received: [{ amount, date }]. */
export const paymentsOf = (ctx) => {
  const out = [];
  for (const inv of ctx.invoices) {
    if (inv.paymentStatus !== "paid" || inv.invoiceStatus === "cancelled") continue;
    if (!adminExists(ctx, inv.admin)) continue;
    const amount = Number(inv.totalAmount ?? inv.amount) || 0;
    out.push({ amount, date: new Date(inv.paidAt || inv.createdAt) });
  }
  for (const sub of ctx.subscriptions) {
    if (sub.paymentStatus !== "paid") continue;
    if (ctx.invoicesBySub.has(sub._id.toString())) continue; // already counted through its invoices
    if (!adminExists(ctx, sub.admin)) continue;
    out.push({ amount: Number(sub.amount) || 0, date: new Date(sub.lastPaymentDate || sub.createdAt) });
  }
  return out;
};

export const sumPayments = (payments, from = null, to = null) =>
  payments
    .filter((p) => (!from || p.date >= from) && (!to || p.date < to))
    .reduce((sum, p) => sum + p.amount, 0);

/** % change, or null when there is nothing to compare against (avoids a fake "+100%"). */
export const percentChange = (current, previous) => {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
