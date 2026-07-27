import express from "express";
import {
    createEmployeeDocument,
    getAllEmployeeDocuments,
    getEmployeeDocumentById,
    updateEmployeeDocument,
    updateDocumentStatus,
    deleteEmployeeDocument,
    getDocumentsByEmployee,
    getExpiringDocuments,
    bulkDeleteEmployeeDocuments,
    getEmployeeDocumentStats,
    getSignedEmployeeDocumentUrl
} from "../controllers/employee/employeeDocumentController.js";
import {
    createEmployeeDocumentValidation,
    updateEmployeeDocumentValidation,
    updateDocumentStatusValidation,
    getDocumentByIdValidation,
    getDocumentsByEmployeeValidation,
    bulkDeleteEmployeeDocumentsValidation,
    documentQueryValidation
} from "../validations/employee/employeeDocument.validation.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authRoles.js";
import { FileUpload } from "../middleware/upload.js";

export const employeeDocumentRoute = express.Router();

// ✅ CREATE EMPLOYEE DOCUMENT
employeeDocumentRoute.post(
    "/",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    FileUpload.single('documentFile'),
    createEmployeeDocumentValidation,
    createEmployeeDocument
);

// ✅ GET ALL EMPLOYEE DOCUMENTS WITH FILTERS
employeeDocumentRoute.get(
    "/",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    documentQueryValidation,
    getAllEmployeeDocuments
);

// ✅ GET EMPLOYEE DOCUMENT STATS
employeeDocumentRoute.get(
    "/stats",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    getEmployeeDocumentStats
);

// ✅ GET DOCUMENTS EXPIRING SOON
employeeDocumentRoute.get(
    "/expiring",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    getExpiringDocuments
);

// ✅ GET DOCUMENTS BY EMPLOYEE ID
employeeDocumentRoute.get(
    "/employee/:employeeId",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    getDocumentsByEmployeeValidation,
    getDocumentsByEmployee
);

// ✅ GET SIGNED URL FOR EMPLOYEE DOCUMENT
employeeDocumentRoute.get(
    "/:id/signed-url",
    authMiddleware,
    // Allow all authenticated users to access signed URLs for viewing/downloading documents
    getSignedEmployeeDocumentUrl
);

// ✅ GET EMPLOYEE DOCUMENT BY ID
employeeDocumentRoute.get(
    "/:id",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    getDocumentByIdValidation,
    getEmployeeDocumentById
);

// ✅ UPDATE EMPLOYEE DOCUMENT
employeeDocumentRoute.put(
    "/:id",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    FileUpload.single('documentFile'),
    updateEmployeeDocumentValidation,
    updateEmployeeDocument
);

// ✅ UPDATE DOCUMENT STATUS
employeeDocumentRoute.patch(
    "/:id/status",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    updateDocumentStatusValidation,
    updateDocumentStatus
);

// ✅ DELETE EMPLOYEE DOCUMENT
employeeDocumentRoute.delete(
    "/:id",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    getDocumentByIdValidation,
    deleteEmployeeDocument
);

// ✅ BULK DELETE EMPLOYEE DOCUMENTS
employeeDocumentRoute.delete(
    "/bulk/delete",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    bulkDeleteEmployeeDocumentsValidation,
    bulkDeleteEmployeeDocuments
);

export default employeeDocumentRoute;
