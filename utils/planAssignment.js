import { Subscription } from "../models/subscriptionModel.js";
import SuperAdminInvoice from "../models/superAdminInvoice.js";
import { getUserCompanyId } from "./companyFilter.js";

/**
 * Shared logic for a Super Admin giving a customer (admin) a plan.
 * Used by:
 *   - POST /superadmin/admin/:id/assign-plan   (Assign Plan on an existing account)
 *   - POST /superadmin/admin                    (Add Admin with a plan chosen up front)
 *
 * Every assignment also creates a subscription invoice, so the Invoices page
 * always has a record of what the customer owes / paid.
 */

export class PlanAssignmentError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const TRUCK_SUBSCRIPTION_TYPES = ['1-month', '6-months', '1-year'];
export const PAYMENT_STATUSES = ['paid', 'pending'];

// Same rule the self-service checkout uses (subscriptionController.calculateTruckPricing),
// but tolerant of unsorted tiers.
export const priceForTrucks = (truckCount, truckPricing) => {
  const tiers = [...(truckPricing?.tiers || [])].sort((a, b) => a.minTrucks - b.minTrucks);
  if (!tiers.length) return 0;
  const tier = tiers.find(t => truckCount >= t.minTrucks && truckCount <= t.maxTrucks);
  if (tier) return tier.monthlyPrice;
  const first = tiers[0];
  if (truckCount < first.minTrucks) return first.monthlyPrice;
  const last = tiers[tiers.length - 1];
  return last.monthlyPrice + (truckCount - last.maxTrucks) * (truckPricing.extraTruckPrice || 0);
};

const isBlank = (v) => v === undefined || v === null || v === '';

/**
 * Validates the request against the plan and works out what the customer pays.
 * Throws PlanAssignmentError on bad input. Does not touch the database.
 */
export const resolvePlanPricing = (plan, { subscriptionType, truckCount, customAmount } = {}) => {
  if (!plan) throw new PlanAssignmentError("Plan not found", 404);
  if (!subscriptionType) throw new PlanAssignmentError("subscriptionType is required");

  if (!isBlank(customAmount) && (isNaN(Number(customAmount)) || Number(customAmount) < 0)) {
    throw new PlanAssignmentError("customAmount must be a non-negative number");
  }

  let amount = 0;
  let currency = 'CAD';
  let maxTrucks = 0;

  if (plan.planType === 'lifetime') {
    if (subscriptionType === 'one-time') {
      amount = plan.lifetime?.oneTime?.price || 0;
      currency = plan.lifetime?.oneTime?.currency || 'CAD';
    } else if (subscriptionType === '3-months') {
      amount = plan.lifetime?.installments?.threeMonths?.price || 0;
      currency = plan.lifetime?.installments?.threeMonths?.currency || 'CAD';
    } else if (subscriptionType === '6-months') {
      amount = plan.lifetime?.installments?.sixMonths?.price || 0;
      currency = plan.lifetime?.installments?.sixMonths?.currency || 'CAD';
    } else {
      throw new PlanAssignmentError("Invalid subscriptionType for a lifetime plan");
    }
  } else if (plan.planType === 'monthly') {
    if (subscriptionType === 'full-app') {
      amount = plan.monthly?.fullApp?.price || 0;
      currency = plan.monthly?.fullApp?.currency || 'CAD';
    } else if (subscriptionType === 'without-hr') {
      amount = plan.monthly?.withoutHR?.price || 0;
      currency = plan.monthly?.withoutHR?.currency || 'CAD';
    } else if (TRUCK_SUBSCRIPTION_TYPES.includes(subscriptionType)) {
      if (!plan.monthly?.truckPricing?.tiers?.length) {
        throw new PlanAssignmentError("Truck pricing not configured for this plan");
      }
      const trucks = Number(truckCount);
      if (!Number.isInteger(trucks) || trucks < 1) {
        throw new PlanAssignmentError("truckCount is required for this subscription type");
      }
      const monthlyPrice = priceForTrucks(trucks, plan.monthly.truckPricing);
      currency = plan.monthly.truckPricing.tiers[0]?.currency || 'CAD';
      maxTrucks = trucks;
      if (subscriptionType === '1-month') amount = monthlyPrice;
      else if (subscriptionType === '6-months') amount = monthlyPrice * 6;
      else amount = monthlyPrice * 12;
    } else {
      throw new PlanAssignmentError("Invalid subscriptionType for a monthly plan");
    }
  } else {
    throw new PlanAssignmentError("Plan has an unknown planType");
  }

  if (!isBlank(customAmount)) amount = Number(customAmount);

  return { amount: Math.round(amount * 100) / 100, currency, maxTrucks };
};

