import { Supplier } from "../../models/driver/supplierModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// Get all suppliers
export const getSuppliers = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({ success: true, message: "No company assigned to the current admin.", data: [] });
    }

    const filter = {};
    if (companyId) {
      filter.company = companyId;
    }

    const suppliers = await Supplier.find(filter).sort({ createdAt: -1 });
    res.json({
      success: true,
      message: "Suppliers fetched successfully",
      data: suppliers
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Get supplier by ID
export const getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }

    const query = { _id: id };
    if (companyId) {
      query.company = companyId;
    }

    const supplier = await Supplier.findOne(query);

    if (!supplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }

    res.json({
      success: true,
      message: "Supplier fetched successfully",
      data: supplier
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Create supplier
export const createSupplier = async (req, res) => {
  try {
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating suppliers. Go to Company Settings to set up your company."
        });
      }
    }

    const companyId = getUserCompanyId(req.user);
    const { email } = req.body;

    // Check if email is provided
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    // Check if supplier with this email already exists
    const duplicateQuery = { email };
    
    // If not superadmin, also filter by company to ensure email is unique within company
    if (companyId) {
      duplicateQuery.company = companyId;
    }

    const existingSupplier = await Supplier.findOne(duplicateQuery);
    if (existingSupplier) {
      return res.status(400).json({
        success: false,
        message: `Supplier with email '${email}' already exists. Please use a different email.`
      });
    }

    const supplier = await Supplier.create({
      ...req.body,
      ...(companyId && { company: companyId })
    });
    res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      data: supplier
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, error: err.message });
  }
};

// Update supplier
export const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const existingSupplier = await Supplier.findById(id);

    if (!existingSupplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }

    if (!isSuperadmin && existingSupplier.company && existingSupplier.company.toString() !== companyId) {
      return res.status(403).json({ success: false, message: "You do not have permission to modify this supplier." });
    }

    // Check if email is being updated and if it already exists
    const { email } = req.body;
    if (email && email !== existingSupplier.email) {
      // Build query to check for duplicate email
      const duplicateQuery = { 
        email,
        _id: { $ne: id } // Exclude current supplier from the check
      };
      
      // If not superadmin, also filter by company to ensure email is unique within company
      if (companyId) {
        duplicateQuery.company = companyId;
      }

      const duplicateSupplier = await Supplier.findOne(duplicateQuery);
      if (duplicateSupplier) {
        return res.status(400).json({
          success: false,
          message: `Supplier with email '${email}' already exists. Please use a different email.`
        });
      }
    }

    const supplier = await Supplier.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Supplier updated successfully",
      data: supplier
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, error: err.message });
  }
};

// Delete supplier
export const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const supplier = await Supplier.findById(id);

    if (!supplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }

    if (!isSuperadmin && supplier.company && supplier.company.toString() !== companyId) {
      return res.status(403).json({ success: false, message: "You do not have permission to delete this supplier." });
    }

    await Supplier.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Supplier deleted successfully"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

