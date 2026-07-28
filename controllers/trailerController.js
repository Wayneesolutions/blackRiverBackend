import { Trailer } from "../models/driver/trailerModel.js";
import { getCoordinatesFromAddress } from "../services/googlemap.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { handleError } from "../utils/errorHandler.js";
import VehicleDocuments from "../models/driver/vehicleDocumentsModel.js";
import { parseImportFile, mapRow } from "../utils/importParser.js";

// Helper function to generate signed URL for S3 images
const generateSignedUrl = async (url) => {
  if (!url || (!url.includes('s3.amazonaws.com') && !url.includes('.s3.'))) {
    return url; // Return as-is if not an S3 URL
  }

  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { s3 } = await import("../config/awsConfig.js");

    const cleanUrl = url.split('?')[0].split('#')[0];
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

    // Determine content type based on file extension
    let contentType = 'application/octet-stream'; // Default
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('.pdf')) {
      contentType = 'application/pdf';
    } else if (lowerUrl.includes('.png')) {
      contentType = 'image/png';
    } else if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (lowerUrl.includes('.gif')) {
      contentType = 'image/gif';
    } else if (lowerUrl.includes('.doc') || lowerUrl.includes('.docx')) {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (lowerUrl.includes('.xls') || lowerUrl.includes('.xlsx')) {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      ResponseContentType: contentType,
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return url; // Return original URL if signing fails
  }
};

// Helper function to process inspections with file uploads
const processInspectionsWithFiles = async (inspections, files, req) => {
  console.log('📋 [TRAILER] processInspectionsWithFiles called');
  console.log('  - Inspections count:', inspections?.length || 0);
  console.log('  - Files count:', files?.length || 0);

  if (!inspections || !Array.isArray(inspections)) {
    console.log('⚠️ No inspections or not an array');
    return [];
  }

  let fileIndex = 0;
  const processedInspections = [];

  for (let i = 0; i < inspections.length; i++) {
    const inspection = inspections[i];
    const processedInspection = { ...inspection };

    console.log(`  📝 Processing inspection ${i}:`, {
      hasFile: inspection.hasFile,
      fileName: inspection.fileName,
      fileUrl: inspection.fileUrl,
      availableFile: files[fileIndex] ? files[fileIndex].originalname : 'none'
    });

    // If the inspection has a file flag and there's a file available
    if (inspection.hasFile && files[fileIndex]) {
      const file = files[fileIndex];

      console.log(`  ✅ Attaching file to inspection ${i}:`, file.originalname);

      // Generate file URL
      if (process.env.NODE_ENV === "production") {
        processedInspection.fileUrl = file.location;
      } else {
        processedInspection.fileUrl = `${req.protocol}://${req.get("host")}/${file.path.replace(/\\/g, '/')}`;
      }
      processedInspection.fileName = file.originalname;

      console.log(`  📎 File URL generated:`, processedInspection.fileUrl);

      fileIndex++;
    } else if (inspection.fileUrl) {
      console.log(`  ℹ️ Inspection ${i} has existing fileUrl, preserving it`);
    } else {
      console.log(`  ⚠️ Inspection ${i} has no file`);
    }

    // Remove the temporary hasFile flag
    delete processedInspection.hasFile;

    processedInspections.push(processedInspection);
  }

  console.log('✅ Processed inspections:', processedInspections.length);
  return processedInspections;
};

// Helper function to process invoices with file uploads
const processInvoicesWithFiles = async (invoices, files, req) => {
  console.log('📋 [TRAILER] processInvoicesWithFiles called');
  console.log('  - Invoices count:', invoices?.length || 0);
  console.log('  - Files count:', files?.length || 0);

  if (!invoices || !Array.isArray(invoices)) {
    console.log('⚠️ No invoices or not an array');
    return [];
  }

  let fileIndex = 0;
  const processedInvoices = [];

  for (let i = 0; i < invoices.length; i++) {
    const invoice = invoices[i];
    const processedInvoice = { ...invoice };

    console.log(`  📝 Processing invoice ${i}:`, {
      invoiceNumber: invoice.invoiceNumber,
      hasFile: invoice.hasFile,
      fileName: invoice.fileName,
      fileUrl: invoice.fileUrl,
      availableFile: files[fileIndex] ? files[fileIndex].originalname : 'none'
    });

    // If the invoice has a file flag and there's a file available
    if (invoice.hasFile && files[fileIndex]) {
      const file = files[fileIndex];

      console.log(`  ✅ Attaching file to invoice ${i}:`, file.originalname);

      // Generate file URL
      if (process.env.NODE_ENV === "production") {
        processedInvoice.fileUrl = file.location;
      } else {
        processedInvoice.fileUrl = `${req.protocol}://${req.get("host")}/${file.path.replace(/\\/g, '/')}`;
      }
      processedInvoice.fileName = file.originalname;
      processedInvoice.fileSize = file.size;
      processedInvoice.mimeType = file.mimetype;

      console.log(`  📎 File URL generated:`, processedInvoice.fileUrl);

      fileIndex++;
    } else if (invoice.fileUrl) {
      console.log(`  ℹ️ Invoice ${i} has existing fileUrl, preserving it`);
    } else {
      console.log(`  ⚠️ Invoice ${i} has no file`);
    }

    // Parse invoiceDate if it's a string
    if (processedInvoice.invoiceDate && typeof processedInvoice.invoiceDate === 'string') {
      processedInvoice.invoiceDate = new Date(processedInvoice.invoiceDate);
    }

    // Remove the temporary hasFile flag
    delete processedInvoice.hasFile;

    processedInvoices.push(processedInvoice);
  }

  console.log('✅ Processed invoices:', processedInvoices.length);
  return processedInvoices;
};

