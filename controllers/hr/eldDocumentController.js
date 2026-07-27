import { ELDDocument } from "../../models/eldDocumentModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../../config/awsConfig.js";
import mongoose from "mongoose";

/**
 * Upload ELD Document
 * POST /hr/eld-documents/upload
 * Access: admin, superadmin, hr
 */
export const uploadELDDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Document file is required."
      });
    }

    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user.role !== 'superadmin') {
      return res.status(400).json({
        success: false,
        message: "Company information is required."
      });
    }

    // Extract file metadata
    let fileUrl = null;
    let s3Key = null;
    let s3Bucket = null;

    if (req.file.location) {
      // S3 upload (production)
      fileUrl = req.file.location;
      s3Key = req.file.key;
      s3Bucket = req.file.bucket;
    } else if (req.file.path) {
      // Local upload (development)
      fileUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/${req.file.path.replace(/\\/g, '/')}`;
    }

    if (!fileUrl) {
      return res.status(500).json({
        success: false,
        message: "Failed to process uploaded file."
      });
    }

    // Get optional fields from request body
    const { title, description } = req.body || {};
    const isActive = req.body.isActive !== undefined ? req.body.isActive === 'true' || req.body.isActive === true : true;

    // Create ELD document
    const eldDocument = await ELDDocument.create({
      company: companyId,
      fileName: req.file.originalname,
      fileUrl: fileUrl,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      title: title || req.file.originalname.replace(/\.[^/.]+$/, ''),
      description: description || '',
      isActive: isActive,
      uploadedBy: req.user._id,
      s3Key: s3Key,
      s3Bucket: s3Bucket
    });

    return res.status(201).json({
      success: true,
      message: "ELD document uploaded successfully.",
      data: eldDocument
    });
  } catch (error) {
    console.error("Error uploading ELD document:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to upload ELD document."
    });
  }
};

/**
 * Get all ELD Documents
 * GET /hr/eld-documents
 * Access: admin, superadmin, hr
 */
export const getELDDocuments = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Build query
    const query = {};
    if (!isSuperadmin) {
      query.company = companyId;
    }

    // Search filter
    const { search } = req.query;
    if (search) {
      query.$or = [
        { fileName: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Get documents
    const documents = await ELDDocument.find(query)
      .populate('uploadedBy', 'name email')
      .populate('company', 'companyName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count
    const total = await ELDDocument.countDocuments(query);

    return res.json({
      success: true,
      data: documents,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total: total,
        limit: limit
      }
    });
  } catch (error) {
    console.error("Error fetching ELD documents:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch ELD documents."
    });
  }
};

/**
 * Get ELD Document by ID
 * GET /hr/eld-documents/:id
 * Access: admin, superadmin, hr
 */
export const getELDDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Build query
    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const document = await ELDDocument.findOne(query)
      .populate('uploadedBy', 'name email')
      .populate('company', 'companyName')
      .lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "ELD document not found."
      });
    }

    return res.json({
      success: true,
      data: document
    });
  } catch (error) {
    console.error("Error fetching ELD document:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch ELD document."
    });
  }
};

/**
 * Update ELD Document (metadata only)
 * PUT /hr/eld-documents/:id
 * Access: admin, superadmin, hr
 */
export const updateELDDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Build query
    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    // Get update fields
    const updateData = {};
    if (req.body.title !== undefined) {
      updateData.title = req.body.title;
    }
    if (req.body.description !== undefined) {
      updateData.description = req.body.description;
    }
    if (req.body.isActive !== undefined) {
      updateData.isActive = req.body.isActive === 'true' || req.body.isActive === true;
    }

    const document = await ELDDocument.findOneAndUpdate(
      query,
      updateData,
      { new: true }
    )
      .populate('uploadedBy', 'name email')
      .populate('company', 'companyName')
      .lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "ELD document not found."
      });
    }

    return res.json({
      success: true,
      message: "ELD document updated successfully.",
      data: document
    });
  } catch (error) {
    console.error("Error updating ELD document:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update ELD document."
    });
  }
};

/**
 * Delete ELD Document
 * DELETE /hr/eld-documents/:id
 * Access: admin, superadmin, hr
 */
export const deleteELDDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Build query
    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const document = await ELDDocument.findOneAndDelete(query);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "ELD document not found."
      });
    }

    // TODO: Optionally delete file from S3 or local storage
    // This would require additional logic to handle file deletion

    return res.json({
      success: true,
      message: "ELD document deleted successfully."
    });
  } catch (error) {
    console.error("Error deleting ELD document:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete ELD document."
    });
  }
};

/**
 * Download ELD Document
 * GET /hr/eld-documents/:id/download
 * Access: admin, superadmin, hr
 */
export const downloadELDDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Build query
    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const document = await ELDDocument.findOne(query).lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "ELD document not found."
      });
    }

    // Check if it's an S3 URL
    const isS3Url = document.fileUrl.includes('amazonaws.com') || document.fileUrl.includes('s3');

    if (isS3Url) {
      try {
        // Extract bucket and key - use stored values or extract from URL
        let bucketName = document.s3Bucket;
        let s3Key = document.s3Key;

        // If s3Key or s3Bucket are missing, extract from URL
        if (!bucketName || !s3Key) {
          const cleanUrl = document.fileUrl.split('?')[0].split('#')[0];
          const urlObj = new URL(cleanUrl);
          
          // Handle different S3 URL formats
          if (urlObj.hostname.includes('.s3.')) {
            bucketName = bucketName || urlObj.hostname.split('.s3.')[0];
            s3Key = s3Key || decodeURIComponent(urlObj.pathname.substring(1));
          } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            bucketName = bucketName || pathParts[0];
            s3Key = s3Key || pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
          } else {
            bucketName = bucketName || process.env.AWS_S3_BUCKET_NAME;
            s3Key = s3Key || decodeURIComponent(urlObj.pathname.substring(1));
          }

          // Clean up key
          if (s3Key.includes('?')) s3Key = s3Key.split('?')[0];
          if (s3Key.includes('&')) s3Key = s3Key.split('&')[0];
        }

        if (!bucketName || !s3Key) {
          throw new Error('Cannot determine S3 bucket or key from document');
        }

        // Use getS3ClientForBucket to get the correct S3 client with proper region
        const { getS3ClientForBucket } = await import("../../config/awsConfig.js");
        const s3Client = await getS3ClientForBucket(bucketName, document.fileUrl);
        
        // Generate presigned URL for S3
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: s3Key
        });

        // Generate signed URL with longer expiry (3 hours) to prevent expiration issues
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 10800 }); // 3 hours expiry

        return res.json({
          success: true,
          url: signedUrl,
          expiresIn: 10800 // 3 hours
        });
      } catch (s3Error) {
        console.error("❌ Error generating signed URL for ELD document download:", s3Error);
        return res.status(500).json({
          success: false,
          message: s3Error.message || "Failed to generate signed URL for document."
        });
      }
    } else {
      // Return direct URL for local files
      return res.json({
        success: true,
        url: document.fileUrl,
        expiresIn: 0
      });
    }
  } catch (error) {
    console.error("Error downloading ELD document:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to download ELD document."
    });
  }
};

/**
 * Get Signed URL for ELD Document (for viewing)
 * GET /hr/eld-documents/:id/signed-url
 * Access: admin, superadmin, hr
 */
export const getELDDocumentSignedUrl = async (req, res) => {
  try {
    const { id } = req.params;
    // Ensure we read the disposition parameter correctly (default to 'inline' for viewing)
    const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
    console.log(`🔑 Generating signed URL with disposition: ${disposition} for document: ${id}`);
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Build query
    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const document = await ELDDocument.findOne(query).lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "ELD document not found."
      });
    }

    // Check if it's an S3 URL
    const isS3Url = document.fileUrl.includes('amazonaws.com') || document.fileUrl.includes('s3');

    if (isS3Url) {
      try {
        // Extract bucket and key - use stored values or extract from URL
        let bucketName = document.s3Bucket;
        let s3Key = document.s3Key;

        // If s3Key or s3Bucket are missing, extract from URL
        if (!bucketName || !s3Key) {
          const cleanUrl = document.fileUrl.split('?')[0].split('#')[0];
          const urlObj = new URL(cleanUrl);
          
          // Handle different S3 URL formats
          if (urlObj.hostname.includes('.s3.')) {
            bucketName = bucketName || urlObj.hostname.split('.s3.')[0];
            s3Key = s3Key || decodeURIComponent(urlObj.pathname.substring(1));
          } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            bucketName = bucketName || pathParts[0];
            s3Key = s3Key || pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
          } else {
            bucketName = bucketName || process.env.AWS_S3_BUCKET_NAME;
            s3Key = s3Key || decodeURIComponent(urlObj.pathname.substring(1));
          }

          // Clean up key
          if (s3Key.includes('?')) s3Key = s3Key.split('?')[0];
          if (s3Key.includes('&')) s3Key = s3Key.split('&')[0];
        }

        if (!bucketName || !s3Key) {
          throw new Error('Cannot determine S3 bucket or key from document');
        }

        // Use getS3ClientForBucket to get the correct S3 client with proper region
        const { getS3ClientForBucket } = await import("../../config/awsConfig.js");
        const s3Client = await getS3ClientForBucket(bucketName, document.fileUrl);
        
        // Determine content type based on file extension
        const getContentType = (fileName) => {
          const ext = fileName.split('.').pop()?.toLowerCase();
          const contentTypes = {
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          };
          return contentTypes[ext] || 'application/octet-stream';
        };
        
        const contentType = getContentType(document.fileName || s3Key);
        
        // Generate presigned URL for S3 with correct disposition and content type
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          ResponseContentDisposition: disposition === 'attachment' 
            ? `attachment; filename="${document.fileName}"` 
            : `inline; filename="${document.fileName}"`,
          ResponseContentType: contentType
        });
        
        console.log(`📄 Generating signed URL:`, {
          disposition,
          contentType,
          fileName: document.fileName
        });

        // Generate signed URL with longer expiry (3 hours) to prevent expiration issues
        // This gives enough time for mobile apps to open the URL even with network delays
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 10800 }); // 3 hours expiry

        return res.json({
          success: true,
          url: signedUrl,
          expiresIn: 10800 // 3 hours
        });
      } catch (s3Error) {
        console.error("❌ Error generating signed URL for ELD document:", {
          error: s3Error.message,
          stack: s3Error.stack,
          bucket: document.s3Bucket,
          key: document.s3Key,
          fileUrl: document.fileUrl,
          disposition: disposition
        });
        return res.status(500).json({
          success: false,
          message: s3Error.message || "Failed to generate signed URL for document."
        });
      }
    } else {
      // Return direct URL for local files
      return res.json({
        success: true,
        url: document.fileUrl,
        expiresIn: 0
      });
    }
  } catch (error) {
    console.error("Error getting ELD document signed URL:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get ELD document signed URL."
    });
  }
};


