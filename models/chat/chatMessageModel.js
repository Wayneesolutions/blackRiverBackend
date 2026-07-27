import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    // Support both trip and order references
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      index: true
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      index: true
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    senderType: {
      type: String,
      enum: ["driver", "dispatcher", "admin"],
      required: true
    },
    senderName: {
      type: String,
      required: true
    },
    message: {
      type: String,
      default: ""
    },
    // Document/file attachment
    fileUrl: {
      type: String,
      default: null
    },
    fileName: {
      type: String,
      default: null
    },
    fileType: {
      type: String,
      enum: ["image", "pdf", "document", "other"],
      default: null
    },
    fileSize: {
      type: Number,
      default: null
    },
    // Read receipts
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        },
        readAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    // Company association for data isolation
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

// Indexes for better query performance
chatMessageSchema.index({ tripId: 1, createdAt: -1 });
chatMessageSchema.index({ orderId: 1, createdAt: -1 });
chatMessageSchema.index({ driverId: 1, createdAt: -1 });
chatMessageSchema.index({ company: 1, tripId: 1 });
chatMessageSchema.index({ company: 1, orderId: 1 });
chatMessageSchema.index({ company: 1, driverId: 1 });
chatMessageSchema.index({ senderId: 1 });

export const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);

