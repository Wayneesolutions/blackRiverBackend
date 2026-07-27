import mongoose from 'mongoose';

// Parts Cost Log Schema - tracks parts usage with costs
const partsCostLogSchema = new mongoose.Schema({
  partNumber: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { 
    type: String, 
    required: true,
    trim: true
  },
  unitCost: { 
    type: Number, 
    required: true,
    min: 0
  },
  quantity: { 
    type: Number, 
    required: true,
    min: 1
  },
  totalCost: {
    type: Number,
    min: 0
  },
  dateOfUse: { 
    type: Date, 
    required: true,
    default: Date.now
  },
  vehicle: { 
    type: String, 
    required: true,
    trim: true
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FleetUnit',
    default: null
  },
  workOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkOrder',
    default: null
  },
  sparePartId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SparePart',
    default: null
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

// Calculate totalCost before saving
partsCostLogSchema.pre('save', function(next) {
  if (this.unitCost && this.quantity) {
    this.totalCost = this.unitCost * this.quantity;
  }
  next();
});

export const PartsCostLog = mongoose.model('PartsCostLog', partsCostLogSchema);

