import mongoose from "mongoose";
import VehicleDocuments from "../models/driver/vehicleDocumentsModel.js";
import { Vehicle } from "../models/driver/vehicleModel.js";
import { Trailer } from "../models/driver/trailerModel.js";
import { FleetUnit } from "../models/fleet/fleetUnitModel.js";
import { validationResult } from "express-validator";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/awsConfig.js";

// Helper function to extract real ID from prefixed IDs (e.g., "custom-123" -> "123")
const extractRealId = (prefixedId) => {
  if (!prefixedId) return null;

  // Convert to string if it's an ObjectId or other type
  const idString = typeof prefixedId === 'string'
    ? prefixedId
    : prefixedId.toString ? prefixedId.toString() : String(prefixedId);

  // Check if it's a prefixed ID
  if (idString.startsWith("custom-")) {
    return idString.replace("custom-", "");
  }
  if (idString.startsWith("vehicle-")) {
    return idString.replace("vehicle-", "");
  }
  if (idString.startsWith("trailer-")) {
    return idString.replace("trailer-", "");
  }

  // Return as-is if not prefixed
  return idString;
};

// Helper function to check if an ID is a valid ObjectId
const isValidObjectId = (id) => {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id);
};

// ✅ Create Document
const normalizeEntity = (entity, assetType = "vehicle") => {
  if (assetType === "trailer") {
    return {
      _id: entity._id,
      make: entity.trailer || entity.unitType || entity.trailerType || "Trailer",
      model: entity.type || entity.trailerType || "",
      year: entity.year || null,
      plateNumber: entity.plateNumber || entity.licensePlate || "",
      status: entity.operationStatus || entity.status || "available",
      assetType: "trailer",
      type: entity.type || entity.trailerType || entity.unitType || "",
      capacity: entity.capacity ? String(entity.capacity) : "",
      internalId: entity.internalId || entity.unitNo || "",
    };
  }
  return {
    _id: entity._id,
    make: entity.make || entity.makeModel?.split(' ')[0] || "",
    model: entity.model || entity.makeModel || "",
    year: entity.year || null,
    plateNumber: entity.plateNumber || entity.licensePlate || "",
    status: entity.status || entity.operationStatus || "available",
    assetType: "vehicle",
    internalId: entity.internalId || entity.unitNo || "",
  };
};

const mapFleetUnitToEntry = (unit) => {
  const isTruck = unit.unitType === "Truck";

  if (isTruck) {
    const vehicleLike = {
      _id: unit._id,
      make: unit.make || unit.makeModel?.split(" ")[0] || "Truck",
      model: unit.model || unit.makeModel || "",
      year: unit.year || null,
      plateNumber: unit.licensePlate,
      status: unit.status || "Active",
      internalId: unit.unitNo || "",
    };

    return {
      _id: unit._id,
      assetType: "vehicle",
      vehicle: normalizeEntity(vehicleLike, "vehicle"),
      documents: [],
      sourceType: "fleetUnit",
    };
  }

  const trailerLike = {
    _id: unit._id,
    trailer: unit.unitType || unit.trailerType || "Trailer",
    type: unit.trailerType || unit.unitType || "",
    year: unit.year || null,
    plateNumber: unit.licensePlate,
    operationStatus: unit.operationStatus,
    status: unit.operationStatus || unit.status || "available",
    capacity: unit.capacity,
    internalId: unit.unitNo || "",
  };

  return {
    _id: unit._id,
    assetType: "trailer",
    vehicle: normalizeEntity(trailerLike, "trailer"),
    documents: [],
    sourceType: "fleetUnit",
  };
};

