import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
  reportNumber: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['Monthly Summary', 'Incident Analysis', 'Inspection Summary', 'Training Report', 'CAPA Report', 'Custom'],
    required: true
  },
  period: { type: String, required: true }, // e.g., "January 2024", "Q1 2024"
  periodType: { 
    type: String, 
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
    required: true
  },
  startDate: { type: Date },
  endDate: { type: Date },
  generatedDate: { type: Date, default: Date.now },
  status: { 
    type: String, 
    enum: ['generated', 'pending', 'failed'],
    default: 'generated'
  },
  fileUrl: { type: String },
  fileName: { type: String },
  fileType: { type: String }, // 'pdf' or 'excel'
  reportData: { type: mongoose.Schema.Types.Mixed }, // Store aggregated data
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate report number before save
reportSchema.pre('save', async function(next) {
  if (this.isNew && !this.reportNumber) {
    const year = new Date().getFullYear();
    const ReportModel = this.constructor;
    const count = await ReportModel.countDocuments({
      reportNumber: new RegExp(`^RPT-${year}-`)
    });
    this.reportNumber = `RPT-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Check if model already exists to prevent overwrite errors
export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);

