import mongoose from 'mongoose';

// Labor Rate Schema - for shop labor rate setup
const laborRateSchema = new mongoose.Schema({
  rateType: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { 
    type: String,
    trim: true
  },
  rate: { 
    type: Number, 
    required: true,
    min: 0
  },
  isActive: { 
    type: Boolean, 
    default: true 
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

export const LaborRate = mongoose.model('LaborRate', laborRateSchema);

