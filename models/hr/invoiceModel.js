import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema({
  clientName: { type: String, required: true },
  clientEmail: { type: String },
  clientCompany: { type: String },
  clientAddress: { type: String }, // Customer full address
  clientPhone: { type: String }, // Customer phone number
  loadId: { type: mongoose.Schema.Types.ObjectId, ref: "Load" }, // Legacy: Link to load/job (deprecated)
  // tripId: { type: mongoose.Schema.Types.ObjectId, ref: "Trip" }, // Link to trip
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" }, // Link to order
  amount: { type: String, required: true },
  currency: { type: String, default: "USD" },
  status: { type: String, enum: ["paid", "pending"], default: "pending" },
  invoiceDate: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  paymentDate: { type: Date, default: null },
  paymentTerms: { type: String, default: "Net 30" }, // Net 7, Net 15, Net 30, Due upon receipt, etc.
  invoiceUrl: { type: String },
  notes: { type: String },
  // Service breakdown for detailed line items
  serviceBreakdown: [{
    description: { type: String, required: true }, // e.g., "Base freight charges", "Fuel surcharge"
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true },
    amount: { type: Number, required: true },
    taxRate: { type: Number, default: 0 }, // Tax percentage (e.g., 13 for HST)
    taxAmount: { type: Number, default: 0 }
  }],
  subtotal: { type: Number }, // Subtotal before tax
  taxAmount: { type: Number, default: 0 }, // Total tax amount
  taxNumber: { type: String }, // GST/HST/Tax Number
  gstRate: { type: Number, default: 0 }, // GST Rate percentage
  pstRate: { type: Number, default: 0 }, // PST Rate percentage
  gst: { type: Number, default: 0 }, // GST Amount
  pst: { type: Number, default: 0 }, // PST Amount
  // Company association for data isolation
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    index: true
  },
}, { timestamps: true });

export const Invoice = mongoose.model("Invoice", invoiceSchema);
