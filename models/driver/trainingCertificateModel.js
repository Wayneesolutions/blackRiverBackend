import mongoose from "mongoose";

const trainingCertificateSchema = new mongoose.Schema({
  driverId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  certificateName: { 
    type: String, 
    required: true 
  },
  certificateType: { 
    type: String, 
    required: true 
  },
  issuedDate: { 
    type: Date, 
    required: true 
  },
  expiryDate: { 
    type: Date 
  },
  issuingAuthority: { 
    type: String, 
    required: true 
  },
  certificateNumber: { 
    type: String 
  },
  fileUrl: { 
    type: String 
  },
  fileName: { 
    type: String 
  },
  status: { 
    type: String, 
    enum: ['active', 'expired', 'expiring_soon'],
    default: 'active'
  },
  notes: { 
    type: String 
  },
  description: {
    type: String
  },
  ignoreExpiration: {
    type: Boolean,
    default: false
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
  }
}, {
  timestamps: true
});

// Auto-update status based on expiry date (only if ignoreExpiration is false)
trainingCertificateSchema.pre('save', function(next) {
  if (this.expiryDate && !this.ignoreExpiration) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(this.expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      this.status = 'expired';
    } else if (daysUntilExpiry <= 60) {
      this.status = 'expiring_soon';
    } else {
      this.status = 'active';
    }
  } else if (this.ignoreExpiration) {
    // If expiration is ignored, keep status as active
    this.status = 'active';
  }
  next();
});

// Check if model already exists to prevent overwrite errors
export const TrainingCertificate = mongoose.models.TrainingCertificate || mongoose.model('TrainingCertificate', trainingCertificateSchema);

