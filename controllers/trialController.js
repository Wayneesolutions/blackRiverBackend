import { getTrialInfo, checkTrialStatus } from "../utils/trialUtils.js";
import { User } from "../models/driver/userModel.js";
import { Subscription } from "../models/subscriptionModel.js";

/**
 * Get trial status for the authenticated admin
 */
export const getTrialStatus = async (req, res) => {
  try {
    const adminId = req.user._id;
    const trialInfo = await getTrialInfo(adminId);

    if (!trialInfo.success) {
      return res.status(400).json(trialInfo);
    }

    res.json({
      success: true,
      message: "Trial status retrieved successfully",
      data: trialInfo
    });
  } catch (error) {
    console.error('Error getting trial status:', error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * Check if admin can access the platform (has active subscription or active trial)
 */
export const checkAccess = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    // Check for active subscription
    const activeSubscription = await Subscription.findOne({
      admin: adminId,
      status: 'active'
    });

    if (activeSubscription) {
      return res.json({
        success: true,
        hasAccess: true,
        reason: 'active_subscription',
        message: "Admin has active subscription"
      });
    }

    // Check trial status
    const trialStatus = await checkTrialStatus(adminId);

    if (trialStatus.isTrialActive) {
      return res.json({
        success: true,
        hasAccess: true,
        reason: 'active_trial',
        message: `Trial active: ${trialStatus.daysRemaining} days remaining`,
        daysRemaining: trialStatus.daysRemaining,
        daysUsed: trialStatus.daysUsed
      });
    }

    if (trialStatus.isTrialExpired) {
      return res.json({
        success: true,
        hasAccess: false,
        reason: 'trial_expired',
        message: "Trial period has expired. Please subscribe to continue.",
        trialEndDate: trialStatus.trialEndDate
      });
    }

    // No trial and no subscription
    return res.json({
      success: true,
      hasAccess: false,
      reason: 'no_trial_no_subscription',
      message: "No active trial or subscription found"
    });
  } catch (error) {
    console.error('Error checking access:', error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