export const createDocument = async (req, res) => {
  try {
    // Debug logging
    console.log('📄 ========== CREATE VEHICLE DOCUMENT ==========');
    console.log('📦 req.body:', JSON.stringify(req.body, null, 2));
    console.log('📁 req.file:', req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      size: req.file.size,
      location: req.file.location,
      path: req.file.path,
      key: req.file.key
    } : 'No file uploaded');
    console.log('👤 req.user:', req.user ? { _id: req.user._id, role: req.user.role, company: req.user.company } : 'No user');

    const {
      vehicleId,
      trailerId,
      fleetUnitId,
      assetType = "vehicle",
      title,
      documentNumber,
      documentType,
      expiryDate,
      issuedAt,
      ignoreExpiration = false,
    } = req.body;

    if (req.user && req.user.role !== "superadmin") {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message:
            "Please complete company settings first before creating vehicle documents. Go to Company Settings to set up your company.",
        });
      }
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === "superadmin";

    let normalizedAssetType = assetType === "trailer" ? "trailer" : "vehicle";
    let entity = null;
    let entityCompanyId = null;
    let fleetUnit = null;

    if (fleetUnitId) {
      // Extract real ID from prefixed ID if necessary
      const realFleetUnitId = extractRealId(fleetUnitId);

      // Strategy 1: Try to find by _id if it's a valid ObjectId (safest approach)
      if (isValidObjectId(realFleetUnitId)) {
        try {
          // Use findOne with explicit _id query to avoid casting errors
          fleetUnit = await FleetUnit.findOne({ _id: new mongoose.Types.ObjectId(realFleetUnitId) });
        } catch (err) {
          console.error(`Error finding FleetUnit by _id ${realFleetUnitId}:`, err.message);
        }
      }

      // Strategy 2: If not found, try by internalId or unitNo using the extracted real ID
      if (!fleetUnit && realFleetUnitId) {
        try {
          fleetUnit = await FleetUnit.findOne({
            $or: [
              { internalId: realFleetUnitId },
              { unitNo: realFleetUnitId }
            ]
          });
        } catch (err) {
          console.error(`Error finding FleetUnit by internalId/unitNo ${realFleetUnitId}:`, err.message);
        }
      }

      // Strategy 3: If still not found, try the original prefixed ID as internalId or unitNo
      // (Sometimes the prefixed ID itself is stored)
      if (!fleetUnit && fleetUnitId && fleetUnitId !== realFleetUnitId) {
        try {
          fleetUnit = await FleetUnit.findOne({
            $or: [
              { internalId: fleetUnitId },
              { unitNo: fleetUnitId }
            ]
          });
        } catch (err) {
          console.error(`Error finding FleetUnit by prefixed ID ${fleetUnitId}:`, err.message);
        }
      }

      if (!fleetUnit) {
        return res.status(404).json({
          success: false,
          message: `Fleet unit not found with ID: ${fleetUnitId}`
        });
      }
      normalizedAssetType = fleetUnit.unitType === "Truck" ? "vehicle" : "trailer";
      entityCompanyId = fleetUnit.company ? fleetUnit.company.toString() : null;
    } else if (normalizedAssetType === "trailer") {
      if (!trailerId) {
        return res.status(400).json({ success: false, message: "trailerId is required for trailer documents." });
      }
      entity = await Trailer.findById(trailerId);
      if (!entity) {
        return res.status(404).json({ success: false, message: "Trailer not found" });
      }
      entityCompanyId = entity.company ? entity.company.toString() : null;
    } else {
      if (!vehicleId) {
        return res.status(400).json({ success: false, message: "vehicleId is required for vehicle documents." });
      }
      entity = await Vehicle.findById(vehicleId);
      if (!entity) {
        return res.status(404).json({ success: false, message: "Vehicle not found" });
      }
      entityCompanyId = entity.company ? entity.company.toString() : null;
    }

    if (!isSuperadmin && companyId && entityCompanyId && entityCompanyId !== companyId) {
      return res.status(403).json({ success: false, message: "You do not have permission to add documents for this asset." });
    }

    // Validate required fields
    if (!documentType) {
      console.error('❌ Missing documentType');
      return res.status(400).json({ success: false, message: "documentType is required" });
    }

    let documentLocation = null;
    let fileMeta = null;
    if (req.file) {
      console.log('✅ File received, processing...');
      if (process.env.NODE_ENV === "production") {
        documentLocation = req.file.location;
      } else {
        documentLocation = `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, "/")}`;
      }
      fileMeta = {
        fileName: req.file.originalname,
        fileUrl: documentLocation,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        uploadedAt: new Date(),
      };
      console.log('📎 File metadata created:', fileMeta);
    } else {
      console.log('⚠️ No file received in req.file');
      // Check if file might be in req.files (for multiple files)
      if (req.files && req.files.length > 0) {
        console.log('📎 Found files in req.files:', req.files.length);
        const firstFile = req.files[0];
        if (process.env.NODE_ENV === "production") {
          documentLocation = firstFile.location;
        } else {
          documentLocation = `${req.protocol}://${req.get("host")}/${firstFile.path.replace(/\\/g, "/")}`;
        }
        fileMeta = {
          fileName: firstFile.originalname,
          fileUrl: documentLocation,
          fileSize: firstFile.size,
          fileType: firstFile.mimetype,
          uploadedAt: new Date(),
        };
        console.log('📎 Using first file from req.files:', fileMeta);
      }
    }

    const documentData = {
      assetType: normalizedAssetType,
      vehicleId: !fleetUnit && normalizedAssetType === "vehicle" ? entity._id : null,
      trailerId: !fleetUnit && normalizedAssetType === "trailer" ? entity._id : null,
      fleetUnitId: fleetUnit ? fleetUnit._id : null,
      title: title || '',
      documentNumber,
      documentType,
      documentLocation,
      status: "completed",
      expiryDate,
      issuedAt,
      ignoreExpiration: ignoreExpiration === 'true' || ignoreExpiration === true || false,
      company: fleetUnit?.company || entity?.company || req.user?.company || null,
      files: fileMeta ? [fileMeta] : [],
    };

    console.log('📝 Document data to save:', JSON.stringify(documentData, null, 2));

    // Validate that we have either a file or documentNumber (at least some data)
    if (!fileMeta && !documentNumber) {
      console.error('❌ Document must have either a file or documentNumber');
      return res.status(400).json({
        success: false,
        message: "Document must have either a file or documentNumber"
      });
    }

    console.log('💾 Creating document instance...');
    const document = new VehicleDocuments(documentData);

    console.log('💾 Saving document to database...');
    await document.save();
    console.log('✅ Document saved with ID:', document._id);

    // Populate the document to return full details
    console.log('🔍 Fetching saved document details...');
    const savedDocument = await VehicleDocuments.findById(document._id)
      .select('_id title documentType documentNumber expiryDate issuedAt status files documentLocation createdAt updatedAt fleetUnitId vehicleId trailerId assetType')
      .lean();

    console.log('✅ Document saved successfully:', {
      _id: savedDocument._id,
      documentType: savedDocument.documentType,
      vehicleId: savedDocument.vehicleId,
      fleetUnitId: savedDocument.fleetUnitId,
      filesCount: savedDocument.files?.length || 0,
      documentNumber: savedDocument.documentNumber
    });

    // Generate signed URLs for files if they exist
    const docWithSignedUrls = { ...savedDocument };
    if (docWithSignedUrls.files && Array.isArray(docWithSignedUrls.files)) {
      docWithSignedUrls.files = await Promise.all(docWithSignedUrls.files.map(async (file) => {
        if (file.fileUrl && (file.fileUrl.includes('s3.amazonaws.com') || file.fileUrl.includes('.s3.'))) {
          try {
            const cleanUrl = file.fileUrl.split('?')[0].split('#')[0];
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

            // Determine content type from file extension
            let contentType = file.fileType || 'application/octet-stream';
            if (file.fileName) {
              const ext = file.fileName.split('.').pop()?.toLowerCase();
              if (ext === 'pdf') contentType = 'application/pdf';
              else if (['jpg', 'jpeg'].includes(ext)) contentType = 'image/jpeg';
              else if (ext === 'png') contentType = 'image/png';
              else if (ext === 'gif') contentType = 'image/gif';
            }

            const command = new GetObjectCommand({
              Bucket: bucketName,
              Key: key,
              ResponseContentType: contentType,
            });

            const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
            return { ...file, fileUrl: signedUrl };
          } catch (error) {
            console.error('Error generating signed URL for document file:', error);
            return file; // Return original file if signing fails
          }
        }
        return file;
      }));
    }

    // Generate signed URL for documentLocation if it's an S3 URL
    if (docWithSignedUrls.documentLocation && (docWithSignedUrls.documentLocation.includes('s3.amazonaws.com') || docWithSignedUrls.documentLocation.includes('.s3.'))) {
      try {
        const cleanUrl = docWithSignedUrls.documentLocation.split('?')[0].split('#')[0];
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

        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentType: 'application/pdf',
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        docWithSignedUrls.documentLocation = signedUrl;
      } catch (error) {
        console.error('Error generating signed URL for documentLocation:', error);
      }
    }

    res.status(201).json({
      success: true,
      message: "Document created successfully",
      document: docWithSignedUrls
    });
  } catch (error) {
    console.error('❌ ERROR in createDocument:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Update Document
export const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    const existingDoc = await VehicleDocuments.findById(id);
    if (!existingDoc) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === "superadmin";

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = new mongoose.Types.ObjectId(companyId);
    }

    const updatePayload = { $set: {} };

    let newAssetType = updateData.assetType || existingDoc.assetType || (existingDoc.trailerId ? "trailer" : "vehicle");
    newAssetType = newAssetType === "trailer" ? "trailer" : "vehicle";

    let entityCompanyId = null;

    let normalizedFleetUnitId;
    if (updateData.fleetUnitId !== undefined) {
      normalizedFleetUnitId = updateData.fleetUnitId ? updateData.fleetUnitId : null;
    } else if (existingDoc.fleetUnitId) {
      // Convert ObjectId to string if needed
      normalizedFleetUnitId = existingDoc.fleetUnitId.toString ? existingDoc.fleetUnitId.toString() : existingDoc.fleetUnitId;
    }

    if (normalizedFleetUnitId) {
      // Extract real ID from prefixed ID if necessary
      // Ensure it's a string before calling extractRealId
      const realFleetUnitId = extractRealId(normalizedFleetUnitId);

      let fleetUnit = null;

      // Strategy 1: Try to find FleetUnit by _id first, then by internalId if _id is not valid
      if (isValidObjectId(realFleetUnitId)) {
        try {
          // Use findOne with explicit _id query to avoid casting errors
          fleetUnit = await FleetUnit.findOne({ _id: new mongoose.Types.ObjectId(realFleetUnitId) });
        } catch (err) {
          console.error(`Error finding FleetUnit by _id ${realFleetUnitId}:`, err.message);
        }
      }

      // Strategy 2: If not found by _id, try to find by internalId or unitNo
      if (!fleetUnit && realFleetUnitId) {
        try {
          fleetUnit = await FleetUnit.findOne({
            $or: [
              { internalId: realFleetUnitId },
              { unitNo: realFleetUnitId }
            ]
          });
        } catch (err) {
          console.error(`Error finding FleetUnit by internalId/unitNo ${realFleetUnitId}:`, err.message);
        }
      }

      // Strategy 3: If still not found, try to find by the original prefixed ID (might be stored as internalId)
      if (!fleetUnit && normalizedFleetUnitId && normalizedFleetUnitId !== realFleetUnitId) {
        try {
          fleetUnit = await FleetUnit.findOne({
            $or: [
              { internalId: normalizedFleetUnitId },
              { unitNo: normalizedFleetUnitId }
            ]
          });
        } catch (err) {
          console.error(`Error finding FleetUnit by prefixed ID ${normalizedFleetUnitId}:`, err.message);
        }
      }

      if (!fleetUnit) {
        return res.status(404).json({
          success: false,
          message: `Fleet unit not found with ID: ${normalizedFleetUnitId}`
        });
      }
      entityCompanyId = fleetUnit.company ? fleetUnit.company.toString() : null;
      newAssetType = fleetUnit.unitType === "Truck" ? "vehicle" : "trailer";
      updatePayload.$set.fleetUnitId = fleetUnit._id;
      updatePayload.$set.vehicleId = null;
      updatePayload.$set.trailerId = null;
    } else if (newAssetType === "trailer") {
      const targetTrailerId = updateData.trailerId || existingDoc.trailerId;
      if (!targetTrailerId) {
        return res.status(400).json({ success: false, message: "trailerId is required for trailer documents." });
      }
      const trailer = await Trailer.findById(targetTrailerId);
      if (!trailer) {
        return res.status(404).json({ success: false, message: "Trailer not found" });
      }
      entityCompanyId = trailer.company ? trailer.company.toString() : null;
      updatePayload.$set.trailerId = trailer._id;
      updatePayload.$set.vehicleId = null;
      updatePayload.$set.fleetUnitId = null;
    } else {
      const targetVehicleId = updateData.vehicleId || existingDoc.vehicleId;
      if (!targetVehicleId) {
        return res.status(400).json({ success: false, message: "vehicleId is required for vehicle documents." });
      }
      const vehicle = await Vehicle.findById(targetVehicleId);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: "Vehicle not found" });
      }
      entityCompanyId = vehicle.company ? vehicle.company.toString() : null;
      updatePayload.$set.vehicleId = vehicle._id;
      updatePayload.$set.trailerId = null;
      updatePayload.$set.fleetUnitId = null;
    }

    if (!isSuperadmin && companyId && entityCompanyId && entityCompanyId !== companyId) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have permission to modify documents for this asset." });
    }

    updatePayload.$set.assetType = newAssetType;
    // Handle title
    if (updateData.title !== undefined) {
      updatePayload.$set.title = updateData.title || '';
    } else {
      updatePayload.$set.title = existingDoc.title != null ? existingDoc.title : '';
    }
    // Handle documentNumber - allow empty string to clear it
    if (updateData.documentNumber !== undefined) {
      updatePayload.$set.documentNumber = updateData.documentNumber || '';
    } else {
      updatePayload.$set.documentNumber = existingDoc.documentNumber;
    }
    // Handle documentType - allow empty string
    if (updateData.documentType !== undefined) {
      updatePayload.$set.documentType = updateData.documentType || '';
    } else {
      updatePayload.$set.documentType = existingDoc.documentType;
    }
    // Handle expiryDate - allow empty string or null to clear it
    if (updateData.expiryDate !== undefined) {
      updatePayload.$set.expiryDate = updateData.expiryDate ? new Date(updateData.expiryDate) : null;
    } else {
      updatePayload.$set.expiryDate = existingDoc.expiryDate;
    }
    // Handle issuedAt
    if (updateData.issuedAt !== undefined) {
      updatePayload.$set.issuedAt = updateData.issuedAt ? new Date(updateData.issuedAt) : null;
    } else {
      updatePayload.$set.issuedAt = existingDoc.issuedAt;
    }
    // Handle status
    if (updateData.status !== undefined) {
      updatePayload.$set.status = updateData.status || existingDoc.status;
    } else {
      updatePayload.$set.status = existingDoc.status;
    }
    // Handle ignoreExpiration
    if (updateData.ignoreExpiration !== undefined) {
      updatePayload.$set.ignoreExpiration = updateData.ignoreExpiration === 'true' || updateData.ignoreExpiration === true;
    } else {
      updatePayload.$set.ignoreExpiration = existingDoc.ignoreExpiration || false;
    }
    updatePayload.$set.company = existingDoc.company;

    if (req.file) {
      let documentLocation;
      if (process.env.NODE_ENV === "production") {
        documentLocation = req.file.location;
      } else {
        documentLocation = `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, "/")}`;
      }
      updatePayload.$set.documentLocation = documentLocation;
      const fileMeta = {
        fileName: req.file.originalname,
        fileUrl: documentLocation,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        uploadedAt: new Date(),
      };
      updatePayload.$push = { files: fileMeta };
    }

    const updatedDoc = await VehicleDocuments.findOneAndUpdate(query, updatePayload, { new: true });

    if (!updatedDoc) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    // Generate signed URLs for files if they exist
    const docWithSignedUrls = updatedDoc.toObject();
    if (docWithSignedUrls.files && Array.isArray(docWithSignedUrls.files)) {
      docWithSignedUrls.files = await Promise.all(docWithSignedUrls.files.map(async (file) => {
        if (file.fileUrl && (file.fileUrl.includes('s3.amazonaws.com') || file.fileUrl.includes('.s3.'))) {
          try {
            const cleanUrl = file.fileUrl.split('?')[0].split('#')[0];
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

            // Determine content type from file extension
            let contentType = file.fileType || 'application/octet-stream';
            if (file.fileName) {
              const ext = file.fileName.split('.').pop()?.toLowerCase();
              if (ext === 'pdf') contentType = 'application/pdf';
              else if (['jpg', 'jpeg'].includes(ext)) contentType = 'image/jpeg';
              else if (ext === 'png') contentType = 'image/png';
              else if (ext === 'gif') contentType = 'image/gif';
            }

            const command = new GetObjectCommand({
              Bucket: bucketName,
              Key: key,
              ResponseContentType: contentType,
            });

            const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
            return { ...file, fileUrl: signedUrl };
          } catch (error) {
            console.error('Error generating signed URL for document file:', error);
            return file; // Return original file if signing fails
          }
        }
        return file;
      }));
    }

    // Generate signed URL for documentLocation if it's an S3 URL
    if (docWithSignedUrls.documentLocation && (docWithSignedUrls.documentLocation.includes('s3.amazonaws.com') || docWithSignedUrls.documentLocation.includes('.s3.'))) {
      try {
        const cleanUrl = docWithSignedUrls.documentLocation.split('?')[0].split('#')[0];
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

        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentType: 'application/pdf',
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        docWithSignedUrls.documentLocation = signedUrl;
      } catch (error) {
        console.error('Error generating signed URL for documentLocation:', error);
      }
    }

    res.json({ success: true, message: "Document updated successfully", updatedDoc: docWithSignedUrls });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Delete Document
