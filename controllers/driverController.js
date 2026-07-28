import { User } from "../models/driver/userModel.js";
import Trip from "../models/tripModel.js";
import Order from "../models/orderModel.js";
import { CompanySettings } from "../models/driver/companysettingsModel.js";
import { DeductionAddition, Settlement } from "../models/hr/settlementModel.js";
import { validationResult } from "express-validator";
import { comparePassword, hashPassword } from "../services/bcrypt.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { parseImportFile } from "../utils/importParser.js";


// Change Password
export const changeDriverPassword = async (req, res) => {
  try {
    // Use req.driver if available (from driverAuth middleware), otherwise fallback to req.user
    const userId = req.driver?._id || req.user?._id;

    if (!userId) {
      console.error('❌ No user ID found in request');
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const { currentPassword, newPassword } = req.body;

    console.log('🔐 Change password request:', { userId: userId.toString(), hasCurrentPassword: !!currentPassword, hasNewPassword: !!newPassword });

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Both current and new password are required" });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Compare current password
    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      console.log('❌ Password mismatch for user:', userId.toString());
      return res.status(400).json({ success: false, message: "Current password does not match" });
    }

    // Hash new password
    user.password = await hashPassword(newPassword);

    await user.save();

    console.log('✅ Password changed successfully for user:', userId.toString());
    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error('❌ Error changing password:', error);
    res.status(500).json({ success: false, message: "Error changing password", error: error.message });
  }
};

