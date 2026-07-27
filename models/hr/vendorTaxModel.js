import mongoose from 'mongoose';

// Vendor Tax Category Schema
const vendorTaxSchema = new mongoose.Schema({
  taxName: { 
    type: String, 
    required: true,
    trim: true
  },
  rate: { 
    type: String, 
    required: true,
    trim: true
  },
  payableAccount: { 
    type: String, 
    required: true,
    trim: true
  },
  expenseAccount: { 
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

export const VendorTax = mongoose.model('VendorTax', vendorTaxSchema);

