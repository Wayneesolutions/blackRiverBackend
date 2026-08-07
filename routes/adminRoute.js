import express from 'express'
import { registerAdmin, createAdmin, getAllowedRolesForAdmin } from '../controllers/adminManageController.js'
import { 
  loginAdmin, 
  getDriverStats, 
  getLoadStats, 
  getSafetyStats, 
  getRecentDriverActivities 
} from '../controllers/adminController.js'
import { getDriverActivities } from '../controllers/driver/driverAcivityController.js'
import { authAdmin } from '../middleware/authAdmin.js'
import { FileUpload, FileUploadMemory } from '../middleware/upload.js'
import {
  createContact,
  deleteContact,
  listContacts,
  searchContact,
  updateContact
} from '../controllers/contactControlle.js'
import {
  createIssue,
  deleteIssue,
  listIssues,
  searchIssues,
  updateIssue
} from '../controllers/issueController.js'
import {
  createVehicleAssessment,
  deleteVehicleAssessment,
  getVehicleAssessmentById,
  getVehicleAssessments,
  searchVehicleAssessments,
  updateVehicleAssessment
} from '../controllers/vechileAssesmentController.js'
import {
  deleteFeedback,
  listFeedback
} from '../controllers/feedbackController.js'
import {
  deleteShift,
  getShifts,
  updateShift
} from '../controllers/shiftController.js'
import {
  getCompanySettings,
  upsertCompanySettings,
  updateApiCredentials,
  updateMaintenancePolicy
} from '../controllers/company/companySettingsController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { authorizeRoles } from '../middleware/authRoles.js'
import {
  getAllPlans as getAdminPlans,
  getMySubscription,
  getMySubscriptions,
  createCheckoutSession,
  cancelSubscription,
  verifyCheckoutSession,
  extraTruckCheckoutSession
} from '../controllers/subscriptionController.js'
import { getTrialStatus, checkAccess } from '../controllers/trialController.js'
import { getManifests, getManifestById } from '../controllers/manifestController.js'
import {
  getLiveVehicles,
  getVehicleDetails,
  getVehicleList,
  getGpsVehicleDashboardStats
} from '../controllers/gpstrackingvehicletelematics/livelocationController.js'
import {
  createWorkOrder,
  deleteWorkOrder,
  getCurrentMonthWorkOrderCost,
  getMaintenanceSchedule,
  getRecentWorkOrders,
  getWorkOrderById,
  getWorkOrders,
  maintenanceCostReport,
  updateWorkOrder
} from '../controllers/work/wororderController.js'
import {
  createSparePart,
  getSpareParts,
  getSparePartById,
  updateSparePart,
  deleteSparePart,
  useSparePart
} from '../controllers/work/sparePartController.js'
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier
} from '../controllers/work/supplierController.js'
import {
  getFleetInvoices,
  getFleetInvoiceSummary,
  getFleetInvoiceById,
  createFleetInvoice,
  updateFleetInvoice,
  deleteFleetInvoice,
  updateFleetInvoiceStatus,
  emailFleetInvoice,
  uploadAndExtractFleetInvoice
} from '../controllers/work/fleetInvoiceController.js'
import {
  createFleetUnit,
  deleteFleetUnit,
  getFleetUnitById,
  listFleetUnits,
  updateFleetUnit,
  initializeAllVehicleLocations
} from '../controllers/fleet/fleetUnitController.js'
import {
  createRegulatorySafetyRecord,
  deleteRegulatorySafetyRecord,
  listRegulatorySafetyRecords,
  updateRegulatorySafetyRecord
} from '../controllers/fleet/regulatorySafetyController.js'
import {
  createGeneralRepair,
  deleteGeneralRepair,
  listGeneralRepairs,
  updateGeneralRepair,
  listMechanicOrders,
  getMechanicDashboard,
  updateOrderStatus,
  completeRepair,
  sendMaintenanceOrderEmail,
  verifyMaintenanceOrder
} from '../controllers/fleet/generalRepairController.js'
import {
  getComplianceSummary,
  getCvsaInspections,
  getCvsaInspectionById,
  createCvsaInspection,
  updateCvsaInspection,
  deleteCvsaInspection,
  getCvsaInspectionStats,
  getCvsaMonthlyReport,
  deleteOldCvsaData,
  uploadCarrierProfileDocument,
  saveCarrierProfileData,
  getCarrierPerformance,
  getTickets,
  getTicketById,
  createTicket,
  updateTicket,
  deleteTicket,
  getTicketStats,
  getComplianceInvoices,
  updateComplianceInvoice,
  deleteComplianceInvoice,
  getIncidents,
  getIncidentById,
  createIncident,
  updateIncident,
  deleteIncident,
  getIncidentStats,
  getComplianceDashboardData
} from '../controllers/compilance/compilanceController.js'
import {
  createInsuranceClaim,
  getInsuranceClaims,
  getInsuranceClaimById,
  updateInsuranceClaim,
  deleteInsuranceClaim,
  getInsuranceClaimStats
} from '../controllers/compilance/insuranceClaimController.js'
import {
  getTruckProfile
} from '../controllers/loadController.js'
import {
  getDashboardStats,
  getFuelEfficiency,
  getLoadsPerMonth,
  getPendingMaintenanceCount,
  getRecentAlerts,
  getRevenueTrend,
  getVehicleAndWorkOrderStats,
  getVehicleServicesDashboard,
  getAdminDashboard
} from '../controllers/dashboard/dashboardController.js'
import { changeUserStatus, createUser, deleteUser, listUsers, updateUser, getCurrentUserProfile, updateCurrentUserProfile, changePassword } from '../controllers/user/userController.js'
import { createVehicleService, deleteVehicleService, listVehicleServices, updateServiceStatus, updateVehicleService, getIncomingMaintenanceCount, getSamsaraUpcomingServices } from '../controllers/vehicleService/vehicleServiceController.js'

export const adminRoute = express.Router()

// Public registration endpoint (no auth required)
adminRoute.post('/register', registerAdmin)

adminRoute.post('/create', authMiddleware, authorizeRoles('admin', 'superadmin'), createAdmin)
adminRoute.get('/allowed-roles', authMiddleware, authorizeRoles('admin', 'superadmin'), getAllowedRolesForAdmin)
adminRoute.post('/login', loginAdmin)



// user

adminRoute.post(
  '/user',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  createUser
) // Create user
adminRoute.put(
  '/user/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  updateUser
) // Update user
adminRoute.delete(
  '/user/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  deleteUser
) // Delete user
adminRoute.patch(
  '/user/:id/status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'),
  changeUserStatus
) // Change user status
adminRoute.get(
  '/user',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Fleet Maintenance Manager'),
  listUsers
)

// ✅ Current User Profile Routes
adminRoute.get('/profile', authMiddleware, getCurrentUserProfile)
adminRoute.put('/profile', authMiddleware, updateCurrentUserProfile)
adminRoute.post('/change-password', authMiddleware, changePassword)


// contact

adminRoute.post('/contact', authMiddleware,
  authorizeRoles('admin', 'superadmin'), createContact)
adminRoute.put('/contact/:id', authMiddleware,
  authorizeRoles('admin', 'superadmin'), updateContact)
adminRoute.delete('/contact/:id', authMiddleware,
  authorizeRoles('admin', 'superadmin'), deleteContact)
adminRoute.get('/contact', authMiddleware,
  authorizeRoles('admin', 'superadmin'), listContacts)

adminRoute.get('/contact/search', authMiddleware,
  authorizeRoles('admin', 'superadmin'), searchContact)



// Issue

adminRoute.post('/issue', authMiddleware,
  authorizeRoles('admin', 'superadmin'), createIssue)
adminRoute.put('/issue/:id', authMiddleware,
  authorizeRoles('admin', 'superadmin'), updateIssue)
adminRoute.delete('/issue/:id', authMiddleware,
  authorizeRoles('admin', 'superadmin'), deleteIssue)
adminRoute.get('/issue', authMiddleware,
  authorizeRoles('admin', 'superadmin'), listIssues)
adminRoute.get('/issue/search', authMiddleware,
  authorizeRoles('admin', 'superadmin'), searchIssues)








// Vehicle Assessment

adminRoute.post('/vehicle-assessment', authMiddleware,
  authorizeRoles('admin', 'superadmin'), createVehicleAssessment)

adminRoute.get('/vehicle-assessment', authMiddleware,
  authorizeRoles('admin', 'superadmin'), getVehicleAssessments)
adminRoute.get(
  '/vehicle-assessment/search',
  authMiddleware,
  authorizeRoles('admin', 'superadmin'),
  searchVehicleAssessments
)
adminRoute.get('/vehicle-assessment/:id', authMiddleware,
  authorizeRoles('admin', 'superadmin'), getVehicleAssessmentById)
adminRoute.put('/vehicle-assessment/:id', authMiddleware,
  authorizeRoles('admin', 'superadmin'), updateVehicleAssessment)

adminRoute.delete('/vehicle-assessment/:id', authMiddleware,
  authorizeRoles('admin', 'superadmin'), deleteVehicleAssessment)

// feedback

adminRoute.get('/feedback', authMiddleware,
  authorizeRoles('admin', 'superadmin'), listFeedback)
adminRoute.delete('/feedback/:id', authMiddleware,
  authorizeRoles('admin', 'superadmin'), deleteFeedback)

// Shift

adminRoute.get('/shift',authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'), getShifts)

adminRoute.put('/shift/:id',authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'), updateShift)
adminRoute.delete('/shift/:id',authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr'), deleteShift)

//company settings
adminRoute.post(
  '/company',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'dispatcher', 'Fleet Maintenance Manager', 'Compliance Manager', 'accounts', 'accountant', 'driver', 'safety officer'),
  FileUpload.single('file'),
  upsertCompanySettings
)
adminRoute.get(
  '/company',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'dispatcher', 'Fleet Maintenance Manager', 'Compliance Manager', 'accounts', 'accountant', 'driver', 'safety officer'),
  getCompanySettings
)

// Update API Credentials (Separate endpoint)
adminRoute.put(
  '/company/api-credentials',
  authMiddleware,
  authorizeRoles('admin', 'superadmin'),
  updateApiCredentials
)

// Update Maintenance Policy (Separate endpoint)
adminRoute.put(
  '/company/maintenance-policy',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  updateMaintenancePolicy
)

// GPS Tracking & Vehicle Telematics (Geotab Data)
// Read-only for every department (view-only GPS dashboard) — no mutation endpoints exist for this data.
const gpsViewRoles = ['admin', 'superadmin', 'dispatcher', 'hr', 'accountant', 'Fleet Maintenance Manager', 'Compliance Manager', 'safety officer', 'Maintenance Crew (Mechanics)'];

adminRoute.get(
  '/vehicles/live',
  authMiddleware,
  authorizeRoles(...gpsViewRoles),
  getLiveVehicles
)

adminRoute.get(
  '/vehicles/list',
  authMiddleware,
  authorizeRoles(...gpsViewRoles),
  getVehicleList
)


adminRoute.get(
  '/vehicle-details/:id',
  authMiddleware,
  authorizeRoles(...gpsViewRoles),

  getVehicleDetails
)

adminRoute.get(
  '/gps-vehicle/dashboard-stats',
  authMiddleware,
  authorizeRoles(...gpsViewRoles),
  getGpsVehicleDashboardStats
)

// Work Orders

adminRoute.post(
  '/workorders',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  createWorkOrder
)
adminRoute.get(
  '/workorders',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  getWorkOrders
)
adminRoute.get(
  '/workorders/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  getWorkOrderById
)
adminRoute.put(
  '/workorders/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  updateWorkOrder
)
adminRoute.delete(
  '/workorders/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  deleteWorkOrder
)

// Spare Parts

adminRoute.get(
  '/spareparts',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager', 'Maintenance Crew (Mechanics)'),
  getSpareParts
)
adminRoute.get(
  '/spareparts/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  getSparePartById
)
adminRoute.post(
  '/spareparts',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  createSparePart
)
adminRoute.put(
  '/spareparts/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  updateSparePart
)
adminRoute.delete(
  '/spareparts/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  deleteSparePart
)
adminRoute.put(
  '/spareparts/:id/use',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  useSparePart
)

// Suppliers

adminRoute.get(
  '/suppliers',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  getSuppliers
)
adminRoute.get(
  '/suppliers/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  getSupplierById
)
adminRoute.post(
  '/suppliers',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  createSupplier
)
adminRoute.put(
  '/suppliers/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  updateSupplier
)
adminRoute.delete(
  '/suppliers/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  deleteSupplier
)

// Fleet Invoices

adminRoute.post(
  '/fleet-invoices/upload-extract',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  FileUploadMemory.single('file'),
  uploadAndExtractFleetInvoice
)
// Read-only: Accounts needs to see fleet invoices for billing/expense tracking/financial reporting,
// but only Fleet Maintenance Manager/admin/superadmin can create/edit/delete/email them.
adminRoute.get(
  '/fleet-invoices',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager', 'accountant'),
  getFleetInvoices
)
adminRoute.get(
  '/fleet-invoices/summary',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager', 'accountant'),
  getFleetInvoiceSummary
)
adminRoute.get(
  '/fleet-invoices/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager', 'accountant'),
  getFleetInvoiceById
)
adminRoute.post(
  '/fleet-invoices',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  createFleetInvoice
)
adminRoute.put(
  '/fleet-invoices/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  updateFleetInvoice
)
adminRoute.patch(
  '/fleet-invoices/:id/status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  updateFleetInvoiceStatus
)
adminRoute.post(
  '/fleet-invoices/:id/email',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  emailFleetInvoice
)
adminRoute.delete(
  '/fleet-invoices/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  deleteFleetInvoice
)

adminRoute.get(
  '/maintanance-details',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Fleet Maintenance Manager'),
  getMaintenanceSchedule
)

// GET /api/reports/maintenance-cost?year=2025&vehicleId=123
adminRoute.get(
  '/maintenance-cost',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'hr', 'Fleet Maintenance Manager'),
  maintenanceCostReport
)

// get Compilance summary

adminRoute.get(
  '/compilance-summary',
  authMiddleware,
  authorizeRoles('admin', 'superadmin','dispatcher','hr', 'Compliance Manager'),
  getComplianceSummary
)

// CVSA Inspection Routes
adminRoute.get(
  '/cvsa-inspections',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  getCvsaInspections
)

adminRoute.get(
  '/cvsa-inspections/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager'),
  getCvsaInspectionStats
)

adminRoute.get(
  '/cvsa-inspections/monthly-report',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  getCvsaMonthlyReport
)

adminRoute.delete(
  '/cvsa-inspections/delete-old-data',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager'),
  deleteOldCvsaData
)

adminRoute.post(
  '/cvsa-inspections/upload-carrier-profile',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager'),
  FileUploadMemory.single('document'),
  uploadCarrierProfileDocument
);

adminRoute.post(
  '/cvsa-inspections/save-carrier-profile',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager'),
  saveCarrierProfileData
);

adminRoute.get(
  '/cvsa-inspections/carrier-performance',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager'),
  getCarrierPerformance
);

adminRoute.get(
  '/cvsa-inspections/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  getCvsaInspectionById
)

// Ticket Routes
adminRoute.get(
  '/tickets',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  getTickets
)

adminRoute.get(
  '/tickets/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager'),
  getTicketStats
)

adminRoute.get(
  '/tickets/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  getTicketById
)

adminRoute.post(
  '/tickets',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  FileUpload.fields([
    { name: 'ticketFile', maxCount: 1 },
    { name: 'receiptFile', maxCount: 1 }
  ]),
  createTicket
)

adminRoute.put(
  '/tickets/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  FileUpload.fields([
    { name: 'ticketFile', maxCount: 1 },
    { name: 'receiptFile', maxCount: 1 }
  ]),
  updateTicket
)

adminRoute.delete(
  '/tickets/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  deleteTicket
)

adminRoute.get(
  '/truck-profile/:unitNumber',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager'),
  getTruckProfile
)

adminRoute.get(
  '/compliance/dashboard',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager', 'Fleet Maintenance Manager'),
  getComplianceDashboardData
)

adminRoute.post(
  '/cvsa-inspections',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  FileUpload.array('documents', 20), // Allow up to 20 documents
  createCvsaInspection
)

adminRoute.put(
  '/cvsa-inspections/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  FileUpload.array('documents', 20), // Allow up to 20 documents
  updateCvsaInspection
)

adminRoute.delete(
  '/cvsa-inspections/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  deleteCvsaInspection
)

// Compliance Invoices Routes
adminRoute.get(
  '/compliance-invoices',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager'),
  getComplianceInvoices
)

// Compliance Invoice Update and Delete Routes
adminRoute.put(
  '/compliance-invoices/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager'),
  updateComplianceInvoice
)

adminRoute.delete(
  '/compliance-invoices/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager'),
  deleteComplianceInvoice
)

// Insurance Claims Routes
adminRoute.post(
  '/insurance-claims',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager', 'Fleet Maintenance Manager'),
  createInsuranceClaim
)

adminRoute.get(
  '/insurance-claims',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager', 'Fleet Maintenance Manager'),
  getInsuranceClaims
)

adminRoute.get(
  '/insurance-claims/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager', 'Fleet Maintenance Manager'),
  getInsuranceClaimStats
)

adminRoute.get(
  '/insurance-claims/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager', 'Fleet Maintenance Manager'),
  getInsuranceClaimById
)

adminRoute.put(
  '/insurance-claims/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager', 'Fleet Maintenance Manager'),
  updateInsuranceClaim
)

adminRoute.delete(
  '/insurance-claims/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager', 'Fleet Maintenance Manager'),
  deleteInsuranceClaim
)

// Incident Routes
adminRoute.get(
  '/incidents',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager'),
  getIncidents
)

adminRoute.get(
  '/incidents/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager'),
  getIncidentStats
)

adminRoute.get(
  '/incidents/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager'),
  getIncidentById
)

adminRoute.post(
  '/incidents',
  FileUpload.fields([
    { name: 'accidentReport', maxCount: 1 },
    { name: 'accidentPictures', maxCount: 20 },
    { name: 'accidentVideo', maxCount: 1 }
  ]),
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager'),
  createIncident
)

adminRoute.put(
  '/incidents/:id',
  FileUpload.fields([
    { name: 'accidentReport', maxCount: 1 },
    { name: 'accidentPictures', maxCount: 20 },
    { name: 'accidentVideo', maxCount: 1 }
  ]),
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager'),
  updateIncident
)

adminRoute.delete(
  '/incidents/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Compliance Manager'),
  deleteIncident
)

adminRoute.get(
  '/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  getDashboardStats
)

adminRoute.get(
  '/dashboard',
  authMiddleware,
  authorizeRoles('admin', 'superadmin'),
  getAdminDashboard
)

adminRoute.get(
  '/loads-per-month',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  getLoadsPerMonth
)
adminRoute.get(
  '/revenue-trend',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  getRevenueTrend
)
adminRoute.get(
  '/fuel-efficiency',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  getFuelEfficiency
)
adminRoute.get(
  '/recent-alerts',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  getRecentAlerts
)

