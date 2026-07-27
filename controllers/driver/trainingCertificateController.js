import mongoose from "mongoose";
import { TrainingCertificate } from "../../models/driver/trainingCertificateModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Create Training Certificate
export const createTrainingCertificate = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const {
      driverId,
      certificateName,
      certificateType,
      issuedDate,
      expiryDate,
      issuingAuthority,
      certificateNumber,
      notes
    } = req.body;

    if (!driverId || !certificateName || !certificateType || !issuedDate || !issuingAuthority) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: driverId, certificateName, certificateType, issuedDate, and issuingAuthority are required."
      });
    }

    // Validate driverId format
    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID format"
      });
    }

    // Handle file upload
    let fileUrl = '';
    let fileName = '';
    if (req.file) {
      fileUrl = req.file.location || req.file.path;
      fileName = req.file.originalname || '';
    }

    const payload = {
      driverId,
      certificateName: certificateName.trim(),
      certificateType: certificateType.trim(),
      issuedDate: new Date(issuedDate),
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      issuingAuthority: issuingAuthority.trim(),
      certificateNumber: certificateNumber ? certificateNumber.trim() : '',
      fileUrl,
      fileName,
      notes: notes || '',
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    };

    const certificate = new TrainingCertificate(payload);
    await certificate.save();
    
    await certificate.populate('driverId', 'name email');
    await certificate.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: "Training certificate created successfully",
      data: certificate
    });
  } catch (err) {
    console.error('Create training certificate error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create training certificate"
    });
  }
};

// ✅ Get All Training Certificates
export const getTrainingCertificates = async (req, res) => {
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
      console.log('❌ getTrainingCertificates: Admin has no company - returning empty data');
      return res.json({
        success: true,
        data: [],
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    const { search, driverId, certificateType, status } = req.query;
    const query = {};

    // CRITICAL: For non-superadmin, MUST include company filter
    if (isSuperadmin) {
      // Superadmin can see all certificates
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

    if (certificateType && certificateType !== 'all') {
      query.certificateType = { $regex: certificateType, $options: 'i' };
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { certificateName: { $regex: search, $options: 'i' } },
        { certificateNumber: { $regex: search, $options: 'i' } },
        { issuingAuthority: { $regex: search, $options: 'i' } }
      ];
    }

    const certificates = await TrainingCertificate.find(query)
      .populate('driverId', 'name email')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Transform data to match frontend expectations
    const transformedCertificates = certificates.map(cert => ({
      _id: cert._id,
      driverId: cert.driverId?._id || cert.driverId,
      driverName: cert.driverId?.name || 'Unknown Driver',
      certificateName: cert.certificateName,
      certificateType: cert.certificateType,
      issuedDate: cert.issuedDate ? new Date(cert.issuedDate).toISOString().split('T')[0] : '',
      expiryDate: cert.expiryDate ? new Date(cert.expiryDate).toISOString().split('T')[0] : '',
      issuingAuthority: cert.issuingAuthority,
      certificateNumber: cert.certificateNumber || '',
      fileUrl: cert.fileUrl || '',
      fileName: cert.fileName || '',
      status: cert.status || 'active',
      notes: cert.notes || '',
      createdAt: cert.createdAt,
      updatedAt: cert.updatedAt
    }));

    res.json({
      success: true,
      data: transformedCertificates
    });
  } catch (err) {
    console.log('Get training certificates error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch training certificates"
    });
  }
};

// ✅ Get Training Certificate By ID
export const getTrainingCertificateById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const certificate = await TrainingCertificate.findOne(query)
      .populate('driverId', 'name email')
      .populate('createdBy', 'name email')
      .lean();

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Training certificate not found"
      });
    }

    // Transform data
    const transformedCertificate = {
      _id: certificate._id,
      driverId: certificate.driverId?._id || certificate.driverId,
      driverName: certificate.driverId?.name || 'Unknown Driver',
      certificateName: certificate.certificateName,
      certificateType: certificate.certificateType,
      issuedDate: certificate.issuedDate ? new Date(certificate.issuedDate).toISOString().split('T')[0] : '',
      expiryDate: certificate.expiryDate ? new Date(certificate.expiryDate).toISOString().split('T')[0] : '',
      issuingAuthority: certificate.issuingAuthority,
      certificateNumber: certificate.certificateNumber || '',
      fileUrl: certificate.fileUrl || '',
      fileName: certificate.fileName || '',
      status: certificate.status || 'active',
      notes: certificate.notes || '',
      createdAt: certificate.createdAt,
      updatedAt: certificate.updatedAt,
      createdBy: certificate.createdBy
    };

    res.json({
      success: true,
      data: transformedCertificate
    });
  } catch (err) {
    console.error('Get training certificate by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch training certificate"
    });
  }
};

