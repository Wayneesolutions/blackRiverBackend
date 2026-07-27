// utils/driverActivityLogger.ts
import DriverActivity from "../../models/driver/driverActivityModel.js";
import { User } from "../../models/driver/userModel.js";

export const getDriverActivities = async (req,res) => {
  try {
    const limit = parseInt(req.query?.limit, 10) || 10;

    const role = req.user?.role;
    const companyId = req.user?.company ? req.user.company.toString() : null;
    const isSuperadmin = role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
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
      .populate({
        path: "driver",
        select: "name email internalId"
      })
      .populate({
        path: "load",
        select: "details.internalId"
      })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return res.json({success:true,message:"driver activity",data:activities}); 
  } catch (error) {
    return res.json({success:false,message:error.message,})
  }
};

export const logDriverActivity = async ({ driverId, activityType, location = {}, loadId = null }) => {
  try {
    const activity = await DriverActivity.create({
      driver: driverId,
      activityType,
      location,
      load: loadId
    });
    return activity;
  } catch (error) {
    console.error("Error logging driver activity:", error.message);
    throw error;
  }
};
