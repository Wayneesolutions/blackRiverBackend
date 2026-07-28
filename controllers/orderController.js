import mongoose from "mongoose";
import Order from "../models/orderModel.js";
import { Invoice } from "../models/hr/invoiceModel.js"; // Import Invoice model
import Trip from "../models/tripModel.js";
import { User } from "../models/driver/userModel.js";
import { Trailer } from "../models/driver/trailerModel.js";
import ActivityLog from "../models/activitylogModel.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { getCombinedFilter } from "../utils/trialDataFilter.js";
import Place from "../models/driver/placeModel.js";
import { validateDocuments } from "../services/documentValidationService.js";
import { getCoordinatesFromAddress, getRouteDistance } from "../services/googlemap.js";
import { haversineDistance } from "../utils/distance.js";
import { sendLoadAssignmentEmail, sendLoadCancellationEmail } from "../services/emailService.js";
import { sendPushToDriver } from "../services/pushNotificationService.js";
import fs from 'fs';
import { promises as fsPromises } from 'fs';

const normalizeString = (value) => {
  if (value === undefined || value === null) return '';
  const str = String(value).trim();
  return str.length ? str : '';
};

// Normalize order status to valid enum values (supports uppercase inputs)
const normalizeOrderStatus = (value) => {
  if (value === undefined || value === null) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();

  // Map common variants to schema enum
  const statusMap = {
    'quoted': 'quoted',
    'quote': 'quoted',
    'planned': 'planned',
    'in-delivery': 'in-delivery',
    'in_delivery': 'in-delivery',
    'in transit': 'in-delivery',
    'intransit': 'in-delivery',
    'delivered': 'delivered',
    'completed': 'completed',
    'canceled': 'canceled',
    'cancelled': 'canceled',
  };

  return statusMap[lower] || lower;
};

const normalizeNumber = (value, defaultValue = 0) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(num) ? Number(num) : defaultValue;
};

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return false;
};

const normalizeObjectId = (value) => {
  if (!value || value === 'null' || value === 'undefined') return null;
  if (typeof value === 'object' && value._id) return value._id;
  const str = String(value).trim();
  return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
};

