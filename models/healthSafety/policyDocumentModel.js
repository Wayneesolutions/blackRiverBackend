import mongoose from "mongoose";

const policyDocumentSchema = new mongoose.Schema({
  policyNumber: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  category: { type: String, required: true },
  version: { type: String, required: true },
  effectiveDate: { type: Date, required: true },
  reviewDate: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['active', 'draft', 'archived', 'under-review'],
    default: 'draft'
  },
  documentType: { 
    type: String, 
    enum: ['policy', 'procedure', 'guideline', 'form'],
    required: true
  },
  fileUrl: { type: String },
  fileName: { type: String },
  fileType: { type: String },
  description: { type: String },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  approvedDate: { type: Date },
  lastReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  lastReviewedDate: { type: Date },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate policy number before save
policyDocumentSchema.pre('save', async function(next) {
  if (this.isNew && !this.policyNumber) {
    const year = new Date().getFullYear();
    const PolicyDocumentModel = this.constructor;
    const count = await PolicyDocumentModel.countDocuments({
      policyNumber: new RegExp(`^POL-${year}-`)
    });
    this.policyNumber = `POL-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Check if model already exists to prevent overwrite errors
export const PolicyDocument = mongoose.models.PolicyDocument || mongoose.model('PolicyDocument', policyDocumentSchema);

