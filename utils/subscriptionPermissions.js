import { Subscription } from "../models/subscriptionModel.js";
import { checkTrialStatus } from "./trialUtils.js";
import { User } from "../models/driver/userModel.js";

/**
 * PLAN SNAPSHOT SYSTEM
 * 
 * This system protects admin subscriptions from plan changes:
 * - When an admin subscribes, a snapshot of the plan's configuration is stored
 * - Permission checks use the snapshot (what admin paid for) instead of live plan
 * - This ensures superadmin plan edits don't affect existing subscriptions
 * - Backward compatible: falls back to live plan if snapshot doesn't exist
 * 
 * @module subscriptionPermissions
 */

/**
 * Get the admin user for a given user (HR, dispatcher, etc.)
 * @param {string} userId - The user ID
 * @returns {Promise<Object|null>} Admin user or null
 */
const getAdminForUser = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return null;
    }

    // If user is admin or superadmin, return themselves
    if (user.role === 'admin' || user.role === 'superadmin') {
      return user;
    }

    // If user has a company, find admin with same company
    if (user.company) {
      const admin = await User.findOne({
        role: 'admin',
        company: user.company
      });
      if (admin) {
        return admin;
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding admin for user:', error);
    return null;
  }
};

/**
 * Check whether a user (admin or company staff) can create another user based on
 * the company's subscription status. When the trial is active or there is an active
 * subscription, all roles are allowed. Otherwise, no creation is permitted.
 * @param {string} userId - The user ID (can be admin, HR, or other user)
 * @param {string} roleToCreate - The role that needs to be created
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export const checkRoleCreationPermission = async (userId, roleToCreate) => {
  try {
    // Get the admin user (if userId is HR or other user, find their admin)
    const admin = await getAdminForUser(userId);

    if (!admin) {
      const user = await User.findById(userId);
      if (user && user.role === 'superadmin') {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: "No admin found for your account. Please contact support."
      };
    }

    // Superadmin organisation owners are always allowed
    if (admin.role === 'superadmin') {
      return { allowed: true };
    }

    const adminId = admin._id;

    // Allow everything during an active trial
    const trialStatus = await checkTrialStatus(adminId);
    if (trialStatus.isTrialActive) {
      return {
        allowed: true,
        reason: "Trial period active"
      };
    }

    // Check for an active subscription (monthly or lifetime)
    const subscription = await Subscription.findOne({
      admin: adminId,
      status: 'active'
    });

    if (subscription) {
      return { allowed: true };
    }

    // No trial and no active subscription: block creation
    return {
      allowed: false,
      reason: "No active plan found. Please subscribe to continue creating users."
    };
  } catch (error) {
    console.error("Error checking role creation permission:", error);
    return {
      allowed: false,
      reason: "Error checking subscription permissions. Please try again or contact support."
    };
  }
};

/**
 * Get all allowed roles for an admin based on their subscription
 * @param {string} adminId - The admin/user ID
 * @returns {Promise<string[]>}
 */
export const getAllowedRoles = async (adminId) => {
  try {
    const allRoles = ['driver', 'dispatcher', 'hr', 'contact', 'customer', 'reporter',
                     'Maintenance Crew (Mechanics)', 'Fleet Maintenance Manager', 'Compliance Manager', 'safety officer', 'accountant'];

    // Resolve the owning admin for this user id
    const admin = await getAdminForUser(adminId);
    if (!admin) {
      return [];
    }

    // Superadmin gets everything regardless of subscription
    if (admin.role === 'superadmin') {
      return allRoles;
    }

    // Check trial status first
    const trialStatus = await checkTrialStatus(admin._id);
    if (trialStatus.isTrialActive) {
      return allRoles;
    }

    // Then check for active subscription
    const subscription = await Subscription.findOne({
      admin: admin._id,
      status: 'active'
    });

    if (subscription) {
      return allRoles;
    }

    return [];
  } catch (error) {
    console.error("Error getting allowed roles:", error);
    return [];
  }
};