// Helper function to process incidents with file uploads
const processIncidentsWithFiles = async (incidents, req) => {
  console.log('🚨 [TRAILER] processIncidentsWithFiles called');
  console.log('  - Incidents count:', incidents?.length || 0);

  if (!incidents || !Array.isArray(incidents)) {
    console.log('⚠️ No incidents or not an array');
    return [];
  }

  const processedIncidents = [];

  for (let i = 0; i < incidents.length; i++) {
    const incident = incidents[i];
    const processedIncident = { ...incident };

    console.log(`  🚨 Processing incident ${i}:`, {
      accidentNumber: incident.accidentNumber,
      fileCount: incident.fileCount || 0
    });

    // Clean up empty string values for driver and coDriver to prevent CastError
    if (processedIncident.driver === '' || processedIncident.driver === null) {
      delete processedIncident.driver;
    }
    if (processedIncident.coDriver === '' || processedIncident.coDriver === null) {
      delete processedIncident.coDriver;
    }

    // Process files for this incident
    const incidentFiles = req.files?.[`incidentFiles_${i}`] || [];
    console.log(`  📎 Files for incident ${i}:`, incidentFiles.length);

    if (incidentFiles.length > 0) {
      processedIncident.files = incidentFiles.map(file => {
        let fileUrl;
        if (process.env.NODE_ENV === "production") {
          fileUrl = file.location;
        } else {
          fileUrl = `${req.protocol}://${req.get("host")}/${file.path.replace(/\\/g, '/')}`;
        }

        return {
          fileName: file.originalname,
          fileUrl: fileUrl,
          fileSize: file.size,
          fileType: file.mimetype,
          uploadedAt: new Date()
        };
      });
      console.log(`  ✅ Added ${processedIncident.files.length} files to incident ${i}`);
    } else {
      processedIncident.files = [];
    }

    // Remove temporary fields
    delete processedIncident.fileCount;
    delete processedIncident.fileNames;

    processedIncidents.push(processedIncident);
  }

  console.log('✅ Processed incidents:', processedIncidents.length);
  return processedIncidents;
};

