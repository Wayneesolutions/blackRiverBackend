import { Vehicle } from "../models/driver/vehicleModel.js";
import { User } from "../models/driver/userModel.js";
import { getCoordinatesFromAddress } from "../services/googlemap.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { getCombinedFilter } from "../utils/trialDataFilter.js";
import { handleError } from "../utils/errorHandler.js";
import VehicleDocuments from "../models/driver/vehicleDocumentsModel.js";
import { Subscription } from "../models/subscriptionModel.js";
import { parseImportFile } from "../utils/importParser.js";


// Helper function to process inspections with file uploads
const processInspectionsWithFiles = async (inspections, files, req) => {
  console.log('📋 processInspectionsWithFiles called');
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
  console.log('📋 processInvoicesWithFiles called');
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

// Helper function to process incidents with multiple files
const processIncidentsWithFiles = async (incidents, req) => {
  console.log('📋 processIncidentsWithFiles called');
  console.log('  - Incidents count:', incidents?.length || 0);

  if (!incidents || !Array.isArray(incidents)) {
    console.log('⚠️ No incidents or not an array');
    return [];
  }

  const processedIncidents = [];

  for (let i = 0; i < incidents.length; i++) {
    const incident = incidents[i];
    const processedIncident = { ...incident };

    console.log(`  📝 Processing incident ${i}:`, {
      accidentNumber: incident.accidentNumber,
      fileCount: incident.fileCount,
      fileNames: incident.fileNames
    });

    // Get files for this specific incident from req.files
    const incidentFileKey = `incidentFiles_${i}`;
    const incidentFiles = req.files && req.files[incidentFileKey] ? req.files[incidentFileKey] : [];

    console.log(`  📎 Found ${incidentFiles.length} files for incident ${i}`);

    // Process files for this incident
    if (incidentFiles.length > 0) {
      processedIncident.files = incidentFiles.map(file => {
        const fileData = {
          fileName: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
          uploadedAt: new Date()
        };

        // Generate file URL
        if (process.env.NODE_ENV === "production") {
          fileData.fileUrl = file.location;
        } else {
          fileData.fileUrl = `${req.protocol}://${req.get("host")}/${file.path.replace(/\\/g, "/")}`;
        }

        console.log(`    ✅ Processed file:`, file.originalname);
        return fileData;
      });
    } else {
      processedIncident.files = [];
    }

    // Remove temporary frontend fields
    delete processedIncident.fileCount;
    delete processedIncident.fileNames;

    processedIncidents.push(processedIncident);
  }

  console.log('✅ Processed incidents:', processedIncidents.length);
  return processedIncidents;
};

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

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      ResponseContentType: url.toLowerCase().includes('.png') ? 'image/png' :
        url.toLowerCase().includes('.gif') ? 'image/gif' :
          'image/jpeg',
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return url; // Return original URL if signing fails
  }
};

