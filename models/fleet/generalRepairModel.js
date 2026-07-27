import mongoose from "mongoose";

const generalRepairSchema = new mongoose.Schema(
  {
    serviceDate: { type: Date, required: true },
    unitNumber: { type: String, required: true, trim: true },
    makeModel: { type: String, trim: true },
    vinLicensePlate: { type: String, trim: true },
    description: { type: String, required: true, trim: true },
    odometer: { type: Number, min: 0 },
    parts: { 
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    notes: { type: String, trim: true },
    serviceProvider: { type: String, required: true, trim: true },
    customer: { type: String, trim: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    taxes: [{
      name: { type: String, trim: true },
      percentage: { type: Number, min: 0, max: 100 }
    }],
    invoiceNumber: { type: String, trim: true },
    amount: { type: Number, min: 0 },
    duePayment: { type: Date },
    unitSource: {
      type: String,
      enum: ["vehicle", "trailer", "custom", "unknown"],
      default: "unknown"
    },
    unitReference: {
      type: mongoose.Schema.Types.ObjectId
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    // Mechanic assignment and status
    serviceProviderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    mechanicType: {
      type: String,
      enum: ['internal', 'external'],
      default: 'internal'
    },
    externalMechanicCompany: {
      type: String,
      trim: true
    },
    externalMechanicPhone: {
      type: String,
      trim: true
    },
    externalMechanicEmail: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['Created', 'Assigned', 'Shared', 'in-progress', 'completed'],
      default: 'Created'
    },
    shared: {
      type: Boolean,
      default: false
    },
    // Completion fields (filled by mechanic)
    repairDetails: {
      type: String,
      trim: true
    },
    completedParts: [{
      partId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SparePart"
      },
      partName: {
        type: String,
        trim: true
      },
      partNumber: {
        type: String,
        trim: true
      },
      quantity: {
        type: Number,
        min: 1,
        default: 1
      },
      cost: {
        type: Number,
        min: 0,
        default: 0
      }
    }],
    completionInvoiceNumber: {
      type: String,
      trim: true
    },
    invoiceUploadUrl: {
      type: String,
      trim: true
    },
    completionTaxes: [{
      name: {
        type: String,
        trim: true
      },
      percentage: {
        type: Number,
        min: 0,
        max: 100
      },
      amount: {
        type: Number,
        min: 0,
        default: 0
      }
    }],
    completionTotalAmount: {
      type: Number,
      min: 0
    },
    completionDate: {
      type: Date
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    verificationStatus: {
      type: String,
      enum: ['not-verified', 'verified'],
      default: null
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    verifiedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

generalRepairSchema.index({ serviceDate: -1, unitNumber: 1, company: 1 });

export const GeneralRepair = mongoose.model("GeneralRepair", generalRepairSchema);