export const driverProfile = async (req, res) => {
  try {
    const driverId = req.driver?._id;

    if (!driverId) {
      return res.status(401).json({ success: false, message: "Driver not authenticated" });
    }

    const driver = await User.findById(driverId)
      .select("name email phone country status profileImageUrl createdAt updatedAt company internalId joinDate location details")
      .populate('flagsUpdatedBy', 'name email')
      .populate({
        path: "company",
        select: "companyName companyCode contactEmail contactPhone address logoUrl notificationPreferences",
      })
      .lean();

    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    // Ensure company details are always included when available
    if (driver.company) {
      const hasCompanyFields =
        typeof driver.company === "object" &&
        driver.company !== null &&
        ("companyName" in driver.company || "companyCode" in driver.company);

      if (!hasCompanyFields) {
        const companyId =
          typeof driver.company === "string"
            ? driver.company
            : (driver.company?._id || driver.company?.toString());

        if (companyId) {
          const normalizedId = mongoose.Types.ObjectId.isValid(companyId)
            ? companyId
            : null;

          if (normalizedId) {
            const companyDoc = await CompanySettings.findById(normalizedId)
              .select("companyName companyCode contactEmail contactPhone address logoUrl notificationPreferences")
              .lean();

            driver.company = companyDoc || null;
          } else {
            driver.company = null;
          }
        } else {
          driver.company = null;
        }
      }
    } else if (req.user?.company) {
      // Fallback: try to load company using authenticated driver's company id
      const companyDoc = await CompanySettings.findById(req.user.company)
        .select("companyName companyCode contactEmail contactPhone address logoUrl notificationPreferences")
        .lean();
      driver.company = companyDoc || null;
    }

    // Generate pre-signed URL for profile image if stored in private S3
    let profileImage = driver.profileImageUrl || null;
    if (profileImage && (profileImage.includes('s3.amazonaws.com') || profileImage.includes('.s3.'))) {
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { getS3ClientForBucket } = await import("../config/awsConfig.js");

        const cleanUrl = profileImage.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let key = decodeURIComponent(urlObj.pathname.substring(1));

        if (urlObj.hostname.includes('.s3.')) {
          bucketName = urlObj.hostname.split('.s3.')[0];
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          bucketName = pathParts[0];
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }

        if (key.includes('?')) key = key.split('?')[0];

        const s3Client = await getS3ClientForBucket(bucketName, profileImage);
        const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
        profileImage = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      } catch (signErr) {
        console.error('⚠️ Failed to generate signed URL for profile image:', signErr.message);
      }
    }

    // Transform driver data to include all fields in flat structure for frontend
    const transformedDriver = {
      ...driver,
      profileImage,
      mobile: driver.details?.cell1 || '',
      gender: driver.details?.gender || '',
      citizenship: driver.details?.citizenship || '',
      address: driver.location?.address || '',
      wsib: driver.details?.wsib ? 'Yes' : 'No',
      fastCard: driver.details?.fastCardNo || '',
      medicalTracking: driver.details?.medicalRequired ? 'Yes' : 'No',
      csa: driver.details?.csa ? 'Yes' : 'No',
      employmentDetails: driver.details?.remark || ''
    };

    res.json({
      success: true,
      message: "Driver profile fetched successfully",
      data: transformedDriver,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
export const activeLoads = async (req, res) => {
  try {
    const driverId = req.driver._id

  } catch (error) {

  }
}

// ✅ Driver self-register
export const registerDriver = async (req, res) => {
  try {
    console.log(req.file);

    // Validate inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    let { name, email, phone, country, password, location } = req.body;
    const driverExist = await User.findOne({ email: email })
    if (driverExist) {
      return res.json({ success: false, message: "driver already exist with email" })
    }
    // Hash password
    password = await hashPassword(password);

    // ✅ Handle profile image upload
    let profileImageUrl = null;
    if (req.file) {
      if (process.env.NODE_ENV === "production") {
        // From AWS S3 (multer-s3 gives location property)
        profileImageUrl = req.file.location;
      } else {
        // From local storage
        profileImageUrl = `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, '/')}`;
      }
    }

    const driver = new User({
      name,
      email,
      phone,
      country,
      password,
      status: 'active',
      profileImageUrl,
      location: location || {}, // expect { longitude, latitude }
    });

    await driver.save();

    res.status(201).json({
      success: true,
      message: "Driver registered successfully",
      driver,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
export const loginDriver = async (req, res) => {
  try {
    // validate inputs (if using express-validator)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;



    // check if driver exists
    const driver = await User.findOne({ email });


    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    // Check if user is active (must be before password validation)
    if (driver.status !== 'active') {
      console.log('❌ Login attempt blocked - inactive account:', {
        userId: driver._id,
        email: driver.email,
        status: driver.status,
        role: driver.role
      });
      return res.status(403).json({
        success: false,
        message: "Your account is not active. Please contact administrator."
      });
    }

    // Check if driver has mobile app access
    if (!driver.mobileApp) {
      console.log('❌ Login attempt blocked - no mobile app access:', {
        userId: driver._id,
        email: driver.email,
        mobileApp: driver.mobileApp
      });
      return res.status(403).json({
        success: false,
        message: "You don't have access to use the mobile app. Please contact administrator."
      });
    }

    // compare password
    const isMatch = await comparePassword(password, driver.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Check admin subscription/trial access (block login if expired)
    const { checkUserAccess } = await import("../utils/adminAccessUtils.js");
    const accessCheck = await checkUserAccess(driver._id);
    const subscriptionStatus = {
      accessLevel: accessCheck.accessLevel || (accessCheck.hasAccess ? 'full' : 'none'),
      reason: accessCheck.reason,
      message: accessCheck.message
    };

    if (!accessCheck.hasAccess && accessCheck.accessLevel !== 'limited') {
      console.log('❌ Driver login blocked - admin subscription/trial issue:', {
        userId: driver._id,
        email: driver.email,
        role: driver.role,
        reason: accessCheck.reason,
        message: accessCheck.message
      });
      return res.status(403).json({
        success: false,
        message: accessCheck.message || "Access denied. Admin trial/subscription expired. Please contact administrator."
      });
    }

    // ✅ create JWT token
    const token = jwt.sign(
      { id: driver._id, role: "driver" }, // payload
      process.env.JWT_SECRET, // secret key
      { expiresIn: "7d" } // expiry time
    );

    // ✅ if login success
    res.status(200).json({
      success: true,
      message: "Login successful",
      driver: {
        id: driver._id,
        name: driver.name,
        email: driver.email,
        status: driver.status,
        token: token,
        subscriptionStatus
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await User.findOne({ _id: id });
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver does not exist" });
    }
    await User.findOneAndDelete({ _id: id });

    // Cascade: remove all deductions/additions for this driver and clean up settlement refs
    const orphanedDeds = await DeductionAddition.find({ assignedTo: id }).select('_id').lean();
    if (orphanedDeds.length > 0) {
      const orphanIds = orphanedDeds.map(d => d._id);
      await DeductionAddition.deleteMany({ _id: { $in: orphanIds } });
      await Settlement.updateMany(
        { appliedDeductions: { $in: orphanIds } },
        { $pull: { appliedDeductions: { $in: orphanIds } } }
      );
    }

    res.status(200).json({
      success: true,
      message: "Driver deleted successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

// ✅ Get Driver Profile + Documents
export const getDriverById = async (req, res) => {
  try {
    const normalizeRecurrenceForDisplay = (value) => {
      const v = (value || '').toString().trim().toLowerCase();
      if (v === 'one-time' || v === 'one time' || v === 'onetime') return 'One Time';
      if (v === 'one time payment') return 'One Time Payment';
      if (v === 'bi-weekly' || v === 'biweekly' || v === 'bi weekly') return 'Bi-Weekly';
      if (v === 'weekly') return 'Weekly';
      if (v === 'monthly') return 'Monthly';
      if (v === 'quarterly') return 'Quarterly';
      if (v === 'yearly' || v === 'annual') return 'Yearly';
      // Fallback: title-case words
      return (value || '').toString();
    };

    const normalizeIntervalToRecurrence = (value) => {
      const v = (value || '').toString().trim().toLowerCase();
      if (!v) return 'One-time';
      if (v === 'one-time' || v === 'one time' || v === 'onetime') return 'One-time';
      if (v === 'one time payment') return 'One Time Payment';
      if (v === 'bi-weekly' || v === 'biweekly' || v === 'bi weekly') return 'Bi-weekly';
      if (v === 'weekly') return 'Weekly';
      if (v === 'monthly') return 'Monthly';
      if (v === 'quarterly') return 'Quarterly';
      if (v === 'yearly' || v === 'annual') return 'Yearly';
      return (value || '').toString();
    };
    const driverId = new mongoose.Types.ObjectId(req.params.id);

    const driverProfile = await User.aggregate([
      {
        $match: { _id: driverId }
      },
      {
        $lookup: {
          from: "vehicles", // 👈 your Vehicle collection name
          localField: "details.vehicle",
          foreignField: "_id",
          as: "vehicleDetails"
        }
      },
      { $unwind: { path: "$vehicleDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "employeedocuments",
          localField: "_id",
          foreignField: "employee",
          as: "documents"
        }
      },
      {
        $lookup: {
          from: "companysettings",
          localField: "company",
          foreignField: "_id",
          as: "companyDetails"
        }
      },
      { $unwind: { path: "$companyDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "flagsUpdatedBy",
          foreignField: "_id",
          as: "flagsUpdatedByDetails"
        }
      },
      { $unwind: { path: "$flagsUpdatedByDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: 1,
          email: 1,
          phone: 1,
          country: 1,
          state: 1,
          city: 1,
          postalCode: 1,
          role: 1,
          policies: 1,
          profileImageUrl: 1,
          status: 1,
          "location.address": 1,
          "location.unit": 1,
          "location.city": 1,
          "location.state": 1,
          "location.postalCode": 1,
          "location.longitude": 1,
          "location.latitude": 1,
          avatar: 1,
          createdAt: 1,
          updatedAt: 1,
          internalId: 1,
          joinDate: 1,
          dob: 1,
          mobileApp: 1,
          company: 1,
          companyDetails: 1,
          handlesHazardousLoads: 1,
          winterTestRequired: 1,
          flagsUpdatedAt: 1,
          flagsUpdatedBy: {
            $cond: {
              if: { $ifNull: ["$flagsUpdatedByDetails", false] },
              then: {
                _id: "$flagsUpdatedByDetails._id",
                name: "$flagsUpdatedByDetails.name",
                email: "$flagsUpdatedByDetails.email"
              },
              else: null
            }
          },
          "details.licenceNumber": 1,
          "details.driversLicence": 1,
          "details.licenceExpiry": 1,
          "details.licenceState": 1,
          "details.vendor": 1,
          "details.fleet": 1,
          "details.gender": 1,
          "details.cell1": 1,
          "details.cell2": 1,
          "details.citizenship": 1,
          "details.sinNo": 1,
          "details.dateOfBirth": 1,
          "details.postalCode": 1,
          "details.wsib": 1,
          "details.fastCardNo": 1,
          "details.fastCardExpiry": 1,
          "details.fastCardValid": 1,
          "details.medicalRequired": 1,
          "details.csa": 1,
          "details.remark": 1,
          "details.notes": 1,
          "details.vehicle": 1,
          "details.passport": 1,
          "details.passportNumber": 1,
          "details.passportCountry": 1,
          "details.passportExpiry": 1,
          "details.canadianWorkerStatus": 1,
          "details.permanentResidenceExpiry": 1,
          "details.workPermitExpiry": 1,
          "details.workPermitDocumentUrl": 1,
          "details.prCardDocumentUrl": 1,
          "details.wsibAccountNo": 1,
          "details.salaryPerMile": 1,
          "details.salaryPerMileSnow": 1,
          "details.salaryPerMileHighTemp": 1,
          "details.highTempThreshold": 1,
          "details.hireDate": 1,
          "details.termDate": 1,
          "details.vacationPay": 1,
          "details.incorporation": 1,
          "details.gstNo": 1,
          "details.companyFlag": 1,
          "details.paymentMethod": 1,
          "details.cppQppExempt": 1,
          "details.fedTaxExempt": 1,
          "details.provTaxExempt": 1,
          "details.customHst": 1,
          "details.driverName": 1,
          "details.paymentAddress": 1,
          "details.paymentSearchAddress": 1,
          "details.paymentCity": 1,
          "details.paymentPostalCode": 1,
          "details.paymentCountry": 1,
          "details.paymentStateProvince": 1,
          "details.driverTypeSolo": 1,
          "details.cross_border_eligible": 1,
          "details.drug_tests": 1,
          // Payment rate fields
          "details.mileRate": 1,
          "details.mileRateTeam": 1,
          "details.emptyMileRate": 1,
          "details.emptyMileRateTeam": 1,
          "details.hourlyRate": 1,
          "details.weightRate": 1,
          "details.percentageRate": 1,
          "details.bonusDrop": 1,
          "details.bonusPick": 1,
          "details.bonusLayover": 1,
          "details.perTripAmount": 1,
          "details.dailyRate": 1,
          vehicleDetails: 1,
          documents: 1
        }
      }
    ]);

    if (!driverProfile || driverProfile.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    // Transform driver data to match frontend expectations
    const driver = driverProfile[0];

    // Fetch documents separately using EmployeeDocument model to ensure we get all fields with proper structure
    let documents = [];
    try {
      const { EmployeeDocument } = await import("../models/driver/employeeDocumentModel.js");
      const employeeDocuments = await EmployeeDocument.find({ employee: driverId })
        .select('_id documentType documentNumber issueDate expiryDate description status fileUrl fileName fileSize mimeType ignoreExpiration uploadedBy verifiedBy createdAt updatedAt')
        .lean();

      // Console log raw documents from database
      console.log(`📦 Raw documents fetched from DB (${employeeDocuments.length} documents):`);
      employeeDocuments.forEach((doc, index) => {
        console.log(`  [${index + 1}] ID: ${doc._id}`);
        console.log(`      - documentType: ${doc.documentType}`);
        console.log(`      - description: ${doc.description || 'N/A'}`);
        console.log(`      - fileUrl: ${doc.fileUrl || 'NULL/UNDEFINED'}`);
        console.log(`      - fileName: ${doc.fileName || 'NULL/UNDEFINED'}`);
        console.log(`      - fileSize: ${doc.fileSize || 'NULL/UNDEFINED'}`);
        console.log(`      - mimeType: ${doc.mimeType || 'NULL/UNDEFINED'}`);
        console.log(`      - Full doc keys:`, Object.keys(doc));
      });

      // Generate signed URLs for S3 files
      if (employeeDocuments.length > 0) {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        documents = await Promise.all(employeeDocuments.map(async (doc) => {
          const docObj = { ...doc };

          // Ensure fileUrl and fileName are always included (even if null/undefined)
          if (!docObj.hasOwnProperty('fileUrl')) {
            docObj.fileUrl = null;
          }
          if (!docObj.hasOwnProperty('fileName')) {
            docObj.fileName = null;
          }
          if (!docObj.hasOwnProperty('fileSize')) {
            docObj.fileSize = null;
          }
          if (!docObj.hasOwnProperty('mimeType')) {
            docObj.mimeType = null;
          }

          console.log(`📄 Processing document ${docObj._id}: fileUrl=${docObj.fileUrl || 'null'}, fileName=${docObj.fileName || 'null'}`);

          // Generate presigned URL if it's an S3 URL
          if (docObj.fileUrl &&
            (docObj.fileUrl.includes('s3.amazonaws.com') ||
              docObj.fileUrl.includes('.s3.'))) {
            try {
              const cleanUrl = docObj.fileUrl.split('?')[0].split('#')[0];
              const urlObj = new URL(cleanUrl);
              let bucketName = process.env.AWS_S3_BUCKET_NAME;
              let key = decodeURIComponent(urlObj.pathname.substring(1));

              if (urlObj.hostname.includes('.s3.')) {
                bucketName = urlObj.hostname.split('.s3.')[0];
                key = decodeURIComponent(urlObj.pathname.substring(1));
              } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                bucketName = pathParts[0];
                key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
              }

              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const getContentType = (mimeType, fileUrl) => {
                if (mimeType) return mimeType;
                const ext = fileUrl.split('.').pop()?.toLowerCase();
                const mimeMap = {
                  'pdf': 'application/pdf',
                  'jpg': 'image/jpeg',
                  'jpeg': 'image/jpeg',
                  'png': 'image/png',
                  'doc': 'application/msword',
                  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                };
                return mimeMap[ext] || 'application/octet-stream';
              };

              const contentType = getContentType(docObj.mimeType, docObj.fileUrl);

              const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: key,
                ResponseContentType: contentType,
              });

              const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
              docObj.fileUrl = signedUrl;
            } catch (error) {
              console.error('Error generating signed URL for document:', error);
            }
          }

          return docObj;
        }));
      }
      console.log(`✅ Fetched ${documents.length} documents for driver ${driverId}`);
    } catch (docError) {
      console.error('Error fetching documents:', docError);
    }

    // Fetch training certificates (Safety Certifications)
    let certifications = [];
    try {
      const { TrainingCertificate } = await import("../models/driver/trainingCertificateModel.js");
      const trainingCertificates = await TrainingCertificate.find({ driverId: driverId })
        .select('_id certificateName certificateType issuedDate expiryDate description notes status fileUrl fileName fileSize mimeType ignoreExpiration uploadedBy createdAt updatedAt')
        .lean();

      // Generate signed URLs for S3 files
      if (trainingCertificates.length > 0) {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        certifications = await Promise.all(trainingCertificates.map(async (cert) => {
          const certObj = {
            ...cert,
            // Map fields for frontend compatibility
            subCategory: cert.certificateType || cert.description || '',
            result: cert.notes || cert.result || '',
            title: cert.certificateName || cert.title || ''
          };

          // Generate presigned URL if it's an S3 URL
          if (certObj.fileUrl &&
            (certObj.fileUrl.includes('s3.amazonaws.com') ||
              certObj.fileUrl.includes('.s3.'))) {
            try {
              const cleanUrl = certObj.fileUrl.split('?')[0].split('#')[0];
              const urlObj = new URL(cleanUrl);
              let bucketName = process.env.AWS_S3_BUCKET_NAME;
              let key = decodeURIComponent(urlObj.pathname.substring(1));

              if (urlObj.hostname.includes('.s3.')) {
                bucketName = urlObj.hostname.split('.s3.')[0];
                key = decodeURIComponent(urlObj.pathname.substring(1));
              } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                bucketName = pathParts[0];
                key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
              }

              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const getContentType = (mimeType, fileUrl) => {
                if (mimeType) return mimeType;
                const ext = fileUrl.split('.').pop()?.toLowerCase();
                const mimeMap = {
                  'pdf': 'application/pdf',
                  'jpg': 'image/jpeg',
                  'jpeg': 'image/jpeg',
                  'png': 'image/png',
                  'doc': 'application/msword',
                  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                };
                return mimeMap[ext] || 'application/octet-stream';
              };

              const contentType = getContentType(certObj.mimeType, certObj.fileUrl);

              const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: key,
                ResponseContentType: contentType,
              });

              const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
              certObj.fileUrl = signedUrl;
            } catch (error) {
              console.error('Error generating signed URL for certificate:', error);
            }
          }

          return certObj;
        }));
      }
      console.log(`✅ Fetched ${certifications.length} training certificates for driver ${driverId}`);
    } catch (certError) {
      console.error('Error fetching training certificates:', certError);
    }

    // Fetch driver tickets (Tickets & Fines)
    let tickets = [];
    try {
      const { DriverTicket } = await import("../models/driverTicketModel.js");
      const driverTickets = await DriverTicket.find({ driver: driverId })
        .select('_id date title description amount currency status fileUrl fileName fileSize mimeType uploadedBy createdAt updatedAt')
        .lean();

      // Generate signed URLs for S3 files
      if (driverTickets.length > 0) {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        tickets = await Promise.all(driverTickets.map(async (ticket) => {
          const ticketObj = { ...ticket };

          // Generate presigned URL if it's an S3 URL
          if (ticketObj.fileUrl &&
            (ticketObj.fileUrl.includes('s3.amazonaws.com') ||
              ticketObj.fileUrl.includes('.s3.'))) {
            try {
              const cleanUrl = ticketObj.fileUrl.split('?')[0].split('#')[0];
              const urlObj = new URL(cleanUrl);
              let bucketName = process.env.AWS_S3_BUCKET_NAME;
              let key = decodeURIComponent(urlObj.pathname.substring(1));

              if (urlObj.hostname.includes('.s3.')) {
                bucketName = urlObj.hostname.split('.s3.')[0];
                key = decodeURIComponent(urlObj.pathname.substring(1));
              } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                bucketName = pathParts[0];
                key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
              }

              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: key
              });

              ticketObj.fileUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
            } catch (error) {
              console.error('Error generating signed URL for ticket:', error);
            }
          }

          return ticketObj;
        }));
      }
      console.log(`✅ Fetched ${tickets.length} tickets for driver ${driverId}`);
    } catch (ticketError) {
      console.error('Error fetching tickets:', ticketError);
    }

    // Fetch driver violations (Tickets / Violations)
    let violations = [];
    try {
      const { DriverViolation } = await import("../models/driverViolationModel.js");
      const driverViolations = await DriverViolation.find({ driver: driverId })
        .select('_id date dateOfIncident violationType title description reportedBy severity actionTaken status ticketInfo currency amount fileUrl fileName fileSize mimeType uploadedBy createdAt updatedAt')
        .lean();

      // Generate signed URLs for S3 files
      if (driverViolations.length > 0) {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        violations = await Promise.all(driverViolations.map(async (violation) => {
          const vioObj = { ...violation };

          // Generate presigned URL if it's an S3 URL
          if (vioObj.fileUrl &&
            (vioObj.fileUrl.includes('s3.amazonaws.com') ||
              vioObj.fileUrl.includes('.s3.'))) {
            try {
              const cleanUrl = vioObj.fileUrl.split('?')[0].split('#')[0];
              const urlObj = new URL(cleanUrl);
              let bucketName = process.env.AWS_S3_BUCKET_NAME;
              let key = decodeURIComponent(urlObj.pathname.substring(1));

              if (urlObj.hostname.includes('.s3.')) {
                bucketName = urlObj.hostname.split('.s3.')[0];
                key = decodeURIComponent(urlObj.pathname.substring(1));
              } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                bucketName = pathParts[0];
                key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
              }

              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const getContentType = (mimeType, fileUrl) => {
                if (mimeType) return mimeType;
                const ext = fileUrl.split('.').pop()?.toLowerCase();
                const mimeMap = {
                  'pdf': 'application/pdf',
                  'jpg': 'image/jpeg',
                  'jpeg': 'image/jpeg',
                  'png': 'image/png',
                  'doc': 'application/msword',
                  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                };
                return mimeMap[ext] || 'application/octet-stream';
              };

              const contentType = getContentType(vioObj.mimeType, vioObj.fileUrl);

              const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: key,
                ResponseContentType: contentType,
              });

              const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
              vioObj.fileUrl = signedUrl;
            } catch (error) {
              console.error('Error generating signed URL for violation:', error);
            }
          }

          return vioObj;
        }));
      }
      console.log(`✅ Fetched ${violations.length} violations for driver ${driverId}`);
    } catch (vioError) {
      console.error('Error fetching violations:', vioError);
    }


    // Fetch deductions and additions (Payroll Deductions/Additions)
    let deductions = [];
    let additions = [];
    try {
      const { DeductionAddition } = await import("../models/hr/settlementModel.js");
      const deductionAdditions = await DeductionAddition.find({ assignedTo: driverId })
        .select('_id name type recurrence amount currency startDate endDate description isActive company createdBy createdAt updatedAt')
        .lean();

      deductions = deductionAdditions.filter(da => da.type === 'Deduction');
      additions = deductionAdditions.filter(da => da.type === 'Addition');

      console.log(`✅ Fetched ${deductions.length} deductions and ${additions.length} additions for driver ${driverId}`);
    } catch (dedAddError) {
      console.error('Error fetching deductions/additions:', dedAddError);
    }

    // Fetch drug tests from driver.details.drug_tests
    let drugTests = [];
    try {
      if (driver.details?.drug_tests && Array.isArray(driver.details.drug_tests) && driver.details.drug_tests.length > 0) {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        drugTests = await Promise.all(driver.details.drug_tests.map(async (dt, index) => {
          // Handle both old format (uploadDriverDrugTest) and new format (createDriver/updateDriver)
          // Old format: test_date, expiry_date, consent_form_url, result_document_url, uploadedAt
          // New format: date, result, labName, fileUrl, fileName, fileSize, mimeType

          const isOldFormat = dt.test_date !== undefined || (dt.uploadedAt !== undefined && dt.date === undefined);

          let dtObj;
          if (isOldFormat) {
            // Old format - map to new format
            // Use uploadedAt as fallback date if test_date doesn't exist
            let dateValue = '';
            if (dt.test_date) {
              dateValue = dt.test_date instanceof Date ? dt.test_date.toISOString().split('T')[0] : (typeof dt.test_date === 'string' ? dt.test_date.split('T')[0] : dt.test_date);
            } else if (dt.uploadedAt) {
              // Use uploadedAt as fallback for date
              dateValue = dt.uploadedAt instanceof Date ? dt.uploadedAt.toISOString().split('T')[0] : (typeof dt.uploadedAt === 'string' ? dt.uploadedAt.split('T')[0] : dt.uploadedAt);
            }

            dtObj = {
              _id: dt._id ? dt._id.toString() : `drug-test-${index}`,
              date: dateValue,
              result: dt.result || '',
              labName: dt.labName || '',
              fileUrl: dt.result_document_url || dt.consent_form_url || dt.fileUrl || null,
              fileName: dt.fileName || null,
              fileSize: dt.fileSize || null,
              mimeType: dt.mimeType || null
            };
          } else {
            // New format
            dtObj = {
              _id: dt._id ? dt._id.toString() : `drug-test-${index}`,
              date: dt.date ? (dt.date instanceof Date ? dt.date.toISOString().split('T')[0] : (typeof dt.date === 'string' ? dt.date.split('T')[0] : dt.date)) : '',
              result: dt.result || '',
              labName: dt.labName || '',
              fileUrl: dt.fileUrl || null,
              fileName: dt.fileName || null,
              fileSize: dt.fileSize || null,
              mimeType: dt.mimeType || null
            };
          }

          console.log(`🧪 Processed drug test ${index} in getDriverById:`, JSON.stringify(dtObj, null, 2));

          if (dtObj.fileUrl && (dtObj.fileUrl.includes('s3.amazonaws.com') || dtObj.fileUrl.includes('.s3.'))) {
            try {
              const cleanUrl = dtObj.fileUrl.split('?')[0].split('#')[0];
              const urlObj = new URL(cleanUrl);
              let bucketName = process.env.AWS_S3_BUCKET_NAME;
              let key = decodeURIComponent(urlObj.pathname.substring(1));

              if (urlObj.hostname.includes('.s3.')) {
                bucketName = urlObj.hostname.split('.s3.')[0];
                key = decodeURIComponent(urlObj.pathname.substring(1));
              } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                bucketName = pathParts[0];
                key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
              }

              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const getContentType = (mimeType, fileUrl) => {
                if (mimeType) return mimeType;
                const ext = fileUrl.split('.').pop()?.toLowerCase();
                const mimeMap = {
                  'pdf': 'application/pdf',
                  'jpg': 'image/jpeg',
                  'jpeg': 'image/jpeg',
                  'png': 'image/png',
                  'doc': 'application/msword',
                  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                };
                return mimeMap[ext] || 'application/octet-stream';
              };

              const contentType = getContentType(dtObj.mimeType, dtObj.fileUrl);
              const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: key,
                ResponseContentType: contentType,
              });

              const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
              dtObj.fileUrl = signedUrl;
            } catch (error) {
              console.error('Error generating signed URL for drug test:', error);
            }
          }
          return dtObj;
        }));
      }
      console.log(`✅ Fetched ${drugTests.length} drug tests for driver ${driverId}`);
    } catch (dtError) {
      console.error('Error fetching drug tests:', dtError);
    }

    // Generate signed URL for profile image if it's an S3 URL
    let profileImageUrl = driver.profileImageUrl;
    if (profileImageUrl &&
      (profileImageUrl.includes('s3.amazonaws.com') ||
        profileImageUrl.includes('.s3.'))) {
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { getS3ClientForBucket } = await import("../config/awsConfig.js");

        const cleanUrl = profileImageUrl.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let key = decodeURIComponent(urlObj.pathname.substring(1));

        if (urlObj.hostname.includes('.s3.')) {
          bucketName = urlObj.hostname.split('.s3.')[0];
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          bucketName = pathParts[0];
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }

        // Clean key from query parameters
        if (key.includes('?')) key = key.split('?')[0];
        if (key.includes('&')) key = key.split('&')[0];

        // Get S3 client with correct region for this bucket
        const s3Client = await getS3ClientForBucket(bucketName, profileImageUrl);

        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentType: 'image/jpeg',
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        profileImageUrl = signedUrl;
      } catch (error) {
        console.error('Error generating signed URL for profile image:', error);
        // Keep original URL if signing fails
      }
    }

    const transformedDriver = {
      ...driver,
      profileImageUrl: profileImageUrl,
      mobile: driver.details?.cell1 || '',
      gender: driver.details?.gender || '',
      citizenship: driver.details?.citizenship || '',
      address: driver.location?.address || driver.location?.address || '',
      // ✅ Ensure unit is returned from location.unit
      unit: driver.location?.unit || '',
      city: driver.city || driver.location?.city || '',
      state: driver.state || driver.location?.state || '',
      // ✅ Ensure postalCode is returned from multiple possible locations
      postalCode: driver.postalCode || driver.location?.postalCode || driver.details?.postalCode || '',
      // Include all detail fields that might be missing
      sinNo: driver.details?.sinNo || '',
      licenceNumber: driver.details?.licenceNumber || driver.details?.driversLicence || '',
      licenceExpiry: driver.details?.licenceExpiry ? (driver.details.licenceExpiry instanceof Date ? driver.details.licenceExpiry.toISOString() : driver.details.licenceExpiry) : '',
      licenceState: driver.details?.licenceState || '',
      passport: driver.details?.passport || driver.details?.passportNumber || '',
      passportCountry: driver.details?.passportCountry || '',
      passportExpiry: driver.details?.passportExpiry ? (driver.details.passportExpiry instanceof Date ? driver.details.passportExpiry.toISOString() : driver.details.passportExpiry) : '',
      wsib: driver.details?.wsib === true ? 'Yes' : (driver.details?.wsib === false ? 'No' : ''),
      wsibAccountNo: driver.details?.wsibAccountNo || '',
      fastCard: driver.details?.fastCardNo || '',
      fastCardExpiry: driver.details?.fastCardExpiry ? (driver.details.fastCardExpiry instanceof Date ? driver.details.fastCardExpiry.toISOString() : driver.details.fastCardExpiry) : '',
      fastCardValid: driver.details?.fastCardValid || false,
      medicalTracking: driver.details?.medicalRequired === true ? 'Yes' : (driver.details?.medicalRequired === false ? 'No' : ''),
      csa: driver.details?.csa === true ? 'Yes' : (driver.details?.csa === false ? 'No' : ''),
      employmentDetails: driver.details?.remark || '',
      notes: driver.details?.notes || '',
      company: driver.company || driver.companyDetails?._id || '',
      canadianWorkerStatus: driver.details?.canadianWorkerStatus || '',
      permanentResidenceExpiry: driver.details?.permanentResidenceExpiry ? (driver.details.permanentResidenceExpiry instanceof Date ? driver.details.permanentResidenceExpiry.toISOString() : driver.details.permanentResidenceExpiry) : '',
      workPermitExpiry: driver.details?.workPermitExpiry ? (driver.details.workPermitExpiry instanceof Date ? driver.details.workPermitExpiry.toISOString() : driver.details.workPermitExpiry) : '',
      workPermitDocumentUrl: driver.details?.workPermitDocumentUrl || null,
      prCardDocumentUrl: driver.details?.prCardDocumentUrl || null,
      fleet: driver.details?.fleet || '',
      // Include salary per mile fields in response
      salaryPerMile: driver.details?.salaryPerMile || '',
      salaryPerMileSnow: driver.details?.salaryPerMileSnow || '',
      salaryPerMileHighTemp: driver.details?.salaryPerMileHighTemp || '',
      highTempThreshold: driver.details?.highTempThreshold || '',
      // Personal Information fields
      hireDate: driver.details?.hireDate ? (driver.details.hireDate instanceof Date ? driver.details.hireDate.toISOString() : driver.details.hireDate) : (driver.joinDate ? (driver.joinDate instanceof Date ? driver.joinDate.toISOString() : driver.joinDate) : null),
      termDate: driver.details?.termDate ? (driver.details.termDate instanceof Date ? driver.details.termDate.toISOString() : driver.details.termDate) : null,
      vacationPay: driver.details?.vacationPay || '',
      incorporation: driver.details?.incorporation || '',
      gstNo: driver.details?.gstNo || '',
      companyFlag: driver.details?.companyFlag || false,
      paymentMethod: driver.details?.paymentMethod || '',
      cppQppExempt: driver.details?.cppQppExempt || false,
      fedTaxExempt: driver.details?.fedTaxExempt || false,
      provTaxExempt: driver.details?.provTaxExempt || false,
      customHst: driver.details?.customHst || '',
      driverName: driver.details?.driverName || '',
      paymentAddress: driver.details?.paymentAddress || '',
      paymentSearchAddress: driver.details?.paymentSearchAddress || '',
      paymentCity: driver.details?.paymentCity || '',
      paymentPostalCode: driver.details?.paymentPostalCode || '',
      paymentCountry: driver.details?.paymentCountry || '',
      paymentStateProvince: driver.details?.paymentStateProvince || '',
      driverTypeSolo: driver.details?.driverTypeSolo !== undefined ? driver.details.driverTypeSolo : true, // true = SOLO, false = TEAM
      // Payment rate fields (ALONE, EMPTY, TEAM, etc.)
      alone: driver.details?.mileRate || 0, // ALONE* = mileRate
      team: driver.details?.mileRateTeam || 0, // TEAM = mileRateTeam
      empty: driver.details?.emptyMileRate || 0, // EMPTY = emptyMileRate
      emptyTeam: driver.details?.emptyMileRateTeam || 0, // EMPTY-TEAM* = emptyMileRateTeam
      hourlyRate: driver.details?.hourlyRate || 0,
      weightRate: driver.details?.weightRate || 0,
      percentageRate: driver.details?.percentageRate || 0,
      bonusDrop: driver.details?.bonusDrop || 0, // BONUS/DROP
      bonusPick: driver.details?.bonusPick || 0, // BONUS/PICK
      bonusLayover: driver.details?.bonusLayover || 0,
      perTripAmount: driver.details?.perTripAmount || 0,
      dailyRate: driver.details?.dailyRate || 0
    };
    console.log('💰 Payment Rate Fields:', {
      mileRate: driver.details?.mileRate,
      emptyMileRate: driver.details?.emptyMileRate,
      mileRateTeam: driver.details?.mileRateTeam,
      emptyMileRateTeam: driver.details?.emptyMileRateTeam,
      bonusDrop: driver.details?.bonusDrop,
      bonusPick: driver.details?.bonusPick,
      bonusLayover: driver.details?.bonusLayover,
      transformedBonusDrop: transformedDriver.bonusDrop,
      transformedBonusPick: transformedDriver.bonusPick,
      transformedBonusLayover: transformedDriver.bonusLayover
    });

    // ✅ Console log the response being sent back
    console.log('📤 GET DRIVER BY ID - Response being sent:', {
      unit: transformedDriver.unit,
      postalCode: transformedDriver.postalCode,
      address: transformedDriver.address,
      city: transformedDriver.city,
      state: transformedDriver.state,
      location: transformedDriver.location,
      sinNo: transformedDriver.sinNo,
      hireDate: transformedDriver.hireDate,
      termDate: transformedDriver.termDate,
      vacationPay: transformedDriver.vacationPay,
      incorporation: transformedDriver.incorporation,
      gstNo: transformedDriver.gstNo,
      companyFlag: transformedDriver.companyFlag,
      fleet: transformedDriver.fleet,
      // Travel Information fields
      licenceNumber: transformedDriver.licenceNumber,
      licenceExpiry: transformedDriver.licenceExpiry,
      licenceState: transformedDriver.licenceState,
      passport: transformedDriver.passport,
      passportCountry: transformedDriver.passportCountry,
      passportExpiry: transformedDriver.passportExpiry,
      fastCard: transformedDriver.fastCard,
      fastCardExpiry: transformedDriver.fastCardExpiry,
      fastCardValid: transformedDriver.fastCardValid,
      canadianWorkerStatus: transformedDriver.canadianWorkerStatus,
      permanentResidenceExpiry: transformedDriver.permanentResidenceExpiry,
      workPermitExpiry: transformedDriver.workPermitExpiry,
      workPermitDocumentUrl: transformedDriver.workPermitDocumentUrl,
      prCardDocumentUrl: transformedDriver.prCardDocumentUrl,
      wsibAccountNo: transformedDriver.wsibAccountNo,
      details: {
        hireDate: driver.details?.hireDate,
        termDate: driver.details?.termDate,
        vacationPay: driver.details?.vacationPay,
        incorporation: driver.details?.incorporation,
        gstNo: driver.details?.gstNo,
        companyFlag: driver.details?.companyFlag,
        fleet: driver.details?.fleet,
        licenceNumber: driver.details?.licenceNumber,
        licenceExpiry: driver.details?.licenceExpiry,
        passportExpiry: driver.details?.passportExpiry,
        fastCardExpiry: driver.details?.fastCardExpiry,
        fastCardValid: driver.details?.fastCardValid,
        canadianWorkerStatus: driver.details?.canadianWorkerStatus,
        permanentResidenceExpiry: driver.details?.permanentResidenceExpiry,
        workPermitExpiry: driver.details?.workPermitExpiry
      }
    });

    // Prepare final response data
    const responseData = {
      ...transformedDriver,
      documents: documents, // Include fetched documents in response
      certifications: certifications, // Include training certificates (Safety Certifications)
      violations: violations, // Include driver violations (Tickets / Violations)
      tickets: tickets, // Include driver tickets (Tickets & Fines)
      deductions: (deductions || []).map((d) => ({
        ...d,
        interval: normalizeRecurrenceForDisplay(d.recurrence || d.interval || '')
      })), // Include payroll deductions (+ UI-friendly interval)
      additions: (additions || []).map((a) => ({
        ...a,
        interval: normalizeRecurrenceForDisplay(a.recurrence || a.interval || '')
      })), // Include payroll additions (+ UI-friendly interval)
      drugTests: drugTests // Include drug tests
    };

    // Console log the response values
    console.log('📤 GET DRIVER BY ID - Response Data:');
    console.log('  - Driver ID:', driverId.toString());
    console.log('  - Driver Name:', responseData.name);
    console.log('  - Documents Count:', documents.length);
    console.log('  - Certifications Count:', certifications.length);
    console.log('  - Violations Count:', violations.length);
    console.log('  - Tickets Count:', tickets.length);
    console.log('  - Deductions Count:', deductions.length);
    console.log('  - Additions Count:', additions.length);

    if (documents.length > 0) {
      console.log('  - Documents Details:');
      documents.forEach((doc, index) => {
        console.log(`    [${index + 1}] ID: ${doc._id}, Type: ${doc.documentType}, Description: ${doc.description || 'N/A'}, FileUrl: ${doc.fileUrl ? 'Yes' : 'No'}, FileName: ${doc.fileName || 'N/A'}`);
      });
    }

    if (certifications.length > 0) {
      console.log('  - Certifications Details:');
      certifications.forEach((cert, index) => {
        console.log(`    [${index + 1}] ID: ${cert._id}, Name: ${cert.certificateName || 'N/A'}, Expiry: ${cert.expiryDate || 'N/A'}, FileUrl: ${cert.fileUrl ? 'Yes' : 'No'}`);
      });
    }

    if (violations.length > 0) {
      console.log('  - Violations Details:');
      violations.forEach((vio, index) => {
        console.log(`    [${index + 1}] ID: ${vio._id}, Type: ${vio.violationType || 'N/A'}, Date: ${vio.date || 'N/A'}, Ticket: ${vio.ticketInfo?.ticketNumber || 'N/A'}, FileUrl: ${vio.fileUrl ? 'Yes' : 'No'}`);
      });
    }

    if (deductions.length > 0) {
      console.log('  - Deductions Details:');
      deductions.forEach((ded, index) => {
        console.log(`    [${index + 1}] ID: ${ded._id}, Name: ${ded.name || 'N/A'}, Amount: ${ded.amount || 0}, Recurrence: ${ded.recurrence || 'N/A'}`);
      });
    }

    if (additions.length > 0) {
      console.log('  - Additions Details:');
      additions.forEach((add, index) => {
        console.log(`    [${index + 1}] ID: ${add._id}, Name: ${add.name || 'N/A'}, Amount: ${add.amount || 0}, Recurrence: ${add.recurrence || 'N/A'}`);
      });
    }

    console.log('📤 Full Response Data Structure:', JSON.stringify(responseData, null, 2));

    res.json({
      success: true,
      message: "Driver profile with documents",
      data: responseData
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Error fetching driver", error: err.message });
  }
};

// ✅ Create driver
export const createDriver = async (req, res) => {
  try {
    // ✅ Console log all fields received in req.body
    console.log('📥 CREATE DRIVER - Request Body:', JSON.stringify(req.body, null, 2));
    console.log('📥 CREATE DRIVER - Request Body Keys:', Object.keys(req.body));
    console.log('📥 CREATE DRIVER - Request Files:', req.files ? Object.keys(req.files) : 'No files');
    if (req.files) {
      console.log('📥 CREATE DRIVER - Files Details:', Object.entries(req.files).map(([key, value]) => ({
        field: key,
        count: Array.isArray(value) ? value.length : (value ? 1 : 0),
        firstFile: Array.isArray(value) ? (value[0] ? { name: value[0].originalname, size: value[0].size } : null) : (value ? { name: value.originalname, size: value.size } : null)
      })));
    }

    const {
      name,
      phone,
      email,
      country,
      password,
      role = 'driver',
      policies,
      internalId,
      joinDate,
      dob,
      gender,
      // company - removed from request, auto-assigned from user's company
      employmentDetails,
      mobile,
      citizenship,
      address,
      unit,
      city,
      state,
      postalCode,
      sinNo,
      licenceNumber,
      licenceExpiry,
      licenceState,
      passport,
      passportCountry,
      passportExpiry,
      wsib,
      fastCard,
      fastCardExpiry,
      fastCardValid,
      medicalTracking,
      csa,
      status = 'active',
      mobileApp,
      // Salary per mile fields
      salaryPerMile,
      salaryPerMileSnow,
      salaryPerMileHighTemp,
      highTempThreshold,
      // Payment rate fields
      mileRate,
      mileRateTeam,
      emptyMileRate,
      emptyMileRateTeam,
      hourlyRate,
      weightRate,
      percentageRate,
      bonusDrop,
      bonusPick,
      bonusLayover,
      perTripAmount,
      dailyRate,
      paymentMethod,
      // Personal Information fields
      incorporation,
      driverName,
      paymentAddress,
      paymentSearchAddress,
      paymentCity,
      paymentPostalCode,
      paymentCountry,
      paymentStateProvince,
      gstNo,
      vacationPay,
      companyFlag,
      // Exemption and additional fields
      cppExempt,
      payrollTaxExempt,
      customHst,
      // Driver Type (SOLO/TEAM)
      driverTypeSolo,
      solo,
      cross_border_eligible,
      // Travel Information
      canadianWorkerStatus,
      permanentResidenceExpiry,
      workPermitExpiry,
      wsibAccountNo,
      // Related data arrays (JSON strings from frontend)
      documents,
      certifications,
      violations,
      deductions,
      additions,
      notes,
      drugTests
    } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      // Check if company exists (handle both populated and non-populated)
      const hasCompany = req.user.company && (
        typeof req.user.company === 'string' ||
        req.user.company._id ||
        req.user.company.toString
      );

      if (!hasCompany) {
        console.error('❌ User attempting to create driver without company:', {
          userId: req.user._id,
          role: req.user.role,
          company: req.user.company
        });
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating drivers. Go to Company Settings to set up your company."
        });
      }
    }

    // Check if internalId is provided, if not generate one
    let finalInternalId = internalId;
    if (!finalInternalId) {
      // Generate internalId based on role and timestamp
      const timestamp = Date.now().toString().slice(-6);
      const rolePrefix = role === 'driver' ? 'DRV' : 'EMP';
      finalInternalId = `${rolePrefix}-${timestamp}`;
    }

    // Check if internalId already exists
    const existingInternalId = await User.findOne({ internalId: finalInternalId });
    if (existingInternalId) {
      return res.json({ success: false, message: "Internal ID already exists" });
    }

    // Hash password before saving
    const hashedPassword = await hashPassword(password);

    // ✅ Handle profile image upload
    // Support both single file (req.file) and fields (req.files.file)
    let profileImageUrl = null;
    const profileFile = req.files && req.files.file ?
      (Array.isArray(req.files.file) ? req.files.file[0] : req.files.file) :
      req.file;

    if (profileFile) {
      if (process.env.NODE_ENV === "production") {
        // From AWS S3 (multer-s3 gives location property)
        profileImageUrl = profileFile.location;
      } else {
        // From local storage
        profileImageUrl = `${req.protocol}://${req.get("host")}/${profileFile.path.replace(/\\/g, '/')}`;
      }
    }

    // Convert string booleans to actual booleans
    const wsibBoolean = wsib === 'true' || wsib === true || wsib === 'Yes' || wsib === 'yes';
    const csaBoolean = csa === 'true' || csa === true || csa === 'Yes' || csa === 'yes';
    const medicalBoolean = medicalTracking === 'true' || medicalTracking === true || medicalTracking === 'Yes' || medicalTracking === 'yes';

    // Build location object if address or location fields are provided
    const locationObj = {};
    if (address) locationObj.address = address;
    if (unit) locationObj.unit = unit;
    if (city) locationObj.city = city;
    if (state) locationObj.state = state;
    if (postalCode) locationObj.postalCode = postalCode;

    // Parse employmentDetails string to extract individual fields (fallback if not provided directly)
    // Format: "Corporation: 3223; Driver Name: 32; Payment Address: 32; GST No: 32; Vacation Percent: 33"
    // If fields are sent directly in req.body, use them; otherwise parse from employmentDetails
    let parsedIncorporation = '';
    let parsedDriverName = '';
    let parsedPaymentAddress = '';
    let parsedGstNo = '';
    let parsedVacationPay = '';

    if (employmentDetails && (!incorporation || !driverName || !paymentAddress || !gstNo || !vacationPay)) {
      const parts = employmentDetails.split(';');
      parts.forEach(part => {
        const trimmed = part.trim();
        if (trimmed.startsWith('Corporation:')) {
          parsedIncorporation = trimmed.replace('Corporation:', '').trim();
        } else if (trimmed.startsWith('Driver Name:')) {
          parsedDriverName = trimmed.replace('Driver Name:', '').trim();
        } else if (trimmed.startsWith('Payment Address:')) {
          parsedPaymentAddress = trimmed.replace('Payment Address:', '').trim();
        } else if (trimmed.startsWith('GST No:')) {
          parsedGstNo = trimmed.replace('GST No:', '').trim();
        } else if (trimmed.startsWith('Vacation Percent:')) {
          parsedVacationPay = trimmed.replace('Vacation Percent:', '').trim();
        }
      });
    }

    // Build details object with ONLY the fields we want (no defaults, no extra fields)
    const detailsObj = {};
    if (gender) detailsObj.gender = gender;
    if (mobile) detailsObj.cell1 = mobile;
    if (citizenship) detailsObj.citizenship = citizenship;
    if (sinNo) {
      // Handle case where sinNo might be an array - convert to string
      if (Array.isArray(sinNo)) {
        detailsObj.sinNo = sinNo.join(', '); // Join array elements with comma
      } else {
        detailsObj.sinNo = sinNo;
      }
    }
    if (licenceNumber) detailsObj.licenceNumber = licenceNumber;
    if (licenceExpiry) detailsObj.licenceExpiry = new Date(licenceExpiry);
    if (licenceState) detailsObj.licenceState = licenceState;
    if (passport) detailsObj.passport = passport;
    if (passportCountry) detailsObj.passportCountry = passportCountry;
    if (passportExpiry) detailsObj.passportExpiry = new Date(passportExpiry);
    // Only set boolean fields if they have a value (don't set false defaults)
    if (wsib !== undefined && wsib !== null && wsib !== '') {
      detailsObj.wsib = wsibBoolean;
    }
    if (wsibAccountNo) detailsObj.wsibAccountNo = wsibAccountNo;
    if (fastCard) detailsObj.fastCardNo = fastCard;
    if (fastCardExpiry) detailsObj.fastCardExpiry = new Date(fastCardExpiry);
    if (fastCardValid !== undefined) {
      const fastCardValidBool = fastCardValid === 'true' || fastCardValid === true || fastCardValid === 'Yes' || fastCardValid === 'yes';
      detailsObj.fastCardValid = fastCardValidBool;
    }
    if (medicalTracking !== undefined && medicalTracking !== null && medicalTracking !== '') {
      detailsObj.medicalRequired = medicalBoolean;
    }
    if (csa !== undefined && csa !== null && csa !== '') {
      detailsObj.csa = csaBoolean;
    }
    if (employmentDetails) detailsObj.remark = employmentDetails; // Store employmentDetails in remark field

    // Employment details fields (use direct values from req.body, fallback to parsed values)
    if (incorporation !== undefined) {
      detailsObj.incorporation = incorporation;
    } else if (parsedIncorporation) {
      detailsObj.incorporation = parsedIncorporation;
    }

    if (driverName !== undefined) {
      detailsObj.driverName = driverName;
    } else if (parsedDriverName) {
      detailsObj.driverName = parsedDriverName;
    }

    if (paymentAddress !== undefined) {
      detailsObj.paymentAddress = paymentAddress;
    } else if (parsedPaymentAddress) {
      detailsObj.paymentAddress = parsedPaymentAddress;
    }

    if (gstNo !== undefined) {
      detailsObj.gstNo = gstNo;
    } else if (parsedGstNo) {
      detailsObj.gstNo = parsedGstNo;
    }

    if (vacationPay !== undefined) {
      detailsObj.vacationPay = vacationPay;
    } else if (parsedVacationPay) {
      detailsObj.vacationPay = parsedVacationPay;
    }

    // Company flag (OWNER OPERATOR = true, COMPANY DRIVER = false)
    if (companyFlag !== undefined) {
      const companyFlagBool = companyFlag === 'true' || companyFlag === true || companyFlag === 'Yes' || companyFlag === 'yes' || companyFlag === 'OWNER OPERATOR';
      detailsObj.companyFlag = companyFlagBool;
    }

    // Travel Information
    if (canadianWorkerStatus) detailsObj.canadianWorkerStatus = canadianWorkerStatus;
    if (permanentResidenceExpiry) detailsObj.permanentResidenceExpiry = new Date(permanentResidenceExpiry);
    if (workPermitExpiry) detailsObj.workPermitExpiry = new Date(workPermitExpiry);

    // Handle Work Permit and PR Card document uploads
    if (req.files) {
      // Work Permit Document
      if (req.files.workPermitDocument) {
        const workPermitFile = Array.isArray(req.files.workPermitDocument) ? req.files.workPermitDocument[0] : req.files.workPermitDocument;
        if (workPermitFile) {
          const workPermitUrl = workPermitFile.location ||
            (workPermitFile.path ? `${req.protocol}://${req.get("host")}/${workPermitFile.path.replace(/\\/g, '/')}` : null);
          if (workPermitUrl) {
            detailsObj.workPermitDocumentUrl = workPermitUrl;
            console.log('✅ Work Permit document uploaded:', workPermitUrl);
          }
        }
      }

      // PR Card Document
      if (req.files.prCardDocument) {
        const prCardFile = Array.isArray(req.files.prCardDocument) ? req.files.prCardDocument[0] : req.files.prCardDocument;
        if (prCardFile) {
          const prCardUrl = prCardFile.location ||
            (prCardFile.path ? `${req.protocol}://${req.get("host")}/${prCardFile.path.replace(/\\/g, '/')}` : null);
          if (prCardUrl) {
            detailsObj.prCardDocumentUrl = prCardUrl;
            console.log('✅ PR Card document uploaded:', prCardUrl);
          }
        }
      }
    }

    // Add salary per mile fields
    // Allow 0 as a valid value, so check for undefined and null only
    if (salaryPerMile !== undefined && salaryPerMile !== null) {
      const parsed = parseFloat(salaryPerMile);
      if (!isNaN(parsed)) {
        detailsObj.salaryPerMile = parsed;
        console.log('✅ Added salaryPerMile to detailsObj:', parsed, '(from:', salaryPerMile, 'type:', typeof salaryPerMile, ')');
      } else {
        console.log('⚠️ salaryPerMile is NaN:', salaryPerMile, 'type:', typeof salaryPerMile);
      }
    } else {
      console.log('⚠️ salaryPerMile not set (undefined or null):', salaryPerMile);
    }
    if (salaryPerMileSnow !== undefined && salaryPerMileSnow !== null && salaryPerMileSnow !== '') {
      const parsed = parseFloat(salaryPerMileSnow);
      if (!isNaN(parsed)) {
        detailsObj.salaryPerMileSnow = parsed;
      }
    }
    if (salaryPerMileHighTemp !== undefined && salaryPerMileHighTemp !== null && salaryPerMileHighTemp !== '') {
      const parsed = parseFloat(salaryPerMileHighTemp);
      if (!isNaN(parsed)) {
        detailsObj.salaryPerMileHighTemp = parsed;
      }
    }
    if (highTempThreshold !== undefined && highTempThreshold !== null && highTempThreshold !== '') {
      const parsed = parseFloat(highTempThreshold);
      if (!isNaN(parsed)) {
        detailsObj.highTempThreshold = parsed;
      } else {
        detailsObj.highTempThreshold = 35;
      }
    }

    // Add payment rate fields (ALONE, EMPTY, TEAM, etc.)
    // Allow 0 as a valid value, so check for undefined and null only
    if (mileRate !== undefined && mileRate !== null) {
      const parsed = parseFloat(mileRate);
      if (!isNaN(parsed)) {
        detailsObj.mileRate = parsed; // ALONE* = mileRate
        console.log('✅ Added mileRate to detailsObj:', parsed, '(from:', mileRate, 'type:', typeof mileRate, ')');
      } else {
        console.log('⚠️ mileRate is NaN:', mileRate, 'type:', typeof mileRate);
      }
    } else {
      console.log('⚠️ mileRate not set (undefined or null):', mileRate);
    }
    if (mileRateTeam !== undefined && mileRateTeam !== null) {
      const parsed = parseFloat(mileRateTeam);
      if (!isNaN(parsed)) {
        detailsObj.mileRateTeam = parsed; // TEAM* = mileRateTeam
        console.log('✅ Added mileRateTeam to detailsObj:', parsed, '(from:', mileRateTeam, 'type:', typeof mileRateTeam, ')');
      } else {
        console.log('⚠️ mileRateTeam is NaN:', mileRateTeam, 'type:', typeof mileRateTeam);
      }
    } else {
      console.log('⚠️ mileRateTeam not set (undefined or null):', mileRateTeam);
    }
    if (emptyMileRate !== undefined && emptyMileRate !== null) {
      const parsed = parseFloat(emptyMileRate);
      if (!isNaN(parsed)) {
        detailsObj.emptyMileRate = parsed; // EMPTY* = emptyMileRate
        console.log('✅ Added emptyMileRate to detailsObj:', parsed, '(from:', emptyMileRate, 'type:', typeof emptyMileRate, ')');
      } else {
        console.log('⚠️ emptyMileRate is NaN:', emptyMileRate, 'type:', typeof emptyMileRate);
      }
    } else {
      console.log('⚠️ emptyMileRate not set (undefined or null):', emptyMileRate);
    }
    if (emptyMileRateTeam !== undefined && emptyMileRateTeam !== null) {
      const parsed = parseFloat(emptyMileRateTeam);
      if (!isNaN(parsed)) {
        detailsObj.emptyMileRateTeam = parsed; // EMPTY-TEAM* = emptyMileRateTeam
        console.log('✅ Added emptyMileRateTeam to detailsObj:', parsed, '(from:', emptyMileRateTeam, 'type:', typeof emptyMileRateTeam, ')');
      } else {
        console.log('⚠️ emptyMileRateTeam is NaN:', emptyMileRateTeam, 'type:', typeof emptyMileRateTeam);
      }
    } else {
      console.log('⚠️ emptyMileRateTeam not set (undefined or null):', emptyMileRateTeam);
    }
    if (hourlyRate !== undefined && hourlyRate !== null) {
      const parsed = parseFloat(hourlyRate);
      if (!isNaN(parsed)) {
        detailsObj.hourlyRate = parsed;
        console.log('✅ Added hourlyRate to detailsObj:', parsed);
      }
    }
    if (weightRate !== undefined && weightRate !== null) {
      const parsed = parseFloat(weightRate);
      if (!isNaN(parsed)) {
        detailsObj.weightRate = parsed;
        console.log('✅ Added weightRate to detailsObj:', parsed);
      }
    }
    if (percentageRate !== undefined && percentageRate !== null) {
      const parsed = parseFloat(percentageRate);
      if (!isNaN(parsed)) {
        detailsObj.percentageRate = parsed;
        console.log('✅ Added percentageRate to detailsObj:', parsed);
      }
    }
    // Add bonus fields (BONUS/DROP, BONUS/PICK, BONUS/LAYOVER)
    if (bonusDrop !== undefined && bonusDrop !== null) {
      const parsed = parseFloat(bonusDrop);
      if (!isNaN(parsed)) {
        detailsObj.bonusDrop = parsed;
        console.log('✅ Added bonusDrop to detailsObj:', parsed, '(from:', bonusDrop, 'type:', typeof bonusDrop, ')');
      } else {
        console.log('⚠️ bonusDrop is NaN:', bonusDrop, 'type:', typeof bonusDrop);
      }
    } else {
      console.log('⚠️ bonusDrop not set (undefined or null):', bonusDrop);
    }
    if (bonusPick !== undefined && bonusPick !== null) {
      const parsed = parseFloat(bonusPick);
      if (!isNaN(parsed)) {
        detailsObj.bonusPick = parsed;
        console.log('✅ Added bonusPick to detailsObj:', parsed, '(from:', bonusPick, 'type:', typeof bonusPick, ')');
      } else {
        console.log('⚠️ bonusPick is NaN:', bonusPick, 'type:', typeof bonusPick);
      }
    } else {
      console.log('⚠️ bonusPick not set (undefined or null):', bonusPick);
    }
    if (bonusLayover !== undefined && bonusLayover !== null) {
      const parsed = parseFloat(bonusLayover);
      if (!isNaN(parsed)) {
        detailsObj.bonusLayover = parsed;
        console.log('✅ Added bonusLayover to detailsObj:', parsed, '(from:', bonusLayover, 'type:', typeof bonusLayover, ')');
      } else {
        console.log('⚠️ bonusLayover is NaN:', bonusLayover, 'type:', typeof bonusLayover);
      }
    } else {
      console.log('⚠️ bonusLayover not set (undefined or null):', bonusLayover);
    }
    if (paymentMethod) detailsObj.paymentMethod = paymentMethod;
    if (perTripAmount !== undefined && perTripAmount !== null) {
      const parsed = parseFloat(perTripAmount);
      if (!isNaN(parsed)) detailsObj.perTripAmount = parsed;
    }
    if (dailyRate !== undefined && dailyRate !== null) {
      const parsed = parseFloat(dailyRate);
      if (!isNaN(parsed)) detailsObj.dailyRate = parsed;
    }
    if (paymentSearchAddress !== undefined) detailsObj.paymentSearchAddress = paymentSearchAddress || '';
    if (paymentCity !== undefined) detailsObj.paymentCity = paymentCity || '';
    if (paymentPostalCode !== undefined) detailsObj.paymentPostalCode = paymentPostalCode || '';
    if (paymentCountry !== undefined) detailsObj.paymentCountry = paymentCountry || '';
    if (paymentStateProvince !== undefined) detailsObj.paymentStateProvince = paymentStateProvince || '';

    // Exemption fields
    if (cppExempt !== undefined) {
      const cppExemptBool = cppExempt === 'true' || cppExempt === true || cppExempt === 'Yes' || cppExempt === 'yes';
      detailsObj.cppQppExempt = cppExemptBool;
    }
    if (payrollTaxExempt !== undefined) {
      const payrollTaxExemptBool = payrollTaxExempt === 'true' || payrollTaxExempt === true || payrollTaxExempt === 'Yes' || payrollTaxExempt === 'yes';
      detailsObj.provTaxExempt = payrollTaxExemptBool;
    }
    if (customHst !== undefined) detailsObj.customHst = customHst || '';
    // Driver Type (SOLO/TEAM) - driverTypeSolo: true = SOLO, false = TEAM
    // Accept both driverTypeSolo and solo for backward compatibility
    if (driverTypeSolo !== undefined || solo !== undefined) {
      const soloValue = driverTypeSolo !== undefined ? driverTypeSolo : solo;
      const soloBool = soloValue === 'true' || soloValue === true || soloValue === 'Yes' || soloValue === 'yes';
      detailsObj.driverTypeSolo = soloBool;
      console.log('✅ Setting driverTypeSolo on create:', soloBool);
    }
    // Cross-border eligibility
    if (cross_border_eligible !== undefined) {
      const crossBorderBool = cross_border_eligible === 'true' || cross_border_eligible === true || cross_border_eligible === 'Yes' || cross_border_eligible === 'yes';
      detailsObj.cross_border_eligible = crossBorderBool;
      console.log('✅ Setting cross_border_eligible on create:', crossBorderBool);
    }

    // Get company: use requesting user's company (users can only create drivers in their own company)
    // This ensures all drivers created by an admin/HR belong to the same company
    const { getUserCompanyId } = await import("../utils/companyFilter.js");
    let companyObjectId = null;

    // Company is auto-assigned from user's company (not accepted from request)
    // For superadmin, company will be null (can see all drivers)
    // For regular users, company is required and auto-assigned
    if (req.user?.role !== 'superadmin') {
      const userCompanyId = getUserCompanyId(req.user);

      if (!userCompanyId) {
        console.error('❌ User has no company ID:', {
          userId: req.user?._id,
          role: req.user?.role,
          company: req.user?.company
        });
        return res.status(400).json({
          success: false,
          message: "Company is required. Please ensure your account has a company assigned."
        });
      }

      if (mongoose.Types.ObjectId.isValid(userCompanyId)) {
        companyObjectId = new mongoose.Types.ObjectId(userCompanyId);
      } else {
        console.error('❌ Invalid company ID format:', userCompanyId);
        return res.status(400).json({ success: false, message: "Invalid company ID format in user account" });
      }
    }

    console.log('🏢 Driver company assignment:', {
      userCompany: req.user?.company,
      userCompanyId: getUserCompanyId(req.user),
      companyObjectId: companyObjectId?.toString(),
      userRole: req.user?.role
    });

    // Check if driver exists with email (within same company and role) - AFTER company is determined
    const emailCheckQuery = { email: email, role: 'driver' };
    if (companyObjectId) {
      emailCheckQuery.company = companyObjectId;
    }
    const driverExist = await User.findOne(emailCheckQuery);
    if (driverExist) {
      return res.json({ success: false, message: "Driver already exists with this email in your company" });
    }

    // Check if driver exists with phone (within same company and role) - AFTER company is determined
    const phoneCheckQuery = { phone: phone, role: 'driver' };
    if (companyObjectId) {
      phoneCheckQuery.company = companyObjectId;
    }
    const phoneExist = await User.findOne(phoneCheckQuery);
    if (phoneExist) {
      return res.json({ success: false, message: "Driver already exists with this phone number in your company" });
    }

    // Create driver document - ALWAYS include company if we have it
    const driverData = {
      name,
      email,
      phone,
      password: hashedPassword,
      country,
      role,
      policies: policies || '',
      profileImageUrl,
      internalId: finalInternalId,
      joinDate: joinDate ? new Date(joinDate) : new Date(),
      dob: dob ? new Date(dob) : undefined,
      status,
      mobileApp: mobileApp === 'true' || mobileApp === true || mobileApp === 'Yes' || mobileApp === 'yes' || false
    };

    // ALWAYS set company (required for non-superadmin users)
    // If companyObjectId is null for non-superadmin, that's a critical error
    if (!companyObjectId && req.user?.role !== 'superadmin') {
      console.error('❌ CRITICAL: No company ID for non-superadmin user:', {
        userId: req.user?._id,
        role: req.user?.role,
        company: req.user?.company,
        userCompanyId: getUserCompanyId(req.user)
      });
      return res.status(400).json({
        success: false,
        message: "Company assignment failed. Please ensure your account has a company assigned."
      });
    }

    // Set company in driverData
    if (companyObjectId) {
      driverData.company = companyObjectId;
      console.log('✅ Company assigned to driver:', companyObjectId.toString());
    }

    // Add location if provided (only if we have at least one location field)
    if (Object.keys(locationObj).length > 0) {
      driverData.location = locationObj;
    }

    // Add city, state, postalCode to top level if provided (for backward compatibility)
    if (city) driverData.city = city;
    if (state) driverData.state = state;
    if (postalCode) driverData.postalCode = postalCode;

    // Add details ONLY if we have fields to add (don't create empty details object)
    if (Object.keys(detailsObj).length > 0) {
      driverData.details = detailsObj;
    }

    // Remove any undefined values to prevent Mongoose from adding defaults
    Object.keys(driverData).forEach(key => {
      if (driverData[key] === undefined) {
        delete driverData[key];
      }
    });
    if (driverData.details) {
      Object.keys(driverData.details).forEach(key => {
        if (driverData.details[key] === undefined) {
          delete driverData.details[key];
        }
      });
    }

    console.log('📝 Creating driver with data:', {
      name,
      email,
      phone,
      role,
      company: companyObjectId?.toString(),
      hasLocation: Object.keys(locationObj).length > 0,
      hasDetails: Object.keys(detailsObj).length > 0,
      paymentRates: {
        mileRate,
        emptyMileRate,
        mileRateTeam,
        emptyMileRateTeam,
        salaryPerMile,
        hourlyRate,
        percentageRate
      },
      detailsPaymentRates: {
        mileRate: detailsObj.mileRate,
        emptyMileRate: detailsObj.emptyMileRate,
        mileRateTeam: detailsObj.mileRateTeam,
        emptyMileRateTeam: detailsObj.emptyMileRateTeam,
        salaryPerMile: detailsObj.salaryPerMile,
        hourlyRate: detailsObj.hourlyRate,
        percentageRate: detailsObj.percentageRate
      }
    });

    console.log('📝 Creating driver with final data:', {
      name,
      email,
      phone,
      role,
      company: companyObjectId?.toString(),
      hasCompany: !!companyObjectId,
      driverDataKeys: Object.keys(driverData),
      hasCompanyInData: !!driverData.company
    });

    const driver = new User(driverData);
    await driver.save();

    // ✅ Create related records (documents, certifications, violations, deductions, additions, notes)
    try {
      // Import EmployeeDocument model
      const { EmployeeDocument } = await import("../models/driver/employeeDocumentModel.js");

      // Parse JSON strings if they're strings
      let documentsArray = [];
      let certificationsArray = [];
      let violationsArray = [];
      let deductionsArray = [];
      let additionsArray = [];
      let notesArray = [];

      if (documents) {
        try {
          documentsArray = typeof documents === 'string' ? JSON.parse(documents) : documents;
        } catch (e) {
          console.error('Error parsing documents:', e);
        }
      }

      if (certifications) {
        try {
          certificationsArray = typeof certifications === 'string' ? JSON.parse(certifications) : certifications;
        } catch (e) {
          console.error('Error parsing certifications:', e);
        }
      }

      if (violations) {
        try {
          violationsArray = typeof violations === 'string' ? JSON.parse(violations) : violations;
        } catch (e) {
          console.error('Error parsing violations:', e);
        }
      }

      if (deductions) {
        try {
          deductionsArray = typeof deductions === 'string' ? JSON.parse(deductions) : deductions;
        } catch (e) {
          console.error('Error parsing deductions:', e);
        }
      }

      if (additions) {
        try {
          additionsArray = typeof additions === 'string' ? JSON.parse(additions) : additions;
        } catch (e) {
          console.error('Error parsing additions:', e);
        }
      }

      if (notes) {
        try {
          notesArray = typeof notes === 'string' ? JSON.parse(notes) : notes;
        } catch (e) {
          console.error('Error parsing notes:', e);
        }
      }

      // Create documents with file uploads
      if (documentsArray && documentsArray.length > 0) {
        console.log(`📄 Creating ${documentsArray.length} documents for driver...`);

        // Get document files from req.files
        const documentFiles = req.files && req.files.documentFiles ?
          (Array.isArray(req.files.documentFiles) ? req.files.documentFiles : [req.files.documentFiles]) : [];

        // Get document types from body (if provided as array)
        const documentTypes = req.body.documentTypes ?
          (Array.isArray(req.body.documentTypes) ? req.body.documentTypes : [req.body.documentTypes]) : [];

        for (let i = 0; i < documentsArray.length; i++) {
          const doc = documentsArray[i];
          try {
            // Get corresponding file if available
            const docFile = documentFiles[i] || null;
            const docType = documentTypes[i] || doc.documentType || 'Other';

            // Extract file metadata if file exists
            let fileMetadata = {};
            if (docFile) {
              const fileUrl = docFile.location ||
                (docFile.path ? `${req.protocol}://${req.get("host")}/${docFile.path.replace(/\\/g, '/')}` : null);

              fileMetadata = {
                fileUrl: fileUrl,
                fileName: docFile.originalname,
                fileSize: docFile.size,
                mimeType: docFile.mimetype
              };
              console.log(`📎 Document file attached: ${docFile.originalname}`);
            }

            const documentData = {
              employee: driver._id,
              documentType: docType,
              description: doc.description || '',
              expiryDate: doc.expiryDate ? new Date(doc.expiryDate) : null,
              ignoreExpiration: doc.ignoreExpiration || false,
              status: 'valid',
              uploadedBy: req.user._id,
              company: companyObjectId,
              ...fileMetadata
            };

            const document = new EmployeeDocument(documentData);
            await document.save();
            console.log(`✅ Document created: ${document._id}${docFile ? ' with file' : ''}`);
          } catch (docError) {
            console.error('Error creating document:', docError);
          }
        }
      }

      // Create tickets (Tickets & Fines)
      let ticketsArray = [];
      if (req.body.tickets) {
        try {
          ticketsArray = typeof req.body.tickets === 'string' ? JSON.parse(req.body.tickets) : req.body.tickets;
        } catch (e) {
          console.error('Error parsing tickets:', e);
        }
      }

      if (ticketsArray && ticketsArray.length > 0) {
        console.log(`🎫 Creating ${ticketsArray.length} tickets for driver...`);
        const { DriverTicket } = await import("../models/driverTicketModel.js");

        // Get ticket files from req.files
        const ticketFiles = req.files && req.files.ticketFiles ?
          (Array.isArray(req.files.ticketFiles) ? req.files.ticketFiles : [req.files.ticketFiles]) : [];

        let fileIndex = 0;

        for (let i = 0; i < ticketsArray.length; i++) {
          const ticket = ticketsArray[i];
          try {
            const ticketDate = ticket.date ? new Date(ticket.date) : new Date();
            const hasFile = ticket.hasFile === true;
            let fileMetadata = {};

            // Get file for new ticket
            if (hasFile && fileIndex < ticketFiles.length) {
              const ticketFile = ticketFiles[fileIndex];
              if (ticketFile) {
                const fileUrl = ticketFile.location ||
                  (ticketFile.path ? `${req.protocol}://${req.get("host")}/${ticketFile.path.replace(/\\/g, '/')}` : null);
                fileMetadata = {
                  fileUrl: fileUrl,
                  fileName: ticketFile.originalname,
                  fileSize: ticketFile.size,
                  mimeType: ticketFile.mimetype
                };
                console.log(`📎 Creating ticket with file: ${ticketFile.originalname}`);
                fileIndex++;
              }
            }

            const ticketData = {
              driver: driver._id,
              date: ticketDate,
              title: ticket.title || '',
              description: ticket.description || '',
              amount: ticket.amount ? parseFloat(ticket.amount) : 0,
              currency: ticket.currency || 'CAD',
              status: ticket.status || 'Unpaid',
              company: companyObjectId,
              uploadedBy: req.user._id,
              ...fileMetadata
            };

            // Only create if we have required fields
            if (ticketData.date && ticketData.title) {
              const ticketRecord = new DriverTicket(ticketData);
              await ticketRecord.save();
              console.log(`✅ Ticket created: ${ticketRecord._id}${fileMetadata.fileUrl ? ' with file' : ''}`);
            } else {
              console.warn('⚠️ Skipping ticket - missing required fields (date or title)');
            }
          } catch (ticketError) {
            console.error('Error creating ticket:', ticketError);
          }
        }
      }

      // Create violations
      if (violationsArray && violationsArray.length > 0) {
        console.log(`⚠️ Creating ${violationsArray.length} violations for driver...`);
        const { DriverViolation } = await import("../models/driverViolationModel.js");

        // Get violation files from req.files
        const violationFiles = req.files && req.files.violationFiles ?
          (Array.isArray(req.files.violationFiles) ? req.files.violationFiles : [req.files.violationFiles]) : [];

        // Track file index separately - files are only sent for violations with hasFile=true
        let fileIndex = 0;

        for (let i = 0; i < violationsArray.length; i++) {
          const violation = violationsArray[i];
          try {
            // Use dateOfIncident if provided, otherwise use paymentDueDate or current date
            const incidentDate = violation.dateOfIncident ? new Date(violation.dateOfIncident) :
              (violation.paymentDueDate ? new Date(violation.paymentDueDate) : new Date());
            const ticketNumber = violation.ticket || '';
            const hasFile = violation.hasFile === true;

            let fileMetadata = {};
            // Handle file upload if hasFile is true and file is available
            if (hasFile && violationFiles.length > fileIndex) {
              const vioFile = violationFiles[fileIndex];
              fileIndex++; // Increment for next violation that needs a file

              const fileUrl = vioFile.location ||
                (vioFile.path ? `${req.protocol}://${req.get("host")}/${vioFile.path.replace(/\\/g, '/')}` : null);
              fileMetadata = {
                fileUrl: fileUrl,
                fileName: vioFile.originalname,
                fileSize: vioFile.size,
                mimeType: vioFile.mimetype
              };
              console.log(`📎 Creating violation with file: ${vioFile.originalname}`);
            }

            const violationData = {
              driver: driver._id,
              date: incidentDate,
              dateOfIncident: incidentDate,
              violationType: violation.violationType || 'other',
              title: violation.title || '',
              description: violation.description || ticketNumber || '',
              reportedBy: violation.reportedBy || '',
              severity: violation.severity || 'Low',
              actionTaken: violation.actionTaken || '',
              status: violation.status || 'Open',
              ticketInfo: ticketNumber ? { ticketNumber: ticketNumber } : undefined,
              currency: violation.currency || 'CAD',
              amount: violation.amount ? parseFloat(violation.amount) : 0,
              source: 'manual',
              company: companyObjectId,
              ...fileMetadata
            };

            // Only create if we have required fields
            if (violationData.date && violationData.violationType) {
              const violationRecord = new DriverViolation(violationData);
              await violationRecord.save();
              console.log(`✅ Violation created: ${violationRecord._id}${fileMetadata.fileUrl ? ' with file' : ''}`);
            } else {
              console.warn('⚠️ Skipping violation - missing required fields (date or violationType)');
            }
          } catch (violationError) {
            console.error('Error creating violation:', violationError);
          }
        }
      }


      // Create deductions and additions
      if ((deductionsArray && deductionsArray.length > 0) || (additionsArray && additionsArray.length > 0)) {
        console.log(`💰 Creating ${(deductionsArray?.length || 0) + (additionsArray?.length || 0)} deductions/additions for driver...`);
        const { DeductionAddition } = await import("../models/hr/settlementModel.js");

        const normalizeIntervalToRecurrence = (value) => {
          const v = (value || '').toString().trim().toLowerCase();
          if (!v) return 'One-time';
          if (v === 'one-time' || v === 'one time' || v === 'onetime') return 'One-time';
          if (v === 'one time payment') return 'One Time Payment';
          if (v === 'bi-weekly' || v === 'biweekly' || v === 'bi weekly') return 'Bi-weekly';
          if (v === 'weekly') return 'Weekly';
          if (v === 'monthly') return 'Monthly';
          if (v === 'quarterly') return 'Quarterly';
          if (v === 'yearly' || v === 'annual') return 'Yearly';
          return (value || '').toString();
        };

        // Create deductions
        for (const deduction of deductionsArray || []) {
          try {
            const deductionData = {
              name: deduction.description || deduction.name || 'Deduction',
              type: 'Deduction',
              recurrence: normalizeIntervalToRecurrence(deduction.interval),
              amount: Number(deduction.amount) || 0,
              currency: deduction.currency || 'CAD',
              assignedTo: driver._id,
              startDate: deduction.startDate ? new Date(deduction.startDate) : new Date(),
              description: deduction.description || '',
              isActive: true,
              company: companyObjectId,
              createdBy: req.user._id
            };

            const deductionRecord = new DeductionAddition(deductionData);
            await deductionRecord.save();
            console.log(`✅ Deduction created: ${deductionRecord._id}`);
          } catch (deductionError) {
            console.error('Error creating deduction:', deductionError);
          }
        }

        // Create additions
        for (const addition of additionsArray || []) {
          try {
            const additionData = {
              name: addition.description || addition.name || 'Addition',
              type: 'Addition',
              recurrence: normalizeIntervalToRecurrence(addition.interval),
              amount: Number(addition.amount) || 0,
              currency: addition.currency || 'CAD',
              assignedTo: driver._id,
              startDate: addition.startDate ? new Date(addition.startDate) : new Date(),
              description: addition.description || '',
              isActive: true,
              company: companyObjectId,
              createdBy: req.user._id
            };

            const additionRecord = new DeductionAddition(additionData);
            await additionRecord.save();
            console.log(`✅ Addition created: ${additionRecord._id}`);
          } catch (additionError) {
            console.error('Error creating addition:', additionError);
          }
        }
      }

      // Create certifications (Training Certificates)
      if (certificationsArray && certificationsArray.length > 0) {
        console.log(`📜 Creating ${certificationsArray.length} certifications for driver...`);
        const { TrainingCertificate } = await import("../models/driver/trainingCertificateModel.js");

        // Get certification files from req.files
        const certificationFiles = req.files && req.files.certificationFiles ?
          (Array.isArray(req.files.certificationFiles) ? req.files.certificationFiles : [req.files.certificationFiles]) : [];

        for (let i = 0; i < certificationsArray.length; i++) {
          const cert = certificationsArray[i];
          try {
            // Get corresponding file if available
            const certFile = certificationFiles[i] || null;

            // Extract file metadata if file exists
            let fileMetadata = {};
            if (certFile) {
              const fileUrl = certFile.location ||
                (certFile.path ? `${req.protocol}://${req.get("host")}/${certFile.path.replace(/\\/g, '/')}` : null);

              fileMetadata = {
                fileUrl: fileUrl,
                fileName: certFile.originalname,
                fileSize: certFile.size,
                mimeType: certFile.mimetype
              };
              console.log(`📎 Certification file attached: ${certFile.originalname}`);
            }

            const certificationData = {
              driverId: driver._id,
              certificateName: cert.title || 'Unknown Certification',
              certificateType: cert.subCategory || cert.certificateType || 'Other', // Use subCategory as certificateType
              issuedDate: new Date(), // Default to today if not provided
              expiryDate: cert.expiryDate ? new Date(cert.expiryDate) : null,
              issuingAuthority: cert.issuingAuthority || cert.subCategory || 'Unknown Authority', // Use subCategory as issuingAuthority if not provided
              certificateNumber: cert.certificateNumber || '',
              description: cert.description || '',
              notes: cert.result || cert.notes || '',
              ignoreExpiration: cert.ignoreExpiration === true || cert.ignoreExpiration === 'true',
              status: 'active', // Default status, will be auto-updated by pre-save hook
              company: companyObjectId,
              createdBy: req.user._id, // Use createdBy instead of uploadedBy
              ...fileMetadata // Include file metadata if file exists
            };

            const newCert = new TrainingCertificate(certificationData);
            await newCert.save();
            console.log(`✅ Certification created: ${newCert._id}`);
          } catch (certError) {
            console.error('Error creating certification:', certError);
          }
        }
      }

      // Create drug tests
      let drugTestsArray = [];
      if (drugTests) {
        try {
          drugTestsArray = typeof drugTests === 'string' ? JSON.parse(drugTests) : drugTests;
        } catch (e) {
          console.error('Error parsing drug tests:', e);
        }
      }

      if (drugTestsArray && drugTestsArray.length > 0) {
        console.log(`💊 Creating ${drugTestsArray.length} drug tests for driver...`);

        // Get drug test files from req.files
        const drugTestFiles = req.files && req.files.drugTestFiles ?
          (Array.isArray(req.files.drugTestFiles) ? req.files.drugTestFiles : [req.files.drugTestFiles]) : [];

        // Initialize drug_tests array if it doesn't exist
        if (!driver.details) driver.details = {};
        if (!driver.details.drug_tests) driver.details.drug_tests = [];

        let fileIndex = 0;

        for (let i = 0; i < drugTestsArray.length; i++) {
          const dt = drugTestsArray[i];
          try {
            console.log(`💊 Processing drug test ${i + 1}/${drugTestsArray.length}:`, {
              id: dt.id,
              date: dt.date,
              result: dt.result,
              labName: dt.labName,
              hasFile: dt.hasFile
            });

            const hasFile = dt.hasFile === true;
            let fileMetadata = {};

            // Get file for new drug test
            if (hasFile && fileIndex < drugTestFiles.length) {
              const dtFile = drugTestFiles[fileIndex];
              if (dtFile) {
                const fileUrl = dtFile.location ||
                  (dtFile.path ? `${req.protocol}://${req.get("host")}/${dtFile.path.replace(/\\/g, '/')}` : null);
                fileMetadata = {
                  fileUrl: fileUrl,
                  fileName: dtFile.originalname,
                  fileSize: dtFile.size,
                  mimeType: dtFile.mimetype
                };
                console.log(`📎 Creating drug test with file: ${dtFile.originalname}`);
                fileIndex++;
              }
            }

            // Create drug test data with _id field (required for MongoDB subdocuments)
            const drugTestData = {
              _id: new mongoose.Types.ObjectId(), // Generate _id for subdocument
              date: dt.date ? new Date(dt.date) : new Date(),
              result: dt.result || '',
              labName: dt.labName || '',
              ...fileMetadata
            };

            console.log(`💊 Creating drug test data:`, {
              _id: drugTestData._id.toString(),
              date: drugTestData.date,
              result: drugTestData.result,
              labName: drugTestData.labName,
              hasFile: !!drugTestData.fileUrl,
              fileName: drugTestData.fileName
            });

            driver.details.drug_tests.push(drugTestData);
            console.log(`✅ Drug test added: ${drugTestData.labName || 'Unknown Lab'}`);
          } catch (dtError) {
            console.error('Error creating drug test:', dtError);
          }
        }

        driver.markModified('details.drug_tests');
        await driver.save();
        console.log(`✅ ${drugTestsArray.length} drug tests saved to driver`);

        // Verify what was actually saved
        const savedDriver = await User.findById(driver._id).select('details.drug_tests').lean();
        console.log(`💊 Verified saved drug tests:`, JSON.stringify(savedDriver?.details?.drug_tests, null, 2));
      }

      // Save notes to driver.details.notes
      if (notesArray && notesArray.length > 0) {
        if (!driver.details) driver.details = {};
        driver.details.notes = notesArray.map(note => note.note || note).join('\n');
        driver.markModified('details');
        await driver.save();
        console.log(`✅ Notes saved to driver`);
      }
    } catch (relatedError) {
      console.error('Error creating related records:', relatedError);
      // Don't fail driver creation if related records fail
    }

    // ✅ Console log what was actually saved to database
    const savedDriver = await User.findById(driver._id).lean();
    console.log('✅ Driver saved to database:', {
      _id: savedDriver._id,
      name: savedDriver.name,
      email: savedDriver.email,
      phone: savedDriver.phone,
      internalId: savedDriver.internalId,
      company: savedDriver.company?.toString() || savedDriver.company,
      dob: savedDriver.dob,
      joinDate: savedDriver.joinDate,
      mobileApp: savedDriver.mobileApp,
      location: savedDriver.location,
      city: savedDriver.city,
      state: savedDriver.state,
      postalCode: savedDriver.postalCode,
      details: savedDriver.details,
      detailsKeys: savedDriver.details ? Object.keys(savedDriver.details) : []
    });

    // CRITICAL: Verify company was saved - reload from DB to check
    const verifyDriver = await User.findById(driver._id).select('company name email').lean();
    if (!verifyDriver.company && req.user?.role !== 'superadmin') {
      console.error('❌ CRITICAL ERROR: Driver created without company!', {
        driverId: driver._id,
        name: driver.name,
        email: driver.email,
        expectedCompany: companyObjectId?.toString()
      });
      // Try to update it
      await User.findByIdAndUpdate(driver._id, { company: companyObjectId });
      console.log('⚠️ Attempted to fix: Added company after save');
    }
    console.log('✅ Driver saved. Company verification:', {
      driverId: driver._id,
      companyInDB: verifyDriver?.company?.toString() || verifyDriver?.company || 'NOT SET',
      expectedCompany: companyObjectId?.toString()
    });

    // Reload driver with all related data to return in same format as getDriverById
    const driverId = driver._id;

    // Fetch all related data (same as getDriverById) - use different variable names to avoid conflict with req.body destructured vars
    let responseDocuments = [];
    let responseCertifications = [];
    let responseViolations = [];
    let responseTickets = [];
    let responseDeductions = [];
    let responseAdditions = [];

    try {
      // Fetch documents
      const { EmployeeDocument } = await import("../models/driver/employeeDocumentModel.js");
      const employeeDocuments = await EmployeeDocument.find({ employee: driverId })
        .select('_id documentType documentNumber issueDate expiryDate description status fileUrl fileName fileSize mimeType ignoreExpiration uploadedBy verifiedBy createdAt updatedAt')
        .lean();

      if (employeeDocuments.length > 0) {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        responseDocuments = await Promise.all(employeeDocuments.map(async (doc) => {
          const docObj = { ...doc };
          if (docObj.fileUrl && (docObj.fileUrl.includes('s3.amazonaws.com') || docObj.fileUrl.includes('.s3.'))) {
            try {
              const cleanUrl = docObj.fileUrl.split('?')[0].split('#')[0];
              const urlObj = new URL(cleanUrl);
              let bucketName = process.env.AWS_S3_BUCKET_NAME;
              let key = decodeURIComponent(urlObj.pathname.substring(1));

              if (urlObj.hostname.includes('.s3.')) {
                bucketName = urlObj.hostname.split('.s3.')[0];
                key = decodeURIComponent(urlObj.pathname.substring(1));
              } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                bucketName = pathParts[0];
                key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
              }

              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const getContentType = (mimeType, fileUrl) => {
                if (mimeType) return mimeType;
                const ext = fileUrl.split('.').pop()?.toLowerCase();
                const mimeMap = { 'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
                return mimeMap[ext] || 'application/octet-stream';
              };

              const contentType = getContentType(docObj.mimeType, docObj.fileUrl);
              const command = new GetObjectCommand({ Bucket: bucketName, Key: key, ResponseContentType: contentType });
              const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
              docObj.fileUrl = signedUrl;
            } catch (error) {
              console.error('Error generating signed URL for document:', error);
            }
          }
          return docObj;
        }));
      }

      // Fetch certifications
      const { TrainingCertificate } = await import("../models/driver/trainingCertificateModel.js");
      const trainingCertificates = await TrainingCertificate.find({ driverId: driverId })
        .select('_id certificateName certificateType issuedDate expiryDate description notes status fileUrl fileName fileSize mimeType ignoreExpiration uploadedBy createdAt updatedAt')
        .lean();

      if (trainingCertificates.length > 0) {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        responseCertifications = await Promise.all(trainingCertificates.map(async (cert) => {
          const certObj = {
            ...cert,
            // Map fields for frontend compatibility
            subCategory: cert.certificateType || cert.description || '',
            result: cert.notes || cert.result || '',
            title: cert.certificateName || cert.title || ''
          };
          if (certObj.fileUrl && (certObj.fileUrl.includes('s3.amazonaws.com') || certObj.fileUrl.includes('.s3.'))) {
            try {
              const cleanUrl = certObj.fileUrl.split('?')[0].split('#')[0];
              const urlObj = new URL(cleanUrl);
              let bucketName = process.env.AWS_S3_BUCKET_NAME;
              let key = decodeURIComponent(urlObj.pathname.substring(1));

              if (urlObj.hostname.includes('.s3.')) {
                bucketName = urlObj.hostname.split('.s3.')[0];
                key = decodeURIComponent(urlObj.pathname.substring(1));
              } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                bucketName = pathParts[0];
                key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
              }

              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const getContentType = (mimeType, fileUrl) => {
                if (mimeType) return mimeType;
                const ext = fileUrl.split('.').pop()?.toLowerCase();
                const mimeMap = { 'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
                return mimeMap[ext] || 'application/octet-stream';
              };

              const contentType = getContentType(certObj.mimeType, certObj.fileUrl);
              const command = new GetObjectCommand({ Bucket: bucketName, Key: key, ResponseContentType: contentType });
              const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
              certObj.fileUrl = signedUrl;
            } catch (error) {
              console.error('Error generating signed URL for certificate:', error);
            }
          }
          return certObj;
        }));
      }

      // Fetch violations
      const { DriverViolation } = await import("../models/driverViolationModel.js");
      const driverViolations = await DriverViolation.find({ driver: driverId })
        .select('_id date dateOfIncident violationType title description reportedBy severity actionTaken status ticketInfo currency amount fileUrl fileName fileSize mimeType uploadedBy createdAt updatedAt')
        .lean();

      if (driverViolations.length > 0) {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        responseViolations = await Promise.all(driverViolations.map(async (violation) => {
          const vioObj = { ...violation };
          if (vioObj.fileUrl && (vioObj.fileUrl.includes('s3.amazonaws.com') || vioObj.fileUrl.includes('.s3.'))) {
            try {
              const cleanUrl = vioObj.fileUrl.split('?')[0].split('#')[0];
              const urlObj = new URL(cleanUrl);
              let bucketName = process.env.AWS_S3_BUCKET_NAME;
              let key = decodeURIComponent(urlObj.pathname.substring(1));

              if (urlObj.hostname.includes('.s3.')) {
                bucketName = urlObj.hostname.split('.s3.')[0];
                key = decodeURIComponent(urlObj.pathname.substring(1));
              } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                bucketName = pathParts[0];
                key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
              }

              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const getContentType = (mimeType, fileUrl) => {
                if (mimeType) return mimeType;
                const ext = fileUrl.split('.').pop()?.toLowerCase();
                const mimeMap = { 'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
                return mimeMap[ext] || 'application/octet-stream';
              };

              const contentType = getContentType(vioObj.mimeType, vioObj.fileUrl);
              const command = new GetObjectCommand({ Bucket: bucketName, Key: key, ResponseContentType: contentType });
              const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
              vioObj.fileUrl = signedUrl;
            } catch (error) {
              console.error('Error generating signed URL for violation:', error);
            }
          }
          return vioObj;
        }));
      }


      // Fetch deductions and additions
      const { DeductionAddition } = await import("../models/hr/settlementModel.js");
      const deductionAdditions = await DeductionAddition.find({ assignedTo: driverId })
        .select('_id name type recurrence amount currency startDate endDate description isActive company createdBy createdAt updatedAt')
        .lean();

      responseDeductions = deductionAdditions.filter(da => da.type === 'Deduction');
      responseAdditions = deductionAdditions.filter(da => da.type === 'Addition');
    } catch (fetchError) {
      console.error('Error fetching related data for response:', fetchError);
    }

    // Generate signed URL for profile image if it's an S3 URL
    let responseProfileImageUrl = savedDriver.profileImageUrl;
    if (responseProfileImageUrl && (responseProfileImageUrl.includes('s3.amazonaws.com') || responseProfileImageUrl.includes('.s3.'))) {
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { getS3ClientForBucket } = await import("../config/awsConfig.js");

        const cleanUrl = responseProfileImageUrl.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let key = decodeURIComponent(urlObj.pathname.substring(1));

        if (urlObj.hostname.includes('.s3.')) {
          bucketName = urlObj.hostname.split('.s3.')[0];
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          bucketName = pathParts[0];
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }

        if (key.includes('?')) key = key.split('?')[0];
        if (key.includes('&')) key = key.split('&')[0];

        // Get S3 client with correct region for this bucket
        const s3Client = await getS3ClientForBucket(bucketName, responseProfileImageUrl);

        const command = new GetObjectCommand({ Bucket: bucketName, Key: key, ResponseContentType: 'image/jpeg' });
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        responseProfileImageUrl = signedUrl;
      } catch (error) {
        console.error('Error generating signed URL for profile image:', error);
      }
    }

    // Format response to match getDriverById format
    const transformedDriver = {
      ...savedDriver,
      profileImageUrl: responseProfileImageUrl,
      mobile: savedDriver.details?.cell1 || '',
      gender: savedDriver.details?.gender || '',
      citizenship: savedDriver.details?.citizenship || '',
      address: savedDriver.location?.address || savedDriver.location?.address || '',
      unit: savedDriver.location?.unit || '',
      city: savedDriver.city || savedDriver.location?.city || '',
      state: savedDriver.state || savedDriver.location?.state || '',
      postalCode: savedDriver.postalCode || savedDriver.location?.postalCode || savedDriver.details?.postalCode || '',
      sinNo: savedDriver.details?.sinNo || '',
      licenceNumber: savedDriver.details?.licenceNumber || savedDriver.details?.driversLicence || '',
      licenceExpiry: savedDriver.details?.licenceExpiry ? (savedDriver.details.licenceExpiry instanceof Date ? savedDriver.details.licenceExpiry.toISOString() : savedDriver.details.licenceExpiry) : '',
      licenceState: savedDriver.details?.licenceState || '',
      passport: savedDriver.details?.passport || savedDriver.details?.passportNumber || '',
      passportCountry: savedDriver.details?.passportCountry || '',
      passportExpiry: savedDriver.details?.passportExpiry ? (savedDriver.details.passportExpiry instanceof Date ? savedDriver.details.passportExpiry.toISOString() : savedDriver.details.passportExpiry) : '',
      wsib: savedDriver.details?.wsib === true ? 'Yes' : (savedDriver.details?.wsib === false ? 'No' : ''),
      wsibAccountNo: savedDriver.details?.wsibAccountNo || '',
      fastCard: savedDriver.details?.fastCardNo || '',
      fastCardExpiry: savedDriver.details?.fastCardExpiry ? (savedDriver.details.fastCardExpiry instanceof Date ? savedDriver.details.fastCardExpiry.toISOString() : savedDriver.details.fastCardExpiry) : '',
      fastCardValid: savedDriver.details?.fastCardValid || false,
      medicalTracking: savedDriver.details?.medicalRequired === true ? 'Yes' : (savedDriver.details?.medicalRequired === false ? 'No' : ''),
      csa: savedDriver.details?.csa === true ? 'Yes' : (savedDriver.details?.csa === false ? 'No' : ''),
      employmentDetails: savedDriver.details?.remark || '',
      notes: savedDriver.details?.notes || '',
      company: savedDriver.company || '',
      canadianWorkerStatus: savedDriver.details?.canadianWorkerStatus || '',
      permanentResidenceExpiry: savedDriver.details?.permanentResidenceExpiry ? (savedDriver.details.permanentResidenceExpiry instanceof Date ? savedDriver.details.permanentResidenceExpiry.toISOString() : savedDriver.details.permanentResidenceExpiry) : '',
      workPermitExpiry: savedDriver.details?.workPermitExpiry ? (savedDriver.details.workPermitExpiry instanceof Date ? savedDriver.details.workPermitExpiry.toISOString() : savedDriver.details.workPermitExpiry) : '',
      workPermitDocumentUrl: savedDriver.details?.workPermitDocumentUrl || null,
      prCardDocumentUrl: savedDriver.details?.prCardDocumentUrl || null,
      fleet: savedDriver.details?.fleet || '',
      salaryPerMile: savedDriver.details?.salaryPerMile || '',
      salaryPerMileSnow: savedDriver.details?.salaryPerMileSnow || '',
      salaryPerMileHighTemp: savedDriver.details?.salaryPerMileHighTemp || '',
      highTempThreshold: savedDriver.details?.highTempThreshold || '',
      hireDate: savedDriver.details?.hireDate ? (savedDriver.details.hireDate instanceof Date ? savedDriver.details.hireDate.toISOString() : savedDriver.details.hireDate) : (savedDriver.joinDate ? (savedDriver.joinDate instanceof Date ? savedDriver.joinDate.toISOString() : savedDriver.joinDate) : null),
      termDate: savedDriver.details?.termDate ? (savedDriver.details.termDate instanceof Date ? savedDriver.details.termDate.toISOString() : savedDriver.details.termDate) : null,
      vacationPay: savedDriver.details?.vacationPay || '',
      incorporation: savedDriver.details?.incorporation || '',
      gstNo: savedDriver.details?.gstNo || '',
      companyFlag: savedDriver.details?.companyFlag || false,
      paymentMethod: savedDriver.details?.paymentMethod || '',
      cppQppExempt: savedDriver.details?.cppQppExempt || false,
      fedTaxExempt: savedDriver.details?.fedTaxExempt || false,
      provTaxExempt: savedDriver.details?.provTaxExempt || false,
      customHst: savedDriver.details?.customHst || '',
      driverName: savedDriver.details?.driverName || '',
      paymentAddress: savedDriver.details?.paymentAddress || '',
      paymentSearchAddress: savedDriver.details?.paymentSearchAddress || '',
      paymentCity: savedDriver.details?.paymentCity || '',
      paymentPostalCode: savedDriver.details?.paymentPostalCode || '',
      paymentCountry: savedDriver.details?.paymentCountry || '',
      paymentStateProvince: savedDriver.details?.paymentStateProvince || '',
      driverTypeSolo: savedDriver.details?.driverTypeSolo !== undefined ? savedDriver.details.driverTypeSolo : true, // true = SOLO, false = TEAM
      // Payment rate fields (ALONE, EMPTY, TEAM, etc.)
      alone: savedDriver.details?.mileRate || 0, // ALONE* = mileRate
      team: savedDriver.details?.mileRateTeam || 0, // TEAM = mileRateTeam
      empty: savedDriver.details?.emptyMileRate || 0, // EMPTY = emptyMileRate
      emptyTeam: savedDriver.details?.emptyMileRateTeam || 0, // EMPTY-TEAM* = emptyMileRateTeam
      hourlyRate: savedDriver.details?.hourlyRate || 0,
      weightRate: savedDriver.details?.weightRate || 0,
      percentageRate: savedDriver.details?.percentageRate || 0,
      bonusDrop: savedDriver.details?.bonusDrop || 0, // BONUS/DROP
      bonusPick: savedDriver.details?.bonusPick || 0, // BONUS/PICK
      bonusLayover: savedDriver.details?.bonusLayover || 0,
      perTripAmount: savedDriver.details?.perTripAmount || 0,
      dailyRate: savedDriver.details?.dailyRate || 0
    };

    // Format drug tests for response
    const responseDrugTests = (savedDriver.details?.drug_tests || []).map((dt, index) => ({
      _id: dt._id ? dt._id.toString() : `drug-test-${index}`,
      date: dt.date ? (dt.date instanceof Date ? dt.date.toISOString().split('T')[0] : (typeof dt.date === 'string' ? dt.date.split('T')[0] : dt.date)) : '',
      result: dt.result || '',
      labName: dt.labName || '',
      fileUrl: dt.fileUrl || null,
      fileName: dt.fileName || null,
      fileSize: dt.fileSize || null,
      mimeType: dt.mimeType || null
    }));

    const responseData = {
      ...transformedDriver,
      documents: responseDocuments,
      certifications: responseCertifications,
      violations: responseViolations,
      tickets: [], // Tickets removed - use compliance tickets section instead
      deductions: responseDeductions,
      additions: responseAdditions,
      drugTests: responseDrugTests
    };

    console.log('✅ Driver created successfully:', {
      driverId: responseData._id,
      name: responseData.name,
      email: responseData.email,
      company: responseData.company
    });

    res
      .status(201)
      .json({ success: true, message: "Driver profile with documents", data: responseData });
  } catch (error) {
    console.error('Error creating driver:', error);
    const { handleError } = await import("../utils/errorHandler.js");
    return handleError(error, res, 500);
  }
};

