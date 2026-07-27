import "dotenv/config";
import { S3Client, ListBucketsCommand, HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

console.log("=========================================");
console.log("🔍 S3 Configuration Diagnostic");
console.log("=========================================\n");

// Check environment variables
const envBucket = process.env.AWS_S3_BUCKET_NAME;
const envRegion = process.env.AWS_REGION;
const envAccessKey = process.env.AWS_ACCESS_KEY_ID;
const envSecretKey = process.env.AWS_SECRET_ACCESS_KEY;

console.log("📋 Environment Variables:");
console.log("   AWS_S3_BUCKET_NAME:", envBucket || "❌ NOT SET");
console.log("   AWS_REGION:", envRegion || "❌ NOT SET");
console.log("   AWS_ACCESS_KEY_ID:", envAccessKey ? `${envAccessKey.substring(0, 8)}...` : "❌ NOT SET");
console.log("   AWS_SECRET_ACCESS_KEY:", envSecretKey ? "✅ SET" : "❌ NOT SET");
console.log("");

// Create S3 client
if (!envAccessKey || !envSecretKey) {
  console.error("❌ Cannot proceed: AWS credentials are missing!");
  process.exit(1);
}

const s3Client = new S3Client({
  region: envRegion || "us-east-1",
  credentials: {
    accessKeyId: envAccessKey,
    secretAccessKey: envSecretKey,
  },
});

// Test 1: List all buckets accessible with these credentials
console.log("=========================================");
console.log("🔍 Test 1: Listing accessible buckets...");
console.log("=========================================");
try {
  const listBucketsCmd = new ListBucketsCommand({});
  const bucketsResponse = await s3Client.send(listBucketsCmd);
  
  if (bucketsResponse.Buckets && bucketsResponse.Buckets.length > 0) {
    console.log(`✅ Found ${bucketsResponse.Buckets.length} accessible bucket(s):`);
    bucketsResponse.Buckets.forEach((bucket, idx) => {
      const isConfigured = bucket.Name === envBucket;
      console.log(`   ${idx + 1}. ${bucket.Name} ${isConfigured ? "✅ (CONFIGURED)" : ""}`);
      if (bucket.CreationDate) {
        console.log(`      Created: ${bucket.CreationDate.toISOString()}`);
      }
    });
    
    // Check if configured bucket is in the list
    if (envBucket) {
      const found = bucketsResponse.Buckets.find(b => b.Name === envBucket);
      if (!found) {
        console.error(`\n❌ WARNING: Configured bucket "${envBucket}" is NOT in the list of accessible buckets!`);
        console.error("   This means your credentials don't have access to this bucket.");
      }
    }
  } else {
    console.log("⚠️  No buckets found (may be a permission issue)");
  }
} catch (error) {
  console.error("❌ Error listing buckets:", error.message);
  console.error("   Code:", error.Code || error.name);
}

console.log("");

// Test 2: Check configured bucket
if (envBucket) {
  console.log("=========================================");
  console.log(`🔍 Test 2: Checking configured bucket "${envBucket}"...`);
  console.log("=========================================");
  
  // Try different regions
  const regionsToTest = [
    envRegion || "us-east-1",
  ];
  
  for (const region of [...new Set(regionsToTest)]) {
    try {
      const testClient = new S3Client({
        region: region,
        credentials: {
          accessKeyId: envAccessKey,
          secretAccessKey: envSecretKey,
        },
      });
      
      const headCmd = new HeadBucketCommand({ Bucket: envBucket });
      await testClient.send(headCmd);
      console.log(`✅ Bucket "${envBucket}" exists in region "${region}"`);
      
      // List objects
      try {
        const listCmd = new ListObjectsV2Command({ Bucket: envBucket, MaxKeys: 5 });
        const listResponse = await testClient.send(listCmd);
        const count = listResponse.KeyCount || 0;
        console.log(`   📦 Objects in bucket: ${count}`);
        if (count > 0 && listResponse.Contents) {
          console.log("   Sample objects:");
          listResponse.Contents.slice(0, 3).forEach((obj, idx) => {
            console.log(`      ${idx + 1}. ${obj.Key} (${obj.Size} bytes)`);
          });
        }
      } catch (listError) {
        console.error(`   ⚠️  Cannot list objects: ${listError.message}`);
      }
      
      break; // Found the correct region
    } catch (error) {
      if (error.name === "NotFound" || error.Code === "NotFound") {
        // Bucket doesn't exist in this region, try next
        continue;
      } else if (error.name === "Forbidden" || error.$metadata?.httpStatusCode === 403) {
        console.error(`   ❌ Access denied to bucket "${envBucket}" in region "${region}"`);
        console.error("      Check IAM permissions for your AWS credentials");
        break;
      } else {
        // Other error, log and continue
        continue;
      }
    }
  }
}

console.log("");

  // Test 3: Check configured bucket in different regions (if needed)
if (envBucket) {
  console.log("=========================================");
  console.log(`🔍 Test 3: Checking '${envBucket}' in alternative regions...`);
  console.log("=========================================");
  const alternativeRegions = ["ap-south-1", "us-west-2", "eu-west-1"];
  
  for (const region of alternativeRegions) {
    // Skip if it's the same as configured region
    if (region === envRegion) continue;
    
    try {
      const testClient = new S3Client({
        region: region,
        credentials: {
          accessKeyId: envAccessKey,
          secretAccessKey: envSecretKey,
        },
      });
      
      const headCmd = new HeadBucketCommand({ Bucket: envBucket });
      await testClient.send(headCmd);
      console.log(`✅ Bucket "${envBucket}" also exists in region "${region}"`);
      
      // List objects
      try {
        const listCmd = new ListObjectsV2Command({ Bucket: envBucket, MaxKeys: 10 });
        const listResponse = await testClient.send(listCmd);
        const count = listResponse.KeyCount || 0;
        console.log(`   📦 Objects in bucket: ${count}`);
        if (count > 0 && listResponse.Contents) {
          console.log("   Sample objects:");
          listResponse.Contents.slice(0, 5).forEach((obj, idx) => {
            console.log(`      ${idx + 1}. ${obj.Key} (${obj.Size} bytes, modified: ${obj.LastModified?.toISOString()})`);
          });
        }
      } catch (listError) {
        console.error(`   ⚠️  Cannot list objects: ${listError.message}`);
      }
      
      break;
    } catch (error) {
      if (error.name === "NotFound" || error.Code === "NotFound") {
        continue;
      } else if (error.name === "Forbidden" || error.$metadata?.httpStatusCode === 403) {
        console.error(`   ❌ Access denied to "${envBucket}" in region "${region}"`);
        break;
      }
    }
  }
}

console.log("");
console.log("=========================================");
console.log("📝 Summary & Recommendations:");
console.log("=========================================");
console.log(`1. Your configured bucket: ${envBucket || "NOT SET"} in ${envRegion || "NOT SET"}`);
console.log("");
console.log("💡 Action Items:");
if (!envBucket) {
  console.log("   - Set AWS_S3_BUCKET_NAME in your .env file");
}
if (!envRegion) {
  console.log("   - Set AWS_REGION in your .env file");
}
if (envBucket && envRegion) {
  console.log(`   - Your configuration looks good: ${envBucket} in ${envRegion}`);
}
console.log("");
console.log("   - Make sure your AWS credentials have:");
console.log("     * s3:PutObject permission");
console.log("     * s3:GetObject permission");
console.log("     * s3:ListBucket permission");
console.log("=========================================");

