import mongoose from "mongoose";

// Payroll Schema
const payrollSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  baseSalary: { type: Number, required: true },
  // workedHours: { type: Number, default: 0 },
  // milesDriven: { type: Number, default: 0 },
  // loadsCompleted: { type: Number, default: 0 },
  // overtime: { type: Number, default: 0 },
  deductions: { type: Number, default: 0 },
  totalSalary: { type: Number, required: true },
  bonus:{type:Number},
  payDate: { type: Date, default: Date.now },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, default: Date.now },
  // Driver-specific fields
  loads: [{ type: mongoose.Schema.Types.ObjectId, ref: "Load" }], // Loads included in this payroll (deprecated, use trips)
  // trips: [{ type: mongoose.Schema.Types.ObjectId, ref: "Trip" }], // Trips included in this payroll
  orders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
  totalMiles: { type: Number, default: 0 },
  ratePerMile: { type: Number, default: 0 },
  // Hours fields (for hourly employees)
  totalHours: { type: Number, default: 0 },
  regularHours: { type: Number, default: 0 },
  overtimeHours: { type: Number, default: 0 },
  hourlyRate: { type: Number, default: 0 },
  // Attendance summary (for reference)
  presentDays: { type: Number, default: 0 },
  absentDays: { type: Number, default: 0 },
  leaveDays: { type: Number, default: 0 },
  // Tax fields
  country: { type: String, enum: ['USA', 'Canada'], default: 'USA' },
  // Canada taxes
  federalIncomeTaxCA: { type: Number, default: 0 },
  provincialIncomeTaxCA: { type: Number, default: 0 },
  cpp: { type: Number, default: 0 }, // Canada Pension Plan
  ei: { type: Number, default: 0 }, // Employment Insurance
  provincialHealthTaxCA: { type: Number, default: 0 },
  // USA taxes
  federalIncomeTaxUS: { type: Number, default: 0 },
  stateIncomeTaxUS: { type: Number, default: 0 },
  socialSecurityTax: { type: Number, default: 0 }, // FICA
  medicareTax: { type: Number, default: 0 },
  stateDisabilityInsurance: { type: Number, default: 0 }, // SDI
  localTax: { type: Number, default: 0 },
  // Layover fields
  layoverHours: { type: Number, default: 0 },
  layoverRate: { type: Number, default: 0 },
  layoverAmount: { type: Number, default: 0 },
  // Safety bonus
  safetyBonus: { type: Number, default: 0 },
  // Itemised additions / deductions - every line says what it is for (printed on the pay statement)
  additionItems: [{
    memo: { type: String, required: true },
    amount: { type: Number, default: 0 },
    date: { type: Date },
    load: { type: String },
    per: { type: String, default: 'One Time' },
    source: { type: String, default: 'manual' } // manual | profile | trip
  }],
  deductionItems: [{
    memo: { type: String, required: true },
    amount: { type: Number, default: 0 },
    date: { type: Date },
    load: { type: String },
    per: { type: String, default: 'One Time' },
    source: { type: String, default: 'manual' }
  }],
  // Tax is optional: when false no tax is deducted (company decides, not the software)
  applyTaxes: { type: Boolean, default: false },
  // Payment tracking: a payroll is "pending" until accounts marks it paid
  paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending', index: true },
  paidAt: { type: Date },
  paymentMethod: { type: String },
  chequeNumber: { type: String },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    index: true
  }
}, { timestamps: true });

export const Payroll = mongoose.model("Payroll", payrollSchema);