// ✅ Create Vehicle
export const createVehicle = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating vehicles. Go to Company Settings to set up your company."
        });
      }
    }

    const subscription = await Subscription.findOne({
      admin: req.user._id,
      status: "active"
    })

    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: "No active subscription found"
      });
    }


    if (subscription.planType === 'monthly' && (subscription.subscriptionType === '1-year' || subscriptionType === '1-month' || subscriptionType === '6-month')) {

    }





    const { address, ...otherData } = req.body;

    // Handle image upload
    let imageUrl = null;
    if (req.files && req.files['image'] && req.files['image'][0]) {
      const imageFile = req.files['image'][0];
      if (process.env.NODE_ENV === "production") {
        imageUrl = imageFile.location;
      } else {
        imageUrl = `${req.protocol}://${req.get("host")}/${imageFile.path.replace(/\\/g, '/')}`;
      }
    } else if (req.file) {
      // Backward compatibility for single file upload
      if (process.env.NODE_ENV === "production") {
        imageUrl = req.file.location;
      } else {
        imageUrl = `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, '/')}`;
      }
    }

    // Handle inspection files
    const oneTimeInspectionFiles = req.files && req.files['oneTimeInspectionFiles'] ? req.files['oneTimeInspectionFiles'] : [];
    const recurringInspectionFiles = req.files && req.files['recurringInspectionFiles'] ? req.files['recurringInspectionFiles'] : [];

    // Handle invoice files
    const invoiceFiles = req.files && req.files['invoiceFiles'] ? req.files['invoiceFiles'] : [];

    // Get coordinates from address if provided
    let coordinates = { latitude: null, longitude: null };
    if (address && address.trim()) {
      coordinates = await getCoordinatesFromAddress(address);
    }

    // Map frontend fields to model fields
    const unitNumber = otherData.unitNumber || otherData.internalId;
    const internalId = otherData.internalId || unitNumber || `TRK-${Date.now()}`;

    // Prepare vehicle data
    const vehicleData = {
      // Basic Information
      unitNumber: unitNumber,
      internalId: internalId,
      vinNumber: otherData.vinNumber,
      plateNumber: otherData.plateNumber,
      make: otherData.make,
      model: otherData.model,
      year: otherData.year,
      weight: otherData.weight,
      uom: otherData.uom || 'Kg',
      registrationCountry: otherData.registrationCountry,
      registrationProvince: otherData.registrationProvince,
      type: otherData.type || 'Truck',
      status: otherData.status || 'In Service',
      ownership: otherData.ownership || 'COMPANY ASSET',
      subType: otherData.subType || '',

      // Image
      imageUrl: imageUrl,

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

      // Handle driver assignment
      driver: otherData.driverId && otherData.driverId.trim() ? otherData.driverId : undefined,

      // Handle trailer attachment
      trailer: otherData.trailer && otherData.trailer.trim() ? otherData.trailer : undefined,

      // Handle operator and co-operator
      operator: otherData.operator && otherData.operator.trim() ? otherData.operator : undefined,
      coOperator: otherData.coOperator && otherData.coOperator.trim() ? otherData.coOperator : undefined,

      // Handle fleet assignment
      fleet: otherData.fleet && otherData.fleet.trim() ? otherData.fleet : undefined,

      // Handle yard assignment
      yard: otherData.yard && otherData.yard.trim() ? otherData.yard : undefined,

      // Handle additional fields
      odometer: otherData.odometer ? parseFloat(otherData.odometer) || 0 : undefined,
      trackingKey: otherData.trackingKey && otherData.trackingKey.trim() ? otherData.trackingKey : undefined,
      assetValue: otherData.assetValue ? parseFloat(otherData.assetValue) || 0 : undefined,

      // Handle inspections, incidents, and notes
      oneTimeInspections: await processInspectionsWithFiles(
        otherData.oneTimeInspections ? (typeof otherData.oneTimeInspections === 'string' ? JSON.parse(otherData.oneTimeInspections) : otherData.oneTimeInspections) : [],
        oneTimeInspectionFiles,
        req
      ),
      recurringInspections: await processInspectionsWithFiles(
        otherData.recurringInspections ? (typeof otherData.recurringInspections === 'string' ? JSON.parse(otherData.recurringInspections) : otherData.recurringInspections) : [],
        recurringInspectionFiles,
        req
      ),
      incidents: await processIncidentsWithFiles(
        otherData.incidents ? (typeof otherData.incidents === 'string' ? JSON.parse(otherData.incidents) : otherData.incidents) : [],
        req
      ),
      notesArray: otherData.notesArray ? (typeof otherData.notesArray === 'string' ? JSON.parse(otherData.notesArray) : otherData.notesArray) : [],
      invoices: await processInvoicesWithFiles(
        otherData.invoices ? (typeof otherData.invoices === 'string' ? JSON.parse(otherData.invoices) : otherData.invoices) : [],
        invoiceFiles,
        req
      ),

      // Owner Operator Payroll / Deductions / Additions (for ownership === 'OWNER OPERATOR')
      ownerOperatorPayroll: (() => {
        try {
          const payrollRaw = otherData.ownerOperatorPayroll;
          if (!payrollRaw) return undefined;
          const payroll = typeof payrollRaw === 'string' ? JSON.parse(payrollRaw) : payrollRaw;
          return payroll && typeof payroll === 'object' ? payroll : undefined;
        } catch (e) {
          console.warn('⚠️ Failed to parse ownerOperatorPayroll:', e.message);
          return undefined;
        }
      })(),
      payrollDeductions: (() => {
        try {
          const raw = otherData.payrollDeductions;
          if (!raw) return [];
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          console.warn('⚠️ Failed to parse payrollDeductions:', e.message);
          return [];
        }
      })(),
      payrollAdditions: (() => {
        try {
          const raw = otherData.payrollAdditions;
          if (!raw) return [];
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          console.warn('⚠️ Failed to parse payrollAdditions:', e.message);
          return [];
        }
      })(),

      // Set current location with coordinates
      currentLocation: {
        address: address || '',
        latitude: coordinates.latitude ? coordinates.latitude.toString() : '',
        longitude: coordinates.longitude ? coordinates.longitude.toString() : '',
        updatedAt: new Date()
      },

      // Set company - required for non-superadmin users
      company: getUserCompanyId(req.user)
    };

    console.log('💾 [CREATE] Vehicle data being saved to database:');
    console.log('  - oneTimeInspections:', JSON.stringify(vehicleData.oneTimeInspections, null, 2));
    console.log('  - recurringInspections:', JSON.stringify(vehicleData.recurringInspections, null, 2));

    const vehicle = await Vehicle.create(vehicleData);

    console.log('✅ [CREATE] Vehicle created in database:');
    console.log('  - _id:', vehicle._id);
    console.log('  - oneTimeInspections:', JSON.stringify(vehicle.oneTimeInspections, null, 2));
    console.log('  - recurringInspections:', JSON.stringify(vehicle.recurringInspections, null, 2));

    // Generate signed URL for image if it exists
    const vehicleDataResponse = vehicle.toObject();
    if (vehicleDataResponse.imageUrl) {
      vehicleDataResponse.imageUrl = await generateSignedUrl(vehicleDataResponse.imageUrl);
    }

    res.status(201).json({
      success: true,
      message: "Vehicle created successfully",
      data: vehicleDataResponse
    });
  } catch (err) {
    return handleError(err, res, 400);
  }
};