// ✅ Update driver
export const updateDriver = async (req, res) => {
  try {
    // ✅ Console log all fields received in req.body
    console.log('📥 UPDATE DRIVER - Request Body:', JSON.stringify(req.body, null, 2));
    console.log('📥 UPDATE DRIVER - Request Body Keys:', Object.keys(req.body));
    console.log('📥 UPDATE DRIVER - Unit field:', req.body.unit);
    console.log('📥 UPDATE DRIVER - PostalCode field:', req.body.postalCode);
    console.log('📥 UPDATE DRIVER - licenceExpiry field:', req.body.licenceExpiry);
    console.log('📥 UPDATE DRIVER - licenceState field:', req.body.licenceState);
    console.log('📥 UPDATE DRIVER - canadianWorkerStatus field:', req.body.canadianWorkerStatus);
    console.log('📥 UPDATE DRIVER - licenceNumber field:', req.body.licenceNumber);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const driver = await User.findById(id);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    const {
      name,
      phone,
      email,
      country,
      password,
      role,
      policies,
      internalId,
      joinDate,
      dob,
      gender,
      company,
      employmentDetails,
      mobile,
      citizenship,
      address,
      unit,
      city,
      state,
      postalCode,
      sinNo,
      licenceNumber,
      licenceExpiry,
      licenceState,
      passport,
      passportCountry,
      passportExpiry,
      wsib,
      wsibAccountNo,
      fastCard,
      fastCardExpiry,
      fastCardValid,
      medicalTracking,
      csa,
      status,
      mobileApp,
      canadianWorkerStatus,
      permanentResidenceExpiry,
      workPermitExpiry,
      // Salary per mile fields
      salaryPerMile,
      salaryPerMileSnow,
      salaryPerMileHighTemp,
      highTempThreshold,
      // Payment rate fields
      mileRate,
      mileRateTeam,
      emptyMileRate,
      emptyMileRateTeam,
      hourlyRate,
      weightRate,
      percentageRate,
      bonusDrop,
      bonusPick,
      bonusLayover,
      perTripAmount,
      dailyRate,
      // Personal Information fields
      hireDate,
      termDate,
      vacationPay,
      incorporation,
      gstNo,
      companyFlag,
      paymentMethod,
      // Exemption and additional fields
      cppExempt,
      payrollTaxExempt,
      customHst,
      driverName,
      paymentAddress,
      paymentSearchAddress,
      paymentCity,
      paymentPostalCode,
      paymentCountry,
      paymentStateProvince,
      // Driver Type (SOLO/TEAM)
      driverTypeSolo,
      solo,
      // Cross-border eligibility
      cross_border_eligible,
      // Related records
      certifications,
      documents,
      violations,
      deductions,
      additions,
      drugTests,
      // Driver test requirement flags
      handlesHazardousLoads,
      winterTestRequired
    } = req.body;

    // Check if email is being changed and if it already exists (exclude current driver)
    // Only check if email is provided AND different from current email
    if (email !== undefined && email !== null && email !== '' && email !== driver.email) {
      console.log('📧 Email is being changed:', {
        oldEmail: driver.email,
        newEmail: email,
        driverId: driver._id
      });

      const { getUserCompanyId } = await import("../utils/companyFilter.js");
      const companyId = getUserCompanyId(req.user);

      // Build query to check email within same company and role, excluding current driver
      const emailCheckQuery = {
        email: email,
        role: 'driver',
        _id: { $ne: driver._id } // Exclude current driver
      };

      // Add company filter if user has a company (not superadmin)
      if (companyId && req.user?.role !== 'superadmin') {
        emailCheckQuery.company = companyId;
      }

      const driverExist = await User.findOne(emailCheckQuery);
      if (driverExist) {
        console.log('❌ Email already exists for another driver:', driverExist._id);
        return res.json({ success: false, message: "Driver already exists with this email in your company" });
      }
      driver.email = email;
      console.log('✅ Email updated successfully');
    } else if (email !== undefined && email === driver.email) {
      console.log('ℹ️ Email unchanged, skipping duplicate check');
    } else if (email === undefined || email === null || email === '') {
      console.log('ℹ️ Email not provided in update request, keeping existing email');
    }

    // Check if phone is being changed and if it already exists (exclude current driver)
    if (phone !== undefined && phone !== null && phone !== driver.phone) {
      const { getUserCompanyId } = await import("../utils/companyFilter.js");
      const companyId = getUserCompanyId(req.user);

      // Build query to check phone within same company and role, excluding current driver
      const phoneCheckQuery = {
        phone: phone,
        role: 'driver',
        _id: { $ne: driver._id } // Exclude current driver
      };

      // Add company filter if user has a company (not superadmin)
      if (companyId && req.user?.role !== 'superadmin') {
        phoneCheckQuery.company = companyId;
      }

      const phoneExist = await User.findOne(phoneCheckQuery);
      if (phoneExist) {
        return res.json({ success: false, message: "Driver already exists with this phone number in your company" });
      }
      driver.phone = phone;
    }

    // Check if internalId is being changed and if it already exists (exclude current driver)
    if (internalId !== undefined && internalId !== null && internalId !== driver.internalId) {
      const { getUserCompanyId } = await import("../utils/companyFilter.js");
      const companyId = getUserCompanyId(req.user);

      // Build query to check internalId within same company and role, excluding current driver
      const internalIdCheckQuery = {
        internalId: internalId,
        role: 'driver',
        _id: { $ne: driver._id } // Exclude current driver
      };

      // Add company filter if user has a company (not superadmin)
      if (companyId && req.user?.role !== 'superadmin') {
        internalIdCheckQuery.company = companyId;
      }

      const existingInternalId = await User.findOne(internalIdCheckQuery);
      if (existingInternalId) {
        return res.json({ success: false, message: "Internal ID already exists for another driver in your company" });
      }
      driver.internalId = internalId;
    }

    // Update basic fields
    if (name) driver.name = name;
    if (phone) driver.phone = phone;
    if (country) driver.country = country;
    if (role) driver.role = role;
    if (policies !== undefined) driver.policies = policies;
    if (status) driver.status = status;
    // Handle joinDate and hireDate - prefer hireDate in details, fallback to joinDate
    if (hireDate !== undefined) {
      if (!driver.details) driver.details = {};
      driver.details.hireDate = hireDate ? new Date(hireDate) : null;
    }
    if (joinDate) {
      driver.joinDate = new Date(joinDate);
      // Also update details.hireDate if not already set
      if (!driver.details) driver.details = {};
      if (!driver.details.hireDate) {
        driver.details.hireDate = new Date(joinDate);
      }
    }
    if (dob !== undefined) {
      driver.dob = dob ? new Date(dob) : null;
    }
    if (mobileApp !== undefined) {
      driver.mobileApp = mobileApp === 'true' || mobileApp === true || mobileApp === 'Yes' || mobileApp === 'yes';
    }

    // Hash password if provided
    if (password) {
      driver.password = await hashPassword(password);
    }

    // ✅ Handle profile image upload
    // Support both single file (req.file) and fields (req.files.file)
    console.log('📸 Profile Image Upload Check:', {
      hasReqFile: !!req.file,
      hasReqFiles: !!req.files,
      reqFilesKeys: req.files ? Object.keys(req.files) : [],
      reqFilesFile: req.files?.file ? (Array.isArray(req.files.file) ? `Array[${req.files.file.length}]` : 'Single file') : 'No file',
      reqFileDetails: req.file ? {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : null,
      reqFilesFileDetails: req.files?.file ? (Array.isArray(req.files.file) ? req.files.file[0] : req.files.file) : null
    });

    const profileFile = req.files && req.files.file ?
      (Array.isArray(req.files.file) ? req.files.file[0] : req.files.file) :
      req.file;

    if (profileFile) {
      console.log('✅ Profile file found:', {
        location: profileFile.location,
        path: profileFile.path,
        fieldname: profileFile.fieldname,
        originalname: profileFile.originalname
      });
      if (process.env.NODE_ENV === "production") {
        // From AWS S3 (multer-s3 gives location property)
        driver.profileImageUrl = profileFile.location;
      } else {
        // From local storage
        driver.profileImageUrl = `${req.protocol}://${req.get("host")}/${profileFile.path.replace(/\\/g, '/')}`;
      }
      console.log('✅ Profile image URL set:', driver.profileImageUrl);
    } else {
      console.log('⚠️ No profile file provided in request');
    }

    // Convert string booleans to actual booleans
    let wsibBoolean;
    let csaBoolean;
    let medicalBoolean;

    if (wsib !== undefined && wsib !== null && wsib !== '') {
      wsibBoolean = wsib === 'true' || wsib === true || wsib === 'Yes' || wsib === 'yes';
    }
    if (csa !== undefined && csa !== null && csa !== '') {
      csaBoolean = csa === 'true' || csa === true || csa === 'Yes' || csa === 'yes';
    }
    if (medicalTracking !== undefined && medicalTracking !== null && medicalTracking !== '') {
      medicalBoolean = medicalTracking === 'true' || medicalTracking === true || medicalTracking === 'Yes' || medicalTracking === 'yes';
    }

    // ✅ Update location object - handle all location fields including empty strings
    // Check if any location field is present (even if empty string)
    const hasUnit = 'unit' in req.body;
    const hasPostalCode = 'postalCode' in req.body;
    const hasAddress = 'address' in req.body;
    const hasCity = 'city' in req.body;
    const hasState = 'state' in req.body;
    const hasLocationUpdate = hasAddress || hasUnit || hasCity || hasState || hasPostalCode;

    console.log('📍 Location update check:', {
      hasLocationUpdate,
      hasUnit: hasUnit,
      unitValue: req.body.unit,
      hasPostalCode: hasPostalCode,
      postalCodeValue: req.body.postalCode,
      hasAddress: hasAddress,
      addressValue: req.body.address,
      hasCity: hasCity,
      cityValue: req.body.city,
      hasState: hasState,
      stateValue: req.body.state
    });

    if (hasLocationUpdate) {
      if (!driver.location) {
        driver.location = {};
      }
      // Always update if field is in req.body (even if empty string)
      if (hasAddress) {
        driver.location.address = address !== undefined && address !== null ? (address || '') : '';
      }
      if (hasUnit) {
        driver.location.unit = unit !== undefined && unit !== null ? (unit || '') : '';
        console.log('💾 Setting location.unit:', unit, '→', driver.location.unit);
      }
      if (hasCity) {
        driver.location.city = city !== undefined && city !== null ? (city || '') : '';
      }
      if (hasState) {
        driver.location.state = state !== undefined && state !== null ? (state || '') : '';
      }
      if (hasPostalCode) {
        driver.location.postalCode = postalCode !== undefined && postalCode !== null ? (postalCode || '') : '';
        console.log('💾 Setting location.postalCode:', postalCode, '→', driver.location.postalCode);
      }
      // ✅ Mark location as modified to ensure Mongoose saves nested fields
      driver.markModified('location');
    }

    // Update top-level city, state, postalCode for backward compatibility
    if (hasCity) driver.city = city !== undefined && city !== null ? (city || '') : '';
    if (hasState) driver.state = state !== undefined && state !== null ? (state || '') : '';
    if (hasPostalCode) {
      driver.postalCode = postalCode !== undefined && postalCode !== null ? (postalCode || '') : '';
      console.log('💾 Setting top-level postalCode:', postalCode, '→', driver.postalCode);
    }

    // Update details object with driver-specific fields
    if (!driver.details) {
      driver.details = {};
    }

    if (gender !== undefined) driver.details.gender = gender || '';
    if (mobile !== undefined) driver.details.cell1 = mobile || '';
    if (citizenship !== undefined) driver.details.citizenship = citizenship || '';
    if (sinNo !== undefined) {
      // Handle case where sinNo might be an array - convert to string
      if (Array.isArray(sinNo)) {
        driver.details.sinNo = sinNo.join(', '); // Join array elements with comma
      } else {
        driver.details.sinNo = sinNo || '';
      }
    }
    if (licenceNumber !== undefined) {
      driver.details.licenceNumber = licenceNumber || '';
      console.log('💾 Setting licenceNumber:', licenceNumber, '→', driver.details.licenceNumber);
    }
    if (licenceExpiry !== undefined && licenceExpiry !== null) {
      const expiryValue = String(licenceExpiry).trim();
      driver.details.licenceExpiry = expiryValue !== '' ? new Date(licenceExpiry) : null;
      console.log('💾 Setting licenceExpiry:', licenceExpiry, '(trimmed:', expiryValue, ') →', driver.details.licenceExpiry);
    } else if (licenceExpiry === null || licenceExpiry === '') {
      // Explicitly set to null if empty string or null is sent
      driver.details.licenceExpiry = null;
      console.log('💾 Setting licenceExpiry to null (empty value provided)');
    }
    if (licenceState !== undefined && licenceState !== null) {
      driver.details.licenceState = String(licenceState).trim() || '';
      console.log('💾 Setting licenceState:', licenceState, '→', driver.details.licenceState);
    }
    if (passport !== undefined) driver.details.passport = passport || '';
    if (passportCountry !== undefined) driver.details.passportCountry = passportCountry || '';
    if (passportExpiry !== undefined) driver.details.passportExpiry = passportExpiry ? new Date(passportExpiry) : null;
    if (dob !== undefined) driver.details.dateOfBirth = dob ? new Date(dob) : null;
    if (wsib !== undefined && wsib !== null && wsib !== '') driver.details.wsib = wsibBoolean;
    if (wsibAccountNo !== undefined) driver.details.wsibAccountNo = wsibAccountNo || '';
    if (fastCard !== undefined) driver.details.fastCardNo = fastCard || '';
    if (fastCardExpiry !== undefined) driver.details.fastCardExpiry = fastCardExpiry ? new Date(fastCardExpiry) : null;
    if (fastCardValid !== undefined) {
      const fastCardValidBool = fastCardValid === 'true' || fastCardValid === true || fastCardValid === 'Yes' || fastCardValid === 'yes';
      driver.details.fastCardValid = fastCardValidBool;
    }
    if (canadianWorkerStatus !== undefined && canadianWorkerStatus !== null) {
      driver.details.canadianWorkerStatus = String(canadianWorkerStatus).trim() || '';
      console.log('💾 Setting canadianWorkerStatus:', canadianWorkerStatus, '→', driver.details.canadianWorkerStatus);
    }
    if (permanentResidenceExpiry !== undefined) driver.details.permanentResidenceExpiry = permanentResidenceExpiry ? new Date(permanentResidenceExpiry) : null;
    if (workPermitExpiry !== undefined) driver.details.workPermitExpiry = workPermitExpiry ? new Date(workPermitExpiry) : null;

    // Handle Work Permit and PR Card document uploads
    if (req.files) {
      // Work Permit Document
      if (req.files.workPermitDocument) {
        const workPermitFile = Array.isArray(req.files.workPermitDocument) ? req.files.workPermitDocument[0] : req.files.workPermitDocument;
        if (workPermitFile) {
          const workPermitUrl = workPermitFile.location ||
            (workPermitFile.path ? `${req.protocol}://${req.get("host")}/${workPermitFile.path.replace(/\\/g, '/')}` : null);
          if (workPermitUrl) {
            driver.details.workPermitDocumentUrl = workPermitUrl;
            console.log('✅ Work Permit document updated:', workPermitUrl);
          }
        }
      }

      // PR Card Document
      if (req.files.prCardDocument) {
        const prCardFile = Array.isArray(req.files.prCardDocument) ? req.files.prCardDocument[0] : req.files.prCardDocument;
        if (prCardFile) {
          const prCardUrl = prCardFile.location ||
            (prCardFile.path ? `${req.protocol}://${req.get("host")}/${prCardFile.path.replace(/\\/g, '/')}` : null);
          if (prCardUrl) {
            driver.details.prCardDocumentUrl = prCardUrl;
            console.log('✅ PR Card document updated:', prCardUrl);
          }
        }
      }
    }
    if (medicalTracking !== undefined && medicalTracking !== null && medicalTracking !== '') {
      driver.details.medicalRequired = medicalBoolean;
    }
    if (csa !== undefined && csa !== null && csa !== '') driver.details.csa = csaBoolean;
    if (employmentDetails !== undefined) driver.details.remark = employmentDetails || '';

    // Update salary per mile fields
    if (salaryPerMile !== undefined) driver.details.salaryPerMile = Number(salaryPerMile) || 0;
    if (salaryPerMileSnow !== undefined) driver.details.salaryPerMileSnow = Number(salaryPerMileSnow) || 0;
    if (salaryPerMileHighTemp !== undefined) driver.details.salaryPerMileHighTemp = Number(salaryPerMileHighTemp) || 0;
    if (highTempThreshold !== undefined) driver.details.highTempThreshold = Number(highTempThreshold) || 35;

    // Update payment rate fields
    if (mileRate !== undefined) driver.details.mileRate = Number(mileRate) || 0;
    if (mileRateTeam !== undefined) driver.details.mileRateTeam = Number(mileRateTeam) || 0;
    if (emptyMileRate !== undefined) driver.details.emptyMileRate = Number(emptyMileRate) || 0;
    if (emptyMileRateTeam !== undefined) driver.details.emptyMileRateTeam = Number(emptyMileRateTeam) || 0;
    if (hourlyRate !== undefined) driver.details.hourlyRate = Number(hourlyRate) || 0;
    if (weightRate !== undefined) driver.details.weightRate = Number(weightRate) || 0;
    if (percentageRate !== undefined) driver.details.percentageRate = Number(percentageRate) || 0;
    if (bonusDrop !== undefined) driver.details.bonusDrop = Number(bonusDrop) || 0;
    if (bonusPick !== undefined) driver.details.bonusPick = Number(bonusPick) || 0;
    if (bonusLayover !== undefined) driver.details.bonusLayover = Number(bonusLayover) || 0;
    if (perTripAmount !== undefined) driver.details.perTripAmount = Number(perTripAmount) || 0;
    if (dailyRate !== undefined) driver.details.dailyRate = Number(dailyRate) || 0;

    // Update personal information fields
    if (termDate !== undefined) driver.details.termDate = termDate ? new Date(termDate) : null;
    if (vacationPay !== undefined) driver.details.vacationPay = vacationPay || '';
    if (incorporation !== undefined) driver.details.incorporation = incorporation || '';
    if (gstNo !== undefined) driver.details.gstNo = gstNo || '';
    if (companyFlag !== undefined) {
      const companyFlagBool = companyFlag === 'true' || companyFlag === true || companyFlag === 'Yes' || companyFlag === 'yes' || companyFlag === 'OWNER OPERATOR';
      driver.details.companyFlag = companyFlagBool;
    }
    if (paymentMethod !== undefined) driver.details.paymentMethod = paymentMethod || '';
    // Update exemption fields
    if (cppExempt !== undefined) {
      const cppExemptBool = cppExempt === 'true' || cppExempt === true || cppExempt === 'Yes' || cppExempt === 'yes';
      driver.details.cppQppExempt = cppExemptBool;
    }
    if (payrollTaxExempt !== undefined) {
      const payrollTaxExemptBool = payrollTaxExempt === 'true' || payrollTaxExempt === true || payrollTaxExempt === 'Yes' || payrollTaxExempt === 'yes';
      driver.details.provTaxExempt = payrollTaxExemptBool;
    }
    if (customHst !== undefined) driver.details.customHst = customHst || '';
    if (driverName !== undefined) driver.details.driverName = driverName || '';
    if (paymentAddress !== undefined) driver.details.paymentAddress = paymentAddress || '';
    if (paymentSearchAddress !== undefined) driver.details.paymentSearchAddress = paymentSearchAddress || '';
    if (paymentCity !== undefined) driver.details.paymentCity = paymentCity || '';
    if (paymentPostalCode !== undefined) driver.details.paymentPostalCode = paymentPostalCode || '';
    if (paymentCountry !== undefined) driver.details.paymentCountry = paymentCountry || '';
    if (paymentStateProvince !== undefined) driver.details.paymentStateProvince = paymentStateProvince || '';
    // Update driver type (SOLO/TEAM) - driverTypeSolo: true = SOLO, false = TEAM
    // Accept both driverTypeSolo and solo for backward compatibility
    if (driverTypeSolo !== undefined || solo !== undefined) {
      const soloValue = driverTypeSolo !== undefined ? driverTypeSolo : solo;
      const soloBool = soloValue === 'true' || soloValue === true || soloValue === 'Yes' || soloValue === 'yes';
      driver.details.driverTypeSolo = soloBool;
      console.log('✅ Updated driverTypeSolo:', soloBool);
    }
    // Update cross-border eligibility
    if (cross_border_eligible !== undefined) {
      const crossBorderBool = cross_border_eligible === 'true' || cross_border_eligible === true || cross_border_eligible === 'Yes' || cross_border_eligible === 'yes';
      driver.details.cross_border_eligible = crossBorderBool;
      console.log('✅ Updated cross_border_eligible:', crossBorderBool);
    }

    // ✅ Mark details as modified to ensure Mongoose saves nested fields
    // Mark each nested field individually to ensure they're saved
    if (driver.details) {
      driver.markModified('details');
      if (driver.details.licenceExpiry !== undefined) driver.markModified('details.licenceExpiry');
      if (driver.details.licenceState !== undefined) driver.markModified('details.licenceState');
      if (driver.details.canadianWorkerStatus !== undefined) driver.markModified('details.canadianWorkerStatus');
      if (driver.details.licenceNumber !== undefined) driver.markModified('details.licenceNumber');
      console.log('✅ Marked details fields as modified');
    }

    // Validate and update company ObjectId if provided
    if (company !== undefined) {
      if (company === '' || company === null) {
        driver.company = null;
      } else if (mongoose.Types.ObjectId.isValid(company)) {
        driver.company = new mongoose.Types.ObjectId(company);
      } else {
        return res.status(400).json({ success: false, message: "Invalid company ID format" });
      }
    }

    // ✅ Log driver object before save to see what will be saved
    console.log('💾 Driver object before save:', {
      location: driver.location,
      locationUnit: driver.location?.unit,
      locationPostalCode: driver.location?.postalCode,
      postalCode: driver.postalCode,
      locationKeys: driver.location ? Object.keys(driver.location) : [],
      details: {
        licenceNumber: driver.details?.licenceNumber,
        licenceExpiry: driver.details?.licenceExpiry,
        licenceState: driver.details?.licenceState,
        canadianWorkerStatus: driver.details?.canadianWorkerStatus,
        passportExpiry: driver.details?.passportExpiry,
        fastCardExpiry: driver.details?.fastCardExpiry
      },
      reqBodyFields: {
        licenceExpiry: req.body.licenceExpiry,
        licenceState: req.body.licenceState,
        canadianWorkerStatus: req.body.canadianWorkerStatus,
        licenceNumber: req.body.licenceNumber
      }
    });

    // Update driver test requirement flags
    if (handlesHazardousLoads !== undefined) {
      const oldValue = driver.handlesHazardousLoads;
      driver.handlesHazardousLoads = handlesHazardousLoads === 'true' || handlesHazardousLoads === true;
      if (oldValue !== driver.handlesHazardousLoads) {
        driver.flagsUpdatedAt = new Date();
        driver.flagsUpdatedBy = req.user._id;
        console.log('✅ Updated handlesHazardousLoads:', oldValue, '→', driver.handlesHazardousLoads);
      }
    }

    if (winterTestRequired !== undefined) {
      const oldValue = driver.winterTestRequired;
      driver.winterTestRequired = winterTestRequired === 'true' || winterTestRequired === true;
      if (oldValue !== driver.winterTestRequired) {
        driver.flagsUpdatedAt = new Date();
        driver.flagsUpdatedBy = req.user._id;
        console.log('✅ Updated winterTestRequired:', oldValue, '→', driver.winterTestRequired);
      }
    }

    await driver.save();
    console.log('✅ Driver saved successfully');
    console.log('📸 Profile Image URL after save:', driver.profileImageUrl);

    // ✅ Handle related records updates (documents, certifications, violations, deductions, additions)
    try {
      const { getUserCompanyId } = await import("../utils/companyFilter.js");
      const companyObjectId = driver.company || getUserCompanyId(req.user);

      // Parse JSON strings if they're strings
      let documentsArray = [];
      let certificationsArray = [];
      let violationsArray = [];
      let deductionsArray = [];
      let additionsArray = [];

      if (documents) {
        try {
          documentsArray = typeof documents === 'string' ? JSON.parse(documents) : documents;
        } catch (e) {
          console.error('Error parsing documents:', e);
        }
      }

      if (certifications) {
        try {
          certificationsArray = typeof certifications === 'string' ? JSON.parse(certifications) : certifications;
        } catch (e) {
          console.error('Error parsing certifications:', e);
        }
      }

      if (violations) {
        try {
          violationsArray = typeof violations === 'string' ? JSON.parse(violations) : violations;
        } catch (e) {
          console.error('Error parsing violations:', e);
        }
      }

      if (deductions) {
        try {
          deductionsArray = typeof deductions === 'string' ? JSON.parse(deductions) : deductions;
        } catch (e) {
          console.error('Error parsing deductions:', e);
        }
      }

      if (additions) {
        try {
          additionsArray = typeof additions === 'string' ? JSON.parse(additions) : additions;
        } catch (e) {
          console.error('Error parsing additions:', e);
        }
      }

      // Parse drug tests
      let drugTestsArray = [];
      if (drugTests) {
        try {
          drugTestsArray = typeof drugTests === 'string' ? JSON.parse(drugTests) : drugTests;
          console.log(`💊 Parsed drug tests array:`, JSON.stringify(drugTestsArray, null, 2));
        } catch (e) {
          console.error('Error parsing drug tests:', e);
        }
      } else {
        console.log('⚠️ No drug tests provided in request body');
      }

      // Handle documents
      if (documentsArray && documentsArray.length > 0) {
        const { EmployeeDocument } = await import("../models/driver/employeeDocumentModel.js");
        console.log(`📄 Processing ${documentsArray.length} documents for driver ${driver._id}`);

        // Get document files from req.files
        const documentFiles = req.files && req.files.documentFiles ?
          (Array.isArray(req.files.documentFiles) ? req.files.documentFiles : [req.files.documentFiles]) : [];

        // Get document types from body
        const documentTypes = req.body.documentTypes ?
          (Array.isArray(req.body.documentTypes) ? req.body.documentTypes : [req.body.documentTypes]) : [];

        // Track file index separately since files are only sent for documents that have files
        let fileIndex = 0;

        for (let i = 0; i < documentsArray.length; i++) {
          const doc = documentsArray[i];
          try {
            const docId = doc.id || doc._id;
            const hasFile = doc.hasFile === true; // Check if this document has a file

            // Check if this is an existing document (ID starts with "existing-")
            if (docId && docId.toString().startsWith('existing-')) {
              const actualId = docId.toString().replace('existing-', '');

              if (mongoose.Types.ObjectId.isValid(actualId)) {
                // Update existing document
                const existingDoc = await EmployeeDocument.findById(actualId);
                if (existingDoc && existingDoc.employee.toString() === driver._id.toString()) {
                  const updateData = {};
                  if (doc.description !== undefined) updateData.description = doc.description;
                  if (doc.expiryDate !== undefined) {
                    updateData.expiryDate = doc.expiryDate ? new Date(doc.expiryDate) : null;
                  }
                  if (doc.ignoreExpiration !== undefined) updateData.ignoreExpiration = doc.ignoreExpiration;

                  // Handle file upload if provided - use fileIndex instead of array index i
                  if (hasFile && fileIndex < documentFiles.length) {
                    const docFile = documentFiles[fileIndex];
                    if (docFile) {
                      const fileUrl = docFile.location ||
                        (docFile.path ? `${req.protocol}://${req.get("host")}/${docFile.path.replace(/\\/g, '/')}` : null);
                      updateData.fileUrl = fileUrl;
                      updateData.fileName = docFile.originalname;
                      updateData.fileSize = docFile.size;
                      updateData.mimeType = docFile.mimetype;
                      console.log(`📎 Updating existing document with file: ${docFile.originalname}`);
                    }
                    fileIndex++; // Increment file index only when file is used
                  }

                  Object.assign(existingDoc, updateData);
                  await existingDoc.save();
                  console.log(`✅ Document updated: ${existingDoc._id}`);
                }
              }
            } else {
              // Create new document
              const docType = doc.documentType || (documentTypes.length > 0 ? documentTypes[0] : 'Other');
              let fileMetadata = {};

              // Get file for new document - use fileIndex instead of array index i
              if (hasFile && fileIndex < documentFiles.length) {
                const docFile = documentFiles[fileIndex];
                if (docFile) {
                  const fileUrl = docFile.location ||
                    (docFile.path ? `${req.protocol}://${req.get("host")}/${docFile.path.replace(/\\/g, '/')}` : null);
                  fileMetadata = {
                    fileUrl: fileUrl,
                    fileName: docFile.originalname,
                    fileSize: docFile.size,
                    mimeType: docFile.mimetype
                  };
                  console.log(`📎 Creating new document with file: ${docFile.originalname}`);
                  fileIndex++; // Increment file index only when file is used
                }
              }

              const documentData = {
                employee: driver._id,
                documentType: docType,
                description: doc.description || '',
                expiryDate: doc.expiryDate ? new Date(doc.expiryDate) : null,
                ignoreExpiration: doc.ignoreExpiration || false,
                status: 'valid',
                uploadedBy: req.user._id,
                company: companyObjectId,
                ...fileMetadata
              };

              const newDoc = new EmployeeDocument(documentData);
              await newDoc.save();
              console.log(`✅ New document created: ${newDoc._id}`);
            }
          } catch (docError) {
            console.error('Error processing document:', docError);
          }
        }
      }

      // Handle certifications (Training Certificates)
      if (certificationsArray && certificationsArray.length > 0) {
        const { TrainingCertificate } = await import("../models/driver/trainingCertificateModel.js");
        console.log(`📜 Processing ${certificationsArray.length} certifications for driver ${driver._id}`);

        // Get certification files from req.files
        const certificationFiles = req.files && req.files.certificationFiles ?
          (Array.isArray(req.files.certificationFiles) ? req.files.certificationFiles : [req.files.certificationFiles]) : [];

        console.log(`📎 Certification files received: ${certificationFiles.length} files for ${certificationsArray.length} certifications`);
        console.log(`📎 Certifications data:`, certificationsArray.map(c => ({ id: c.id, hasFile: c.hasFile, title: c.title })));

        // Track file index separately - files are only sent for certifications with hasFile=true
        let fileIndex = 0;

        for (let i = 0; i < certificationsArray.length; i++) {
          const cert = certificationsArray[i];
          try {
            const certId = cert.id || cert._id;
            const hasFile = cert.hasFile === true; // Check if this certification has a file

            if (certId && certId.toString().startsWith('existing-')) {
              const actualId = certId.toString().replace('existing-', '');

              if (mongoose.Types.ObjectId.isValid(actualId)) {
                const existingCert = await TrainingCertificate.findById(actualId);
                if (existingCert && existingCert.driverId.toString() === driver._id.toString()) {
                  const updateData = {};
                  if (cert.title) updateData.certificateName = cert.title;
                  if (cert.description !== undefined) {
                    updateData.description = cert.description || '';
                  }
                  if (cert.subCategory !== undefined) {
                    updateData.certificateType = cert.subCategory || cert.certificateType || 'Other';
                    updateData.issuingAuthority = cert.issuingAuthority || cert.subCategory || existingCert.issuingAuthority || 'Unknown Authority';
                  }
                  if (cert.result !== undefined) {
                    updateData.notes = cert.result || cert.notes || '';
                  }
                  if (cert.expiryDate !== undefined) {
                    updateData.expiryDate = cert.expiryDate ? new Date(cert.expiryDate) : null;
                  }
                  if (cert.certificateNumber !== undefined) {
                    updateData.certificateNumber = cert.certificateNumber || '';
                  }
                  if (cert.ignoreExpiration !== undefined) {
                    updateData.ignoreExpiration = cert.ignoreExpiration === true || cert.ignoreExpiration === 'true';
                  }

                  // Handle file update if hasFile is true
                  if (hasFile && fileIndex < certificationFiles.length) {
                    const certFile = certificationFiles[fileIndex];
                    if (certFile) {
                      const fileUrl = certFile.location ||
                        (certFile.path ? `${req.protocol}://${req.get("host")}/${certFile.path.replace(/\\/g, '/')}` : null);
                      updateData.fileUrl = fileUrl;
                      updateData.fileName = certFile.originalname;
                      updateData.fileSize = certFile.size;
                      updateData.mimeType = certFile.mimetype;
                      console.log(`📎 Updating existing certification with file: ${certFile.originalname}`);
                    }
                    fileIndex++; // Increment file index only when file is used
                  }

                  Object.assign(existingCert, updateData);
                  await existingCert.save();
                  console.log(`✅ Certification updated: ${existingCert._id}`);
                }
              }
            } else {
              // Create new certification
              const certificationData = {
                driverId: driver._id,
                certificateName: cert.title || 'Unknown Certification',
                certificateType: cert.subCategory || cert.certificateType || 'Other',
                issuedDate: new Date(),
                expiryDate: cert.expiryDate ? new Date(cert.expiryDate) : null,
                issuingAuthority: cert.issuingAuthority || cert.subCategory || 'Unknown Authority',
                certificateNumber: cert.certificateNumber || '',
                description: cert.description || '',
                notes: cert.result || cert.notes || '',
                ignoreExpiration: cert.ignoreExpiration === true || cert.ignoreExpiration === 'true',
                status: 'active',
                company: companyObjectId,
                createdBy: req.user._id
              };

              // Handle file if hasFile is true
              if (hasFile && fileIndex < certificationFiles.length) {
                const certFile = certificationFiles[fileIndex];
                if (certFile) {
                  const fileUrl = certFile.location ||
                    (certFile.path ? `${req.protocol}://${req.get("host")}/${certFile.path.replace(/\\/g, '/')}` : null);
                  certificationData.fileUrl = fileUrl;
                  certificationData.fileName = certFile.originalname;
                  certificationData.fileSize = certFile.size;
                  certificationData.mimeType = certFile.mimetype;
                  console.log(`📎 Creating new certification with file: ${certFile.originalname}`);
                  fileIndex++; // Increment file index only when file is used
                }
              }

              const newCert = new TrainingCertificate(certificationData);
              await newCert.save();
              console.log(`✅ New certification created: ${newCert._id}`);
            }
          } catch (certError) {
            console.error('Error processing certification:', certError);
          }
        }
      }

      // Handle tickets (Tickets & Fines)
      let ticketsArray = [];
      if (req.body.tickets) {
        try {
          ticketsArray = typeof req.body.tickets === 'string' ? JSON.parse(req.body.tickets) : req.body.tickets;
        } catch (e) {
          console.error('Error parsing tickets:', e);
        }
      }

      if (ticketsArray && ticketsArray.length > 0) {
        const { DriverTicket } = await import("../models/driverTicketModel.js");
        console.log(`🎫 Processing ${ticketsArray.length} tickets for driver ${driver._id}`);

        // Get ticket files from req.files
        const ticketFiles = req.files && req.files.ticketFiles ?
          (Array.isArray(req.files.ticketFiles) ? req.files.ticketFiles : [req.files.ticketFiles]) : [];

        console.log(`📎 Ticket files received: ${ticketFiles.length} files for ${ticketsArray.length} tickets`);

        // Track file index separately - files are only sent for tickets with hasFile=true
        let fileIndex = 0;

        for (let i = 0; i < ticketsArray.length; i++) {
          const ticket = ticketsArray[i];
          try {
            const ticketId = ticket.id || ticket._id;

            if (ticketId && ticketId.toString().startsWith('existing-')) {
              const actualId = ticketId.toString().replace('existing-', '');

              if (mongoose.Types.ObjectId.isValid(actualId)) {
                const existingTicket = await DriverTicket.findById(actualId);
                if (existingTicket && existingTicket.driver.toString() === driver._id.toString()) {
                  const updateData = {};

                  if (ticket.date) updateData.date = new Date(ticket.date);
                  if (ticket.title !== undefined) updateData.title = ticket.title.trim();
                  if (ticket.description !== undefined) updateData.description = ticket.description.trim();
                  if (ticket.amount !== undefined) updateData.amount = ticket.amount ? parseFloat(ticket.amount) : 0;
                  if (ticket.currency !== undefined) updateData.currency = ticket.currency || 'CAD';
                  if (ticket.status !== undefined) updateData.status = ticket.status;

                  // Handle file update if hasFile is true
                  const hasFile = ticket.hasFile === true;
                  if (hasFile && fileIndex < ticketFiles.length) {
                    const ticketFile = ticketFiles[fileIndex];
                    if (ticketFile) {
                      const fileUrl = ticketFile.location ||
                        (ticketFile.path ? `${req.protocol}://${req.get("host")}/${ticketFile.path.replace(/\\/g, '/')}` : null);
                      updateData.fileUrl = fileUrl;
                      updateData.fileName = ticketFile.originalname;
                      updateData.fileSize = ticketFile.size;
                      updateData.mimeType = ticketFile.mimetype;
                      console.log(`📎 Updating existing ticket with file: ${ticketFile.originalname}`);
                    }
                    fileIndex++;
                  }

                  Object.assign(existingTicket, updateData);
                  await existingTicket.save();
                  console.log(`✅ Ticket updated: ${existingTicket._id}`);
                }
              }
            } else {
              // Create new ticket
              const ticketDate = ticket.date ? new Date(ticket.date) : new Date();
              const hasFile = ticket.hasFile === true;
              let fileMetadata = {};

              // Get file for new ticket
              if (hasFile && fileIndex < ticketFiles.length) {
                const ticketFile = ticketFiles[fileIndex];
                if (ticketFile) {
                  const fileUrl = ticketFile.location ||
                    (ticketFile.path ? `${req.protocol}://${req.get("host")}/${ticketFile.path.replace(/\\/g, '/')}` : null);
                  fileMetadata = {
                    fileUrl: fileUrl,
                    fileName: ticketFile.originalname,
                    fileSize: ticketFile.size,
                    mimeType: ticketFile.mimetype
                  };
                  console.log(`📎 Creating new ticket with file: ${ticketFile.originalname}`);
                  fileIndex++;
                }
              }

              const ticketData = {
                driver: driver._id,
                date: ticketDate,
                title: ticket.title || '',
                description: ticket.description || '',
                amount: ticket.amount ? parseFloat(ticket.amount) : 0,
                currency: ticket.currency || 'CAD',
                status: ticket.status || 'Unpaid',
                company: companyObjectId,
                uploadedBy: req.user._id,
                ...fileMetadata
              };

              // Only create if we have required fields
              if (ticketData.date && ticketData.title) {
                const newTicket = new DriverTicket(ticketData);
                await newTicket.save();
                console.log(`✅ New ticket created: ${newTicket._id}`);
              } else {
                console.warn('⚠️ Skipping ticket - missing required fields (date or title)');
              }
            }
          } catch (ticketError) {
            console.error('Error processing ticket:', ticketError);
          }
        }
        console.log(`✅ All ${ticketsArray.length} tickets processed`);
      }

      // Handle violations
      if (violationsArray && violationsArray.length > 0) {
        const { DriverViolation } = await import("../models/driverViolationModel.js");
        console.log(`🚨 Processing ${violationsArray.length} violations for driver ${driver._id}`);

        // Get violation files from req.files
        const violationFiles = req.files && req.files.violationFiles ?
          (Array.isArray(req.files.violationFiles) ? req.files.violationFiles : [req.files.violationFiles]) : [];

        console.log(`📎 Violation files received: ${violationFiles.length} files for ${violationsArray.length} violations`);
        console.log(`📎 Violations data:`, violationsArray.map(v => ({ id: v.id, hasFile: v.hasFile, ticket: v.ticket })));

        // Track file index separately - files are only sent for violations with hasFile=true
        // So we need to match files based on hasFile flag, not array index
        let fileIndex = 0;

        for (let i = 0; i < violationsArray.length; i++) {
          const violation = violationsArray[i];
          try {
            const vioId = violation.id || violation._id;

            if (vioId && vioId.toString().startsWith('existing-')) {
              const actualId = vioId.toString().replace('existing-', '');

              if (mongoose.Types.ObjectId.isValid(actualId)) {
                const existingVio = await DriverViolation.findById(actualId);
                if (existingVio && existingVio.driver.toString() === driver._id.toString()) {
                  const updateData = {};

                  // Handle date - prefer dateOfIncident, fallback to paymentDueDate or date
                  if (violation.dateOfIncident) {
                    const incidentDate = new Date(violation.dateOfIncident);
                    updateData.date = incidentDate;
                    updateData.dateOfIncident = incidentDate;
                  } else if (violation.paymentDueDate) {
                    updateData.date = new Date(violation.paymentDueDate);
                  }

                  // Handle all violation fields
                  if (violation.violationType !== undefined) updateData.violationType = violation.violationType;
                  if (violation.title !== undefined) updateData.title = violation.title;
                  if (violation.description !== undefined) updateData.description = violation.description;
                  if (violation.reportedBy !== undefined) updateData.reportedBy = violation.reportedBy;
                  if (violation.severity !== undefined) updateData.severity = violation.severity;
                  if (violation.actionTaken !== undefined) updateData.actionTaken = violation.actionTaken;
                  if (violation.status !== undefined) updateData.status = violation.status;

                  // Handle legacy fields for backward compatibility
                  if (violation.ticket) {
                    if (!updateData.description) updateData.description = violation.description || violation.ticket;
                    updateData.ticketInfo = { ticketNumber: violation.ticket };
                  }

                  if (violation.currency !== undefined && violation.currency !== null) {
                    updateData.currency = violation.currency;
                    console.log(`💰 Updating violation ${actualId} currency to: ${violation.currency}`);
                  } else {
                    console.log(`⚠️ Violation ${actualId} currency not provided or is null/undefined:`, violation.currency);
                  }
                  if (violation.amount !== undefined && violation.amount !== null && violation.amount !== '') {
                    updateData.amount = parseFloat(violation.amount) || 0;
                  }

                  // Preserve existing file metadata if fileUrl/fileName are provided
                  if (violation.fileUrl !== undefined) updateData.fileUrl = violation.fileUrl;
                  if (violation.fileName !== undefined) updateData.fileName = violation.fileName;

                  // Handle file upload if provided - check hasFile flag and get file from array
                  if (violation.hasFile && violationFiles.length > fileIndex) {
                    const vioFile = violationFiles[fileIndex];
                    fileIndex++; // Increment for next violation that needs a file

                    const fileUrl = vioFile.location ||
                      (vioFile.path ? `${req.protocol}://${req.get("host")}/${vioFile.path.replace(/\\/g, '/')}` : null);
                    updateData.fileUrl = fileUrl;
                    updateData.fileName = vioFile.originalname;
                    updateData.fileSize = vioFile.size;
                    updateData.mimeType = vioFile.mimetype;
                    console.log(`📎 Updating violation ${actualId} with file: ${vioFile.originalname}`, { fileUrl, fileName: updateData.fileName });
                  } else if (!violation.hasFile) {
                    // If hasFile is false, preserve existing file metadata (don't overwrite)
                    if (existingVio.fileUrl) updateData.fileUrl = existingVio.fileUrl;
                    if (existingVio.fileName) updateData.fileName = existingVio.fileName;
                    if (existingVio.fileSize) updateData.fileSize = existingVio.fileSize;
                    if (existingVio.mimeType) updateData.mimeType = existingVio.mimeType;
                    console.log(`ℹ️ Violation ${actualId} has no new file, preserving existing file metadata`, { existingFileUrl: existingVio.fileUrl, existingFileName: existingVio.fileName });
                  } else {
                    // hasFile is true but no file available - log warning
                    console.warn(`⚠️ Violation ${actualId} has hasFile=true but no file available at index ${fileIndex} (total files: ${violationFiles.length})`);
                  }

                  console.log(`📝 Violation updateData before save:`, JSON.stringify(updateData, null, 2));
                  Object.assign(existingVio, updateData);
                  await existingVio.save();

                  // Verify the file was saved by reloading from database
                  const savedVio = await DriverViolation.findById(existingVio._id).lean();
                  console.log(`✅ Violation updated: ${existingVio._id}`, {
                    fileUrl: savedVio.fileUrl,
                    fileName: savedVio.fileName,
                    currency: savedVio.currency,
                    hasFileUrl: !!savedVio.fileUrl,
                    hasFileName: !!savedVio.fileName
                  });
                }
              }
            } else {
              // Create new violation
              const violationDate = violation.paymentDueDate ? new Date(violation.paymentDueDate) : new Date();
              const ticketNumber = violation.ticket || '';
              const violationType = violation.violationType || 'other';

              // Get file if hasFile is true and file is available
              let fileMetadata = {};
              if (violation.hasFile && violationFiles.length > fileIndex) {
                const vioFile = violationFiles[fileIndex];
                fileIndex++; // Increment for next violation that needs a file

                const fileUrl = vioFile.location ||
                  (vioFile.path ? `${req.protocol}://${req.get("host")}/${vioFile.path.replace(/\\/g, '/')}` : null);
                fileMetadata = {
                  fileUrl: fileUrl,
                  fileName: vioFile.originalname,
                  fileSize: vioFile.size,
                  mimeType: vioFile.mimetype
                };
                console.log(`📎 Creating new violation with file: ${vioFile.originalname}`);
              }

              // Use dateOfIncident if provided, otherwise use violationDate
              const incidentDate = violation.dateOfIncident ? new Date(violation.dateOfIncident) : violationDate;

              const violationData = {
                driver: driver._id,
                date: incidentDate,
                dateOfIncident: incidentDate,
                violationType: violation.violationType || violationType,
                title: violation.title || '',
                description: violation.description || ticketNumber || '',
                reportedBy: violation.reportedBy || '',
                severity: violation.severity || 'Low',
                actionTaken: violation.actionTaken || '',
                status: violation.status || 'Open',
                ticketInfo: ticketNumber ? { ticketNumber: ticketNumber } : undefined,
                currency: violation.currency || 'CAD', // Default to CAD if not provided
                amount: violation.amount ? parseFloat(violation.amount) : 0, // Amount field (optional)
                source: 'manual',
                company: companyObjectId,
                ...fileMetadata
              };

              const newVio = new DriverViolation(violationData);
              await newVio.save();
              console.log(`✅ New violation created: ${newVio._id}`);
            }
          } catch (vioError) {
            console.error('Error processing violation:', vioError);
          }
        }
        console.log(`✅ All ${violationsArray.length} violations processed`);
      }


      // Handle deductions and additions
      if ((deductionsArray && deductionsArray.length > 0) || (additionsArray && additionsArray.length > 0)) {
        const { DeductionAddition } = await import("../models/hr/settlementModel.js");
        console.log(`💰 Processing ${(deductionsArray?.length || 0) + (additionsArray?.length || 0)} deductions/additions for driver ${driver._id}`);

        const normalizeIntervalToRecurrence = (value) => {
          const v = (value || '').toString().trim().toLowerCase();
          if (!v) return 'One-time';
          if (v === 'one-time' || v === 'one time' || v === 'onetime') return 'One-time';
          if (v === 'one time payment') return 'One Time Payment';
          if (v === 'bi-weekly' || v === 'biweekly' || v === 'bi weekly') return 'Bi-weekly';
          if (v === 'weekly') return 'Weekly';
          if (v === 'monthly') return 'Monthly';
          if (v === 'quarterly') return 'Quarterly';
          if (v === 'yearly' || v === 'annual') return 'Yearly';
          return (value || '').toString();
        };

        // Process deductions
        for (const deduction of deductionsArray || []) {
          try {
            const dedId = deduction.id || deduction._id;

            if (dedId && dedId.toString().startsWith('existing-')) {
              const actualId = dedId.toString().replace('existing-', '');

              if (mongoose.Types.ObjectId.isValid(actualId)) {
                const existingDed = await DeductionAddition.findById(actualId);
                if (existingDed && existingDed.assignedTo.toString() === driver._id.toString() && existingDed.type === 'Deduction') {
                  const updateData = {};
                  if (deduction.description) updateData.name = deduction.description;
                  if (deduction.amount !== undefined) updateData.amount = Number(deduction.amount) || 0;
                  if (deduction.interval) updateData.recurrence = normalizeIntervalToRecurrence(deduction.interval);
                  if (deduction.startDate) updateData.startDate = new Date(deduction.startDate);
                  if (deduction.currency) updateData.currency = deduction.currency;

                  Object.assign(existingDed, updateData);
                  await existingDed.save();
                  console.log(`✅ Deduction updated: ${existingDed._id}`);
                }
              }
            } else {
              const deductionData = {
                name: deduction.description || deduction.name || 'Deduction',
                type: 'Deduction',
                recurrence: normalizeIntervalToRecurrence(deduction.interval),
                amount: Number(deduction.amount) || 0,
                currency: deduction.currency || 'CAD',
                assignedTo: driver._id,
                startDate: deduction.startDate ? new Date(deduction.startDate) : new Date(),
                description: deduction.description || '',
                isActive: true,
                company: companyObjectId,
                createdBy: req.user._id
              };

              const newDed = new DeductionAddition(deductionData);
              await newDed.save();
              console.log(`✅ New deduction created: ${newDed._id}`);
            }
          } catch (dedError) {
            console.error('Error processing deduction:', dedError);
          }
        }

        // Process additions
        for (const addition of additionsArray || []) {
          try {
            const addId = addition.id || addition._id;

            if (addId && addId.toString().startsWith('existing-')) {
              const actualId = addId.toString().replace('existing-', '');

              if (mongoose.Types.ObjectId.isValid(actualId)) {
                const existingAdd = await DeductionAddition.findById(actualId);
                if (existingAdd && existingAdd.assignedTo.toString() === driver._id.toString() && existingAdd.type === 'Addition') {
                  const updateData = {};
                  if (addition.description) updateData.name = addition.description;
                  if (addition.amount !== undefined) updateData.amount = Number(addition.amount) || 0;
                  if (addition.interval) updateData.recurrence = normalizeIntervalToRecurrence(addition.interval);
                  if (addition.startDate) updateData.startDate = new Date(addition.startDate);
                  if (addition.currency) updateData.currency = addition.currency;

                  Object.assign(existingAdd, updateData);
                  await existingAdd.save();
                  console.log(`✅ Addition updated: ${existingAdd._id}`);
                }
              }
            } else {
              const additionData = {
                name: addition.description || addition.name || 'Addition',
                type: 'Addition',
                recurrence: normalizeIntervalToRecurrence(addition.interval),
                amount: Number(addition.amount) || 0,
                currency: addition.currency || 'CAD',
                assignedTo: driver._id,
                startDate: addition.startDate ? new Date(addition.startDate) : new Date(),
                description: addition.description || '',
                isActive: true,
                company: companyObjectId,
                createdBy: req.user._id
              };

              const newAdd = new DeductionAddition(additionData);
              await newAdd.save();
              console.log(`✅ New addition created: ${newAdd._id}`);
            }
          } catch (addError) {
            console.error('Error processing addition:', addError);
          }
        }
      }

      // Handle drug tests (always process, even if empty array, to clear deleted drug tests)
      if (drugTestsArray !== undefined && drugTestsArray !== null) {
        console.log(`💊 Processing ${drugTestsArray.length} drug tests for driver ${driver._id}`);
        console.log(`💊 Raw drug tests array:`, JSON.stringify(drugTestsArray, null, 2));

        // Get drug test files from req.files
        const drugTestFiles = req.files && req.files.drugTestFiles ?
          (Array.isArray(req.files.drugTestFiles) ? req.files.drugTestFiles : [req.files.drugTestFiles]) : [];
        console.log(`💊 Received ${drugTestFiles.length} drug test files`);

        // Initialize drug_tests array if it doesn't exist
        if (!driver.details) driver.details = {};
        if (!driver.details.drug_tests) driver.details.drug_tests = [];

        // Store existing drug tests BEFORE clearing (for reference when updating)
        const existingDrugTestsMap = new Map();
        driver.details.drug_tests.forEach(test => {
          if (test._id) {
            existingDrugTestsMap.set(test._id.toString(), test);
          }
        });

        let fileIndex = 0;

        // Clear existing drug tests and rebuild from array
        driver.details.drug_tests = [];

        for (let i = 0; i < drugTestsArray.length; i++) {
          const dt = drugTestsArray[i];
          try {
            console.log(`💊 Processing drug test ${i + 1}/${drugTestsArray.length}:`, {
              id: dt.id,
              drugTestId: dt.drugTestId,
              date: dt.date,
              result: dt.result,
              labName: dt.labName,
              hasFile: dt.hasFile
            });

            const hasFile = dt.hasFile === true;
            let fileMetadata = {};

            // Check if this is an existing drug test
            // drugTestId can be MongoDB _id or id starting with "existing-"
            let existingDrugTestId = null;
            if (dt.drugTestId && dt.drugTestId.trim() !== '') {
              // If drugTestId is provided and not empty, extract the actual MongoDB ID
              existingDrugTestId = dt.drugTestId.toString().replace('existing-', '');
            } else if (dt.id && dt.id.toString().startsWith('existing-')) {
              // Extract MongoDB ID from id field
              existingDrugTestId = dt.id.toString().replace('existing-', '');
            }

            // Find existing drug test from the map we created before clearing
            let existingDrugTest = null;
            if (existingDrugTestId && mongoose.Types.ObjectId.isValid(existingDrugTestId)) {
              existingDrugTest = existingDrugTestsMap.get(existingDrugTestId);
            }

            // Create or update drug test data
            // Always use the values from the request, don't fall back to existing values
            const drugTestData = {
              _id: existingDrugTest ? existingDrugTest._id : new mongoose.Types.ObjectId(), // Preserve existing _id or generate new one
              date: dt.date ? new Date(dt.date) : new Date(),
              result: dt.result || '',
              labName: dt.labName || ''
            };

            // If existing and has fileUrl/fileName, preserve them unless new file is uploaded
            if (existingDrugTest && existingDrugTest.fileUrl && !hasFile) {
              // Preserve existing file info
              drugTestData.fileUrl = existingDrugTest.fileUrl;
              drugTestData.fileName = existingDrugTest.fileName || null;
              drugTestData.fileSize = existingDrugTest.fileSize || null;
              drugTestData.mimeType = existingDrugTest.mimeType || null;
            }

            // Add new file if uploaded
            if (hasFile && fileIndex < drugTestFiles.length) {
              const dtFile = drugTestFiles[fileIndex];
              if (dtFile) {
                const fileUrl = dtFile.location ||
                  (dtFile.path ? `${req.protocol}://${req.get("host")}/${dtFile.path.replace(/\\/g, '/')}` : null);
                fileMetadata = {
                  fileUrl: fileUrl,
                  fileName: dtFile.originalname,
                  fileSize: dtFile.size,
                  mimeType: dtFile.mimetype
                };
                Object.assign(drugTestData, fileMetadata);
                fileIndex++;
                console.log(`📎 ${existingDrugTest ? 'Updating' : 'Creating'} drug test with file: ${dtFile.originalname}`);
              }
            }

            console.log(`💊 ${existingDrugTest ? 'Updating' : 'Creating'} drug test:`, {
              _id: drugTestData._id.toString(),
              date: drugTestData.date,
              result: drugTestData.result,
              labName: drugTestData.labName,
              hasFile: !!drugTestData.fileUrl,
              fileName: drugTestData.fileName
            });

            driver.details.drug_tests.push(drugTestData);
          } catch (dtError) {
            console.error('Error processing drug test:', dtError);
          }
        }

        // Mark the entire details object as modified to ensure MongoDB saves the changes
        driver.markModified('details');
        driver.markModified('details.drug_tests');

        // Save the driver
        await driver.save();
        console.log(`✅ ${drugTestsArray.length} drug tests processed and saved for driver ${driver._id}`);

        // Reload driver to verify what was actually saved to database
        const savedDriverForVerification = await User.findById(driver._id).select('details.drug_tests').lean();
        if (savedDriverForVerification?.details?.drug_tests) {
          console.log(`💊 Verified saved drug tests in updateDriver (${savedDriverForVerification.details.drug_tests.length} tests):`, JSON.stringify(savedDriverForVerification.details.drug_tests, null, 2));
        } else {
          console.log(`⚠️ WARNING: No drug tests found in database after save!`);
        }
      }
    } catch (relatedError) {
      console.error('Error handling related records:', relatedError);
      // Don't fail driver update if related records fail
    }

    const driverId = driver._id;

    // Fetch all related data (same as getDriverById and createDriver) - use different variable names to avoid conflict
    let responseDocuments = [];
    let responseCertifications = [];
    let responseViolations = [];
    let responseTickets = [];
    let responseDeductions = [];
    let responseAdditions = [];
    let responseDrugTests = [];
    let responseProfileImageUrl = null;

    try {
      // Fetch documents
      const { EmployeeDocument } = await import("../models/driver/employeeDocumentModel.js");
      const employeeDocuments = await EmployeeDocument.find({ employee: driverId })
        .select('_id documentType documentNumber issueDate expiryDate description status fileUrl fileName fileSize mimeType ignoreExpiration uploadedBy verifiedBy createdAt updatedAt')
        .lean();

      if (employeeDocuments.length > 0) {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        responseDocuments = await Promise.all(employeeDocuments.map(async (doc) => {
          const docObj = { ...doc };
          if (docObj.fileUrl && (docObj.fileUrl.includes('s3.amazonaws.com') || docObj.fileUrl.includes('.s3.'))) {
            try {
              const cleanUrl = docObj.fileUrl.split('?')[0].split('#')[0];
              const urlObj = new URL(cleanUrl);
              let bucketName = process.env.AWS_S3_BUCKET_NAME;
              let key = decodeURIComponent(urlObj.pathname.substring(1));

              if (urlObj.hostname.includes('.s3.')) {
                bucketName = urlObj.hostname.split('.s3.')[0];
                key = decodeURIComponent(urlObj.pathname.substring(1));
              } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                bucketName = pathParts[0];
                key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
              }

              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const getContentType = (mimeType, fileUrl) => {
                if (mimeType) return mimeType;
                const ext = fileUrl.split('.').pop()?.toLowerCase();
                const mimeMap = { 'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
                return mimeMap[ext] || 'application/octet-stream';
              };

              const contentType = getContentType(docObj.mimeType, docObj.fileUrl);
              const command = new GetObjectCommand({ Bucket: bucketName, Key: key, ResponseContentType: contentType });
              const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
              docObj.fileUrl = signedUrl;
            } catch (error) {
              console.error('Error generating signed URL for document:', error);
            }
          }
          return docObj;
        }));
      }

      // Fetch certifications
      const { TrainingCertificate } = await import("../models/driver/trainingCertificateModel.js");
      const trainingCertificates = await TrainingCertificate.find({ driverId: driverId })
        .select('_id certificateName certificateType issuedDate expiryDate description notes status fileUrl fileName fileSize mimeType ignoreExpiration uploadedBy createdAt updatedAt')
        .lean();

      if (trainingCertificates.length > 0) {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        responseCertifications = await Promise.all(trainingCertificates.map(async (cert) => {
          const certObj = {
            ...cert,
            // Map fields for frontend compatibility
            subCategory: cert.certificateType || cert.description || '',
            result: cert.notes || cert.result || '',
            title: cert.certificateName || cert.title || ''
          };
          if (certObj.fileUrl && (certObj.fileUrl.includes('s3.amazonaws.com') || certObj.fileUrl.includes('.s3.'))) {
            try {
              const cleanUrl = certObj.fileUrl.split('?')[0].split('#')[0];
              const urlObj = new URL(cleanUrl);
              let bucketName = process.env.AWS_S3_BUCKET_NAME;
              let key = decodeURIComponent(urlObj.pathname.substring(1));

              if (urlObj.hostname.includes('.s3.')) {
                bucketName = urlObj.hostname.split('.s3.')[0];
                key = decodeURIComponent(urlObj.pathname.substring(1));
              } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                bucketName = pathParts[0];
                key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
              }

              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const getContentType = (mimeType, fileUrl) => {
                if (mimeType) return mimeType;
                const ext = fileUrl.split('.').pop()?.toLowerCase();
                const mimeMap = { 'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
                return mimeMap[ext] || 'application/octet-stream';
              };

              const contentType = getContentType(certObj.mimeType, certObj.fileUrl);
              const command = new GetObjectCommand({ Bucket: bucketName, Key: key, ResponseContentType: contentType });
              const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
              certObj.fileUrl = signedUrl;
            } catch (error) {
              console.error('Error generating signed URL for certificate:', error);
            }
          }
          return certObj;
        }));
      }

      // Fetch violations
      const { DriverViolation } = await import("../models/driverViolationModel.js");
      const driverViolations = await DriverViolation.find({ driver: driverId })
        .select('_id date dateOfIncident violationType title description reportedBy severity actionTaken status ticketInfo currency amount fileUrl fileName fileSize mimeType uploadedBy createdAt updatedAt')
        .lean();

      if (driverViolations.length > 0) {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        responseViolations = await Promise.all(driverViolations.map(async (vio) => {
          const vioObj = { ...vio };
          console.log(`📋 Processing violation ${vioObj._id} for response:`, {
            hasFileUrl: !!vioObj.fileUrl,
            fileUrl: vioObj.fileUrl,
            fileName: vioObj.fileName
          });

          if (vioObj.fileUrl && (vioObj.fileUrl.includes('s3.amazonaws.com') || vioObj.fileUrl.includes('.s3.'))) {
            try {
              const cleanUrl = vioObj.fileUrl.split('?')[0].split('#')[0];
              const urlObj = new URL(cleanUrl);
              let bucketName = process.env.AWS_S3_BUCKET_NAME;
              let key = decodeURIComponent(urlObj.pathname.substring(1));

              if (urlObj.hostname.includes('.s3.')) {
                bucketName = urlObj.hostname.split('.s3.')[0];
                key = decodeURIComponent(urlObj.pathname.substring(1));
              } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                bucketName = pathParts[0];
                key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
              }

              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const getContentType = (mimeType, fileUrl) => {
                if (mimeType) return mimeType;
                const ext = fileUrl.split('.').pop()?.toLowerCase();
                const mimeMap = { 'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
                return mimeMap[ext] || 'application/octet-stream';
              };

              const contentType = getContentType(vioObj.mimeType, vioObj.fileUrl);
              const command = new GetObjectCommand({ Bucket: bucketName, Key: key, ResponseContentType: contentType });
              const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
              vioObj.fileUrl = signedUrl;
            } catch (error) {
              console.error('Error generating signed URL for violation:', error);
            }
          }
          return vioObj;
        }));
      }

      // Fetch tickets

      // Fetch deductions
      const { DeductionAddition } = await import("../models/hr/settlementModel.js");
      responseDeductions = await DeductionAddition.find({ assignedTo: driverId, type: 'Deduction' })
        .select('_id name type recurrence amount currency startDate endDate description isActive company createdBy createdAt updatedAt')
        .lean();

      // Fetch additions
      responseAdditions = await DeductionAddition.find({ assignedTo: driverId, type: 'Addition' })
        .select('_id name type recurrence amount currency startDate endDate description isActive company createdBy createdAt updatedAt')
        .lean();

      // Fetch drug tests from driver.details.drug_tests
      const updatedDriverForDrugTests = await User.findById(driverId).select('details.drug_tests').lean();
      if (updatedDriverForDrugTests?.details?.drug_tests && Array.isArray(updatedDriverForDrugTests.details.drug_tests) && updatedDriverForDrugTests.details.drug_tests.length > 0) {
        console.log(`🧪 Raw drug tests from DB (${updatedDriverForDrugTests.details.drug_tests.length} tests):`, JSON.stringify(updatedDriverForDrugTests.details.drug_tests, null, 2));
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        responseDrugTests = await Promise.all(updatedDriverForDrugTests.details.drug_tests.map(async (dt, index) => {
          // Handle both old format (uploadDriverDrugTest) and new format (createDriver/updateDriver)
          // Old format: test_date, expiry_date, consent_form_url, result_document_url, uploadedAt
          // New format: date, result, labName, fileUrl, fileName, fileSize, mimeType

          const isOldFormat = dt.test_date !== undefined || (dt.uploadedAt !== undefined && dt.date === undefined);

          let dtObj;
          if (isOldFormat) {
            // Old format - map to new format
            // Use uploadedAt as fallback date if test_date doesn't exist
            let dateValue = '';
            if (dt.test_date) {
              dateValue = dt.test_date instanceof Date ? dt.test_date.toISOString().split('T')[0] : (typeof dt.test_date === 'string' ? dt.test_date.split('T')[0] : dt.test_date);
            } else if (dt.uploadedAt) {
              // Use uploadedAt as fallback for date
              dateValue = dt.uploadedAt instanceof Date ? dt.uploadedAt.toISOString().split('T')[0] : (typeof dt.uploadedAt === 'string' ? dt.uploadedAt.split('T')[0] : dt.uploadedAt);
            }

            dtObj = {
              _id: dt._id ? dt._id.toString() : `drug-test-${index}`,
              date: dateValue,
              result: dt.result || '',
              labName: dt.labName || '',
              fileUrl: dt.result_document_url || dt.consent_form_url || dt.fileUrl || null,
              fileName: dt.fileName || null,
              fileSize: dt.fileSize || null,
              mimeType: dt.mimeType || null
            };
          } else {
            // New format
            dtObj = {
              _id: dt._id ? dt._id.toString() : `drug-test-${index}`,
              date: dt.date ? (dt.date instanceof Date ? dt.date.toISOString().split('T')[0] : (typeof dt.date === 'string' ? dt.date.split('T')[0] : dt.date)) : '',
              result: dt.result || '',
              labName: dt.labName || '',
              fileUrl: dt.fileUrl || null,
              fileName: dt.fileName || null,
              fileSize: dt.fileSize || null,
              mimeType: dt.mimeType || null
            };
          }

          console.log(`🧪 Processed drug test ${index} in updateDriver:`, JSON.stringify(dtObj, null, 2));

          if (dtObj.fileUrl && (dtObj.fileUrl.includes('s3.amazonaws.com') || dtObj.fileUrl.includes('.s3.'))) {
            try {
              const cleanUrl = dtObj.fileUrl.split('?')[0].split('#')[0];
              const urlObj = new URL(cleanUrl);
              let bucketName = process.env.AWS_S3_BUCKET_NAME;
              let key = decodeURIComponent(urlObj.pathname.substring(1));

              if (urlObj.hostname.includes('.s3.')) {
                bucketName = urlObj.hostname.split('.s3.')[0];
                key = decodeURIComponent(urlObj.pathname.substring(1));
              } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                bucketName = pathParts[0];
                key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
              }

              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const getContentType = (mimeType, fileUrl) => {
                if (mimeType) return mimeType;
                const ext = fileUrl.split('.').pop()?.toLowerCase();
                const mimeMap = { 'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
                return mimeMap[ext] || 'application/octet-stream';
              };

              const contentType = getContentType(dtObj.mimeType, dtObj.fileUrl);
              const command = new GetObjectCommand({ Bucket: bucketName, Key: key, ResponseContentType: contentType });
              const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
              dtObj.fileUrl = signedUrl;
            } catch (error) {
              console.error('Error generating signed URL for drug test:', error);
            }
          }
          return dtObj;
        }));
      }

    } catch (fetchError) {
      console.error('Error fetching related data:', fetchError);
      // Continue with response even if fetching related data fails
    }

    // Reload driver from database to get the latest data (including newly uploaded profile image)
    const updatedDriver = await User.findById(driverId).lean();
    console.log('📸 Updated Driver Profile Image URL:', updatedDriver?.profileImageUrl);

    // Handle profile image signed URL generation for S3 URLs
    if (updatedDriver?.profileImageUrl && (updatedDriver.profileImageUrl.includes('s3.amazonaws.com') || updatedDriver.profileImageUrl.includes('.s3.'))) {
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { getS3ClientForBucket } = await import("../config/awsConfig.js");
        const cleanUrl = updatedDriver.profileImageUrl.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let key = decodeURIComponent(urlObj.pathname.substring(1));

        if (urlObj.hostname.includes('.s3.')) {
          bucketName = urlObj.hostname.split('.s3.')[0];
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          bucketName = pathParts[0];
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }

        if (key.includes('?')) key = key.split('?')[0];
        if (key.includes('&')) key = key.split('&')[0];

        // Get S3 client with correct region for this bucket
        const s3Client = await getS3ClientForBucket(bucketName, updatedDriver.profileImageUrl);

        const command = new GetObjectCommand({ Bucket: bucketName, Key: key, ResponseContentType: 'image/jpeg' });
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        responseProfileImageUrl = signedUrl;
        console.log('✅ Generated signed URL for profile image');
      } catch (error) {
        console.error('Error generating signed URL for profile image:', error);
        // Fall back to original URL if signing fails
        responseProfileImageUrl = updatedDriver.profileImageUrl;
      }
    } else if (updatedDriver?.profileImageUrl) {
      responseProfileImageUrl = updatedDriver.profileImageUrl;
    }

    // Format response to match getDriverById format
    const transformedDriver = {
      ...updatedDriver,
      profileImageUrl: responseProfileImageUrl || updatedDriver.profileImageUrl || null,
      mobile: updatedDriver.details?.cell1 || '',
      gender: updatedDriver.details?.gender || '',
      citizenship: updatedDriver.details?.citizenship || '',
      address: updatedDriver.location?.address || '',
      unit: updatedDriver.location?.unit || '',
      city: updatedDriver.city || updatedDriver.location?.city || '',
      state: updatedDriver.state || updatedDriver.location?.state || '',
      postalCode: updatedDriver.postalCode || updatedDriver.location?.postalCode || updatedDriver.details?.postalCode || '',
      sinNo: updatedDriver.details?.sinNo || '',
      licenceNumber: updatedDriver.details?.licenceNumber || updatedDriver.details?.driversLicence || '',
      licenceExpiry: updatedDriver.details?.licenceExpiry ? (updatedDriver.details.licenceExpiry instanceof Date ? updatedDriver.details.licenceExpiry.toISOString() : updatedDriver.details.licenceExpiry) : '',
      licenceState: updatedDriver.details?.licenceState || '',
      passport: updatedDriver.details?.passport || updatedDriver.details?.passportNumber || '',
      passportCountry: updatedDriver.details?.passportCountry || '',
      passportExpiry: updatedDriver.details?.passportExpiry ? (updatedDriver.details.passportExpiry instanceof Date ? updatedDriver.details.passportExpiry.toISOString() : updatedDriver.details.passportExpiry) : '',
      wsib: updatedDriver.details?.wsib === true ? 'Yes' : (updatedDriver.details?.wsib === false ? 'No' : ''),
      wsibAccountNo: updatedDriver.details?.wsibAccountNo || '',
      fastCard: updatedDriver.details?.fastCardNo || '',
      fastCardExpiry: updatedDriver.details?.fastCardExpiry ? (updatedDriver.details.fastCardExpiry instanceof Date ? updatedDriver.details.fastCardExpiry.toISOString() : updatedDriver.details.fastCardExpiry) : '',
      fastCardValid: updatedDriver.details?.fastCardValid || false,
      medicalTracking: updatedDriver.details?.medicalRequired === true ? 'Yes' : (updatedDriver.details?.medicalRequired === false ? 'No' : ''),
      csa: updatedDriver.details?.csa === true ? 'Yes' : (updatedDriver.details?.csa === false ? 'No' : ''),
      employmentDetails: updatedDriver.details?.remark || '',
      notes: updatedDriver.details?.notes || '',
      company: updatedDriver.company || '',
      canadianWorkerStatus: updatedDriver.details?.canadianWorkerStatus || '',
      permanentResidenceExpiry: updatedDriver.details?.permanentResidenceExpiry ? (updatedDriver.details.permanentResidenceExpiry instanceof Date ? updatedDriver.details.permanentResidenceExpiry.toISOString() : updatedDriver.details.permanentResidenceExpiry) : '',
      workPermitExpiry: updatedDriver.details?.workPermitExpiry ? (updatedDriver.details.workPermitExpiry instanceof Date ? updatedDriver.details.workPermitExpiry.toISOString() : updatedDriver.details.workPermitExpiry) : '',
      workPermitDocumentUrl: updatedDriver.details?.workPermitDocumentUrl || null,
      prCardDocumentUrl: updatedDriver.details?.prCardDocumentUrl || null,
      fleet: updatedDriver.details?.fleet || '',
      salaryPerMile: updatedDriver.details?.salaryPerMile || '',
      salaryPerMileSnow: updatedDriver.details?.salaryPerMileSnow || '',
      salaryPerMileHighTemp: updatedDriver.details?.salaryPerMileHighTemp || '',
      highTempThreshold: updatedDriver.details?.highTempThreshold || '',
      hireDate: updatedDriver.details?.hireDate ? (updatedDriver.details.hireDate instanceof Date ? updatedDriver.details.hireDate.toISOString() : updatedDriver.details.hireDate) : (updatedDriver.joinDate ? (updatedDriver.joinDate instanceof Date ? updatedDriver.joinDate.toISOString() : updatedDriver.joinDate) : null),
      termDate: updatedDriver.details?.termDate ? (updatedDriver.details.termDate instanceof Date ? updatedDriver.details.termDate.toISOString() : updatedDriver.details.termDate) : null,
      vacationPay: updatedDriver.details?.vacationPay || '',
      incorporation: updatedDriver.details?.incorporation || '',
      gstNo: updatedDriver.details?.gstNo || '',
      companyFlag: updatedDriver.details?.companyFlag || false,
      paymentMethod: updatedDriver.details?.paymentMethod || '',
      cppQppExempt: updatedDriver.details?.cppQppExempt || false,
      fedTaxExempt: updatedDriver.details?.fedTaxExempt || false,
      provTaxExempt: updatedDriver.details?.provTaxExempt || false,
      customHst: updatedDriver.details?.customHst || '',
      driverName: updatedDriver.details?.driverName || '',
      paymentAddress: updatedDriver.details?.paymentAddress || '',
      paymentSearchAddress: updatedDriver.details?.paymentSearchAddress || '',
      paymentCity: updatedDriver.details?.paymentCity || '',
      paymentPostalCode: updatedDriver.details?.paymentPostalCode || '',
      paymentCountry: updatedDriver.details?.paymentCountry || '',
      paymentStateProvince: updatedDriver.details?.paymentStateProvince || '',
      driverTypeSolo: updatedDriver.details?.driverTypeSolo !== undefined ? updatedDriver.details.driverTypeSolo : true, // true = SOLO, false = TEAM
      cross_border_eligible: updatedDriver.details?.cross_border_eligible !== undefined ? updatedDriver.details.cross_border_eligible : false,
      // Payment rate fields (ALONE, EMPTY, TEAM, etc.)
      alone: updatedDriver.details?.mileRate || 0, // ALONE* = mileRate
      team: updatedDriver.details?.mileRateTeam || 0, // TEAM = mileRateTeam
      empty: updatedDriver.details?.emptyMileRate || 0, // EMPTY = emptyMileRate
      emptyTeam: updatedDriver.details?.emptyMileRateTeam || 0, // EMPTY-TEAM* = emptyMileRateTeam
      hourlyRate: updatedDriver.details?.hourlyRate || 0,
      weightRate: updatedDriver.details?.weightRate || 0,
      percentageRate: updatedDriver.details?.percentageRate || 0,
      bonusDrop: updatedDriver.details?.bonusDrop || 0, // BONUS/DROP
      bonusPick: updatedDriver.details?.bonusPick || 0, // BONUS/PICK
      bonusLayover: updatedDriver.details?.bonusLayover || 0,
      perTripAmount: updatedDriver.details?.perTripAmount || 0,
      dailyRate: updatedDriver.details?.dailyRate || 0
    };

    const responseData = {
      ...transformedDriver,
      documents: responseDocuments,
      certifications: responseCertifications,
      violations: responseViolations,
      tickets: [], // Tickets removed - use compliance tickets section instead
      deductions: responseDeductions,
      additions: responseAdditions,
      drugTests: responseDrugTests || []
    };

    console.log('✅ Driver updated successfully:', {
      driverId: responseData._id,
      name: responseData.name,
      email: responseData.email,
      documentsCount: responseDocuments.length,
      certificationsCount: responseCertifications.length,
      violationsCount: responseViolations.length,
      ticketsCount: responseTickets.length,
      deductionsCount: responseDeductions.length,
      additionsCount: responseAdditions.length
    });
    console.log('📤 UPDATE DRIVER - Response being sent:', {
      unit: responseData.unit,
      postalCode: responseData.postalCode,
      address: responseData.address,
      city: responseData.city,
      state: responseData.state
    });

    res.json({ success: true, message: "Driver profile with documents", data: responseData });
  } catch (error) {
    console.error('Error updating driver:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Update driver status (Active/Inactive)
export const updateDriverStatus = async (req, res) => {
  try {
    const { status } = req.body; // expected: "active" or "inactive"

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status. Use 'active' or 'inactive'." });
    }

    const driver = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

    res.json({ success: true, message: `Driver status updated to ${status}`, driver });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get all drivers
export const getAllDrivers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      assignment = 'all'
    } = req.query;

    const { getUserCompanyId } = await import("../utils/companyFilter.js");
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Strict validation: For non-superadmin, companyId MUST be valid
    const hasValidCompany = companyId !== null &&
      companyId !== undefined &&
      companyId !== '' &&
      String(companyId).trim() !== '' &&
      String(companyId) !== 'null' &&
      String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ getAllDrivers: Admin has no company - returning empty data');
      return res.json({
        success: true,
        count: 0,
        assignedDrivers: 0,
        unassignedDrivers: 0,
        data: []
      });
    }

    const companyFilter = hasValidCompany ? { company: companyId } : null;
    const baseFilter = await getCombinedFilter(
      req.user,
      companyFilter
    );

    /* ---------------- ACTIVE ORDERS (SOURCE OF TRUTH) ---------------- */

    // CRITICAL: For non-superadmin, orderFilter MUST include company
    let orderFilter = {
      status: { $nin: ['COMPLETED', 'completed'] }
    };

    if (isSuperadmin) {
      // Superadmin can see all orders
    } else {
      // Non-superadmin MUST have company filter
      if (!hasValidCompany || !companyId) {
        console.error('❌ getAllDrivers: No valid company for orders - returning empty data');
        return res.json({
          success: true,
          count: 0,
          assignedDrivers: 0,
          unassignedDrivers: 0,
          data: []
        });
      }
      orderFilter.company = companyId;
    }

    // Fetch active orders to determine driver assignments
    const activeOrders = await Order.find(orderFilter)
      .select('driver coDriver orderNumber customerOrderNo tripNo status pickupDate deliveryDate pickupLocation deliveryLocation truck trailer')
      .populate('pickupLocation.placeId', 'name currentLocation.address')
      .populate('deliveryLocation.placeId', 'name currentLocation.address')
      .populate('truck', 'internalId plateNumber licensePlate unitNo')
      .populate('trailer', 'internalId plateNumber licensePlate unitNo trailerNumber')
      .lean();

    /* Map driverId -> orders (including co-drivers) */
    const driverOrdersMap = {};
    const assignedDriverIdsSet = new Set();

    activeOrders.forEach(order => {
      // Add primary driver
      if (order.driver) {
        const driverId = order.driver._id ? order.driver._id.toString() : order.driver.toString();
        if (!driverOrdersMap[driverId]) driverOrdersMap[driverId] = [];
        driverOrdersMap[driverId].push(order);
        assignedDriverIdsSet.add(driverId);
      }

      // Add co-driver
      if (order.coDriver) {
        const coDriverId = order.coDriver._id ? order.coDriver._id.toString() : order.coDriver.toString();
        if (!driverOrdersMap[coDriverId]) driverOrdersMap[coDriverId] = [];
        driverOrdersMap[coDriverId].push(order);
        assignedDriverIdsSet.add(coDriverId);
      }
    });

    const assignedDriverIds = Array.from(assignedDriverIdsSet);

    /* ---------------- DRIVER QUERY ---------------- */

    // CRITICAL: For non-superadmin, driverQuery MUST include company filter
    let driverQuery = { role: 'driver' };

    if (isSuperadmin) {
      // Superadmin can see all drivers
      if (baseFilter) {
        driverQuery = { role: 'driver', ...baseFilter };
      }
    } else {
      // Non-superadmin MUST have company filter
      if (!hasValidCompany || !companyId) {
        console.error('❌ getAllDrivers: No valid company for drivers - returning empty data');
        return res.json({
          success: true,
          count: 0,
          assignedDrivers: 0,
          unassignedDrivers: 0,
          data: []
        });
      }

      // Ensure company filter is in driverQuery
      if (baseFilter) {
        if (baseFilter.$and && Array.isArray(baseFilter.$and)) {
          const hasCompany = baseFilter.$and.some(cond => cond && cond.company);
          if (!hasCompany) {
            driverQuery = {
              role: 'driver',
              ...baseFilter,
              $and: [...baseFilter.$and, { company: companyId }]
            };
          } else {
            driverQuery = { role: 'driver', ...baseFilter };
          }
        } else if (baseFilter.company) {
          driverQuery = { role: 'driver', ...baseFilter };
        } else {
          driverQuery = { role: 'driver', ...baseFilter, company: companyId };
        }
      } else {
        driverQuery = { role: 'driver', company: companyId };
      }
    }

    if (assignment === 'assigned') {
      driverQuery._id = { $in: assignedDriverIds };
    }

    if (assignment === 'unassigned') {
      driverQuery._id = { $nin: assignedDriverIds };
    }

    const skip = (page - 1) * limit;

    const drivers = await User.find(driverQuery)
      .populate('company', 'companyName companyCode')
      .populate('details.vehicle', 'unitNumber internalId plateNumber licensePlate make model year status operationStatus currentLocation speed fuelLevel odometer engineOn trackingKey type ownership')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    /* ---------------- RESPONSE TRANSFORM ---------------- */

    // Helper function to build route string from order
    const buildRouteFromOrder = (order) => {
      const locations = [];

      // Get pickup location
      let pickup = order.pickupLocation?.place || 'Unknown';
      if (pickup === 'Unknown' && order.pickupLocation?.placeId) {
        if (typeof order.pickupLocation.placeId === 'object' && order.pickupLocation.placeId.currentLocation) {
          pickup = order.pickupLocation.placeId.currentLocation.address || order.pickupLocation.placeId.name || 'Unknown';
        } else if (typeof order.pickupLocation.placeId === 'object' && order.pickupLocation.placeId.name) {
          pickup = order.pickupLocation.placeId.name;
        }
      }

      // Get delivery location
      let delivery = order.deliveryLocation?.place || 'Unknown';
      if (delivery === 'Unknown' && order.deliveryLocation?.placeId) {
        if (typeof order.deliveryLocation.placeId === 'object' && order.deliveryLocation.placeId.currentLocation) {
          delivery = order.deliveryLocation.placeId.currentLocation.address || order.deliveryLocation.placeId.name || 'Unknown';
        } else if (typeof order.deliveryLocation.placeId === 'object' && order.deliveryLocation.placeId.name) {
          delivery = order.deliveryLocation.placeId.name;
        }
      }

      // Add pickup if not Unknown
      if (pickup !== 'Unknown') {
        locations.push(pickup);
      }
      // Add delivery if not Unknown
      if (delivery !== 'Unknown') {
        locations.push(delivery);
      }

      if (locations.length > 0) {
        return locations.join(' → ');
      }

      // Final fallback
      return 'Unknown → Unknown';
    };

    // Helper function to generate signed URL for S3 images
    const generateSignedUrl = async (url) => {
      if (!url || (!url.includes('s3.amazonaws.com') && !url.includes('.s3.'))) {
        return url; // Return as-is if not an S3 URL
      }

      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { getS3ClientForBucket } = await import("../config/awsConfig.js");

        const cleanUrl = url.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let key = decodeURIComponent(urlObj.pathname.substring(1));

        if (urlObj.hostname.includes('.s3.')) {
          bucketName = urlObj.hostname.split('.s3.')[0];
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          bucketName = pathParts[0];
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }

        // Clean key from query parameters
        if (key.includes('?')) key = key.split('?')[0];
        if (key.includes('&')) key = key.split('&')[0];

        // Get S3 client with correct region for this bucket
        const s3Client = await getS3ClientForBucket(bucketName, url);

        const getContentType = (url) => {
          const urlMatch = url.match(/\.([^.?#]+)(\?|#|$)/);
          if (!urlMatch) return 'image/jpeg';

          const ext = urlMatch[1].toLowerCase();
          const typeMap = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
          };

          return typeMap[ext] || 'image/jpeg';
        };

        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentType: getContentType(url),
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        return signedUrl;
      } catch (error) {
        console.error('Error generating signed URL for driver image:', error);
        return url; // Return original URL if signing fails
      }
    };

    // Import EmployeeDocument and compliance calculator for compliance calculation
    const { EmployeeDocument } = await import("../models/driver/employeeDocumentModel.js");
    const { calculateDriverCompliance } = await import("../utils/driverCompliance.js");

    // Fetch documents for all drivers in batch for compliance calculation
    const driverIds = drivers.map(d => d._id);
    const allDocuments = await EmployeeDocument.find({
      employee: { $in: driverIds },
      isInUse: { $ne: false } // Include documents that are in use (default true)
    }).lean();

    // Group documents by driver
    const documentsByDriver = {};
    allDocuments.forEach(doc => {
      const driverId = doc.employee.toString();
      if (!documentsByDriver[driverId]) {
        documentsByDriver[driverId] = [];
      }
      documentsByDriver[driverId].push(doc);
    });

    // Generate signed URLs for all driver images
    const data = await Promise.all(drivers.map(async (driver) => {
      const driverId = driver._id.toString();
      const driverOrders = driverOrdersMap[driverId] || [];

      // Get the first active order (most relevant)
      const activeOrder = driverOrders.length > 0 ? driverOrders[0] : null;

      // Build route string
      let routeString = 'No active load';
      if (activeOrder) {
        routeString = buildRouteFromOrder(activeOrder);
      }

      // Get truck and trailer info
      const truckInfo = activeOrder?.truck
        ? (activeOrder.truck.internalId || activeOrder.truck.unitNo || activeOrder.truck.licensePlate || activeOrder.truck.plateNumber || 'N/A')
        : null;
      const trailerInfo = activeOrder?.trailer
        ? (activeOrder.trailer.internalId || activeOrder.trailer.unitNo || activeOrder.trailer.licensePlate || activeOrder.trailer.plateNumber || activeOrder.trailer.trailerNumber || 'N/A')
        : null;

      // Extract vehicle details if populated
      const vehicleDetails = driver.details?.vehicle ? {
        _id: driver.details.vehicle._id?.toString() || '',
        internalId: driver.details.vehicle.internalId || driver.details.vehicle.unitNumber || '',
        plateNumber: driver.details.vehicle.plateNumber || driver.details.vehicle.licensePlate || '',
        make: driver.details.vehicle.make || '',
        model: driver.details.vehicle.model || '',
        year: driver.details.vehicle.year || '',
        status: driver.details.vehicle.status || driver.details.vehicle.operationStatus || '',
        currentLocation: driver.details.vehicle.currentLocation || {},
        speed: driver.details.vehicle.speed || 0,
        fuelLevel: driver.details.vehicle.fuelLevel || 0,
        odometer: driver.details.vehicle.odometer || 0,
        engineOn: driver.details.vehicle.engineOn || false,
        trackingKey: driver.details.vehicle.trackingKey || '',
        type: driver.details.vehicle.type || '',
        ownership: driver.details.vehicle.ownership || ''
      } : null;

      // Calculate compliance status
      const driverDocuments = documentsByDriver[driverId] || [];
      const compliance = await calculateDriverCompliance(driver, driverDocuments);

      // Create driver data object
      const driverData = {
        ...driver,
        // Basic details
        mobile: driver.details?.cell1 || '',
        gender: driver.details?.gender || '',
        citizenship: driver.details?.citizenship || '',
        wsib: driver.details?.wsib ? 'Yes' : 'No',
        wsibAccountNo: driver.details?.wsibAccountNo || '',
        fastCard: driver.details?.fastCardNo || '',
        fastCardExpiry: driver.details?.fastCardExpiry || null,
        medicalTracking: driver.details?.medicalRequired ? 'Yes' : 'No',
        csa: driver.details?.csa ? 'Yes' : 'No',
        employmentDetails: driver.details?.remark || '',
        notes: driver.details?.notes || '',
        driversLicence: driver.details?.licenceNumber || driver.details?.driversLicence || '',
        passport: driver.details?.passport || driver.details?.passportNumber || '',
        passportCountry: driver.details?.passportCountry || '',
        passportExpiry: driver.details?.passportExpiry || null,
        dateOfBirth: driver.details?.dateOfBirth || driver.dob || '',
        ticketYTD: driver.details?.ticketYTD || 0,
        // Compliance status
        compliance: compliance.status,
        complianceDetails: compliance,
        // Employee code and other fields
        employeeCode: driver.details?.employeeCode || '',
        incorporation: driver.details?.incorporation || '',
        postalCode: driver.details?.postalCode || '',
        fleet: driver.details?.fleet || '',
        cell2: driver.details?.cell2 || '',
        extension: driver.details?.extension || '',
        fax: driver.details?.fax || '',
        expiryDate: driver.details?.expiryDate || null,
        gstNo: driver.details?.gstNo || '',
        companyFlag: driver.details?.companyFlag || false,
        hireDate: driver.details?.hireDate || null,
        termDate: driver.details?.termDate || null,
        // Payment and rate fields
        defaultChargeName: driver.details?.defaultChargeName || '',
        defaultCurrency: driver.details?.defaultCurrency || '',
        chargesAppliedOn: driver.details?.chargesAppliedOn || '',
        defaultMode: driver.details?.defaultMode || '',
        defaultAmount: driver.details?.defaultAmount || 0,
        defaultRemarks: driver.details?.defaultRemarks || '',
        defaultPayrollType: driver.details?.defaultPayrollType || '',
        paymentCurrency: driver.details?.paymentCurrency || '',
        paymentMethod: driver.details?.paymentMethod || '',
        account: driver.details?.account || '',
        mileRate: driver.details?.mileRate || 0,
        mileRateTeam: driver.details?.mileRateTeam || 0,
        emptyMileRate: driver.details?.emptyMileRate || 0,
        emptyMileRateTeam: driver.details?.emptyMileRateTeam || 0,
        hourlyRate: driver.details?.hourlyRate || 0,
        weightRate: driver.details?.weightRate || 0,
        percentageRate: driver.details?.percentageRate || 0,
        salaryPerMile: driver.details?.salaryPerMile || 0,
        salaryPerMileSnow: driver.details?.salaryPerMileSnow || 0,
        salaryPerMileHighTemp: driver.details?.salaryPerMileHighTemp || 0,
        highTempThreshold: driver.details?.highTempThreshold || 35,
        // Tax information
        localTaxNo: driver.details?.localTaxNo || '',
        federalTaxNo: driver.details?.federalTaxNo || '',
        sinNo: driver.details?.sinNo || '',
        craAccountNo: driver.details?.craAccountNo || '',
        fedTaxExempt: driver.details?.fedTaxExempt || false,
        provTaxExempt: driver.details?.provTaxExempt || false,
        cppQppExempt: driver.details?.cppQppExempt || false,
        eiExempt: driver.details?.eiExempt || false,
        qpipExempt: driver.details?.qpipExempt || false,
        // Payroll settings
        payPeriod: driver.details?.payPeriod || '',
        vacationPay: driver.details?.vacationPay || '',
        ltl: driver.details?.ltl || false,
        onSettlements: driver.details?.onSettlements || false,
        settlementCurrencyByOrder: driver.details?.settlementCurrencyByOrder || false,
        isDefault: driver.details?.isDefault || false,
        // Vehicle information
        vehicle: vehicleDetails,
        // Orders
        orders: driverOrders,
        activeOrder: activeOrder ? {
          _id: activeOrder._id.toString(),
          orderNumber: activeOrder.orderNumber || '',
          customerOrderNo: activeOrder.customerOrderNo || '',
          tripNo: activeOrder.tripNo || '',
          status: activeOrder.status || '',
          route: routeString,
          pickupDate: activeOrder.pickupDate || null,
          deliveryDate: activeOrder.deliveryDate || null,
          truck: truckInfo,
          trailer: trailerInfo
        } : null
      };

      // Generate signed URLs for profile images
      if (driverData.profileImageUrl) {
        driverData.profileImageUrl = await generateSignedUrl(driverData.profileImageUrl);
      }
      if (driverData.avatar) {
        driverData.avatar = await generateSignedUrl(driverData.avatar);
      }
      if (driverData.details?.profileImage) {
        driverData.details.profileImage = await generateSignedUrl(driverData.details.profileImage);
      }

      return driverData;
    }));

    const totalDrivers = await User.countDocuments({
      role: 'driver',
      ...(baseFilter || {})
    });

    res.json({
      success: true,
      count: totalDrivers,
      assignedDrivers: assignedDriverIds.length,
      unassignedDrivers: Math.max(0, totalDrivers - assignedDriverIds.length),
      data,
      pagination: {
        current: Number(page),
        pages: Math.ceil(totalDrivers / limit),
        total: totalDrivers,
        limit: Number(limit)
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const totalDriversCount = async (req, res) => {
  try {
    // Get company filter
    const { getUserCompanyId } = await import("../utils/companyFilter.js");
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: {
          totalDrivers: 0,
          activeDrivers: 0
        }
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Build query with company and trial filters
    const query = { role: "driver", ...(baseFilter || {}) };
    const activeQuery = { role: "driver", status: "active", ...(baseFilter || {}) };

    // Count all drivers
    const totalDrivers = await User.countDocuments(query);

    // Count only active drivers
    const activeDrivers = await User.countDocuments(activeQuery);

    res.json({
      success: true,
      data: {
        totalDrivers: totalDrivers,
        activeDrivers: activeDrivers
      }

    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ✅ Get all users for drug test (only drivers with cross-border eligible = true)
export const getAllUsersForDrugTest = async (req, res) => {
  try {
    const { getUserCompanyId } = await import("../utils/companyFilter.js");
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        data: []
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Build query: Only drivers with cross-border eligible = true
    const userQuery = {
      role: 'driver', // Only drivers
      'details.cross_border_eligible': true, // Only cross-border eligible drivers
      ...(baseFilter || {})
    };

    const users = await User.find(userQuery)
      .select('_id name email phone role status details.cross_border_eligible')
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users for drug test:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch users"
    });
  }
};

// ✅ Upload Drug Test to Driver Profile
export const uploadDriverDrugTest = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { test_date, expiry_date } = req.body;

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: "Driver ID is required"
      });
    }

    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    // Check if driver is cross-border eligible
    if (!driver.details?.cross_border_eligible) {
      return res.status(400).json({
        success: false,
        message: "Driver is not cross-border eligible"
      });
    }

    // Handle file uploads
    let consentFormUrl = "";
    let resultDocumentUrl = "";

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

      // Handle resultDocument file
      const resultDocumentFile = Array.isArray(req.files.resultDocument)
        ? req.files.resultDocument[0]
        : req.files.resultDocument;

      if (resultDocumentFile) {
        if (process.env.NODE_ENV === "production") {
          resultDocumentUrl = resultDocumentFile.location;
        } else {
          resultDocumentUrl = `${req.protocol}://${req.get("host")}/${resultDocumentFile.path.replace(/\\/g, "/")}`;
        }
      }
    }

    // Initialize drug_tests array if it doesn't exist
    if (!driver.details.drug_tests) {
      driver.details.drug_tests = [];
    }

    // Create new drug test entry
    const newDrugTest = {
      test_date: test_date ? new Date(test_date) : new Date(),
      expiry_date: expiry_date ? new Date(expiry_date) : undefined,
      consent_form_url: consentFormUrl || undefined,
      result_document_url: resultDocumentUrl || undefined,
      uploadedAt: new Date()
    };

    driver.details.drug_tests.push(newDrugTest);
    driver.markModified('details.drug_tests');
    await driver.save();

    res.status(201).json({
      success: true,
      message: "Drug test uploaded successfully",
      data: {
        drug_tests: driver.details.drug_tests
      }
    });
  } catch (error) {
    console.error('Error uploading drug test:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload drug test"
    });
  }
};

// ✅ Delete Drug Test from Driver Profile
export const deleteDriverDrugTest = async (req, res) => {
  try {
    const { driverId, testIndex } = req.params;

    if (!driverId || testIndex === undefined) {
      return res.status(400).json({
        success: false,
        message: "Driver ID and test index are required"
      });
    }

    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    if (!driver.details?.drug_tests || !Array.isArray(driver.details.drug_tests)) {
      return res.status(404).json({
        success: false,
        message: "No drug tests found"
      });
    }

    const index = parseInt(testIndex, 10);
    if (index < 0 || index >= driver.details.drug_tests.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid test index"
      });
    }

    // Remove the drug test at the specified index
    driver.details.drug_tests.splice(index, 1);
    driver.markModified('details.drug_tests');
    await driver.save();

    res.json({
      success: true,
      message: "Drug test deleted successfully",
      data: {
        drug_tests: driver.details.drug_tests
      }
    });
  } catch (error) {
    console.error('Error deleting drug test:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete drug test"
    });
  }
};

