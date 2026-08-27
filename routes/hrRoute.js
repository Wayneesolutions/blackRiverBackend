import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/authRoles.js';
import { FileUpload, FileUploadMemory, logFileUpload } from '../middleware/upload.js';
import { User } from '../models/driver/userModel.js';
import { getUserCompanyId } from '../utils/companyFilter.js';
import { getCombinedFilter } from '../utils/trialDataFilter.js';
import { createDriver, updateDriver, getDriverById, updateDriverStatus, deleteDriver, getAllUsersForDrugTest, uploadDriverDrugTest, deleteDriverDrugTest, getDriverDrugTestSignedUrl, getDriverTicketSignedUrl } from '../controllers/driverController.js';
import { generateAIDriverPayroll, bulkAnalyzeAIDriverPayrolls, bulkCreateDriverPayrolls } from '../controllers/hr/driverPayrollAIController.js';
import { getHRAuditTrail } from '../controllers/hr/hrAuditController.js';

// Receipts controllers
import {
  createReceipt,
  getReceipts,
  getReceiptStats,
  updateReceipt,
  deleteReceipt,
  getReceiptSignedUrl
} from '../controllers/user/receiptController.js';

// Financial Notes controllers
import {
  createFinancialNote,
  getFinancialNotes,
  getFinancialNoteStats,
  updateFinancialNote,
  deleteFinancialNote
} from '../controllers/user/financialNoteController.js';

// Fleet Maintenance Finance controllers
import {
  getMaintenanceExpenseSummary,
  getPartsCostLog,
  createPartsCostLog,
  updatePartsCostLog,
  deletePartsCostLog,
  getLaborRates,
  createLaborRate,
  updateLaborRate,
  deleteLaborRate,
  getMaintenancePlans,
  createMaintenancePlan,
  updateMaintenancePlan,
  deleteMaintenancePlan,
  getFleetMaintenanceStats
} from '../controllers/fleet/fleetMaintenanceFinanceController.js';

// Yard controllers
import {
  getAllYards,
  getYardById,
  createYard,
  updateYard,
  deleteYard,
  geocodeAllYards
} from '../controllers/fleet/yardController.js';

// Fleet Customer controllers
import {
  getAllFleetCustomers,
  getFleetCustomerById,
  createFleetCustomer,
  updateFleetCustomer,
  deleteFleetCustomer
} from '../controllers/fleet/fleetCustomerController.js';

// Expense controllers
import {
  createExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
  getExpenseReceiptSignedUrl,
  extractReceiptData
} from '../controllers/user/expenseController.js';
// Expense Category controllers
import {
  listExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory
} from '../controllers/user/expenseCategoryController.js';
// Expense Type controllers
import {
  listExpenseTypes,
  createExpenseType,
  updateExpenseType,
  deleteExpenseType
} from '../controllers/user/expenseTypeController.js';

// Payroll controllers
import {
  createPayroll,
  getPayrolls,
  updatePayroll,
  deletePayroll,
  deleteAllPayrolls
} from '../controllers/user/payrollController.js';

// Paystub controllers
import {
  getPaystubs,
  getPaystubById,
  getPaystubsByUserId,
  getPaystubByPayrollId,
  updatePaystubStatus,
  deletePaystub
} from '../controllers/hr/paystubController.js';

// Automated Payroll controllers
import {
  generateAutomatedPayroll,
  bulkGeneratePayrolls,
  bulkAIGenerateAllPayrolls,
  generateMonthlySalaryReport
} from '../controllers/hr/automatedPayrollController.js';

// User/Employee controllers
import {
  getEmployees
} from '../controllers/user/userController.js';

// Attendance controllers
import {
  listAttendance,
  upsertAttendance,
  deleteAttendance,
  startBreak,
  endBreak,
  getCurrentSession,
  startSession
} from '../controllers/hr/attendanceController.js';

// User Profile controllers
import {
  getUserProfilesPortfolio
} from '../controllers/hr/userProfileController.js';

// HR Dashboard controllers
import {
  getHRDashboard
} from '../controllers/hr/hrDashboardController.js';

// Accounts Dashboard controller
import {
  getAccountsDashboard
} from '../controllers/hr/accountsDashboardController.js';

// Finance Report controller
import {
  getFinanceReport
} from '../controllers/hr/financeReportController.js';

// Vehicle Document controllers
import {
  listDocuments,
  getExpiringVehicleDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  getSignedVehicleDocumentUrl
} from '../controllers/vehicleDocumentController.js';

// HR Note controllers
import {
  addHRNote,
  getHRNotes,
  deleteHRNote
} from '../controllers/hr/hrNoteController.js';

// Load controllers (for completed loads in payroll)
import {
  getCompletedLoadsByDriver
} from '../controllers/loadController.js';

// Trip controllers (for completed trips in payroll and invoice)
import {
  getCompletedTripsByDriver,
  getTripsForInvoice
} from '../controllers/tripController.js';

// Order controllers (for completed orders in payroll)
import {
  getCompletedOrdersByDriver
} from '../controllers/orderController.js';

// Invoice controllers
import {
  createInvoice,
  listInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  getBillingReport
} from '../controllers/user/invoiceController.js';

// Cash Flow Insights controller
import { getCashFlowInsights } from '../controllers/hr/cashFlowController.js';

