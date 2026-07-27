import mongoose from "mongoose";

const fuelVendorSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    company: {
        type: mongoose.Types.ObjectId,
        ref: "CompanySettings",
        index: true,
        default: null
    },
    createdBy: {
        type: mongoose.Types.ObjectId,
        ref: "User"
    }
}, { timestamps: true });

// Compound index to ensure unique fuel vendor names per company (or globally for superadmin)
fuelVendorSchema.index({ name: 1, company: 1 }, { unique: true });

const FuelVendor = mongoose.model("FuelVendor", fuelVendorSchema);
export default FuelVendor;

