import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/authRoles.js';
import { FileUpload } from '../middleware/upload.js';

// Incident controllers
import {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncident,
  deleteIncident,
  updateInvestigation,
  updateInjuryRecord
} from '../controllers/healthSafety/incidentController.js';

// Emergency Contact controllers
import {
  createEmergencyContact,
  getEmergencyContacts,
  updateEmergencyContact,
  deleteEmergencyContact
} from '../controllers/healthSafety/emergencyContactController.js';

// Emergency Procedure controllers
import {
  createEmergencyProcedure,
  getEmergencyProcedures,
  updateEmergencyProcedure,
  deleteEmergencyProcedure
} from '../controllers/healthSafety/emergencyProcedureController.js';

// First Aid Log controllers
import {
  createFirstAidLog,
  getFirstAidLogs,
  getFirstAidLogById,
  updateFirstAidLog,
  deleteFirstAidLog
} from '../controllers/healthSafety/firstAidLogController.js';

// Document Library controllers
import {
  createDocument,
  getDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  getDocumentSignedUrl
} from '../controllers/healthSafety/documentLibraryController.js';

// Inspection controllers
import {
  createInspection,
  getInspections,
  getInspectionById,
  updateInspection,
  deleteInspection
} from '../controllers/healthSafety/inspectionController.js';

// Hazard controllers
import {
  createHazard,
  getHazards,
  getHazardById,
  updateHazard,
  deleteHazard
} from '../controllers/healthSafety/hazardController.js';

// Training controllers
import {
  createTraining,
  getTrainings,
  getTrainingById,
  updateTraining,
  deleteTraining,
  getTrainingMaterialSignedUrl
} from '../controllers/healthSafety/trainingController.js';

// Certificate controllers
import {
  createCertificate,
  getCertificates,
  getCertificateById,
  updateCertificate,
  deleteCertificate,
  getCertificateSignedUrl
} from '../controllers/healthSafety/certificateController.js';

// Policy Document controllers
import {
  createPolicyDocument,
  getPolicyDocuments,
  getPolicyDocumentById,
  updatePolicyDocument,
  deletePolicyDocument,
  getPolicyDocumentSignedUrl
} from '../controllers/healthSafety/policyDocumentController.js';

// Committee Member controllers
import {
  createCommitteeMember,
  getCommitteeMembers,
  getCommitteeMemberById,
  updateCommitteeMember,
  deleteCommitteeMember
} from '../controllers/healthSafety/committeeMemberController.js';

// CAPA controllers
import {
  createCAPA,
  getCAPAs,
  getCAPAById,
  updateCAPA,
  deleteCAPA
} from '../controllers/healthSafety/capaController.js';

// Report controllers
import {
  getAnalyticsStats,
  getIncidentTrends,
  getInspectionStatus,
  getReports,
  getReportById,
  generateReport,
  deleteReport
} from '../controllers/healthSafety/reportController.js';

// Compliance Record controllers
import {
  getComplianceRecords
} from '../controllers/healthSafety/complianceRecordController.js';

// Dashboard controllers
import {
  getDashboardStats,
  getRecentActivity,
  getUpcomingTasks
} from '../controllers/healthSafety/dashboardController.js';

// Load Securement controllers
import {
  createLoadSecurement,
  getLoadSecurementLogs,
  getLoadSecurementById,
  updateLoadSecurement,
  deleteLoadSecurement
} from '../controllers/healthSafety/loadSecurementController.js';

// Reefer Food Safety controllers
import {
  createReeferFoodSafety,
  getReeferFoodSafetyLogs,
  getReeferFoodSafetyById,
  updateReeferFoodSafety,
  deleteReeferFoodSafety
} from '../controllers/healthSafety/reeferFoodSafetyController.js';

// Dangerous Goods controllers
import {
  createDangerousGoods,
  getDangerousGoodsLogs,
  getDangerousGoodsById,
  updateDangerousGoods,
  deleteDangerousGoods
} from '../controllers/healthSafety/dangerousGoodsController.js';

