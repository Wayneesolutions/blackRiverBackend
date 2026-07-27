import { ELDDocument } from "../../models/eldDocumentModel.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Get all active ELD Documents for drivers
 * GET /driver/eld-documents
 * Access: driver
 */
export const getDriverELDDocuments = async (req, res) => {
  try {
    const companyId = req.user.company;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "Company information is required."
      });
    }

    // Only return active documents
    const documents = await ELDDocument.find({
      company: companyId,
      isActive: true
    })
      .select('fileName title description mimeType')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: documents
    });
  } catch (error) {
    console.error("Error fetching ELD documents for driver:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch ELD documents."
    });
  }
};

/**
 * Get ELD Document by ID for drivers
 * GET /driver/eld-documents/:id
 * Access: driver
 */
export const getDriverELDDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.company;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "Company information is required."
      });
    }

    const document = await ELDDocument.findOne({
      _id: id,
      company: companyId,
      isActive: true
    })
      .select('fileName fileSize title description uploadedAt mimeType')
      .lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "ELD document not found or not available."
      });
    }

    return res.json({
      success: true,
      data: document
    });
  } catch (error) {
    console.error("Error fetching ELD document for driver:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch ELD document."
    });
  }
};

/**
 * Get Signed URL for ELD Document (for viewing/downloading)
 * GET /driver/eld-documents/:id/signed-url
 * Access: driver
 */
export const getDriverELDDocumentSignedUrl = async (req, res) => {
  try {
    const { id } = req.params;
    // Ensure we read the disposition parameter correctly (default to 'inline' for viewing)
    const requestedDisposition = req.query.disposition;
    const disposition = requestedDisposition === 'attachment' ? 'attachment' : 'inline';
    console.log(`🔑 Generating signed URL for driver ELD document:`, {
      documentId: id,
      requestedDisposition: requestedDisposition,
      finalDisposition: disposition,
      queryParams: req.query
    });
    const companyId = req.user.company;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "Company information is required."
      });
    }

    const document = await ELDDocument.findOne({
      _id: id,
      company: companyId,
      isActive: true
    }).lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "ELD document not found or not available."
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
        
        console.log(`🔑 Generating signed URL for driver ELD document:`, {
          bucket: bucketName,
          key: s3Key,
          fileUrl: document.fileUrl,
          disposition: disposition,
          contentType: contentType
        });
        
        // Generate presigned URL for S3 with correct disposition and content type
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          ResponseContentDisposition: disposition === 'attachment' 
            ? `attachment; filename="${document.fileName}"` 
            : `inline; filename="${document.fileName}"`,
          ResponseContentType: contentType
        });

        // Generate signed URL with longer expiry (3 hours) to prevent expiration issues
        // This gives enough time for mobile apps to open the URL even with network delays
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 10800 }); // 3 hours expiry

        // Verify the signed URL contains the correct disposition
        const urlHasInline = signedUrl.includes('response-content-disposition=inline');
        const urlHasAttachment = signedUrl.includes('response-content-disposition=attachment');
        
        console.log(`✅ Successfully generated signed URL for driver ELD document:`, {
          disposition: disposition,
          urlContainsInline: urlHasInline,
          urlContainsAttachment: urlHasAttachment,
          expiresIn: 10800,
          urlPreview: signedUrl.substring(0, 200) + '...'
        });
        
        if (disposition === 'inline' && urlHasAttachment) {
          console.error('⚠️ WARNING: Requested inline but URL contains attachment!');
        }
        
        return res.json({
          success: true,
          url: signedUrl,
          expiresIn: 10800 // 3 hours
        });
      } catch (s3Error) {
        console.error("❌ Error generating signed URL for driver ELD document:", {
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
    console.error("Error getting ELD document signed URL for driver:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get ELD document signed URL."
    });
  }
};

/**
 * Download ELD Document
 * GET /driver/eld-documents/:id/download
 * Access: driver
 */
export const downloadDriverELDDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.company;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "Company information is required."
      });
    }

    const document = await ELDDocument.findOne({
      _id: id,
      company: companyId,
      isActive: true
    }).lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "ELD document not found or not available."
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
        
        console.log(`🔑 Generating signed URL for driver ELD document download:`, {
          bucket: bucketName,
          key: s3Key,
          fileUrl: document.fileUrl
        });
        
        // Generate presigned URL for S3
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: s3Key
        });

        // Generate signed URL with longer expiry (3 hours) to prevent expiration issues
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 10800 }); // 3 hours expiry

        console.log(`✅ Successfully generated signed URL for driver ELD document download`);
        
        return res.json({
          success: true,
          url: signedUrl,
          expiresIn: 10800 // 3 hours
        });
      } catch (s3Error) {
        console.error("❌ Error generating signed URL for driver ELD document download:", {
          error: s3Error.message,
          stack: s3Error.stack,
          bucket: document.s3Bucket,
          key: document.s3Key,
          fileUrl: document.fileUrl
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
    console.error("Error downloading ELD document for driver:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to download ELD document."
    });
  }
};


