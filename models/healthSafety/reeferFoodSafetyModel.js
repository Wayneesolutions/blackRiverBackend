import mongoose from "mongoose";

const mediaFileSchema = new mongoose.Schema({
  fileUrl: { type: String, required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, enum: ['image', 'video', 'document'], required: true },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { _id: true });

const reeferFoodSafetySchema = new mongoose.Schema({
  logNumber: { type: String, unique: true, sparse: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  driverName: { type: String, required: true },
  vehicleNumber: { type: String, required: true },
  trailerNumber: { type: String, required: true },
  
  // Temperature Monitoring
  temperatureRecorded: { type: Number, required: true },
  temperatureUnit: { 
    type: String, 
    enum: ['celsius', 'fahrenheit'],
    default: 'celsius'
  },
  targetTemperature: { type: Number, required: true },
  withinRange: { type: Boolean, default: false },
  
  // Cleanliness Inspection
  interiorCleanliness: { 
    type: String, 
    enum: ['excellent', 'good', 'fair', 'poor'],
    required: true 
  },
  odorDetected: { type: Boolean, default: false },
  odorDescription: { type: String },
  visibleContamination: { type: Boolean, default: false },
  contaminationDetails: { type: String },
  
  // Sanitation
  lastSanitized: { type: Date },
  sanitationMethod: { type: String },
  sanitationVerified: { type: Boolean, default: false },
  
  // Deficiencies
  deficienciesFound: { type: Boolean, default: false },
  deficiencyList: [{ type: String }],
  correctiveActionTaken: { type: String },
  
  // Documentation
  photoEvidence: [mediaFileSchema],
  
  // Signatures
  driverSignature: { type: String },
  inspectorSignature: { type: String },
  
  // Company & Metadata
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate log number before save
reeferFoodSafetySchema.pre('save', async function(next) {
  if (this.isNew && !this.logNumber) {
    const year = new Date().getFullYear();
    const ReeferFoodSafetyModel = this.constructor;
    const companyFilter = this.company ? { company: this.company } : {};
    const count = await ReeferFoodSafetyModel.countDocuments({
      logNumber: new RegExp(`^RF-${year}-`),
      ...companyFilter
    });
    this.logNumber = `RF-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

export const ReeferFoodSafety = mongoose.models.ReeferFoodSafety || mongoose.model('ReeferFoodSafety', reeferFoodSafetySchema);

