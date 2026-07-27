import { GeneralRepair } from "../../models/fleet/generalRepairModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";
import { FleetUnit } from "../../models/fleet/fleetUnitModel.js";
import { User } from "../../models/driver/userModel.js";
import mongoose from "mongoose";
import nodemailer from "nodemailer";

const sanitize = (value) => (typeof value === "string" ? value.trim() : value);

// Helper function to generate signed URL for invoice files (S3)
const generateInvoiceSignedUrl = async (invoiceUploadUrl) => {
  if (!invoiceUploadUrl) {
    return null;
  }
  // Already a full URL (e.g. signed URL or external)
  if (invoiceUploadUrl.startsWith('http://') || invoiceUploadUrl.startsWith('https://')) {
    return invoiceUploadUrl;
  }
  // Check if AWS credentials are configured
  if (!process.env.AWS_S3_BUCKET_NAME || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    // Fallback: local file served by backend
    if (invoiceUploadUrl.includes('uploads/')) {
      return `${process.env.BASE_URL || 'http://localhost:3000'}/${invoiceUploadUrl.replace(/^\/+/, '')}`;
    }
    return null;
  }

  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  let key = null;
  
  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { s3 } = await import("../../config/awsConfig.js");
    
    // Check if invoiceUploadUrl is already a full S3 URL
    if (invoiceUploadUrl.includes('s3.amazonaws.com') || invoiceUploadUrl.includes('.s3.')) {
      try {
        const cleanUrl = invoiceUploadUrl.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        
        if (urlObj.hostname.includes('.s3.')) {
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }
        
        if (key && key.includes('?')) key = key.split('?')[0];
        if (key && key.includes('&')) key = key.split('&')[0];
      } catch (urlError) {
        console.error('Error parsing S3 URL:', urlError);
      }
    }
    
    // If invoiceUploadUrl contains a path (but not a full URL), use it as-is
    // This is the most common case: "documents/123-file.pdf"
    if (!key && invoiceUploadUrl.includes('/')) {
      key = invoiceUploadUrl;
    }
    
    // If still no key, assume it's in documents folder
    if (!key) {
      key = `documents/${invoiceUploadUrl}`;
    }

    if (!key) {
      console.error('❌ Could not determine S3 key for invoice:', invoiceUploadUrl);
      return null;
    }

    // Extract filename for Content-Disposition (handle URL encoding in filename)
    let fileName = key.split('/').pop() || 'invoice.pdf';
    // Decode filename if it's URL encoded
    try {
      fileName = decodeURIComponent(fileName);
    } catch (e) {
      // If decoding fails, use as-is
    }
    
    // Determine content type based on file extension
    const getContentType = (fileName) => {
      const ext = fileName.split('.').pop()?.toLowerCase();
      const typeMap = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
      };
      return typeMap[ext] || 'application/pdf';
    };

    const contentType = getContentType(fileName);

    console.log(`🔍 Generating signed URL for invoice:`, {
      originalUrl: invoiceUploadUrl,
      extractedKey: key,
      bucket: bucketName,
      contentType: contentType,
      fileName: fileName
    });

    // Clean the key - remove any query parameters or fragments
    const cleanKey = key.split('?')[0].split('#')[0];

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: cleanKey,
      ResponseContentType: contentType,
      ResponseContentDisposition: `inline; filename="${encodeURIComponent(fileName)}"`
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
    if (signedUrl) {
      console.log(`✅ Successfully generated signed URL for invoice: ${key}`);
    } else {
      console.error(`❌ Failed to generate signed URL for invoice: ${key}`);
    }
    
    return signedUrl;
  } catch (error) {
    console.error(`❌ Error generating signed URL for invoice:`, {
      error: error.message,
      stack: error.stack,
      invoiceUploadUrl: invoiceUploadUrl,
      key: key
    });
    return null;
  }
};

// Helper function to extract real ID from prefixed IDs (e.g., "custom-123" -> "123")
const extractRealId = (prefixedId) => {
  if (!prefixedId) return null;
  
  // Check if it's a prefixed ID
  if (prefixedId.startsWith("custom-")) {
    return prefixedId.replace("custom-", "");
  }
  if (prefixedId.startsWith("vehicle-")) {
    return prefixedId.replace("vehicle-", "");
  }
  if (prefixedId.startsWith("trailer-")) {
    return prefixedId.replace("trailer-", "");
  }
  
  // Return as-is if not prefixed
  return prefixedId;
};

// Helper function to check if an ID is a valid ObjectId
const isValidObjectId = (id) => {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id);
};

const ensureCompanyContext = (req) => {
  const companyId = getUserCompanyId(req.user);
  const isSuperadmin = req.user?.role === "superadmin";
  return { companyId, isSuperadmin };
};

const buildSearchFilter = (search) => {
  if (!search) return null;
  const regex = new RegExp(search.trim(), "i");
  return {
    $or: [
      { unitNumber: regex },
      { makeModel: regex },
      { vinLicensePlate: regex },
      { description: regex },
      { serviceProvider: regex },
      { customer: regex },
      { invoiceNumber: regex }
    ]
  };
};

