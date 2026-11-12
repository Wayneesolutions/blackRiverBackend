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
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // ── Stand-alone carrier profile data (v2) ──
    // Carrier profiles are kept separate from CVSA inspections: the whole document is stored
    // here and the Carrier Performance dashboard is calculated from it.
    version: { type: Number, default: 1 }, // 2 = stand-alone profile
    country: { type: String, enum: ['canada', 'usa', null], default: null, index: true },
    format: { type: String, default: null }, // 'nsc' | 'sms' | 'ai'
    readBy: { type: String, default: null }, // 'parser' (read exactly) | 'ai'
    profileDate: { type: Date, default: null }, // date the profile was produced
    nscNumber: { type: String, default: null },
    usdotNumber: { type: String, default: null },
    thresholds: { type: mongoose.Schema.Types.Mixed, default: null },
    printedTotals: { type: mongoose.Schema.Types.Mixed, default: null },
    inspections: { type: [mongoose.Schema.Types.Mixed], default: [] },
    convictions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    defects: { type: [mongoose.Schema.Types.Mixed], default: [] },
    accidents: { type: Number, default: null },
    fleet: { type: mongoose.Schema.Types.Mixed, default: null },
    checks: { type: [String], default: [] } // differences between rows read and totals printed
  },
  { timestamps: true }
);

carrierProfileImportSchema.index({ company: 1, createdAt: -1 });

export const CarrierProfileImport = mongoose.model("CarrierProfileImport", carrierProfileImportSchema);
