import jwt from "jsonwebtoken";
import { User } from "../models/driver/userModel.js";

export const driverAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    // ✅ verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ find driver
    const driver = await User.findById(decoded.id).select("-password");
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    // ✅ Check if driver is active
    if (driver.status !== 'active') {
      console.error('❌ Driver account is inactive:', {
        userId: driver._id,
        email: driver.email,
        status: driver.status,
        role: driver.role
      });
      return res.status(403).json({ 
        success: false, 
        message: "Your account is not active. Please contact administrator." 
      });
    }

    // Check admin subscription/trial access (block access if expired)
    const { checkUserAccess } = await import("../utils/adminAccessUtils.js");
    const accessCheck = await checkUserAccess(driver._id);
    req.subscriptionAccess = accessCheck;

    if (!accessCheck.hasAccess) {
      const readOnlyMethods = ['GET', 'HEAD', 'OPTIONS'];
      const allowLimited = accessCheck.accessLevel === 'limited' && readOnlyMethods.includes(req.method);

      if (!allowLimited) {
        console.error('❌ Driver API access blocked - admin subscription/trial issue:', {
          userId: driver._id,
          email: driver.email,
          role: driver.role,
          reason: accessCheck.reason,
          message: accessCheck.message,
          method: req.method,
          path: `${req.baseUrl || ''}${req.path || ''}`
        });
        return res.status(403).json({ 
          success: false, 
          message: accessCheck.message || "Access denied. Admin trial/subscription expired. Please contact administrator."
        });
      }

      req.limitedSubscriptionAccess = true;
    }

    req.user = driver; // attach driver to request (for compatibility)
    req.driver = driver; // attach driver to request (for load controllers)
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
};
