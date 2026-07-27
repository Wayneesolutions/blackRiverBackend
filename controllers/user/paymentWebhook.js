// controllers/paymentWebhook.js
import Stripe from "stripe";
import { Invoice } from "../../models/hr/invoiceModel.js";
import { Subscription } from "../../models/subscriptionModel.js";
import { createSubscriptionInvoice } from "../superadminInvoice.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const handleStripeWebhook = async (req, res) => {
  try {
    console.log("web hook hit handle stripeWebhook");
    const sig = req.headers["stripe-signature"];

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error("STRIPE_WEBHOOK_SECRET is not set");
      return res.status(400).send("Webhook secret not configured");
    }

    // express.raw() puts the raw buffer in req.body (not req.rawBody)
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log(`Received webhook event: ${event.type}`);

    // ── Invoice payment (customer invoices, not subscriptions) ──────────────
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("Checkout session completed:", session.id);

      // Extra-truck purchase
      if (session.metadata?.type === "extra-truck") {
        console.log("🚛 Extra truck purchase detected");
        const subscriptionId = session.metadata.subscriptionId;
        const extraTrucks = Number(session.metadata.extraTrucks) || 1;

        const subscription = await Subscription.findById(subscriptionId);
        if (subscription) {
          const prevMax = subscription.maxTrucks || 0;
          subscription.maxTrucks = prevMax + extraTrucks;
          subscription.extraTrucksPurchased =
            (subscription.extraTrucksPurchased || 0) + extraTrucks;
          await subscription.save({ validateBeforeSave: false });
          console.log(`✅ Extra trucks: sub=${subscriptionId} type=${subscription.subscriptionType} maxTrucks ${prevMax} → ${subscription.maxTrucks}`);

          try {
            const invoiceData = {
              currency: session.currency || "cad",
              subtotal: session.amount_total || 0,
              tax: session.total_details?.amount_tax || 0,
              total_discount_amounts: session.total_details?.amount_discount
                ? [{ amount: session.total_details.amount_discount }]
                : [],
              total: session.amount_total || 0,
              payment_intent: session.payment_intent || null,
              payment_settings: { payment_method_types: session.payment_method_types || ["card"] }
            };
            await createSubscriptionInvoice({
              adminId: session.metadata.adminId,
              subscription,
              stripeInvoice: invoiceData,
              isFirstPayment: false,
              type: "extra-truck"
            });
            console.log("✅ Invoice created for extra truck purchase");
          } catch (err) {
            console.error("⚠️ Extra truck invoice error:", err);
          }
        } else {
          console.log("❌ Subscription not found for extra-truck purchase");
        }
        return res.json({ received: true });
      }

      // Customer invoice payment (e.g. from the Accounts/Invoice module)
      const invoiceId = session.metadata?.invoiceId;
      if (invoiceId) {
        console.log(`Updating invoice ${invoiceId} to paid status`);
        const updatedInvoice = await Invoice.findByIdAndUpdate(
          invoiceId,
          { status: "paid", paymentDate: new Date() },
          { new: true }
        );
        if (updatedInvoice) {
          console.log(`Invoice ${invoiceId} updated successfully`);
        } else {
          console.error(`Invoice ${invoiceId} not found`);
        }
        return res.json({ received: true });
      }

      // Subscription activation (new plan purchase)
      const subscriptionId = session.metadata?.subscriptionId;
      const adminId = session.metadata?.adminId;
      const subscriptionType = session.metadata?.subscriptionType;

      if (subscriptionId) {
        const subscription = await Subscription.findById(subscriptionId).populate("plan");
        if (subscription) {
          // Capture plan snapshot for backward compatibility
          if (!subscription.planSnapshot?.snapshotDate) {
            const plan = subscription.plan;
            if (plan) {
              subscription.planSnapshot = {
                planName: plan.planName,
                allowedRoles: plan.allowedRoles ? [...plan.allowedRoles] : undefined,
                blockedRoles: plan.blockedRoles ? [...plan.blockedRoles] : [],
                snapshotDate: new Date()
              };
            }
          }

          subscription.paymentStatus = "paid";
          subscription.status = "active";
          subscription.stripePaymentIntentId = session.payment_intent;
          subscription.stripeSubscriptionId = session.subscription;
          subscription.lastPaymentDate = new Date();
          subscription.startDate = new Date();

          const now = new Date();

          if (subscriptionType === "1-year") {
            const freeMonths = subscription.plan?.monthly?.truckPricing?.annualFreeMonths ?? 1;
            const accessEndDate = new Date(now);
            accessEndDate.setMonth(now.getMonth() + 12 + freeMonths);
            const billingDate = new Date(now);
            billingDate.setMonth(now.getMonth() + 12);
            subscription.endDate = accessEndDate;
            subscription.nextBillingDate = billingDate;
            subscription.installments.paid = 1;
            subscription.installments.remaining = 0;
          } else if (subscriptionType === "6-months") {
            const endDate = new Date(now);
            endDate.setMonth(now.getMonth() + 6);
            const bonusDays = subscription.plan?.monthly?.truckPricing?.sixMonthBonusDays ?? 15;
            endDate.setDate(endDate.getDate() + bonusDays);
            subscription.endDate = endDate;
            subscription.nextBillingDate = endDate;
            subscription.installments.paid = 1;
            subscription.installments.remaining = 0;
          } else if (subscriptionType === "1-month") {
            const accessEndDate = new Date(now);
            accessEndDate.setMonth(now.getMonth() + 1);
            subscription.endDate = accessEndDate;
            subscription.nextBillingDate = accessEndDate;
            subscription.installments.paid = 1;
            subscription.installments.remaining = 0;
          } else if (subscriptionType === "3-months") {
            subscription.installments.paid = 1;
            subscription.installments.remaining = subscription.installments.total - 1;
            const nextBilling = new Date(now);
            nextBilling.setMonth(now.getMonth() + 1);
            subscription.nextBillingDate = nextBilling;
          } else if (subscriptionType === "one-time") {
            subscription.installments.paid = 1;
            subscription.installments.remaining = 0;
          } else if (["full-app", "without-hr"].includes(subscriptionType)) {
            subscription.installments.paid = 1;
            subscription.installments.remaining = 0;
            const nextBilling = new Date(now);
            nextBilling.setMonth(now.getMonth() + 1);
            subscription.nextBillingDate = nextBilling;
          }

          await subscription.save({ validateBeforeSave: false });

          if (subscriptionType === "1-year" && subscription.stripeSubscriptionId) {
            try {
              await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
                cancel_at_period_end: true
              });
              console.log("✅ Auto-renew disabled for yearly plan");
            } catch (err) {
              console.error("⚠️ Failed to disable auto-renew:", err);
            }
          }

          console.log(`✅ Subscription ${subscriptionId} activated`);

          try {
            if (adminId) {
              const invoiceData = {
                currency: session.currency || "cad",
                subtotal: session.amount_subtotal || session.amount_total || 0,
                tax: session.total_details?.amount_tax || 0,
                total_discount_amounts: session.total_details?.amount_discount
                  ? [{ amount: session.total_details.amount_discount }]
                  : [],
                total: session.amount_total || 0,
                payment_intent: session.payment_intent || null,
                payment_settings: { payment_method_types: session.payment_method_types || ["card"] }
              };
              await createSubscriptionInvoice({
                adminId,
                subscription,
                stripeInvoice: invoiceData,
                isFirstPayment: true
              });
              console.log(`✅ Invoice created for subscription ${subscriptionId}`);
            }
          } catch (invoiceError) {
            console.error(`⚠️ Invoice creation error for subscription ${subscriptionId}:`, invoiceError);
          }
        }
      }
    }

    // ── Subscription updated ────────────────────────────────────────────────
    if (event.type === "customer.subscription.updated") {
      const stripeSub = event.data.object;
      const subscription = await Subscription.findOne({ stripeSubscriptionId: stripeSub.id });
      if (subscription) {
        if (stripeSub.status === "active") subscription.status = "active";
        else if (stripeSub.status === "canceled") {
          subscription.status = "cancelled";
          subscription.cancelledAt = new Date();
        } else if (stripeSub.status === "past_due") subscription.status = "past_due";
        await subscription.save({ validateBeforeSave: false });
        console.log(`✅ Subscription ${subscription._id} status updated to ${subscription.status}`);
      }
    }

    // ── Subscription cancelled/deleted ──────────────────────────────────────
    if (event.type === "customer.subscription.deleted") {
      const stripeSub = event.data.object;
      console.log("Stripe subscription deleted:", stripeSub.id);
      const subscription = await Subscription.findOne({ stripeSubscriptionId: stripeSub.id });
      if (subscription) {
        subscription.status = "cancelled";
        subscription.cancelledAt = new Date();
        subscription.paymentStatus = "cancelled";
        await subscription.save({ validateBeforeSave: false });
        console.log(`✅ Subscription ${subscription._id} marked as cancelled`);
      } else {
        console.log(`⚠️ No subscription found for stripeSubscriptionId: ${stripeSub.id}`);
      }
    }

    // ── Recurring invoice payment succeeded ─────────────────────────────────
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      const stripeSubscriptionId = invoice.subscription;
      if (stripeSubscriptionId) {
        const subscription = await Subscription.findOne({ stripeSubscriptionId }).populate("plan");
        if (subscription) {
          subscription.paymentStatus = "paid";
          subscription.lastPaymentDate = new Date();
          if (subscription.installments.remaining > 0) {
            subscription.installments.paid += 1;
            subscription.installments.remaining -= 1;
          }
          if (subscription.nextBillingDate) {
            const next = new Date(subscription.nextBillingDate);
            next.setMonth(next.getMonth() + 1);
            subscription.nextBillingDate = next;
          }
          await subscription.save({ validateBeforeSave: false });

          try {
            if (subscription.admin) {
              await createSubscriptionInvoice({
                adminId: subscription.admin,
                subscription,
                stripeInvoice: invoice,
                isFirstPayment: false
              });
              console.log(`✅ Invoice created for recurring payment - subscription ${subscription._id}`);
            }
          } catch (invoiceError) {
            console.error("⚠️ Recurring invoice creation error:", invoiceError);
          }
        }
      }
    }

    // ── Invoice payment failed ──────────────────────────────────────────────
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const stripeSubscriptionId = invoice.subscription;
      if (stripeSubscriptionId) {
        const subscription = await Subscription.findOne({ stripeSubscriptionId });
        if (subscription) {
          subscription.paymentStatus = "failed";
          subscription.status = "past_due";
          await subscription.save({ validateBeforeSave: false });
          console.log(`⚠️ Subscription ${subscription._id} marked as past_due`);
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};
