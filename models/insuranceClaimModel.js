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
  // Canada / USA tab on the Insurance Claims page
  country: {
    type: String,
    enum: ['canada', 'usa'],
    lowercase: true
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

// Generate claim number if not provided. This must run before validation —
// claimNumber is required, and a pre('save') hook runs only after validation,
// so a claim saved without a number used to fail with "claimNumber is required".
insuranceClaimSchema.pre('validate', async function(next) {
  if (!this.claimNumber) {
    // Next number after the highest CLM-###### in use (a count breaks once claims are deleted)
    const latest = await mongoose.model('InsuranceClaim')
      .findOne({ claimNumber: /^CLM-\d+$/ })
      .sort({ claimNumber: -1 })
      .select('claimNumber')
      .lean();
    let nextNumber = latest ? parseInt(latest.claimNumber.replace('CLM-', ''), 10) + 1 : 1;
    // Guard against a race with another request creating a claim at the same moment
    // eslint-disable-next-line no-await-in-loop
    while (await mongoose.model('InsuranceClaim').exists({ claimNumber: `CLM-${String(nextNumber).padStart(6, '0')}` })) nextNumber++;
    this.claimNumber = `CLM-${String(nextNumber).padStart(6, '0')}`;
  }
  next();
});

insuranceClaimSchema.pre('save', async function(next) {
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

