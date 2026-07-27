import mongoose from "mongoose";

const committeeMemberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  department: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Check if model already exists to prevent overwrite errors
export const CommitteeMember = mongoose.models.CommitteeMember || mongoose.model('CommitteeMember', committeeMemberSchema);