const normalizeTaxes = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((t) => t && (typeof t.name === "string" && t.name.trim() !== ""))
    .map((t) => ({
      name: sanitize(t.name),
      percentage: typeof t.percentage === "number" && !Number.isNaN(t.percentage)
        ? Math.min(100, Math.max(0, t.percentage))
        : (typeof t.percentage === "string" && t.percentage.trim() !== ""
          ? Math.min(100, Math.max(0, parseFloat(t.percentage) || 0))
          : 0)
    }));
};

export const listGeneralRepairs = async (req, res) => {
  try {
    const { search = "" } = req.query;
    const { companyId, isSuperadmin } = ensureCompanyContext(req);

    if (!isSuperadmin && !companyId) {
      return res.status(200).json({
        success: true,
        data: [],
        requiresCompanySetup: true,
        message: "Please complete company settings first to view general repairs."
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const combinedFilter = await getCombinedFilter(req.user, companyFilter);
    const filter = combinedFilter ? { ...combinedFilter } : {};
    const searchFilter = buildSearchFilter(search);
    if (searchFilter) {
      filter.$and = filter.$and || [];
      filter.$and.push(searchFilter);
    }

    const records = await GeneralRepair.find(filter).sort({ serviceDate: -1 }).lean();
    
    // Generate signed URLs for invoice files in completed repairs
    const recordsWithSignedUrls = await Promise.all(
      records.map(async (record) => {
        // Only generate signed URL for completed repairs with invoice files
        if (record.status === 'completed' && record.invoiceUploadUrl) {
          try {
            const signedUrl = await generateInvoiceSignedUrl(record.invoiceUploadUrl);
            if (signedUrl) {
              return {
                ...record,
                invoiceSignedUrl: signedUrl
              };
            }
          } catch (error) {
            console.error(`Error generating signed URL for repair ${record._id}:`, error);
          }
        }
        return record;
      })
    );
    
    return res.json({ success: true, data: recordsWithSignedUrls });
  } catch (error) {
    console.error("❌ Error listing general repairs:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch general repairs",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const createGeneralRepair = async (req, res) => {
  try {
    const { companyId, isSuperadmin } = ensureCompanyContext(req);
    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first to create general repairs."
      });
    }

    const unitNumber = sanitize(req.body.unitNumber);
    
    // Handle unitReference - extract real ID from prefixed ID if necessary
    let unitReference = req.body.unitReference || null;
    let fleetUnit = null;
    
    if (unitReference) {
      // Extract real ID from prefixed ID if necessary
      const realUnitReferenceId = extractRealId(unitReference);
      
      // Strategy 1: Try to find FleetUnit by _id if it's a valid ObjectId
      if (isValidObjectId(realUnitReferenceId)) {
        try {
          fleetUnit = await FleetUnit.findOne({ 
            _id: new mongoose.Types.ObjectId(realUnitReferenceId),
            ...(companyId ? { company: companyId } : {})
          }).select("_id").lean();
        } catch (err) {
          console.error(`Error finding FleetUnit by _id ${realUnitReferenceId}:`, err.message);
        }
      }
      
      // Strategy 2: If not found, try by internalId or unitNo
      if (!fleetUnit && realUnitReferenceId) {
        try {
          fleetUnit = await FleetUnit.findOne({
            $or: [
              { internalId: realUnitReferenceId },
              { unitNo: realUnitReferenceId }
            ],
            ...(companyId ? { company: companyId } : {})
          }).select("_id").lean();
        } catch (err) {
          console.error(`Error finding FleetUnit by internalId/unitNo ${realUnitReferenceId}:`, err.message);
        }
      }
      
      // Strategy 3: If still not found, try the original prefixed ID as internalId or unitNo
      if (!fleetUnit && unitReference && unitReference !== realUnitReferenceId) {
        try {
          fleetUnit = await FleetUnit.findOne({
            $or: [
              { internalId: unitReference },
              { unitNo: unitReference }
            ],
            ...(companyId ? { company: companyId } : {})
          }).select("_id").lean();
        } catch (err) {
          console.error(`Error finding FleetUnit by prefixed ID ${unitReference}:`, err.message);
        }
      }
      
      // If FleetUnit was found, use its _id as unitReference
      if (fleetUnit) {
        unitReference = fleetUnit._id;
      } else {
        // If unitReference was provided but FleetUnit not found, clear it
        unitReference = null;
      }
    }
    
    // If unitNumber is provided but unitReference is still not set, try to find by unitNumber
    if (unitNumber && !unitReference) {
      fleetUnit = await FleetUnit.findOne({
        unitNo: unitNumber,
        ...(companyId ? { company: companyId } : {})
      }).select("_id").lean();
      
      if (fleetUnit) {
        unitReference = fleetUnit._id;
      }
    }

    // Handle serviceProviderId - look up mechanic if serviceProviderId is provided
    let serviceProviderId = null;
    if (req.body.serviceProviderId && isValidObjectId(req.body.serviceProviderId)) {
      serviceProviderId = new mongoose.Types.ObjectId(req.body.serviceProviderId);
    } else if (req.body.serviceProvider) {
      // Try to find mechanic by name if serviceProviderId not provided
      const mechanic = await User.findOne({
        name: req.body.serviceProvider,
        role: { $in: ['Maintenance Crew (Mechanics)', 'mechanic'] },
        ...(companyId ? { company: companyId } : {})
      }).select("_id").lean();
      if (mechanic) {
        serviceProviderId = mechanic._id;
      }
    }

    const payload = {
      serviceDate: req.body.serviceDate ? new Date(req.body.serviceDate) : null,
      unitNumber: unitNumber,
      makeModel: sanitize(req.body.makeModel),
      vinLicensePlate: sanitize(req.body.vinLicensePlate),
      description: sanitize(req.body.description),
      odometer: req.body.odometer !== undefined ? Number(req.body.odometer) : null,
      parts: Array.isArray(req.body.parts) && req.body.parts.length > 0
        ? req.body.parts.map(p => ({
            partId: p.partId || null,
            partName: sanitize(p.partName) || '',
            partNumber: sanitize(p.partNumber) || '',
            quantity: p.quantity ? Number(p.quantity) : 1
          }))
        : (typeof req.body.parts === 'string' && req.body.parts.trim() ? sanitize(req.body.parts) : null),
      notes: sanitize(req.body.notes),
      serviceProvider: sanitize(req.body.serviceProvider),
      serviceProviderId: serviceProviderId,
      mechanicType: req.body.mechanicType || 'internal',
      externalMechanicCompany: req.body.externalMechanicCompany ? sanitize(req.body.externalMechanicCompany) : null,
      externalMechanicPhone: req.body.externalMechanicPhone ? sanitize(req.body.externalMechanicPhone) : null,
      externalMechanicEmail: req.body.externalMechanicEmail ? sanitize(req.body.externalMechanicEmail) : null,
      customer: req.body.customer ? sanitize(req.body.customer) : null,
      customerId: req.body.customerId && isValidObjectId(req.body.customerId) ? new mongoose.Types.ObjectId(req.body.customerId) : null,
      taxes: normalizeTaxes(req.body.taxes),
      invoiceNumber: req.body.invoiceNumber ? sanitize(req.body.invoiceNumber) : null,
      amount: req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '' ? Number(req.body.amount) : null,
      duePayment: req.body.duePayment ? new Date(req.body.duePayment) : null,
      unitSource: sanitize(req.body.unitSource) || "unknown",
      unitReference: unitReference,
      company: companyId || req.body.company,
      createdBy: req.user?._id,
      updatedBy: req.user?._id
    };

    if (!payload.serviceDate || !payload.unitNumber || !payload.description || !payload.serviceProvider) {
      return res.status(400).json({
        success: false,
        message: "serviceDate, unitNumber, description, and serviceProvider are required."
      });
    }

    const record = await GeneralRepair.create(payload);
    // Ensure amount is included in response even if null
    const responseData = record.toObject();
    if (responseData.amount === undefined) {
      responseData.amount = null;
    }

    return res.status(201).json({ success: true, message: "General repair created successfully", data: responseData });
  } catch (error) {
    console.error("❌ Error creating general repair:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create general repair",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const updateGeneralRepair = async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId, isSuperadmin } = ensureCompanyContext(req);

    const existing = await GeneralRepair.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "General repair not found" });
    }

    if (!isSuperadmin && companyId && existing.company && existing.company.toString() !== companyId.toString()) {
      return res.status(403).json({ success: false, message: "You cannot modify this repair." });
    }

    // Handle unitReference - extract real ID from prefixed ID if necessary
    let unitReference = existing.unitReference;
    if (req.body.unitReference !== undefined) {
      const providedUnitReference = req.body.unitReference;
      let fleetUnit = null;
      
      if (providedUnitReference) {
        // Extract real ID from prefixed ID if necessary
        const realUnitReferenceId = extractRealId(providedUnitReference);
        
        // Strategy 1: Try to find FleetUnit by _id if it's a valid ObjectId
        if (isValidObjectId(realUnitReferenceId)) {
          try {
            fleetUnit = await FleetUnit.findOne({ 
              _id: new mongoose.Types.ObjectId(realUnitReferenceId),
              ...(companyId ? { company: companyId } : {})
            }).select("_id").lean();
          } catch (err) {
            console.error(`Error finding FleetUnit by _id ${realUnitReferenceId}:`, err.message);
          }
        }
        
        // Strategy 2: If not found, try by internalId or unitNo
        if (!fleetUnit && realUnitReferenceId) {
          try {
            fleetUnit = await FleetUnit.findOne({
              $or: [
                { internalId: realUnitReferenceId },
                { unitNo: realUnitReferenceId }
              ],
              ...(companyId ? { company: companyId } : {})
            }).select("_id").lean();
          } catch (err) {
            console.error(`Error finding FleetUnit by internalId/unitNo ${realUnitReferenceId}:`, err.message);
          }
        }
        
        // Strategy 3: If still not found, try the original prefixed ID as internalId or unitNo
        if (!fleetUnit && providedUnitReference && providedUnitReference !== realUnitReferenceId) {
          try {
            fleetUnit = await FleetUnit.findOne({
              $or: [
                { internalId: providedUnitReference },
                { unitNo: providedUnitReference }
              ],
              ...(companyId ? { company: companyId } : {})
            }).select("_id").lean();
          } catch (err) {
            console.error(`Error finding FleetUnit by prefixed ID ${providedUnitReference}:`, err.message);
          }
        }
        
        // If FleetUnit was found, use its _id as unitReference
        if (fleetUnit) {
          unitReference = fleetUnit._id;
        } else {
          // If unitReference was provided but FleetUnit not found, set to null
          unitReference = null;
        }
      } else {
        unitReference = null;
      }
    }

    // Handle serviceProviderId - look up mechanic if serviceProviderId is provided or serviceProvider changed
    let serviceProviderId = existing.serviceProviderId;
    if (req.body.serviceProviderId !== undefined) {
      if (req.body.serviceProviderId && isValidObjectId(req.body.serviceProviderId)) {
        serviceProviderId = new mongoose.Types.ObjectId(req.body.serviceProviderId);
      } else {
        serviceProviderId = null;
      }
    } else if (req.body.serviceProvider && req.body.serviceProvider !== existing.serviceProvider) {
      // Try to find mechanic by name if serviceProvider changed but serviceProviderId not provided
      const mechanic = await User.findOne({
        name: req.body.serviceProvider,
        role: { $in: ['Maintenance Crew (Mechanics)', 'mechanic'] },
        ...(companyId ? { company: companyId } : {})
      }).select("_id").lean();
      if (mechanic) {
        serviceProviderId = mechanic._id;
      }
    }

    const payload = {
      serviceDate: req.body.serviceDate ? new Date(req.body.serviceDate) : existing.serviceDate,
      unitNumber: sanitize(req.body.unitNumber),
      makeModel: sanitize(req.body.makeModel),
      vinLicensePlate: sanitize(req.body.vinLicensePlate),
      description: sanitize(req.body.description),
      odometer: req.body.odometer !== undefined ? Number(req.body.odometer) : existing.odometer,
      parts: req.body.parts !== undefined
        ? (Array.isArray(req.body.parts) && req.body.parts.length > 0
          ? req.body.parts.map(p => ({
              partId: p.partId || null,
              partName: sanitize(p.partName) || '',
              partNumber: sanitize(p.partNumber) || '',
              quantity: p.quantity ? Number(p.quantity) : 1
            }))
          : (typeof req.body.parts === 'string' && req.body.parts.trim() ? sanitize(req.body.parts) : null))
        : existing.parts,
      notes: sanitize(req.body.notes),
      serviceProvider: sanitize(req.body.serviceProvider),
      serviceProviderId: serviceProviderId,
      mechanicType: req.body.mechanicType !== undefined ? req.body.mechanicType : existing.mechanicType,
      externalMechanicCompany: req.body.externalMechanicCompany !== undefined ? (req.body.externalMechanicCompany ? sanitize(req.body.externalMechanicCompany) : null) : existing.externalMechanicCompany,
      externalMechanicPhone: req.body.externalMechanicPhone !== undefined ? (req.body.externalMechanicPhone ? sanitize(req.body.externalMechanicPhone) : null) : existing.externalMechanicPhone,
      externalMechanicEmail: req.body.externalMechanicEmail !== undefined ? (req.body.externalMechanicEmail ? sanitize(req.body.externalMechanicEmail) : null) : existing.externalMechanicEmail,
      customer: req.body.customer !== undefined ? (req.body.customer ? sanitize(req.body.customer) : null) : existing.customer,
      customerId: req.body.customerId !== undefined
        ? (req.body.customerId && isValidObjectId(req.body.customerId) ? new mongoose.Types.ObjectId(req.body.customerId) : null)
        : existing.customerId,
      taxes: req.body.taxes !== undefined ? normalizeTaxes(req.body.taxes) : existing.taxes,
      invoiceNumber: req.body.invoiceNumber !== undefined ? (req.body.invoiceNumber ? sanitize(req.body.invoiceNumber) : null) : existing.invoiceNumber,
      amount: req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '' ? Number(req.body.amount) : (existing.amount !== undefined ? existing.amount : null),
      duePayment: req.body.duePayment !== undefined ? (req.body.duePayment ? new Date(req.body.duePayment) : null) : existing.duePayment,
      unitSource: sanitize(req.body.unitSource) || existing.unitSource,
      unitReference: unitReference,
      updatedBy: req.user?._id
    };

    const updated = await GeneralRepair.findByIdAndUpdate(id, payload, { new: true });
    // Ensure amount is included in response even if null
    const responseData = updated.toObject();
    if (responseData.amount === undefined) {
      responseData.amount = null;
    }
    return res.json({ success: true, message: "General repair updated successfully", data: responseData });
  } catch (error) {
    console.error("❌ Error updating general repair:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update general repair",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const deleteGeneralRepair = async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId, isSuperadmin } = ensureCompanyContext(req);

    const existing = await GeneralRepair.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "General repair not found" });
    }

    if (!isSuperadmin && companyId && existing.company && existing.company.toString() !== companyId.toString()) {
      return res.status(403).json({ success: false, message: "You cannot delete this repair." });
    }

    await GeneralRepair.findByIdAndDelete(id);
    return res.json({ success: true, message: "General repair deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting general repair:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete general repair",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ✅ List mechanic's assigned orders (with search, filter, pagination, counts)
export const listMechanicOrders = async (req, res) => {
  try {
    const { companyId, isSuperadmin } = ensureCompanyContext(req);
    const mechanicId = req.user?._id;

    if (!mechanicId) {
      return res.status(401).json({
        success: false,
        message: "Mechanic ID not found in token"
      });
    }

    const { search, status, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Base filter
    const filter = {};
    
    if (req.user?.role === 'Maintenance Crew (Mechanics)') {
      filter.serviceProviderId = mechanicId;
      filter.status = { $in: ['Created', 'Assigned', 'Shared', 'in-progress', 'completed'] };
    } else if (req.query.mechanicId) {
      filter.serviceProviderId = req.query.mechanicId;
    }

    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    } else if (isSuperadmin && companyId) {
      filter.company = companyId;
    }

    // Status filter
    if (status && status !== 'all') {
      if (status === 'pending') {
        filter.status = { $in: ['Created', 'Assigned', 'Shared', 'in-progress'] };
      } else {
        filter.status = status;
      }
    }

    // Search filter (unitNumber, description, repairDetails, customer)
    if (search && typeof search === 'string' && search.trim()) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      filter.$or = [
        { unitNumber: searchRegex },
        { description: searchRegex },
        { repairDetails: searchRegex },
        { customer: searchRegex },
        { makeModel: searchRegex },
        { vinLicensePlate: searchRegex }
      ];
    }

    // Counts: use base filter (with search) but without status filter for "all"
    const countFilter = { ...filter };
    delete countFilter.status;
    const allCount = await GeneralRepair.countDocuments(countFilter);
    const completedCount = await GeneralRepair.countDocuments({ ...countFilter, status: 'completed' });
    const pendingCount = await GeneralRepair.countDocuments({
      ...countFilter,
      status: { $in: ['Created', 'Assigned', 'Shared', 'in-progress'] }
    });
    const totalCount = await GeneralRepair.countDocuments(filter);

    const orders = await GeneralRepair.find(filter)
      .sort({ serviceDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const ordersWithSignedUrls = await Promise.all(
      orders.map(async (order) => {
        const orderObj = { ...order };
        if (order.invoiceUploadUrl) {
          const signedUrl = await generateInvoiceSignedUrl(order.invoiceUploadUrl);
          if (signedUrl) orderObj.invoiceSignedUrl = signedUrl;
        }
        return orderObj;
      })
    );

    const totalPages = Math.ceil(totalCount / limitNum);

    return res.json({
      success: true,
      data: ordersWithSignedUrls,
      count: ordersWithSignedUrls.length,
      totalCount,
      allCount,
      completedCount,
      pendingCount,
      page: pageNum,
      limit: limitNum,
      totalPages
    });
  } catch (error) {
    console.error("❌ Error listing mechanic orders:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch mechanic orders",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ✅ Get mechanic dashboard stats (monthly)
export const getMechanicDashboard = async (req, res) => {
  try {
    const { companyId, isSuperadmin } = ensureCompanyContext(req);
    const mechanicId = req.user?._id;

    if (!mechanicId) {
      return res.status(401).json({
        success: false,
        message: "User ID not found in token"
      });
    }

    const now = new Date();
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);
    const monthNum = Number.isNaN(month) || month < 1 || month > 12 ? now.getMonth() + 1 : month;
    const yearNum = Number.isNaN(year) || year < 2000 || year > 2100 ? now.getFullYear() : year;

    const startOfMonth = new Date(yearNum, monthNum - 1, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    const isMechanic = req.user?.role === "Maintenance Crew (Mechanics)";

    const baseFilter = {};
    if (companyId) {
      baseFilter.company = companyId;
    } else if (!isSuperadmin) {
      return res.json({
        success: true,
        data: {
          total: 0,
          completed: 0,
          pending: 0,
          completionRate: 0,
          myAssigned: 0,
          myCompleted: 0,
          myPending: 0,
          totalRepairAmount: 0,
          avgRepairCost: 0,
          recentOrders: []
        }
      });
    }

    const monthFilter = {
      serviceDate: { $gte: startOfMonth, $lte: endOfMonth }
    };

    let statsFilter = { ...baseFilter, ...monthFilter };
    if (isMechanic) {
      statsFilter.serviceProviderId = mechanicId;
    }

    const total = await GeneralRepair.countDocuments(statsFilter);
    const completed = await GeneralRepair.countDocuments({
      ...statsFilter,
      status: "completed"
    });
    const pending = await GeneralRepair.countDocuments({
      ...statsFilter,
      status: { $in: ["Created", "Assigned", "Shared", "in-progress"] }
    });
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    let myAssigned = 0;
    let myCompleted = 0;
    let myPending = 0;
    if (isMechanic) {
      myAssigned = total;
      myCompleted = completed;
      myPending = pending;
    } else {
      // Admin / Fleet Maintenance Manager: show company-wide workload (all orders in month)
      myAssigned = total;
      myCompleted = completed;
      myPending = pending;
    }

    const completedOrders = await GeneralRepair.find({
      ...statsFilter,
      status: "completed"
    })
      .select("completionTotalAmount")
      .lean();

    const totalRepairAmount = completedOrders.reduce(
      (sum, o) => sum + (Number(o.completionTotalAmount) || 0),
      0
    );
    const avgRepairCost = completed > 0 ? Math.round(totalRepairAmount / completed) : 0;

    const recentFilter = { ...baseFilter };
    if (isMechanic) {
      recentFilter.serviceProviderId = mechanicId;
    }
    const recentOrders = await GeneralRepair.find(recentFilter)
      .sort({ serviceDate: -1, createdAt: -1 })
      .limit(5)
      .select("_id unitNumber description status serviceDate completionDate")
      .lean();

    return res.json({
      success: true,
      data: {
        total,
        completed,
        pending,
        completionRate,
        myAssigned,
        myCompleted,
        myPending,
        totalRepairAmount,
        avgRepairCost,
        recentOrders: recentOrders.map((o) => {
          const d = o.completionDate || o.serviceDate || o.createdAt;
          let dateStr = null;
          if (d) {
            dateStr = typeof d === "string" ? d.split("T")[0] : (d.toISOString ? d.toISOString().split("T")[0] : null);
          }
          return {
            id: o._id,
            unit: o.unitNumber,
            description: o.description,
            status: o.status,
            date: dateStr
          };
        })
      }
    });
  } catch (error) {
    console.error("❌ Error fetching mechanic dashboard:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ✅ Update order status to in-progress
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const mechanicId = req.user?._id;

    if (!mechanicId) {
      return res.status(401).json({
        success: false,
        message: "Mechanic ID not found in token"
      });
    }

    const order = await GeneralRepair.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Maintenance order not found"
      });
    }

    // Check if mechanic is assigned to this order
    if (req.user?.role === 'Maintenance Crew (Mechanics)') {
      const orderMechanicId = order.serviceProviderId?.toString();
      const currentMechanicId = mechanicId.toString();
      
      if (orderMechanicId !== currentMechanicId) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to this maintenance order"
        });
      }
    }

    // Validate status transition
    const allowedStatuses = ['in-progress', 'completed'];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: ${allowedStatuses.join(', ')}`
      });
    }

    // Update status
    const updateData = {
      status: status || 'in-progress',
      updatedBy: mechanicId
    };

    // If setting to in-progress, ensure it was previously Created, Assigned, or Shared
    if (status === 'in-progress' && !['Created', 'Assigned', 'Shared'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "Order must be in 'Created', 'Assigned', or 'Shared' status before marking as in-progress"
      });
    }

    const updatedOrder = await GeneralRepair.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    return res.json({
      success: true,
      message: "Order status updated successfully",
      data: updatedOrder
    });
  } catch (error) {
    console.error("❌ Error updating order status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update order status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ✅ Complete repair with all details
export const completeRepair = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Parse JSON fields from form-data if they are strings
    let repairDetails, parts, totalAmount;
    
    // repairDetails is always a string, no need to parse
    repairDetails = req.body.repairDetails;
    
    if (req.body.parts) {
      parts = typeof req.body.parts === 'string' 
        ? JSON.parse(req.body.parts) 
        : req.body.parts;
    }
    
    totalAmount = req.body.totalAmount ? (typeof req.body.totalAmount === 'string' ? parseFloat(req.body.totalAmount) : req.body.totalAmount) : null;
    
    // completionDate is automatically set to current date/time in backend
    
    // Handle file upload - invoice file is required
    let invoiceUploadUrl = null;
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Invoice file is required"
      });
    }
    // S3: req.file.key or extract from req.file.location; Local: req.file.path
    if (req.file.key) {
      invoiceUploadUrl = req.file.key;
      console.log('✅ Invoice file uploaded to S3:', invoiceUploadUrl);
    } else if (req.file.location) {
      try {
        const urlObj = new URL(req.file.location);
        invoiceUploadUrl = decodeURIComponent(urlObj.pathname.substring(1));
        console.log('✅ Invoice file uploaded to S3:', invoiceUploadUrl);
      } catch (e) {
        console.error('Error extracting S3 key from URL:', e);
        invoiceUploadUrl = req.file.location;
      }
    } else if (req.file.path) {
      invoiceUploadUrl = req.file.path.replace(/\\/g, '/');
      console.log('✅ Invoice file uploaded locally:', invoiceUploadUrl);
    }
    
    const mechanicId = req.user?._id;

    if (!mechanicId) {
      return res.status(401).json({
        success: false,
        message: "Mechanic ID not found in token"
      });
    }

    // Validate required fields (totalAmount can be 0 for warranty repairs)
    if (!repairDetails) {
      return res.status(400).json({
        success: false,
        message: "repairDetails is required"
      });
    }
    if (totalAmount == null || totalAmount === '' || (typeof totalAmount === 'number' && totalAmount < 0)) {
      return res.status(400).json({
        success: false,
        message: "Valid totalAmount is required (can be 0)"
      });
    }

    const order = await GeneralRepair.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Maintenance order not found"
      });
    }

    // Check if mechanic is assigned to this order
    if (req.user?.role === 'Maintenance Crew (Mechanics)') {
      const orderMechanicId = order.serviceProviderId?.toString();
      const currentMechanicId = mechanicId.toString();
      
      if (orderMechanicId !== currentMechanicId) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to this maintenance order"
        });
      }
    }

    // Validate order is in correct status
    if (!['Created', 'Assigned', 'Shared', 'in-progress'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "Order must be in 'Created', 'Assigned', 'Shared', or 'in-progress' status to complete"
      });
    }

    // Normalize parts array
    const normalizedParts = Array.isArray(parts) ? parts.map(part => ({
      partId: part.partId || null,
      partName: sanitize(part.partName || ''),
      partNumber: sanitize(part.partNumber || ''),
      quantity: part.quantity ? Number(part.quantity) : 1,
      cost: part.cost ? Number(part.cost) : 0
    })) : [];

    // Calculate total amount if not provided
    const calculatedTotal = totalAmount ? Number(totalAmount) : 0;

    // Update order with completion details
    // completionDate is automatically set to current date/time
    // verificationStatus is set to 'not-verified' by default when mechanic completes
    const updateData = {
      status: 'completed',
      repairDetails: typeof repairDetails === 'string' ? sanitize(repairDetails) : String(repairDetails),
      completedParts: normalizedParts,
      completionInvoiceNumber: null, // Invoice number not needed, only file upload
      invoiceUploadUrl: invoiceUploadUrl ? sanitize(invoiceUploadUrl) : null,
      completionTaxes: [], // Taxes not needed, always empty array
      completionTotalAmount: calculatedTotal,
      completionDate: new Date(), // Automatically set to current date/time
      completedBy: mechanicId,
      verificationStatus: 'not-verified', // Default to not-verified when mechanic completes
      updatedBy: mechanicId
    };

    const completedOrder = await GeneralRepair.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    const orderData = completedOrder.toObject ? completedOrder.toObject() : { ...completedOrder };
    const invoiceSignedUrl = await generateInvoiceSignedUrl(invoiceUploadUrl);
    if (invoiceSignedUrl) {
      orderData.invoiceSignedUrl = invoiceSignedUrl;
    }

    return res.json({
      success: true,
      message: "Repair completed successfully",
      data: orderData
    });
  } catch (error) {
    console.error("❌ Error completing repair:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to complete repair",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ✅ Send maintenance order email to mechanic
export const sendMaintenanceOrderEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId } = ensureCompanyContext(req);

    // Find the maintenance order
    const order = await GeneralRepair.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Maintenance order not found"
      });
    }

    // Check company access
    if (companyId && order.company?.toString() !== companyId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this maintenance order"
      });
    }

    // Get mechanic information - try by ID first, then by name
    let mechanic = null;
    if (order.serviceProviderId) {
      mechanic = await User.findById(order.serviceProviderId);
    }
    
    // If not found by ID, try to find by name
    if (!mechanic && order.serviceProvider) {
      mechanic = await User.findOne({
        name: order.serviceProvider,
        role: { $in: ['Maintenance Crew (Mechanics)', 'mechanic'] },
        ...(companyId ? { company: companyId } : {})
      });
      
      // If found by name, update the order with the mechanic's ID
      if (mechanic) {
        await GeneralRepair.findByIdAndUpdate(id, {
          serviceProviderId: mechanic._id,
          updatedBy: req.user?._id
        });
      }
    }

    if (!mechanic) {
      return res.status(400).json({
        success: false,
        message: "No mechanic assigned to this maintenance order"
      });
    }

    if (!mechanic.email) {
      return res.status(400).json({
        success: false,
        message: "Mechanic does not have an email address"
      });
    }

    // Check SMTP configuration
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(500).json({
        success: false,
        message: "Email service is not configured. Please check SMTP settings."
      });
    }

    // Create email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Format dates
    const serviceDateFormatted = order.serviceDate
      ? new Date(order.serviceDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : 'N/A';

    // Format parts - only if parts exist
    let partsList = '';
    let hasParts = false;
    if (order.parts) {
      if (Array.isArray(order.parts) && order.parts.length > 0) {
        partsList = order.parts.map((part, idx) => {
          const partName = part.partName || part.name || part.partNumber || 'Part';
          const quantity = part.quantity || 1;
          return `${idx + 1}. ${partName} (Qty: ${quantity})`;
        }).join('<br>');
        hasParts = true;
      } else if (typeof order.parts === 'string' && order.parts.trim()) {
        partsList = order.parts;
        hasParts = true;
      }
    }

    // Create email HTML content
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .info-box { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #667eea; }
          .label { font-weight: bold; color: #667eea; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔧 Maintenance Order Assignment</h1>
            <p>You have been assigned a new maintenance order</p>
          </div>
          <div class="content">
            <div class="info-box">
              <p><span class="label">Unit Number:</span> ${order.unitNumber || 'N/A'}</p>
              <p><span class="label">Make/Model:</span> ${order.makeModel || 'N/A'}</p>
              <p><span class="label">VIN/License Plate:</span> ${order.vinLicensePlate || 'N/A'}</p>
            </div>
            <div class="info-box">
              <p><span class="label">Service Date:</span> ${serviceDateFormatted}</p>
              <p><span class="label">Odometer:</span> ${order.odometer ? `${order.odometer.toLocaleString()} km` : 'N/A'}</p>
            </div>
            <div class="info-box">
              <p><span class="label">Description:</span></p>
              <p>${order.description || 'N/A'}</p>
            </div>
            ${hasParts ? `
            <div class="info-box">
              <p><span class="label">Parts:</span></p>
              <p>${partsList}</p>
            </div>
            ` : ''}
            ${order.notes ? `
            <div class="info-box">
              <p><span class="label">Notes:</span></p>
              <p>${order.notes}</p>
            </div>
            ` : ''}
            ${order.customer ? `
            <div class="info-box">
              <p><span class="label">Customer:</span> ${order.customer}</p>
            </div>
            ` : ''}
            <div class="footer">
              <p>Please log in to the system to view complete details and update the order status.</p>
              <p>© ${new Date().getFullYear()} Fleet Management System. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Create plain text version
    const textContent = `
Maintenance Order Assignment

You have been assigned a new maintenance order.

Unit Number: ${order.unitNumber || 'N/A'}
Make/Model: ${order.makeModel || 'N/A'}
VIN/License Plate: ${order.vinLicensePlate || 'N/A'}
Service Date: ${serviceDateFormatted}
Odometer: ${order.odometer ? `${order.odometer.toLocaleString()} km` : 'N/A'}

Description:
${order.description || 'N/A'}

${hasParts ? `Parts:\n${partsList}\n\n` : ''}
${order.notes ? `Notes:\n${order.notes}\n` : ''}
${order.customer ? `Customer: ${order.customer}\n` : ''}

Please log in to the system to view complete details and update the order status.

© ${new Date().getFullYear()} Fleet Management System. All rights reserved.
    `;

    // Send email
    const mailOptions = {
      from: `"Fleet Management System" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: mechanic.email,
      subject: `Maintenance Order Assignment - Unit ${order.unitNumber || 'N/A'}`,
      text: textContent,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Maintenance order email sent successfully:', {
      to: mechanic.email,
      messageId: info.messageId,
      orderId: id
    });

    // Update order status to "Shared" and set shared flag
    await GeneralRepair.findByIdAndUpdate(id, {
      status: 'Shared',
      shared: true,
      updatedBy: req.user?._id
    });

    return res.json({
      success: true,
      message: "Maintenance order details sent to mechanic successfully",
      data: {
        emailSent: true,
        messageId: info.messageId,
        recipient: mechanic.email,
        orderId: id
      }
    });
  } catch (error) {
    console.error("❌ Error sending maintenance order email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send maintenance order email",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ✅ Verify completed maintenance order
export const verifyMaintenanceOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId } = ensureCompanyContext(req);
    const verifiedBy = req.user?._id;

    if (!verifiedBy) {
      return res.status(401).json({
        success: false,
        message: "User ID not found in token"
      });
    }

    // Check if user has permission to verify (admin, superadmin, Fleet Maintenance Manager)
    const allowedRoles = ['admin', 'superadmin', 'Fleet Maintenance Manager'];
    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to verify maintenance orders"
      });
    }

    const order = await GeneralRepair.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Maintenance order not found"
      });
    }

    // Check company access
    if (companyId && order.company?.toString() !== companyId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this maintenance order"
      });
    }

    // Only allow verification if order is completed
    if (order.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: "Only completed maintenance orders can be verified"
      });
    }

    // Check if already verified
    if (order.verificationStatus === 'verified') {
      return res.status(400).json({
        success: false,
        message: "This maintenance order has already been verified and cannot be changed"
      });
    }

    // Update verification status
    const updatedOrder = await GeneralRepair.findByIdAndUpdate(
      id,
      {
        verificationStatus: 'verified',
        verifiedBy: verifiedBy,
        verifiedAt: new Date(),
        updatedBy: verifiedBy
      },
      { new: true, runValidators: true }
    );

    return res.json({
      success: true,
      message: "Maintenance order verified successfully",
      data: updatedOrder
    });
  } catch (error) {
    console.error("❌ Error verifying maintenance order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify maintenance order",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ✅ Delete maintenance orders older than 2 years
// This function is used by the cron job to automatically clean up old records
export const deleteOldMaintenanceOrders = async () => {
  try {
    // Calculate the date 2 years ago from today
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    
    // Find all maintenance orders older than 2 years based on createdAt
    const result = await GeneralRepair.deleteMany({
      createdAt: { $lt: twoYearsAgo }
    });

    const deletedCount = result.deletedCount || 0;
    
    console.log(`✅ Deleted ${deletedCount} maintenance order(s) older than 2 years (before ${twoYearsAgo.toISOString()})`);
    
    return {
      success: true,
      deletedCount,
      cutoffDate: twoYearsAgo.toISOString(),
      message: `Successfully deleted ${deletedCount} maintenance order(s) older than 2 years`
    };
  } catch (error) {
    console.error("❌ Error deleting old maintenance orders:", error);
    return {
      success: false,
      error: error.message,
      message: "Failed to delete old maintenance orders"
    };
  }
};

