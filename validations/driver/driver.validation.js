import { body } from "express-validator";
import { User } from "../../models/driver/userModel.js";
import mongoose from "mongoose";

// ✅ Create driver validations
export const createDriverValidator = [
  body("name").notEmpty().withMessage("Name is required"),
  body("email")
    .isEmail().withMessage("Valid email is required")
    .custom(async (value, { req }) => {
      // Build query to check email within same company and role
      const query = { email: value, role: 'driver' };
      
      // If user has a company, check only within that company
      if (req.user && req.user.company) {
        const companyId = typeof req.user.company === 'string' 
          ? req.user.company 
          : (req.user.company._id || req.user.company.toString());
        if (mongoose.Types.ObjectId.isValid(companyId)) {
          query.company = new mongoose.Types.ObjectId(companyId);
        }
      }
      
      const existing = await User.findOne(query);
      if (existing) throw new Error("Email already exists for a driver in your company");
      return true;
    }),
  body("phone")
    .isMobilePhone().withMessage("Valid phone number is required")
    .custom(async (value, { req }) => {
      // Build query to check phone within same company and role
      const query = { phone: value, role: 'driver' };
      
      // If user has a company, check only within that company
      if (req.user && req.user.company) {
        const companyId = typeof req.user.company === 'string' 
          ? req.user.company 
          : (req.user.company._id || req.user.company.toString());
        if (mongoose.Types.ObjectId.isValid(companyId)) {
          query.company = new mongoose.Types.ObjectId(companyId);
        }
      }
      
      const existing = await User.findOne(query);
      if (existing) throw new Error("Phone already exists for a driver in your company");
      return true;
    }),
  body("country").notEmpty().withMessage("Country is required"),
  body("role").isIn(["driver", "manager", "admin"]).withMessage("Invalid role"),
  body("policies")
    .optional()
    .isString()
    .withMessage("Policies must be a string"),
];

// ✅ Update driver validations
export const updateDriverValidator = [
  body("details.internalId").optional().isString(),
  body("details.licenceNumber").optional().isString(),
  body("details.vendor").optional().isString(),
  body("details.city").optional().isString(),
  body("details.country").optional().isString(),
  body("details.status")
    .optional()
    .isIn(["active", "inactive"])
    .withMessage("Invalid status"),
  body("location.longitude").optional().isString(),
  body("location.latitude").optional().isString(),
];
