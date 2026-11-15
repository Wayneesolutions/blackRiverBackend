import mongoose from "mongoose";

// Accounts Payable: money the company owes (carrier we sold a load to, repair shop, supplier...).
// Client (15 Nov): "We are missing one big thing: account payable."
const billPaymentSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ['Cheque', 'Bank Transfer', 'EFT', 'Cash', 'Credit Card', 'Other'], default: 'Cheque' },
  reference: { type: String }, // cheque # / transfer ref
  notes: { type: String },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { _id: true });

const billSchema = new mongoose.Schema({
  billNumber: { type: String, required: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null },
  vendorName: { type: String, required: true, trim: true },
  vendorInvoiceNumber: { type: String, trim: true }, // the number on the vendor's invoice
  category: {
    type: String,
    enum: ['Carrier', 'Fuel', 'Repairs & Maintenance', 'Parts', 'Insurance', 'Tolls & Permits', 'Rent', 'Utilities', 'Office', 'Professional Fees', 'Other'],
    default: 'Other'
  },
  // brokered_load: created automatically when a load is booked for another carrier
  source: { type: String, enum: ['manual', 'brokered_load'], default: 'manual', index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, index: true },
  orderNumber: { type: String },
  description: { type: String },
  billDate: { type: Date, default: Date.now },
  dueDate: { type: Date },
  amount: { type: Number, required: true, min: 0 },
  taxAmount: { type: Number, default: 0 },
  currency: { type: String, enum: ['CAD', 'USD', 'INR'], default: 'CAD' },
  paidAmount: { type: Number, default: 0 },
  status: { type: String, enum: ['unpaid', 'partial', 'paid', 'void'], default: 'unpaid', index: true },
  payments: [billPaymentSchema],
  attachmentUrl: { type: String },
  attachmentName: { type: String },
  notes: { type: String },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

billSchema.index({ company: 1, billNumber: 1 }, { unique: true });
billSchema.index({ company: 1, dueDate: 1, status: 1 });

billSchema.virtual('balance').get(function () {
  return Math.max(0, Math.round(((this.amount || 0) + (this.taxAmount || 0) - (this.paidAmount || 0)) * 100) / 100);
});
billSchema.set('toJSON', { virtuals: true });
billSchema.set('toObject', { virtuals: true });

/** Keep paidAmount and status in step with the payments list. */
billSchema.methods.recalculate = function () {
  const total = Math.round(((this.amount || 0) + (this.taxAmount || 0)) * 100) / 100;
  this.paidAmount = Math.round((this.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
  if (this.status === 'void') return this;
  if (this.paidAmount <= 0) this.status = 'unpaid';
  else if (this.paidAmount + 0.004 < total) this.status = 'partial';
  else this.status = 'paid';
  return this;
};

export const Bill = mongoose.model("Bill", billSchema);
