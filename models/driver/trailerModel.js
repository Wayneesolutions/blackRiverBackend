import mongoose from "mongoose";

const trailerSchema = new mongoose.Schema(
  {
    // Basic Information (from frontend form)
    unitNumber: { type: String }, // Also used as internalId
    trailer: { type: String }, // Trailer number/identifier
    vinNumber: { type: String, sparse: true },
    plateNumber: { type: String, required: true },
    make: { type: String },
    model: { type: String },
    year: { type: String },
    weight: { type: String },
    uom: { type: String, enum: ['Kg', 'Lbs'], default: 'Kg' },
    registrationCountry: { type: String },
    registrationProvince: { type: String },
    type: { 
      type: String, 
      enum: ['RF', 'DV', 'FB', 'dry_van', 'refrigerated', 'flatbed', 'tanker', 'container', 'Reefer Trailer', 'Tri-Axle Trailer', 'Dry Van', 'Flatbed', 'Step Deck', 'Lowboy', 'Tank Trailer', 'Dump Trailer'],
    },
    status: {
      type: String,
      enum: ['In Service', 'Out of Service', 'Maintenance', 'moving', 'idle', 'stopped', 'maintenance'],
      default: 'In Service'
    },
    ownership: {
      type: String,
      enum: ['COMPANY ASSET', 'THIRD PARTY ASSET'],
      default: 'COMPANY ASSET'
    },
    subType: {
      type: String,
      enum: ['HIGHWAY USE', 'CITY USE', 'STORAGE USE', 'RENTAL', 'OTHER', '']
    },
    
    // Legacy fields (for backward compatibility)
    ownerShip: { type: String },
    lastDispatch: { type: String },
    lastDispatchDate: { type: Date },
    lastDropLocation: { type: String },
    note: { type: String },
    notes: { type: String }, // For multiple notes
    operationStatus: { 
      type: String, 
      enum: ['IN SERVICE', 'OUT OF SERVICE', 'MAINTENANCE', 'in_transit', 'loading', 'idle', 'maintenance', 'available'],
      default: 'IN SERVICE' 
    },
    loadedStatus: {
      type: String,
      enum: ['LOADED', 'IDLE', 'SCHEDULED']
    },
    loadStatus: { type: String },
    compliance: {
      type: String,
      enum: ['COMPLIANT', 'NON-COMPLIANT', 'EXPIRING SOON']
    },
    compilance: { type: String }, // Legacy typo
    category: {
      type: String,
      enum: ['MB', 'AB', 'TX', 'External', 'Unassigned']
    },
    
    // Image
    imageUrl: { type: String },
    trailerImageUrl: { type: String },
    
    // GPS Tracking Fields
    internalId: { type: String, sparse: true }, // For Termoking integration
    currentLocation: {
      address: { type: String },
      longitude: { type: String },
      latitude: { type: String },
      updatedAt: { type: Date, default: Date.now }
    },
    speed: { type: Number, default: 0 }, // km/h
    
    // Trailer-specific fields
    capacity: { type: String },
    isAttached: { type: Boolean, default: false },
    attachedVehicle: { 
      type: mongoose.Types.ObjectId, 
      ref: "Vehicle" 
    },
    yard: { 
      type: mongoose.Types.ObjectId, 
      ref: "Yard" 
    },
    
    // Cargo Information
    cargoDetails: {
      cargoType: { type: String },
      weight: { type: Number, default: 0 },
      capacity: { type: Number },
      description: { type: String },
      temperature: { type: Number }, // For refrigerated trailers
      isRefrigerated: { type: Boolean, default: false }
    },
    
    // Sensor Data
    sensors: {
      doorStatus: { 
        type: String, 
        enum: ['locked', 'unlocked', 'open'],
        default: 'locked' 
      },
      temperature: { type: Number },
      humidity: { type: Number },
      shockDetection: { type: Boolean, default: false },
      tilting: { type: Boolean, default: false }
    },
    
    // Maintenance Information
    maintenance: {
      lastService: { type: Date },
      nextService: { type: Date },
      tyreCondition: { 
        type: String, 
        enum: ['good', 'fair', 'poor'],
        default: 'good' 
      },
      brakeCondition: { 
        type: String, 
        enum: ['good', 'fair', 'poor'],
        default: 'good' 
      },
      issues: [{ type: String }]
    },
    
    // Route History
    route: [{
      latitude: { type: String },
      longitude: { type: String },
      timestamp: { type: Date }
    }],
    
    destination: {
      address: { type: String },
      latitude: { type: String },
      longitude: { type: String },
      updatedAt: { type: Date }
    },
    
    // Safety compliance fields
    safetyExpiryDate: {
      type: Date,
    },
    safetyDecalNumber: {
      type: String,
      trim: true,
    },
    safetyPaperNumber: {
      type: String,
      trim: true,
    },
    lastInspectionShop: {
      type: String,
      trim: true,
    },
    lastInspectionInvoice: {
      type: String,
      trim: true,
    },
    
    // Inspections
    oneTimeInspections: [{
      expiryDate: { type: Date },
      description: { type: String },
      ignoreExpiration: { type: Boolean, default: false },
      fileUrl: { type: String },
      fileName: { type: String }
    }],

    recurringInspections: [{
      scheduledOn: { type: Date },
      after: { type: String },
      unit: { type: String },
      description: { type: String },
      ignoreExpiration: { type: Boolean, default: false },
      fileUrl: { type: String },
      fileName: { type: String }
    }],

    // Incidents
    incidents: [{
      accidentNumber: { type: String },
      driver: { type: mongoose.Types.ObjectId, ref: "Driver" },
      coDriver: { type: mongoose.Types.ObjectId, ref: "Driver" },
      location: { type: String },
      date: { type: Date },
      time: { type: String },
      weather: { type: String },
      policeReport: { type: String },
      accidentReport: { type: String },
      thirdPartyInfo: { type: String },
      files: [{
        fileName: { type: String },
        fileUrl: { type: String },
        fileSize: { type: Number },
        fileType: { type: String },
        uploadedAt: { type: Date, default: Date.now }
      }]
    }],

    // Notes
    notesArray: [{
      note: { type: String },
      category: { type: String },
      createdAt: { type: Date, default: Date.now }
    }],
    
    // Invoices
    invoices: [{
      invoiceNumber: { type: String, required: true },
      vendorWorkshop: { type: String },
      amount: { type: String },
      invoiceDate: { type: Date },
      notes: { type: String },
      fileName: { type: String },
      fileUrl: { type: String },
      fileSize: { type: Number },
      mimeType: { type: String },
      uploadedAt: { type: Date, default: Date.now }
    }],
    
    company: { type: mongoose.Types.ObjectId, ref: "CompanySettings" }
  },
    
  { timestamps: true }
);

trailerSchema.index({ internalId: 1, company: 1 }, { unique: true, sparse: true });
trailerSchema.index({ plateNumber: 1, company: 1 }, { unique: true, sparse: true });
trailerSchema.index({ vinNumber: 1, company: 1 }, { unique: true, sparse: true });

export const Trailer = mongoose.model("Trailer", trailerSchema);
