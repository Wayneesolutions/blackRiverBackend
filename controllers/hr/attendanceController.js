import { Attendance } from "../../models/hr/attendanceModel.js";
import { User } from "../../models/driver/userModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { UserSession } from "../../models/hr/userSessionModel.js";
import { closeDayBoundarySession, shouldAutoTrackLogin } from "../../services/attendanceTrackingService.js";

const toStartOfDay = (d) => new Date(new Date(d).setHours(0,0,0,0));

export const listAttendance = async (req, res) => {
  try {
    const { month, year, date, employee, includeActiveSessions = true } = req.query;
    const companyId = getUserCompanyId(req.user);
    
    if (!companyId && req.user?.role !== 'superadmin') {
      return res.json({ success: true, data: [], message: "No company assigned" });
    }
    
    const filter = companyId ? { company: companyId } : {};
    
    if (employee) {
      filter.employee = employee;
    }
    
    // Filter by specific date (YYYY-MM-DD format)
    if (date) {
      const dateObj = new Date(date);
      dateObj.setHours(0, 0, 0, 0);
      const endDate = new Date(dateObj);
      endDate.setHours(23, 59, 59, 999);
      filter.date = { $gte: dateObj, $lte: endDate };
    } else if (month && year) {
      // Filter by month and year
      const start = new Date(Number(year), Number(month) - 1, 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }
    
    const trackedRoles = [
      'hr', 'dispatcher', 'Fleet Maintenance Manager', 'safety officer', 'Compliance Manager',
      'accountant', 'Maintenance Crew (Mechanics)'
    ];
    
    const data = await Attendance.find(filter)
      .populate({
        path: "employee",
        select: "name email role internalId",
        match: { role: { $in: trackedRoles } } // Only include employees with tracked roles
      })
      .sort({ date: -1, createdAt: -1 })
      .lean();
    
    // Filter out records where employee is null (due to role filter)
    const filteredData = data.filter(record => record.employee !== null);
    
    // Format the data to ensure consistent structure
    const formattedData = filteredData.map(record => ({
      _id: record._id,
      employee: record.employee || null,
      date: record.date,
      checkIn: record.checkIn || null,
      checkOut: record.checkOut || null,
      status: record.status || 'present',
      totalHours: record.totalHours || 0,
      notes: record.notes || null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      isAutoTracked: record.isAutoTracked || false,
      isActiveSession: false
    }));
    
    // If requested, also include active sessions (currently logged in users)
    if (includeActiveSessions === 'true' || includeActiveSessions === true) {
      try {
        const { UserSession } = await import("../../models/hr/userSessionModel.js");
        
        // Get today's date for filtering active sessions
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Find active sessions for today
        const sessionFilter = {
          isActive: true,
          loginTime: { $gte: today }
        };
        
        if (companyId) {
          sessionFilter.company = companyId;
        }
        
        const activeSessions = await UserSession.find(sessionFilter)
          .populate({
            path: "user",
            select: "name email role internalId",
            match: { role: { $in: trackedRoles } }
          })
          .lean();
        
        // Convert active sessions to attendance-like format
        activeSessions.forEach(session => {
          if (session.user) {
            const loginTime = new Date(session.loginTime);
            const now = new Date();
            const elapsedMinutes = (now - loginTime) / (1000 * 60);
            const elapsedHours = elapsedMinutes / 60;
            
            // Check if there's already an attendance record for this user today
            const existingRecord = formattedData.find(
              record => record.employee._id.toString() === session.user._id.toString() &&
              new Date(record.date).toDateString() === today.toDateString()
            );
            
            if (!existingRecord) {
              // Add active session as a temporary attendance record
              formattedData.unshift({
                _id: `session-${session._id}`,
                employee: session.user,
                date: today,
                checkIn: loginTime.toTimeString().slice(0, 5),
                checkOut: null, // Still active
                status: 'present',
                totalHours: elapsedHours,
                notes: 'Currently logged in',
                createdAt: session.createdAt,
                updatedAt: session.lastActivityTime,
                isAutoTracked: true,
                isActiveSession: true // Mark as active session
              });
            }
          }
        });
      } catch (sessionError) {
        console.error('Error fetching active sessions:', sessionError);
        // Don't fail the entire request if active sessions can't be fetched
      }
    }
    
    res.json({ success: true, data: formattedData, count: formattedData.length });
  } catch (e) {
    console.error("Error in listAttendance:", e);
    res.status(500).json({ success: false, message: e.message || "Failed to fetch attendance records" });
  }
};

export const upsertAttendance = async (req, res) => {
  try {
    const { employee, date, checkIn, checkOut, status = "present", notes } = req.body;
    
    if (!employee || !date) {
      return res.status(400).json({ success: false, message: "Employee and date are required" });
    }
    
    const emp = await User.findById(employee);
    if (!emp) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    
    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: "No company assigned" });
    }
    
    // Handle date parsing - can be ISO string (YYYY-MM-DD) or Date object
    let dateObj;
    if (typeof date === 'string') {
      // Parse ISO date string (YYYY-MM-DD) and set to start of day
      dateObj = new Date(date);
      dateObj.setHours(0, 0, 0, 0);
    } else {
      dateObj = toStartOfDay(date || new Date());
    }
    
    let totalHours = 0;
    if (checkIn && checkOut && status !== 'absent' && status !== 'leave') {
      try {
        const [ih, im] = checkIn.split(":").map(Number);
        const [oh, om] = checkOut.split(":").map(Number);
        if (!isNaN(ih) && !isNaN(im) && !isNaN(oh) && !isNaN(om)) {
          totalHours = Math.max(0, ((oh * 60 + om) - (ih * 60 + im)) / 60);
        }
      } catch (timeError) {
        console.error("Error calculating hours:", timeError);
        totalHours = 0;
      }
    }
    
    // Normalize date to start of day for consistent comparison
    // Use date range to find existing records regardless of time component
    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateObj);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Check if record already exists for this employee and date (regardless of time)
    const existingFilter = companyId 
      ? { company: companyId, employee, date: { $gte: startOfDay, $lte: endOfDay } }
      : { employee, date: { $gte: startOfDay, $lte: endOfDay } };
    
    const existingRecord = await Attendance.findOne(existingFilter);
    
    const updateData = {
      employee,
      date: startOfDay, // Always use start of day for consistency
      checkIn: (status === 'absent' || status === 'leave') ? null : (checkIn || null),
      checkOut: (status === 'absent' || status === 'leave') ? null : (checkOut || null),
      status,
      totalHours,
      notes: notes || null,
      company: companyId || emp.company || null,
      isAutoTracked: false // Manual entries are not auto-tracked
    };
    
    let updated;
    if (existingRecord) {
      // Update existing record
      updated = await Attendance.findByIdAndUpdate(
        existingRecord._id,
        updateData,
        { new: true }
      ).populate("employee", "name email role");
      console.log(`✅ Updated existing attendance record for employee ${employee} on ${startOfDay.toISOString().split('T')[0]}`);
    } else {
      // Create new record
      updated = await Attendance.create(updateData);
      await updated.populate("employee", "name email role");
      console.log(`✅ Created new attendance record for employee ${employee} on ${startOfDay.toISOString().split('T')[0]}`);
    }
    
    res.json({ success: true, message: "Attendance record saved successfully", data: updated });
  } catch (e) {
    console.error("Error in upsertAttendance:", e);
    res.status(500).json({ success: false, message: e.message || "Failed to save attendance record" });
  }
};