// ✅ Update Training Certificate
export const updateTrainingCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const certificate = await TrainingCertificate.findOne(query);
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Training certificate not found"
      });
    }

    const updateData = {};
    
    if (req.body.driverId) {
      // Validate driverId format
      if (!mongoose.Types.ObjectId.isValid(req.body.driverId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid driver ID format"
        });
      }
      updateData.driverId = new mongoose.Types.ObjectId(req.body.driverId);
    }
    if (req.body.certificateName) updateData.certificateName = req.body.certificateName.trim();
    if (req.body.certificateType) updateData.certificateType = req.body.certificateType.trim();
    if (req.body.issuedDate) updateData.issuedDate = new Date(req.body.issuedDate);
    if (req.body.expiryDate !== undefined) {
      updateData.expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
    }
    if (req.body.issuingAuthority) updateData.issuingAuthority = req.body.issuingAuthority.trim();
    if (req.body.certificateNumber !== undefined) updateData.certificateNumber = req.body.certificateNumber ? req.body.certificateNumber.trim() : '';
    if (req.body.notes !== undefined) updateData.notes = req.body.notes || '';

    // Handle file upload
    if (req.file) {
      updateData.fileUrl = req.file.location || req.file.path;
      updateData.fileName = req.file.originalname || '';
    }

    Object.assign(certificate, updateData);
    await certificate.save();

    await certificate.populate('driverId', 'name email');
    await certificate.populate('createdBy', 'name email');

    // Transform data
    const transformedCertificate = {
      _id: certificate._id,
      driverId: certificate.driverId?._id || certificate.driverId,
      driverName: certificate.driverId?.name || 'Unknown Driver',
      certificateName: certificate.certificateName,
      certificateType: certificate.certificateType,
      issuedDate: certificate.issuedDate ? new Date(certificate.issuedDate).toISOString().split('T')[0] : '',
      expiryDate: certificate.expiryDate ? new Date(certificate.expiryDate).toISOString().split('T')[0] : '',
      issuingAuthority: certificate.issuingAuthority,
      certificateNumber: certificate.certificateNumber || '',
      fileUrl: certificate.fileUrl || '',
      fileName: certificate.fileName || '',
      status: certificate.status || 'active',
      notes: certificate.notes || '',
      createdAt: certificate.createdAt,
      updatedAt: certificate.updatedAt
    };

    res.json({
      success: true,
      message: "Training certificate updated successfully",
      data: transformedCertificate
    });
  } catch (err) {
    console.error('Update training certificate error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update training certificate"
    });
  }
};

// ✅ Delete Training Certificate
export const deleteTrainingCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const certificate = await TrainingCertificate.findOneAndDelete(query);
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Training certificate not found"
      });
    }

    res.json({
      success: true,
      message: "Training certificate deleted successfully"
    });
  } catch (err) {
    console.error('Delete training certificate error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete training certificate"
    });
  }
};

// ✅ Get Training Certificate Signed URL (for S3 files)
export const getTrainingCertificateSignedUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { disposition = 'inline' } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const certificate = await TrainingCertificate.findOne(query);
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Training certificate not found"
      });
    }

    if (!certificate.fileUrl) {
      return res.status(404).json({
        success: false,
        message: "No file attached to this certificate"
      });
    }

    const fileUrl = certificate.fileUrl;
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
          ? `attachment; filename="${encodeURIComponent(certificate.fileName || 'certificate')}"` 
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
        console.error('Error generating signed URL for training certificate:', s3Error);
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
    console.error('Get training certificate signed URL error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get training certificate signed URL"
    });
  }
};

