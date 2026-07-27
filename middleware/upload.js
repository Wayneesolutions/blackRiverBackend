import multer from "multer";
import multerS3 from "multer-s3-v3";
import { s3 } from "../config/awsConfig.js";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";
const hasAwsConfig = !!(
  process.env.AWS_S3_BUCKET_NAME &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY
);
// Use S3 when AWS is configured (works in dev and prod)
const useS3Storage = hasAwsConfig;
console.log("NODE_ENV:", process.env.NODE_ENV);

// ✅ Log AWS S3 Configuration
const bucketName = process.env.AWS_S3_BUCKET_NAME;
const awsRegion = process.env.AWS_REGION;
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;

console.log("=========================================");
console.log("🔍 AWS S3 Configuration:");
console.log("   Bucket Name:", bucketName || "❌ NOT SET");
console.log("   AWS Region:", awsRegion || "❌ NOT SET");
console.log("   AWS Access Key ID:", awsAccessKeyId ? `${awsAccessKeyId.substring(0, 4)}...${awsAccessKeyId.substring(awsAccessKeyId.length - 4)}` : "❌ NOT SET");
console.log("   Storage Mode:", useS3Storage ? "☁️  S3 (AWS configured)" : "💾 Local (Development)");
console.log("=========================================");

// ✅ Allowed file types
const allowedMimeTypes = {
  images: ["image/jpeg", "image/png", "image/jpg"],
  videos: ["video/mp4", "video/mov", "video/avi"],
  documents: [
    "application/pdf", 
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
    "text/plain", // .txt
    "application/zip", // .zip
    "application/x-zip-compressed" // .zip
  ]
};

// ✅ File type check
const checkMimeType = (req, file, cb) => {
  if ([...allowedMimeTypes.images, ...allowedMimeTypes.videos,...allowedMimeTypes.documents].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Allowed: JPG, PNG, MP4, MOV, AVI, PDF, DOC, DOCX, XLS, XLSX, TXT, ZIP"), false);
  }
};

// ✅ Local storage (for dev)
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = "uploads/others";

    if (file.mimetype.startsWith("image/")) {
      folder = "uploads/images";
    } else if (file.mimetype.startsWith("video/")) {
      folder = "uploads/videos";
    } else if (
      allowedMimeTypes.documents.includes(file.mimetype)
    ) {
      folder = "uploads/documents";
    }

    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// ✅ S3 storage (for prod)
// Note: ACL is removed because the bucket doesn't support ACLs
// We use presigned URLs when serving files instead
const s3Storage = multerS3({
  s3: s3,
  bucket: process.env.AWS_S3_BUCKET_NAME,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  // ACL removed - bucket doesn't support ACLs, we'll use presigned URLs instead
  key: (req, file, cb) => {
    let folder = "others";

    if (file.mimetype.startsWith("image/")) {
      folder = "images";
    } else if (file.mimetype.startsWith("video/")) {
      folder = "videos";
    } else if (
      allowedMimeTypes.documents.includes(file.mimetype)
    ) {
      folder = "documents";
    }

    const s3Key = `${folder}/${Date.now()}-${file.originalname}`;
    
    // ✅ Log upload details BEFORE upload
    console.log("=========================================");
    console.log("📤 Starting S3 Upload:");
    console.log("   Bucket Name:", process.env.AWS_S3_BUCKET_NAME || "❌ NOT SET");
    console.log("   AWS Region:", process.env.AWS_REGION || "❌ NOT SET");
    console.log("   S3 Key/Path:", s3Key);
    console.log("   File Name:", file.originalname);
    console.log("   File Type:", file.mimetype);
    console.log("   File Size:", file.size || "unknown", "bytes");
    console.log("   Folder:", folder);
    console.log("=========================================");
    
    cb(null, s3Key);
  },
  // ✅ Add metadata callback to log after upload
  metadata: (req, file, cb) => {
    cb(null, {
      fieldName: file.fieldname,
      originalName: file.originalname,
      uploadedAt: new Date().toISOString()
    });
  },
});

// ✅ Choose storage: S3 when AWS configured, else local
const storage = useS3Storage ? s3Storage : localStorage;

// ✅ Log which storage is being used
if (useS3Storage) {
  console.log("✅ Using S3 Storage - Files will be uploaded to bucket:", bucketName || "❌ BUCKET NAME NOT SET");
  if (!bucketName) {
    console.error("❌ ERROR: AWS_S3_BUCKET_NAME is not set in environment variables!");
  }
} else {
  console.log("✅ Using Local Storage - Files will be saved to local 'uploads' folder");
}

// ✅ Final multer setup
export const FileUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024,fieldSize: 10 * 1024 * 1024, // 10 MB max for field values (e.g., payloads)
    files: 20, }, // 20 MB max
  fileFilter: checkMimeType,
});

