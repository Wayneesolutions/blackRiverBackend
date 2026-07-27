import "dotenv/config";
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

const bucketName = process.env.AWS_S3_BUCKET_NAME;
const awsRegion = process.env.AWS_REGION; // Correct region for blackriverbucket
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

if (!bucketName) {
  console.error("❌ ERROR: AWS_S3_BUCKET_NAME environment variable is not set!");
  process.exit(1);
}

console.log("=========================================");
console.log("🔧 Configuring S3 Bucket CORS");
console.log("   Bucket:", bucketName);
console.log("   Region:", awsRegion || "NOT SET");
console.log("=========================================\n");

// Create S3 client using environment variables
const s3Client = new S3Client({
  region: awsRegion,
  credentials: {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  },
});

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
        // Example: ["http://localhost:5173", "https://yourdomain.com"]
      ],
      ExposeHeaders: [
        "ETag",
        "x-amz-server-side-encryption",
        "x-amz-request-id",
        "x-amz-id-2",
        "Content-Length",
        "Content-Type"
      ],
      MaxAgeSeconds: 3000
    }
  ]
};

async function configureCORS() {
  try {
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
    console.log("   After configuration, images should load without CORS errors");
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
    } else if (error.name === "NotFound" || error.Code === "NotFound") {
      console.error(`\n💡 Bucket '${bucketName}' not found or not accessible with current credentials`);
      console.error("   Make sure:");
      console.error("   1. The bucket name is correct");
      console.error("   2. Your AWS credentials have access to this bucket");
      console.error(`   3. The bucket exists in the '${awsRegion || "configured"}' region`);
    }
    
    console.error("=========================================");
    process.exit(1);
  }
}

// Run the configuration
configureCORS();

