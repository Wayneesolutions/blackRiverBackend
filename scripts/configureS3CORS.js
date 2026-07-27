import "dotenv/config";
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { getS3ClientForBucket } from "../config/awsConfig.js";

const bucketName = process.env.AWS_S3_BUCKET_NAME;

if (!bucketName) {
  console.error("❌ ERROR: AWS_S3_BUCKET_NAME environment variable is not set!");
  console.error("   Please set AWS_S3_BUCKET_NAME in your .env file");
  process.exit(1);
}

console.log("=========================================");
console.log("🔧 Configuring S3 Bucket CORS");
console.log("   Bucket:", bucketName);
console.log("=========================================\n");

// CORS configuration for S3 bucket
const corsConfiguration = {
  CORSRules: [
    {
      AllowedHeaders: [
        "*"
      ],
      AllowedMethods: [
        "GET",
        "HEAD",
        "PUT",
        "POST",
        "DELETE"
      ],
      AllowedOrigins: [
        "*" // Allow all origins - you can restrict this to specific domains in production
        // Example: ["https://yourdomain.com", "https://www.yourdomain.com"]
      ],
      ExposeHeaders: [
        "ETag",
        "x-amz-server-side-encryption",
        "x-amz-request-id",
        "x-amz-id-2"
      ],
      MaxAgeSeconds: 3000
    }
  ]
};

async function configureCORS() {
  try {
    // Get S3 client for the bucket
    const s3Client = await getS3ClientForBucket(bucketName);
    
    // Check current CORS configuration
    try {
      const getCorsCommand = new GetBucketCorsCommand({ Bucket: bucketName });
      const currentCors = await s3Client.send(getCorsCommand);
      console.log("📋 Current CORS Configuration:");
      console.log(JSON.stringify(currentCors.CORSRules, null, 2));
      console.log("");
    } catch (error) {
      if (error.name === 'NoSuchCORSConfiguration') {
        console.log("ℹ️  No existing CORS configuration found\n");
      } else {
        console.error("⚠️  Error reading CORS configuration:", error.message);
      }
    }
    
    // Apply new CORS configuration
    console.log("🔄 Applying CORS configuration...");
    const putCorsCommand = new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: corsConfiguration
    });
    
    await s3Client.send(putCorsCommand);
    console.log("✅ CORS configuration applied successfully!");
    console.log("");
    console.log("📋 Applied Configuration:");
    console.log(JSON.stringify(corsConfiguration, null, 2));
    console.log("");
    console.log("💡 Note: CORS changes may take a few minutes to propagate");
    console.log("=========================================");
    
  } catch (error) {
    console.error("=========================================");
    console.error("❌ Error configuring CORS:");
    console.error("   Error:", error.name);
    console.error("   Message:", error.message);
    console.error("   Code:", error.Code || error.$metadata?.httpStatusCode);
    
    if (error.name === "AccessDenied" || error.$metadata?.httpStatusCode === 403) {
      console.error("\n💡 Access denied - your AWS credentials need 's3:PutBucketCors' permission");
      console.error("   Add this IAM policy to your AWS user/role:");
      console.error("   {");
      console.error('     "Effect": "Allow",');
      console.error('     "Action": [');
      console.error('       "s3:PutBucketCors",');
      console.error('       "s3:GetBucketCors"');
      console.error('     ],');
      console.error(`     "Resource": "arn:aws:s3:::${bucketName}"`);
      console.error("   }");
    }
    
    console.error("=========================================");
    process.exit(1);
  }
}

// Run the configuration
configureCORS();

