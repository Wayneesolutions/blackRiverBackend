import { body, param } from "express-validator";

// ✅ CREATE EMPLOYEE DOCUMENT VALIDATION
export const createEmployeeDocumentValidation = [
    body('employee')
        .notEmpty()
        .withMessage('Employee ID is required')
        .isMongoId()
        .withMessage('Invalid employee ID format'),

    body('documentType')
        .notEmpty()
        .withMessage('Document type is required')
        .isIn([
            'Employment Contract',
            'ID Document',
            'Passport',
            'Work Permit',
            'Background Check',
            'Drug Test',
            'Training Certificate',
            'Insurance Policy',
            'Company Policy',
            'Performance Review',
            'Payroll Document',
            'Tax Document',
            'Emergency Contact',
            'Medical Certificate',
            'Driving Licence',
            'Travel Document',
            'Commercial Driver\'s License (CDL)',
            'Medical Certificate (DOT Physical)',
            'Drug Test Results',
            'Alcohol Test Results',
            'Driving Record (MVR)',
            'DOT Physical Card',
            'CDL Training Certificate',
            'Defensive Driving Certificate',
            'Hazmat Endorsement',
            'Tanker Endorsement',
            'Doubles/Triples Endorsement',
            'Passenger Endorsement',
            'School Bus Endorsement',
            'Vehicle Inspection Certification',
            'Safety Training Certificate',
            'Hours of Service (HOS) Records',
            'Emergency Contact Form',
            'Road Test Certificate',
            'TSA Security Clearance',
            'Other'
        ])
        .withMessage('Invalid document type'),

    body('documentNumber')
        .optional()
        .isLength({ min: 1, max: 100 })
        .withMessage('Document number must be between 1 and 100 characters'),

    body('issueDate')
        .optional()
        .isISO8601()
        .withMessage('Invalid issue date format (YYYY-MM-DD)'),

    body('expiryDate')
        .optional()
        .isISO8601()
        .withMessage('Invalid expiry date format (YYYY-MM-DD)')
        .custom((value, { req }) => {
            if (value && req.body.issueDate) {
                const issueDate = new Date(req.body.issueDate);
                const expiryDate = new Date(value);
                if (expiryDate <= issueDate) {
                    throw new Error('Expiry date must be after issue date');
                }
            }
            return true;
        }),

    body('fileUrl')
        .optional()
        .isURL()
        .withMessage('File URL must be a valid URL'),

    body('fileName')
        .optional()
        .isLength({ min: 1, max: 255 })
        .withMessage('File name must be between 1 and 255 characters'),

    body('fileSize')
        .optional()
        .isInt({ min: 1 })
        .withMessage('File size must be a positive integer'),

    body('mimeType')
        .optional()
        .isLength({ min: 1, max: 100 })
        .withMessage('MIME type must be between 1 and 100 characters'),

    body('description')
        .optional()
        .isLength({ min: 5, max: 500 })
        .withMessage('Description must be between 5 and 500 characters'),

    body('status')
        .optional()
        .isIn(['valid', 'expiring-soon', 'expired', 'pending', 'rejected'])
        .withMessage('Invalid status')
];

// ✅ UPDATE EMPLOYEE DOCUMENT VALIDATION
export const updateEmployeeDocumentValidation = [
    param('id')
        .isMongoId()
        .withMessage('Invalid document ID format'),

    body('documentType')
        .optional()
        .isIn([
            'Employment Contract',
            'ID Document',
            'Passport',
            'Work Permit',
            'Background Check',
            'Drug Test',
            'Training Certificate',
            'Insurance Policy',
            'Company Policy',
            'Performance Review',
            'Payroll Document',
            'Tax Document',
            'Emergency Contact',
            'Medical Certificate',
            'Driving Licence',
            'Travel Document',
            'Commercial Driver\'s License (CDL)',
            'Medical Certificate (DOT Physical)',
            'Drug Test Results',
            'Alcohol Test Results',
            'Driving Record (MVR)',
            'DOT Physical Card',
            'CDL Training Certificate',
            'Defensive Driving Certificate',
            'Hazmat Endorsement',
            'Tanker Endorsement',
            'Doubles/Triples Endorsement',
            'Passenger Endorsement',
            'School Bus Endorsement',
            'Vehicle Inspection Certification',
            'Safety Training Certificate',
            'Hours of Service (HOS) Records',
            'Emergency Contact Form',
            'Road Test Certificate',
            'TSA Security Clearance',
            'Other'
        ])
        .withMessage('Invalid document type'),

    body('documentNumber')
        .optional()
        .isLength({ min: 1, max: 100 })
        .withMessage('Document number must be between 1 and 100 characters'),

    body('issueDate')
        .optional()
        .isISO8601()
        .withMessage('Invalid issue date format (YYYY-MM-DD)'),

    body('expiryDate')
        .optional()
        .isISO8601()
        .withMessage('Invalid expiry date format (YYYY-MM-DD)')
        .custom((value, { req }) => {
            if (value && req.body.issueDate) {
                const issueDate = new Date(req.body.issueDate);
                const expiryDate = new Date(value);
                if (expiryDate <= issueDate) {
                    throw new Error('Expiry date must be after issue date');
                }
            }
            return true;
        }),

    body('fileUrl')
        .optional()
        .isURL()
        .withMessage('File URL must be a valid URL'),

    body('fileName')
        .optional()
        .isLength({ min: 1, max: 255 })
        .withMessage('File name must be between 1 and 255 characters'),

    body('fileSize')
        .optional()
        .isInt({ min: 1 })
        .withMessage('File size must be a positive integer'),

    body('mimeType')
        .optional()
        .isLength({ min: 1, max: 100 })
        .withMessage('MIME type must be between 1 and 100 characters'),

    body('description')
        .optional()
        .isLength({ min: 5, max: 500 })
        .withMessage('Description must be between 5 and 500 characters'),

    body('status')
        .optional()
        .isIn(['valid', 'expiring-soon', 'expired', 'pending', 'rejected'])
        .withMessage('Invalid status')
];

