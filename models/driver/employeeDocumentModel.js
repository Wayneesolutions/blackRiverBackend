import mongoose from "mongoose";

const employeeDocumentSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  documentType: {
    type: String,
    enum: [
      "Employment Contract",
      "ID Document",
      "Passport",
      "Work Permit",
      "Background Check",
      "Drug Test",
      "Training Certificate",
      "Insurance Policy",
      "Company Policy",
      "Performance Review",
      "Payroll Document",
      "Tax Document",
      "Emergency Contact",
      "Medical Certificate",
      "Driving Licence",
      "Travel Document",
      "Commercial Driver's License (CDL)",
      "Medical Certificate (DOT Physical)",
      "Drug Test Results",
      "Alcohol Test Results", 
      "Driving Record (MVR)",
      "DOT Physical Card",
      "CDL Training Certificate",
      "Defensive Driving Certificate",
      "Hazmat Endorsement",
      "Tanker Endorsement",
      "Doubles/Triples Endorsement",
      "Passenger Endorsement",
      "School Bus Endorsement",
      "Vehicle Inspection Certification",
      "Safety Training Certificate",
      "Hours of Service (HOS) Records",
      "Emergency Contact Form",
      "Road Test Certificate",
      "TSA Security Clearance",
      "Other"
    ],
    required: true
  },
  documentNumber: { type: String },
  issueDate: { type: Date },
  expiryDate: { type: Date },
  fileUrl: { type: String }, // S3 / local storage
  fileName: { type: String }, // Original filename
  fileSize: { type: Number }, // File size in bytes
  mimeType: { type: String }, // File MIME type
  ignoreExpiration : {type: Boolean, default: false},
  status: { 
    type: String, 
    enum: ["valid", "expiring-soon", "expired", "pending", "rejected"], 
    default: "valid" 
  },
  description: { type: String },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  verifiedAt: { type: Date },
  rejectionReason: { type: String },
  isInUse: { type: Boolean, default: true }, // Track if document is currently being used
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings" }
}, { 
  timestamps: true 
});

// Index for efficient queries
employeeDocumentSchema.index({ employee: 1, documentType: 1 });
employeeDocumentSchema.index({ expiryDate: 1 });
employeeDocumentSchema.index({ status: 1 });

export const EmployeeDocument = mongoose.model("EmployeeDocument", employeeDocumentSchema);
