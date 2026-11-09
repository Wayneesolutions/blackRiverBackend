import mongoose from "mongoose";

const subscriptionInvoiceSchema = new mongoose.Schema(
  {
    // Who purchased the subscription
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      required: false // Allow invoices without company for admins without company setup
    },

    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    // Subscription details
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: false // Optional for backward compatibility
    },
    // Optional so a Super Admin can bill a one-off charge that isn't tied to a plan
    subscriptionPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: false
    },

    planName: {
      type: String,
      required: true
    },

    billingCycle: {
      type: String,
      // one-time = lifetime purchase / one-off charge, installment = lifetime paid in parts
      enum: ["monthly", "6-months", "yearly", "one-time", "installment"],
      required: true
    },

    // Invoice details
    invoiceNumber: {
      type: String,
      required: true,
      unique: true
    },

    currency: {
      type: String,
      default: "CAD"
    },

    amount: {
      type: Number,
      required: true
    },

    taxAmount: {
      type: Number,
      default: 0
    },

    discountAmount: {
      type: Number,
      default: 0
    },

    totalAmount: {
      type: Number,
      required: true
    },

    // Payment info
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending"
    },

    paymentMethod: {
      type: String
    },

    transactionId: {
      type: String
    },

    // Subscription period
    subscriptionStartDate: {
      type: Date,
      required: true
    },

    // Empty for lifetime / one-off invoices (no end to the period)
    subscriptionEndDate: {
      type: Date,
      required: false
    },

    // Invoice status
    invoiceStatus: {
      type: String,
      enum: ["generated", "cancelled"],
      default: "generated"
    },

    // stripe = created by a Stripe webhook, manual = created by a Super Admin
    source: {
      type: String,
      enum: ["stripe", "manual"],
      default: "stripe"
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    paidAt: {
      type: Date
    },

    // Last time this invoice was emailed to the customer
    emailedAt: {
      type: Date
    },

    emailedTo: {
      type: String
    },

    // Extra
    notes: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model(
  "SubscriptionInvoice",
  subscriptionInvoiceSchema
);
