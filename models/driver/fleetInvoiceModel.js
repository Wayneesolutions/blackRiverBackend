import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema({
  // For parts-based invoices (legacy support)
  partId: { type: mongoose.Schema.Types.ObjectId, ref: "SparePart", required: false },
  partNumber: { type: String, required: false },
  partName: { type: String, required: false },
  
  // For service/maintenance-based invoices
  serviceDate: { type: String, required: false }, // YYYY-MM-DD format
  productService: { type: String, required: false }, // e.g. "service:<id>" or "repair:<id>"
  description: { type: String, required: true }, // Required: description of service/maintenance/part
  
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 }, // Also called "rate"
  totalPrice: { type: Number, required: true, min: 0 }, // quantity * unitPrice
  taxId: { type: String, required: false }, // Tax option id (e.g. "gst", "pst", "custom-xxx")
  taxName: { type: String, required: false }, // Tax name for display
  taxPercent: { type: Number, required: false, min: 0, max: 100 } // Tax percentage
}, { _id: true });

const fleetInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, unique: true, sparse: true },
    invoiceDate: { type: Date, required: true, default: Date.now }, // Invoice date
    customerName: { type: String, required: true },
    customerEmail: { type: String },
    customerPhone: { type: String },
    customerAddress: { type: String },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "FleetCustomer", required: false }, // Reference to fleet customer
    terms: { type: String, required: false }, // e.g. "Net 30"
    items: [invoiceItemSchema],
    subtotal: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0 }, // Total tax across all items
    // Labour charges (outside line items)
    labourHours: { type: Number, required: false, min: 0, default: 0 },
    labourRate: { type: Number, required: false, min: 0, default: 0 },
    labourAmount: { type: Number, required: false, min: 0, default: 0 }, // labourHours * labourRate
    labourTaxId: { type: String, required: false },
    labourTaxName: { type: String, required: false },
    labourTaxPercent: { type: Number, required: false, min: 0, max: 100, default: 0 },
    total: { type: Number, required: true, min: 0 }, // subtotal + labourAmount + taxAmount + labourTax
    status: { type: String, enum: ['draft', 'sent', 'paid', 'cancelled', 'overdue'], default: 'draft' },
    dueDate: { type: Date, required: true },
    messageOnInvoice: { type: String, required: false }, // Message shown on invoice
    notes: { type: String },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      index: true
    }
  },
  { timestamps: true }
);

export const FleetInvoice = mongoose.model("FleetInvoice", fleetInvoiceSchema);

