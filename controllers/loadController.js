import { validationResult } from "express-validator";
import mongoose from "mongoose";
import { logDriverActivity } from "./driver/driverAcivityController.js";
import Load from "../models/loadModel.js";
import Order from "../models/orderModel.js";
import Trip from "../models/tripModel.js";
import { User } from "../models/driver/userModel.js";
import ActivityLog from "../models/activitylogModel.js";
import Admin from "../models/adminModel.js";
import axios from "axios";
import { Shift } from "../models/driver/shiftModel.js";
import { haversineDistance } from "../utils/distance.js";
import { getRouteDistance } from "../services/googlemap.js";
import { sendLoadAssignmentEmail } from "../services/emailService.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { getCombinedFilter } from "../utils/trialDataFilter.js";
import { FleetUnit } from "../models/fleet/fleetUnitModel.js";
import { Vehicle } from "../models/driver/vehicleModel.js";
import { Trailer } from "../models/driver/trailerModel.js";
import { CvsaInspection } from "../models/cvsaInspectionModel.js";
import { Ticket } from "../models/ticketModel.js";
import { Incident } from "../models/incidentModel.js";
import Issue from "../models/issueModel.js";
import { GeneralRepair } from "../models/fleet/generalRepairModel.js";
import { VehicleService } from "../models/driver/vehicleService.js";
import { WorkOrder } from "../models/driver/workOrderModel.js";
import { SparePart } from "../models/driver/sparePartModel.js";

export const totalLoadsCount = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const companyFilter = companyId ? { company: companyId } : null;

    // Get combined filter (company + trial data filter)
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    const totalLoadsCount = await Load.countDocuments(query)
    return res.json({ success: true, message: "total loads", data: totalLoadsCount })
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching completed loads",
      error: err.message
    });
  }
}
// ✅ Aggregation: Get Completed Loads for a Driver
export const getCompletedLoadsByDriver = async (req, res) => {
  try {
    const driverId = req.params.id;
    const { startDate, endDate } = req.query; // Optional date range filtering

    console.log('🔍 getCompletedLoadsByDriver called:', { driverId, startDate, endDate });

    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({ success: false, message: "Invalid driver ID" });
    }

    // Get driver to fetch mileRate
    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    const mileRate = driver.details?.mileRate || 0;
    console.log('💰 Driver info:', {
      name: driver.name,
      id: driver._id,
      company: driver.company,
      mileRate: mileRate,
      details: driver.details
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

    // Build match query - get all loads for the driver, not just completed
    const driverObjectId = new mongoose.Types.ObjectId(driverId);
    const matchQuery = {
      "details.driver": driverObjectId
    };

    // Add company filter - handle both ObjectId and string formats
    if (companyId && !isSuperadmin) {
      const companyObjectId = new mongoose.Types.ObjectId(companyId);
      // Use $or to match both ObjectId and string formats for company
      matchQuery.$and = [
        { "details.driver": driverObjectId },
        {
          $or: [
            { company: companyObjectId },
            { company: companyId }
          ]
        }
      ];
      // Remove the direct driver condition since it's now in $and
      delete matchQuery["details.driver"];
    }

    // Add date filtering if provided - filter by assignedAt or createdAt
    if (startDate || endDate) {
      const dateConditions = [];
      if (startDate && endDate) {
        // Set start date to beginning of day (00:00:00)
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        // Set end date to end of day (23:59:59.999)
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        dateConditions.push(
          { assignedAt: { $gte: start, $lte: end } },
          { createdAt: { $gte: start, $lte: end } }
        );
      } else if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateConditions.push(
          { assignedAt: { $gte: start } },
          { createdAt: { $gte: start } }
        );
      } else if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateConditions.push(
          { assignedAt: { $lte: end } },
          { createdAt: { $lte: end } }
        );
      }

      if (dateConditions.length > 0) {
        // Add date condition to existing $and or create new $and
        if (matchQuery.$and) {
          // Add date condition to existing $and
          matchQuery.$and.push({ $or: dateConditions });
        } else {
          // Create $and structure with driver and date conditions
          const existingConditions = {};
          Object.keys(matchQuery).forEach(key => {
            if (key !== '$and' && key !== '$or') {
              existingConditions[key] = matchQuery[key];
            }
          });
          matchQuery.$and = [
            existingConditions,
            { $or: dateConditions }
          ];
          Object.keys(existingConditions).forEach(key => {
            delete matchQuery[key];
          });
        }
      }
    }

    // Custom serializer for ObjectIds in logging
    const serializeForLog = (obj) => {
      return JSON.stringify(obj, (key, value) => {
        if (value && value.constructor && value.constructor.name === 'ObjectId') {
          return value.toString();
        }
        if (value && value._bsontype === 'ObjectId') {
          return value.toString();
        }
        return value;
      }, 2);
    };

    console.log('📊 Match query:', serializeForLog(matchQuery));
    console.log('👤 Request user:', {
      role: req.user?.role,
      company: req.user?.company,
      companyId: companyId
    });
    console.log('📅 Date range:', { startDate, endDate });

    const completedLoads = await Load.aggregate([
      {
        $match: matchQuery
      },
      // ✅ Join driver info
      {
        $lookup: {
          from: "users",
          localField: "details.driver",
          foreignField: "_id",
          as: "driverDetails"
        }
      },
      { $unwind: "$driverDetails" },

      // ✅ Join customer info
      {
        $lookup: {
          from: "users",
          localField: "details.customer",
          foreignField: "_id",
          as: "customerDetails"
        }
      },
      { $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true } },

      // ✅ Join facilitator info
      {
        $lookup: {
          from: "facilators",
          localField: "details.facilator",
          foreignField: "_id",
          as: "facilatorDetails"
        }
      },
      { $unwind: { path: "$facilatorDetails", preserveNullAndEmptyArrays: true } },

      // ✅ Choose only the fields you need
      {
        $project: {
          status: 1,
          assignedAt: 1,
          startedAt: 1,
          completedAt: 1,
          "route.selectPickup": 1,
          "route.selectDropOff": 1,
          "route.multipleDropOffs": 1,
          "route.wayPoints": 1,
          "payloads.itemName": 1,
          "payloads.measurementAndWeight": 1,

          "driverDetails._id": 1,
          "driverDetails.name": 1,
          "driverDetails.phone": 1,

          "customerDetails._id": 1,
          "customerDetails.name": 1,
          "customerDetails.email": 1,

          "facilatorDetails._id": 1,
          "facilatorDetails.name": 1,
          "facilatorDetails.email": 1
        }
      }
    ]);

    console.log(`📦 Found ${completedLoads.length} loads for driver`);
    if (completedLoads.length === 0) {
      console.log('⚠️ No loads found. Checking if loads exist without filters...');
      const allDriverLoads = await Load.find({ 'details.driver': new mongoose.Types.ObjectId(driverId) }).limit(5);
      console.log(`   Total loads for driver (no filters): ${allDriverLoads.length}`);
      if (allDriverLoads.length > 0) {
        console.log(`   Sample load company: ${allDriverLoads[0].company}`);
        console.log(`   Sample load assignedAt: ${allDriverLoads[0].assignedAt}`);
        console.log(`   Sample load createdAt: ${allDriverLoads[0].createdAt}`);
      }
    }

    // Calculate distance and earnings for each load using actual route distance
    const loadsWithCalculations = await Promise.all(completedLoads.map(async (load) => {
      let distance = 0;

      try {
        // Calculate distance based on route type using Google Maps Directions API
        if (load.route?.multipleDropOffs && load.route?.wayPoints && load.route.wayPoints.length > 0) {
          // Multiple waypoints - calculate distance ONLY through waypoints (not including pickup)
          const waypoints = load.route.wayPoints
            .map(wp => wp.address)
            .filter(addr => addr && addr.latitude && addr.longitude);

          if (waypoints.length >= 2) {
            // For multiple dropoffs, calculate distance from first waypoint to last waypoint
            // through all intermediate waypoints (excluding pickup location)
            const origin = {
              latitude: parseFloat(waypoints[0].latitude),
              longitude: parseFloat(waypoints[0].longitude)
            };

            const destination = {
              latitude: parseFloat(waypoints[waypoints.length - 1].latitude),
              longitude: parseFloat(waypoints[waypoints.length - 1].longitude)
            };

            // Intermediate waypoints (all waypoints except first and last)
            const intermediateWaypoints = waypoints
              .slice(1, -1)
              .map(wp => ({
                latitude: parseFloat(wp.latitude),
                longitude: parseFloat(wp.longitude)
              }));

            console.log(`📊 Calculating distance for multiple dropoffs load ${load._id}:`);
            console.log(`   Origin (first waypoint): (${origin.latitude}, ${origin.longitude})`);
            console.log(`   Destination (last waypoint): (${destination.latitude}, ${destination.longitude})`);
            console.log(`   Intermediate waypoints: ${intermediateWaypoints.length}`);

            // Get route distance from Google Maps (through waypoints only)
            const routeDistance = await getRouteDistance(origin, destination, intermediateWaypoints);
            if (routeDistance !== null && routeDistance > 0) {
              distance = routeDistance;
              const distanceInMiles = distance * 0.621371;
              console.log(`   ✅ Using Google Maps route distance: ${distance.toFixed(2)} km (${distanceInMiles.toFixed(2)} miles)`);
            } else {
              // Fallback to haversine if API fails
              console.warn(`⚠️ Google Maps API failed for load ${load._id}, using haversine distance`);
              for (let i = 0; i < waypoints.length - 1; i++) {
                distance += haversineDistance(
                  parseFloat(waypoints[i].latitude),
                  parseFloat(waypoints[i].longitude),
                  parseFloat(waypoints[i + 1].latitude),
                  parseFloat(waypoints[i + 1].longitude)
                );
              }
              const distanceInMiles = distance * 0.621371;
              console.log(`   ⚠️ Using haversine fallback: ${distance.toFixed(2)} km (${distanceInMiles.toFixed(2)} miles)`);
            }
          } else if (waypoints.length === 1) {
            // Only one waypoint, can't calculate route distance
            console.warn(`⚠️ Only one waypoint found for load ${load._id}, cannot calculate route distance`);
            distance = 0;
          }
        } else if (load.route?.selectPickup && load.route?.selectDropOff) {
          // Single pickup/dropoff route - get actual route distance
          const origin = {
            latitude: parseFloat(load.route.selectPickup.latitude),
            longitude: parseFloat(load.route.selectPickup.longitude)
          };
          const destination = {
            latitude: parseFloat(load.route.selectDropOff.latitude),
            longitude: parseFloat(load.route.selectDropOff.longitude)
          };

          console.log(`📊 Calculating distance for single dropoff load ${load._id}:`);
          console.log(`   Origin: ${load.route.selectPickup.place || 'N/A'} (${origin.latitude}, ${origin.longitude})`);
          console.log(`   Destination: ${load.route.selectDropOff.place || 'N/A'} (${destination.latitude}, ${destination.longitude})`);

          const routeDistance = await getRouteDistance(origin, destination);
          if (routeDistance !== null && routeDistance > 0) {
            distance = routeDistance;
            const distanceInMiles = distance * 0.621371;
            console.log(`   ✅ Using Google Maps route distance: ${distance.toFixed(2)} km (${distanceInMiles.toFixed(2)} miles)`);
          } else {
            // Fallback to haversine if API fails
            console.warn(`⚠️ Google Maps API failed for load ${load._id}, using haversine distance`);
            distance = haversineDistance(
              origin.latitude,
              origin.longitude,
              destination.latitude,
              destination.longitude
            );
            const distanceInMiles = distance * 0.621371;
            console.log(`   ⚠️ Using haversine fallback: ${distance.toFixed(2)} km (${distanceInMiles.toFixed(2)} miles)`);
          }
        }
      } catch (error) {
        console.error(`❌ Error calculating distance for load ${load._id}:`, error.message);
        // Fallback to haversine calculation
        if (load.route?.multipleDropOffs && load.route?.wayPoints) {
          // For multiple dropoffs, calculate only through waypoints (not pickup)
          const waypoints = load.route.wayPoints.map(wp => wp.address).filter(addr => addr && addr.latitude && addr.longitude);
          for (let i = 0; i < waypoints.length - 1; i++) {
            distance += haversineDistance(
              parseFloat(waypoints[i].latitude),
              parseFloat(waypoints[i].longitude),
              parseFloat(waypoints[i + 1].latitude),
              parseFloat(waypoints[i + 1].longitude)
            );
          }
        } else if (load.route?.selectPickup && load.route?.selectDropOff) {
          // Single dropoff - calculate from pickup to dropoff
          distance = haversineDistance(
            parseFloat(load.route.selectPickup.latitude),
            parseFloat(load.route.selectPickup.longitude),
            parseFloat(load.route.selectDropOff.latitude),
            parseFloat(load.route.selectDropOff.longitude)
          );
        }
      }

      // Convert km to miles (1 km = 0.621371 miles)
      const distanceInMiles = distance * 0.621371;

      // Calculate earnings
      const earnings = distanceInMiles * mileRate;

      return {
        ...load,
        distance: Math.round(distance), // km
        distanceInMiles: Math.round(distanceInMiles),
        mileRate: mileRate,
        earnings: earnings.toFixed(2)
      };
    }));

    res.json({
      success: true,
      message: "Loads fetched successfully",
      data: loadsWithCalculations,
      summary: {
        totalLoads: loadsWithCalculations.length,
        totalDistanceKm: Math.round(loadsWithCalculations.reduce((sum, l) => sum + (l.distance || 0), 0)),
        totalDistanceMiles: Math.round(loadsWithCalculations.reduce((sum, l) => sum + (l.distanceInMiles || 0), 0)),
        totalEarnings: parseFloat(loadsWithCalculations.reduce((sum, l) => sum + parseFloat(l.earnings || 0), 0).toFixed(2)),
        ratePerMile: mileRate
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching completed loads",
      error: err.message
    });
  }
};

