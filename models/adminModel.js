import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  country:{type:String},
  companyName:{
    type: String
  },
  companyCode:{
    type:String
  },
  joinDate:{
    type:Date,
    required:true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: "admin"
  }
}, { timestamps: true });



const Admin = mongoose.model("Admin", adminSchema);
export default Admin;
