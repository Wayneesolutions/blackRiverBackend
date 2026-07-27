import Stripe from "stripe";
import { Subscription } from "../models/subscriptionModel.js";
import { Plan } from "../models/planModel.js";
import { User } from "../models/driver/userModel.js";
import SuperAdminInvoice from "../models/superAdminInvoice.js";
import { Vehicle } from "../models/driver/vehicleModel.js";

// Initialize Stripe (only if key is provided)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn('⚠️ STRIPE_SECRET_KEY not found in environment variables');
}

// ✅ Get All Plans (for admin to view available plans)
export const getAllPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ status: 'active' })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Plans retrieved successfully",
      data: plans
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Get Admin's Active Subscription
export const getMySubscription = async (req, res) => {
  try {
    const adminId = req.user._id;

    const subscription = await Subscription.findOne({
      admin: adminId,
      $or: [
        { status: 'active' },
        { status: 'pending', paymentStatus: 'paid' }
      ]
    })
      .populate('plan', 'planName planType description lifetime monthly')
      .sort({ createdAt: -1 });

    if (!subscription) {
      return res.json({
        success: true,
        message: "No active subscription found",
        data: null
      });
    }

    // Fix installments for monthly subscriptions that are active and paid but have incorrect installments
    if (
      subscription.planType === 'monthly' &&
      (subscription.subscriptionType === 'full-app' || subscription.subscriptionType === 'without-hr') &&
      subscription.status === 'active' &&
      subscription.paymentStatus === 'paid' &&
      subscription.installments.paid === 0
    ) {
      subscription.installments.paid = 1;
      subscription.installments.remaining = 0;
      await subscription.save();
    }

    // Count actual trucks for this admin's company
    const companyId = req.user?.company?._id || req.user?.company || adminId;
    const usedTrucks = await Vehicle.countDocuments({ company: companyId });

    res.json({
      success: true,
      message: "Subscription retrieved successfully",
      data: {
        ...subscription.toObject(),
        usedTrucks
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Get All Admin Subscriptions (for admin to view subscription history)
export const getMySubscriptions = async (req, res) => {
  try {
    const adminId = req.user._id;

    const subscriptions = await Subscription.find({ admin: adminId })
      .populate('plan', 'planName planType description')
      .sort({ createdAt: -1 });

    // Fix installments for monthly subscriptions that are active and paid but have incorrect installments
    for (const sub of subscriptions) {
      if (
        sub.planType === 'monthly' &&
        (sub.subscriptionType === 'full-app' || sub.subscriptionType === 'without-hr') &&
        sub.status === 'active' &&
        sub.paymentStatus === 'paid' &&
        sub.installments.paid === 0
      ) {
        sub.installments.paid = 1;
        sub.installments.remaining = 0;
        await sub.save();
      }
    }

    // Re-fetch to get updated data
    const updatedSubscriptions = await Subscription.find({ admin: adminId })
      .populate('plan', 'planName planType description')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Subscriptions retrieved successfully",
      data: updatedSubscriptions
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Create Subscription Checkout Session
export const createCheckoutSession = async (req, res) => {
  try {

    console.log("create checkout session ..............");
    const { planId, subscriptionType, truckCount } = req.body;
    const adminId = req.user._id;
    const adminEmail = req.user.email;
    const adminName = req.user.name;

    // Validate Stripe configuration
    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Stripe is not configured. Please contact administrator.",
        stripeConfigured: false
      });
    }

    // Get plan
    const plan = await Plan.findById(planId);
    if (!plan || plan.status !== 'active') {
      return res.status(404).json({
        success: false,
        message: "Plan not found or inactive"
      });
    }

    // Calculate price based on subscription type
    let amount = 0;
    let currency = 'CAD';
    let description = '';
    let isRecurring = false;

    if (plan.planType === 'lifetime') {
      if (subscriptionType === 'one-time') {
        amount = plan.lifetime?.oneTime?.price || 0;
        currency = plan.lifetime?.oneTime?.currency || 'CAD';
        description = `${plan.planName} - Lifetime (One-time payment)`;
      } else if (subscriptionType === '3-months') {
        if (!plan.lifetime?.installments?.threeMonths?.enabled) {
          return res.status(400).json({
            success: false,
            message: "3-month installment option is not available for this plan"
          });
        }
        amount = plan.lifetime?.installments?.threeMonths?.price || 0;
        currency = plan.lifetime?.installments?.threeMonths?.currency || 'CAD';
        description = `${plan.planName} - Lifetime (3 monthly installments)`;
        isRecurring = true;
      } else if (subscriptionType === '6-months') {
        if (!plan.lifetime?.installments?.sixMonths?.enabled) {
          return res.status(400).json({
            success: false,
            message: "6-month installment option is not available for this plan"
          });
        }
        amount = plan.lifetime?.installments?.sixMonths?.price || 0;
        currency = plan.lifetime?.installments?.sixMonths?.currency || 'CAD';
        description = `${plan.planName} - Lifetime (6 monthly installments)`;
        isRecurring = true;
      }
    }



    // monthly selected plan
    else if (plan.planType === 'monthly') {
      if (subscriptionType === 'full-app') {
        if (!plan.monthly?.fullApp?.enabled) {
          return res.status(400).json({
            success: false,
            message: "Full app option is not available for this plan"
          });
        }
        amount = plan.monthly?.fullApp?.price || 0;
        currency = plan.monthly?.fullApp?.currency || 'CAD';
        description = `${plan.planName} - Full App (Monthly)`;
        isRecurring = true;
      } else if (subscriptionType === 'without-hr') {
        if (!plan.monthly?.withoutHR?.enabled) {
          return res.status(400).json({
            success: false,
            message: "Without HR option is not available for this plan"
          });
        }
        amount = plan.monthly?.withoutHR?.price || 0;
        currency = plan.monthly?.withoutHR?.currency || 'CAD';
        description = `${plan.planName} - Without HR (Monthly)`;
        isRecurring = true;
      }
      // 1-month
      else if (subscriptionType === '1-month') {
        if (!plan?.monthly?.truckPricing?.tiers.length) {
          return res.status(404).json({
            success: false,
            message: "Truck pricing not configured"
          })
        }



        if (truckCount < 1 || truckCount > 20) {
          return res.status(400).json({
            success: false,
            message: "Truck count must be between 1 and 20"
          })
        }

        const price = calculateTruckPricing(truckCount, plan.monthly.truckPricing);
        amount = price;
        currency = plan.monthly.truckPricing.tiers[0]?.currency || 'CAD';
        description = `${plan.planName} - Truck Pricing (Monthly)`;
        isRecurring = true;
      }
      // 6-months truck-based
      else if (subscriptionType === '6-months') {
        if (!plan?.monthly?.truckPricing?.tiers?.length) {
          return res.status(404).json({
            success: false,
            message: "Truck pricing not configured"
          });
        }

        if (!truckCount || truckCount < 1) {
          return res.status(400).json({
            success: false,
            message: "Truck count is required"
          });
        }

        const monthlyPrice = calculateTruckPricing(truckCount, plan.monthly.truckPricing);
        amount = monthlyPrice * 6;
        currency = plan.monthly.truckPricing.tiers[0]?.currency || 'CAD';
        description = `${plan.planName} - Truck Pricing (6 Months)`;
        isRecurring = false;
      }
      // 1-year truck-based annual
      else if (subscriptionType === '1-year') {
        if (!plan?.monthly?.truckPricing?.tiers?.length) {
          return res.status(404).json({
            success: false,
            message: "Truck pricing not configured"
          });
        }

        if (!truckCount || truckCount < 1) {
          return res.status(400).json({
            success: false,
            message: "Truck count is required"
          });
        }

        const monthlyPrice = calculateTruckPricing(truckCount, plan.monthly.truckPricing);
        amount = monthlyPrice * 12;
        currency = plan.monthly.truckPricing.tiers[0]?.currency || 'CAD';
        description = `${plan.planName} - Truck Pricing (Annual)`;
        isRecurring = true;
      }
    }

    if (amount === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription type or pricing not configured"
      });
    }

    // Create or get Stripe customer
    let customerId = null;
    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin user not found"
      });
    }

    if (!admin.stripeCustomerId) {
      if (!stripe) {
        return res.status(500).json({
          success: false,
          message: "Stripe is not configured. Please contact administrator."
        });
      }
      const customer = await stripe.customers.create({
        email: adminEmail,
        name: adminName,
        metadata: {
          adminId: adminId.toString(),
          companyId: admin.company?.toString() || ''
        }
      });
      customerId = customer.id;

      // Save customer ID to admin
      await User.findByIdAndUpdate(adminId, { stripeCustomerId: customer.id });
    } else {
      customerId = admin.stripeCustomerId;
    }

    // Capture plan snapshot at subscription creation time
    // This ensures plan changes don't affect existing subscriptions
    const planSnapshot = {
      planName: plan.planName,
      snapshotDate: new Date()
    };

    // Create subscription record
    const subscription = new Subscription({
      admin: adminId,
      plan: planId,
      planType: plan.planType,
      subscriptionType: subscriptionType,
      amount: amount,
      currency: currency,
      status: 'pending',
      paymentStatus: 'pending',
      stripeCustomerId: customerId,
      planSnapshot: planSnapshot, // Store snapshot at creation time
      installments: {
        total: subscriptionType === '3-months' ? 3 : subscriptionType === '6-months' ? 6 : 1,
        paid: 0,
        remaining: subscriptionType === '3-months' ? 3 : subscriptionType === '6-months' ? 6 : 1
      },
      maxTrucks: subscriptionType === '1-month' || subscriptionType === '6-months' || subscriptionType === '1-year' ? truckCount : 0
    });

    // Create Stripe checkout session
    const sessionConfig = {
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: plan.planName,
            description: description,
          },
          unit_amount: Math.round(amount * 100), // Convert to cents
          ...(isRecurring && {
            recurring: {
              interval: 'month',
              interval_count: 1
            }
          })
        },
        quantity: 1,
      }],
      mode: isRecurring ? 'subscription' : 'payment',
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/admin/subscription?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/admin/subscription?status=cancel`,
      metadata: {
        adminId: adminId.toString(),
        planId: planId.toString(),
        subscriptionType: subscriptionType,
        subscriptionId: subscription._id.toString()
      }
    };

    // For recurring subscriptions, set billing interval
    if (isRecurring && subscriptionType === '3-months') {
      sessionConfig.line_items[0].price_data.recurring.interval_count = 1;
      // Note: For 3/6 installments, we'll need to handle cancellation after the period
    }

    if (subscriptionType === '1-year') {
      sessionConfig.line_items[0].price_data.recurring.interval = 'year';
      sessionConfig.line_items[0].price_data.recurring.interval_count = 1;

    }
    if (subscriptionType === '1-month') {
      sessionConfig.line_items[0].price_data.recurring.interval = 'month';
      sessionConfig.line_items[0].price_data.recurring.interval_count = 1;

    }

    if (!stripe) {
      return res.status(500).json({
        success: false,
        message: "Stripe is not configured. Please contact administrator."
      });
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    // console.log("session.............................", session)
    // Save session ID to subscription
    subscription.stripeSessionId = session.id;
    await subscription.save();

    res.json({
      success: true,
      message: "Checkout session created successfully",
      data: {
        sessionId: session.id,
        url: session.url
      }
    });
  } catch (err) {
    console.error('Error creating checkout session:', err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Cancel Subscription
export const cancelSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const adminId = req.user._id;

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      admin: adminId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found"
      });
    }

    if (subscription.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: "Subscription is already cancelled"
      });
    }

    // Cancel Stripe subscription if exists
    if (subscription.stripeSubscriptionId && stripe) {
      try {
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      } catch (stripeErr) {
        console.error('Error cancelling Stripe subscription:', stripeErr);
      }
    }

    // Update subscription status
    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    await subscription.save();

    // Mark related invoices as cancelled (only invoices linked to this specific subscription)
    try {
      await SuperAdminInvoice.updateMany(
        {
          subscription: subscriptionId, // Only cancel invoices linked to this specific subscription
          invoiceStatus: { $ne: 'cancelled' } // Only update non-cancelled invoices
        },
        {
          $set: {
            invoiceStatus: 'cancelled'
          }
        }
      );
      console.log(`✅ Marked invoices as cancelled for subscription ${subscriptionId}`);
    } catch (invoiceError) {
      console.error(`⚠️ Error marking invoices as cancelled:`, invoiceError);
      // Don't fail the cancellation if invoice update fails
    }

    res.json({
      success: true,
      message: "Subscription cancelled successfully",
      data: subscription
    });
  } catch (err) {
    console.error('Error cancelling subscription:', err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Verify Stripe Checkout Session — fallback for when webhook hasn't fired yet
export const verifyCheckoutSession = async (req, res) => {
  try {
    const { session_id } = req.query;
    const adminId = req.user._id;

    if (!session_id) {
      return res.status(400).json({ success: false, message: 'session_id is required' });
    }

    if (!stripe) {
      return res.status(500).json({ success: false, message: 'Stripe is not configured' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Stripe session not found' });
    }

    const subscriptionId = session.metadata?.subscriptionId;
    if (!subscriptionId) {
      return res.status(400).json({ success: false, message: 'Invalid session metadata' });
    }

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      admin: adminId
    }).populate('plan');

    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription record not found' });
    }

    // Already active — nothing to do
    if (subscription.status === 'active' && subscription.paymentStatus === 'paid') {
      return res.json({ success: true, message: 'Subscription is active', data: subscription });
    }

    // Stripe says payment is complete — activate now (webhook may not have arrived yet)
    if (session.payment_status === 'paid' || session.status === 'complete') {
      const subscriptionType = session.metadata?.subscriptionType;
      const now = new Date();

      subscription.paymentStatus = 'paid';
      subscription.status = 'active';
      subscription.startDate = now;
      if (session.payment_intent) subscription.stripePaymentIntentId = session.payment_intent;
      if (session.subscription) subscription.stripeSubscriptionId = session.subscription;
      subscription.lastPaymentDate = now;
      subscription.installments = subscription.installments || {};
      subscription.installments.paid = 1;
      subscription.installments.remaining = 0;

      if (subscriptionType === '1-month') {
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);
        subscription.endDate = endDate;
        subscription.nextBillingDate = endDate;
      } else if (subscriptionType === '6-months') {
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 6);
        const bonusDays = subscription.plan?.monthly?.truckPricing?.sixMonthBonusDays ?? 15;
        endDate.setDate(endDate.getDate() + bonusDays);
        subscription.endDate = endDate;
        subscription.nextBillingDate = endDate;
      } else if (subscriptionType === '1-year') {
        const freeMonths = subscription.plan?.monthly?.truckPricing?.annualFreeMonths ?? 1;
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 12 + freeMonths);
        const billingDate = new Date(now);
        billingDate.setMonth(billingDate.getMonth() + 12);
        subscription.endDate = endDate;
        subscription.nextBillingDate = billingDate;
      }

      // Ensure plan snapshot exists
      if (!subscription.planSnapshot?.snapshotDate && subscription.plan) {
        subscription.planSnapshot = {
          planName: subscription.plan.planName,
          allowedRoles: subscription.plan.allowedRoles ? [...subscription.plan.allowedRoles] : undefined,
          blockedRoles: subscription.plan.blockedRoles ? [...subscription.plan.blockedRoles] : [],
          snapshotDate: now
        };
      }

      await subscription.save();
      console.log(`✅ Subscription ${subscriptionId} activated via verify endpoint`);
    }

    return res.json({ success: true, message: 'Payment verified', data: subscription });
  } catch (err) {
    console.error('Error verifying checkout session:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};


// calculate pricing 

const calculateTruckPricing = (truckCount, pricing) => {
  const tier = pricing.tiers.find(
    t => truckCount >= t.minTrucks && truckCount <= t.maxTrucks
  );

  if (tier) return tier.monthlyPrice;

  const lastTier = pricing.tiers[pricing.tiers.length - 1];

  return (
    lastTier.monthlyPrice +
    (truckCount - lastTier.maxTrucks) * pricing.extraTruckPrice
  );
};


// createCheckout Session for extra truck registeration

export const extraTruckCheckoutSession = async(req,res)=>{
  try {
      const {extraTruck =1,planId} = req.body
       const adminId = req.user._id;
      const adminEmail = req.user.email;
      const adminName = req.user.name;
  
  
        if (!stripe || !process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({
          success: false,
          message: "Stripe is not configured. Please contact administrator.",
          stripeConfigured: false
        });
      }
  
          // Get plan
      const plan = await Plan.findById(planId);
      if (!plan || plan.status !== 'active') {
        return res.status(404).json({
          success: false,
          message: "Plan not found or inactive"
        });
      }
  
    // get subscription the user has (newest first)
    const subscripiton = await Subscription.findOne({
         admin:req.user._id,
         status:'active'
    }).sort({ createdAt: -1 });
  
    if(!subscripiton){
      return res.status(400)
      .json({
        success:false,
        message:"no active subscription"
      })
    }
  
    if(extraTruck <=0){
      return res.status(400)
      .json({
        success:false,
        message:"invalid extraTruck number"
      })
    }
  
   const pricePerTruck = plan.monthly?.truckPricing?.extraTruckPrice || 19.99;
  
   let amount = pricePerTruck * extraTruck;
   let currency = 'CAD'
  
    // create or get stripe customer 
    let customerId = null;
  
    const admin = await User.findById(adminId);
  
    if(!admin){
      return res.status(404)
      .json({
        success:false,
        message:"Admin user not found"
      })
    }
  
    if(!admin.stripeCustomerId){
      if(!stripe){
        return res.status(500)
        .json({
          success:false,
          message:"stripe is not configured. Please contact administrator"
        })
      }
        const customer = await stripe.customers.create({
      email:adminEmail,
      name:adminName,
      metadata:{
        adminId:adminId.toString(),
        companyId:admin.company?.toString() || ''
      }
    });
  
    customerId = customer.id;
  
    // save customer id to admin
  
    await User.findByIdAndUpdate(adminId,{
      stripeCustomerId:customer.id
    })
    }else{
      customerId = admin.stripeCustomerId;
    }
  
  
  
    // stripe checkout session
  
    const sessionConfig = {
      customer:customerId,
      payment_method_types:["card"],
       mode :'payment',
      line_items:[
        {
        price_data:{
          currency:currency.toLowerCase(),
          product_data :{
            name:plan.planName,
            description:`${extraTruck}addtional trucks`
          },
          unit_amount:Math.round(amount*100),// convert to cents
        },
         quantity:1
      },
      
      
    ],
  
          success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/admin/subscription?status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/admin/subscription?status=cancel`,
          metadata: {
          adminId: adminId.toString(),
          planId: planId.toString(),
          type:"extra-truck",
          extraTrucks:extraTruck.toString(),
          subscriptionId:subscripiton._id.toString()
        
        }
    }
  
    const session = await stripe.checkout.sessions.create(sessionConfig);
    
  
    return res.status(200)
    .json({
      success:true,
      message:"session created for extra trucks add on successfully",
      data:{
        url:session.url
      }
    })
  
    
  
  } catch (error) {
     console.error("error:",error);
    return res.status(400).
    json({
      success:false,
      message:"something went wrong",
      error:message.error
    })
    
  }
    
}