export const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ success: false, message: "Attendance record ID is required" });
    }
    
    const companyId = getUserCompanyId(req.user);
    const filter = companyId ? { _id: id, company: companyId } : { _id: id };
    
    const deleted = await Attendance.findOneAndDelete(filter);
    
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Attendance record not found" });
    }
    
    res.json({ success: true, message: "Attendance record deleted successfully" });
  } catch (e) {
    console.error("Error in deleteAttendance:", e);
    res.status(500).json({ success: false, message: e.message || "Failed to delete attendance record" });
  }
};

// POST /attendance/break/start — marks break start on current active session
export const startBreak = async (req, res) => {
  try {
    const userId = req.user.id;
    const session = await UserSession.findOne({ user: userId, isActive: true }).sort({ loginTime: -1 });
    if (!session) return res.status(404).json({ success: false, message: 'No active session' });
    // Don't start a new break if one is already open
    const openBreak = session.breaks?.find(b => b.start && !b.end);
    if (openBreak) return res.status(400).json({ success: false, message: 'Break already in progress' });
    session.breaks = [...(session.breaks || []), { start: new Date() }];
    await session.save();
    res.json({ success: true, message: 'Break started', breakStart: session.breaks[session.breaks.length - 1].start });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /attendance/break/end — ends the current open break
export const endBreak = async (req, res) => {
  try {
    const userId = req.user.id;
    const session = await UserSession.findOne({ user: userId, isActive: true }).sort({ loginTime: -1 });
    if (!session) return res.status(404).json({ success: false, message: 'No active session' });
    const openBreakIdx = session.breaks?.findIndex(b => b.start && !b.end);
    if (openBreakIdx === undefined || openBreakIdx < 0) return res.status(400).json({ success: false, message: 'No break in progress' });
    session.breaks[openBreakIdx].end = new Date();
    session.markModified('breaks');
    await session.save();
    const duration = Math.round((session.breaks[openBreakIdx].end - session.breaks[openBreakIdx].start) / 60000);
    res.json({ success: true, message: 'Break ended', durationMinutes: duration });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /attendance/session/start — manually starts a work session (for manual-start roles)
export const startSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const existing = await UserSession.findOne({ user: userId, isActive: true });
    if (existing) return res.status(400).json({ success: false, message: 'Work session already active' });

    const companyId = getUserCompanyId(req.user);
    const user = await User.findById(userId).lean();
    const now = new Date();

    const session = await UserSession.create({
      user: userId,
      company: companyId || user?.company || null,
      loginTime: now,
      lastActivityTime: now,
      isActive: true,
    });

    res.json({ success: true, message: 'Work session started', data: { loginTime: session.loginTime } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /attendance/session/current — returns current session info with break status
export const getCurrentSession = async (req, res) => {
  try {
    const userId = req.user.id;
    let session = await UserSession.findOne({ user: userId, isActive: true }).sort({ loginTime: -1 }).lean();
    if (!session) return res.json({ success: true, data: null });

    // Check if this session belongs to a previous calendar day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sessionDay = new Date(session.loginTime);
    sessionDay.setHours(0, 0, 0, 0);

    if (sessionDay < today) {
      // Close yesterday's session and create its attendance record
      await closeDayBoundarySession(session);

      // For auto-tracked roles, start a fresh session for today
      const user = await User.findById(userId).lean();
      if (user && shouldAutoTrackLogin(user.role)) {
        const companyId = getUserCompanyId(req.user);
        const now = new Date();
        const newSession = await UserSession.create({
          user: userId,
          company: companyId || user.company || null,
          loginTime: now,
          lastActivityTime: now,
          isActive: true,
        });
        return res.json({
          success: true,
          data: {
            loginTime: newSession.loginTime,
            onBreak: false,
            totalBreakMinutes: 0,
            workMinutes: 0,
            currentBreakStart: null
          }
        });
      }

      // Manual-tracked roles must start their own session each day
      return res.json({ success: true, data: null });
    }

    // Session is from today — return live data as before
    const now = new Date();
    const totalBreakMs = (session.breaks || []).reduce((sum, b) => {
      const end = b.end || (b.start ? now : null);
      return sum + (b.start && end ? end - b.start : 0);
    }, 0);
    const onBreak = !!(session.breaks || []).find(b => b.start && !b.end);
    const workMs = now - session.loginTime - totalBreakMs;
    res.json({
      success: true,
      data: {
        loginTime: session.loginTime,
        onBreak,
        totalBreakMinutes: Math.round(totalBreakMs / 60000),
        workMinutes: Math.max(0, Math.round(workMs / 60000)),
        currentBreakStart: onBreak ? session.breaks.find(b => b.start && !b.end)?.start : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