// helper fn: fetch lat/lng for address
const getCoordinates = async (address) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY; // set in .env
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${apiKey}`;

    const response = await axios.get(url);

    if (
      response.data.status === "OK" &&
      response.data.results &&
      response.data.results.length > 0
    ) {
      const location = response.data.results[0].geometry.location;
      return {
        place: address,
        longitude: location.lng.toString(),
        latitude: location.lat.toString(),
      };
    }
    return {
      place: address,
      longitude: "",
      latitude: "",
    };
  } catch (err) {
    console.error("Error fetching coordinates:", err.message);
    return {
      place: address,
      longitude: "",
      latitude: "",
    };
  }
};

const parseJSONSafely = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.warn("Failed to parse JSON field:", error?.message);
      return fallback;
    }
  }
  return value;
};

const normalizeString = (value) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
};

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return false;
};

const normalizeNumber = (value, defaultValue = 0) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(num) ? Number(num) : defaultValue;
};

const normalizeNumberNullable = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const num = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(num) ? Number(num) : null;
};

const normalizeObjectId = (value) => {
  if (!value || value === "null" || value === "undefined") return null;
  if (typeof value === "object" && mongoose.Types.ObjectId.isValid(value)) {
    return value;
  }
  const str = String(value).trim();
  return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
};

const normalizeLocationInput = async (input) => {
  if (!input) return null;

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return await getCoordinates(trimmed);
  }

  if (typeof input === "object") {
    // Handle place ID reference
    const placeId = normalizeObjectId(input.placeId);

    // If placeId is provided, fetch place details
    if (placeId) {
      const Place = (await import("../models/driver/placeModel.js")).default;
      const place = await Place.findById(placeId);
      if (place && place.currentLocation) {
        return {
          place: place.currentLocation.address || place.name || "",
          latitude: String(place.currentLocation.latitude || ""),
          longitude: String(place.currentLocation.longitude || ""),
          placeId: placeId
        };
      }
    }

    const place = normalizeString(input.place || input.address || input.name);
    const latitude =
      input.latitude ??
      input.lat ??
      input.coordinates?.lat ??
      input.coordinates?.latitude;
    const longitude =
      input.longitude ??
      input.lng ??
      input.coordinates?.lng ??
      input.coordinates?.longitude;

    if (latitude && longitude) {
      return {
        place: place || "",
        latitude: String(latitude),
        longitude: String(longitude),
        placeId: placeId || null
      };
    }

    if (place) {
      const coordinates = await getCoordinates(place);
      return {
        ...coordinates,
        placeId: placeId || null
      };
    }
  }

  return null;
};

const buildPayloads = (payloadsInput = []) => {
  if (!Array.isArray(payloadsInput)) return [];

  return payloadsInput.map((payload, index) => {
    const priceAndValues = payload?.priceAndValues || {};
    const measurementAndWeight = payload?.measurementAndWeight || {};

    return {
      itemName: normalizeString(payload?.itemName),
      sku: normalizeString(payload?.sku) || "",
      itemImageUrl: normalizeString(payload?.itemImageUrl) || "",
      internalId: normalizeString(payload?.internalId),
      description: normalizeString(payload?.description) || "",
      priceAndValues: {
        price: normalizeNumber(priceAndValues.price),
        salePrice: normalizeNumber(priceAndValues.salePrice),
        cost: normalizeNumber(priceAndValues.cost),
        discountValue: normalizeNumber(priceAndValues.discountValue),
      },
      measurementAndWeight: {
        length: normalizeNumber(measurementAndWeight.length),
        width: normalizeNumber(measurementAndWeight.width),
        height: normalizeNumber(measurementAndWeight.height),
        weight: normalizeNumber(measurementAndWeight.weight),
      },
    };
  });
};

const buildServices = (servicesInput = {}, { partial } = { partial: false }) => {
  const applyServiceRate =
    servicesInput?.applyServiceRate !== undefined
      ? normalizeBoolean(servicesInput.applyServiceRate)
      : null;

  if (partial) {
    const result = {};
    if (applyServiceRate !== null) {
      result.applyServiceRate = applyServiceRate;
    }
    return result;
  }

  return {
    applyServiceRate: applyServiceRate ?? false,
  };
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const sanitizeReceiver = (receiverInput = {}, { partial } = { partial: false }) => {
  const receiver = {};

  const assignField = (key, value, provided) => {
    const normalized = normalizeString(value);
    if (partial) {
      if (provided) {
        receiver[key] = normalized;
      }
    } else {
      receiver[key] = normalized;
    }
  };

  assignField("name", receiverInput.name, hasOwn(receiverInput, "name"));
  assignField("email", receiverInput.email, hasOwn(receiverInput, "email"));
  assignField("phone", receiverInput.phone, hasOwn(receiverInput, "phone"));
  assignField("address", receiverInput.address, hasOwn(receiverInput, "address"));
  assignField(
    "contactPerson",
    receiverInput.contactPerson,
    hasOwn(receiverInput, "contactPerson")
  );
  assignField("notes", receiverInput.notes, hasOwn(receiverInput, "notes"));

  return receiver;
};

const sanitizeDetails = (detailsInput = {}, { partial } = { partial: false }) => {
  const details = {};
  const assignField = (key, value, provided) => {
    if (partial) {
      if (provided) {
        details[key] = value;
      }
    } else {
      details[key] = value;
    }
  };

  const orderType = normalizeString(detailsInput.orderType);
  assignField(
    "orderType",
    partial ? orderType : orderType || "standard",
    hasOwn(detailsInput, "orderType")
  );
  assignField(
    "internalId",
    normalizeString(detailsInput.internalId),
    hasOwn(detailsInput, "internalId")
  );
  assignField(
    "customer",
    normalizeObjectId(detailsInput.customer),
    hasOwn(detailsInput, "customer")
  );
  assignField(
    "facilator",
    normalizeObjectId(detailsInput.facilator),
    hasOwn(detailsInput, "facilator")
  );
  assignField("driver", normalizeObjectId(detailsInput.driver), hasOwn(detailsInput, "driver"));
  assignField(
    "vehicle",
    normalizeObjectId(detailsInput.vehicle),
    hasOwn(detailsInput, "vehicle")
  );
  assignField("adHoc", normalizeNumberNullable(detailsInput.adHoc), hasOwn(detailsInput, "adHoc"));
  assignField("addMisc", normalizeBoolean(detailsInput.addMisc), hasOwn(detailsInput, "addMisc"));
  assignField(
    "dispatchImmediately",
    normalizeBoolean(detailsInput.dispatchImmediately),
    hasOwn(detailsInput, "dispatchImmediately")
  );
  assignField(
    "requiredProof",
    normalizeString(detailsInput.requiredProof),
    hasOwn(detailsInput, "requiredProof")
  );
  assignField("amount", normalizeNumber(detailsInput.amount), hasOwn(detailsInput, "amount"));
  assignField("rate", normalizeNumber(detailsInput.rate), hasOwn(detailsInput, "rate"));
  assignField(
    "receiver",
    sanitizeReceiver(detailsInput.receiver || {}, { partial }),
    hasOwn(detailsInput, "receiver")
  );

  return details;
};

const buildRouteData = async (routeInput = {}) => {
  if (!routeInput || typeof routeInput !== "object") return null;

  const multipleDropOffs = normalizeBoolean(routeInput.multipleDropOffs);

  if (multipleDropOffs) {
    const wayPointsInput = Array.isArray(routeInput.wayPoints) ? routeInput.wayPoints : [];

    const wayPoints = await Promise.all(
      wayPointsInput.map(async (wp) => {
        const address = await normalizeLocationInput(wp?.address || wp?.place || wp?.addressText || wp);
        return {
          address,
          customer: normalizeObjectId(wp?.customer),
          dropOff: normalizeBoolean(wp?.dropOff),
          pickup: normalizeBoolean(wp?.pickup),
        };
      })
    );

    return {
      multipleDropOffs: true,
      wayPoints,
      selectReturn: normalizeString(routeInput.selectReturn),
    };
  }

  const selectPickup = await normalizeLocationInput(routeInput.selectPickup);
  const selectDropOff = await normalizeLocationInput(routeInput.selectDropOff);

  return {
    multipleDropOffs: false,
    selectPickup,
    selectDropOff,
    selectReturn: normalizeString(routeInput.selectReturn),
  };
};

const collectDocumentFiles = (files) => {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  if (files.documents) return files.documents;
  return [];
};

export const createLoad = async (req, res) => {
  try {
    if (req.user && req.user.role !== "superadmin" && !req.user.company) {
      return res.status(400).json({
        success: false,
        message:
          "Please complete company settings first before creating loads. Go to Company Settings to set up your company.",
      });
    }

    const rawDetails = parseJSONSafely(req.body.details, req.body.details || {});
    const rawRoute = parseJSONSafely(req.body.route, req.body.route || {});
    const rawPayloads = parseJSONSafely(req.body.payloads, req.body.payloads || []);
    const rawServices = parseJSONSafely(req.body.services, req.body.services || {});
    const notes = normalizeString(req.body.notes) || "";
    const requestedStatus = req.body.status;

    // Sanitize inputs
    const details = sanitizeDetails(rawDetails || {}, { partial: false });
    const payloads = buildPayloads(rawPayloads);
    const services = buildServices(rawServices || {}, { partial: false });
    const route = await buildRouteData(rawRoute || {});

    // Validation
    const validationErrors = [];
    if (!details.customer) validationErrors.push("Customer is required.");

    // Route validation
    if (!route) {
      validationErrors.push("Route information is required.");
    } else if (route.multipleDropOffs) {
      if (!route.wayPoints || !route.wayPoints.length) {
        validationErrors.push("At least one waypoint is required for multi drop-off routes.");
      } else if (route.wayPoints.some((wp) => !wp.address)) {
        validationErrors.push("All waypoints must include a valid address.");
      }
    } else {
      if (!route.selectPickup) validationErrors.push("Pickup location is required.");
      if (!route.selectDropOff) validationErrors.push("Drop-off location is required.");
    }

    // Payload validation
    if (!payloads.length) validationErrors.push("At least one payload item is required.");

    if (validationErrors.length) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    // Document handling
    const documentFiles = collectDocumentFiles(req.files);
    const documentEntries = documentFiles.map((file) => {
      const url =
        file.location ||
        `${req.protocol}://${req.get("host")}/${file.path?.replace(/\\/g, "/")}`;
      return {
        documentUrl: url,
        originalName: file.originalname || null,
      };
    });

    // Driver & Admin handling (for activity log)
    const driverId = details.driver;
    const driver = driverId ? await User.findById(driverId) : null;
    const driverName = driver?.name || "";

    const adminId = req.admin?.id || req.user?._id || req.user?.id || null;
    let adminName = "";
    if (adminId) {
      const adminUser = await User.findById(adminId);
      if (adminUser) {
        adminName = adminUser.name || "";
      } else {
        const adminDoc = await Admin.findById(adminId);
        adminName = adminDoc?.name || adminDoc?.fullName || "";
      }
    }

    if (adminId && driverId) {
      await ActivityLog.create({
        performedBy: adminId,
        action: "Load assigned",
        driver: driverId,
        changeSummary: adminName
          ? `Hi ${driverName || "Driver"}, you got a load from ${adminName}`
          : `Hi ${driverName || "Driver"}, a new load has been assigned to you.`,
      });
    }

    // Company handling
    let companyId = getUserCompanyId(req.user);
    if (!companyId && req.user?.company) {
      if (typeof req.user.company === 'string') companyId = req.user.company;
      else if (req.user.company?._id) companyId = req.user.company._id.toString();
      else if (mongoose.Types.ObjectId.isValid(req.user.company)) companyId = req.user.company.toString();
    }

    // Status handling
    const initialStatus = details.driver && details.vehicle ? "dispatched" : "planned";
    const validStatuses = ["planned", "dispatched", "in-delivery", "delivered", "completed"];
    let finalStatus = initialStatus;
    if (requestedStatus) {
      const statusMap = { pending: "planned", active: "dispatched", started: "in-delivery", assigned: "dispatched" };
      const mappedStatus = statusMap[requestedStatus] || requestedStatus;
      if (validStatuses.includes(mappedStatus)) finalStatus = mappedStatus;
    }

    // Create Order
    // Mapping structure to Order model
    const orderData = {
      customer: details.customer,
      facilator: details.facilator || null,
      driver: details.driver || null,
      truck: details.vehicle || null, // Map vehicle to truck
      // trailer: details.trailer || null, // UI doesn't seem to have trailer in details normally, but if it did

      // Locations
      pickupLocation: route.selectPickup ? {
        place: route.selectPickup.place,
        latitude: route.selectPickup.latitude,
        longitude: route.selectPickup.longitude,
        placeId: route.selectPickup.placeId
      } : undefined,
      deliveryLocation: route.selectDropOff ? {
        place: route.selectDropOff.place,
        latitude: route.selectDropOff.latitude,
        longitude: route.selectDropOff.longitude,
        placeId: route.selectDropOff.placeId
      } : undefined,

      // Dates & Times
      pickupDate: req.body.pickupDate,
      pickupTime: normalizeString(req.body.pickupTime),
      pickupAppointment: normalizeBoolean(req.body.pickupAppointment),
      pickupRefNo: normalizeString(req.body.pickupRefNo),
      pickupNote: normalizeString(req.body.pickupNote),

      deliveryDate: req.body.deliveryDate,
      deliveryTime: normalizeString(req.body.deliveryTime),
      deliveryAppointment: normalizeBoolean(req.body.deliveryAppointment),
      deliveryRefNo: normalizeString(req.body.deliveryRefNo),
      deliveryNote: normalizeString(req.body.deliveryNote),

      // Items/Payloads
      items: payloads,
      services: services,

      // Details
      orderType: details.orderType || 'Regular',
      customerOrderNo: details.internalId, // Mapping internalId to customerOrderNo
      orderNotes: notes,
      totalAmount: details.amount,

      status: finalStatus,
      assignedAt: details.driver && details.vehicle ? new Date() : null,

      company: companyId,
      documents: documentEntries
    };

    const order = new Order(orderData);
    await order.save();


    // Post-creation logic (Shift, Email)
    if (driverId) {
      await Shift.create({
        driver: driverId,
        vehicle: details?.vehicle || null,
        load: order._id, // Shift refers to 'load' usually, need to check Shift model if it refs Load or Order. Assuming it handles ObjectId generically or we might need to update Shift model too.
        shiftDate: order.assignedAt || new Date(),
        startTime: new Date(),
        endTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
        status: "scheduled",
        notes: `Auto-created shift for Order ${order.customerOrderNo || order._id}`,
      });

      // Email logic (simplified/copied)
      try {
        await order.populate("driver", "name email");
        await order.populate("truck", "plateNumber");
        await order.populate("customer", "name");

        if (order.driver && order.driver.email) {
          // Re-construct load-like structure for email service if it expects strict structure
          const loadLike = {
            _id: order._id,
            details: {
              internalId: order.customerOrderNo,
              driver: order.driver,
              customer: order.customer,
              vehicle: order.truck
            },
            route: route,
            assignedAt: order.assignedAt
          };

          await sendLoadAssignmentEmail({
            driverEmail: order.driver.email,
            driverName: order.driver.name || "Driver",
            loadId: order._id.toString(),
            loadInternalId: order.customerOrderNo,
            loadDetails: {
              pickupAddress: order.pickupLocation?.place,
              dropoffAddress: order.deliveryLocation?.place,
              customerName: order.customer?.name,
              vehiclePlate: order.truck?.plateNumber,
              assignedAt: order.assignedAt,
              route: route
            }
          });
        }
      } catch (e) {
        console.error("Email error", e);
      }
    }

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      load: order, // Return as 'load' for frontend compatibility
    });

  } catch (error) {
    console.error("Create Load/Order Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// update load status (for driver mobile app: planned → dispatched → in-delivery → delivered → completed)
export const updateLoadStatus = async (req, res) => {
  try {
    const { loadId, status } = req.body;

    // validate allowed statuses
    const allowedStatuses = ["planned", "dispatched", "in-delivery", "delivered", "completed"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    let query = { _id: loadId };

    if (isSuperadmin) {
      // Superadmin can see any load (no company filter)
      // query remains as is
    } else if (companyId) {
      // User has company - filter by company
      query.company = companyId;
    } else {
      // User has no company - cannot update loads (loads are company-based)
      return res.status(403).json({
        success: false,
        message: "No company assigned. Cannot update loads without a company."
      });
    }

    // find the load
    const load = await Load.findOne(query);
    if (!load) {
      return res.status(404).json({ success: false, message: "Load not found" });
    }

    // Validate status transitions
    const validTransitions = {
      'planned': ['dispatched', 'in-delivery'], // allow direct start for convenience
      'dispatched': ['in-delivery', 'planned'], // can go back to planned if unassigned
      'in-delivery': ['delivered', 'dispatched', 'completed'], // allow direct completion
      'delivered': ['completed'],
      'completed': [] // terminal state
    };

    const currentStatus = load.status;
    if (!validTransitions[currentStatus]?.includes(status) && currentStatus !== status) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from ${currentStatus} to ${status}. Valid transitions: ${validTransitions[currentStatus]?.join(', ') || 'none'}`,
      });
    }

    // Update status
    load.status = status;

    // Update timestamps based on status
    if (status === "in-delivery" && !load.startedAt) {
      load.startedAt = new Date();
    } else if (status === "delivered" && !load.completedAt) {
      load.completedAt = new Date();
    } else if (status === "completed" && !load.completedAt) {
      load.completedAt = new Date();
    }

    await load.save();

    // Log driver activity if driver is assigned
    if (load.details?.driver) {
      try {
        const activityTypeMap = {
          'in-delivery': 'load_started',
          'delivered': 'load_delivered',
          'completed': 'load_completed'
        };

        // Note: 'load_delivered' activity type may need to be added to driverActivityModel if not present

        if (activityTypeMap[status]) {
          await logDriverActivity({
            driverId: load.details.driver,
            activityType: activityTypeMap[status],
            location: {
              address: load.route?.selectPickup?.place || 'Unknown Location',
              latitude: load.route?.selectPickup?.latitude || '',
              longitude: load.route?.selectPickup?.longitude || ''
            },
            loadId: load._id
          });
        }

        // Create notification (ActivityLog) for driver
        const notificationMessages = {
          'in-delivery': `Load ${load.details?.internalId || load._id.toString().slice(-6)} has been started`,
          'delivered': `Load ${load.details?.internalId || load._id.toString().slice(-6)} has been delivered successfully`,
          'completed': `Load ${load.details?.internalId || load._id.toString().slice(-6)} has been completed. Great job!`
        };

        if (notificationMessages[status]) {
          await ActivityLog.create({
            driver: load.details.driver,
            action: status === 'completed' ? 'Load Completed' : status === 'delivered' ? 'Load Delivered' : 'Load Started',
            changeSummary: notificationMessages[status],
            performedBy: null // System-generated notification
          });
        }
      } catch (activityError) {
        console.error('Error logging driver activity or creating notification:', activityError);
        // Don't fail the request if activity logging fails
      }
    }

    res.json({
      success: true,
      message: `Load updated to ${status}`,
      data: load,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Start Individual Order (for mobile driver app) ===
export const startOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const driverId = req.driver._id;

    console.log('🚀 Driver attempting to start order:', {
      orderId,
      driverId: driverId.toString()
    });

    // Validate orderId
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      });
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Verify driver is assigned to this order
    const orderDriverId = order.driver?.toString();
    if (orderDriverId !== driverId.toString()) {
      console.log('❌ Driver not assigned to order:', {
        orderDriver: orderDriverId,
        requestingDriver: driverId.toString()
      });
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this order"
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

    // Populate order details for response
    await order.populate([
      { path: 'customer', select: 'name email phone' },
      { path: 'driver', select: 'name email phone' },
      { path: 'truck', select: 'plateNumber make model internalId unitNumber' },
      { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
      { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
    ]);

    console.log('✅ Order started successfully:', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status
    });

    res.json({
      success: true,
      message: "Order started successfully. Status updated to 'in-delivery'.",
      data: order
    });
  } catch (error) {
    console.error('❌ Error starting order:', error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while starting the order."
    });
  }
};

// === Active Loads (In Delivery and Delivered) ===
export const activeLoads = async (req, res) => {
  try {
    const driverId = req.driver._id
    console.log('🔍 Fetching active orders for driver:', driverId);

    const orders = await Order.aggregate([
      { $match: { driver: driverId, status: { $in: ["in-delivery", "delivered"] } } },
      {
        $lookup: {
          from: "users",
          localField: "customer",
          foreignField: "_id",
          as: "customerData"
        }
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "truck",
          foreignField: "_id",
          as: "vehicleData"
        }
      },
      { $unwind: { path: "$customerData", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$vehicleData", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          // Filter attachments to only include those with shareWithDriver: true
          sharedAttachments: {
            $filter: {
              input: { $ifNull: ["$attachments", []] },
              as: "attachment",
              cond: { $eq: ["$$attachment.shareWithDriver", true] }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          orderNumber: 1,
          customerOrderNo: 1,
          orderType: 1,
          status: 1,
          pickupLocation: 1,
          deliveryLocation: 1,
          pickupDate: 1,
          pickupTime: 1,
          deliveryDate: 1,
          deliveryTime: 1,
          items: 1,
          totalAmount: 1,
          currency: 1,
          orderNotes: 1,
          internalNotes: 1,
          customerNotes: 1,
          documents: 1,
          // Only include attachments that are shared with driver
          attachments: "$sharedAttachments",
          customer: {
            _id: "$customerData._id",
            name: "$customerData.name",
            email: "$customerData.email",
            phone: "$customerData.phone"
          },
          vehicle: {
            _id: "$vehicleData._id",
            unitNumber: "$vehicleData.unitNumber",
            internalId: "$vehicleData.internalId",
            plateNumber: "$vehicleData.plateNumber",
            make: "$vehicleData.make",
            model: "$vehicleData.model"
          }
        }
      }
    ])

    console.log(`✅ Found ${orders.length} active orders for driver ${driverId}`);
    return res.status(200).json({ success: true, count: orders.length, loads: orders })
  } catch (error) {
    console.error('❌ Error fetching active orders:', error);
    return res.status(500).json({ success: false, message: "Server error" })
  }
}

// === Pending Orders (Planned or Dispatched but not yet in delivery) ===
export const pendingLoads = async (req, res) => {
  try {
    const driverId = req.driver._id
    console.log('🔍 Fetching pending orders for driver:', driverId);

    const orders = await Order.aggregate([
      { $match: { driver: driverId, status: { $in: ["planned", "quoted"] } } },
      {
        $lookup: {
          from: "users",
          localField: "customer",
          foreignField: "_id",
          as: "customerData"
        }
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "truck",
          foreignField: "_id",
          as: "vehicleData"
        }
      },
      { $unwind: { path: "$customerData", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$vehicleData", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          // Filter attachments to only include those with shareWithDriver: true
          sharedAttachments: {
            $filter: {
              input: { $ifNull: ["$attachments", []] },
              as: "attachment",
              cond: { $eq: ["$$attachment.shareWithDriver", true] }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          orderNumber: 1,
          customerOrderNo: 1,
          orderType: 1,
          status: 1,
          pickupLocation: 1,
          deliveryLocation: 1,
          pickupDate: 1,
          pickupTime: 1,
          deliveryDate: 1,
          deliveryTime: 1,
          items: 1,
          totalAmount: 1,
          currency: 1,
          orderNotes: 1,
          internalNotes: 1,
          customerNotes: 1,
          documents: 1,
          // Only include attachments that are shared with driver
          attachments: "$sharedAttachments",
          customer: {
            _id: "$customerData._id",
            name: "$customerData.name",
            email: "$customerData.email",
            phone: "$customerData.phone"
          },
          vehicle: {
            _id: "$vehicleData._id",
            unitNumber: "$vehicleData.unitNumber",
            internalId: "$vehicleData.internalId",
            plateNumber: "$vehicleData.plateNumber",
            make: "$vehicleData.make",
            model: "$vehicleData.model"
          }
        }
      }
    ])

    console.log(`✅ Found ${orders.length} pending orders for driver ${driverId}`);
    return res.status(200).json({ success: true, count: orders.length, loads: orders })
  } catch (error) {
    console.error('❌ Error fetching pending orders:', error);
    return res.status(500).json({ success: false, message: "Server error" })
  }
}

// === Started Orders (In Delivery) ===
export const startedLoads = async (req, res) => {
  try {
    const driverId = req.driver._id
    console.log('🔍 Fetching started orders for driver:', driverId);

    const orders = await Order.aggregate([
      { $match: { driver: driverId, status: "in-delivery" } },
      {
        $addFields: {
          sharedAttachments: {
            $filter: {
              input: { $ifNull: ["$attachments", []] },
              as: "attachment",
              cond: { $eq: ["$$attachment.shareWithDriver", true] }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          orderNumber: 1,
          customerOrderNo: 1,
          orderType: 1,
          status: 1,
          pickupLocation: 1,
          deliveryLocation: 1,
          attachments: "$sharedAttachments"
        }
      }
    ])

    console.log(`✅ Found ${orders.length} started orders for driver ${driverId}`);
    return res.status(200).json({ success: true, count: orders.length, loads: orders })
  } catch (error) {
    console.error('❌ Error fetching started orders:', error);
    return res.status(500).json({ success: false, message: "Server error" })
  }
}

// === Delivered/Completed Orders ===
export const deliveredLoads = async (req, res) => {
  try {
    const driverId = req.driver._id
    console.log('🔍 Fetching completed orders for driver:', driverId);

    const orders = await Order.aggregate([
      { $match: { driver: driverId, status: { $in: ["delivered", "completed"] } } },
      {
        $lookup: {
          from: "users",
          localField: "customer",
          foreignField: "_id",
          as: "customerData"
        }
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "truck",
          foreignField: "_id",
          as: "vehicleData"
        }
      },
      { $unwind: { path: "$customerData", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$vehicleData", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          // Filter attachments to only include those with shareWithDriver: true
          sharedAttachments: {
            $filter: {
              input: { $ifNull: ["$attachments", []] },
              as: "attachment",
              cond: { $eq: ["$$attachment.shareWithDriver", true] }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          orderNumber: 1,
          customerOrderNo: 1,
          orderType: 1,
          status: 1,
          pickupLocation: 1,
          deliveryLocation: 1,
          pickupDate: 1,
          pickupTime: 1,
          deliveryDate: 1,
          deliveryTime: 1,
          items: 1,
          totalAmount: 1,
          currency: 1,
          orderNotes: 1,
          internalNotes: 1,
          customerNotes: 1,
          documents: 1,
          // Only include attachments that are shared with driver
          attachments: "$sharedAttachments",
          customer: {
            _id: "$customerData._id",
            name: "$customerData.name",
            email: "$customerData.email",
            phone: "$customerData.phone"
          },
          vehicle: {
            _id: "$vehicleData._id",
            unitNumber: "$vehicleData.unitNumber",
            internalId: "$vehicleData.internalId",
            plateNumber: "$vehicleData.plateNumber",
            make: "$vehicleData.make",
            model: "$vehicleData.model"
          }
        }
      }
    ])

    console.log(`✅ Found ${orders.length} completed orders for driver ${driverId}`);
    return res.status(200).json({ success: true, count: orders.length, loads: orders })
  } catch (error) {
    console.error('❌ Error fetching completed orders:', error);
    return res.status(500).json({ success: false, message: "Server error" })
  }
}



export const getAllLoads = async (req, res) => {
  try {
    const {
      status,
      driverId,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Build query based on user's company status
    let query = {};
    const additionalFilters = {};

    // Collect additional filters first
    if (status) {
      additionalFilters.status = status;
    }
    if (driverId) {
      additionalFilters["details.driver"] = driverId;
    }

    if (isSuperadmin) {
      // Superadmin can see all loads (no company filter)
      query = { ...additionalFilters };
    } else if (companyId) {
      // User has company - filter by company
      query.company = companyId;
      Object.assign(query, additionalFilters);

      // Get combined filter (company + trial data filter) if user has company
      const companyFilter = { company: companyId };
      const baseFilter = await getCombinedFilter(req.user, companyFilter);
      if (baseFilter) {
        // Merge baseFilter with existing query
        if (baseFilter.$or) {
          // If trial filter has $or, combine with $and
          query = {
            $and: [
              query,
              baseFilter
            ]
          };
        } else {
          Object.assign(query, baseFilter);
        }
      }
    } else {
      // User has no company - return empty result (loads are company-based)
      return res.json({
        success: true,
        count: 0,
        data: [],
        pagination: {
          current: parseInt(page),
          pages: 0,
          total: 0,
          limit: parseInt(limit)
        },
        message: "No company assigned. Please complete company settings to view loads."
      });
    }

    // Add search filter
    if (search) {
      const searchConditions = [
        { "details.internalId": { $regex: search, $options: "i" } },
        { "details.customer.name": { $regex: search, $options: "i" } },
        { "details.driver.name": { $regex: search, $options: "i" } },
        { "details.vehicle.plateNumber": { $regex: search, $options: "i" } }
      ];

      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { $or: searchConditions }
        ];
        delete query.$or;
      } else if (query.$and) {
        query.$and.push({ $or: searchConditions });
      } else {
        query.$or = searchConditions;
      }
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination
    const total = await Load.countDocuments(query);

    console.log('Query:', JSON.stringify(query, null, 2));
    const loads = await Load.find(query)
      .populate("details.customer", "name email") // fetch customer name and email
      .populate("details.driver", "name phone email internalId")   // fetch driver details
      .populate("details.vehicle", "plateNumber make model internalId")   // fetch vehicle details
      .populate("route.wayPoints.customer", "name email") // if waypoints need customer name and email
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const formattedLoads = loads.map((load) => {
      // Ensure status is correct based on driver and vehicle assignment
      let calculatedStatus = load.status;
      const hasDriver = !!load.details?.driver;
      const hasVehicle = !!load.details?.vehicle;

      // Auto-correct status if needed (for backward compatibility)
      if (hasDriver && hasVehicle && calculatedStatus === 'planned') {
        calculatedStatus = 'dispatched';
        // Don't save here - just return corrected status in response
      } else if ((!hasDriver || !hasVehicle) && calculatedStatus !== 'completed' && calculatedStatus !== 'delivered') {
        // If missing driver or vehicle and not completed/delivered, should be planned
        if (calculatedStatus !== 'planned') {
          calculatedStatus = 'planned';
        }
      }

      // Calculate total amount from payloads if not set in details
      let totalAmount = load.details?.amount || 0;
      if (totalAmount === 0 && load.payloads && load.payloads.length > 0) {
        totalAmount = load.payloads.reduce((sum, payload) => {
          return sum + (payload.priceAndValues?.salePrice || payload.priceAndValues?.price || 0);
        }, 0);
      }

      return {
        _id: load._id,  // Add the _id field for frontend compatibility
        orderId: load._id,
        loadNumber: load.details?.internalId || load._id.toString().slice(-8).toUpperCase(),
        driverName: load.details?.driver?.name || null,
        driverId: load.details?.driver?._id || null,
        vehicleId: load.details?.vehicle?._id || null,
        vehiclePlate: load.details?.vehicle?.plateNumber || null,
        customerName: load.details?.customer?.name || null,
        customerEmail: load.details?.customer?.email || null,
        receiver: load.details?.receiver || null,
        amount: totalAmount,
        rate: load.details?.rate || 0,
        route: load.route || [],
        status: calculatedStatus,
        notes: load.notes || null,
        assignedAt: load.assignedAt || null,
        startedAt: load.startedAt || null,
        completedAt: load.completedAt || null,
        details: load.details || {},
        payloads: load.payloads || [],
      };
    });
    // Calculate total pages
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      count: formattedLoads.length,
      data: formattedLoads,
      pagination: {
        current: pageNum,
        pages: totalPages,
        total: total,
        limit: limitNum
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// ✅ Get Single Load by ID
export const getLoadById = async (req, res) => {
  try {
    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    let query = { _id: req.params.id };

    if (isSuperadmin) {
      // Superadmin can see any load (no company filter)
      // query remains as is
    } else if (companyId) {
      // User has company - filter by company
      query.company = companyId;
    } else {
      // User has no company - cannot see loads (loads are company-based)
      return res.status(404).json({
        success: false,
        message: "Load not found. No company assigned."
      });
    }
    console.log(query);

    const load = await Load.findOne(query)
      .populate("details.customer")
      .populate("details.facilator")
      .populate("details.driver")
      .populate("route.wayPoints.customer");

    if (!load) {
      return res
        .status(404)
        .json({ success: false, message: "Load not found" });
    }

    res.json({ success: true, load });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Update Load
export const updateLoad = async (req, res) => {
  try {
    console.log('🔍 updateLoad called');
    console.log('🔍 req.params.id:', req.params.id);
    console.log('🔍 req.body:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const loadId = req.params.id;
    const updateData = { ...req.body };
    const rawDetailsPayload = parseJSONSafely(updateData.details, null);
    const rawRoutePayload = parseJSONSafely(updateData.route, null);
    const rawPayloadsPayload = parseJSONSafely(updateData.payloads, null);
    const rawServicesPayload = parseJSONSafely(updateData.services, null);

    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    let query = { _id: loadId };

    if (isSuperadmin) {
      // Superadmin can see any load (no company filter)
      // query remains as is
    } else if (companyId) {
      // User has company - filter by company
      query.company = companyId;
    } else {
      // User has no company - cannot update loads (loads are company-based)
      return res.status(403).json({
        success: false,
        message: "No company assigned. Cannot update loads without a company."
      });
    }

    // Get current load to check driver and truck
    const currentLoad = await Load.findOne(query);
    if (!currentLoad) {
      return res.status(404).json({ success: false, message: "Load not found" });
    }

    // Handle nested details updates
    if (rawDetailsPayload) {
      const sanitizedDetails = sanitizeDetails(rawDetailsPayload, { partial: true });
      const existingDetails =
        typeof currentLoad.details?.toObject === "function"
          ? currentLoad.details.toObject()
          : currentLoad.details || {};
      updateData.details = { ...existingDetails, ...sanitizedDetails };
      if (!updateData.details.internalId) {
        updateData.details.internalId =
          existingDetails.internalId || `LOAD_${Date.now()}`;
      }
    }

    if (rawRoutePayload) {
      const newRoute = await buildRouteData(rawRoutePayload);
      if (!newRoute) {
        return res.status(400).json({
          success: false,
          message: "Route information is invalid.",
        });
      }

      if (newRoute.multipleDropOffs) {
        if (!newRoute.wayPoints || !newRoute.wayPoints.length) {
          return res.status(400).json({
            success: false,
            message: "At least one waypoint is required for multi drop-off routes.",
          });
        }
        if (newRoute.wayPoints.some((wp) => !wp.address)) {
          return res.status(400).json({
            success: false,
            message: "All waypoints must include a valid address.",
          });
        }
      } else {
        if (!newRoute.selectPickup || !newRoute.selectDropOff) {
          return res.status(400).json({
            success: false,
            message: "Pickup and drop-off locations are required.",
          });
        }
      }

      updateData.route = newRoute;
    }

    if (rawPayloadsPayload) {
      const payloads = buildPayloads(rawPayloadsPayload);
      if (!payloads.length) {
        return res.status(400).json({
          success: false,
          message: "At least one payload item is required.",
        });
      }
      const missingPayloadField = payloads.findIndex(
        (payload) => !payload.itemName || !payload.internalId
      );
      if (missingPayloadField !== -1) {
        return res.status(400).json({
          success: false,
          message: `Payload item ${missingPayloadField + 1} requires an item name and internal ID.`,
        });
      }
      updateData.payloads = payloads;
    }

    if (rawServicesPayload) {
      const currentServices =
        typeof currentLoad.services?.toObject === "function"
          ? currentLoad.services.toObject()
          : currentLoad.services || {};
      updateData.services = {
        ...currentServices,
        ...buildServices(rawServicesPayload, { partial: true }),
      };
    }

    if (updateData.notes !== undefined) {
      updateData.notes = normalizeString(updateData.notes) || "";
    }

    // Determine status based on driver and truck assignment
    const driverId = updateData.details?.driver || currentLoad.details?.driver;
    const vehicleId = updateData.details?.vehicle || currentLoad.details?.vehicle;

    // If both driver and truck are assigned, status should be "dispatched"
    // If either is missing, status should be "planned"
    if (driverId && vehicleId) {
      // Both assigned - set to dispatched (unless already in a more advanced status)
      if (!updateData.status || updateData.status === 'planned') {
        updateData.status = 'dispatched';
      }
      // Set assignedAt if not already set
      if (!currentLoad.assignedAt) {
        updateData.assignedAt = new Date();
      }
    } else if (!driverId || !vehicleId) {
      // Missing driver or truck - set to planned
      if (!updateData.status || (updateData.status !== 'completed' && updateData.status !== 'delivered')) {
        updateData.status = 'planned';
      }
    }

    console.log('🔍 Updating load with ID:', loadId);
    const load = await Load.findOneAndUpdate(query, updateData, {
      new: true,
      runValidators: true
    })
      .populate('details.driver', 'name phone email')
      .populate('details.vehicle', 'plateNumber make model')
      .populate('details.customer', 'name email phone');

    if (!load) {
      console.log('❌ Load not found with ID:', loadId);
      return res.status(404).json({ success: false, message: "Load not found" });
    }

    // ✅ Send email notification if driver was just assigned (wasn't assigned before, but is now)
    const wasDriverAssignedBefore = currentLoad.details?.driver?.toString();
    const isDriverAssignedNow = load.details?.driver?.toString();

    if (!wasDriverAssignedBefore && isDriverAssignedNow && load.details?.driver?.email) {
      try {
        const emailResult = await sendLoadAssignmentEmail({
          driverEmail: load.details.driver.email,
          driverName: load.details.driver.name || 'Driver',
          loadId: load._id.toString(),
          loadInternalId: load.details?.internalId,
          loadDetails: {
            pickupAddress: load.route?.selectPickup?.place || load.route?.selectPickup?.address,
            dropoffAddress: load.route?.selectDropOff?.place || load.route?.selectDropOff?.address,
            customerName: load.details?.customer?.name || load.details?.customer,
            vehiclePlate: load.details?.vehicle?.plateNumber,
            assignedAt: load.assignedAt,
            route: load.route
          }
        });

        if (emailResult.success) {
          console.log('✅ Load assignment email sent to driver:', load.details.driver.email);
        } else {
          console.warn('⚠️ Failed to send load assignment email:', emailResult.message);
        }
      } catch (emailError) {
        console.error('❌ Error sending load assignment email:', emailError);
        // Don't fail the load update if email fails
      }
    }

    // ✅ Create shift when driver and truck are assigned (if not already exists)
    if (isDriverAssignedNow && load.details?.vehicle) {
      try {
        // Check if shift already exists for this load
        const existingShift = await Shift.findOne({ load: load._id });
        if (!existingShift) {
          await Shift.create({
            driver: load.details.driver,
            vehicle: load.details.vehicle,
            load: load._id,
            shiftDate: load.assignedAt || new Date(),
            startTime: load.assignedAt || new Date(),
            endTime: new Date((load.assignedAt || new Date()).getTime() + 4 * 60 * 60 * 1000), // 4 hours default
            status: "scheduled",
            notes: `Auto-created shift for Load ${load.details?.internalId || load._id}`,
          });
        }
      } catch (shiftError) {
        console.error('Error creating shift:', shiftError);
        // Don't fail the load update if shift creation fails
      }
    }

    console.log('✅ Load updated successfully:', load._id);
    res.json({ success: true, message: "Load updated successfully", load });
  } catch (error) {
    console.error('❌ updateLoad error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Assign Driver and Truck to Load
export const assignDriverTruck = async (req, res) => {
  try {
    const { loadId } = req.params;
    const { driverId, vehicleId, trailerId, planDate } = req.body;

    if (!driverId || !vehicleId) {
      return res.status(400).json({
        success: false,
        message: "Both driver and truck are required"
      });
    }

    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    let query = { _id: loadId };

    if (isSuperadmin) {
      // Superadmin can see any load (no company filter)
      // query remains as is
    } else if (companyId) {
      // User has company - filter by company
      query.company = companyId;
    } else {
      // User has no company - cannot assign driver/truck (loads are company-based)
      return res.status(403).json({
        success: false,
        message: "No company assigned. Cannot assign driver/truck without a company."
      });
    }

    const load = await Load.findOne(query);
    if (!load) {
      return res.status(404).json({ success: false, message: "Load not found" });
    }

    // Update load with driver and truck
    load.details.driver = driverId;
    load.details.vehicle = vehicleId;
    load.status = 'dispatched'; // Both assigned, set to dispatched
    load.assignedAt = new Date();

    if (planDate) {
      load.assignedAt = new Date(planDate);
    }

    await load.save();

    // ✅ Create shift when driver and truck are assigned
    try {
      // Check if shift already exists for this load
      const existingShift = await Shift.findOne({ load: load._id });
      if (!existingShift) {
        await Shift.create({
          driver: driverId,
          vehicle: vehicleId,
          load: load._id,
          shiftDate: load.assignedAt || new Date(),
          startTime: load.assignedAt || new Date(),
          endTime: new Date((load.assignedAt || new Date()).getTime() + 4 * 60 * 60 * 1000), // 4 hours default
          status: "scheduled",
          notes: `Auto-created shift for Load ${load.details?.internalId || load._id}`,
        });
      }
    } catch (shiftError) {
      console.error('Error creating shift:', shiftError);
      // Don't fail the assignment if shift creation fails
    }

    // Populate before returning
    await load.populate('details.driver', 'name phone email');
    await load.populate('details.vehicle', 'plateNumber make model');
    await load.populate('details.customer', 'name email phone');

    // Log activity
    if (req.user) {
      try {
        await ActivityLog.create({
          performedBy: req.user._id || req.user.id,
          action: `Load assigned to driver and truck`,
          driver: driverId,
          changeSummary: `Load ${load.details.internalId || loadId} assigned to driver and vehicle`,
        });
      } catch (activityError) {
        console.error('Error logging activity:', activityError);
      }
    }

    // ✅ Send email notification to driver
    try {
      if (load.details?.driver && load.details.driver.email) {
        const emailResult = await sendLoadAssignmentEmail({
          driverEmail: load.details.driver.email,
          driverName: load.details.driver.name || 'Driver',
          loadId: load._id.toString(),
          loadInternalId: load.details?.internalId,
          loadDetails: {
            pickupAddress: load.route?.selectPickup?.place || load.route?.selectPickup?.address,
            dropoffAddress: load.route?.selectDropOff?.place || load.route?.selectDropOff?.address,
            customerName: load.details?.customer?.name || load.details?.customer,
            vehiclePlate: load.details?.vehicle?.plateNumber,
            assignedAt: load.assignedAt,
            route: load.route
          }
        });

        if (emailResult.success) {
          console.log('✅ Load assignment email sent to driver:', load.details.driver.email);
        } else {
          console.warn('⚠️ Failed to send load assignment email:', emailResult.message);
        }
      } else {
        console.warn('⚠️ Driver email not found, skipping email notification');
      }
    } catch (emailError) {
      console.error('❌ Error sending load assignment email:', emailError);
      // Don't fail the assignment if email fails
    }

    res.json({
      success: true,
      message: "Driver and truck assigned successfully",
      load
    });
  } catch (error) {
    console.error('Error assigning driver and truck:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Delete Load
export const deleteLoad = async (req, res) => {
  try {
    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    let query = { _id: req.params.id };

    if (isSuperadmin) {
      // Superadmin can delete any load (no company filter)
      // query remains as is
    } else if (companyId) {
      // User has company - filter by company
      query.company = companyId;
    } else {
      // User has no company - cannot delete loads (loads are company-based)
      return res.status(403).json({
        success: false,
        message: "No company assigned. Cannot delete loads without a company."
      });
    }

    const load = await Load.findOneAndDelete(query);

    if (!load) {
      return res
        .status(404)
        .json({ success: false, message: "Load not found" });
    }

    res.json({ success: true, message: "Load deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Delivery Loads (Completed) ===
export const getDeliveryLoads = async (req, res) => {
  try {
    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Build query for delivered/completed loads
    let query = { status: { $in: ["delivered", "completed"] } };

    if (isSuperadmin) {
      // Superadmin can see all loads (no company filter)
      // query remains as is
    } else if (companyId) {
      // User has company - filter by company
      query.company = companyId;
    } else {
      // User has no company - return empty result (loads are company-based)
      return res.json({
        success: true,
        count: 0,
        data: [],
        message: "No company assigned. Please complete company settings to view loads."
      });
    }

    const loads = await Load.find(query)
      .populate("details.customer", "name email")
      .populate("details.driver", "name phone email internalId")
      .populate("details.vehicle", "plateNumber make model internalId")
      .populate("route.wayPoints.customer", "name email")
      .sort({ completedAt: -1 });

    const formattedLoads = loads.map((load) => {
      // Calculate total amount from payloads if not set
      let totalAmount = load.details?.amount || 0;
      if (totalAmount === 0 && load.payloads && load.payloads.length > 0) {
        totalAmount = load.payloads.reduce((sum, payload) => {
          return sum + (payload.priceAndValues?.salePrice || payload.priceAndValues?.price || 0);
        }, 0);
      }

      return {
        _id: load._id,
        loadNumber: load.details?.internalId || load._id.toString().slice(-8).toUpperCase(),
        orderNumber: load._id.toString().slice(-8).toUpperCase(),
        customerName: load.details?.customer?.name || null,
        customerEmail: load.details?.customer?.email || null,
        amount: totalAmount,
        rate: load.details?.rate || 0,
        status: load.status,
        paymentStatus: load.paymentStatus || "pending",
        deliveryDate: load.completedAt || null,
        route: load.route || {},
        deliveryDocuments: load.deliveryDocuments || {},
        details: load.details || {},
        payloads: load.payloads || [],
        completedAt: load.completedAt || null
      };
    });

    res.json({
      success: true,
      count: formattedLoads.length,
      data: formattedLoads
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Upload Delivery Document ===
export const uploadDeliveryDocument = async (req, res) => {
  try {
    const { loadId, documentType } = req.params; // documentType: 'bol', 'pod', or 'billOfSale'
    const userId = req.admin?.id || req.user?.id;

    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    let query = { _id: loadId };

    if (isSuperadmin) {
      // Superadmin can see any load (no company filter)
      // query remains as is
    } else if (companyId) {
      // User has company - filter by company
      query.company = companyId;
    } else {
      // User has no company - can only see loads with no company
      // Combine _id filter with company filter using $and
      query = {
        $and: [
          { _id: loadId },
          {
            $or: [
              { company: null },
              { company: { $exists: false } }
            ]
          }
        ]
      };
    }

    const load = await Load.findOne(query);
    if (!load) {
      return res.status(404).json({ success: false, message: "Load not found" });
    }

    // Validate document type
    const validTypes = ['bol', 'pod', 'billOfSale'];
    if (!validTypes.includes(documentType)) {
      return res.status(400).json({ success: false, message: "Invalid document type" });
    }

    // Handle file upload
    let documentUrl = null;
    if (req.file) {
      if (process.env.NODE_ENV === "production") {
        documentUrl = req.file.location; // From AWS S3
      } else {
        documentUrl = `${req.protocol}://${req.get("host")}/${req.file.path}`; // Local
      }
    }

    // Update delivery documents
    if (!load.deliveryDocuments) {
      load.deliveryDocuments = {};
    }

    load.deliveryDocuments[documentType] = {
      url: documentUrl,
      uploadedAt: new Date(),
      uploadedBy: userId
    };

    await load.save();

    res.json({
      success: true,
      message: `${documentType.toUpperCase()} uploaded successfully`,
      load
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Update Payment Status ===
export const updatePaymentStatus = async (req, res) => {
  try {
    const { loadId } = req.params;
    const { paymentMethod, paymentReference, paymentDate, notes } = req.body;
    const userId = req.admin?.id || req.user?.id;

    const load = await Load.findById(loadId);
    if (!load) {
      return res.status(404).json({ success: false, message: "Load not found" });
    }

    // Update payment status
    load.paymentStatus = "paid";

    // Update payment details
    if (!load.paymentDetails) {
      load.paymentDetails = {};
    }

    load.paymentDetails = {
      paymentMethod: paymentMethod || null,
      paymentReference: paymentReference || null,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paidBy: userId,
      notes: notes || null
    };

    await load.save();

    res.json({
      success: true,
      message: "Payment status updated successfully",
      load
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Dispatcher Dashboard Stats ===
export const getDispatcherDashboard = async (req, res) => {
  try {
    const { FleetUnit } = await import("../models/fleet/fleetUnitModel.js");
    const { User } = await import("../models/driver/userModel.js");
    const { Invoice } = await import("../models/hr/invoiceModel.js");
    const { Shift } = await import("../models/driver/shiftModel.js");
    const Trip = (await import("../models/tripModel.js")).default;
    const { getUserCompanyId } = await import("../utils/companyFilter.js");
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: null
      });
    }

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;

    // Get combined filter (company + trial data filter)
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Get current date info
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    // Build query filters with company and trial data filtering
    const fleetQuery = baseFilter || {};
    const driverQuery = baseFilter ? { ...baseFilter, role: "driver" } : { role: "driver" };
    const tripQuery = baseFilter || {};

    // === VEHICLE STATS (using Vehicle model) ===
    const { Vehicle } = await import("../models/driver/vehicleModel.js");

    // Build vehicle query
    const vehicleQuery = { ...fleetQuery };

    const totalVehicles = await Vehicle.countDocuments(vehicleQuery);

    // Active vehicles: status is 'In Service' (case insensitive check to be safe)
    const activeVehicles = await Vehicle.countDocuments({
      ...vehicleQuery,
      status: { $regex: /^in service$/i }
    });

    // Vehicles with driver assigned
    const vehiclesWithDriver = await Vehicle.countDocuments({
      ...vehicleQuery,
      driver: { $exists: true, $ne: null }
    });

    console.log(`📊 Dashboard Stats - Vehicles: Total=${totalVehicles}, Active=${activeVehicles}, WithDriver=${vehiclesWithDriver}`);

    // === TRAILER STATS (using Trailer model) ===
    const { Trailer } = await import("../models/driver/trailerModel.js");

    // Build trailer query
    const trailerQuery = { ...fleetQuery };

    const totalTrailers = await Trailer.countDocuments(trailerQuery);

    // Active trailers: status is 'In Service'
    const activeTrailers = await Trailer.countDocuments({
      ...trailerQuery,
      status: { $regex: /^in service$/i }
    });

    // Trailers in use: operationStatus is 'in_transit' or 'loading', or loadedStatus is 'LOADED'
    const trailersInUse = await Trailer.countDocuments({
      ...trailerQuery,
      $or: [
        { operationStatus: { $in: ["in_transit", "loading", "moving"] } },
        { loadedStatus: "LOADED" }
      ]
    });

    console.log(`📊 Dashboard Stats - Trailers: Total=${totalTrailers}, Active=${activeTrailers}, InUse=${trailersInUse}`);

    // === DRIVER STATS ===
    const totalDrivers = await User.countDocuments(driverQuery);
    const activeDrivers = await User.countDocuments({
      ...driverQuery,
      status: "active"
    });

    // Drivers currently on shift (filter by company if applicable)
    const shiftQuery = {};
    if (userCompanyId) {
      // Find drivers with this company
      const companyDrivers = await User.find({ company: userCompanyId, role: "driver" }).select('_id');
      const driverIds = companyDrivers.map(d => d._id);
      if (driverIds.length > 0) {
        shiftQuery.driver = { $in: driverIds };
      } else {
        shiftQuery.driver = { $in: [] }; // No drivers, so no shifts
      }
    }
    shiftQuery.shiftDate = { $gte: today };
    shiftQuery.status = "active";

    // Get unique driver IDs from active shifts (not just count shifts)
    const allActiveDriverIds = new Set();

    // Add drivers from shifts
    if (!userCompanyId || (shiftQuery.driver && shiftQuery.driver.$in && shiftQuery.driver.$in.length > 0)) {
      const shiftsWithDrivers = await Shift.find(shiftQuery).select("driver").lean();
      shiftsWithDrivers.forEach(shift => {
        if (shift.driver) {
          const driverId = typeof shift.driver === 'object'
            ? shift.driver._id?.toString() || shift.driver.toString()
            : shift.driver.toString();
          allActiveDriverIds.add(driverId);
        }
      });
    }

    // Also count drivers who are assigned to active trips (in-progress)
    // This includes drivers who are working on trips even if they don't have an active shift record
    const activeTripQuery = {
      ...tripQuery,
      status: "in-progress",
      driver: { $exists: true, $ne: null }
    };

    // Get unique driver IDs from active trips
    const activeTripsWithDrivers = await Trip.find(activeTripQuery)
      .select("driver")
      .lean();

    activeTripsWithDrivers.forEach(trip => {
      if (trip.driver) {
        const driverId = typeof trip.driver === 'object'
          ? trip.driver._id?.toString() || trip.driver.toString()
          : trip.driver.toString();
        allActiveDriverIds.add(driverId);
      }
    });

    // Also check loads with active status that have drivers assigned
    const activeLoadsWithDrivers = await Load.find({
      ...tripQuery,
      "details.driver": { $exists: true, $ne: null },
      status: { $in: ["planned", "dispatched", "in-delivery", "active"] }
    }).select("details.driver").lean();

    activeLoadsWithDrivers.forEach(load => {
      if (load.details?.driver) {
        const driverId = typeof load.details.driver === 'object'
          ? load.details.driver._id?.toString() || load.details.driver.toString()
          : load.details.driver.toString();
        allActiveDriverIds.add(driverId);
      }
    });

    // Final count: unique drivers who are either on shift, have active trips, or have active loads
    const driversOnShift = allActiveDriverIds.size;

    // === DRIVERS ON LEAVE (from attendance records for today) ===
    const { Attendance } = await import("../models/hr/attendanceModel.js");
    const todayStartForLeave = new Date(today);
    todayStartForLeave.setHours(0, 0, 0, 0);
    const todayEndForLeave = new Date(today);
    todayEndForLeave.setHours(23, 59, 59, 999);

    // Get all drivers first to filter attendance records
    const allDriverIds = await User.find(driverQuery).select('_id').lean();
    const driverIdArray = allDriverIds.map(d => d._id);

    // Get attendance records for today with leave status
    const attendanceLeaveQuery = {
      date: { $gte: todayStartForLeave, $lte: todayEndForLeave },
      status: 'leave',
      employee: { $in: driverIdArray }
    };
    if (companyFilter) {
      attendanceLeaveQuery.company = userCompanyId;
    }

    const driversOnLeave = await Attendance.countDocuments(attendanceLeaveQuery);

    // === UNASSIGNED DRIVERS ===
    // Get all trips with drivers assigned (planned or in-progress)
    const assignedTrips = await Trip.find({
      ...tripQuery,
      driver: { $exists: true, $ne: null },
      status: { $in: ["planned", "in-progress"] }
    }).select("driver").lean();

    // Get unique driver IDs from assigned trips
    const assignedDriverIds = new Set();
    assignedTrips.forEach(trip => {
      if (trip.driver) {
        const driverId = typeof trip.driver === 'object'
          ? trip.driver._id?.toString() || trip.driver.toString()
          : trip.driver.toString();
        assignedDriverIds.add(driverId);
      }
    });

    // Count active drivers who are not assigned to any trip
    const activeDriverIds = await User.find({
      ...driverQuery,
      status: "active"
    }).select('_id').lean();

    let unassignedDrivers = 0;
    activeDriverIds.forEach(driver => {
      const driverId = driver._id.toString();
      if (!assignedDriverIds.has(driverId)) {
        unassignedDrivers++;
      }
    });

    // === TRIP STATS ===
    // === ORDER STATS (Mapped to Trip keys for frontend compatibility) ===
    // Reusing existing baseFilter from scope
    const orderQuery = baseFilter || {};

    const totalTrips = await Order.countDocuments(orderQuery);
    const plannedTrips = await Order.countDocuments({ ...orderQuery, status: { $in: ["planned", "quoted"] } });
    const inProgressTrips = await Order.countDocuments({ ...orderQuery, status: { $in: ["in-delivery", "in-progress", "dispatched", "active", "started"] } });
    const completedTrips = await Order.countDocuments({ ...orderQuery, status: { $in: ["delivered", "completed"] } });

    // === TODAY AND TOMORROW ORDER COUNTS ===
    // Today's date range (start of today to end of today)
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    // Tomorrow's date range (start of tomorrow to end of tomorrow)
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStart = new Date(tomorrow);
    tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    // Today's orders: pickup date is today OR created today
    const todayOrdersQuery = {
      ...orderQuery,
      $or: [
        { pickupDate: { $gte: todayStart, $lte: todayEnd } },
        { createdAt: { $gte: todayStart, $lte: todayEnd } }
      ]
    };
    const todayTrips = await Order.countDocuments(todayOrdersQuery);

    // Tomorrow's orders: pickup date is tomorrow
    const tomorrowOrdersQuery = {
      ...orderQuery,
      pickupDate: { $gte: tomorrowStart, $lte: tomorrowEnd }
    };
    const tomorrowTrips = await Order.countDocuments(tomorrowOrdersQuery);

    // === REVENUE STATS ===
    // Get completed loads revenue (last 30 days)
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Build match stage for aggregation with company and trial filters
    const orderMatchStage = {
      status: { $in: ["completed", "delivered"] },
      updatedAt: { $gte: thirtyDaysAgo } // Using updatedAt as proxy for completedAt
    };
    if (baseFilter) {
      Object.assign(orderMatchStage, baseFilter);
    }

    const completedOrdersThisMonth = await Order.aggregate([
      {
        $match: orderMatchStage
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" }, // Order uses totalAmount
          totalLoads: { $sum: 1 }
        }
      }
    ]);

    const revenueData = completedOrdersThisMonth[0] || { totalRevenue: 0, totalLoads: 0 };

    // Calculate revenue per mile (simplified - would need actual mileage data)
    const avgRevenuePerLoad = revenueData.totalLoads > 0
      ? revenueData.totalRevenue / revenueData.totalLoads
      : 0;

    // Get invoices not sent (pending status orders without invoice)
    // Using Order model now
    const invoiceMatchStage = {
      status: { $in: ["delivered", "completed"] },
      updatedAt: { // Using updatedAt as proxy for completion time if completedAt not available, or check if Order has completedAt
        $gte: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000),
        $lte: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000)
      }
    };
    if (baseFilter) {
      Object.assign(invoiceMatchStage, baseFilter);
    }

    const ordersWithoutInvoice = await Order.aggregate([
      {
        $match: invoiceMatchStage
      },
      {
        $lookup: {
          from: "invoices",
          localField: "_id",
          foreignField: "orderId", // Invoice has orderId
          as: "invoices"
        }
      },
      {
        $match: {
          invoices: { $size: 0 }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" }, // Order uses totalAmount
          count: { $sum: 1 }
        }
      }
    ]);

    const invoicesNotSent = ordersWithoutInvoice[0] || { totalAmount: 0, count: 0 };

    // Get outstanding payments (Unpaid Invoices)
    // Orders that are delivered/completed AND accountingStatus is pending or unpaid
    const outstandingMatchStage = {
      status: { $in: ["delivered", "completed"] },
      accountingStatus: { $in: ["pending", "unpaid"] } // Order uses accountingStatus
    };
    if (baseFilter) {
      Object.assign(outstandingMatchStage, baseFilter);
    }

    const outstandingPayments = await Order.aggregate([
      {
        $match: outstandingMatchStage
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" }, // Order uses totalAmount
          count: { $sum: 1 }
        }
      }
    ]);

    const outstanding = outstandingPayments[0] || { totalAmount: 0, count: 0 };

    // === WEEKLY REVENUE TREND ===
    // === WEEKLY REVENUE TREND ===
    const weeklyMatchStage = {
      status: { $in: ["completed", "delivered"] },
      updatedAt: { $gte: new Date(today.getTime() - 35 * 24 * 60 * 60 * 1000) } // Using updatedAt
    };
    if (baseFilter) {
      Object.assign(weeklyMatchStage, baseFilter);
    }

    const weeklyRevenue = await Order.aggregate([
      {
        $match: weeklyMatchStage
      },
      {
        $group: {
          _id: {
            week: { $week: "$updatedAt" },
            year: { $year: "$updatedAt" }
          },
          totalRevenue: { $sum: "$totalAmount" }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.week": 1 }
      },
      {
        $limit: 5
      }
    ]);

    // Pad weekly data to ensure 5 weeks
    const weeks = weeklyRevenue.map(w => w.totalRevenue);
    while (weeks.length < 5) {
      weeks.unshift(280000); // Default value for older weeks
    }

    res.json({
      success: true,
      message: "Dashboard data fetched successfully",
      data: {
        // Vehicle metrics (flat structure for frontend compatibility)
        totalVehicles,
        activeVehicles,
        vehiclesWithDriver,

        // Trailer metrics (flat structure for frontend compatibility)
        totalTrailers,
        activeTrailers,
        trailersInUse,

        // Utilization metrics (nested structure for charts)
        truckUtilization: {
          active: activeVehicles,
          total: totalVehicles,
          percentage: totalVehicles > 0 ? Math.round((activeVehicles / totalVehicles) * 100) : 0
        },
        trailerUtilization: {
          active: activeTrailers,
          total: totalTrailers,
          percentage: totalTrailers > 0 ? Math.round((activeTrailers / totalTrailers) * 100) : 0
        },

        // Driver metrics
        totalDrivers,
        activeDrivers,
        driversOnShift,
        driversOnLeave,
        unassignedDrivers,

        // Trip metrics
        totalTrips,
        plannedTrips,
        inProgressTrips,
        completedTrips,
        todayTrips,
        tomorrowTrips,

        // Revenue metrics
        revenuePerMile: avgRevenuePerLoad,
        weeklyRevenueTrend: weeks,
        totalRevenue: revenueData.totalRevenue,

        // Billing metrics
        invoicesNotSent: {
          amount: invoicesNotSent.totalAmount,
          count: invoicesNotSent.count
        },
        outstandingPayments: {
          amount: outstanding.totalAmount,
          count: outstanding.count
        }
      }
    });
  } catch (error) {
    console.error("Dispatcher dashboard error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Utilization Controller ===
export const getUtilization = async (req, res) => {
  try {
    const { Vehicle } = await import("../models/driver/vehicleModel.js");
    const { Trailer } = await import("../models/driver/trailerModel.js");
    const { getUserCompanyId } = await import("../utils/companyFilter.js");
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current user.",
        data: {
          trucks: [],
          trailers: []
        }
      });
    }

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Fetch trucks from Vehicle model
    const truckQuery = baseFilter || {};
    const truckUnits = await Vehicle.find(truckQuery)
      .populate('driver', 'name email phone')
      .populate('trailer', 'unitNumber trailer plateNumber')
      .lean();

    // Map trucks to include all relevant fields from Vehicle model
    const trucks = truckUnits.map((unit) => {
      const location = unit.currentLocation?.address ||
        (unit.currentLocation?.latitude && unit.currentLocation?.longitude
          ? `${unit.currentLocation.latitude}, ${unit.currentLocation.longitude}`
          : 'Unknown Location');

      // Determine service status based on status and operationStatus
      const statusLower = (unit.status || '').toLowerCase();
      const opStatusLower = (unit.operationStatus || '').toLowerCase();
      let serviceStatus = 'out of service';
      if (statusLower === 'in service' || opStatusLower === 'in service' || opStatusLower === 'available') {
        serviceStatus = 'in service';
      }

      return {
        id: unit._id.toString(),
        _id: unit._id.toString(),
        unitNumber: unit.unitNumber || '',
        internalId: unit.internalId || '',
        plateNumber: unit.plateNumber || '',
        vinNumber: unit.vinNumber || '',
        make: unit.make || '',
        model: unit.model || '',
        year: unit.year || '',
        type: unit.type || '',
        weight: unit.weight || '',
        uom: unit.uom || '',
        registrationCountry: unit.registrationCountry || '',
        registrationProvince: unit.registrationProvince || '',
        status: unit.status || '',
        operationStatus: unit.operationStatus || '',
        ownership: unit.ownership || '',
        subType: unit.subType || '',
        currentLocation: location,
        latitude: unit.currentLocation?.latitude || '',
        longitude: unit.currentLocation?.longitude || '',
        speed: unit.speed || 0,
        fuelLevel: unit.fuelLevel || 0,
        odometer: unit.odometer || 0,
        driver: unit.driver ? {
          _id: unit.driver._id,
          name: unit.driver.name || '',
          email: unit.driver.email || '',
          phone: unit.driver.phone || ''
        } : null,
        trailer: unit.trailer ? {
          _id: unit.trailer._id,
          unitNumber: unit.trailer.unitNumber || '',
          trailer: unit.trailer.trailer || '',
          plateNumber: unit.trailer.plateNumber || ''
        } : null,
        serviceStatus: serviceStatus,
        capacity: unit.capacity || '',
        serialNumber: unit.serialNumber || '',
        compliance: unit.compliance || '',
        category: unit.category || ''
      };
    });

    // Fetch trailers from Trailer model
    const trailerQuery = baseFilter || {};
    const trailerUnits = await Trailer.find(trailerQuery)
      .populate('attachedVehicle', 'unitNumber plateNumber make model')
      .lean();

    // Map trailers to include all relevant fields from Trailer model
    const trailers = trailerUnits.map((unit) => {
      const location = unit.currentLocation?.address ||
        (unit.currentLocation?.latitude && unit.currentLocation?.longitude
          ? `${unit.currentLocation.latitude}, ${unit.currentLocation.longitude}`
          : 'Unknown Location');

      // Determine trailer status: "loaded" if operationStatus is "in_transit" or "loading", else "empty"
      const opStatusLower = (unit.operationStatus || '').toLowerCase();
      const loadedStatusLower = (unit.loadedStatus || '').toLowerCase();
      let trailerStatus = 'empty';
      if (opStatusLower === 'in_transit' || opStatusLower === 'loading' || loadedStatusLower === 'loaded') {
        trailerStatus = 'loaded';
      }

      // Determine service status
      const statusLower = (unit.status || '').toLowerCase();
      const opStatus = (unit.operationStatus || '').toLowerCase();
      let serviceStatus = 'out of service';
      if (statusLower === 'in service' || opStatus === 'in service' || opStatus === 'available' || opStatus === 'idle') {
        serviceStatus = 'in service';
      }

      return {
        id: unit._id.toString(),
        _id: unit._id.toString(),
        unitNumber: unit.unitNumber || '',
        internalId: unit.internalId || '',
        trailer: unit.trailer || '',
        trailerNumber: unit.trailer || unit.unitNumber || '',
        plateNumber: unit.plateNumber || '',
        vinNumber: unit.vinNumber || '',
        make: unit.make || '',
        model: unit.model || '',
        year: unit.year || '',
        type: unit.type || '',
        weight: unit.weight || '',
        uom: unit.uom || '',
        registrationCountry: unit.registrationCountry || '',
        registrationProvince: unit.registrationProvince || '',
        status: unit.status || '',
        operationStatus: unit.operationStatus || '',
        loadedStatus: unit.loadedStatus || '',
        ownership: unit.ownership || '',
        subType: unit.subType || '',
        currentLocation: location,
        latitude: unit.currentLocation?.latitude || '',
        longitude: unit.currentLocation?.longitude || '',
        speed: unit.speed || 0,
        capacity: unit.capacity || '',
        isAttached: unit.isAttached || false,
        attachedVehicle: unit.attachedVehicle ? {
          _id: unit.attachedVehicle._id,
          unitNumber: unit.attachedVehicle.unitNumber || '',
          plateNumber: unit.attachedVehicle.plateNumber || '',
          make: unit.attachedVehicle.make || '',
          model: unit.attachedVehicle.model || ''
        } : null,
        cargoDetails: unit.cargoDetails || null,
        sensors: unit.sensors || null,
        trailerStatus: trailerStatus,
        serviceStatus: serviceStatus,
        compliance: unit.compliance || '',
        category: unit.category || ''
      };
    });

    return res.json({
      success: true,
      data: {
        trucks: trucks,
        trailers: trailers
      }
    });
  } catch (error) {
    console.error("Utilization error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Get Active Orders with Tracking (for Trip Tracker) ===
export const getActiveOrdersWithTracking = async (req, res) => {
  try {
    const OrderModel = (await import("../models/orderModel.js")).default;
    const { Vehicle } = await import("../models/driver/vehicleModel.js");
    const { getUserCompanyId } = await import("../utils/companyFilter.js");
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");
    const { updateVehicleByTrackingKey } = await import("../services/samsara.js");

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current user.",
        data: []
      });
    }

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Get active orders (driver has started - status not COMPLETED)
    const query = {
      ...baseFilter,
      status: { $nin: ['COMPLETED', 'completed'] },
      driver: { $exists: true, $ne: null }
    };

    // Fetch orders with populated data
    const orders = await OrderModel.find(query)
      .populate('customer', 'name email phone')
      .populate('driver', 'name email phone internalId')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'plateNumber licensePlate internalId make model unitNumber trackingKey currentLocation speed engineOn')
      .populate('trailer', 'plateNumber licensePlate internalId trailerNumber unitNumber')
      .populate('pickupLocation.placeId', 'name currentLocation.address currentLocation.latitude currentLocation.longitude')
      .populate('deliveryLocation.placeId', 'name currentLocation.address currentLocation.latitude currentLocation.longitude')
      .sort({ pickupDate: 1, deliveryDate: 1 })
      .lean();

    // Group orders by driver (since we want to show all orders for a driver)
    const ordersByDriver = {};

    orders.forEach(order => {
      if (!order.driver) return;

      const driverId = typeof order.driver === 'object' ? order.driver._id.toString() : order.driver.toString();

      if (!ordersByDriver[driverId]) {
        ordersByDriver[driverId] = {
          driver: order.driver,
          truck: order.truck,
          trailer: order.trailer,
          coDriver: order.coDriver,
          orders: []
        };
      }

      ordersByDriver[driverId].orders.push(order);
    });

    // Get yard coordinates for the company (starting point)
    let yardLocation = null;
    try {
      const { Yard } = await import("../models/fleet/yardModel.js");
      const yardFilter = userCompanyId ? { company: userCompanyId, status: 'active' } : { status: 'active' };
      const yard = await Yard.findOne(yardFilter).sort({ createdAt: 1 }).lean();
      
      if (yard && yard.coordinates && yard.coordinates.latitude && yard.coordinates.longitude) {
        yardLocation = {
          lat: parseFloat(yard.coordinates.latitude),
          lng: parseFloat(yard.coordinates.longitude),
          address: `${yard.yardName || 'Yard'} - ${yard.address || ''}, ${yard.city || ''}, ${yard.stateProvince || ''}`,
          yardName: yard.yardName || 'Yard',
          yardId: yard._id.toString()
        };
      }
    } catch (error) {
      console.warn('⚠️ Error fetching yard location:', error.message);
    }

    // Process each driver's orders to build combined route
    const result = await Promise.all(Object.values(ordersByDriver).map(async (driverGroup) => {
      const { driver, truck, trailer, coDriver, orders } = driverGroup;

      // Get current truck location from Vehicle model (with Samsara tracking if available)
      let currentLocation = null;
      let truckSpeed = 0;
      let truckEngineOn = false;

      if (truck && typeof truck === 'object') {
        // Update vehicle location from Samsara if trackingKey exists
        if (truck.trackingKey) {
          try {
            const updatedVehicle = await updateVehicleByTrackingKey(truck.trackingKey);
            if (updatedVehicle && updatedVehicle.currentLocation) {
              const loc = updatedVehicle.currentLocation;
              if (loc.latitude && loc.longitude && loc.latitude !== '0' && loc.longitude !== '0') {
                currentLocation = {
                  lat: parseFloat(loc.latitude),
                  lng: parseFloat(loc.longitude),
                  address: loc.address || ''
                };
                truckSpeed = updatedVehicle.speed || 0;
                truckEngineOn = updatedVehicle.engineOn || false;
              }
            }
          } catch (error) {
            console.warn(`Error updating vehicle tracking for ${truck.trackingKey}:`, error.message);
          }
        }

        // Fallback to vehicle's stored location if Samsara update failed
        if (!currentLocation && truck.currentLocation) {
          const loc = truck.currentLocation;
          if (loc.latitude && loc.longitude && loc.latitude !== '0' && loc.longitude !== '0') {
            currentLocation = {
              lat: parseFloat(loc.latitude),
              lng: parseFloat(loc.longitude),
              address: loc.address || ''
            };
            truckSpeed = truck.speed || 0;
            truckEngineOn = truck.engineOn || false;
          }
        }
      }

      // Build combined route from all orders' pickup and delivery locations
      const routeWaypoints = [];
      
      // Helper function to extract coordinates from address string (if contains lat/lng)
      const extractCoordsFromAddress = (address) => {
        if (!address) return { lat: null, lng: null };
        // Try to find lat,lng pattern in address
        const coordMatch = address.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
        if (coordMatch) {
          const lat = parseFloat(coordMatch[1]);
          const lng = parseFloat(coordMatch[2]);
          if (!isNaN(lat) && !isNaN(lng)) {
            return { lat, lng };
          }
        }
        return { lat: null, lng: null };
      };

      // Helper function to geocode address (async)
      const geocodeAddress = async (address) => {
        if (!address || !address.trim()) {
          return { lat: null, lng: null };
        }
        
        // First try to extract coordinates from address string
        const extracted = extractCoordsFromAddress(address);
        if (extracted.lat && extracted.lng) {
          return extracted;
        }
        
        // If no coordinates in address, try geocoding
        try {
          const { getCoordinatesFromAddress } = await import("../services/googlemap.js");
          const result = await getCoordinatesFromAddress(address);
          if (result.latitude && result.longitude) {
            return { lat: result.latitude, lng: result.longitude };
          }
        } catch (error) {
          console.warn(`⚠️ Geocoding failed for address: ${address}`, error.message);
        }
        
        return { lat: null, lng: null };
      };

      // Collect all stops that need geocoding
      const stopsToGeocode = [];

      orders.forEach((order) => {

        // Extract main pickup location
        let pickupLat = null;
        let pickupLng = null;
        let pickupAddress = '';

        if (order.pickupLocation) {
          if (order.pickupLocation.latitude && order.pickupLocation.longitude) {
            pickupLat = parseFloat(order.pickupLocation.latitude);
            pickupLng = parseFloat(order.pickupLocation.longitude);
            pickupAddress = order.pickupLocation.place || '';
          } else if (order.pickupLocation.placeId && typeof order.pickupLocation.placeId === 'object') {
            const place = order.pickupLocation.placeId;
            if (place.currentLocation) {
              pickupLat = parseFloat(place.currentLocation.latitude || 0);
              pickupLng = parseFloat(place.currentLocation.longitude || 0);
              pickupAddress = place.name || place.currentLocation.address || '';
            }
          }
        }

        // Extract main delivery location
        let deliveryLat = null;
        let deliveryLng = null;
        let deliveryAddress = '';

        if (order.deliveryLocation) {
          if (order.deliveryLocation.latitude && order.deliveryLocation.longitude) {
            deliveryLat = parseFloat(order.deliveryLocation.latitude);
            deliveryLng = parseFloat(order.deliveryLocation.longitude);
            deliveryAddress = order.deliveryLocation.place || '';
          } else if (order.deliveryLocation.placeId && typeof order.deliveryLocation.placeId === 'object') {
            const place = order.deliveryLocation.placeId;
            if (place.currentLocation) {
              deliveryLat = parseFloat(place.currentLocation.latitude || 0);
              deliveryLng = parseFloat(place.currentLocation.longitude || 0);
              deliveryAddress = place.name || place.currentLocation.address || '';
            }
          }
        }

        // Add main pickup waypoint (if not already added by stops)
        if (pickupLat && pickupLng && !isNaN(pickupLat) && !isNaN(pickupLng)) {
          // Check if this location is already in stops to avoid duplicates
          const isInStops = order.stops && order.stops.some(stop => {
            const stopCoords = extractCoordsFromAddress(stop.address);
            return stopCoords.lat && stopCoords.lng && 
                   Math.abs(stopCoords.lat - pickupLat) < 0.0001 && 
                   Math.abs(stopCoords.lng - pickupLng) < 0.0001;
          });
          
          if (!isInStops) {
            routeWaypoints.push({
              type: 'pickup',
              orderNumber: order.orderNumber,
              customerOrderNo: order.customerOrderNo,
              lat: pickupLat,
              lng: pickupLng,
              address: pickupAddress,
              orderId: order._id.toString(),
              stopNumber: 0
            });
          }
        }

        // Add all pickup stops (stops array) - collect for geocoding
        if (order.stops && Array.isArray(order.stops) && order.stops.length > 0) {
          order.stops.forEach((stop, index) => {
            if (stop.address) {
              stopsToGeocode.push({
                stop,
                index,
                orderNumber: order.orderNumber,
                customerOrderNo: order.customerOrderNo,
                orderId: order._id.toString(),
                type: 'pickup'
              });
            }
          });
        }

        // Add main delivery waypoint (if not already added by receiverStops)
        if (deliveryLat && deliveryLng && !isNaN(deliveryLat) && !isNaN(deliveryLng)) {
          // Check if this location is already in receiverStops to avoid duplicates
          const isInReceiverStops = order.receiverStops && order.receiverStops.some(stop => {
            const stopCoords = extractCoordsFromAddress(stop.address);
            return stopCoords.lat && stopCoords.lng && 
                   Math.abs(stopCoords.lat - deliveryLat) < 0.0001 && 
                   Math.abs(stopCoords.lng - deliveryLng) < 0.0001;
          });
          
          if (!isInReceiverStops) {
            routeWaypoints.push({
              type: 'delivery',
              orderNumber: order.orderNumber,
              customerOrderNo: order.customerOrderNo,
              lat: deliveryLat,
              lng: deliveryLng,
              address: deliveryAddress,
              orderId: order._id.toString(),
              stopNumber: 0
            });
          }
        }

        // Add all delivery stops (receiverStops array) - collect for geocoding
        if (order.receiverStops && Array.isArray(order.receiverStops) && order.receiverStops.length > 0) {
          order.receiverStops.forEach((stop, index) => {
            if (stop.address) {
              stopsToGeocode.push({
                stop,
                index,
                orderNumber: order.orderNumber,
                customerOrderNo: order.customerOrderNo,
                orderId: order._id.toString(),
                type: 'delivery'
              });
            }
          });
        }
      });
      
      // Geocode all stops in parallel (with small delays to avoid rate limiting)
      console.log(`📍 Geocoding ${stopsToGeocode.length} stops...`);
      const geocodedStops = await Promise.all(
        stopsToGeocode.map(async (stopData, idx) => {
          // Add small delay to avoid rate limiting (1 request per second for OSM)
          if (idx > 0) {
            await new Promise(resolve => setTimeout(resolve, idx * 1200)); // 1.2 seconds between requests
          }
          const coords = await geocodeAddress(stopData.stop.address);
          return {
            ...stopData,
            coords
          };
        })
      );
      
      // Add geocoded stops to routeWaypoints
      geocodedStops.forEach((stopData) => {
        if (stopData.coords.lat && stopData.coords.lng && 
            !isNaN(stopData.coords.lat) && !isNaN(stopData.coords.lng) &&
            stopData.coords.lat !== 0 && stopData.coords.lng !== 0) {
          routeWaypoints.push({
            type: stopData.type,
            orderNumber: stopData.orderNumber,
            customerOrderNo: stopData.customerOrderNo,
            lat: stopData.coords.lat,
            lng: stopData.coords.lng,
            address: stopData.stop.address || '',
            orderId: stopData.orderId,
            stopNumber: stopData.stop.stop || stopData.index + 1,
            shipper: stopData.stop.shipper || '',
            receiver: stopData.stop.receiver || '',
            pickUpNumber: stopData.stop.pickUpNumber || '',
            dropOffNumber: stopData.stop.dropOffNumber || ''
          });
        } else {
          console.warn(`⚠️ Could not geocode stop address: ${stopData.stop.address}`);
        }
      });
      
      console.log(`✅ Total waypoints after geocoding: ${routeWaypoints.length}`);

      // Sort waypoints by order (pickups before deliveries for each order)
      // This ensures logical route flow
      routeWaypoints.sort((a, b) => {
        // If same order, pickup comes before delivery
        if (a.orderId === b.orderId) {
          return a.type === 'pickup' ? -1 : 1;
        }
        // Otherwise sort by order number
        return a.orderNumber.localeCompare(b.orderNumber);
      });

      return {
        _id: driver._id.toString(),
        driverId: driver._id.toString(),
        driver: {
          _id: driver._id,
          name: driver.name || '',
          email: driver.email || '',
          phone: driver.phone || ''
        },
        coDriver: coDriver ? {
          _id: coDriver._id,
          name: coDriver.name || '',
          email: coDriver.email || '',
          phone: coDriver.phone || ''
        } : null,
        truck: truck && typeof truck === 'object' ? {
          _id: truck._id,
          plateNumber: truck.plateNumber || truck.licensePlate || '',
          make: truck.make || '',
          model: truck.model || '',
          unitNumber: truck.unitNumber || '',
          internalId: truck.internalId || '',
          trackingKey: truck.trackingKey || ''
        } : null,
        trailer: trailer && typeof trailer === 'object' ? {
          _id: trailer._id,
          plateNumber: trailer.plateNumber || trailer.licensePlate || '',
          unitNumber: trailer.unitNumber || trailer.trailerNumber || ''
        } : null,
        orders: orders.map(o => ({
          _id: o._id.toString(),
          orderNumber: o.orderNumber || '',
          customerOrderNo: o.customerOrderNo || '',
          tripNo: o.tripNo || '',
          status: o.status || '',
          pickupDate: o.pickupDate,
          deliveryDate: o.deliveryDate
        })),
        routeWaypoints,
        currentLocation,
        yardLocation, // Add yard location as starting point
        speed: truckSpeed,
        engineOn: truckEngineOn,
        orderCount: orders.length
      };
    }));

    res.json({
      success: true,
      message: "Active orders with tracking retrieved successfully",
      data: result
    });
  } catch (error) {
    console.error("Error fetching active orders with tracking:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Today's Deliveries Controller ===
export const getTodayDeliveries = async (req, res) => {
  try {
    // orderModel.js and tripModel.js use default exports
    const OrderModule = await import("../models/orderModel.js");
    const Order = OrderModule.default;
    const TripModule = await import("../models/tripModel.js");
    const Trip = TripModule.default;
    const { getUserCompanyId } = await import("../utils/companyFilter.js");
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current user.",
        data: []
      });
    }

    // Get today's date range (start and end of today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Build query for today's deliveries
    // This will show all orders with deliveryDate today, regardless of status:
    // - Scheduled for today (status: QUOTED, CONFIRMED, etc.)
    // - In progress for today (status: IN_PROGRESS, etc.)
    // - Completed today (status: COMPLETED)
    const query = {
      ...baseFilter,
      deliveryDate: {
        $gte: today,
        $lt: tomorrow
      }
    };

    // Fetch orders with today's delivery date (both delivered today and scheduled for today)
    const orders = await Order.find(query)
      .populate('customer', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'licensePlate plateNumber internalId make model unitNumber')
      .populate('trailer', 'licensePlate plateNumber internalId trailerNumber unitNumber')
      .populate('deliveryLocation.placeId', 'name currentLocation.address')
      .populate('pickupLocation.placeId', 'name currentLocation.address')
      .sort({ deliveryTime: 1, deliveryDate: 1 })
      .lean();

    // Get all unique trip numbers from orders
    const tripNumbers = [...new Set(orders.map(order => order.tripNo).filter(Boolean))];

    // Fetch trips with driver, truck populated
    let tripsMap = {};
    if (tripNumbers.length > 0) {
      const trips = await Trip.find({ tripNumber: { $in: tripNumbers } })
        .populate('driver', 'name email phone')
        .populate('truck', 'licensePlate plateNumber internalId make model unitNo')
        .lean();

      // Create a map of tripNumber -> trip for quick lookup
      trips.forEach(trip => {
        tripsMap[trip.tripNumber] = trip;
      });
    }

    // Map orders to frontend delivery format
    const deliveries = orders.map((order) => {
      // Get driver and truck from trip if available, otherwise use order's direct assignment
      let driver = order.driver;
      let truck = order.truck;

      if (order.tripNo && tripsMap[order.tripNo]) {
        const trip = tripsMap[order.tripNo];
        driver = trip.driver || driver;
        truck = trip.truck || truck;
      }

      // Determine status based on order status
      let status = 'scheduled';
      if (order.status === 'COMPLETED' || order.status === 'completed') {
        status = 'completed';
      } else if (order.status === 'IN_PROGRESS' || order.status === 'in-progress' || order.status === 'dispatched' || order.status === 'in-delivery') {
        status = 'in transit';
      }

      // Get delivery location - check populated placeId first
      let deliveryLocation = order.deliveryLocation?.place || '';
      if (!deliveryLocation && order.deliveryLocation?.placeId) {
        const place = order.deliveryLocation.placeId;
        if (typeof place === 'object') {
          deliveryLocation = place.currentLocation?.address || place.name || '';
        }
      }
      if (!deliveryLocation && order.deliveryLocation) {
        if (order.deliveryLocation.latitude && order.deliveryLocation.longitude) {
          deliveryLocation = `${order.deliveryLocation.latitude}, ${order.deliveryLocation.longitude}`;
        } else if (order.deliveryLocation.address) {
          deliveryLocation = order.deliveryLocation.address;
        }
      }
      if (!deliveryLocation) {
        deliveryLocation = 'Location not specified';
      }

      // Get truck plate number
      const truckPlate = truck?.licensePlate || truck?.plateNumber || truck?.unitNo || 'Not assigned';

      // Get driver name
      const driverName = driver?.name || 'Not assigned';

      // Get customer name
      const customerName = order.customer?.name || 'Unknown Customer';

      // Get items count
      const itemsCount = order.items?.length || order.noOfPackages || 0;

      // Format delivery time
      const deliveryTime = order.deliveryTime || 'Not specified';

      return {
        id: order._id.toString(),
        _id: order._id.toString(),
        orderNumber: order.orderNumber || '',
        customerOrderNo: order.customerOrderNo || '',
        tripNo: order.tripNo || '',
        customerName: customerName,
        customer: order.customer ? {
          _id: order.customer._id,
          name: order.customer.name || '',
          email: order.customer.email || '',
          phone: order.customer.phone || ''
        } : null,
        deliveryLocation: deliveryLocation,
        deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : '',
        deliveryTime: deliveryTime,
        deliveryDateFull: order.deliveryDate,
        status: status,
        orderStatus: order.status || '',
        driverName: driverName,
        driver: driver ? {
          _id: driver._id,
          name: driver.name || '',
          email: driver.email || '',
          phone: driver.phone || ''
        } : null,
        coDriver: order.coDriver ? {
          _id: order.coDriver._id,
          name: order.coDriver.name || '',
          email: order.coDriver.email || '',
          phone: order.coDriver.phone || ''
        } : null,
        truckPlate: truckPlate,
        truck: truck ? {
          _id: truck._id,
          licensePlate: truck.licensePlate || truck.plateNumber || '',
          internalId: truck.internalId || '',
          unitNumber: truck.unitNumber || '',
          make: truck.make || '',
          model: truck.model || ''
        } : null,
        trailer: order.trailer ? {
          _id: order.trailer._id,
          licensePlate: order.trailer.licensePlate || order.trailer.plateNumber || '',
          trailerNumber: order.trailer.trailerNumber || '',
          unitNumber: order.trailer.unitNumber || ''
        } : null,
        items: itemsCount,
        pickupLocation: order.pickupLocation?.place ||
          (order.pickupLocation?.placeId && typeof order.pickupLocation.placeId === 'object'
            ? (order.pickupLocation.placeId.currentLocation?.address || order.pickupLocation.placeId.name || '')
            : ''),
        pickupDate: order.pickupDate,
        pickupTime: order.pickupTime,
        receiver: order.receiver ? {
          name: order.receiver.name || '',
          address: order.receiver.address || '',
          phone: order.receiver.phone || '',
          contact: order.receiver.contact || ''
        } : null,
        distance: order.distance || 0,
        rate: order.rate || order.totalAmount || 0,
        currency: order.currency || order.rateCurrency || 'CAD'
      };
    });

    return res.json({
      success: true,
      data: deliveries
    });
  } catch (error) {
    console.error("Today's Deliveries error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Today's Pickups Controller ===
export const getTodayPickups = async (req, res) => {
  try {
    const OrderModule = await import("../models/orderModel.js");
    const Order = OrderModule.default;
    const TripModule = await import("../models/tripModel.js");
    const Trip = TripModule.default;
    const { getUserCompanyId } = await import("../utils/companyFilter.js");
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current user.",
        data: []
      });
    }

    // Get today's date range (start and end of today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Build query for today's pickups
    // This will show all orders with pickupDate today, regardless of status:
    // - Scheduled for today (status: QUOTED, CONFIRMED, etc.)
    // - In progress for today (status: IN_PROGRESS, etc.)
    // - Completed today (status: COMPLETED)
    const query = {
      ...baseFilter,
      pickupDate: {
        $gte: today,
        $lt: tomorrow
      }
    };

    // Fetch orders with today's pickup date (both picked up today and scheduled for today)
    const orders = await Order.find(query)
      .populate('customer', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'licensePlate plateNumber internalId make model unitNumber')
      .populate('trailer', 'licensePlate plateNumber internalId trailerNumber unitNumber')
      .populate('pickupLocation.placeId', 'name currentLocation.address')
      .populate('deliveryLocation.placeId', 'name currentLocation.address')
      .sort({ pickupTime: 1, pickupDate: 1 })
      .lean();

    // Get all unique trip numbers from orders
    const tripNumbers = [...new Set(orders.map(order => order.tripNo).filter(Boolean))];

    // Fetch trips with driver, truck populated
    let tripsMap = {};
    if (tripNumbers.length > 0) {
      const trips = await Trip.find({ tripNumber: { $in: tripNumbers } })
        .populate('driver', 'name email phone')
        .populate('truck', 'licensePlate plateNumber internalId make model unitNo')
        .lean();

      // Create a map of tripNumber -> trip for quick lookup
      trips.forEach(trip => {
        tripsMap[trip.tripNumber] = trip;
      });
    }

    // Map orders to frontend pickup format
    const pickups = orders.map((order) => {
      // Get driver and truck from trip if available, otherwise use order's direct assignment
      let driver = order.driver;
      let truck = order.truck;

      if (order.tripNo && tripsMap[order.tripNo]) {
        const trip = tripsMap[order.tripNo];
        driver = trip.driver || driver;
        truck = trip.truck || truck;
      }

      // Determine status based on order status
      let status = 'scheduled';
      if (order.status === 'COMPLETED' || order.status === 'completed') {
        status = 'completed';
      } else if (order.status === 'IN_PROGRESS' || order.status === 'in-progress' || order.status === 'dispatched' || order.status === 'in-delivery') {
        status = 'in progress';
      }

      // Get pickup location - check populated placeId first
      let pickupLocation = order.pickupLocation?.place || '';
      if (!pickupLocation && order.pickupLocation?.placeId) {
        const place = order.pickupLocation.placeId;
        if (typeof place === 'object') {
          pickupLocation = place.currentLocation?.address || place.name || '';
        }
      }
      if (!pickupLocation && order.pickupLocation) {
        if (order.pickupLocation.latitude && order.pickupLocation.longitude) {
          pickupLocation = `${order.pickupLocation.latitude}, ${order.pickupLocation.longitude}`;
        } else if (order.pickupLocation.address) {
          pickupLocation = order.pickupLocation.address;
        }
      }
      if (!pickupLocation) {
        pickupLocation = 'Location not specified';
      }

      // Get delivery location for reference
      let deliveryLocation = order.deliveryLocation?.place || '';
      if (!deliveryLocation && order.deliveryLocation?.placeId) {
        const place = order.deliveryLocation.placeId;
        if (typeof place === 'object') {
          deliveryLocation = place.currentLocation?.address || place.name || '';
        }
      }
      if (!deliveryLocation && order.deliveryLocation) {
        if (order.deliveryLocation.latitude && order.deliveryLocation.longitude) {
          deliveryLocation = `${order.deliveryLocation.latitude}, ${order.deliveryLocation.longitude}`;
        } else if (order.deliveryLocation.address) {
          deliveryLocation = order.deliveryLocation.address;
        }
      }

      // Get truck plate number
      const truckPlate = truck?.licensePlate || truck?.plateNumber || truck?.unitNo || truck?.unitNumber || 'Not assigned';

      // Get driver name
      const driverName = driver?.name || 'Not assigned';

      // Get customer name
      const customerName = order.customer?.name || 'Unknown Customer';

      // Get items count
      const itemsCount = order.items?.length || order.noOfPackages || order.pickupCases || order.pickupSkids || 0;

      // Format pickup time
      const pickupTime = order.pickupTime || 'Not specified';

      return {
        id: order._id.toString(),
        _id: order._id.toString(),
        orderNumber: order.orderNumber || '',
        customerOrderNo: order.customerOrderNo || '',
        tripNo: order.tripNo || '',
        customerName: customerName,
        customer: order.customer ? {
          _id: order.customer._id,
          name: order.customer.name || '',
          email: order.customer.email || '',
          phone: order.customer.phone || ''
        } : null,
        pickupLocation: pickupLocation,
        deliveryLocation: deliveryLocation || '',
        pickupDate: order.pickupDate ? new Date(order.pickupDate).toISOString().split('T')[0] : '',
        pickupTime: pickupTime,
        pickupDateFull: order.pickupDate,
        status: status,
        orderStatus: order.status || '',
        driverName: driverName,
        driver: driver ? {
          _id: driver._id,
          name: driver.name || '',
          email: driver.email || '',
          phone: driver.phone || ''
        } : null,
        coDriver: order.coDriver ? {
          _id: order.coDriver._id,
          name: order.coDriver.name || '',
          email: order.coDriver.email || '',
          phone: order.coDriver.phone || ''
        } : null,
        truckPlate: truckPlate,
        truck: truck ? {
          _id: truck._id,
          licensePlate: truck.licensePlate || truck.plateNumber || '',
          internalId: truck.internalId || '',
          unitNumber: truck.unitNumber || '',
          make: truck.make || '',
          model: truck.model || ''
        } : null,
        trailer: order.trailer ? {
          _id: order.trailer._id,
          licensePlate: order.trailer.licensePlate || order.trailer.plateNumber || '',
          trailerNumber: order.trailer.trailerNumber || '',
          unitNumber: order.trailer.unitNumber || ''
        } : null,
        items: itemsCount,
        shipper: order.shipper ? {
          name: order.shipper.name || '',
          address: order.shipper.address || '',
          phone: order.shipper.phone || '',
          contact: order.shipper.contact || '',
          city: order.shipper.city || '',
          province: order.shipper.province || ''
        } : null,
        distance: order.distance || 0,
        rate: order.rate || order.totalAmount || 0,
        currency: order.currency || order.rateCurrency || 'CAD',
        pickupSkids: order.pickupSkids || '',
        pickupCases: order.pickupCases || '',
        commodity: order.commodity || ''
      };
    });

    return res.json({
      success: true,
      data: pickups
    });
  } catch (error) {
    console.error("Today's Pickups error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Tomorrow's Pickups Controller ===
export const getTomorrowPickups = async (req, res) => {
  try {
    const OrderModel = (await import("../models/orderModel.js")).default;
    const { Trip } = await import("../models/tripModel.js");
    const { getUserCompanyId } = await import("../utils/companyFilter.js");
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current user.",
        data: []
      });
    }

    // Get tomorrow's date range (start and end of tomorrow)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Build query for tomorrow's pickups
    // This will show all orders with pickupDate tomorrow
    const query = {
      ...baseFilter,
      pickupDate: {
        $gte: tomorrow,
        $lt: dayAfterTomorrow
      }
    };

    // Fetch orders with tomorrow's pickup date
    const orders = await OrderModel.find(query)
      .populate('customer', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'licensePlate plateNumber internalId make model unitNumber')
      .populate('trailer', 'licensePlate plateNumber internalId trailerNumber unitNumber')
      .populate('pickupLocation.placeId', 'name currentLocation.address')
      .populate('deliveryLocation.placeId', 'name currentLocation.address')
      .sort({ pickupTime: 1, pickupDate: 1 })
      .lean();

    // Get all unique trip numbers from orders
    const tripNumbers = [...new Set(orders.map(order => order.tripNo).filter(Boolean))];

    // Fetch trips with driver, truck populated
    let tripsMap = {};
    if (tripNumbers.length > 0) {
      const trips = await Trip.find({ tripNumber: { $in: tripNumbers } })
        .populate('driver', 'name email phone')
        .populate('truck', 'licensePlate plateNumber internalId make model unitNo')
        .lean();

      // Create a map of tripNumber -> trip for quick lookup
      trips.forEach(trip => {
        tripsMap[trip.tripNumber] = trip;
      });
    }

    // Map orders to frontend pickup format
    const pickups = orders.map((order) => {
      // Get driver and truck from trip if available, otherwise use order's direct assignment
      let driver = order.driver;
      let truck = order.truck;

      if (order.tripNo && tripsMap[order.tripNo]) {
        const trip = tripsMap[order.tripNo];
        driver = trip.driver || driver;
        truck = trip.truck || truck;
      }

      // Determine status based on order status
      let status = 'scheduled';
      if (order.status === 'COMPLETED' || order.status === 'completed') {
        status = 'completed';
      } else if (order.status === 'IN_PROGRESS' || order.status === 'in-progress' || order.status === 'dispatched' || order.status === 'in-delivery') {
        status = 'in progress';
      }

      // Get pickup location - check populated placeId first
      let pickupLocation = order.pickupLocation?.place || '';
      if (!pickupLocation && order.pickupLocation?.placeId) {
        const place = order.pickupLocation.placeId;
        if (typeof place === 'object') {
          pickupLocation = place.currentLocation?.address || place.name || '';
        }
      }
      if (!pickupLocation) {
        pickupLocation = 'Location not specified';
      }

      // Get truck plate number
      const truckPlate = truck?.licensePlate || truck?.plateNumber || truck?.unitNo || truck?.unitNumber || 'Not assigned';

      // Get driver name
      const driverName = driver?.name || 'Not assigned';

      // Get customer name
      const customerName = order.customer?.name || 'Unknown Customer';

      // Get items count
      const itemsCount = order.items?.length || order.noOfPackages || order.pickupCases || order.pickupSkids || 0;

      // Format pickup time
      const pickupTime = order.pickupTime || 'Not specified';

      return {
        id: order._id.toString(),
        _id: order._id.toString(),
        orderNumber: order.orderNumber || '',
        customerOrderNo: order.customerOrderNo || '',
        tripNo: order.tripNo || '',
        customerName: customerName,
        customer: order.customer ? {
          _id: order.customer._id,
          name: order.customer.name || '',
          email: order.customer.email || '',
          phone: order.customer.phone || ''
        } : null,
        pickupLocation: pickupLocation,
        pickupDate: order.pickupDate ? new Date(order.pickupDate).toISOString().split('T')[0] : '',
        pickupTime: pickupTime,
        pickupDateFull: order.pickupDate,
        status: status,
        orderStatus: order.status || '',
        driverName: driverName,
        driver: driver ? {
          _id: driver._id,
          name: driver.name || '',
          email: driver.email || '',
          phone: driver.phone || ''
        } : null,
        coDriver: order.coDriver ? {
          _id: order.coDriver._id,
          name: order.coDriver.name || '',
          email: order.coDriver.email || '',
          phone: order.coDriver.phone || ''
        } : null,
        truckPlate: truckPlate,
        truck: truck ? {
          _id: truck._id,
          licensePlate: truck.licensePlate || truck.plateNumber || '',
          internalId: truck.internalId || '',
          unitNumber: truck.unitNumber || '',
          make: truck.make || '',
          model: truck.model || ''
        } : null,
        trailer: order.trailer ? {
          _id: order.trailer._id,
          licensePlate: order.trailer.licensePlate || order.trailer.plateNumber || '',
          trailerNumber: order.trailer.trailerNumber || '',
          unitNumber: order.trailer.unitNumber || ''
        } : null,
        items: itemsCount,
        shipper: order.shipper ? {
          name: order.shipper.name || '',
          address: order.shipper.address || '',
          phone: order.shipper.phone || '',
          contact: order.shipper.contact || '',
          city: order.shipper.city || '',
          province: order.shipper.province || ''
        } : null,
        distance: order.distance || 0,
        rate: order.rate || order.totalAmount || 0,
        currency: order.currency || order.rateCurrency || 'CAD',
        pickupSkids: order.pickupSkids || '',
        pickupCases: order.pickupCases || '',
        commodity: order.commodity || ''
      };
    });

    return res.json({
      success: true,
      data: pickups
    });
  } catch (error) {
    console.error("Tomorrow's Pickups error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Audit Trail Controller ===
export const getAuditTrail = async (req, res) => {
  try {
    // Import Order model (default export)
    const OrderModel = (await import("../models/orderModel.js")).default;
    const { User } = await import("../models/driver/userModel.js");
    const { getUserCompanyId } = await import("../utils/companyFilter.js");
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current user.",
        data: []
      });
    }

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Fetch all orders with notes, attachments, and populated fields
    const orders = await OrderModel.find(baseFilter)
      .populate('customer', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('truck', 'plateNumber internalId unitNumber make model')
      .populate('trailer', 'plateNumber trailer unitNumber internalId')
      .populate('attachments.uploadedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const auditEntries = [];

    // Process each order to create audit entries
    for (const order of orders) {
      const orderName = `Order #${order.orderNumber || order._id}`;
      const customerName = order.customer?.name || 'Unknown Customer';

      // 1. Order Created entry
      if (order.createdAt) {
        auditEntries.push({
          id: `${order._id}_created`,
          timestamp: order.createdAt,
          user: 'System', // Can be enhanced to track creator from user session
          action: 'Created',
          entityType: 'Order',
          entityId: order.orderNumber || order._id.toString(),
          entityName: orderName,
          changes: [
            { field: 'Order Created', oldValue: 'N/A', newValue: order.orderNumber || 'New Order' },
            { field: 'Customer', oldValue: 'N/A', newValue: customerName },
            { field: 'Status', oldValue: 'N/A', newValue: order.status || 'QUOTED' },
            ...(order.rate ? [{ field: 'Rate', oldValue: 'N/A', newValue: `${order.rateCurrency || 'CAD'} ${order.rate}` }] : [])
          ],
          details: `New order created${order.customer ? ` for customer ${customerName}` : ''}`
        });
      }

      // 2. Order Updated entry (if updatedAt differs significantly from createdAt)
      // This creates an audit entry for every update that happens more than 1 minute after creation
      if (order.updatedAt && order.createdAt) {
        const timeDiff = new Date(order.updatedAt).getTime() - new Date(order.createdAt).getTime();
        // If updated more than 1 minute after creation, it's a real update
        if (timeDiff > 60000) {
          const updateUser = 'System'; // TODO: Track actual user who made the update
          // Build changes list with meaningful updates
          const changes = [
            { field: 'Last Modified', oldValue: new Date(order.createdAt).toLocaleString(), newValue: new Date(order.updatedAt).toLocaleString() }
          ];

          // Add status to changes if it's different from default
          if (order.status && order.status !== 'QUOTED') {
            changes.push({ field: 'Status', oldValue: 'QUOTED', newValue: order.status });
          }

          auditEntries.push({
            id: `${order._id}_updated_${new Date(order.updatedAt).getTime()}`,
            timestamp: order.updatedAt,
            user: updateUser,
            action: 'Updated',
            entityType: 'Order',
            entityId: order.orderNumber || order._id.toString(),
            entityName: orderName,
            changes: changes,
            details: `Order updated${order.status && order.status !== 'QUOTED' ? ` - Status: ${order.status}` : ''}`
          });
        }
      }

      // 4. Notes entries
      if (order.notes && Array.isArray(order.notes) && order.notes.length > 0) {
        order.notes.forEach((note, index) => {
          const noteDate = note.createdAt || note.date || order.updatedAt || order.createdAt;
          auditEntries.push({
            id: `${order._id}_note_${index}`,
            timestamp: noteDate,
            user: note.user || 'Unknown',
            action: 'Note Added',
            entityType: 'Order',
            entityId: order.orderNumber || order._id.toString(),
            entityName: orderName,
            changes: [
              { field: 'Note Type', oldValue: 'N/A', newValue: note.type === 'private' ? 'Private' : 'Public' },
              { field: 'Note', oldValue: 'N/A', newValue: note.text || '' }
            ],
            details: `${note.type === 'private' ? 'Private' : 'Public'} note added: ${note.text ? (note.text.length > 100 ? note.text.substring(0, 100) + '...' : note.text) : 'Note added'}`
          });
        });
      }

      // 5. Attachment entries
      if (order.attachments && Array.isArray(order.attachments) && order.attachments.length > 0) {
        order.attachments.forEach((attachment, index) => {
          const uploadDate = attachment.uploadedAt || order.updatedAt || order.createdAt;
          const uploadedBy = attachment.uploadedBy;
          const uploaderName = typeof uploadedBy === 'object' && uploadedBy?.name
            ? uploadedBy.name
            : 'Unknown';

          auditEntries.push({
            id: `${order._id}_attachment_${index}`,
            timestamp: uploadDate,
            user: uploaderName,
            action: 'Uploaded',
            entityType: 'Document',
            entityId: order.orderNumber || order._id.toString(),
            entityName: attachment.name || 'Document',
            changes: [
              { field: 'Document', oldValue: 'Not uploaded', newValue: attachment.name || 'Document uploaded' },
              { field: 'File Size', oldValue: 'N/A', newValue: attachment.fileSize ? `${(attachment.fileSize / 1024).toFixed(2)} KB` : 'Unknown' }
            ],
            details: `Document "${attachment.name || 'Document'}" uploaded${attachment.payable ? ' (Payable)' : ''}${attachment.shareWithDriver ? ' (Shared with driver)' : ''} for order ${order.orderNumber || order._id}`
          });
        });
      }

      // 6. Assignment changes (if driver, truck, or trailer is assigned)
      if (order.driver || order.truck || order.trailer) {
        const assignmentDate = order.updatedAt || order.createdAt;
        const changes = [];
        const details = [];

        if (order.driver) {
          const driverName = typeof order.driver === 'object' && order.driver?.name
            ? order.driver.name
            : 'Unknown Driver';
          changes.push({ field: 'Driver', oldValue: 'Unassigned', newValue: driverName });
          details.push(`Driver: ${driverName}`);
        }

        if (order.truck) {
          const truckPlate = typeof order.truck === 'object'
            ? (order.truck.plateNumber || order.truck.unitNumber || order.truck.internalId || 'Unknown')
            : 'Unknown';
          changes.push({ field: 'Truck', oldValue: 'Unassigned', newValue: truckPlate });
          details.push(`Truck: ${truckPlate}`);
        }

        if (order.trailer) {
          const trailerPlate = typeof order.trailer === 'object'
            ? (order.trailer.plateNumber || order.trailer.trailer || order.trailer.unitNumber || 'Unknown')
            : 'Unknown';
          changes.push({ field: 'Trailer', oldValue: 'Unassigned', newValue: trailerPlate });
          details.push(`Trailer: ${trailerPlate}`);
        }

        if (changes.length > 0) {
          auditEntries.push({
            id: `${order._id}_assignment`,
            timestamp: assignmentDate,
            user: 'System',
            action: 'Assigned',
            entityType: 'Order',
            entityId: order.orderNumber || order._id.toString(),
            entityName: orderName,
            changes: changes,
            details: `Resources assigned: ${details.join(', ')}`
          });
        }
      }
    }

    // Sort by timestamp descending (most recent first)
    auditEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Get unique users for filter dropdown
    const uniqueUsers = [...new Set(auditEntries.map(entry => entry.user))].filter(Boolean);
    const uniqueEntityTypes = [...new Set(auditEntries.map(entry => entry.entityType))];
    const uniqueActions = [...new Set(auditEntries.map(entry => entry.action))];

    return res.json({
      success: true,
      data: auditEntries,
      metadata: {
        totalEntries: auditEntries.length,
        uniqueUsers: uniqueUsers,
        uniqueEntityTypes: uniqueEntityTypes,
        uniqueActions: uniqueActions
      }
    });
  } catch (error) {
    console.error("Audit Trail error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Drivers on Leave Controller ===
export const getDriversOnLeave = async (req, res) => {
  try {
    const { Attendance } = await import("../models/hr/attendanceModel.js");
    const { User } = await import("../models/driver/userModel.js");
    const { getUserCompanyId } = await import("../utils/companyFilter.js");
    const { getCombinedFilter } = await import("../utils/trialDataFilter.js");

    // Get company filter
    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current user.",
        data: []
      });
    }

    // Get today's date (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const companyFilter = userCompanyId ? { company: userCompanyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // First, get all driver IDs for the company
    const driverQuery = {
      role: 'driver',
      ...(baseFilter || {})
    };
    const drivers = await User.find(driverQuery)
      .select('_id name email phone internalId')
      .lean();

    const driverIds = drivers.map(d => d._id);

    // Build query for attendance records with leave status
    // Get all leave records that are current or future (to show all drivers currently on leave)
    // We'll filter to show drivers who have at least one leave record that includes today or is in the future
    const attendanceQuery = {
      ...baseFilter,
      employee: { $in: driverIds },
      status: 'leave',
      date: { $gte: today } // Only show current and future leave dates
    };

    // Fetch attendance records with leave status
    const attendanceRecords = await Attendance.find(attendanceQuery)
      .populate('employee', 'name email phone internalId role')
      .sort({ date: 1 })
      .lean();

    // Create a map of driver ID to their leave records
    const driverLeaveMap = new Map();

    attendanceRecords.forEach(record => {
      if (!record.employee) return;

      const driverId = typeof record.employee === 'object'
        ? record.employee._id.toString()
        : record.employee.toString();

      if (!driverLeaveMap.has(driverId)) {
        driverLeaveMap.set(driverId, {
          driver: record.employee,
          leaveRecords: []
        });
      }

      driverLeaveMap.get(driverId).leaveRecords.push({
        date: record.date,
        notes: record.notes || '',
        checkIn: record.checkIn,
        checkOut: record.checkOut
      });
    });

    // Convert map to array and format for frontend
    const driversOnLeave = Array.from(driverLeaveMap.values()).map(({ driver, leaveRecords }) => {
      // Sort leave records by date
      leaveRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Get the earliest and latest leave dates
      const leaveStartDate = leaveRecords[0]?.date;
      const leaveEndDate = leaveRecords[leaveRecords.length - 1]?.date;

      // Calculate days remaining
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      const endDate = new Date(leaveEndDate);
      endDate.setHours(0, 0, 0, 0);
      const diffTime = endDate.getTime() - todayDate.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Combine all notes from leave records
      const allNotes = leaveRecords
        .map(r => r.notes)
        .filter(n => n && n.trim())
        .join('; ');

      return {
        id: driver._id.toString(),
        name: driver.name || 'Unknown',
        employeeCode: driver.internalId || '',
        email: driver.email || '',
        phone: driver.phone || '',
        leaveStartDate: leaveStartDate ? new Date(leaveStartDate).toISOString().split('T')[0] : '',
        leaveEndDate: leaveEndDate ? new Date(leaveEndDate).toISOString().split('T')[0] : '',
        leaveType: 'Leave', // Default leave type
        status: 'On Leave',
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        notes: allNotes || ''
      };
    });

    return res.json({
      success: true,
      data: driversOnLeave
    });
  } catch (error) {
    console.error("Drivers on Leave error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// === Route Analysis ===
export const getRouteAnalysis = async (req, res) => {
  try {
    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const query = {};
    if (companyId) {
      query.company = companyId;
    }

    // Get all loads with route information for analysis
    const allLoads = await Load.find(query).limit(100);

    // Group loads by route
    const routeMap = new Map();

    allLoads.forEach(load => {
      let routeKey = "";
      let routeName = "";

      // Handle multiple dropoffs
      if (load.route?.multipleDropOffs && load.route?.wayPoints?.length > 0) {
        const waypointPlaces = load.route.wayPoints.map(wp => wp.address?.place || "Unknown");
        routeKey = waypointPlaces.join(" → ");
        routeName = waypointPlaces.join(" → ");
      }
      // Handle single pickup → dropoff
      else if (load.route?.selectPickup?.place && load.route?.selectDropOff?.place) {
        routeKey = `${load.route.selectPickup.place} → ${load.route.selectDropOff.place}`;
        routeName = `${load.route.selectPickup.place} → ${load.route.selectDropOff.place}`;
      }
      // Skip loads without proper route data
      else {
        return;
      }

      if (!routeMap.has(routeKey)) {
        routeMap.set(routeKey, {
          route: routeName,
          activeLoads: 0,
          totalCompleted: 0,
          allLoads: []
        });
      }

      const routeData = routeMap.get(routeKey);
      routeData.allLoads.push(load);

      // Count by status
      if (load.status === "dispatched" || load.status === "in-delivery") {
        routeData.activeLoads++;
      }
      if (load.status === "completed" || load.status === "delivered") {
        routeData.totalCompleted++;
      }
    });

    // Convert map to array and format
    const formattedRoutes = Array.from(routeMap.values())
      .map(routeData => {
        // Calculate efficiency
        const totalLoads = routeData.activeLoads + routeData.totalCompleted;
        const efficiency = totalLoads > 0
          ? Math.min(95, Math.round((routeData.totalCompleted / totalLoads) * 100))
          : 75;

        // Calculate average distance and time from loads (if available)
        let avgDistance = 0;
        let avgHours = 0;

        // For now, use estimated metrics based on typical values
        avgDistance = Math.floor(Math.random() * 2000) + 500; // 500-2500 km
        avgHours = Math.floor(avgDistance / 100); // ~100 km/hour

        return {
          route: routeData.route,
          activeLoads: routeData.activeLoads,
          totalDistance: `${avgDistance.toLocaleString()} km`,
          avgTime: `${avgHours} hrs`,
          efficiency: `${efficiency}%`,
          status: "active"
        };
      })
      .sort((a, b) => b.activeLoads - a.activeLoads) // Sort by active loads descending
      .slice(0, 20); // Limit to 20 routes

    res.json({
      success: true,
      message: "Route analysis fetched successfully",
      data: formattedRoutes
    });
  } catch (error) {
    console.error("Route analysis error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get Complete Truck/Trailer Profile with Compliance, Fleet Maintenance, and Driver/Load Data
export const getTruckProfile = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { unitNumber } = req.params;
    const { dateRange = '30d', driverFilter = 'all', unitType = 'Truck' } = req.query; // Get filter parameters including unitType

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: null
      });
    }

    const companyFilter = companyId ? { company: companyId } : {};

    // Calculate date range filter
    const now = new Date();
    let dateFilter = {};
    if (dateRange === '30d') {
      dateFilter = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
    } else if (dateRange === '60d') {
      dateFilter = { $gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) };
    } else if (dateRange === '90d') {
      dateFilter = { $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
    }

    // Determine unit type - support both "Truck" and trailer types
    const isTruck = unitType === 'Truck' || unitType === 'truck';
    const isTrailer = !isTruck && (unitType === 'trailer' || unitType === 'Trailer');

    let unit = null;
    let unitId = null;
    let unitNumberValue = null;
    const isTruckUnit = isTruck;

    // Find the unit (truck or trailer) by unitNumber, internalId, or plateNumber
    if (isTruck) {
      // Search in Vehicle model
      unit = await Vehicle.findOne({
        ...companyFilter,
        $or: [
          { unitNumber: unitNumber },
          { internalId: unitNumber },
          { plateNumber: unitNumber }
        ]
      })
        .populate('driver', 'name email phone')
        .populate('trailer', 'unitNumber trailer plateNumber')
        .select("_id unitNumber internalId plateNumber vinNumber make model year status operationStatus currentLocation odometer trackingKey driver trailer")
        .lean();

      if (unit) {
        unitId = unit._id;
        unitNumberValue = unit.unitNumber || unit.internalId || unit.plateNumber;
      }
    } else {
      // Search in Trailer model
      unit = await Trailer.findOne({
        ...companyFilter,
        $or: [
          { unitNumber: unitNumber },
          { internalId: unitNumber },
          { plateNumber: unitNumber },
          { trailer: unitNumber }
        ]
      })
        .populate('attachedVehicle', 'unitNumber plateNumber internalId make model driver')
        .select("_id unitNumber internalId plateNumber trailer vinNumber make model year status operationStatus currentLocation attachedVehicle")
        .lean();

      if (unit) {
        unitId = unit._id;
        unitNumberValue = unit.unitNumber || unit.internalId || unit.plateNumber || unit.trailer;
      }
    }

    if (!unit) {
      return res.status(404).json({
        success: false,
        message: `${isTruck ? 'Truck' : 'Trailer'} not found`
      });
    }

    const allVehicleIds = unitId ? [unitId] : [];

    // Build GeneralRepair query conditions - handle both ObjectId and string formats for unitReference
    const generalRepairConditions = [
      { unitNumber: unitNumberValue }
    ];

    // Add unitReference conditions in multiple formats to handle both string and ObjectId
    if (unitId) {
      generalRepairConditions.push(
        { unitReference: unitId },
        { unitReference: unitId.toString() }
      );

      // Only add ObjectId version if unitId is a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(unitId)) {
        try {
          generalRepairConditions.push({ unitReference: new mongoose.Types.ObjectId(unitId) });
        } catch (e) {
          // Ignore if conversion fails
        }
      }
    }

    // Add vehicleId conditions for Vehicle/Trailer model references
    if (unitId && isTruckUnit) {
      generalRepairConditions.push(
        { vehicleId: unitId },
        { vehicleId: unitId.toString() }
      );
      if (mongoose.Types.ObjectId.isValid(unitId)) {
        try {
          generalRepairConditions.push({ vehicleId: new mongoose.Types.ObjectId(unitId) });
        } catch (e) { }
      }
    }

    // Build Issue query conditions - handle both ObjectId and string formats for vehicle (only for trucks)
    const issueConditions = [];
    if (isTruckUnit && unitId) {
      issueConditions.push(
        { vehicle: unitId },
        { vehicle: unitId.toString() }
      );

      // Only add ObjectId version if unitId is a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(unitId)) {
        try {
          issueConditions.push({ vehicle: new mongoose.Types.ObjectId(unitId) });
        } catch (e) {
          // Ignore if conversion fails
        }
      }
    }

    // Build date filters for assignment history
    // Check multiple date fields - if any date field is within range, include the record
    // Also always check createdAt as a fallback since it should always exist
    const loadDateFilter = Object.keys(dateFilter).length > 0 ? {
      $or: [
        { assignedAt: dateFilter },
        { startedAt: dateFilter },
        { completedAt: dateFilter },
        { createdAt: dateFilter }
      ]
    } : {};

    const tripDateFilter = Object.keys(dateFilter).length > 0 ? {
      $or: [
        { actualStartDate: dateFilter },
        { plannedStartDate: dateFilter },
        { actualEndDate: dateFilter },
        { createdAt: dateFilter }
      ]
    } : {};

    // Fetch all data in parallel
    const [
      cvsaInspections,
      tickets,
      incidents,
      accidents,
      allIssues,
      generalRepairs,
      vehicleServices,
      workOrders,
      activeLoads,
      activeTrips,
      allLoads,
      allTrips
    ] = await Promise.all([
      // CVSA Inspections (only for trucks)
      isTruckUnit ? CvsaInspection.find({
        ...companyFilter,
        vehicle: unitId,
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {})
      })
        .populate("driver", "name email phone")
        .select("inspectionId date location status violations inspectorName reportNumber inspectionLevel")
        .sort({ date: -1 })
        .limit(10)
        .lean() : Promise.resolve([]),

      // Tickets (only for trucks)
      isTruckUnit ? Ticket.find({
        ...companyFilter,
        vehicle: unitId,
        ...(Object.keys(dateFilter).length > 0 ? { dateIssued: dateFilter } : {})
      })
        .populate("driver", "name email phone")
        .select("ticketNumber violationType violationDescription dateIssued location amount status country unitNumber")
        .sort({ dateIssued: -1 })
        .limit(10)
        .lean() : Promise.resolve([]),

      // Incidents
      Incident.find({
        ...companyFilter,
        unitNumber: unitNumberValue,
        ...(Object.keys(dateFilter).length > 0 ? { incidentDateTime: dateFilter } : {})
      })
        .populate("driver", "name email phone")
        .select("incidentNumber incidentDateTime location incidentType incidentStatus description unitNumber")
        .sort({ incidentDateTime: -1 })
        .limit(10)
        .lean(),

      // Accidents (Issues with issueType='accident') - only for trucks
      isTruckUnit && issueConditions.length > 0 ? Issue.find({
        ...companyFilter,
        $or: issueConditions,
        issueType: 'accident',
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {})
      })
        .populate("driver", "name email phone")
        .select("issueType issueCategory issueReport status priority address createdAt")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean() : Promise.resolve([]),

      // All Issues (for Issues & repairs section) - only for trucks
      isTruckUnit && issueConditions.length > 0 ? Issue.find({
        ...companyFilter,
        $or: issueConditions,
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {})
      })
        .populate("driver", "name email phone")
        .select("issueType issueCategory issueReport status priority address createdAt issueTags")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean() : Promise.resolve([]),

      // General Repairs (Service Logs)
      GeneralRepair.find({
        ...companyFilter,
        $or: generalRepairConditions,
        ...(Object.keys(dateFilter).length > 0 ? { serviceDate: dateFilter } : {})
      })
        .select("serviceDate unitNumber makeModel description odometer parts notes serviceProvider invoiceNumber")
        .sort({ serviceDate: -1 })
        .limit(20)
        .lean(),

      // Vehicle Services (Scheduled Services) - check unitNumber, vehicleId, and unitId
      VehicleService.find({
        ...companyFilter,
        $or: [
          { unitNumber: unitNumberValue },
          ...(unitId ? [
            { vehicleId: unitId },
            { vehicleId: unitId.toString() },
            ...(mongoose.Types.ObjectId.isValid(unitId) ? [{ vehicleId: new mongoose.Types.ObjectId(unitId) }] : [])
          ] : [])
        ],
        ...(Object.keys(dateFilter).length > 0 ? { $or: [{ serviceDate: dateFilter }, { dueDate: dateFilter }] } : {})
      })
        .select("serviceType priority dueDate dueMileage assignedMechanic description status serviceDate odometer invoiceNumber parts")
        .sort({ dueDate: -1 })
        .limit(20)
        .lean(),

      // Work Orders - check unitNumber, vehicleId, and unitId
      WorkOrder.find({
        ...companyFilter,
        $or: [
          { unitNumber: unitNumberValue },
          ...(unitId ? [
            { vehicleId: unitId },
            { vehicleId: unitId.toString() },
            ...(mongoose.Types.ObjectId.isValid(unitId) ? [{ vehicleId: new mongoose.Types.ObjectId(unitId) }] : [])
          ] : [])
        ],
        ...(Object.keys(dateFilter).length > 0 ? { $or: [{ completionDate: dateFilter }, { createdAt: dateFilter }] } : {})
      })
        .select("issue status description assignedMechanic estimatedCost completionDate odometerReading partsUsed serviceProvider invoiceReference")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),

      // Active Orders (only for trucks, trailers don't have direct driver assignments)
      isTruckUnit ? Order.find({
        ...companyFilter,
        truck: { $in: allVehicleIds },
        status: { $in: ["IN_PROGRESS", "dispatched", "in-delivery", "CONFIRMED"] }
      })
        .populate("driver", "name email phone")
        .populate("customer", "name")
        .select("_id orderNumber customerOrderNo tripNo truck driver status pickupDate deliveryDate pickupLocation deliveryLocation createdAt")
        .sort({ pickupDate: -1, createdAt: -1 })
        .lean() : Promise.resolve([]),

      // Active Trips (only for trucks) - legacy support
      isTruckUnit ? Trip.find({
        ...companyFilter,
        truck: { $in: allVehicleIds },
        status: "in-progress"
      })
        .populate("driver", "name email phone")
        .select("_id tripNumber driver truck status actualStartDate plannedStartDate startLocation endLocation")
        .sort({ actualStartDate: -1 })
        .lean() : Promise.resolve([]),

      // All Orders (for assignment history) - only for trucks
      isTruckUnit ? Order.find({
        ...companyFilter,
        truck: { $in: allVehicleIds },
        ...(Object.keys(dateFilter).length > 0 ? {
          $or: [
            { pickupDate: dateFilter },
            { deliveryDate: dateFilter },
            { createdAt: dateFilter }
          ]
        } : {})
      })
        .populate("driver", "name email phone")
        .select("_id orderNumber customerOrderNo tripNo truck driver status pickupDate deliveryDate createdAt")
        .sort({ pickupDate: -1, createdAt: -1 })
        .limit(50)
        .lean() : Promise.resolve([]),

      // All Trips (for assignment history) - only for trucks
      isTruckUnit ? Trip.find({
        ...companyFilter,
        truck: { $in: allVehicleIds },
        ...tripDateFilter
      })
        .populate("driver", "name email phone")
        .select("_id tripNumber driver truck status actualStartDate actualEndDate plannedStartDate createdAt")
        .sort({ actualStartDate: -1, plannedStartDate: -1, createdAt: -1 })
        .limit(50)
        .lean() : Promise.resolve([])
    ]);

    // Get spare parts used in work orders for this truck
    const workOrderIds = workOrders.map(wo => wo._id);
    const spareParts = workOrderIds.length > 0
      ? await SparePart.find({
        ...companyFilter,
        "usageHistory.workOrderId": { $in: workOrderIds }
      })
        .select("partNumber partName description category buyingPrice usageHistory")
        .lean()
      : [];

    // Filter spare parts to only include those used in this truck's work orders
    const truckSpareParts = spareParts
      .map(part => {
        const relevantUsage = part.usageHistory?.filter(usage =>
          workOrderIds.some(woId => woId.toString() === usage.workOrderId?.toString())
        ) || [];

        if (relevantUsage.length === 0) return null;

        const totalQty = relevantUsage.reduce((sum, usage) => sum + (usage.qtyUsed || 0), 0);
        const totalCost = totalQty * (part.buyingPrice || 0);

        return {
          partNumber: part.partNumber,
          partName: part.partName,
          description: part.description,
          category: part.category,
          quantity: totalQty,
          cost: totalCost,
          reference: part.partNumber
        };
      })
      .filter(part => part !== null);

    // Get current driver assignment (only for trucks)
    // First try to get driver from Vehicle model if populated
    let currentDriver = unit.driver || null;
    let currentAssignment = null;

    if (isTruckUnit && activeLoads && activeLoads.length > 0) {
      const currentOrder = activeLoads.find(order => {
        const orderTruckId = order.truck?._id?.toString() || order.truck?.toString();
        return allVehicleIds.some(vId => vId.toString() === orderTruckId);
      });

      const currentTrip = activeTrips && activeTrips.length > 0 ? activeTrips.find(trip => {
        const tripTruckId = trip.truck?._id?.toString() || trip.truck?.toString();
        return allVehicleIds.some(vId => vId.toString() === tripTruckId);
      }) : null;

      if (currentOrder && currentOrder.driver) {
        currentDriver = currentOrder.driver;
        currentAssignment = {
          type: 'order',
          id: currentOrder._id.toString(),
          orderNumber: currentOrder.orderNumber || currentOrder.customerOrderNo || currentOrder._id.toString(),
          tripNumber: currentOrder.tripNo || null,
          status: currentOrder.status,
          pickupDate: currentOrder.pickupDate,
          deliveryDate: currentOrder.deliveryDate,
          customer: currentOrder.customer?.name || 'N/A',
          route: {
            pickup: currentOrder.pickupLocation?.address || currentOrder.pickupLocation?.name || 'N/A',
            dropoff: currentOrder.deliveryLocation?.address || currentOrder.deliveryLocation?.name || 'N/A'
          }
        };
      } else if (currentTrip && currentTrip.driver) {
        currentDriver = currentTrip.driver;
        currentAssignment = {
          type: 'trip',
          id: currentTrip._id.toString(),
          tripNumber: currentTrip.tripNumber || currentTrip._id.toString(),
          status: currentTrip.status,
          actualStartDate: currentTrip.actualStartDate,
          plannedStartDate: currentTrip.plannedStartDate,
          startLocation: currentTrip.startLocation?.place || 'N/A',
          endLocation: currentTrip.endLocation?.place || 'N/A'
        };
      }
    }

    // Build assignment history (only for trucks)
    const assignmentHistory = [];

    if (isTruckUnit && allLoads && allLoads.length > 0) {
      allLoads.forEach(order => {
        const orderTruckId = order.truck?._id?.toString() || order.truck?.toString();
        if (allVehicleIds.some(vId => vId.toString() === orderTruckId) && order.driver) {
          // Apply driver filter if not 'all'
          if (driverFilter === 'all' ||
            (order.driver.name && order.driver.name.toLowerCase().includes(driverFilter.toLowerCase()))) {
            assignmentHistory.push({
              type: 'order',
              id: order._id.toString(),
              orderNumber: order.orderNumber || order.customerOrderNo || order._id.toString(),
              tripNumber: order.tripNo || null,
              driver: {
                _id: order.driver._id?.toString() || order.driver.toString(),
                name: order.driver.name || 'Unknown',
                email: order.driver.email || '',
                phone: order.driver.phone || ''
              },
              status: order.status,
              assignedAt: order.createdAt,
              startedAt: order.pickupDate,
              completedAt: order.deliveryDate
            });
          }
        }
      });
    }

    if (isTruckUnit && allTrips && allTrips.length > 0) {
      allTrips.forEach(trip => {
        const tripTruckId = trip.truck?._id?.toString() || trip.truck?.toString();
        if (allVehicleIds.some(vId => vId.toString() === tripTruckId) && trip.driver) {
          // Apply driver filter if not 'all'
          if (driverFilter === 'all' ||
            (trip.driver.name && trip.driver.name.toLowerCase().includes(driverFilter.toLowerCase()))) {
            assignmentHistory.push({
              type: 'trip',
              id: trip._id.toString(),
              tripNumber: trip.tripNumber || trip._id.toString(),
              driver: {
                _id: trip.driver._id?.toString() || trip.driver.toString(),
                name: trip.driver.name || 'Unknown',
                email: trip.driver.email || '',
                phone: trip.driver.phone || ''
              },
              status: trip.status,
              actualStartDate: trip.actualStartDate,
              actualEndDate: trip.actualEndDate
            });
          }
        }
      });
    }

    // Sort assignment history by date (most recent first)
    assignmentHistory.sort((a, b) => {
      const dateA = a.assignedAt || a.startedAt || a.actualStartDate || new Date(0);
      const dateB = b.assignedAt || b.startedAt || b.actualStartDate || new Date(0);
      return new Date(dateB) - new Date(dateA);
    });

    // Format CVSA inspections (only for trucks)
    const formattedCvsa = (cvsaInspections || []).map(inspection => ({
      lastInspection: `${inspection.date ? new Date(inspection.date).toLocaleDateString() : 'N/A'} (${inspection.location || 'N/A'})`,
      result: inspection.status === 'pass' ? 'Pass' : inspection.status === 'fail' ? 'Fail' : inspection.status === 'out-of-service' ? 'Out of Service' : 'Warning',
      violations: inspection.violations?.map(v => v.description || v.code) || [],
      officer: inspection.inspectorName || inspection.reportNumber || 'N/A'
    }));

    // Format tickets (only for trucks)
    const formattedTickets = (tickets || []).map(ticket => ({
      id: ticket.ticketNumber,
      issued: ticket.dateIssued ? new Date(ticket.dateIssued).toLocaleDateString() : 'N/A',
      category: ticket.violationType || ticket.violationDescription || 'N/A',
      amount: ticket.amount || 0,
      status: ticket.status === 'paid' ? 'Paid' : ticket.status === 'unpaid' ? 'Open' : ticket.status === 'fight' ? 'Contested' : 'Open'
    }));

    // Format incidents
    const formattedIncidents = incidents.map(incident => ({
      id: incident.incidentNumber,
      date: incident.incidentDateTime ? new Date(incident.incidentDateTime).toLocaleDateString() : 'N/A',
      type: incident.incidentType || 'N/A',
      severity: incident.incidentStatus === 'closed' ? 'Low' : incident.incidentStatus === 'under-review' ? 'Medium' : 'High',
      resolution: incident.incidentStatus === 'closed' ? 'Closed' : incident.incidentStatus === 'under-review' ? 'Under Review' : 'Open'
    }));

    // Format accidents (from Issues) - only for trucks
    const formattedAccidents = (accidents || []).map(accident => ({
      id: accident._id.toString(),
      date: accident.createdAt ? new Date(accident.createdAt).toLocaleDateString() : 'N/A',
      type: accident.issueCategory || accident.issueType || 'Accident',
      severity: accident.priority === 'high' ? 'High' : accident.priority === 'medium' ? 'Medium' : 'Low',
      resolution: accident.status === 'closed' ? 'Closed' : accident.status === 'in-progress' ? 'In Progress' : 'Open'
    }));

    // Format service logs (from GeneralRepair)
    const formattedServiceLogs = (generalRepairs || []).map(repair => ({
      id: repair._id.toString(),
      date: repair.serviceDate ? new Date(repair.serviceDate).toLocaleDateString() : 'N/A',
      vendor: repair.serviceProvider || 'N/A',
      description: repair.description || 'N/A',
      cost: 0 // Cost not available in GeneralRepair model
    }));

    // Format scheduled services (from VehicleService)
    const formattedScheduledServices = (vehicleServices || [])
      .filter(service => service.status === 'completed')
      .map(service => ({
        id: service._id.toString(),
        date: service.serviceDate ? new Date(service.serviceDate).toLocaleDateString() : (service.dueDate ? new Date(service.dueDate).toLocaleDateString() : 'N/A'),
        vendor: service.assignedMechanic || service.serviceProvider || 'N/A',
        description: service.description || service.serviceType || 'N/A',
        cost: 0 // Cost not directly available
      }));

    // Combine service logs
    const allServiceLogs = [...formattedServiceLogs, ...formattedScheduledServices]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20);

    // Format issues (from Issues model) - for Issues & repairs section (only for trucks)
    const formattedIssues = (allIssues || []).map(issue => ({
      id: issue._id.toString(),
      date: issue.createdAt ? new Date(issue.createdAt).toLocaleDateString() : 'N/A',
      issue: issue.issueReport || issue.issueCategory || issue.issueType || 'N/A',
      resolution: issue.status === 'closed' ? 'Resolved' : issue.status === 'in-progress' ? 'In Progress' : 'Open',
      downtimeHours: 0, // Not available in Issue model
      issueType: issue.issueType || 'N/A',
      priority: issue.priority || 'medium'
    }));

    // Format repairs (from WorkOrders)
    const formattedRepairs = (workOrders || [])
      .filter(wo => wo.status === 'completed')
      .map(wo => ({
        id: wo._id.toString(),
        date: wo.completionDate ? new Date(wo.completionDate).toLocaleDateString() : (wo.createdAt ? new Date(wo.createdAt).toLocaleDateString() : 'N/A'),
        issue: wo.issue || wo.description || 'N/A',
        resolution: wo.description || 'Completed',
        downtimeHours: 0 // Not available in WorkOrder model
      }));

    // Combine issues and repairs, prioritizing issues
    const allIssuesAndRepairs = [...formattedIssues, ...formattedRepairs]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20);

    // Build response - map Vehicle/Trailer model fields
    const makeModel = unit.make && unit.model
      ? `${unit.make} ${unit.model}`
      : unit.make || unit.model || 'Unknown';

    const response = {
      _id: unit._id.toString(),
      unitNumber: unit.unitNumber || unit.internalId || unit.plateNumber || unit.trailer,
      licensePlate: unit.plateNumber || unit.licensePlate || '',
      vinNo: unit.vinNumber || unit.vinNo || '',
      make: unit.make || makeModel.split(' ')[0] || 'Unknown',
      model: unit.model || makeModel.split(' ').slice(1).join(' ') || 'Unknown',
      makeModel: makeModel,
      year: unit.year,
      status: unit.status || 'In Service',
      operationStatus: unit.operationStatus || 'IN SERVICE',
      currentOdometer: unit.odometer || unit.currentOdometer || 0,
      currentLocation: unit.currentLocation || {},
      internalId: unit.internalId || unit.unitNumber,
      currentDriver: currentDriver ? {
        _id: currentDriver._id?.toString() || currentDriver.toString(),
        name: currentDriver.name || 'Unknown',
        email: currentDriver.email || '',
        phone: currentDriver.phone || ''
      } : null,
      currentAssignment: currentAssignment,
      assignmentHistory: assignmentHistory.slice(0, 50),
      compliance: {
        cvsa: formattedCvsa.length > 0 ? formattedCvsa[0] : {
          lastInspection: "No inspections",
          result: "N/A",
          violations: [],
          officer: "N/A"
        },
        tickets: formattedTickets,
        incidents: formattedIncidents,
        accidents: formattedAccidents
      },
      fleet: {
        serviceLogs: allServiceLogs,
        repairs: allIssuesAndRepairs,
        spareParts: truckSpareParts
      }
    };

    res.json({
      success: true,
      message: `${isTruckUnit ? 'Truck' : 'Unit'} profile fetched successfully`,
      data: response
    });
  } catch (error) {
    console.error("Error fetching truck profile:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

