import mongoose from "mongoose";

const regulatorySafetySchema = new mongoose.Schema(
  {
    unitNo: { type: String, required: true, trim: true },
    unitType: { type: String, trim: true },
    makeModel: { type: String, trim: true },
    unitSource: {
      type: String,
      enum: ["vehicle", "trailer", "custom", "unknown"],
      default: "unknown"
    },
    unitReference: {
      type: mongoose.Schema.Types.ObjectId
    },
    safetyExpiryDate: { type: Date, required: true },
    safetyDecalNumber: { type: String, trim: true },
    safetyPaperNumber: { type: String, trim: true },
    shopName: { type: String, trim: true },
    invoiceNo: { type: String, trim: true },
    notes: { type: String, trim: true },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

regulatorySafetySchema.index({ unitNo: 1, safetyExpiryDate: -1, company: 1 });

export const RegulatorySafety = mongoose.model("RegulatorySafety", regulatorySafetySchema);