// Fueling Spill controllers
import {
  createFuelingSpill,
  getFuelingSpillLogs,
  getFuelingSpillById,
  updateFuelingSpill,
  deleteFuelingSpill
} from '../controllers/healthSafety/fuelingSpillController.js';

// Winter Safety controllers
import {
  createWinterSafety,
  getWinterSafetyChecklists,
  getWinterSafetyById,
  updateWinterSafety,
  deleteWinterSafety
} from '../controllers/healthSafety/winterSafetyController.js';

export const healthSafetyRoute = express.Router();

// ==================== INCIDENT ROUTES ====================
// Create incident (with file uploads for photos/videos)
healthSafetyRoute.post(
  '/incident',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  FileUpload.fields([
    { name: 'photoEvidence', maxCount: 10 },
    { name: 'videoEvidence', maxCount: 10 }
  ]),
  createIncident
);

// Get all incidents
healthSafetyRoute.get(
  '/incident',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getIncidents
);

// Get incident by ID
healthSafetyRoute.get(
  '/incident/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getIncidentById
);

// Update incident
healthSafetyRoute.put(
  '/incident/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  FileUpload.fields([
    { name: 'photoEvidence', maxCount: 10 },
    { name: 'videoEvidence', maxCount: 10 }
  ]),
  updateIncident
);

// Delete incident
healthSafetyRoute.delete(
  '/incident/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteIncident
);

// Update investigation
healthSafetyRoute.put(
  '/incident/:id/investigation',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  updateInvestigation
);

// Update injury record
healthSafetyRoute.put(
  '/incident/:id/injury-record',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  FileUpload.fields([
    { name: 'wcbDocuments', maxCount: 10 }
  ]),
  updateInjuryRecord
);

// ==================== EMERGENCY CONTACT ROUTES ====================
healthSafetyRoute.post(
  '/emergency-contact',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  createEmergencyContact
);

healthSafetyRoute.get(
  '/emergency-contact',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getEmergencyContacts
);

healthSafetyRoute.put(
  '/emergency-contact/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  updateEmergencyContact
);

healthSafetyRoute.delete(
  '/emergency-contact/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteEmergencyContact
);

// ==================== EMERGENCY PROCEDURE ROUTES ====================
healthSafetyRoute.post(
  '/emergency-procedure',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  FileUpload.single('document'),
  createEmergencyProcedure
);

healthSafetyRoute.get(
  '/emergency-procedure',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getEmergencyProcedures
);

healthSafetyRoute.put(
  '/emergency-procedure/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  FileUpload.single('document'),
  updateEmergencyProcedure
);

healthSafetyRoute.delete(
  '/emergency-procedure/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteEmergencyProcedure
);

// ==================== FIRST AID LOG ROUTES ====================
healthSafetyRoute.post(
  '/first-aid-log',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  createFirstAidLog
);

healthSafetyRoute.get(
  '/first-aid-log',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getFirstAidLogs
);

healthSafetyRoute.get(
  '/first-aid-log/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getFirstAidLogById
);

healthSafetyRoute.put(
  '/first-aid-log/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  updateFirstAidLog
);

healthSafetyRoute.delete(
  '/first-aid-log/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteFirstAidLog
);

// ==================== INSPECTION ROUTES ====================
healthSafetyRoute.post(
  '/inspection',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  createInspection
);

healthSafetyRoute.get(
  '/inspection',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getInspections
);

healthSafetyRoute.get(
  '/inspection/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getInspectionById
);

healthSafetyRoute.put(
  '/inspection/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  updateInspection
);

healthSafetyRoute.delete(
  '/inspection/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteInspection
);

// ==================== HAZARD ROUTES ====================
healthSafetyRoute.post(
  '/hazard',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  createHazard
);

healthSafetyRoute.get(
  '/hazard',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getHazards
);

healthSafetyRoute.get(
  '/hazard/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getHazardById
);

healthSafetyRoute.put(
  '/hazard/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  updateHazard
);

