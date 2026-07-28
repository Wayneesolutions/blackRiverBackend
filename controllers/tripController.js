import mongoose from "mongoose";
import axios from "axios";
import Trip from "../models/tripModel.js";
import Order from "../models/orderModel.js";
import Load from "../models/loadModel.js";
import { User } from "../models/driver/userModel.js";
import { FleetUnit } from "../models/fleet/fleetUnitModel.js";
import { Vehicle } from "../models/driver/vehicleModel.js";
import { Trailer } from "../models/driver/trailerModel.js";
import { Invoice } from "../models/hr/invoiceModel.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { getCombinedFilter } from "../utils/trialDataFilter.js";
import { haversineDistance } from "../utils/distance.js";
import { getRouteDistance, getCoordinatesFromAddress } from "../services/googlemap.js";
import { validateDocuments } from "../services/documentValidationService.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/awsConfig.js";
import { sendLoadAssignmentEmail, sendLoadCancellationEmail } from "../services/emailService.js";
import { sendPushToDriver } from "../services/pushNotificationService.js";
import ActivityLog from "../models/activitylogModel.js";

// Helper function to generate signed URL for S3 images
const generateSignedUrl = async (url) => {
  if (!url || (!url.includes('s3.amazonaws.com') && !url.includes('.s3.'))) {
    return url; // Return as-is if not an S3 URL
  }

  try {
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
                          url.toLowerCase().includes('.webp') ? 'image/webp' : 
                          'image/jpeg',
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return url; // Return original URL if signing fails
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

// Create Trip
export const createTrip = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);

    if (!companyId && req.user.role !== 'superadmin') {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first before creating trips."
      });
    }

    const {
      driver,
      coDriver,
      truck,  
      trailer,
      orders = [],
      plannedStartDate,
      plannedEndDate,
      startLocation,
      endLocation,
      route,
      notes,
      borderCompliance
    } = req.body;

    // Always set status to 'planned' for new trips
    const status = 'planned';

    // --- Basic validation ---
    if (!driver || !truck || !plannedStartDate) {
      return res.status(400).json({ success: false, message: "Driver, truck, and planned start date are required." });
    }
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ success: false, message: "At least one order is required to create a trip." });
    }
    if (!mongoose.Types.ObjectId.isValid(driver)) {
      return res.status(400).json({ success: false, message: "Invalid driver ID." });
    }

    // --- Truck Handling ---
    let truckId = truck;
    if (truck) {
      const realTruckId = extractRealId(truck);
      let truckDoc = null;

      if (isValidObjectId(realTruckId)) {
        truckDoc = await FleetUnit.findOne({
          $or: [
            { _id: new mongoose.Types.ObjectId(realTruckId) },
            { internalId: truck },
            { internalId: realTruckId }
          ],
          unitType: "Truck"
        });
      }

      if (!truckDoc) {
        if (isValidObjectId(realTruckId)) truckDoc = await Vehicle.findById(realTruckId);
        else truckDoc = await Vehicle.findOne({ $or: [{ internalId: truck }, { internalId: realTruckId }] });
      }

      if (truckDoc) truckId = truckDoc._id;
      else return res.status(400).json({ success: false, message: "Invalid truck ID. Truck not found." });
    }

    // --- Trailer Handling ---
    let trailerId = null;
    if (trailer) {
      const realTrailerId = extractRealId(trailer);
      let trailerDoc = null;

      if (isValidObjectId(realTrailerId)) {
        trailerDoc = await FleetUnit.findOne({
          $or: [
            { _id: new mongoose.Types.ObjectId(realTrailerId) },
            { internalId: trailer },
            { internalId: realTrailerId }
          ],
          unitType: { $ne: "Truck" }
        });
      }

      if (!trailerDoc) {
        if (isValidObjectId(realTrailerId)) trailerDoc = await Trailer.findById(realTrailerId);
        else trailerDoc = await Trailer.findOne({ $or: [{ internalId: trailer }, { internalId: realTrailerId }] });
      }

      if (trailerDoc) trailerId = trailerDoc._id;
      else return res.status(400).json({ success: false, message: "Invalid trailer ID. Trailer not found." });
    }

    // --- Validate orders ---
    for (const orderId of orders) {
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({ success: false, message: `Invalid order ID: ${orderId}` });
      }
    }

    const existingOrders = await Order.find({ _id: { $in: orders } });
    if (existingOrders.length !== orders.length) {
      return res.status(400).json({ success: false, message: "One or more orders not found." });
    }

    // --- Trip creation ---
    const tripData = {
      driver: new mongoose.Types.ObjectId(driver),
      coDriver: coDriver && mongoose.Types.ObjectId.isValid(coDriver) ? new mongoose.Types.ObjectId(coDriver) : null,
      truck: truckId ? new mongoose.Types.ObjectId(truckId) : null,
      trailer: trailerId ? new mongoose.Types.ObjectId(trailerId) : null,
      orders: orders.map(id => new mongoose.Types.ObjectId(id)),
      plannedStartDate: new Date(plannedStartDate),
      plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : null,
      startLocation: startLocation || null,
      endLocation: endLocation || null,
      route: route || null,
      notes: notes || '',
      status,
      company: companyId,
      createdBy: req.user._id,
      // Border Compliance
      borderCompliance: borderCompliance ? {
        required: borderCompliance.required || false,
        type: borderCompliance.type || null,
        provider: borderCompliance.provider || null,
        status: borderCompliance.status || 'Not Filed',
        lastUpdated: borderCompliance.lastUpdated || '',
        papsNumber: borderCompliance.papsNumber || '',
        parsNumber: borderCompliance.parsNumber || '',
        acceptanceTime: borderCompliance.acceptanceTime || '',
        rejectionReason: borderCompliance.rejectionReason || '',
        brokerConfirmation: borderCompliance.brokerConfirmation || false
      } : undefined
    };

    // --- Handle uploaded files (documents & load securement pictures) if provided ---
    // Store validation result in outer scope for response
    let tripValidationResult = null;
    
    try {
      const files = req.files || {};
      console.log('📦 [TRIP CREATE] All files received:', Object.keys(files));
      console.log('📦 [TRIP CREATE] Files object:', {
        documents: files.documents ? (Array.isArray(files.documents) ? files.documents.length : 1) : 0,
        loadSecurementPictures: files.loadSecurementPictures ? (Array.isArray(files.loadSecurementPictures) ? files.loadSecurementPictures.length : 1) : 0,
        allKeys: Object.keys(files)
      });
      
      const docFiles = Array.isArray(files.documents) ? files.documents : (files.documents ? [files.documents] : []);
      const secureFiles = Array.isArray(files.loadSecurementPictures) ? files.loadSecurementPictures : (files.loadSecurementPictures ? [files.loadSecurementPictures] : []);

      console.log(`📦 [TRIP CREATE] Extracted docFiles: ${docFiles.length}, secureFiles: ${secureFiles.length}`);

      // Enforce maximum 3 documents per trip on creation
      if (docFiles.length > 3) {
        return res.status(400).json({ success: false, message: 'You can upload a maximum of 3 documents for a trip.' });
      }

      const allowedDocTypes = ['bol','pod','stamped_manifest','manifest','load_con','proof_of_delivery','other'];

      // Attach documents and validate them
      if (docFiles.length > 0) {
        console.log(`📦 [TRIP CREATE] Processing ${docFiles.length} document file(s)`);
        console.log(`📦 [TRIP CREATE] File details:`, docFiles.map(f => ({
          originalname: f.originalname || f.key || f.filename || 'unknown',
          hasPath: !!f.path,
          hasLocation: !!f.location,
          hasKey: !!f.key,
          hasBucket: !!f.bucket
        })));
        
        tripData.documents = [];
        const documentsToValidate = [];
        
        for (let i = 0; i < docFiles.length; i++) {
          const file = docFiles[i];

          // Determine document type: prefer explicit per-file body field, then array, then single field
          let docType = 'other';
          // Support common FormData patterns
          if (req.body && req.body.documentType) {
            if (Array.isArray(req.body.documentType)) docType = req.body.documentType[i] || req.body.documentType[0] || 'other';
            else docType = req.body.documentType || 'other';
          }
          const indexedKey = `documents[${i}][documentType]`;
          if (req.body && req.body[indexedKey]) docType = req.body[indexedKey];

          if (!allowedDocTypes.includes(docType)) docType = 'other';

          const fileUrl = file.location || file.path || file.key || `/${(file.path || file.filename || file.key || file.originalname || '').toString().replace(/\\/g, '/')}`;

          tripData.documents.push({
            fileUrl,
            fileName: file.originalname || file.key || file.filename || '',
            fileSize: file.size || 0,
            mimeType: file.mimetype || '',
            type: docType,
            uploadedBy: req.user._id,
            uploadedAt: new Date(),
            description: ''
          });
          
          // Collect documents for validation - handle both local and S3 files
          console.log(`📄 [TRIP CREATE] Processing file ${i + 1}/${docFiles.length}:`, {
            originalname: file.originalname || file.key || file.filename || 'unknown',
            hasPath: !!file.path,
            hasLocation: !!file.location,
            hasKey: !!file.key,
            hasBucket: !!file.bucket,
            allKeys: Object.keys(file)
          });
          
          if (file.path || file.location || file.key) {
            documentsToValidate.push({
              path: file.path || null,
              location: file.location || null,
              key: file.key || null,
              bucket: process.env.AWS_S3_BUCKET_NAME || null,
              originalname: file.originalname || file.key || file.filename || '',
              type: docType,
              filename: file.filename
            });
            console.log(`✅ [TRIP CREATE] Added file ${i + 1} to validation queue`);
          } else {
            console.warn(`⚠️ [TRIP CREATE] File ${i + 1} skipped - no path, location, or key found`);
            console.warn(`⚠️ [TRIP CREATE] File object:`, JSON.stringify(file, null, 2));
          }
        }
        
        console.log(`📊 [TRIP CREATE] Total documents collected for validation: ${documentsToValidate.length}`);
        
        // Validate documents using AI
        if (documentsToValidate.length > 0) {
          console.log(`🤖 [TRIP CREATE] Starting AI validation for ${documentsToValidate.length} document(s)...`);
          try {
            const tripDataForValidation = {
              tripNumber: tripData.tripNumber || 'New Trip',
              driver: tripData.driver || null
            };
            
            console.log(`📋 [TRIP CREATE] Validation context:`, tripDataForValidation);
            console.log(`📄 [TRIP CREATE] Documents to validate:`, documentsToValidate.map(d => ({
              fileName: d.originalname,
              type: d.type,
              path: d.path ? 'exists' : 'missing'
            })));
            
            tripValidationResult = await validateDocuments(documentsToValidate, 'trip', tripDataForValidation);
            
            console.log('✅ [TRIP CREATE] AI validation completed:', {
              valid: tripValidationResult.valid,
              errors: tripValidationResult.errors.length,
              warnings: tripValidationResult.warnings.length,
              missing: tripValidationResult.missing.length,
              documentDetails: tripValidationResult.documentDetails?.length || 0
            });
            
            if (tripValidationResult.errors.length > 0) {
              console.error('❌ [TRIP CREATE] Validation errors:', tripValidationResult.errors);
            }
            if (tripValidationResult.warnings.length > 0) {
              console.warn('⚠️ [TRIP CREATE] Validation warnings:', tripValidationResult.warnings);
            }
            
            // If validation failed with critical errors, return error response
            if (!tripValidationResult.valid && tripValidationResult.errors.length > 0) {
              const errorMessages = tripValidationResult.errors.map(e => 
                `${e.document || 'Document'}: ${e.message}`
              ).join('; ');
              
              return res.status(400).json({
                success: false,
                message: 'Document validation failed',
                validation: {
                  valid: false,
                  errors: tripValidationResult.errors,
                  warnings: tripValidationResult.warnings,
                  missing: tripValidationResult.missing
                },
                details: errorMessages
              });
            }
          } catch (validationError) {
            console.error('❌ [TRIP CREATE] Trip document validation error:', validationError);
            console.error('❌ [TRIP CREATE] Validation error details:', {
              message: validationError.message,
              stack: validationError.stack,
              documentsCount: documentsToValidate.length
            });
            // Continue with trip creation even if validation fails (non-blocking)
            // Set tripValidationResult to indicate validation failed
            tripValidationResult = {
              success: false,
              valid: false,
              errors: [{
                message: `Validation system error: ${validationError.message || 'Unknown error'}`
              }],
              warnings: [],
              missing: [],
              message: 'Document validation failed due to system error'
            };
          }
        } else {
          console.log(`⚠️ [TRIP CREATE] No documents to validate (documentsToValidate.length = ${documentsToValidate.length})`);
          console.log(`⚠️ [TRIP CREATE] docFiles.length = ${docFiles.length}`);
        }
      }

      // Attach load securement pictures
      if (secureFiles.length > 0) {
        tripData.loadSecurementPictures = tripData.loadSecurementPictures || [];
        for (const file of secureFiles) {
          const fileUrl = file.location || file.path || file.key || `/${(file.path || file.filename || file.key || file.originalname || '').toString().replace(/\\/g, '/')}`;
          tripData.loadSecurementPictures.push({
            fileUrl,
            fileName: file.originalname || file.key || file.filename || '',
            fileSize: file.size || 0,
            mimeType: file.mimetype || '',
            uploadedBy: req.user._id,
            uploadedAt: new Date()
          });
        }
      }
    } catch (fileErr) {
      console.error('Error processing uploaded files for trip creation:', fileErr);
      return res.status(400).json({ success: false, message: 'Error processing uploaded files.' });
    }

    let trip;
    let retryCount = 0;
    const maxRetries = 5;

    while (retryCount < maxRetries) {
      try {
        trip = new Trip(tripData);
        if (retryCount > 0) trip.tripNumber = undefined;
        await trip.save();
        break;
      } catch (error) {
        if (error.code === 11000 && error.keyPattern?.tripNumber) retryCount++;
        else throw error;
      }
    }

    if (!trip) return res.status(500).json({ success: false, message: "Failed to create trip. Please try again." });

    // --- Update orders with trip info ---
    await Order.updateMany(
      { _id: { $in: trip.orders } },
      { $set: { tripNo: trip.tripNumber, status: 'dispatched' } }
    );

    // Propagate driver assignment to Vehicle so the GPS map can populate it
    if (truckId && driver) {
      await Vehicle.findByIdAndUpdate(truckId, { driver: new mongoose.Types.ObjectId(driver) });
    }

    // --- Automatic Manifest / ACE-ACI Integration ---
    try {
      const shipmentData = existingOrders.map(order => ({
        orderNumber: order.orderNumber,
        customer: order.customer.toString(),
        pickup: order.pickupLocation,
        delivery: order.deliveryLocation,
        commodity: order.commodity,
        value: order.valueOfGoods,
        weight: order.weight,
        packages: order.noOfPackages
      }));

      const manifestResponse = await axios.post('https://api.thirdparty.com/submitManifest', {
        tripNumber: trip.tripNumber,
        orders: shipmentData,
        companyId: companyId.toString()
      }, {
        headers: { 'Authorization': `Bearer ${process.env.MANIFEST_API_KEY}` }
      });

      const { manifestNumbers } = manifestResponse.data;

      // Update orders with manifest numbers
      for (const order of existingOrders) {
        if (manifestNumbers[order._id]) {
          order.manifestNumber = manifestNumbers[order._id];
          await order.save();
        }
      }

      // Save manifest numbers in trip
      trip.manifestNumbers = manifestNumbers;
      await trip.save();

    } catch (manifestError) {
      console.error('Manifest submission failed:', manifestError);
    }

    // --- Populate references ---
    await trip.populate([
      {path: 'coDriver', select: 'name email phone' },
      { path: 'driver', select: 'name email phone' },
      { path: 'truck', select: 'plateNumber make model internalId' },
      { path: 'trailer', select: 'plateNumber trailerNumber' },
      {
        path: 'orders', populate: [
          { path: 'customer', select: 'name email phone address' },
          { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
          { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
        ]
      },
      { path: 'company', select: 'companyName companyCode' }
    ]);

    // ✅ Send assignment emails to drivers if assigned during trip creation
    if (trip.driver || trip.coDriver) {
      try {
        // Get first order details for email (if available)
        const firstOrder = trip.orders && trip.orders.length > 0 ? trip.orders[0] : null;
        const tripDetailsForEmail = {
          pickupAddress: firstOrder?.pickupLocation?.place || firstOrder?.shipper?.address || trip.startLocation?.address || 'Not specified',
          dropoffAddress: firstOrder?.deliveryLocation?.place || firstOrder?.receiver?.address || trip.endLocation?.address || 'Not specified',
          customerName: firstOrder?.customer?.name || 'Customer',
          vehiclePlate: trip.truck?.plateNumber || trip.truck?.internalId || 'Not assigned',
          assignedAt: trip.createdAt || new Date()
        };

        // Send email to driver if assigned
        // Note: If the same person is assigned as both driver and co-driver, they will receive 2 separate emails
        if (trip.driver && trip.driver.email) {
          try {
            const isSameAsCoDriver = trip.driver._id?.toString() === trip.coDriver?._id?.toString();
            console.log('📧 [TRIP CREATE] Sending assignment email to driver:', {
              driverId: trip.driver._id,
              driverEmail: trip.driver.email,
              driverName: trip.driver.name,
              tripId: trip._id.toString(),
              tripNumber: trip.tripNumber,
              isAlsoCoDriver: isSameAsCoDriver ? 'Yes (will receive 2 emails)' : 'No'
            });

            const assignmentResult = await sendLoadAssignmentEmail({
              driverEmail: trip.driver.email,
              driverName: trip.driver.name || 'Driver',
              loadId: trip._id.toString(),
              loadInternalId: trip.tripNumber,
              loadDetails: tripDetailsForEmail
            });

            if (assignmentResult.success) {
              console.log('✅ [TRIP CREATE] Assignment email sent successfully to driver:', trip.driver.email);
            } else {
              console.error('❌ [TRIP CREATE] Failed to send assignment email to driver:', assignmentResult.message || assignmentResult.error);
            }
          } catch (driverEmailError) {
            console.error('❌ [TRIP CREATE] Error sending assignment email to driver:', driverEmailError);
            // Don't fail the trip creation if email fails
          }
        } else {
          console.warn('⚠️ [TRIP CREATE] Driver assigned but no email found:', {
            driverId: trip.driver?._id,
            hasDriver: !!trip.driver,
            hasEmail: !!trip.driver?.email
          });
        }

        // Send email to co-driver if assigned
        // Note: Even if same person as driver, they will receive a separate email for co-driver role
        if (trip.coDriver && trip.coDriver.email) {
          try {
            const isSameAsDriver = trip.coDriver._id?.toString() === trip.driver?._id?.toString();
            console.log('📧 [TRIP CREATE] Sending assignment email to co-driver:', {
              coDriverId: trip.coDriver._id,
              coDriverEmail: trip.coDriver.email,
              coDriverName: trip.coDriver.name,
              tripId: trip._id.toString(),
              tripNumber: trip.tripNumber,
              isAlsoDriver: isSameAsDriver ? 'Yes (will receive 2 emails total)' : 'No'
            });

            const assignmentResult = await sendLoadAssignmentEmail({
              driverEmail: trip.coDriver.email,
              driverName: trip.coDriver.name || 'Co-Driver',
              loadId: trip._id.toString(),
              loadInternalId: trip.tripNumber,
              loadDetails: tripDetailsForEmail
            });

            if (assignmentResult.success) {
              console.log('✅ [TRIP CREATE] Assignment email sent successfully to co-driver:', trip.coDriver.email);
            } else {
              console.error('❌ [TRIP CREATE] Failed to send assignment email to co-driver:', assignmentResult.message || assignmentResult.error);
            }
          } catch (coDriverEmailError) {
            console.error('❌ [TRIP CREATE] Error sending assignment email to co-driver:', coDriverEmailError);
            // Don't fail the trip creation if email fails
          }
        } else if (trip.coDriver) {
          console.warn('⚠️ [TRIP CREATE] Co-driver assigned but no email found:', {
            coDriverId: trip.coDriver._id,
            hasCoDriver: !!trip.coDriver,
            hasEmail: !!trip.coDriver?.email
          });
        }
      } catch (emailError) {
        console.error('❌ [TRIP CREATE] Error processing assignment emails:', emailError);
        // Don't fail the trip creation if email processing fails
      }
    } else {
      console.log('ℹ️ [TRIP CREATE] No driver or co-driver assigned, skipping email notifications');
    }

    // Push notifications to driver / co-driver
    try {
      const pickupAddress = trip.orders?.[0]?.pickupLocation?.place || trip.startLocation?.address || 'See app for details';
      const pushBody = `Trip #${trip.tripNumber} — Pick up: ${pickupAddress}`;

      if (trip.driver?._id) {
        const driverDoc = await User.findById(trip.driver._id).select('expoPushToken').lean();
        if (driverDoc?.expoPushToken) {
          await sendPushToDriver(
            driverDoc.expoPushToken,
            'New Trip Assigned',
            pushBody,
            { type: 'trip_assigned', tripId: trip._id.toString(), tripNumber: trip.tripNumber, channelId: 'logistiq-trips' }
          );
        }
      }
      if (trip.coDriver?._id && trip.coDriver._id.toString() !== trip.driver?._id?.toString()) {
        const coDriverDoc = await User.findById(trip.coDriver._id).select('expoPushToken').lean();
        if (coDriverDoc?.expoPushToken) {
          await sendPushToDriver(
            coDriverDoc.expoPushToken,
            'New Trip Assigned',
            pushBody,
            { type: 'trip_assigned', tripId: trip._id.toString(), tripNumber: trip.tripNumber, channelId: 'logistiq-trips' }
          );
        }
      }
    } catch (pushErr) {
      console.error('[Push] Trip assignment push failed:', pushErr.message);
    }

    // Save ActivityLog entries so driver Notifications screen shows the assignment
    try {
      const pickupAddr = trip.orders?.[0]?.pickupLocation?.place || trip.startLocation?.place || 'See app';
      const logSummary = `Trip #${trip.tripNumber} assigned — Pick up: ${pickupAddr}`;
      const logEntries = [];
      if (trip.driver?._id) {
        logEntries.push({ action: 'New Trip Assigned', driver: trip.driver._id, changeSummary: logSummary });
      }
      if (trip.coDriver?._id && trip.coDriver._id.toString() !== trip.driver?._id?.toString()) {
        logEntries.push({ action: 'New Trip Assigned', driver: trip.coDriver._id, changeSummary: logSummary });
      }
      if (logEntries.length > 0) {
        await ActivityLog.insertMany(logEntries);
      }
    } catch (logErr) {
      console.error('[ActivityLog] Trip assignment log failed:', logErr.message);
    }

    // ALWAYS include validation results if validation was performed
    console.log('📋 [TRIP CREATE] Preparing response with validation results:', {
      hasValidationResult: !!tripValidationResult,
      valid: tripValidationResult?.valid,
      errors: tripValidationResult?.errors?.length || 0,
      warnings: tripValidationResult?.warnings?.length || 0,
      missing: tripValidationResult?.missing?.length || 0
    });
    
    // Include validation results in response if available
    const responseData = {
      success: true,
      message: "Trip created successfully. Manifest submission attempted.",
      data: trip
    };
    
    // Include validation results if validation was performed
    if (tripValidationResult) {
      console.log('📋 [TRIP CREATE] Including validation results in response:', {
        valid: tripValidationResult.valid,
        errors: tripValidationResult.errors?.length || 0,
        warnings: tripValidationResult.warnings?.length || 0,
        missing: tripValidationResult.missing?.length || 0
      });
      responseData.validation = {
        valid: tripValidationResult.valid,
        errors: tripValidationResult.errors || [],
        warnings: tripValidationResult.warnings || [],
        missing: tripValidationResult.missing || [],
        documentDetails: tripValidationResult.documentDetails || []
      };
      
      // Always show validation results, even if valid
      if (tripValidationResult.errors && tripValidationResult.errors.length > 0) {
        const errorSummary = tripValidationResult.errors.map(e => e.message).join('; ');
        responseData.message += ` ⚠️ Document validation found ${tripValidationResult.errors.length} error(s): ${errorSummary}`;
      }
      if (tripValidationResult.warnings && tripValidationResult.warnings.length > 0) {
        responseData.message += ` ⚠️ Document validation completed with ${tripValidationResult.warnings.length} warning(s).`;
      }
      if (tripValidationResult.missing.length > 0) {
        responseData.message += ` ⚠️ ${tripValidationResult.missing.length} required document(s) missing.`;
      }
    }
    
    res.status(201).json(responseData);

  } catch (error) {
    console.error("Error creating trip:", error);
    res.status(500).json({ success: false, message: error.message || "An error occurred while creating the trip." });
  }
};
// Get All Trips
export const getAllTrips = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const {
      page = 1,
      limit = 10,
      status,
      driver,
      truck,
      search,
      startDate,
      endDate
    } = req.query;

    // Build filter
    const filter = {};

    if (companyId && req.user.role !== 'superadmin') {
      filter.company = companyId;
    }

    if (status) {
      filter.status = status;
    }

    if (driver) {
      filter.driver = driver;
    }

    if (truck) {
      filter.truck = truck;
    }

    if (search) {
      filter.$or = [
        { tripNumber: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      filter.plannedStartDate = {};
      if (startDate) {
        filter.plannedStartDate.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.plannedStartDate.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const trips = await Trip.find(filter)
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'licensePlate unitNo makeModel make model internalId unitType')
      .populate('trailer', 'licensePlate unitNo makeModel unitType')
      .populate({
        path: 'orders',
        select: 'orderNumber customerOrderNo status pickupLocation deliveryLocation pickupDate deliveryDate customer orderType attachments',
        populate: [
          { path: 'customer', select: 'name email phone address' },
          { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
          { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
        ]
      })
      .populate('documents.uploadedBy', 'name email')
      .populate('documentsApprovedBy', 'name email')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Trip.countDocuments(filter);

    res.json({
      success: true,
      data: trips,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching trips:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while fetching trips."
    });
  }
};

// Get orders for invoice creation - using Order model only
export const getTripsForInvoice = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Build filter - get completed orders
    const filter = { status: 'completed' };

    if (companyId && !isSuperadmin) {
      filter.company = companyId;
    }

    // Get combined filter (company + trial data filter)
    const companyFilter = companyId ? { company: companyId } : null;
    const combinedFilter = await getCombinedFilter(req.user, companyFilter);
    if (combinedFilter) {
      Object.assign(filter, combinedFilter);
    }

    // Fetch completed orders with proper population
    const orders = await Order.find(filter)
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'unitNumber plateNumber internalId make model type')
      .populate('trailer', 'unitNumber plateNumber internalId make model type')
      .populate({
        path: 'customer',
        select: 'name email phone address company city state country customerDetails'
      })
      .populate({
        path: 'company',
        select: 'companyName address contactEmail contactPhone taxNumber logoUrl'
      })
      .populate({
        path: 'pickupLocation.placeId',
        select: 'name currentLocation.address currentLocation.latitude currentLocation.longitude city state'
      })
      .populate({
        path: 'deliveryLocation.placeId',
        select: 'name currentLocation.address currentLocation.latitude currentLocation.longitude city state'
      })
      .sort({ deliveryDate: -1, updatedAt: -1 })
      .limit(1000); // Limit to prevent too much data

    // Generate signed URLs for company logos
    const ordersWithSignedUrls = await Promise.all(
      orders.map(async (order) => {
        const orderObj = order.toObject();
        
        // Generate signed URL for company logo if it exists
        if (orderObj.company && orderObj.company.logoUrl) {
          try {
            orderObj.company.logoUrl = await generateSignedUrl(orderObj.company.logoUrl);
          } catch (error) {
            console.error('Error generating signed URL for company logo:', error);
            // Keep the original URL if signing fails
          }
        }
        
        return orderObj;
      })
    );

    res.json({
      success: true,
      data: ordersWithSignedUrls
    });
  } catch (error) {
    console.error("Error fetching orders for invoice:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while fetching orders."
    });
  }
};

