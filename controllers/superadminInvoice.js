import SuperAdminInvoice from "../models/superAdminInvoice.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { User } from "../models/driver/userModel.js";

export const createSubscriptionInvoice = async ({
  adminId,
  subscription,
  stripeInvoice,
  isFirstPayment = false
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
        subscriptionEndDate.setMonth(startDate.getMonth() + 1)
      case '1-year':
        subscriptionEndDate = new Date(startDate);
        subscriptionEndDate.setMonth(startDate.getMonth() + 13);
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
        : subscription.subscriptionType === "1-year"
          ? "yearly"
          : "monthly",
    invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Add random suffix to ensure uniqueness

    currency: stripeInvoice.currency?.toUpperCase() || "CAD",

    amount: (stripeInvoice.subtotal || 0) / 100,
    taxAmount: (stripeInvoice.tax || 0) / 100,
    discountAmount: (stripeInvoice.total_discount_amounts?.[0]?.amount || 0) / 100,

    totalAmount: (stripeInvoice.total || stripeInvoice.subtotal || 0) / 100,

    paymentStatus: "paid",
    paymentMethod: stripeInvoice.payment_settings?.payment_method_types?.[0] || 'card',

    transactionId: stripeInvoice.payment_intent || null,

    subscriptionStartDate: subscriptionStartDate,
    subscriptionEndDate: subscriptionEndDate,

    invoiceStatus: "generated"
  });
};