// Create Order
export const createOrder = async (req, res) => {
  try {
    // Log request data for debugging email issues
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🆕 [ORDER CREATE] NEW ORDER CREATION REQUEST');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📋 [ORDER CREATE] Request Body - Driver Assignment:', {
      driver: req.body.driver ? (typeof req.body.driver === 'object' ? req.body.driver._id || req.body.driver.id : req.body.driver) : 'NOT PROVIDED',
      coDriver: req.body.coDriver ? (typeof req.body.coDriver === 'object' ? req.body.coDriver._id || req.body.coDriver.id : req.body.coDriver) : 'NOT PROVIDED',
      customerOrderNo: req.body.customerOrderNo || 'NOT PROVIDED',
      orderType: req.body.orderType || 'NOT PROVIDED'
    });
    console.log('═══════════════════════════════════════════════════════════════');

    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating orders. Go to Company Settings to set up your company."
        });
      }
    }

    const companyId = getUserCompanyId(req.user);

    // Parse JSON strings from FormData (multer sends nested objects as JSON strings)
    const parseFormDataField = (field) => {
      if (!field) return null;
      if (typeof field === 'string') {
        try {
          return JSON.parse(field);
        } catch (e) {
          return field; // Return as-is if not JSON
        }
      }
      return field;
    };

    // Parse nested objects from FormData
    if (req.body.shipper && typeof req.body.shipper === 'string') {
      req.body.shipper = parseFormDataField(req.body.shipper);
    }
    if (req.body.receiver && typeof req.body.receiver === 'string') {
      req.body.receiver = parseFormDataField(req.body.receiver);
    }
    if (req.body.pickupAppointmentDetails && typeof req.body.pickupAppointmentDetails === 'string') {
      req.body.pickupAppointmentDetails = parseFormDataField(req.body.pickupAppointmentDetails);
    }
    if (req.body.deliveryAppointmentDetails && typeof req.body.deliveryAppointmentDetails === 'string') {
      req.body.deliveryAppointmentDetails = parseFormDataField(req.body.deliveryAppointmentDetails);
    }
    if (req.body.borderInfo && typeof req.body.borderInfo === 'string') {
      req.body.borderInfo = parseFormDataField(req.body.borderInfo);
    }
    if (req.body.weatherConditions && typeof req.body.weatherConditions === 'string') {
      req.body.weatherConditions = parseFormDataField(req.body.weatherConditions);
    }
    if (req.body.dimensions && typeof req.body.dimensions === 'string') {
      req.body.dimensions = parseFormDataField(req.body.dimensions);
    }
    if (req.body.additionalInfo && typeof req.body.additionalInfo === 'string') {
      req.body.additionalInfo = parseFormDataField(req.body.additionalInfo);
    }
    if (req.body.pickupLocation && typeof req.body.pickupLocation === 'string') {
      req.body.pickupLocation = parseFormDataField(req.body.pickupLocation);
    }
    if (req.body.deliveryLocation && typeof req.body.deliveryLocation === 'string') {
      req.body.deliveryLocation = parseFormDataField(req.body.deliveryLocation);
    }
    if (req.body.equipment && typeof req.body.equipment === 'string') {
      req.body.equipment = parseFormDataField(req.body.equipment);
    }
    if (req.body.otherCharges && typeof req.body.otherCharges === 'string') {
      req.body.otherCharges = parseFormDataField(req.body.otherCharges);
    }
    if (req.body.receiverStops && typeof req.body.receiverStops === 'string') {
      req.body.receiverStops = parseFormDataField(req.body.receiverStops);
    }
    if (req.body.stops && typeof req.body.stops === 'string') {
      req.body.stops = parseFormDataField(req.body.stops);
    }

    // Process uploaded files
    const files = req.files || {};
    const documentUrls = {};

    console.log('📦 [ORDER CREATE] Files received:', Object.keys(files));
    console.log('📦 [ORDER CREATE] File details:', Object.entries(files).map(([key, value]) => ({
      field: key,
      count: Array.isArray(value) ? value.length : (value ? 1 : 0),
      firstFile: Array.isArray(value) ? (value[0] ? {
        originalname: value[0].originalname,
        hasPath: !!value[0].path,
        hasLocation: !!value[0].location,
        hasKey: !!value[0].key,
        hasBucket: !!value[0].bucket
      } : null) : (value ? {
        originalname: value.originalname,
        hasPath: !!value.path,
        hasLocation: !!value.location,
        hasKey: !!value.key,
        hasBucket: !!value.bucket
      } : null)
    })));

    // Helper function to get file URL
    const getFileUrl = (file) => {
      if (!file) return null;
      return file.location || (file.path ? `${process.env.BASE_URL || 'http://localhost:3000'}/${file.path.replace(/\\/g, '/')}` : null);
    };

    // Collect all documents for validation
    const documentsToValidate = [];

    // Process BOL file
    if (files.bol && files.bol[0]) {
      const file = files.bol[0];
      documentUrls.bol = getFileUrl(file);
      // Add to validation - handle both local and S3 files
      if (file.path || file.location || file.key) {
        documentsToValidate.push({
          path: file.path || null,
          location: file.location || null,
          key: file.key || null,
          bucket: process.env.AWS_S3_BUCKET_NAME || null,
          originalname: file.originalname || 'bol',
          type: 'bol',
          filename: file.filename
        });
      }
    }

    // Process POD file
    if (files.pod && files.pod[0]) {
      const file = files.pod[0];
      documentUrls.pod = getFileUrl(file);
      if (file.path) {
        documentsToValidate.push({
          path: file.path,
          originalname: file.originalname || 'pod',
          type: 'pod',
          filename: file.filename
        });
      }
    }

    // Process Customs/Hazmat files (array)
    if (files.customsHazmat && Array.isArray(files.customsHazmat)) {
      documentUrls.customsHazmat = files.customsHazmat.map(file => {
        // Add to validation - handle both local and S3 files
        if (file.path || file.location || file.key) {
          documentsToValidate.push({
            path: file.path || null,
            location: file.location || null,
            key: file.key || null,
            bucket: process.env.AWS_S3_BUCKET_NAME || null,
            originalname: file.originalname || 'customsHazmat',
            type: 'customsHazmat',
            filename: file.filename
          });
        }
        return getFileUrl(file);
      }).filter(url => url !== null);
    }

    // Process Rate Confirmation file
    if (files.rateConfirmation && files.rateConfirmation[0]) {
      const file = files.rateConfirmation[0];
      documentUrls.rateConfirmation = getFileUrl(file);
      if (file.path) {
        documentsToValidate.push({
          path: file.path,
          originalname: file.originalname || 'rateConfirmation',
          type: 'rateConfirmation',
          filename: file.filename
        });
      }
    }

    // Process Stamped Manifest file
    if (files.stampedManifest && files.stampedManifest[0]) {
      const file = files.stampedManifest[0];
      documentUrls.stampedManifest = getFileUrl(file);
      if (file.path) {
        documentsToValidate.push({
          path: file.path,
          originalname: file.originalname || 'stampedManifest',
          type: 'stampedManifest',
          filename: file.filename
        });
      }
    }

    // Process Load Securement files (array of images)
    if (files.loadSecurement && Array.isArray(files.loadSecurement)) {
      documentUrls.loadSecurement = files.loadSecurement.map(file => {
        // Add to validation - handle both local and S3 files
        if (file.path || file.location || file.key) {
          documentsToValidate.push({
            path: file.path || null,
            location: file.location || null,
            key: file.key || null,
            bucket: process.env.AWS_S3_BUCKET_NAME || null,
            originalname: file.originalname || 'loadSecurement',
            type: 'loadSecurement',
            filename: file.filename
          });
        }
        return getFileUrl(file);
      }).filter(url => url !== null);
    }

    // Process Printed Manifest file
    if (files.printedManifest && files.printedManifest[0]) {
      const file = files.printedManifest[0];
      documentUrls.printedManifest = getFileUrl(file);
      if (file.path) {
        documentsToValidate.push({
          path: file.path,
          originalname: file.originalname || 'printedManifest',
          type: 'printedManifest',
          filename: file.filename
        });
      }
    }

    console.log('📁 Processed document uploads:', documentUrls);
    console.log('📋 Documents to validate:', documentsToValidate.map(d => ({
      filename: d.originalname,
      type: d.type,
      hasPath: !!d.path,
      hasLocation: !!d.location,
      hasKey: !!d.key,
      hasBucket: !!d.bucket
    })));

    // Validate documents using AI
    let validationResult = null;
    if (documentsToValidate.length > 0) {
      console.log(`🤖 [ORDER CREATE] Starting AI validation for ${documentsToValidate.length} document(s)...`);
      console.log(`📋 [ORDER CREATE] Document details:`, documentsToValidate);
      try {
        const orderDataForValidation = {
          orderNumber: req.body.customerOrderNo || 'New Order',
          customer: req.body.customer || null
        };

        validationResult = await validateDocuments(documentsToValidate, 'order', orderDataForValidation);

        console.log('🔍 Document validation result:', {
          valid: validationResult.valid,
          errors: validationResult.errors.length,
          warnings: validationResult.warnings.length,
          missing: validationResult.missing.length
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
        console.error('❌ Document validation error:', validationError);
        console.error('Validation error details:', {
          message: validationError.message,
          stack: validationError.stack,
          documentsCount: documentsToValidate.length
        });
        // Continue with order creation even if validation fails (non-blocking)
        // But log the error for debugging
        // Set validationResult to indicate validation failed
        validationResult = {
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
    }

    // Build pickup location data
    let pickupLocationData = {
      placeId: null,
      place: '',
      latitude: '',
      longitude: ''
    };

    if (req.body.pickupLocation?.placeId) {
      const place = await Place.findById(req.body.pickupLocation.placeId);
      if (place && place.currentLocation) {
        pickupLocationData = {
          placeId: place._id,
          place: place.currentLocation.address || place.name || '',
          latitude: String(place.currentLocation.latitude || ''),
          longitude: String(place.currentLocation.longitude || '')
        };
      }
    } else if (req.body.pickupLocation) {
      pickupLocationData = {
        placeId: normalizeObjectId(req.body.pickupLocation.placeId),
        place: normalizeString(req.body.pickupLocation.place),
        latitude: normalizeString(req.body.pickupLocation.latitude),
        longitude: normalizeString(req.body.pickupLocation.longitude)
      };

      // If we have an address but no coordinates, geocode it
      if (pickupLocationData.place && !pickupLocationData.latitude && !pickupLocationData.longitude) {
        try {
          console.log(`🌍 Geocoding pickup location: ${pickupLocationData.place}`);
          const coords = await getCoordinatesFromAddress(pickupLocationData.place);
          if (coords && coords.latitude && coords.longitude) {
            pickupLocationData.latitude = String(coords.latitude);
            pickupLocationData.longitude = String(coords.longitude);
            console.log(`✅ Geocoded pickup location: (${pickupLocationData.latitude}, ${pickupLocationData.longitude})`);
          } else {
            console.warn(`⚠️ Could not geocode pickup location: ${pickupLocationData.place}`);
          }
        } catch (geocodeError) {
          console.error(`❌ Error geocoding pickup location: ${geocodeError.message}`);
        }
      }
    }

    // Build delivery location data
    let deliveryLocationData = {
      placeId: null,
      place: '',
      latitude: '',
      longitude: ''
    };

    if (req.body.deliveryLocation?.placeId) {
      const place = await Place.findById(req.body.deliveryLocation.placeId);
      if (place && place.currentLocation) {
        deliveryLocationData = {
          placeId: place._id,
          place: place.currentLocation.address || place.name || '',
          latitude: String(place.currentLocation.latitude || ''),
          longitude: String(place.currentLocation.longitude || '')
        };
      }
    } else if (req.body.deliveryLocation) {
      deliveryLocationData = {
        placeId: normalizeObjectId(req.body.deliveryLocation.placeId),
        place: normalizeString(req.body.deliveryLocation.place),
        latitude: normalizeString(req.body.deliveryLocation.latitude),
        longitude: normalizeString(req.body.deliveryLocation.longitude)
      };

      // If we have an address but no coordinates, geocode it
      if (deliveryLocationData.place && !deliveryLocationData.latitude && !deliveryLocationData.longitude) {
        try {
          console.log(`🌍 Geocoding delivery location: ${deliveryLocationData.place}`);
          const coords = await getCoordinatesFromAddress(deliveryLocationData.place);
          if (coords && coords.latitude && coords.longitude) {
            deliveryLocationData.latitude = String(coords.latitude);
            deliveryLocationData.longitude = String(coords.longitude);
            console.log(`✅ Geocoded delivery location: (${deliveryLocationData.latitude}, ${deliveryLocationData.longitude})`);
          } else {
            console.warn(`⚠️ Could not geocode delivery location: ${deliveryLocationData.place}`);
          }
        } catch (geocodeError) {
          console.error(`❌ Error geocoding delivery location: ${geocodeError.message}`);
        }
      }
    }

    // Calculate distance if we have coordinates for both locations
    let calculatedDistance = 0;
    if (pickupLocationData.latitude && pickupLocationData.longitude &&
      deliveryLocationData.latitude && deliveryLocationData.longitude) {
      try {
        const origin = {
          latitude: parseFloat(pickupLocationData.latitude),
          longitude: parseFloat(pickupLocationData.longitude)
        };
        const destination = {
          latitude: parseFloat(deliveryLocationData.latitude),
          longitude: parseFloat(deliveryLocationData.longitude)
        };

        console.log(`📏 Calculating distance between pickup and delivery locations...`);
        const routeDistance = await getRouteDistance(origin, destination);
        if (routeDistance !== null && routeDistance > 0) {
          calculatedDistance = routeDistance;
          console.log(`✅ Calculated distance: ${calculatedDistance.toFixed(2)} km`);
        } else {
          // Fallback to haversine if Google Maps fails
          const { haversineDistance } = await import("../utils/distance.js");
          calculatedDistance = haversineDistance(
            origin.latitude,
            origin.longitude,
            destination.latitude,
            destination.longitude
          );
          console.log(`⚠️ Using haversine distance: ${calculatedDistance.toFixed(2)} km`);
        }
      } catch (distanceError) {
        console.error(`❌ Error calculating distance: ${distanceError.message}`);
      }
    }

    // Parse dates
    const pickupDate = req.body.pickupDate ? new Date(req.body.pickupDate) : null;
    const deliveryDate = req.body.deliveryDate ? new Date(req.body.deliveryDate) : null;

    // Build order data
    const orderData = {
      customerOrderNo: normalizeString(req.body.customerOrderNo),
      tripNo: normalizeString(req.body.tripNo),
      orderType: normalizeString(req.body.orderType) || 'Regular',
      freightOn: normalizeString(req.body.freightOn) || 'Order',
      salesman: normalizeString(req.body.salesman),
      orderNotes: normalizeString(req.body.orderNotes),
      customer: normalizeObjectId(req.body.customer),
      pickupLocation: pickupLocationData,
      pickupDate: pickupDate,
      pickupTime: normalizeString(req.body.pickupTime),
      pickupAppointment: normalizeBoolean(req.body.pickupAppointment),
      pickupRefNo: normalizeString(req.body.pickupRefNo),
      pickupNote: normalizeString(req.body.pickupNote),
      pickupSkids: normalizeString(req.body.pickupSkids),
      pickupCases: normalizeString(req.body.pickupCases),
      deliveryLocation: deliveryLocationData,
      deliveryDate: deliveryDate,
      deliveryTime: normalizeString(req.body.deliveryTime),
      deliveryAppointment: normalizeBoolean(req.body.deliveryAppointment),
      deliveryRefNo: normalizeString(req.body.deliveryRefNo),
      deliveryNote: normalizeString(req.body.deliveryNote),
      deliverySkids: normalizeString(req.body.deliverySkids),
      deliveryCases: normalizeString(req.body.deliveryCases),
      dropOffNotes: normalizeString(req.body.dropOffNotes),
      dropOffNumber: normalizeString(req.body.dropOffNumber),
      commodity: normalizeString(req.body.commodity),
      valueOfGoods: normalizeNumber(req.body.valueOfGoods),
      valueOfGoodsCurrency: normalizeString(req.body.valueOfGoodsCurrency) || 'CAD',
      equipment: Array.isArray(req.body.equipment) ? req.body.equipment : [],
      noOfPackages: normalizeNumber(req.body.noOfPackages),
      noOfPackagesType: normalizeString(req.body.noOfPackagesType),
      weight: normalizeNumber(req.body.weight),
      weightUnit: normalizeString(req.body.weightUnit) || 'kg',
      temperature: req.body.temperature ? normalizeNumber(req.body.temperature) : null,
      temperatureUnit: normalizeString(req.body.temperatureUnit) || 'Celsius',
      weatherConditions: {
        snow: normalizeBoolean(req.body.weatherConditions?.snow) || false,
        highTemperature: normalizeBoolean(req.body.weatherConditions?.highTemperature) || false
      },
      dimensions: {
        length: normalizeNumber(req.body.dimensions?.length),
        width: normalizeNumber(req.body.dimensions?.width),
        height: normalizeNumber(req.body.dimensions?.height),
        unit: normalizeString(req.body.dimensions?.unit) || 'cm'
      },
      distance: calculatedDistance > 0 ? calculatedDistance : normalizeNumber(req.body.distance),
      additionalInfo: {
        CSA: normalizeBoolean(req.body.additionalInfo?.CSA),
        CTPAT: normalizeBoolean(req.body.additionalInfo?.CTPAT),
        PIP: normalizeBoolean(req.body.additionalInfo?.PIP),
        HAZMAT: normalizeBoolean(req.body.additionalInfo?.HAZMAT),
        TARP: normalizeBoolean(req.body.additionalInfo?.TARP),
        OverDimension: normalizeBoolean(req.body.additionalInfo?.OverDimension)
      },
      status: normalizeOrderStatus(req.body.status) || 'quoted',
      accountingStatus: normalizeString(req.body.accountingStatus) || 'pending',
      totalAmount: normalizeNumber(req.body.totalAmount),
      currency: normalizeString(req.body.currency) || 'CAD',
      driver: normalizeObjectId(req.body.driver),
      coDriver: normalizeObjectId(req.body.coDriver),
      truck: normalizeObjectId(req.body.truck),
      trailer: normalizeObjectId(req.body.trailer),
      company: companyId || null,
      // New fields from UI
      shipper: req.body.shipper ? {
        name: normalizeString(req.body.shipper.name),
        phone: normalizeString(req.body.shipper.phone),
        email: normalizeString(req.body.shipper.email),
        address: normalizeString(req.body.shipper.address),
        unit: normalizeString(req.body.shipper.unit),
        country: normalizeString(req.body.shipper.country),
        province: normalizeString(req.body.shipper.province),
        city: normalizeString(req.body.shipper.city),
        postalCode: normalizeString(req.body.shipper.postalCode),
        primaryPhone: normalizeString(req.body.shipper.primaryPhone),
        secondaryPhone: normalizeString(req.body.shipper.secondaryPhone),
        contact: normalizeString(req.body.shipper.contact),
        store: normalizeString(req.body.shipper.store),
        type: normalizeString(req.body.shipper.type || 'DELIVERY')
      } : undefined,
      receiver: req.body.receiver ? {
        name: normalizeString(req.body.receiver.name),
        phone: normalizeString(req.body.receiver.phone),
        address: normalizeString(req.body.receiver.address),
        contact: normalizeString(req.body.receiver.contact)
      } : undefined,
      receiverStops: Array.isArray(req.body.receiverStops) ? req.body.receiverStops : [],
      stops: Array.isArray(req.body.stops) ? req.body.stops : [],
      pickupAppointmentDetails: req.body.pickupAppointmentDetails ? {
        type: normalizeString(req.body.pickupAppointmentDetails.type) || 'FCFS',
        date: req.body.pickupAppointmentDetails.date ? new Date(req.body.pickupAppointmentDetails.date) : null,
        time: normalizeString(req.body.pickupAppointmentDetails.time),
        startDate: req.body.pickupAppointmentDetails.startDate ? new Date(req.body.pickupAppointmentDetails.startDate) : null,
        startTime: normalizeString(req.body.pickupAppointmentDetails.startTime),
        endDate: req.body.pickupAppointmentDetails.endDate ? new Date(req.body.pickupAppointmentDetails.endDate) : null,
        endTime: normalizeString(req.body.pickupAppointmentDetails.endTime),
        specialInstructions: normalizeString(req.body.pickupAppointmentDetails.specialInstructions),
        gatePass: normalizeString(req.body.pickupAppointmentDetails.gatePass)
      } : undefined,
      deliveryAppointmentDetails: req.body.deliveryAppointmentDetails ? {
        type: normalizeString(req.body.deliveryAppointmentDetails.type) || 'Window',
        date: req.body.deliveryAppointmentDetails.date ? new Date(req.body.deliveryAppointmentDetails.date) : null,
        time: normalizeString(req.body.deliveryAppointmentDetails.time),
        startDate: req.body.deliveryAppointmentDetails.startDate ? new Date(req.body.deliveryAppointmentDetails.startDate) : null,
        startTime: normalizeString(req.body.deliveryAppointmentDetails.startTime),
        endDate: req.body.deliveryAppointmentDetails.endDate ? new Date(req.body.deliveryAppointmentDetails.endDate) : null,
        endTime: normalizeString(req.body.deliveryAppointmentDetails.endTime),
        unloadingInstructions: normalizeString(req.body.deliveryAppointmentDetails.unloadingInstructions)
      } : undefined,
      // Customer information fields
      customerUnit: normalizeString(req.body.customerUnit),
      customerAddress: normalizeString(req.body.customerAddress), // Will be auto-filled from customer if not provided
      customerCity: normalizeString(req.body.customerCity), // Will be auto-filled from customer if not provided
      customerCountry: normalizeString(req.body.customerCountry), // Will be auto-filled from customer if not provided
      customerProvince: normalizeString(req.body.customerProvince), // Will be auto-filled from customer if not provided
      customerPostalCode: normalizeString(req.body.customerPostalCode),
      customerPrimaryPhone: normalizeString(req.body.customerPrimaryPhone),
      customerSecondaryPhone: normalizeString(req.body.customerSecondaryPhone),
      customerContact: normalizeString(req.body.customerContact),
      payableEmail: normalizeString(req.body.payableEmail),
      secondaryPayableEmail: normalizeString(req.body.secondaryPayableEmail),
      // Billing information
      billingDate: req.body.billingDate ? new Date(req.body.billingDate) : null,
      rate: normalizeNumber(req.body.rate),
      rateCurrency: normalizeString(req.body.rateCurrency) || 'CAD',
      dispatcher: normalizeString(req.body.dispatcher),
      dispatcherEmail: normalizeString(req.body.dispatcherEmail),
      bookedForCarrier: normalizeBoolean(req.body.bookedForCarrier),
      sendToFactor: normalizeBoolean(req.body.sendToFactor),
      // Tax configuration
      taxCode: normalizeString(req.body.taxCode) || 'No Tax',
      taxAmount: normalizeNumber(req.body.taxAmount),
      // Customs information
      pars: normalizeString(req.body.pars),
      paps: normalizeString(req.body.paps),
      trailerSealNo: normalizeString(req.body.trailerSealNo),
      // Additional checkboxes
      csaFastApproved: normalizeBoolean(req.body.csaFastApproved),
      bondedShipmentCA: normalizeBoolean(req.body.bondedShipmentCA),
      bondedShipmentUS: normalizeBoolean(req.body.bondedShipmentUS),
      highPriority: normalizeBoolean(req.body.highPriority),
      cityDriver: normalizeBoolean(req.body.cityDriver),
      teamLoad: normalizeBoolean(req.body.teamLoad),
      roundTrip: normalizeBoolean(req.body.roundTrip),
      oversized: normalizeBoolean(req.body.oversized),
      empty: normalizeBoolean(req.body.empty),
      // Other charges
      otherCharges: Array.isArray(req.body.otherCharges) ? req.body.otherCharges : [],
      // Invoice notes
      invoiceInstructions: normalizeString(req.body.invoiceInstructions),
      invoiceNotes: normalizeString(req.body.invoiceNotes),
      borderInfo: req.body.borderInfo ? {
        detailsRequired: normalizeBoolean(req.body.borderInfo.detailsRequired),
        direction: normalizeString(req.body.borderInfo.direction) || 'CA_TO_US',
        portOfEntry: normalizeString(req.body.borderInfo.portOfEntry),
        cargoDescription: normalizeString(req.body.borderInfo.cargoDescription),
        hsCode: normalizeString(req.body.borderInfo.hsCode),
        brokerName: normalizeString(req.body.borderInfo.brokerName),
        brokerPhone: normalizeString(req.body.borderInfo.brokerPhone),
        brokerEmail: normalizeString(req.body.borderInfo.brokerEmail),
        commercialValue: normalizeString(req.body.borderInfo.commercialValue),
        countryOfOrigin: normalizeString(req.body.borderInfo.countryOfOrigin)
      } : {
        detailsRequired: false,
        direction: 'CA_TO_US',
        portOfEntry: '',
        cargoDescription: '',
        hsCode: '',
        brokerName: '',
        brokerPhone: '',
        brokerEmail: '',
        commercialValue: '',
        countryOfOrigin: ''
      },
      documents: {
        bol: documentUrls.bol || req.body.documents?.bol || null,
        pod: documentUrls.pod || req.body.documents?.pod || null,
        customsHazmat: documentUrls.customsHazmat && documentUrls.customsHazmat.length > 0
          ? documentUrls.customsHazmat
          : (Array.isArray(req.body.documents?.customsHazmat) ? req.body.documents.customsHazmat : []),
        rateConfirmation: documentUrls.rateConfirmation || req.body.documents?.rateConfirmation || null,
        stampedManifest: documentUrls.stampedManifest || req.body.documents?.stampedManifest || null,
        loadSecurement: documentUrls.loadSecurement && documentUrls.loadSecurement.length > 0
          ? documentUrls.loadSecurement
          : (Array.isArray(req.body.documents?.loadSecurement) ? req.body.documents.loadSecurement : []),
        printedManifest: documentUrls.printedManifest || req.body.documents?.printedManifest || null
      },
      internalNotes: normalizeString(req.body.internalNotes),
      customerNotes: normalizeString(req.body.customerNotes),
      notes: Array.isArray(req.body.notes) ? req.body.notes : []
    };

    // Process attachment files and update attachments array with URLs
    let processedAttachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
    if (files.attachment && Array.isArray(files.attachment)) {
      // Match uploaded files with attachment entries
      files.attachment.forEach((file, index) => {
        const attachmentName = req.body[`attachmentName_${index}`] || file.originalname;
        const payable = req.body[`attachmentPayable_${index}`] === 'true';
        const shareWithDriver = req.body[`attachmentShareWithDriver_${index}`] === 'true';
        const fileUrl = getFileUrl(file);

        // Find existing attachment or create new one
        const existingAttachment = processedAttachments.find((att) => att.name === attachmentName);
        if (existingAttachment) {
          existingAttachment.url = fileUrl;
          existingAttachment.fileSize = file.size || existingAttachment.fileSize || 0;
        } else {
          processedAttachments.push({
            id: Date.now() + index,
            name: attachmentName,
            url: fileUrl,
            fileSize: file.size || 0,
            payable: payable,
            shareWithDriver: shareWithDriver
          });
        }
      });
    }
    orderData.attachments = processedAttachments;

    // Validation
    if (!orderData.customer) {
      return res.status(400).json({
        success: false,
        message: "Customer is required"
      });
    }

    // Fetch customer to extract address fields for storing on order
    const { User } = await import("../models/driver/userModel.js");
    const customer = await User.findById(orderData.customer);
    if (customer) {
      // Extract customer address fields from customer object or customerDetails
      const customerAddress = customer.customerDetails?.address || customer.address || '';
      const customerCity = customer.customerDetails?.city || customer.city || '';
      const customerCountry = customer.customerDetails?.country || customer.country || '';
      const customerProvince = customer.customerDetails?.stateProvince || customer.customerDetails?.state || customer.state || '';

      // Store on order if not already provided in request body
      if (!orderData.customerAddress && customerAddress) orderData.customerAddress = customerAddress;
      if (!orderData.customerCity && customerCity) orderData.customerCity = customerCity;
      if (!orderData.customerCountry && customerCountry) orderData.customerCountry = customerCountry;
      if (!orderData.customerProvince && customerProvince) orderData.customerProvince = customerProvince;
    }

    const order = new Order(orderData);
    await order.save();

    // Update trailer dispatch information if trailer is assigned
    if (order.trailer) {
      try {
        const trailerUpdateData = {
          lastDispatch: order.orderNumber || order._id.toString(),
          lastDispatchDate: order.orderDate || new Date(),
        };

        // Add drop location if delivery location exists
        if (order.deliveryLocation?.place) {
          trailerUpdateData.lastDropLocation = order.deliveryLocation.place;
        } else if (order.receiver?.address) {
          trailerUpdateData.lastDropLocation = order.receiver.address;
        }

        await Trailer.findByIdAndUpdate(order.trailer, trailerUpdateData);
        console.log('🚛 [TRAILER UPDATE] Trailer dispatch info updated:', {
          trailerId: order.trailer,
          lastDispatch: trailerUpdateData.lastDispatch,
          lastDispatchDate: trailerUpdateData.lastDispatchDate,
          lastDropLocation: trailerUpdateData.lastDropLocation
        });
      } catch (trailerError) {
        console.error('🚛 [TRAILER UPDATE] Error updating trailer dispatch info:', trailerError);
        // Don't fail the order creation if trailer update fails
      }
    }

    // Populate references
    await order.populate({
      path: 'customer',
      select: 'name email phone address city state country customerDetails'
    });
    await order.populate('pickupLocation.placeId', 'name currentLocation');
    await order.populate('deliveryLocation.placeId', 'name currentLocation');

    // ✅ Send assignment emails to drivers if assigned during order creation
    const emailsSent = []; // Track all emails sent for debugging
    
    if (order.driver || order.coDriver) {
      try {
        // Populate driver and truck information for emails
        await order.populate([
          { path: 'driver', select: 'name email phone' },
          { path: 'coDriver', select: 'name email phone' },
          { path: 'truck', select: 'plateNumber internalId' },
          { path: 'trailer', select: 'plateNumber trailerNumber' }
        ]);

        console.log('📋 [ORDER CREATE] Email Debug - Driver/CoDriver Assignment:', {
          driverId: order.driver?._id?.toString() || 'NOT ASSIGNED',
          driverEmail: order.driver?.email || 'NO EMAIL',
          driverName: order.driver?.name || 'NO NAME',
          coDriverId: order.coDriver?._id?.toString() || 'NOT ASSIGNED',
          coDriverEmail: order.coDriver?.email || 'NO EMAIL',
          coDriverName: order.coDriver?.name || 'NO NAME',
          areSamePerson: order.driver?._id?.toString() === order.coDriver?._id?.toString() ? 'YES' : 'NO',
          orderId: order._id.toString(),
          orderNumber: order.customerOrderNo || order.orderNumber
        });

        // Prepare order details for email
        const orderDetailsForEmail = {
          pickupAddress: order.pickupLocation?.place || order.shipper?.address || 'Not specified',
          dropoffAddress: order.deliveryLocation?.place || order.receiver?.address || 'Not specified',
          customerName: order.customer?.name || 'Customer',
          vehiclePlate: order.truck?.plateNumber || order.truck?.internalId || 'Not assigned',
          assignedAt: order.assignedAt || new Date()
        };

        // Send email to driver if assigned
        // Note: If the same person is assigned as both driver and co-driver, they will receive 2 separate emails
        if (order.driver && order.driver.email) {
          try {
            const isSameAsCoDriver = order.driver._id?.toString() === order.coDriver?._id?.toString();
            console.log('📧 [ORDER CREATE] ═══ SENDING EMAIL #1 - DRIVER ASSIGNMENT ═══');
            console.log('📧 [ORDER CREATE] Email Details:', {
              TO: order.driver.email,
              NAME: order.driver.name || 'Driver',
              ROLE: 'Driver',
              DRIVER_ID: order.driver._id?.toString(),
              ORDER_ID: order._id.toString(),
              ORDER_NUMBER: order.customerOrderNo || order.orderNumber,
              IS_ALSO_CO_DRIVER: isSameAsCoDriver ? 'YES (will receive 2 emails)' : 'NO'
            });

            const assignmentResult = await sendLoadAssignmentEmail({
              driverEmail: order.driver.email,
              driverName: order.driver.name || 'Driver',
              loadId: order._id.toString(),
              loadInternalId: order.customerOrderNo || order.orderNumber,
              loadDetails: orderDetailsForEmail
            });

            if (assignmentResult.success) {
              console.log('✅ [ORDER CREATE] ✓✓✓ EMAIL SENT SUCCESSFULLY ✓✓✓');
              console.log('✅ [ORDER CREATE] Sent to:', order.driver.email);
              emailsSent.push({ email: order.driver.email, role: 'Driver', status: 'SUCCESS' });
            } else {
              console.error('❌ [ORDER CREATE] ✗✗✗ EMAIL FAILED ✗✗✗');
              console.error('❌ [ORDER CREATE] Failed to send to:', order.driver.email);
              console.error('❌ [ORDER CREATE] Error:', assignmentResult.message || assignmentResult.error);
              emailsSent.push({ email: order.driver.email, role: 'Driver', status: 'FAILED', error: assignmentResult.message || assignmentResult.error });
            }
          } catch (driverEmailError) {
            console.error('❌ [ORDER CREATE] Exception sending email to driver:', driverEmailError);
            emailsSent.push({ email: order.driver?.email || 'UNKNOWN', role: 'Driver', status: 'EXCEPTION', error: driverEmailError.message });
            // Don't fail the order creation if email fails
          }
        } else {
          console.warn('⚠️ [ORDER CREATE] Driver assigned but no email found:', {
            driverId: order.driver?._id?.toString(),
            hasDriver: !!order.driver,
            hasEmail: !!order.driver?.email
          });
        }

        // Send email to co-driver if assigned
        // Note: Even if same person as driver, they will receive a separate email for co-driver role
        if (order.coDriver && order.coDriver.email) {
          try {
            const isSameAsDriver = order.coDriver._id?.toString() === order.driver?._id?.toString();
            console.log('📧 [ORDER CREATE] ═══ SENDING EMAIL #2 - CO-DRIVER ASSIGNMENT ═══');
            console.log('📧 [ORDER CREATE] Email Details:', {
              TO: order.coDriver.email,
              NAME: order.coDriver.name || 'Co-Driver',
              ROLE: 'Co-Driver',
              CO_DRIVER_ID: order.coDriver._id?.toString(),
              ORDER_ID: order._id.toString(),
              ORDER_NUMBER: order.customerOrderNo || order.orderNumber,
              IS_ALSO_DRIVER: isSameAsDriver ? 'YES (will receive 2 emails total)' : 'NO'
            });

            const assignmentResult = await sendLoadAssignmentEmail({
              driverEmail: order.coDriver.email,
              driverName: order.coDriver.name || 'Co-Driver',
              loadId: order._id.toString(),
              loadInternalId: order.customerOrderNo || order.orderNumber,
              loadDetails: orderDetailsForEmail
            });

            if (assignmentResult.success) {
              console.log('✅ [ORDER CREATE] ✓✓✓ EMAIL SENT SUCCESSFULLY ✓✓✓');
              console.log('✅ [ORDER CREATE] Sent to:', order.coDriver.email);
              emailsSent.push({ email: order.coDriver.email, role: 'Co-Driver', status: 'SUCCESS' });
            } else {
              console.error('❌ [ORDER CREATE] ✗✗✗ EMAIL FAILED ✗✗✗');
              console.error('❌ [ORDER CREATE] Failed to send to:', order.coDriver.email);
              console.error('❌ [ORDER CREATE] Error:', assignmentResult.message || assignmentResult.error);
              emailsSent.push({ email: order.coDriver.email, role: 'Co-Driver', status: 'FAILED', error: assignmentResult.message || assignmentResult.error });
            }
          } catch (coDriverEmailError) {
            console.error('❌ [ORDER CREATE] Exception sending email to co-driver:', coDriverEmailError);
            emailsSent.push({ email: order.coDriver?.email || 'UNKNOWN', role: 'Co-Driver', status: 'EXCEPTION', error: coDriverEmailError.message });
            // Don't fail the order creation if email fails
          }
        } else if (order.coDriver) {
          console.warn('⚠️ [ORDER CREATE] Co-driver assigned but no email found:', {
            coDriverId: order.coDriver._id?.toString(),
            hasCoDriver: !!order.coDriver,
            hasEmail: !!order.coDriver?.email
          });
        }

        // Final summary of all emails sent
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('📊 [ORDER CREATE] EMAIL SUMMARY - ALL EMAILS SENT:');
        console.log('═══════════════════════════════════════════════════════════════');
        if (emailsSent.length === 0) {
          console.log('   No emails were sent.');
        } else {
          emailsSent.forEach((emailInfo, index) => {
            console.log(`   ${index + 1}. ${emailInfo.email} (${emailInfo.role}) - ${emailInfo.status}`);
            if (emailInfo.error) {
              console.log(`      Error: ${emailInfo.error}`);
            }
          });
        }
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`📊 Total emails sent: ${emailsSent.filter(e => e.status === 'SUCCESS').length}`);
        console.log(`📊 Total emails failed: ${emailsSent.filter(e => e.status !== 'SUCCESS').length}`);
        console.log('═══════════════════════════════════════════════════════════════');

      } catch (emailError) {
        console.error('❌ [ORDER CREATE] Error processing assignment emails:', emailError);
        // Don't fail the order creation if email processing fails
      }

      // Send push notification to driver + save ActivityLog entry
      try {
        if (order.driver?._id) {
          const driverDoc = await User.findById(order.driver._id).select('expoPushToken').lean();
          const pickupAddr = order.pickupLocation?.place || 'Unknown pickup';
          const deliveryAddr = order.deliveryLocation?.place || 'Unknown delivery';
          const orderLabel = order.customerOrderNo || order.orderNumber;
          const logSummary = `Order #${orderLabel} assigned — ${pickupAddr} → ${deliveryAddr}`;

          if (driverDoc?.expoPushToken) {
            await sendPushToDriver(
              driverDoc.expoPushToken,
              'New Order Assigned',
              `Order #${orderLabel} — ${pickupAddr} → ${deliveryAddr}`,
              { type: 'trip_assigned', orderId: order._id.toString(), orderNumber: order.orderNumber, channelId: 'logistiq-trips' }
            );
            console.log(`🔔 [ORDER CREATE] Push sent to driver ${order.driver._id}`);
          } else {
            console.warn(`⚠️ [ORDER CREATE] Driver ${order.driver._id} has no push token`);
          }
          // Save to ActivityLog regardless of push token
          await ActivityLog.create({ action: 'New Order Assigned', driver: order.driver._id, changeSummary: logSummary });
        }
      } catch (pushError) {
        console.error('❌ [ORDER CREATE] Push/log failed:', pushError.message);
      }
    } else {
      console.log('ℹ️ [ORDER CREATE] No driver or co-driver assigned, skipping email notifications');
    }

    // Warn if coordinates or distance are missing
    const hasCoordinates = (pickupLocationData.latitude && pickupLocationData.longitude) &&
      (deliveryLocationData.latitude && deliveryLocationData.longitude);
    const hasDistance = calculatedDistance > 0 || orderData.distance > 0;

    let message = "Order created successfully";
    if (!hasCoordinates) {
      message += ". Note: Coordinates could not be geocoded. Please enable Google Maps Geocoding API or provide coordinates manually.";
    }
    if (!hasDistance) {
      message += " Distance was not calculated. This may affect driver payroll calculations.";
    }

    // Include validation results in response if available
    const responseData = {
      success: true,
      message: message,
      data: order,
      warnings: {
        coordinatesGeocoded: hasCoordinates,
        distanceCalculated: hasDistance
      }
    };

    // ALWAYS include validation results if validation was performed
    if (validationResult) {
      console.log('📋 [ORDER CREATE] Including validation results in response:', {
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

      // Add validation warnings to message if any
      if (validationResult.warnings.length > 0) {
        responseData.message += ` Document validation completed with ${validationResult.warnings.length} warning(s).`;
      }
      if (validationResult.missing.length > 0) {
        responseData.message += ` ${validationResult.missing.length} required document(s) missing.`;
      }
    }

    res.status(201).json(responseData);
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get All Orders
export const getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, orderType, accountingStatus, loadBoard } = req.query;

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.status(200).json({
        success: true,
        message: "No company assigned to the current admin.",
        data: [],
        count: 0,
        pagination: {
          current: parseInt(page),
          pages: 0,
          total: 0,
          limit: parseInt(limit)
        }
      });
    }

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter) || {};

    // Build query
    const query = { ...baseFilter };

    // Add search filter
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { customerOrderNo: { $regex: search, $options: 'i' } },
        { tripNo: { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter (supports single status or comma-separated multiple statuses)
    if (status) {
      const statusArray = status.split(',').map(s => s.trim()).filter(s => s);
      if (statusArray.length === 1) {
        query.status = statusArray[0];
      } else if (statusArray.length > 1) {
        query.status = { $in: statusArray };
      }
    }

    // Add order type filter
    if (orderType) {
      query.orderType = orderType;
    }

    // Add accounting status filter
    if (accountingStatus) {
      query.accountingStatus = accountingStatus;
    }

    // Load board view filters (server-side, so pagination works correctly)
    let sortOrder = { createdAt: -1 };
    if (loadBoard) {
      switch (loadBoard) {
        case 'HISTORICAL':
          query.status = { $in: ['completed', 'delivered', 'canceled', 'cancelled'] };
          break;
        case 'INBOUND':
          query['borderInfo.direction'] = 'US_TO_CA';
          break;
        case 'OUTBOUND':
          query['borderInfo.direction'] = 'CA_TO_US';
          break;
        case 'TO/FROM YARD':
          query.$or = [
            { 'pickupLocation.place': { $regex: 'yard', $options: 'i' } },
            { 'deliveryLocation.place': { $regex: 'yard', $options: 'i' } }
          ];
          break;
        case 'CITY':
          sortOrder = { 'pickupLocation.place': 1 };
          break;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await Order.find(query)
      .populate({
        path: 'customer',
        select: 'name email phone address city state country customerDetails'
      })
      .populate('pickupLocation.placeId', 'name currentLocation')
      .populate('deliveryLocation.placeId', 'name currentLocation')
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'plateNumber internalId unitNumber make model')
      .populate('trailer', 'plateNumber trailer unitNumber internalId')
      .sort(sortOrder)
      .skip(skip)
      .limit(parseInt(limit));

    // Get all unique trip numbers from orders
    const tripNumbers = [...new Set(orders.map(order => order.tripNo).filter(Boolean))];

    // Fetch trips with driver, truck, and trailer populated
    let tripsMap = {};
    if (tripNumbers.length > 0) {
      const trips = await Trip.find({ tripNumber: { $in: tripNumbers } })
        .populate('driver', 'name email phone')
        .populate('truck', 'plateNumber internalId unitNumber make model')
        .populate('trailer', 'plateNumber trailer unitNumber internalId');

      // Create a map of tripNumber -> trip for quick lookup
      trips.forEach(trip => {
        tripsMap[trip.tripNumber] = trip;
      });
    }

    // Helper function to enhance vehicle/trailer data with aliases for frontend compatibility
    const enhanceVehicleData = (vehicle) => {
      if (!vehicle) return null;
      const vehicleObj = typeof vehicle.toObject === 'function' ? vehicle.toObject() : vehicle;
      // Add aliases for frontend compatibility
      return {
        ...vehicleObj,
        licensePlate: vehicleObj.plateNumber || vehicleObj.unitNumber || vehicleObj.internalId || '',
        unitNo: vehicleObj.unitNumber || vehicleObj.internalId || '',
        unitNumber: vehicleObj.unitNumber || vehicleObj.internalId || ''
      };
    };

    const enhanceTrailerData = (trailer) => {
      if (!trailer) return null;
      const trailerObj = typeof trailer.toObject === 'function' ? trailer.toObject() : trailer;
      // Add aliases for frontend compatibility
      return {
        ...trailerObj,
        licensePlate: trailerObj.plateNumber || trailerObj.trailer || trailerObj.unitNumber || '',
        unitNo: trailerObj.unitNumber || trailerObj.trailer || trailerObj.internalId || '',
        trailerNumber: trailerObj.trailer || trailerObj.unitNumber || trailerObj.plateNumber || ''
      };
    };

    // Attach trip information (driver, truck, trailer) to each order
    const ordersWithTripInfo = orders.map(order => {
      const orderObj = order.toObject();

      // If order has tripNo, get data from trip (trip assignment takes priority)
      if (order.tripNo && tripsMap[order.tripNo]) {
        const trip = tripsMap[order.tripNo];
        orderObj.driver = trip.driver || orderObj.driver || null;
        orderObj.truck = trip.truck ? enhanceVehicleData(trip.truck) : (orderObj.truck ? enhanceVehicleData(orderObj.truck) : null);
        orderObj.trailer = trip.trailer ? enhanceTrailerData(trip.trailer) : (orderObj.trailer ? enhanceTrailerData(orderObj.trailer) : null);
        orderObj.tripStatus = trip.status || orderObj.tripStatus || null;
      } else {
        // Enhance vehicle and trailer data from order directly
        orderObj.truck = orderObj.truck ? enhanceVehicleData(orderObj.truck) : null;
        orderObj.trailer = orderObj.trailer ? enhanceTrailerData(orderObj.trailer) : null;
      }

      // Enhance driver data (if present)
      if (orderObj.driver && typeof orderObj.driver === 'object') {
        orderObj.driver = typeof orderObj.driver.toObject === 'function' ? orderObj.driver.toObject() : orderObj.driver;
      }

      // Ensure driver, truck, trailer are null if not set (for consistent response)
      if (!orderObj.driver) orderObj.driver = null;
      if (!orderObj.truck) orderObj.truck = null;
      if (!orderObj.trailer) orderObj.trailer = null;

      // Ensure customs information and other charges fields are always present
      if (!orderObj.borderInfo) {
        orderObj.borderInfo = {
          detailsRequired: false,
          direction: 'CA_TO_US',
          portOfEntry: '',
          cargoDescription: '',
          hsCode: '',
          brokerName: '',
          brokerPhone: '',
          brokerEmail: '',
          commercialValue: '',
          countryOfOrigin: ''
        };
      }

      // Ensure customs fields are always present
      if (orderObj.pars === undefined) orderObj.pars = '';
      if (orderObj.paps === undefined) orderObj.paps = '';
      if (orderObj.trailerSealNo === undefined) orderObj.trailerSealNo = '';

      // Ensure otherCharges is always an array
      if (!Array.isArray(orderObj.otherCharges)) {
        orderObj.otherCharges = [];
      }

      // Ensure notes is always an array
      if (!Array.isArray(orderObj.notes)) {
        orderObj.notes = [];
      }

      // Ensure attachments is always an array
      if (!Array.isArray(orderObj.attachments)) {
        orderObj.attachments = [];
      }

      // Log attachment count for debugging
      if (orderObj.attachments && orderObj.attachments.length > 0) {
        console.log(`📎 Order ${orderObj.orderNumber || orderObj._id} has ${orderObj.attachments.length} attachments`);
      }

      return orderObj;
    });

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: ordersWithTripInfo,
      count: ordersWithTripInfo.length,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total: total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get All Orders Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Order by ID
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let query = { _id: id };
    if (!isSuperadmin && userCompanyId) {
      query.company = userCompanyId;
    }

    const order = await Order.findOne(query)
      .populate({
        path: 'customer',
        select: 'name email phone address city state country customerDetails'
      })
      .populate('pickupLocation.placeId', 'name currentLocation')
      .populate('deliveryLocation.placeId', 'name currentLocation')
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'plateNumber internalId unitNumber make model')
      .populate('trailer', 'plateNumber trailer unitNumber internalId')
      .populate('documentsApprovedBy', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    console.log('📄 getOrderById - Order ID:', id);
    console.log('📎 getOrderById - Attachments:', order.attachments);
    console.log('📎 getOrderById - Attachments count:', order.attachments?.length || 0);
    console.log('📋 getOrderById - Document Verification:', order.documentVerification);

    // Helper function to enhance vehicle/trailer data with aliases for frontend compatibility
    const enhanceVehicleData = (vehicle) => {
      if (!vehicle) return null;
      const vehicleObj = typeof vehicle.toObject === 'function' ? vehicle.toObject() : vehicle;
      // Add aliases for frontend compatibility
      return {
        ...vehicleObj,
        licensePlate: vehicleObj.plateNumber || vehicleObj.unitNumber || vehicleObj.internalId || '',
        unitNo: vehicleObj.unitNumber || vehicleObj.internalId || '',
        unitNumber: vehicleObj.unitNumber || vehicleObj.internalId || ''
      };
    };

    const enhanceTrailerData = (trailer) => {
      if (!trailer) return null;
      const trailerObj = typeof trailer.toObject === 'function' ? trailer.toObject() : trailer;
      // Add aliases for frontend compatibility
      return {
        ...trailerObj,
        licensePlate: trailerObj.plateNumber || trailerObj.trailer || trailerObj.unitNumber || '',
        unitNo: trailerObj.unitNumber || trailerObj.trailer || trailerObj.internalId || '',
        trailerNumber: trailerObj.trailer || trailerObj.unitNumber || trailerObj.plateNumber || ''
      };
    };

    // If order has a tripNo, populate driver/truck/trailer from trip (trip takes priority)
    const orderObj = order.toObject();
    if (order.tripNo) {
      const trip = await Trip.findOne({ tripNumber: order.tripNo })
        .populate('driver', 'name email phone')
        .populate('truck', 'plateNumber internalId unitNumber make model')
        .populate('trailer', 'plateNumber trailer unitNumber internalId');

      if (trip) {
        orderObj.driver = trip.driver || orderObj.driver || null;
        orderObj.truck = trip.truck ? enhanceVehicleData(trip.truck) : (orderObj.truck ? enhanceVehicleData(orderObj.truck) : null);
        orderObj.trailer = trip.trailer ? enhanceTrailerData(trip.trailer) : (orderObj.trailer ? enhanceTrailerData(orderObj.trailer) : null);
      }
    } else {
      // Enhance vehicle and trailer data from order directly
      orderObj.truck = orderObj.truck ? enhanceVehicleData(orderObj.truck) : null;
      orderObj.trailer = orderObj.trailer ? enhanceTrailerData(orderObj.trailer) : null;
    }

    // Enhance driver data (if present)
    if (orderObj.driver && typeof orderObj.driver === 'object') {
      orderObj.driver = typeof orderObj.driver.toObject === 'function' ? orderObj.driver.toObject() : orderObj.driver;
    }

    // Enhance customer data - ensure customer address fields are available
    if (orderObj.customer && typeof orderObj.customer === 'object') {
      const customerObj = typeof orderObj.customer.toObject === 'function' ? orderObj.customer.toObject() : orderObj.customer;

      // If customer address fields are not stored on order, populate them from customer object
      if (!orderObj.customerAddress && (customerObj.customerDetails?.address || customerObj.address)) {
        orderObj.customerAddress = customerObj.customerDetails?.address || customerObj.address || '';
      }
      if (!orderObj.customerCity && (customerObj.customerDetails?.city || customerObj.city)) {
        orderObj.customerCity = customerObj.customerDetails?.city || customerObj.city || '';
      }
      if (!orderObj.customerCountry && (customerObj.customerDetails?.country || customerObj.country)) {
        orderObj.customerCountry = customerObj.customerDetails?.country || customerObj.country || '';
      }
      if (!orderObj.customerProvince && (customerObj.customerDetails?.stateProvince || customerObj.customerDetails?.state || customerObj.state)) {
        orderObj.customerProvince = customerObj.customerDetails?.stateProvince || customerObj.customerDetails?.state || customerObj.state || '';
      }

      orderObj.customer = customerObj;
    }

    // Ensure customs information and other charges fields are always present in response
    if (!orderObj.borderInfo) {
      orderObj.borderInfo = {
        detailsRequired: false,
        direction: 'CA_TO_US',
        portOfEntry: '',
        cargoDescription: '',
        hsCode: '',
        brokerName: '',
        brokerPhone: '',
        brokerEmail: '',
        commercialValue: '',
        countryOfOrigin: ''
      };
    }

    // Ensure customs fields are always present
    if (orderObj.pars === undefined) orderObj.pars = '';
    if (orderObj.paps === undefined) orderObj.paps = '';
    if (orderObj.trailerSealNo === undefined) orderObj.trailerSealNo = '';

    // Ensure otherCharges is always an array
    if (!Array.isArray(orderObj.otherCharges)) {
      orderObj.otherCharges = [];
    }

    // Ensure notes is always an array
    if (!Array.isArray(orderObj.notes)) {
      orderObj.notes = [];
    }

    // Ensure attachments is always an array
    if (!Array.isArray(orderObj.attachments)) {
      orderObj.attachments = [];
    }

    // Ensure notes and attachments are always arrays
    if (!Array.isArray(orderObj.notes)) {
      orderObj.notes = [];
    }
    if (!Array.isArray(orderObj.attachments)) {
      orderObj.attachments = [];
    }

    // Generate signed URLs for all attachments
    if (orderObj.attachments && orderObj.attachments.length > 0) {
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

        console.log('🔐 Generating signed URLs for', orderObj.attachments.length, 'attachments');

        // Process each attachment
        orderObj.attachments = await Promise.all(orderObj.attachments.map(async (attachment) => {
          try {
            const fileUrl = attachment.url;
            
            // Check if it's an S3 URL
            const isS3Url = fileUrl && (fileUrl.includes('amazonaws.com') || fileUrl.includes('s3'));
            
            if (isS3Url) {
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
              if (key.includes('?')) key = key.split('?')[0];
              if (key.includes('&')) key = key.split('&')[0];

              const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: key,
                ResponseContentDisposition: 'inline',
                ResponseContentType: 'application/pdf',
              });

              const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
              
              console.log(`✅ Generated signed URL for attachment: ${attachment.name || attachment.id}`);
              
              // Return attachment with signed URL
              return {
                ...attachment,
                url: signedUrl, // Replace with signed URL
                originalUrl: fileUrl, // Keep original URL for reference
                signedUrlExpiresIn: 3600
              };
            }
            
            // Not an S3 URL, return as-is
            return attachment;
          } catch (error) {
            console.error(`❌ Error generating signed URL for attachment ${attachment.id}:`, error);
            // Return original attachment if signing fails
            return attachment;
          }
        }));
        
        console.log('✅ All signed URLs generated successfully');
      } catch (error) {
        console.error('❌ Error in signed URL generation process:', error);
        // Continue with original URLs if signing fails
      }
    }

    res.json({
      success: true,
      data: orderObj
    });
  } catch (error) {
    console.error("Get Order By ID Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Order
export const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let query = { _id: id };
    if (!isSuperadmin && userCompanyId) {
      query.company = userCompanyId;
    }

    const order = await Order.findOne(query);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Check if trying to set status to 'completed' without document approval
    if (req.body.status === 'completed' && !order.documentsApproved) {
      return res.status(400).json({
        success: false,
        message: 'Cannot complete order. Documents must be approved by dispatcher first. Please approve the order documents before marking it as completed.'
      });
    }

    // Parse JSON strings from FormData (multer sends nested objects as JSON strings)
    const parseFormDataField = (field) => {
      if (!field) return null;
      if (typeof field === 'string') {
        try {
          return JSON.parse(field);
        } catch (e) {
          return field; // Return as-is if not JSON
        }
      }
      return field;
    };

    // Parse nested objects from FormData
    if (req.body.shipper && typeof req.body.shipper === 'string') {
      req.body.shipper = parseFormDataField(req.body.shipper);
    }
    if (req.body.receiver && typeof req.body.receiver === 'string') {
      req.body.receiver = parseFormDataField(req.body.receiver);
    }
    if (req.body.pickupAppointmentDetails && typeof req.body.pickupAppointmentDetails === 'string') {
      req.body.pickupAppointmentDetails = parseFormDataField(req.body.pickupAppointmentDetails);
    }
    if (req.body.deliveryAppointmentDetails && typeof req.body.deliveryAppointmentDetails === 'string') {
      req.body.deliveryAppointmentDetails = parseFormDataField(req.body.deliveryAppointmentDetails);
    }
    if (req.body.borderInfo && typeof req.body.borderInfo === 'string') {
      req.body.borderInfo = parseFormDataField(req.body.borderInfo);
    }
    if (req.body.weatherConditions && typeof req.body.weatherConditions === 'string') {
      req.body.weatherConditions = parseFormDataField(req.body.weatherConditions);
    }
    if (req.body.dimensions && typeof req.body.dimensions === 'string') {
      req.body.dimensions = parseFormDataField(req.body.dimensions);
    }
    if (req.body.additionalInfo && typeof req.body.additionalInfo === 'string') {
      req.body.additionalInfo = parseFormDataField(req.body.additionalInfo);
    }
    if (req.body.pickupLocation && typeof req.body.pickupLocation === 'string') {
      req.body.pickupLocation = parseFormDataField(req.body.pickupLocation);
    }
    if (req.body.deliveryLocation && typeof req.body.deliveryLocation === 'string') {
      req.body.deliveryLocation = parseFormDataField(req.body.deliveryLocation);
    }
    if (req.body.equipment && typeof req.body.equipment === 'string') {
      req.body.equipment = parseFormDataField(req.body.equipment);
    }
    if (req.body.otherCharges && typeof req.body.otherCharges === 'string') {
      req.body.otherCharges = parseFormDataField(req.body.otherCharges);
    }
    if (req.body.receiverStops && typeof req.body.receiverStops === 'string') {
      req.body.receiverStops = parseFormDataField(req.body.receiverStops);
    }
    if (req.body.stops && typeof req.body.stops === 'string') {
      req.body.stops = parseFormDataField(req.body.stops);
    }
    if (req.body.notes !== undefined) {
      if (typeof req.body.notes === 'string') {
        req.body.notes = parseFormDataField(req.body.notes);
      } else if (!Array.isArray(req.body.notes)) {
        req.body.notes = [];
      }
    }
    if (req.body.attachments !== undefined) {
      if (typeof req.body.attachments === 'string') {
        req.body.attachments = parseFormDataField(req.body.attachments);
      } else if (!Array.isArray(req.body.attachments)) {
        req.body.attachments = [];
      }
    }

    // Log notes and attachments for debugging
    console.log('📝 [ORDER UPDATE] Notes and attachments received:', {
      notesRaw: req.body.notes,
      notesType: typeof req.body.notes,
      notesIsArray: Array.isArray(req.body.notes),
      notesLength: Array.isArray(req.body.notes) ? req.body.notes.length : 'N/A',
      notesValue: Array.isArray(req.body.notes) ? req.body.notes : req.body.notes,
      attachmentsRaw: req.body.attachments,
      attachmentsType: typeof req.body.attachments,
      attachmentsIsArray: Array.isArray(req.body.attachments),
      attachmentsLength: Array.isArray(req.body.attachments) ? req.body.attachments.length : 'N/A'
    });

    // Process uploaded files
    const files = req.files || {};
    const documentUrls = {};

    // Helper function to get file URL
    const getFileUrl = (file) => {
      if (!file) return null;
      return file.location || (file.path ? `${process.env.BASE_URL || 'http://localhost:3000'}/${file.path.replace(/\\/g, '/')}` : null);
    };

    // Collect new documents for validation
    const documentsToValidate = [];

    // Process BOL file (only update if new file uploaded)
    if (files.bol && files.bol[0]) {
      const file = files.bol[0];
      documentUrls.bol = getFileUrl(file);
      // Add to validation - handle both local and S3 files
      if (file.path || file.location || file.key) {
        documentsToValidate.push({
          path: file.path || null,
          location: file.location || null,
          key: file.key || null,
          bucket: process.env.AWS_S3_BUCKET_NAME || null,
          originalname: file.originalname || 'bol',
          type: 'bol',
          filename: file.filename
        });
      }
    }

    // Process POD file
    if (files.pod && files.pod[0]) {
      const file = files.pod[0];
      documentUrls.pod = getFileUrl(file);
      // Add to validation - handle both local and S3 files
      if (file.path || file.location || file.key) {
        documentsToValidate.push({
          path: file.path || null,
          location: file.location || null,
          key: file.key || null,
          bucket: process.env.AWS_S3_BUCKET_NAME || null,
          originalname: file.originalname || 'pod',
          type: 'pod',
          filename: file.filename
        });
      }
    }

    // Process Customs/Hazmat files (array) - append to existing if any
    if (files.customsHazmat && Array.isArray(files.customsHazmat)) {
      const newUrls = files.customsHazmat.map(file => {
        // Add to validation - handle both local and S3 files
        if (file.path || file.location || file.key) {
          documentsToValidate.push({
            path: file.path || null,
            location: file.location || null,
            key: file.key || null,
            bucket: process.env.AWS_S3_BUCKET_NAME || null,
            originalname: file.originalname || 'customsHazmat',
            type: 'customsHazmat',
            filename: file.filename
          });
        }
        return getFileUrl(file);
      }).filter(url => url !== null);
      // If updating, merge with existing customsHazmat array
      const existing = Array.isArray(order.documents?.customsHazmat) ? order.documents.customsHazmat : [];
      documentUrls.customsHazmat = [...existing, ...newUrls];
    }

    // Process Rate Confirmation file
    if (files.rateConfirmation && files.rateConfirmation[0]) {
      const file = files.rateConfirmation[0];
      documentUrls.rateConfirmation = getFileUrl(file);
      // Add to validation - handle both local and S3 files
      if (file.path || file.location || file.key) {
        documentsToValidate.push({
          path: file.path || null,
          location: file.location || null,
          key: file.key || null,
          bucket: process.env.AWS_S3_BUCKET_NAME || null,
          originalname: file.originalname || 'rateConfirmation',
          type: 'rateConfirmation',
          filename: file.filename
        });
      }
    }

    // Process Stamped Manifest file
    if (files.stampedManifest && files.stampedManifest[0]) {
      const file = files.stampedManifest[0];
      documentUrls.stampedManifest = getFileUrl(file);
      // Add to validation - handle both local and S3 files
      if (file.path || file.location || file.key) {
        documentsToValidate.push({
          path: file.path || null,
          location: file.location || null,
          key: file.key || null,
          bucket: process.env.AWS_S3_BUCKET_NAME || null,
          originalname: file.originalname || 'stampedManifest',
          type: 'stampedManifest',
          filename: file.filename
        });
      }
    }

    // Process Load Securement files (array of images) - append to existing if any
    if (files.loadSecurement && Array.isArray(files.loadSecurement)) {
      const newUrls = files.loadSecurement.map(file => {
        // Add to validation - handle both local and S3 files
        if (file.path || file.location || file.key) {
          documentsToValidate.push({
            path: file.path || null,
            location: file.location || null,
            key: file.key || null,
            bucket: process.env.AWS_S3_BUCKET_NAME || null,
            originalname: file.originalname || 'loadSecurement',
            type: 'loadSecurement',
            filename: file.filename
          });
        }
        return getFileUrl(file);
      }).filter(url => url !== null);
      // If updating, merge with existing loadSecurement array
      const existing = Array.isArray(order.documents?.loadSecurement) ? order.documents.loadSecurement : [];
      documentUrls.loadSecurement = [...existing, ...newUrls];
    }

    // Process Printed Manifest file
    if (files.printedManifest && files.printedManifest[0]) {
      const file = files.printedManifest[0];
      documentUrls.printedManifest = getFileUrl(file);
      // Add to validation - handle both local and S3 files
      if (file.path || file.location || file.key) {
        documentsToValidate.push({
          path: file.path || null,
          location: file.location || null,
          key: file.key || null,
          bucket: process.env.AWS_S3_BUCKET_NAME || null,
          originalname: file.originalname || 'printedManifest',
          type: 'printedManifest',
          filename: file.filename
        });
      }
    }

    console.log('📁 Processed document uploads for update:', documentUrls);
    console.log('📋 Documents to validate (update):', documentsToValidate.map(d => ({
      filename: d.originalname,
      type: d.type,
      hasPath: !!d.path,
      hasLocation: !!d.location,
      hasKey: !!d.key,
      hasBucket: !!d.bucket
    })));

    // Validate new documents using AI
    let validationResult = null;
    if (documentsToValidate.length > 0) {
      console.log(`🤖 [ORDER UPDATE] Starting AI validation for ${documentsToValidate.length} document(s)...`);
      console.log(`📋 [ORDER UPDATE] Document details:`, documentsToValidate);
      try {
        const orderDataForValidation = {
          orderNumber: order.orderNumber || req.body.customerOrderNo || 'Order Update',
          customer: order.customer || req.body.customer || null
        };

        validationResult = await validateDocuments(documentsToValidate, 'order', orderDataForValidation);

        console.log('🔍 Document validation result (update):', {
          valid: validationResult.valid,
          errors: validationResult.errors.length,
          warnings: validationResult.warnings.length,
          documentDetails: validationResult.documentDetails?.map(d => ({
            document: d.document,
            type: d.type,
            actualType: d.actualType,
            typeMatch: d.typeMatch,
            status: d.status
          })) || []
        });

        // Log validation errors and warnings for debugging
        if (validationResult.errors.length > 0) {
          console.error('❌ Validation errors (update):', validationResult.errors);
        }
        if (validationResult.warnings.length > 0) {
          console.warn('⚠️ Validation warnings (update):', validationResult.warnings);
        }

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
        console.error('❌ Document validation error (update):', validationError);
        console.error('Validation error details:', {
          message: validationError.message,
          stack: validationError.stack,
          documentsCount: documentsToValidate.length
        });
        // Continue with order update even if validation fails (non-blocking)
        // Set validationResult to indicate validation failed
        validationResult = {
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
    }

    // Update pickup location if provided
    if (req.body.pickupLocation) {
      if (req.body.pickupLocation.placeId) {
        const place = await Place.findById(req.body.pickupLocation.placeId);
        if (place && place.currentLocation) {
          order.pickupLocation = {
            placeId: place._id,
            place: place.currentLocation.address || place.name || '',
            latitude: String(place.currentLocation.latitude || ''),
            longitude: String(place.currentLocation.longitude || '')
          };
        }
      } else {
        order.pickupLocation = {
          ...order.pickupLocation,
          place: normalizeString(req.body.pickupLocation.place) || order.pickupLocation.place,
          latitude: normalizeString(req.body.pickupLocation.latitude) || order.pickupLocation.latitude,
          longitude: normalizeString(req.body.pickupLocation.longitude) || order.pickupLocation.longitude
        };
      }
    }

    // Update delivery location if provided
    if (req.body.deliveryLocation) {
      if (req.body.deliveryLocation.placeId) {
        const place = await Place.findById(req.body.deliveryLocation.placeId);
        if (place && place.currentLocation) {
          order.deliveryLocation = {
            placeId: place._id,
            place: place.currentLocation.address || place.name || '',
            latitude: String(place.currentLocation.latitude || ''),
            longitude: String(place.currentLocation.longitude || '')
          };
        }
      } else {
        order.deliveryLocation = {
          ...order.deliveryLocation,
          place: normalizeString(req.body.deliveryLocation.place) || order.deliveryLocation.place,
          latitude: normalizeString(req.body.deliveryLocation.latitude) || order.deliveryLocation.latitude,
          longitude: normalizeString(req.body.deliveryLocation.longitude) || order.deliveryLocation.longitude
        };
      }
    }

    // Update other fields
    // Log received fields for debugging (after parsing) - Shipper and Receiver sections
    console.log('📋 [ORDER UPDATE] Received fields:', {
      shipper: req.body.shipper ? {
        name: req.body.shipper.name || 'empty',
        unit: req.body.shipper.unit || 'empty',
        country: req.body.shipper.country || 'empty',
        province: req.body.shipper.province || 'empty',
        city: req.body.shipper.city || 'empty',
        postalCode: req.body.shipper.postalCode || 'empty',
        primaryPhone: req.body.shipper.primaryPhone || 'empty',
        secondaryPhone: req.body.shipper.secondaryPhone || 'empty',
        contact: req.body.shipper.contact || 'empty',
        store: req.body.shipper.store || 'empty',
        type: req.body.shipper.type || 'empty'
      } : 'undefined',
      receiver: req.body.receiver ? {
        name: req.body.receiver.name || 'empty',
        phone: req.body.receiver.phone || 'empty',
        address: req.body.receiver.address || 'empty',
        contact: req.body.receiver.contact || 'empty'
      } : 'undefined',
      deliveryRefNo: req.body.deliveryRefNo || 'empty',
      deliveryNote: req.body.deliveryNote || 'empty',
      deliverySkids: req.body.deliverySkids || 'empty',
      deliveryCases: req.body.deliveryCases || 'empty',
      dropOffNotes: req.body.dropOffNotes || 'empty',
      dropOffNumber: req.body.dropOffNumber || 'empty',
      commodity: req.body.commodity || 'empty',
      weight: req.body.weight || 'empty',
      temperature: req.body.temperature || 'empty',
      // Assignment fields
      truck: req.body.truck ? (typeof req.body.truck === 'object' ? req.body.truck._id || req.body.truck.id : req.body.truck) : 'empty',
      trailer: req.body.trailer ? (typeof req.body.trailer === 'object' ? req.body.trailer._id || req.body.trailer.id : req.body.trailer) : 'empty',
      driver: req.body.driver ? (typeof req.body.driver === 'object' ? req.body.driver._id || req.body.driver.id : req.body.driver) : 'empty',
      coDriver: req.body.coDriver ? (typeof req.body.coDriver === 'object' ? req.body.coDriver._id || req.body.coDriver.id : req.body.coDriver) : 'empty',
      otherCharges: req.body.otherCharges !== undefined
        ? (Array.isArray(req.body.otherCharges)
          ? `Array[${req.body.otherCharges.length}]`
          : `Type: ${typeof req.body.otherCharges}`)
        : 'undefined',
      borderInfo: req.body.borderInfo !== undefined
        ? (req.body.borderInfo === null
          ? 'null'
          : typeof req.body.borderInfo === 'object'
            ? `Object, brokerName: ${req.body.borderInfo.brokerName || 'empty'}, brokerPhone: ${req.body.borderInfo.brokerPhone || 'empty'}, brokerEmail: ${req.body.borderInfo.brokerEmail || 'empty'}`
            : `Type: ${typeof req.body.borderInfo}`)
        : 'undefined'
    });

    if (req.body.customerOrderNo !== undefined) order.customerOrderNo = normalizeString(req.body.customerOrderNo);
    if (req.body.tripNo !== undefined) order.tripNo = normalizeString(req.body.tripNo);
    if (req.body.orderType !== undefined) order.orderType = normalizeString(req.body.orderType);
    if (req.body.freightOn !== undefined) order.freightOn = normalizeString(req.body.freightOn) || 'Order';
    if (req.body.salesman !== undefined) order.salesman = normalizeString(req.body.salesman);
    if (req.body.orderNotes !== undefined) order.orderNotes = normalizeString(req.body.orderNotes);
    if (req.body.customer !== undefined) order.customer = normalizeObjectId(req.body.customer);
    if (req.body.pickupDate !== undefined) order.pickupDate = req.body.pickupDate ? new Date(req.body.pickupDate) : null;
    if (req.body.pickupTime !== undefined) order.pickupTime = normalizeString(req.body.pickupTime);
    if (req.body.pickupAppointment !== undefined) order.pickupAppointment = normalizeBoolean(req.body.pickupAppointment);
    if (req.body.pickupRefNo !== undefined) order.pickupRefNo = normalizeString(req.body.pickupRefNo);
    if (req.body.pickupNote !== undefined) order.pickupNote = normalizeString(req.body.pickupNote);
    if (req.body.pickupSkids !== undefined) order.pickupSkids = normalizeString(req.body.pickupSkids);
    if (req.body.pickupCases !== undefined) order.pickupCases = normalizeString(req.body.pickupCases);
    if (req.body.deliveryDate !== undefined) order.deliveryDate = req.body.deliveryDate ? new Date(req.body.deliveryDate) : null;
    if (req.body.deliveryTime !== undefined) order.deliveryTime = normalizeString(req.body.deliveryTime);
    if (req.body.deliveryAppointment !== undefined) order.deliveryAppointment = normalizeBoolean(req.body.deliveryAppointment);
    if (req.body.deliveryRefNo !== undefined) order.deliveryRefNo = normalizeString(req.body.deliveryRefNo);
    if (req.body.deliveryNote !== undefined) order.deliveryNote = normalizeString(req.body.deliveryNote);
    if (req.body.commodity !== undefined) order.commodity = normalizeString(req.body.commodity);
    if (req.body.valueOfGoods !== undefined) order.valueOfGoods = normalizeNumber(req.body.valueOfGoods);
    if (req.body.valueOfGoodsCurrency !== undefined) order.valueOfGoodsCurrency = normalizeString(req.body.valueOfGoodsCurrency);
    if (req.body.equipment !== undefined) order.equipment = Array.isArray(req.body.equipment) ? req.body.equipment : [];
    if (req.body.noOfPackages !== undefined) order.noOfPackages = normalizeNumber(req.body.noOfPackages);
    if (req.body.weight !== undefined) order.weight = normalizeNumber(req.body.weight);

    // Update temperature and weather conditions
    if (req.body.temperature !== undefined) {
      order.temperature = req.body.temperature ? normalizeNumber(req.body.temperature) : null;
      // Auto-calculate highTemperature based on temperature and threshold (default 35°C)
      if (order.temperature !== null && order.temperatureUnit) {
        const tempInCelsius = order.temperatureUnit === 'Fahrenheit'
          ? (order.temperature - 32) * 5 / 9
          : order.temperature;
        if (!order.weatherConditions) order.weatherConditions = {};
        // Only auto-set if not explicitly provided in request
        if (req.body.weatherConditions?.highTemperature === undefined) {
          order.weatherConditions.highTemperature = tempInCelsius >= 35; // Default threshold 35°C
        }
      }
    }
    if (req.body.temperatureUnit !== undefined) {
      order.temperatureUnit = normalizeString(req.body.temperatureUnit);
      // Recalculate highTemperature if temperature exists
      if (order.temperature !== null && order.temperature !== undefined) {
        const tempInCelsius = order.temperatureUnit === 'Fahrenheit'
          ? (order.temperature - 32) * 5 / 9
          : order.temperature;
        if (!order.weatherConditions) order.weatherConditions = {};
        if (req.body.weatherConditions?.highTemperature === undefined) {
          order.weatherConditions.highTemperature = tempInCelsius >= 35;
        }
      }
    }
    if (req.body.weatherConditions?.snow !== undefined) {
      if (!order.weatherConditions) order.weatherConditions = {};
      order.weatherConditions.snow = normalizeBoolean(req.body.weatherConditions.snow);
    }
    if (req.body.weatherConditions?.highTemperature !== undefined) {
      if (!order.weatherConditions) order.weatherConditions = {};
      order.weatherConditions.highTemperature = normalizeBoolean(req.body.weatherConditions.highTemperature);
    }

    // Track previous driver/coDriver IDs to detect new assignments
    const previousDriverId = order.driver?.toString();
    const previousCoDriverId = order.coDriver?.toString();

    // Double-check: Block status change to 'completed' if documents are not approved
    if (req.body.status === 'completed' && !order.documentsApproved) {
      return res.status(400).json({
        success: false,
        message: 'Cannot complete order. Documents must be approved by dispatcher first. Please approve the order documents before marking it as completed.'
      });
    }

    if (req.body.status !== undefined) order.status = normalizeOrderStatus(req.body.status);
    if (req.body.accountingStatus !== undefined) order.accountingStatus = normalizeString(req.body.accountingStatus);
    if (req.body.totalAmount !== undefined) order.totalAmount = normalizeNumber(req.body.totalAmount);
    if (req.body.driver !== undefined) order.driver = normalizeObjectId(req.body.driver);
    if (req.body.coDriver !== undefined) order.coDriver = normalizeObjectId(req.body.coDriver);
    if (req.body.truck !== undefined) order.truck = normalizeObjectId(req.body.truck);
    if (req.body.trailer !== undefined) order.trailer = normalizeObjectId(req.body.trailer);

    // Check if driver or coDriver was just assigned
    const newDriverId = order.driver?.toString();
    const newCoDriverId = order.coDriver?.toString();
    const driverJustAssigned = newDriverId && previousDriverId !== newDriverId;
    const coDriverJustAssigned = newCoDriverId && previousCoDriverId !== newCoDriverId;

    // Update new fields from UI (enhanced shipper)
    if (req.body.shipper !== undefined) {
      // Initialize shipper if it doesn't exist
      if (!order.shipper) {
        order.shipper = {
          name: '',
          phone: '',
          email: '',
          address: '',
          unit: '',
          country: '',
          province: '',
          city: '',
          postalCode: '',
          primaryPhone: '',
          secondaryPhone: '',
          contact: '',
          store: '',
          type: 'DELIVERY'
        };
      }
      // Update shipper fields
      if (req.body.shipper.name !== undefined) order.shipper.name = normalizeString(req.body.shipper.name);
      if (req.body.shipper.phone !== undefined) order.shipper.phone = normalizeString(req.body.shipper.phone);
      if (req.body.shipper.email !== undefined) order.shipper.email = normalizeString(req.body.shipper.email);
      if (req.body.shipper.address !== undefined) order.shipper.address = normalizeString(req.body.shipper.address);
      if (req.body.shipper.unit !== undefined) order.shipper.unit = normalizeString(req.body.shipper.unit);
      if (req.body.shipper.country !== undefined) order.shipper.country = normalizeString(req.body.shipper.country);
      if (req.body.shipper.province !== undefined) order.shipper.province = normalizeString(req.body.shipper.province);
      if (req.body.shipper.city !== undefined) order.shipper.city = normalizeString(req.body.shipper.city);
      if (req.body.shipper.postalCode !== undefined) order.shipper.postalCode = normalizeString(req.body.shipper.postalCode);
      if (req.body.shipper.primaryPhone !== undefined) order.shipper.primaryPhone = normalizeString(req.body.shipper.primaryPhone);
      if (req.body.shipper.secondaryPhone !== undefined) order.shipper.secondaryPhone = normalizeString(req.body.shipper.secondaryPhone);
      if (req.body.shipper.contact !== undefined) order.shipper.contact = normalizeString(req.body.shipper.contact);
      if (req.body.shipper.store !== undefined) order.shipper.store = normalizeString(req.body.shipper.store);
      if (req.body.shipper.type !== undefined) order.shipper.type = normalizeString(req.body.shipper.type || 'DELIVERY');
      // Mark shipper as modified for Mongoose to save nested object changes
      order.markModified('shipper');
    }
    // Update receiver (enhanced)
    if (req.body.receiver !== undefined) {
      // Initialize receiver if it doesn't exist
      if (!order.receiver) {
        order.receiver = {
          name: '',
          phone: '',
          address: '',
          contact: ''
        };
      }
      // Update receiver fields
      if (req.body.receiver.name !== undefined) order.receiver.name = normalizeString(req.body.receiver.name);
      if (req.body.receiver.phone !== undefined) order.receiver.phone = normalizeString(req.body.receiver.phone);
      if (req.body.receiver.address !== undefined) order.receiver.address = normalizeString(req.body.receiver.address);
      if (req.body.receiver.contact !== undefined) order.receiver.contact = normalizeString(req.body.receiver.contact);
      // Mark receiver as modified for Mongoose to save nested object changes
      order.markModified('receiver');
    }

    // Update delivery goods and drop off details
    if (req.body.deliveryRefNo !== undefined) order.deliveryRefNo = normalizeString(req.body.deliveryRefNo);
    if (req.body.deliveryNote !== undefined) order.deliveryNote = normalizeString(req.body.deliveryNote);
    if (req.body.deliverySkids !== undefined) order.deliverySkids = normalizeString(req.body.deliverySkids);
    if (req.body.deliveryCases !== undefined) order.deliveryCases = normalizeString(req.body.deliveryCases);
    if (req.body.dropOffNotes !== undefined) order.dropOffNotes = normalizeString(req.body.dropOffNotes);
    if (req.body.dropOffNumber !== undefined) order.dropOffNumber = normalizeString(req.body.dropOffNumber);
    // Update receiver stops
    if (req.body.receiverStops !== undefined) {
      order.receiverStops = Array.isArray(req.body.receiverStops) ? req.body.receiverStops : [];
    }
    // Update stops
    if (req.body.stops !== undefined) {
      order.stops = Array.isArray(req.body.stops) ? req.body.stops : [];
    }
    // Update pickup appointment details (with window support)
    if (req.body.pickupAppointmentDetails !== undefined) {
      order.pickupAppointmentDetails = {
        type: normalizeString(req.body.pickupAppointmentDetails.type || order.pickupAppointmentDetails?.type || 'FCFS'),
        date: req.body.pickupAppointmentDetails.date ? new Date(req.body.pickupAppointmentDetails.date) : (order.pickupAppointmentDetails?.date || null),
        time: normalizeString(req.body.pickupAppointmentDetails.time || order.pickupAppointmentDetails?.time),
        startDate: req.body.pickupAppointmentDetails.startDate ? new Date(req.body.pickupAppointmentDetails.startDate) : (order.pickupAppointmentDetails?.startDate || null),
        startTime: normalizeString(req.body.pickupAppointmentDetails.startTime || order.pickupAppointmentDetails?.startTime),
        endDate: req.body.pickupAppointmentDetails.endDate ? new Date(req.body.pickupAppointmentDetails.endDate) : (order.pickupAppointmentDetails?.endDate || null),
        endTime: normalizeString(req.body.pickupAppointmentDetails.endTime || order.pickupAppointmentDetails?.endTime),
        specialInstructions: normalizeString(req.body.pickupAppointmentDetails.specialInstructions || order.pickupAppointmentDetails?.specialInstructions),
        gatePass: normalizeString(req.body.pickupAppointmentDetails.gatePass || order.pickupAppointmentDetails?.gatePass)
      };
    }
    // Update delivery appointment details (with window support)
    if (req.body.deliveryAppointmentDetails !== undefined) {
      order.deliveryAppointmentDetails = {
        type: normalizeString(req.body.deliveryAppointmentDetails.type || order.deliveryAppointmentDetails?.type || 'Window'),
        date: req.body.deliveryAppointmentDetails.date ? new Date(req.body.deliveryAppointmentDetails.date) : (order.deliveryAppointmentDetails?.date || null),
        time: normalizeString(req.body.deliveryAppointmentDetails.time || order.deliveryAppointmentDetails?.time),
        startDate: req.body.deliveryAppointmentDetails.startDate ? new Date(req.body.deliveryAppointmentDetails.startDate) : (order.deliveryAppointmentDetails?.startDate || null),
        startTime: normalizeString(req.body.deliveryAppointmentDetails.startTime || order.deliveryAppointmentDetails?.startTime),
        endDate: req.body.deliveryAppointmentDetails.endDate ? new Date(req.body.deliveryAppointmentDetails.endDate) : (order.deliveryAppointmentDetails?.endDate || null),
        endTime: normalizeString(req.body.deliveryAppointmentDetails.endTime || order.deliveryAppointmentDetails?.endTime),
        unloadingInstructions: normalizeString(req.body.deliveryAppointmentDetails.unloadingInstructions || order.deliveryAppointmentDetails?.unloadingInstructions)
      };
    }
    // Update customer information fields
    if (req.body.customerUnit !== undefined) order.customerUnit = normalizeString(req.body.customerUnit);
    if (req.body.customerAddress !== undefined) order.customerAddress = normalizeString(req.body.customerAddress);
    if (req.body.customerCity !== undefined) order.customerCity = normalizeString(req.body.customerCity);
    if (req.body.customerCountry !== undefined) order.customerCountry = normalizeString(req.body.customerCountry);
    if (req.body.customerProvince !== undefined) order.customerProvince = normalizeString(req.body.customerProvince);
    if (req.body.customerPostalCode !== undefined) order.customerPostalCode = normalizeString(req.body.customerPostalCode);
    if (req.body.customerPrimaryPhone !== undefined) order.customerPrimaryPhone = normalizeString(req.body.customerPrimaryPhone);
    if (req.body.customerSecondaryPhone !== undefined) order.customerSecondaryPhone = normalizeString(req.body.customerSecondaryPhone);
    if (req.body.customerContact !== undefined) order.customerContact = normalizeString(req.body.customerContact);
    if (req.body.payableEmail !== undefined) order.payableEmail = normalizeString(req.body.payableEmail);
    if (req.body.secondaryPayableEmail !== undefined) order.secondaryPayableEmail = normalizeString(req.body.secondaryPayableEmail);

    // If customer is updated, fetch and extract address fields
    if (req.body.customer !== undefined && order.customer) {
      const { User } = await import("../models/driver/userModel.js");
      const customer = await User.findById(order.customer);
      if (customer) {
        const customerAddress = customer.customerDetails?.address || customer.address || '';
        const customerCity = customer.customerDetails?.city || customer.city || '';
        const customerCountry = customer.customerDetails?.country || customer.country || '';
        const customerProvince = customer.customerDetails?.stateProvince || customer.customerDetails?.state || customer.state || '';

        // Update order customer address fields if they're not explicitly provided in request
        if (!req.body.customerAddress && customerAddress) order.customerAddress = customerAddress;
        if (!req.body.customerCity && customerCity) order.customerCity = customerCity;
        if (!req.body.customerCountry && customerCountry) order.customerCountry = customerCountry;
        if (!req.body.customerProvince && customerProvince) order.customerProvince = customerProvince;
      }
    }

    // Update billing information
    if (req.body.billingDate !== undefined) order.billingDate = req.body.billingDate ? new Date(req.body.billingDate) : null;
    if (req.body.rate !== undefined) order.rate = normalizeNumber(req.body.rate);
    if (req.body.rateCurrency !== undefined) order.rateCurrency = normalizeString(req.body.rateCurrency);
    if (req.body.dispatcher !== undefined) order.dispatcher = normalizeString(req.body.dispatcher);
    if (req.body.dispatcherEmail !== undefined) order.dispatcherEmail = normalizeString(req.body.dispatcherEmail);
    if (req.body.bookedForCarrier !== undefined) order.bookedForCarrier = normalizeBoolean(req.body.bookedForCarrier);
    if (req.body.sendToFactor !== undefined) order.sendToFactor = normalizeBoolean(req.body.sendToFactor);

    // Update tax configuration
    if (req.body.taxCode !== undefined) order.taxCode = normalizeString(req.body.taxCode);
    if (req.body.taxAmount !== undefined) order.taxAmount = normalizeNumber(req.body.taxAmount);

    // Update customs information
    if (req.body.pars !== undefined) order.pars = normalizeString(req.body.pars);
    if (req.body.paps !== undefined) order.paps = normalizeString(req.body.paps);
    if (req.body.trailerSealNo !== undefined) order.trailerSealNo = normalizeString(req.body.trailerSealNo);

    // Update additional checkboxes
    if (req.body.csaFastApproved !== undefined) order.csaFastApproved = normalizeBoolean(req.body.csaFastApproved);
    if (req.body.bondedShipmentCA !== undefined) order.bondedShipmentCA = normalizeBoolean(req.body.bondedShipmentCA);
    if (req.body.bondedShipmentUS !== undefined) order.bondedShipmentUS = normalizeBoolean(req.body.bondedShipmentUS);
    if (req.body.highPriority !== undefined) order.highPriority = normalizeBoolean(req.body.highPriority);
    if (req.body.cityDriver !== undefined) order.cityDriver = normalizeBoolean(req.body.cityDriver);
    if (req.body.teamLoad !== undefined) order.teamLoad = normalizeBoolean(req.body.teamLoad);
    if (req.body.roundTrip !== undefined) order.roundTrip = normalizeBoolean(req.body.roundTrip);
    if (req.body.oversized !== undefined) order.oversized = normalizeBoolean(req.body.oversized);
    if (req.body.empty !== undefined) order.empty = normalizeBoolean(req.body.empty);

    // Update other charges
    if (req.body.otherCharges !== undefined) {
      order.otherCharges = Array.isArray(req.body.otherCharges) ? req.body.otherCharges : [];
      // Mark otherCharges as modified for Mongoose to save array changes
      order.markModified('otherCharges');
    }

    // Update invoice notes
    if (req.body.invoiceInstructions !== undefined) order.invoiceInstructions = normalizeString(req.body.invoiceInstructions);
    if (req.body.invoiceNotes !== undefined) order.invoiceNotes = normalizeString(req.body.invoiceNotes);
    // Handle borderInfo - always ensure it exists, update only if provided
    let borderInfoModified = false;
    if (!order.borderInfo) {
      order.borderInfo = {
        detailsRequired: false,
        direction: 'CA_TO_US',
        portOfEntry: '',
        cargoDescription: '',
        hsCode: '',
        brokerName: '',
        brokerPhone: '',
        brokerEmail: '',
        commercialValue: '',
        countryOfOrigin: ''
      };
      borderInfoModified = true;
    }

    // Update borderInfo only if explicitly provided in request
    if (req.body.borderInfo !== undefined) {
      if (req.body.borderInfo === null) {
        // If explicitly set to null, reset to defaults
        order.borderInfo = {
          detailsRequired: false,
          direction: 'CA_TO_US',
          portOfEntry: '',
          cargoDescription: '',
          hsCode: '',
          brokerName: '',
          brokerPhone: '',
          brokerEmail: '',
          commercialValue: '',
          countryOfOrigin: ''
        };
        borderInfoModified = true;
      } else if (req.body.borderInfo && typeof req.body.borderInfo === 'object') {
        // Update only provided fields
        if (req.body.borderInfo.detailsRequired !== undefined) order.borderInfo.detailsRequired = normalizeBoolean(req.body.borderInfo.detailsRequired);
        if (req.body.borderInfo.direction !== undefined) order.borderInfo.direction = normalizeString(req.body.borderInfo.direction) || 'CA_TO_US';
        if (req.body.borderInfo.portOfEntry !== undefined) order.borderInfo.portOfEntry = normalizeString(req.body.borderInfo.portOfEntry);
        if (req.body.borderInfo.cargoDescription !== undefined) order.borderInfo.cargoDescription = normalizeString(req.body.borderInfo.cargoDescription);
        if (req.body.borderInfo.hsCode !== undefined) order.borderInfo.hsCode = normalizeString(req.body.borderInfo.hsCode);
        if (req.body.borderInfo.brokerName !== undefined) order.borderInfo.brokerName = normalizeString(req.body.borderInfo.brokerName);
        if (req.body.borderInfo.brokerPhone !== undefined) order.borderInfo.brokerPhone = normalizeString(req.body.borderInfo.brokerPhone);
        if (req.body.borderInfo.brokerEmail !== undefined) order.borderInfo.brokerEmail = normalizeString(req.body.borderInfo.brokerEmail);
        if (req.body.borderInfo.commercialValue !== undefined) order.borderInfo.commercialValue = normalizeString(req.body.borderInfo.commercialValue);
        if (req.body.borderInfo.countryOfOrigin !== undefined) order.borderInfo.countryOfOrigin = normalizeString(req.body.borderInfo.countryOfOrigin);
        borderInfoModified = true;
      }
    }

    // Mark borderInfo as modified if it was changed
    if (borderInfoModified) {
      order.markModified('borderInfo');
    }
    // Update documents - merge uploaded files with existing or body data
    if (req.body.documents !== undefined || Object.keys(documentUrls).length > 0) {
      order.documents = order.documents || {};

      // Update with new file URLs if uploaded, otherwise keep existing or use body data
      if (documentUrls.bol) {
        order.documents.bol = documentUrls.bol;
      } else if (req.body.documents?.bol !== undefined) {
        order.documents.bol = req.body.documents.bol || order.documents.bol || null;
      }

      if (documentUrls.pod) {
        order.documents.pod = documentUrls.pod;
      } else if (req.body.documents?.pod !== undefined) {
        order.documents.pod = req.body.documents.pod || order.documents.pod || null;
      }

      if (documentUrls.customsHazmat && documentUrls.customsHazmat.length > 0) {
        order.documents.customsHazmat = documentUrls.customsHazmat;
      } else if (req.body.documents?.customsHazmat !== undefined) {
        order.documents.customsHazmat = Array.isArray(req.body.documents.customsHazmat)
          ? req.body.documents.customsHazmat
          : (order.documents.customsHazmat || []);
      }

      if (documentUrls.rateConfirmation) {
        order.documents.rateConfirmation = documentUrls.rateConfirmation;
      } else if (req.body.documents?.rateConfirmation !== undefined) {
        order.documents.rateConfirmation = req.body.documents.rateConfirmation || order.documents.rateConfirmation || null;
      }

      if (documentUrls.stampedManifest) {
        order.documents.stampedManifest = documentUrls.stampedManifest;
      } else if (req.body.documents?.stampedManifest !== undefined) {
        order.documents.stampedManifest = req.body.documents.stampedManifest || order.documents.stampedManifest || null;
      }

      if (documentUrls.loadSecurement && documentUrls.loadSecurement.length > 0) {
        order.documents.loadSecurement = documentUrls.loadSecurement;
      } else if (req.body.documents?.loadSecurement !== undefined) {
        order.documents.loadSecurement = Array.isArray(req.body.documents.loadSecurement)
          ? req.body.documents.loadSecurement
          : (order.documents.loadSecurement || []);
      }

      if (documentUrls.printedManifest) {
        order.documents.printedManifest = documentUrls.printedManifest;
      } else if (req.body.documents?.printedManifest !== undefined) {
        order.documents.printedManifest = req.body.documents.printedManifest || order.documents.printedManifest || null;
      }
    }
    if (req.body.internalNotes !== undefined) order.internalNotes = normalizeString(req.body.internalNotes);
    if (req.body.customerNotes !== undefined) order.customerNotes = normalizeString(req.body.customerNotes);

    // Update notes array
    if (req.body.notes !== undefined) {
      let parsedNotes = [];
      if (Array.isArray(req.body.notes)) {
        parsedNotes = req.body.notes;
      } else if (typeof req.body.notes === 'string') {
        try {
          parsedNotes = JSON.parse(req.body.notes);
          if (!Array.isArray(parsedNotes)) parsedNotes = [];
        } catch (e) {
          console.error('📝 [ORDER UPDATE] Error parsing notes JSON:', e);
          parsedNotes = [];
        }
      }
      order.notes = parsedNotes;
      order.markModified('notes');
      console.log('📝 [ORDER UPDATE] Saving notes:', {
        count: parsedNotes.length,
        notes: parsedNotes.length > 0 ? parsedNotes.map(n => ({ id: n.id, type: n.type, text: (n.text || '').substring(0, 50) })) : []
      });
    }

    // Update attachments array - process uploaded files first
    if (req.body.attachments !== undefined || (files.attachment && files.attachment.length > 0)) {
      let processedAttachments = Array.isArray(req.body.attachments) ? req.body.attachments : (order.attachments || []);

      // Process uploaded attachment files
      if (files.attachment && Array.isArray(files.attachment)) {
        files.attachment.forEach((file, index) => {
          const attachmentName = req.body[`attachmentName_${index}`] || file.originalname;
          const payable = req.body[`attachmentPayable_${index}`] === 'true';
          const shareWithDriver = req.body[`attachmentShareWithDriver_${index}`] === 'true';
          const fileUrl = getFileUrl(file);

          // Find existing attachment or create new one
          const existingAttachment = processedAttachments.find((att) => att.name === attachmentName && !att.url);
          if (existingAttachment) {
            existingAttachment.url = fileUrl;
            existingAttachment.fileSize = file.size || existingAttachment.fileSize || 0;
            existingAttachment.payable = payable;
            existingAttachment.shareWithDriver = shareWithDriver;
          } else {
            processedAttachments.push({
              id: Date.now() + index,
              name: attachmentName,
              url: fileUrl,
              fileSize: file.size || 0,
              payable: payable,
              shareWithDriver: shareWithDriver
            });
          }
        });
      }

      order.attachments = processedAttachments;
      order.markModified('attachments');
      console.log('📎 [ORDER UPDATE] Saving attachments:', {
        count: processedAttachments.length,
        attachments: processedAttachments.map(a => ({ id: a.id, name: a.name, url: a.url ? 'has URL' : 'no URL' }))
      });
    }

    // Log what will be saved before saving - Shipper and Receiver sections
    console.log('📋 [ORDER UPDATE] Saving fields:', {
      shipper: order.shipper ? {
        name: order.shipper.name || 'empty',
        unit: order.shipper.unit || 'empty',
        country: order.shipper.country || 'empty',
        province: order.shipper.province || 'empty',
        city: order.shipper.city || 'empty',
        postalCode: order.shipper.postalCode || 'empty',
        primaryPhone: order.shipper.primaryPhone || 'empty',
        secondaryPhone: order.shipper.secondaryPhone || 'empty',
        contact: order.shipper.contact || 'empty',
        store: order.shipper.store || 'empty',
        type: order.shipper.type || 'empty'
      } : 'null',
      receiver: order.receiver ? {
        name: order.receiver.name || 'empty',
        phone: order.receiver.phone || 'empty',
        address: order.receiver.address || 'empty',
        contact: order.receiver.contact || 'empty'
      } : 'null',
      deliveryRefNo: order.deliveryRefNo || 'empty',
      deliveryNote: order.deliveryNote || 'empty',
      deliverySkids: order.deliverySkids || 'empty',
      deliveryCases: order.deliveryCases || 'empty',
      dropOffNotes: order.dropOffNotes || 'empty',
      dropOffNumber: order.dropOffNumber || 'empty',
      commodity: order.commodity || 'empty',
      weight: order.weight || 'empty',
      temperature: order.temperature || 'empty',
      // Assignment fields
      truck: order.truck ? (order.truck._id || order.truck.id || order.truck) : 'null',
      trailer: order.trailer ? (order.trailer._id || order.trailer.id || order.trailer) : 'null',
      driver: order.driver ? (order.driver._id || order.driver.id || order.driver) : 'null',
      coDriver: order.coDriver ? (order.coDriver._id || order.coDriver.id || order.coDriver) : 'null',
      otherCharges: order.otherCharges ? `Array[${order.otherCharges.length}]` : 'null',
      borderInfo: order.borderInfo ? {
        brokerName: order.borderInfo.brokerName || 'empty',
        brokerPhone: order.borderInfo.brokerPhone || 'empty',
        brokerEmail: order.borderInfo.brokerEmail || 'empty'
      } : 'null'
    });

    try {
      await order.save();
      console.log('📋 [ORDER UPDATE] Order saved successfully');
    } catch (saveError) {
      console.error('📋 [ORDER UPDATE] Error saving order:', saveError);
      throw saveError;
    }

    // Update trailer dispatch information if trailer is assigned
    if (order.trailer) {
      try {
        const trailerUpdateData = {
          lastDispatch: order.orderNumber || order._id.toString(),
          lastDispatchDate: order.orderDate || new Date(),
        };

        // Add drop location if delivery location exists
        if (order.deliveryLocation?.place) {
          trailerUpdateData.lastDropLocation = order.deliveryLocation.place;
        } else if (order.receiver?.address) {
          trailerUpdateData.lastDropLocation = order.receiver.address;
        }

        await Trailer.findByIdAndUpdate(order.trailer, trailerUpdateData);
        console.log('🚛 [TRAILER UPDATE] Trailer dispatch info updated:', {
          trailerId: order.trailer,
          lastDispatch: trailerUpdateData.lastDispatch,
          lastDispatchDate: trailerUpdateData.lastDispatchDate,
          lastDropLocation: trailerUpdateData.lastDropLocation
        });
      } catch (trailerError) {
        console.error('🚛 [TRAILER UPDATE] Error updating trailer dispatch info:', trailerError);
        // Don't fail the order update if trailer update fails
      }
    }

    await order.populate({
      path: 'customer',
      select: 'name email phone address city state country customerDetails'
    });
    await order.populate('pickupLocation.placeId', 'name currentLocation');
    await order.populate('deliveryLocation.placeId', 'name currentLocation');

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
        // Populate truck and trailer for order details
        await order.populate([
          { path: 'truck', select: 'plateNumber internalId' }
        ]);

        // Prepare order details for cancellation emails
        const orderDetailsForEmail = {
          pickupAddress: order.pickupLocation?.place || order.shipper?.address || 'Not specified',
          dropoffAddress: order.deliveryLocation?.place || order.receiver?.address || 'Not specified',
          customerName: order.customer?.name || 'Customer',
          vehiclePlate: order.truck?.plateNumber || order.truck?.internalId || 'Not assigned'
        };

        // Send cancellation email to previous driver if replaced or unassigned (and not moved to co-driver role)
        if (driverWasReplaced && previousDriverId) {
          try {
            const previousDriver = await User.findById(previousDriverId).select('name email');
            if (previousDriver && previousDriver.email) {
              // Check if they're being moved to co-driver role
              const movedToCoDriver = previousDriverId === newCoDriverId;
              const reason = movedToCoDriver
                ? 'You have been reassigned as co-driver for this order.'
                : (newDriverId 
                  ? 'A new driver has been assigned to this order.' 
                  : 'You have been unassigned from this order.');
              
              // Only send cancellation if they're actually being replaced, not just moved to co-driver
              if (!movedToCoDriver) {
                console.log('📧 [ORDER UPDATE] Sending cancellation email to previous driver:', {
                  driverId: previousDriverId,
                  driverEmail: previousDriver.email,
                  driverName: previousDriver.name,
                  reason: reason,
                  orderId: order._id.toString()
                });

                const cancellationResult = await sendLoadCancellationEmail({
                  driverEmail: previousDriver.email,
                  driverName: previousDriver.name || 'Driver',
                  orderId: order._id.toString(),
                  orderNumber: order.customerOrderNo || order.orderNumber,
                  orderDetails: orderDetailsForEmail
                });

                if (cancellationResult.success) {
                  console.log('✅ [ORDER UPDATE] Trip cancellation email sent to previous driver:', previousDriver.email);
                } else {
                  console.warn('⚠️ [ORDER UPDATE] Failed to send cancellation email to previous driver:', cancellationResult.message);
                }
              } else {
                console.log('ℹ️ [ORDER UPDATE] Previous driver moved to co-driver role, skipping cancellation email:', previousDriverId);
              }
            } else {
              console.warn('⚠️ [ORDER UPDATE] Previous driver not found or has no email:', previousDriverId);
            }
          } catch (prevDriverError) {
            console.error('❌ [ORDER UPDATE] Error sending cancellation email to previous driver:', prevDriverError);
            // Don't fail the order update if cancellation email fails
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
                ? 'You have been reassigned as driver for this order.'
                : (newCoDriverId 
                  ? 'A new co-driver has been assigned to this order.' 
                  : 'You have been unassigned from this order.');
              
              // Only send cancellation if they're actually being replaced, not just moved to driver
              if (!movedToDriver) {
                console.log('📧 [ORDER UPDATE] Sending cancellation email to previous co-driver:', {
                  coDriverId: previousCoDriverId,
                  coDriverEmail: previousCoDriver.email,
                  coDriverName: previousCoDriver.name,
                  reason: reason,
                  orderId: order._id.toString()
                });

                const cancellationResult = await sendLoadCancellationEmail({
                  driverEmail: previousCoDriver.email,
                  driverName: previousCoDriver.name || 'Co-Driver',
                  orderId: order._id.toString(),
                  orderNumber: order.customerOrderNo || order.orderNumber,
                  orderDetails: orderDetailsForEmail
                });

                if (cancellationResult.success) {
                  console.log('✅ [ORDER UPDATE] Trip cancellation email sent to previous co-driver:', previousCoDriver.email);
                } else {
                  console.warn('⚠️ [ORDER UPDATE] Failed to send cancellation email to previous co-driver:', cancellationResult.message);
                }
              } else {
                console.log('ℹ️ [ORDER UPDATE] Previous co-driver moved to driver role, skipping cancellation email:', previousCoDriverId);
              }
            } else {
              console.warn('⚠️ [ORDER UPDATE] Previous co-driver not found or has no email:', previousCoDriverId);
            }
          } catch (prevCoDriverError) {
            console.error('❌ [ORDER UPDATE] Error sending cancellation email to previous co-driver:', prevCoDriverError);
            // Don't fail the order update if cancellation email fails
          }
        }
      } catch (cancellationError) {
        console.error('❌ [ORDER UPDATE] Error processing cancellation emails:', cancellationError);
        // Don't fail the order update if cancellation emails fail
      }
    }

    // Create notification if driver or coDriver was just assigned
    if (driverJustAssigned || coDriverJustAssigned) {
      try {
        // Populate additional fields for notification
        await order.populate([
          { path: 'driver', select: 'name email phone' },
          { path: 'coDriver', select: 'name email phone' },
          { path: 'truck', select: 'plateNumber internalId make model' },
          { path: 'trailer', select: 'plateNumber trailerNumber' }
        ]);

        // Get trip information if order has tripNo
        let tripInfo = null;
        if (order.tripNo) {
          const trip = await Trip.findOne({ tripNumber: order.tripNo })
            .populate('driver', 'name email phone')
            .lean();
          if (trip) {
            tripInfo = {
              tripNumber: trip.tripNumber,
              status: trip.status,
              driver: trip.driver
            };
          }
        }

        // Build notification message with trip, driver, and stop details
        const buildNotificationMessage = (isCoDriver = false) => {
          let message = `Order ${order.orderNumber || order._id.toString().slice(-6)} has been assigned to you.\n\n`;
          
          // Trip details
          if (tripInfo?.tripNumber) {
            message += `Trip: ${tripInfo.tripNumber}\n`;
            if (tripInfo.status) {
              message += `Trip Status: ${tripInfo.status}\n`;
            }
          }
          
          // Driver details
          if (order.driver && !isCoDriver) {
            message += `Driver: ${order.driver.name || 'Unknown'}\n`;
          }
          if (order.coDriver && isCoDriver) {
            message += `Co-Driver: ${order.coDriver.name || 'Unknown'}\n`;
          }
          if (order.driver && order.coDriver && !isCoDriver) {
            message += `Co-Driver: ${order.coDriver.name || 'Unknown'}\n`;
          }
          
          // Vehicle details
          if (order.truck) {
            message += `Vehicle: ${order.truck.plateNumber || order.truck.internalId || 'N/A'}\n`;
          }
          if (order.trailer) {
            message += `Trailer: ${order.trailer.plateNumber || order.trailer.trailerNumber || 'N/A'}\n`;
          }
          
          // Pickup and delivery locations
          message += `\nPickup: ${order.pickupLocation?.place || order.shipper?.address || 'N/A'}`;
          if (order.shipper?.city) {
            message += `, ${order.shipper.city}`;
            if (order.shipper.province) {
              message += `, ${order.shipper.province}`;
            }
          }
          message += `\n`;
          
          message += `Delivery: ${order.deliveryLocation?.place || order.receiver?.address || 'N/A'}\n`;
          
          // Stops information
          if (order.stops && order.stops.length > 0) {
            message += `\nPickup Stops (${order.stops.length}):\n`;
            order.stops.forEach((stop, idx) => {
              message += `  ${stop.stop || idx + 1}. ${stop.address || stop.shipper || 'N/A'}\n`;
            });
          }
          
          if (order.receiverStops && order.receiverStops.length > 0) {
            message += `\nDelivery Stops (${order.receiverStops.length}):\n`;
            order.receiverStops.forEach((stop, idx) => {
              message += `  ${stop.stop || idx + 1}. ${stop.address || stop.receiver || 'N/A'}\n`;
            });
          }
          
          // Commodity and weight
          if (order.commodity) {
            message += `\nCommodity: ${order.commodity}`;
            if (order.weight) {
              message += ` (${order.weight} ${order.weightUnit || 'kg'})`;
            }
          }
          
          return message;
        };

        // Create notification for driver if assigned
        if (driverJustAssigned && newDriverId) {
          const notificationMessage = buildNotificationMessage(false);
          await ActivityLog.create({
            driver: newDriverId,
            action: 'Order Assigned',
            changeSummary: notificationMessage,
            performedBy: null // System-generated notification
          });
          console.log('📢 [ORDER ASSIGNMENT] Notification created for driver:', newDriverId);
        }

        // Create notification for co-driver if assigned
        if (coDriverJustAssigned && newCoDriverId) {
          const notificationMessage = buildNotificationMessage(true);
          await ActivityLog.create({
            driver: newCoDriverId,
            action: 'Order Assigned',
            changeSummary: notificationMessage,
            performedBy: null // System-generated notification
          });
          console.log('📢 [ORDER ASSIGNMENT] Notification created for co-driver:', newCoDriverId);
        }

        // ✅ Send assignment emails to new drivers (after cancellation emails have been sent)
        // Note: If the same person is assigned as both driver and co-driver, they will receive 2 separate emails (one for each role)
        // Send email to new driver if assigned (first time or replacement)
        if (driverJustAssigned && newDriverId && order.driver && order.driver.email) {
          try {
            const isSameAsCoDriver = newDriverId === newCoDriverId;
            console.log('📧 [ORDER UPDATE] Sending assignment email to new driver:', {
              driverId: newDriverId,
              driverEmail: order.driver.email,
              driverName: order.driver.name,
              orderId: order._id.toString(),
              orderNumber: order.customerOrderNo || order.orderNumber,
              isAlsoCoDriver: isSameAsCoDriver ? 'Yes (will receive 2 emails)' : 'No'
            });

            const assignmentResult = await sendLoadAssignmentEmail({
              driverEmail: order.driver.email,
              driverName: order.driver.name || 'Driver',
              loadId: order._id.toString(),
              loadInternalId: order.customerOrderNo || order.orderNumber,
              loadDetails: {
                pickupAddress: order.pickupLocation?.place || order.shipper?.address || 'Not specified',
                dropoffAddress: order.deliveryLocation?.place || order.receiver?.address || 'Not specified',
                customerName: order.customer?.name || 'Customer',
                vehiclePlate: order.truck?.plateNumber || order.truck?.internalId || 'Not assigned',
                assignedAt: order.assignedAt || new Date()
              }
            });

            if (assignmentResult.success) {
              console.log('✅ [ORDER UPDATE] Load assignment email sent to new driver:', order.driver.email);
            } else {
              console.warn('⚠️ [ORDER UPDATE] Failed to send assignment email to new driver:', assignmentResult.message);
            }
          } catch (driverEmailError) {
            console.error('❌ [ORDER UPDATE] Error sending assignment email to new driver:', driverEmailError);
            // Don't fail the order update if email fails
          }
        } else if (newDriverId && (!order.driver || !order.driver.email)) {
          console.warn('⚠️ [ORDER UPDATE] New driver assigned but driver not populated or has no email:', {
            newDriverId: newDriverId,
            hasDriver: !!order.driver,
            hasEmail: !!order.driver?.email
          });
        }

        // Send email to new co-driver if assigned (first time or replacement)
        // Note: Even if same person as driver, they will receive a separate email for co-driver role
        if (coDriverJustAssigned && newCoDriverId && order.coDriver && order.coDriver.email) {
          try {
            const isSameAsDriver = newCoDriverId === newDriverId;
            console.log('📧 [ORDER UPDATE] Sending assignment email to new co-driver:', {
              coDriverId: newCoDriverId,
              coDriverEmail: order.coDriver.email,
              coDriverName: order.coDriver.name,
              orderId: order._id.toString(),
              orderNumber: order.customerOrderNo || order.orderNumber,
              isAlsoDriver: isSameAsDriver ? 'Yes (will receive 2 emails total)' : 'No'
            });

            const assignmentResult = await sendLoadAssignmentEmail({
              driverEmail: order.coDriver.email,
              driverName: order.coDriver.name || 'Co-Driver',
              loadId: order._id.toString(),
              loadInternalId: order.customerOrderNo || order.orderNumber,
              loadDetails: {
                pickupAddress: order.pickupLocation?.place || order.shipper?.address || 'Not specified',
                dropoffAddress: order.deliveryLocation?.place || order.receiver?.address || 'Not specified',
                customerName: order.customer?.name || 'Customer',
                vehiclePlate: order.truck?.plateNumber || order.truck?.internalId || 'Not assigned',
                assignedAt: order.assignedAt || new Date()
              }
            });

            if (assignmentResult.success) {
              console.log('✅ [ORDER UPDATE] Load assignment email sent to new co-driver:', order.coDriver.email);
            } else {
              console.warn('⚠️ [ORDER UPDATE] Failed to send assignment email to new co-driver:', assignmentResult.message);
            }
          } catch (coDriverEmailError) {
            console.error('❌ [ORDER UPDATE] Error sending assignment email to new co-driver:', coDriverEmailError);
            // Don't fail the order update if email fails
          }
        } else if (newCoDriverId && (!order.coDriver || !order.coDriver.email)) {
          console.warn('⚠️ [ORDER UPDATE] New co-driver assigned but co-driver not populated or has no email:', {
            newCoDriverId: newCoDriverId,
            hasCoDriver: !!order.coDriver,
            hasEmail: !!order.coDriver?.email
          });
        }
      } catch (notificationError) {
        console.error('❌ [ORDER ASSIGNMENT] Error creating notification:', notificationError);
        // Don't fail the order update if notification creation fails
      }
    }

    // Convert to plain object to ensure all fields are included in response
    const orderObj = order.toObject();

    // Ensure borderInfo always exists in response
    if (!orderObj.borderInfo) {
      orderObj.borderInfo = {
        detailsRequired: false,
        direction: 'CA_TO_US',
        portOfEntry: '',
        cargoDescription: '',
        hsCode: '',
        brokerName: '',
        brokerPhone: '',
        brokerEmail: '',
        commercialValue: '',
        countryOfOrigin: ''
      };
    }

    // Ensure customs fields are always present
    if (orderObj.pars === undefined) orderObj.pars = '';
    if (orderObj.paps === undefined) orderObj.paps = '';
    if (orderObj.trailerSealNo === undefined) orderObj.trailerSealNo = '';

    // Ensure otherCharges is always an array
    if (!Array.isArray(orderObj.otherCharges)) {
      orderObj.otherCharges = [];
    }

    // Ensure notes is always an array
    if (!Array.isArray(orderObj.notes)) {
      orderObj.notes = [];
    }

    // Ensure attachments is always an array
    if (!Array.isArray(orderObj.attachments)) {
      orderObj.attachments = [];
    }

    console.log('📤 [ORDER UPDATE] Returning notes and attachments in response:', {
      notesCount: orderObj.notes?.length || 0,
      attachmentsCount: orderObj.attachments?.length || 0,
      notes: orderObj.notes?.slice(0, 2) || [],
      attachments: orderObj.attachments?.slice(0, 2) || []
    });

    // ALWAYS include validation results if validation was performed
    console.log('📋 [ORDER UPDATE] Preparing response with validation results:', {
      hasValidationResult: !!validationResult,
      valid: validationResult?.valid,
      errors: validationResult?.errors?.length || 0,
      warnings: validationResult?.warnings?.length || 0,
      missing: validationResult?.missing?.length || 0
    });

    // Include validation results in response if available
    const responseData = {
      success: true,
      message: "Order updated successfully",
      data: orderObj
    };

    if (validationResult) {
      console.log('📋 [ORDER UPDATE] Including validation results in response:', {
        valid: validationResult.valid,
        errors: validationResult.errors?.length || 0,
        warnings: validationResult.warnings?.length || 0,
        missing: validationResult.missing?.length || 0
      });
      responseData.validation = {
        valid: validationResult.valid,
        errors: validationResult.errors || [],
        warnings: validationResult.warnings || [],
        missing: validationResult.missing || [],
        documentDetails: validationResult.documentDetails || []
      };

      // Always show validation results, even if valid
      if (validationResult.errors && validationResult.errors.length > 0) {
        const errorSummary = validationResult.errors.map(e => e.message).join('; ');
        responseData.message += ` ⚠️ Document validation found ${validationResult.errors.length} error(s): ${errorSummary}`;
      }
      if (validationResult.warnings && validationResult.warnings.length > 0) {
        responseData.message += ` ⚠️ Document validation completed with ${validationResult.warnings.length} warning(s).`;
      }
      if (validationResult.missing && validationResult.missing.length > 0) {
        responseData.message += ` ⚠️ ${validationResult.missing.length} required document(s) missing.`;
      }
    }


    // =================================================================
    // 🔄 AUTO-INVOICE GENERATION
    // =================================================================
    // Condition: Status changes to 'delivered'/ 'completed' AND no existing invoice
    const isDelivered = ['delivered', 'completed'].includes(order.status);
    const isStatusUpdate = req.body.status && ['delivered', 'completed'].includes(req.body.status);

    console.log(`🔍 [AUTO-INVOICE CHECK] OrderID: ${orderObj.orderNumber}, OrderStatus: ${order.status}, ReqStatus: ${req.body.status}`);
    console.log(`   Condition (isDelivered && isStatusUpdate): ${isDelivered} && ${isStatusUpdate}`);

    if (isDelivered && isStatusUpdate) {
      console.log('   Checking for existing invoice...');
      // Use dynamic import for Invoice to avoid circular dependency issues if any
      const { Invoice } = await import("../models/hr/invoiceModel.js");
      const existingInvoice = await Invoice.findOne({ orderId: order._id });

      if (!existingInvoice) {
        console.log(`🧾 [AUTO-INVOICE] No existing invoice. Generating for Order ${orderObj.orderNumber}...`);

        // Fetch customer details if not fully populated
        let clientName = 'Unknown Client';
        let clientEmail = '';
        let clientAddress = '';
        let clientPhone = '';

        console.log('   Resolving Customer...');
        // Ensure customer is populated or fetch it
        if (order.customer) {
          console.log('   Customer field exists on order object');
          // If customer is an ID (object id), we might need to fetch it
          if (order.customer.name) {
            clientName = order.customer.name;
            clientEmail = order.customer.email;
            clientPhone = order.customer.phone;
            clientAddress = order.customer.address;
            console.log('   Using populated customer data');
          } else {
            console.log('   Customer might be ID, fetching from User model...');
            // Try to find from User model using existing import
            const { User } = await import("../models/driver/userModel.js");
            const customerUser = await User.findById(order.customer);
            if (customerUser) {
              clientName = customerUser.name;
              clientEmail = customerUser.email;
              clientPhone = customerUser.phone;
              clientAddress = customerUser.address || customerUser.customerDetails?.address;
              console.log('   Fetched customer user:', clientName);
            } else {
              console.warn('   ⚠️ Could not find Customer User by ID');
            }
          }
        } else {
          console.warn('   ⚠️ Order has no customer field!');
        }

        // Use totalAmount OR rate OR 0
        const invoiceAmountVal = order.totalAmount || order.rate || 0;
        const invoiceAmountStr = String(invoiceAmountVal);
        console.log(`   Invoice Amount: ${invoiceAmountVal} (as string: ${invoiceAmountStr})`);

        const newInvoice = new Invoice({
          orderId: order._id,
          clientName: clientName || `Client for Order ${orderObj.orderNumber}`,  // Fallback to avoid validation error
          clientEmail: clientEmail,
          clientPhone: clientPhone,
          clientAddress: clientAddress,
          amount: invoiceAmountStr,
          currency: order.currency || order.rateCurrency || 'CAD',
          status: 'pending',
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default Net 30
          invoiceDate: new Date(),
          company: order.company,
          serviceBreakdown: [{
            description: `Freight Charges - Order #${orderObj.orderNumber}`,
            unitPrice: invoiceAmountVal,
            amount: invoiceAmountVal,
            quantity: 1
          }]
        });

        try {
          const savedInvoice = await newInvoice.save();
          console.log(`✅ [AUTO-INVOICE] Invoice created successfully: ${savedInvoice._id}`);
        } catch (invErr) {
          console.error(`❌ [AUTO-INVOICE] Failed to save invoice:`, invErr);
          console.error('   Validation Errors:', invErr.errors);
        }
      } else {
        console.log(`ℹ️ [AUTO-INVOICE] Invoice already exists for this order: ${existingInvoice._id}`);
      }
    } else {
      console.log('   Skipping Auto-Invoice (Condition not met)');
    }

    // =================================================================
    // 🔄 PAYMENT STATUS SYNC (Order -> Invoice)
    // =================================================================
    if (req.body.accountingStatus) {
      const { Invoice } = await import("../models/hr/invoiceModel.js");
      const invoiceStatus = (req.body.accountingStatus === 'paid') ? 'paid' : 'pending';
      const syncResult = await Invoice.findOneAndUpdate(
        { orderId: order._id },
        { status: invoiceStatus },
        { new: true }
      );
      if (syncResult) {
        console.log(`🔄 [SYNC] Updated Invoice ${syncResult._id} status to ${invoiceStatus}`);
      }
    }

    res.json(responseData);
  } catch (error) {
    console.error("Update Order Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Order Attachment Signed URL
export const getOrderAttachmentSignedUrl = async (req, res) => {
  try {
    const { id, attachmentId } = req.params;
    const { disposition = 'inline' } = req.query; // 'inline' or 'attachment'
    const driverId = req.user._id;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Find order and verify access
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found."
      });
    }

    // Verify access: drivers can access orders assigned to them, others need company access
    if (req.user.role === 'driver' || req.user.role === 'codriver') {
      // For drivers, ensure they are assigned to this order (as driver or co-driver)
      const isDriver = order.driver && order.driver.toString() === driverId.toString();
      const isCoDriver = order.coDriver && order.coDriver.toString() === driverId.toString();
      
      if (!isDriver && !isCoDriver) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to access attachments for this order."
        });
      }
    } else if (!isSuperadmin && order.company.toString() !== companyId?.toString()) {
      // For non-drivers, verify company access (unless superadmin)
      return res.status(403).json({
        success: false,
        message: "You don't have permission to access attachments for this order."
      });
    }

    // Find the attachment
    const attachment = order.attachments?.find(
      (att) => att.id?.toString() === attachmentId || att._id?.toString() === attachmentId
    );

    if (!attachment || !attachment.url) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found."
      });
    }

    // Check if attachment is shared with driver
    if (req.user.role === 'driver' || req.user.role === 'codriver') {
      if (!attachment.shareWithDriver) {
        return res.status(403).json({
          success: false,
          message: "This attachment is not shared with drivers."
        });
      }
    }

    const fileUrl = attachment.url;

    // Check if it's an S3 URL
    const isS3Url = fileUrl.includes('amazonaws.com') || fileUrl.includes('s3');

    if (isS3Url) {
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const { s3 } = await import("../config/awsConfig.js");

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
        if (key.includes('?')) key = key.split('?')[0];
        if (key.includes('&')) key = key.split('&')[0];

        // Determine content type from file extension
        const getContentType = (url) => {
          const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
          const typeMap = {
            'pdf': 'application/pdf',
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
          return typeMap[ext] || 'application/octet-stream';
        };

        const contentType = getContentType(fileUrl);
        const contentDisposition = disposition === 'attachment'
          ? `attachment; filename="${encodeURIComponent(attachment.name || 'document')}"`
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
        console.error('Error generating signed URL for order attachment:', s3Error);
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
    console.error("Error getting signed order attachment URL:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while getting the attachment URL."
    });
  }
};

