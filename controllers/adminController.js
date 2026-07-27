import jwt from "jsonwebtoken";
import Admin from "../models/adminModel.js";
import { comparePassword } from "../services/bcrypt.js"; // adjust path
import { User } from "../models/driver/userModel.js";
import Load from "../models/loadModel.js";
import DriverActivity from "../models/driver/driverActivityModel.js";
import { checkTrialStatus } from "../utils/trialUtils.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

const getCompanyContext = (req) => {
  const role = req.user?.role;
  const companyId = getUserCompanyId(req.user);

  return {
    isSuperadmin: role === 'superadmin',
    companyId
  };
};

// Admin Login
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Check if admin exists
    const admin = await User.findOne({ email });
    if (!admin) {
      return res.status(400).json({ success: false, message: "Invalid email or password" });
    }

    // 2. Check if user is active (must be before password validation)
    if (admin.status !== 'active') {
      console.log('❌ Login attempt blocked - inactive account:', {
        userId: admin._id,
        email: admin.email,
        status: admin.status,
        role: admin.role
      });
      return res.status(403).json({
        success: false,
        message: "Your account is not active. Please contact administrator."
      });
    }

    // 3. Compare password
    const isMatch = await comparePassword(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid email or password" });
    }

    // 4. Check admin subscription/trial access (block login if expired)
    if (admin.role === 'admin') {
      const { checkUserAccess } = await import("../utils/adminAccessUtils.js");
      const accessCheck = await checkUserAccess(admin._id);
      req.subscriptionAccess = accessCheck;
      const subscriptionStatus = {
        accessLevel: accessCheck.accessLevel || (accessCheck.hasAccess ? 'full' : 'none'),
        reason: accessCheck.reason,
        message: accessCheck.message
      };

      if (!accessCheck.hasAccess && accessCheck.accessLevel !== 'limited') {
        console.log('❌ Admin login blocked - subscription/trial issue:', {
          userId: admin._id,
          email: admin.email,
          reason: accessCheck.reason,
          message: accessCheck.message
        });
        return res.status(403).json({
          success: false,
          message: accessCheck.message || "Your trial has expired. Please subscribe to continue."
        });
      }

      // Check trial status (async, don't block login, just for email notifications)
      try {
        await checkTrialStatus(admin._id);
      } catch (trialError) {
        console.error('Error checking trial status on login:', trialError);
        // Don't block login if trial check fails
      }

      req.subscriptionStatus = subscriptionStatus;
    }

    // 5. Create JWT
    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    // 6. Record login for attendance tracking (if applicable)
    try {
      const { recordLogin } = await import("../services/attendanceTrackingService.js");
      const companyId = admin.company ? admin.company.toString() : null;
      await recordLogin(admin._id, companyId);
    } catch (attendanceError) {
      console.error('Error recording login for attendance:', attendanceError);
      // Don't fail login if attendance tracking fails
    }

    // 7. Send response
    res.json({
      success: true,
      message: "Login successful",
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
        token: token,
        subscriptionStatus: req.subscriptionStatus || null
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Driver Dashboard Statistics
export const getDriverStats = async (req, res) => {
  try {
    const { isSuperadmin, companyId } = getCompanyContext(req);

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: {
          totalDrivers: 0,
          activeDrivers: 0,
          totalDriversChange: 0,
          activeDriversChange: 0
        }
      });
    }

    const baseFilter = {
      role: 'driver',
      ...(isSuperadmin ? {} : { company: companyId })
    };

    const activeFilter = {
      ...baseFilter,
      status: 'active'
    };

    const totalDrivers = await User.countDocuments(baseFilter);
    const activeDrivers = await User.countDocuments(activeFilter);

    // Get drivers from last month for comparison
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const totalDriversLastMonth = await User.countDocuments({
      ...baseFilter,
      createdAt: { $lt: lastMonth }
    });

    const activeDriversLastMonth = await User.countDocuments({
      ...activeFilter,
      updatedAt: { $lt: lastMonth }
    });

    // Calculate percentage changes
    const totalDriversChange = totalDriversLastMonth > 0
      ? ((totalDrivers - totalDriversLastMonth) / totalDriversLastMonth) * 100
      : 0;

    const activeDriversChange = activeDriversLastMonth > 0
      ? ((activeDrivers - activeDriversLastMonth) / activeDriversLastMonth) * 100
      : 0;

    res.json({
      success: true,
      data: {
        totalDrivers,
        activeDrivers,
        totalDriversChange: Number(totalDriversChange.toFixed(1)),
        activeDriversChange: Number(activeDriversChange.toFixed(1))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching driver stats", error: error.message });
  }
};

// Load Statistics
export const getLoadStats = async (req, res) => {
  try {
    const { isSuperadmin, companyId } = getCompanyContext(req);

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: {
          totalLoads: 0,
          totalLoadsChange: 0
        }
      });
    }

    const loadFilter = isSuperadmin ? {} : { company: companyId };

    const totalLoads = await Load.countDocuments(loadFilter);

    // Get loads from last month for comparison
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const totalLoadsLastMonth = await Load.countDocuments({
      ...loadFilter,
      createdAt: { $lt: lastMonth }
    });

    // Calculate percentage change
    const totalLoadsChange = totalLoadsLastMonth > 0
      ? ((totalLoads - totalLoadsLastMonth) / totalLoadsLastMonth) * 100
      : 0;

    res.json({
      success: true,
      data: {
        totalLoads,
        totalLoadsChange: Number(totalLoadsChange.toFixed(1))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching load stats", error: error.message });
  }
};

// Safety Score Statistics
export const getSafetyStats = async (req, res) => {
  try {
    const { isSuperadmin, companyId } = getCompanyContext(req);

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: {
          avgSafetyScore: 0,
          safetyScoreChange: 0
        }
      });
    }

    // Calculate average safety score (mock data for now)
    // TODO: Replace with company-specific metrics when available
    const avgSafetyScore = 91.2;
    const lastMonthScore = 89.1;
    const safetyScoreChange = ((avgSafetyScore - lastMonthScore) / lastMonthScore * 100).toFixed(1);

    res.json({
      success: true,
      data: {
        avgSafetyScore,
        safetyScoreChange: parseFloat(safetyScoreChange)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching safety stats", error: error.message });
  }
};

// Recent Driver Activities
export const getRecentDriverActivities = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const { isSuperadmin, companyId } = getCompanyContext(req);

    if (!isSuperadmin && !companyId) {
      return res.json({ success: true, message: "No company assigned to the current admin.", data: [] });
    }

    let query = {};

    if (!isSuperadmin) {
      const driverIds = await User.find({ role: 'driver', company: companyId }).distinct('_id');

      if (!driverIds.length) {
        return res.json({ success: true, data: [] });
      }

      query = { driver: { $in: driverIds } };
    }

    const activities = await DriverActivity.find(query)
      .populate('driver', 'name email internalId')
      .populate('load', 'details.internalId')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit, 10));

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching recent activities", error: error.message });
  }
};

