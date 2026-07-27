import { DocumentLibrary } from "../../models/healthSafety/documentLibraryModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// Helper to process file upload
const processFile = (file) => {
  if (!file) return null;
  
  let fileUrl = null;
  if (file.location) {
    fileUrl = file.location;
  } else if (file.path) {
    fileUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/${file.path.replace(/\\/g, '/')}`;
  }
  
  return fileUrl;
};

// Helper to calculate retention end date
const calculateRetentionEndDate = (startDate, periodMonths) => {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + periodMonths);
  return endDate;
};

// Helper to calculate retention status
const calculateRetentionStatus = (endDate, currentStatus) => {
  if (currentStatus === 'archived') return 'archived';
  
  const now = new Date();
  const end = new Date(endDate);
  const daysUntilExpiry = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 30) return 'expiring-soon';
  return 'active';
};

// ✅ Create Document
export const createDocument = async (req, res) => {
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
      title,
      description,
      category,
      documentType,
      retentionPeriod,
      retentionStartDate,
      autoDelete,
      retentionNotes,
      requiredForAudit,
      auditCategory,
      relatedIncident,
      relatedHazard,
      relatedInspection,
      accessLevel,
      allowedRoles,
      tags
    } = req.body;

    if (!title || !category || !documentType || !retentionPeriod || !retentionStartDate) {
      return res.status(400).json({
        success: false,
        message: "Title, category, document type, retention period, and retention start date are required."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File upload is required."
      });
    }

    const fileUrl = processFile(req.file);
    if (!fileUrl) {
      return res.status(400).json({
        success: false,
        message: "Failed to process file upload."
      });
    }

    const retentionEndDate = calculateRetentionEndDate(new Date(retentionStartDate), parseInt(retentionPeriod));
    const retentionStatus = calculateRetentionStatus(retentionEndDate, 'active');

    // Parse tags if string
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        parsedTags = Array.isArray(parsedTags) ? parsedTags.filter(tag => tag && tag.trim()) : [];
      } catch (e) {
        parsedTags = Array.isArray(tags) ? tags.filter(tag => tag && tag.trim()) : tags.split(',').map(t => t.trim()).filter(t => t);
      }
    }

    // Parse allowedRoles if string
    let parsedRoles = [];
    if (allowedRoles) {
      try {
        parsedRoles = typeof allowedRoles === 'string' ? JSON.parse(allowedRoles) : allowedRoles;
        parsedRoles = Array.isArray(parsedRoles) ? parsedRoles.filter(role => role && role.trim()) : [];
      } catch (e) {
        parsedRoles = Array.isArray(allowedRoles) ? allowedRoles.filter(role => role && role.trim()) : allowedRoles.split(',').map(r => r.trim()).filter(r => r);
      }
    }

    const document = new DocumentLibrary({
      title: title.trim(),
      description: description?.trim() || '',
      category,
      documentType,
      fileUrl,
      fileName: req.file.originalname || req.file.filename || 'document',
      fileSize: req.file.size || 0,
      uploadedBy: req.user.name || req.user.email || 'Unknown',
      uploadedById: req.user._id,
      uploadedDate: new Date(),
      tags: parsedTags,
      retentionPeriod: parseInt(retentionPeriod),
      retentionStartDate: new Date(retentionStartDate),
      retentionEndDate,
      retentionStatus,
      autoDelete: autoDelete === true || autoDelete === 'true',
      retentionNotes: retentionNotes?.trim() || '',
      requiredForAudit: requiredForAudit === true || requiredForAudit === 'true',
      auditCategory: auditCategory?.trim() || '',
      relatedIncident: relatedIncident?.trim() || '',
      relatedHazard: relatedHazard?.trim() || '',
      relatedInspection: relatedInspection?.trim() || '',
      accessLevel: accessLevel || 'public',
      allowedRoles: parsedRoles,
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    });

    await document.save();
    await document.populate('createdBy', 'name email');
    await document.populate('uploadedById', 'name email');

    res.status(201).json({
      success: true,
      message: "Document created successfully",
      data: document
    });
  } catch (err) {
    console.error('Create document error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create document"
    });
  }
};

// ✅ Get All Documents
export const getDocuments = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { search, category, retentionStatus } = req.query;
    const query = {};

    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    if (retentionStatus && retentionStatus !== 'all') {
      query.retentionStatus = retentionStatus;
    }

    if (search) {
      query.$or = [
        { documentNumber: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const documents = await DocumentLibrary.find(query)
      .populate('createdBy', 'name email')
      .populate('uploadedById', 'name email')
      .sort({ uploadedDate: -1 })
      .lean();

    res.json({
      success: true,
      data: documents
    });
  } catch (err) {
    console.error('Get documents error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch documents"
    });
  }
};

// ✅ Get Document By ID
export const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const document = await DocumentLibrary.findOne(query)
      .populate('createdBy', 'name email')
      .populate('uploadedById', 'name email')
      .lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    res.json({
      success: true,
      data: document
    });
  } catch (err) {
    console.error('Get document by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch document"
    });
  }
};

// ✅ Update Document
export const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const document = await DocumentLibrary.findOne(query);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    const updateData = { ...req.body };

    // Process file upload if new file provided
    if (req.file) {
      updateData.fileUrl = processFile(req.file);
      updateData.fileName = req.file.originalname || req.file.filename || document.fileName;
      updateData.fileSize = req.file.size || document.fileSize;
    }

    // Recalculate retention if period or start date changed
    if (updateData.retentionPeriod || updateData.retentionStartDate) {
      const startDate = updateData.retentionStartDate ? new Date(updateData.retentionStartDate) : document.retentionStartDate;
      const period = updateData.retentionPeriod ? parseInt(updateData.retentionPeriod) : document.retentionPeriod;
      updateData.retentionEndDate = calculateRetentionEndDate(startDate, period);
      updateData.retentionStatus = calculateRetentionStatus(updateData.retentionEndDate, updateData.retentionStatus || document.retentionStatus);
    }

    // Parse tags if provided
    if (updateData.tags) {
      try {
        let parsedTags = typeof updateData.tags === 'string' ? JSON.parse(updateData.tags) : updateData.tags;
        parsedTags = Array.isArray(parsedTags) ? parsedTags.filter(tag => tag && tag.trim()) : [];
        updateData.tags = parsedTags;
      } catch (e) {
        parsedTags = Array.isArray(updateData.tags) ? updateData.tags.filter(tag => tag && tag.trim()) : updateData.tags.split(',').map(t => t.trim()).filter(t => t);
        updateData.tags = parsedTags;
      }
    }

    // Parse allowedRoles if provided
    if (updateData.allowedRoles) {
      try {
        let parsedRoles = typeof updateData.allowedRoles === 'string' ? JSON.parse(updateData.allowedRoles) : updateData.allowedRoles;
        parsedRoles = Array.isArray(parsedRoles) ? parsedRoles.filter(role => role && role.trim()) : [];
        updateData.allowedRoles = parsedRoles;
      } catch (e) {
        parsedRoles = Array.isArray(updateData.allowedRoles) ? updateData.allowedRoles.filter(role => role && role.trim()) : updateData.allowedRoles.split(',').map(r => r.trim()).filter(r => r);
        updateData.allowedRoles = parsedRoles;
      }
    }

    Object.assign(document, updateData);
    await document.save();
    await document.populate('createdBy', 'name email');
    await document.populate('uploadedById', 'name email');

    res.json({
      success: true,
      message: "Document updated successfully",
      data: document
    });
  } catch (err) {
    console.error('Update document error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update document"
    });
  }
};

// ✅ Delete Document
export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const document = await DocumentLibrary.findOneAndDelete(query);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    res.json({
      success: true,
      message: "Document deleted successfully"
    });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete document"
    });
  }
};

// ✅ Get Document Signed URL (for S3 files)
export const getDocumentSignedUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { disposition = 'attachment' } = req.query; // 'inline' for viewing, 'attachment' for downloading
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const document = await DocumentLibrary.findOne(query);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    if (!document.fileUrl) {
      return res.status(404).json({
        success: false,
        message: "No file attached to this document"
      });
    }

    const fileUrl = document.fileUrl;
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

        // Clean key from query parameters
        if (key.includes('?')) key = key.split('?')[0];
        if (key.includes('&')) key = key.split('&')[0];

        const getContentType = (url) => {
          const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
          const typeMap = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'txt': 'text/plain',
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
          ? `attachment; filename="${encodeURIComponent(document.fileName || 'document')}"` 
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
          signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('Error generating signed URL for document:', s3Error);
        res.json({
          success: true,
          signedUrl: fileUrl,
          expiresIn: 0
        });
      }
    } else {
      res.json({
        success: true,
        signedUrl: fileUrl,
        expiresIn: 0
      });
    }
  } catch (err) {
    console.error('Get document signed URL error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get document signed URL"
    });
  }
};

