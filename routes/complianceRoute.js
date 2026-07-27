import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/authRoles.js';
import {
  getHOSEldData,
  syncHOSFromSamsara,
  getDriverHOS,
  getVehicleELDStatus,
  submitHOSAudit,
  createHosAuditForm,
  getHosAuditForms,
  getHosAuditDocumentUrl,
  uploadELogFile,
  getELogs,
  deleteELog,
  downloadELog
} from '../controllers/compliance/hosEldController.js';
import { FileUpload } from '../middleware/upload.js';

export const complianceRoute = express.Router();

// HOS/ELD Compliance Routes
complianceRoute.get(
  '/hos-eld',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'compliance', 'Compliance Manager'),
  getHOSEldData
);

complianceRoute.post(
  '/hos-eld/sync',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'compliance', 'Compliance Manager'),
  syncHOSFromSamsara
);

complianceRoute.get(
  '/hos-eld/driver/:driverId',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'compliance', 'Compliance Manager', 'driver'),
  getDriverHOS
);

complianceRoute.get(
  '/hos-eld/vehicle/:vehicleId',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'compliance', 'Compliance Manager'),
  getVehicleELDStatus
);

complianceRoute.post(
  '/hos-eld/audit',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'compliance', 'Compliance Manager'),
  submitHOSAudit
);

// HOS Audit Form (full form table - create & list)
complianceRoute.post(
  '/hos-eld/audit-form',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'compliance', 'Compliance Manager'),
  FileUpload.array('documents', 10), // Allow up to 10 documents
  createHosAuditForm
);

complianceRoute.get(
  '/hos-eld/audit-form',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'compliance', 'Compliance Manager'),
  getHosAuditForms
);

complianceRoute.get(
  '/hos-eld/audit-form/:auditId/document/:documentIndex',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'compliance', 'Compliance Manager'),
  getHosAuditDocumentUrl
);

// E-Logs Routes
complianceRoute.post(
  '/hos-eld/e-logs/upload',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'compliance', 'Compliance Manager'),
  FileUpload.single('file'),
  uploadELogFile
);

complianceRoute.get(
  '/hos-eld/e-logs',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'compliance', 'Compliance Manager'),
  getELogs
);

complianceRoute.delete(
  '/hos-eld/e-logs/:logId',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'compliance', 'Compliance Manager'),
  deleteELog
);

complianceRoute.get(
  '/hos-eld/e-logs/:logId/download',
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'compliance', 'Compliance Manager'),
  downloadELog
);

