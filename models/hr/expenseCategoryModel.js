import mongoose from 'mongoose';

// Expense Category Schema
const expenseCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    index: true
  }
}, { timestamps: true });

export const ExpenseCategory = mongoose.model("ExpenseCategory", expenseCategorySchema);