// ✅ Get Vehicle by ID
export const getVehicleById = async (req, res) => {
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

    const vehicle = await Vehicle.findOne(query)
      .populate('driver', 'name email phone')
      .populate('trailer', 'trailer unitNumber plateNumber')
      .populate('operator', 'name email')
      .populate('coOperator', 'name email')
      .populate('incidents.driver', 'name email')
      .populate('incidents.coDriver', 'name email');

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found"
      });
    }

    // Fetch documents for this vehicle
    const documents = await VehicleDocuments.find({ vehicleId: vehicle._id })
      .lean();

    // Generate signed URLs for document files
    const documentsWithSignedUrls = await Promise.all(documents.map(async (doc) => {
      const docData = { ...doc };

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
    const vehicleData = vehicle.toObject();
    if (vehicleData.imageUrl) {
      vehicleData.imageUrl = await generateSignedUrl(vehicleData.imageUrl);
    }

    // Generate signed URLs for inspection files
    if (vehicleData.oneTimeInspections && Array.isArray(vehicleData.oneTimeInspections)) {
      vehicleData.oneTimeInspections = await Promise.all(vehicleData.oneTimeInspections.map(async (insp) => {
        if (insp.fileUrl && (insp.fileUrl.includes('s3.amazonaws.com') || insp.fileUrl.includes('.s3.'))) {
          insp.fileUrl = await generateSignedUrl(insp.fileUrl);
        }
        return insp;
      }));
    }

    if (vehicleData.recurringInspections && Array.isArray(vehicleData.recurringInspections)) {
      vehicleData.recurringInspections = await Promise.all(vehicleData.recurringInspections.map(async (insp) => {
        if (insp.fileUrl && (insp.fileUrl.includes('s3.amazonaws.com') || insp.fileUrl.includes('.s3.'))) {
          insp.fileUrl = await generateSignedUrl(insp.fileUrl);
        }
        return insp;
      }));
    }

    // Generate signed URLs for incident files
    if (vehicleData.incidents && Array.isArray(vehicleData.incidents)) {
      vehicleData.incidents = await Promise.all(vehicleData.incidents.map(async (incident) => {
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
    if (vehicleData.invoices && Array.isArray(vehicleData.invoices)) {
      vehicleData.invoices = await Promise.all(vehicleData.invoices.map(async (invoice) => {
        if (invoice.fileUrl && (invoice.fileUrl.includes('s3.amazonaws.com') || invoice.fileUrl.includes('.s3.'))) {
          invoice.fileUrl = await generateSignedUrl(invoice.fileUrl);
        }
        return invoice;
      }));
    }

    // Add documents to vehicle data
    vehicleData.documents = documentsWithSignedUrls;

    res.json({
      success: true,
      message: "Vehicle retrieved successfully",
      data: vehicleData
    });
  } catch (err) {
    return handleError(err, res, 400);
  }
};

// ✅ Update Vehicle
export const updateVehicle = async (req, res) => {
  try {
    console.log('🔄 [UPDATE VEHICLE] Started for ID:', req.params.id);
    console.log('  - req.files:', req.files ? Object.keys(req.files) : 'null');
    console.log('  - req.body keys:', Object.keys(req.body));

    const { id } = req.params;
    const { address, ...otherData } = req.body;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const existingVehicle = await Vehicle.findById(id);
    if (!existingVehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found"
      });
    }

    if (!isSuperadmin && existingVehicle.company && existingVehicle.company.toString() !== companyId) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to modify this vehicle."
      });
    }

    // Handle image upload
    let imageUrl = null;
    if (req.files && req.files['image'] && req.files['image'][0]) {
      const imageFile = req.files['image'][0];
      console.log('📷 Image file received:', {
        fieldname: imageFile.fieldname,
        originalname: imageFile.originalname,
        mimetype: imageFile.mimetype,
        size: imageFile.size,
        location: imageFile.location,
        path: imageFile.path
      });
      if (process.env.NODE_ENV === "production") {
        imageUrl = imageFile.location;
      } else {
        imageUrl = `${req.protocol}://${req.get("host")}/${imageFile.path.replace(/\\/g, '/')}`;
      }
      console.log('📷 Generated imageUrl:', imageUrl);
    } else if (req.file) {
      // Backward compatibility for single file upload
      console.log('📷 Image file received (legacy):', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        location: req.file.location,
        path: req.file.path
      });
      if (process.env.NODE_ENV === "production") {
        imageUrl = req.file.location;
      } else {
        imageUrl = `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, '/')}`;
      }
      console.log('📷 Generated imageUrl:', imageUrl);
    } else {
      console.log('⚠️ No image file in req.file or req.files');
    }

    // Handle inspection files
    const oneTimeInspectionFiles = req.files && req.files['oneTimeInspectionFiles'] ? req.files['oneTimeInspectionFiles'] : [];
    const recurringInspectionFiles = req.files && req.files['recurringInspectionFiles'] ? req.files['recurringInspectionFiles'] : [];

    // Handle invoice files
    const invoiceFiles = req.files && req.files['invoiceFiles'] ? req.files['invoiceFiles'] : [];

    // Get coordinates from address if provided
    let coordinates = { latitude: null, longitude: null };
    if (address && address.trim()) {
      coordinates = await getCoordinatesFromAddress(address);
    }

    // Map frontend fields to model fields
    const updateData = {};

    // Handle image URL update - always set if imageUrl exists
    if (imageUrl) {
      updateData.imageUrl = imageUrl;
      console.log('✅ Adding imageUrl to updateData:', imageUrl);
    } else {
      console.log('⚠️ No imageUrl to add to updateData');
    }

    // Basic Information
    if (otherData.unitNumber !== undefined) updateData.unitNumber = otherData.unitNumber;
    if (otherData.internalId !== undefined) updateData.internalId = otherData.internalId;
    if (otherData.vinNumber !== undefined) updateData.vinNumber = otherData.vinNumber;
    if (otherData.plateNumber !== undefined) updateData.plateNumber = otherData.plateNumber;
    if (otherData.make !== undefined) updateData.make = otherData.make;
    if (otherData.model !== undefined) updateData.model = otherData.model;
    if (otherData.year !== undefined) updateData.year = otherData.year;
    if (otherData.weight !== undefined) updateData.weight = otherData.weight;
    if (otherData.uom !== undefined) updateData.uom = otherData.uom;
    if (otherData.registrationCountry !== undefined) updateData.registrationCountry = otherData.registrationCountry;
    if (otherData.registrationProvince !== undefined) updateData.registrationProvince = otherData.registrationProvince;
    if (otherData.type !== undefined) updateData.type = otherData.type;
    if (otherData.status !== undefined) updateData.status = otherData.status;
    if (otherData.ownership !== undefined) {
      updateData.ownership = otherData.ownership;
      updateData.ownerShip = otherData.ownership; // Legacy field
    }
    if (otherData.subType !== undefined) updateData.subType = otherData.subType;

    // Legacy fields
    if (otherData.operationStatus !== undefined) updateData.operationStatus = otherData.operationStatus;
    if (otherData.loadedStatus !== undefined) updateData.loadedStatus = otherData.loadedStatus;
    if (otherData.compliance !== undefined) updateData.compliance = otherData.compliance;
    if (otherData.category !== undefined) updateData.category = otherData.category;
    if (otherData.notes !== undefined) {
      updateData.notes = otherData.notes;
      updateData.note = otherData.notes; // Legacy field
    }
    if (otherData.note !== undefined) {
      updateData.note = otherData.note;
      updateData.notes = otherData.note;
    }
    if (otherData.lastDispatch !== undefined) updateData.lastDispatch = otherData.lastDispatch;
    if (otherData.lastDispatchDate !== undefined) updateData.lastDispatchDate = otherData.lastDispatchDate ? new Date(otherData.lastDispatchDate) : undefined;
    if (otherData.lastDropLocation !== undefined) updateData.lastDropLocation = otherData.lastDropLocation;

    // Handle driver assignment
    if (otherData.driverId !== undefined) {
      updateData.driver = otherData.driverId && otherData.driverId.trim() ? otherData.driverId : undefined;
    }

    // Handle trailer attachment
    if (otherData.trailer !== undefined) {
      updateData.trailer = otherData.trailer && otherData.trailer.trim() ? otherData.trailer : undefined;
    }

    // Handle operator and co-operator
    if (otherData.operator !== undefined) {
      updateData.operator = otherData.operator && otherData.operator.trim() ? otherData.operator : undefined;
    }
    if (otherData.coOperator !== undefined) {
      updateData.coOperator = otherData.coOperator && otherData.coOperator.trim() ? otherData.coOperator : undefined;
    }

    // Handle fleet assignment
    if (otherData.fleet !== undefined) {
      updateData.fleet = otherData.fleet && otherData.fleet.trim() ? otherData.fleet : undefined;
    }

    // Handle yard assignment
    if (otherData.yard !== undefined) {
      updateData.yard = otherData.yard && otherData.yard.trim() ? otherData.yard : undefined;
    }

    // Handle additional fields
    if (otherData.odometer !== undefined) {
      updateData.odometer = otherData.odometer ? parseFloat(otherData.odometer) || 0 : undefined;
    }
    if (otherData.trackingKey !== undefined) {
      updateData.trackingKey = otherData.trackingKey && otherData.trackingKey.trim() ? otherData.trackingKey : undefined;
    }
    if (otherData.assetValue !== undefined) {
      updateData.assetValue = otherData.assetValue ? parseFloat(otherData.assetValue) || 0 : undefined;
    }

    // Handle inspections, incidents, and notes
    if (otherData.oneTimeInspections !== undefined) {
      console.log('🔍 [UPDATE] Processing oneTimeInspections');
      console.log('  - Raw data:', otherData.oneTimeInspections);
      const parsedInspections = typeof otherData.oneTimeInspections === 'string' ? JSON.parse(otherData.oneTimeInspections) : otherData.oneTimeInspections;
      console.log('  - Parsed inspections:', parsedInspections);
      console.log('  - Files to attach:', oneTimeInspectionFiles.length);

      updateData.oneTimeInspections = await processInspectionsWithFiles(
        parsedInspections,
        oneTimeInspectionFiles,
        req
      );

      console.log('  - Processed result:', updateData.oneTimeInspections);
    }
    if (otherData.recurringInspections !== undefined) {
      console.log('🔍 [UPDATE] Processing recurringInspections');
      console.log('  - Raw data:', otherData.recurringInspections);
      const parsedInspections = typeof otherData.recurringInspections === 'string' ? JSON.parse(otherData.recurringInspections) : otherData.recurringInspections;
      console.log('  - Parsed inspections:', parsedInspections);
      console.log('  - Files to attach:', recurringInspectionFiles.length);

      updateData.recurringInspections = await processInspectionsWithFiles(
        parsedInspections,
        recurringInspectionFiles,
        req
      );

      console.log('  - Processed result:', updateData.recurringInspections);
    }
    if (otherData.incidents !== undefined) {
      console.log('🔍 [UPDATE] Processing incidents');
      const parsedIncidents = typeof otherData.incidents === 'string' ? JSON.parse(otherData.incidents) : otherData.incidents;
      console.log('  - Parsed incidents:', parsedIncidents);

      updateData.incidents = await processIncidentsWithFiles(
        parsedIncidents,
        req
      );

      console.log('  - Processed result:', updateData.incidents);
    }
    if (otherData.notesArray !== undefined) {
      updateData.notesArray = typeof otherData.notesArray === 'string' ? JSON.parse(otherData.notesArray) : otherData.notesArray;
    }

    // Handle invoices
    if (otherData.invoices !== undefined) {
      updateData.invoices = await processInvoicesWithFiles(
        typeof otherData.invoices === 'string' ? JSON.parse(otherData.invoices) : otherData.invoices,
        invoiceFiles,
        req
      );
    }

    // Owner Operator Payroll / Deductions / Additions
    if (otherData.ownerOperatorPayroll !== undefined) {
      try {
        const payroll = typeof otherData.ownerOperatorPayroll === 'string'
          ? JSON.parse(otherData.ownerOperatorPayroll)
          : otherData.ownerOperatorPayroll;
        updateData.ownerOperatorPayroll = payroll && typeof payroll === 'object' ? payroll : undefined;
      } catch (e) {
        console.warn('⚠️ Failed to parse ownerOperatorPayroll (update):', e.message);
      }
    }
    if (otherData.payrollDeductions !== undefined) {
      try {
        const parsed = typeof otherData.payrollDeductions === 'string' ? JSON.parse(otherData.payrollDeductions) : otherData.payrollDeductions;
        updateData.payrollDeductions = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.warn('⚠️ Failed to parse payrollDeductions (update):', e.message);
      }
    }
    if (otherData.payrollAdditions !== undefined) {
      try {
        const parsed = typeof otherData.payrollAdditions === 'string' ? JSON.parse(otherData.payrollAdditions) : otherData.payrollAdditions;
        updateData.payrollAdditions = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.warn('⚠️ Failed to parse payrollAdditions (update):', e.message);
      }
    }

    // Update current location if address is provided
    if (address !== undefined) {
      updateData.currentLocation = {
        address: address || '',
        latitude: coordinates.latitude ? coordinates.latitude.toString() : '',
        longitude: coordinates.longitude ? coordinates.longitude.toString() : '',
        updatedAt: new Date()
      };
    }

    console.log('📝 Update data being sent to database:', JSON.stringify(updateData, null, 2));

    const updatedVehicle = await Vehicle.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedVehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found"
      });
    }

    console.log('📥 Updated vehicle from database:');
    console.log('  - _id:', updatedVehicle._id);
    console.log('  - imageUrl:', updatedVehicle.imageUrl);
    console.log('  - oneTimeInspections:', JSON.stringify(updatedVehicle.oneTimeInspections, null, 2));
    console.log('  - recurringInspections:', JSON.stringify(updatedVehicle.recurringInspections, null, 2));

    // Generate signed URLs for images
    const updatedVehicleData = updatedVehicle.toObject();
    if (updatedVehicleData.imageUrl) {
      console.log('🔗 Generating signed URL for imageUrl:', updatedVehicleData.imageUrl);
      updatedVehicleData.imageUrl = await generateSignedUrl(updatedVehicleData.imageUrl);
      console.log('✅ Generated signed URL for imageUrl');
    } else {
      console.log('⚠️ No imageUrl in updated vehicle data');
    }

    console.log('📤 Sending response with imageUrl:', updatedVehicleData.imageUrl);

    res.json({
      success: true,
      message: "Vehicle updated successfully",
      data: updatedVehicleData
    });
  } catch (err) {
    return handleError(err, res, 400);
  }
};

