import mongoose from 'mongoose';

// Sales Tax Jurisdiction Schema
const salesTaxSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  type: { 
    type: String, 
    required: true,
    enum: ['Origin', 'Destination'],
    trim: true
  },
  qbSync: { 
    type: Boolean, 
    default: false
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

export const SalesTax = mongoose.model('SalesTax', salesTaxSchema);

