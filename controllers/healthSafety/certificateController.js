import { Certificate } from "../../models/healthSafety/certificateModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Create Certificate
export const createCertificate = async (req, res) => {
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
      employee,
      employeeId,
      type,
      issueDate,
      expiryDate,
      status,
      issuingAuthority,
      certificateUrl,
      trainingId,
      notes,
      renewalRequired,
      renewalDate
    } = req.body;

    if (!employee || !type || !issueDate || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: employee, type, issueDate, and expiryDate are required."
      });
    }

    // Handle file upload
    let finalCertificateUrl = certificateUrl || '';
    if (req.file) {
      finalCertificateUrl = req.file.location || req.file.path; // S3 location or local path
    }

    // Generate certificate number before validation
    const year = new Date().getFullYear();
    let certificateNumber;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const count = await Certificate.countDocuments({
        certificateNumber: new RegExp(`^CERT-${year}-`)
      });
      certificateNumber = `CERT-${year}-${String(count + 1).padStart(4, '0')}`;
      
      // Check if this number already exists (race condition protection)
      const exists = await Certificate.findOne({ certificateNumber });
      if (!exists) {
        break;
      }
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate unique certificate number. Please try again."
      });
    }

    const payload = {
      certificateNumber,
      employee: employee.trim(),
      employeeId: employeeId || null,
      type: type.trim(),
      issueDate: new Date(issueDate),
      expiryDate: new Date(expiryDate),
      status: status || 'active',
      issuingAuthority: issuingAuthority || '',
      certificateUrl: finalCertificateUrl,
      trainingId: trainingId || null,
      notes: notes || '',
      renewalRequired: renewalRequired || false,
      renewalDate: renewalDate ? new Date(renewalDate) : null,
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    };

    const certificate = new Certificate(payload);
    await certificate.save();
    
    await certificate.populate('createdBy', 'name email');
    if (certificate.employeeId) {
      await certificate.populate('employeeId', 'name email');
    }
    if (certificate.trainingId) {
      await certificate.populate('trainingId', 'title trainingNumber');
    }

    res.status(201).json({
      success: true,
      message: "Certificate created successfully",
      data: certificate
    });
  } catch (err) {
    console.error('Create certificate error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create certificate"
    });
  }
};

// ✅ Get All Certificates
export const getCertificates = async (req, res) => {
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
        { certificateNumber: { $regex: search, $options: 'i' } },
        { employee: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } }
      ];
    }

    const certificates = await Certificate.find(query)
      .populate('createdBy', 'name email')
      .populate('employeeId', 'name email')
      .populate('trainingId', 'title trainingNumber')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: certificates
    });
  } catch (err) {
    console.error('Get certificates error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch certificates"
    });
  }
};

// ✅ Get Certificate By ID
export const getCertificateById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const certificate = await Certificate.findOne(query)
      .populate('createdBy', 'name email')
      .populate('employeeId', 'name email')
      .populate('trainingId', 'title trainingNumber')
      .lean();

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found"
      });
    }

    res.json({
      success: true,
      data: certificate
    });
  } catch (err) {
    console.error('Get certificate by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch certificate"
    });
  }
};

// ✅ Update Certificate
export const updateCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const certificate = await Certificate.findOne(query);
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found"
      });
    }

    const updateData = {};
    
    if (req.body.employee) updateData.employee = req.body.employee.trim();
    if (req.body.employeeId !== undefined) updateData.employeeId = req.body.employeeId || null;
    if (req.body.type) updateData.type = req.body.type.trim();
    if (req.body.issueDate) updateData.issueDate = new Date(req.body.issueDate);
    if (req.body.expiryDate) updateData.expiryDate = new Date(req.body.expiryDate);
    if (req.body.status) updateData.status = req.body.status;
    if (req.body.issuingAuthority !== undefined) updateData.issuingAuthority = req.body.issuingAuthority;
    if (req.body.certificateUrl !== undefined) updateData.certificateUrl = req.body.certificateUrl;
    if (req.body.trainingId !== undefined) updateData.trainingId = req.body.trainingId || null;
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;
    if (req.body.renewalRequired !== undefined) updateData.renewalRequired = req.body.renewalRequired;
    if (req.body.renewalDate !== undefined) updateData.renewalDate = req.body.renewalDate ? new Date(req.body.renewalDate) : null;

    Object.assign(certificate, updateData);
    await certificate.save();

    // Re-evaluate status based on expiry date
    if (req.body.expiryDate) {
      const today = new Date();
      const expiry = new Date(req.body.expiryDate);
      const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntilExpiry < 0) {
        certificate.status = 'expired';
      } else if (daysUntilExpiry <= 30) {
        certificate.status = 'expiring-soon';
      } else {
        certificate.status = 'active';
      }
      await certificate.save();
    }

    await certificate.populate('createdBy', 'name email');
    if (certificate.employeeId) {
      await certificate.populate('employeeId', 'name email');
    }
    if (certificate.trainingId) {
      await certificate.populate('trainingId', 'title trainingNumber');
    }

    res.json({
      success: true,
      message: "Certificate updated successfully",
      data: certificate
    });
  } catch (err) {
    console.error('Update certificate error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update certificate"
    });
  }
};

// ✅ Delete Certificate
export const deleteCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const certificate = await Certificate.findOneAndDelete(query);
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found"
      });
    }

    res.json({
      success: true,
      message: "Certificate deleted successfully"
    });
  } catch (err) {
    console.error('Delete certificate error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete certificate"
    });
  }
};

// ✅ Get Certificate Signed URL (for S3 files)
export const getCertificateSignedUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { disposition = 'inline' } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const certificate = await Certificate.findOne(query);
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found"
      });
    }

    if (!certificate.certificateUrl) {
      return res.status(404).json({
        success: false,
        message: "No file attached to this certificate"
      });
    }

    const fileUrl = certificate.certificateUrl;
    const isS3Url = fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.');

    if (isS3Url) {
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { getS3ClientForBucket } = await import("../../config/awsConfig.js");

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

        // Get S3 client with correct region for this bucket
        const s3Client = await getS3ClientForBucket(bucketName, fileUrl);

        const getContentType = (url) => {
          const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
          const typeMap = {
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
          };
          return typeMap[ext] || 'application/octet-stream';
        };

        const contentType = getContentType(fileUrl);
        const contentDisposition = disposition === 'attachment' 
          ? `attachment; filename="${encodeURIComponent('certificate')}"` 
          : 'inline';

        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentDisposition: contentDisposition,
          ResponseContentType: contentType,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

        res.json({
          success: true,
          url: signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('Error generating signed URL for certificate:', s3Error);
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
    console.error('Get certificate signed URL error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get certificate signed URL"
    });
  }
};

