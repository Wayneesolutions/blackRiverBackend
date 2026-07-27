import mongoose from "mongoose";

const emergencyContactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  department: { type: String, required: true },
  isPrimary: { type: Boolean, default: false },
  available24_7: { type: Boolean, default: false },
  alternatePhone: { type: String },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Check if model already exists to prevent overwrite errors
export const EmergencyContact = mongoose.models.EmergencyContact || mongoose.model('EmergencyContact', emergencyContactSchema);

