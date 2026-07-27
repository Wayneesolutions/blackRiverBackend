import { EmergencyContact } from "../../models/healthSafety/emergencyContactModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Create Emergency Contact
export const createEmergencyContact = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const { name, role, phone, email, department, isPrimary, available24_7, alternatePhone } = req.body;

    if (!name || !role || !phone || !department) {
      return res.status(400).json({
        success: false,
        message: "Name, role, phone, and department are required."
      });
    }

    // If setting as primary, unset other primary contacts
    if (isPrimary) {
      await EmergencyContact.updateMany(
        { company: isSuperadmin ? req.body.company || null : companyId },
        { $set: { isPrimary: false } }
      );
    }

    const contact = new EmergencyContact({
      name: name.trim(),
      role: role.trim(),
      phone: phone.trim(),
      email: email?.trim() || '',
      department: department.trim(),
      isPrimary: isPrimary === true || isPrimary === 'true',
      available24_7: available24_7 === true || available24_7 === 'true',
      alternatePhone: alternatePhone?.trim() || '',
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    });

    await contact.save();
    await contact.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: "Emergency contact created successfully",
      data: contact
    });
  } catch (err) {
    console.error('Create emergency contact error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create emergency contact"
    });
  }
};

// ✅ Get All Emergency Contacts
export const getEmergencyContacts = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = {};
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const contacts = await EmergencyContact.find(query)
      .populate('createdBy', 'name email')
      .sort({ isPrimary: -1, name: 1 })
      .lean();

    res.json({
      success: true,
      data: contacts
    });
  } catch (err) {
    console.error('Get emergency contacts error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch emergency contacts"
    });
  }
};

// ✅ Update Emergency Contact
export const updateEmergencyContact = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const contact = await EmergencyContact.findOne(query);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Emergency contact not found"
      });
    }

    const { isPrimary } = req.body;

    // If setting as primary, unset other primary contacts
    if (isPrimary && !contact.isPrimary) {
      await EmergencyContact.updateMany(
        { company: contact.company, _id: { $ne: id } },
        { $set: { isPrimary: false } }
      );
    }

    Object.assign(contact, req.body);
    await contact.save();
    await contact.populate('createdBy', 'name email');

    res.json({
      success: true,
      message: "Emergency contact updated successfully",
      data: contact
    });
  } catch (err) {
    console.error('Update emergency contact error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update emergency contact"
    });
  }
};

// ✅ Delete Emergency Contact
export const deleteEmergencyContact = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const contact = await EmergencyContact.findOneAndDelete(query);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Emergency contact not found"
      });
    }

    res.json({
      success: true,
      message: "Emergency contact deleted successfully"
    });
  } catch (err) {
    console.error('Delete emergency contact error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete emergency contact"
    });
  }
};

