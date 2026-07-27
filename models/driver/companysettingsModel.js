import mongoose from "mongoose";

const companySettingsSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  companyCode: { type: String, required: true, unique: true },
  logoUrl: { type: String },
  address: { type: String },
  contactEmail: { type: String },
  contactPhone: { type: String },
  taxNumber: { type: String }, // GST/HST/Tax Number for invoices
  
  // Samsara API Configuration
  samsaraConfig: {
    apiBaseUrl: { type: String, default: "" },
    apiToken: { type: String, default: "" }
  },
  // ThermoKing API Configuration
  thermokingConfig: {
    apiBaseUrl: { type: String, default: "" },
    apiKey: { type: String, default: "" },
    apiSecret: { type: String, default: "" },
    apiVersion: { type: String, default: "v1" }
  },
  
  // Maintenance Policy Configuration - All services are dynamic
  maintenancePolicies: {
    // Dynamic custom services array - companies can add multiple services (including Oil Change)
    customServices: [{
      name: { type: String, required: true }, // Service name (e.g., "Oil Change", "Full Inspection", "Service A", "Preventive Maintenance")
      truck: {
        value: { type: Number, required: true },
        unit: { type: String, enum: ['days', 'miles', 'km'], required: true }
      },
      trailer: {
        value: { type: Number, required: true },
        unit: { type: String, enum: ['days', 'miles', 'km'], required: true }
      },
      excludeTypes: [{ 
        type: String, 
        enum: ['reefer', 'dryvan', 'flatbed'] // Only these three trailer types allowed
      }] // Optional: Trailer types that don't need this service
    }]
  }
}, { timestamps: true });

export const CompanySettings = mongoose.model("CompanySettings", companySettingsSchema);
