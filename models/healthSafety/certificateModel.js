import mongoose from "mongoose";

const certificateSchema = new mongoose.Schema({
  certificateNumber: { type: String, required: true, unique: true },
  employee: { type: String, required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String, required: true },
  issueDate: { type: Date, required: true },
  expiryDate: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['active', 'expired', 'expiring-soon'],
    default: 'active'
  },
  issuingAuthority: { type: String },
  certificateUrl: { type: String },
  trainingId: { type: mongoose.Schema.Types.ObjectId, ref: "Training" },
  notes: { type: String },
  renewalRequired: { type: Boolean, default: false },
  renewalDate: { type: Date },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate certificate number before save
certificateSchema.pre('save', async function(next) {
  if (this.isNew && !this.certificateNumber) {
    const year = new Date().getFullYear();
    const CertificateModel = this.constructor;
    const count = await CertificateModel.countDocuments({
      certificateNumber: new RegExp(`^CERT-${year}-`)
    });
    this.certificateNumber = `CERT-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  // Auto-update status based on expiry date
  if (this.expiryDate) {
    const today = new Date();
    const expiry = new Date(this.expiryDate);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      this.status = 'expired';
    } else if (daysUntilExpiry <= 30) {
      this.status = 'expiring-soon';
    } else {
      this.status = 'active';
    }
  }
  
  next();
});

// Check if model already exists to prevent overwrite errors
export const Certificate = mongoose.models.Certificate || mongoose.model('Certificate', certificateSchema);

