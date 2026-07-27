import mongoose from "mongoose";

const mediaFileSchema = new mongoose.Schema({
  fileUrl: { type: String, required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, enum: ['image', 'video', 'document'], required: true },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { _id: true });

const checklistItemSchema = new mongoose.Schema({
  item: { type: String, required: true },
  checked: { type: Boolean, default: false },
  notes: { type: String }
}, { _id: true });

const loadSecurementSchema = new mongoose.Schema({
  logNumber: { type: String, unique: true, sparse: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  driverName: { type: String, required: true },
  vehicleNumber: { type: String, required: true },
  trailerNumber: { type: String },
  
  // Load Details
  loadType: { type: String, required: true },
  loadWeight: { type: Number },
  loadDescription: { type: String },
  destination: { type: String },
  
  // Securement Method
  securedBy: { 
    type: String, 
    enum: ['straps', 'chains', 'tarps', 'combination', 'bulkhead', 'other'],
    required: true 
  },
  numberOfStraps: { type: Number },
  numberOfChains: { type: Number },
  tarpUsed: { type: Boolean, default: false },
  
  // Checklist
  checklistComplete: { type: Boolean, default: false },
  checklistItems: [checklistItemSchema],
  
  // Verification
  verifiedBy: { type: String },
  verificationTime: { type: String },
  photoEvidence: [mediaFileSchema],
  
  // Compliance
  meetsStandards: { type: Boolean, default: false },
  standardsReference: { type: String },
  deficienciesNoted: { type: String },
  
  // Signatures
  driverSignature: { type: String },
  supervisorSignature: { type: String },
  
  // Company & Metadata
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate log number before save (use global max - unique index is on logNumber alone)
loadSecurementSchema.pre('save', async function(next) {
  if (this.isNew && !this.logNumber) {
    const year = new Date().getFullYear();
    const LoadSecurementModel = this.constructor;
    const lastLog = await LoadSecurementModel.findOne(
      { logNumber: new RegExp(`^LS-${year}-`) },
      {},
      { sort: { logNumber: -1 } }
    ).select('logNumber').lean();
    let nextNum = 1;
    if (lastLog?.logNumber) {
      const match = lastLog.logNumber.match(new RegExp(`^LS-${year}-(\\d+)$`));
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    this.logNumber = `LS-${year}-${String(nextNum).padStart(4, '0')}`;
  }
  next();
});

export const LoadSecurement = mongoose.models.LoadSecurement || mongoose.model('LoadSecurement', loadSecurementSchema);

