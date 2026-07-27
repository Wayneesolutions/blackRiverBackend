import mongoose from "mongoose";

const shiftSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },
    load: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Load",
      default: null,
    },
    shiftDate: {
      type: Date,
      required: true, // calendar date
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "completed", "scheduled"],
      default: "scheduled",
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export const Shift = mongoose.model("Shift", shiftSchema);
