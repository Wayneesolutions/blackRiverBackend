// controllers/companySettingsController.ts
import { CompanySettings } from "../../models/driver/companysettingsModel.js";
import { User } from "../../models/driver/userModel.js";
// Create or Update Company Settings (Basic Info Only)
export const upsertCompanySettings = async (req, res) => {
  try {
    const { companyCode, ...data } = req.body;
    const adminId = req.user._id;
    
    // Remove API config fields from basic company settings update
    delete data.samsaraConfig;
    delete data.thermokingConfig;

    // ✅ Handle profile image upload
    let logoUrl = null;
    if (req.file) {
      if (process.env.NODE_ENV === "production") {
        // From AWS S3 (multer-s3 gives location property)
        logoUrl = req.file.location;
      } else {
        // From local storage
        logoUrl = `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, '/')}`;
      }
    }

    if (logoUrl) data.logoUrl = logoUrl;

    // ✅ Upsert company settings
    const settings = await CompanySettings.findOneAndUpdate(
      { companyCode },
      { $set: data },
      { new: true, upsert: true }
    );
    
    // ✅ Update admin's company reference using updateOne to avoid full document validation
    await User.updateOne(
      { _id: adminId },
      { $set: { company: settings._id } }
    );
    
    // ✅ Generate signed URL for logo if it's an S3 URL
    let settingsData = settings.toObject ? settings.toObject() : { ...settings };
    
    if (settingsData.logoUrl) {
      const logoUrl = settingsData.logoUrl;
      const isS3Url = logoUrl.includes('s3.amazonaws.com') || logoUrl.includes('.s3.');
      
      if (isS3Url) {
        try {
          const { getS3ClientForBucket } = await import("../../config/awsConfig.js");
          const { GetObjectCommand } = await import("@aws-sdk/client-s3");
          const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
          
          // Parse S3 URL to get bucket and key
          const cleanUrl = logoUrl.split('?')[0].split('#')[0];
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
          
          if (key.includes('?')) key = key.split('?')[0];
          if (key.includes('&')) key = key.split('&')[0];
          
          // Get the correct S3 client for the bucket
          const s3Client = await getS3ClientForBucket(bucketName, logoUrl);
          
          if (!s3Client) {
            throw new Error('Failed to create S3 client');
          }
          
          // Determine content type based on file extension
          const getContentType = (fileUrl) => {
            const ext = fileUrl.split('.').pop()?.toLowerCase();
            const mimeMap = {
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'png': 'image/png',
              'gif': 'image/gif',
              'webp': 'image/webp',
              'svg': 'image/svg+xml'
            };
            return mimeMap[ext] || 'image/jpeg';
          };
          
          const contentType = getContentType(logoUrl);
          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
            ResponseContentType: contentType
          });
          
          const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          settingsData.logoUrl = signedUrl;
          
          console.log('✅ Generated signed URL for company logo');
        } catch (s3Error) {
          console.error('❌ Error generating signed URL for company logo:', s3Error);
          // Keep original URL if signing fails
        }
      }
    }
    
    res.json({ success: true, data: settingsData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// Get Company Settings
export const getCompanySettings = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Get the user
    const user = await User.findById(userId).populate("company"); // populate company

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.company) {
      return res.status(404).json({ success: false, message: "Company not linked. Please create one." });
    }

    // 2. Generate signed URL for logo if it's an S3 URL
    let companyData = user.company.toObject ? user.company.toObject() : { ...user.company };
    
    if (companyData.logoUrl) {
      const logoUrl = companyData.logoUrl;
      const isS3Url = logoUrl.includes('s3.amazonaws.com') || logoUrl.includes('.s3.');
      
      if (isS3Url) {
        try {
          const { getS3ClientForBucket } = await import("../../config/awsConfig.js");
          const { GetObjectCommand } = await import("@aws-sdk/client-s3");
          const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
          
          // Parse S3 URL to get bucket and key
          const cleanUrl = logoUrl.split('?')[0].split('#')[0];
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
          
          if (key.includes('?')) key = key.split('?')[0];
          if (key.includes('&')) key = key.split('&')[0];
          
          // Get the correct S3 client for the bucket
          const s3Client = await getS3ClientForBucket(bucketName, logoUrl);
          
          if (!s3Client) {
            throw new Error('Failed to create S3 client');
          }
          
          // Determine content type based on file extension
          const getContentType = (fileUrl) => {
            const ext = fileUrl.split('.').pop()?.toLowerCase();
            const mimeMap = {
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'png': 'image/png',
              'gif': 'image/gif',
              'webp': 'image/webp',
              'svg': 'image/svg+xml'
            };
            return mimeMap[ext] || 'image/jpeg';
          };
          
          const contentType = getContentType(logoUrl);
          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
            ResponseContentType: contentType
          });
          
          const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          companyData.logoUrl = signedUrl;
          
          console.log('✅ Generated signed URL for company logo');
        } catch (s3Error) {
          console.error('❌ Error generating signed URL for company logo:', s3Error);
          // Keep original URL if signing fails
        }
      }
    }

    // 3. Return company settings with signed logo URL
    res.json({ success: true, data: companyData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update API Credentials (Separate endpoint)
export const updateApiCredentials = async (req, res) => {
  try {
    const adminId = req.user._id;
    
    // ✅ Check if user has company - required for API configuration updates
    const user = await User.findById(adminId);
    if (!user || !user.company) {
      return res.status(400).json({ 
        success: false, 
        message: "Company settings must be created first before updating API configurations. Please complete company setup." 
      });
    }
    
    const { samsaraConfig, thermokingConfig } = req.body;
    
    // ✅ Parse JSON fields if they come as strings
    let parsedSamsaraConfig = samsaraConfig;
    if (samsaraConfig && typeof samsaraConfig === "string") {
      try {
        parsedSamsaraConfig = JSON.parse(samsaraConfig);
      } catch (e) {
        return res.status(400).json({ success: false, message: "Invalid JSON for samsaraConfig" });
      }
    }
    
    let parsedThermokingConfig = thermokingConfig;
    if (thermokingConfig && typeof thermokingConfig === "string") {
      try {
        parsedThermokingConfig = JSON.parse(thermokingConfig);
      } catch (e) {
        return res.status(400).json({ success: false, message: "Invalid JSON for thermokingConfig" });
      }
    }
    
    // Build update object
    const updateData = {};
    if (parsedSamsaraConfig) {
      updateData.samsaraConfig = parsedSamsaraConfig;
    }
    if (parsedThermokingConfig) {
      updateData.thermokingConfig = parsedThermokingConfig;
    }
    
    // Update company settings with API credentials
    const settings = await CompanySettings.findByIdAndUpdate(
      user.company,
      { $set: updateData },
      { new: true }
    );
    
    if (!settings) {
      return res.status(404).json({ 
        success: false, 
        message: "Company settings not found" 
      });
    }
    
    res.json({ 
      success: true, 
      message: "API credentials updated successfully",
      data: {
        samsaraConfig: settings.samsaraConfig,
        thermokingConfig: settings.thermokingConfig
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update Maintenance Policy
export const updateMaintenancePolicy = async (req, res) => {
  try {
    const adminId = req.user._id;
    
    // ✅ Check if user has company - required for maintenance policy updates
    const user = await User.findById(adminId);
    if (!user || !user.company) {
      return res.status(400).json({ 
        success: false, 
        message: "Company settings must be created first before updating maintenance policies. Please complete company setup." 
      });
    }
    
    const { maintenancePolicies } = req.body;
    
    // ✅ Validate maintenance policies structure
    if (!maintenancePolicies) {
      return res.status(400).json({ 
        success: false, 
        message: "Maintenance policies data is required" 
      });
    }
    
    // ✅ Parse JSON fields if they come as strings
    let parsedMaintenancePolicies = maintenancePolicies;
    if (maintenancePolicies && typeof maintenancePolicies === "string") {
      try {
        parsedMaintenancePolicies = JSON.parse(maintenancePolicies);
      } catch (e) {
        return res.status(400).json({ success: false, message: "Invalid JSON for maintenancePolicies" });
      }
    }
    
    // ✅ Validate custom service structure with detailed error messages
    const validateCustomService = (service, index) => {
      if (!service) {
        return { valid: false, error: `Service at index ${index} is null or undefined` };
      }
      if (!service.name || typeof service.name !== 'string' || service.name.trim() === '') {
        return { valid: false, error: `Service at index ${index} has invalid or empty name` };
      }
      if (!service.truck) {
        return { valid: false, error: `Service "${service.name}" (index ${index}) is missing truck configuration` };
      }
      if (typeof service.truck.value !== 'number' || service.truck.value <= 0) {
        return { valid: false, error: `Service "${service.name}" (index ${index}) has invalid truck value (must be a number > 0)` };
      }
      if (!service.truck.unit || !['days', 'miles', 'km'].includes(service.truck.unit)) {
        return { valid: false, error: `Service "${service.name}" (index ${index}) has invalid truck unit (must be days, miles, or km)` };
      }
      if (!service.trailer) {
        return { valid: false, error: `Service "${service.name}" (index ${index}) is missing trailer configuration` };
      }
      if (typeof service.trailer.value !== 'number' || service.trailer.value <= 0) {
        return { valid: false, error: `Service "${service.name}" (index ${index}) has invalid trailer value (must be a number > 0)` };
      }
      if (!service.trailer.unit || !['days', 'miles', 'km'].includes(service.trailer.unit)) {
        return { valid: false, error: `Service "${service.name}" (index ${index}) has invalid trailer unit (must be days, miles, or km)` };
      }
      // Validate excludeTypes if provided
      if (service.excludeTypes && Array.isArray(service.excludeTypes)) {
        const validTypes = ['reefer', 'dryvan', 'flatbed'];
        for (const type of service.excludeTypes) {
          if (!validTypes.includes(type)) {
            return { valid: false, error: `Service "${service.name}" (index ${index}) has invalid excludeType: ${type} (must be reefer, dryvan, or flatbed)` };
          }
        }
      }
      return { valid: true };
    };
    
    // ✅ Validate customServices array
    if (!parsedMaintenancePolicies.customServices) {
      parsedMaintenancePolicies.customServices = [];
    }
    
    if (!Array.isArray(parsedMaintenancePolicies.customServices)) {
      return res.status(400).json({ 
        success: false, 
        message: "customServices must be an array" 
      });
    }
    
    // ✅ Validate each custom service
    for (let i = 0; i < parsedMaintenancePolicies.customServices.length; i++) {
      const service = parsedMaintenancePolicies.customServices[i];
      const validation = validateCustomService(service, i);
      if (!validation.valid) {
        return res.status(400).json({ 
          success: false, 
          message: validation.error || `Invalid custom service at index ${i}. Required: name (string), truck/trailer with value (number > 0) and unit (days/miles/km)` 
        });
      }
      
      // ✅ Ensure excludeTypes is an array if provided and validate values
      if (service.excludeTypes) {
        if (!Array.isArray(service.excludeTypes)) {
          service.excludeTypes = [];
        } else {
          // Filter to only valid trailer types
          const validTypes = ['reefer', 'dryvan', 'flatbed'];
          service.excludeTypes = service.excludeTypes.filter(type => validTypes.includes(type));
        }
      }
    }
    
    // Update company settings with maintenance policies
    const settings = await CompanySettings.findByIdAndUpdate(
      user.company,
      { $set: { maintenancePolicies: parsedMaintenancePolicies } },
      { new: true }
    );
    
    if (!settings) {
      return res.status(404).json({ 
        success: false, 
        message: "Company settings not found" 
      });
    }
    
    res.json({ 
      success: true, 
      message: "Maintenance policy updated successfully",
      data: {
        maintenancePolicies: settings.maintenancePolicies
      }
    });
  } catch (err) {
    console.error('Error updating maintenance policy:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};