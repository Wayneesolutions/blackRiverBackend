import mongoose from "mongoose";

/**
 * User Session Model
 * Tracks login/logout times for automatic attendance calculation
 */
const userSessionSchema = new mongoose.Schema(
  {
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true, 
      index: true 
    },
    company: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "CompanySettings", 
      index: true 
    },
    loginTime: { 
      type: Date, 
      required: true,
      index: true
    },
    logoutTime: { 
      type: Date, 
      default: null 
    },
    lastActivityTime: { 
      type: Date, 
      default: Date.now 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    },
    autoLoggedOut: { 
      type: Boolean, 
      default: false 
    }, // True if logged out due to inactivity
    totalActiveMinutes: { 
      type: Number, 
      default: 0 
    }, // Calculated active time excluding inactivity periods
    notes: {
      type: String
    },
    breaks: [{
      start: { type: Date },
      end: { type: Date }
    }]
  },
  { timestamps: true }
);

// Index for finding active sessions
userSessionSchema.index({ user: 1, isActive: 1 });
userSessionSchema.index({ company: 1, loginTime: -1 });

export const UserSession = mongoose.model("UserSession", userSessionSchema);