// Get Trip by ID
export const getTripById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);

    const filter = { _id: id };
    if (companyId && req.user.role !== 'superadmin') {
      filter.company = companyId;
    }

    const trip = await Trip.findOne(filter)
      .populate('driver', 'name email phone details')
      .populate('coDriver', 'name email phone details')
      .populate('truck', 'licensePlate unitNo makeModel make model internalId unitType')
      .populate('trailer', 'licensePlate unitNo makeModel unitType plateNumber trailerNumber internalId trailerType capacity')
      .populate({
        path: 'orders',
        select: 'orderNumber customerOrderNo status pickupLocation deliveryLocation pickupDate deliveryDate customer orderType attachments',
        populate: [
          { path: 'customer', select: 'name email phone address' },
          { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
          { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
        ]
      })
      .populate('documents.uploadedBy', 'name email')
      .populate('documentsApprovedBy', 'name email')
      .populate('company', 'name')
      .populate('startLocation.placeId')
      .populate('endLocation.placeId')
      .lean(); // Use lean() to get plain JavaScript object

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found."
      });
    }

    // REMOVED: Auto-generation of sample coordinates
    // Only return trips with actual traveledPath data - don't generate fake paths
    // This ensures that only trips with real GPS tracking data show traveled paths on the map
    // (Previously, this would generate sample paths for all trips, causing all trips to show the same path)

    res.json({
      success: true,
      data: trip
    });
  } catch (error) {
    console.error("Error fetching trip:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while fetching the trip."
    });
  }
};

