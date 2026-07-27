import { CommitteeMember } from "../../models/healthSafety/committeeMemberModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Create Committee Member
export const createCommitteeMember = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const { name, role, department, email, phone } = req.body;

    if (!name || !role || !department || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, role, department, email, and phone are required."
      });
    }

    const member = new CommitteeMember({
      name: name.trim(),
      role: role.trim(),
      department: department.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    });

    await member.save();
    await member.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: "Committee member created successfully",
      data: member
    });
  } catch (err) {
    console.error('Create committee member error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create committee member"
    });
  }
};

// ✅ Get All Committee Members
export const getCommitteeMembers = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = {};
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const members = await CommitteeMember.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: members
    });
  } catch (err) {
    console.error('Get committee members error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch committee members"
    });
  }
};

// ✅ Get Committee Member By ID
export const getCommitteeMemberById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const member = await CommitteeMember.findOne(query)
      .populate('createdBy', 'name email')
      .lean();

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Committee member not found"
      });
    }

    res.json({
      success: true,
      data: member
    });
  } catch (err) {
    console.error('Get committee member by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch committee member"
    });
  }
};

// ✅ Update Committee Member
export const updateCommitteeMember = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const member = await CommitteeMember.findOne(query);
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Committee member not found"
      });
    }

    const updateData = {};
    if (req.body.name) updateData.name = req.body.name.trim();
    if (req.body.role) updateData.role = req.body.role.trim();
    if (req.body.department) updateData.department = req.body.department.trim();
    if (req.body.email) updateData.email = req.body.email.trim().toLowerCase();
    if (req.body.phone) updateData.phone = req.body.phone.trim();

    Object.assign(member, updateData);
    await member.save();
    await member.populate('createdBy', 'name email');

    res.json({
      success: true,
      message: "Committee member updated successfully",
      data: member
    });
  } catch (err) {
    console.error('Update committee member error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update committee member"
    });
  }
};

// ✅ Delete Committee Member
export const deleteCommitteeMember = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const member = await CommitteeMember.findOneAndDelete(query);
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Committee member not found"
      });
    }

    res.json({
      success: true,
      message: "Committee member deleted successfully"
    });
  } catch (err) {
    console.error('Delete committee member error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete committee member"
    });
  }
};

