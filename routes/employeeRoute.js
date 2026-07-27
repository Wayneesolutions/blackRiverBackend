import express from "express";
import {
    createEmployee,
    getAllEmployees,
    getEmployeeById,
    updateEmployee,
    updateEmployeeStatus,
    deleteEmployee,
    bulkDeleteEmployees,
    getEmployeeStats,
    resetEmployeePassword
} from "../controllers/employee/employeeController.js";
import {
    createEmployeeValidation,
    updateEmployeeValidation,
    updateStatusValidation,
    bulkDeleteValidation,
    resetPasswordValidation
} from "../validations/employee/employee.validation.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authRoles.js";
import { FileUpload } from "../middleware/upload.js";
const employeeRoute = express.Router();

// ✅ EMPLOYEE MANAGEMENT ROUTES

// Create new employee
employeeRoute.post(
    "/",
    authMiddleware,
    FileUpload.fields([
        { name: 'file', maxCount: 1 }, // Profile image
        { name: 'documentFiles', maxCount: 20 } // Document files
    ]),
    authorizeRoles('admin', 'superadmin', 'hr'),
    createEmployeeValidation,
    createEmployee
);

// Get all employees with filters and pagination
employeeRoute.get(
    "/",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr', 'dispatcher', 'Fleet Maintenance Manager', 'safety officer'),
    getAllEmployees
);

// Get employee statistics
employeeRoute.get(
    "/stats",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    getEmployeeStats
);

// Get employee by ID
employeeRoute.get(
    "/:id",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr', 'dispatcher', 'Fleet Maintenance Manager', 'safety officer'),
    getEmployeeById
);

// Update employee
employeeRoute.put(
    "/:id",
    authMiddleware,
    FileUpload.fields([
        { name: 'file', maxCount: 1 }, // Profile image
        { name: 'documentFiles', maxCount: 20 } // Document files
    ]),
    authorizeRoles('admin', 'superadmin', 'hr'),
    updateEmployeeValidation,
    updateEmployee
);

// Update employee status
employeeRoute.patch(
    "/:id/status",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    updateStatusValidation,
    updateEmployeeStatus
);

// Reset employee password
employeeRoute.patch(
    "/:id/reset-password",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    resetPasswordValidation,
    resetEmployeePassword
);

// Delete employee
employeeRoute.delete(
    "/:id",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    deleteEmployee
);

// Bulk delete employees
employeeRoute.delete(
    "/bulk/delete",
    authMiddleware,
    authorizeRoles('admin', 'superadmin', 'hr'),
    bulkDeleteValidation,
    bulkDeleteEmployees
);

export default employeeRoute;
