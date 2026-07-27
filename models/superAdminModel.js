import mongoose from "mongoose";

const superAdminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: "superadmin"
  }
}, { timestamps: true });


const SuperAdmin = mongoose.model("SuperAdmin", superAdminSchema);
export default SuperAdmin;
