import mongoose from "mongoose";

const carrierPerformanceSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    required: true,
    index: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true,
    index: true
  },
  // Summary statistics
  totalInspections: {
    type: Number,
    default: 0
  },
  passCount: {
    type: Number,
    default: 0
  },
  failCount: {
    type: Number,
    default: 0
  },
  warningCount: {
    type: Number,
    default: 0
  },
  outOfServiceCount: {
    type: Number,
    default: 0
  },
  // Country breakdown
  canadaInspections: {
    type: Number,
    default: 0
  },
  usaInspections: {
    type: Number,
    default: 0
  },
  // Performance metrics
  passRate: {
    type: Number,
    default: 0 // Percentage
  },
  ossRate: {
    type: Number,
    default: 0 // Out of Service rate (percentage)
  },
  // Safety rating from document
  safetyRating: {
    type: String,
    enum: ['Satisfactory', 'Conditional', 'Unsatisfactory', null],
    default: null
  },
  // Document source
  documentSource: {
    type: String, // URL or path to the uploaded document
    default: null
  },
  documentUploadedAt: {
    type: Date,
    default: null
  },
  // Additional metadata
  notes: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, { 
  timestamps: true 
});

// Compound index for unique monthly records per company
carrierPerformanceSchema.index({ company: 1, year: 1, month: 1 }, { unique: true });

// Index for queries
carrierPerformanceSchema.index({ company: 1, year: -1, month: -1 });

export default mongoose.model("CarrierPerformance", carrierPerformanceSchema);

