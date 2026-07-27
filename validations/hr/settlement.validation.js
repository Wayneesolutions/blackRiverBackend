import { body, param, query } from "express-validator";

// Settlement Validations
export const createSettlementValidation = [
  body('driver')
    .notEmpty()
    .withMessage('Driver ID is required')
    .isMongoId()
    .withMessage('Invalid driver ID format'),

  body('payPeriod.startDate')
    .notEmpty()
    .withMessage('Pay period start date is required')
    .isISO8601()
    .withMessage('Invalid start date format'),

  body('payPeriod.endDate')
    .notEmpty()
    .withMessage('Pay period end date is required')
    .isISO8601()
    .withMessage('Invalid end date format')
    .custom((value, { req }) => {
      if (value && req.body.payPeriod?.startDate) {
        const startDate = new Date(req.body.payPeriod.startDate);
        const endDate = new Date(value);
        if (endDate <= startDate) {
          throw new Error('End date must be after start date');
        }
      }
      return true;
    }),

  body('grossPay')
    .notEmpty()
    .withMessage('Gross pay is required')
    .isFloat({ min: 0 })
    .withMessage('Gross pay must be a positive number'),

  body('deductions')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Deductions must be a positive number'),

  body('additions')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Additions must be a positive number'),

  body('status')
    .optional()
    .isIn(['Pending', 'Processing', 'Paid', 'Cancelled'])
    .withMessage('Invalid status'),

  body('paymentMethod')
    .optional()
    .isIn(['Bank Transfer', 'Check', 'Cash', 'Other'])
    .withMessage('Invalid payment method')
];

export const updateSettlementValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid settlement ID format'),

  body('payPeriod.startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),

  body('payPeriod.endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format')
    .custom((value, { req }) => {
      if (value && req.body.payPeriod?.startDate) {
        const startDate = new Date(req.body.payPeriod.startDate);
        const endDate = new Date(value);
        if (endDate <= startDate) {
          throw new Error('End date must be after start date');
        }
      }
      return true;
    }),

  body('grossPay')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Gross pay must be a positive number'),

  body('deductions')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Deductions must be a positive number'),

  body('additions')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Additions must be a positive number'),

  body('status')
    .optional()
    .isIn(['Pending', 'Processing', 'Paid', 'Cancelled'])
    .withMessage('Invalid status'),

  body('paymentMethod')
    .optional()
    .isIn(['Bank Transfer', 'Check', 'Cash', 'Other'])
    .withMessage('Invalid payment method')
];

// Deduction & Addition Validations
export const createDeductionAdditionValidation = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('type')
    .notEmpty()
    .withMessage('Type is required')
    .isIn(['Deduction', 'Addition'])
    .withMessage('Type must be either Deduction or Addition'),

  body('recurrence')
    .notEmpty()
    .withMessage('Recurrence is required')
    .isIn(['One-time', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Yearly', 'One Time Payment'])
    .withMessage('Invalid recurrence type'),

  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),

  body('assignedTo')
    .notEmpty()
    .withMessage('Assigned to (driver ID) is required')
    .isMongoId()
    .withMessage('Invalid driver ID format'),

  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),

  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format')
    .custom((value, { req }) => {
      if (value && req.body.startDate) {
        const startDate = new Date(req.body.startDate);
        const endDate = new Date(value);
        if (endDate <= startDate) {
          throw new Error('End date must be after start date');
        }
      }
      return true;
    })
];

export const updateDeductionAdditionValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid deduction/addition ID format'),

  body('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('type')
    .optional()
    .isIn(['Deduction', 'Addition'])
    .withMessage('Type must be either Deduction or Addition'),

  body('recurrence')
    .optional()
    .isIn(['One-time', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Yearly', 'One Time Payment'])
    .withMessage('Invalid recurrence type'),

  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),

  body('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid driver ID format')
];

// Miles Tracking Validations
export const createMilesTrackingValidation = [
  body('date')
    .notEmpty()
    .withMessage('Date is required')
    .isISO8601()
    .withMessage('Invalid date format'),

  body('vehicle')
    .notEmpty()
    .withMessage('Vehicle ID is required')
    .isMongoId()
    .withMessage('Invalid vehicle ID format'),

  body('driver')
    .notEmpty()
    .withMessage('Driver ID is required')
    .isMongoId()
    .withMessage('Invalid driver ID format'),

  body('state')
    .notEmpty()
    .withMessage('State/Province is required')
    .isLength({ min: 2, max: 2 })
    .withMessage('State must be a 2-letter code'),

  body('totalMiles')
    .notEmpty()
    .withMessage('Total miles is required')
    .isFloat({ min: 0 })
    .withMessage('Total miles must be a positive number'),

  body('loadedMiles')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Loaded miles must be a positive number'),

  body('emptyMiles')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Empty miles must be a positive number'),

  body('iftaMiles')
    .notEmpty()
    .withMessage('IFTA miles is required')
    .isFloat({ min: 0 })
    .withMessage('IFTA miles must be a positive number'),

  body('trip')
    .optional()
    .isMongoId()
    .withMessage('Invalid trip ID format')
];

export const updateMilesTrackingValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid miles tracking ID format'),

  body('date')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format'),

  body('vehicle')
    .optional()
    .isMongoId()
    .withMessage('Invalid vehicle ID format'),

  body('driver')
    .optional()
    .isMongoId()
    .withMessage('Invalid driver ID format'),

  body('state')
    .optional()
    .isLength({ min: 2, max: 2 })
    .withMessage('State must be a 2-letter code'),

  body('totalMiles')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total miles must be a positive number'),

  body('loadedMiles')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Loaded miles must be a positive number'),

  body('emptyMiles')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Empty miles must be a positive number'),

  body('iftaMiles')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('IFTA miles must be a positive number')
];