// ✅ Create Trailer
export const createTrailer = async (req, res) => {
  try {
    console.log('🚛 ========== CREATE TRAILER REQUEST ==========');
    console.log('📦 req.body keys:', Object.keys(req.body));
    console.log('📦 req.files:', req.files ? Object.keys(req.files) : 'none');

    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating trailers. Go to Company Settings to set up your company."
        });
      }
    }

    const { address, ...otherData } = req.body;
    console.log('📋 Inspections in req.body:', {
      oneTimeInspections: otherData.oneTimeInspections ? 'present' : 'missing',
      recurringInspections: otherData.recurringInspections ? 'present' : 'missing'
    });

    // Handle image upload
    let imageUrl = null;
    const imageFile = req.files?.image ? req.files.image[0] : null;
    if (imageFile) {
      if (process.env.NODE_ENV === "production") {
        imageUrl = imageFile.location;
      } else {
        imageUrl = `${req.protocol}://${req.get("host")}/${imageFile.path.replace(/\\/g, '/')}`;
      }
    }

    // Extract inspection and incident files
    const oneTimeInspectionFiles = req.files?.oneTimeInspectionFiles || [];
    const recurringInspectionFiles = req.files?.recurringInspectionFiles || [];
    const invoiceFiles = req.files?.invoiceFiles || [];

    console.log('📦 [TRAILER CREATE] Files received:', {
      image: imageFile ? imageFile.originalname : 'none',
      oneTimeInspectionFiles: oneTimeInspectionFiles.length,
      recurringInspectionFiles: recurringInspectionFiles.length,
      invoiceFiles: invoiceFiles.length,
      incidentFiles: req.files ? Object.keys(req.files).filter(k => k.startsWith('incidentFiles_')).length : 0
    });

    // Get coordinates from address if provided
    let coordinates = { latitude: null, longitude: null };
    if (address && address.trim()) {
      coordinates = await getCoordinatesFromAddress(address);
    }

    // Process inspections with files
    const oneTimeInspections = await processInspectionsWithFiles(
      otherData.oneTimeInspections ? (typeof otherData.oneTimeInspections === 'string' ? JSON.parse(otherData.oneTimeInspections) : otherData.oneTimeInspections) : [],
      oneTimeInspectionFiles,
      req
    );

    const recurringInspections = await processInspectionsWithFiles(
      otherData.recurringInspections ? (typeof otherData.recurringInspections === 'string' ? JSON.parse(otherData.recurringInspections) : otherData.recurringInspections) : [],
      recurringInspectionFiles,
      req
    );

    // Process incidents with files
    const incidents = await processIncidentsWithFiles(
      otherData.incidents ? (typeof otherData.incidents === 'string' ? JSON.parse(otherData.incidents) : otherData.incidents) : [],
      req
    );

    // Process notes
    const notesArray = otherData.notesArray ? (typeof otherData.notesArray === 'string' ? JSON.parse(otherData.notesArray) : otherData.notesArray) : [];

    // Process invoices with files
    const invoices = await processInvoicesWithFiles(
      otherData.invoices ? (typeof otherData.invoices === 'string' ? JSON.parse(otherData.invoices) : otherData.invoices) : [],
      invoiceFiles,
      req
    );

    // Map frontend fields to model fields
    const unitNumber = otherData.unitNumber || otherData.trailerNumber;
    const trailerNumber = otherData.trailer || otherData.trailerNumber || unitNumber || `TRL-${Date.now()}`;

    // Prepare trailer data
    const trailerData = {
      // Basic Information
      unitNumber: unitNumber,
      trailer: trailerNumber,
      internalId: unitNumber || trailerNumber,
      vinNumber: otherData.vinNumber,
      plateNumber: otherData.plateNumber,
      make: otherData.make,
      model: otherData.model,
      year: otherData.year,
      weight: otherData.weight,
      uom: otherData.uom || 'Kg',
      registrationCountry: otherData.registrationCountry,
      registrationProvince: otherData.registrationProvince,
      type: otherData.type,
      status: otherData.status || 'In Service',
      ownership: otherData.ownership || 'COMPANY ASSET',
      subType: otherData.subType || '',

      // Image
      imageUrl: imageUrl,
      trailerImageUrl: imageUrl,

      // Legacy fields
      ownerShip: otherData.ownership || 'COMPANY ASSET',
      operationStatus: otherData.operationStatus || otherData.status || 'IN SERVICE',
      loadedStatus: otherData.loadedStatus,
      compliance: otherData.compliance,
      category: otherData.category,
      notes: otherData.notes || otherData.note,
      note: otherData.note || otherData.notes,
      lastDispatch: otherData.lastDispatch,
      lastDispatchDate: otherData.lastDispatchDate ? new Date(otherData.lastDispatchDate) : undefined,
      lastDropLocation: otherData.lastDropLocation,

      // Handle attachedVehicle - only set if it's a valid ObjectId or remove if empty
      attachedVehicle: otherData.attachedVehicle && otherData.attachedVehicle.trim() ? otherData.attachedVehicle : undefined,

      // Yard assignment
      yard: otherData.yard && otherData.yard.trim() ? otherData.yard : undefined,

      // Set current location with coordinates
      currentLocation: {
        address: address || '',
        latitude: coordinates.latitude ? coordinates.latitude.toString() : '',
        longitude: coordinates.longitude ? coordinates.longitude.toString() : '',
        updatedAt: new Date()
      },

      // Inspections
      oneTimeInspections: oneTimeInspections,
      recurringInspections: recurringInspections,

      // Incidents
      incidents: incidents,

      // Notes
      notesArray: notesArray,

      // Invoices
      invoices: invoices,

      // Set company - required for non-superadmin users
      company: req.user.company || undefined
    };

    console.log('💾 Final trailer data before save:', {
      unitNumber: trailerData.unitNumber,
      oneTimeInspections: trailerData.oneTimeInspections?.length || 0,
      recurringInspections: trailerData.recurringInspections?.length || 0
    });

    const trailer = new Trailer(trailerData);
    const savedTrailer = await trailer.save();

    console.log('✅ Trailer saved successfully with inspections:', {
      _id: savedTrailer._id,
      oneTimeInspections: savedTrailer.oneTimeInspections?.length || 0,
      recurringInspections: savedTrailer.recurringInspections?.length || 0
    });

    res.status(201).json({
      success: true,
      message: "Trailer created successfully",
      data: savedTrailer
    });
  } catch (err) {
    return handleError(err, res, 400);
  }
};

