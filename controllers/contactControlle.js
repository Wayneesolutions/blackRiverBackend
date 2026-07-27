import { User } from "../models/driver/userModel.js";
import { getUserCompanyId } from "../utils/companyFilter.js";

// Create a contact
export const createContact = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating contacts. Go to Company Settings to set up your company."
        });
      }
    }
    
    const {name,email,phone,country,city,state,internalId} = req.body
    const companyId = getUserCompanyId(req.user);
    
    const contact = new User({
      name,
      email,
      phone,
      internalId,
      country,
      city,
      status:'active',
      role:'contact',
      joinDate:new Date(),
      state,
      ...(companyId && { company: companyId })
    })
    await contact.save()

    res.status(201).json({ success: true,message:"new contact is created", data: contact });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update contact (only provided fields)
export const updateContact = async (req, res) => {
  try {
    console.log('dfs');
    
    const { id } = req.params;
    const contact = await User.findById(id);
    if (!contact) {
      return res.status(404).json({ success: false, message: "Contact not found" });
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

      if (contact.company && contact.company.toString() !== companyId) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to modify this contact."
        });
      }
    }
    const updatedContact = await User.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    
    res.json({ success: true, data: updatedContact });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Delete contact
export const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await User.findById(id);
    if (!contact) {
      return res.status(404).json({ success: false, message: "Contact not found" });
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

      if (contact.company && contact.company.toString() !== companyId) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to delete this contact."
        });
      }
    }

    await User.findByIdAndDelete(id);
    res.json({ success: true, message: "Contact deleted successfully" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// List all contacts
export const listContacts = async (req, res) => {
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
    const query = { role: 'contact' };
    if (baseFilter) {
      Object.assign(query, baseFilter);
    }
    
    const contacts = await User.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Search contact by name
export const searchContact = async (req, res) => {
  try {
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");
    
    const { name } = req.query;
    
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
    const query = {
      role: 'contact',
      name: { $regex: name, $options: "i" }
    };
    if (baseFilter) {
      Object.assign(query, baseFilter);
    }
    
    const contacts = await User.find(query);
    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
