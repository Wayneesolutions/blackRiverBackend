import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authRoles.js";
import { FileUpload } from "../middleware/upload.js";
import {
  getDriverViolations,
  getViolationStats,
  getViolationById,
  createViolation,
  updateViolation,
  deleteViolation,
  syncGeotabViolations,
  getDriverViolationSummary
} from "../controllers/driverViolationController.js";

const violationRoute = express.Router();

// Roles that can manage violations
const managerRoles = ['admin', 'superadmin', 'hr', 'safety officer', 'Compliance Manager'];

/**
 * @route   GET /api/v1/violations
 * @desc    Get all violations with filters
 * @access  Private (HR, Safety Officer, Compliance Manager, Admin, Superadmin)
 */
violationRoute.get(
  '/',
  authMiddleware,
  authorizeRoles(...managerRoles),
  getDriverViolations
);

/**
 * @route   GET /api/v1/violations/stats
 * @desc    Get violation statistics
 * @access  Private (HR, Safety Officer, Compliance Manager, Admin, Superadmin)
 */
violationRoute.get(
  '/stats',
  authMiddleware,
  authorizeRoles(...managerRoles),
  getViolationStats
);

/**
 * @route   GET /api/v1/violations/driver/:driverId
 * @desc    Get driver's violation summary
 * @access  Private (HR, Safety Officer, Compliance Manager, Admin, Superadmin, Driver)
 */
violationRoute.get(
  '/driver/:driverId',
  authMiddleware,
  authorizeRoles(...managerRoles, 'driver'),
  getDriverViolationSummary
);

/**
 * @route   GET /api/v1/violations/:id
 * @desc    Get violation by ID
 * @access  Private (HR, Safety Officer, Compliance Manager, Admin, Superadmin)
 */
violationRoute.get(
  '/:id',
  authMiddleware,
  authorizeRoles(...managerRoles),
  getViolationById
);

/**
 * @route   POST /api/v1/violations
 * @desc    Create violation (manual entry)
 * @access  Private (HR, Safety Officer, Compliance Manager, Admin, Superadmin)
 */
violationRoute.post(
  '/',
  authMiddleware,
  authorizeRoles(...managerRoles),
  FileUpload.single('file'),
  createViolation
);

/**
 * @route   POST /api/v1/violations/sync-geotab
 * @desc    Sync violations from Geotab
 * @access  Private (Admin, Superadmin)
 */
violationRoute.post(
  '/sync-geotab',
  authMiddleware,
  authorizeRoles('admin', 'superadmin'),
  syncGeotabViolations
);

/**
 * @route   PUT /api/v1/violations/:id
 * @desc    Update violation
 * @access  Private (HR, Safety Officer, Compliance Manager, Admin, Superadmin)
 */
violationRoute.put(
  '/:id',
  authMiddleware,
  authorizeRoles(...managerRoles),
  FileUpload.single('file'),
  updateViolation
);

/**
 * @route   DELETE /api/v1/violations/:id
 * @desc    Delete violation
 * @access  Private (Admin, Superadmin)
 */
violationRoute.delete(
  '/:id',
  authMiddleware,
  authorizeRoles('admin', 'superadmin'),
  deleteViolation
);

export default violationRoute;

