import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authRoles.js";
import { FileUpload, logFileUpload } from "../middleware/upload.js";
import { 
  listCompanyDocuments, 
  uploadCompanyDocument, 
  deleteCompanyDocument, 
  getSignedDocumentUrl,
  listCompanyDocumentCategories,
  createCompanyDocumentCategory,
  updateCompanyDocumentCategory,
  deleteCompanyDocumentCategory
} from "../controllers/companyDocumentController.js";

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  authorizeRoles("admin", "superadmin", "hr"),
  listCompanyDocuments
);

// Company document categories (dynamic)
router.get(
  "/categories",
  authMiddleware,
  authorizeRoles("admin", "superadmin", "hr"),
  listCompanyDocumentCategories
);

router.post(
  "/categories",
  authMiddleware,
  authorizeRoles("admin", "superadmin", "hr"),
  createCompanyDocumentCategory
);

router.put(
  "/categories/:id",
  authMiddleware,
  authorizeRoles("admin", "superadmin", "hr"),
  updateCompanyDocumentCategory
);

router.delete(
  "/categories/:id",
  authMiddleware,
  authorizeRoles("admin", "superadmin", "hr"),
  deleteCompanyDocumentCategory
);

// Upload company document - allowed for admin, superadmin, and hr roles
router.post(
  "/",
  authMiddleware,
  authorizeRoles("admin", "superadmin", "hr"),
  FileUpload.single("file"),
  logFileUpload, // ✅ Log upload details (bucket name, S3 location, etc.)
  uploadCompanyDocument
);

router.get(
  "/:id/signed-url",
  authMiddleware,
  // Allow all authenticated users to access signed URLs for viewing/downloading documents
  getSignedDocumentUrl
);

router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("admin", "superadmin", "hr"),
  deleteCompanyDocument
);

export default router;


