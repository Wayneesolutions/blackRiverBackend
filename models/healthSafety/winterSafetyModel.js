import mongoose from "mongoose";

const additionalItemSchema = new mongoose.Schema({
  item: { type: String, required: true },
  status: { type: Boolean, default: false },
  notes: { type: String }
}, { _id: true });

const winterSafetySchema = new mongoose.Schema({
  checklistNumber: { type: String, unique: true, sparse: true },
  date: { type: Date, required: true },
  time: { type: String },
  location: { type: String, required: true },
  performedBy: { type: String, required: true },
  performedById: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  
  // Vehicle/Area Inspected
  vehicleNumber: { type: String },
  areaInspected: { type: String },
  
  // Checklist Items
  snowIceRemoved: { type: Boolean, default: false },
  walkwaysCleared: { type: Boolean, default: false },
  saltApplied: { type: Boolean, default: false },
  tiresInspected: { type: Boolean, default: false },
  tireChainCondition: { 
    type: String, 
    enum: ['good', 'fair', 'replacement-needed', 'n/a']
  },
  heatingSystemFunctional: { type: Boolean, default: false },
  defrostFunctional: { type: Boolean, default: false },
  wipersCondition: { 
    type: String, 
    enum: ['good', 'fair', 'replacement-needed']
  },
  antifreezeLevels: { 
    type: String, 
    enum: ['adequate', 'low', 'empty']
  },
  emergencyKitPresent: { type: Boolean, default: false },
  
  // Additional Items
  additionalItems: [additionalItemSchema],
  
  // Hazards Identified
  hazardsIdentified: { type: Boolean, default: false },
  hazardDetails: { type: String },
  correctiveAction: { type: String },
  
  // Weather Conditions
  temperature: { type: Number },
  weatherConditions: { type: String },
  
  // Signatures
  signature: { type: String },
  supervisorApproval: { type: String },
  
  // Company & Metadata
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate checklist number before save
winterSafetySchema.pre('save', async function(next) {
  if (this.isNew && !this.checklistNumber) {
    const year = new Date().getFullYear();
    const WinterSafetyModel = this.constructor;
    const companyFilter = this.company ? { company: this.company } : {};
    const count = await WinterSafetyModel.countDocuments({
      checklistNumber: new RegExp(`^WS-${year}-`),
      ...companyFilter
    });
    this.checklistNumber = `WS-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

export const WinterSafety = mongoose.models.WinterSafety || mongoose.model('WinterSafety', winterSafetySchema);