// Delete Order
export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let query = { _id: id };
    if (!isSuperadmin && userCompanyId) {
      query.company = userCompanyId;
    }

    const order = await Order.findOneAndDelete(query);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    res.json({
      success: true,
      message: "Order deleted successfully"
    });
  } catch (error) {
    console.error("Delete Order Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create Bulk Orders
export const createBulkOrders = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating orders. Go to Company Settings to set up your company."
        });
      }
    }

    const companyId = getUserCompanyId(req.user);
    const { orders } = req.body;

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of orders"
      });
    }

    const createdOrders = [];
    const errors = [];

    for (let i = 0; i < orders.length; i++) {
      const orderData = orders[i];

      try {
        // Build pickup location data
        let pickupLocationData = {
          placeId: null,
          place: '',
          latitude: '',
          longitude: ''
        };

        if (orderData.pickupLocation?.placeId) {
          const place = await Place.findById(orderData.pickupLocation.placeId);
          if (place && place.currentLocation) {
            pickupLocationData = {
              placeId: place._id,
              place: place.currentLocation.address || place.name || '',
              latitude: String(place.currentLocation.latitude || ''),
              longitude: String(place.currentLocation.longitude || '')
            };
          }
        } else if (orderData.pickupLocation) {
          pickupLocationData = {
            placeId: normalizeObjectId(orderData.pickupLocation.placeId),
            place: normalizeString(orderData.pickupLocation.place || orderData.pickupLocation),
            latitude: normalizeString(orderData.pickupLocation.latitude || ''),
            longitude: normalizeString(orderData.pickupLocation.longitude || '')
          };
        }

        // Build delivery location data
        let deliveryLocationData = {
          placeId: null,
          place: '',
          latitude: '',
          longitude: ''
        };

        if (orderData.deliveryLocation?.placeId) {
          const place = await Place.findById(orderData.deliveryLocation.placeId);
          if (place && place.currentLocation) {
            deliveryLocationData = {
              placeId: place._id,
              place: place.currentLocation.address || place.name || '',
              latitude: String(place.currentLocation.latitude || ''),
              longitude: String(place.currentLocation.longitude || '')
            };
          }
        } else if (orderData.deliveryLocation) {
          deliveryLocationData = {
            placeId: normalizeObjectId(orderData.deliveryLocation.placeId),
            place: normalizeString(orderData.deliveryLocation.place || orderData.deliveryLocation),
            latitude: normalizeString(orderData.deliveryLocation.latitude || ''),
            longitude: normalizeString(orderData.deliveryLocation.longitude || '')
          };
        }

        // Parse dates
        const pickupDate = orderData.pickupDate ? new Date(orderData.pickupDate) : null;
        const deliveryDate = orderData.deliveryDate ? new Date(orderData.deliveryDate) : null;

        // Build order data
        const orderObj = {
          customerOrderNo: normalizeString(orderData.customerOrderNo),
          tripNo: normalizeString(orderData.tripNo || ''),
          orderType: normalizeString(orderData.orderType) || (orderData.loadType === 'LTL' ? 'LTL' : 'FTL'),
          freightOn: normalizeString(orderData.freightOn) || 'Order',
          salesman: normalizeString(orderData.salesman || ''),
          orderNotes: normalizeString(orderData.orderNotes || ''),
          customer: normalizeObjectId(orderData.customer || orderData.customerId),
          pickupLocation: pickupLocationData,
          pickupDate: pickupDate,
          pickupTime: normalizeString(orderData.pickupTime || ''),
          pickupAppointment: normalizeBoolean(orderData.pickupAppointment || false),
          pickupRefNo: normalizeString(orderData.pickupRefNo || ''),
          pickupNote: normalizeString(orderData.pickupNote || ''),
          deliveryLocation: deliveryLocationData,
          deliveryDate: deliveryDate,
          deliveryTime: normalizeString(orderData.deliveryTime || ''),
          deliveryAppointment: normalizeBoolean(orderData.deliveryAppointment || false),
          deliveryRefNo: normalizeString(orderData.deliveryRefNo || ''),
          deliveryNote: normalizeString(orderData.deliveryNote || ''),
          commodity: normalizeString(orderData.commodity || ''),
          valueOfGoods: normalizeNumber(orderData.valueOfGoods || orderData.amount || 0),
          valueOfGoodsCurrency: normalizeString(orderData.valueOfGoodsCurrency || orderData.currency) || 'CAD',
          equipment: Array.isArray(orderData.equipment) ? orderData.equipment : [],
          noOfPackages: normalizeNumber(orderData.noOfPackages || 0),
          noOfPackagesType: normalizeString(orderData.noOfPackagesType || ''),
          weight: normalizeNumber(orderData.weight || 0),
          weightUnit: normalizeString(orderData.weightUnit || 'kg'),
          temperature: orderData.temperature ? normalizeNumber(orderData.temperature) : null,
          temperatureUnit: normalizeString(orderData.temperatureUnit || 'Celsius'),
          weatherConditions: {
            snow: normalizeBoolean(orderData.weatherConditions?.snow) || false,
            highTemperature: normalizeBoolean(orderData.weatherConditions?.highTemperature) || false
          },
          dimensions: {
            length: normalizeNumber(orderData.dimensions?.length || 0),
            width: normalizeNumber(orderData.dimensions?.width || 0),
            height: normalizeNumber(orderData.dimensions?.height || 0),
            unit: normalizeString(orderData.dimensions?.unit || 'cm')
          },
          distance: normalizeNumber(orderData.distance || 0),
          additionalInfo: {
            CSA: normalizeBoolean(orderData.additionalInfo?.CSA || false),
            CTPAT: normalizeBoolean(orderData.additionalInfo?.CTPAT || false),
            PIP: normalizeBoolean(orderData.additionalInfo?.PIP || false),
            HAZMAT: normalizeBoolean(orderData.additionalInfo?.HAZMAT || false),
            TARP: normalizeBoolean(orderData.additionalInfo?.TARP || false),
            OverDimension: normalizeBoolean(orderData.additionalInfo?.OverDimension || false)
          },
          status: normalizeOrderStatus(orderData.status) || 'quoted',
          accountingStatus: normalizeString(orderData.accountingStatus) || 'pending',
          totalAmount: normalizeNumber(orderData.totalAmount || orderData.grossTotalFreight || orderData.valueOfGoods || 0),
          currency: normalizeString(orderData.currency || orderData.valueOfGoodsCurrency) || 'CAD',
          driver: normalizeObjectId(orderData.driver),
          truck: normalizeObjectId(orderData.truck),
          trailer: normalizeObjectId(orderData.trailer),
          company: companyId || null
        };

        // Validation
        if (!orderObj.customer) {
          errors.push({
            index: i,
            message: `Order ${i + 1}: Customer is required`
          });
          continue;
        }

        const order = new Order(orderObj);
        await order.save();

        // Populate references
        await order.populate({
          path: 'customer',
          select: 'name email phone address city state country customerDetails'
        });
        await order.populate('pickupLocation.placeId', 'name currentLocation');
        await order.populate('deliveryLocation.placeId', 'name currentLocation');

        createdOrders.push(order);
      } catch (error) {
        console.error(`Error creating order ${i + 1}:`, error);
        errors.push({
          index: i,
          message: `Order ${i + 1}: ${error.message}`
        });
      }
    }

    if (createdOrders.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No orders were created",
        errors: errors
      });
    }

    res.status(201).json({
      success: true,
      message: `${createdOrders.length} order(s) created successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
      data: createdOrders,
      errors: errors.length > 0 ? errors : undefined,
      counts: {
        created: createdOrders.length,
        failed: errors.length,
        total: orders.length
      }
    });
  } catch (error) {
    console.error("Create Bulk Orders Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Note: autoExtractOrderData endpoint has been removed
// Document validation is now integrated into createOrder and updateOrder

// Get AI suggestions for order fields based on user input and previous orders
export const getOrderSuggestions = async (req, res) => {
  try {
    const { field, value, customerId } = req.query;

    if (!field || !value || value.trim().length < 2) {
      return res.json({
        success: true,
        data: []
      });
    }

    const companyId = getUserCompanyId(req.user);
    const baseFilter = await getCombinedFilter(req.user, companyId ? { company: companyId } : null) || {};

    // Get previous orders for this customer (if customerId provided) or all orders
    const orderQuery = { ...baseFilter };
    if (customerId) {
      orderQuery.customer = customerId;
    }

    // Get recent orders (last 50) to analyze patterns
    const recentOrders = await Order.find(orderQuery)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Build context from previous orders
    // Note: shipper/receiver might be stored in order object even if not in schema
    const orderContext = recentOrders.map(orderObj => ({
      commodity: orderObj.commodity,
      orderType: orderObj.orderType,
      equipment: orderObj.equipment,
      weight: orderObj.weight,
      weightUnit: orderObj.weightUnit,
      noOfPackages: orderObj.noOfPackages,
      noOfPackagesType: orderObj.noOfPackagesType,
      valueOfGoods: orderObj.valueOfGoods,
      valueOfGoodsCurrency: orderObj.valueOfGoodsCurrency,
      temperature: orderObj.temperature,
      temperatureUnit: orderObj.temperatureUnit,
      dimensions: orderObj.dimensions,
      additionalInfo: orderObj.additionalInfo,
      shipperName: orderObj.shipper?.name || null,
      shipperPhone: orderObj.shipper?.phone || null,
      shipperEmail: orderObj.shipper?.email || null,
      receiverName: orderObj.receiver?.name || null,
      receiverPhone: orderObj.receiver?.phone || null,
      receiverAddress: orderObj.receiver?.address || null
    })).filter(o => {
      // Filter based on field being typed
      if (field === 'commodity' && o.commodity) return o.commodity.toLowerCase().includes(value.toLowerCase());
      if (field === 'shipperName' && o.shipperName) return o.shipperName.toLowerCase().includes(value.toLowerCase());
      if (field === 'receiverName' && o.receiverName) return o.receiverName.toLowerCase().includes(value.toLowerCase());
      return true;
    });

    // Use AI to generate suggestions based on context
    const prompt = `Based on the following previous orders and the user's current input, provide 5 relevant suggestions for the field "${field}" with current value "${value}".

Previous Orders Context:
${JSON.stringify(orderContext.slice(0, 10), null, 2)}

User is typing in field: ${field}
Current value: ${value}

Provide suggestions as a JSON array of strings. Only return the most relevant and commonly used values. If the field is a number, provide number suggestions. If it's text, provide text suggestions.

Return format:
{
  "suggestions": ["suggestion1", "suggestion2", "suggestion3", "suggestion4", "suggestion5"]
}`;

    const aiResult = await callOpenAI(prompt, {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 500,
      responseFormat: { type: 'json_object' }
    });

    let suggestions = [];

    if (aiResult.success) {
      try {
        const parsed = typeof aiResult.data === 'string' ? JSON.parse(aiResult.data) : aiResult.data;
        suggestions = parsed.suggestions || [];
      } catch (e) {
        console.error('Error parsing AI suggestions:', e);
      }
    }

    // Also get direct matches from previous orders
    const directMatches = [];
    if (field === 'commodity') {
      const unique = [...new Set(recentOrders.map(o => o.commodity).filter(Boolean))];
      directMatches.push(...unique.filter(c => c.toLowerCase().includes(value.toLowerCase())).slice(0, 5));
    } else if (field === 'shipperName') {
      const unique = [...new Set(recentOrders.map(o => o.shipper?.name).filter(Boolean))];
      directMatches.push(...unique.filter(n => n.toLowerCase().includes(value.toLowerCase())).slice(0, 5));
    } else if (field === 'receiverName') {
      const unique = [...new Set(recentOrders.map(o => o.receiver?.name).filter(Boolean))];
      directMatches.push(...unique.filter(n => n.toLowerCase().includes(value.toLowerCase())).slice(0, 5));
    }

    // Combine and deduplicate
    const allSuggestions = [...new Set([...directMatches, ...suggestions])].slice(0, 5);

    res.json({
      success: true,
      data: allSuggestions
    });
  } catch (error) {
    console.error("Get Order Suggestions Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get suggestions'
    });
  }
};

// ✅ Get Completed Orders for a Driver (for payroll calculation)
// This function gets completed orders directly (not through trips)
export const getCompletedOrdersByDriver = async (req, res) => {
  try {
    const driverId = req.params.id;
    const { startDate, endDate } = req.query;

    console.log('🔍 getCompletedOrdersByDriver called:', { driverId, startDate, endDate });

    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({ success: false, message: "Invalid driver ID" });
    }

    // Get driver to fetch salary rates
    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    // Get salary per mile rates for this driver
    const driverBaseRate = driver.details?.salaryPerMile || driver.details?.mileRate || 0;
    const driverTeamRate = driver.details?.mileRateTeam || 0;
    const driverEmptyRate = driver.details?.emptyMileRate || 0;
    const driverEmptyTeamRate = driver.details?.emptyMileRateTeam || 0;
    const driverSnowRate = driver.details?.salaryPerMileSnow || 0;
    const driverHighTempRate = driver.details?.salaryPerMileHighTemp || 0;
    const highTempThreshold = driver.details?.highTempThreshold || 35; // Default 35°C
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
      mileRate: driverMileRate
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

    // Build match query - get completed orders for the driver (as primary driver OR co-driver)
    // NOTE: Order model uses lowercase status values like 'completed'
    const driverObjectId = new mongoose.Types.ObjectId(driverId);
    const matchQuery = {
      $or: [
        { driver: driverObjectId },
        { coDriver: driverObjectId }
      ],
      status: 'completed' // Match the enum in orderModel (lowercase)
    };

    // Add company filter
    if (companyId && !isSuperadmin) {
      const companyObjectId = new mongoose.Types.ObjectId(companyId);
      matchQuery.company = { $in: [companyObjectId, companyId] };
    }

    // Add date filtering if provided - filter by deliveryDate or updatedAt
    if (startDate || endDate) {
      const dateConditions = [];
      if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        dateConditions.push(
          { deliveryDate: { $gte: start, $lte: end } },
          { updatedAt: { $gte: start, $lte: end } }
        );
      } else if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateConditions.push(
          { deliveryDate: { $gte: start } },
          { updatedAt: { $gte: start } }
        );
      } else if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateConditions.push(
          { deliveryDate: { $lte: end } },
          { updatedAt: { $lte: end } }
        );
      }

      if (dateConditions.length > 0) {
        // Use $and to combine driver filter with date filter
        matchQuery.$and = [
          {
            $or: [
              { driver: driverObjectId },
              { coDriver: driverObjectId }
            ]
          },
          { $or: dateConditions }
        ];
        // Remove the top-level $or since we're using $and now
        delete matchQuery.$or;
      }
    }

    // Get completed orders with proper population
    const completedOrders = await Order.find(matchQuery)
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'unitNumber plateNumber internalId make model type')
      .populate('trailer', 'unitNumber plateNumber internalId')
      .populate({
        path: 'pickupLocation.placeId',
        select: 'name currentLocation.address currentLocation.latitude currentLocation.longitude',
        model: 'Place'
      })
      .populate({
        path: 'deliveryLocation.placeId',
        select: 'name currentLocation.address currentLocation.latitude currentLocation.longitude',
        model: 'Place'
      })
      .sort({ deliveryDate: -1, updatedAt: -1 })
      .lean();

    console.log(`📦 Found ${completedOrders.length} completed orders for driver`);

    // Calculate distance and earnings for each order
    const ordersWithCalculations = await Promise.all(completedOrders.map(async (order) => {
      let distance = 0;
      let pickupLocation = order.pickupLocation;
      let deliveryLocation = order.deliveryLocation;

      try {
        // Extract pickup location
        if (pickupLocation && pickupLocation.placeId && typeof pickupLocation.placeId === 'object') {
          const place = pickupLocation.placeId;
          if (place.currentLocation && place.currentLocation.latitude && place.currentLocation.longitude) {
            pickupLocation = {
              place: place.name || place.currentLocation.address || pickupLocation.place || 'Unknown',
              latitude: String(place.currentLocation.latitude),
              longitude: String(place.currentLocation.longitude)
            };
          } else if (pickupLocation.latitude && pickupLocation.longitude) {
            pickupLocation = {
              place: pickupLocation.place || place.name || 'Unknown',
              latitude: String(pickupLocation.latitude),
              longitude: String(pickupLocation.longitude)
            };
          } else if (pickupLocation.place) {
            pickupLocation = {
              place: pickupLocation.place || place.name || 'Unknown',
              latitude: '',
              longitude: ''
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

        // Extract delivery location
        if (deliveryLocation && deliveryLocation.placeId && typeof deliveryLocation.placeId === 'object') {
          const place = deliveryLocation.placeId;
          if (place.currentLocation && place.currentLocation.latitude && place.currentLocation.longitude) {
            deliveryLocation = {
              place: place.name || place.currentLocation.address || deliveryLocation.place || 'Unknown',
              latitude: String(place.currentLocation.latitude),
              longitude: String(place.currentLocation.longitude)
            };
          } else if (deliveryLocation.latitude && deliveryLocation.longitude) {
            deliveryLocation = {
              place: deliveryLocation.place || place.name || 'Unknown',
              latitude: String(deliveryLocation.latitude),
              longitude: String(deliveryLocation.longitude)
            };
          } else if (deliveryLocation.place) {
            deliveryLocation = {
              place: deliveryLocation.place || place.name || 'Unknown',
              latitude: '',
              longitude: ''
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

        // Ensure we have location objects
        if (!pickupLocation) pickupLocation = { place: 'Unknown', latitude: '', longitude: '' };
        if (!deliveryLocation) deliveryLocation = { place: 'Unknown', latitude: '', longitude: '' };

        // Geocode locations if addresses exist but coordinates are missing
        if (pickupLocation.place && pickupLocation.place !== 'Unknown' && (!pickupLocation.latitude || !pickupLocation.longitude)) {
          const coords = await getCoordinatesFromAddress(pickupLocation.place);
          if (coords && coords.latitude && coords.longitude) {
            pickupLocation.latitude = coords.latitude.toString();
            pickupLocation.longitude = coords.longitude.toString();
          }
        }

        if (deliveryLocation.place && deliveryLocation.place !== 'Unknown' && (!deliveryLocation.latitude || !deliveryLocation.longitude)) {
          const coords = await getCoordinatesFromAddress(deliveryLocation.place);
          if (coords && coords.latitude && coords.longitude) {
            deliveryLocation.latitude = coords.latitude.toString();
            deliveryLocation.longitude = coords.longitude.toString();
          }
        }

        // Distance calculation priority:
        // 1. order.distance
        // 2. Calculate from coordinates (Google Maps/Haversine)
        if (order.distance && order.distance > 0) {
          distance = order.distance;
        } else if (pickupLocation.latitude && deliveryLocation.latitude) {
          // Calculate distance from coordinates
          const origin = {
            latitude: parseFloat(pickupLocation.latitude),
            longitude: parseFloat(pickupLocation.longitude)
          };
          const destination = {
            latitude: parseFloat(deliveryLocation.latitude),
            longitude: parseFloat(deliveryLocation.longitude)
          };

          if (!isNaN(origin.latitude) && !isNaN(origin.longitude) && !isNaN(destination.latitude) && !isNaN(destination.longitude)) {
            // Try Google Maps route distance first
            const routeDistance = await getRouteDistance(origin, destination);
            if (routeDistance !== null && routeDistance > 0) {
              distance = routeDistance;
            } else {
              // Fallback to haversine
              distance = haversineDistance(
                origin.latitude,
                origin.longitude,
                destination.latitude,
                destination.longitude
              );
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error calculating distance for order ${order.orderNumber || order._id}:`, error.message);
        distance = 0;
      }

      // Convert km to miles (1 km = 0.621371 miles)
      const distanceInMiles = distance * 0.621371;

      // Check weather conditions
      let hasSnow = false;
      let hasHighTemp = false;

      if (order.weatherConditions?.snow === true) {
        hasSnow = true;
      }

      if (order.weatherConditions?.highTemperature === true) {
        hasHighTemp = true;
      } else if (order.temperature !== null && order.temperature !== undefined) {
        // Auto-detect from temperature if not explicitly set
        const tempInCelsius = order.temperatureUnit === 'Fahrenheit'
          ? (order.temperature - 32) * 5 / 9
          : order.temperature;
        hasHighTemp = tempInCelsius >= highTempThreshold;
      }

      // Determine if this driver is the primary driver or co-driver
      const isPrimaryDriver = order.driver && order.driver._id?.toString() === driverId;
      const isCoDriver = order.coDriver && order.coDriver._id?.toString() === driverId;
      
      // Check if order has a co-driver (team trip)
      const hasCoDriver = order.coDriver && order.coDriver._id;

      // Get the primary driver's rates for earnings calculation
      // Both driver and co-driver get the same pay for the same order based on order miles
      let primaryDriverBaseRate = driverBaseRate;
      let primaryDriverTeamRate = driverTeamRate;
      let primaryDriverEmptyRate = driverEmptyRate;
      let primaryDriverEmptyTeamRate = driverEmptyTeamRate;
      let primaryDriverSnowRate = driverSnowRate;
      let primaryDriverHighTempRate = driverHighTempRate;
      let primaryDriverMileRate = driverMileRate;

      // If this driver is a co-driver, get the primary driver's rates
      if (isCoDriver && order.driver && order.driver._id) {
        try {
          const primaryDriver = await User.findById(order.driver._id).lean();
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
      let rateToUse = primaryDriverBaseRate;
      
      if (order.empty === true) {
        // Order is marked as empty - use empty rates
        if (hasCoDriver) {
          // Empty order with co-driver - use EMPTY-TEAM rate
          rateToUse = primaryDriverEmptyTeamRate || primaryDriverEmptyRate || primaryDriverBaseRate;
        } else {
          // Empty order without co-driver - use EMPTY rate
          rateToUse = primaryDriverEmptyRate || primaryDriverBaseRate;
        }
      } else {
        // Normal (not empty) order
        if (hasCoDriver) {
          // Normal order with co-driver - use TEAM rate
          rateToUse = primaryDriverTeamRate || primaryDriverBaseRate;
        }
        // else use primaryDriverBaseRate (ALONE rate)
      }

      // Calculate earnings based on weather conditions using the appropriate rate
      let earnings = distanceInMiles * rateToUse; // Use appropriate rate based on empty status and co-driver

      // Add snow premium (additive)
      if (hasSnow && primaryDriverSnowRate > 0) {
        earnings += distanceInMiles * primaryDriverSnowRate;
      }

      // Add high temperature premium (additive)
      if (hasHighTemp && primaryDriverHighTempRate > 0) {
        earnings += distanceInMiles * primaryDriverHighTempRate;
      }

      // If no rate found, fallback to legacy mileRate
      if (rateToUse === 0 && primaryDriverMileRate > 0) {
        earnings = distanceInMiles * primaryDriverMileRate;
      }

      // Determine rate type based on empty flag and co-driver presence
      let rateType = 'ALONE';
      let rateTypeLabel = 'ALONE';
      
      if (order.empty === true) {
        // Order is marked as empty
        if (hasCoDriver) {
          rateType = 'EMPTY-TEAM';
          rateTypeLabel = 'EMPTY-TEAM';
        } else {
          rateType = 'EMPTY';
          rateTypeLabel = 'EMPTY';
        }
      } else {
        // Normal orders (not empty)
        if (hasCoDriver) {
          rateType = 'TEAM';
          rateTypeLabel = 'TEAM';
        }
        // else remains 'ALONE'
      }

      // Transform order to match trip-like structure for frontend compatibility
      return {
        _id: order._id,
        orderNumber: order.orderNumber || 'N/A',
        tripNumber: order.orderNumber || 'N/A', // Use orderNumber as tripNumber for compatibility
        startLocation: pickupLocation || { place: 'Unknown', latitude: '', longitude: '' },
        endLocation: deliveryLocation || { place: 'Unknown', latitude: '', longitude: '' },
        pickupLocation: pickupLocation || { place: 'Unknown', latitude: '', longitude: '' },
        deliveryLocation: deliveryLocation || { place: 'Unknown', latitude: '', longitude: '' },
        distance: Math.round(distance), // km
        distanceInMiles: Math.round(distanceInMiles * 100) / 100, // Round to 2 decimal places
        mileRate: rateToUse || primaryDriverMileRate,
        baseRate: rateToUse, // Use the rate that was actually used (ALONE or TEAM)
        rateType: rateType, // Indicate which rate type was used
        rateTypeLabel: rateTypeLabel, // Label for display
        snowRate: primaryDriverSnowRate,
        highTempRate: primaryDriverHighTempRate,
        weatherConditions: {
          snow: hasSnow,
          highTemperature: hasHighTemp
        },
        earnings: earnings.toFixed(2),
        driverRole: isPrimaryDriver ? 'driver' : (isCoDriver ? 'coDriver' : 'unknown'),
        driver: order.driver,
        coDriver: order.coDriver,
        driverDetails: order.driver ? {
          _id: order.driver._id,
          name: order.driver.name,
          phone: order.driver.phone
        } : null,
        coDriverDetails: order.coDriver ? {
          _id: order.coDriver._id,
          name: order.coDriver.name,
          phone: order.coDriver.phone
        } : null,
        truck: order.truck,
        trailer: order.trailer,
        status: order.status,
        deliveryDate: order.deliveryDate,
        pickupDate: order.pickupDate,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        // Add route structure for compatibility (empty since orders don't have routes)
        route: {
          totalDistance: distance
        },
        // Add orders array with single order for compatibility
        orders: [order]
      };
    }));

    // Calculate summary
    const avgBaseRate = ordersWithCalculations.length > 0
      ? ordersWithCalculations.reduce((sum, o) => sum + (o.baseRate || 0), 0) / ordersWithCalculations.length
      : driverBaseRate || driverMileRate;
    const avgSnowRate = ordersWithCalculations.length > 0
      ? ordersWithCalculations.reduce((sum, o) => sum + (o.snowRate || 0), 0) / ordersWithCalculations.length
      : driverSnowRate;
    const avgHighTempRate = ordersWithCalculations.length > 0
      ? ordersWithCalculations.reduce((sum, o) => sum + (o.highTempRate || 0), 0) / ordersWithCalculations.length
      : driverHighTempRate;

    res.json({
      success: true,
      message: "Orders fetched successfully",
      data: ordersWithCalculations,
      summary: {
        totalTrips: ordersWithCalculations.length, // Keep as totalTrips for compatibility
        totalDistanceKm: Math.round(ordersWithCalculations.reduce((sum, o) => sum + (o.distance || 0), 0)),
        totalDistanceMiles: Math.round(ordersWithCalculations.reduce((sum, o) => sum + (o.distanceInMiles || 0), 0) * 100) / 100,
        totalEarnings: parseFloat(ordersWithCalculations.reduce((sum, o) => sum + parseFloat(o.earnings || 0), 0).toFixed(2)),
        ratePerMile: avgBaseRate || driverMileRate,
        baseRate: avgBaseRate,
        snowRate: avgSnowRate,
        highTempRate: avgHighTempRate
      }
    });
  } catch (err) {
    console.error('❌ Error in getCompletedOrdersByDriver:', err);
    res.status(500).json({
      success: false,
      message: "Error fetching completed orders",
      error: err.message
    });
  }
};

