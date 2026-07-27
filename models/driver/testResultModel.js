import mongoose from "mongoose";

const testResultSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  testType: {
    type: String,
    required: true
  },
  questionBankId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "QuestionBank"
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  passed: {
    type: Boolean,
    required: true
  },
  attempts: {
    type: Number,
    default: 1,
    min: 1
  },
  answers: [{
    questionId: String,
    selectedAnswer: Number,
    isCorrect: Boolean
  }],
  // HR Approval
  hrApproved: {
    type: Boolean,
    default: false
  },
  hrRejected: {
    type: Boolean,
    default: false
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
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
testResultSchema.index({ driverId: 1, testType: 1 });
testResultSchema.index({ company: 1, testType: 1 });

// Check if model already exists to prevent overwrite errors
export const TestResult = mongoose.models.TestResult || mongoose.model('TestResult', testResultSchema);

