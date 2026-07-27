import mongoose from "mongoose";

const documentLibrarySchema = new mongoose.Schema({
  documentNumber: { type: String, unique: true, sparse: true },
  title: { type: String, required: true },
  description: { type: String },
  category: {
    type: String,
    enum: ['Safety Meeting', 'Toolbox Talk', 'Safety Bulletin', 'Investigation', 'Policy', 'Inspection', 'Training', 'First Aid', 'Other'],
    required: true
  },
  documentType: {
    type: String,
    enum: ['pdf', 'word', 'image', 'excel', 'other'],
    required: true
  },
  fileUrl: { type: String, required: true },
  fileName: { type: String, required: true },
  fileSize: { type: Number, required: true }, // bytes
  uploadedBy: { type: String, required: true },
  uploadedById: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploadedDate: { type: Date, default: Date.now },
  tags: [{ type: String }],
  
  // Retention Management
  retentionPeriod: { type: Number, required: true }, // months
  retentionStartDate: { type: Date, required: true },
  retentionEndDate: { type: Date, required: true }, // calculated: retentionStartDate + retentionPeriod months
  retentionStatus: {
    type: String,
    enum: ['active', 'expiring-soon', 'expired', 'archived'],
    default: 'active'
  },
  autoDelete: { type: Boolean, default: false },
  retentionNotes: { type: String },
  
  // Compliance
  requiredForAudit: { type: Boolean, default: false },
  auditCategory: { type: String },
  relatedIncident: { type: String },
  relatedHazard: { type: String },
  relatedInspection: { type: String },
  
  // Access Control
  accessLevel: {
    type: String,
    enum: ['public', 'restricted', 'confidential'],
    default: 'public'
  },
  allowedRoles: [{ type: String }],
  
  // Company & Metadata
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate document number before save
documentLibrarySchema.pre('save', async function(next) {
  if (this.isNew && !this.documentNumber) {
    const year = new Date().getFullYear();
    const DocumentLibraryModel = this.constructor;
    const companyFilter = this.company ? { company: this.company } : {};
    const count = await DocumentLibraryModel.countDocuments({
      documentNumber: new RegExp(`^DOC-${year}-`),
      ...companyFilter
    });
    this.documentNumber = `DOC-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  
  // Calculate retention end date if not set
  if (this.retentionStartDate && this.retentionPeriod && !this.retentionEndDate) {
    const endDate = new Date(this.retentionStartDate);
    endDate.setMonth(endDate.getMonth() + this.retentionPeriod);
    this.retentionEndDate = endDate;
  }
  
  // Calculate retention status
  if (this.retentionEndDate) {
    const now = new Date();
    const end = new Date(this.retentionEndDate);
    const daysUntilExpiry = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      this.retentionStatus = 'expired';
    } else if (daysUntilExpiry <= 30) {
      this.retentionStatus = 'expiring-soon';
    } else if (this.retentionStatus !== 'archived') {
      this.retentionStatus = 'active';
    }
  }
  
  next();
});

// Check if model already exists to prevent overwrite errors
export const DocumentLibrary = mongoose.models.DocumentLibrary || mongoose.model('DocumentLibrary', documentLibrarySchema);

