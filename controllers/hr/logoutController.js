import { recordLogout } from "../../services/attendanceTrackingService.js";

/**
 * Handle user logout and record attendance
 */
export const handleLogout = async (req, res) => {
  try {
    const userId = req.user?._id;
    
    console.log('🚪 Logout requested for user:', userId);
    
    if (!userId) {
      console.log('⚠️ No userId found in logout request');
      return res.json({ success: true, message: "Logged out successfully" });
    }

    // Record logout for attendance tracking
    try {
      console.log('📝 Recording logout for attendance tracking...');
      await recordLogout(userId, false); // false = manual logout, not auto
      console.log('✅ Logout recorded successfully');
    } catch (attendanceError) {
      console.error('❌ Error recording logout for attendance:', attendanceError);
      // Don't fail logout if attendance tracking fails
    }

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error('❌ Error in logout handler:', error);
    res.json({ success: true, message: "Logged out successfully" }); // Always succeed logout
  }
};

/**
 * Handle auto logout due to inactivity
 */
export const handleAutoLogout = async (req, res) => {
  try {
    const userId = req.user?._id;
    
    if (!userId) {
      return res.json({ success: true, message: "Auto logged out due to inactivity" });
    }

    // Record logout for attendance tracking (marked as auto)
    try {
      await recordLogout(userId, true); // true = auto logout
    } catch (attendanceError) {
      console.error('Error recording auto logout for attendance:', attendanceError);
      // Don't fail logout if attendance tracking fails
    }

    res.json({ success: true, message: "Auto logged out due to inactivity" });
  } catch (error) {
    console.error('Error in auto logout handler:', error);
    res.json({ success: true, message: "Auto logged out due to inactivity" }); // Always succeed logout
  }
};

