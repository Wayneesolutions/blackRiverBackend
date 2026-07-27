import mongoose from "mongoose";

const maintenanceScheduleSchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
    serviceType: { type: String, required: true }, // Oil change, Tire rotation, etc.
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ["Upcoming", "Completed", "Overdue"], default: "Upcoming" },
  },
  { timestamps: true }
);

export default mongoose.model("MaintenanceSchedule", maintenanceScheduleSchema);
