import mongoose from 'mongoose';

// Financial Note Schema - for internal finance comments
const financialNoteSchema = new mongoose.Schema({
  noteTitle: { 
    type: String, 
    required: true,
    trim: true
  },
  noteContent: { 
    type: String, 
    required: true,
    trim: true
  },
  linkedTransactionType: {
    type: String,
    enum: ['Invoice', 'Settlement', 'Payment', 'Expense', 'Payroll', null],
    default: null
  },
  linkedTransactionId: { 
    type: String, // Store the transaction ID (e.g., "INV-2024-045", "STL-2024-003")
    trim: true,
    default: null
  },
  linkedTransaction: { // Full transaction reference string (e.g., "Invoice #INV-2024-045")
    type: String,
    trim: true,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

export const FinancialNote = mongoose.model('FinancialNote', financialNoteSchema);

