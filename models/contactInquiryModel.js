import mongoose from "mongoose";

// Leads from the public website contact form (logistiqinnovations.ca/contact).
// Stored before the notification email is sent, so an SMTP problem never loses a lead.
const contactInquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    company: { type: String, trim: true, maxlength: 200, default: "" },
    fleetSize: { type: String, trim: true, maxlength: 50, default: "" },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    language: { type: String, enum: ["en", "fr"], default: "en" },
    source: { type: String, default: "website" },
    ip: { type: String, default: "" },
    emailSent: { type: Boolean, default: false },
    emailError: { type: String, default: "" },
    status: { type: String, enum: ["new", "contacted", "closed"], default: "new" },
  },
  { timestamps: true }
);

contactInquirySchema.index({ createdAt: -1 });

export const ContactInquiry = mongoose.model("ContactInquiry", contactInquirySchema);
