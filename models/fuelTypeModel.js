import mongoose from "mongoose";

const fuelTypeSchema = new mongoose.Schema({
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

// Compound index to ensure unique fuel type names per company (or globally for superadmin)
fuelTypeSchema.index({ name: 1, company: 1 }, { unique: true });

const FuelType = mongoose.model("FuelType", fuelTypeSchema);
export default FuelType;