// 🧪 TEST: Manually trigger document upload notification
export const testDocumentNotification = async (req, res) => {
  try {
    console.log('🧪🧪🧪 TEST ENDPOINT CALLED: Manually triggering notification...');
    
    const { emitDocumentUploadNotification } = await import('../services/socketIo.js');
    
    const testData = {
      orderId: '123456789',
      orderNumber: 'TEST-ORDER-999',
      driverName: 'TEST DRIVER'
    };
    
    console.log('🧪 TEST: Calling emitDocumentUploadNotification with:', testData);
    emitDocumentUploadNotification(testData);
    
    console.log('🧪 TEST: Emission completed');
    
    res.json({
      success: true,
      message: 'Test notification emitted successfully',
      data: testData
    });
  } catch (error) {
    console.error('❌ TEST: Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ✅ Complete Order (Driver submits for review)
export const completeOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const driverId = req.user?.id;

    console.log('🏁 completeOrder called:', { orderId, driverId });

    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user is assigned to this order
    const isAssigned = 
      order.driver?.toString() === driverId || 
      order.coDriver?.toString() === driverId;

    if (!isAssigned && req.user?.role !== 'admin' && req.user?.role !== 'superadmin' && req.user?.role !== 'dispatcher') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to complete this order'
      });
    }

    // Check for required documents from multiple sources
    const attachments = order.attachments || [];
    
    // Check documentVerification fields first (preferred method)
    const hasPODFromVerification = order.documentVerification?.podDocument?.fileUrl;
    const hasManifestFromVerification = order.documentVerification?.borderManifestDocument?.fileUrl;
    
    // Check attachments array by type field (not name)
    const hasPODFromAttachments = attachments.some(att => 
      att.type === 'pod' || 
      att.type === 'proof_of_delivery'
    );

    const hasManifestFromAttachments = attachments.some(att => 
      att.type === 'border_manifest' || 
      att.type === 'manifest' ||
      att.type === 'stamped_manifest'
    );

    const hasPOD = hasPODFromVerification || hasPODFromAttachments;
    const hasManifest = hasManifestFromVerification || hasManifestFromAttachments;

    console.log('📋 Document check:', {
      hasPODFromVerification,
      hasManifestFromVerification,
      hasPODFromAttachments,
      hasManifestFromAttachments,
      hasPOD,
      hasManifest,
      attachmentsCount: attachments.length,
      attachments: attachments.map(a => ({ name: a.name, type: a.type }))
    });

    if (!hasPOD || !hasManifest) {
      return res.status(400).json({
        success: false,
        message: 'Missing required documents. Please upload both POD and Manifest documents.',
        missingDocuments: {
          pod: !hasPOD,
          manifest: !hasManifest
        }
      });
    }

    // Set status to pending_review (waiting for dispatcher approval)
    order.status = 'pending_review';
    
    // Initialize documentVerification if not exists
    if (!order.documentVerification) {
      order.documentVerification = {};
    }
    
    order.documentVerification.verificationStatus = 'pending';
    
    await order.save();

    console.log('✅ Order marked as pending_review:', orderId);

    // Populate driver information for notification
    await order.populate('driver', 'name email');
    
    console.log('👤 Driver info populated:', {
      driverId: order.driver?._id,
      driverName: order.driver?.name,
      driverEmail: order.driver?.email
    });
    
    // Emit real-time notification to dispatchers
    try {
      console.log('🔔 Attempting to send Socket.IO notification...');
      const { emitDocumentUploadNotification } = await import('../services/socketIo.js');
      
      const notificationData = {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber || order.customerOrderNo || order._id.toString(),
        driverName: order.driver?.name || 'Unknown Driver'
      };
      
      console.log('📦 Notification data prepared:', notificationData);
      
      emitDocumentUploadNotification(notificationData);
      
      console.log('✅ Notification function called successfully');
    } catch (notifError) {
      console.error('❌ Error sending document upload notification:', notifError);
      console.error('❌ Notification error stack:', notifError.stack);
      // Don't fail the request if notification fails
    }

    res.status(200).json({
      success: true,
      message: 'Order submitted for review successfully',
      data: order
    });

  } catch (error) {
    console.error('❌ Error completing order:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing order',
      error: error.message
    });
  }
};

