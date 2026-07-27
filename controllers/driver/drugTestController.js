import mongoose from "mongoose";
import { DrugTest } from "../../models/driver/drugTestModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { comparePassword } from "../../services/bcrypt.js";
import { User } from "../../models/driver/userModel.js";

// ✅ Create Drug Test Request
export const createDrugTest = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === "superadmin";

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

   
    const {
      driverId,
      testType,
      reason,
      scheduledDate,
      scheduledTime,
      labName,
      description,
      collectionSiteAddress
    } = req.body;

    // ✅ Required field validation
    const normalizedDescription = (description || labName || '').toString().trim();

    if (!driverId || !testType || !reason || !scheduledDate || !normalizedDescription) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: driverId, testType, reason, scheduledDate, and description are required."
      });
    }

    // ✅ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID format"
      });
    }

    // ✅ Combine date & time
    let scheduledDateTime = new Date(scheduledDate);

    if (scheduledTime) {
      const [hours, minutes] = scheduledTime.split(":");
      scheduledDateTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    } else {
      scheduledDateTime.setHours(0, 0, 0, 0);
    }

    // ✅ Handle uploaded files professionally (like other controllers)
    let consentFormUrl = "";
    let drugTestDocumentUrl = "";

    if (req.files) {
      // Handle consentForm file
      const consentFormFile = Array.isArray(req.files.consentForm) 
        ? req.files.consentForm[0] 
        : req.files.consentForm;
      
      if (consentFormFile) {
        if (process.env.NODE_ENV === "production") {
          consentFormUrl = consentFormFile.location;
        } else {
          consentFormUrl = `${req.protocol}://${req.get("host")}/${consentFormFile.path.replace(/\\/g, "/")}`;
        }
      }

      // Handle drugTestDocument file
      const drugTestDocumentFile = Array.isArray(req.files.drugTestDocument) 
        ? req.files.drugTestDocument[0] 
        : req.files.drugTestDocument;
      
      if (drugTestDocumentFile) {
        if (process.env.NODE_ENV === "production") {
          drugTestDocumentUrl = drugTestDocumentFile.location;
        } else {
          drugTestDocumentUrl = `${req.protocol}://${req.get("host")}/${drugTestDocumentFile.path.replace(/\\/g, "/")}`;
        }
      }
    }

   
    const payload = {
      driverId,
      testType: testType.trim(),
      reason: reason.trim(),
      scheduledDate: scheduledDateTime,
      scheduledTime: scheduledTime || "",
      labName: normalizedDescription,
      collectionSiteAddress: collectionSiteAddress ? collectionSiteAddress.trim() : undefined,
      consentFormUrl: consentFormUrl || undefined,
      drugTestDocumentUrl: drugTestDocumentUrl || undefined,
      status: "pending",
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    };

    const drugTest = new DrugTest(payload);
    await drugTest.save();

    await drugTest.populate("driverId", "name email");
    await drugTest.populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Drug test request created successfully",
      data: drugTest
    });
  } catch (err) {
    console.error("Create drug test error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create drug test request"
    });
  }
};

// ✅ Get All Drug Test Requests
export const getDrugTests = async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === 'superadmin';
    
    // Get company filter with strict validation
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // CRITICAL: If not superadmin and no valid company, return empty data immediately
    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ getDrugTests: Admin has no company - returning empty data');
      return res.json({
        success: true,
        data: [],
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    const { search, driverId, status, testType } = req.query;
    const query = {};

    // CRITICAL: For non-superadmin, MUST include company filter
    if (isSuperadmin) {
      // Superadmin can see all drug tests
    } else if (hasValidCompany && companyId) {
      // Validate and convert companyId to ObjectId if it's a string
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        query.company = new mongoose.Types.ObjectId(companyId);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid company ID format"
        });
      }
    } else {
      // No valid company - return empty data
      return res.json({
        success: true,
        data: []
      });
    }

    if (driverId && driverId !== 'all') {
      // Validate and convert driverId to ObjectId
      if (mongoose.Types.ObjectId.isValid(driverId)) {
        query.driverId = new mongoose.Types.ObjectId(driverId);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid driver ID format"
        });
      }
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (testType && testType !== 'all') {
      query.testType = testType;
    }

    if (search) {
      query.$or = [
        { testType: { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } },
        { labName: { $regex: search, $options: 'i' } }, // stored field
        { collectionSiteName: { $regex: search, $options: 'i' } }
      ];
    }

    const drugTests = await DrugTest.find(query)
      .populate('driverId', 'name email')
      .populate('createdBy', 'name email')
      .sort({ scheduledDate: -1, createdAt: -1 })
      .lean();

    // Transform data to match frontend expectations
    const transformedDrugTests = drugTests.map(test => {
      const scheduledDate = test.scheduledDate ? new Date(test.scheduledDate) : null;
      return {
        _id: test._id,
        driverId: test.driverId?._id || test.driverId,
        driverName: test.driverId?.name || 'Unknown Driver',
        testType: test.testType,
        reason: test.reason,
        scheduledDate: scheduledDate ? scheduledDate.toISOString().split('T')[0] : '',
        scheduledTime: test.scheduledTime || '',
        description: test.labName,
        consentFormUrl: test.consentFormUrl || '',
        drugTestDocumentUrl: test.drugTestDocumentUrl || '',
        collectionSiteName: test.collectionSiteName || '',
        collectionSiteAddress: test.collectionSiteAddress || '',
        collectionSitePhone: test.collectionSitePhone || '',
        importantDetails: test.importantDetails || '',
        status: test.status || 'pending',
        createdAt: test.createdAt,
        updatedAt: test.updatedAt
      };
    });

    res.json({
      success: true,
      data: transformedDrugTests
    });
  } catch (err) {
    console.error('Get drug tests error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch drug test requests"
    });
  }
};