// Settlement controllers
import {
  createSettlement,
  getSettlements,
  getSettlementById,
  updateSettlement,
  deleteSettlement,
  getSettlementStats,
  createDeductionAddition,
  getDeductionAdditions,
  getDeductionAdditionById,
  updateDeductionAddition,
  deleteDeductionAddition,
  createMilesTracking,
  getMilesTracking,
  getMilesTrackingById,
  updateMilesTracking,
  deleteMilesTracking,
  getMilesTrackingStats
} from '../controllers/hr/settlementController.js';

// Tax Setup controllers
import {
  getIftaRates,
  createIftaRate,
  updateIftaRate,
  deleteIftaRate,
  getSalesTaxRules,
  createSalesTaxRule,
  updateSalesTaxRule,
  deleteSalesTaxRule,
  getPayrollTaxFormulas,
  createPayrollTaxFormula,
  updatePayrollTaxFormula,
  deletePayrollTaxFormula,
  getVendorTaxes,
  createVendorTax,
  updateVendorTax,
  deleteVendorTax
} from '../controllers/hr/taxSetupController.js';

// Account Config controllers
import {
  getChartOfAccounts,
  createChartOfAccount,
  updateChartOfAccount,
  deleteChartOfAccount,
  getTaxCodes,
  createTaxCode,
  updateTaxCode,
  deleteTaxCode,
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  getSmsBilling,
  getSmsBillingStats
} from '../controllers/hr/accountConfigController.js';

// Driver Training Certificate controllers
import {
  createTrainingCertificate,
  getTrainingCertificates,
  getTrainingCertificateById,
  updateTrainingCertificate,
  deleteTrainingCertificate,
  getTrainingCertificateSignedUrl
} from '../controllers/driver/trainingCertificateController.js';

// Question Bank controllers
import {
  createQuestionBank,
  getQuestionBanks,
  getQuestionBankById,
  updateQuestionBank,
  deleteQuestionBank
} from '../controllers/driver/questionBankController.js';

// Training Content controllers
import {
  createTrainingContent,
  getTrainingContent,
  getTrainingContentById,
  updateTrainingContent,
  deleteTrainingContent,
  getTrainingContentSignedUrl
} from '../controllers/driver/trainingContentController.js';

// Test Result controllers
import {
  submitTestResult,
  getTestResults,
  getTestResultById,
  getDriverTestStatus,
  approveTestResult,
  rejectTestResult
} from '../controllers/driver/testResultController.js';

// Test Type controllers
import {
  createTestType,
  getTestTypes,
  updateTestType,
  deleteTestType
} from '../controllers/driver/testTypeController.js';

// Onboarding controllers
import {
  markTrainingComplete,
  getDriverOnboardingStatus,
  updateHRApprovalStatus
} from '../controllers/driver/onboardingController.js';

// Driver Drug Test controllers
import {
  createDrugTest,
  getDrugTests,
  getDrugTestById,
  updateDrugTest,
  deleteDrugTest,
  verifyDrugTestPassword
} from '../controllers/driver/drugTestController.js';

// ELD Documents controllers
import {
  uploadELDDocument,
  getELDDocuments,
  getELDDocumentById,
  updateELDDocument,
  deleteELDDocument,
  downloadELDDocument,
  getELDDocumentSignedUrl
} from '../controllers/hr/eldDocumentController.js';

export const hrRoute = express.Router();

// ==================== HR DASHBOARD ROUTE ====================
hrRoute.get(
  '/dashboard',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getHRDashboard
);

// ==================== ACCOUNTS DASHBOARD ROUTE ====================
hrRoute.get(
  '/accounts-dashboard',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accounts', 'accountant'),
  getAccountsDashboard
);

// ==================== FINANCE REPORT ROUTE ====================
hrRoute.get(
  '/finance-report',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accounts', 'accountant'),
  getFinanceReport
);

// Receipts Routes
hrRoute.post(
  '/create-receipt',
  authMiddleware,
  FileUpload.single('file'),
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  createReceipt
);
hrRoute.get(
  '/list-receipt',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  getReceipts
);
hrRoute.get(
  '/receipt/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  getReceiptStats
);
hrRoute.put(
  '/update-receipt/:id',
  FileUpload.single('file'),
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  updateReceipt
);
hrRoute.delete(
  '/delete-receipt/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  deleteReceipt
);
hrRoute.get(
  '/receipt/:receiptId/signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  getReceiptSignedUrl
);

// Financial Notes Routes
hrRoute.post(
  '/create-financial-note',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  createFinancialNote
);
hrRoute.get(
  '/list-financial-note',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  getFinancialNotes
);
hrRoute.get(
  '/financial-note/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  getFinancialNoteStats
);
hrRoute.put(
  '/update-financial-note/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  updateFinancialNote
);
hrRoute.delete(
  '/delete-financial-note/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  deleteFinancialNote
);

// Fleet Maintenance Finance Routes
// Maintenance Expense Summary
hrRoute.get(
  '/fleet-maintenance/expense-summary',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  getMaintenanceExpenseSummary
);

// Parts Cost Log
hrRoute.get(
  '/fleet-maintenance/parts-cost-log',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  getPartsCostLog
);
hrRoute.post(
  '/fleet-maintenance/parts-cost-log',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  createPartsCostLog
);
hrRoute.put(
  '/fleet-maintenance/parts-cost-log/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  updatePartsCostLog
);
hrRoute.delete(
  '/fleet-maintenance/parts-cost-log/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  deletePartsCostLog
);

// Labor Rates
hrRoute.get(
  '/fleet-maintenance/labor-rates',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  getLaborRates
);
hrRoute.post(
  '/fleet-maintenance/labor-rates',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  createLaborRate
);
hrRoute.put(
  '/fleet-maintenance/labor-rates/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  updateLaborRate
);
hrRoute.delete(
  '/fleet-maintenance/labor-rates/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  deleteLaborRate
);

