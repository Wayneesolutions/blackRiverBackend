import { TestType } from '../../models/driver/testTypeModel.js';
import { getUserCompanyId } from '../../utils/companyFilter.js';
import mongoose from 'mongoose';

// ✅ Create Test Type
export const createTestType = async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    
    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "No company assigned to the current user."
      });
    }

    const { name, displayName } = req.body;

    if (!name || !displayName) {
      return res.status(400).json({
        success: false,
        message: "Name and display name are required"
      });
    }

    // Normalize name to uppercase for consistency
    const normalizedName = name.toUpperCase().trim();

    // Check if test type already exists for this company
    const existingTestType = await TestType.findOne({
      name: normalizedName,
      company: companyId
    });

    if (existingTestType) {
      return res.status(400).json({
        success: false,
        message: "Test type with this name already exists"
      });
    }

    const testType = new TestType({
      name: normalizedName,
      displayName: displayName.trim(),
      company: companyId,
      createdBy: req.user._id,
      isActive: true
    });

    await testType.save();

    res.status(201).json({
      success: true,
      data: testType,
      message: "Test type created successfully"
    });
  } catch (err) {
    console.error('Create test type error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create test type"
    });
  }
};

// ✅ Get All Test Types
export const getTestTypes = async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        data: [],
        message: "No company assigned to the current user."
      });
    }

    const query = {};
    
    if (!isSuperadmin && companyId) {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        query.company = new mongoose.Types.ObjectId(companyId);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid company ID format"
        });
      }
    }

    query.isActive = true;

    const testTypes = await TestType.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: testTypes
    });
  } catch (err) {
    console.error('Get test types error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch test types"
    });
  }
};

// ✅ Update Test Type
export const updateTestType = async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "No company assigned to the current user."
      });
    }

    const { id } = req.params;
    const { displayName, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid test type ID"
      });
    }

    const testType = await TestType.findById(id);

    if (!testType) {
      return res.status(404).json({
        success: false,
        message: "Test type not found"
      });
    }

    // Check if user has access to this test type (same company)
    if (!isSuperadmin && testType.company.toString() !== companyId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this test type"
      });
    }

    if (displayName !== undefined) {
      testType.displayName = displayName.trim();
    }
    if (isActive !== undefined) {
      testType.isActive = isActive;
    }

    await testType.save();

    res.json({
      success: true,
      data: testType,
      message: "Test type updated successfully"
    });
  } catch (err) {
    console.error('Update test type error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update test type"
    });
  }
};

// ✅ Delete Test Type
export const deleteTestType = async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "No company assigned to the current user."
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid test type ID"
      });
    }

    const testType = await TestType.findById(id);

    if (!testType) {
      return res.status(404).json({
        success: false,
        message: "Test type not found"
      });
    }

    // Check if user has access to this test type (same company)
    if (!isSuperadmin && testType.company.toString() !== companyId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this test type"
      });
    }

    // Soft delete by setting isActive to false
    testType.isActive = false;
    await testType.save();

    res.json({
      success: true,
      message: "Test type deleted successfully"
    });
  } catch (err) {
    console.error('Delete test type error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete test type"
    });
  }
};

