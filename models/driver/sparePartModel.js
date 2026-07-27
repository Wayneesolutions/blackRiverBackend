import mongoose from "mongoose";

const usageHistorySchema = new mongoose.Schema({
  workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkOrder" },
  usedOn: { type: Date, default: Date.now },
  qtyUsed: { type: Number, default: 1 },
}, { _id: true });

const sparePartSchema = new mongoose.Schema(
  {
    partNumber: { type: String, required: true, unique: true },
    partName: { type: String, required: true },
    description: { type: String },
    category: { type: String },
    stockQty: { type: Number, default: 0, min: 0 },
    minStockLevel: { type: Number, default: 0, min: 0 },
    maxStockLevel: { type: Number, default: 100, min: 0 },
    buyingPrice: { type: Number, default: 0, min: 0 },
    sellingPrice: { type: Number, default: 0, min: 0 },
    purchaseDate: { type: Date },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier" },
    location: { type: String },
    condition: { type: String, enum: ['new', 'refurbished', 'used'], default: 'new' },
    warrantyPeriod: { type: Number, default: 0, min: 0 }, // in months
    warrantyExpiry: { type: Date },
    usageHistory: [usageHistorySchema],
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      index: true
    }
  },
  { timestamps: true }
);

// Calculate warranty expiry before saving
sparePartSchema.pre('save', function(next) {
  if (this.purchaseDate && this.warrantyPeriod && !this.warrantyExpiry) {
    const expiryDate = new Date(this.purchaseDate);
    expiryDate.setMonth(expiryDate.getMonth() + this.warrantyPeriod);
    this.warrantyExpiry = expiryDate;
  }
  next();
});

export const SparePart = mongoose.model("SparePart", sparePartSchema);
