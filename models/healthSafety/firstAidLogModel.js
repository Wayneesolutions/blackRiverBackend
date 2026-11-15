import mongoose from "mongoose";

const firstAidLogSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  time: { type: String, required: true },
  location: { type: String, required: true },
  // Map position of the location (from the address search), for Google Maps
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  injuredPerson: { type: String, required: true },
  injuryDescription: { type: String, required: true },
  firstAidProvided: { type: String, required: true },
  treatedBy: { type: String, required: true },
  followUpRequired: { type: Boolean, default: false },
  followUpNotes: { type: String },
  relatedIncident: { type: String },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Check if model already exists to prevent overwrite errors
export const FirstAidLog = mongoose.models.FirstAidLog || mongoose.model('FirstAidLog', firstAidLogSchema);

