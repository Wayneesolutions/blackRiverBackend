import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    contact: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    address: { type: String },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      index: true
    }
  },
  { timestamps: true }
);

export const Supplier = mongoose.model("Supplier", supplierSchema);

