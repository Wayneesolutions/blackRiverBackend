import { UserSession } from "../models/hr/userSessionModel.js";
import { Attendance } from "../models/hr/attendanceModel.js";
import { User } from "../models/driver/userModel.js";
import mongoose from "mongoose";

/**
 * Roles that should have automatic attendance tracking
 */
const TRACKED_ROLES = [
  'hr',
  'dispatcher',
  'Fleet Maintenance Manager',
  'safety officer',
  'Compliance Manager'
];

/**
 * Check if a role should be tracked for attendance
 */
export const shouldTrackAttendance = (role) => {
  return TRACKED_ROLES.includes(role);
};

/**
 * Record user login session
 */
export const recordLogin = async (userId, companyId) => {
  try {
    const user = await User.findById(userId);
    if (!user || !shouldTrackAttendance(user.role)) {
      return null; // Don't track for roles that shouldn't be tracked
    }

    // Check if there's an active session (shouldn't happen, but handle it)
    const existingActiveSession = await UserSession.findOne({
      user: userId,
      isActive: true
    });

    if (existingActiveSession) {
      // Close the existing session (shouldn't happen, but handle edge case)
      existingActiveSession.isActive = false;
      existingActiveSession.logoutTime = new Date();
      await existingActiveSession.save();
    }

    // Check for recent logout (within 30 minutes)
    const recentLogout = await UserSession.findOne({
      user: userId,
      isActive: false,
      logoutTime: { $exists: true }
    })
      .sort({ logoutTime: -1 })
      .limit(1);

    const now = new Date();
    let shouldMerge = false;
    let previousSession = null;

    if (recentLogout && recentLogout.logoutTime) {
      const timeSinceLogout = (now - new Date(recentLogout.logoutTime)) / (1000 * 60); // minutes
      
      // If logged out within 30 minutes, merge sessions
      if (timeSinceLogout <= 30) {
        shouldMerge = true;
        previousSession = recentLogout;
      }
    }

    if (shouldMerge && previousSession) {
      // Merge with previous session - reactivate it
      previousSession.isActive = true;
      previousSession.logoutTime = null;
      previousSession.lastActivityTime = now;
      await previousSession.save();
      
      console.log(`✅ Merged login session for user ${userId} (within 30 min window)`);
      return previousSession;
    } else {
      // Create new session
      const newSession = new UserSession({
        user: userId,
        company: companyId || user.company || null,
        loginTime: now,
        lastActivityTime: now,
        isActive: true
      });
      
      await newSession.save();
      console.log(`✅ Recorded login session for user ${userId}`);
      return newSession;
    }
  } catch (error) {
    console.error('Error recording login:', error);
    return null;
  }
};

/**
 * Update last activity time
 */
export const updateActivity = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user || !shouldTrackAttendance(user.role)) {
      return;
    }

    const activeSession = await UserSession.findOne({
      user: userId,
      isActive: true
    });

    if (activeSession) {
      activeSession.lastActivityTime = new Date();
      await activeSession.save();
    }
  } catch (error) {
    console.error('Error updating activity:', error);
  }
};

/**
 * Record user logout and calculate attendance
 */
