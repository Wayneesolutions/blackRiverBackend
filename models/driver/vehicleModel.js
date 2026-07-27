import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema(
  {
    // Basic Information (from frontend form)
    unitNumber: { type: String }, // Also used as internalId
    internalId: { type: String, unique: true, sparse: true },
    plateNumber: { type: String, required: true, unique: true },
    vinNumber: { type: String, unique: true, sparse: true },
    make: { type: String },
    model: { type: String },
    year: { type: String },
    weight: { type: String },
    uom: { type: String, enum: ['Kg', 'Lbs'], default: 'Kg' },
    registrationCountry: { type: String },
    registrationProvince: { type: String },
    type: { 
      type: String, 
      enum: ['Truck', 'Semi-Truck', 'Tractor', 'Straight Truck', 'Box Truck', 'Flatbed Truck', 'Refrigerated Truck'],
    },
    status: {
      type: String,
      enum: ['In Service', 'Out of Service', 'Maintenance', 'moving', 'idle', 'stopped', 'maintenance'],
      default: 'In Service'
    },
    ownership: {
      type: String,
      enum: ['COMPANY ASSET', 'OWNER OPERATOR'],
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
    vehicleImage: [{ imageUrl: { type: String } }], // Legacy field
    avatar: { type: String },
    
    driver: { type: mongoose.Types.ObjectId, ref: "User" },
    trailer:{type:mongoose.Types.ObjectId,ref:'Trailer'},
    operator: { type: mongoose.Types.ObjectId, ref: "User" }, // Driver/Operator
    coOperator: { type: mongoose.Types.ObjectId, ref: "User" }, // Co-Operator (Reporter)
    fleet: { type: String }, // Fleet/Yard assignment (legacy - kept for backward compatibility)
    yard: { type: mongoose.Types.ObjectId, ref: "Yard" }, // Yard reference
    serialNumber:{type:String},
    capacity:{type:String},
    
    currentLocation: {
      address: { type: String },
      longitude: { type: String },
      latitude: { type: String },
      updatedAt: { type: Date, default: Date.now }
    },
    speed: { type: Number, default: 0 }, // km/h
    fuelLevel: { type: Number, default: 0 }, // %
    odometer: { type: Number, default: 0 }, // km
    trackingKey: { type: String }, // Tracking key for GPS/telematics
    assetValue: { type: Number }, // Asset value
    engineOn: { type: Boolean, default: false },

    // Behaviour Metrics
    driverBehaviour: {
      harshBraking: { type: Number, default: 0 },
      speedingEvents: { type: Number, default: 0 },
      idlingDuration: { type: Number, default: 0 } // minutes
    },

    // Engine Health
    engineHealth: {
      faultCodes: [{ code: String, description: String }],
      batteryVoltage: { type: Number, default: 12 },
      engineHours: { type: Number, default: 0 }
    },

    trips: [
      {
        startTime: { type: Date },
        endTime: { type: Date },
        route: [
          { latitude: String, longitude: String, timestamp: Date }
        ]
      }
    ],
    lastService: {
      oilChange: {
        mileage: { type: Number, default: 0 },
        date: { type: Date }
      },
      tireRotation: {
        mileage: { type: Number, default: 0 },
        date: { type: Date }
      },
      brakeInspection: {
        mileage: { type: Number, default: 0 },
        date: { type: Date }
      },
      generalMaintenance: {
        mileage: { type: Number, default: 0 },
        date: { type: Date }
      },
      other: {
        mileage: { type: Number, default: 0 },
        date: { type: Date }
      },
      inspection: {
        date: { type: Date }
      }
    },
   upcomingServices: [
      {
        serviceType: { 
          type: String, 
          enum: ["oil-change","tire-rotation","brake-inspection","general-maintenance","other","inspection"] 
        },
        status: { type: String, enum: ["overdue", "upcoming"] },
        dueDate: { type: Date },
        dueMileage: { type: Number }
      }
    ],
    serviceHistory: [
      {
        serviceType: { 
          type: String, 
          enum: ["oil-change","tire-rotation","brake-inspection","general-maintenance","other","inspection"] 
        },
        status: { type: String, enum: ["completed", "overdue", "upcoming"] },
        performedBy: { type: mongoose.Types.ObjectId, ref: "User" },
        performedAt: { type: Date },
        mileageAtService: { type: Number },
        notes: { type: String }
      }
    ],
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
      fileName: { type: String },
      fileUrl: { type: String }
    }],
    recurringInspections: [{
      scheduledOn: { type: String }, // e.g., "Monthly", "Quarterly"
      after: { type: String }, // e.g., "30 days"
      unit: { type: String }, // e.g., "days", "months"
      description: { type: String },
      ignoreExpiration: { type: Boolean, default: false },
      fileName: { type: String },
      fileUrl: { type: String }
    }],
    
    // Incidents/Accidents
    incidents: [{
      accidentNumber: { type: String },
      driver: { type: mongoose.Types.ObjectId, ref: "User" },
      coDriver: { type: mongoose.Types.ObjectId, ref: "User" },
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
        uploadedAt: { type: Date }
      }]
    }],
    
    // Notes (array of notes)
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

    // Owner Operator Payroll (Truck Ownership Information)
    // Stored only when ownership === 'OWNER OPERATOR'
    ownerOperatorPayroll: {
      corporationName: { type: String },
      fullAddress: { type: String },
      driverName: { type: String },
      email: { type: String },
      paymentMethod: { type: String, enum: ['PAID PER MILE', 'PAID PERCENT', 'PAID BY TRIP', 'PAID PER HOUR', ''] },
      // Per mile rates
      alone: { type: String },
      team: { type: String },
      empty: { type: String },
      emptyTeam: { type: String },
      // Extra rates (requested)
      pick: { type: String },
      drop: { type: String },
      layover: { type: String },
      // Other payment modes
      percentRate: { type: String },
      perTripAmount: { type: String },
      perHour: { type: String },
      companyPaysFuel: { type: Boolean, default: false },
      gstNo: { type: String },
      customHst: { type: String }
    },

    // Owner Operator Payroll Deductions/Additions (simple arrays stored on vehicle)
    payrollDeductions: [{
      startDate: { type: String },
      description: { type: String },
      fee: { type: String },
      interval: { type: String },
      currency: { type: String }
    }],
    payrollAdditions: [{
      startDate: { type: String },
      description: { type: String },
      amount: { type: String },
      interval: { type: String },
      currency: { type: String }
    }],
    
    // Company association for data isolation
    company: { 
      type: mongoose.Types.ObjectId, 
      ref: "CompanySettings",
      index: true // Index for faster queries
    }
  },
  { 
    timestamps: true,
  }
);

export const Vehicle = mongoose.model("Vehicle", vehicleSchema);
