import mongoose from "mongoose";

const companyDocumentCategorySchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true, index: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

companyDocumentCategorySchema.index({ company: 1, key: 1 }, { unique: true });

export const CompanyDocumentCategory = mongoose.model(
  "CompanyDocumentCategory",
  companyDocumentCategorySchema
);