// Maintenance Plan Financials
hrRoute.get(
  '/fleet-maintenance/maintenance-plans',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  getMaintenancePlans
);
hrRoute.post(
  '/fleet-maintenance/maintenance-plans',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  createMaintenancePlan
);
hrRoute.put(
  '/fleet-maintenance/maintenance-plans/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  updateMaintenancePlan
);
hrRoute.delete(
  '/fleet-maintenance/maintenance-plans/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  deleteMaintenancePlan
);

// Fleet Maintenance Stats
hrRoute.get(
  '/fleet-maintenance/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant'),
  getFleetMaintenanceStats
);

// ==================== YARD ROUTES ====================
// Get all yards
hrRoute.get(
  '/fleet-maintenance/yards',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant', 'dispatcher', 'operator'),
  getAllYards
);

// Get yard by ID
hrRoute.get(
  '/fleet-maintenance/yards/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant', 'dispatcher', 'operator'),
  getYardById
);

// Create yard
hrRoute.post(
  '/fleet-maintenance/yards',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant', 'dispatcher', 'operator'),
  createYard
);

// Update yard
hrRoute.put(
  '/fleet-maintenance/yards/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant', 'dispatcher', 'operator'),
  updateYard
);

// Delete yard
hrRoute.delete(
  '/fleet-maintenance/yards/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant', 'dispatcher', 'operator'),
  deleteYard
);

// Geocode all yards (utility endpoint)
hrRoute.post(
  '/fleet-maintenance/yards/geocode-all',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  geocodeAllYards
);

// ==================== FLEET CUSTOMERS ROUTES ====================
hrRoute.get(
  '/fleet-maintenance/customers',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant', 'dispatcher', 'operator'),
  getAllFleetCustomers
);
hrRoute.get(
  '/fleet-maintenance/customers/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant', 'dispatcher', 'operator'),
  getFleetCustomerById
);
hrRoute.post(
  '/fleet-maintenance/customers',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant', 'dispatcher', 'operator'),
  createFleetCustomer
);
hrRoute.put(
  '/fleet-maintenance/customers/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant', 'dispatcher', 'operator'),
  updateFleetCustomer
);
hrRoute.delete(
  '/fleet-maintenance/customers/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accounts', 'accountant', 'dispatcher', 'operator'),
  deleteFleetCustomer
);

// ==================== EXPENSE ROUTES ====================
hrRoute.post(
  '/create-expense',
  authMiddleware,
  FileUpload.single('receipt'),
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  createExpense
);
hrRoute.get(
  '/list-expense',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  getExpenses
);
hrRoute.put(
  '/update-expense/:id',
  authMiddleware,
  FileUpload.single('receipt'),
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  updateExpense
);
hrRoute.delete(
  '/delete-expense/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  deleteExpense
);
hrRoute.post(
  '/extract-receipt',
  authMiddleware,
  FileUploadMemory.single('receipt'),
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  extractReceiptData
);
hrRoute.get(
  '/expense/:expenseId/receipt-signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  getExpenseReceiptSignedUrl
);

// ==================== EXPENSE CATEGORY ROUTES ====================
hrRoute.get(
  '/expense-categories',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  listExpenseCategories
);
hrRoute.post(
  '/expense-categories',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  createExpenseCategory
);
hrRoute.put(
  '/expense-categories/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  updateExpenseCategory
);
hrRoute.delete(
  '/expense-categories/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  deleteExpenseCategory
);

// ==================== EXPENSE TYPE ROUTES ====================
hrRoute.get(
  '/expense-types',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  listExpenseTypes
);
hrRoute.post(
  '/expense-types',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  createExpenseType
);
hrRoute.put(
  '/expense-types/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  updateExpenseType
);
hrRoute.delete(
  '/expense-types/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Compliance Manager', 'accountant'),
  deleteExpenseType
);

// ==================== PAYROLL ROUTES ====================
hrRoute.post(
  '/create-payroll',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  createPayroll
);
hrRoute.get(
  '/list-payroll',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getPayrolls
);
hrRoute.put(
  '/update-payroll/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  updatePayroll
);
hrRoute.delete(
  '/delete-payroll/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deletePayroll
);
hrRoute.delete(
  '/delete-all-payrolls',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deleteAllPayrolls
);

// Automated Payroll Generation Routes
hrRoute.post(
  '/generate-payroll',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accounts', 'accountant'),
  generateAutomatedPayroll
);

hrRoute.post(
  '/bulk-generate-payrolls',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accounts', 'accountant'),
  bulkGeneratePayrolls
);

// ==================== PAYSTUB ROUTES ====================
hrRoute.get(
  '/paystubs',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getPaystubs
);
hrRoute.get(
  '/paystubs/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getPaystubById
);
hrRoute.get(
  '/paystubs/user/:userId',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getPaystubsByUserId
);
hrRoute.get(
  '/paystubs/payroll/:payrollId',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getPaystubByPayrollId
);
hrRoute.put(
  '/paystubs/:id/status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  updatePaystubStatus
);
hrRoute.delete(
  '/paystubs/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deletePaystub
);

// Bulk AI-powered payroll generation for ALL employees
hrRoute.post(
  '/bulk-ai-generate-all-payrolls',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accounts', 'accountant'),
  bulkAIGenerateAllPayrolls
);

hrRoute.get(
  '/monthly-salary-report',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accounts', 'accountant'),
  generateMonthlySalaryReport
);

