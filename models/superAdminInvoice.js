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
    subscriptionPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true
    },

    planName: {
      type: String,
      required: true
    },

    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
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

    subscriptionEndDate: {
      type: Date,
      required: true
    },

    // Invoice status
    invoiceStatus: {
      type: String,
      enum: ["generated", "cancelled"],
      default: "generated"
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
