import mongoose from "mongoose";

const actionTakenLogSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  action: { type: String, required: true },
  takenBy: { type: String, required: true },
  notes: { type: String }
}, { _id: true });

const costTrackingSchema = new mongoose.Schema({
  category: { type: String, required: true },
  estimated: { type: Number, required: true, min: 0 },
  actual: { type: Number, min: 0 },
  notes: { type: String }
}, { _id: true });

const locationSchema = new mongoose.Schema({
  city: { type: String, required: true },
  stateProvince: { type: String, required: true },
  country: { 
    type: String, 
    enum: ['usa', 'canada'], 
    required: true,
    default: 'usa'
  },
  streetAddress: { type: String, trim: true }
}, { _id: false });

const incidentSchema = new mongoose.Schema(
  {
    incidentNumber: {
      type: String,
      required: true,
      unique: true,
      default: function() {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000);
        return `INC-${year}-${random.toString().padStart(4, '0')}`;
      }
    },
    incidentDateTime: {
      type: Date,
      required: true
    },
    location: {
      type: locationSchema,
      required: true
    },
    incidentType: {
      type: String,
      required: true
    },
    incidentStatus: {
      type: String,
      enum: ['open', 'under-review', 'closed'],
      required: true,
      default: 'open'
    },
    caseFileNumber: {
      type: String,
      trim: true
    },
    supportingMedia: [{
      type: String
    }],
    // Personnel Details
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    coDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    driversLicense: {
      type: String,
      trim: true
    },
    reportingParty: {
      type: String,
      trim: true
    },
    // Equipment Details
    unitNumber: {
      type: String,
      trim: true
    },
    trailerNumber: {
      type: String,
      trim: true
    },
    vinPlateNumber: {
      type: String,
      trim: true
    },
    damageDescription: {
      type: String
    },
    // Investigation & Follow-up
    actionTakenLog: [actionTakenLogSchema],
    preventativeMeasures: {
      type: String
    },
    costTracking: [costTrackingSchema],
    cvsaDotImpact: {
      type: Boolean,
      default: false
    },
    fmcsaReportable: {
      type: Boolean,
      default: false
    },
    fmcsaNotes: {
      type: String
    },
    // Additional fields
    description: {
      type: String
    },
    witnessInfo: {
      type: String
    },
    policeReportNumber: {
      type: String,
      trim: true
    },
    notes: {
      type: String
    },
    // Accident-related fields
    accidentReport: {
      type: String
    },
    accidentPictures: [{
      type: String
    }],
    accidentVideo: {
      type: String
    },
    incidentId: {
      type: String,
      trim: true
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

// Indexes for faster queries
incidentSchema.index({ incidentStatus: 1 });
incidentSchema.index({ incidentDateTime: -1 });
incidentSchema.index({ driver: 1 });
incidentSchema.index({ 'location.country': 1 });
incidentSchema.index({ incidentType: 1 });

export const Incident = mongoose.model("Incident", incidentSchema);

