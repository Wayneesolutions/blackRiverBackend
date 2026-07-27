import Place from "../models/driver/placeModel.js";
import { getCoordinatesFromAddress } from "../services/googlemap.js";
import { getUserCompanyId } from "../utils/companyFilter.js";

// Create Place
export const createPlace = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating places. Go to Company Settings to set up your company."
        });
      }
    }
    
    const {
      name,
      street1,
      street2,
      neighbourHood,
      building,
      securityAccessCodepostalCode,
      city,
      state,
      country,
      phone,
    } = req.body;

    // Construct full address
    const address = `${street1 || ""} ${street2 || ""} ${neighbourHood || ""} ${
      building || ""
    } ${city || ""} ${state || ""} ${country || ""} ${
      securityAccessCodepostalCode || ""
    }`.trim();

    // Get coordinates from Google Maps
    const { latitude, longitude } = await getCoordinatesFromAddress(address);
    
    const companyId = getUserCompanyId(req.user);

    const place = new Place({
      name,
      street1,
      street2,
      neighbourHood,
      building,
      securityAccessCodepostalCode,
      city,
      state,
      country,
      status:'active',
      phone,
      currentLocation: {
        address,
        latitude,
        longitude,
      },
      ...(companyId && { company: companyId })
    });

    await place.save();

    return res
      .status(201)
      .json({ success: true, message: "Place created successfully", data: place });
  } catch (error) {
    console.error("Error creating place:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update Place (only fields provided in body will be updated)
export const updatePlace = async (req, res) => {
  try {
    const { id } = req.params;
    const place = await Place.findById(id);

    if (!place) {
      return res.status(404).json({ success: false, message: "Place not found" });
    }

    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
      }

      if (place.company && place.company.toString() !== companyId) {
        return res.status(403).json({ success: false, message: "You do not have permission to modify this place." });
      }
    }

    const updatedPlace = await Place.findByIdAndUpdate(id, req.body, { new: true });

    return res.status(200).json({ success: true, data: updatedPlace });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete Place
export const deletePlace = async (req, res) => {
  try {
    const { id } = req.params;
    const place = await Place.findById(id);

    if (!place) {
      return res.status(404).json({ success: false, message: "Place not found" });
    }

    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
      }

      if (place.company && place.company.toString() !== companyId) {
        return res.status(403).json({ success: false, message: "You do not have permission to delete this place." });
      }
    }

    await Place.findByIdAndDelete(id);

    return res.status(200).json({ success: true, message: "Place deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Change Status (active <-> inactive)
export const togglePlaceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const place = await Place.findById(id);

    if (!place) {
      return res.status(404).json({ success: false, message: "Place not found" });
    }

    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
      }

      if (place.company && place.company.toString() !== companyId) {
        return res.status(403).json({ success: false, message: "You do not have permission to modify this place." });
      }
    }

    place.status = place.status === "active" ? "inactive" : "active";
    await place.save();

    return res.status(200).json({ success: true, data: place });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get all Places
export const getPlaces = async (req, res) => {
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
    
    const places = await Place.find(query);
    return res.status(200).json({ success: true, data: places });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


// Search place by name
export const searchPlaceByName = async (req, res) => {
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
      name: { $regex: name, $options: "i" }
    };
    if (baseFilter) {
      Object.assign(query, baseFilter);
    }
    
    const places = await Place.find(query);
    return res.status(200).json({ success: true, data: places });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