export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const deletedDoc = await VehicleDocuments.findOneAndDelete(query);

    if (!deletedDoc) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    res.json({ success: true, message: "Document deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ List All Documents (grouped by vehicle with details)
export const listDocuments = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { assetType } = req.query;
    const normalizedAssetType =
      assetType === 'vehicle' || assetType === 'trailer' ? assetType : null;

    if (!isSuperadmin && !companyId) {
      return res.json({ success: true, message: "No company assigned to the current admin.", documentsByVehicle: [] });
    }

    const matchStage = {};
    const entityFilter = {};
    if (!isSuperadmin && companyId) {
      const companyObjectId = new mongoose.Types.ObjectId(companyId);
      matchStage.company = companyObjectId;
      entityFilter.company = companyObjectId;
    }

    const documents = await VehicleDocuments.find(matchStage)
      .populate({ path: "vehicleId", select: "internalId plateNumber make model year status company" })
      .populate({ path: "trailerId", select: "trailer plateNumber type status operationStatus capacity company internalId" })
      .populate({ path: "fleetUnitId", select: "unitNo unitType make model makeModel licensePlate year status operationStatus trailerType capacity company" })
      .lean();

    const docMap = new Map();

    // Process documents with async operations
    await Promise.all(documents.map(async (doc) => {
      let assetType = doc.assetType;
      let entity = null;
      let sourceType = "vehicle";

      if (doc.fleetUnitId) {
        entity = doc.fleetUnitId;
        assetType = assetType || (entity.unitType === "Truck" ? "vehicle" : "trailer");
        sourceType = "fleetUnit";
      } else if (doc.trailerId) {
        entity = doc.trailerId;
        assetType = "trailer";
        sourceType = "trailer";
      } else if (doc.vehicleId) {
        entity = doc.vehicleId;
        assetType = "vehicle";
        sourceType = "vehicle";
      } else {
        return;
      }

      const key = `${assetType}:${entity._id.toString()}`;
      if (!docMap.has(key)) {
        docMap.set(key, {
          _id: entity._id,
          assetType,
          vehicle: normalizeEntity(entity, assetType),
          documents: [],
          sourceType,
        });
      }

      const entry = docMap.get(key);
      if (!entry.sourceType) {
        entry.sourceType = sourceType;
      }

      // Generate signed URLs for document files
      const filesWithSignedUrls = await Promise.all((doc.files || []).map(async (file) => {
        if (file.fileUrl && (file.fileUrl.includes('s3.amazonaws.com') || file.fileUrl.includes('.s3.'))) {
          try {
            const cleanUrl = file.fileUrl.split('?')[0].split('#')[0];
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

            // Determine content type from file extension
            let contentType = file.fileType || 'application/octet-stream';
            if (file.fileName) {
              const ext = file.fileName.split('.').pop()?.toLowerCase();
              if (ext === 'pdf') contentType = 'application/pdf';
              else if (['jpg', 'jpeg'].includes(ext)) contentType = 'image/jpeg';
              else if (ext === 'png') contentType = 'image/png';
              else if (ext === 'gif') contentType = 'image/gif';
            }

            const command = new GetObjectCommand({
              Bucket: bucketName,
              Key: key,
              ResponseContentType: contentType,
            });

            const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
            return { ...file, fileUrl: signedUrl };
          } catch (error) {
            console.error('Error generating signed URL for document file:', error);
            return file; // Return original file if signing fails
          }
        }
        return file;
      }));

      // Generate signed URL for documentLocation if it's an S3 URL
      let documentLocation = doc.documentLocation;
      if (documentLocation && (documentLocation.includes('s3.amazonaws.com') || documentLocation.includes('.s3.'))) {
        try {
          const cleanUrl = documentLocation.split('?')[0].split('#')[0];
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

          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
            ResponseContentType: 'application/pdf',
          });

          const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
          documentLocation = signedUrl;
        } catch (error) {
          console.error('Error generating signed URL for documentLocation:', error);
        }
      }

      entry.documents.push({
        _id: doc._id,
        assetType,
        vehicleId: doc.vehicleId ? doc.vehicleId._id : undefined,
        trailerId: doc.trailerId ? doc.trailerId._id : undefined,
        fleetUnitId: doc.fleetUnitId ? doc.fleetUnitId._id : undefined,
        title: doc.title,
        documentNumber: doc.documentNumber,
        documentType: doc.documentType,
        documentLocation: documentLocation,
        status: doc.status,
        expiryDate: doc.expiryDate,
        issuedAt: doc.issuedAt,
        ignoreExpiration: doc.ignoreExpiration,
        createdAt: doc.createdAt,
        files: filesWithSignedUrls,
      });
    }));

    const vehiclesList = await Vehicle.find(entityFilter)
      .select("internalId plateNumber make model year status company")
      .lean();

    vehiclesList.forEach((vehicle) => {
      const key = `vehicle:${vehicle._id.toString()}`;
      if (!docMap.has(key)) {
        docMap.set(key, {
          _id: vehicle._id,
          assetType: "vehicle",
          vehicle: normalizeEntity(vehicle, "vehicle"),
          documents: [],
          sourceType: "vehicle",
        });
      }
    });

    const trailersList = await Trailer.find(entityFilter)
      .select("trailer plateNumber type status operationStatus capacity company internalId")
      .lean();

    trailersList.forEach((trailer) => {
      const key = `trailer:${trailer._id.toString()}`;
      if (!docMap.has(key)) {
        docMap.set(key, {
          _id: trailer._id,
          assetType: "trailer",
          vehicle: normalizeEntity(trailer, "trailer"),
          documents: [],
          sourceType: "trailer",
        });
      }
    });

    const fleetUnitsList = await FleetUnit.find(entityFilter)
      .select("unitNo unitType make model makeModel licensePlate year status operationStatus trailerType capacity company")
      .lean();

    fleetUnitsList.forEach((unit) => {
      const entry = mapFleetUnitToEntry(unit);
      const key = `${entry.assetType}:${unit._id.toString()}`;
      // If entry already exists (from documents), merge documents but keep existing entry
      // Otherwise, add the entry
      if (!docMap.has(key)) {
        docMap.set(key, entry);
      } else {
        // Entry exists, ensure it has all the correct fields from FleetUnit
        const existing = docMap.get(key);
        // Update vehicle data with FleetUnit data if it's more complete
        const fleetUnitVehicle = entry.vehicle;
        const existingVehicle = existing.vehicle;

        // Prefer FleetUnit data if it has more complete information
        if (fleetUnitVehicle.plateNumber && !existingVehicle.plateNumber) {
          existing.vehicle.plateNumber = fleetUnitVehicle.plateNumber;
        }
        if (fleetUnitVehicle.internalId && !existingVehicle.internalId) {
          existing.vehicle.internalId = fleetUnitVehicle.internalId;
        }
        if (fleetUnitVehicle.type && !existingVehicle.type) {
          existing.vehicle.type = fleetUnitVehicle.type;
        }
        if (fleetUnitVehicle.make && existingVehicle.make === "Trailer") {
          existing.vehicle.make = fleetUnitVehicle.make;
        }
      }
    });

    const combined = Array.from(docMap.values());
    const filteredCombined = normalizedAssetType
      ? combined.filter((item) => item.assetType === normalizedAssetType)
      : combined;

    res.json({ success: true, documentsByVehicle: filteredCombined });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ GET VEHICLE DOCUMENTS EXPIRING SOON
