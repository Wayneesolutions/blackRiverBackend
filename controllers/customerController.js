import { User } from "../models/driver/userModel.js";
import { getUserCompanyId } from "../utils/companyFilter.js";

// Create Customer
export const createCustomer = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating customers. Go to Company Settings to set up your company."
        });
      }
    }

    const companyId = getUserCompanyId(req.user);

    // Map incoming payload (new UI + legacy fields) to User model
    const {
      // Legacy/basic fields
      name,
      email,
      phone,
      internalId,
      country,
      state,
      city,

      // New UI fields (from NewCustomerSidebar)
      customerId,
      customer,
      customerType,
      emailPrimary,
      emailSecondary,
      trackingEmail,
      taxId,
      assignedSalesperson,
      phonePrimary,
      phoneSecondary,
      contact,
      address,
      unit,
      zipCode,
      stateProvince,
      creditLimit,
      creditTerm,
      invoiceNet,
      defaultQuickPayDiscount,
      useFactoringCompany,
      csaFastApproved,
      softBlock,
      hardBlock,
      billingType,
      presetNotes,
      defaultDropType
    } = req.body;

    // Prefer explicit new UI fields, fall back to legacy ones
    const baseName = customer || name;
    const baseEmail = emailPrimary || email;
    const basePhone = phonePrimary || phone;
    const baseInternalId = customerId || internalId;

    if (!baseName) {
      return res.status(400).json({
        success: false,
        message: "Customer name is required"
      });
    }

    const customerDoc = new User({
      name: baseName,
      email: baseEmail,
      phone: basePhone,
      country: country || undefined,
      state: state || undefined,
      city: city || undefined,
      internalId: baseInternalId || undefined,
      joinDate: new Date(),
      role: 'customer',
      ...(companyId && { company: companyId }),
      customerDetails: {
        customerType: customerType || 'Customer',
        customerId: customerId || baseInternalId || undefined,
        emailPrimary: emailPrimary || baseEmail || undefined,
        emailSecondary: emailSecondary || undefined,
        trackingEmail: trackingEmail || undefined,
        taxId: taxId || undefined,
        assignedSalesperson: assignedSalesperson || undefined,
        phonePrimary: phonePrimary || basePhone || undefined,
        phoneSecondary: phoneSecondary || undefined,
        contact: contact || undefined,
        address: address || undefined,
        unit: unit || undefined,
        zipCode: zipCode || undefined,
        stateProvince: stateProvince || undefined,
        creditLimit: creditLimit || undefined,
        creditTerm: creditTerm || undefined,
        invoiceNet: invoiceNet || undefined,
        defaultQuickPayDiscount: defaultQuickPayDiscount || undefined,
        useFactoringCompany: !!useFactoringCompany,
        csaFastApproved: !!csaFastApproved,
        softBlock: !!softBlock,
        hardBlock: !!hardBlock,
        billingType: billingType || 'DEFAULT / LOAD',
        presetNotes: presetNotes || undefined,
        defaultDropType: defaultDropType || undefined
      }
    });

    const savedCustomer = await customerDoc.save();
    res.status(201).json({ success: true, message: "Customer created successfully", data: savedCustomer });
  } catch (err) {
    console.error("Error creating customer:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update Customer (only provided fields)
export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await User.findById(id);
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
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

      if (customer.company && customer.company.toString() !== companyId) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to modify this customer."
        });
      }
    }

    // Map allowed fields from body
    const updateData = {};

    const {
      name,
      email,
      phone,
      internalId,
      country,
      state,
      city,

      customerId,
      customer: customerName,
      customerType,
      emailPrimary,
      emailSecondary,
      trackingEmail,
      taxId,
      assignedSalesperson,
      phonePrimary,
      phoneSecondary,
      contact,
      address,
      unit,
      zipCode,
      stateProvince,
      creditLimit,
      creditTerm,
      invoiceNet,
      defaultQuickPayDiscount,
      useFactoringCompany,
      csaFastApproved,
      softBlock,
      hardBlock,
      billingType,
      presetNotes,
      defaultDropType
    } = req.body;

    // Basic fields
    if (name !== undefined || customerName !== undefined) {
      updateData.name = customerName || name;
    }
    if (email !== undefined || emailPrimary !== undefined) {
      updateData.email = emailPrimary || email;
    }
    if (phone !== undefined || phonePrimary !== undefined) {
      updateData.phone = phonePrimary || phone;
    }
    if (internalId !== undefined || customerId !== undefined) {
      updateData.internalId = customerId || internalId;
    }
    if (country !== undefined) updateData.country = country;
    if (state !== undefined) updateData.state = state;
    if (city !== undefined) updateData.city = city;

    // Customer specific details (nested)
    const customerDetailsUpdate = {};
    if (customerType !== undefined) customerDetailsUpdate.customerType = customerType;
    if (customerId !== undefined || internalId !== undefined) {
      customerDetailsUpdate.customerId = customerId || internalId;
    }
    if (emailPrimary !== undefined || email !== undefined) {
      customerDetailsUpdate.emailPrimary = emailPrimary || email;
    }
    if (emailSecondary !== undefined) customerDetailsUpdate.emailSecondary = emailSecondary;
    if (trackingEmail !== undefined) customerDetailsUpdate.trackingEmail = trackingEmail;
    if (taxId !== undefined) customerDetailsUpdate.taxId = taxId;
    if (assignedSalesperson !== undefined) customerDetailsUpdate.assignedSalesperson = assignedSalesperson;
    if (phonePrimary !== undefined || phone !== undefined) {
      customerDetailsUpdate.phonePrimary = phonePrimary || phone;
    }
    if (phoneSecondary !== undefined) customerDetailsUpdate.phoneSecondary = phoneSecondary;
    if (contact !== undefined) customerDetailsUpdate.contact = contact;
    if (address !== undefined) customerDetailsUpdate.address = address;
    if (unit !== undefined) customerDetailsUpdate.unit = unit;
    if (zipCode !== undefined) customerDetailsUpdate.zipCode = zipCode;
    if (stateProvince !== undefined) customerDetailsUpdate.stateProvince = stateProvince;
    if (creditLimit !== undefined) customerDetailsUpdate.creditLimit = creditLimit;
    if (creditTerm !== undefined) customerDetailsUpdate.creditTerm = creditTerm;
    if (invoiceNet !== undefined) customerDetailsUpdate.invoiceNet = invoiceNet;
    if (defaultQuickPayDiscount !== undefined) {
      customerDetailsUpdate.defaultQuickPayDiscount = defaultQuickPayDiscount;
    }
    if (useFactoringCompany !== undefined) {
      customerDetailsUpdate.useFactoringCompany = !!useFactoringCompany;
    }
    if (csaFastApproved !== undefined) {
      customerDetailsUpdate.csaFastApproved = !!csaFastApproved;
    }
    if (softBlock !== undefined) {
      customerDetailsUpdate.softBlock = !!softBlock;
    }
    if (hardBlock !== undefined) {
      customerDetailsUpdate.hardBlock = !!hardBlock;
    }
    if (billingType !== undefined) customerDetailsUpdate.billingType = billingType;
    if (presetNotes !== undefined) customerDetailsUpdate.presetNotes = presetNotes;
    if (defaultDropType !== undefined) customerDetailsUpdate.defaultDropType = defaultDropType;

    // Apply nested updates using dot notation
    Object.keys(customerDetailsUpdate).forEach((key) => {
      updateData[`customerDetails.${key}`] = customerDetailsUpdate[key];
    });

    const updatedCustomer = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: updatedCustomer, message: "Customer updated successfully" });
  } catch (err) {
    console.error("Error updating customer:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete Customer
export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await User.findById(id);
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
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

      if (customer.company && customer.company.toString() !== companyId) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to delete this customer."
        });
      }
    }

    await User.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Customer deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// List All Customers