// ==================== EMPLOYEE ROUTES ====================
hrRoute.get(
  '/get-employees',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'dispatcher', 'Fleet Maintenance Manager', 'safety officer', 'accountant'),
  getEmployees
);

// ==================== DRIVER COMPLETED LOADS/TRIPS (for payroll) ====================
hrRoute.get(
  '/completed-loads/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'dispatcher', 'accountant'),
  getCompletedLoadsByDriver
);
hrRoute.get(
  '/completed-trips/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'dispatcher', 'accountant'),
  getCompletedTripsByDriver
);
hrRoute.get(
  '/completed-orders/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'dispatcher', 'accountant'),
  getCompletedOrdersByDriver
);

// ==================== INVOICE ROUTES ====================
// Get trips for invoice creation
hrRoute.get(
  '/invoice-trips',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'dispatcher', 'accountant'),
  getTripsForInvoice
);

// Invoice CRUD operations
hrRoute.post(
  '/create-invoice',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  createInvoice
);
hrRoute.get(
  '/list-invoice',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  listInvoices
);
hrRoute.get(
  '/invoice/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getInvoiceById
);
hrRoute.put(
  '/update-invoice/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  updateInvoice
);
hrRoute.delete(
  '/delete-invoice/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  deleteInvoice
);
hrRoute.get(
  '/cash-flow-insights',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accounts', 'accountant'),
  getCashFlowInsights
);

hrRoute.get(
  '/billing-report',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getBillingReport
);

// ==================== SETTLEMENT ROUTES ====================
// Settlement CRUD
hrRoute.post(
  '/settlement',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  createSettlement
);
hrRoute.get(
  '/settlement/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getSettlementStats
);
hrRoute.get(
  '/settlement',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getSettlements
);
hrRoute.get(
  '/settlement/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getSettlementById
);
hrRoute.put(
  '/settlement/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  updateSettlement
);
hrRoute.delete(
  '/settlement/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  deleteSettlement
);

// Deduction & Addition routes
hrRoute.post(
  '/deduction-addition',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  createDeductionAddition
);
hrRoute.get(
  '/deduction-addition',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getDeductionAdditions
);
hrRoute.get(
  '/deduction-addition/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getDeductionAdditionById
);
hrRoute.put(
  '/deduction-addition/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  updateDeductionAddition
);
hrRoute.delete(
  '/deduction-addition/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  deleteDeductionAddition
);

// ==================== MILES TRACKING ROUTES ====================
hrRoute.post(
  '/miles-tracking',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  createMilesTracking
);
hrRoute.get(
  '/miles-tracking/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getMilesTrackingStats
);
hrRoute.get(
  '/miles-tracking',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getMilesTracking
);
hrRoute.get(
  '/miles-tracking/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getMilesTrackingById
);
hrRoute.put(
  '/miles-tracking/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  updateMilesTracking
);
hrRoute.delete(
  '/miles-tracking/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  deleteMilesTracking
);

// ==================== TAX SETUP ROUTES ====================
// IFTA Rates Routes
hrRoute.get(
  '/tax-setup/ifta-rates',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getIftaRates
);
hrRoute.post(
  '/tax-setup/ifta-rates',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  createIftaRate
);
hrRoute.put(
  '/tax-setup/ifta-rates/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  updateIftaRate
);
hrRoute.delete(
  '/tax-setup/ifta-rates/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  deleteIftaRate
);

// Sales Tax Routes
hrRoute.get(
  '/tax-setup/sales-tax',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getSalesTaxRules
);
hrRoute.post(
  '/tax-setup/sales-tax',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  createSalesTaxRule
);
hrRoute.put(
  '/tax-setup/sales-tax/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  updateSalesTaxRule
);
hrRoute.delete(
  '/tax-setup/sales-tax/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  deleteSalesTaxRule
);

// Payroll Tax Routes
hrRoute.get(
  '/tax-setup/payroll-tax',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getPayrollTaxFormulas
);
hrRoute.post(
  '/tax-setup/payroll-tax',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  createPayrollTaxFormula
);
hrRoute.put(
  '/tax-setup/payroll-tax/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  updatePayrollTaxFormula
);
hrRoute.delete(
  '/tax-setup/payroll-tax/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  deletePayrollTaxFormula
);

// Vendor Tax Routes
hrRoute.get(
  '/tax-setup/vendor-tax',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getVendorTaxes
);
hrRoute.post(
  '/tax-setup/vendor-tax',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  createVendorTax
);
hrRoute.put(
  '/tax-setup/vendor-tax/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  updateVendorTax
);
hrRoute.delete(
  '/tax-setup/vendor-tax/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  deleteVendorTax
);

// ==================== ACCOUNT CONFIG ROUTES ====================
// Chart of Accounts Routes
hrRoute.get(
  '/account-config/chart-of-accounts',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getChartOfAccounts
);
hrRoute.post(
  '/account-config/chart-of-accounts',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  createChartOfAccount
);
hrRoute.put(
  '/account-config/chart-of-accounts/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  updateChartOfAccount
);
hrRoute.delete(
  '/account-config/chart-of-accounts/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  deleteChartOfAccount
);

// Tax Codes Routes
hrRoute.get(
  '/account-config/tax-codes',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getTaxCodes
);
hrRoute.post(
  '/account-config/tax-codes',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  createTaxCode
);
hrRoute.put(
  '/account-config/tax-codes/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  updateTaxCode
);
hrRoute.delete(
  '/account-config/tax-codes/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  deleteTaxCode
);

