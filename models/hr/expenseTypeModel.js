import mongoose from 'mongoose';

// Expense Type Schema
const expenseTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ExpenseCategory",
    required: true,
    index: true
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

// Compound index to ensure unique type names per category per company
expenseTypeSchema.index({ name: 1, categoryId: 1, company: 1 }, { unique: true });

export const ExpenseType = mongoose.model("ExpenseType", expenseTypeSchema);