// Update Trip
export const updateTrip = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);

    const filter = { _id: id };
    if (companyId && req.user.role !== 'superadmin') {
      filter.company = companyId;
    }

    const trip = await Trip.findOne(filter);

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found."
      });
    }

    const {
      driver,
      coDriver,
      truck,
      trailer,
      orders,
      plannedStartDate,
      plannedEndDate,
      startLocation,
      endLocation,
      route,
      notes,
      status,
      borderCompliance
    } = req.body;

    // Check if trying to set status to 'completed' without document approval
    if (status === 'completed' && !trip.documentsApproved) {
      return res.status(400).json({
        success: false,
        message: 'Cannot complete trip. Documents must be approved by dispatcher first. Please approve the trip documents before marking it as completed.'
      });
    }

    // Track previous driver/coDriver IDs to detect new assignments
    const previousDriverId = trip.driver?.toString();
    const previousCoDriverId = trip.coDriver?.toString();

    // Update fields
    if (driver && mongoose.Types.ObjectId.isValid(driver)) {
      trip.driver = new mongoose.Types.ObjectId(driver);
    }

    if (coDriver !== undefined) {
      if (coDriver === null || coDriver === '') {
        trip.coDriver = null;
      } else if (mongoose.Types.ObjectId.isValid(coDriver)) {
        trip.coDriver = new mongoose.Types.ObjectId(coDriver);
      }
    }

    // Check if driver or coDriver was just assigned
    const newDriverId = trip.driver?.toString();
    const newCoDriverId = trip.coDriver?.toString();
    const driverJustAssigned = newDriverId && previousDriverId !== newDriverId;
    const coDriverJustAssigned = newCoDriverId && previousCoDriverId !== newCoDriverId;

    // --- Truck Handling ---
    if (truck) {
      const realTruckId = extractRealId(truck);
      let truckDoc = null;

      if (isValidObjectId(realTruckId)) {
        truckDoc = await FleetUnit.findOne({
          $or: [
            { _id: new mongoose.Types.ObjectId(realTruckId) },
            { internalId: truck },
            { internalId: realTruckId }
          ],
          unitType: "Truck"
        });
      }

      if (!truckDoc) {
        if (isValidObjectId(realTruckId)) truckDoc = await Vehicle.findById(realTruckId);
        else truckDoc = await Vehicle.findOne({ $or: [{ internalId: truck }, { internalId: realTruckId }] });
      }

      if (truckDoc) {
        trip.truck = truckDoc._id;
      } else {
        return res.status(400).json({ success: false, message: "Invalid truck ID. Truck not found." });
      }
    }

    // --- Trailer Handling ---
    if (trailer !== undefined) {
      if (trailer === null || trailer === '') {
        trip.trailer = null;
      } else {
        const realTrailerId = extractRealId(trailer);
        let trailerDoc = null;

        // First, try to find by the original trailer value (might be "custom-xxx" or ObjectId)
        // Search in FleetUnit first (most common case)
        trailerDoc = await FleetUnit.findOne({
          $or: [
            { internalId: trailer }, // Original value (e.g., "custom-693cd...")
            { internalId: realTrailerId }, // Extracted ID (e.g., "693cd...")
            ...(isValidObjectId(realTrailerId) ? [{ _id: new mongoose.Types.ObjectId(realTrailerId) }] : []),
            ...(isValidObjectId(trailer) ? [{ _id: new mongoose.Types.ObjectId(trailer) }] : [])
          ],
          unitType: { $ne: "Truck" }
        });

        // If not found in FleetUnit, try Trailer model
        if (!trailerDoc) {
          if (isValidObjectId(realTrailerId)) {
            trailerDoc = await Trailer.findById(realTrailerId);
          }
          if (!trailerDoc) {
            trailerDoc = await Trailer.findOne({ 
              $or: [
                { internalId: trailer },
                { internalId: realTrailerId },
                ...(isValidObjectId(trailer) ? [{ _id: new mongoose.Types.ObjectId(trailer) }] : [])
              ] 
            });
          }
        }

        if (trailerDoc) {
          trip.trailer = trailerDoc._id;
        } else {
          // Don't fail if trailer is optional - just log a warning
          console.warn(`⚠️ Trailer not found for ID: ${trailer}. Setting trailer to null.`);
          trip.trailer = null;
        }
      }
    }

    if (Array.isArray(orders)) {
      const validOrders = orders.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));

      // Get old orders that are being removed
      const oldOrderIds = trip.orders.map(id => id.toString());
      const newOrderIds = validOrders.map(id => id.toString());
      const removedOrderIds = oldOrderIds.filter(id => !newOrderIds.includes(id));

      trip.orders = validOrders;

      // Clear trip number and reset status for removed orders
      if (removedOrderIds.length > 0) {
        await Order.updateMany(
          { _id: { $in: removedOrderIds } },
          {
            $set: {
              tripNo: '',
              status: 'planned'
            }
          }
        );
      }
    }

    if (plannedStartDate !== undefined) {
      trip.plannedStartDate = plannedStartDate ? new Date(plannedStartDate) : null;
    }

    if (plannedEndDate !== undefined) {
      trip.plannedEndDate = plannedEndDate ? new Date(plannedEndDate) : null;
    }

    if (startLocation !== undefined) {
      trip.startLocation = startLocation;
    }

    if (endLocation !== undefined) {
      trip.endLocation = endLocation;
    }

    if (route !== undefined) {
      trip.route = route;
    }

    if (notes !== undefined) {
      trip.notes = notes;
    }

    const wasCompleted = trip.status === 'completed';
    const isBeingCompleted = status === 'completed' && trip.status !== 'completed';

    // Double-check: Block status change to 'completed' if documents are not approved
    if (status === 'completed' && !trip.documentsApproved) {
      return res.status(400).json({
        success: false,
        message: 'Cannot complete trip. Documents must be approved by dispatcher first. Please approve the trip documents before marking it as completed.'
      });
    }

    if (status) {
      trip.status = status;
    }

    // Set actualEndDate if trip is being completed
    if (isBeingCompleted && !trip.actualEndDate) {
      trip.actualEndDate = new Date();
    }

    // Update border compliance if provided (check for both null and undefined)
    if (borderCompliance !== undefined && borderCompliance !== null) {
      trip.borderCompliance = {
        required: borderCompliance.required || false,
        type: borderCompliance.type || null,
        provider: borderCompliance.provider || null,
        status: borderCompliance.status || 'Not Filed',
        lastUpdated: borderCompliance.lastUpdated || '',
        papsNumber: borderCompliance.papsNumber || '',
        parsNumber: borderCompliance.parsNumber || '',
        acceptanceTime: borderCompliance.acceptanceTime || '',
        rejectionReason: borderCompliance.rejectionReason || '',
        brokerConfirmation: borderCompliance.brokerConfirmation || false
      };
    } else if (borderCompliance === null) {
      // If explicitly set to null, reset border compliance
      trip.borderCompliance = {
        required: false,
        type: null,
        provider: null,
        status: 'Not Filed',
        lastUpdated: '',
        papsNumber: '',
        parsNumber: '',
        acceptanceTime: '',
        rejectionReason: '',
        brokerConfirmation: false
      };
    }

    trip.updatedBy = req.user._id;

    await trip.save();

    // Keep Vehicle.driver in sync when driver or truck changes
    if (trip.truck && trip.driver) {
      await Vehicle.findByIdAndUpdate(trip.truck, { driver: trip.driver });
    }

    // Populate trip for email sending
    await trip.populate([
      { path: 'driver', select: 'name email phone' },
      { path: 'coDriver', select: 'name email phone' },
      { path: 'truck', select: 'plateNumber internalId' },
      { path: 'trailer', select: 'plateNumber trailerNumber' },
      {
        path: 'orders',
        populate: [
          { path: 'customer', select: 'name email phone address' },
          { path: 'pickupLocation.placeId', select: 'name currentLocation' },
          { path: 'deliveryLocation.placeId', select: 'name currentLocation' }
        ]
      }
    ]);

    // ✅ Send cancellation emails to previous drivers if they were replaced or unassigned
    // IMPORTANT: Only send cancellation if the previous driver/co-driver is NOT the new driver AND NOT the new co-driver
    // (i.e., they're actually being replaced by a different person, not just moved to a different role)
    const previousDriverStillAssigned = previousDriverId && (previousDriverId === newDriverId || previousDriverId === newCoDriverId);
    const previousCoDriverStillAssigned = previousCoDriverId && (previousCoDriverId === newDriverId || previousCoDriverId === newCoDriverId);
    
    // Driver was replaced/unassigned if: previous driver exists AND is NOT the new driver AND NOT the new co-driver
    const driverWasReplaced = previousDriverId && !previousDriverStillAssigned && (previousDriverId !== newDriverId);
    // Co-driver was replaced/unassigned if: previous co-driver exists AND is NOT the new driver AND NOT the new co-driver
    const coDriverWasReplaced = previousCoDriverId && !previousCoDriverStillAssigned && (previousCoDriverId !== newCoDriverId);

    if (driverWasReplaced || coDriverWasReplaced) {
      try {
        // Get first order details for email (if available)
        const firstOrder = trip.orders && trip.orders.length > 0 ? trip.orders[0] : null;
        const tripDetailsForEmail = {
          pickupAddress: firstOrder?.pickupLocation?.place || firstOrder?.shipper?.address || trip.startLocation?.address || 'Not specified',
          dropoffAddress: firstOrder?.deliveryLocation?.place || firstOrder?.receiver?.address || trip.endLocation?.address || 'Not specified',
          customerName: firstOrder?.customer?.name || 'Customer',
          vehiclePlate: trip.truck?.plateNumber || trip.truck?.internalId || 'Not assigned'
        };

        // Send cancellation email to previous driver if replaced or unassigned (and not moved to co-driver role)
        if (driverWasReplaced && previousDriverId) {
          try {
            const previousDriver = await User.findById(previousDriverId).select('name email');
            if (previousDriver && previousDriver.email) {
              // Check if they're being moved to co-driver role
              const movedToCoDriver = previousDriverId === newCoDriverId;
              const reason = movedToCoDriver
                ? 'You have been reassigned as co-driver for this trip.'
                : (newDriverId 
                  ? 'A new driver has been assigned to this trip.' 
                  : 'You have been unassigned from this trip.');
              
              // Only send cancellation if they're actually being replaced, not just moved to co-driver
              if (!movedToCoDriver) {
                console.log('📧 [TRIP UPDATE] Sending cancellation email to previous driver:', {
                  driverId: previousDriverId,
                  driverEmail: previousDriver.email,
                  driverName: previousDriver.name,
                  reason: reason,
                  tripId: trip._id.toString()
                });

                const cancellationResult = await sendLoadCancellationEmail({
                  driverEmail: previousDriver.email,
                  driverName: previousDriver.name || 'Driver',
                  orderId: trip._id.toString(),
                  orderNumber: trip.tripNumber,
                  orderDetails: tripDetailsForEmail
                });

                if (cancellationResult.success) {
                  console.log('✅ [TRIP UPDATE] Trip cancellation email sent to previous driver:', previousDriver.email);
                } else {
                  console.warn('⚠️ [TRIP UPDATE] Failed to send cancellation email to previous driver:', cancellationResult.message);
                }
              } else {
                console.log('ℹ️ [TRIP UPDATE] Previous driver moved to co-driver role, skipping cancellation email:', previousDriverId);
              }
            }
          } catch (prevDriverError) {
            console.error('❌ [TRIP UPDATE] Error sending cancellation email to previous driver:', prevDriverError);
          }
        }

        // Send cancellation email to previous co-driver if replaced or unassigned (and not moved to driver role)
        if (coDriverWasReplaced && previousCoDriverId) {
          try {
            const previousCoDriver = await User.findById(previousCoDriverId).select('name email');
            if (previousCoDriver && previousCoDriver.email) {
              // Check if they're being moved to driver role
              const movedToDriver = previousCoDriverId === newDriverId;
              const reason = movedToDriver
                ? 'You have been reassigned as driver for this trip.'
                : (newCoDriverId 
                  ? 'A new co-driver has been assigned to this trip.' 
                  : 'You have been unassigned from this trip.');
              
              // Only send cancellation if they're actually being replaced, not just moved to driver
              if (!movedToDriver) {
                console.log('📧 [TRIP UPDATE] Sending cancellation email to previous co-driver:', {
                  coDriverId: previousCoDriverId,
                  coDriverEmail: previousCoDriver.email,
                  coDriverName: previousCoDriver.name,
                  reason: reason,
                  tripId: trip._id.toString()
                });

                const cancellationResult = await sendLoadCancellationEmail({
                  driverEmail: previousCoDriver.email,
                  driverName: previousCoDriver.name || 'Co-Driver',
                  orderId: trip._id.toString(),
                  orderNumber: trip.tripNumber,
                  orderDetails: tripDetailsForEmail
                });

                if (cancellationResult.success) {
                  console.log('✅ [TRIP UPDATE] Trip cancellation email sent to previous co-driver:', previousCoDriver.email);
                } else {
                  console.warn('⚠️ [TRIP UPDATE] Failed to send cancellation email to previous co-driver:', cancellationResult.message);
                }
              } else {
                console.log('ℹ️ [TRIP UPDATE] Previous co-driver moved to driver role, skipping cancellation email:', previousCoDriverId);
              }
            }
          } catch (prevCoDriverError) {
            console.error('❌ [TRIP UPDATE] Error sending cancellation email to previous co-driver:', prevCoDriverError);
          }
        }
      } catch (cancellationError) {
        console.error('❌ [TRIP UPDATE] Error processing cancellation emails:', cancellationError);
      }
    }

    // ✅ Send assignment emails to new drivers (after cancellation emails have been sent)
    if (driverJustAssigned || coDriverJustAssigned) {
      try {
        // Get first order details for email (if available)
        const firstOrder = trip.orders && trip.orders.length > 0 ? trip.orders[0] : null;
        const tripDetailsForEmail = {
          pickupAddress: firstOrder?.pickupLocation?.place || firstOrder?.shipper?.address || trip.startLocation?.address || 'Not specified',
          dropoffAddress: firstOrder?.deliveryLocation?.place || firstOrder?.receiver?.address || trip.endLocation?.address || 'Not specified',
          customerName: firstOrder?.customer?.name || 'Customer',
          vehiclePlate: trip.truck?.plateNumber || trip.truck?.internalId || 'Not assigned',
          assignedAt: trip.updatedAt || new Date()
        };

        // Send email to new driver if assigned (first time or replacement)
        // Note: If the same person is assigned as both driver and co-driver, they will receive 2 separate emails (one for each role)
        if (driverJustAssigned && newDriverId && trip.driver && trip.driver.email) {
          try {
            const isSameAsCoDriver = newDriverId === newCoDriverId;
            console.log('📧 [TRIP UPDATE] Sending assignment email to new driver:', {
              driverId: newDriverId,
              driverEmail: trip.driver.email,
              driverName: trip.driver.name,
              tripId: trip._id.toString(),
              tripNumber: trip.tripNumber,
              isAlsoCoDriver: isSameAsCoDriver ? 'Yes (will receive 2 emails)' : 'No'
            });

            const assignmentResult = await sendLoadAssignmentEmail({
              driverEmail: trip.driver.email,
              driverName: trip.driver.name || 'Driver',
              loadId: trip._id.toString(),
              loadInternalId: trip.tripNumber,
              loadDetails: tripDetailsForEmail
            });

            if (assignmentResult.success) {
              console.log('✅ [TRIP UPDATE] Trip assignment email sent to new driver:', trip.driver.email);
            } else {
              console.warn('⚠️ [TRIP UPDATE] Failed to send assignment email to new driver:', assignmentResult.message);
            }
          } catch (driverEmailError) {
            console.error('❌ [TRIP UPDATE] Error sending assignment email to new driver:', driverEmailError);
          }
        }

        // Send email to new co-driver if assigned (first time or replacement)
        // Note: Even if same person as driver, they will receive a separate email for co-driver role
        if (coDriverJustAssigned && newCoDriverId && trip.coDriver && trip.coDriver.email) {
          try {
            const isSameAsDriver = newCoDriverId === newDriverId;
            console.log('📧 [TRIP UPDATE] Sending assignment email to new co-driver:', {
              coDriverId: newCoDriverId,
              coDriverEmail: trip.coDriver.email,
              coDriverName: trip.coDriver.name,
              tripId: trip._id.toString(),
              tripNumber: trip.tripNumber,
              isAlsoDriver: isSameAsDriver ? 'Yes (will receive 2 emails total)' : 'No'
            });

            const assignmentResult = await sendLoadAssignmentEmail({
              driverEmail: trip.coDriver.email,
              driverName: trip.coDriver.name || 'Co-Driver',
              loadId: trip._id.toString(),
              loadInternalId: trip.tripNumber,
              loadDetails: tripDetailsForEmail
            });

            if (assignmentResult.success) {
              console.log('✅ [TRIP UPDATE] Trip assignment email sent to new co-driver:', trip.coDriver.email);
            } else {
              console.warn('⚠️ [TRIP UPDATE] Failed to send assignment email to new co-driver:', assignmentResult.message);
            }
          } catch (coDriverEmailError) {
            console.error('❌ [TRIP UPDATE] Error sending assignment email to new co-driver:', coDriverEmailError);
          }
        }
      } catch (emailError) {
        console.error('❌ [TRIP UPDATE] Error processing assignment emails:', emailError);
      }
    }

    // Update orders with trip number and set status based on trip status
    if (trip.orders && trip.orders.length > 0) {
      if (trip.status === 'completed') {
        // If trip is completed, update orders to 'completed'
        await Order.updateMany(
          { _id: { $in: trip.orders } },
          { $set: { status: 'completed' } }
        );
      } else {
        // Otherwise, set status to 'dispatched'
        await Order.updateMany(
          { _id: { $in: trip.orders } },
          {
            $set: {
              tripNo: trip.tripNumber,
              status: 'dispatched'
            }
          }
        );
      }
    }

    await trip.populate([
      { path: 'driver', select: 'name email phone' },
      { path: 'coDriver', select: 'name email phone' },
      { path: 'truck', select: 'licensePlate unitNo makeModel make model internalId unitType' },
      { path: 'trailer', select: 'licensePlate unitNo makeModel unitType plateNumber trailerNumber internalId trailerType capacity' },
      {
        path: 'orders',
        populate: [
          { path: 'customer', select: 'name email phone address company' },
          { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
          { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
        ]
      },
      { path: 'company', select: 'companyName companyCode' }
    ]);

    // Automatically create invoice when trip status is changed to 'completed'
    if (isBeingCompleted) {
      try {
        // Check if invoice already exists for this trip
        const existingInvoice = await Invoice.findOne({ tripId: trip._id });

        if (!existingInvoice && trip.orders && trip.orders.length > 0) {
          // Get customer info from first order
          const firstOrder = trip.orders[0];
          const customer = firstOrder.customer;

          if (customer) {
            // Calculate due date (default Net 30 - 30 days from now)
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 30);

            // Create invoice with amount 0 (user can edit later)
            const invoiceData = {
              tripId: trip._id,
              clientName: customer.name || 'Unknown Customer',
              clientEmail: customer.email || '',
              clientCompany: customer.company || '',
              clientPhone: customer.phone || '',
              clientAddress: customer.address || '',
              amount: '0', // Default to 0, user can edit
              currency: 'USD',
              status: 'pending',
              invoiceDate: new Date(),
              dueDate: dueDate,
              paymentTerms: 'Net 30',
              company: companyId || trip.company,
              notes: `Auto-generated invoice for trip ${trip.tripNumber || trip._id}`
            };

            const invoice = new Invoice(invoiceData);

            // Generate invoice URL
            const invoiceUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/invoice/${invoice._id}`;
            invoice.invoiceUrl = invoiceUrl;

            await invoice.save();

            console.log(`✅ Invoice auto-created for trip ${trip.tripNumber || trip._id}: ${invoice._id}`);
          } else {
            console.warn(`⚠️ Cannot create invoice for trip ${trip.tripNumber || trip._id}: No customer information found`);
          }
        } else if (existingInvoice) {
          console.log(`ℹ️ Invoice already exists for trip ${trip.tripNumber || trip._id}: ${existingInvoice._id}`);
        }
      } catch (invoiceError) {
        // Log error but don't fail trip update if invoice creation fails
        console.error('❌ Error creating invoice for completed trip:', invoiceError);
        console.error('⚠️ Trip update succeeded, but invoice creation failed. Invoice can be created manually.');
      }
    }

    res.json({
      success: true,
      message: "Trip updated successfully.",
      data: trip
    });
  } catch (error) {
    console.error("Error updating trip:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while updating the trip."
    });
  }
};

// Delete Trip
export const deleteTrip = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);

    const filter = { _id: id };
    if (companyId && req.user.role !== 'superadmin') {
      filter.company = companyId;
    }

    const trip = await Trip.findOne(filter);

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found."
      });
    }

    // Clear trip number from orders and reset status to 'planned'
    if (trip.orders && trip.orders.length > 0) {
      await Order.updateMany(
        { _id: { $in: trip.orders } },
        {
          $set: {
            tripNo: '',
            status: 'planned'
          }
        }
      );
    }

    await Trip.deleteOne(filter);

    res.json({
      success: true,
      message: "Trip deleted successfully."
    });
  } catch (error) {
    console.error("Error deleting trip:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while deleting the trip."
    });
  }
};

// Assign Orders to Trip
export const assignOrdersToTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { orders = [] } = req.body;
    const companyId = getUserCompanyId(req.user);

    const filter = { _id: tripId };
    if (companyId && req.user.role !== 'superadmin') {
      filter.company = companyId;
    }

    const trip = await Trip.findOne(filter);

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found."
      });
    }

    // Validate and add orders
    if (Array.isArray(orders) && orders.length > 0) {
      const validOrders = orders.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
      const existingOrders = trip.orders.map(id => id.toString());
      const newOrders = validOrders.map(id => id.toString());
      const uniqueOrders = [...new Set([...existingOrders, ...newOrders])].map(id => new mongoose.Types.ObjectId(id));
      trip.orders = uniqueOrders;

      // Update orders with trip number and set status to 'dispatched'
      await Order.updateMany(
        { _id: { $in: validOrders } },
        {
          $set: {
            tripNo: trip.tripNumber,
            status: 'dispatched'
          }
        }
      );
    }

    trip.updatedBy = req.user._id;
    await trip.save();

    await trip.populate([
      { path: 'driver', select: 'name email phone' },
      { path: 'truck', select: 'plateNumber make model internalId' },
      { path: 'trailer', select: 'plateNumber trailerNumber' },
      {
        path: 'orders',
        populate: [
          { path: 'customer', select: 'name email phone address' },
          { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
          { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
        ]
      },
      { path: 'company', select: 'companyName companyCode' }
    ]);

    res.json({
      success: true,
      message: "Orders assigned to trip successfully.",
      data: trip
    });
  } catch (error) {
    console.error("Error assigning orders to trip:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while assigning orders to trip."
    });
  }
};

// Start Trip - changes order status to 'in-delivery'
// Now supports both Trip IDs and Order IDs (since getDriverTrips returns orders)
export const startTrip = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user._id;
    const companyId = getUserCompanyId(req.user);

    // First, try to find as a Trip
    let trip = null;
    const tripFilter = { _id: id };
    if (req.user.role === 'driver') {
      tripFilter.$or = [
        { driver: driverId },
        { coDriver: driverId }
      ];
    } else if (companyId && req.user.role !== 'superadmin') {
      tripFilter.company = companyId;
    }

    trip = await Trip.findOne(tripFilter);

    // If trip found, handle as trip
    if (trip) {
      // Validate trip status - only allow starting trips with 'planned' status
      if (trip.status !== 'planned') {
        return res.status(400).json({
          success: false,
          message: `Cannot start trip. Trip status is '${trip.status}'. Only trips with 'planned' status can be started.`
        });
      }

      // Check if driver has any orders with 'pending_review' status
      // Driver cannot start a new trip if they have any orders with 'pending_review' status
      const pendingReviewOrders = await Order.find({
        $or: [
          { driver: driverId },
          { coDriver: driverId }
        ],
        status: 'pending_review'
      }).lean();

      if (pendingReviewOrders && pendingReviewOrders.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot start trip. You have ${pendingReviewOrders.length} order(s) with status 'pending review'. Please complete or resolve all pending review orders before starting a new trip.`
        });
      }

      // Update trip status to 'in-progress'
      trip.status = 'in-progress';
      trip.actualStartDate = new Date();
      trip.updatedBy = driverId;
      await trip.save();

      // Update all orders in trip to 'in-delivery' status
      if (trip.orders && trip.orders.length > 0) {
        await Order.updateMany(
          { _id: { $in: trip.orders } },
          { 
            $set: { 
              status: 'in-delivery',
              actualStartDate: new Date()
            } 
          }
        );
      }

      await trip.populate([
        { path: 'driver', select: 'name email phone' },
        { path: 'truck', select: 'plateNumber make model internalId' },
        { path: 'trailer', select: 'plateNumber trailerNumber' },
        {
          path: 'orders',
          populate: [
            { path: 'customer', select: 'name email phone address' },
            { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
            { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
          ]
        },
        { path: 'company', select: 'companyName companyCode' }
      ]);

      return res.json({
        success: true,
        message: "Trip started successfully. Order statuses updated to 'in-delivery'.",
        data: trip
      });
    }

    // If trip not found, try to find as an Order (since getDriverTrips returns orders)
    const orderFilter = {
      _id: id,
      $or: [
        { driver: driverId },
        { coDriver: driverId }
      ]
    };

    const order = await Order.findOne(orderFilter);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Trip/Order not found or you are not assigned to it."
      });
    }

    // Validate order status - only allow starting orders with 'planned' or 'quoted' status
    if (!['planned', 'quoted'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot start order. Order status is '${order.status}'. Only orders with 'planned' or 'quoted' status can be started.`
      });
    }

    // Check if driver has any other orders with 'pending_review' status
    // Driver cannot start a new trip/order if they have any orders with 'pending_review' status
    const pendingReviewOrders = await Order.find({
      _id: { $ne: order._id }, // Exclude current order
      $or: [
        { driver: driverId },
        { coDriver: driverId }
      ],
      status: 'pending_review'
    }).lean();

    if (pendingReviewOrders && pendingReviewOrders.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot start order. You have ${pendingReviewOrders.length} order(s) with status 'pending review'. Please complete or resolve all pending review orders before starting a new order.`
      });
    }

    // Update order status to 'in-delivery'
    order.status = 'in-delivery';
    order.actualStartDate = new Date();
    await order.save();

    // Populate order for response
    await order.populate([
      { path: 'driver', select: 'name email phone' },
      { path: 'coDriver', select: 'name email phone' },
      { path: 'truck', select: 'licensePlate unitNo makeModel make model internalId unitType plateNumber' },
      { path: 'trailer', select: 'licensePlate unitNo makeModel unitType plateNumber trailerNumber' },
      { path: 'customer', select: 'name email phone address' },
      { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
      { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
    ]);

    // Return order in trip-like format for mobile app compatibility
    const tripLikeResponse = {
      _id: order._id,
      tripNumber: order.orderNumber || order.tripNo || order.customerOrderNo || '',
      driver: order.driver,
      coDriver: order.coDriver,
      truck: order.truck,
      trailer: order.trailer,
      orders: [order._id],
      status: 'in-progress',
      plannedStartDate: order.pickupDate || null,
      plannedEndDate: order.deliveryDate || null,
      actualStartDate: order.actualStartDate || null,
      actualEndDate: order.actualEndDate || null,
      startLocation: order.pickupLocation,
      endLocation: order.deliveryLocation,
      orderNumber: order.orderNumber,
      customerOrderNo: order.customerOrderNo,
      customer: order.customer,
      pickupLocation: order.pickupLocation,
      deliveryLocation: order.deliveryLocation,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    };

    res.json({
      success: true,
      message: "Trip/Order started successfully. Status updated to 'in-delivery'.",
      data: tripLikeResponse
    });
  } catch (error) {
    console.error("Error starting trip/order:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while starting the trip/order."
    });
  }
};