// Payment Methods Routes
hrRoute.get(
  '/account-config/payment-methods',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getPaymentMethods
);
hrRoute.post(
  '/account-config/payment-methods',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  createPaymentMethod
);
hrRoute.put(
  '/account-config/payment-methods/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  updatePaymentMethod
);
hrRoute.delete(
  '/account-config/payment-methods/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  deletePaymentMethod
);

// SMS Billing Routes
hrRoute.get(
  '/account-config/sms-billing',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getSmsBilling
);
hrRoute.get(
  '/account-config/sms-billing/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getSmsBillingStats
);

// ==================== DRIVER ROUTES ====================
hrRoute.get(
  '/driver',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'dispatcher', 'accountant', 'Fleet Maintenance Manager', 'Compliance Manager'),
  async (req, res) => {
    try {
      const { page = 1, limit = 100, search, status } = req.query;
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
      const skip = (pageNum - 1) * limitNum;

      // Get company filter with strict validation
      const userCompanyId = getUserCompanyId(req.user);
      const isSuperadmin = req.user?.role === 'superadmin';
      
      const hasValidCompany = userCompanyId !== null && 
                              userCompanyId !== undefined && 
                              userCompanyId !== '' &&
                              String(userCompanyId).trim() !== '' &&
                              String(userCompanyId) !== 'null' &&
                              String(userCompanyId) !== 'undefined';

      // CRITICAL: If not superadmin and no valid company, return empty data
      if (!isSuperadmin && !hasValidCompany) {
        console.log('❌ /hr/driver: Admin has no company - returning empty data');
        return res.json({
          success: true,
          data: [],
          pagination: {
            currentPage: pageNum,
            totalPages: 0,
            totalItems: 0,
            pageSize: limitNum,
            hasNextPage: false,
            hasPrevPage: false
          }
        });
      }

      const companyFilter = hasValidCompany ? { company: userCompanyId } : null;
      const combinedFilter = await getCombinedFilter(req.user, companyFilter);

      // CRITICAL: For non-superadmin, query MUST include company filter
      let query = { role: 'driver' };
      
      if (isSuperadmin) {
        if (combinedFilter) {
          query = { role: 'driver', ...combinedFilter };
        }
      } else {
        // Non-superadmin MUST have company filter
        if (!hasValidCompany || !userCompanyId) {
          console.error('❌ /hr/driver: No valid company - returning empty data');
          return res.json({
            success: true,
            data: [],
            pagination: {
              currentPage: pageNum,
              totalPages: 0,
              totalItems: 0,
              pageSize: limitNum,
              hasNextPage: false,
              hasPrevPage: false
            }
          });
        }
        
        // Ensure company filter is in query
        if (combinedFilter) {
          if (combinedFilter.$and && Array.isArray(combinedFilter.$and)) {
            const hasCompany = combinedFilter.$and.some(cond => cond && cond.company);
            if (!hasCompany) {
              query = {
                role: 'driver',
                ...combinedFilter,
                $and: [...combinedFilter.$and, { company: userCompanyId }]
              };
            } else {
              query = { role: 'driver', ...combinedFilter };
            }
          } else if (combinedFilter.company) {
            query = { role: 'driver', ...combinedFilter };
          } else {
            query = { role: 'driver', ...combinedFilter, company: userCompanyId };
          }
        } else {
          query = { role: 'driver', company: userCompanyId };
        }
      }

      // Apply status filter if provided
      if (status && status !== 'all') {
        query.status = status;
      }

      // Apply search filter if provided
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
          { name: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
          { internalId: searchRegex }
        ];
      }

      // Import EmployeeDocument and compliance calculator
      const { EmployeeDocument } = await import("../models/driver/employeeDocumentModel.js");
      const { calculateDriverCompliance } = await import("../utils/driverCompliance.js");

      // Get total count and paginated results
      const [total, employees] = await Promise.all([
        User.countDocuments(query),
        User.find(query)
          .select('name role phone status email details internalId company profileImageUrl joinDate location policies createdAt updatedAt dob')
          .populate('company', 'companyName companyCode')
          .sort({ name: 1 })
          .skip(skip)
          .limit(limitNum)
          .lean()
      ]);

      // Fetch documents for all drivers in batch
      const driverIds = employees.map(emp => emp._id);
      const allDocuments = await EmployeeDocument.find({
        employee: { $in: driverIds },
        isInUse: { $ne: false } // Include documents that are in use (default true)
      }).lean();

      // Group documents by driver
      const documentsByDriver = {};
      allDocuments.forEach(doc => {
        const driverId = doc.employee.toString();
        if (!documentsByDriver[driverId]) {
          documentsByDriver[driverId] = [];
        }
        documentsByDriver[driverId].push(doc);
      });

      // Helper: generate presigned URL for private S3 objects
      const generateSignedUrl = async (url) => {
        if (!url || (!url.includes('s3.amazonaws.com') && !url.includes('.s3.'))) return url;
        try {
          const { GetObjectCommand } = await import("@aws-sdk/client-s3");
          const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
          const { getS3ClientForBucket, extractRegionFromS3Url } = await import("../config/awsConfig.js");
          const cleanUrl = url.split('?')[0].split('#')[0];
          const urlObj = new URL(cleanUrl);
          let bucketName = process.env.AWS_S3_BUCKET_NAME;
          let key = decodeURIComponent(urlObj.pathname.substring(1));
          if (urlObj.hostname.includes('.s3.')) {
            bucketName = urlObj.hostname.split('.s3.')[0];
          }
          if (key.includes('?')) key = key.split('?')[0];
          const s3Client = await getS3ClientForBucket(bucketName, url);
          const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
          return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        } catch {
          return url;
        }
      };

      // Transform driver data to match frontend expectations
      const transformedEmployees = await Promise.all(employees.map(async (driver) => {
        // Extract company name if populated
        let companyDisplay = '-';
        if (driver.company) {
          if (typeof driver.company === 'object' && driver.company.companyName) {
            companyDisplay = driver.company.companyName;
          } else if (typeof driver.company === 'string') {
            companyDisplay = driver.company;
          }
        }

        // Get driver's documents
        const driverDocuments = documentsByDriver[driver._id.toString()] || [];
        
        // Calculate compliance status
        const compliance = await calculateDriverCompliance(driver, driverDocuments);

        // Format date of birth
        let dateOfBirthFormatted = '';
        if (driver.details?.dateOfBirth) {
          const dob = new Date(driver.details.dateOfBirth);
          dateOfBirthFormatted = dob.toLocaleDateString('en-US', { 
            month: '2-digit', 
            day: '2-digit', 
            year: 'numeric' 
          });
        } else if (driver.dob) {
          const dob = new Date(driver.dob);
          dateOfBirthFormatted = dob.toLocaleDateString('en-US', { 
            month: '2-digit', 
            day: '2-digit', 
            year: 'numeric' 
          });
        }

        // Get driver's licence number
        const driversLicence = driver.details?.driversLicence || driver.details?.licenceNumber || '';
        
        // Get passport number
        const passport = driver.details?.passport || driver.details?.passportNumber || '';
        
        // Get ticket YTD
        const ticketYTD = driver.details?.ticketYTD || 0;

        // Get notes
        const notes = driver.details?.notes || '';

        // Format name into firstName and lastName
        const nameParts = (driver.name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Generate driverId from internalId or _id
        const driverId = driver.internalId || driver._id.toString().slice(-6).toUpperCase();

        // Generate presigned URL for profile image (private S3 bucket)
        const profileImageUrl = await generateSignedUrl(driver.profileImageUrl);

        return {
          ...driver,
          profileImageUrl,
          // Driver ID for display
          driverId: driverId,
          // Name parts
          firstName: firstName,
          lastName: lastName,
          // Driver-specific fields
          driversLicence: driversLicence,
          passport: passport,
          dateOfBirth: dateOfBirthFormatted,
          ticketYTD: ticketYTD,
          notes: notes,
          // Compliance status
          compliance: compliance.status,
          complianceDetails: compliance,
          // Extract fields from details object
          mobile: driver.details?.cell1 || '',
          gender: driver.details?.gender || '',
          citizenship: driver.details?.citizenship || '',
          wsib: driver.details?.wsib ? 'Yes' : (driver.details?.wsib === false ? 'No' : ''),
          fastCard: driver.details?.fastCardNo || '',
          medicalTracking: driver.details?.medicalRequired ? 'Yes' : (driver.details?.medicalRequired === false ? 'No' : ''),
          csa: driver.details?.csa ? 'Yes' : (driver.details?.csa === false ? 'No' : ''),
          employmentDetails: driver.details?.remark || '',
          // Extract address from location object
          address: driver.location?.address || '',
          // Company display
          company: companyDisplay,
          // Status mapping
          status: driver.status === 'active' ? 'ACTIVE' : (driver.status === 'inactive' ? 'INACTIVE' : 'ACTIVE')
        };
      }));

      const totalPages = Math.ceil(total / limitNum);

      return res.json({
        success: true,
        data: transformedEmployees,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: total,
          pageSize: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1
        }
      });
    } catch (error) {
      console.error('Error fetching drivers:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch drivers'
      });
    }
  }
);