// ✅ Upload Order Document (Driver uploads POD/Manifest)
export const uploadOrderDocument = async (req, res) => {
  try {
    const orderId = req.params.id;
    const driverId = req.user?.id;
    const { documentType, description } = req.body;

    console.log('📤 uploadOrderDocument called:', { orderId, driverId, documentType });
    console.log('📤 Content-Type received:', req.headers['content-type']);
    console.log('📤 req.file:', req.file ? { fieldname: req.file.fieldname, originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : 'MISSING – multer did not populate req.file');
    console.log('📤 req.body:', req.body);

    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user is assigned to this order
    const isAssigned = 
      order.driver?.toString() === driverId || 
      order.coDriver?.toString() === driverId;

    if (!isAssigned && req.user?.role !== 'admin' && req.user?.role !== 'superadmin' && req.user?.role !== 'dispatcher') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to upload documents for this order'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Upload to S3
    const s3Key = req.file.key;
    const fileUrl = req.file.location;
    const fileName = req.file.originalname;

    console.log('📁 File uploaded to S3:', { s3Key, fileName, documentType });

    // Add to attachments array with proper type
    if (!order.attachments) {
      order.attachments = [];
    }

    const attachmentData = {
      id: new Date().getTime().toString(),
      name: fileName,
      url: fileUrl,
      type: documentType, // This will be 'pod' or 'border_manifest'
      uploadedAt: new Date(),
      uploadedBy: driverId
    };

    order.attachments.push(attachmentData);

    console.log('📎 Added to attachments:', attachmentData);

    // Also store in documentVerification fields for easy access
    if (documentType === 'pod') {
      if (!order.documentVerification) {
        order.documentVerification = {};
      }
      order.documentVerification.podDocument = {
        fileUrl: fileUrl,
        fileName: fileName,
        uploadedBy: driverId,
        uploadedAt: new Date()
      };
    } else if (documentType === 'border_manifest' || documentType === 'manifest') {
      if (!order.documentVerification) {
        order.documentVerification = {};
      }
      order.documentVerification.borderManifestDocument = {
        fileUrl: fileUrl,
        fileName: fileName,
        uploadedBy: driverId,
        uploadedAt: new Date()
      };
    }

    // Save and verify
    await order.save();

    // Re-fetch the order to verify what was actually saved
    const savedOrder = await Order.findById(orderId).lean();
    
    console.log('✅ Document uploaded successfully for order:', orderId);
    console.log('📋 Saved attachments:', savedOrder.attachments.map(a => ({ 
      name: a.name, 
      type: a.type,
      id: a.id
    })));
    console.log('📋 Document verification:', {
      podDocument: savedOrder.documentVerification?.podDocument ? 'exists' : 'none',
      borderManifestDocument: savedOrder.documentVerification?.borderManifestDocument ? 'exists' : 'none'
    });

    // Emit real-time notification to dispatchers when document is uploaded
    try {
      console.log('🔔 Attempting to send Socket.IO notification for document upload...');
      const { emitDocumentUploadNotification } = await import('../services/socketIo.js');
      
      // Populate driver name if not already populated
      let driverName = 'Unknown Driver';
      if (order.driver) {
        if (typeof order.driver === 'object' && order.driver.name) {
          driverName = order.driver.name;
        } else {
          // Driver is just an ID, need to populate
          const populatedOrder = await Order.findById(orderId).populate('driver', 'name').lean();
          if (populatedOrder?.driver?.name) {
            driverName = populatedOrder.driver.name;
          }
        }
      }
      
      const notificationData = {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber || order.customerOrderNo || order._id.toString(),
        driverName: driverName
      };
      
      console.log('📦 Notification data prepared:', notificationData);
      
      emitDocumentUploadNotification(notificationData);
      
      console.log('✅ Document upload notification function called successfully');
    } catch (notifError) {
      console.error('❌ Error sending document upload notification:', notifError);
      console.error('❌ Notification error stack:', notifError.stack);
      // Don't fail the request if notification fails
    }

    res.status(200).json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        attachment: order.attachments[order.attachments.length - 1],
        order: order
      }
    });

  } catch (error) {
    console.error('❌ Error uploading order document:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading document',
      error: error.message
    });
  }
};