export const recordLogout = async (userId, autoLoggedOut = false) => {
  try {
    const user = await User.findById(userId);
    if (!user || !shouldTrackAttendance(user.role)) {
      return null;
    }

    const activeSession = await UserSession.findOne({
      user: userId,
      isActive: true
    });

    if (!activeSession) {
      return null; // No active session to close
    }

    const now = new Date();
    const loginTime = new Date(activeSession.loginTime);
    const lastActivityTime = new Date(activeSession.lastActivityTime);
    
    // Calculate total session time in minutes
    const totalSessionMinutes = (now - loginTime) / (1000 * 60);
    
    // Calculate inactive time (periods > 1 hour without activity)
    let inactiveMinutes = 0;
    const inactivityThreshold = 60; // 1 hour in minutes
    
    // If last activity was more than 1 hour ago, count that as inactive
    const timeSinceLastActivity = (now - lastActivityTime) / (1000 * 60);
    if (timeSinceLastActivity > inactivityThreshold) {
      // Count the period beyond 1 hour as inactive
      inactiveMinutes = timeSinceLastActivity - inactivityThreshold;
    }
    
    // Calculate active minutes (excluding inactivity periods > 1 hour)
    // Active time = total time - inactive time (but minimum 0)
    const activeMinutes = Math.max(0, totalSessionMinutes - inactiveMinutes);
    
    console.log('📊 Session calculation:', {
      userId: userId.toString(),
      loginTime: loginTime.toISOString(),
      logoutTime: now.toISOString(),
      totalSessionMinutes: totalSessionMinutes.toFixed(2),
      inactiveMinutes: inactiveMinutes.toFixed(2),
      activeMinutes: activeMinutes.toFixed(2),
      activeHours: (activeMinutes / 60).toFixed(2)
    });
    
    // Update session
    activeSession.isActive = false;
    activeSession.logoutTime = now;
    activeSession.autoLoggedOut = autoLoggedOut;
    activeSession.totalActiveMinutes = activeMinutes;
    await activeSession.save();

    // Create or update attendance record
    const attendanceDate = new Date(loginTime);
    attendanceDate.setHours(0, 0, 0, 0);
    
    const checkInTime = loginTime.toTimeString().slice(0, 5); // HH:mm format
    const checkOutTime = now.toTimeString().slice(0, 5); // HH:mm format
    const totalHours = activeMinutes / 60;

    // Always mark as "present" for auto-tracked attendance from login
    // No need to mark as "late" - all logins are treated as present
    let status = 'present';

    const companyId = activeSession.company || user.company || null;
    
    const attendanceFilter = companyId 
      ? { company: companyId, employee: userId, date: attendanceDate }
      : { employee: userId, date: attendanceDate };

    const attendanceData = {
      employee: userId,
      date: attendanceDate,
      checkIn: checkInTime,
      checkOut: checkOutTime,
      status: status,
      totalHours: totalHours,
      notes: autoLoggedOut ? 'Auto-logged out due to inactivity' : null,
      company: companyId,
      isAutoTracked: true // Mark as auto-tracked
    };

    // Find existing attendance for the day or create new
    const existingAttendance = await Attendance.findOne(attendanceFilter);
    
    console.log('🔍 Existing attendance check:', {
      found: !!existingAttendance,
      existingCheckIn: existingAttendance?.checkIn,
      existingCheckOut: existingAttendance?.checkOut,
      existingTotalHours: existingAttendance?.totalHours,
      newCheckIn: checkInTime,
      newCheckOut: checkOutTime,
      newTotalHours: totalHours
    });
    
    if (existingAttendance) {
      // Check if this session should be merged (within 30 min of previous logout)
      // or added as separate session
      const existingCheckIn = existingAttendance.checkIn ? existingAttendance.checkIn.split(':') : [0, 0];
      const existingCheckOut = existingAttendance.checkOut ? existingAttendance.checkOut.split(':') : [0, 0];
      const newCheckIn = checkInTime.split(':');
      const newCheckOut = checkOutTime.split(':');
      
      const existingCheckInMinutes = parseInt(existingCheckIn[0]) * 60 + parseInt(existingCheckIn[1]);
      const newCheckInMinutes = parseInt(newCheckIn[0]) * 60 + parseInt(newCheckIn[1]);
      const existingCheckOutMinutes = parseInt(existingCheckOut[0]) * 60 + parseInt(existingCheckOut[1]);
      const newCheckOutMinutes = parseInt(newCheckOut[0]) * 60 + parseInt(newCheckOut[1]);
      
      // Calculate time gap between previous logout and this login
      const timeGapMinutes = newCheckInMinutes - existingCheckOutMinutes;
      
      if (timeGapMinutes <= 30 && timeGapMinutes >= 0) {
        // Sessions are within 30 minutes - merge them (continuous work)
        const earliestCheckIn = existingCheckInMinutes < newCheckInMinutes 
          ? existingAttendance.checkIn 
          : checkInTime;
        const latestCheckOut = existingCheckOutMinutes > newCheckOutMinutes 
          ? existingAttendance.checkOut 
          : checkOutTime;
        
        // Calculate total hours from earliest to latest
        const [eh, em] = earliestCheckIn.split(':').map(Number);
        const [lh, lm] = latestCheckOut.split(':').map(Number);
        const mergedTotalHours = Math.max(0, ((lh * 60 + lm) - (eh * 60 + em)) / 60);
        
        existingAttendance.checkIn = earliestCheckIn;
        existingAttendance.checkOut = latestCheckOut;
        existingAttendance.totalHours = mergedTotalHours;
      } else {
        // Sessions are more than 30 minutes apart - add hours (separate work periods)
        const earliestCheckIn = existingCheckInMinutes < newCheckInMinutes 
          ? existingAttendance.checkIn 
          : checkInTime;
        const latestCheckOut = existingCheckOutMinutes > newCheckOutMinutes 
          ? existingAttendance.checkOut 
          : checkOutTime;
        
        // Add the new session hours to existing
        existingAttendance.checkIn = earliestCheckIn;
        existingAttendance.checkOut = latestCheckOut;
        existingAttendance.totalHours = (existingAttendance.totalHours || 0) + totalHours;
      }
      
      // Don't override status if it's manually set to absent or leave
      if (existingAttendance.status !== 'absent' && existingAttendance.status !== 'leave') {
        // Keep the original status determination (based on earliest check-in time, not total hours)
        // Status was already determined by the first session's check-in time
      }
      
      // Mark as auto-tracked if not already manually set
      if (!existingAttendance.isAutoTracked) {
        existingAttendance.isAutoTracked = true;
      }
      
      // Update notes if auto-logged out
      if (autoLoggedOut) {
        const autoNote = 'Auto-logged out due to inactivity';
        if (!existingAttendance.notes) {
          existingAttendance.notes = autoNote;
        } else if (!existingAttendance.notes.includes(autoNote)) {
          existingAttendance.notes = `${existingAttendance.notes}; ${autoNote}`;
        }
      }
      
      await existingAttendance.save();
      console.log(`✅ Updated attendance record for user ${userId} (merged with existing)`);
    } else {
      // Create new attendance record
      const newAttendance = new Attendance(attendanceData);
      await newAttendance.save();
      console.log(`✅ Created attendance record for user ${userId}`);
    }

    return activeSession;
  } catch (error) {
    console.error('Error recording logout:', error);
    return null;
  }
};

/**
 * Get user's active session
 */
export const getActiveSession = async (userId) => {
  try {
    return await UserSession.findOne({
      user: userId,
      isActive: true
    });
  } catch (error) {
    console.error('Error getting active session:', error);
    return null;
  }
};

