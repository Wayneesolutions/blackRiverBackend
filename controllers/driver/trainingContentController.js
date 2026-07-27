import mongoose from "mongoose";
import { TrainingContent } from "../../models/driver/trainingContentModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Create Training Content
export const createTrainingContent = async (req, res) => {
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
      name,
      type,
      testType,
      description,
      assignedRoles
    } = req.body;

    if (!name || !type || !testType) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, type, and testType are required."
      });
    }

    // Handle file upload
    let fileUrl = '';
    let fileName = '';
    if (req.file) {
      fileUrl = req.file.location || req.file.path;
      fileName = req.file.originalname || '';
    } else {
      return res.status(400).json({
        success: false,
        message: "File is required for training content."
      });
    }

    // Parse assignedRoles if it's a JSON string
    let parsedRoles = [];
    if (assignedRoles) {
      try {
        if (typeof assignedRoles === 'string') {
          parsedRoles = JSON.parse(assignedRoles);
        } else if (Array.isArray(assignedRoles)) {
          parsedRoles = assignedRoles;
        } else {
          parsedRoles = [assignedRoles];
        }
      } catch (e) {
        // If parsing fails, treat as single role
        parsedRoles = [assignedRoles];
      }
    }

    const payload = {
      name: name.trim(),
      type: type.toUpperCase(),
      testType: testType.trim().toUpperCase(),
      fileUrl,
      fileName,
      description: description ? description.trim() : '',
      assignedRoles: parsedRoles,
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    };

    const trainingContent = new TrainingContent(payload);
    await trainingContent.save();

    await trainingContent.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: "Training content created successfully",
      data: trainingContent
    });
  } catch (err) {
    console.error('Create training content error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create training content"
    });
  }
};

// ✅ Get All Training Content
export const getTrainingContent = async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null &&
      companyId !== undefined &&
      companyId !== '' &&
      String(companyId).trim() !== '' &&
      String(companyId) !== 'null' &&
      String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      return res.json({
        success: true,
        data: [],
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    const { testType, type, role } = req.query;
    const query = {};

    if (isSuperadmin) {
      // Superadmin can see all
    } else if (hasValidCompany && companyId) {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        query.company = new mongoose.Types.ObjectId(companyId);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid company ID format"
        });
      }
    } else {
      return res.json({
        success: true,
        data: []
      });
    }

    if (testType && testType !== 'all') {
      query.testType = testType.toUpperCase();
    }

    if (type && type !== 'all') {
      query.type = type.toUpperCase();
    }

    if (role && role !== 'all') {
      query.assignedRoles = { $in: [role] };
    }

    const trainingContent = await TrainingContent.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: trainingContent
    });
  } catch (err) {
    console.error('Get training content error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch training content"
    });
  }
};

// ✅ Get Training Content By ID
export const getTrainingContentById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const trainingContent = await TrainingContent.findOne(query)
      .populate('createdBy', 'name email')
      .lean();

    if (!trainingContent) {
      return res.status(404).json({
        success: false,
        message: "Training content not found"
      });
    }

    res.json({
      success: true,
      data: trainingContent
    });
  } catch (err) {
    console.error('Get training content by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch training content"
    });
  }
};

// ✅ Update Training Content
export const updateTrainingContent = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const trainingContent = await TrainingContent.findOne(query);
    if (!trainingContent) {
      return res.status(404).json({
        success: false,
        message: "Training content not found"
      });
    }

    const updateData = {};

    if (req.body.name) updateData.name = req.body.name.trim();
    if (req.body.type) updateData.type = req.body.type.toUpperCase();
    if (req.body.testType) updateData.testType = req.body.testType.trim().toUpperCase();
    if (req.body.description !== undefined) updateData.description = req.body.description ? req.body.description.trim() : '';
    if (req.body.assignedRoles !== undefined) {
      let parsedRoles = [];
      try {
        if (typeof req.body.assignedRoles === 'string') {
          parsedRoles = JSON.parse(req.body.assignedRoles);
        } else if (Array.isArray(req.body.assignedRoles)) {
          parsedRoles = req.body.assignedRoles;
        } else if (req.body.assignedRoles) {
          parsedRoles = [req.body.assignedRoles];
        }
      } catch (e) {
        parsedRoles = req.body.assignedRoles ? [req.body.assignedRoles] : [];
      }
      updateData.assignedRoles = parsedRoles;
    }

    // Handle file upload
    if (req.file) {
      updateData.fileUrl = req.file.location || req.file.path;
      updateData.fileName = req.file.originalname || '';
    }

    Object.assign(trainingContent, updateData);
    await trainingContent.save();

    await trainingContent.populate('createdBy', 'name email');

    res.json({
      success: true,
      message: "Training content updated successfully",
      data: trainingContent
    });
  } catch (err) {
    console.error('Update training content error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update training content"
    });
  }
};

