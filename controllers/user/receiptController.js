// controllers/receiptController.js
import { Receipt } from "../../models/hr/receiptModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../../config/awsConfig.js";

// ✅ Create Receipt
export const createReceipt = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first before creating receipts."
      });
    }

    const { date, amount, payeeVendor, expenseType, description } = req.body;

    if (!amount || !payeeVendor || !date) {
      return res.status(400).json({
        success: false,
        message: "Date, amount, and payee/vendor are required."
      });
    }

    let fileUrl = null;
    let fileName = null;
    let fileType = null;
    let fileSize = null;

    if (req.file) {
      if (process.env.NODE_ENV === "production") {
        fileUrl = req.file.location;
      } else {
        fileUrl = `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, '/')}`;
      }
      fileName = req.file.originalname;
      fileType = req.file.mimetype?.split('/')[1]?.toUpperCase() || fileName.split('.').pop()?.toUpperCase();
      fileSize = req.file.size || 0;
    } else {
      return res.status(400).json({
        success: false,
        message: "Receipt file is required."
      });
    }

    const payload = {
      date: new Date(date),
      amount: Number(amount),
      payeeVendor: payeeVendor.trim(),
      expenseType: expenseType || 'Other',
      fileName,
      fileUrl,
      fileType,
      fileSize,
      description: description?.trim() || '',
      uploadedBy: req.user._id,
      company: isSuperadmin ? req.body.company || null : companyId
    };

    const receipt = new Receipt(payload);
    await receipt.save();
    
    await receipt.populate('uploadedBy', 'name email');
    
    res.json({ 
      success: true, 
      message: "Receipt created successfully", 
      data: receipt 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Get Receipts
export const getReceipts = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { search, expenseType } = req.query;

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    // Filter by expense type if provided
    if (expenseType && expenseType !== 'All') {
      query.expenseType = expenseType;
    }

    // Search filter
    if (search) {
      query.$or = [
        { payeeVendor: { $regex: search, $options: 'i' } },
        { fileName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const receipts = await Receipt.find(query)
      .populate('uploadedBy', 'name email')
      .sort({ date: -1, createdAt: -1 });

    res.json({ 
      success: true, 
      message: 'Receipts fetched successfully', 
      data: receipts 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Get Receipt Stats
export const getReceiptStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        data: {
          totalReceipts: 0,
          totalAmount: 0,
          thisWeekCount: 0,
          pendingReviews: 0
        }
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    // Calculate total receipts
    const totalReceipts = await Receipt.countDocuments(query);

    // Calculate total amount (all receipts)
    const amountResult = await Receipt.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalAmount = amountResult[0]?.total || 0;

    // Calculate this week's count (last 7 days from today)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);
    const thisWeekQuery = { ...query, createdAt: { $gte: oneWeekAgo } };
    const thisWeekCount = await Receipt.countDocuments(thisWeekQuery);

    // Calculate total amount for last 7 days
    const lastWeekAmountResult = await Receipt.aggregate([
      { $match: thisWeekQuery },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const lastWeekAmount = lastWeekAmountResult[0]?.total || 0;

    // For now, pending reviews is 0 (can be enhanced later)
    const pendingReviews = 0;

    res.json({
      success: true,
      data: {
        totalReceipts,
        totalAmount: lastWeekAmount, // Show last 7 days amount for "Last 7 days" label
        thisWeekCount,
        pendingReviews
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Update Receipt
export const updateReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    let updateData = { ...req.body };

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    // Handle file update if a new file is uploaded
    if (req.file) {
      if (process.env.NODE_ENV === "production") {
        updateData.fileUrl = req.file.location;
      } else {
        updateData.fileUrl = `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, '/')}`;
      }
      updateData.fileName = req.file.originalname;
      updateData.fileType = req.file.mimetype?.split('/')[1]?.toUpperCase() || req.file.originalname.split('.').pop()?.toUpperCase();
      updateData.fileSize = req.file.size || 0;
    }

    // Convert date if provided
    if (updateData.date) {
      updateData.date = new Date(updateData.date);
    }

    // Convert amount if provided
    if (updateData.amount) {
      updateData.amount = Number(updateData.amount);
    }

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const updatedReceipt = await Receipt.findOneAndUpdate(query, updateData, {
      new: true,
      runValidators: true,
    }).populate('uploadedBy', 'name email');

    if (!updatedReceipt) {
      return res.status(404).json({ success: false, message: "Receipt not found" });
    }

    res.json({
      success: true,
      message: "Receipt updated successfully",
      data: updatedReceipt,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Delete Receipt
export const deleteReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const deletedReceipt = await Receipt.findOneAndDelete(query);
    if (!deletedReceipt) {
      return res.status(404).json({ success: false, message: "Receipt not found" });
    }

    res.json({
      success: true,
      message: "Receipt deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Get Receipt Signed URL
export const getReceiptSignedUrl = async (req, res) => {
  try {
    const { receiptId } = req.params;
    const { disposition = 'inline' } = req.query;
    
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const query = { _id: receiptId };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const receipt = await Receipt.findOne(query);
    
    if (!receipt) {
      return res.status(404).json({ 
        success: false, 
        message: "Receipt not found" 
      });
    }

    if (!receipt.fileUrl) {
      return res.status(404).json({ 
        success: false, 
        message: "File URL not found for this receipt" 
      });
    }

    const fileUrl = receipt.fileUrl;
    const isS3Url = fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.');

    if (isS3Url) {
      try {
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
        
        const getContentType = (url) => {
          const urlMatch = url.match(/\.([^.?#]+)(\?|#|$)/);
          if (!urlMatch) return 'application/octet-stream';
          
          const ext = urlMatch[1].toLowerCase();
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
          ? `attachment; filename="${encodeURIComponent(receipt.fileName || 'receipt')}"` 
          : 'inline';
        
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentDisposition: contentDisposition,
          ResponseContentType: contentType,
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        
        return res.json({
          success: true,
          url: signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('Error generating signed URL for receipt:', s3Error);
        return res.json({
          success: true,
          url: fileUrl,
          expiresIn: 0
        });
      }
    } else {
      return res.json({
        success: true,
        url: fileUrl,
        expiresIn: 0
      });
    }
  } catch (err) {
    console.error('Error getting signed receipt URL:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

