import mongoose from "mongoose";

const findingSchema = new mongoose.Schema({
  description: { type: String, required: true },
  severity: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  category: { type: String },
  correctiveAction: { type: String },
  dueDate: { type: Date },
  status: { 
    type: String, 
    enum: ['open', 'in-progress', 'resolved', 'closed'],
    default: 'open'
  }
}, { _id: true, timestamps: true });

const hazardSchema = new mongoose.Schema({
  description: { type: String, required: true },
  severity: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'],
    required: true
  },
  category: { type: String },
  location: { type: String },
  controlMeasures: { type: String },
  riskRating: { type: String },
  status: { 
    type: String, 
    enum: ['identified', 'assessed', 'controlled', 'monitored'],
    default: 'identified'
  }
}, { _id: true, timestamps: true });

const inspectionSchema = new mongoose.Schema({
  inspectionNumber: { type: String, required: true, unique: true },
  date: { type: Date, required: true },
  type: { type: String, required: true },
  inspector: { type: String, required: true },
  location: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['scheduled', 'in-progress', 'completed', 'overdue'],
    default: 'scheduled'
  },
  findings: [findingSchema],
  hazards: [hazardSchema],
  notes: { type: String },
  scheduledDate: { type: Date },
  completedDate: { type: Date },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate inspection number before save
inspectionSchema.pre('save', async function(next) {
  if (this.isNew && !this.inspectionNumber) {
    const year = new Date().getFullYear();
    const InspectionModel = this.constructor;
    const count = await InspectionModel.countDocuments({
      inspectionNumber: new RegExp(`^INS-${year}-`)
    });
    this.inspectionNumber = `INS-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Virtual for findings count
inspectionSchema.virtual('findingsCount').get(function() {
  return this.findings ? this.findings.length : 0;
});

// Virtual for hazards count
inspectionSchema.virtual('hazardsCount').get(function() {
  return this.hazards ? this.hazards.length : 0;
});

// Check if model already exists to prevent overwrite errors
export const Inspection = mongoose.models.Inspection || mongoose.model('Inspection', inspectionSchema);

