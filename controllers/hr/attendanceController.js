import { Attendance } from "../../models/hr/attendanceModel.js";
import { User } from "../../models/driver/userModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

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
    
    // Filter by tracked roles only (hr, dispatcher, Fleet Maintenance Manager, safety officer, Compliance Manager)
    const trackedRoles = ['hr', 'dispatcher', 'Fleet Maintenance Manager', 'safety officer', 'Compliance Manager'];
    
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


