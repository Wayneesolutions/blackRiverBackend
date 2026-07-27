import mongoose from 'mongoose';

const insuranceClaimSchema = new mongoose.Schema({
  claimNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  accidentNumber: {
    type: String,
    trim: true
  },
  incidentDate: {
    type: Date,
    required: true
  },
  claimDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  claimType: {
    type: String,
    enum: ['accident', 'theft', 'damage', 'liability', 'other'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'under-review', 'approved', 'denied', 'closed'],
    default: 'pending'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  deductible: {
    type: Number,
    default: 0,
    min: 0
  },
  claimAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'vehicleModel',
    required: true
  },
  vehicleModel: {
    type: String,
    enum: ['Vehicle', 'FleetUnit'],
    default: 'Vehicle'
  },
  insuranceCompany: {
    type: String,
    required: true,
    trim: true
  },
  policyNumber: {
    type: String,
    required: true,
    trim: true
  },
  adjusterName: {
    type: String,
    trim: true
  },
  adjusterContact: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  location: {
    type: String,
    trim: true
  },
  notes: {
    type: String
  },
  documents: [{
    type: String
  }],
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanySettings',
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Generate claim number if not provided
insuranceClaimSchema.pre('save', async function(next) {
  if (!this.claimNumber) {
    const count = await mongoose.model('InsuranceClaim').countDocuments();
    this.claimNumber = `CLM-${String(count + 1).padStart(6, '0')}`;
  }
  
  // Calculate claim amount
  if (this.amount && this.deductible !== undefined) {
    this.claimAmount = Math.max(0, this.amount - this.deductible);
  }
  
  next();
});

// Indexes
insuranceClaimSchema.index({ company: 1, claimDate: -1 });
insuranceClaimSchema.index({ driver: 1 });
insuranceClaimSchema.index({ vehicle: 1 });
insuranceClaimSchema.index({ status: 1 });
insuranceClaimSchema.index({ claimType: 1 });

export const InsuranceClaim = mongoose.model('InsuranceClaim', insuranceClaimSchema);