// ✅ Get Drug Test Document Signed URL (for S3 files)
export const getDriverDrugTestSignedUrl = async (req, res) => {
  try {
    const { driverId, testIndex, documentType } = req.params; // documentType: 'consent' or 'result'
    const { disposition = 'inline' } = req.query;

    if (!driverId || testIndex === undefined || !documentType) {
      return res.status(400).json({
        success: false,
        message: "Driver ID, test index, and document type are required"
      });
    }

    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    if (!driver.details?.drug_tests || !Array.isArray(driver.details.drug_tests)) {
      return res.status(404).json({
        success: false,
        message: "No drug tests found"
      });
    }

    const index = parseInt(testIndex, 10);
    if (index < 0 || index >= driver.details.drug_tests.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid test index"
      });
    }

    const drugTest = driver.details.drug_tests[index];
    let fileUrl = null;

    if (documentType === 'consent') {
      fileUrl = drugTest.consent_form_url;
    } else if (documentType === 'result') {
      fileUrl = drugTest.result_document_url;
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid document type. Must be 'consent' or 'result'"
      });
    }

    if (!fileUrl) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    const isS3Url = fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.');

    if (isS3Url) {
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { S3Client } = await import("@aws-sdk/client-s3");

        const s3 = new S3Client({
          region: process.env.AWS_REGION || 'us-east-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          }
        });

        const cleanUrl = fileUrl.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let key = decodeURIComponent(urlObj.pathname.substring(1));

        if (urlObj.hostname.includes('.s3.')) {
          bucketName = urlObj.hostname.split('.s3.')[0];
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          bucketName = pathParts[0];
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }

        if (key.includes('?')) key = key.split('?')[0];
        if (key.includes('&')) key = key.split('&')[0];

        const getContentType = (url) => {
          const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
          const typeMap = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
          };
          return typeMap[ext] || 'application/octet-stream';
        };

        const contentType = getContentType(fileUrl);
        const contentDisposition = disposition === 'attachment'
          ? `attachment; filename="${encodeURIComponent(documentType === 'consent' ? 'consent-form' : 'result-document')}"`
          : 'inline';

        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentDisposition: contentDisposition,
          ResponseContentType: contentType,
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

        res.json({
          success: true,
          url: signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('Error generating signed URL for drug test document:', s3Error);
        res.json({
          success: true,
          url: fileUrl,
          expiresIn: 0
        });
      }
    } else {
      res.json({
        success: true,
        url: fileUrl,
        expiresIn: 0
      });
    }
  } catch (err) {
    console.error('Get drug test signed URL error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get drug test signed URL"
    });
  }
};

