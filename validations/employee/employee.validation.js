import { body } from "express-validator";

// ✅ CREATE EMPLOYEE VALIDATION
export const createEmployeeValidation = [
    body('name')
        .notEmpty()
        .withMessage('Name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Name can only contain letters and spaces'),

    body('email')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

    body('phone')
        .optional()
        .custom((value) => {
            if (!value) return true; // Optional field, so empty is OK
            // Accept international phone numbers: + followed by digits, or digits with spaces/hyphens/parentheses
            const phoneRegex = /^\+?[\d\s\-()]+$/;
            const digitsOnly = value.replace(/\D/g, '');
            if (!phoneRegex.test(value) || digitsOnly.length < 10) {
                throw new Error('Please provide a valid phone number');
            }
            return true;
        }),

    body('country')
        .optional()
        .isLength({ min: 2, max: 50 })
        .withMessage('Country must be between 2 and 50 characters'),

    body('password')
        .optional()
        .custom((value) => {
            if (value && value.length < 6) {
                throw new Error('Password must be at least 6 characters long');
            }
            return true;
        }),

    body('role')
        .notEmpty()
        .withMessage('Role is required')
        .isIn(['driver', 'dispatcher', 'hr', 'contact', 'customer', 'reporter', 'Maintenance Crew (Mechanics)', 'Fleet Maintenance Manager', 'Compliance Manager', 'safety officer', 'operator', 'accountant', 'salesperson'])
        .withMessage('Invalid role selected'),

    body('policies')
        .optional()
        .isLength({ min: 5, max: 500 })
        .withMessage('Policies must be between 5 and 500 characters'),

    body('state')
        .optional()
        .isLength({ min: 2, max: 50 })
        .withMessage('State must be between 2 and 50 characters'),

    body('city')
        .optional()
        .isLength({ min: 2, max: 50 })
        .withMessage('City must be between 2 and 50 characters'),

    body('joinDate')
        .optional()
        .isISO8601()
        .withMessage('Please provide a valid join date'),

    body('internalId')
        .optional()
        .isLength({ min: 3, max: 20 })
        .withMessage('Internal ID must be between 3 and 20 characters')
        .matches(/^[A-Z0-9_-]+$/)
        .withMessage('Internal ID can only contain uppercase letters, numbers, hyphens, and underscores'),

    body('address')
        .optional()
        .isLength({ min: 5, max: 200 })
        .withMessage('Address must be between 5 and 200 characters'),

    body('status')
        .optional()
        .isIn(['active', 'inactive'])
        .withMessage('Status must be either active or inactive'),

    body('company')
        .optional()
        .isMongoId()
        .withMessage('Company must be a valid MongoDB ObjectId')
];

// ✅ UPDATE EMPLOYEE VALIDATION
export const updateEmployeeValidation = [
    body('name')
        .optional()
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Name can only contain letters and spaces'),

    body('email')
        .optional()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

    body('phone')
        .optional()
        .custom((value) => {
            if (!value) return true; // Optional field, so empty is OK
            // Accept international phone numbers: + followed by digits, or digits with spaces/hyphens/parentheses
            const phoneRegex = /^\+?[\d\s\-()]+$/;
            const digitsOnly = value.replace(/\D/g, '');
            if (!phoneRegex.test(value) || digitsOnly.length < 10) {
                throw new Error('Please provide a valid phone number');
            }
            return true;
        }),

    body('country')
        .optional()
        .isLength({ min: 2, max: 50 })
        .withMessage('Country must be between 2 and 50 characters'),

    body('password')
        .optional()
        .custom((value) => {
            if (value && value.length < 6) {
                throw new Error('Password must be at least 6 characters long');
            }
            return true;
        }),

    body('role')
        .optional()
        .isIn(['driver', 'dispatcher', 'hr', 'contact', 'customer', 'reporter', 'Maintenance Crew (Mechanics)', 'Fleet Maintenance Manager', 'Compliance Manager', 'safety officer', 'operator', 'accountant', 'salesperson'])
        .withMessage('Invalid role selected'),

    body('policies')
        .optional()
        .isLength({ min: 5, max: 500 })
        .withMessage('Policies must be between 5 and 500 characters'),

    body('state')
        .optional()
        .isLength({ min: 2, max: 50 })
        .withMessage('State must be between 2 and 50 characters'),

    body('city')
        .optional()
        .isLength({ min: 2, max: 50 })
        .withMessage('City must be between 2 and 50 characters'),

    body('joinDate')
        .optional()
        .isISO8601()
        .withMessage('Please provide a valid join date'),

    body('status')
        .optional()
        .isIn(['active', 'inactive'])
        .withMessage('Status must be either active or inactive'),

    body('internalId')
        .optional()
        .isLength({ min: 3, max: 20 })
        .withMessage('Internal ID must be between 3 and 20 characters')
        .matches(/^[A-Z0-9_-]+$/)
        .withMessage('Internal ID can only contain uppercase letters, numbers, hyphens, and underscores'),

    body('address')
        .optional()
        .isLength({ min: 5, max: 200 })
        .withMessage('Address must be between 5 and 200 characters'),

    body('company')
        .optional()
        .isMongoId()
        .withMessage('Company must be a valid MongoDB ObjectId')
];

// ✅ UPDATE STATUS VALIDATION
export const updateStatusValidation = [
    body('status')
        .notEmpty()
        .withMessage('Status is required')
        .isIn(['active', 'inactive'])
        .withMessage('Status must be either active or inactive')
];

// ✅ BULK DELETE VALIDATION
export const bulkDeleteValidation = [
    body('employeeIds')
        .isArray({ min: 1 })
        .withMessage('Employee IDs must be provided as an array')
        .custom((employeeIds) => {
            if (!employeeIds.every(id => typeof id === 'string' && id.length === 24)) {
                throw new Error('All employee IDs must be valid MongoDB ObjectIds');
            }
            return true;
        })
];

// ✅ RESET PASSWORD VALIDATION
export const resetPasswordValidation = [
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number')
];