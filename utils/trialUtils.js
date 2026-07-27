import { User } from "../models/driver/userModel.js";
import { Subscription } from "../models/subscriptionModel.js";
import { sendTrialStartEmail, sendTrialExpiredEmail } from "../services/emailService.js";

/**
 * Start 7-day free trial for an admin user
 * @param {String} adminId - Admin user ID
 * @returns {Promise<Object>} Trial information
 */
export const startTrial = async (adminId) => {
  try {
    const admin = await User.findById(adminId);
    if (!admin) {
      return { success: false, message: 'Admin not found' };
    }

    // Only start trial for admin role (not superadmin)
    if (admin.role !== 'admin') {
      return { success: false, message: 'Trial is only available for admin users' };
    }

    // Check if trial already started
    if (admin.trialStartDate) {
      return { 
        success: true, 
        message: 'Trial already started',
        trialStartDate: admin.trialStartDate,
        trialEndDate: admin.trialEndDate
      };
    }

    // Check if admin already has an active subscription
    const activeSubscription = await Subscription.findOne({
      admin: adminId,
      status: 'active'
    });

    if (activeSubscription) {
      return { 
        success: false, 
        message: 'Admin already has an active subscription' 
      };
    }

    // Start trial: 7 days from now
    // Set start date to beginning of today
    const trialStartDate = new Date();
    trialStartDate.setHours(0, 0, 0, 0);
    
    // Set end date to end of day, 7 days from now
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);
    trialEndDate.setHours(23, 59, 59, 999);

    // Update admin with trial dates
    admin.trialStartDate = trialStartDate;
    admin.trialEndDate = trialEndDate;
    admin.trialEmailSent = false;
    admin.trialExpiredEmailSent = false;
    await admin.save();

    // Send trial start email (async, don't wait)
    sendTrialStartEmail({
      adminEmail: admin.email,
      adminName: admin.name || 'Admin',
      trialStartDate: trialStartDate,
      trialEndDate: trialEndDate
    }).then(result => {
      if (result.success) {
        // Mark email as sent
        admin.trialEmailSent = true;
        admin.save();
      }
    }).catch(err => {
      console.error('Error sending trial start email:', err);
    });

    console.log(`✅ Trial started for admin ${adminId}: ${trialStartDate} to ${trialEndDate}`);

    return {
      success: true,
      message: 'Trial started successfully',
      trialStartDate: trialStartDate,
      trialEndDate: trialEndDate
    };
  } catch (error) {
    console.error('Error starting trial:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Check if trial is expired for an admin
 * @param {String} adminId - Admin user ID
 * @returns {Promise<Object>} Trial status
 */
export const checkTrialStatus = async (adminId) => {
  try {
    const admin = await User.findById(adminId);
    if (!admin) {
      return { success: false, message: 'Admin not found' };
    }

    // Check if admin has active subscription (trial not needed)
    // Also allow pending subscriptions with paid payment status
    // In development, also allow pending subscriptions
    const subscriptionQuery = {
      admin: adminId,
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
      return {
        success: true,
        hasActiveSubscription: true,
        isTrialActive: false,
        message: activeSubscription.status === 'active' 
          ? 'Admin has active subscription'
          : 'Admin has subscription (pending activation)'
      };
    }

    // Check if trial exists
    if (!admin.trialStartDate || !admin.trialEndDate) {
      return {
        success: true,
        hasActiveSubscription: false,
        isTrialActive: false,
        hasTrial: false,
        message: 'No trial period found'
      };
    }

    const now = new Date();
    const trialEndDate = new Date(admin.trialEndDate);
    const trialStartDate = new Date(admin.trialStartDate);

    // Normalize dates to compare at day level using UTC (ignore time component)
    // This ensures the trial is valid for the entire end date and handles timezone issues
    // Use UTC to match how MongoDB stores dates
    const nowUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const trialEndDateUTC = new Date(Date.UTC(trialEndDate.getUTCFullYear(), trialEndDate.getUTCMonth(), trialEndDate.getUTCDate()));
    const trialStartDateUTC = new Date(Date.UTC(trialStartDate.getUTCFullYear(), trialStartDate.getUTCMonth(), trialStartDate.getUTCDate()));

    // Calculate days used and remaining (using UTC date-only comparison)
    const daysUsed = Math.ceil((nowUTC - trialStartDateUTC) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.ceil((trialEndDateUTC - nowUTC) / (1000 * 60 * 60 * 24));

    // Check if trial is expired - compare UTC dates only (trial valid until end of end date)
    // Trial expires at the END of the trial end date, not at the start
    // If today is the end date or before, trial is active. If today is after end date, trial is expired.
    const isExpired = nowUTC > trialEndDateUTC;
    const isActive = !isExpired && admin.trialStartDate;

    // Log only if trial is expired (for debugging)
    if (isExpired) {
      console.log('⚠️ Trial expired:', {
        adminId: adminId.toString(),
        trialEndDate: trialEndDate.toISOString(),
        today: now.toISOString(),
        daysExpired: Math.abs(daysRemaining)
      });
    }

    // Send expired email if trial just expired (only once)
    if (isExpired && !admin.trialExpiredEmailSent) {
      sendTrialExpiredEmail({
        adminEmail: admin.email,
        adminName: admin.name || 'Admin',
        trialEndDate: trialEndDate
      }).then(result => {
        if (result.success) {
          admin.trialExpiredEmailSent = true;
          admin.save();
        }
      }).catch(err => {
        console.error('Error sending trial expired email:', err);
      });
    }

    return {
      success: true,
      hasActiveSubscription: false,
      isTrialActive: isActive,
      isTrialExpired: isExpired,
      hasTrial: true,
      trialStartDate: admin.trialStartDate,
      trialEndDate: admin.trialEndDate,
      daysUsed: Math.max(0, daysUsed),
      daysRemaining: Math.max(0, daysRemaining),
      message: isExpired 
        ? 'Trial period has expired' 
        : `Trial active: ${daysRemaining} days remaining`
    };
  } catch (error) {
    console.error('Error checking trial status:', error);
    // Return a structure that can be safely checked by callers
    return { 
      success: false, 
      message: error.message,
      hasActiveSubscription: false,
      isTrialActive: false,
      isTrialExpired: false,
      hasTrial: false
    };
  }
};

/**
 * Get trial information for display
 * @param {String} adminId - Admin user ID
 * @returns {Promise<Object>} Trial information
 */
export const getTrialInfo = async (adminId) => {
  try {
    const status = await checkTrialStatus(adminId);
    return status;
  } catch (error) {
    console.error('Error getting trial info:', error);
    return { success: false, message: error.message };
  }
};