// ✅ Approve Order Documents - allows dispatcher to approve documents or approve without documents
export const approveOrderDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const { approveWithoutDocuments } = req.body; // Boolean: true if approving without required documents
    const approverId = req.user._id;
    const companyId = getUserCompanyId(req.user);

    // Only dispatchers, admins, and superadmins can approve
    if (!['admin', 'superadmin', 'dispatcher'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only dispatchers and administrators can approve order documents.'
      });
    }

    const orderFilter = { _id: id };
    if (companyId && req.user.role !== 'superadmin') {
      orderFilter.company = companyId;
    }

    const order = await Order.findOne(orderFilter);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Approve documents
    order.documentsApproved = true;
    order.documentsApprovedBy = approverId;
    order.documentsApprovedAt = new Date();
    order.approvedWithoutDocuments = approveWithoutDocuments === true;

    await order.save();

    await order.populate([
      { path: 'documentsApprovedBy', select: 'name email' },
      { path: 'customer', select: 'name email phone address' },
      { path: 'driver', select: 'name email phone' }
    ]);

    res.json({
      success: true,
      message: approveWithoutDocuments 
        ? 'Order approved without documents. Order can now be completed.'
        : 'Order documents approved. Order can now be completed.',
      data: order
    });
  } catch (error) {
    console.error('Error approving order documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve order documents',
      error: error.message
    });
  }
};

