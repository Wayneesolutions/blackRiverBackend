import mongoose from 'mongoose';

// SMS Billing Schema
const smsBillingSchema = new mongoose.Schema({
  timestamp: { 
    type: Date, 
    required: true,
    default: Date.now
  },
  recipient: { 
    type: String, 
    required: true,
    trim: true
  },
  content: { 
    type: String, 
    required: true,
    trim: true
  },
  cost: { 
    type: Number, 
    required: true,
    min: 0,
    default: 0.05
  },
  account: { 
    type: String, 
    required: true,
    trim: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanySettings',
    required: true,
    index: true
  }
}, { 
  timestamps: true 
});

export const SmsBilling = mongoose.model('SmsBilling', smsBillingSchema);

