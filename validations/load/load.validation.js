import { body } from "express-validator";
import Load from "../../models/loadModel.js";

// Validation for creating/updating loads
export const loadValidation = [
  body("details.orderType")
    .optional()
    .isString()
    .withMessage("Order type must be a string"),
  body("details.driver")
    .optional()
    .isMongoId()
    .withMessage("Driver must be a valid MongoDB ObjectId"),
  body("details.requiredProof")
    .optional()
    .isIn(["scan", "signature", "photo"])
    .withMessage("Required proof must be scan, signature, or photo"),
  body("route.wayPoints.*.address")
    .optional()
    .isString()
    .withMessage("Waypoint address must be string"),
  body("payloads.*.itemName")
    .optional()
    .isString()
    .withMessage("Item name must be a string"),
];