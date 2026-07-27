import mongoose from "mongoose";

const settlementSchema = new mongoose.Schema({
  settlementId: {
    type: String,
    required: true,
    index: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  payPeriod: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    }
  },
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Paid', 'Cancelled'],
    default: 'Pending',
    required: true
  },
  grossPay: {
    type: Number,
    required: true,
    default: 0
  },
  deductions: {
    type: Number,
    default: 0
  },
  additions: {
    type: Number,
    default: 0
  },
  netPay: {
    type: Number,
    required: true,
    default: 0
  },
  // Reference to deductions/additions applied
  appliedDeductions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "DeductionAddition"
  }],
  // Reference to miles tracking records
  milesRecords: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "MilesTracking"
  }],
  // Payment information
  paymentDate: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: ['Bank Transfer', 'Check', 'Cash', 'Other']
  },
  paymentReference: {
    type: String
  },
  notes: {
    type: String
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
settlementSchema.index({ driver: 1, 'payPeriod.startDate': 1, 'payPeriod.endDate': 1 });
settlementSchema.index({ status: 1 });
settlementSchema.index({ company: 1, createdAt: -1 });
// Compound unique index: settlementId must be unique per company
settlementSchema.index({ settlementId: 1, company: 1 }, { unique: true });

export const Settlement = mongoose.model("Settlement", settlementSchema);

// Deduction & Addition Model
const deductionAdditionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['Deduction', 'Addition'],
    required: true
  },
  recurrence: {
    type: String,
    enum: ['One-time', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Yearly', 'One Time Payment'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    enum: ['CAD', 'USD'],
    default: 'CAD'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

deductionAdditionSchema.index({ assignedTo: 1, isActive: 1 });
deductionAdditionSchema.index({ company: 1, type: 1 });

export const DeductionAddition = mongoose.model("DeductionAddition", deductionAdditionSchema);

// Miles Tracking Model
const milesTrackingSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "vehicleModel",
    required: true
  },
  vehicleModel: {
    type: String,
    enum: ["Vehicle", "FleetUnit"],
    default: "Vehicle"
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  state: {
    type: String,
    required: true
  },
  totalMiles: {
    type: Number,
    required: true,
    min: 0
  },
  loadedMiles: {
    type: Number,
    default: 0,
    min: 0
  },
  emptyMiles: {
    type: Number,
    default: 0,
    min: 0
  },
  iftaMiles: {
    type: Number,
    required: true,
    min: 0
  },
  trip: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Trip"
  },
  notes: {
    type: String
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

milesTrackingSchema.index({ driver: 1, date: -1 });
milesTrackingSchema.index({ vehicle: 1, date: -1 });
milesTrackingSchema.index({ company: 1, date: -1 });
milesTrackingSchema.index({ state: 1, date: -1 });

export const MilesTracking = mongoose.model("MilesTracking", milesTrackingSchema);

