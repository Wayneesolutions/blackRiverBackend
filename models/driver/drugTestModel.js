import mongoose from "mongoose";

const drugTestSchema = new mongoose.Schema({
  driverId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  testType: { 
    type: String, 
    required: true,
    enum: ['Pre-Employment', 'Random', 'Post-Accident', 'Reasonable Suspicion', 'Return-to-Duty', 'Follow-Up', 'Annual Physical']
  },
  reason: { 
    type: String, 
    required: true 
  },
  scheduledDate: { 
    type: Date, 
    required: true 
  },
  scheduledTime: { 
    type: String 
  },
  labName: { 
    type: String, 
    required: true 
  },
  consentFormUrl: {
    type: String
  },
  drugTestDocumentUrl: {
    type: String
  },
  collectionSiteName: { 
    type: String 
  },
  collectionSiteAddress: { 
    type: String 
  },
  collectionSitePhone: { 
    type: String 
  },
  importantDetails: { 
    type: String 
  },
  status: { 
    type: String, 
    enum: ['pending', 'scheduled', 'completed', 'cancelled'],
    default: 'pending'
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

// Auto-set status based on scheduled date
drugTestSchema.pre('save', function(next) {
  // If scheduled date is in the past and status is pending/scheduled, optionally set to completed
  // This can be customized based on business logic
  if (this.scheduledDate && this.status === 'pending' && !this.isModified('status')) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const scheduled = new Date(this.scheduledDate);
    scheduled.setHours(0, 0, 0, 0);
    
    // If scheduled date is today or in the future and status is pending, set to scheduled
    if (scheduled >= today && this.status === 'pending') {
      this.status = 'scheduled';
    }
  }
  next();
});

// Check if model already exists to prevent overwrite errors
export const DrugTest = mongoose.models.DrugTest || mongoose.model('DrugTest', drugTestSchema);

