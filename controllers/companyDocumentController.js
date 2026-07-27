import { CompanyDocument } from "../models/companyDocumentModel.js";
import { CompanyDocumentCategory } from "../models/companyDocumentCategoryModel.js";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/awsConfig.js";

// Legacy keys that were previously hard-seeded. We do NOT return these unless a user explicitly created them.
const LEGACY_DEFAULT_KEYS = new Set(["hr", "offer", "safety", "hiring", "legal", "other"]);

const slugifyCategoryKey = (name) => {
  return (name || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
};

export const listCompanyDocumentCategories = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== "superadmin") {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message:
            "Please complete company settings first before accessing company documents. Go to Company Settings to set up your company.",
        });
      }
    }

    const companyIdRaw = req.user.company?._id || req.user.company;
    const companyId = mongoose.Types.ObjectId.isValid(companyIdRaw)
      ? new mongoose.Types.ObjectId(companyIdRaw)
      : companyIdRaw;

    // Only show user-created categories (no defaults). If old seeded categories exist, hide them.
    // Rule: hide legacy default keys when createdBy is missing.
    const categories = (await CompanyDocumentCategory.find({ company: companyId }).lean()).filter((c) => {
      if (LEGACY_DEFAULT_KEYS.has(c.key) && !c.createdBy) return false;
      return true;
    });

    const countsAgg = await CompanyDocument.aggregate([
      { $match: { company: companyId } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    const countsMap = new Map(countsAgg.map((x) => [x._id || "", x.count]));
    const totalCount = countsAgg.reduce((sum, x) => sum + (x.count || 0), 0);

    // Only show categories that exist in the categories collection (user-created).
    const normalizedCategories = categories
      .map((c) => ({
        id: c._id,
        key: c.key,
        name: c.name,
        count: countsMap.get(c.key) || 0,
      }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const normalized = [{ id: null, key: "all", name: "All Documents", count: totalCount }, ...normalizedCategories];

    return res.json({ success: true, data: normalized });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const createCompanyDocumentCategory = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== "superadmin") {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message:
            "Please complete company settings first before managing company documents. Go to Company Settings to set up your company.",
        });
      }
    }

    const companyId = req.user.company;
    const { name } = req.body || {};
    if (!name || !name.toString().trim()) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const key = slugifyCategoryKey(name);
    if (!key || key === "all") {
      return res.status(400).json({ success: false, message: "Invalid category name" });
    }

    const existing = await CompanyDocumentCategory.findOne({ company: companyId, key }).lean();
    if (existing) {
      return res.status(409).json({ success: false, message: "Category already exists" });
    }

    const created = await CompanyDocumentCategory.create({
      company: companyId,
      key,
      name: name.toString().trim(),
      createdBy: req.user?._id,
    });

    return res.status(201).json({
      success: true,
      data: { id: created._id, key: created.key, name: created.name, count: 0 },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateCompanyDocumentCategory = async (req, res) => {
  try {
    if (req.user && req.user.role !== "superadmin") {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message:
            "Please complete company settings first before managing company documents. Go to Company Settings to set up your company.",
        });
      }
    }

    const companyId = req.user.company;
    const { id } = req.params;
    const { name } = req.body || {};

    if (!name || !name.toString().trim()) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const category = await CompanyDocumentCategory.findOneAndUpdate(
      { _id: id, company: companyId },
      { name: name.toString().trim() },
      { new: true }
    ).lean();

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    return res.json({
      success: true,
      data: { id: category._id, key: category.key, name: category.name },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteCompanyDocumentCategory = async (req, res) => {
  try {
    if (req.user && req.user.role !== "superadmin") {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message:
            "Please complete company settings first before managing company documents. Go to Company Settings to set up your company.",
        });
      }
    }

    const companyId = req.user.company;
    const { id } = req.params;

    const category = await CompanyDocumentCategory.findOne({ _id: id, company: companyId }).lean();
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    // Block delete if documents exist in this category
    const inUseCount = await CompanyDocument.countDocuments({ company: companyId, category: category.key });
    if (inUseCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete category. ${inUseCount} document(s) are still in this category.`,
      });
    }

    await CompanyDocumentCategory.deleteOne({ _id: id, company: companyId });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const listCompanyDocuments = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before accessing company documents. Go to Company Settings to set up your company."
        });
      }
    }

    const { category = "", search = "" } = req.query;
    const filter = { company: req.user.company };
    if (category && category !== "all") filter.category = category;
    if (search) filter.name = { $regex: search, $options: "i" };

    const docs = await CompanyDocument.find(filter)
      .sort({ createdAt: -1 })
      .populate("uploadedBy", "name email")
      .lean();

    const normalized = docs.map((d) => ({
      _id: d._id,
      name: d.name,
      category: d.category,
      type: d.type || "file",
      size: d.size || 0,
      uploadedBy: d.uploadedBy?.name || "",
      uploadDate: d.createdAt,
      url: d.url,
      description: d.description || "",
    }));

    res.json({ success: true, data: normalized });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const uploadCompanyDocument = async (req, res) => {
  try {
    console.log("=========================================");
    console.log("📄 UPLOAD COMPANY DOCUMENT - Controller Started");
    console.log("   NODE_ENV:", process.env.NODE_ENV);
    console.log("   Has req.file:", !!req.file);
    
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before uploading company documents. Go to Company Settings to set up your company."
        });
      }
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, category = "other", description = "" } = req.body;
    const normalizedCategory = (category || "other").toString().trim().toLowerCase();

    let fileUrl = null;
    let fileType = undefined;
    let fileSize = undefined;
    
    if (req.file) {
      console.log("   ✅ File object received");
      console.log("   File properties:", {
        location: req.file.location || "❌ MISSING",
        path: req.file.path || "❌ MISSING",
        key: req.file.key || "❌ MISSING",
        bucket: req.file.bucket || "❌ MISSING",
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        etag: req.file.etag || "N/A"
      });
      
      // In production (S3), req.file.location exists but req.file.path doesn't
      // In development (local), req.file.path exists
      if (req.file.location) {
        // S3 upload - use location directly
        fileUrl = req.file.location;
        console.log("   ✅ Using S3 location:", fileUrl);
      } else if (req.file.path) {
        // Local upload - construct URL from path
        const localUrl = `${process.env.BASE_URL || `http://localhost:3000`}/${req.file.path.replace(/\\/g, "/")}`;
        fileUrl = localUrl;
        console.log("   ✅ Using local path:", fileUrl);
      } else {
        console.error("   ❌ ERROR: No location or path found in req.file!");
        console.error("   Full req.file object:", JSON.stringify(req.file, null, 2));
        return res.status(500).json({ 
          success: false, 
          message: "File upload failed - no location returned. Check server logs for details." 
        });
      }
      fileType = (req.file.originalname.split(".").pop() || "file").toLowerCase();
      fileSize = req.file.size;
    } else {
      console.error("   ❌ ERROR: No file received in req.file");
      return res.status(400).json({ 
        success: false, 
        message: "No file uploaded. Please select a file." 
      });
    }
    
    console.log("   Final fileUrl:", fileUrl);
    console.log("=========================================");

    const doc = await CompanyDocument.create({
      company: req.user.company,
      name,
      category: normalizedCategory,
      description,
      type: fileType,
      size: fileSize,
      url: fileUrl,
      uploadedBy: req.user._id,
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteCompanyDocument = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before managing company documents. Go to Company Settings to set up your company."
        });
      }
    }

    const { id } = req.params;
    const doc = await CompanyDocument.findOneAndDelete({ _id: id, company: req.user.company });
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Generate signed URL for S3 file access
export const getSignedDocumentUrl = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before accessing company documents."
        });
      }
    }

    const { id } = req.params;
    const { disposition = 'inline' } = req.query; // 'inline' for viewing, 'attachment' for downloading
    const doc = await CompanyDocument.findOne({ _id: id, company: req.user.company });
    
    if (!doc) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    if (!doc.url) {
      return res.status(400).json({ success: false, message: "Document URL not found" });
    }

    // Check if URL is an S3 URL
    const isS3Url = doc.url.includes('s3.amazonaws.com') || doc.url.includes('.s3.');
    
    if (isS3Url) {
      try {
        // Extract bucket and key from S3 URL
        // URL format: https://bucket-name.s3.region.amazonaws.com/key
        // Example: https://your-bucket.s3.region.amazonaws.com/documents/file.pdf
        // Note: The stored URL might be a signed URL with query parameters, so we need to strip those
        
        // Remove query parameters and hash from URL before parsing
        const cleanUrl = doc.url.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let key = decodeURIComponent(urlObj.pathname.substring(1)); // Remove leading slash and decode URL encoding

        // Handle different S3 URL formats
        if (urlObj.hostname.includes('.s3.')) {
          // Format: bucket.s3.region.amazonaws.com
          // Example: your-bucket.s3.region.amazonaws.com
          bucketName = urlObj.hostname.split('.s3.')[0];
          // Key is the pathname without leading slash, URL decoded
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          // Format: s3.region.amazonaws.com/bucket/key
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          bucketName = pathParts[0];
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }
        
        // Additional cleanup: remove any trailing query-like strings or signature data that might have been incorrectly included
        // This handles cases where the key might have signature data appended to the filename
        if (key.includes('?')) {
          key = key.split('?')[0];
        }
        if (key.includes('&')) {
          key = key.split('&')[0];
        }
        
        // Detect file extension and remove anything that looks like a signature after it
        // Common file extensions
        const fileExtensionPattern = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|gif|webp|txt|csv|zip|rar)/i;
        const extensionMatch = key.match(fileExtensionPattern);
        if (extensionMatch) {
          // Found file extension - find where it ends
          const extensionEndIndex = extensionMatch.index + extensionMatch[0].length;
          const baseKey = key.substring(0, extensionEndIndex);
          const afterExtension = key.substring(extensionEndIndex);
          
          // If there's data after the extension that looks like a signature (long alphanumeric string), remove it
          if (afterExtension && /^[A-Za-z0-9+/=]{20,}/.test(afterExtension)) {
            // Looks like signature data appended directly to extension, use only the base key
            key = baseKey;
          }
        } else {
          // No extension found, try to remove trailing signature-like patterns
          // Remove any base64-like signature patterns that might be at the end (long alphanumeric strings)
          key = key.replace(/[A-Za-z0-9+/=]{50,}$/, '').replace(/[+/=]+$/, '');
        }
        
        console.log('🔑 Extracting S3 info:', { 
          originalUrl: doc.url,
          cleanUrl: cleanUrl,
          bucketName, 
          key, 
          hostname: urlObj.hostname 
        });

        // Determine content type based on file extension
        const getContentType = (fileType) => {
          const typeMap = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'txt': 'text/plain',
            'csv': 'text/csv',
          };
          return typeMap[fileType?.toLowerCase()] || 'application/octet-stream';
        };

        const contentType = getContentType(doc.type);
        
        // Generate signed URL (valid for 1 hour)
        // Set ResponseContentDisposition based on query parameter: 'inline' for viewing, 'attachment' for downloading
        // Set ResponseContentType to ensure browser recognizes the file type
        const contentDisposition = disposition === 'attachment' ? 'attachment' : 'inline';
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentDisposition: contentDisposition, // 'inline' opens in browser, 'attachment' forces download
          ResponseContentType: contentType, // Set proper MIME type so browser knows how to handle it
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour expiry

        return res.json({
          success: true,
          url: signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('Error generating signed URL:', s3Error);
        // If signed URL generation fails, return the original URL
        // Frontend will handle the error
        return res.json({
          success: true,
          url: doc.url,
          expiresIn: 0
        });
      }
    } else {
      // Not an S3 URL, return as-is (local file or other storage)
      return res.json({
        success: true,
        url: doc.url,
        expiresIn: 0
      });
    }
  } catch (err) {
    console.error('Error getting signed document URL:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};