// ==================== DRIVER TRAINING CERTIFICATE ROUTES ====================
// NOTE: These routes must come BEFORE /driver/:id to prevent route matching conflicts
// Create training certificate
hrRoute.post(
  '/driver/training-certificate',
  authMiddleware,
  FileUpload.single('file'),
  authorizeRoles('admin', 'superadmin', 'hr'),
  createTrainingCertificate
);

// Get all training certificates
hrRoute.get(
  '/driver/training-certificate',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getTrainingCertificates
);

// Get training certificate by ID
hrRoute.get(
  '/driver/training-certificate/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getTrainingCertificateById
);

// Update training certificate
hrRoute.put(
  '/driver/training-certificate/:id',
  authMiddleware,
  FileUpload.single('file'),
  authorizeRoles('admin', 'superadmin', 'hr'),
  updateTrainingCertificate
);

// Delete training certificate
hrRoute.delete(
  '/driver/training-certificate/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deleteTrainingCertificate
);

// Get training certificate signed URL
hrRoute.get(
  '/driver/training-certificate/:id/signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getTrainingCertificateSignedUrl
);

// ==================== QUESTION BANK ROUTES ====================
// Create question bank
hrRoute.post(
  '/driver/question-bank',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  createQuestionBank
);

// Get all question banks (allow drivers to view)
hrRoute.get(
  '/driver/question-bank',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'driver'),
  getQuestionBanks
);

// Get question bank by ID (allow drivers to view)
hrRoute.get(
  '/driver/question-bank/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'driver'),
  getQuestionBankById
);

// Update question bank
hrRoute.put(
  '/driver/question-bank/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  updateQuestionBank
);

// Delete question bank
hrRoute.delete(
  '/driver/question-bank/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deleteQuestionBank
);