// ✅ Error wrapper middleware to catch S3 upload errors
export const catchUploadErrors = (err, req, res, next) => {
  if (err) {
    console.error("=========================================");
    console.error("❌ File Upload Error Caught:");
    console.error("   Error Type:", err.name || err.constructor.name);
    console.error("   Error Message:", err.message);
    console.error("   Bucket Name:", bucketName || "❌ NOT SET");
    
    if (err.code) {
      console.error("   Error Code:", err.code);
    }
    
    if (err.statusCode) {
      console.error("   Status Code:", err.statusCode);
    }
    
    // AWS S3 specific errors
    if (err.Code) {
      console.error("   AWS Error Code:", err.Code);
    }
    
    if (err.$metadata) {
      console.error("   HTTP Status:", err.$metadata.httpStatusCode);
      console.error("   Request ID:", err.$metadata.requestId);
    }
    
    console.error("   Stack:", err.stack);
    console.error("=========================================");
  }
  next(err);
};

// ✅ Memory storage for extract operations (needs buffer)
export const FileUploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: checkMimeType,
});

// ✅ Verify file exists in S3
const verifyS3Upload = async (key, bucket) => {
  try {
    const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
    await s3.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    console.error("   ⚠️ Error verifying S3 upload:", error.message);
    return null; // Unknown error
  }
};

// ✅ Middleware to log successful file uploads and catch errors
export const logFileUpload = async (req, res, next) => {
  try {
  // Log single file upload
  if (req.file) {
    if (useS3Storage) {
      if (req.file.location) {
        console.log("=========================================");
        console.log("✅ File upload response received from multer-s3:");
        console.log("   Bucket Name:", bucketName || "❌ NOT SET");
        console.log("   S3 Location:", req.file.location);
        console.log("   S3 Key:", req.file.key || "N/A");
        console.log("   S3 Bucket:", req.file.bucket || "N/A");
        console.log("   File Name:", req.file.originalname);
        console.log("   File Size:", req.file.size, "bytes");
        console.log("   File Type:", req.file.mimetype);
        console.log("   ETag:", req.file.etag || "N/A");
        
        // ✅ Verify the bucket name matches
        if (req.file.bucket && req.file.bucket !== bucketName) {
          console.error("   ⚠️ WARNING: File uploaded to different bucket!");
          console.error("      Expected:", bucketName);
          console.error("      Actual:", req.file.bucket);
        }
        
        // ✅ Verify file actually exists in S3
        const s3Key = req.file.key;
        const s3Bucket = req.file.bucket || bucketName;
        if (s3Key && s3Bucket) {
          console.log("   🔍 Verifying file exists in S3...");
          const exists = await verifyS3Upload(s3Key, s3Bucket);
          if (exists === true) {
            console.log("   ✅ VERIFIED: File exists in S3 bucket!");
          } else if (exists === false) {
            console.error("   ❌ VERIFICATION FAILED: File does NOT exist in S3!");
            console.error("      This means the upload appeared to succeed but the file is missing!");
            console.error("      Bucket:", s3Bucket);
            console.error("      Key:", s3Key);
          } else {
            console.error("   ⚠️ Could not verify file (permission issue?)");
          }
        } else {
          console.error("   ⚠️ Cannot verify: Missing S3 key or bucket");
        }
        
        console.log("=========================================");
      } else {
        console.error("=========================================");
        console.error("❌ S3 Upload Failed - No location returned!");
        console.error("   Bucket Name:", bucketName || "❌ NOT SET");
        console.error("   File Name:", req.file.originalname);
        console.error("   File Object:", JSON.stringify(req.file, null, 2));
        console.error("=========================================");
      }
    } else if (!useS3Storage && req.file.path) {
      console.log("=========================================");
      console.log("✅ File successfully saved locally:");
      console.log("   Local Path:", req.file.path);
      console.log("   File Name:", req.file.originalname);
      console.log("   File Size:", req.file.size, "bytes");
      console.log("=========================================");
    }
  }
  
  // Log multiple file uploads
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    console.log("=========================================");
    console.log(`📦 Processing ${req.files.length} file(s):`);
    req.files.forEach((file, index) => {
      if (useS3Storage) {
        if (file.location) {
          console.log(`   ✅ File ${index + 1} uploaded to S3:`);
          console.log("      Bucket Name:", bucketName || "❌ NOT SET");
          console.log("      S3 Location:", file.location);
          console.log("      S3 Key:", file.key || "N/A");
          console.log("      S3 Bucket:", file.bucket || "N/A");
          console.log("      File Name:", file.originalname);
          console.log("      File Size:", file.size, "bytes");
        } else {
          console.error(`   ❌ File ${index + 1} upload FAILED:`);
          console.error("      Bucket Name:", bucketName || "❌ NOT SET");
          console.error("      File Name:", file.originalname);
          console.error("      File Object:", JSON.stringify(file, null, 2));
        }
      } else if (!useS3Storage && file.path) {
        console.log(`   ✅ File ${index + 1} saved locally:`);
        console.log("      Local Path:", file.path);
        console.log("      File Name:", file.originalname);
        console.log("      File Size:", file.size, "bytes");
      }
    });
    console.log("=========================================");
  }
  
  next();
  } catch (error) {
    console.error("Error in logFileUpload middleware:", error);
    next(); // Continue even if logging fails
  }
};