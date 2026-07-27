import Vendor from "../models/vendorModel.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { handleError } from "../utils/errorHandler.js";

// Create vendor
export const createVendor = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating vendors. Go to Company Settings to set up your company."
        });
      }
    }
    
    const companyId = getUserCompanyId(req.user);
    const { internalId } = req.body;

    // Check if internalId is provided
    if (internalId) {
      // Build query to check for duplicate internalId
      const duplicateQuery = { internalId };
      
      // If not superadmin, also filter by company to ensure internalId is unique within company
      if (companyId) {
        duplicateQuery.company = companyId;
      }

      const existingVendor = await Vendor.findOne(duplicateQuery);
      if (existingVendor) {
        return res.status(400).json({
          success: false,
          message: `Internal ID '${internalId}' already exists. Please use a different Internal ID.`
        });
      }
    }
    
    const vendor = new Vendor({
      ...req.body,
      ...(companyId && { company: companyId })
    });
    const savedVendor = await vendor.save();
    res.status(201).json({success:true,message:"vendor created",data:savedVendor});
  } catch (err) {
    return handleError(err, res, 400);
  }
};

// Update vendor
export const updateVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({success:false,message:"vendor not found", error: "Vendor not found" });
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

      if (vendor.company && vendor.company.toString() !== companyId) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to modify this vendor."
        });
      }
    }

    // Check if internalId is being updated and if it already exists
    const { internalId } = req.body;
    if (internalId && internalId !== vendor.internalId) {
      // Build query to check for duplicate internalId
      const duplicateQuery = { 
        internalId,
        _id: { $ne: req.params.id } // Exclude current vendor from the check
      };
      
      // If not superadmin, also filter by company to ensure internalId is unique within company
      if (companyId) {
        duplicateQuery.company = companyId;
      }

      const existingVendor = await Vendor.findOne(duplicateQuery);
      if (existingVendor) {
        return res.status(400).json({
          success: false,
          message: `Internal ID '${internalId}' already exists. Please use a different Internal ID.`
        });
      }
    }

    const updatedVendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json({success:true,message:"updated",data:updatedVendor});
  } catch (err) {
    return handleError(err, res, 400);
  }
};

// Delete vendor
export const deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({success:false,message:"vendor not found", error: "Vendor not found" });
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

      if (vendor.company && vendor.company.toString() !== companyId) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to delete this vendor."
        });
      }
    }

    await Vendor.findByIdAndDelete(req.params.id);
    res.json({success:true, message: "Vendor deleted successfully" });
  } catch (err) {
    res.status(400).json({success:false,message:"server error", error: err.message });
  }
};

// List all vendors
export const listVendors = async (req, res) => {
  try {
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");
    
    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    
    // Get combined filter (company + trial data filter)
    const baseFilter = await getCombinedFilter(req.user, companyFilter);
    
    // Build query
    const query = {};
    if (baseFilter) {
      Object.assign(query, baseFilter);
    }
    
    const vendors = await Vendor.find(query);
    res.json({success:true,message:"list vendors",data:vendors});
  } catch (err) {
    res.status(500).json({success:false,message:"server error", error: err.message });
  }
};

// Change vendor status
export const changeVendorStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({success:false, message: "Invalid status value" });
    }
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({success:false,message:"vendor not found" });
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

      if (vendor.company && vendor.company.toString() !== companyId) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to modify this vendor."
        });
      }
    }

    vendor.status = status;
    await vendor.save();
    const updatedVendor = vendor;
    res.json({success:true,message:"vendor updated",data:updatedVendor});
  } catch (err) {
    res.status(400).json({ success:false,message:"server error",error: err.message });
  }
};

export const selectedVendor = async (req,res) =>{
  try {
    const vendorId = req.query.vendorId 
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const query = { _id: vendorId };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }
    if (!isSuperadmin && !companyId) {
      return res.json({ success: true, message: "No company assigned to the current admin.", data: null });
    }
    const vendor = await Vendor.findOne(query)
    return res.json({success:true,message:"selected vendor details",data:vendor})
  } catch (error) {
    res.status(400).json({ success:false,message:"server error",error: err.message });
  }
}
