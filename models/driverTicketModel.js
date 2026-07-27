import mongoose from "mongoose";

const driverTicketSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      required: true,
      index: true
    },
    date: {
      type: Date,
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    amount: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      enum: ['CAD', 'USD'],
      default: 'CAD'
    },
    status: {
      type: String,
      enum: ['Unpaid', 'Paid', 'Contested', 'Waived'],
      default: 'Unpaid',
      index: true
    },
    // File attachment fields
    fileUrl: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    mimeType: { type: String },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better query performance
driverTicketSchema.index({ driver: 1, date: -1 });
driverTicketSchema.index({ company: 1, date: -1 });
driverTicketSchema.index({ status: 1, date: -1 });

export const DriverTicket = mongoose.models.DriverTicket || mongoose.model("DriverTicket", driverTicketSchema);

