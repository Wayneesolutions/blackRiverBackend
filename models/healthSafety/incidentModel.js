import mongoose from "mongoose";

const mediaFileSchema = new mongoose.Schema({
  fileUrl: { type: String, required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, enum: ['image', 'video', 'document'], required: true },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { _id: true });

const witnessStatementSchema = new mongoose.Schema({
  witnessName: { type: String, required: true },
  witnessRole: { type: String, required: true },
  statement: { type: String, required: true },
  signedDate: { type: Date, required: true },
  documentUrl: { type: String }
}, { _id: true });

const investigationToolSchema = new mongoose.Schema({
  type: { type: String, enum: ['5-why', 'fishbone'], required: true },
  rootCause: { type: String, required: true },
  findings: [{ type: String }],
  analysis: { type: String, required: true }
}, { _id: false });

const investigationSchema = new mongoose.Schema({
  lead: { type: String, required: true },
  startDate: { type: Date, required: true },
  completedDate: { type: Date },
  rootCauseAnalysis: investigationToolSchema,
  findings: { type: String, required: true }
}, { _id: false });

const capaSchema = new mongoose.Schema({
  capaNumber: { type: String, required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ['open', 'in-progress', 'completed', 'overdue'], default: 'open' },
  description: { type: String, required: true },
  reminderSent: { type: Boolean, default: false },
  escalationLevel: { type: Number, default: 0 },
  followUpVerification: { type: String },
  verifiedDate: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { _id: false });

const progressNoteSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  note: { type: String, required: true },
  enteredBy: { type: String, required: true }
}, { _id: true });

const injuryRecordSchema = new mongoose.Schema({
  injuredWorker: { type: String, required: true },
  injuryDate: { type: Date, required: true },
  injuryType: { type: String, required: true },
  bodyPart: { type: String, required: true },
  severity: { type: String, required: true },
  modifiedDutyPlan: { type: String },
  doctorRestrictions: { type: String },
  returnToWorkDate: { type: Date },
  progressNotes: [progressNoteSchema],
  wcbClaimNumber: { type: String },
  wcbDocuments: [mediaFileSchema]
}, { _id: false });

const incidentSchema = new mongoose.Schema({
  incidentNumber: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  location: { type: String, required: true },
  locationType: { 
    type: String, 
    enum: ['warehouse', 'yard', 'shop', 'highway', 'other'],
    required: true 
  },
  type: { 
    type: String, 
    enum: ['Driver Injury', 'Vehicle Accident', 'Workplace Incident', 'Near Miss'],
    required: true 
  },
  severity: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'],
    required: true 
  },
  status: { 
    type: String, 
    enum: ['open', 'investigating', 'action-required', 'resolved', 'closed'],
    default: 'open' 
  },
  reportedBy: { type: String, required: true },
  reportedByRole: { type: String, required: true },
  description: { type: String, required: true },
  hasInjury: { type: Boolean, default: false },
  
  // Evidence & Documentation
  photoEvidence: [mediaFileSchema],
  videoEvidence: [mediaFileSchema],
  workerStatements: [witnessStatementSchema],
  witnessReports: [witnessStatementSchema],
  
  // Investigation
  investigation: investigationSchema,
  
  // CAPA Link
  capa: capaSchema,
  
  // Injury Management
  injuryRecord: injuryRecordSchema,
  
  // WCB/WSIB
  wcbClaimNumber: { type: String },
  wcbDocuments: [mediaFileSchema],
  
  // Company & Metadata
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate incident number before save
incidentSchema.pre('save', async function(next) {
  if (this.isNew && !this.incidentNumber) {
    const year = new Date().getFullYear();
    // Use the model constructor to count documents
    const IncidentModel = this.constructor;
    const query = {
      incidentNumber: new RegExp(`^INC-${year}-`)
    };
    
    // Filter by company if provided (for multi-tenant support)
    if (this.company) {
      query.company = this.company;
    }
    
    const count = await IncidentModel.countDocuments(query);
    this.incidentNumber = `INC-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Compound unique index: incidentNumber must be unique per company
incidentSchema.index({ incidentNumber: 1, company: 1 }, { unique: true });

// Check if model already exists to prevent overwrite errors
// Use unique name to avoid conflict with compliance Incident model
export const Incident = mongoose.models.HealthSafetyIncident || mongoose.model('HealthSafetyIncident', incidentSchema);