// ✅ Get Drug Test By ID
export const getDrugTestById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        query.company = new mongoose.Types.ObjectId(companyId);
      }
    }

    const drugTest = await DrugTest.findOne(query)
      .populate('driverId', 'name email')
      .populate('createdBy', 'name email')
      .lean();

    if (!drugTest) {
      return res.status(404).json({
        success: false,
        message: "Drug test request not found"
      });
    }

    // Transform data
    const scheduledDate = drugTest.scheduledDate ? new Date(drugTest.scheduledDate) : null;
    const transformedDrugTest = {
      _id: drugTest._id,
      driverId: drugTest.driverId?._id || drugTest.driverId,
      driverName: drugTest.driverId?.name || 'Unknown Driver',
      testType: drugTest.testType,
      reason: drugTest.reason,
      scheduledDate: scheduledDate ? scheduledDate.toISOString().split('T')[0] : '',
      scheduledTime: drugTest.scheduledTime || '',
      description: drugTest.labName,
      consentFormUrl: drugTest.consentFormUrl || '',
      drugTestDocumentUrl: drugTest.drugTestDocumentUrl || '',
      collectionSiteName: drugTest.collectionSiteName || '',
      collectionSiteAddress: drugTest.collectionSiteAddress || '',
      collectionSitePhone: drugTest.collectionSitePhone || '',
      importantDetails: drugTest.importantDetails || '',
      status: drugTest.status || 'pending',
      createdAt: drugTest.createdAt,
      updatedAt: drugTest.updatedAt,
      createdBy: drugTest.createdBy
    };

    res.json({
      success: true,
      data: transformedDrugTest
    });
  } catch (err) {
    console.error('Get drug test by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch drug test request"
    });
  }
};

