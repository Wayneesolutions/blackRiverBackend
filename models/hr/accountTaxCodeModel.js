import mongoose from 'mongoose';

// Account Tax Code Schema
const accountTaxCodeSchema = new mongoose.Schema({
  code: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { 
    type: String, 
    required: true,
    trim: true
  },
  rate: { 
    type: Number, 
    required: true,
    min: 0
  },
  category: { 
    type: String, 
    required: true,
    enum: ['Sales Tax', 'IFTA', 'Payroll'],
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

export const AccountTaxCode = mongoose.model('AccountTaxCode', accountTaxCodeSchema);

