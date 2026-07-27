import Issue from "../models/issueModel.js";
import { getCoordinatesFromAddress } from "../services/googlemap.js";
import { Vehicle } from "../models/driver/vehicleModel.js";
import { Trailer } from "../models/driver/trailerModel.js";
import mongoose from "mongoose";

// Helper function to extract real ID from prefixed IDs (e.g., "custom-123" -> "123")
const extractRealId = (prefixedId) => {
  if (!prefixedId) return null;
  
  // Check if it's a prefixed ID
  if (prefixedId.startsWith("custom-")) {
    return prefixedId.replace("custom-", "");
  }
  if (prefixedId.startsWith("vehicle-")) {
    return prefixedId.replace("vehicle-", "");
  }
  if (prefixedId.startsWith("trailer-")) {
    return prefixedId.replace("trailer-", "");
  }
  
  // Return as-is if not prefixed
  return prefixedId;
};

// Helper function to check if an ID is a valid ObjectId
const isValidObjectId = (id) => {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id);
};

// Helper function to populate vehicle/trailer info from Vehicle/Trailer models
const populateVehicleInfo = async (vehicleId) => {
  if (!vehicleId) return null;
  
  // Convert vehicle to string if it's an ObjectId (from .lean())
  let vehicleIdStr = vehicleId;
  if (vehicleId && typeof vehicleId === 'object' && vehicleId.toString) {
    vehicleIdStr = vehicleId.toString();
  } else {
    vehicleIdStr = String(vehicleId || '');
  }
  
  let unitDoc = null;
  let unitType = 'Truck';
  
  // Try Vehicle by _id first
  if (isValidObjectId(vehicleIdStr)) {
    try {
      unitDoc = await Vehicle.findById(new mongoose.Types.ObjectId(vehicleIdStr))
        .select("plateNumber vinNumber unitNumber internalId make model")
        .lean();
      if (unitDoc) {
        unitType = 'Truck';
      }
    } catch (err) {
      console.error(`Error finding Vehicle by _id ${vehicleIdStr}:`, err.message);
    }
  }
  
  // If not found, try Trailer by _id
  if (!unitDoc && isValidObjectId(vehicleIdStr)) {
    try {
      unitDoc = await Trailer.findById(new mongoose.Types.ObjectId(vehicleIdStr))
        .select("plateNumber vinNumber unitNumber trailer internalId make model")
        .lean();
      if (unitDoc) {
        unitType = 'Trailer';
      }
    } catch (err) {
      console.error(`Error finding Trailer by _id ${vehicleIdStr}:`, err.message);
    }
  }
  
  // If not found by _id, try by other identifiers (Vehicle first)
  if (!unitDoc && vehicleIdStr) {
    try {
      unitDoc = await Vehicle.findOne({
        $or: [
          { unitNumber: vehicleIdStr },
          { internalId: vehicleIdStr },
          { plateNumber: vehicleIdStr }
        ]
      })
      .select("plateNumber vinNumber unitNumber internalId make model")
      .lean();
      if (unitDoc) {
        unitType = 'Truck';
      }
    } catch (err) {
      console.error(`Error finding Vehicle by identifier ${vehicleIdStr}:`, err.message);
    }
  }
  
  // If still not found, try Trailer by identifiers
  if (!unitDoc && vehicleIdStr) {
    try {
      unitDoc = await Trailer.findOne({
        $or: [
          { unitNumber: vehicleIdStr },
          { trailer: vehicleIdStr },
          { internalId: vehicleIdStr }
        ]
      })
      .select("plateNumber vinNumber unitNumber trailer internalId make model")
      .lean();
      if (unitDoc) {
        unitType = 'Trailer';
      }
    } catch (err) {
      console.error(`Error finding Trailer by identifier ${vehicleIdStr}:`, err.message);
    }
  }
  
  if (!unitDoc) {
    console.warn(`Vehicle/Trailer not found, vehicleId: ${vehicleIdStr}`);
    return null;
  }
  
  // Extract make and model
  const make = unitDoc.make || '';
  const model = unitDoc.model || '';
  const displayName = [make, model].filter(Boolean).join(' ').trim();
  const identifier = unitDoc.plateNumber || unitDoc.unitNumber || (unitType === 'Trailer' ? unitDoc.trailer : null) || unitDoc.internalId || 'N/A';
  
  // Map to consistent format
  const vehicleInfo = {
    _id: unitDoc._id,
    plateNumber: unitDoc.plateNumber || identifier,
    vinNumber: unitDoc.vinNumber || 'N/A',
    make: make || (displayName ? displayName.split(' ')[0] : ''),
    model: model || (displayName ? displayName.split(' ').slice(1).join(' ') : ''),
    internalId: unitDoc.internalId || unitDoc.unitNumber || (unitType === 'Trailer' ? unitDoc.trailer : null) || 'N/A',
    unitType: unitType
  };
  
  // Ensure we don't show empty values - use unitNumber as fallback
  if ((!vehicleInfo.make && !vehicleInfo.model)) {
    vehicleInfo.make = unitDoc.unitNumber || (unitType === 'Trailer' ? unitDoc.trailer : null) || identifier || 'Vehicle';
    vehicleInfo.model = '';
  }
  
  return vehicleInfo;
};