// Get Assignment Requests - trips AND orders where driverAcceptanceStatus is 'pending'
export const getAssignmentRequests = async (req, res) => {
  try {
    const driverId = req.user._id;

    const [trips, orders] = await Promise.all([
      // Trips pending acceptance (also include old trips where field was never set)
      Trip.find({
        $or: [{ driver: driverId }, { coDriver: driverId }],
        driverAcceptanceStatus: { $in: ['pending', null] },
        status: { $in: ['planned', 'manifest_pending'] }
      })
        .populate('driver', 'name email phone')
        .populate('coDriver', 'name email phone')
        .populate('truck', 'plateNumber internalId make model licensePlate unitNo')
        .populate('trailer', 'plateNumber trailerNumber licensePlate unitNo')
        .populate({
          path: 'orders',
          populate: [
            { path: 'customer', select: 'name email phone address' },
            { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
            { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
          ]
        })
        .sort({ createdAt: -1 })
        .lean(),

      // Orders pending acceptance (also include old orders where field was never set)
      Order.find({
        $or: [{ driver: driverId }, { coDriver: driverId }],
        driverAcceptanceStatus: { $in: ['pending', null] },
        status: { $in: ['planned', 'quoted'] }
      })
        .populate('driver', 'name email phone')
        .populate('coDriver', 'name email phone')
        .populate('truck', 'plateNumber internalId make model licensePlate unitNo')
        .populate('trailer', 'plateNumber trailerNumber licensePlate unitNo')
        .populate('customer', 'name email phone address')
        .populate('pickupLocation.placeId', 'name currentLocation city state')
        .populate('deliveryLocation.placeId', 'name currentLocation city state')
        .sort({ createdAt: -1 })
        .lean()
    ]);

    // Tag orders so mobile knows which accept/reject endpoint to call
    const taggedOrders = orders.map(o => ({ ...o, _isOrder: true, tripNumber: o.customerOrderNo || o.orderNumber }));

    const combined = [...trips, ...taggedOrders].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({ success: true, count: combined.length, data: combined });
  } catch (error) {
    console.error('Error fetching assignment requests:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch assignment requests.' });
  }
};

// Accept Trip - Driver accepts an assigned trip
export const acceptTrip = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user._id;

    const trip = await Trip.findOne({
      _id: id,
      $or: [{ driver: driverId }, { coDriver: driverId }]
    });

    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip not found or you are not assigned to it." });
    }

    if (trip.driverAcceptanceStatus !== 'pending') {
      return res.status(400).json({ success: false, message: `Trip has already been ${trip.driverAcceptanceStatus}.` });
    }

    trip.driverAcceptanceStatus = 'accepted';
    trip.driverRespondedAt = new Date();
    trip.updatedBy = driverId;
    await trip.save();

    // Notify dispatchers in real-time
    const { getIO } = await import('../services/socketIo.js');
    const io = getIO();
    if (io && trip.company) {
      const payload = {
        tripId: trip._id.toString(),
        tripNumber: trip.tripNumber,
        driverAcceptanceStatus: 'accepted',
        driverId: driverId.toString(),
        driverRespondedAt: trip.driverRespondedAt
      };
      io.to(`dispatchers_${trip.company.toString()}`).emit('tripAcceptanceUpdated', payload);
      io.to('dispatchers_all').emit('tripAcceptanceUpdated', payload);
    }

    res.json({ success: true, message: "Trip accepted successfully.", data: { driverAcceptanceStatus: 'accepted' } });
  } catch (error) {
    console.error("Error accepting trip:", error);
    res.status(500).json({ success: false, message: error.message || "An error occurred while accepting the trip." });
  }
};

// Reject Trip - Driver rejects an assigned trip
export const rejectTrip = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user._id;
    const { reason } = req.body;

    const trip = await Trip.findOne({
      _id: id,
      $or: [{ driver: driverId }, { coDriver: driverId }]
    });

    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip not found or you are not assigned to it." });
    }

    if (trip.driverAcceptanceStatus !== 'pending') {
      return res.status(400).json({ success: false, message: `Trip has already been ${trip.driverAcceptanceStatus}.` });
    }

    trip.driverAcceptanceStatus = 'rejected';
    trip.driverRejectionReason = reason || '';
    trip.driverRespondedAt = new Date();
    trip.updatedBy = driverId;
    await trip.save();

    // Notify dispatchers in real-time
    const { getIO } = await import('../services/socketIo.js');
    const io = getIO();
    if (io && trip.company) {
      const payload = {
        tripId: trip._id.toString(),
        tripNumber: trip.tripNumber,
        driverAcceptanceStatus: 'rejected',
        driverRejectionReason: reason || '',
        driverId: driverId.toString(),
        driverRespondedAt: trip.driverRespondedAt
      };
      io.to(`dispatchers_${trip.company.toString()}`).emit('tripAcceptanceUpdated', payload);
      io.to('dispatchers_all').emit('tripAcceptanceUpdated', payload);
    }

    res.json({ success: true, message: "Trip rejected.", data: { driverAcceptanceStatus: 'rejected' } });
  } catch (error) {
    console.error("Error rejecting trip:", error);
    res.status(500).json({ success: false, message: error.message || "An error occurred while rejecting the trip." });
  }
};