// ✅ UPDATE DOCUMENT STATUS VALIDATION
export const updateDocumentStatusValidation = [
    param('id')
        .isMongoId()
        .withMessage('Invalid document ID format'),

    body('status')
        .notEmpty()
        .withMessage('Status is required')
        .isIn(['valid', 'expiring-soon', 'expired', 'pending', 'rejected'])
        .withMessage('Invalid status'),

    body('rejectionReason')
        .optional()
        .isLength({ min: 5, max: 200 })
        .withMessage('Rejection reason must be between 5 and 200 characters')
        .custom((value, { req }) => {
            if (req.body.status === 'rejected' && !value) {
                throw new Error('Rejection reason is required when status is rejected');
            }
            return true;
        })
];

// ✅ GET DOCUMENT BY ID VALIDATION
export const getDocumentByIdValidation = [
    param('id')
        .isMongoId()
        .withMessage('Invalid document ID format')
];

// ✅ GET DOCUMENTS BY EMPLOYEE VALIDATION
export const getDocumentsByEmployeeValidation = [
    param('employeeId')
        .isMongoId()
        .withMessage('Invalid employee ID format')
];

// ✅ BULK DELETE VALIDATION
export const bulkDeleteEmployeeDocumentsValidation = [
    body('documentIds')
        .isArray({ min: 1 })
        .withMessage('Document IDs must be provided as an array')
        .custom((documentIds) => {
            if (!documentIds.every(id => typeof id === 'string' && id.length === 24)) {
                throw new Error('All document IDs must be valid MongoDB ObjectIds');
            }
            return true;
        })
];

// ✅ QUERY PARAMETERS VALIDATION
export const documentQueryValidation = [
    param('employee')
        .optional()
        .isMongoId()
        .withMessage('Invalid employee ID format'),

    param('documentType')
        .optional()
        .isIn([
            'Employment Contract',
            'ID Document',
            'Passport',
            'Work Permit',
            'Background Check',
            'Drug Test',
            'Training Certificate',
            'Insurance Policy',
            'Company Policy',
            'Performance Review',
            'Payroll Document',
            'Tax Document',
            'Emergency Contact',
            'Medical Certificate',
            'Driving Licence',
            'Travel Document',
            'Commercial Driver\'s License (CDL)',
            'Medical Certificate (DOT Physical)',
            'Drug Test Results',
            'Alcohol Test Results',
            'Driving Record (MVR)',
            'DOT Physical Card',
            'CDL Training Certificate',
            'Defensive Driving Certificate',
            'Hazmat Endorsement',
            'Tanker Endorsement',
            'Doubles/Triples Endorsement',
            'Passenger Endorsement',
            'School Bus Endorsement',
            'Vehicle Inspection Certification',
            'Safety Training Certificate',
            'Hours of Service (HOS) Records',
            'Emergency Contact Form',
            'Road Test Certificate',
            'TSA Security Clearance',
            'Other'
        ])
        .withMessage('Invalid document type'),

    param('status')
        .optional()
        .isIn(['valid', 'expiring-soon', 'expired', 'pending', 'rejected'])
        .withMessage('Invalid status'),

    param('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),

    param('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),

    param('sortBy')
        .optional()
        .isIn(['createdAt', 'updatedAt', 'expiryDate', 'documentType', 'status'])
        .withMessage('Invalid sort field'),

    param('sortOrder')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Sort order must be either asc or desc')
];
