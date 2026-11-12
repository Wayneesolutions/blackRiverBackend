import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  size: { type: Number, required: true }, // size in bytes
  url: { type: String }, // File URL (S3 or local)
  key: { type: String }, // S3 key for signed URL generation
  mimeType: { type: String } // MIME type of the file
}, { _id: false });

const hosAuditFormSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  driverIdDisplay: { type: String, trim: true },
  reportingTo: { type: String, trim: true },
  auditDate: { type: Date, required: true },
  incidentDate: { type: Date },
  incidentTime: { type: String, trim: true },
  incidentLocation: { type: String, trim: true },
  drivingHours: { type: Number, default: 0 },
  onDutyHours: { type: Number, default: 0 },
  offDutyHours: { type: Number, default: 0 },
  violations: [{ type: String, trim: true }],
  incidentTypes: [{ type: String, trim: true }],
  priorCounseling: { type: String, trim: true },
  correctiveActionType: { type: String, trim: true },
  // Free-text "Comments" next to the corrective action on the paper form (e.g. "ELD MALFUNCTION")
  correctiveActionComments: { type: String, trim: true },
  // True when the incident was an ELD malfunction (e.g. a mechanic moved the truck under the
  // driver's login). Recorded for the file but NOT counted as a driver HOS violation.
  eldMalfunction: { type: Boolean, default: false },
  notes: { type: String, trim: true },
  auditorName: { type: String, trim: true },
  documents: [documentSchema],
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, { timestamps: true });

hosAuditFormSchema.index({ company: 1, auditDate: -1 });
hosAuditFormSchema.index({ company: 1, driverId: 1, auditDate: -1 });

export default mongoose.model("HosAuditForm", hosAuditFormSchema);
