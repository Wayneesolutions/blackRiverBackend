import mongoose from "mongoose";

const YARD_TYPES = ["parking", "drop yard", "terminal", "maintenance", "warehouse"];
const YARD_STATUSES = ["active", "inactive"];

const yardSchema = new mongoose.Schema(
  {
    yardId: {
      type: String,
      unique: true,
      required: false, // Will be auto-generated in pre-save hook
      index: true
    },
    yardName: {
      type: String,
      required: true,
      trim: true
    },
    yardCode: {
      type: String,
      required: true,
      trim: true
    },
    yardType: {
      type: String,
      enum: YARD_TYPES,
      required: true
    },
    status: {
      type: String,
      enum: YARD_STATUSES,
      default: "active",
      required: true
    },
    // Address fields
    address: {
      type: String,
      required: true,
      trim: true
    },
    unit: {
      type: String,
      trim: true,
      default: ""
    },
    city: {
      type: String,
      required: true,
      trim: true
    },
    stateProvince: {
      type: String,
      required: true,
      trim: true
    },
    country: {
      type: String,
      required: true,
      trim: true
    },
    zipPostalCode: {
      type: String,
      required: true,
      trim: true
    },
    // Coordinates (stored when address is geocoded)
    coordinates: {
      latitude: {
        type: Number,
        default: null
      },
      longitude: {
        type: Number,
        default: null
      },
      geocodedAt: {
        type: Date,
        default: null
      }
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  {
    timestamps: true
  }
);

// Compound index for unique yardCode per company
yardSchema.index({ yardCode: 1, company: 1 }, { unique: true });

// Auto-generate yardId before saving
yardSchema.pre("save", async function (next) {
  if (!this.yardId && this.isNew) {
    try {
      // Generate yardId: YARD-YYYYMMDD-XXXX (e.g., YARD-20240101-0001)
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
      
      // Find the highest sequence number for today
      const YardModel = mongoose.model("Yard");
      const todayYards = await YardModel.find({
        yardId: new RegExp(`^YARD-${dateStr}-`)
      }).sort({ yardId: -1 }).limit(1);
      
      let sequence = 1;
      if (todayYards.length > 0) {
        const lastYardId = todayYards[0].yardId;
        const lastSequence = parseInt(lastYardId.split("-")[2] || "0");
        sequence = lastSequence + 1;
      }
      
      this.yardId = `YARD-${dateStr}-${sequence.toString().padStart(4, "0")}`;
    } catch (error) {
      return next(error);
    }
  }
  
  // Ensure yardId is set before saving
  if (!this.yardId) {
    return next(new Error("Yard ID generation failed"));
  }
  
  next();
});

export const Yard = mongoose.model("Yard", yardSchema);