// ✅ Update Trailer
export const updateTrailer = async (req, res) => {
  try {
    console.log('🚛 ========== UPDATE TRAILER REQUEST ==========');
    console.log('📦 Trailer ID:', req.params.id);
    console.log('📦 req.body keys:', Object.keys(req.body));
    console.log('📦 req.files:', req.files ? Object.keys(req.files).map(key => `${key}: ${req.files[key].length}`) : 'none');

    const { id } = req.params;
    const { address, ...otherData } = req.body;

    // Check if trailer exists
    const existingTrailer = await Trailer.findById(id);
    if (!existingTrailer) {
      return res.status(404).json({
        success: false,
        message: "Trailer not found"
      });
    }

    // Handle image upload
    let imageUrl = existingTrailer.imageUrl;
    const imageFile = req.files?.image ? req.files.image[0] : null;
    if (imageFile) {
      if (process.env.NODE_ENV === "production") {
        imageUrl = imageFile.location;
      } else {
        imageUrl = `${req.protocol}://${req.get("host")}/${imageFile.path.replace(/\\/g, '/')}`;
      }
    }

    // Extract inspection and incident files
    const oneTimeInspectionFiles = req.files?.oneTimeInspectionFiles || [];
    const recurringInspectionFiles = req.files?.recurringInspectionFiles || [];
    const invoiceFiles = req.files?.invoiceFiles || [];

    console.log('📦 [TRAILER UPDATE] Files received:', {
      image: imageFile ? imageFile.originalname : 'none',
      oneTimeInspectionFiles: oneTimeInspectionFiles.length,
      recurringInspectionFiles: recurringInspectionFiles.length,
      invoiceFiles: invoiceFiles.length,
      incidentFiles: req.files ? Object.keys(req.files).filter(k => k.startsWith('incidentFiles_')).length : 0
    });

    // Get coordinates from address if provided
    let coordinates = existingTrailer.currentLocation || { latitude: null, longitude: null };
    if (address && address.trim()) {
      const newCoords = await getCoordinatesFromAddress(address);
      if (newCoords.latitude && newCoords.longitude) {
        coordinates = newCoords;
      }
    }

    // Process inspections with files
    const oneTimeInspections = await processInspectionsWithFiles(
      otherData.oneTimeInspections ? (typeof otherData.oneTimeInspections === 'string' ? JSON.parse(otherData.oneTimeInspections) : otherData.oneTimeInspections) : [],
      oneTimeInspectionFiles,
      req
    );

    const recurringInspections = await processInspectionsWithFiles(
      otherData.recurringInspections ? (typeof otherData.recurringInspections === 'string' ? JSON.parse(otherData.recurringInspections) : otherData.recurringInspections) : [],
      recurringInspectionFiles,
      req
    );

    // Process incidents with files
    console.log('🚨 [TRAILER UPDATE] About to process incidents');
    console.log('  - otherData.incidents:', otherData.incidents ? 'present' : 'missing');
    console.log('  - otherData.incidents type:', typeof otherData.incidents);
    if (otherData.incidents) {
      console.log('  - otherData.incidents value:', otherData.incidents);
    }

    const incidents = await processIncidentsWithFiles(
      otherData.incidents ? (typeof otherData.incidents === 'string' ? JSON.parse(otherData.incidents) : otherData.incidents) : [],
      req
    );

    console.log('✅ [TRAILER UPDATE] Incidents processed, count:', incidents.length);

    // Process notes
    const notesArray = otherData.notesArray ? (typeof otherData.notesArray === 'string' ? JSON.parse(otherData.notesArray) : otherData.notesArray) : [];

    // Process invoices with files
    const invoices = await processInvoicesWithFiles(
      otherData.invoices ? (typeof otherData.invoices === 'string' ? JSON.parse(otherData.invoices) : otherData.invoices) : [],
      invoiceFiles,
      req
    );

    // Prepare update data
    const updateData = {
      // Basic Information - only update if provided
      ...(otherData.unitNumber && { unitNumber: otherData.unitNumber }),
      ...(otherData.trailer && { trailer: otherData.trailer }),
      ...(otherData.vinNumber && { vinNumber: otherData.vinNumber }),
      ...(otherData.plateNumber && { plateNumber: otherData.plateNumber }),
      ...(otherData.make && { make: otherData.make }),
      ...(otherData.model && { model: otherData.model }),
      ...(otherData.year && { year: otherData.year }),
      ...(otherData.weight !== undefined && { weight: otherData.weight }),
      ...(otherData.uom && { uom: otherData.uom }),
      ...(otherData.registrationCountry && { registrationCountry: otherData.registrationCountry }),
      ...(otherData.registrationProvince && { registrationProvince: otherData.registrationProvince }),
      ...(otherData.type && { type: otherData.type }),
      ...(otherData.status && { status: otherData.status }),
      ...(otherData.ownership && { ownership: otherData.ownership }),
      ...(otherData.subType !== undefined && { subType: otherData.subType }),

      // Image
      imageUrl: imageUrl,
      trailerImageUrl: imageUrl,

      // Location
      currentLocation: {
        address: address || existingTrailer.currentLocation?.address || '',
        latitude: coordinates.latitude ? coordinates.latitude.toString() : existingTrailer.currentLocation?.latitude || '',
        longitude: coordinates.longitude ? coordinates.longitude.toString() : existingTrailer.currentLocation?.longitude || '',
        updatedAt: new Date()
      },

      // Inspections
      oneTimeInspections: oneTimeInspections,
      recurringInspections: recurringInspections,

      // Incidents
      incidents: incidents,

      // Notes
      notesArray: notesArray,

      // Invoices
      invoices: invoices,

      // Yard assignment
      ...(otherData.yard !== undefined && { yard: otherData.yard && otherData.yard.trim() ? otherData.yard : undefined }),

      // Operation status
      ...(otherData.operationStatus && { operationStatus: otherData.operationStatus })
    };

    console.log('📝 Update data being sent to database:', {
      ...updateData,
      imageUrl: updateData.imageUrl ? 'present' : 'absent',
      oneTimeInspections: updateData.oneTimeInspections.length,
      recurringInspections: updateData.recurringInspections.length,
      incidents: updateData.incidents.length,
      notes: updateData.notesArray.length
    });

    const updatedTrailer = await Trailer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    console.log('📥 Updated trailer from database:', {
      _id: updatedTrailer._id,
      imageUrl: updatedTrailer.imageUrl,
      oneTimeInspections: updatedTrailer.oneTimeInspections.length,
      recurringInspections: updatedTrailer.recurringInspections.length,
      incidents: updatedTrailer.incidents.length,
      notes: updatedTrailer.notesArray?.length || 0
    });

    if (updatedTrailer.incidents && updatedTrailer.incidents.length > 0) {
      console.log('🚨 Incident details from DB:', JSON.stringify(updatedTrailer.incidents, null, 2));
    }

    res.json({
      success: true,
      message: "Trailer updated successfully",
      data: updatedTrailer
    });
  } catch (err) {
    console.error('❌ Error updating trailer:', err);
    return handleError(err, res, 400);
  }
};

