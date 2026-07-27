import mongoose from "mongoose";

const driverActivitySchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Types.ObjectId, ref: "User", required: true },
    load: { type: mongoose.Types.ObjectId, ref: "Load", default: null }, // optional, if activity is tied to a load
    activityType: { 
      type: String, 
      enum: ['load_started', 'load_delivered', 'load_completed'], 
      required: true 
    },
    location: {
        address:{type:String},
      latitude: { type: String, default: null },
      longitude: { type: String, default: null }
    },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const DriverActivity = mongoose.model('DriverActivity', driverActivitySchema);
export default DriverActivity;
