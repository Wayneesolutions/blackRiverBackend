import mongoose from 'mongoose';

// Maintenance Plan Financials Schema
const maintenancePlanSchema = new mongoose.Schema({
  planName: { 
    type: String, 
    required: true,
    trim: true
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
  plannedCost: { 
    type: Number, 
    required: true,
    min: 0
  },
  actualCost: { 
    type: Number, 
    default: 0,
    min: 0
  },
  variance: { 
    type: Number, 
    default: 0
  },
  status: { 
    type: String, 
    enum: ['Scheduled', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Scheduled'
  },
  plannedDate: {
    type: Date
  },
  completedDate: {
    type: Date
  },
  description: {
    type: String,
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

// Calculate variance before saving
maintenancePlanSchema.pre('save', function(next) {
  if (this.actualCost !== undefined && this.plannedCost !== undefined) {
    this.variance = this.actualCost - this.plannedCost;
  }
  next();
});

export const MaintenancePlan = mongoose.model('MaintenancePlan', maintenancePlanSchema);