// ✅ Create Issue
export const createIssue = async (req, res) => {
  try {
    const { address, ...otherData } = req.body;
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = req.user?.company;
    
    // If address is provided, get coordinates
    let coordinates = null;
    if (address) {
      try {
        const coords = await getCoordinatesFromAddress(address);
        coordinates = {
          longitude: coords.longitude.toString(),
          latitude: coords.latitude.toString()
        };
      } catch (coordError) {
        console.error('Error getting coordinates:', coordError);
        // Continue without coordinates if geocoding fails
      }
    }

    // Handle vehicle field if provided - extract real ID from prefixed IDs, use Vehicle/Trailer
    let vehicleId = otherData.vehicle;
    if (vehicleId) {
      const realVehicleId = extractRealId(vehicleId);
      
      // Find Vehicle or Trailer
      let unitDoc = null;
      
      // Try Vehicle by ObjectId first
      if (isValidObjectId(realVehicleId)) {
        unitDoc = await Vehicle.findById(new mongoose.Types.ObjectId(realVehicleId));
      }
      
      // If not found, try Trailer by ObjectId
      if (!unitDoc && isValidObjectId(realVehicleId)) {
        unitDoc = await Trailer.findById(new mongoose.Types.ObjectId(realVehicleId));
      }
      
      // If not found by ObjectId, try by identifiers (Vehicle first)
      if (!unitDoc && realVehicleId) {
        unitDoc = await Vehicle.findOne({
          $or: [
            { unitNumber: realVehicleId },
            { internalId: realVehicleId },
            { plateNumber: realVehicleId }
          ]
        });
      }
      
      // If still not found, try Trailer by identifiers
      if (!unitDoc && realVehicleId) {
        unitDoc = await Trailer.findOne({
          $or: [
            { unitNumber: realVehicleId },
            { trailer: realVehicleId },
            { internalId: realVehicleId }
          ]
        });
      }
      
      if (unitDoc) {
        vehicleId = unitDoc._id;
      } else {
        return res.status(404).json({ 
          success: false, 
          message: `Vehicle or Trailer not found. Please select a valid unit.` 
        });
      }
    }

    const issueData = {
      ...otherData,
      vehicle: vehicleId,
      address,
      cordinates: coordinates
    };

    if (!isSuperadmin && companyId) {
      issueData.company = companyId;
    } else if (isSuperadmin && otherData.company) {
      issueData.company = otherData.company;
    }

    const issue = new Issue(issueData);
    await issue.save();
    return res.status(201).json({ success: true, message: "Issue created successfully", issue });
  } catch (error) {
    return res.status(500).json({ message: "Error creating issue", error: error.message });
  }
};

