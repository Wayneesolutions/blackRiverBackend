import mongoose from "mongoose";

// Paystub Schema - Automatically generated when payroll is created
const paystubSchema = new mongoose.Schema({
  payrollId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payroll",
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  // Employee Information
  employeeName: { type: String, required: true },
  employeeId: { type: String }, // internalId
  employeeEmail: { type: String },
  employeeRole: { type: String },
  employeeDepartment: { type: String },
  employeeAddress: { type: String },
  workType: { type: String, enum: ['Employee', 'Driver', 'Owner-Operator'], default: 'Employee' },
  
  // Pay Period Information
  payPeriod: {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    payDate: { type: Date, required: true }
  },
  paystubId: { type: String }, // Reference number for paystub
  
  // Earnings - Detailed breakdown
  earnings: {
    baseSalary: { type: Number, required: true, default: 0 },
    bonus: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 },
    overtimeRate: { type: Number, default: 0 },
    mileageEarnings: { type: Number, default: 0 }, // For drivers
    tripPay: { type: Number, default: 0 }, // For drivers
    allowance: { type: Number, default: 0 },
    incentives: { type: Number, default: 0 },
    regularHours: { type: Number, default: 0 },
    hourlyRate: { type: Number, default: 0 },
    totalEarnings: { type: Number, required: true, default: 0 },
    // Detailed earnings array for display
    earningsBreakdown: [{
      type: { type: String }, // 'Basic Pay', 'Trip Pay', 'Overtime', 'Bonus', etc.
      units: { type: String }, // 'Hours', 'Trips', 'Miles', etc.
      rate: { type: Number },
      amount: { type: Number }
    }]
  },
  
  // Deductions - Detailed breakdown
  deductions: {
    totalDeductions: { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 }, // Non-tax deductions
    advanceRecovery: { type: Number, default: 0 },
    loanEMI: { type: Number, default: 0 },
    insurance: { type: Number, default: 0 },
    payrollPenalty: { type: Number, default: 0 },
    // Detailed deductions array for display
    deductionsBreakdown: [{
      type: { type: String }, // 'Tax', 'Advance Recovery', 'Loan EMI', 'Insurance', etc.
      amount: { type: Number }
    }]
  },
  
  // Taxes - Canada
  taxesCA: {
    federalIncomeTax: { type: Number, default: 0 },
    provincialIncomeTax: { type: Number, default: 0 },
    cpp: { type: Number, default: 0 }, // Canada Pension Plan
    ei: { type: Number, default: 0 }, // Employment Insurance
    provincialHealthTax: { type: Number, default: 0 },
    totalTaxes: { type: Number, default: 0 }
  },
  
  // Taxes - USA
  taxesUS: {
    federalIncomeTax: { type: Number, default: 0 },
    stateIncomeTax: { type: Number, default: 0 },
    socialSecurityTax: { type: Number, default: 0 }, // FICA
    medicareTax: { type: Number, default: 0 },
    stateDisabilityInsurance: { type: Number, default: 0 }, // SDI
    localTax: { type: Number, default: 0 },
    totalTaxes: { type: Number, default: 0 }
  },
  
  // Summary
  summary: {
    grossPay: { type: Number, required: true, default: 0 },
    totalDeductions: { type: Number, required: true, default: 0 },
    totalTaxes: { type: Number, required: true, default: 0 },
    netPay: { type: Number, required: true, default: 0 }
  },
  
  // Country
  country: {
    type: String,
    enum: ['USA', 'Canada'],
    default: 'USA',
    required: true
  },
  
  // Driver-specific information (if applicable)
  driverInfo: {
    totalMiles: { type: Number, default: 0 },
    ratePerMile: { type: Number, default: 0 },
    tripsCount: { type: Number, default: 0 },
    loadsCount: { type: Number, default: 0 }
  },
  
  // Company Information
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompanySettings",
    index: true
  },
  // Company Details (stored for paystub display)
  companyDetails: {
    companyName: { type: String },
    companyAddress: { type: String },
    companyPhone: { type: String },
    companyEmail: { type: String },
    companyLogo: { type: String },
    gstNumber: { type: String } // GST/HST/Tax Number
  },
  
  // Trip Details (for driver/owner-operator paystubs)
  tripDetails: [{
    truckNumber: { type: String }, // Truck internal ID or plate number
    payType: { type: String }, // 'Paid Per Mile', 'Paid Per Hour', etc.
    loadNumber: { type: String }, // Load/Order number or 'EMPTY-T' for empty trips
    tripType: { type: String }, // 'TEAM', 'ALONE', 'EMPTY-T', etc.
    periodFrom: { type: Date },
    periodTo: { type: Date },
    origin: { type: String },
    destination: { type: String },
    payRate: { type: Number }, // Rate per mile/hour
    miles: { type: Number }, // Miles or hours
    hours: { type: Number }, // Hours if applicable
    amountCAD: { type: Number }, // Amount in CAD
    amountUSD: { type: Number } // Amount in USD
  }],
  
  // Additions (bonuses, allowances, etc.)
  additions: [{
    loadDate: { type: Date },
    memo: { type: String }, // Description
    amount: { type: Number },
    per: { type: String }, // 'One Time', 'Per Trip', etc.
    gst: { type: Number, default: 0 }, // GST amount
    totalCAD: { type: Number } // Total amount in CAD
  }],
  
  // Employer Contributions (optional)
  employerContributions: {
    companyInsurance: { type: Number, default: 0 },
    pensionPF: { type: Number, default: 0 },
    benefitContributions: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  
  // Year-to-Date (YTD) Summary
  ytd: {
    earnings: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 }
  },
  
  // Payment Information
  payment: {
    mode: { type: String, enum: ['Bank Transfer', 'Cheque', 'Cash', 'Other'], default: 'Bank Transfer' },
    bankLast4Digits: { type: String },
    bankName: { type: String },
    accountNumber: { type: String } // Last 4 digits only for security
  },
  
  // Notes / Remarks
  notes: { type: String },
  
  // HR Signature / Digital Stamp
  hrSignature: { type: String }, // URL to signature image or name
  hrName: { type: String },
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'issued', 'void'],
    default: 'issued'
  },
  
  // PDF/Document reference (if generated)
  pdfUrl: { type: String },
  pdfFileName: { type: String }
}, {
  timestamps: true
});

// Indexes for efficient queries
paystubSchema.index({ userId: 1, 'payPeriod.payDate': -1 });
paystubSchema.index({ company: 1, 'payPeriod.payDate': -1 });
paystubSchema.index({ status: 1 });

export const Paystub = mongoose.model("Paystub", paystubSchema);

