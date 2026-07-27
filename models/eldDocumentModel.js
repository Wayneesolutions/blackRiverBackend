import mongoose from "mongoose";

const eldDocumentSchema = new mongoose.Schema(
  {
    company: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "CompanySettings", 
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
    },
    mimeType: { 
      type: String 
    },
    title: { 
      type: String 
    },
    description: { 
      type: String 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    },
    uploadedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User",
      required: true 
    },
    // S3 metadata
    s3Key: { 
      type: String 
    },
    s3Bucket: { 
      type: String 
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
eldDocumentSchema.index({ company: 1, isActive: 1, createdAt: -1 });
eldDocumentSchema.index({ company: 1, createdAt: -1 });

export const ELDDocument = mongoose.model("ELDDocument", eldDocumentSchema);


