import mongoose from "mongoose";

const capaSchema = new mongoose.Schema({
  capaNumber: { type: String }, // Auto-generated in pre-save hook, not required
  title: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['corrective', 'preventive'],
    required: true
  },
  source: { type: String, required: true },
  issueDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['open', 'in-progress', 'completed', 'overdue'],
    default: 'open'
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  priority: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  description: { type: String },
  rootCause: { type: String },
  correctiveAction: { type: String },
  preventiveAction: { type: String },
  completionDate: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  verifiedDate: { type: Date },
  effectivenessReview: { type: String },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate CAPA number before save
capaSchema.pre('save', async function(next) {
  if (this.isNew && !this.capaNumber) {
    const year = new Date().getFullYear();
    const companyId = this.company;
    const CapaModel = this.constructor;
    
    // Count documents for this company and year to ensure unique numbering per company
    const countQuery = {
      capaNumber: new RegExp(`^CAPA-${year}-`),
      ...(companyId ? { company: companyId } : {})
    };
    
    const count = await CapaModel.countDocuments(countQuery);
    this.capaNumber = `CAPA-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  // Auto-update status to overdue if due date has passed and status is not completed
  if (this.dueDate && this.status !== 'completed') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(this.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    
    if (dueDate < today) {
      this.status = 'overdue';
    }
  }

  next();
});

// Compound unique index: capaNumber must be unique per company
capaSchema.index({ capaNumber: 1, company: 1 }, { unique: true });

// Check if model already exists to prevent overwrite errors
export const CAPA = mongoose.models.CAPA || mongoose.model('CAPA', capaSchema);