// ✅ Delete Vehicle
export const deleteVehicle = async (req, res) => {
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

    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found"
      });
    }

    if (!isSuperadmin && vehicle.company && vehicle.company.toString() !== companyId) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete this vehicle."
      });
    }

    await Vehicle.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Vehicle deleted successfully",
      data: vehicle
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Get All Vehicles with filtering and pagination
export const getVehicles = async (req, res) => {
  try {
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    const {
      page = 1,
      limit = 10,
      search,
      type,
      status,
      operationStatus,
      ownership,
      yard,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Strict validation: For non-superadmin, companyId MUST be valid
    const hasValidCompany = userCompanyId !== null &&
      userCompanyId !== undefined &&
      userCompanyId !== '' &&
      String(userCompanyId).trim() !== '' &&
      String(userCompanyId) !== 'null' &&
      String(userCompanyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ getVehicles: Admin has no company - returning empty data');
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

    const companyFilter = hasValidCompany ? { company: userCompanyId } : null;

    // Get combined filter (company + trial data filter)
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Build filter object
    const filters = {};

    // CRITICAL: For non-superadmin, filters MUST include company
    if (isSuperadmin) {
      // Superadmin can see all
      if (baseFilter) {
        Object.assign(filters, baseFilter);
      }
    } else {
      // Non-superadmin MUST have company filter
      if (!hasValidCompany || !userCompanyId) {
        console.error('❌ getVehicles: No valid company - returning empty data');
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

      // Ensure company filter is in filters
      if (baseFilter) {
        if (baseFilter.$and && Array.isArray(baseFilter.$and)) {
          const hasCompany = baseFilter.$and.some(cond => cond && cond.company);
          if (!hasCompany) {
            filters.$and = [...baseFilter.$and, { company: userCompanyId }];
            // Copy other baseFilter properties
            Object.keys(baseFilter).forEach(key => {
              if (key !== '$and') {
                filters[key] = baseFilter[key];
              }
            });
          } else {
            Object.assign(filters, baseFilter);
          }
        } else if (baseFilter.company) {
          Object.assign(filters, baseFilter);
        } else {
          Object.assign(filters, baseFilter);
          filters.company = userCompanyId;
        }
      } else {
        filters.company = userCompanyId;
      }
    }

    // Search filter
    if (search) {
      filters.$or = [
        { unitNumber: { $regex: search, $options: 'i' } },
        { internalId: { $regex: search, $options: 'i' } },
        { plateNumber: { $regex: search, $options: 'i' } },
        { vinNumber: { $regex: search, $options: 'i' } },
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } }
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

    // Ownership filter
    if (ownership && ownership !== 'All') {
      // Check both ownership and legacy ownerShip fields
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

    // Yard filter
    if (yard && yard !== 'All') {
      filters.yard = yard;
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination
    const total = await Vehicle.countDocuments(filters);

    // Fetch vehicles with pagination and sorting
    const vehicles = await Vehicle.find(filters)
      .populate('driver', 'name email phone')
      .populate('trailer', 'trailer unitNumber plateNumber')
      .populate('yard', 'yardId yardName yardCode yardType status')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Import VehicleDocuments and compliance calculator
    const { calculateVehicleCompliance } = await import("../utils/vehicleCompliance.js");

    // Fetch documents for all vehicles in batch for compliance calculation
    const vehicleIds = vehicles.map(v => v._id);
    const allDocuments = await VehicleDocuments.find({
      $or: [
        { vehicleId: { $in: vehicleIds } },
        { fleetUnitId: { $in: vehicleIds } }
      ]
    }).lean();

    // Group documents by vehicle ID
    const documentsByVehicle = {};
    allDocuments.forEach(doc => {
      const vehicleId = doc.vehicleId?.toString() || doc.fleetUnitId?.toString();
      if (vehicleId) {
        if (!documentsByVehicle[vehicleId]) {
          documentsByVehicle[vehicleId] = [];
        }
        documentsByVehicle[vehicleId].push(doc);
      }
    });

    // Generate signed URLs for images and calculate compliance
    const vehiclesWithSignedUrls = await Promise.all(vehicles.map(async (vehicle) => {
      const vehicleData = { ...vehicle };
      if (vehicleData.imageUrl) {
        vehicleData.imageUrl = await generateSignedUrl(vehicleData.imageUrl);
      }

      // Calculate compliance status
      const vehicleDocuments = documentsByVehicle[vehicle._id.toString()] || [];
      const compliance = await calculateVehicleCompliance(vehicle, vehicleDocuments);

      // Add compliance status to vehicle data
      vehicleData.compliance = compliance.status;
      vehicleData.complianceDetails = compliance;

      return vehicleData;
    }));

    // Calculate total pages
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      message: "Vehicles retrieved successfully",
      data: vehiclesWithSignedUrls,
      pagination: {
        current: pageNum,
        pages: totalPages,
        total: total,
        limit: limitNum
      }
    });
  } catch (err) {
    return handleError(err, res, 400);
  }
};

// ✅ Get Vehicles with Live Tracking Data from Samsara
export const getVehiclesWithTracking = async (req, res) => {
  try {
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");
    const { updateVehicleByTrackingKey } = await import("../services/samsara.js");

    const {
      page = 1,
      limit = 1000, // High limit for tracking dashboard
      search,
      type,
      status,
      operationStatus,
      ownership
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

    // Only get vehicles with trackingKey if requireTrackingKey is true (default: false to show all vehicles)
    const requireTrackingKey = req.query.requireTrackingKey === 'true';
    if (requireTrackingKey) {
      filters.trackingKey = { $exists: true, $ne: null, $ne: '' };
    }

    // Search filter
    if (search) {
      filters.$or = [
        { unitNumber: { $regex: search, $options: 'i' } },
        { internalId: { $regex: search, $options: 'i' } },
        { plateNumber: { $regex: search, $options: 'i' } },
        { vinNumber: { $regex: search, $options: 'i' } },
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { trackingKey: { $regex: search, $options: 'i' } }
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

    // Ownership filter
    if (ownership && ownership !== 'All') {
      // Check both ownership and legacy ownerShip fields
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

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Fetch vehicles with tracking keys
    const vehicles = await Vehicle.find(filters)
      .populate('driver', 'name email phone')
      .populate('trailer', 'trailer unitNumber plateNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Update each vehicle with live data from Samsara
    const vehiclesWithTracking = await Promise.all(vehicles.map(async (vehicle) => {
      if (vehicle.trackingKey) {
        try {
          // Fetch latest data from Samsara using company-specific credentials
          const companyId = vehicle.company?.toString() || null;
          const updatedData = await updateVehicleByTrackingKey(vehicle.trackingKey, companyId);

          if (updatedData) {
            // Merge updated tracking data with vehicle data
            return {
              ...vehicle,
              speed: updatedData.speed || vehicle.speed || 0,
              fuelLevel: updatedData.fuelLevel || vehicle.fuelLevel || 0,
              odometer: updatedData.odometer || vehicle.odometer || 0,
              engineOn: updatedData.engineOn !== undefined ? updatedData.engineOn : (vehicle.engineOn || false),
              operationStatus: updatedData.operationStatus || vehicle.operationStatus || 'IN SERVICE',
              status: updatedData.status || vehicle.status || 'In Service',
              currentLocation: updatedData.currentLocation || vehicle.currentLocation || {
                address: '',
                latitude: '0',
                longitude: '0',
                updatedAt: new Date()
              },
              driverBehaviour: updatedData.driverBehaviour || vehicle.driverBehaviour || {},
              engineHealth: updatedData.engineHealth || vehicle.engineHealth || {}
            };
          }
        } catch (error) {
          console.error(`Error fetching Samsara data for vehicle ${vehicle._id}:`, error.message);
          // Return vehicle with existing data if Samsara update fails
        }
      }

      // Return vehicle with existing data if no trackingKey or update failed
      return {
        ...vehicle,
        currentLocation: vehicle.currentLocation || {
          address: '',
          latitude: '0',
          longitude: '0',
          updatedAt: new Date()
        },
        speed: vehicle.speed || 0,
        fuelLevel: vehicle.fuelLevel || 0,
        odometer: vehicle.odometer || 0,
        engineOn: vehicle.engineOn || false
      };
    }));

    res.json({
      success: true,
      message: "Vehicles with tracking data retrieved successfully",
      data: vehiclesWithTracking
    });
  } catch (err) {
    console.error("Error fetching vehicles with tracking:", err);
    return handleError(err, res, 400);
  }
};

// Utility functions (kept for backward compatibility)
export const selectedVehicle = async (req, res) => {
  try {
    const vehicleId = req.query.vehicleId;
    console.log(vehicleId);

    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    if (!isSuperadmin && !companyId) {
      return res.status(200).json({
        success: true,
        message: "No company assigned to the current admin.",
        data: null
      });
    }
    const query = { _id: vehicleId };
    if (companyId) {
      query.company = companyId;
    }

    const vehicle = await Vehicle.findOne(query);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: "Vehicle not found" });
    }
    return res.json({ success: true, message: "vehicle details", data: vehicle });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getVehiclesData = async (req, res) => {
  try {
    const { driverId, filter } = req.query;

    // find driver with location
    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const query = {};
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(200).json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    if (companyId) {
      query.company = companyId;
    }

    let vehicles = await Vehicle.find(query).populate("driver");

    // Case 1: Nearby vehicles
    if (filter === "nearby" && driver.location?.latitude && driver.location?.longitude) {
      const driverLat = parseFloat(driver.location.latitude);
      const driverLon = parseFloat(driver.location.longitude);

      vehicles = vehicles
        .map((vehicle) => {
          const distance = getDistance(
            driverLat,
            driverLon,
            parseFloat(vehicle.currentLocation?.latitude || 0),
            parseFloat(vehicle.currentLocation?.longitude || 0)
          );
          return { ...vehicle.toObject(), distance };
        })
        .sort((a, b) => a.distance - b.distance);
    }

    // Case 2: Vehicles with Trailer
    else if (filter === "withTrailer") {
      vehicles = vehicles.filter((v) => v.status === "ready-to-load");
    }

    return res.json({ success: true, message: "vehicles", data: vehicles });
  } catch (error) {
    console.error("Error fetching vehicles:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Utility: Haversine formula to calculate distance
const getDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ─── Bulk Import Trucks from CSV / Excel ────────────────────────────────────
export const importVehicles = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const companyId = getUserCompanyId(req.user) || req.user?.company;

    const { rows } = parseImportFile(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ success: false, message: 'File is empty or has no data rows.' });

    let imported = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const plateNumber = row.plate_number || row.platenumber || row.plate || row.license_plate || '';
      const make = row.make || row.manufacturer || '';
      const model = row.model || '';
      const year = row.year || '';
      const vinNumber = row.vin || row.vin_number || row.vinnumber || '';
      const internalId = row.internal_id || row.internalid || row.unit_number || row.unit || `TRK-${Date.now()}-${i}`;
      const type = row.type || row.vehicle_type || '';
      const status = row.status || 'In Service';

      if (!plateNumber) { errors.push({ row: rowNum, data: row, reason: 'Plate number is required' }); continue; }

      // Skip duplicate
      const existing = await Vehicle.findOne({ plateNumber }).lean();
      if (existing) { skipped++; continue; }

      try {
        const vehicle = new Vehicle({
          plateNumber,
          make,
          model,
          year: year ? String(year) : undefined,
          vinNumber: vinNumber || undefined,
          internalId,
          type: type || undefined,
          status,
          company: companyId
        });
        await vehicle.save();
        imported++;
      } catch (saveErr) {
        errors.push({ row: rowNum, data: row, reason: saveErr.message || 'Failed to save' });
      }
    }

    res.json({ success: true, imported, skipped, errors, total: rows.length });
  } catch (error) {
    console.error('importVehicles error:', error);
    res.status(500).json({ success: false, message: error.message || 'Import failed' });
  }
};
