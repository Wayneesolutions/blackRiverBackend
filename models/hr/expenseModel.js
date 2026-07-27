import mongoose from 'mongoose'

// Expense Schema
const expenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String }, // Keep for backward compatibility
  typeId: { type: mongoose.Schema.Types.ObjectId, ref: "ExpenseType" }, // New field for dynamic types
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "ExpenseCategory" }, // New field for dynamic categories
  orderId :{type:mongoose.Schema.Types.ObjectId, ref:"Orders"},
  amount: { type: Number, required: true },
  description: { type: String },
  receiptUrl: { type: String }, // upload receipt
  date: { type: Date },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "FleetUnit" }, // Vehicle/Truck reference
  trailer: { type: mongoose.Schema.Types.ObjectId, ref: "FleetUnit" }, // Trailer reference
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    index: true
  }
}, { timestamps: true });

export const Expense = mongoose.model("Expense", expenseSchema);