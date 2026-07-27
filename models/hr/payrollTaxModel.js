import mongoose from 'mongoose';

// Payroll Tax Formula Schema
const payrollTaxSchema = new mongoose.Schema({
  bracket: { 
    type: String, 
    required: true,
    trim: true
  },
  rate: { 
    type: String, 
    required: true,
    trim: true
  },
  classification: { 
    type: String, 
    required: true,
    enum: ['Employee', 'Owner-Operator'],
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

export const PayrollTax = mongoose.model('PayrollTax', payrollTaxSchema);