// ✅ Update Drug Test Request
export const updateDrugTest = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        query.company = new mongoose.Types.ObjectId(companyId);
      }
    }

    const drugTest = await DrugTest.findOne(query);
    if (!drugTest) {
      return res.status(404).json({
        success: false,
        message: "Drug test request not found"
      });
    }

    const updateData = {};
    
    if (req.body.driverId) {
      if (!mongoose.Types.ObjectId.isValid(req.body.driverId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid driver ID format"
        });
      }
      updateData.driverId = new mongoose.Types.ObjectId(req.body.driverId);
    }
    if (req.body.testType) updateData.testType = req.body.testType.trim();
    if (req.body.reason) updateData.reason = req.body.reason.trim();
    if (req.body.scheduledDate) {
      let scheduledDateTime = new Date(req.body.scheduledDate);
      if (req.body.scheduledTime) {
        const [hours, minutes] = req.body.scheduledTime.split(':');
        scheduledDateTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
      } else {
        scheduledDateTime.setHours(0, 0, 0, 0);
      }
      updateData.scheduledDate = scheduledDateTime;
    }
    if (req.body.scheduledTime !== undefined) {
      updateData.scheduledTime = req.body.scheduledTime || '';
      // If date exists, update the combined datetime
      if (req.body.scheduledDate) {
        let scheduledDateTime = new Date(req.body.scheduledDate);
        if (req.body.scheduledTime) {
          const [hours, minutes] = req.body.scheduledTime.split(':');
          scheduledDateTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
        }
        updateData.scheduledDate = scheduledDateTime;
      }
    }
    if (req.body.description) updateData.labName = req.body.description.trim();
    else if (req.body.labName) updateData.labName = req.body.labName.trim();
    if (req.body.collectionSiteAddress !== undefined) updateData.collectionSiteAddress = req.body.collectionSiteAddress ? req.body.collectionSiteAddress.trim() : '';
    
    // Handle file uploads for update
    if (req.files) {
      // Handle consentForm file
      const consentFormFile = Array.isArray(req.files.consentForm) 
        ? req.files.consentForm[0] 
        : req.files.consentForm;
      
      if (consentFormFile) {
        if (process.env.NODE_ENV === "production") {
          updateData.consentFormUrl = consentFormFile.location;
        } else {
          updateData.consentFormUrl = `${req.protocol}://${req.get("host")}/${consentFormFile.path.replace(/\\/g, "/")}`;
        }
      }

      // Handle drugTestDocument file
      const drugTestDocumentFile = Array.isArray(req.files.drugTestDocument) 
        ? req.files.drugTestDocument[0] 
        : req.files.drugTestDocument;
      
      if (drugTestDocumentFile) {
        if (process.env.NODE_ENV === "production") {
          updateData.drugTestDocumentUrl = drugTestDocumentFile.location;
        } else {
          updateData.drugTestDocumentUrl = `${req.protocol}://${req.get("host")}/${drugTestDocumentFile.path.replace(/\\/g, "/")}`;
        }
      }
    }
    
    // Keep these fields for backward compatibility (if they exist in old records)
    if (req.body.collectionSiteName !== undefined) updateData.collectionSiteName = req.body.collectionSiteName ? req.body.collectionSiteName.trim() : '';
    if (req.body.collectionSiteAddress !== undefined) updateData.collectionSiteAddress = req.body.collectionSiteAddress ? req.body.collectionSiteAddress.trim() : '';
    if (req.body.collectionSitePhone !== undefined) updateData.collectionSitePhone = req.body.collectionSitePhone ? req.body.collectionSitePhone.trim() : '';
    if (req.body.importantDetails !== undefined) updateData.importantDetails = req.body.importantDetails ? req.body.importantDetails.trim() : '';
    if (req.body.status) updateData.status = req.body.status;

    Object.assign(drugTest, updateData);
    await drugTest.save();

    await drugTest.populate('driverId', 'name email');
    await drugTest.populate('createdBy', 'name email');

    // Transform data
    const scheduledDate = drugTest.scheduledDate ? new Date(drugTest.scheduledDate) : null;
    const transformedDrugTest = {
      _id: drugTest._id,
      driverId: drugTest.driverId?._id || drugTest.driverId,
      driverName: drugTest.driverId?.name || 'Unknown Driver',
      testType: drugTest.testType,
      reason: drugTest.reason,
      scheduledDate: scheduledDate ? scheduledDate.toISOString().split('T')[0] : '',
      scheduledTime: drugTest.scheduledTime || '',
      description: drugTest.labName,
      consentFormUrl: drugTest.consentFormUrl || '',
      drugTestDocumentUrl: drugTest.drugTestDocumentUrl || '',
      collectionSiteName: drugTest.collectionSiteName || '',
      collectionSiteAddress: drugTest.collectionSiteAddress || '',
      collectionSitePhone: drugTest.collectionSitePhone || '',
      importantDetails: drugTest.importantDetails || '',
      status: drugTest.status || 'pending',
      createdAt: drugTest.createdAt,
      updatedAt: drugTest.updatedAt
    };

    res.json({
      success: true,
      message: "Drug test request updated successfully",
      data: transformedDrugTest
    });
  } catch (err) {
    console.error('Update drug test error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update drug test request"
    });
  }
};

// ✅ Delete Drug Test Request
export const deleteDrugTest = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        query.company = new mongoose.Types.ObjectId(companyId);
      }
    }

    const drugTest = await DrugTest.findOneAndDelete(query);
    if (!drugTest) {
      return res.status(404).json({
        success: false,
        message: "Drug test request not found"
      });
    }

    res.json({
      success: true,
      message: "Drug test request deleted successfully"
    });
  } catch (err) {
    console.error('Delete drug test error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete drug test request"
    });
  }
};

// ✅ Verify Password for Drug Test Section Access
// Verifies the current logged-in user's password
export const verifyDrugTestPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required"
      });
    }

    // Get the current logged-in user from the JWT token (set by authMiddleware)
    const userId = req.user?._id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    // Find the user in the database
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Verify the provided password against the user's stored password hash
    const isPasswordValid = await comparePassword(password, user.password);

    if (isPasswordValid) {
      res.json({
        success: true,
        message: "Password verified successfully"
      });
    } else {
      // Use 400 instead of 401 to avoid triggering auth interceptors
      res.status(400).json({
        success: false,
        message: "Incorrect password. Please enter your account password."
      });
    }
  } catch (err) {
    console.error('Verify drug test password error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to verify password"
    });
  }
};

