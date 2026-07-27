import mongoose from "mongoose";

const elogSchema = new mongoose.Schema({
  driverId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  fileName: { 
    type: String, 
    required: true 
  },
  fileUrl: { 
    type: String, 
    required: true 
  },
  fileSize: { 
    type: Number, 
    required: true 
  }, // File size in bytes
  mimeType: { 
    type: String 
  }, // File MIME type
  description: { 
    type: String 
  },
  uploadedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  uploadedAt: { 
    type: Date, 
    default: Date.now 
  },
  // Company association for data isolation
  company: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "CompanySettings",
    required: true,
    index: true
  }
}, { timestamps: true });

elogSchema.index({ driverId: 1, uploadedAt: -1 });
elogSchema.index({ company: 1, uploadedAt: -1 });

export default mongoose.model("ELog", elogSchema);

