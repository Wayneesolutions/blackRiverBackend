import mongoose from "mongoose";

const unitSchema = new mongoose.Schema({
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

// Compound index to ensure unique unit names per company (or globally for superadmin)
unitSchema.index({ name: 1, company: 1 }, { unique: true });

const Unit = mongoose.model("Unit", unitSchema);
export default Unit;

