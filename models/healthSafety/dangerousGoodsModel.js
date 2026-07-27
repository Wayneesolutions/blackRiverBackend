import mongoose from "mongoose";

const mediaFileSchema = new mongoose.Schema({
  fileUrl: { type: String, required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, enum: ['image', 'video', 'document'], required: true },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { _id: true });

const dangerousGoodsSchema = new mongoose.Schema({
  logNumber: { type: String, unique: true, sparse: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  driverName: { type: String, required: true },
  vehicleNumber: { type: String, required: true },
  trailerNumber: { type: String },
  
  // Shipment Details
  shippingDocument: { type: String },
  unNumber: { type: String, required: true },
  properShippingName: { type: String, required: true },
  class: { type: String, required: true },
  packingGroup: { type: String },
  quantity: { type: String, required: true },
  
  // Placarding
  placardingRequired: { type: Boolean, default: false },
  placardingComplete: { type: Boolean, default: false },
  placardsInspected: { type: Boolean, default: false },
  
  // Documentation
  emergencyResponseInfo: { type: Boolean, default: false },
  tdgCertificateCurrent: { type: Boolean, default: false },
  securityPlan: { type: Boolean, default: false },
  
  // Incident
  incidentOccurred: { type: Boolean, default: false },
  incidentDetails: { type: String },
  
  // Compliance Checks
  segregationCorrect: { type: Boolean, default: false },
  packagingIntact: { type: Boolean, default: false },
  labelsLegible: { type: Boolean, default: false },
  
  // Documentation
  photoEvidence: [mediaFileSchema],
  
  // Signatures
  driverSignature: { type: String },
  
  // Company & Metadata
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate log number before save (use global max - unique index is on logNumber alone)
dangerousGoodsSchema.pre('save', async function(next) {
  if (this.isNew && !this.logNumber) {
    const year = new Date().getFullYear();
    const DangerousGoodsModel = this.constructor;
    const lastLog = await DangerousGoodsModel.findOne(
      { logNumber: new RegExp(`^TDG-${year}-`) },
      {},
      { sort: { logNumber: -1 } }
    ).select('logNumber').lean();
    let nextNum = 1;
    if (lastLog?.logNumber) {
      const match = lastLog.logNumber.match(new RegExp(`^TDG-${year}-(\\d+)$`));
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    this.logNumber = `TDG-${year}-${String(nextNum).padStart(4, '0')}`;
  }
  next();
});

export const DangerousGoods = mongoose.models.DangerousGoods || mongoose.model('DangerousGoods', dangerousGoodsSchema);