// ✅ Get Trailer by ID
export const getTrailerById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(200).json({
        success: true,
        message: "No company assigned to the current admin.",
        data: null
      });
    }

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const trailer = await Trailer.findOne(query)
      .populate('attachedVehicle', 'plateNumber make model driver')
      .populate('attachedVehicle.driver', 'name');

    if (!trailer) {
      return res.status(404).json({
        success: false,
        message: "Trailer not found"
      });
    }

    // Fetch documents for this trailer
    const documents = await VehicleDocuments.find({ trailerId: trailer._id })
      .lean();

    console.log("documents......................", documents)

    // Generate signed URLs for document files (include title for trailer documents)
    const documentsWithSignedUrls = await Promise.all(documents.map(async (doc) => {
      const docData = { ...doc };
      docData.title = doc.title != null ? doc.title : '';

      // Generate signed URLs for files
      if (docData.files && Array.isArray(docData.files)) {
        docData.files = await Promise.all(docData.files.map(async (file) => {
          if (file.fileUrl && (file.fileUrl.includes('s3.amazonaws.com') || file.fileUrl.includes('.s3.'))) {
            try {
              const { GetObjectCommand } = await import("@aws-sdk/client-s3");
              const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
              const { s3 } = await import("../config/awsConfig.js");

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
              return file;
            }
          }
          return file;
        }));
      }

      // Generate signed URL for documentLocation
      if (docData.documentLocation && (docData.documentLocation.includes('s3.amazonaws.com') || docData.documentLocation.includes('.s3.'))) {
        try {
          const { GetObjectCommand } = await import("@aws-sdk/client-s3");
          const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
          const { s3 } = await import("../config/awsConfig.js");

          const cleanUrl = docData.documentLocation.split('?')[0].split('#')[0];
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
          docData.documentLocation = signedUrl;
        } catch (error) {
          console.error('Error generating signed URL for documentLocation:', error);
        }
      }

      return docData;
    }));

    // Generate signed URLs for images
    const trailerData = trailer.toObject();
    if (trailerData.imageUrl) {
      trailerData.imageUrl = await generateSignedUrl(trailerData.imageUrl);
    }
    if (trailerData.trailerImageUrl) {
      trailerData.trailerImageUrl = await generateSignedUrl(trailerData.trailerImageUrl);
    }

    // Generate signed URLs for inspection files
    if (trailerData.oneTimeInspections && Array.isArray(trailerData.oneTimeInspections)) {
      trailerData.oneTimeInspections = await Promise.all(trailerData.oneTimeInspections.map(async (insp) => {
        if (insp.fileUrl && (insp.fileUrl.includes('s3.amazonaws.com') || insp.fileUrl.includes('.s3.'))) {
          insp.fileUrl = await generateSignedUrl(insp.fileUrl);
        }
        return insp;
      }));
    }

    if (trailerData.recurringInspections && Array.isArray(trailerData.recurringInspections)) {
      trailerData.recurringInspections = await Promise.all(trailerData.recurringInspections.map(async (insp) => {
        if (insp.fileUrl && (insp.fileUrl.includes('s3.amazonaws.com') || insp.fileUrl.includes('.s3.'))) {
          insp.fileUrl = await generateSignedUrl(insp.fileUrl);
        }
        return insp;
      }));
    }

    // Generate signed URLs for incident files
    if (trailerData.incidents && Array.isArray(trailerData.incidents)) {
      trailerData.incidents = await Promise.all(trailerData.incidents.map(async (incident) => {
        if (incident.files && Array.isArray(incident.files)) {
          incident.files = await Promise.all(incident.files.map(async (file) => {
            if (file.fileUrl && (file.fileUrl.includes('s3.amazonaws.com') || file.fileUrl.includes('.s3.'))) {
              file.fileUrl = await generateSignedUrl(file.fileUrl);
            }
            return file;
          }));
        }
        return incident;
      }));
    }

    // Generate signed URLs for invoice files
    if (trailerData.invoices && Array.isArray(trailerData.invoices)) {
      trailerData.invoices = await Promise.all(trailerData.invoices.map(async (invoice) => {
        if (invoice.fileUrl && (invoice.fileUrl.includes('s3.amazonaws.com') || invoice.fileUrl.includes('.s3.'))) {
          invoice.fileUrl = await generateSignedUrl(invoice.fileUrl);
        }
        return invoice;
      }));
    }

    // Add documents to trailer data
    trailerData.documents = documentsWithSignedUrls;

    res.json({
      success: true,
      message: "Trailer retrieved successfully",
      data: trailerData
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Delete Trailer
export const deleteTrailer = async (req, res) => {
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

    const trailer = await Trailer.findById(id);

    if (!trailer) {
      return res.status(404).json({
        success: false,
        message: "Trailer not found"
      });
    }

    if (!isSuperadmin && trailer.company && trailer.company.toString() !== companyId) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete this trailer."
      });
    }

    await Trailer.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Trailer deleted successfully",
      data: trailer
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Get All Trailers with filtering and pagination
export const getAllTrailers = async (req, res) => {
  try {
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    const {
      page = 1,
      limit = 10,
      search,
      type,
      status,
      operationStatus,
      isAttached,
      yard,
      ownership,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: [],
        pagination: {
          current: Number(page),
          pages: 0,
          total: 0,
          limit: Number(limit)
        }
      });
    }
    const companyFilter = userCompanyId ? { company: userCompanyId } : null;

    // Get combined filter (company + trial data filter)
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Build filter object
    const filters = {};

    // Apply base filter (company + trial)
    if (baseFilter) {
      Object.assign(filters, baseFilter);
    }

    // Search filter
    if (search) {
      filters.$or = [
        { trailer: { $regex: search, $options: 'i' } },
        { plateNumber: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } }
      ];
    }

    // Other filters
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (operationStatus) filters.operationStatus = operationStatus;
    if (isAttached !== undefined) filters.isAttached = isAttached === 'true';

    // Apply yard filter
    if (yard && yard !== 'All') {
      filters.yard = yard;
    }

    // Ownership filter - check both ownership and legacy ownerShip fields
    if (ownership && ownership !== 'All') {
      if (filters.$or) {
        // If $or already exists (from search), wrap everything in $and
        const existingOr = filters.$or;
        delete filters.$or;
        filters.$and = [
          { $or: existingOr },
          { $or: [{ ownership: ownership }, { ownerShip: ownership }] }
        ];
      } else {
        filters.$or = [
          { ownership: ownership },
          { ownerShip: ownership }
        ];
      }
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const trailers = await Trailer.find(filters)
      .populate('attachedVehicle', 'plateNumber make model driver')
      .populate('attachedVehicle.driver', 'name')
      .populate('yard', 'yardId yardName yardCode yardType status')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Trailer.countDocuments(filters);

    // Import VehicleDocuments and compliance calculator
    const { calculateVehicleCompliance } = await import("../utils/vehicleCompliance.js");

    // Fetch documents for all trailers in batch for compliance calculation
    const trailerIds = trailers.map(t => t._id);
    const allDocuments = await VehicleDocuments.find({
      $or: [
        { trailerId: { $in: trailerIds } },
        { fleetUnitId: { $in: trailerIds } }
      ]
    }).lean();

    // Group documents by trailer ID
    const documentsByTrailer = {};
    allDocuments.forEach(doc => {
      const trailerId = doc.trailerId?.toString() || doc.fleetUnitId?.toString();
      if (trailerId) {
        if (!documentsByTrailer[trailerId]) {
          documentsByTrailer[trailerId] = [];
        }
        documentsByTrailer[trailerId].push(doc);
      }
    });

    // Generate signed URLs for all trailer images and calculate compliance
    const trailersWithSignedUrls = await Promise.all(trailers.map(async (trailer) => {
      const trailerData = { ...trailer };
      if (trailerData.imageUrl) {
        trailerData.imageUrl = await generateSignedUrl(trailerData.imageUrl);
      }
      if (trailerData.trailerImageUrl) {
        trailerData.trailerImageUrl = await generateSignedUrl(trailerData.trailerImageUrl);
      }

      // Calculate compliance status
      const trailerDocuments = documentsByTrailer[trailer._id.toString()] || [];
      const compliance = await calculateVehicleCompliance(trailer, trailerDocuments);

      // Add compliance status to trailer data
      trailerData.compliance = compliance.status;
      trailerData.complianceDetails = compliance;

      return trailerData;
    }));

    res.json({
      success: true,
      message: "Trailers retrieved successfully",
      data: trailersWithSignedUrls,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Search Trailers
export const searchTrailers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Search query is required"
      });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(200).json({ success: true, message: "No company assigned to the current admin.", data: [] });
    }

    const filters = {
      $or: [
        { trailer: { $regex: q, $options: 'i' } },
        { plateNumber: { $regex: q, $options: 'i' } },
        { type: { $regex: q, $options: 'i' } }
      ]
    };

    // Add company filter if user has company
    if (!isSuperadmin && companyId) {
      filters.company = companyId;
    }

    const trailers = await Trailer.find(filters)
      .populate('attachedVehicle', 'plateNumber make model')
      .limit(20);

    res.json({
      success: true,
      message: "Search completed",
      data: trailers
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Get Trailer Statistics
export const getTrailerStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: {
          total: 0,
          inTransit: 0,
          loading: 0,
          idle: 0,
          maintenance: 0,
          available: 0,
          attached: 0,
          unattached: 0
        }
      });
    }

    const companyFilter = companyId ? { company: companyId } : {};

    const total = await Trailer.countDocuments(companyFilter);
    const inTransit = await Trailer.countDocuments({ ...companyFilter, operationStatus: 'in_transit' });
    const loading = await Trailer.countDocuments({ ...companyFilter, operationStatus: 'loading' });
    const idle = await Trailer.countDocuments({ ...companyFilter, operationStatus: 'idle' });
    const maintenance = await Trailer.countDocuments({ ...companyFilter, operationStatus: 'maintenance' });
    const available = await Trailer.countDocuments({ ...companyFilter, operationStatus: 'available' });
    const attached = await Trailer.countDocuments({ ...companyFilter, isAttached: true });

    res.json({
      success: true,
      message: "Trailer statistics retrieved",
      data: {
        total,
        inTransit,
        loading,
        idle,
        maintenance,
        available,
        attached,
        unattached: total - attached
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Update Trailer Status
export const updateTrailerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { operationStatus, status } = req.body;

    const updateData = {};
    if (operationStatus) updateData.operationStatus = operationStatus;
    if (status) updateData.status = status;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const trailer = await Trailer.findById(id);
    if (!trailer) {
      return res.status(404).json({
        success: false,
        message: "Trailer not found"
      });
    }

    if (!isSuperadmin && trailer.company && trailer.company.toString() !== companyId) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to modify this trailer."
      });
    }

    const updatedTrailer = await Trailer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Trailer status updated successfully",
      data: updatedTrailer
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Get Trailers with Tracking Data (uses Trailer model, internalId for Termoking)
export const getTrailersWithTracking = async (req, res) => {
  try {
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    const {
      page = 1,
      limit = 1000, // High limit for tracking dashboard
      search,
      type,
      status,
      operationStatus,
      isAttached
    } = req.query;

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Build filter object
    const filters = {};

    // Apply base filter (company + trial)
    if (baseFilter) {
      Object.assign(filters, baseFilter);
    }

    // Search filter
    if (search) {
      filters.$or = [
        { unitNumber: { $regex: search, $options: 'i' } },
        { internalId: { $regex: search, $options: 'i' } },
        { plateNumber: { $regex: search, $options: 'i' } },
        { trailer: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } }
      ];
    }

    // Type filter
    if (type && type !== 'All') {
      filters.type = type;
    }

    // Status filter
    if (status && status !== 'All') {
      filters.status = status;
    }

    // Operation status filter
    if (operationStatus && operationStatus !== 'All') {
      filters.operationStatus = operationStatus;
    }

    // Attachment filter
    if (isAttached !== undefined && isAttached !== 'All') {
      filters.isAttached = isAttached === 'true';
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Fetch trailers from Trailer model with populated attached vehicle
    // Trailers use internalId for Termoking tracking (similar to trackingKey for vehicles)
    const trailers = await Trailer.find(filters)
      .populate('attachedVehicle', 'plateNumber make model unitNumber internalId trackingKey currentLocation speed engineOn driver')
      .populate('attachedVehicle.driver', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Process trailers - use attached vehicle location if available, otherwise use trailer's own location
    const trailersWithTracking = trailers.map((trailer) => {
      // If trailer is attached to a vehicle and vehicle has location, use vehicle's location
      let currentLocation = trailer.currentLocation || {
        address: '',
        latitude: '0',
        longitude: '0',
        updatedAt: new Date()
      };

      let speed = trailer.speed || 0;

      if (trailer.isAttached && trailer.attachedVehicle && trailer.attachedVehicle.currentLocation) {
        const vehicleLocation = trailer.attachedVehicle.currentLocation;
        // Use vehicle location if it's valid (not 0,0)
        if (vehicleLocation.latitude && vehicleLocation.longitude &&
          vehicleLocation.latitude !== '0' && vehicleLocation.longitude !== '0') {
          currentLocation = vehicleLocation;
          speed = trailer.attachedVehicle.speed || speed;
        }
      }

      // Map operationStatus to tracking status
      let trackingStatus = 'stopped';
      if (trailer.operationStatus === 'in_transit' || trailer.operationStatus === 'in-transit') {
        trackingStatus = 'moving';
      } else if (trailer.operationStatus === 'idle') {
        trackingStatus = 'idle';
      } else if (trailer.operationStatus === 'maintenance' || trailer.operationStatus === 'MAINTENANCE') {
        trackingStatus = 'maintenance';
      } else if (speed > 0) {
        trackingStatus = 'moving';
      }

      return {
        ...trailer,
        currentLocation,
        speed,
        status: trackingStatus,
        // Ensure attachedVehicle has proper format
        attachedVehicle: trailer.attachedVehicle ? {
          _id: trailer.attachedVehicle._id,
          plateNumber: trailer.attachedVehicle.plateNumber || '',
          make: trailer.attachedVehicle.make || '',
          model: trailer.attachedVehicle.model || '',
          unitNumber: trailer.attachedVehicle.unitNumber || '',
          driver: trailer.attachedVehicle.driver || null
        } : null
      };
    });

    res.json({
      success: true,
      message: "Trailers with tracking data retrieved successfully",
      data: trailersWithTracking
    });
  } catch (err) {
    console.error("Error fetching trailers with tracking:", err);
    return handleError(err, res, 400);
  }
};

// ✅ Legacy function - kept for backward compatibility
export const selectedTrailor = async (req, res) => {
  try {
    const trailerId = req.query.trailerId;
    console.log(trailerId);
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: null
      });
    }

    const query = { _id: trailerId };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const trailer = await Trailer.findOne(query);
    return res.json({
      success: true,
      message: "Selected trailer",
      data: trailer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

// ─── Bulk Import Trailers from CSV / Excel ───────────────────────────────────
export const importTrailers = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const companyId = getUserCompanyId(req.user) || req.user?.company;

    const { rows } = parseImportFile(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ success: false, message: 'File is empty or has no data rows.' });

    const fieldMap = req.body.fieldMap ? JSON.parse(req.body.fieldMap) : null;

    let imported = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = mapRow(rows[i], fieldMap);
      const rowNum = i + 2;

      const trailerNumber = row.trailer_number || '';
      const plateNumber = row.plate_number || `PLT-${Date.now()}-${i}`;
      const make = row.make || '';
      const model = row.model || '';
      const year = row.year || '';
      const vinNumber = row.vin || '';
      const type = row.type || '';
      const status = row.status || 'In Service';
      const ownership = row.ownership || 'COMPANY ASSET';
      const registrationCountry = row.registration_country || '';
      const registrationProvince = row.registration_province || '';
      const weight = row.weight || '';
      const capacity = row.capacity || '';
      const notes = row.notes || '';

      if (!trailerNumber) { errors.push({ row: rowNum, data: row, reason: 'Trailer number is required' }); continue; }

      // Skip duplicate by trailer number (field: `trailer` in model)
      const existing = await Trailer.findOne({ trailer: trailerNumber, company: companyId }).lean();
      if (existing) { skipped++; continue; }

      // Also check plateNumber uniqueness
      const dupPlate = plateNumber && !plateNumber.startsWith('PLT-') ? await Trailer.findOne({ plateNumber }).lean() : null;
      if (dupPlate) { skipped++; continue; }

      try {
        const trailer = new Trailer({
          trailer: trailerNumber,
          internalId: trailerNumber,
          plateNumber,
          make: make || undefined,
          model: model || undefined,
          year: year ? String(year) : undefined,
          vinNumber: vinNumber || undefined,
          type: type || undefined,
          status,
          ownership,
          registrationCountry: registrationCountry || undefined,
          registrationProvince: registrationProvince || undefined,
          weight: weight || undefined,
          capacity: capacity || undefined,
          notes: notes || undefined,
          company: companyId
        });
        await trailer.save();
        imported++;
      } catch (saveErr) {
        errors.push({ row: rowNum, data: row, reason: saveErr.message || 'Failed to save' });
      }
    }

    res.json({ success: true, imported, skipped, errors, total: rows.length });
  } catch (error) {
    console.error('importTrailers error:', error);
    res.status(500).json({ success: false, message: error.message || 'Import failed' });
  }
};
