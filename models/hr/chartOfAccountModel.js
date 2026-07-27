import mongoose from 'mongoose';

// Chart of Accounts Schema
const chartOfAccountSchema = new mongoose.Schema({
  number: { 
    type: String, 
    required: true,
    trim: true
  },
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  type: { 
    type: String, 
    required: true,
    enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'],
    trim: true
  },
  balance: { 
    type: Number, 
    default: 0
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

export const ChartOfAccount = mongoose.model('ChartOfAccount', chartOfAccountSchema);

