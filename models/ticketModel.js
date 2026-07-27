import mongoose from "mongoose";

const lawyerDetailsSchema = new mongoose.Schema({
  name: { type: String, required: true },
  firm: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  address: { type: String, required: true },
  caseNumber: { type: String },
  courtDate: { type: Date },
  status: {
    type: String,
    enum: ['active', 'closed', 'pending'],
    default: 'active'
  }
}, { _id: false });

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      default: function() {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000);
        return `TK-${year}-${random.toString().padStart(4, '0')}`;
      }
    },
    ticketType: {
      type: String
    },
    violationType: {
      type: String
    },
    violationDescription: {
      type: String
    },
    title: {
      type: String
    },
    description: {
      type: String
    },
    issuingAuthority: {
      type: String
    },
    dateIssued: {
      type: Date
    },
    location: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      min: 0
    },
    country: {
      type: String,
      enum: ['usa', 'canada'],
      required: true,
      default: 'usa'
    },
    status: {
      type: String,
      enum: ['paid', 'unpaid', 'fight', 'dismissed', 'reduced'],
      required: true,
      default: 'unpaid'
    },
    paymentStatus: {
      type: String,
      enum: ['Unpaid', 'Paid', 'Disputed', 'Cancelled', ''],
      default: ''
    },
    outcome: {
      type: String,
      enum: ['paid', 'reduced', 'dismissed', 'on fight', 'unpaid']
    },
    finalAmount: {
      type: Number,
      min: 0
    },
    unitNumber: {
      type: String
    },
    trailerNumber: {
      type: String
    },
    courtDate: {
      type: Date
    },
    fightingBy: {
      type: String,
      enum: ['company', 'lawyer']
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true
    },
    officerName: {
      type: String,
      required: true
    },
    dueDate: {
      type: Date,
      required: true
    },
    lawyerDetails: {
      type: lawyerDetailsSchema
    },
    notes: {
      type: String
    },
    // Additional tracking fields
    paidDate: {
      type: Date
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'check', 'credit_card', 'online', 'other']
    },
    paymentReference: {
      type: String
    },
    // File attachments
    ticketFileUrl: { type: String },
    ticketFileName: { type: String },
    ticketFileSize: { type: Number },
    ticketFileMimeType: { type: String },
    receiptFileUrl: { type: String },
    receiptFileName: { type: String },
    receiptFileSize: { type: Number },
    receiptFileMimeType: { type: String },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes for faster queries
ticketSchema.index({ status: 1 });
ticketSchema.index({ dateIssued: -1 });
ticketSchema.index({ driver: 1 });
ticketSchema.index({ vehicle: 1 });
// ticketNumber index is automatically created by unique: true, no need to define it again

export const Ticket = mongoose.model("Ticket", ticketSchema);

