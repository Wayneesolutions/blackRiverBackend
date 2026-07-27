import mongoose from "mongoose";

const ServiceType = [
  "oil-change",
  "dpf-filter",
  "valve-adjustment",
  "radiator-change",
  "oil-pump",
  "coolant-filter",
  "after-treatment-system",
  "transmission-service",
  "brake-inspection",
  "tire-rotation",
  "general-maintenance",
  "inspection",
  "other"
];
const Priority = ["low", "medium", "high", "urgent"];

const vehicleServiceSchema = new mongoose.Schema(
  {
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
    },
    serviceType: {
      type: String,
      // Allow enum values for backward compatibility, but also allow custom service types
      // Custom service types are generated from company service names (kebab-case)
      required: true,
      validate: {
        validator: function(value) {
          // Allow standard enum values
          if (ServiceType.includes(value)) {
            return true;
          }
          // Allow custom service types (kebab-case format: lowercase with hyphens)
          // Must match pattern: lowercase letters, numbers, and hyphens only
          const customServicePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
          return customServicePattern.test(value);
        },
        message: 'Service type must be a valid standard type or a custom service type (kebab-case format)'
      }
    },
    priority: {
      type: String,
      enum: Priority,
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    dueMileage: {
      type: Number,
      required: true,
    },
    assignedMechanic: {
      type: String,
      default: "Fleet Team",
      trim: true
    },
    mechanicType: {
      type: String,
      enum: ['internal', 'external'],
      default: 'internal'
    },
    externalMechanicName: {
      type: String,
      trim: true
    },
    externalMechanicCompany: {
      type: String,
      trim: true
    },
    externalMechanicPhone: {
      type: String,
      trim: true
    },
    externalMechanicEmail: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed"],
      default: "pending",
    },
    // Additional fields for comprehensive service tracking
    unitNumber: {
      type: String,
      trim: true,
      index: true
    },
    unitType: {
      type: String,
      trim: true
    },
    makeModel: {
      type: String,
      trim: true
    },
    serviceDate: {
      type: Date,
    },
    odometer: {
      type: Number,
      min: 0,
    },
    parts: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
    serviceProvider: {
      type: String,
      trim: true,
    },
    invoiceNumber: {
      type: String,
      trim: true,
    },
    estimatedCost: {
      type: Number,
      min: 0,
    },
    amount: {
      type: Number,
      min: 0,
    },
    estimatedTime: {
      type: String,
      trim: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      index: true
    }
  },
  { timestamps: true }
);

export const VehicleService = mongoose.model("VehicleService", vehicleServiceSchema);