// ✅ Get Driver Ticket Signed URL (for S3 files)
export const getDriverTicketSignedUrl = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { disposition = 'inline' } = req.query;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: "Ticket ID is required"
      });
    }

    const { DriverTicket } = await import("../models/driverTicketModel.js");
    const { getUserCompanyId } = await import("../utils/companyFilter.js");

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: ticketId };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const ticket = await DriverTicket.findOne(query);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    if (!ticket.fileUrl) {
      return res.status(404).json({
        success: false,
        message: "No file attached to this ticket"
      });
    }

    const fileUrl = ticket.fileUrl;
    const isS3Url = fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.');

    if (isS3Url) {
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        const cleanUrl = fileUrl.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let key = decodeURIComponent(urlObj.pathname.substring(1));

        if (urlObj.hostname.includes('.s3.')) {
          bucketName = urlObj.hostname.split('.s3.')[0];
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          bucketName = pathParts[0];
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }

        if (key.includes('?')) key = key.split('?')[0];
        if (key.includes('&')) key = key.split('&')[0];

        const getContentType = (mimeType, fileUrl) => {
          if (mimeType) return mimeType;
          const ext = fileUrl.split('.').pop()?.toLowerCase();
          const mimeMap = {
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          };
          return mimeMap[ext] || 'application/octet-stream';
        };

        const contentType = getContentType(ticket.mimeType, ticket.fileUrl);
        const contentDisposition = disposition === 'attachment'
          ? `attachment; filename="${encodeURIComponent(ticket.fileName || 'ticket-document')}"`
          : 'inline';

        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentDisposition: contentDisposition,
          ResponseContentType: contentType,
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

        res.json({
          success: true,
          url: signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('Error generating signed URL for ticket document:', s3Error);
        res.json({
          success: true,
          url: fileUrl,
          expiresIn: 0,
          fallback: true
        });
      }
    } else {
      res.json({
        success: true,
        url: fileUrl,
        expiresIn: 0,
        direct: true
      });
    }
  } catch (err) {
    console.error('Get ticket signed URL error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get ticket signed URL"
    });
  }
};