export const listCustomers = async (req, res) => {
  try {
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");
    
    // Get query parameters
    const { search, status, type, sortBy, sortOrder } = req.query;
    
    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.status(200).json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    
    // Get combined filter (company + trial data filter)
    const baseFilter = await getCombinedFilter(req.user, companyFilter);
    
    // Build query
    const query = { role: 'customer' };
    if (baseFilter) {
      Object.assign(query, baseFilter);
    }

    // Search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { 'customerDetails.customerId': searchRegex },
        { 'customerDetails.address': searchRegex },
        { city: searchRegex }
      ];
    }

    // Status filter
    if (status && status !== 'All') {
      query.status = status.toLowerCase();
    }

    // Type filter (Customer vs Shipper-Receiver)
    if (type && type !== 'All') {
      query['customerDetails.customerType'] = type;
    }

    // Build sort
    let sort = { createdAt: -1 };
    if (sortBy) {
      const sortDirection = sortOrder === 'desc' ? -1 : 1;
      if (sortBy === 'name') sort = { name: sortDirection };
      else if (sortBy === 'type') sort = { 'customerDetails.customerType': sortDirection };
      else if (sortBy === 'address') sort = { 'customerDetails.address': sortDirection };
      else if (sortBy === 'city') sort = { city: sortDirection };
      else if (sortBy === 'lastLoadDate') sort = { updatedAt: sortDirection };
    }
    
    const customers = await User.find(query).sort(sort);
    res.status(200).json({ success: true, data: customers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Search Customers (by name, email, phone, title)
export const searchCustomers = async (req, res) => {
  try {
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");
    
    const { q } = req.query; // ?q=searchText
    const regex = new RegExp(q, "i"); // case-insensitive search
    
    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.status(200).json({
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
      role: 'customer',
      $or: [
        { name: regex },
        { email: regex },
        { phone: regex },
        { title: regex },
        { "placeDetails.city": regex },
        { "placeDetails.country": regex }
      ]
    };
    if (baseFilter) {
      Object.assign(query, baseFilter);
    }
    
    const customers = await User.find(query);
    res.status(200).json({ success: true, data: customers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
