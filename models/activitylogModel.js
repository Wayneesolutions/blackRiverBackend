import mongoose from 'mongoose'

const activityLogSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "admin",
    // required: true,
  },
  // sendBy: {
  //   type: String,
  //   default: "admin",
  //   // required: true,
  // },
  action: {
    type: String,
    required: true,
  },
  driver:{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  changeSummary: {
    type: String,
    default: "",
  }
}, { timestamps: true });

 const ActivityLog =  mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog