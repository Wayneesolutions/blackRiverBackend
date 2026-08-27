import express from 'express'
import {
  createVehicle,
  deleteVehicle,
  getVehicleById,
  getVehicles,
  getVehiclesWithTracking,
  updateVehicle,
  importVehicles
} from '../controllers/vehicleController.js'
import { FileUpload, FileUploadMemory } from '../middleware/upload.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { authorizeRoles } from '../middleware/authRoles.js'
import { checkTrialAccess } from '../middleware/checkTrial.js'
import {
  getRevenuePerMile,
  getVehicleRevenuePerMile
} from '../controllers/analytics/revenuePerMileController.js'
import {
  createLoad,
  deleteLoad,
  getAllLoads,
  getLoadById,
  updateLoad,
  assignDriverTruck,
  getDeliveryLoads,
  uploadDeliveryDocument,
  updatePaymentStatus,
  getDispatcherDashboard,
  getRouteAnalysis,
  getUtilization,
  getTodayDeliveries,
  getTodayPickups,
  getTomorrowPickups,
  getAuditTrail,
  getDriversOnLeave,
  getActiveOrdersWithTracking
} from '../controllers/loadController.js'
import { loadValidation } from '../validations/load/load.validation.js'
import {
  createCustomer,
  deleteCustomer,
  importCustomers,
  listCustomers,
  searchCustomers,
  updateCustomer
} from '../controllers/customerController.js'
import { getAllDrivers, importDrivers } from '../controllers/driverController.js'
import { getAllFaciliators } from '../controllers/user/userController.js'
import {
  createIssue,
  updateIssue,
  deleteIssue,
  listIssues,
  searchIssues,
  getIssueById
} from '../controllers/issueController.js'
import {
  createServiceRate,
  deleteServiceRate,
  getServiceRates,
  updateServiceRate
} from '../controllers/serviceRateController.js'
import {
  createTrailer,
  deleteTrailer,
  getAllTrailers,
  updateTrailer,
  getTrailerById,
  searchTrailers,
  getTrailerStats,
  updateTrailerStatus,
  selectedTrailor,
  getTrailersWithTracking,
  importTrailers
} from '../controllers/trailerController.js'
import {
  createFleet,
  deleteFleet,
  getFleets,
  searchFleetByName,
  toggleFleetStatus,
  updateFleet
} from '../controllers/fleetController.js'
import {
  changeVendorStatus,
  createVendor,
  deleteVendor,
  listVendors,
  updateVendor
} from '../controllers/vendorController.js'
import {
  createContact,
  deleteContact,
  listContacts,
  searchContact,
  updateContact
} from '../controllers/contactControlle.js'
import {
  createPlace,
  deletePlace,
  getPlaces,
  searchPlaceByName,
  togglePlaceStatus,
  updatePlace
} from '../controllers/placeController.js'
import {
  changeFuelReportStatus,
  createFuelReport,
  createFuelType,
  createFuelVendor,
  createUnit,
  deleteFuelReport,
  getFuelReports,
  getFuelTypes,
  getFuelVendors,
  getReporters,
  getUnits,
  updateFuelReport,
  extractFuelReceipt,
  parseCsvHeaders,
  importFuelReportsFromCsv,
  parseFuelCardPdf,
  confirmFuelCardImport
} from '../controllers/fuelReportsController.js'
import {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  createBulkOrders,
  getOrderSuggestions,
  getOrderAttachmentSignedUrl,
  approveOrderDocuments
} from '../controllers/orderController.js'
import {
  createTrip,
  getAllTrips,
  getTripById,
  updateTrip,
  deleteTrip,
  assignOrdersToTrip,
  startTrip,
  completeTrip,
  approveTripDocuments,
  rejectTripDocuments,
  uploadTripDocument,
  deleteTripDocument,
  getTripDocumentSignedUrl
} from '../controllers/tripController.js'
export const dispatcherRoute = express.Router()

// Dispatcher Dashboard
dispatcherRoute.get(
  '/dashboard',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getDispatcherDashboard
)

dispatcherRoute.get(
  '/routes',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getRouteAnalysis
)

// Utilization
dispatcherRoute.get(
  '/utilization',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getUtilization
)

// Today's Deliveries
dispatcherRoute.get(
  '/deliveries',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getTodayDeliveries
)

// Today's Pickups
dispatcherRoute.get(
  '/pickups',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getTodayPickups
)

// Tomorrow's Pickups
dispatcherRoute.get(
  '/pickups/tomorrow',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getTomorrowPickups
)

// Audit Trail
dispatcherRoute.get(
  '/audit',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getAuditTrail
)

// Drivers on Leave
dispatcherRoute.get(
  '/drivers-on-leave',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getDriversOnLeave
)

// Active Orders with Tracking (for Trip Tracker)
dispatcherRoute.get(
  '/orders/tracking',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'accountant'),
  getActiveOrdersWithTracking
)

// fuel
dispatcherRoute.post(
  '/fuel-report',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  createFuelReport
)
dispatcherRoute.get(
  '/fuel-report/',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  getFuelReports
)
dispatcherRoute.get(
  '/fuel-report/reporters',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager'),
  getReporters
)

dispatcherRoute.get(
  '/fuel-types',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'Fleet Maintenance Manager', 'Compliance Manager'),
  getFuelTypes
)

dispatcherRoute.post(
  '/fuel-types',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'Fleet Maintenance Manager', 'Compliance Manager'),
  createFuelType
)

dispatcherRoute.get(
  '/units',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'Fleet Maintenance Manager', 'Compliance Manager'),
  getUnits
)

dispatcherRoute.post(
  '/units',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'Fleet Maintenance Manager', 'Compliance Manager'),
  createUnit
)

dispatcherRoute.get(
  '/fuel-vendors',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'Fleet Maintenance Manager', 'Compliance Manager'),
  getFuelVendors
)

dispatcherRoute.post(
  '/fuel-vendors',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'Fleet Maintenance Manager', 'Compliance Manager'),
  createFuelVendor
)

dispatcherRoute.put(
  '/fuel-report/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager'),
  updateFuelReport
)

dispatcherRoute.delete(
  '/fuel-report/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  deleteFuelReport
)
dispatcherRoute.patch(
  '/fuel-report/:id/status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  changeFuelReportStatus
)

dispatcherRoute.post(
  '/fuel-report/extract-receipt',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  FileUploadMemory.single('receipt'),
  extractFuelReceipt
)

dispatcherRoute.post(
  '/fuel-report/parse-csv',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  FileUploadMemory.single('csv'),
  parseCsvHeaders
)

dispatcherRoute.post(
  '/fuel-report/import-csv',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager'),
  FileUploadMemory.single('csv'),
  importFuelReportsFromCsv
)

dispatcherRoute.post(
  '/fuel-report/parse-fuel-card',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager', 'accountant'),
  FileUploadMemory.single('pdf'),
  parseFuelCardPdf
)

dispatcherRoute.post(
  '/fuel-report/confirm-fuel-card',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'Fleet Maintenance Manager', 'accountant'),
  confirmFuelCardImport
)

// Places
dispatcherRoute.post(
  '/place',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  createPlace
)
dispatcherRoute.get(
  '/place',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  getPlaces
)
dispatcherRoute.get(
  '/place/search',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  searchPlaceByName
)
dispatcherRoute.put(
  '/place/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  updatePlace
)
dispatcherRoute.delete(
  '/place/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  deletePlace
)
dispatcherRoute.patch(
  '/place/:id/status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  togglePlaceStatus
)

// customer

dispatcherRoute.post(
  '/customer',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  createCustomer
)
dispatcherRoute.post(
  '/customer/import',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  FileUploadMemory.single('file'),
  importCustomers
)
dispatcherRoute.put(
  '/customer/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  updateCustomer
)
dispatcherRoute.delete(
  '/customer/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  deleteCustomer
)
dispatcherRoute.get(
  '/customer',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  listCustomers
)

dispatcherRoute.get(
  '/customer/search',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  searchCustomers
)

// contact

dispatcherRoute.post(
  '/contact',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  createContact
)
dispatcherRoute.put(
  '/contact/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  updateContact
)
dispatcherRoute.delete(
  '/contact/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  deleteContact
)
dispatcherRoute.get(
  '/contact',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  listContacts
)

dispatcherRoute.get(
  '/contact/search',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  searchContact
)

// Vendors
dispatcherRoute.post(
  '/vendor',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  createVendor
)
dispatcherRoute.put(
  '/vendor/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  updateVendor
)
dispatcherRoute.delete(
  '/vendor/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  deleteVendor
)
dispatcherRoute.get(
  '/vendor',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  listVendors
)

dispatcherRoute.patch(
  '/vendor/:id/status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin'),
  changeVendorStatus
)

// fleet management

dispatcherRoute.post(
  '/fleet',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  createFleet
)
dispatcherRoute.get(
  '/fleet',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  getFleets
)
dispatcherRoute.put(
  '/fleet/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  updateFleet
)
dispatcherRoute.delete(
  '/fleet/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  deleteFleet
)
dispatcherRoute.patch(
  '/fleet/:id/status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  toggleFleetStatus
)
dispatcherRoute.get(
  '/fleet/search',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  searchFleetByName
)

// Trailer Management

dispatcherRoute.post(
  '/trailer',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  checkTrialAccess,
  FileUpload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'oneTimeInspectionFiles', maxCount: 50 },
    { name: 'recurringInspectionFiles', maxCount: 50 },
    { name: 'invoiceFiles', maxCount: 50 }, // Invoice files
    ...Array.from({ length: 20 }, (_, i) => ({ name: `incidentFiles_${i}`, maxCount: 10 }))
  ]),
  createTrailer
)

dispatcherRoute.get(
  '/trailer',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  getAllTrailers
)

dispatcherRoute.get(
  '/trailer/search',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  searchTrailers
)

dispatcherRoute.get(
  '/trailer/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  getTrailerStats
)

// Trailer tracking endpoint - MUST come before /trailer/:id route
dispatcherRoute.get(
  '/trailer/tracking',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  getTrailersWithTracking
)

dispatcherRoute.get(
  '/trailer/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  getTrailerById
)

dispatcherRoute.put(
  '/trailer/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  FileUpload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'oneTimeInspectionFiles', maxCount: 50 },
    { name: 'recurringInspectionFiles', maxCount: 50 },
    { name: 'invoiceFiles', maxCount: 50 }, // Invoice files
    ...Array.from({ length: 20 }, (_, i) => ({ name: `incidentFiles_${i}`, maxCount: 10 }))
  ]),
  updateTrailer
)

dispatcherRoute.patch(
  '/trailer/:id/status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  updateTrailerStatus
)

dispatcherRoute.delete(
  '/trailer/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  deleteTrailer
)

// Legacy trailer selection endpoint
dispatcherRoute.get(
  '/trailer/selected',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  selectedTrailor
)

// Service Rate

dispatcherRoute.post(
  '/service-rate',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  createServiceRate
)

dispatcherRoute.get(
  '/service-rate',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  getServiceRates
)

dispatcherRoute.put(
  '/service-rate/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  updateServiceRate
)

dispatcherRoute.delete(
  '/service-rate/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  deleteServiceRate
)

//Vehicle management
dispatcherRoute.get(
  '/faciliator',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  getAllFaciliators
)

//Vehicle management
dispatcherRoute.get(
  '/driver',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager', 'accountant', 'safety officer', 'Maintenance Crew (Mechanics)'),
  getAllDrivers
)
dispatcherRoute.post(
  '/driver/import',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  FileUploadMemory.single('file'),
  importDrivers
)
dispatcherRoute.post(
  '/vehicle/import',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager'),
  FileUploadMemory.single('file'),
  importVehicles
)
dispatcherRoute.post(
  '/trailer/import',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager'),
  FileUploadMemory.single('file'),
  importTrailers
)
dispatcherRoute.get(
  '/customer',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'accountant'),
  listCustomers
)
dispatcherRoute.post(
  '/vehicle',
  FileUpload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'oneTimeInspectionFiles', maxCount: 50 },
    { name: 'recurringInspectionFiles', maxCount: 50 },
    { name: 'invoiceFiles', maxCount: 50 }, // Invoice files
    // Incident files (supporting up to 20 incidents with multiple files each)
    ...Array.from({ length: 20 }, (_, i) => ({ name: `incidentFiles_${i}`, maxCount: 10 }))
  ]),
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  checkTrialAccess,
  createVehicle
)
dispatcherRoute.get(
  '/vehicle',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'accountant', 'Fleet Maintenance Manager', 'Compliance Manager'),
  getVehicles
)
dispatcherRoute.get(
  '/vehicle/tracking',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager', 'accountant', 'safety officer', 'Maintenance Crew (Mechanics)'),
  getVehiclesWithTracking
)
dispatcherRoute.get(
  '/vehicle/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  getVehicleById
)
dispatcherRoute.put(
  '/vehicle/:id',
  FileUpload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'oneTimeInspectionFiles', maxCount: 50 },
    { name: 'recurringInspectionFiles', maxCount: 50 },
    { name: 'invoiceFiles', maxCount: 50 }, // Invoice files
    // Incident files (supporting up to 20 incidents with multiple files each)
    ...Array.from({ length: 20 }, (_, i) => ({ name: `incidentFiles_${i}`, maxCount: 10 }))
  ]),
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  updateVehicle
)
dispatcherRoute.delete(
  '/vehicle/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'Compliance Manager'),
  deleteVehicle
)

// Load management

dispatcherRoute.post(
  '/load',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  FileUpload.fields([{ name: 'documents' }]),
  createLoad
)
dispatcherRoute.get(
  '/load',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getAllLoads
)
dispatcherRoute.get(
  '/load/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getLoadById
)
dispatcherRoute.put(
  '/load/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  loadValidation,
  updateLoad
)
dispatcherRoute.post(
  '/load/:loadId/assign',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  assignDriverTruck
)
dispatcherRoute.delete(
  '/load/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  deleteLoad
)

// Order management
dispatcherRoute.post(
  '/order',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  FileUpload.fields([
    { name: 'bol', maxCount: 1 },
    { name: 'pod', maxCount: 1 },
    { name: 'customsHazmat', maxCount: 10 },
    { name: 'rateConfirmation', maxCount: 1 },
    { name: 'stampedManifest', maxCount: 1 },
    { name: 'loadSecurement', maxCount: 10 },
    { name: 'printedManifest', maxCount: 1 },
    { name: 'attachment', maxCount: 20 }
  ]),
  createOrder
)
dispatcherRoute.post(
  '/order/bulk',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  createBulkOrders
)
// Note: auto-extract endpoint has been removed - document validation is now integrated into createOrder and updateOrder
dispatcherRoute.get(
  '/order/suggestions',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getOrderSuggestions
)
dispatcherRoute.get(
  '/order',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'accountant'),
  getAllOrders
)
dispatcherRoute.get(
  '/order/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'accountant'),
  getOrderById
)
dispatcherRoute.post(
  '/order/:id/approve-documents',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  approveOrderDocuments
)
dispatcherRoute.put(
  '/order/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  FileUpload.fields([
    { name: 'bol', maxCount: 1 },
    { name: 'pod', maxCount: 1 },
    { name: 'customsHazmat', maxCount: 10 },
    { name: 'rateConfirmation', maxCount: 1 },
    { name: 'stampedManifest', maxCount: 1 },
    { name: 'loadSecurement', maxCount: 10 },
    { name: 'printedManifest', maxCount: 1 },
    { name: 'attachment', maxCount: 20 }
  ]),
  updateOrder
)
dispatcherRoute.delete(
  '/order/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  deleteOrder
)

// Get signed URL for order attachment
dispatcherRoute.get(
  '/order/:id/attachments/:attachmentId/signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'accountant'),
  getOrderAttachmentSignedUrl
)

// Trip management
dispatcherRoute.post(
  '/trip',
  // Allow uploading trip documents and load securement pictures during trip creation
  FileUpload.fields([{ name: 'documents' }, { name: 'loadSecurementPictures' }]),
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  createTrip
)
dispatcherRoute.get(
  '/trip',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager', 'accountant'),
  getAllTrips
)
dispatcherRoute.get(
  '/trip/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'accountant'),
  getTripById
)
dispatcherRoute.put(
  '/trip/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  updateTrip
)
dispatcherRoute.delete(
  '/trip/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  deleteTrip
)
dispatcherRoute.post(
  '/trip/:tripId/assign',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  assignOrdersToTrip
)
dispatcherRoute.post(
  '/trip/:id/start',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'driver'),
  startTrip
)
dispatcherRoute.post(
  '/trip/:id/complete',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'driver'),
  completeTrip
)
dispatcherRoute.post(
  '/trip/:id/approve-documents',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  approveTripDocuments
)
dispatcherRoute.post(
  '/trip/:id/reject-documents',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  rejectTripDocuments
)
dispatcherRoute.post(
  '/trip/:id/documents',
  FileUpload.single('document'),
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  uploadTripDocument
)
dispatcherRoute.delete(
  '/trip/:id/documents/:documentId',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  deleteTripDocument
)
dispatcherRoute.get(
  '/trip/:id/documents/:documentId/signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'driver'),
  getTripDocumentSignedUrl
)

// Delivery management
dispatcherRoute.get(
  '/delivery-loads',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getDeliveryLoads
)
dispatcherRoute.post(
  '/load/:loadId/delivery-document/:documentType',
  FileUpload.single('document'),
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  uploadDeliveryDocument
)
dispatcherRoute.post(
  '/load/:loadId/payment',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  updatePaymentStatus
)

// Issue management
dispatcherRoute.post(
  '/issue',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager'),
  createIssue
)
dispatcherRoute.get(
  '/issue',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager'),
  listIssues
)
dispatcherRoute.get(
  '/issue/search',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager'),
  searchIssues
)
dispatcherRoute.get(
  '/issue/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager'),
  getIssueById
)
dispatcherRoute.put(
  '/issue/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager'),
  updateIssue
)
dispatcherRoute.delete(
  '/issue/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Compliance Manager', 'Fleet Maintenance Manager'),
  deleteIssue
)

// Invoice loads endpoint - specifically for invoice form
dispatcherRoute.get(
  '/invoice-loads',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr'),
  getAllLoads
)

// Revenue Per Mile Analytics
dispatcherRoute.get(
  '/analytics/revenue-per-mile',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager'),
  getRevenuePerMile
)

dispatcherRoute.get(
  '/analytics/revenue-per-mile/:vehicleId',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher', 'hr', 'Fleet Maintenance Manager'),
  getVehicleRevenuePerMile
)

// 🧪 TEST ENDPOINT: Manually trigger document upload notification
dispatcherRoute.get(
  '/test/document-notification',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  async (req, res) => {
    try {
      const { testDocumentNotification } = await import('../controllers/orderController.js');
      await testDocumentNotification(req, res);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
)