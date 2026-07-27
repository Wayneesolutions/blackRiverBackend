import { fetchAndSaveDriverHOS } from "../../services/geotab.js";
import HOSLog from "../../models/driver/hosManagement.js";

// Single driver HOS (save & return)
export const saveAndGetDriverHOS = async (req, res) => {
  try {
    const { driverId, vehicleId } = req.params;
    const savedLog = await fetchAndSaveDriverHOS(driverId, vehicleId);
    res.json({ success: true, data: savedLog });
  } catch (err) {
    res.status(500).json({success:false, message: err.message });
  }
};

// All drivers HOS (for compliance/admin view)
export const getAllDriverHOSFromDB = async (req, res) => {
  try {
    const logs = await HOSLog.find().populate("driverId", "name email").populate("vehicleId", "plateNumber");
    res.json({ success: true, data:logs });
  } catch (err) {
    res.status(500).json({success:false, message: err.message });
  }
};
