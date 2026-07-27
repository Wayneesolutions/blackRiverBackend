import mongoose from "mongoose";

const questionBankSchema = new mongoose.Schema({
  testName: {
    type: String,
    required: true
  },
  testType: {
    type: String,
    required: true
  },
  passingPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 80
  },
  mandatory: {
    type: Boolean,
    default: true
  },
  assignedRoles: [{
    type: String
  }],
  questions: [{
    question: {
      type: String,
      required: true
    },
    options: [{
      type: String,
      required: true
    }],
    correctAnswer: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  timestamps: true
});

// Check if model already exists to prevent overwrite errors
export const QuestionBank = mongoose.models.QuestionBank || mongoose.model('QuestionBank', questionBankSchema);

