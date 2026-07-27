import { checkTrialStatus } from "../utils/trialUtils.js";
import { Subscription } from "../models/subscriptionModel.js";

/**
 * Middleware to check if admin has active subscription or active trial
 * Blocks access if trial is expired and no active subscription exists
 */
export const checkTrialAccess = async (req, res, next) => {
  try {
    // Skip check for superadmin
    if (req.user && req.user.role === 'superadmin') {
      return next();
    }

    // Skip check for non-admin roles
    if (req.user && req.user.role !== 'admin') {
      return next();
    }

    const adminId = req.user._id;

    // Check for active subscription first
    const activeSubscription = await Subscription.findOne({
      admin: adminId,
      status: 'active'
    });

    if (activeSubscription) {
      // Admin has active subscription, allow access
      return next();
    }

    // Check trial status
    const trialStatus = await checkTrialStatus(adminId);

    if (trialStatus.isTrialActive) {
      // Trial is active, allow access
      return next();
    }

    if (trialStatus.isTrialExpired) {
      // Trial expired, block access
      return res.status(403).json({
        success: false,
        message: "Your free trial has expired. Please subscribe to a plan to continue using the platform.",
        trialExpired: true,
        trialEndDate: trialStatus.trialEndDate
      });
    }

    // No trial and no subscription - allow access but they should subscribe
    // (This allows them to access subscription page)
    return next();
  } catch (error) {
    console.error('Error checking trial access:', error);
    // On error, allow access (fail open) but log the error
    return next();
  }
};

