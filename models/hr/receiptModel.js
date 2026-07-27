import mongoose from 'mongoose';

// Receipt Schema - for storing digital receipts
const receiptSchema = new mongoose.Schema({
  date: { 
    type: Date, 
    required: true,
    default: Date.now
  },
  amount: { 
    type: Number, 
    required: true 
  },
  payeeVendor: { 
    type: String, 
    required: true,
    trim: true
  },
  expenseType: { 
    type: String, 
    required: true,
    enum: ['Fuel', 'Repair', 'Permit Fees', 'Scales', 'Other'],
    default: 'Other'
  },
  fileName: { 
    type: String,
    trim: true
  },
  fileUrl: { 
    type: String, // URL to the receipt file
    required: true
  },
  fileType: { 
    type: String, // PDF, JPG, PNG, etc.
    trim: true
  },
  fileSize: {
    type: Number // File size in bytes
  },
  thumbnail: { 
    type: String, // Optional thumbnail URL
    default: null
  },
  description: {
    type: String,
    trim: true
  },
  uploadedBy: {
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

export const Receipt = mongoose.model('Receipt', receiptSchema);

