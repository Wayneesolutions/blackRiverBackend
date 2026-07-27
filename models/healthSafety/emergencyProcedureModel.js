import mongoose from "mongoose";

const emergencyProcedureSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['medical', 'fire', 'spill', 'collision', 'breakdown', 'violence', 'other'],
    required: true 
  },
  procedure: { type: String, required: true },
  quickReferenceSteps: [{ type: String }],
  lastUpdated: { type: Date, default: Date.now },
  documentUrl: { type: String },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, {
  timestamps: true
});

emergencyProcedureSchema.pre('save', function(next) {
  if (this.isModified('procedure')) {
    this.lastUpdated = new Date();
  }
  next();
});

// Check if model already exists to prevent overwrite errors
export const EmergencyProcedure = mongoose.models.EmergencyProcedure || mongoose.model('EmergencyProcedure', emergencyProcedureSchema);