// ✅ Update Issue (only selected fields)
export const updateIssue = async (req, res) => {
  try {
    const { id } = req.params;
    const { address, ...otherFields } = req.body;
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = req.user?.company;

    const existingIssue = await Issue.findById(id);
    if (!existingIssue) return res.status(404).json({ message: "Issue not found" });

    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({ message: "No company assigned to current admin" });
      }
      if (!existingIssue.company || existingIssue.company.toString() !== companyId.toString()) {
        return res.status(403).json({ message: "You do not have access to this issue" });
      }
    }

    // If address is provided, get coordinates
    let coordinates = null;
    if (address) {
      try {
        const coords = await getCoordinatesFromAddress(address);
        coordinates = {
          longitude: coords.longitude.toString(),
          latitude: coords.latitude.toString()
        };
      } catch (coordError) {
        console.error('Error getting coordinates:', coordError);
        // Continue without coordinates if geocoding fails
      }
    }

    // Handle vehicle field if provided - extract real ID from prefixed IDs
    let vehicleId = otherFields.vehicle;
    if (vehicleId) {
      const realVehicleId = extractRealId(vehicleId);
      
      // Find Vehicle or Trailer
      let unitDoc = null;
      
      // Try Vehicle by ObjectId first
      if (isValidObjectId(realVehicleId)) {
        unitDoc = await Vehicle.findById(new mongoose.Types.ObjectId(realVehicleId));
      }
      
      // If not found, try Trailer by ObjectId
      if (!unitDoc && isValidObjectId(realVehicleId)) {
        unitDoc = await Trailer.findById(new mongoose.Types.ObjectId(realVehicleId));
      }
      
      // If not found by ObjectId, try by identifiers (Vehicle first)
      if (!unitDoc && realVehicleId) {
        unitDoc = await Vehicle.findOne({
          $or: [
            { unitNumber: realVehicleId },
            { internalId: realVehicleId },
            { plateNumber: realVehicleId }
          ]
        });
      }
      
      // If still not found, try Trailer by identifiers
      if (!unitDoc && realVehicleId) {
        unitDoc = await Trailer.findOne({
          $or: [
            { unitNumber: realVehicleId },
            { trailer: realVehicleId },
            { internalId: realVehicleId }
          ]
        });
      }
      
      if (unitDoc) {
        vehicleId = unitDoc._id;
      } else {
        return res.status(404).json({ 
          success: false, 
          message: `Vehicle or Trailer not found. Please select a valid unit.` 
        });
      }
    }

    const updateFields = {
      ...otherFields,
      vehicle: vehicleId,
      address,
      cordinates: coordinates
    };

    if (!isSuperadmin && companyId) {
      updateFields.company = companyId;
    }

    const updatedIssue = await Issue.findByIdAndUpdate(id, updateFields, { new: true });

    return res.json({ success: true, message: "Issue updated successfully", issue: updatedIssue });
  } catch (error) {
    return res.status(500).json({ message: "Error updating issue", error: error.message });
  }
};

// ✅ Delete Issue
export const deleteIssue = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;
    const isSuperadmin = userRole === 'superadmin';
    const isAdmin = userRole === 'admin';
    const isHR = userRole === 'hr';
    const isDispatcher = userRole === 'dispatcher';
    const isFleetMaintenanceManager = userRole === 'Fleet Maintenance Manager';
    const isComplianceManager = userRole === 'Compliance Manager';
    const companyId = req.user?.company;

    const issue = await Issue.findById(id);
    if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });

    // Superadmin, Admin, HR, Dispatcher, Fleet Maintenance Manager, and Compliance Manager can delete all issues without company restrictions
    if (isSuperadmin || isAdmin || isHR || isDispatcher || isFleetMaintenanceManager || isComplianceManager) {
      await Issue.findByIdAndDelete(id);
      return res.json({ success: true, message: "Issue deleted successfully" });
    }

    // For other roles, check company access
    if (!companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to current admin" });
    }

    // Normalize company IDs for comparison
    const issueCompanyId = issue.company 
      ? (typeof issue.company === 'object' && issue.company.toString 
          ? issue.company.toString() 
          : String(issue.company))
      : null;
    const userCompanyId = typeof companyId === 'object' && companyId.toString
      ? companyId.toString()
      : String(companyId);

    // If issue has no company field, allow deletion (for backward compatibility)
    if (!issueCompanyId) {
      await Issue.findByIdAndDelete(id);
      return res.json({ success: true, message: "Issue deleted successfully" });
    }

    // If issue has company field, it must match user's company
    if (issueCompanyId === userCompanyId) {
      await Issue.findByIdAndDelete(id);
      return res.json({ success: true, message: "Issue deleted successfully" });
    } else {
      return res.status(403).json({ success: false, message: "You do not have access to this issue" });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error deleting issue", error: error.message });
  }
};

