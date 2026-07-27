import { User } from "../models/driver/userModel.js";
import { Subscription } from "../models/subscriptionModel.js";
import { checkTrialStatus } from "./trialUtils.js";

/**
 * Find the admin user associated with a given user
 * - If user is admin/superadmin, return themselves
 * - If user has a company, find admin with same company
 * - Otherwise, try to find any admin (fallback)
 * @param {String} userId - User ID
 * @returns {Promise<Object|null>} Admin user or null
 */
export const findAdminForUser = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return null;
    }

    // If user is admin or superadmin, they are the admin
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

    // Fallback: Try to find any admin (this might not be ideal, but handles edge cases)
    // In a real scenario, you might want to return null here
    const anyAdmin = await User.findOne({ role: 'admin' });
    return anyAdmin;
  } catch (error) {
    console.error('Error finding admin for user:', error);
    return null;
  }
};

/**
 * Check if user has access based on admin's subscription/trial status
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Access status
 */
export const checkUserAccess = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return {
        hasAccess: false,
        accessLevel: 'none',
        reason: 'user_not_found',
        message: 'User not found'
      };
    }

    // Superadmin always has access
    if (user.role === 'superadmin') {
      return {
        hasAccess: true,
        accessLevel: 'full',
        reason: 'superadmin',
        message: 'Superadmin has full access'
      };
    }

    // Find the admin for this user
    const admin = await findAdminForUser(userId);
    if (!admin) {
      // If no admin found, deny access (safer approach)
      return {
        hasAccess: false,
        accessLevel: 'none',
        reason: 'no_admin_found',
        message: 'No admin account found. Please contact support.'
      };
    }

    // Check if admin has active subscription
    // Also allow pending subscriptions with paid payment status (payment completed but status not yet updated)
    // In development mode, allow any pending subscription
    const subscriptionQuery = {
      admin: admin._id,
      $or: [
        { status: 'active' },
        { 
          status: 'pending', 
          paymentStatus: 'paid' 
        }
      ]
    };

    // In development mode, allow any pending subscription
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
      subscriptionQuery.$or.push({ status: 'pending' });
    }

    const activeSubscription = await Subscription.findOne(subscriptionQuery)
      .sort({ createdAt: -1 }); // Get the most recent subscription

    if (activeSubscription) {
      const isPending = activeSubscription.status === 'pending';
      return {
        hasAccess: true,
        accessLevel: 'full',
        reason: isPending ? 'pending_subscription' : 'active_subscription',
        message: isPending 
          ? 'Access granted - subscription pending activation'
          : 'Access granted - admin has active subscription',
        adminId: admin._id
      };
    }

    // Check admin's trial status
    const trialStatus = await checkTrialStatus(admin._id);

    // Handle error case - if trial check failed, allow access (fail open for error cases)
    // This prevents blocking access due to database or other errors
    if (!trialStatus || trialStatus.success === false) {
      console.error('Error checking trial status, allowing access:', trialStatus?.message);
      return {
        hasAccess: true,
        accessLevel: 'full',
        reason: 'trial_check_error',
        message: 'Trial status check failed, access granted',
        adminId: admin._id
      };
    }

    if (trialStatus.isTrialActive) {
      return {
        hasAccess: true,
        accessLevel: 'full',
        reason: 'active_trial',
        message: `Access granted - admin trial active (${trialStatus.daysRemaining} days remaining)`,
        adminId: admin._id,
        daysRemaining: trialStatus.daysRemaining
      };
    }

    if (trialStatus.isTrialExpired) {
      // In development mode, allow expired trials to continue working
      // This helps with testing and development without needing to constantly reset trials
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
        console.log('⚠️ Trial expired but allowing access in development mode');
        return {
          hasAccess: true,
          accessLevel: 'full',
          reason: 'trial_expired_dev_mode',
          message: 'Trial expired but access granted in development mode',
          adminId: admin._id,
          trialEndDate: trialStatus.trialEndDate
        };
      }
      
      return {
        hasAccess: false,
        accessLevel: 'limited',
        reason: 'trial_expired',
        message: 'Your trial has expired. Renew your plan to restore full access.',
        adminId: admin._id,
        trialEndDate: trialStatus.trialEndDate
      };
    }

    // No trial and no subscription
    // Allow limited access so admin can start trial or subscribe
    // But block write operations that require active subscription
    return {
      hasAccess: false,
      accessLevel: 'limited',
      reason: 'no_trial_no_subscription',
      message: 'No active plan detected. Start a trial or purchase a plan to unlock full access.',
      adminId: admin._id
    };
  } catch (error) {
    console.error('Error checking user access:', error);
    // On error, deny access (fail secure)
    return {
      hasAccess: false,
      accessLevel: 'none',
      reason: 'error',
      message: 'Error checking access. Please contact support.'
    };
  }
};

