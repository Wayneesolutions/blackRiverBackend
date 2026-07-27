import mongoose from "mongoose";

const hazardSchema = new mongoose.Schema({
  hazardNumber: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  severity: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'],
    required: true
  },
  category: { type: String },
  location: { type: String, required: true },
  identifiedDate: { type: Date, required: true },
  controlMeasures: { type: String },
  riskRating: { type: String },
  status: { 
    type: String, 
    enum: ['identified', 'assessed', 'controlled', 'monitored', 'resolved'],
    default: 'identified'
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  dueDate: { type: Date },
  resolvedDate: { type: Date },
  inspectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Inspection" },
  notes: { type: String },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate hazard number before save (fallback if not set in controller)
hazardSchema.pre('save', async function(next) {
  if (this.isNew && !this.hazardNumber) {
    const year = new Date().getFullYear();
    const HazardModel = this.constructor;
    const count = await HazardModel.countDocuments({
      hazardNumber: new RegExp(`^HAZ-${year}-`)
    });
    this.hazardNumber = `HAZ-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Check if model already exists to prevent overwrite errors
export const Hazard = mongoose.models.Hazard || mongoose.model('Hazard', hazardSchema);