// ==================== TRAINING CONTENT ROUTES ====================
// Create training content
hrRoute.post(
  '/driver/training-content',
  authMiddleware,
  FileUpload.single('file'),
  authorizeRoles('admin', 'superadmin', 'hr'),
  createTrainingContent
);

// Get all training content (allow drivers to view)
hrRoute.get(
  '/driver/training-content',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'driver'),
  getTrainingContent
);

// Get training content by ID (allow drivers to view)
hrRoute.get(
  '/driver/training-content/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'driver'),
  getTrainingContentById
);

// Update training content
hrRoute.put(
  '/driver/training-content/:id',
  authMiddleware,
  FileUpload.single('file'),
  authorizeRoles('admin', 'superadmin', 'hr'),
  updateTrainingContent
);

// Delete training content
hrRoute.delete(
  '/driver/training-content/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deleteTrainingContent
);

// Get training content signed URL (allow drivers to view)
hrRoute.get(
  '/driver/training-content/:id/signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'driver'),
  getTrainingContentSignedUrl
);

// ==================== TEST RESULT ROUTES ====================
// Submit test result
hrRoute.post(
  '/driver/test-result',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'driver'),
  submitTestResult
);

// Get all test results
hrRoute.get(
  '/driver/test-result',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getTestResults
);

// Get test result by ID
hrRoute.get(
  '/driver/test-result/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getTestResultById
);

// Get driver test status (for mobile app)
hrRoute.get(
  '/driver/:driverId/test-status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'driver'),
  getDriverTestStatus
);

// Approve test result (HR only)
hrRoute.put(
  '/driver/test-result/:id/approve',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  approveTestResult
);

// Reject test result (HR only)
hrRoute.put(
  '/driver/test-result/:id/reject',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  rejectTestResult
);

// ==================== TEST TYPE ROUTES ====================
// Create test type
hrRoute.post(
  '/driver/test-type',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  createTestType
);

// Get all test types
hrRoute.get(
  '/driver/test-type',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'driver'),
  getTestTypes
);

// Update test type
hrRoute.put(
  '/driver/test-type/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  updateTestType
);

// Delete test type
hrRoute.delete(
  '/driver/test-type/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deleteTestType
);

// ==================== DRIVER ONBOARDING ROUTES ====================
// Mark training as complete
hrRoute.post(
  '/driver/onboarding/training-complete',
  authMiddleware,
  authorizeRoles('driver'),
  markTrainingComplete
);

// Get driver onboarding status
hrRoute.get(
  '/driver/onboarding/:driverId/status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'driver'),
  getDriverOnboardingStatus
);

// Update HR approval status (HR only)
hrRoute.put(
  '/driver/onboarding/:driverId/hr-approval',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  updateHRApprovalStatus
);

// ==================== DRIVER DRUG TEST ROUTES ====================
// NOTE: These routes must come BEFORE /driver/:id to prevent route matching conflicts
// Create drug test request
hrRoute.post(
  '/driver/drug-test',
  authMiddleware,
  FileUpload.fields([
    { name: 'consentForm', maxCount: 1 },
    { name: 'drugTestDocument', maxCount: 1 }
  ]),
  authorizeRoles('admin', 'superadmin', 'hr'),
  createDrugTest
);

// Get all drug test requests
hrRoute.get(
  '/driver/drug-test',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getDrugTests
);

// Get drug test request by ID
hrRoute.get(
  '/driver/drug-test/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getDrugTestById
);

// Update drug test request
hrRoute.put(
  '/driver/drug-test/:id',
  authMiddleware,
  FileUpload.fields([
    { name: 'consentForm', maxCount: 1 },
    { name: 'drugTestDocument', maxCount: 1 }
  ]),
  authorizeRoles('admin', 'superadmin', 'hr'),
  updateDrugTest
);

// Delete drug test request
hrRoute.delete(
  '/driver/drug-test/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deleteDrugTest
);

// Verify password for drug test section access
hrRoute.post(
  '/driver/drug-test/verify-password',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  verifyDrugTestPassword
);

// ==================== DRIVER PROFILE DRUG TEST ROUTES ====================
// Upload drug test to driver profile (stored in driver.details.drug_tests)
hrRoute.post(
  '/driver/:driverId/drug-test',
  authMiddleware,
  FileUpload.fields([
    { name: 'consentForm', maxCount: 1 },
    { name: 'resultDocument', maxCount: 1 }
  ]),
  authorizeRoles('admin', 'superadmin', 'hr'),
  uploadDriverDrugTest
);

// Delete drug test from driver profile
hrRoute.delete(
  '/driver/:driverId/drug-test/:testIndex',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deleteDriverDrugTest
);

// Get signed URL for drug test document
hrRoute.get(
  '/driver/:driverId/drug-test/:testIndex/signed-url/:documentType',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getDriverDrugTestSignedUrl
);

// Get signed URL for driver ticket document
hrRoute.get(
  '/driver/ticket/:ticketId/signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getDriverTicketSignedUrl
);

// Get all users for drug test (excluding admin and superadmin)
hrRoute.get(
  '/users-for-drug-test',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getAllUsersForDrugTest
);

hrRoute.get(
  '/driver/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'dispatcher', 'Fleet Maintenance Manager', 'Compliance Manager'),
  getDriverById
);