healthSafetyRoute.delete(
  '/hazard/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteHazard
);

// ==================== TRAINING ROUTES ====================
healthSafetyRoute.post(
  '/training',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  FileUpload.fields([
    { name: 'materialFile', maxCount: 1 }
  ]),
  createTraining
);

healthSafetyRoute.get(
  '/training',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getTrainings
);

healthSafetyRoute.get(
  '/training/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getTrainingById
);

healthSafetyRoute.put(
  '/training/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  updateTraining
);

healthSafetyRoute.delete(
  '/training/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteTraining
);

healthSafetyRoute.get(
  '/training/:id/material/:materialIndex/signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getTrainingMaterialSignedUrl
);

// ==================== CERTIFICATE ROUTES ====================
healthSafetyRoute.post(
  '/certificate',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  FileUpload.single('certificateFile'),
  createCertificate
);

healthSafetyRoute.get(
  '/certificate',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getCertificates
);

healthSafetyRoute.get(
  '/certificate/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getCertificateById
);

healthSafetyRoute.put(
  '/certificate/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  updateCertificate
);

healthSafetyRoute.delete(
  '/certificate/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteCertificate
);

healthSafetyRoute.get(
  '/certificate/:id/signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getCertificateSignedUrl
);

// ==================== POLICY DOCUMENT ROUTES ====================
healthSafetyRoute.post(
  '/policy-document',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  FileUpload.single('file'),
  createPolicyDocument
);

healthSafetyRoute.get(
  '/policy-document',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getPolicyDocuments
);

healthSafetyRoute.get(
  '/policy-document/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getPolicyDocumentById
);

healthSafetyRoute.get(
  '/policy-document/:id/signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getPolicyDocumentSignedUrl
);

healthSafetyRoute.put(
  '/policy-document/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  FileUpload.single('file'),
  updatePolicyDocument
);

healthSafetyRoute.delete(
  '/policy-document/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deletePolicyDocument
);

// ==================== COMPLIANCE RECORDS ROUTES ====================
healthSafetyRoute.get(
  '/compliance-records',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getComplianceRecords
);

// ==================== COMMITTEE MEMBER ROUTES ====================
healthSafetyRoute.post(
  '/committee-member',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  createCommitteeMember
);

healthSafetyRoute.get(
  '/committee-member',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getCommitteeMembers
);

healthSafetyRoute.get(
  '/committee-member/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getCommitteeMemberById
);

healthSafetyRoute.put(
  '/committee-member/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  updateCommitteeMember
);

healthSafetyRoute.delete(
  '/committee-member/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteCommitteeMember
);

// ==================== CAPA ROUTES ====================
healthSafetyRoute.post(
  '/capa',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  createCAPA
);

healthSafetyRoute.get(
  '/capa',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getCAPAs
);

healthSafetyRoute.get(
  '/capa/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getCAPAById
);

healthSafetyRoute.put(
  '/capa/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  updateCAPA
);

healthSafetyRoute.delete(
  '/capa/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteCAPA
);

// ==================== REPORT & ANALYTICS ROUTES ====================
healthSafetyRoute.get(
  '/analytics/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getAnalyticsStats
);

healthSafetyRoute.get(
  '/analytics/incident-trends',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getIncidentTrends
);

healthSafetyRoute.get(
  '/analytics/inspection-status',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getInspectionStatus
);

healthSafetyRoute.get(
  '/report',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getReports
);

healthSafetyRoute.get(
  '/report/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getReportById
);

healthSafetyRoute.post(
  '/report/generate',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  generateReport
);

healthSafetyRoute.delete(
  '/report/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteReport
);

// ==================== TRUCKING OPERATIONS ROUTES ====================

// Load Securement Routes
healthSafetyRoute.post(
  '/load-securement',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  FileUpload.fields([
    { name: 'photoEvidence', maxCount: 10 }
  ]),
  createLoadSecurement
);

healthSafetyRoute.get(
  '/load-securement',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  getLoadSecurementLogs
);

