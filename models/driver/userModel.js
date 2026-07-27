import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  // Basic User Information
  name: { type: String },
  email: { type: String },
  phone: { type: String },
  country: { type: String },
  password: { type: String },
  role: {
    type: String,
    enum: [
      'driver',
      'dispatcher',
      'admin',
      'hr',
      'contact',
      'customer',
      'reporter',
      'Maintenance Crew (Mechanics)',
      'Fleet Maintenance Manager',
      'Compliance Manager',
      'safety officer',
      'operator',
      'accountant',
      'salesperson',
      'superadmin'
    ]
  },
  policies: { type: String },
  status: { type: String, enum: ['active', 'inactive'] },
  
  // Company & Identification
  company: { type: mongoose.Types.ObjectId, ref: "CompanySettings" },
  internalId: {
    type: String,
    required: function() {
      // internalId is required for driver role only
      return this.role === 'driver';
    },
    unique: true,
    sparse: true // Allow multiple null/undefined values for unique index
  },
  
  // Location Information
  state: { type: String },
  city: { type: String },
  postalCode: { type: String }, // Top-level postal code for backward compatibility
  location: {
    address: { type: String },
    unit: { type: String }, // Unit/Apt number
    city: { type: String },
    state: { type: String },
    postalCode: { type: String }, // Postal/ZIP code
    longitude: { type: String },
    latitude: { type: String }
  },
  
  // Profile & Media
  profileImageUrl: { type: String, default: null },
  avatar: { type: String },
  
  // Dates
  joinDate: { 
    type: Date, 
    required: function() {
      // joinDate is required for driver role only
      return this.role === 'driver';
    },
    default: Date.now // Default to current date for non-driver roles
  },
  dob: { type: Date }, // Date of Birth (for birthdays tracking)
  
  // Mobile App Access
  mobileApp: { type: Boolean, default: false },
  expoPushToken: { type: String, default: null }, // Whether driver has access to mobile app
  
  // Driver Test Requirements (Flags)
  handlesHazardousLoads: { type: Boolean, default: false }, // If true, TDG test is required
  winterTestRequired: { type: Boolean, default: false }, // If true, WINTER test is required
  flagsUpdatedAt: { type: Date }, // Timestamp when flags were last updated
  flagsUpdatedBy: { type: mongoose.Types.ObjectId, ref: "User" }, // User who updated the flags
  
  // Password Reset
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },

  // Stripe & Subscription (for admin users)
  stripeCustomerId: { type: String, default: null },
  trialStartDate: { type: Date, default: null },
  trialEndDate: { type: Date, default: null },
  trialEmailSent: { type: Boolean, default: false },
  trialExpiredEmailSent: { type: Boolean, default: false },
  
  // Driver Specific Details (based on createDriver fields)
  details: {
    // Employee-specific fields (for all roles)
    title: { type: String },
    department: { type: String },
    jobType: { type: String },
    jobTime: { type: String, enum: ['FULL-TIME', 'PART-TIME', 'CONTRACT', 'TEMPORARY'] },
    payType: { type: String, enum: ['Hourly', 'Salary', 'Commission', 'Per Trip', 'Per Mile'] },
    payRate: { type: Number },
    
    // Basic Driver Information (used in createDriver)
    incorporation: { type: String },
    employeeCode: { type: String },
    postalCode: { type: String },
    fleet: { type: String },
    gender: { type: String },
    cell1: { type: String }, // Mobile number
    cell2: { type: String },
    extension: { type: String },
    fax: { type: String },
    citizenship: { type: String },
    wsib: { type: Boolean, default: false },
    wsibAccountNo: { type: String },
    expiryDate: { type: Date },
    remark: { type: String }, // Employment details/notes
    gstNo: { type: String },
    profileImage: { type: String },
    companyFlag: { type: Boolean, default: false },
    fastCardNo: { type: String },
    fastCardExpiry: { type: Date },
    medicalRequired: { type: Boolean, default: false },
    csa: { type: Boolean, default: false },
    dateOfBirth: { type: Date },
    hireDate: { type: Date },
    termDate: { type: Date },
    
    // Payment & Charge Defaults
    defaultChargeName: { type: String },
    defaultCurrency: { type: String },
    chargesAppliedOn: { type: String },
    defaultMode: { type: String },
    defaultAmount: { type: Number, default: 0 },
    defaultRemarks: { type: String },
    defaultPayrollType: { type: String },
    paymentCurrency: { type: String },
    paymentMethod: { type: String },
    account: { type: String },
    
    // Rate Fields
    mileRate: { type: Number, default: 0 },
    mileRateTeam: { type: Number, default: 0 },
    emptyMileRate: { type: Number, default: 0 },
    emptyMileRateTeam: { type: Number, default: 0 },
    hourlyRate: { type: Number, default: 0 },
    weightRate: { type: Number, default: 0 },
    percentageRate: { type: Number, default: 0 },
    bonusDrop: { type: Number, default: 0 }, // BONUS/DROP
    bonusPick: { type: Number, default: 0 }, // BONUS/PICK
    bonusLayover: { type: Number, default: 0 }, // BONUS/LAYOVER
    
    // Salary per Mile Fields (for weather-based calculations)
    salaryPerMile: { type: Number, default: 0 }, // Base salary per mile
    salaryPerMileSnow: { type: Number, default: 0 }, // Additional premium for snow conditions
    salaryPerMileHighTemp: { type: Number, default: 0 }, // Additional premium for high temperature
    highTempThreshold: { type: Number, default: 35 }, // Temperature threshold in Celsius (default 35°C)
    
    // Tax Information
    localTaxNo: { type: String },
    federalTaxNo: { type: String },
    sinNo: { type: String },
    craAccountNo: { type: String },
    fedTaxExempt: { type: Boolean, default: false },
    provTaxExempt: { type: Boolean, default: false },
    cppQppExempt: { type: Boolean, default: false },
    eiExempt: { type: Boolean, default: false },
    qpipExempt: { type: Boolean, default: false },
    customHst: { type: String }, // Custom HST percentage
    driverName: { type: String }, // Driver name for payment
    paymentAddress: { type: String }, // Payment address
    driverTypeSolo: { type: Boolean, default: true }, // true = SOLO, false = TEAM
    cross_border_eligible: { type: Boolean, default: false }, // Cross-border eligibility
    
    // Payroll Settings
    payPeriod: { type: String },
    vacationPay: { type: String },
    ltl: { type: Boolean, default: false },
    onSettlements: { type: Boolean, default: false },
    settlementCurrencyByOrder: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },
    
    // Driver License & Vehicle (used in getDriverById)
    licenceNumber: { type: String },
    driversLicence: { type: String }, // Alias for licenceNumber for frontend compatibility
    licenceExpiry: { type: Date },
    licenceState: { type: String },
    vendor: { type: String },
    vehicle: { type: mongoose.Types.ObjectId, ref: "Vehicle" },
    
    // Passport Information
    passport: { type: String },
    passportNumber: { type: String }, // Alias for passport
    passportCountry: { type: String },
    passportExpiry: { type: Date },
    
    // Canadian Worker Status
    canadianWorkerStatus: { type: String },
    permanentResidenceExpiry: { type: Date },
    workPermitExpiry: { type: Date },
    workPermitDocumentUrl: { type: String }, // Work Permit document URL
    prCardDocumentUrl: { type: String }, // PR Card document URL
    
    // Tickets & Violations
    ticketYTD: { type: Number, default: 0 }, // Tickets year to date
    notes: { type: String }, // Driver notes
    
    // Drug Tests (for cross-border eligible drivers)
    drug_tests: [{
      // Old format fields (for backward compatibility)
      test_date: { type: Date },
      expiry_date: { type: Date },
      consent_form_url: { type: String },
      result_document_url: { type: String },
      uploadedAt: { type: Date, default: Date.now },
      // New format fields
      date: { type: Date },
      result: { type: String },
      labName: { type: String },
      fileUrl: { type: String },
      fileName: { type: String },
      fileSize: { type: Number },
      mimeType: { type: String }
    }]
  },

  // Customer Specific Details (used by dispatch customer UI)
  customerDetails: {
    // Customer type
    customerType: { type: String, enum: ['Customer', 'Shipper-Receiver'], default: 'Customer' },
    
    // Basic identifiers & emails
    customerId: { type: String },              // mirrors customerId field from UI
    emailPrimary: { type: String },
    emailSecondary: { type: String },
    trackingEmail: { type: String },

    // Tax & sales
    taxId: { type: String },
    assignedSalesperson: { type: String },

    // Phones & contact
    phonePrimary: { type: String },
    phoneSecondary: { type: String },
    contact: { type: String },

    // Address & location
    address: { type: String },
    unit: { type: String },
    zipCode: { type: String },
    stateProvince: { type: String },

    // Finance settings (for Customer type only)
    creditLimit: { type: String },
    creditTerm: { type: String },
    invoiceNet: { type: String },
    defaultQuickPayDiscount: { type: String },
    useFactoringCompany: { type: Boolean, default: false },

    // Billing configuration
    billingType: { type: String, enum: ['DEFAULT / LOAD', 'BATCH WEEKLY', 'BATCH MONTHLY'], default: 'DEFAULT / LOAD' },

    // Additional flags
    csaFastApproved: { type: Boolean, default: false },
    softBlock: { type: Boolean, default: false },
    hardBlock: { type: Boolean, default: false },

    // Shipper-Receiver specific fields
    presetNotes: { type: String },
    defaultDropType: { type: String }
  }
}, {
  timestamps: true,
  strict: true // Only save fields defined in schema
});

export const User = mongoose.model('User', userSchema);