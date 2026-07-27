import mongoose from 'mongoose';

// Payment Method Schema
const paymentMethodSchema = new mongoose.Schema({
  method: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { 
    type: String, 
    required: true,
    trim: true
  },
  preferred: { 
    type: String, 
    required: true,
    enum: ['Driver', 'Vendor', 'Carrier'],
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

export const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);

