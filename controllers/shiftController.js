import { Shift } from "../models/driver/shiftModel.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { User } from "../models/driver/userModel.js";

// ✅ Get all shifts (filter by driver or date if needed, and by company)
export const getShifts = async (req, res) => {
  try {
    const { driverId, startDate, endDate } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // If user has no company, return empty result (shifts are company-based)
    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "all shifts",
        data: []
      });
    }

    let query = {};
    if (driverId) query.driver = driverId;
    if (startDate && endDate) {
      query.shiftDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Filter by company through driver's company field
    if (!isSuperadmin && companyId) {
      // Find all drivers with this company
      const companyDrivers = await User.find({ 
        company: companyId, 
        role: "driver" 
      }).select('_id');
      const driverIds = companyDrivers.map(d => d._id);
      
      if (driverIds.length > 0) {
        // If we have a driverId filter, make sure it's in the company's drivers
        if (driverId) {
          if (!driverIds.some(id => id.toString() === driverId.toString())) {
            // Driver not in company, return empty
            return res.json({
              success: true,
              message: "all shifts",
              data: []
            });
          }
        } else {
          // Filter by company drivers
          query.driver = { $in: driverIds };
        }
      } else {
        // No drivers in company, return empty
        return res.json({
          success: true,
          message: "all shifts",
          data: []
        });
      }
    }

    const shifts = await Shift.find(query)
      .populate("driver", "name email phone")
      .populate("vehicle", "plateNumber make model")
      .populate("load", "details.internalId status route");

    res.json({ success: true, message: "all shifts", data: shifts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Update shift
export const updateShift = async (req, res) => {
  try {
    const { id } = req.params;
    const shift = await Shift.findByIdAndUpdate(id, req.body, { new: true });
    if (!shift) return res.status(404).json({ message: "Shift not found" });
    res.json({succes:true,message:"updated",data: shift});
  } catch (error) {
    res.status(500).json({succes:false,  message: error.message });
  }
};

// ✅ Delete shift
export const deleteShift = async (req, res) => {
  try {
    const { id } = req.params;
    const shift = await Shift.findByIdAndDelete(id);
    if (!shift) return res.status(404).json({succes:false,  message: "Shift not found" });
    res.json({succes:true, message: "Shift deleted successfully" });
  } catch (error) {
    res.status(500).json({succes:false,  message: error.message });
  }
};