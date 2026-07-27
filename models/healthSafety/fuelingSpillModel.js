import mongoose from "mongoose";

const spillDetailsSchema = new mongoose.Schema({
  quantity: { type: Number },
  causeOfSpill: { type: String },
  responseActions: { type: String },
  cleanupMethod: { type: String },
  disposalMethod: { type: String },
  reportFiled: { type: Boolean, default: false },
  incidentNumber: { type: String }
}, { _id: false });

const defHandlingSchema = new mongoose.Schema({
  containerClean: { type: Boolean, default: false },
  noCrossFuelContamination: { type: Boolean, default: false },
  properStorage: { type: Boolean, default: false }
}, { _id: false });

const fuelingSpillSchema = new mongoose.Schema({
  logNumber: { type: String, unique: true, sparse: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  location: { type: String, required: true },
  performedBy: { type: String, required: true },
  performedById: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  vehicleNumber: { type: String },
  
  // Pre-Fueling Checklist
  vehicleParked: { type: Boolean, default: false },
  engineOff: { type: Boolean, default: false },
  parkingBrakeSet: { type: Boolean, default: false },
  spillKitPresent: { type: Boolean, default: false },
  areaInspected: { type: Boolean, default: false },
  
  // Fueling Process
  fuelType: { 
    type: String, 
    enum: ['diesel', 'gasoline', 'DEF', 'propane', 'natural-gas'],
    required: true 
  },
  quantityDispensed: { type: Number },
  nozzleSecured: { type: Boolean, default: false },
  overflowPrevented: { type: Boolean, default: false },
  
  // Spill Incident
  spillOccurred: { type: Boolean, default: false },
  spillDetails: spillDetailsSchema,
  
  // DEF Handling (if applicable)
  defHandling: defHandlingSchema,
  
  // Post-Fueling
  capsSecured: { type: Boolean, default: false },
  noLeaksDetected: { type: Boolean, default: false },
  areaClean: { type: Boolean, default: false },
  
  // Signatures
  signature: { type: String },
  
  // Company & Metadata
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate log number before save
fuelingSpillSchema.pre('save', async function(next) {
  if (this.isNew && !this.logNumber) {
    const year = new Date().getFullYear();
    const FuelingSpillModel = this.constructor;
    const companyFilter = this.company ? { company: this.company } : {};
    const count = await FuelingSpillModel.countDocuments({
      logNumber: new RegExp(`^FP-${year}-`),
      ...companyFilter
    });
    this.logNumber = `FP-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

export const FuelingSpill = mongoose.models.FuelingSpill || mongoose.model('FuelingSpill', fuelingSpillSchema);

