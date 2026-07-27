import mongoose from "mongoose";

const OPERATION_STATUSES = ["available", "in-transit", "maintenance", "idle"];
const UNIT_TYPES = [
  "Truck",
  "Trailer",
  "Reefer Trailer",
  "Tri-Axle Trailer",
  "Dry Van",
  "Flatbed",
  "Step Deck",
  "Lowboy",
  "Tank Trailer",
  "Dump Trailer",
  "Bus/Van"
];

const fleetUnitSchema = new mongoose.Schema(
  {
    unitNo: { type: String, required: true },
    internalId: { type: String, unique: true, sparse: true }, // Internal ID for tracking
    unitType: { type: String, enum: UNIT_TYPES, required: true },
    makeModel: { type: String, required: true },
    make: { type: String },
    model: { type: String },
    vinNo: { type: String, required: true },
    licensePlate: { type: String, required: true },
    year: { type: Number },
    truckType: { type: String },
    trailerType: { type: String },
    capacity: { type: String },
    initialOdometer: { type: Number, default: 0 },
    currentOdometer: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active"
    },
    operationStatus: {
      type: String,
      enum: OPERATION_STATUSES,
      default: "available"
    },
    currentLocation: {
      address: { type: String },
      longitude: { type: String },
      latitude: { type: String },
      updatedAt: { type: Date, default: Date.now }
    },
    // GPS Tracking Fields (similar to Vehicle model)
    speed: { type: Number, default: 0 }, // km/h
    fuelLevel: { type: Number, default: 0 }, // %
    odometer: { type: Number, default: 0 }, // km
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
    lastDate: { type: Date },
    reason: { type: String },
    safetyExpiryDate: { type: Date },
    safetyDecalNumber: { type: String },
    safetyPaperNumber: { type: String },
    lastInspectionShop: { type: String },
    lastInspectionInvoice: { type: String },
    // Service intervals for maintenance scheduling
    serviceIntervalDays: { type: Number, default: null }, // Service interval in days
    serviceIntervalMileage: { type: Number, default: null }, // Service interval in kilometers
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  {
    timestamps: true
  }
);

fleetUnitSchema.index({ unitNo: 1, company: 1 }, { unique: true });
fleetUnitSchema.index({ vinNo: 1, company: 1 }, { unique: true });
fleetUnitSchema.index({ licensePlate: 1, company: 1 }, { unique: true });
fleetUnitSchema.index({ internalId: 1, company: 1 }, { unique: true, sparse: true });

export const FleetUnit = mongoose.model("FleetUnit", fleetUnitSchema);


