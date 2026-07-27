import mongoose from "mongoose";

const workOrderSchema = new mongoose.Schema(
  {
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true,
    },
    issue: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["open", "inprogress", "completed"],
      default: "open",
    },
    description: {
      type: String,
      trim: true,
    },
    assignedMechanic: {
      type: String,
      trim: true,
    },
    mechanicType: {
      type: String,
      enum: ['internal', 'external'],
      default: 'internal'
    },
    externalMechanicName: {
      type: String,
      trim: true
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
    estimatedCost: {
      type: Number,
      min: 0,
    },
    estimatedTime: {
      type: String, // e.g., "3 hours", "2 days"
      trim: true,
    },
    repairUpdates: [
      {
        time: { type: Date, default: Date.now },
        note: { type: String, trim: true },
      },
    ],
    // Additional fields from Excel Maintenance Log
    unitNumber: {
      type: String,
      trim: true,
    },
    completionDate: {
      type: Date,
    },
    odometerReading: {
      type: Number,
      min: 0,
    },
    partsUsed: [{
      type: String,
      trim: true,
    }],
    serviceProvider: {
      type: String,
      trim: true,
    },
    invoiceReference: {
      type: String,
      trim: true,
    },
    // Company association for data isolation
    company: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "CompanySettings",
      index: true
    },
  },
  { timestamps: true }
);

// Export properly
export const WorkOrder = mongoose.model("WorkOrder", workOrderSchema);
