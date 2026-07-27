import Fleet from "../models/driver/fleetModel.js";
import { getUserCompanyId } from "../utils/companyFilter.js";


// Search fleet by name
export const searchFleetByName = async (req, res) => {
  try {
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");
    
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({ success: false, message: "Name query is required" });
    }

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.status(200).json({ success: true, message: "No company assigned to the current admin.", data: [] });
    }
    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    
    // Get combined filter (company + trial data filter)
    const baseFilter = await getCombinedFilter(req.user, companyFilter);
    
    // Build query
    const query = {
      name: { $regex: name, $options: "i" } // case-insensitive search
    };
    if (baseFilter) {
      Object.assign(query, baseFilter);
    }

    const fleets = await Fleet.find(query);

    return res.status(200).json({ success: true, count: fleets.length, data: fleets });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


// Create Fleet
export const createFleet = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating fleets. Go to Company Settings to set up your company."
        });
      }
    }
    
    const companyId = getUserCompanyId(req.user);
    const fleet = new Fleet({
      ...req.body,
      ...(companyId && { company: companyId })
    });
    await fleet.save();
    return res.status(201).json({message:"Fleet created", success: true, data: fleet });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update Fleet (only fields provided in body will be updated)
export const updateFleet = async (req, res) => {
  try {
    const { id } = req.params;
    const fleet = await Fleet.findById(id);

    if (!fleet) {
      return res.status(404).json({ success: false, message: "Fleet not found" });
    }

    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned to the current admin."
        });
      }

      if (fleet.company && fleet.company.toString() !== companyId) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to modify this fleet."
        });
      }
    }

    const updatedFleet = await Fleet.findByIdAndUpdate(id, req.body, { new: true });

    return res.status(200).json({ success: true, data: updatedFleet });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete Fleet
export const deleteFleet = async (req, res) => {
  try {
    const { id } = req.params;
    const fleet = await Fleet.findById(id);

    if (!fleet) {
      return res.status(404).json({ success: false, message: "Fleet not found" });
    }

    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned to the current admin."
        });
      }

      if (fleet.company && fleet.company.toString() !== companyId) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to delete this fleet."
        });
      }
    }

    await Fleet.findByIdAndDelete(id);

    return res.status(200).json({ success: true, message: "Fleet deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Change Status (active <-> inactive)
export const toggleFleetStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const fleet = await Fleet.findById(id);

    if (!fleet) {
      return res.status(404).json({ success: false, message: "Fleet not found" });
    }

    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned to the current admin."
        });
      }

      if (fleet.company && fleet.company.toString() !== companyId) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to modify this fleet."
        });
      }
    }

    fleet.status = fleet.status === "active" ? "inactive" : "active";
    await fleet.save();

    return res.status(200).json({ success: true, data: fleet });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// (Optional) Get all fleets
export const getFleets = async (req, res) => {
  try {
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");
    
    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.status(200).json({ success: true, message: "No company assigned to the current admin.", data: [] });
    }
    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    
    // Get combined filter (company + trial data filter)
    const baseFilter = await getCombinedFilter(req.user, companyFilter);
    
    // Build query
    const query = {};
    if (baseFilter) {
      Object.assign(query, baseFilter);
    }
    
    const fleets = await Fleet.find(query);
    return res.status(200).json({ success: true, data: fleets });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
