import ActivityLog from "../models/activitylogModel.js";
import mongoose from "mongoose";

export const getNotificationsByDriver = async (req, res) => {
  let driverId = null;
  let driverObjectId = null;
  
  try {
    // Ensure user is authenticated (should be set by driverAuth middleware)
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "Unauthorized. Please login again." });
    }

    driverId = req.user._id;
    const { page = 1 } = req.query; // default page = 1
    const limit = 10;
    const skip = (page - 1) * limit;

    // Convert driverId to ObjectId if it's a string
    driverObjectId = typeof driverId === 'string' 
      ? new mongoose.Types.ObjectId(driverId) 
      : driverId;

    console.log('Fetching notifications for driver:', driverObjectId.toString());

    // Don't populate "performedBy" if it references "admin" model that doesn't exist
    // Just fetch notifications without populate for now
    const notifications = await ActivityLog.find({ driver: driverObjectId })
      .sort({ createdAt: -1 }) // newest first
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean() to get plain JS objects

    const total = await ActivityLog.countDocuments({ driver: driverObjectId });

    return res.status(200).json({
      success: true,
      data:{
        page: Number(page),
        totalPages: Math.ceil(total / limit),
        count: notifications.length,
        notifications:notifications
      }
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      driverId: driverId?.toString() || driverObjectId?.toString() || 'unknown',
      errorName: error.name
    });
    return res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: error.message || "Unknown error"
    });
  }
};