// Get Driver Trips - Get orders assigned to the logged-in driver (using Orders instead of Trips)
export const getDriverTrips = async (req, res) => {
  try {
    const driverId = req.user._id;
    const { status } = req.query;

    const OrderModel = (await import("../models/orderModel.js")).default;

    // Build filter - orders assigned to this driver OR co-driver
    const filter = {
      $or: [
        { driver: driverId },
        { coDriver: driverId }
      ]
    };

    // Map trip status query to order statuses
    let acceptedTripDocs = []; // Trip-model documents for accepted assignments
    if (status) {
      if (status === 'planned') {
        // Accepted trips = planned/quoted orders that driver has accepted
        filter.status = { $in: ['planned', 'quoted'] };
        filter.driverAcceptanceStatus = 'accepted';

        // Also fetch Trip-model documents that the driver has accepted
        const tripFilter = {
          $or: [{ driver: driverId }, { coDriver: driverId }],
          driverAcceptanceStatus: 'accepted',
          status: { $in: ['planned', 'manifest_pending'] }
        };
        acceptedTripDocs = await Trip.find(tripFilter)
          .populate('driver', 'name email phone')
          .populate('coDriver', 'name email phone')
          .populate('truck', 'plateNumber internalId make model licensePlate unitNo')
          .populate('trailer', 'plateNumber trailerNumber licensePlate unitNo')
          .populate({
            path: 'orders',
            populate: [
              { path: 'customer', select: 'name email phone address' },
              { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
              { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
            ]
          })
          .sort({ createdAt: -1 })
          .lean();
      } else if (status === 'in-progress') {
        // Active trips = in-delivery, in-progress, dispatched, active, started orders
        filter.status = { $in: ['in-delivery', 'in-progress', 'dispatched', 'active', 'started'] };
      } else if (status === 'completed') {
        // Completed trips = delivered, completed orders
        filter.status = { $in: ['delivered', 'completed', 'COMPLETED'] };
      } else {
        // Use status as-is for other cases
        filter.status = status;
      }
    }

    const orders = await OrderModel.find(filter)
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate({
        path: 'truck',
        select: 'licensePlate unitNo makeModel make model internalId unitType plateNumber trackingKey currentLocation speed fuelLevel engineOn yard',
        populate: {
          path: 'yard',
          select: 'yardName yardCode address city stateProvince coordinates'
        }
      })
      .populate('trailer', 'licensePlate unitNo makeModel unitType plateNumber trailerNumber')
      .populate('customer', 'name email phone address')
      .populate({
        path: 'pickupLocation.placeId',
        select: 'name currentLocation city state',
        model: 'Place'
      })
      .populate({
        path: 'deliveryLocation.placeId',
        select: 'name currentLocation city state',
        model: 'Place'
      })
      .sort({ createdAt: -1 })
      .lean();

    // Transform orders to trip-like format for mobile app compatibility
    // Process stops with geocoding first (async operation)
    const ordersWithGeocodedStops = await Promise.all(orders.map(async (order) => {
      // Geocode stops that don't have coordinates
      const geocodedStops = await Promise.all((order.stops || []).map(async (stop) => {
        // If stop doesn't have coordinates, try to geocode the address
        if (!stop.latitude && !stop.longitude && stop.address) {
          try {
            const { getCoordinatesFromAddress } = await import("../services/googlemap.js");
            const coords = await getCoordinatesFromAddress(stop.address);
            if (coords.latitude && coords.longitude) {
              return {
                ...stop,
                latitude: coords.latitude.toString(),
                longitude: coords.longitude.toString(),
              };
            }
          } catch (error) {
            console.warn(`⚠️ Failed to geocode stop address "${stop.address}":`, error.message);
          }
        }
        return stop;
      }));

      // Geocode receiverStops that don't have coordinates
      const geocodedReceiverStops = await Promise.all((order.receiverStops || []).map(async (stop) => {
        // If stop doesn't have coordinates, try to geocode the address
        if (!stop.latitude && !stop.longitude && stop.address) {
          try {
            const { getCoordinatesFromAddress } = await import("../services/googlemap.js");
            const coords = await getCoordinatesFromAddress(stop.address);
            if (coords.latitude && coords.longitude) {
              return {
                ...stop,
                latitude: coords.latitude.toString(),
                longitude: coords.longitude.toString(),
              };
            }
          } catch (error) {
            console.warn(`⚠️ Failed to geocode receiver stop address "${stop.address}":`, error.message);
          }
        }
        return stop;
      }));

      return {
        ...order,
        stops: geocodedStops,
        receiverStops: geocodedReceiverStops,
      };
    }));

    const trips = ordersWithGeocodedStops.map(order => {
      // Map order status to trip status
      let tripStatus = 'planned';
      if (['in-delivery', 'in-progress', 'dispatched', 'active', 'started'].includes(order.status)) {
        tripStatus = 'in-progress';
      } else if (['delivered', 'completed', 'COMPLETED'].includes(order.status)) {
        tripStatus = 'completed';
      } else if (['planned', 'quoted'].includes(order.status)) {
        tripStatus = 'planned';
      }

      // Get pickup and delivery locations
      const pickupPlace = order.pickupLocation?.placeId;
      const deliveryPlace = order.deliveryLocation?.placeId;
      
      let origin = order.pickupLocation?.place || '';
      let destination = order.deliveryLocation?.place || '';
      
      if (!origin && pickupPlace) {
        if (typeof pickupPlace === 'object') {
          origin = pickupPlace.name || '';
        }
      }
      
      if (!destination && deliveryPlace) {
        if (typeof deliveryPlace === 'object') {
          destination = deliveryPlace.name || '';
        }
      }

      // Build full order object with all necessary fields
      const fullOrder = {
        _id: order._id,
        orderNumber: order.orderNumber,
        customerOrderNo: order.customerOrderNo,
        status: order.status,
        customer: order.customer,
        pickupLocation: {
          ...order.pickupLocation,
          placeId: pickupPlace || order.pickupLocation?.placeId
        },
        deliveryLocation: {
          ...order.deliveryLocation,
          placeId: deliveryPlace || order.deliveryLocation?.placeId
        },
        pickupDate: order.pickupDate,
        deliveryDate: order.deliveryDate,
        actualPickupDate: order.actualPickupDate,
        actualDeliveryDate: order.actualDeliveryDate,
        pickupTime: order.pickupTime,
        deliveryTime: order.deliveryTime,
        pickupAppointment: order.pickupAppointment,
        deliveryAppointment: order.deliveryAppointment,
        pickupAppointmentDetails: order.pickupAppointmentDetails,
        deliveryAppointmentDetails: order.deliveryAppointmentDetails,
        // Include shipper information
        shipper: order.shipper || {},
        // Include receiver information
        receiver: order.receiver || {},
        // Include multiple stops (already geocoded above)
        stops: order.stops || [],
        receiverStops: order.receiverStops || [],
        // Include other order details
        pickupNote: order.pickupNote,
        deliveryNote: order.deliveryNote,
        dropOffNotes: order.dropOffNotes,
        dropOffNumber: order.dropOffNumber,
        pickupRefNo: order.pickupRefNo,
        deliveryRefNo: order.deliveryRefNo,
        pickupSkids: order.pickupSkids,
        pickupCases: order.pickupCases,
        deliverySkids: order.deliverySkids,
        deliveryCases: order.deliveryCases,
        commodity: order.commodity,
        weight: order.weight,
        weightUnit: order.weightUnit,
        noOfPackages: order.noOfPackages,
        noOfPackagesType: order.noOfPackagesType,
        items: order.items || [],
        documents: order.documents || {},
        attachments: order.attachments || [], // Include attachments from order
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };

      // Get yard location from truck if available
      let yardLocation = null;
      if (order.truck && order.truck.yard && order.truck.yard.coordinates) {
        const yard = order.truck.yard;
        if (yard.coordinates.latitude && yard.coordinates.longitude) {
          yardLocation = {
            yardName: yard.yardName || 'Yard',
            yardCode: yard.yardCode || '',
            address: yard.address || '',
            city: yard.city || '',
            stateProvince: yard.stateProvince || '',
            coordinates: {
              latitude: parseFloat(yard.coordinates.latitude) || null,
              longitude: parseFloat(yard.coordinates.longitude) || null
            }
          };
        }
      }

      return {
        _id: order._id,
        tripNumber: order.orderNumber || order.tripNo || order.customerOrderNo || '',
        driver: order.driver,
        coDriver: order.coDriver,
        truck: order.truck,
        trailer: order.trailer,
        orders: [fullOrder], // Full order object with all details
        status: tripStatus,
        plannedStartDate: order.pickupDate || null,
        plannedEndDate: order.deliveryDate || null,
        actualStartDate: order.actualStartDate || null,
        actualEndDate: order.actualEndDate || null,
        startLocation: {
          place: origin,
          latitude: order.pickupLocation?.latitude || null,
          longitude: order.pickupLocation?.longitude || null,
          placeId: pickupPlace?._id || null
        },
        endLocation: {
          place: destination,
          latitude: order.deliveryLocation?.latitude || null,
          longitude: order.deliveryLocation?.longitude || null,
          placeId: deliveryPlace?._id || null
        },
        yardLocation: yardLocation, // Include yard location for starting point
        // Include order details for compatibility
        orderNumber: order.orderNumber,
        customerOrderNo: order.customerOrderNo,
        customer: order.customer,
        pickupLocation: order.pickupLocation,
        deliveryLocation: order.deliveryLocation,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    });

    // Merge accepted Trip-model documents (with their orders) into the result
    const acceptedTripsMapped = acceptedTripDocs.map(trip => ({
      _id: trip._id,
      tripNumber: trip.tripNumber || trip.tripNo || '',
      driver: trip.driver,
      coDriver: trip.coDriver,
      truck: trip.truck,
      trailer: trip.trailer,
      orders: trip.orders || [],
      status: 'planned',
      driverAcceptanceStatus: trip.driverAcceptanceStatus,
      plannedStartDate: trip.plannedStartDate || null,
      plannedEndDate: trip.plannedEndDate || null,
      startLocation: trip.startLocation || null,
      endLocation: trip.endLocation || null,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
    }));

    const allTrips = [...trips, ...acceptedTripsMapped].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({
      success: true,
      data: allTrips,
      count: allTrips.length
    });
  } catch (error) {
    console.error("Error fetching driver trips (orders):", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while fetching trips."
    });
  }
};

// Approve Trip Documents - allows dispatcher to approve documents or approve without documents
export const approveTripDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const { approveWithoutDocuments } = req.body; // Boolean: true if approving without required documents
    const approverId = req.user._id;
    const companyId = getUserCompanyId(req.user);

    // Only dispatchers, admins, and superadmins can approve
    if (!['admin', 'superadmin', 'dispatcher'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only dispatchers and administrators can approve trip documents.'
      });
    }

    const tripFilter = { _id: id };
    if (companyId && req.user.role !== 'superadmin') {
      tripFilter.company = companyId;
    }

    const trip = await Trip.findOne(tripFilter);
    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    // Approve documents
    trip.documentsApproved = true;
    trip.documentsApprovedBy = approverId;
    trip.documentsApprovedAt = new Date();
    trip.approvedWithoutDocuments = approveWithoutDocuments === true;

    await trip.save();

    await trip.populate([
      { path: 'documentsApprovedBy', select: 'name email' },
      { path: 'driver', select: 'name email phone' },
      { path: 'truck', select: 'plateNumber make model internalId' },
      { path: 'trailer', select: 'plateNumber trailerNumber' }
    ]);

    res.json({
      success: true,
      message: approveWithoutDocuments 
        ? 'Trip approved without documents. Trip can now be completed.'
        : 'Trip documents approved. Trip can now be completed.',
      data: trip
    });
  } catch (error) {
    console.error('Error approving trip documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve trip documents',
      error: error.message
    });
  }
};

// Reject Trip Documents - dispatcher rejects submitted documents and requests re-upload
export const rejectTripDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const rejectorId = req.user._id;
    const companyId = getUserCompanyId(req.user);

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A rejection reason is required.'
      });
    }

    if (!['admin', 'superadmin', 'dispatcher'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only dispatchers and administrators can reject trip documents.'
      });
    }

    const tripFilter = { _id: id };
    if (companyId && req.user.role !== 'superadmin') {
      tripFilter.company = companyId;
    }

    const trip = await Trip.findOne(tripFilter);
    if (!trip) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    // Record rejection and reset approval state
    trip.documentsApproved = false;
    trip.documentsApprovedBy = null;
    trip.documentsApprovedAt = null;
    trip.approvedWithoutDocuments = false;
    trip.completionRejectionReason = reason.trim();
    trip.rejectionHistory.push({
      rejectedBy: rejectorId,
      rejectedAt: new Date(),
      reason: reason.trim(),
      documentsCount: trip.documents.length
    });

    await trip.save();

    await trip.populate([
      { path: 'rejectionHistory.rejectedBy', select: 'name email' },
      { path: 'driver', select: 'name email phone' },
      { path: 'truck', select: 'plateNumber make model internalId' },
      { path: 'trailer', select: 'plateNumber trailerNumber' }
    ]);

    // Notify driver via socket if possible
    try {
      const { getIO } = await import('../services/socketIo.js');
      const io = getIO();
      if (io && trip.driver) {
        io.to(`driver_${trip.driver._id || trip.driver}`).emit('tripDocumentsRejected', {
          tripId: trip._id,
          tripNumber: trip.tripNumber,
          reason: reason.trim(),
          rejectedBy: req.user.name
        });
      }
    } catch (_) { /* non-blocking */ }

    res.json({
      success: true,
      message: 'Trip documents rejected. Driver has been notified to re-upload.',
      data: trip
    });
  } catch (error) {
    console.error('Error rejecting trip documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject trip documents',
      error: error.message
    });
  }
};

