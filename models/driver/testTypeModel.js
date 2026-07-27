import mongoose from "mongoose";

const testTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index to ensure unique test type names per company
testTypeSchema.index({ name: 1, company: 1 }, { unique: true });

// Check if model already exists to prevent overwrite errors
export const TestType = mongoose.models.TestType || mongoose.model('TestType', testTypeSchema);