export const getExpiringVehicleDocuments = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const companyId = getUserCompanyId(req.user);
    console.log("companyId", companyId)
    const isSuperadmin = req.user?.role === 'superadmin';


    console.log(`🔄 Fetching vehicle documents expiring within ${days} days for company: ${companyId || 'all'}`);

    // If user has no company, return empty result (documents are company-based)
    if (!isSuperadmin && !companyId) {
      return res.status(200).json({
        success: true,
        message: "No company assigned. Please complete company settings to view documents.",
        data: []
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(days));
    futureDate.setHours(23, 59, 59, 999);



    // // Convert dates to ISO string format (YYYY-MM-DD) for string comparison
    const todayStr = today.toISOString().split('T')[0];
    const futureDateStr = futureDate.toISOString().split('T')[0];

    // Build query with company filter
    // Since expiryDate is stored as String, we compare as strings
    // Exclude documents with ignoreExpiration: true
    const query = {
      expiryDate: {
        $gte: todayStr,
        $lte: futureDateStr
      },
      // Don't filter by status - include all documents that are expiring (status can be updated by cron job)
      // But exclude already expired documents
      status: { $ne: 'expired' },
      ignoreExpiration: { $ne: true } // Exclude documents with ignoreExpiration: true
    };

    // Filter by company if not superadmin
    // For vehicle documents, we need to check both document.company and vehicle/trailer.company
    if (!isSuperadmin && companyId) {
      const companyObjectId = new mongoose.Types.ObjectId(companyId);

      // Find vehicles and trailers for this company
      const companyVehicles = await Vehicle.find({ company: companyObjectId }).select('_id').lean();
      const companyTrailers = await Trailer.find({ company: companyObjectId }).select('_id').lean();
      const companyFleetUnits = await FleetUnit.find({ company: companyObjectId }).select('_id').lean();
      const vehicleIds = companyVehicles.map(v => v._id);
      const trailerIds = companyTrailers.map(t => t._id);
      const fleetUnitIds = companyFleetUnits.map(f => f._id);

      // Build $or conditions
      const orConditions = [{ company: companyObjectId }];

      if (vehicleIds.length > 0) {
        orConditions.push({ vehicleId: { $in: vehicleIds } });
      }

      if (trailerIds.length > 0) {
        orConditions.push({ trailerId: { $in: trailerIds } });
      }

      if (fleetUnitIds.length > 0) {
        orConditions.push({ fleetUnitId: { $in: fleetUnitIds } });
      }

      // Match documents that either:
      // 1. Have the company field set to this company, OR
      // 2. Belong to a vehicle/trailer in this company
      if (orConditions.length > 0) {
        query.$or = orConditions;
      } else {
        // No vehicles or trailers in company, return empty
        return res.status(200).json({
          success: true,
          data: []
        });
      }
    }

    console.log('🔍 Query:', JSON.stringify(query, null, 2));

    console.log("------------------------------------query----------------------------------------------------------------------")

    console.log("query", query)

    const documents = await VehicleDocuments.find(query)
      .populate({ path: 'vehicleId', select: 'make model plateNumber internalId year company' })
      .populate({ path: 'trailerId', select: 'trailer type plateNumber internalId capacity company' })
      .populate({ path: 'fleetUnitId', select: 'unitNo unitType make model makeModel licensePlate year status operationStatus trailerType capacity company' })
      // .sort({ expiryDate: 1 })
      .lean();
    console.log("-------------------------------vehicle documents-------------------------------------------------------------", documents);

    console.log(`🔍 Found ${documents.length} documents matching query`);

    // Format documents with vehicle/trailer info and generate signed URLs
    const formattedDocuments = await Promise.all(documents.map(async (doc) => {
      let assetType = doc.assetType;
      let entity = null;

      if (doc.fleetUnitId) {
        entity = doc.fleetUnitId;
        assetType = assetType || (entity.unitType === 'Truck' ? 'vehicle' : 'trailer');
      } else if (doc.trailerId) {
        entity = doc.trailerId;
        assetType = 'trailer';
      } else {
        entity = doc.vehicleId;
        assetType = 'vehicle';
      }

      const normalizedVehicle = doc.fleetUnitId
        ? mapFleetUnitToEntry(doc.fleetUnitId).vehicle
        : entity
          ? normalizeEntity(entity, assetType)
          : null;

      // Generate signed URLs for document files
      const filesWithSignedUrls = await Promise.all((doc.files || []).map(async (file) => {
        if (file.fileUrl && (file.fileUrl.includes('s3.amazonaws.com') || file.fileUrl.includes('.s3.'))) {
          try {
            const cleanUrl = file.fileUrl.split('?')[0].split('#')[0];
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

            // Determine content type from file extension
            let contentType = file.fileType || 'application/octet-stream';
            if (file.fileName) {
              const ext = file.fileName.split('.').pop()?.toLowerCase();
              if (ext === 'pdf') contentType = 'application/pdf';
              else if (['jpg', 'jpeg'].includes(ext)) contentType = 'image/jpeg';
              else if (ext === 'png') contentType = 'image/png';
              else if (ext === 'gif') contentType = 'image/gif';
            }

            const command = new GetObjectCommand({
              Bucket: bucketName,
              Key: key,
              ResponseContentType: contentType,
            });

            const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
            return { ...file, fileUrl: signedUrl };
          } catch (error) {
            console.error('Error generating signed URL for document file:', error);
            return file; // Return original file if signing fails
          }
        }
        return file;
      }));

      // Generate signed URL for documentLocation if it's an S3 URL
      let documentLocation = doc.documentLocation;
      if (documentLocation && (documentLocation.includes('s3.amazonaws.com') || documentLocation.includes('.s3.'))) {
        try {
          const cleanUrl = documentLocation.split('?')[0].split('#')[0];
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

          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
            ResponseContentType: 'application/pdf',
          });

          const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
          documentLocation = signedUrl;
        } catch (error) {
          console.error('Error generating signed URL for documentLocation:', error);
        }
      }

      return {
        _id: doc._id,
        assetType,
        title: doc.title,
        documentType: doc.documentType,
        documentNumber: doc.documentNumber,
        documentLocation: documentLocation,
        expiryDate: doc.expiryDate,
        issuedAt: doc.issuedAt,
        status: doc.status,
        vehicle: normalizedVehicle,
        vehicleId: doc.vehicleId?._id,
        trailerId: doc.trailerId?._id,
        fleetUnitId: doc.fleetUnitId?._id,
        files: filesWithSignedUrls,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      };
    }));

    console.log(`✅ Found ${formattedDocuments.length} vehicle documents expiring within ${days} days`);

    res.status(200).json({
      success: true,
      data: formattedDocuments
    });

  } catch (error) {
    console.error('❌ Error fetching expiring vehicle documents:', error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

// ✅ GET SIGNED URL FOR VEHICLE DOCUMENT FILE
export const getSignedVehicleDocumentUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileIndex = 0, disposition = 'inline' } = req.query; // 'inline' for viewing, 'attachment' for downloading
    const fileIdx = parseInt(fileIndex, 10);

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = new mongoose.Types.ObjectId(companyId);
    }

    const doc = await VehicleDocuments.findOne(query);


    if (!doc) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    // Get file from files array or use documentLocation
    let fileUrl = null;
    let fileType = null;
    let fileName = null;

    if (doc.files && doc.files.length > 0 && doc.files[fileIdx]) {
      fileUrl = doc.files[fileIdx].fileUrl;
      fileType = doc.files[fileIdx].fileType;
      fileName = doc.files[fileIdx].fileName;
    } else if (doc.documentLocation) {
      fileUrl = doc.documentLocation;
      // Try to infer file type from URL
      const urlMatch = doc.documentLocation.match(/\.([^.]+)(\?|$)/);
      if (urlMatch) {
        const ext = urlMatch[1].toLowerCase();
        const typeMap = {
          'pdf': 'application/pdf',
          'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
        };
        fileType = typeMap[ext] || 'application/octet-stream';
        // Extract filename from URL if possible
        const pathParts = doc.documentLocation.split('/');
        fileName = pathParts[pathParts.length - 1].split('?')[0] || 'document';
      }
    }

    // Create a file object for logging
    const file = { fileName: fileName || 'document', fileType };

    if (!fileUrl) {
      return res.status(400).json({ success: false, message: "File URL not found" });
    }

    // Check if URL is an S3 URL
    const isS3Url = fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.');

    if (isS3Url) {
      try {
        // Extract bucket and key from S3 URL
        const cleanUrl = fileUrl.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let key = decodeURIComponent(urlObj.pathname.substring(1));

        // Handle different S3 URL formats
        if (urlObj.hostname.includes('.s3.')) {
          bucketName = urlObj.hostname.split('.s3.')[0];
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          bucketName = pathParts[0];
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }

        // Clean up key
        if (key.includes('?')) {
          key = key.split('?')[0];
        }
        if (key.includes('&')) {
          key = key.split('&')[0];
        }

        // Remove signature data that might be appended to filename
        const fileExtensionPattern = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|gif|webp|txt|csv|zip|rar)/i;
        const extensionMatch = key.match(fileExtensionPattern);
        if (extensionMatch) {
          const extensionEndIndex = extensionMatch.index + extensionMatch[0].length;
          const baseKey = key.substring(0, extensionEndIndex);
          const afterExtension = key.substring(extensionEndIndex);

          if (afterExtension && /^[A-Za-z0-9+/=]{20,}/.test(afterExtension)) {
            key = baseKey;
          }
        } else {
          key = key.replace(/[A-Za-z0-9+/=]{50,}$/, '').replace(/[+/=]+$/, '');
        }

        console.log('🔑 Extracting S3 info for vehicle document:', {
          originalUrl: fileUrl,
          cleanUrl: cleanUrl,
          bucketName,
          key,
          hostname: urlObj.hostname
        });

        // Determine content type - ensure PDF gets correct MIME type
        const getContentType = (type) => {
          if (!type) {
            // Try to infer from filename if type is not provided
            const urlMatch = fileUrl.match(/\.([^.?#]+)(\?|#|$)/);
            if (urlMatch) {
              const ext = urlMatch[1].toLowerCase();
              if (ext === 'pdf') return 'application/pdf';
            }
          }

          const typeMap = {
            'pdf': 'application/pdf',
            'application/pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'txt': 'text/plain',
            'csv': 'text/csv',
          };

          // Check both direct match and lowercase match
          const lowerType = type?.toLowerCase();
          return typeMap[lowerType] || typeMap[type] || 'application/octet-stream';
        };

        const contentType = getContentType(fileType);
        // For inline, use just 'inline' without filename (matches company documents)
        // For attachment, include filename
        const contentDisposition = disposition === 'attachment'
          ? `attachment; filename="${encodeURIComponent(file.fileName || 'document')}"`
          : 'inline';

        console.log('🔑 Generating signed URL with disposition:', contentDisposition, 'for file:', file.fileName);
        console.log('🔑 Content Type:', contentType);
        console.log('🔑 S3 Bucket:', bucketName);
        console.log('🔑 S3 Key:', key);

        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentDisposition: contentDisposition,
          ResponseContentType: contentType,
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

        console.log('✅ Generated signed URL:', signedUrl.substring(0, 100) + '...');
        console.log('✅ URL contains inline:', signedUrl.includes('response-content-disposition=inline'));

        return res.json({
          success: true,
          url: signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('Error generating signed URL for vehicle document:', s3Error);
        return res.json({
          success: true,
          url: fileUrl,
          expiresIn: 0
        });
      }
    } else {
      // Not an S3 URL, return as-is
      return res.json({
        success: true,
        url: fileUrl,
        expiresIn: 0
      });
    }
  } catch (err) {
    console.error('Error getting signed vehicle document URL:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};


// update date format of vehicle
const updateDateFormat = async () => {
  try {
    console.log("🚀 Updating expiryDate to Date..----------------------------------.......................---------------------.");

    await VehicleDocuments.updateMany(
      {},
      [
        {
          $set: {
            expiryDate: {
              $cond: {
                if: { $eq: [{ $type: "$expiryDate" }, "string"] },
                then: {
                  $toDate: {
                    $replaceOne: {
                      input: "$expiryDate",
                      find: " (India Standard Time)",
                      replacement: ""
                    }
                  }
                },
                else: "$expiryDate"
              }
            }
          }
        }
      ]
    );

    console.log("✅ Updated:-=-=-=-==-=-=-==-=-=-=-=-=-=-=-=-=-=-=", result);
  } catch (err) {
    console.error("❌ Error updating date format:", err);
  }
};