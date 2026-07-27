import { User } from "../models/driver/userModel.js";

/**
 * Get company filter for the current user
 * Returns company ID if user has one, or null for superadmin
 * @param {Object} user - User object from req.user
 * @returns {Object|null} Company filter object or null
 */
export const getCompanyFilter = (user) => {
  // Superadmin can see all data (no filter)
  if (user.role === 'superadmin') {
    return null;
  }

  // If user has company, filter by company
  if (user.company) {
    return { company: user.company };
  }

  // If user is admin but no company, try to find admin's company
  // This handles edge cases where admin might not have company set
  return null; // Will need to handle this case
};

/**
 * Get company ID for the current user
 * @param {Object} user - User object from req.user
 * @returns {String|null} Company ID or null
 */
export const getUserCompanyId = (user) => {
  if (!user) {
    return null;
  }
  
  if (user.role === 'superadmin') {
    return null; // Superadmin has no company filter
  }
  
  if (!user.company) {
    return null;
  }

  // Handle string company ID
  if (typeof user.company === 'string') {
    return user.company;
  }

  // Handle populated company object with _id
  if (user.company?._id) {
    return user.company._id.toString();
  }

  // Handle ObjectId directly (Mongoose ObjectId)
  if (user.company?.toString && typeof user.company.toString === 'function') {
    return user.company.toString();
  }

  // Handle case where company might be an ObjectId instance
  if (user.company?.constructor?.name === 'ObjectId' || user.company?.constructor?.name === 'ObjectID') {
    return user.company.toString();
  }

  return null;
};

