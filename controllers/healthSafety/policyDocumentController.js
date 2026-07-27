import { PolicyDocument } from "../../models/healthSafety/policyDocumentModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// Helper function to process file uploads
const processFile = (file) => {
  if (!file) return null;
  
  let fileUrl = null;
  if (file.location) {
    fileUrl = file.location; // S3
  } else if (file.path) {
    fileUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/${file.path.replace(/\\/g, '/')}`;
  }
  
  return {
    fileUrl,
    fileName: file.originalname,
    fileType: file.mimetype || 'application/pdf'
  };
};

// ✅ Create Policy Document
export const createPolicyDocument = async (req, res) => {
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
      category,
      version,
      effectiveDate,
      reviewDate,
      status,
      documentType,
      description
    } = req.body;

    if (!title || !category || !version || !effectiveDate || !reviewDate || !documentType) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: title, category, version, effectiveDate, reviewDate, and documentType are required."
      });
    }

    // Generate policy number before validation
    const year = new Date().getFullYear();
    let policyNumber;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const count = await PolicyDocument.countDocuments({
        policyNumber: new RegExp(`^POL-${year}-`)
      });
      policyNumber = `POL-${year}-${String(count + 1).padStart(4, '0')}`;
      
      // Check if this number already exists (race condition protection)
      const exists = await PolicyDocument.findOne({ policyNumber });
      if (!exists) {
        break;
      }
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate unique policy number. Please try again."
      });
    }

    // Process file upload if any
    let fileData = {};
    if (req.file) {
      fileData = processFile(req.file);
    }

    const payload = {
      policyNumber,
      title: title.trim(),
      category: category.trim(),
      version: version.trim(),
      effectiveDate: new Date(effectiveDate),
      reviewDate: new Date(reviewDate),
      status: status || 'draft',
      documentType,
      description: description || '',
      fileUrl: fileData.fileUrl || '',
      fileName: fileData.fileName || '',
      fileType: fileData.fileType || '',
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    };

    const policyDocument = new PolicyDocument(payload);
    await policyDocument.save();
    
    await policyDocument.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: "Policy document created successfully",
      data: policyDocument
    });
  } catch (err) {
    console.error('Create policy document error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create policy document"
    });
  }
};

// ✅ Get All Policy Documents
export const getPolicyDocuments = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { status, category, documentType, search } = req.query;
    const query = {};

    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (category && category !== 'all') {
      query.category = { $regex: category, $options: 'i' };
    }

    if (documentType && documentType !== 'all') {
      query.documentType = documentType;
    }

    if (search) {
      query.$or = [
        { policyNumber: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    const policyDocuments = await PolicyDocument.find(query)
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('lastReviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: policyDocuments
    });
  } catch (err) {
    console.error('Get policy documents error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch policy documents"
    });
  }
};

// ✅ Get Policy Document By ID
export const getPolicyDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const policyDocument = await PolicyDocument.findOne(query)
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('lastReviewedBy', 'name email')
      .lean();

    if (!policyDocument) {
      return res.status(404).json({
        success: false,
        message: "Policy document not found"
      });
    }

    res.json({
      success: true,
      data: policyDocument
    });
  } catch (err) {
    console.error('Get policy document by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch policy document"
    });
  }
};

// ✅ Update Policy Document
export const updatePolicyDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const policyDocument = await PolicyDocument.findOne(query);
    if (!policyDocument) {
      return res.status(404).json({
        success: false,
        message: "Policy document not found"
      });
    }

    const updateData = {};
    
    if (req.body.title) updateData.title = req.body.title.trim();
    if (req.body.category) updateData.category = req.body.category.trim();
    if (req.body.version) updateData.version = req.body.version.trim();
    if (req.body.effectiveDate) updateData.effectiveDate = new Date(req.body.effectiveDate);
    if (req.body.reviewDate) updateData.reviewDate = new Date(req.body.reviewDate);
    if (req.body.status) updateData.status = req.body.status;
    if (req.body.documentType) updateData.documentType = req.body.documentType;
    if (req.body.description !== undefined) updateData.description = req.body.description;

    // Process new file upload if any
    if (req.file) {
      const fileData = processFile(req.file);
      updateData.fileUrl = fileData.fileUrl;
      updateData.fileName = fileData.fileName;
      updateData.fileType = fileData.fileType;
    }

    Object.assign(policyDocument, updateData);
    await policyDocument.save();

    await policyDocument.populate('createdBy', 'name email');
    if (policyDocument.approvedBy) {
      await policyDocument.populate('approvedBy', 'name email');
    }
    if (policyDocument.lastReviewedBy) {
      await policyDocument.populate('lastReviewedBy', 'name email');
    }

    res.json({
      success: true,
      message: "Policy document updated successfully",
      data: policyDocument
    });
  } catch (err) {
    console.error('Update policy document error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update policy document"
    });
  }
};

// ✅ Delete Policy Document
export const deletePolicyDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const policyDocument = await PolicyDocument.findOneAndDelete(query);
    if (!policyDocument) {
      return res.status(404).json({
        success: false,
        message: "Policy document not found"
      });
    }

    res.json({
      success: true,
      message: "Policy document deleted successfully"
    });
  } catch (err) {
    console.error('Delete policy document error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete policy document"
    });
  }
};

// ✅ Get Policy Document Signed URL (for S3 files)
export const getPolicyDocumentSignedUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { disposition = 'inline' } = req.query; // 'inline' for viewing, 'attachment' for downloading
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const policyDocument = await PolicyDocument.findOne(query);
    if (!policyDocument) {
      return res.status(404).json({
        success: false,
        message: "Policy document not found"
      });
    }

    if (!policyDocument.fileUrl) {
      return res.status(404).json({
        success: false,
        message: "No file attached to this policy document"
      });
    }

    const fileUrl = policyDocument.fileUrl;
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

        const getContentType = (url, mimeType) => {
          if (mimeType) return mimeType;
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
          };
          return typeMap[ext] || 'application/octet-stream';
        };

        const contentType = getContentType(fileUrl, policyDocument.fileType);
        const contentDisposition = disposition === 'attachment' 
          ? `attachment; filename="${encodeURIComponent(policyDocument.fileName || 'policy-document')}"` 
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
        console.error('Error generating signed URL for policy document:', s3Error);
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
    console.error('Get policy document signed URL error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get policy document signed URL"
    });
  }
};

