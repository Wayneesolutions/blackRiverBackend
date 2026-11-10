import mongoose from "mongoose";

/**
 * One uploaded carrier profile document. Every CVSA inspection created from the
 * document points back here (CvsaInspection.importBatch), so an upload can be
 * reviewed and removed as a unit.
 */
const carrierProfileImportSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      required: true,
      index: true
    },
    fileName: { type: String, default: null },
    carrierName: { type: String, default: null },
    period: { type: String, default: null },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    safetyRating: { type: String, default: null },
    // Totals as printed on the document (may differ from the rows actually imported)
    documentTotals: {
      totalInspections: { type: Number, default: null },
      totalPass: { type: Number, default: null },
      totalFail: { type: Number, default: null },
      totalWarning: { type: Number, default: null },
      totalOutOfService: { type: Number, default: null }
    },
    rowsInDocument: { type: Number, default: 0 },
    createdCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

carrierProfileImportSchema.index({ company: 1, createdAt: -1 });

export const CarrierProfileImport = mongoose.model("CarrierProfileImport", carrierProfileImportSchema);