// ✅ Verify and Complete Order (Dispatcher approves/rejects)
export const verifyAndCompleteOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { action, rejectionReason } = req.body;
    const dispatcherId = req.user?.id;

    console.log('✅ verifyAndCompleteOrder called:', { orderId, action, dispatcherId });

    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (action === 'approve') {
      order.status = 'completed';
      order.documentVerification.verificationStatus = 'verified';
      order.documentVerification.verifiedBy = dispatcherId;
      order.documentVerification.verifiedAt = new Date();
      
      await order.save();

      console.log('✅ Order approved and completed:', orderId);

      res.status(200).json({
        success: true,
        message: 'Order approved and marked as completed',
        data: order
      });

    } else if (action === 'reject') {
      order.documentVerification.verificationStatus = 'rejected';
      order.documentVerification.rejectionReason = rejectionReason || 'Documents rejected by dispatcher';
      order.status = 'in-delivery'; // Revert to in-delivery so driver can re-upload
      
      await order.save();

      console.log('❌ Order rejected:', orderId);

      res.status(200).json({
        success: true,
        message: 'Order rejected. Driver can re-upload documents.',
        data: order
      });

    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "approve" or "reject"'
      });
    }

  } catch (error) {
    console.error('❌ Error verifying order:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying order',
      error: error.message
    });
  }
};

