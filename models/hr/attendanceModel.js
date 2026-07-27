import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true, index: true },
    checkIn: { type: String, default: null }, // HH:mm
    checkOut: { type: String, default: null }, // HH:mm
    status: { type: String, enum: ["present", "absent", "late", "leave"], default: "present" },
    totalHours: { type: Number, default: 0 },
    notes: { type: String },
    isAutoTracked: { type: Boolean, default: false }, // True if automatically tracked from login/logout
  },
  { timestamps: true }
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

export const Attendance = mongoose.model("Attendance", attendanceSchema);


