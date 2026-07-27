// middleware/auth.ts
import jwt from "jsonwebtoken";
import { User } from "../models/driver/userModel.js";
import { isMongoConnected, waitForMongoConnection } from "../config/mongoConnection.js";
console.log(process.env.JWT_SECRET);

const isLimitedAccessAllowed = (req) => {
  const readOnlyMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (readOnlyMethods.includes(req.method)) {
    return true;
  }

  const fullPath = `${req.baseUrl || ''}${req.path || ''}`.toLowerCase();
  const subscriptionPaths = ['/subscription', '/plan', '/trial'];

  return subscriptionPaths.some((segment) => fullPath.includes(segment));
};

export const authMiddleware =async (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({success:false, message: "No token provided" });
  
   
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET );
    
    // Ensure MongoDB is connected before querying
    if (!isMongoConnected()) {
      console.warn('⚠️ MongoDB not connected, waiting for connection...');
      await waitForMongoConnection(5000); // Wait max 5 seconds for auth requests
    }
    
    const user = await User.findOne({_id:decoded.id})
      .populate('company', '_id') // Populate company field to ensure it's available
    
    if (!user) {
      console.error('❌ User not found for ID:', decoded.id);
      return res.status(404).json({success:false, message: "User not found" });
    }
    
    // Check if user is active
    if (user.status !== 'active') {
      console.error('❌ User account is inactive:', {
        userId: user._id,
        email: user.email,
        status: user.status,
        role: user.role
      });
      return res.status(403).json({ 
        success: false, 
        message: "Your account is not active. Please contact administrator." 
      });
    }

    // Check admin subscription/trial access for all users (except superadmin)
    // This ensures all users depend on admin's subscription/trial status
    if (user.role !== 'superadmin') {
      const { checkUserAccess } = await import("../utils/adminAccessUtils.js");
      const accessCheck = await checkUserAccess(user._id);
      req.subscriptionAccess = accessCheck;

      // Check if trial/subscription is expired
      if (!accessCheck.hasAccess) {
        // Attach trial expired flag to request for response interceptor
        req.trialExpired = accessCheck.reason === 'trial_expired';
        req.subscriptionRequired = accessCheck.reason === 'trial_expired' || accessCheck.reason === 'no_trial_no_subscription';
        req.trialEndDate = accessCheck.trialEndDate || null;
        req.trialExpiredMessage = accessCheck.message || "Your subscription has ended. Purchase to continue use.";
        
        // Block write operations (POST, PUT, DELETE, PATCH) when trial is expired
        const writeMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
        const isWriteOperation = writeMethods.includes(req.method);
        const allowReadOnly = isLimitedAccessAllowed(req);
        
        if (isWriteOperation && !allowReadOnly) {
          console.error('❌ Write operation blocked - trial/subscription expired:', {
            userId: user._id,
            email: user.email,
            role: user.role,
            method: req.method,
            path: `${req.baseUrl || ''}${req.path || ''}`,
            reason: accessCheck.reason
          });
          
          return res.status(403).json({
            success: false,
            message: "You don't have access right now. Your subscription has ended. Please purchase a plan to continue.",
            trialExpired: req.trialExpired,
            subscriptionRequired: req.subscriptionRequired,
            trialEndDate: req.trialEndDate,
            trialExpiredMessage: req.trialExpiredMessage,
            accessDenied: true
          });
        }
        
        // Log for read operations (still allow but show notification)
        console.log('⚠️ Trial expired - allowing read access but showing notification:', {
          userId: user._id,
          email: user.email,
          role: user.role,
          reason: accessCheck.reason,
          method: req.method
        });
      }
    }
    
    // Attach user to request (including role for authorization checks)
    req.user = user;
    // Also attach decoded token info for role comparison
    req.userToken = decoded;
    
    // Attach response interceptor to inject trial expired flag
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      // If trial expired flag exists on request, attach it to response
      if (req.trialExpired !== undefined) {
        if (typeof data === 'object' && data !== null) {
          data.trialExpired = req.trialExpired;
          data.subscriptionRequired = req.subscriptionRequired || false;
          data.trialEndDate = req.trialEndDate || null;
          data.trialExpiredMessage = req.trialExpiredMessage || "Your subscription has ended. Purchase to continue use.";
        }
      }
      return originalJson(data);
    };
    
    // Update activity for attendance tracking (non-blocking)
    try {
      const { updateActivity } = await import("../services/attendanceTrackingService.js");
      updateActivity(user._id).catch(err => {
        // Silently fail - don't block request if activity tracking fails
        console.error('Error updating activity:', err);
      });
    } catch (error) {
      // Silently fail - don't block request
    }
    
    next();
  } catch (err) {
    console.error('❌ Token verification failed:', err.message);
    // Provide more specific error messages
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({success:false, message: "Token has expired. Please login again." });
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({success:false, message: "Invalid token format." });
    }
    return res.status(403).json({success:false, message: "Invalid token" });
  }
};
