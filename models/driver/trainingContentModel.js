import mongoose from "mongoose";

const trainingContentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['PDF', 'VIDEO', 'IMAGE'],
    required: true
  },
  testType: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  assignedRoles: [{
    type: String
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
export const TrainingContent = mongoose.models.TrainingContent || mongoose.model('TrainingContent', trainingContentSchema);