// ✅ Get all Issues (list with pagination)
export const listIssues = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const userRole = req.user?.role;
    const isSuperadmin = userRole === 'superadmin';
    const companyId = req.user?.company;

    // Build filter based on user role
    let filter = {};
    
    if (isSuperadmin) {
      // Superadmin can see all issues
      filter = {};
    } else if (companyId) {
      // Admin, HR, and other roles see issues from their company
      // Include issues with matching company OR issues without company field (legacy)
      filter = {
        $or: [
          { company: companyId },
          { company: { $exists: false } },
          { company: null }
        ]
      };
    } else {
      // User has no company assigned
      return res.json({
        success: true,
        message: "No company assigned to the current user.",
        total: 0,
        page: parseInt(page),
        pages: 0,
        issues: []
      });
    }

    let issues = await Issue.find(filter)
      .populate("driver")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();
    
    // Manually populate vehicle field - use FleetUnit only
    for (let issue of issues) {
      if (issue.vehicle) {
        issue.vehicle = await populateVehicleInfo(issue.vehicle);
      }
    }

    const count = await Issue.countDocuments(filter);

    return res.json({
      success: true,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit),
      issues,
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: "Error fetching issues", 
      error: error.message 
    });
  }
};

// ✅ Get Issue by ID
export const getIssueById = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;
    const isSuperadmin = userRole === 'superadmin';
    const isAdmin = userRole === 'admin';
    const isHR = userRole === 'hr';
    const companyId = req.user?.company;

    let issue = await Issue.findById(id)
      .populate("driver")
      .lean();
    
    // Manually populate vehicle field - use FleetUnit only
    if (issue && issue.vehicle) {
      issue.vehicle = await populateVehicleInfo(issue.vehicle);
    }
    
    if (!issue) {
      return res.status(404).json({ 
        success: false, 
        message: "Issue not found" 
      });
    }

    // Superadmin, Admin, HR, and Dispatcher can access all issues without company restrictions
    // (Dispatcher is authorized via route middleware, so we allow access here)
    if (isSuperadmin || isAdmin || isHR || userRole === 'dispatcher') {
      return res.json({ success: true, issue });
    }

    // For other roles, check company access
    if (!companyId) {
      return res.status(403).json({ 
        success: false, 
        message: "No company assigned to current user" 
      });
    }

    // Normalize company IDs for comparison (handle both ObjectId and string)
    const issueCompanyId = issue.company 
      ? (typeof issue.company === 'object' && issue.company.toString 
          ? issue.company.toString() 
          : String(issue.company))
      : null;
    const userCompanyId = typeof companyId === 'object' && companyId.toString
      ? companyId.toString()
      : String(companyId);

    // If issue has no company field, allow access (for backward compatibility)
    if (!issueCompanyId) {
      return res.json({ success: true, issue });
    }

    // If issue has company field, it must match user's company
    if (issueCompanyId === userCompanyId) {
      return res.json({ success: true, issue });
    } else {
      // Log for debugging
      console.log('Company mismatch:', {
        issueCompanyId,
        userCompanyId,
        issueCompanyType: typeof issue.company,
        userCompanyType: typeof companyId
      });
      return res.status(403).json({ 
        success: false, 
        message: "You do not have access to this issue" 
      });
    }
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Error fetching issue", 
      error: error.message 
    });
  }
};

// ✅ Search Issues (by issueType, priority, status, tags, etc.)
export const searchIssues = async (req, res) => {
  try {
    const { keyword } = req.query;
    let query = {};

    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = req.user?.company;

    if (!isSuperadmin && !companyId) {
      return res.json({ success: true, total: 0, issues: [], message: "No company assigned to the current admin." });
    }

    const companyFilter = isSuperadmin ? {} : { company: companyId };

    if (keyword) {
      query = {
        ...companyFilter,
        $or: [
          { issueType: { $regex: keyword, $options: "i" } },
          { issueCategory: { $regex: keyword, $options: "i" } },
          { issueReport: { $regex: keyword, $options: "i" } },
          { priority: { $regex: keyword, $options: "i" } },
          { status: { $regex: keyword, $options: "i" } },
          { issueTags: { $regex: keyword, $options: "i" } },
        ],
      };
    } else {
      query = { ...companyFilter };
    }

    let issues = await Issue.find(query).populate("driver").lean();
    
    // Manually populate vehicle field - use FleetUnit only
    for (let issue of issues) {
      if (issue.vehicle) {
        issue.vehicle = await populateVehicleInfo(issue.vehicle);
      }
    }

    return res.json({ success: true, total: issues.length, issues });
  } catch (error) {
    return res.status(500).json({ message: "Error searching issues", error: error.message });
  }
};
