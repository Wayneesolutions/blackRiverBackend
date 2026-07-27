import { S3Client, HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import "dotenv/config";

// ✅ Log AWS Configuration
const awsRegion = process.env.AWS_REGION;
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucketName = process.env.AWS_S3_BUCKET_NAME;

// ✅ Helper function to extract region from S3 URL
export const extractRegionFromS3Url = (url) => {
  try {
    const cleanUrl = url.split('?')[0].split('#')[0];
    const urlObj = new URL(cleanUrl);
    
    // Format: bucket.s3.region.amazonaws.com
    if (urlObj.hostname.includes('.s3.')) {
      const parts = urlObj.hostname.split('.s3.');
      if (parts.length === 2) {
        const regionPart = parts[1].split('.')[0];
        // Validate it looks like a region (e.g., us-east-1)
        if (regionPart && /^[a-z]+-[a-z]+-\d+$/.test(regionPart)) {
          return regionPart;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting region from S3 URL:', error);
    return null;
  }
};

// ✅ Helper function to create S3 client with specific region
export const createS3ClientForRegion = (region) => {
  if (!region) {
    region = awsRegion || process.env.AWS_REGION || 'us-east-1';
  }
  
  return new S3Client({
    region: region,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  });
};

// ✅ Helper function to get S3 client for a specific bucket (with correct region)
export const getS3ClientForBucket = async (bucketName, url = null) => {
  // Try to extract region from URL if provided
  if (url) {
    const extractedRegion = extractRegionFromS3Url(url);
    if (extractedRegion) {
      console.log(`📍 Using region from URL: ${extractedRegion} for bucket: ${bucketName}`);
      return createS3ClientForRegion(extractedRegion);
    }
  }
  
  // Check if bucket matches the configured bucket name - use configured region
  if (bucketName === process.env.AWS_S3_BUCKET_NAME && awsRegion) {
    console.log(`📍 Using configured region: ${awsRegion} for bucket: ${bucketName}`);
    return createS3ClientForRegion(awsRegion);
  }
  
  // Fallback to default region from environment
  const defaultRegion = awsRegion || process.env.AWS_REGION || 'us-east-1';
  console.log(`📍 Using default region: ${defaultRegion} for bucket: ${bucketName}`);
  return createS3ClientForRegion(defaultRegion);
};

console.log("=========================================");
console.log("🔧 AWS S3 Client Configuration:");
console.log("   Region:", awsRegion || "❌ NOT SET");
console.log("   Bucket Name:", bucketName || "❌ NOT SET");
console.log("   Access Key ID:", awsAccessKeyId ? `${awsAccessKeyId.substring(0, 4)}...${awsAccessKeyId.substring(awsAccessKeyId.length - 4)}` : "❌ NOT SET");
console.log("   Secret Access Key:", awsSecretAccessKey ? "✅ SET" : "❌ NOT SET");
console.log("=========================================");

// ✅ Create AWS S3 client
export const s3 = new S3Client({
  region: awsRegion, // e.g. "us-east-1"
  credentials: {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  },
});

// ✅ Test S3 connectivity and bucket access
export const testS3Connection = async () => {
  if (!bucketName) {
    console.error("❌ Cannot test S3 connection: AWS_S3_BUCKET_NAME is not set");
    return false;
  }

  try {
    console.log("=========================================");
    console.log("🔍 Testing S3 Connection...");
    console.log("   Bucket:", bucketName);
    console.log("   Region:", awsRegion);
    
    // Test 1: Check if bucket exists and is accessible
    const headCommand = new HeadBucketCommand({ Bucket: bucketName });
    await s3.send(headCommand);
    console.log("   ✅ Bucket exists and is accessible");
    
    // Test 2: List objects in bucket (to verify permissions)
    try {
      const listCommand = new ListObjectsV2Command({ 
        Bucket: bucketName,
        MaxKeys: 5 
      });
      const listResponse = await s3.send(listCommand);
      const objectCount = listResponse.KeyCount || 0;
      console.log(`   ✅ Can list objects (found ${objectCount} object(s))`);
      
      if (objectCount > 0 && listResponse.Contents) {
        console.log("   📋 Sample objects in bucket:");
        listResponse.Contents.slice(0, 3).forEach((obj, idx) => {
          console.log(`      ${idx + 1}. ${obj.Key} (${obj.Size} bytes)`);
        });
      } else {
        console.log("   ℹ️  Bucket is empty (no objects found)");
      }
    } catch (listError) {
      console.error("   ⚠️  Cannot list objects (may be permission issue):", listError.message);
    }
    
    console.log("=========================================");
    return true;
  } catch (error) {
    console.error("=========================================");
    console.error("❌ S3 Connection Test FAILED:");
    console.error("   Error:", error.name);
    console.error("   Message:", error.message);
    console.error("   Code:", error.Code || error.$metadata?.httpStatusCode);
    
    if (error.name === "NotFound" || error.Code === "NotFound") {
      console.error("   💡 The bucket does not exist or is in a different region");
    } else if (error.name === "Forbidden" || error.Code === "Forbidden" || error.$metadata?.httpStatusCode === 403) {
      console.error("   💡 Access denied - check IAM permissions for the AWS credentials");
    } else if (error.name === "InvalidAccessKeyId" || error.Code === "InvalidAccessKeyId") {
      console.error("   💡 Invalid AWS Access Key ID");
    } else if (error.name === "SignatureDoesNotMatch" || error.Code === "SignatureDoesNotMatch") {
      console.error("   💡 Invalid AWS Secret Access Key");
    }
    
    console.error("=========================================");
    return false;
  }
};

// ✅ Auto-test connection on module load (only in production)
if (process.env.NODE_ENV === "production" && bucketName) {
  // Run test asynchronously after a short delay to not block startup
  setTimeout(() => {
    testS3Connection().catch(err => {
      console.error("Error during S3 connection test:", err);
    });
  }, 2000);
}