/** Subscription end / next-billing dates, same rules as before. */
export const computeSubscriptionDates = (plan, subscriptionType, start = new Date()) => {
  let endDate = null;
  let nextBillingDate = null;

  if (subscriptionType === '1-month') {
    endDate = new Date(start);
    endDate.setMonth(endDate.getMonth() + 1);
    nextBillingDate = endDate;
  } else if (subscriptionType === '6-months' && plan.planType === 'monthly') {
    endDate = new Date(start);
    endDate.setMonth(endDate.getMonth() + 6);
    endDate.setDate(endDate.getDate() + (plan.monthly?.truckPricing?.sixMonthBonusDays ?? 15));
    nextBillingDate = endDate;
  } else if (subscriptionType === '1-year') {
    endDate = new Date(start);
    endDate.setMonth(endDate.getMonth() + 12 + (plan.monthly?.truckPricing?.annualFreeMonths ?? 1));
    nextBillingDate = new Date(start);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 12);
  }
  // lifetime ('one-time', installments), 'full-app', 'without-hr' → no fixed end date
  return { endDate, nextBillingDate };
};

/** What the Invoices page shows under the invoice number. */
export const billingCycleFor = (planType, subscriptionType) => {
  if (planType === 'lifetime') return subscriptionType === 'one-time' ? 'one-time' : 'installment';
  if (subscriptionType === '1-year') return 'yearly';
  if (subscriptionType === '6-months') return '6-months';
  return 'monthly';
};

export const generateInvoiceNumber = (date = new Date()) => {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INV-${ymd}-${rand}`;
};

/**
 * Creates the invoice that belongs to a manually assigned subscription.
 */
export const createInvoiceForSubscription = async ({ admin, plan, subscription, paymentStatus = 'paid', paymentMethod, notes, createdBy }) => {
  const start = subscription.startDate || new Date();
  return SuperAdminInvoice.create({
    company: getUserCompanyId(admin) || undefined,
    admin: admin._id,
    subscription: subscription._id,
    subscriptionPlan: plan._id,
    planName: plan.planName,
    billingCycle: billingCycleFor(plan.planType, subscription.subscriptionType),
    invoiceNumber: generateInvoiceNumber(),
    currency: subscription.currency || 'CAD',
    amount: subscription.amount,
    taxAmount: 0,
    discountAmount: 0,
    totalAmount: subscription.amount,
    paymentStatus,
    paymentMethod: paymentMethod || (paymentStatus === 'paid' ? 'manual' : undefined),
    paidAt: paymentStatus === 'paid' ? new Date() : undefined,
    subscriptionStartDate: start,
    subscriptionEndDate: subscription.endDate || undefined,
    invoiceStatus: 'generated',
    source: 'manual',
    createdBy,
    notes
  });
};

/**
 * Gives `admin` the `plan`. Cancels any current subscription, creates the new
 * one and its invoice. `pricing` may be passed in when it was already resolved
 * (e.g. validated before creating the admin account).
 */
export const assignPlan = async ({
  admin,
  plan,
  subscriptionType,
  truckCount,
  customAmount,
  allowedRoles,
  blockedRoles,
  paymentStatus = 'paid',
  paymentMethod,
  notes,
  createdBy,
  pricing
}) => {
  if (!admin || admin.role !== 'admin') throw new PlanAssignmentError("Client account not found", 404);
  if (!PAYMENT_STATUSES.includes(paymentStatus)) {
    throw new PlanAssignmentError("paymentStatus must be 'paid' or 'pending'");
  }

  const { amount, currency, maxTrucks } = pricing || resolvePlanPricing(plan, { subscriptionType, truckCount, customAmount });

  // Supersede any existing active/pending-paid subscription for this client
  await Subscription.updateMany(
    {
      admin: admin._id,
      $or: [{ status: 'active' }, { status: 'pending', paymentStatus: 'paid' }]
    },
    { $set: { status: 'cancelled', cancelledAt: new Date() } }
  );

  const now = new Date();
  const { endDate, nextBillingDate } = computeSubscriptionDates(plan, subscriptionType, now);

  const subscription = new Subscription({
    admin: admin._id,
    plan: plan._id,
    planType: plan.planType,
    subscriptionType,
    amount,
    currency,
    status: 'active',
    paymentStatus,
    lastPaymentDate: paymentStatus === 'paid' ? now : null,
    startDate: now,
    endDate,
    nextBillingDate,
    maxTrucks,
    planSnapshot: {
      planName: plan.planName,
      allowedRoles: allowedRoles !== undefined
        ? allowedRoles
        : (plan.allowedRoles ? [...plan.allowedRoles] : undefined),
      blockedRoles: blockedRoles !== undefined
        ? blockedRoles
        : (plan.blockedRoles ? [...plan.blockedRoles] : []),
      snapshotDate: now
    }
  });
  await subscription.save();

  // The plan is live even if the invoice can't be written; the Super Admin can
  // still create the invoice by hand from the Invoices page.
  let invoice = null;
  try {
    invoice = await createInvoiceForSubscription({ admin, plan, subscription, paymentStatus, paymentMethod, notes, createdBy });
  } catch (err) {
    console.error('[PLAN] Subscription saved but invoice creation failed:', err.message);
  }

  return { subscription, invoice };
};