// Complete Trip - changes order status to 'completed'
// Now supports both Trip IDs and Order IDs (since getDriverTrips returns orders)
export const completeTrip = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user._id;
    const companyId = getUserCompanyId(req.user);

    // First, try to find as a Trip
    let trip = null;
    const tripFilter = { _id: id };
    if (req.user.role === 'driver') {
      tripFilter.$or = [
        { driver: driverId },
        { coDriver: driverId }
      ];
    } else if (companyId && req.user.role !== 'superadmin') {
      tripFilter.company = companyId;
    }

    trip = await Trip.findOne(tripFilter);

    // If trip found, handle as trip
    if (trip) {
      // Check if documents are approved before allowing completion
      if (!trip.documentsApproved) {
        return res.status(400).json({
          success: false,
          message: 'Cannot complete trip. Documents must be approved by dispatcher first. Please approve the trip documents before marking it as completed.'
        });
      }

      // Update trip status
      trip.status = 'completed';
      trip.actualEndDate = new Date();
      trip.updatedBy = driverId;
      await trip.save();

      // Clear driver from Vehicle — truck is now free
      if (trip.truck) {
        await Vehicle.findByIdAndUpdate(trip.truck, { $unset: { driver: 1 } });
      }

      // Update all orders in trip to 'completed' status
      if (trip.orders && trip.orders.length > 0) {
        await Order.updateMany(
          { _id: { $in: trip.orders } },
          { 
            $set: { 
              status: 'completed',
              actualEndDate: new Date()
            } 
          }
        );
      }

      await trip.populate([
        { path: 'driver', select: 'name email phone' },
        { path: 'truck', select: 'plateNumber make model internalId' },
        { path: 'trailer', select: 'plateNumber trailerNumber' },
        {
          path: 'orders',
          populate: [
            { path: 'customer', select: 'name email phone address company' },
            { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
            { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
          ]
        },
      { path: 'company', select: 'companyName companyCode' }
    ]);

    // Automatically create invoice when trip is completed
    try {
      // Check if invoice already exists for this trip
      const existingInvoice = await Invoice.findOne({ tripId: trip._id });

      if (!existingInvoice && trip.orders && trip.orders.length > 0) {
        // Get customer info from first order
        const firstOrder = trip.orders[0];
        const customer = firstOrder.customer;

        if (customer) {
          // Calculate due date (default Net 30 - 30 days from now)
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);

          // Create invoice with amount 0 (user can edit later)
          const invoiceData = {
            tripId: trip._id,
            clientName: customer.name || 'Unknown Customer',
            clientEmail: customer.email || '',
            clientCompany: customer.company || '',
            clientPhone: customer.phone || '',
            clientAddress: customer.address || '',
            amount: '0', // Default to 0, user can edit
            currency: 'USD',
            status: 'pending',
            invoiceDate: new Date(),
            dueDate: dueDate,
            paymentTerms: 'Net 30',
            company: companyId || trip.company,
            notes: `Auto-generated invoice for trip ${trip.tripNumber || trip._id}`
          };

          const invoice = new Invoice(invoiceData);

          // Generate invoice URL
          const invoiceUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/invoice/${invoice._id}`;
          invoice.invoiceUrl = invoiceUrl;

          await invoice.save();

          console.log(`✅ Invoice auto-created for trip ${trip.tripNumber || trip._id}: ${invoice._id}`);
        } else {
          console.warn(`⚠️ Cannot create invoice for trip ${trip.tripNumber || trip._id}: No customer information found`);
        }
      } else if (existingInvoice) {
        console.log(`ℹ️ Invoice already exists for trip ${trip.tripNumber || trip._id}: ${existingInvoice._id}`);
      }
    } catch (invoiceError) {
      // Log error but don't fail trip completion if invoice creation fails
      console.error('❌ Error creating invoice for completed trip:', invoiceError);
      console.error('⚠️ Trip completion succeeded, but invoice creation failed. Invoice can be created manually.');
    }

    return res.json({
      success: true,
      message: "Trip completed successfully. Order statuses updated to 'completed'.",
      data: trip
    });
    }

    // If trip not found, try to find as an Order (since getDriverTrips returns orders)
    const orderFilter = {
      _id: id,
      $or: [
        { driver: driverId },
        { coDriver: driverId }
      ]
    };

    const order = await Order.findOne(orderFilter);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Trip/Order not found or you are not assigned to it."
      });
    }

    // Validate order status - only allow completing orders with 'in-delivery' status
    if (order.status !== 'in-delivery' && !['in-progress', 'dispatched', 'active', 'started'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot complete order. Order status is '${order.status}'. Only orders with 'in-delivery' status can be completed.`
      });
    }

    // Update order status to 'completed'
    order.status = 'completed';
    order.actualEndDate = new Date();
    await order.save();

    // Populate order for response
    await order.populate([
      { path: 'driver', select: 'name email phone' },
      { path: 'coDriver', select: 'name email phone' },
      { path: 'truck', select: 'licensePlate unitNo makeModel make model internalId unitType plateNumber' },
      { path: 'trailer', select: 'licensePlate unitNo makeModel unitType plateNumber trailerNumber' },
      { path: 'customer', select: 'name email phone address' },
      { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
      { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
    ]);

    // Return order in trip-like format for mobile app compatibility
    const tripLikeResponse = {
      _id: order._id,
      tripNumber: order.orderNumber || order.tripNo || order.customerOrderNo || '',
      driver: order.driver,
      coDriver: order.coDriver,
      truck: order.truck,
      trailer: order.trailer,
      orders: [order._id],
      status: 'completed',
      plannedStartDate: order.pickupDate || null,
      plannedEndDate: order.deliveryDate || null,
      actualStartDate: order.actualStartDate || null,
      actualEndDate: order.actualEndDate || null,
      startLocation: order.pickupLocation,
      endLocation: order.deliveryLocation,
      orderNumber: order.orderNumber,
      customerOrderNo: order.customerOrderNo,
      customer: order.customer,
      pickupLocation: order.pickupLocation,
      deliveryLocation: order.deliveryLocation,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    };

    res.json({
      success: true,
      message: "Trip/Order completed successfully. Status updated to 'completed'.",
      data: tripLikeResponse
    });
  } catch (error) {
    console.error("Error completing trip/order:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while completing the trip/order."
    });
  }
};

// Upload Trip Document
export const uploadTripDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { description = '', documentType = '' } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Document file is required."
      });
    }

    // Find trip and verify it belongs to the user's company
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const trip = await Trip.findById(id);
    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found."
      });
    }

    // Verify company access (unless superadmin)
    if (!isSuperadmin && trip.company.toString() !== companyId?.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to upload documents for this trip."
      });
    }

    // Extract file metadata
    let fileUrl = null;
    if (req.file.location) {
      // S3 upload (production)
      fileUrl = req.file.location;
    } else if (req.file.path) {
      // Local upload (development)
      fileUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/${req.file.path.replace(/\\/g, '/')}`;
    }

    if (!fileUrl) {
      return res.status(500).json({
        success: false,
        message: "Failed to process uploaded file."
      });
    }

    // Enforce max documents per trip (3)
    trip.documents = trip.documents || [];
    if (trip.documents.length >= 3) {
      return res.status(400).json({
        success: false,
        message: "Maximum of 3 documents allowed per trip. Delete an existing document before uploading a new one."
      });
    }

    // Validate document type and normalize
    const allowedTypes = ['bol','pod','stamped_manifest','manifest','other'];
    let docType = 'other';
    if (documentType && typeof documentType === 'string') {
      const normalized = documentType.trim().toLowerCase().replace(/\s+/g, '_');
      if (allowedTypes.includes(normalized)) docType = normalized;
    }

    // Validate document using AI before saving
    console.log(`📦 [TRIP UPLOAD DOC] File received:`, {
      originalname: req.file.originalname,
      hasPath: !!req.file.path,
      hasLocation: !!req.file.location,
      hasKey: !!req.file.key,
      hasBucket: !!req.file.bucket,
      allKeys: Object.keys(req.file)
    });
    
    let validationResult = null;
    // Handle both local and S3 files
    if (req.file.path || req.file.location || req.file.key) {
      console.log(`🤖 [TRIP UPLOAD DOC] Starting AI validation for uploaded document...`);
      try {
        const documentsToValidate = [{
          path: req.file.path || null,
          location: req.file.location || null,
          key: req.file.key || null,
          bucket: process.env.AWS_S3_BUCKET_NAME || null,
          originalname: req.file.originalname || '',
          type: docType,
          filename: req.file.filename
        }];
        
        console.log(`📋 [TRIP UPLOAD DOC] Document to validate:`, documentsToValidate[0]);
        
        const tripDataForValidation = {
          tripNumber: trip.tripNumber || 'Trip',
          driver: trip.driver || null
        };
        
        validationResult = await validateDocuments(documentsToValidate, 'trip', tripDataForValidation);
        
        console.log('✅ [TRIP UPLOAD DOC] AI validation completed:', {
          valid: validationResult.valid,
          errors: validationResult.errors.length,
          warnings: validationResult.warnings.length,
          missing: validationResult.missing.length,
          documentDetails: validationResult.documentDetails?.length || 0
        });
        
        // If validation failed with critical errors, return error response
        if (!validationResult.valid && validationResult.errors.length > 0) {
          const errorMessages = validationResult.errors.map(e => 
            `${e.document || 'Document'}: ${e.message}`
          ).join('; ');
          
          return res.status(400).json({
            success: false,
            message: 'Document validation failed',
            validation: {
              valid: false,
              errors: validationResult.errors,
              warnings: validationResult.warnings,
              missing: validationResult.missing
            },
            details: errorMessages
          });
        }
      } catch (validationError) {
        console.error('❌ [TRIP UPLOAD DOC] Trip document validation error:', validationError);
        console.error('❌ [TRIP UPLOAD DOC] Validation error details:', {
          message: validationError.message,
          stack: validationError.stack
        });
        // Continue with document upload even if validation fails (non-blocking)
        // Set validationResult to indicate validation failed
        validationResult = {
          success: false,
          valid: false,
          errors: [{
            message: `Validation system error: ${validationError.message || 'Unknown error'}`
          }],
          warnings: [],
          missing: [],
          message: 'Document validation failed due to system error',
          documentDetails: []
        };
      }
    } else {
      console.warn(`⚠️ [TRIP UPLOAD DOC] File has no path, location, or key - skipping validation`);
      console.warn(`⚠️ [TRIP UPLOAD DOC] File object:`, JSON.stringify(req.file, null, 2));
    }

    // Create document object
    const document = {
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size || 0,
      mimeType: req.file.mimetype || '',
      type: docType,
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
      description: description.trim()
    };

    // Add document to trip
    trip.documents.push(document);
    await trip.save();

    // Notify dispatchers via socket (non-blocking)
    try {
      const { getIO } = await import('../services/socketIo.js');
      const io = getIO();
      if (io) {
        const notification = {
          type: 'DOCUMENT_UPLOAD',
          title: 'Trip Document Uploaded',
          message: `A document has been uploaded for trip ${trip.tripNumber || trip._id}`,
          tripId: trip._id,
          tripNumber: trip.tripNumber,
          driverName: req.user.name,
          documentType: docType,
          timestamp: new Date().toISOString()
        };
        const roomId = companyId ? `dispatchers_${companyId}` : 'dispatchers_all';
        io.to(roomId).emit('documentUploadNotification', notification);
        io.to('dispatchers_all').emit('documentUploadNotification', notification);
      }
    } catch (_) { /* non-blocking */ }

    // Populate uploadedBy
    await trip.populate('documents.uploadedBy', 'name email');

    // Get the newly added document with populated uploadedBy
    const newDocument = trip.documents[trip.documents.length - 1];

    // ALWAYS include validation results if validation was performed
    console.log('📋 [TRIP UPLOAD DOC] Preparing response with validation results:', {
      hasValidationResult: !!validationResult,
      valid: validationResult?.valid,
      errors: validationResult?.errors?.length || 0,
      warnings: validationResult?.warnings?.length || 0,
      missing: validationResult?.missing?.length || 0
    });
    
    // Include validation results in response if available
    const responseData = {
      success: true,
      message: "Document uploaded successfully.",
      data: newDocument
    };
    
    if (validationResult) {
      console.log('📋 [TRIP UPLOAD DOC] Including validation results in response:', {
        valid: validationResult.valid,
        errors: validationResult.errors?.length || 0,
        warnings: validationResult.warnings?.length || 0,
        missing: validationResult.missing?.length || 0
      });
      responseData.validation = {
        valid: validationResult.valid,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        missing: validationResult.missing,
        documentDetails: validationResult.documentDetails
      };
      
      // Always show validation results, even if valid
      if (validationResult.errors.length > 0) {
        const errorSummary = validationResult.errors.map(e => e.message).join('; ');
        responseData.message += ` ⚠️ Document validation found ${validationResult.errors.length} error(s): ${errorSummary}`;
      }
      if (validationResult.warnings.length > 0) {
        responseData.message += ` ⚠️ Document validation completed with ${validationResult.warnings.length} warning(s).`;
      }
      if (validationResult.missing.length > 0) {
        responseData.message += ` ⚠️ ${validationResult.missing.length} required document(s) missing.`;
      }
    }
    
    res.status(200).json(responseData);
  } catch (error) {
    console.error("Error uploading trip document:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while uploading the document."
    });
  }
};

// Delete Trip Document
export const deleteTripDocument = async (req, res) => {
  try {
    const { id, documentId } = req.params;

    // Find trip and verify it belongs to the user's company
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const trip = await Trip.findById(id);
    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found."
      });
    }

    // Verify company access (unless superadmin)
    if (!isSuperadmin && trip.company.toString() !== companyId?.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete documents for this trip."
      });
    }

    // Find and remove the document
    const documentIndex = trip.documents?.findIndex(
      doc => doc._id.toString() === documentId
    );

    if (documentIndex === -1 || !trip.documents || !trip.documents[documentIndex]) {
      return res.status(404).json({
        success: false,
        message: "Document not found."
      });
    }

    // Remove document from array
    trip.documents.splice(documentIndex, 1);
    await trip.save();

    res.status(200).json({
      success: true,
      message: "Document deleted successfully."
    });
  } catch (error) {
    console.error("Error deleting trip document:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while deleting the document."
    });
  }
};

// Get Signed URL for Trip Document
export const getTripDocumentSignedUrl = async (req, res) => {
  try {
    const { id, documentId } = req.params;
    const { disposition = 'inline' } = req.query; // 'inline' or 'attachment'

    // Find trip and verify it belongs to the user's company
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const trip = await Trip.findById(id);
    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found."
      });
    }

    // Verify access: drivers can access trips assigned to them, others need company access
    if (req.user.role === 'driver') {
      // For drivers, ensure they are assigned to this trip (as driver or co-driver)
      const isDriver = trip.driver.toString() === req.user._id.toString();
      const isCoDriver = trip.coDriver && trip.coDriver.toString() === req.user._id.toString();
      
      if (!isDriver && !isCoDriver) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to access documents for this trip."
        });
      }
    } else if (!isSuperadmin && trip.company.toString() !== companyId?.toString()) {
      // For non-drivers, verify company access (unless superadmin)
      return res.status(403).json({
        success: false,
        message: "You don't have permission to access documents for this trip."
      });
    }

    // Find the document
    const document = trip.documents?.find(
      doc => doc._id.toString() === documentId
    );

    if (!document || !document.fileUrl) {
      return res.status(404).json({
        success: false,
        message: "Document not found."
      });
    }

    const fileUrl = document.fileUrl;

    // Check if it's an S3 URL
    const isS3Url = fileUrl.includes('amazonaws.com') || fileUrl.includes('s3');

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

        console.log('🔑 Extracting S3 info for trip document:', {
          originalUrl: fileUrl,
          cleanUrl: cleanUrl,
          bucketName,
          key,
          hostname: urlObj.hostname
        });

        // Determine content type
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
            'zip': 'application/zip',
          };

          // Check both direct match and lowercase match
          const lowerType = type?.toLowerCase();
          const fileType = document.mimeType || type;
          return typeMap[lowerType] || typeMap[fileType] || typeMap[type] || 'application/octet-stream';
        };

        const contentType = getContentType(document.mimeType);
        const contentDisposition = disposition === 'attachment'
          ? `attachment; filename="${encodeURIComponent(document.fileName || 'document')}"`
          : 'inline';

        console.log('🔑 Generating signed URL with disposition:', contentDisposition, 'for file:', document.fileName);
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

        console.log('✅ Generated signed URL for trip document');

        return res.json({
          success: true,
          url: signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('Error generating signed URL for trip document:', s3Error);
        // Fallback to original URL if S3 signing fails
        return res.json({
          success: true,
          url: fileUrl,
          expiresIn: 0
        });
      }
    } else {
      // Not an S3 URL (local storage), return as-is
      return res.json({
        success: true,
        url: fileUrl,
        expiresIn: 0
      });
    }
  } catch (error) {
    console.error("Error getting signed trip document URL:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while getting the document URL."
    });
  }
};

// ✅ Get Completed Trips for a Driver (for payroll calculation)
export const getCompletedTripsByDriver = async (req, res) => {
  try {
    const driverId = req.params.id;
    const { startDate, endDate } = req.query;

    console.log('🔍 getCompletedTripsByDriver called:', { driverId, startDate, endDate });

    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({ success: false, message: "Invalid driver ID" });
    }

    // Get driver to fetch salary rates
    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    // Note: Earnings will be calculated using the primary driver's rate for consistency
    // Both driver and co-driver get the same pay for the same trip
    // Get salary per mile rates for this driver (will be used as fallback if primary driver rates not available)
    const driverBaseRate = driver.details?.salaryPerMile || driver.details?.mileRate || 0;
    const driverTeamRate = driver.details?.mileRateTeam || 0;
    const driverEmptyRate = driver.details?.emptyMileRate || 0;
    const driverEmptyTeamRate = driver.details?.emptyMileRateTeam || 0;
    const driverSnowRate = driver.details?.salaryPerMileSnow || 0;
    const driverHighTempRate = driver.details?.salaryPerMileHighTemp || 0;
    const highTempThreshold = driver.details?.highTempThreshold || 35; // Default 35°C

    // Fallback to old mileRate for backward compatibility
    const driverMileRate = driverBaseRate || driver.details?.mileRate || 0;

    console.log('💰 Driver info:', {
      name: driver.name,
      id: driver._id,
      company: driver.company,
      baseRate: driverBaseRate,
      teamRate: driverTeamRate,
      emptyRate: driverEmptyRate,
      emptyTeamRate: driverEmptyTeamRate,
      snowRate: driverSnowRate,
      highTempRate: driverHighTempRate,
      highTempThreshold: highTempThreshold,
      mileRate: driverMileRate // Legacy
    });

    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        count: 0,
        data: []
      });
    }

    // Build match query - get completed trips for the driver (as primary driver OR co-driver)
    const driverObjectId = new mongoose.Types.ObjectId(driverId);
    const matchQuery = {
      $or: [
        { driver: driverObjectId },
        { coDriver: driverObjectId }
      ],
      status: 'completed'
    };

    // Add company filter
    if (companyId && !isSuperadmin) {
      const companyObjectId = new mongoose.Types.ObjectId(companyId);
      matchQuery.company = { $in: [companyObjectId, companyId] };
    }

    // Add date filtering if provided - filter by actualEndDate or completedAt
    if (startDate || endDate) {
      const dateConditions = [];
      if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        dateConditions.push(
          { actualEndDate: { $gte: start, $lte: end } },
          { updatedAt: { $gte: start, $lte: end } }
        );
      } else if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateConditions.push(
          { actualEndDate: { $gte: start } },
          { updatedAt: { $gte: start } }
        );
      } else if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateConditions.push(
          { actualEndDate: { $lte: end } },
          { updatedAt: { $lte: end } }
        );
      }

      if (dateConditions.length > 0) {
        matchQuery.$or = dateConditions;
      }
    }

    // Get completed trips with orders populated (include coDriver)
    const completedTrips = await Trip.find(matchQuery)
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'licensePlate unitNo makeModel make model internalId unitType')
      .populate('trailer', 'licensePlate unitNo makeModel unitType')
      .populate({
        path: 'orders',
        select: 'orderNumber pickupLocation deliveryLocation temperature temperatureUnit weatherConditions distance',
        populate: [
          {
            path: 'pickupLocation.placeId',
            select: 'name currentLocation.address currentLocation.latitude currentLocation.longitude',
            model: 'Place'
          },
          {
            path: 'deliveryLocation.placeId',
            select: 'name currentLocation.address currentLocation.latitude currentLocation.longitude',
            model: 'Place'
          }
        ]
      })
      .sort({ actualEndDate: -1, updatedAt: -1 })
      .lean();

    console.log(`📦 Found ${completedTrips.length} completed trips for driver`);

    // Calculate distance and earnings for each trip
    const tripsWithCalculations = await Promise.all(completedTrips.map(async (trip) => {
      let distance = 0;
      let startLocation = trip.startLocation;
      let endLocation = trip.endLocation;

      try {
        // If trip doesn't have startLocation/endLocation, try to get from orders
        const hasValidStartLocation = startLocation && startLocation.latitude && startLocation.longitude && startLocation.place;
        const hasValidEndLocation = endLocation && endLocation.latitude && endLocation.longitude && endLocation.place;

        if (!hasValidStartLocation && trip.orders && trip.orders.length > 0) {
          const firstOrder = trip.orders[0];
          if (firstOrder && firstOrder.pickupLocation) {
            // Check if placeId is populated (nested object)
            if (firstOrder.pickupLocation.placeId && typeof firstOrder.pickupLocation.placeId === 'object') {
              const place = firstOrder.pickupLocation.placeId;
              // Debug: log what's in the place object
              console.log(`🔍 Checking placeId for start location (trip ${trip.tripNumber}):`, {
                hasPlace: !!place,
                placeName: place.name,
                hasCurrentLocation: !!place.currentLocation,
                currentLocationKeys: place.currentLocation ? Object.keys(place.currentLocation) : [],
                directLat: firstOrder.pickupLocation.latitude,
                directLng: firstOrder.pickupLocation.longitude
              });
              // Try to get coordinates from currentLocation (this is the most reliable source)
              if (place.currentLocation && place.currentLocation.latitude && place.currentLocation.longitude) {
                startLocation = {
                  place: place.name || place.currentLocation.address || firstOrder.pickupLocation.place || 'Unknown',
                  latitude: String(place.currentLocation.latitude),
                  longitude: String(place.currentLocation.longitude)
                };
                console.log(`✅ Extracted start coordinates from placeId.currentLocation for trip ${trip.tripNumber}`);
              } else if (firstOrder.pickupLocation.latitude && firstOrder.pickupLocation.longitude) {
                // Use coordinates directly from pickupLocation
                startLocation = {
                  place: firstOrder.pickupLocation.place || place.name || 'Unknown',
                  latitude: String(firstOrder.pickupLocation.latitude),
                  longitude: String(firstOrder.pickupLocation.longitude)
                };
                console.log(`✅ Extracted start coordinates from pickupLocation for trip ${trip.tripNumber}`);
              } else if (firstOrder.pickupLocation.place) {
                // At least set the place name even without coordinates
                startLocation = {
                  place: firstOrder.pickupLocation.place || place.name || 'Unknown',
                  latitude: '',
                  longitude: ''
                };
              }
            } else if (firstOrder.pickupLocation.place || firstOrder.pickupLocation.latitude) {
              startLocation = {
                place: firstOrder.pickupLocation.place || 'Unknown',
                latitude: firstOrder.pickupLocation.latitude ? String(firstOrder.pickupLocation.latitude) : '',
                longitude: firstOrder.pickupLocation.longitude ? String(firstOrder.pickupLocation.longitude) : ''
              };
            }
          }
        }

        if (!hasValidEndLocation && trip.orders && trip.orders.length > 0) {
          const lastOrder = trip.orders[trip.orders.length - 1];
          if (lastOrder && lastOrder.deliveryLocation) {
            // Check if placeId is populated (nested object)
            if (lastOrder.deliveryLocation.placeId && typeof lastOrder.deliveryLocation.placeId === 'object') {
              const place = lastOrder.deliveryLocation.placeId;
              // Try to get coordinates from currentLocation (this is the most reliable source)
              if (place.currentLocation && place.currentLocation.latitude && place.currentLocation.longitude) {
                endLocation = {
                  place: place.name || place.currentLocation.address || lastOrder.deliveryLocation.place || 'Unknown',
                  latitude: String(place.currentLocation.latitude),
                  longitude: String(place.currentLocation.longitude)
                };
                console.log(`✅ Extracted end coordinates from placeId.currentLocation for trip ${trip.tripNumber}:`, {
                  place: endLocation.place,
                  lat: endLocation.latitude,
                  lng: endLocation.longitude
                });
              } else if (lastOrder.deliveryLocation.latitude && lastOrder.deliveryLocation.longitude) {
                // Use coordinates directly from deliveryLocation
                endLocation = {
                  place: lastOrder.deliveryLocation.place || place.name || 'Unknown',
                  latitude: String(lastOrder.deliveryLocation.latitude),
                  longitude: String(lastOrder.deliveryLocation.longitude)
                };
                console.log(`✅ Extracted end coordinates from deliveryLocation for trip ${trip.tripNumber}`);
              } else if (lastOrder.deliveryLocation.place) {
                // At least set the place name even without coordinates
                endLocation = {
                  place: lastOrder.deliveryLocation.place || place.name || 'Unknown',
                  latitude: '',
                  longitude: ''
                };
              }
            } else if (lastOrder.deliveryLocation.place || lastOrder.deliveryLocation.latitude) {
              endLocation = {
                place: lastOrder.deliveryLocation.place || 'Unknown',
                latitude: lastOrder.deliveryLocation.latitude ? String(lastOrder.deliveryLocation.latitude) : '',
                longitude: lastOrder.deliveryLocation.longitude ? String(lastOrder.deliveryLocation.longitude) : ''
              };
            }
          }
        }

        // Ensure we have location objects even if empty
        if (!startLocation) startLocation = { place: 'Unknown', latitude: '', longitude: '' };
        if (!endLocation) endLocation = { place: 'Unknown', latitude: '', longitude: '' };
        
        // If we have addresses but no coordinates, try to geocode them
        if (startLocation.place && startLocation.place !== 'Unknown' && (!startLocation.latitude || !startLocation.longitude)) {
          console.log(`🌍 Geocoding start location: ${startLocation.place}`);
          const coords = await getCoordinatesFromAddress(startLocation.place);
          if (coords && coords.latitude && coords.longitude) {
            startLocation.latitude = coords.latitude.toString();
            startLocation.longitude = coords.longitude.toString();
            console.log(`✅ Geocoded start location: ${startLocation.place} -> (${startLocation.latitude}, ${startLocation.longitude})`);
          } else {
            console.warn(`⚠️ Could not geocode start location: ${startLocation.place}`);
          }
        }
        
        if (endLocation.place && endLocation.place !== 'Unknown' && (!endLocation.latitude || !endLocation.longitude)) {
          console.log(`🌍 Geocoding end location: ${endLocation.place}`);
          const coords = await getCoordinatesFromAddress(endLocation.place);
          if (coords && coords.latitude && coords.longitude) {
            endLocation.latitude = coords.latitude.toString();
            endLocation.longitude = coords.longitude.toString();
            console.log(`✅ Geocoded end location: ${endLocation.place} -> (${endLocation.latitude}, ${endLocation.longitude})`);
          } else {
            console.warn(`⚠️ Could not geocode end location: ${endLocation.place}`);
          }
        }

        // Use route.totalDistance if available, otherwise calculate from locations
        if (trip.route?.totalDistance && trip.route.totalDistance > 0) {
          distance = trip.route.totalDistance;
          console.log(`✅ Using route.totalDistance for trip ${trip.tripNumber}: ${distance} km`);
        } else if (trip.orders && trip.orders.length > 0) {
          // Try to get distance from orders
          const orderDistances = trip.orders
            .filter(order => order.distance && order.distance > 0)
            .map(order => Number(order.distance));
          if (orderDistances.length > 0) {
            distance = orderDistances.reduce((sum, d) => sum + d, 0);
            console.log(`✅ Using order distances for trip ${trip.tripNumber}: ${distance} km (from ${orderDistances.length} orders)`);
          } else {
            // Check if orders have distance stored in a different field or format
            const allOrderDistances = trip.orders.map(o => ({
              orderNumber: o.orderNumber,
              distance: o.distance,
              // Check for alternative distance fields
              routeDistance: o.route?.distance,
              calculatedDistance: o.calculatedDistance
            }));
            console.log(`⚠️ Trip ${trip.tripNumber} has ${trip.orders.length} orders but no distance field. Order details:`, allOrderDistances);
            console.log(`💡 Suggestion: Ensure orders have 'distance' field calculated when created, or enable Google Maps Geocoding API for automatic distance calculation.`);
          }
        }
        
        // If still no distance, try to calculate from coordinates
        if (distance === 0 && startLocation && endLocation && startLocation.latitude && endLocation.latitude) {
          // Calculate distance from start to end location
          const origin = {
            latitude: parseFloat(startLocation.latitude),
            longitude: parseFloat(startLocation.longitude)
          };
          const destination = {
            latitude: parseFloat(endLocation.latitude),
            longitude: parseFloat(endLocation.longitude)
          };

          console.log(`📍 Calculating distance for trip ${trip.tripNumber}:`, {
            origin: `${startLocation.place} (${origin.latitude}, ${origin.longitude})`,
            destination: `${endLocation.place} (${destination.latitude}, ${destination.longitude})`
          });

          // Try Google Maps route distance first
          const routeDistance = await getRouteDistance(origin, destination);
          if (routeDistance !== null && routeDistance > 0) {
            distance = routeDistance;
            console.log(`✅ Google Maps distance for trip ${trip.tripNumber}: ${distance} km`);
          } else {
            // Fallback to haversine
            distance = haversineDistance(
              origin.latitude,
              origin.longitude,
              destination.latitude,
              destination.longitude
            );
            console.log(`⚠️ Haversine distance for trip ${trip.tripNumber}: ${distance} km`);
          }
        } else if (trip.route?.waypoints && trip.route.waypoints.length >= 2) {
          // Calculate distance through waypoints
          const waypoints = trip.route.waypoints.filter(wp => wp.latitude && wp.longitude);
          if (waypoints.length >= 2) {
            const origin = {
              latitude: parseFloat(waypoints[0].latitude),
              longitude: parseFloat(waypoints[0].longitude)
            };
            const destination = {
              latitude: parseFloat(waypoints[waypoints.length - 1].latitude),
              longitude: parseFloat(waypoints[waypoints.length - 1].longitude)
            };
            const intermediateWaypoints = waypoints.slice(1, -1).map(wp => ({
              latitude: parseFloat(wp.latitude),
              longitude: parseFloat(wp.longitude)
            }));

            const routeDistance = await getRouteDistance(origin, destination, intermediateWaypoints);
            if (routeDistance !== null && routeDistance > 0) {
              distance = routeDistance;
            } else {
              // Fallback to haversine through waypoints
              for (let i = 0; i < waypoints.length - 1; i++) {
                distance += haversineDistance(
                  parseFloat(waypoints[i].latitude),
                  parseFloat(waypoints[i].longitude),
                  parseFloat(waypoints[i + 1].latitude),
                  parseFloat(waypoints[i + 1].longitude)
                );
              }
            }
          }
        } else {
          // Final fallback: If we have addresses but no coordinates after geocoding attempt,
          // and no route/order distance, we can't calculate distance accurately
          // Log detailed information for debugging
          console.warn(`⚠️ No location data available for trip ${trip.tripNumber || trip._id}`, {
            hasRoute: !!trip.route,
            routeTotalDistance: trip.route?.totalDistance,
            hasOrders: !!(trip.orders && trip.orders.length > 0),
            ordersCount: trip.orders?.length || 0,
            startLocation: startLocation?.place || 'N/A',
            endLocation: endLocation?.place || 'N/A',
            hasStartCoords: !!(startLocation?.latitude && startLocation?.longitude),
            hasEndCoords: !!(endLocation?.latitude && endLocation?.longitude),
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ? 'Set' : 'Missing'
          });
          
          // Note: Distance will remain 0, which means earnings will be 0
          // This is expected behavior when we can't calculate distance
          // The user should ensure:
          // 1. Google Maps API key is configured
          // 2. Or trips/orders have distance stored when created
          // 3. Or trips have route.totalDistance calculated
        }
      } catch (error) {
        console.error(`❌ Error calculating distance for trip ${trip.tripNumber || trip._id}:`, error.message);
        distance = 0;
      }

      // Convert km to miles (1 km = 0.621371 miles)
      const distanceInMiles = distance * 0.621371;

      // Check weather conditions and empty status from orders
      let hasSnow = false;
      let hasHighTemp = false;
      let hasEmptyOrder = false;

      if (trip.orders && Array.isArray(trip.orders)) {
        // Check if any order has snow conditions
        hasSnow = trip.orders.some(order => order.weatherConditions?.snow === true);

        // Check if any order has empty flag set to true
        hasEmptyOrder = trip.orders.some(order => order.empty === true);

        // Check if any order has high temperature conditions
        // First check explicit highTemperature flag, then check temperature value
        hasHighTemp = trip.orders.some(order => {
          if (order.weatherConditions?.highTemperature === true) {
            return true;
          }
          // Auto-detect from temperature if not explicitly set
          if (order.temperature !== null && order.temperature !== undefined) {
            const tempInCelsius = order.temperatureUnit === 'Fahrenheit'
              ? (order.temperature - 32) * 5 / 9
              : order.temperature;
            return tempInCelsius >= highTempThreshold;
          }
          return false;
        });
      }

      // Determine if this driver is the primary driver or co-driver
      const isPrimaryDriver = trip.driver && trip.driver._id?.toString() === driverId;
      const isCoDriver = trip.coDriver && trip.coDriver._id?.toString() === driverId;
      
      // Get the primary driver's rates for earnings calculation
      // Both driver and co-driver get the same pay for the same trip based on trip miles
      let primaryDriverBaseRate = driverBaseRate;
      let primaryDriverTeamRate = driverTeamRate;
      let primaryDriverEmptyRate = driverEmptyRate;
      let primaryDriverEmptyTeamRate = driverEmptyTeamRate;
      let primaryDriverSnowRate = driverSnowRate;
      let primaryDriverHighTempRate = driverHighTempRate;
      let primaryDriverMileRate = driverMileRate;
      
      // If this driver is a co-driver, get the primary driver's rates
      if (isCoDriver && trip.driver && trip.driver._id) {
        try {
          const primaryDriver = await User.findById(trip.driver._id).lean();
          if (primaryDriver) {
            primaryDriverBaseRate = primaryDriver.details?.salaryPerMile || primaryDriver.details?.mileRate || driverBaseRate;
            primaryDriverTeamRate = primaryDriver.details?.mileRateTeam || driverTeamRate;
            primaryDriverEmptyRate = primaryDriver.details?.emptyMileRate || driverEmptyRate;
            primaryDriverEmptyTeamRate = primaryDriver.details?.emptyMileRateTeam || driverEmptyTeamRate;
            primaryDriverSnowRate = primaryDriver.details?.salaryPerMileSnow || driverSnowRate;
            primaryDriverHighTempRate = primaryDriver.details?.salaryPerMileHighTemp || driverHighTempRate;
            primaryDriverMileRate = primaryDriverBaseRate || primaryDriver.details?.mileRate || driverMileRate;
          }
        } catch (err) {
          console.warn('Could not fetch primary driver rates, using co-driver rates:', err.message);
        }
      }

      // Determine which base rate to use based on empty status and co-driver presence
      let baseRateToUse = primaryDriverBaseRate;
      
      if (hasEmptyOrder) {
        // Trip has empty orders - use empty rates
        if (trip.coDriver) {
          // Empty trip with co-driver - use EMPTY-TEAM rate
          baseRateToUse = primaryDriverEmptyTeamRate || primaryDriverEmptyRate || primaryDriverBaseRate;
        } else {
          // Empty trip without co-driver - use EMPTY rate
          baseRateToUse = primaryDriverEmptyRate || primaryDriverBaseRate;
        }
      } else {
        // Normal (not empty) trip
        if (trip.coDriver) {
          // Normal trip with co-driver - use TEAM rate
          baseRateToUse = primaryDriverTeamRate || primaryDriverBaseRate;
        }
        // else use primaryDriverBaseRate (ALONE rate)
      }

      // Calculate earnings based on weather conditions using primary driver's rates
      // Both driver and co-driver get the same earnings for the same trip
      let earnings = distanceInMiles * baseRateToUse; // Base salary with appropriate rate

      // Add snow premium (additive)
      if (hasSnow && primaryDriverSnowRate > 0) {
        earnings += distanceInMiles * primaryDriverSnowRate;
      }

      // Add high temperature premium (additive)
      if (hasHighTemp && primaryDriverHighTempRate > 0) {
        earnings += distanceInMiles * primaryDriverHighTempRate;
      }

      // If no base rate but legacy mileRate exists, use that
      if (baseRateToUse === 0 && primaryDriverMileRate > 0) {
        earnings = distanceInMiles * primaryDriverMileRate;
      }
      
      // Determine rate type based on empty flag and co-driver presence
      let rateType = 'ALONE';
      let rateTypeLabel = 'ALONE';
      
      if (hasEmptyOrder) {
        // Trip has orders marked as empty
        if (trip.coDriver) {
          rateType = 'EMPTY-TEAM';
          rateTypeLabel = 'EMPTY-TEAM';
        } else {
          rateType = 'EMPTY';
          rateTypeLabel = 'EMPTY';
        }
      } else if (trip.orders && trip.orders.length === 0) {
        // No orders at all means empty trip
        rateType = 'EMPTY-T';
        rateTypeLabel = 'EMPTY-T';
      } else if (trip.coDriver) {
        // Has orders (not empty) and has co-driver
        rateType = 'TEAM';
        rateTypeLabel = 'TEAM';
      }
      // else remains 'ALONE' (has orders, not empty, no co-driver)
      
      return {
        ...trip,
        startLocation: startLocation || { place: 'Unknown', latitude: '', longitude: '' },
        endLocation: endLocation || { place: 'Unknown', latitude: '', longitude: '' },
        distance: Math.round(distance), // km
        distanceInMiles: Math.round(distanceInMiles * 100) / 100, // Round to 2 decimal places
        mileRate: baseRateToUse || primaryDriverMileRate, // Use the actual rate that was used for calculation
        baseRate: baseRateToUse, // The rate that was actually applied
        rateType: rateType, // Trip type indicator
        rateTypeLabel: rateTypeLabel, // Label for display
        snowRate: primaryDriverSnowRate,
        highTempRate: primaryDriverHighTempRate,
        weatherConditions: {
          snow: hasSnow,
          highTemperature: hasHighTemp
        },
        earnings: earnings.toFixed(2), // Same earnings for both driver and co-driver
        driverRole: isPrimaryDriver ? 'driver' : (isCoDriver ? 'coDriver' : 'unknown'),
        driverDetails: trip.driver ? {
          _id: trip.driver._id,
          name: trip.driver.name,
          phone: trip.driver.phone
        } : null,
        coDriverDetails: trip.coDriver ? {
          _id: trip.coDriver._id,
          name: trip.coDriver.name,
          phone: trip.coDriver.phone
        } : null
      };
    }));

    // Calculate summary - use average of primary driver rates for display
    const avgBaseRate = tripsWithCalculations.length > 0 
      ? tripsWithCalculations.reduce((sum, t) => sum + (t.baseRate || 0), 0) / tripsWithCalculations.length 
      : driverBaseRate || driverMileRate;
    const avgSnowRate = tripsWithCalculations.length > 0
      ? tripsWithCalculations.reduce((sum, t) => sum + (t.snowRate || 0), 0) / tripsWithCalculations.length
      : driverSnowRate;
    const avgHighTempRate = tripsWithCalculations.length > 0
      ? tripsWithCalculations.reduce((sum, t) => sum + (t.highTempRate || 0), 0) / tripsWithCalculations.length
      : driverHighTempRate;

    res.json({
      success: true,
      message: "Trips fetched successfully",
      data: tripsWithCalculations,
      summary: {
        totalTrips: tripsWithCalculations.length,
        totalDistanceKm: Math.round(tripsWithCalculations.reduce((sum, t) => sum + (t.distance || 0), 0)),
        totalDistanceMiles: Math.round(tripsWithCalculations.reduce((sum, t) => sum + (t.distanceInMiles || 0), 0) * 100) / 100,
        totalEarnings: parseFloat(tripsWithCalculations.reduce((sum, t) => sum + parseFloat(t.earnings || 0), 0).toFixed(2)),
        ratePerMile: avgBaseRate || driverMileRate,
        baseRate: avgBaseRate,
        snowRate: avgSnowRate,
        highTempRate: avgHighTempRate
      }
    });
  } catch (err) {
    console.error('❌ Error in getCompletedTripsByDriver:', err);
    res.status(500).json({
      success: false,
      message: "Error fetching completed trips",
      error: err.message
    });
  }
};

// ✅ Get Driver Mileage Data (for Mileage Sheet)
export const getDriverMileage = async (req, res) => {
  try {
    const driverId = req.user._id; // Get from authenticated user
    const { startDate, endDate, groupBy = 'monthly' } = req.query;

    console.log('🔍 getDriverMileage called:', { driverId, startDate, endDate, groupBy });

    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({ success: false, message: "Invalid driver ID" });
    }

    // Fetch completed orders for this driver (as driver or coDriver)
    const driverObjectId = new mongoose.Types.ObjectId(driverId);
    
    // Build base filter
    const baseConditions = [
      {
        $or: [
          { driver: driverObjectId },
          { coDriver: driverObjectId }
        ]
      },
      {
        status: { $in: ['delivered', 'completed', 'COMPLETED'] }
      }
    ];

    // Add date filter if provided
    // Only apply date filter if both start and end dates are provided to avoid being too restrictive
    if (startDate && endDate) {
      const dateConditions = [];
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      console.log('📅 Applying date filter:', { start: start.toISOString(), end: end.toISOString() });
      
      // Use OR to match any date field within range - order matches if ANY date field is in range
      dateConditions.push(
        { deliveryDate: { $gte: start, $lte: end } },
        { completedDate: { $gte: start, $lte: end } },
        { actualEndDate: { $gte: start, $lte: end } },
        { updatedAt: { $gte: start, $lte: end } },
        { createdAt: { $gte: start, $lte: end } }
      );
      
      baseConditions.push({ $or: dateConditions });
    } else {
      console.log('📅 No date filter applied - fetching all completed orders');
    }
    
    const orderFilter = { $and: baseConditions };

    const completedOrders = await Order.find(orderFilter)
      .populate('truck', 'unitNumber plateNumber internalId')
      .populate('trailer', 'unitNumber plateNumber internalId')
      .sort({ deliveryDate: -1, completedDate: -1, updatedAt: -1 })
      .lean();

    console.log(`📦 Found ${completedOrders.length} completed orders for mileage calculation`);
    console.log('📦 Order filter:', JSON.stringify(orderFilter, null, 2));
    
    if (completedOrders.length === 0) {
      console.log('⚠️ No orders found. Checking if there are any completed orders for this driver...');
      // Check without date filter
      const testFilter = {
        $or: [
          { driver: driverObjectId },
          { coDriver: driverObjectId }
        ],
        status: { $in: ['delivered', 'completed', 'COMPLETED'] }
      };
      const testOrders = await Order.find(testFilter).countDocuments();
      console.log(`📊 Total completed orders for driver (without date filter): ${testOrders}`);
    }

    // Process orders to calculate distances and categorize
    const tripsData = await Promise.all(completedOrders.map(async (order) => {
      let distance = 0;
      let pickupLocation = order.pickupLocation;
      let deliveryLocation = order.deliveryLocation;

      // Extract location information
      if (pickupLocation && pickupLocation.placeId && typeof pickupLocation.placeId === 'object') {
        const place = pickupLocation.placeId;
        if (place.currentLocation && place.currentLocation.latitude && place.currentLocation.longitude) {
          pickupLocation = {
            place: place.name || place.currentLocation.address || pickupLocation.place || 'Unknown',
            latitude: String(place.currentLocation.latitude),
            longitude: String(place.currentLocation.longitude)
          };
        } else if (pickupLocation.place) {
          pickupLocation = {
            place: pickupLocation.place || place.name || 'Unknown',
            latitude: pickupLocation.latitude ? String(pickupLocation.latitude) : '',
            longitude: pickupLocation.longitude ? String(pickupLocation.longitude) : ''
          };
        }
      } else if (pickupLocation && (pickupLocation.place || pickupLocation.latitude)) {
        pickupLocation = {
          place: pickupLocation.place || 'Unknown',
          latitude: pickupLocation.latitude ? String(pickupLocation.latitude) : '',
          longitude: pickupLocation.longitude ? String(pickupLocation.longitude) : ''
        };
      } else {
        pickupLocation = { place: 'Unknown', latitude: '', longitude: '' };
      }

      if (deliveryLocation && deliveryLocation.placeId && typeof deliveryLocation.placeId === 'object') {
        const place = deliveryLocation.placeId;
        if (place.currentLocation && place.currentLocation.latitude && place.currentLocation.longitude) {
          deliveryLocation = {
            place: place.name || place.currentLocation.address || deliveryLocation.place || 'Unknown',
            latitude: String(place.currentLocation.latitude),
            longitude: String(place.currentLocation.longitude)
          };
        } else if (deliveryLocation.place) {
          deliveryLocation = {
            place: deliveryLocation.place || place.name || 'Unknown',
            latitude: deliveryLocation.latitude ? String(deliveryLocation.latitude) : '',
            longitude: deliveryLocation.longitude ? String(deliveryLocation.longitude) : ''
          };
        }
      } else if (deliveryLocation && (deliveryLocation.place || deliveryLocation.latitude)) {
        deliveryLocation = {
          place: deliveryLocation.place || 'Unknown',
          latitude: deliveryLocation.latitude ? String(deliveryLocation.latitude) : '',
          longitude: deliveryLocation.longitude ? String(deliveryLocation.longitude) : ''
        };
      } else {
        deliveryLocation = { place: 'Unknown', latitude: '', longitude: '' };
      }

      // Calculate distance
      if (order.distance && order.distance > 0) {
        distance = order.distance;
        console.log(`📏 Using order.distance: ${distance} km`);
      } else if (pickupLocation.latitude && pickupLocation.longitude && deliveryLocation.latitude && deliveryLocation.longitude) {
        try {
          console.log(`🗺️ Fetching route distance: ${pickupLocation.latitude},${pickupLocation.longitude} → ${deliveryLocation.latitude},${deliveryLocation.longitude}`);
          const routeDistance = await getRouteDistance(
            { lat: parseFloat(pickupLocation.latitude), lng: parseFloat(pickupLocation.longitude) },
            { lat: parseFloat(deliveryLocation.latitude), lng: parseFloat(deliveryLocation.longitude) }
          );
          if (routeDistance && routeDistance.distance) {
            distance = routeDistance.distance; // in km
            console.log(`✅ Route distance calculated: ${distance} km`);
          } else {
            // Fallback to haversine
            distance = haversineDistance(
              parseFloat(pickupLocation.latitude),
              parseFloat(pickupLocation.longitude),
              parseFloat(deliveryLocation.latitude),
              parseFloat(deliveryLocation.longitude)
            );
            console.log(`📏 Haversine distance calculated: ${distance} km`);
          }
        } catch (error) {
          console.error('❌ Error calculating route distance:', error);
          // Fallback to haversine
          distance = haversineDistance(
            parseFloat(pickupLocation.latitude),
            parseFloat(pickupLocation.longitude),
            parseFloat(deliveryLocation.latitude),
            parseFloat(deliveryLocation.longitude)
          );
          console.log(`📏 Haversine fallback distance: ${distance} km`);
        }
      } else {
        console.warn(`⚠️ Missing coordinates for order ${order.orderNumber || order._id}:`, {
          pickup: { lat: pickupLocation.latitude, lng: pickupLocation.longitude },
          delivery: { lat: deliveryLocation.latitude, lng: deliveryLocation.longitude }
        });
        // Use 0 distance if we can't calculate - still include the trip
        distance = 0;
      }

      // Convert to miles (ensure distance is at least 0)
      const distanceInMiles = (distance || 0) * 0.621371;

      // Get trip/order dates
      const startDate = order.pickupDate || order.plannedPickupDate || order.createdAt;
      const endDate = order.deliveryDate || order.completedDate || order.actualEndDate || order.updatedAt;

      const tripData = {
        _id: order._id.toString(),
        tripNumber: order.tripNumber || null,
        orderNumber: order.orderNumber || null,
        startDate: startDate ? new Date(startDate).toISOString() : new Date(order.createdAt).toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : new Date(order.updatedAt).toISOString(),
        origin: pickupLocation.place || 'Unknown',
        destination: deliveryLocation.place || 'Unknown',
        distance: parseFloat(distanceInMiles.toFixed(2)),
        empty: order.empty || false,
        truck: order.truck ? {
          unitNumber: order.truck.unitNumber || null,
          plateNumber: order.truck.plateNumber || null
        } : null
      };
      
      console.log(`✅ Processed order ${order.orderNumber || order._id}:`, {
        distance: tripData.distance,
        origin: tripData.origin,
        destination: tripData.destination,
        startDate: tripData.startDate
      });
      
      return tripData;
    }));
    
    console.log(`📊 Total trips processed: ${tripsData.length}`);

    // Group trips by month or week
    const groupedData = {};
    
    tripsData.forEach(trip => {
      const tripDate = new Date(trip.startDate);
      let groupKey = '';
      let groupLabel = '';

      if (groupBy === 'weekly') {
        // Group by week (Monday to Sunday)
        const day = tripDate.getDay();
        const diff = tripDate.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
        const monday = new Date(tripDate.getFullYear(), tripDate.getMonth(), diff);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        
        groupKey = monday.toISOString();
        groupLabel = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      } else {
        // Group by month
        const monthStart = new Date(tripDate.getFullYear(), tripDate.getMonth(), 1);
        groupKey = monthStart.toISOString();
        groupLabel = tripDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }

      if (!groupedData[groupKey]) {
        groupedData[groupKey] = {
          month: groupLabel,
          totalMiles: 0,
          loadedMiles: 0,
          emptyMiles: 0,
          iftaMiles: 0,
          trips: []
        };
      }

      groupedData[groupKey].totalMiles += trip.distance;
      groupedData[groupKey].iftaMiles += trip.distance; // All miles are IFTA reportable for now
      
      if (trip.empty) {
        groupedData[groupKey].emptyMiles += trip.distance;
      } else {
        groupedData[groupKey].loadedMiles += trip.distance;
      }

      groupedData[groupKey].trips.push({
        _id: trip._id,
        tripNumber: trip.tripNumber,
        orderNumber: trip.orderNumber,
        startDate: trip.startDate,
        endDate: trip.endDate,
        origin: trip.origin,
        destination: trip.destination,
        distance: trip.distance,
        truck: trip.truck
      });
    });

    // Convert to array and sort by date (most recent first)
    const result = Object.values(groupedData).sort((a, b) => {
      const dateA = new Date(a.trips[0]?.startDate || 0);
      const dateB = new Date(b.trips[0]?.startDate || 0);
      return dateB.getTime() - dateA.getTime();
    });

    // Round values to 2 decimal places
    result.forEach((group, index) => {
      group.totalMiles = parseFloat((group.totalMiles || 0).toFixed(2));
      group.loadedMiles = parseFloat((group.loadedMiles || 0).toFixed(2));
      group.emptyMiles = parseFloat((group.emptyMiles || 0).toFixed(2));
      group.iftaMiles = parseFloat((group.iftaMiles || 0).toFixed(2));
      
      console.log(`📦 Group ${index + 1}:`, {
        month: group.month,
        totalMiles: group.totalMiles,
        loadedMiles: group.loadedMiles,
        emptyMiles: group.emptyMiles,
        tripsCount: group.trips ? group.trips.length : 0
      });
    });

    console.log(`✅ Returning ${result.length} grouped mileage periods with ${tripsData.length} total trips`);
    console.log('📤 Response preview:', JSON.stringify({
      success: true,
      dataCount: result.length,
      totalTrips: tripsData.length,
      firstGroup: result.length > 0 ? {
        month: result[0].month,
        totalMiles: result[0].totalMiles,
        tripsCount: result[0].trips?.length || 0
      } : null
    }, null, 2));

    res.json({
      success: true,
      data: result,
      message: "Mileage data fetched successfully"
    });
  } catch (err) {
    console.error('❌ Error in getDriverMileage:', err);
    res.status(500).json({
      success: false,
      message: "Error fetching mileage data",
      error: err.message
    });
  }
};
