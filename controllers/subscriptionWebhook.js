import Stripe from "stripe";
import { Subscription } from "../models/subscriptionModel.js";
import { Plan } from "../models/planModel.js";
import { User } from "../models/driver/userModel.js";
import { createSubscriptionInvoice } from "./superadminInvoice.js";

// Initialize Stripe (only if key is provided)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn('⚠️ STRIPE_SECRET_KEY not found in environment variables');
}

export const handleSubscriptionWebhook = async (req, res) => {
  try {
    console.log("---------------------------------------webhook---------------------------------------------")
    const sig = req.headers["stripe-signature"];

    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      console.error("Stripe is not configured");
      return res.status(400).send("Stripe not configured");
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error("STRIPE_WEBHOOK_SECRET is not set");
      return res.status(400).send("Webhook secret not configured");
    }

    const event = stripe.webhooks.constructEvent(
      // req.rawBody,
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log(`Received webhook event: ${event.type}`);

    // Handle checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("Checkout session completed:", session.id);

       if (session.metadata?.type === "extra-truck") {
        console.log("🚛 Extra truck purchase detected");

        const subscriptionId = session.metadata.subscriptionId;
        const extraTrucks = Number(session.metadata.extraTrucks) || 1;

        const subscription = await Subscription.findById(subscriptionId);

        if (!subscription) {
          console.log("❌ Subscription not found");
          return res.json({ received: true });
        }

        // ✅ Increase max trucks
        subscription.maxTrucks += extraTrucks;

        // ✅ Track purchased trucks
        subscription.extraTrucksPurchased =
          (subscription.extraTrucksPurchased || 0) + extraTrucks;

        await subscription.save({ validateBeforeSave: false });

        console.log(`✅ Added ${extraTrucks} extra truck(s)`);
        console.log(`New maxTrucks: ${subscription.maxTrucks}`);

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
      payment_settings: {
        payment_method_types: session.payment_method_types || ["card"]
      }
    };

    await createSubscriptionInvoice({
      adminId: session.metadata.adminId,
      subscription: subscription,
      stripeInvoice: invoiceData,
      isFirstPayment: false,
      type: "extra-truck" 
    });

    console.log("✅ Invoice created for extra truck purchase");
  } catch (err) {
    console.error("⚠️ Extra truck invoice error:", err);
  }

        return res.json({ received: true }); // 🔥 STOP here
      }


      const subscriptionId = session.metadata?.subscriptionId;
      const adminId = session.metadata?.adminId;
      const planId = session.metadata?.planId;
      const subscriptionType = session.metadata?.subscriptionType;

      if (subscriptionId) {
        const subscription = await Subscription.findById(subscriptionId).populate('plan');
        if (subscription) {
          // Ensure plan snapshot is set (backward compatibility for old subscriptions)
          if (!subscription.planSnapshot || !subscription.planSnapshot.snapshotDate) {
            const plan = subscription.plan;
            if (plan) {
              subscription.planSnapshot = {
                planName: plan.planName,
                allowedRoles: plan.allowedRoles ? [...plan.allowedRoles] : undefined,
                blockedRoles: plan.blockedRoles ? [...plan.blockedRoles] : [],
                snapshotDate: new Date()
              };
              console.log(`📸 Plan snapshot captured for subscription ${subscriptionId}`);
            }
          }

          subscription.paymentStatus = 'paid';
          subscription.status = 'active';
          subscription.stripePaymentIntentId = session.payment_intent;
          subscription.stripeSubscriptionId = session.subscription;
          subscription.lastPaymentDate = new Date();
          subscription.startDate = new Date();

          // Handle installments
          if (subscriptionType === '3-months'
            //  || subscriptionType === '6-months'
          ) {
            subscription.installments.paid = 1;
            subscription.installments.remaining = subscription.installments.total - 1;


            // Calculate next billing date
            const nextBilling = new Date();
            nextBilling.setMonth(nextBilling.getMonth() + 1);
            subscription.nextBillingDate = nextBilling;
          }


          else if (subscriptionType === 'one-time') {
            subscription.installments.paid = 1;
            subscription.installments.remaining = 0;
            // Lifetime one-time has no end date
          } else if (subscriptionType === 'full-app' || subscriptionType === 'without-hr') {
            // Monthly subscription - set installments to show first payment completed
            subscription.installments.paid = 1;
            subscription.installments.remaining = 0; // Recurring subscription, no remaining installments
            const nextBilling = new Date();
            nextBilling.setMonth(nextBilling.getMonth() + 1);
            subscription.nextBillingDate = nextBilling;
          }

          // updated for 1 year plan
          else if (subscriptionType === '1-year') {
            console.log("---------------------------------------------subscriptionType-------------------------------", subscriptionType)

            console.log("planType monthly subscription Type - 1-year")
            const now = new Date();
            const freeMonths = subscription.plan?.monthly?.truckPricing?.annualFreeMonths ?? 1;
            const accessEndDate = new Date();
            accessEndDate.setMonth(now.getMonth() + 12 + freeMonths);
            const billingDate = new Date();
            billingDate.setMonth(now.getMonth() + 12);
            subscription.endDate = accessEndDate;
            subscription.startDate = now;
            subscription.nextBillingDate = billingDate;
            subscription.installments.paid = 1;
            subscription.installments.remaining = 0;
          }
          // 6-months truck-based plan
          else if (subscriptionType === '6-months') {
            const now = new Date();
            const endDate = new Date(now);
            endDate.setMonth(endDate.getMonth() + 6);
            const bonusDays = subscription.plan?.monthly?.truckPricing?.sixMonthBonusDays ?? 15;
            endDate.setDate(endDate.getDate() + bonusDays);
            subscription.endDate = endDate;
            subscription.startDate = now;
            subscription.nextBillingDate = endDate;
            subscription.installments.paid = 1;
            subscription.installments.remaining = 0;
          }
          // updated for 1 month plan
          else if (subscriptionType === '1-month') {

            console.log("planType monthly subscription Type - 1-month")
            const now = new Date();
            const accessEndDate = new Date();
            accessEndDate.setMonth(now.getMonth() + 1);




            subscription.endDate = accessEndDate;
            subscription.startDate = now;
            subscription.nextBillingDate = accessEndDate;
            subscription.installments.paid = 1;
            subscription.installments.remaining = 0;

            console.log("subscription.nextBillingDate", subscription.nextBillingDate);
            console.log("subscription.endDate", subscription.endDate);
            console.log("subscription.startDate", subscription.startDate);
            console.log("subscription.installments", subscription.installments);
          }
          else if(subscriptionType === '6-month' && subscription.plan?.planType === 'monthly'){
            console.log("planType monthly subscription Type - 1-month");
            const now = new Date();
            const accessEndDate = new Date();
            accessEndDate.setMonth(now.getMonth()+6);

            accessEndDate.setDate(accessEndDate.getDate() + 15);

            subscription.startDate = now();
            subscription.endDate = accessEndDate;

            const billingDate = new Date(now);
            billingDate.setMonth(billingDate.getMonth()+6);
            subscription.nextBillingDate = billingDate;

            subscription.installments.paid = 1;
            subscription.installments.remaining = 0;
            
          }

          await subscription.save({ validateBeforeSave: false });

          if (subscriptionType === '1-year' && subscription.stripeSubscriptionId) {
            await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
              cancel_at_period_end: true
            });

            console.log("✅ Auto-renew disabled for yearly plan");
          }
          console.log(`Subscription ${subscriptionId} activated`);

          // Create invoice for the subscription purchase
          try {
            if (adminId && subscription) {
              // Construct invoice object from session data
              const invoiceData = {
                currency: session.currency || 'cad',
                subtotal: session.amount_subtotal || session.amount_total || 0,
                tax: session.total_details?.amount_tax || 0,
                total_discount_amounts: session.total_details?.amount_discount ? [{
                  amount: session.total_details.amount_discount
                }] : [],
                total: session.amount_total || 0,
                payment_intent: session.payment_intent || null,
                payment_settings: {
                  payment_method_types: session.payment_method_types || ['card']
                }
              };

              await createSubscriptionInvoice({
                adminId: adminId,
                subscription: subscription,
                stripeInvoice: invoiceData,
                isFirstPayment: true
              });
              console.log(`✅ Invoice created for subscription ${subscriptionId}`);
            }
          } catch (invoiceError) {
            console.error(`⚠️ Error creating invoice for subscription ${subscriptionId}:`, invoiceError);
            // Don't fail the webhook if invoice creation fails
          }
        }
      }
     
      
    }

    // Handle subscription updates
    if (event.type === "customer.subscription.updated") {
      const stripeSubscription = event.data.object;
      console.log("Subscription updated:", stripeSubscription.id);

      const subscription = await Subscription.findOne({
        stripeSubscriptionId: stripeSubscription.id
      });

      if (subscription) {
        if (stripeSubscription.status === 'active') {
          subscription.status = 'active';
        } else if (stripeSubscription.status === 'canceled') {
          subscription.status = 'cancelled';
          subscription.cancelledAt = new Date();
        } else if (stripeSubscription.status === 'past_due') {
          subscription.status = 'past_due';
        }

        await subscription.save({ validateBeforeSave: false });
      }
    }

    // Handle invoice payment succeeded (for recurring payments)
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      console.log("Invoice payment succeeded:", invoice.id);

      const stripeSubscriptionId = invoice.subscription;

      if (stripeSubscriptionId) {
        const subscription = await Subscription.findOne({
          stripeSubscriptionId: stripeSubscriptionId
        }).populate('plan');

        if (subscription) {
          subscription.paymentStatus = 'paid';
          subscription.lastPaymentDate = new Date();

          // Update installment tracking
          if (subscription.installments.remaining > 0) {
            subscription.installments.paid += 1;
            subscription.installments.remaining -= 1;
          }

          // Update next billing date
          if (subscription.nextBillingDate) {
            const nextBilling = new Date(subscription.nextBillingDate);
            nextBilling.setMonth(nextBilling.getMonth() + 1);
            subscription.nextBillingDate = nextBilling;
          }

          await subscription.save({ validateBeforeSave: false });

          // Create invoice for recurring payment
          try {
            if (subscription.admin) {
              await createSubscriptionInvoice({
                adminId: subscription.admin,
                subscription: subscription,
                stripeInvoice: invoice,
                isFirstPayment: false
              });
              console.log(`✅ Invoice created for recurring payment - subscription ${subscription._id}`);
            }
          } catch (invoiceError) {
            console.error(`⚠️ Error creating invoice for recurring payment:`, invoiceError);
            // Don't fail the webhook if invoice creation fails
          }
        }
      }
    }

    // Handle subscription cancelled/deleted
    if (event.type === "customer.subscription.deleted") {
      const stripeSub = event.data.object;
      console.log("Stripe subscription deleted:", stripeSub.id);
      const subscription = await Subscription.findOne({
        stripeSubscriptionId: stripeSub.id
      });
      if (subscription) {
        subscription.status = "cancelled";
        subscription.cancelledAt = new Date();
        subscription.paymentStatus = "cancelled";
        await subscription.save({ validateBeforeSave: false });
        console.log(`✅ Subscription ${subscription._id} marked as cancelled`);
      }
    }

    // Handle invoice payment failed
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      console.log("Invoice payment failed:", invoice.id);

      const stripeSubscriptionId = invoice.subscription;

      if (stripeSubscriptionId) {
        const subscription = await Subscription.findOne({
          stripeSubscriptionId: stripeSubscriptionId
        });

        if (subscription) {
          subscription.paymentStatus = 'failed';
          subscription.status = 'past_due';
          await subscription.save({ validateBeforeSave: false });
        }
      }
    }



    res.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};