healthSafetyRoute.get(
  '/load-securement/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  getLoadSecurementById
);

healthSafetyRoute.put(
  '/load-securement/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  FileUpload.fields([
    { name: 'photoEvidence', maxCount: 10 }
  ]),
  updateLoadSecurement
);

healthSafetyRoute.delete(
  '/load-securement/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteLoadSecurement
);

// Reefer Food Safety Routes
healthSafetyRoute.post(
  '/reefer-food-safety',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  FileUpload.fields([
    { name: 'photoEvidence', maxCount: 10 }
  ]),
  createReeferFoodSafety
);

healthSafetyRoute.get(
  '/reefer-food-safety',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  getReeferFoodSafetyLogs
);

healthSafetyRoute.get(
  '/reefer-food-safety/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  getReeferFoodSafetyById
);

healthSafetyRoute.put(
  '/reefer-food-safety/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  FileUpload.fields([
    { name: 'photoEvidence', maxCount: 10 }
  ]),
  updateReeferFoodSafety
);

healthSafetyRoute.delete(
  '/reefer-food-safety/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteReeferFoodSafety
);

// Dangerous Goods (TDG) Routes
healthSafetyRoute.post(
  '/dangerous-goods',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  FileUpload.fields([
    { name: 'shippingDocument', maxCount: 1 },
    { name: 'photoEvidence', maxCount: 10 }
  ]),
  createDangerousGoods
);

healthSafetyRoute.get(
  '/dangerous-goods',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  getDangerousGoodsLogs
);

healthSafetyRoute.get(
  '/dangerous-goods/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  getDangerousGoodsById
);

healthSafetyRoute.put(
  '/dangerous-goods/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  FileUpload.fields([
    { name: 'shippingDocument', maxCount: 1 },
    { name: 'photoEvidence', maxCount: 10 }
  ]),
  updateDangerousGoods
);

healthSafetyRoute.delete(
  '/dangerous-goods/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteDangerousGoods
);

// Fueling Spill Routes
healthSafetyRoute.post(
  '/fueling-spill',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  createFuelingSpill
);

healthSafetyRoute.get(
  '/fueling-spill',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  getFuelingSpillLogs
);

healthSafetyRoute.get(
  '/fueling-spill/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  getFuelingSpillById
);

healthSafetyRoute.put(
  '/fueling-spill/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer', 'driver'),
  updateFuelingSpill
);

healthSafetyRoute.delete(
  '/fueling-spill/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteFuelingSpill
);

// Winter Safety Routes
healthSafetyRoute.post(
  '/winter-safety',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  createWinterSafety
);

healthSafetyRoute.get(
  '/winter-safety',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getWinterSafetyChecklists
);

healthSafetyRoute.get(
  '/winter-safety/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getWinterSafetyById
);

healthSafetyRoute.put(
  '/winter-safety/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  updateWinterSafety
);

healthSafetyRoute.delete(
  '/winter-safety/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteWinterSafety
);

// ==================== DOCUMENT LIBRARY ROUTES ====================
healthSafetyRoute.post(
  '/document-library',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  FileUpload.single('file'),
  createDocument
);

healthSafetyRoute.get(
  '/document-library',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getDocuments
);

healthSafetyRoute.get(
  '/document-library/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getDocumentById
);

healthSafetyRoute.put(
  '/document-library/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  FileUpload.single('file'),
  updateDocument
);

healthSafetyRoute.delete(
  '/document-library/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  deleteDocument
);

healthSafetyRoute.get(
  '/document-library/:id/signed-url',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getDocumentSignedUrl
);

// ==================== DASHBOARD ROUTES ====================
healthSafetyRoute.get(
  '/dashboard/stats',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getDashboardStats
);

healthSafetyRoute.get(
  '/dashboard/recent-activity',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getRecentActivity
);

healthSafetyRoute.get(
  '/dashboard/upcoming-tasks',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'safety officer'),
  getUpcomingTasks
);