// ✅ Delete Training Content
export const deleteTrainingContent = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const trainingContent = await TrainingContent.findOneAndDelete(query);
    if (!trainingContent) {
      return res.status(404).json({
        success: false,
        message: "Training content not found"
      });
    }

    res.json({
      success: true,
      message: "Training content deleted successfully"
    });
  } catch (err) {
    console.error('Delete training content error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete training content"
    });
  }
};

// ✅ Get Training Content Signed URL (for S3 files)
export const getTrainingContentSignedUrl = async (req, res) => {
  try {
    console.log('========================================');
    console.log('🔐 Signed URL Request');
    console.log('📋 Content ID:', req.params.id);
    console.log('📋 Disposition:', req.query.disposition);
    console.log('👤 User:', req.user?.email, '| Role:', req.user?.role);

    const { id } = req.params;
    const { disposition = 'inline' } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    console.log('🏢 Company ID:', companyId);
    console.log('👑 Is Superadmin:', isSuperadmin);

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    console.log('🔍 Query:', JSON.stringify(query));

    const trainingContent = await TrainingContent.findOne(query);

    console.log('📦 Found training content:', trainingContent ? 'YES' : 'NO');

    if (!trainingContent) {
      console.log('❌ Training content not found');
      return res.status(404).json({
        success: false,
        message: "Training content not found"
      });
    }

    console.log('📄 Content name:', trainingContent.name);
    console.log('📄 Content type:', trainingContent.type);
    console.log('📄 File URL:', trainingContent.fileUrl);
    console.log('📄 File name:', trainingContent.fileName);

    if (!trainingContent.fileUrl) {
      console.log('❌ No file URL attached');
      return res.status(404).json({
        success: false,
        message: "No file attached to this training content"
      });
    }

    const fileUrl = trainingContent.fileUrl;
    const isS3Url = fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.');

    console.log('☁️ Is S3 URL:', isS3Url);

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
            'mp4': 'video/mp4',
            'mov': 'video/quicktime',
            'avi': 'video/x-msvideo'
          };
          return typeMap[ext] || 'application/octet-stream';
        };

        const contentType = getContentType(fileUrl);
        const contentDisposition = disposition === 'attachment'
          ? `attachment; filename="${encodeURIComponent(trainingContent.fileName || 'training-content')}"`
          : 'inline';

        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentDisposition: contentDisposition,
          ResponseContentType: contentType,
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

        console.log('✅ Generated signed URL successfully');
        console.log('🔗 Signed URL (first 100 chars):', signedUrl.substring(0, 100) + '...');
        console.log('⏰ Expires in: 3600 seconds');
        console.log('========================================');

        res.json({
          success: true,
          url: signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('❌ S3 Error generating signed URL:', s3Error);
        console.error('❌ S3 Error message:', s3Error.message);
        console.log('⚠️ Falling back to direct URL');
        console.log('🔗 Direct URL:', fileUrl);
        console.log('========================================');

        res.json({
          success: true,
          url: fileUrl,
          expiresIn: 0,
          fallback: true
        });
      }
    } else {
      console.log('ℹ️ Not an S3 URL, returning direct URL');
      console.log('🔗 Direct URL:', fileUrl);
      console.log('========================================');

      res.json({
        success: true,
        url: fileUrl,
        expiresIn: 0,
        direct: true
      });
    }
  } catch (err) {
    console.error('❌ Get training content signed URL error:', err);
    console.error('❌ Error message:', err.message);
    console.error('❌ Error stack:', err.stack);
    console.log('========================================');

    res.status(500).json({
      success: false,
      message: err.message || "Failed to get training content signed URL"
    });
  }
};

