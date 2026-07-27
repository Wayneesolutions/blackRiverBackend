import { Training } from "../../models/healthSafety/trainingModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Create Training
export const createTraining = async (req, res) => {
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
      type,
      date,
      expiryDate,
      status,
      instructor,
      location,
      description,
      duration,
      participants
    } = req.body;

    if (!title || !type || !date || !instructor) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: title, type, date, and instructor are required."
      });
    }

    // Handle file upload
    let materials = [];
    if (req.files && req.files.materialFile) {
      const file = Array.isArray(req.files.materialFile) ? req.files.materialFile[0] : req.files.materialFile;
      const fileUrl = file.location || file.path; // S3 location or local path
      materials.push({
        fileName: file.originalname,
        fileUrl: fileUrl,
        fileType: file.mimetype || 'application/octet-stream'
      });
    }

    // Generate training number before validation
    const year = new Date().getFullYear();
    let trainingNumber;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const count = await Training.countDocuments({
        trainingNumber: new RegExp(`^TRN-${year}-`)
      });
      trainingNumber = `TRN-${year}-${String(count + 1).padStart(4, '0')}`;
      
      // Check if this number already exists (race condition protection)
      const exists = await Training.findOne({ trainingNumber });
      if (!exists) {
        break;
      }
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate unique training number. Please try again."
      });
    }

    const payload = {
      trainingNumber,
      title: title.trim(),
      type: type.trim(),
      date: new Date(date),
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      status: status || 'scheduled',
      instructor: instructor.trim(),
      location: location || '',
      description: description || '',
      duration: duration || null,
      participants: participants || [],
      materials: materials.length > 0 ? materials : [],
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    };

    const training = new Training(payload);
    await training.save();
    
    await training.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: "Training created successfully",
      data: training
    });
  } catch (err) {
    console.error('Create training error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create training"
    });
  }
};

// ✅ Get All Trainings
export const getTrainings = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { status, type, search } = req.query;
    const query = {};

    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (type && type !== 'all') {
      query.type = { $regex: type, $options: 'i' };
    }

    if (search) {
      query.$or = [
        { trainingNumber: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } },
        { instructor: { $regex: search, $options: 'i' } }
      ];
    }

    const trainings = await Training.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Add participants count to each training for frontend display
    const trainingsWithCounts = trainings.map(training => ({
      ...training,
      participants: Array.isArray(training.participants) ? training.participants.length : 0
    }));

    res.json({
      success: true,
      data: trainingsWithCounts
    });
  } catch (err) {
    console.error('Get trainings error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch trainings"
    });
  }
};

// ✅ Get Training By ID
export const getTrainingById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const training = await Training.findOne(query)
      .populate('createdBy', 'name email')
      .populate('participants.employeeId', 'name email')
      .lean();

    if (!training) {
      return res.status(404).json({
        success: false,
        message: "Training not found"
      });
    }

    // Add participants count for frontend display
    training.participants = Array.isArray(training.participants) ? training.participants.length : 0;

    res.json({
      success: true,
      data: training
    });
  } catch (err) {
    console.error('Get training by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch training"
    });
  }
};

// ✅ Update Training
export const updateTraining = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const training = await Training.findOne(query);
    if (!training) {
      return res.status(404).json({
        success: false,
        message: "Training not found"
      });
    }

    const updateData = {};
    
    if (req.body.title) updateData.title = req.body.title.trim();
    if (req.body.type) updateData.type = req.body.type.trim();
    if (req.body.date) updateData.date = new Date(req.body.date);
    if (req.body.expiryDate !== undefined) updateData.expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
    if (req.body.status) updateData.status = req.body.status;
    if (req.body.instructor) updateData.instructor = req.body.instructor.trim();
    if (req.body.location !== undefined) updateData.location = req.body.location;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.duration !== undefined) updateData.duration = req.body.duration;
    if (req.body.participants && Array.isArray(req.body.participants)) updateData.participants = req.body.participants;

    Object.assign(training, updateData);
    await training.save();

    await training.populate('createdBy', 'name email');

    res.json({
      success: true,
      message: "Training updated successfully",
      data: training
    });
  } catch (err) {
    console.error('Update training error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update training"
    });
  }
};

// ✅ Delete Training
export const deleteTraining = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const training = await Training.findOneAndDelete(query);
    if (!training) {
      return res.status(404).json({
        success: false,
        message: "Training not found"
      });
    }

    res.json({
      success: true,
      message: "Training deleted successfully"
    });
  } catch (err) {
    console.error('Delete training error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete training"
    });
  }
};

// ✅ Get Training Material Signed URL (for S3 files)
export const getTrainingMaterialSignedUrl = async (req, res) => {
  try {
    const { id, materialIndex } = req.params;
    const { disposition = 'inline' } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const training = await Training.findOne(query);
    if (!training) {
      return res.status(404).json({
        success: false,
        message: "Training not found"
      });
    }

    if (!training.materials || !Array.isArray(training.materials) || training.materials.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No materials attached to this training"
      });
    }

    const materialIndexNum = parseInt(materialIndex) || 0;
    const material = training.materials[materialIndexNum];
    
    if (!material || !material.fileUrl) {
      return res.status(404).json({
        success: false,
        message: "Material not found"
      });
    }

    const fileUrl = material.fileUrl;
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
            'mp4': 'video/mp4',
            'avi': 'video/x-msvideo',
            'mov': 'video/quicktime',
            'zip': 'application/zip',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
          };
          return typeMap[ext] || 'application/octet-stream';
        };

        const contentType = getContentType(fileUrl, material.fileType);
        const contentDisposition = disposition === 'attachment' 
          ? `attachment; filename="${encodeURIComponent(material.fileName || 'training-material')}"` 
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
          url: signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('Error generating signed URL for training material:', s3Error);
        res.json({
          success: true,
          url: fileUrl,
          expiresIn: 0
        });
      }
    } else {
      res.json({
        success: true,
        url: fileUrl,
        expiresIn: 0
      });
    }
  } catch (err) {
    console.error('Get training material signed URL error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get training material signed URL"
    });
  }
};

