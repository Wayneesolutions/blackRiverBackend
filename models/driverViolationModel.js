import mongoose from "mongoose";

const driverViolationSchema = new mongoose.Schema(
  {
    violationId: {
      type: String,
      required: true,
      unique: true,
      default: function() {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000);
        return `VIO-${year}-${random.toString().padStart(4, '0')}`;
      }
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FleetUnit",
      index: true
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      required: true,
      index: true
    },
    violationType: {
      type: String,
      enum: [
        'speeding',
        'harsh-braking',
        'harsh-acceleration',
        'excessive-idling',
        'lane-violation',
        'traffic-light',
        'parking',
        'hours-of-service',
        'distracted-driving',
        'seatbelt',
        'accident',
        'ticket',
        'behaviour issue',
        'general',
        'warning letters',
        'other violation',
        'HOs',
        'other',
        'HOS',
        'Behaviour Issue',
        'Safety Violation',
        'Warning Letter',
        'General',
        'Other'
      ],
      required: true,
      index: true
    },
    severity: {
      type: String,
      enum: ['minor', 'moderate', 'major', 'critical', 'Low', 'Medium', 'High'],
      default: 'minor',
      index: true
    },
    date: {
      type: Date,
      required: true,
      index: true
    },
    dateOfIncident: {
      type: Date,
      index: true
    },
    title: {
      type: String
    },
    reportedBy: {
      type: String
    },
    actionTaken: {
      type: String,
      enum: ['None', 'Warning', 'Training', 'Suspension', ''],
      default: ''
    },
    location: {
      address: { type: String },
      latitude: { type: Number },
      longitude: { type: Number },
      city: { type: String },
      state: { type: String },
      country: { type: String }
    },
    violationDetails: {
      speedLimit: { type: Number }, // km/h or mph
      actualSpeed: { type: Number }, // km/h or mph
      speedOver: { type: Number }, // how much over the limit
      duration: { type: Number }, // in seconds (for idling, etc.)
      gForce: { type: Number }, // for harsh braking/acceleration
      distance: { type: Number } // in meters/km
    },
    source: {
      type: String,
      enum: ['geotab', 'manual', 'police-ticket', 'inspection', 'eld', 'dash-cam'],
      default: 'geotab',
      index: true
    },
    geotabData: {
      deviceId: { type: String },
      diagnosticId: { type: String },
      tripId: { type: String },
      eventId: { type: String }
    },
    ticketInfo: {
      ticketNumber: { type: String },
      officerName: { type: String },
      officerBadge: { type: String },
      courtDate: { type: Date },
      fineAmount: { type: Number }
    },
    currency: {
      type: String,
      enum: ['CAD', 'USD'],
      default: 'CAD'
    },
    amount: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['pending', 'acknowledged', 'disputed', 'resolved', 'dismissed', 'paid', 'Open', 'Under Review', 'Closed'],
      default: 'pending',
      index: true
    },
    description: { type: String },
    notes: { type: String },
    // File attachment fields (for direct file uploads)
    fileUrl: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    mimeType: { type: String },
    driverAcknowledged: { type: Boolean, default: false },
    driverAcknowledgedAt: { type: Date },
    driverComment: { type: String },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    reviewedAt: { type: Date },
    reviewNotes: { type: String },
    // Attachments (photos, videos, documents)
    attachments: [{
      fileUrl: { type: String },
      fileName: { type: String },
      fileType: { type: String },
      fileSize: { type: Number },
      uploadedAt: { type: Date, default: Date.now }
    }],
    // Points/scoring system
    points: { type: Number, default: 0 },
    impactOnScore: { type: Number, default: 0 },
    // Resolution
    resolution: {
      type: String,
      enum: ['warning', 'counseling', 'training', 'suspension', 'termination', 'no-action'],
    },
    resolvedAt: { type: Date },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Pre-save hook to sync dateOfIncident with date
driverViolationSchema.pre('save', function(next) {
  if (this.dateOfIncident && !this.date) {
    this.date = this.dateOfIncident;
  } else if (this.date && !this.dateOfIncident) {
    this.dateOfIncident = this.date;
  }
  next();
});

// Indexes for better query performance
driverViolationSchema.index({ driver: 1, date: -1 });
driverViolationSchema.index({ company: 1, date: -1 });
driverViolationSchema.index({ violationType: 1, severity: 1 });
driverViolationSchema.index({ status: 1, date: -1 });
driverViolationSchema.index({ 'geotabData.deviceId': 1 });

// Virtual for calculating age of violation
driverViolationSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const violationDate = new Date(this.date);
  const diffTime = Math.abs(now - violationDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

export const DriverViolation = mongoose.model("DriverViolation", driverViolationSchema);