// Get dispatchers from the same company as the authenticated driver
export const getCompanyDispatchers = async (req, res) => {
  try {
    const companyId = req.user?.company;
    console.log('📞 [getCompanyDispatchers] companyId:', companyId, 'user:', req.user?._id);
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'No company associated with this driver.' });
    }

    // Fetch all dispatchers in the company regardless of status
    const dispatchers = await User.find({
      company: companyId,
      role: 'dispatcher',
    })
      .select('name phone email status')
      .lean();

    console.log('📞 [getCompanyDispatchers] found:', dispatchers.length, 'dispatchers');
    res.json({ success: true, data: dispatchers });
  } catch (error) {
    console.error('Error fetching company dispatchers:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch dispatchers.' });
  }
};

// ─── Bulk Import Drivers from CSV / Excel ───────────────────────────────────
export const importDrivers = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const companyId = req.user?.company;
    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(400).json({ success: false, message: 'Company settings not found.' });
    }

    const { rows } = parseImportFile(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ success: false, message: 'File is empty or has no data rows.' });

    const { sendEmployeeInviteEmail } = await import('../services/emailService.js');
    const companyDoc = companyId ? await CompanySettings.findById(companyId).lean() : null;
    const companyName = companyDoc?.companyName || 'Logistiq';

    let imported = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed + header row

      const name = row.name || row.full_name || row.driver_name || '';
      const email = (row.email || row.email_address || '').toLowerCase();
      const phone = row.phone || row.phone_number || row.mobile || '';
      const country = row.country || 'Canada';

      if (!name) { errors.push({ row: rowNum, data: row, reason: 'Name is required' }); continue; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, data: row, reason: 'Valid email is required' }); continue;
      }

      // Skip duplicate (same email + company)
      const existing = await User.findOne({ email, company: companyId }).lean();
      if (existing) { skipped++; continue; }

      // Create with invite flow
      const inviteRawToken = crypto.randomBytes(32).toString('hex');
      const inviteHashedToken = crypto.createHash('sha256').update(inviteRawToken).digest('hex');
      const tempPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

      const timestamp = Date.now().toString().slice(-6);
      const internalId = `DRV-${timestamp}-${i}`;

      try {
        const driver = new User({
          name,
          email,
          phone,
          country,
          role: 'driver',
          status: 'active',
          company: companyId,
          internalId,
          password: tempPassword,
          passwordResetToken: inviteHashedToken,
          passwordResetExpires: Date.now() + 72 * 60 * 60 * 1000
        });
        await driver.save({ validateBeforeSave: false });

        const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invite/${inviteRawToken}`;
        sendEmployeeInviteEmail({ employeeEmail: email, employeeName: name, inviteUrl, companyName }).catch(() => {});

        imported++;
      } catch (saveErr) {
        errors.push({ row: rowNum, data: row, reason: saveErr.message || 'Failed to save' });
      }
    }

    res.json({ success: true, imported, skipped, errors, total: rows.length });
  } catch (error) {
    console.error('importDrivers error:', error);
    res.status(500).json({ success: false, message: error.message || 'Import failed' });
  }
};