// Driver accepts an assigned order
export const acceptOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user._id;

    const order = await Order.findOne({
      _id: id,
      $or: [{ driver: driverId }, { coDriver: driverId }]
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found or not assigned to you.' });
    if (order.driverAcceptanceStatus !== 'pending') {
      return res.status(400).json({ success: false, message: `Order has already been ${order.driverAcceptanceStatus}.` });
    }

    order.driverAcceptanceStatus = 'accepted';
    order.driverRespondedAt = new Date();
    await order.save();

    // Notify dispatchers via socket
    const { getIO } = await import('../services/socketIo.js');
    const io = getIO();
    if (io && order.company) {
      const payload = {
        orderId: order._id.toString(),
        orderNumber: order.customerOrderNo || order.orderNumber,
        driverAcceptanceStatus: 'accepted',
        driverId: driverId.toString(),
        driverRespondedAt: order.driverRespondedAt
      };
      io.to(`dispatchers_${order.company.toString()}`).emit('orderAcceptanceUpdated', payload);
      io.to('dispatchers_all').emit('orderAcceptanceUpdated', payload);
    }

    res.json({ success: true, message: 'Order accepted successfully.', data: { driverAcceptanceStatus: 'accepted' } });
  } catch (error) {
    console.error('Error accepting order:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to accept order.' });
  }
};

// Driver rejects an assigned order
export const rejectOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user._id;
    const { reason } = req.body;

    const order = await Order.findOne({
      _id: id,
      $or: [{ driver: driverId }, { coDriver: driverId }]
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found or not assigned to you.' });
    if (order.driverAcceptanceStatus !== 'pending') {
      return res.status(400).json({ success: false, message: `Order has already been ${order.driverAcceptanceStatus}.` });
    }

    order.driverAcceptanceStatus = 'rejected';
    order.driverRejectionReason = reason || '';
    order.driverRespondedAt = new Date();
    await order.save();

    // Notify dispatchers via socket
    const { getIO } = await import('../services/socketIo.js');
    const io = getIO();
    if (io && order.company) {
      const payload = {
        orderId: order._id.toString(),
        orderNumber: order.customerOrderNo || order.orderNumber,
        driverAcceptanceStatus: 'rejected',
        driverRejectionReason: reason || '',
        driverId: driverId.toString(),
        driverRespondedAt: order.driverRespondedAt
      };
      io.to(`dispatchers_${order.company.toString()}`).emit('orderAcceptanceUpdated', payload);
      io.to('dispatchers_all').emit('orderAcceptanceUpdated', payload);
    }

    res.json({ success: true, message: 'Order rejected.', data: { driverAcceptanceStatus: 'rejected' } });
  } catch (error) {
    console.error('Error rejecting order:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to reject order.' });
  }
};

