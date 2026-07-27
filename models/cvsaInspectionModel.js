import mongoose from "mongoose";

const violationSchema = new mongoose.Schema({
  code: { type: String, required: true },
  description: { type: String, required: true },
  severity: { 
    type: String, 
    enum: ['minor', 'major', 'critical'], 
    required: true 
  }
}, { _id: true });

const cvsaInspectionSchema = new mongoose.Schema(
  {
    inspectionId: { 
      type: String, 
      required: true, 
      unique: true,
      default: function() {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000);
        return `CVSA-${year}-${random.toString().padStart(4, '0')}`;
      }
    },
    country: { 
      type: String, 
      enum: ['canada', 'usa'], 
      required: true 
    },
    date: { 
      type: Date, 
      required: false 
    },
    location: { 
      type: String, 
      required: true 
    },
    status: { 
      type: String, 
      enum: ['pass', 'fail', 'warning', 'out-of-service'], 
      required: true 
    },
    vehicle: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Vehicle", 
      required: false // Optional for aggregated records from carrier profile documents
    },
    driver: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: false // Optional for aggregated records from carrier profile documents
    },
    inspectorName: { 
      type: String, 
      required: false 
    },
    violations: [violationSchema],
    notes: { 
      type: String 
    },
    // Additional fields for tracking
    inspectionType: {
      type: String,
      enum: ['level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6'],
      default: 'level-1'
    },
    outOfServiceDate: {
      type: Date
    },
    // Documents/photos related to inspection
    documents: [{
      documentUrl: { type: String },
      documentType: { type: String }
    }],
    // Official Document Numbers
    reportNumber: {
      type: String,
      trim: true
    },
    inspectionLevel: {
      type: String,
      enum: ['I', 'II', 'III', 'IV', 'V'],
      default: 'I'
    },
    jurisdiction: {
      type: String,
      trim: true
    },
    // Driver & Carrier Specific IDs
    driverLicenseNumber: {
      type: String,
      trim: true
    },
    carrierUSDOTNumber: {
      type: String,
      trim: true
    },
    carrierMotorCarrierNumber: {
      type: String,
      trim: true
    },
    // Time & Documentation
    timeOfInspection: {
      type: String,
      trim: true
    },
    documentLink: {
      type: String,
      trim: true
    },
    // Out-of-Service Specifics
    outOfServiceIssued: {
      type: Boolean,
      default: false
    },
    outOfServiceReleaseDate: {
      type: Date
    },
    defectRepairNeeded: {
      type: Boolean,
      default: false
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      index: true
    }
  },
  { 
    timestamps: true 
  }
);

// Index for faster queries
cvsaInspectionSchema.index({ country: 1, date: -1 });
cvsaInspectionSchema.index({ vehicle: 1 });
cvsaInspectionSchema.index({ driver: 1 });
cvsaInspectionSchema.index({ status: 1 });

export const CvsaInspection = mongoose.model("CvsaInspection", cvsaInspectionSchema);