hrRoute.post(
  '/driver',
  authMiddleware,
  FileUpload.fields([
    { name: 'file', maxCount: 1 }, // Profile image
    { name: 'documentFiles', maxCount: 20 }, // Document files
    { name: 'certificationFiles', maxCount: 20 }, // Certification files
    { name: 'violationFiles', maxCount: 10 }, // Violation files
    { name: 'ticketFiles', maxCount: 20 }, // Ticket files
    { name: 'receiptFiles', maxCount: 20 }, // Receipt files
    { name: 'drugTestFiles', maxCount: 20 }, // Drug test files
    { name: 'workPermitDocument', maxCount: 1 }, // Work Permit document
    { name: 'prCardDocument', maxCount: 1 } // PR Card document
  ]),
  authorizeRoles('admin', 'superadmin', 'hr'),
  createDriver
);

hrRoute.put(
  '/driver/:id',
  authMiddleware,
  FileUpload.fields([
    { name: 'file', maxCount: 1 }, // Profile image
    { name: 'documentFiles', maxCount: 50 }, // Document files
    { name: 'certificationFiles', maxCount: 50 }, // Certification files
    { name: 'violationFiles', maxCount: 50 }, // Violation files
    { name: 'ticketFiles', maxCount: 50 }, // Ticket files
    { name: 'receiptFiles', maxCount: 50 }, // Receipt files
    { name: 'drugTestFiles', maxCount: 50 }, // Drug test files
    { name: 'workPermitDocument', maxCount: 1 }, // Work Permit document
    { name: 'prCardDocument', maxCount: 1 } // PR Card document
  ]),
  authorizeRoles('admin', 'superadmin', 'hr'),
  updateDriver
);

// Delete driver
hrRoute.delete(
  '/driver/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deleteDriver
);

// Update driver status
hrRoute.patch(
  '/driver/:id/status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  updateDriverStatus
);

// AI-powered driver payroll generation
hrRoute.post(
  '/driver-payroll/ai-analysis',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accounts', 'accountant'),
  generateAIDriverPayroll
);

// Bulk AI-powered driver payroll analysis (returns suggestions for review)
hrRoute.post(
  '/driver-payroll/bulk-analyze-ai',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accounts', 'accountant'),
  bulkAnalyzeAIDriverPayrolls
);

// Bulk create driver payrolls from AI suggestions (after user review)
hrRoute.post(
  '/driver-payroll/bulk-create',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accounts', 'accountant'),
  bulkCreateDriverPayrolls
);

// Keep old route for backward compatibility
hrRoute.post(
  '/driver-payroll/bulk-generate-ai',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accounts', 'accountant'),
  bulkAnalyzeAIDriverPayrolls
);

// ==================== ATTENDANCE ROUTES ====================
hrRoute.get(
  '/attendance',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  listAttendance
);

hrRoute.post(
  '/attendance',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  upsertAttendance
);

hrRoute.delete(
  '/attendance/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deleteAttendance
);

hrRoute.post(
  '/attendance/break/start',
  authMiddleware,
  startBreak
);

hrRoute.post(
  '/attendance/break/end',
  authMiddleware,
  endBreak
);

hrRoute.get(
  '/attendance/session/current',
  authMiddleware,
  getCurrentSession
);

hrRoute.post(
  '/attendance/session/start',
  authMiddleware,
  startSession
);

// ==================== HR NOTES ROUTES ====================
hrRoute.get(
  '/employees/:userId/notes',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  getHRNotes
);

hrRoute.post(
  '/employees/:userId/notes',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'accountant'),
  addHRNote
);

hrRoute.delete(
  '/employees/notes/:noteId',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deleteHRNote
);

// ==================== USER PROFILES ROUTES ====================
hrRoute.get(
  '/user-profiles',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getUserProfilesPortfolio
);

// ==================== VEHICLE DOCUMENT ROUTES ====================
// List all vehicle documents (grouped by vehicle)
hrRoute.get(
  '/vehicle-document',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Fleet Maintenance Manager'),
  listDocuments
);

// Get expiring vehicle documents (specific route before general routes)
hrRoute.get(
  '/vehicle-document/expiring',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Fleet Maintenance Manager'),
  getExpiringVehicleDocuments
);

// Get signed URL for vehicle document file
hrRoute.get(
  '/vehicle-document/:id/signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Fleet Maintenance Manager'),
  getSignedVehicleDocumentUrl
);

// Create vehicle document
hrRoute.post(
  '/vehicle-document',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Fleet Maintenance Manager'),
  FileUpload.single('file'),
  createDocument
);

// Update vehicle document
hrRoute.put(
  '/vehicle-document/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Fleet Maintenance Manager'),
  FileUpload.single('file'),
  updateDocument
);

// Delete vehicle document
hrRoute.delete(
  '/vehicle-document/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Fleet Maintenance Manager'),
  deleteDocument
);

// ==================== ELD DOCUMENTS ROUTES ====================
// Upload ELD document
hrRoute.post(
  '/eld-documents/upload',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  FileUpload.single('file'),
  logFileUpload,
  uploadELDDocument
);

// Get all ELD documents
hrRoute.get(
  '/eld-documents',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getELDDocuments
);

// Get ELD document by ID
hrRoute.get(
  '/eld-documents/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getELDDocumentById
);

// Update ELD document
hrRoute.put(
  '/eld-documents/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  updateELDDocument
);

// Delete ELD document
hrRoute.delete(
  '/eld-documents/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deleteELDDocument
);

// Download ELD document
hrRoute.get(
  '/eld-documents/:id/download',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  downloadELDDocument
);

// Get signed URL for ELD document
hrRoute.get(
  '/eld-documents/:id/signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getELDDocumentSignedUrl
);

// ==================== HR AUDIT TRAIL ====================
hrRoute.get(
  '/audit-trail',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  getHRAuditTrail
);