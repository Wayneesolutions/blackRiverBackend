import { body } from "express-validator";

export const createVehicleValidation = [
  body("internalId").notEmpty().withMessage("Internal ID is required"),
  body("plateNumber").notEmpty().withMessage("Plate number is required"),
  body("vinNumber").notEmpty().withMessage("VIN number is required"),
  body("make").notEmpty().withMessage("Make is required"),
  body("model").notEmpty().withMessage("Model is required"),
  body("year")
    .isInt({ min: 1900, max: new Date().getFullYear() })
    .withMessage("Enter a valid year"),
  body("status")
    .optional()
    .isIn(["active", "inactive", "maintenance"])
    .withMessage("Invalid status value"),
  body("coordinates.longitude").isFloat().withMessage("Longitude must be a number"),
  body("coordinates.latitude").isFloat().withMessage("Latitude must be a number"),
];
