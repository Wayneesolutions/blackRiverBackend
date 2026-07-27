import mongoose from "mongoose";

const driverOnboardingSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
  // Training completion
  trainingCompleted: {
    type: Boolean,
    default: false
  },
  trainingCompletedAt: {
    type: Date
  },
  // Tests completion
  testsCompleted: {
    type: Boolean,
    default: false
  },
  testsCompletedAt: {
    type: Date
  },
  requiredTests: [{
    testType: {
      type: String,
      enum: ['TDG', 'VEHICLE', 'HOS', 'WINTER']
    },
    passed: {
      type: Boolean,
      default: false
    },
    score: Number,
    completedAt: Date
  }],
  // Certificates
  certificatesUploaded: {
    type: Boolean,
    default: false
  },
  certificates: [{
    name: String,
    fileUrl: String,
    uploadedAt: Date
  }],
  // HR Approval
  hrApprovalStatus: {
    type: String,
    enum: ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  hrApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  hrApprovedAt: {
    type: Date
  },
  hrRejectionReason: {
    type: String
  },
  // Overall status
  onboardingStatus: {
    type: String,
    enum: ['NOT_STARTED', 'IN_PROGRESS', 'TESTS_PENDING', 'AWAITING_HR_APPROVAL', 'APPROVED', 'REJECTED'],
    default: 'NOT_STARTED'
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
driverOnboardingSchema.index({ driverId: 1 });
driverOnboardingSchema.index({ company: 1 });
driverOnboardingSchema.index({ onboardingStatus: 1 });

export const DriverOnboarding = mongoose.models.DriverOnboarding || mongoose.model('DriverOnboarding', driverOnboardingSchema);

