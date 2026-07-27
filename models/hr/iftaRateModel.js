import mongoose from 'mongoose';

// IFTA Rate Schema
const iftaRateSchema = new mongoose.Schema({
  jurisdiction: { 
    type: String, 
    required: true,
    trim: true
  },
  rate: { 
    type: String, 
    required: true,
    trim: true
  },
  effectiveDate: { 
    type: Date, 
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

export const IftaRate = mongoose.model('IftaRate', iftaRateSchema);