adminRoute.get("/fleet-management/dashboard-stats",authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager'), getVehicleAndWorkOrderStats);



// fleet management operations
adminRoute.get('/fleet-management/upcoming-overdue',authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager'),getVehicleServicesDashboard)

 adminRoute.get("/fleet-management/pending-maintenance-count",authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager'), getPendingMaintenanceCount);

adminRoute.get('/fleet-management/recent-work-orders',authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager'),getRecentWorkOrders)

adminRoute.get("/fleet-management/monthly-cost",authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager'), getCurrentMonthWorkOrderCost);

// Fleet units management
adminRoute.get(
  '/fleet-maintenance/units',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager', 'dispatcher', 'hr', 'Compliance Manager','accounts', 'accountant'),
  listFleetUnits
);

adminRoute.get(
  '/fleet-maintenance/units/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  getFleetUnitById
);

adminRoute.post(
  '/fleet-maintenance/units',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  createFleetUnit
);

adminRoute.put(
  '/fleet-maintenance/units/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  updateFleetUnit
);

adminRoute.delete(
  '/fleet-maintenance/units/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  deleteFleetUnit
);

// Initialize locations for all vehicles (set default structure if missing)
adminRoute.post(
  '/fleet-maintenance/units/initialize-locations',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  initializeAllVehicleLocations
);

// Regulatory & Safety
adminRoute.get(
  '/fleet-maintenance/regulatory-safety',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  listRegulatorySafetyRecords
);

adminRoute.post(
  '/fleet-maintenance/regulatory-safety',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  createRegulatorySafetyRecord
);

adminRoute.put(
  '/fleet-maintenance/regulatory-safety/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  updateRegulatorySafetyRecord
);

adminRoute.delete(
  '/fleet-maintenance/regulatory-safety/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  deleteRegulatorySafetyRecord
);

// General repairs log
adminRoute.get(
  '/fleet-maintenance/general-repairs',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  listGeneralRepairs
);

adminRoute.post(
  '/fleet-maintenance/general-repairs',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  createGeneralRepair
);

adminRoute.put(
  '/fleet-maintenance/general-repairs/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  updateGeneralRepair
);

adminRoute.delete(
  '/fleet-maintenance/general-repairs/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  deleteGeneralRepair
);

adminRoute.post(
  '/fleet-maintenance/general-repairs/:id/send-email',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  sendMaintenanceOrderEmail
);

// Mechanic routes for maintenance orders
adminRoute.get(
  '/fleet-maintenance/mechanic/orders',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Maintenance Crew (Mechanics)', 'Fleet Maintenance Manager'),
  listMechanicOrders
);

adminRoute.get(
  '/fleet-maintenance/mechanic/dashboard',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Maintenance Crew (Mechanics)', 'Fleet Maintenance Manager'),
  getMechanicDashboard
);

adminRoute.patch(
  '/fleet-maintenance/general-repairs/:id/status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Maintenance Crew (Mechanics)', 'Fleet Maintenance Manager'),
  updateOrderStatus
);

adminRoute.post(
  '/fleet-maintenance/general-repairs/:id/complete',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Maintenance Crew (Mechanics)', 'Fleet Maintenance Manager'),
  FileUpload.single('invoice'),
  completeRepair
);

adminRoute.post(
  '/fleet-maintenance/general-repairs/:id/verify',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  verifyMaintenanceOrder
);

// Vehicle Service

// CREATE
adminRoute.post("/vehicle-service",authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'), createVehicleService);

//   {
//   "priority": "urgent",
//   "dueMileage": 16000,
//   "description": "Urgent oil leak fix required"
// }

// UPDATE FULL SERVICE
adminRoute.put("/vehicle-service/:id",authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager', 'Maintenance Crew (Mechanics)'), updateVehicleService);


  // { "status": "completed" }

// UPDATE STATUS ONLY
adminRoute.patch("/vehicle-service/:id/status",authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager', 'Maintenance Crew (Mechanics)'), updateServiceStatus);

// DELETE SERVICE
adminRoute.delete("/vehicle-service/:id",authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'), deleteVehicleService);

  // GET /api/vehicle-services?priority=high&status=pending
// LIST SERVICES WITH FILTERS
adminRoute.get("/vehicle-service",authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager', 'Maintenance Crew (Mechanics)'), listVehicleServices);

// GET INCOMING MAINTENANCE COUNT
adminRoute.get("/vehicle-service/incoming-maintenance", authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'), getIncomingMaintenanceCount);

// GET UPCOMING SERVICES FROM SAMSARA
adminRoute.get("/vehicle-service/samsara-upcoming", authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'), getSamsaraUpcomingServices);

// Driver Dashboard Routes
adminRoute.get("/driver/stats", authMiddleware, authorizeRoles('admin', 'superadmin', 'hr'), getDriverStats);
adminRoute.get("/load/stats", authMiddleware, authorizeRoles('admin', 'superadmin', 'hr'), getLoadStats);
adminRoute.get("/driver/safety-stats", authMiddleware, authorizeRoles('admin', 'superadmin', 'hr'), getSafetyStats);
adminRoute.get("/activity-log/recent", authMiddleware, authorizeRoles('admin', 'superadmin', 'hr'), getRecentDriverActivities);
adminRoute.get("/driver-activity", authMiddleware, authorizeRoles('admin', 'superadmin', 'hr'), getDriverActivities);

// Subscription & Plan Routes
adminRoute.get("/plans", authMiddleware, authorizeRoles('admin', 'superadmin'), getAdminPlans);
adminRoute.get("/subscription", authMiddleware, authorizeRoles('admin', 'superadmin'), getMySubscription);
adminRoute.get("/subscriptions", authMiddleware, authorizeRoles('admin', 'superadmin'), getMySubscriptions);
adminRoute.post("/subscription/checkout", authMiddleware, authorizeRoles('admin', 'superadmin'), createCheckoutSession);
adminRoute.get("/subscription/verify", authMiddleware, authorizeRoles('admin', 'superadmin'), verifyCheckoutSession);
adminRoute.post("/subscription/add-truck-checkout", authMiddleware, authorizeRoles('admin', 'superadmin'), extraTruckCheckoutSession);
adminRoute.post("/subscription/:subscriptionId/cancel", authMiddleware, authorizeRoles('admin', 'superadmin'), cancelSubscription);

// Trial routes
adminRoute.get("/trial/status", authMiddleware, authorizeRoles('admin', 'superadmin'), getTrialStatus);
adminRoute.get("/trial/check-access", authMiddleware, authorizeRoles('admin', 'superadmin'), checkAccess);

// Manifest Routes
adminRoute.get('/manifests', authMiddleware, authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'), getManifests);
adminRoute.get('/manifests/:id', authMiddleware, authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'), getManifestById);