// socket.js
import { Server } from "socket.io";
import Load from "../models/loadModel.js";
import Trip from "../models/tripModel.js";
import { haversineDistance } from "../utils/distance.js";
import { updateVehiclesInDB, updateFleetUnitById, updateVehicleByTrackingKey } from "./samsara.js";
import { FleetUnit } from "../models/fleet/fleetUnitModel.js";
import { Vehicle } from "../models/driver/vehicleModel.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { User } from "../models/driver/userModel.js";
import { ChatMessage } from "../models/chat/chatMessageModel.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { sendPushToDriver } from "./pushNotificationService.js";

// Global Socket.IO instance
let globalIO = null;

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

// Helper function to update trip coordinates when vehicle moves
const updateTripCoordinates = async (vehicle) => {
  try {
    if (!vehicle || !vehicle.currentLocation) return;

    // Get vehicle ID - try _id first, then internalId
    let vehicleId = vehicle._id?.toString();
    if (!vehicleId && vehicle.internalId) {
      // Try to find FleetUnit by internalId to get _id
      const fleetUnit = await FleetUnit.findOne({ internalId: vehicle.internalId, unitType: "Truck" }).lean();
      if (fleetUnit) {
        vehicleId = fleetUnit._id.toString();
      } else {
        vehicleId = vehicle.internalId;
      }
    }

    if (!vehicleId) return;

    // Find active trips for this vehicle/truck
    const vehicleObjectId = isValidObjectId(vehicleId) ? new mongoose.Types.ObjectId(vehicleId) : null;
    const tripQuery = {
      status: 'in-progress'
    };

    if (vehicleObjectId) {
      tripQuery.truck = vehicleObjectId;
    } else {
      // If not a valid ObjectId, we can't query by truck directly
      // Find by matching internalId through FleetUnit
      const fleetUnit = await FleetUnit.findOne({
        $or: [
          { _id: vehicleId },
          { internalId: vehicleId }
        ],
        unitType: "Truck"
      }).lean();

      if (fleetUnit && fleetUnit._id) {
        tripQuery.truck = fleetUnit._id;
      } else {
        return; // Can't find vehicle, skip trip update
      }
    }

    const activeTrips = await Trip.find(tripQuery).lean();
    if (activeTrips.length === 0) return;

    const lat = vehicle.currentLocation.latitude?.toString();
    const lng = vehicle.currentLocation.longitude?.toString();
    const speed = vehicle.speed || 0;
    const odometer = vehicle.odometer || vehicle.currentOdometer || 0;

    if (!lat || !lng || lat === '0' || lng === '0') return;

    // Update coordinates for all active trips
    for (const trip of activeTrips) {
      // Only add coordinate if it's different from the last one (avoid duplicates)
      const lastCoordinate = trip.traveledPath && trip.traveledPath.length > 0
        ? trip.traveledPath[trip.traveledPath.length - 1]
        : null;

      // Check if coordinate changed significantly (at least 0.0001 degrees ≈ 11 meters)
      const shouldAddCoordinate = !lastCoordinate ||
        (Math.abs(parseFloat(lastCoordinate.latitude) - parseFloat(lat)) > 0.0001) ||
        (Math.abs(parseFloat(lastCoordinate.longitude) - parseFloat(lng)) > 0.0001);

      if (shouldAddCoordinate) {
        await Trip.findByIdAndUpdate(trip._id, {
          $push: {
            traveledPath: {
              latitude: lat,
              longitude: lng,
              timestamp: new Date(),
              speed: speed,
              odometer: odometer
            }
          }
        });
      }
    }
  } catch (error) {
    // Silent fail - trip coordinate tracking shouldn't break vehicle tracking
    console.error('Error updating trip coordinates:', error.message);
  }
};

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
      allowedHeaders: ["*"],
    },
    transports: ['polling', 'websocket'], // Polling first for better compatibility, then upgrade to websocket
    allowEIO3: true, // Allow Engine.IO v3 clients
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds
    upgradeTimeout: 10000, // 10 seconds
    maxHttpBufferSize: 1e8, // 100 MB
    // Add path for socket.io
    path: '/socket.io/',
  });

  console.log('🔌 Socket.IO server initialized and listening for connections');
  console.log('🔌 Socket.IO transports:', ['polling', 'websocket']);
  console.log('🔌 Socket.IO path: /socket.io/');
  console.log('🔌 CORS enabled for all origins');

  // Log when server is ready
  io.engine.on("connection_error", (err) => {
    console.error("❌ Socket.IO connection error:", err);
    console.error("   Error details:", {
      type: err.type,
      description: err.description,
      context: err.context
    });
    console.error("   Common causes:");
    console.error("   - Client and server on different networks");
    console.error("   - Firewall blocking port 3000");
    console.error("   - Incorrect socket URL in mobile app");
  });

  // Log transport upgrade
  io.engine.on("upgrade", (socket) => {
    console.log(`✅ Socket ${socket.id} upgraded transport`);
  });

  // Track connected clients
  let connectedClients = 0;

  io.on("connection", async (socket) => {
    connectedClients++;
    console.log(`✅ Client connected: ${socket.id}`);
    console.log(`📊 Total connected clients: ${connectedClients}`);
    console.log(`📡 Client transport: ${socket.conn.transport.name}`);
    console.log(`🌐 Client address: ${socket.handshake.address}`);

    let intervalId = null;
    let selectedVehicleId = null;
    let selectedTrailerId = null;

    // Join vehicle and start updates every 3 seconds
    // Supports both Vehicle model (legacy) and FleetUnit model (new)
    socket.on("joinVehicle", async (vehicleId) => {
      selectedVehicleId = vehicleId;
      selectedTrailerId = null; // Clear trailer selection
      console.log(`🚗 Client ${socket.id} joined vehicle room: ${vehicleId}`);

      // Clear old interval if any
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      // Try FleetUnit first, then fall back to Vehicle model for backward compatibility
      const tryUpdateFleetUnit = async () => {
        try {
          // Extract real ID if prefixed
          const realId = extractRealId(selectedVehicleId);

          // First, try to find FleetUnit by _id to get its internalId
          let fleetUnitDoc = null;
          if (isValidObjectId(realId)) {
            fleetUnitDoc = await FleetUnit.findById(realId).lean();
          }

          // If not found by _id, try by internalId
          if (!fleetUnitDoc) {
            fleetUnitDoc = await FleetUnit.findOne({
              $or: [
                { internalId: selectedVehicleId },
                { internalId: realId }
              ],
              unitType: "Truck"
            }).lean();
          }

          // If FleetUnit found and has internalId, update from Samsara
          if (fleetUnitDoc && fleetUnitDoc.internalId) {
            const fleetUnit = await updateFleetUnitById(fleetUnitDoc.internalId);
            if (fleetUnit) {
              return fleetUnit;
            }
          }

          // If no Samsara update but FleetUnit exists, return it directly
          if (fleetUnitDoc) {
            return fleetUnitDoc;
          }
        } catch (err) {
          console.warn(`⚠️ FleetUnit update failed for ${selectedVehicleId}, trying Vehicle model...`);
        }
        return null;
      };

      // Try Vehicle model with trackingKey
      const tryUpdateVehicle = async () => {
        try {
          const realId = extractRealId(selectedVehicleId);

          // Try to find Vehicle by _id, trackingKey, internalId, or unitNumber
          let vehicleDoc = null;

          // Try by _id first
          if (isValidObjectId(realId)) {
            vehicleDoc = await Vehicle.findById(realId).lean();
          }

          // Try by trackingKey (this is the Samsara ID)
          if (!vehicleDoc) {
            vehicleDoc = await Vehicle.findOne({
              trackingKey: selectedVehicleId
            }).lean();
          }

          // Try by internalId or unitNumber
          if (!vehicleDoc) {
            vehicleDoc = await Vehicle.findOne({
              $or: [
                { internalId: selectedVehicleId },
                { internalId: realId },
                { unitNumber: selectedVehicleId },
                { unitNumber: realId }
              ]
            }).lean();
          }

          // If Vehicle found and has trackingKey, update from Samsara
          if (vehicleDoc && vehicleDoc.trackingKey) {
            const updatedVehicle = await updateVehicleByTrackingKey(vehicleDoc.trackingKey);
            if (updatedVehicle) {
              // Map Vehicle to expected format
              return {
                ...updatedVehicle,
                plateNumber: updatedVehicle.plateNumber || updatedVehicle.licensePlate || '',
                unitNo: updatedVehicle.unitNumber || updatedVehicle.internalId || '',
                makeModel: `${updatedVehicle.make || ''} ${updatedVehicle.model || ''}`.trim(),
                status: updatedVehicle.status === 'moving' ? 'moving' :
                  updatedVehicle.status === 'idle' ? 'idle' :
                    updatedVehicle.status === 'maintenance' ? 'maintenance' : 'stopped'
              };
            }
          }

          // If no Samsara update but Vehicle exists, return it directly
          if (vehicleDoc) {
            return {
              ...vehicleDoc,
              plateNumber: vehicleDoc.plateNumber || '',
              unitNo: vehicleDoc.unitNumber || vehicleDoc.internalId || '',
              makeModel: `${vehicleDoc.make || ''} ${vehicleDoc.model || ''}`.trim(),
              status: vehicleDoc.status === 'moving' ? 'moving' :
                vehicleDoc.status === 'idle' ? 'idle' :
                  vehicleDoc.status === 'maintenance' ? 'maintenance' : 'stopped',
              speed: vehicleDoc.speed || 0,
              fuelLevel: vehicleDoc.fuelLevel || 0,
              engineOn: vehicleDoc.engineOn || false,
              currentLocation: vehicleDoc.currentLocation || {
                address: '',
                latitude: '0',
                longitude: '0',
                updatedAt: new Date()
              }
            };
          }
        } catch (err) {
          console.warn(`⚠️ Vehicle model update failed for ${selectedVehicleId}:`, err.message);
        }
        return null;
      };

      // Send initial vehicle location immediately
      try {
        // Try FleetUnit first, then Vehicle model
        let initialVehicle = await tryUpdateFleetUnit();

        // If FleetUnit not found, try Vehicle model with trackingKey
        if (!initialVehicle) {
          initialVehicle = await tryUpdateVehicle();
        }

        if (initialVehicle) {
          socket.emit("vehicleLocation", initialVehicle);
        } else {
          console.warn(`⚠️ Vehicle/FleetUnit not found in DB with id: ${selectedVehicleId}`);
        }
      } catch (err) {
        console.error(`❌ Error fetching initial vehicle location:`, err.message);
      }

      // Start interval for regular updates every 3 seconds
      intervalId = setInterval(async () => {
        if (!selectedVehicleId) return;

        try {
          // Try FleetUnit first, then Vehicle model
          let vehicle = await tryUpdateFleetUnit();

          // If FleetUnit not found, try Vehicle model with trackingKey
          if (!vehicle) {
            vehicle = await tryUpdateVehicle();
          }

          if (!vehicle) {
            // FleetUnit not found, stop updates
            clearInterval(intervalId);
            intervalId = null;
            console.log(`⚠️ FleetUnit ${selectedVehicleId} not found, stopping updates.`);
            return;
          }

          socket.emit("vehicleLocation", vehicle);

          // Update trip coordinates if vehicle is on an active trip
          await updateTripCoordinates(vehicle);

        } catch (err) {
          // On error, send last known vehicle if exists
          try {
            const realId = extractRealId(selectedVehicleId);
            const queryConditions = [];

            queryConditions.push({ internalId: selectedVehicleId });
            queryConditions.push({ internalId: realId });

            if (isValidObjectId(realId)) {
              queryConditions.push({ _id: new mongoose.Types.ObjectId(realId) });
            }
            if (isValidObjectId(selectedVehicleId)) {
              queryConditions.push({ _id: new mongoose.Types.ObjectId(selectedVehicleId) });
            }

            let vehicle = await FleetUnit.findOne({
              $or: queryConditions,
              unitType: "Truck"
            }).lean();

            // Only use FleetUnit - no Vehicle model fallback
            if (!vehicle) {
              console.warn(`⚠️ FleetUnit not found in DB for vehicle ID: ${selectedVehicleId}`);
            }

            if (vehicle) {
              // Map FleetUnit to expected format
              if (vehicle.licensePlate) {
                vehicle.plateNumber = vehicle.licensePlate;
                vehicle.status = vehicle.operationStatus === "in-transit" ? "moving" :
                  vehicle.operationStatus === "maintenance" ? "maintenance" :
                    vehicle.operationStatus === "idle" ? "idle" : "stopped";
              }
              socket.emit("vehicleLocation", vehicle);
            }
          } catch (dbErr) {
            // console.error(`❌ Error fetching vehicle from DB:`, dbErr.message);
          }

          // Stop interval to prevent continuous errors
          clearInterval(intervalId);
          intervalId = null;
          // console.error(`❌ Error updating vehicle ${selectedVehicleId}:`, err.message);
        }
      }, 3000);
    });

    // Join trailer and start updates every 3 seconds
    // Uses FleetUnit model for trailers (unitType !== "Truck")
    socket.on("joinTrailer", async (trailerId) => {
      selectedTrailerId = trailerId;
      selectedVehicleId = null; // Clear vehicle selection
      console.log(`🚛 Client ${socket.id} joined trailer room: ${trailerId}`);

      // Clear old interval if any
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      // Send initial trailer location immediately
      try {
        // Extract real ID if prefixed
        const realId = extractRealId(selectedTrailerId);

        // First, try to find FleetUnit by _id to get its internalId
        let fleetUnitDoc = null;
        if (isValidObjectId(realId)) {
          fleetUnitDoc = await FleetUnit.findById(realId).lean();
        }

        // If not found by _id, try by internalId
        if (!fleetUnitDoc) {
          fleetUnitDoc = await FleetUnit.findOne({
            $or: [
              { internalId: selectedTrailerId },
              { internalId: realId }
            ],
            unitType: { $ne: "Truck" }
          }).lean();
        }

        // Try FleetUnit first (new approach)
        let initialTrailer = null;
        if (fleetUnitDoc && fleetUnitDoc.internalId) {
          initialTrailer = await updateFleetUnitById(fleetUnitDoc.internalId);
        }

        // If no Termoking update but FleetUnit exists, use it directly
        if (!initialTrailer && fleetUnitDoc) {
          initialTrailer = fleetUnitDoc;
        }

        // Only use FleetUnit - no Trailer model fallback
        if (!initialTrailer) {
          console.warn(`⚠️ FleetUnit not found for trailer ID: ${selectedTrailerId}`);
        }

        if (initialTrailer) {
          // Map FleetUnit to expected trailer format
          if (initialTrailer.licensePlate) {
            initialTrailer.plateNumber = initialTrailer.licensePlate;
            initialTrailer.trailer = initialTrailer.unitNo || initialTrailer.licensePlate;
            initialTrailer.type = initialTrailer.trailerType || initialTrailer.unitType?.toLowerCase() || 'dry_van';
            initialTrailer.status = initialTrailer.operationStatus === "in-transit" ? "moving" :
              initialTrailer.operationStatus === "maintenance" ? "maintenance" :
                initialTrailer.operationStatus === "idle" ? "idle" : "stopped";
          }
          socket.emit("trailerLocation", initialTrailer);
        } else {
          // Try to get from DB
          try {
            const realId = extractRealId(selectedTrailerId);
            const queryConditions = [];

            queryConditions.push({ internalId: selectedTrailerId });
            queryConditions.push({ internalId: realId });

            if (isValidObjectId(realId)) {
              queryConditions.push({ _id: new mongoose.Types.ObjectId(realId) });
            }
            if (isValidObjectId(selectedTrailerId)) {
              queryConditions.push({ _id: new mongoose.Types.ObjectId(selectedTrailerId) });
            }

            let trailer = await FleetUnit.findOne({
              $or: queryConditions,
              unitType: { $ne: "Truck" } // Only trailers
            }).lean();

            // Only use FleetUnit - no Trailer model fallback
            if (!trailer) {
              console.warn(`⚠️ FleetUnit not found in DB for trailer ID: ${selectedTrailerId}`);
            }

            if (trailer) {
              // Map FleetUnit to expected format
              if (trailer.licensePlate) {
                trailer.plateNumber = trailer.licensePlate;
                trailer.trailer = trailer.unitNo || trailer.licensePlate;
                trailer.type = trailer.trailerType || trailer.unitType?.toLowerCase() || 'dry_van';
                trailer.status = trailer.operationStatus === "in-transit" ? "moving" :
                  trailer.operationStatus === "maintenance" ? "maintenance" :
                    trailer.operationStatus === "idle" ? "idle" : "stopped";
              }
              socket.emit("trailerLocation", trailer);
            } else {
              console.warn(`⚠️ FleetUnit not found in DB with id: ${selectedTrailerId}`);
            }
          } catch (dbErr) {
            // console.error(`❌ Error fetching trailer from DB:`, dbErr.message);
          }
        }
      } catch (err) {
        // console.error(`❌ Error fetching initial trailer location:`, err.message);
      }

      intervalId = setInterval(async () => {
        if (!selectedTrailerId) return;

        try {
          // Extract real ID if prefixed
          const realId = extractRealId(selectedTrailerId);

          // First, try to find FleetUnit by _id to get its internalId
          let fleetUnitDoc = null;
          if (isValidObjectId(realId)) {
            fleetUnitDoc = await FleetUnit.findById(realId).lean();
          }

          // If not found by _id, try by internalId
          if (!fleetUnitDoc) {
            fleetUnitDoc = await FleetUnit.findOne({
              $or: [
                { internalId: selectedTrailerId },
                { internalId: realId }
              ],
              unitType: { $ne: "Truck" }
            }).lean();
          }

          // Try FleetUnit first
          let trailer = null;
          if (fleetUnitDoc && fleetUnitDoc.internalId) {
            trailer = await updateFleetUnitById(fleetUnitDoc.internalId);
          }

          // If no Termoking update but FleetUnit exists, use it directly
          if (!trailer && fleetUnitDoc) {
            trailer = fleetUnitDoc;
          }

          // Only use FleetUnit - no Trailer model fallback
          if (!trailer) {
            console.warn(`⚠️ FleetUnit not found for trailer ID: ${selectedTrailerId}`);
            // FleetUnit not found, stop updates
            clearInterval(intervalId);
            intervalId = null;
            console.log(`⚠️ FleetUnit ${selectedTrailerId} not found, stopping updates.`);
            return;
          }

          // Map FleetUnit to expected trailer format
          if (trailer.licensePlate) {
            trailer.plateNumber = trailer.licensePlate;
            trailer.trailer = trailer.unitNo || trailer.licensePlate;
            trailer.type = trailer.trailerType || trailer.unitType?.toLowerCase() || 'dry_van';
            trailer.status = trailer.operationStatus === "in-transit" ? "moving" :
              trailer.operationStatus === "maintenance" ? "maintenance" :
                trailer.operationStatus === "idle" ? "idle" : "stopped";
          }

          socket.emit("trailerLocation", trailer);

        } catch (err) {
          // On error, send last known trailer if exists
          try {
            const realId = extractRealId(selectedTrailerId);
            const queryConditions = [];

            queryConditions.push({ internalId: selectedTrailerId });
            queryConditions.push({ internalId: realId });

            if (isValidObjectId(realId)) {
              queryConditions.push({ _id: new mongoose.Types.ObjectId(realId) });
            }
            if (isValidObjectId(selectedTrailerId)) {
              queryConditions.push({ _id: new mongoose.Types.ObjectId(selectedTrailerId) });
            }

            let trailer = await FleetUnit.findOne({
              $or: queryConditions,
              unitType: { $ne: "Truck" }
            }).lean();

            // Only use FleetUnit - no Trailer model fallback
            if (!trailer) {
              console.warn(`⚠️ FleetUnit not found in DB for trailer ID: ${selectedTrailerId}`);
            }

            if (trailer) {
              // Map FleetUnit to expected format
              if (trailer.licensePlate) {
                trailer.plateNumber = trailer.licensePlate;
                trailer.trailer = trailer.unitNo || trailer.licensePlate;
                trailer.type = trailer.trailerType || trailer.unitType?.toLowerCase() || 'dry_van';
                trailer.status = trailer.operationStatus === "in-transit" ? "moving" :
                  trailer.operationStatus === "maintenance" ? "maintenance" :
                    trailer.operationStatus === "idle" ? "idle" : "stopped";
              }
              socket.emit("trailerLocation", trailer);
            }
          } catch (dbErr) {
            // console.error(`❌ Error fetching trailer from DB:`, dbErr.message);
          }

          // Stop interval to prevent continuous errors
          clearInterval(intervalId);
          intervalId = null;
          // console.error(`❌ Error updating trailer ${selectedTrailerId}:`, err.message);
        }
      }, 3000);
    });

    // Leave updates
    socket.on("leaveVehicle", () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      selectedVehicleId = null;
    });

    socket.on("leaveTrailer", () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      selectedTrailerId = null;
    });


    // join a specific load room
    socket.on("joinLoad", ({ loadId }) => {
      if (!loadId) return;
      socket.join(loadId);
      console.log(`${socket.id} joined room ${loadId}`);
    });

    // driver sends live location
    socket.on("driverLocation", async ({ loadId, latitude, longitude }) => {
      try {
        if (!loadId) return;

        const latStr = String(latitude);
        const lonStr = String(longitude);

        const load = await Load.findById(loadId);
        if (!load) return;

        // Append to history
        load.locationHistory.push({
          latitude: latStr,
          longitude: lonStr,
          timestamp: new Date()
        });

        // Update live location
        load.liveLocation = {
          latitude: latStr,
          longitude: lonStr,
          updatedAt: new Date()
        };

        // Compute traveled distance (sum of segments in history)
        let traveled = 0;
        const history = load.locationHistory;
        for (let i = 1; i < history.length; i++) {
          const prev = history[i - 1];
          const curr = history[i];
          const aLat = parseFloat(prev.latitude);
          const aLon = parseFloat(prev.longitude);
          const bLat = parseFloat(curr.latitude);
          const bLon = parseFloat(curr.longitude);
          if (![aLat, aLon, bLat, bLon].some(Number.isNaN)) {
            traveled += haversineDistance(aLat, aLon, bLat, bLon);
          }
        }

        // Compute total (pickup -> dropoff)
        let totalDistance = 0;
        if (
          load.route &&
          load.route.selectPickup &&
          load.route.selectDropOff &&
          load.route.selectPickup.latitude &&
          load.route.selectPickup.longitude &&
          load.route.selectDropOff.latitude &&
          load.route.selectDropOff.longitude
        ) {
          totalDistance = haversineDistance(
            parseFloat(load.route.selectPickup.latitude),
            parseFloat(load.route.selectPickup.longitude),
            parseFloat(load.route.selectDropOff.latitude),
            parseFloat(load.route.selectDropOff.longitude)
          );
        }

        const remaining = Math.max(totalDistance - traveled, 0);

        await load.save();

        // Emit to all clients in this load room
        io.to(loadId).emit("locationUpdate", {
          loadId,
          latitude: parseFloat(latStr),
          longitude: parseFloat(lonStr),
          traveled: Number(traveled.toFixed(3)),      // km
          totalDistance: Number(totalDistance.toFixed(3)), // km
          remaining: Number(remaining.toFixed(3)),    // km
          history: load.locationHistory
        });
      } catch (err) {
        // console.error("driverLocation error:", err);
      }
    });

    socket.on("disconnect", () => {
      connectedClients--;
      console.log(`❌ Client disconnected: ${socket.id}`);
      console.log(`📊 Total connected clients: ${connectedClients}`);
      if (intervalId) clearInterval(intervalId);
    });

    // Join compliance room for HOS/ELD GPS tracking
    socket.on("joinComplianceGPS", () => {
      socket.join("compliance-gps");
      console.log(`📍 Client ${socket.id} joined compliance GPS room`);
    });

    socket.on("leaveComplianceGPS", () => {
      socket.leave("compliance-gps");
      console.log(`📍 Client ${socket.id} left compliance GPS room`);
    });

    // ==================== CHAT HANDLERS ====================
    // Store authenticated user info on socket
    let socketUser = null;
    let socketCompanyId = null;

    // Authenticate socket connection
    socket.on("authenticate", async (token) => {
      try {
        if (!token) {
          console.error(`❌ Socket ${socket.id}: No token provided`);
          socket.emit("auth_error", { message: "No token provided" });
          return;
        }

        // Clean token - remove "Bearer " prefix if present
        let cleanToken = token.trim();
        if (cleanToken.startsWith('Bearer ')) {
          cleanToken = cleanToken.substring(7).trim();
        }

        if (!cleanToken) {
          console.error(`❌ Socket ${socket.id}: Empty token after cleaning`);
          socket.emit("auth_error", { message: "Empty token" });
          return;
        }

        // Verify token
        let decoded;
        try {
          decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
        } catch (jwtError) {
          console.error(`❌ Socket ${socket.id}: JWT verification failed:`, jwtError.message);
          if (jwtError.name === 'TokenExpiredError') {
            socket.emit("auth_error", { message: "Token expired. Please login again." });
          } else if (jwtError.name === 'JsonWebTokenError') {
            socket.emit("auth_error", { message: "Invalid token format" });
          } else {
            socket.emit("auth_error", { message: `Token verification failed: ${jwtError.message}` });
          }
          return;
        }

        // Guard against race condition: socket auth can arrive before MongoDB is ready
        if (mongoose.connection.readyState !== 1) {
          socket.emit("auth_error", { message: "Database not ready, please retry" });
          return;
        }

        // Find user
        const user = await User.findById(decoded.id)
          .populate('company', '_id')
          .select('-password')
          .lean();

        if (!user) {
          console.error(`❌ Socket ${socket.id}: User not found for ID: ${decoded.id}`);
          socket.emit("auth_error", { message: "User not found" });
          return;
        }

        // Check if user is active
        if (user.status !== 'active') {
          console.error(`❌ Socket ${socket.id}: User account is not active: ${user.status}`);
          socket.emit("auth_error", { message: "Account is not active" });
          return;
        }

        // Store user info on socket (both as closure var AND as socket property for cross-socket access)
        socketUser = user;
        socket.socketUser = user;
        socketCompanyId = getUserCompanyId(user);

        // Join dispatcher room if user is a dispatcher/admin
        const isDispatcher = ['admin', 'superadmin', 'dispatcher'].includes(user.role?.toLowerCase());
        if (isDispatcher) {
          // Join both company-specific and global dispatcher rooms
          if (socketCompanyId) {
            const companyDispatcherRoom = `dispatchers_${socketCompanyId}`;
            socket.join(companyDispatcherRoom);
            console.log(`✅ Socket ${socket.id} joined company dispatcher room: ${companyDispatcherRoom} (user: ${user.name || user.email}, role: ${user.role})`);
          }
          // Always join global dispatchers room
          socket.join('dispatchers_all');
          console.log(`✅ Socket ${socket.id} joined global dispatcher room: dispatchers_all (user: ${user.name || user.email}, role: ${user.role})`);
          console.log(`📊 Socket ${socket.id} is now in rooms:`, Array.from(socket.rooms));
        }

        socket.emit("authenticated", {
          userId: user._id.toString(),
          name: user.name || user.email,
          role: user.role,
          companyId: socketCompanyId
        });

        console.log(`✅ Socket ${socket.id} authenticated as user: ${user.name || user.email} (role: ${user.role}, isDispatcher: ${isDispatcher}, companyId: ${socketCompanyId})`);
      } catch (error) {
        console.error(`❌ Socket authentication error for ${socket.id}:`, error.message);
        console.error(`   Error stack:`, error.stack);
        socket.emit("auth_error", {
          message: error.message || "Authentication failed",
          error: error.name || "UnknownError"
        });
      }
    });

    // Join trip/order chat room (supports both tripId and orderId for backward compatibility)
    socket.on("joinTripChat", async (tripIdOrOrderId) => {
      try {
        if (!socketUser) {
          socket.emit("error", { message: "Please authenticate first" });
          return;
        }

        if (!tripIdOrOrderId || !mongoose.Types.ObjectId.isValid(tripIdOrOrderId)) {
          socket.emit("error", { message: "Invalid trip/order ID" });
          return;
        }

        const OrderModel = (await import("../models/orderModel.js")).default;
        let order = null;
        let trip = null;
        let hasAccess = false;
        const userId = socketUser._id;

        // Try to find as order first (since we're using orders now)
        order = await OrderModel.findById(tripIdOrOrderId).lean();

        if (order) {
          // Check if user has access to this order
          // User can access if: driver, coDriver, dispatcher/admin of same company, or superadmin
          const isSuperadmin = socketUser.role === 'superadmin';
          const isDriver = order.driver?.toString() === userId.toString();
          const isCoDriver = order.coDriver?.toString() === userId.toString();
          const isDispatcher = ['admin', 'superadmin', 'dispatcher'].includes(socketUser.role?.toLowerCase());

          // Check company access for dispatchers
          if (isDispatcher && !isSuperadmin && socketCompanyId) {
            const orderCompanyId = order.company?.toString() || order.company;
            hasAccess = orderCompanyId === socketCompanyId;
          } else if (isSuperadmin) {
            hasAccess = true;
          } else {
            // Driver or co-driver always has access to their orders
            hasAccess = isDriver || isCoDriver;
          }

          if (!hasAccess) {
            socket.emit("error", { message: "Access denied. You don't have access to this order." });
            return;
          }

          // Join room using orderId
          const roomName = `order-chat-${tripIdOrOrderId}`;
          socket.join(roomName);
          console.log(`💬 Socket ${socket.id} (${socketUser.name || socketUser.email}) joined order chat: ${tripIdOrOrderId}`);
          socket.emit("joinedTripChat", { tripId: tripIdOrOrderId, orderId: tripIdOrOrderId, roomName });
          return;
        }

        // Fallback: Try to find as trip (for backward compatibility)
        trip = await Trip.findById(tripIdOrOrderId).lean();
        if (trip) {
          // Check company access
          const isSuperadmin = socketUser.role === 'superadmin';
          if (!isSuperadmin && socketCompanyId) {
            const tripCompanyId = trip.company?.toString() || trip.company;
            if (tripCompanyId !== socketCompanyId) {
              socket.emit("error", { message: "Access denied. This trip does not belong to your company." });
              return;
            }
          }

          // Join room
          const roomName = `trip-chat-${tripIdOrOrderId}`;
          socket.join(roomName);
          console.log(`💬 Socket ${socket.id} (${socketUser.name || socketUser.email}) joined trip chat: ${tripIdOrOrderId}`);
          socket.emit("joinedTripChat", { tripId: tripIdOrOrderId, roomName });
          return;
        }

        // Neither order nor trip found
        socket.emit("error", { message: "Order/Trip not found" });
      } catch (error) {
        console.error(`❌ Error joining trip/order chat for ${socket.id}:`, error.message);
        socket.emit("error", { message: error.message });
      }
    });

    // Leave trip/order chat room
    socket.on("leaveTripChat", (tripIdOrOrderId) => {
      if (!tripIdOrOrderId) return;
      // Try both room names for backward compatibility
      const tripRoomName = `trip-chat-${tripIdOrOrderId}`;
      const orderRoomName = `order-chat-${tripIdOrOrderId}`;
      socket.leave(tripRoomName);
      socket.leave(orderRoomName);
      console.log(`💬 Socket ${socket.id} left trip/order chat: ${tripIdOrOrderId}`);
    });

    // Send chat message (supports both tripId and orderId)
    socket.on("sendChatMessage", async (data) => {
      try {
        if (!socketUser) {
          socket.emit("error", { message: "Please authenticate first" });
          return;
        }

        const { tripId, orderId, message, fileUrl, fileName, fileType, fileSize } = data;
        const tripIdOrOrderId = orderId || tripId;

        if (!tripIdOrOrderId || !mongoose.Types.ObjectId.isValid(tripIdOrOrderId)) {
          socket.emit("error", { message: "Invalid trip/order ID" });
          return;
        }

        if (!message && !fileUrl) {
          socket.emit("error", { message: "Message or file is required" });
          return;
        }

        const OrderModel = (await import("../models/orderModel.js")).default;
        let order = null;
        let trip = null;
        let hasAccess = false;
        const userId = socketUser._id;

        // Try to find as order first (since we're using orders now)
        order = await OrderModel.findById(tripIdOrOrderId).lean();

        if (order) {
          // Check if user has access to this order
          // User can access if: driver, coDriver, dispatcher/admin of same company, or superadmin
          const isSuperadmin = socketUser.role === 'superadmin';
          const isDriver = order.driver?.toString() === userId.toString();
          const isCoDriver = order.coDriver?.toString() === userId.toString();
          const isDispatcher = ['admin', 'superadmin', 'dispatcher'].includes(socketUser.role?.toLowerCase());

          // Check company access for dispatchers
          if (isDispatcher && !isSuperadmin && socketCompanyId) {
            const orderCompanyId = order.company?.toString() || order.company;
            hasAccess = orderCompanyId === socketCompanyId;
          } else if (isSuperadmin) {
            hasAccess = true;
          } else {
            // Driver or co-driver always has access to their orders
            hasAccess = isDriver || isCoDriver;
          }

          if (!hasAccess) {
            socket.emit("error", { message: "Access denied. You don't have access to this order." });
            return;
          }

          // Determine sender type
          const userRole = socketUser.role?.toLowerCase() || "";
          let senderType = "dispatcher";
          if (userRole.includes("driver")) {
            senderType = "driver";
          } else if (userRole === "superadmin" || userRole.includes("admin")) {
            senderType = "dispatcher";
          }

          // Create chat message with orderId
          const chatMessage = new ChatMessage({
            orderId: tripIdOrOrderId,
            senderId: socketUser._id,
            senderType,
            senderName: socketUser.name || socketUser.email || "Unknown",
            message: message || "",
            fileUrl: fileUrl || null,
            fileName: fileName || null,
            fileType: fileType || null,
            fileSize: fileSize || null,
            company: socketCompanyId || order.company
          });

          await chatMessage.save();

          // Populate sender info
          const populatedMessage = await ChatMessage.findById(chatMessage._id)
            .populate("senderId", "name email")
            .lean();

          // Broadcast to all users in the order chat room
          const roomName = `order-chat-${tripIdOrOrderId}`;
          io.to(roomName).emit("newChatMessage", populatedMessage);

          console.log(`💬 New chat message sent in order ${tripIdOrOrderId} by ${socketUser.name || socketUser.email}`);

          // 🤖 AI Document Auto-Send: Process message for document requests
          if (message && senderType === 'driver') {
            try {
              const { processChatMessageForDocuments } = await import('./aiChatDocumentService.js');
              // Ensure companyId is always a string
              let socketCompanyId = socketUser.company;
              if (socketCompanyId && typeof socketCompanyId === 'object' && socketCompanyId.toString) {
                socketCompanyId = socketCompanyId.toString();
              } else if (!socketCompanyId) {
                socketCompanyId = order.company;
              }
              if (socketCompanyId && typeof socketCompanyId === 'object' && socketCompanyId.toString) {
                socketCompanyId = socketCompanyId.toString();
              }
              await processChatMessageForDocuments(
                {
                  message,
                  senderType
                },
                {
                  orderIdOrTripId: tripIdOrOrderId.toString(),
                  companyId: socketCompanyId,
                  userId: socketUser._id
                },
                io
              );
            } catch (aiError) {
              console.error('❌ AI document processing error (non-blocking):', aiError);
              // Don't block the chat message if AI processing fails
            }
          }

          return;
        }

        // Fallback: Try to find as trip (for backward compatibility)
        trip = await Trip.findById(tripIdOrOrderId).lean();
        if (trip) {
          // Check company access
          const isSuperadmin = socketUser.role === 'superadmin';
          if (!isSuperadmin && socketCompanyId) {
            const tripCompanyId = trip.company?.toString() || trip.company;
            if (tripCompanyId !== socketCompanyId) {
              socket.emit("error", { message: "Access denied. This trip does not belong to your company." });
              return;
            }
          }

          // Determine sender type
          const userRole = socketUser.role?.toLowerCase() || "";
          let senderType = "dispatcher";
          if (userRole.includes("driver")) {
            senderType = "driver";
          } else if (userRole === "superadmin" || userRole.includes("admin")) {
            senderType = "dispatcher";
          }

          // Create chat message with tripId
          const chatMessage = new ChatMessage({
            tripId: tripIdOrOrderId,
            senderId: socketUser._id,
            senderType,
            senderName: socketUser.name || socketUser.email || "Unknown",
            message: message || "",
            fileUrl: fileUrl || null,
            fileName: fileName || null,
            fileType: fileType || null,
            fileSize: fileSize || null,
            company: socketCompanyId || trip.company
          });

          await chatMessage.save();

          // Populate sender info
          const populatedMessage = await ChatMessage.findById(chatMessage._id)
            .populate("senderId", "name email")
            .lean();

          // Broadcast to all users in the trip chat room
          const roomName = `trip-chat-${tripIdOrOrderId}`;
          io.to(roomName).emit("newChatMessage", populatedMessage);

          console.log(`💬 New chat message sent in trip ${tripIdOrOrderId} by ${socketUser.name || socketUser.email}`);

          // 🤖 AI Document Auto-Send: Process message for document requests
          if (message && senderType === 'driver') {
            try {
              const { processChatMessageForDocuments } = await import('./aiChatDocumentService.js');
              // Ensure companyId is always a string
              let socketCompanyId = socketUser.company;
              if (socketCompanyId && typeof socketCompanyId === 'object' && socketCompanyId.toString) {
                socketCompanyId = socketCompanyId.toString();
              } else if (!socketCompanyId) {
                socketCompanyId = trip.company;
              }
              if (socketCompanyId && typeof socketCompanyId === 'object' && socketCompanyId.toString) {
                socketCompanyId = socketCompanyId.toString();
              }
              await processChatMessageForDocuments(
                {
                  message,
                  senderType
                },
                {
                  orderIdOrTripId: tripIdOrOrderId.toString(),
                  companyId: socketCompanyId,
                  userId: socketUser._id
                },
                io
              );
            } catch (aiError) {
              console.error('❌ AI document processing error (non-blocking):', aiError);
              // Don't block the chat message if AI processing fails
            }
          }
          return;
        }

        // Neither order nor trip found
        socket.emit("error", { message: "Order/Trip not found" });
      } catch (error) {
        console.error(`❌ Error sending chat message from ${socket.id}:`, error.message);
        socket.emit("error", { message: error.message });
      }
    });

    // Mark messages as read (supports both tripId and orderId)
    socket.on("markMessagesRead", async (tripIdOrOrderId) => {
      try {
        if (!socketUser) {
          return;
        }

        if (!tripIdOrOrderId || !mongoose.Types.ObjectId.isValid(tripIdOrOrderId)) {
          return;
        }

        const userId = socketUser._id;

        // Find unread messages for this order/trip (check both orderId and tripId)
        const unreadMessages = await ChatMessage.find({
          $or: [
            { orderId: tripIdOrOrderId },
            { tripId: tripIdOrOrderId }
          ],
          senderId: { $ne: userId },
          "readBy.userId": { $ne: userId }
        });

        // Mark as read
        for (const msg of unreadMessages) {
          const alreadyRead = msg.readBy.some(
            (read) => read.userId.toString() === userId.toString()
          );

          if (!alreadyRead) {
            msg.readBy.push({
              userId,
              readAt: new Date()
            });
            await msg.save();
          }
        }

        console.log(`✅ Messages marked as read for trip ${tripId} by ${socketUser.name || socketUser.email}`);
      } catch (error) {
        console.error(`❌ Error marking messages as read for ${socket.id}:`, error.message);
      }
    });

    // Typing indicator
    socket.on("typing", (data) => {
      try {
        if (!socketUser) return;

        const { tripId, orderId, isTyping } = data;
        const tripIdOrOrderId = orderId || tripId;
        if (!tripIdOrOrderId) return;

        // Try order room first, then trip room for backward compatibility
        const orderRoomName = `order-chat-${tripIdOrOrderId}`;
        const tripRoomName = `trip-chat-${tripIdOrOrderId}`;

        // Emit to both rooms to support both order and trip chats
        socket.to(orderRoomName).emit("userTyping", {
          userId: socketUser._id.toString(),
          userName: socketUser.name || socketUser.email,
          tripId: tripIdOrOrderId,
          orderId: tripIdOrOrderId,
          isTyping
        });

        socket.to(tripRoomName).emit("userTyping", {
          userId: socketUser._id.toString(),
          userName: socketUser.name || socketUser.email,
          tripId: tripIdOrOrderId,
          orderId: tripIdOrOrderId,
          isTyping
        });
      } catch (error) {
        console.error(`❌ Error handling typing indicator for ${socket.id}:`, error.message);
      }
    });

    // ===== DRIVER CHAT HANDLERS =====

    // Join driver chat room
    socket.on("joinDriverChat", async (driverId) => {
      try {
        if (!socketUser) {
          socket.emit("error", { message: "Please authenticate first" });
          return;
        }

        if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
          socket.emit("error", { message: "Invalid driver ID" });
          return;
        }

        const UserModel = (await import("../models/driver/userModel.js")).User;
        const driver = await UserModel.findById(driverId).lean();

        if (!driver || driver.role !== 'driver') {
          socket.emit("error", { message: "Driver not found" });
          return;
        }

        // Check access: driver can join their own chat, dispatcher/admin can join any driver in their company
        const isDriver = socketUser.role === 'driver';
        const isSuperadmin = socketUser.role === 'superadmin';
        const isDispatcher = ['admin', 'superadmin', 'dispatcher'].includes(socketUser.role?.toLowerCase());

        if (isDriver) {
          // Driver can only join their own chat
          if (socketUser._id.toString() !== driverId) {
            socket.emit("error", { message: "Access denied. You can only access your own chat." });
            return;
          }
        } else if (!isSuperadmin && socketCompanyId) {
          // Dispatcher/admin must have company access
          const driverCompanyId = driver.company?.toString() || driver.company;
          if (driverCompanyId !== socketCompanyId) {
            socket.emit("error", { message: "Access denied. This driver does not belong to your company." });
            return;
          }
        }

        // Join room
        const roomName = `driver-chat-${driverId}`;
        socket.join(roomName);
        const roomAfterJoin = io.sockets.adapter.rooms.get(roomName);
        console.log(`💬 Socket ${socket.id} (${socketUser.name || socketUser.email}) joined driver chat: ${driverId}`);
        console.log(`🔍 [JOIN-CHECK] Room "${roomName}" members right after join: ${roomAfterJoin?.size || 0}`, Array.from(roomAfterJoin || []));
        console.log(`🔍 [JOIN-CHECK] Socket ${socket.id} is currently in rooms:`, Array.from(socket.rooms));
        socket.emit("joinedDriverChat", { driverId, roomName });
      } catch (error) {
        console.error(`❌ Error joining driver chat for ${socket.id}:`, error.message);
        socket.emit("error", { message: error.message });
      }
    });

    // Leave driver chat room
    socket.on("leaveDriverChat", (driverId) => {
      if (!driverId) return;
      const roomName = `driver-chat-${driverId}`;
      socket.leave(roomName);
      console.log(`💬 Socket ${socket.id} left driver chat: ${driverId}`);
    });

    // Send driver chat message
    socket.on("sendDriverChatMessage", async (data) => {
      try {
        if (!socketUser) {
          socket.emit("error", { message: "Please authenticate first" });
          return;
        }

        const { driverId, message, fileUrl, fileName, fileType, fileSize } = data;

        if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
          socket.emit("error", { message: "Invalid driver ID" });
          return;
        }

        if (!message && !fileUrl) {
          socket.emit("error", { message: "Message or file is required" });
          return;
        }

        const UserModel = (await import("../models/driver/userModel.js")).User;
        const driver = await UserModel.findById(driverId).lean();

        if (!driver || driver.role !== 'driver') {
          socket.emit("error", { message: "Driver not found" });
          return;
        }

        // Check access: driver can send to their own chat, dispatcher/admin can send to any driver in their company
        const isDriver = socketUser.role === 'driver';
        const isSuperadmin = socketUser.role === 'superadmin';
        const isDispatcher = ['admin', 'superadmin', 'dispatcher'].includes(socketUser.role?.toLowerCase());

        if (isDriver) {
          // Driver can only send to their own chat
          if (socketUser._id.toString() !== driverId) {
            socket.emit("error", { message: "Access denied. You can only send messages to your own chat." });
            return;
          }
        } else if (!isSuperadmin && socketCompanyId) {
          // Dispatcher/admin must have company access
          const driverCompanyId = driver.company?.toString() || driver.company;
          if (driverCompanyId !== socketCompanyId) {
            socket.emit("error", { message: "Access denied. This driver does not belong to your company." });
            return;
          }
        }

        // Determine sender type
        const userRole = socketUser.role?.toLowerCase() || "";
        let senderType = "dispatcher";
        if (userRole.includes("driver")) {
          senderType = "driver";
        } else if (userRole === "superadmin" || userRole.includes("admin")) {
          senderType = "dispatcher";
        }

        // Create chat message with driverId
        const chatMessage = new ChatMessage({
          driverId: new mongoose.Types.ObjectId(driverId),
          senderId: socketUser._id,
          senderType,
          senderName: socketUser.name || socketUser.email || "Unknown",
          message: message || "",
          fileUrl: fileUrl || null,
          fileName: fileName || null,
          fileType: fileType || null,
          fileSize: fileSize || null,
          company: socketCompanyId || driver.company
        });

        await chatMessage.save();

        // Populate sender info and ensure driverId is included
        const populatedMessage = await ChatMessage.findById(chatMessage._id)
          .populate("senderId", "name email")
          .lean();

        // Ensure driverId is a string (not ObjectId) for frontend compatibility
        if (populatedMessage.driverId) {
          populatedMessage.driverId = populatedMessage.driverId.toString();
        }

        // Broadcast driver's message first (real-time)
        const roomName = `driver-chat-${driverId}`;
        const room = io.sockets.adapter.rooms.get(roomName);
        const roomSize = room?.size || 0;
        console.log(`🔍 [BROADCAST-CHECK] Total connected sockets: ${io.sockets.sockets.size}`);
        console.log(`🔍 [BROADCAST-CHECK] All socket IDs:`, Array.from(io.sockets.sockets.keys()));
        console.log(`🔍 [BROADCAST-CHECK] Room "${roomName}" members: ${roomSize}`, Array.from(room || []));

        console.log(`📤 Broadcasting message to room: ${roomName}`, {
          messageId: populatedMessage._id,
          driverId: populatedMessage.driverId,
          senderId: populatedMessage.senderId?._id || populatedMessage.senderId,
          senderType: populatedMessage.senderType,
          senderName: populatedMessage.senderName,
          senderRole: socketUser.role,
          roomMembers: roomSize,
          message: populatedMessage.message?.substring(0, 50)
        });

        // Log who's in the room before broadcasting
        if (room && room.size > 0) {
          console.log(`📊 Room ${roomName} members before broadcast:`);
          room.forEach((socketId) => {
            const socketInRoom = io.sockets.sockets.get(socketId);
            if (socketInRoom && socketInRoom.socketUser) {
              const userRole = socketInRoom.socketUser.role?.toLowerCase() || '';
              const userName = socketInRoom.socketUser.name || socketInRoom.socketUser.email || 'Unknown';
              console.log(`  - ${userName} (role: ${userRole}, socketId: ${socketId.substring(0, 8)}...)`);
            }
          });
        } else {
          console.log(`⚠️ Room ${roomName} is empty or doesn't exist`);
        }

        // Send message based on sender role
        if (socketUser.role === 'driver' && socketCompanyId) {
          // Driver sending message
          // 1. Send to sender (driver) directly
          socket.emit("newChatMessage", populatedMessage);
          console.log(`✅ Message sent directly to sender (driver): ${socketUser.name || socketUser.email}`);

          // 2. Broadcast to room EXCEPT sender (dispatchers in room will get it)
          socket.to(roomName).emit("newChatMessage", populatedMessage);

          // 3. Send to dispatchers NOT in room
          let dispatcherCount = 0;
          let dispatcherNames = [];
          let dispatcherInRoomCount = 0;
          console.log(`🔍 Scanning ${io.sockets.sockets.size} sockets for dispatchers (driverCompany: ${socketCompanyId})`);
          io.sockets.sockets.forEach((s) => {
            const sCompany = getUserCompanyId(s.socketUser);
            console.log(`  socket ${s.id}: socketUser=${s.socketUser ? s.socketUser.role : 'null'}, company=${sCompany}, inRoom=${room?.has(s.id)}`);
            if (s.socketUser && s.socketUser.role !== 'driver' && s.id !== socket.id) {
              const userCompanyId = getUserCompanyId(s.socketUser);
              if (s.socketUser.role === 'superadmin' || userCompanyId === socketCompanyId) {
                const dispatcherName = s.socketUser.name || s.socketUser.email || 'Unknown';
                // Only send to dispatchers NOT in room (those in room already got it from room broadcast)
                if (!room || !room.has(s.id)) {
                  s.emit("newChatMessage", populatedMessage);
                  dispatcherCount++;
                  dispatcherNames.push(dispatcherName);
                  console.log(`  → Sent to dispatcher (not in room): ${dispatcherName}`);
                } else {
                  dispatcherInRoomCount++;
                  console.log(`  → Skipped dispatcher (got from room broadcast): ${dispatcherName}`);
                }
              }
            }
          });

          if (dispatcherInRoomCount > 0) {
            console.log(`📤 Room broadcast sent to ${dispatcherInRoomCount} dispatcher(s) in room`);
          }
          if (dispatcherCount > 0) {
            console.log(`📤 Sent driver message to ${dispatcherCount} dispatcher(s) not in room:`, dispatcherNames.join(', '));
          }
        } else if (socketUser.role !== 'driver' && socketCompanyId) {
          // Dispatcher/admin sending message
          // 1. Send to sender (dispatcher) directly
          socket.emit("newChatMessage", populatedMessage);
          console.log(`✅ Message sent directly to sender (dispatcher): ${socketUser.name || socketUser.email}`);

          // 2. Broadcast to room EXCEPT sender (driver in room will get it)
          socket.to(roomName).emit("newChatMessage", populatedMessage);

          // 3. Send to driver if NOT in room
          let driverSocketFound = false;
          let driverInRoom = false;
          io.sockets.sockets.forEach((s) => {
            if (s.socketUser && s.socketUser.role === 'driver' && s.socketUser._id?.toString() === driverId) {
              // Only send if driver is NOT in room (those in room already got it from room broadcast)
              if (!room || !room.has(s.id)) {
                s.emit("newChatMessage", populatedMessage);
                driverSocketFound = true;
                console.log(`  → Sent to driver (not in room): ${s.socketUser.name || s.socketUser.email}`);
              } else {
                driverInRoom = true;
                console.log(`  → Skipped driver (got from room broadcast): ${s.socketUser.name || s.socketUser.email}`);
              }
            }
          });

          // 4. Send to other dispatchers NOT in room (exclude sender)
          let dispatcherCount = 0;
          let dispatcherNames = [];
          io.sockets.sockets.forEach((s) => {
            if (s.socketUser && s.socketUser.role !== 'driver' && s.id !== socket.id) {
              const userCompanyId = getUserCompanyId(s.socketUser);
              if (s.socketUser.role === 'superadmin' || userCompanyId === socketCompanyId) {
                // Only send if not already in room (avoid duplicate)
                if (!room || !room.has(s.id)) {
                  s.emit("newChatMessage", populatedMessage);
                  dispatcherCount++;
                  const dispatcherName = s.socketUser.name || s.socketUser.email || 'Unknown';
                  dispatcherNames.push(dispatcherName);
                  console.log(`  → Sent to dispatcher (not in room): ${dispatcherName}`);
                } else {
                  console.log(`  → Skipped dispatcher (got from room broadcast): ${s.socketUser.name || s.socketUser.email}`);
                }
              }
            }
          });

          if (driverSocketFound) {
            console.log(`📤 Sent dispatcher message to driver (not in room)`);
          }
          if (driverInRoom) {
            console.log(`📤 Driver is in room, received from room broadcast`);
          }
          if (dispatcherCount > 0) {
            console.log(`📤 Sent dispatcher message to ${dispatcherCount} dispatcher(s) not in room:`, dispatcherNames.join(', '));
          }
        }

        console.log(`✅ Message broadcasted to room ${roomName} (${roomSize} members) and directly to sender`);
        console.log(`💬 New chat message sent to driver ${driverId} by ${socketUser.name || socketUser.email}`);

        // Push notification to driver when dispatcher sends a message
        if (senderType === 'dispatcher') {
          try {
            const driverDoc = await User.findById(driverId).select('expoPushToken').lean();
            console.log(`🔔 [Push] Driver expoPushToken:`, driverDoc?.expoPushToken || 'NOT FOUND');
            if (driverDoc?.expoPushToken) {
              await sendPushToDriver(
                driverDoc.expoPushToken,
                socketUser.name || 'Dispatcher',
                populatedMessage.message || '📎 Sent an attachment',
                { type: 'chat', driverId: driverId.toString(), channelId: 'logistiq-chat' }
              );
              console.log(`🔔 [Push] Notification sent to driver ${driverId}`);
            }
          } catch (pushErr) {
            console.error('[Push] Chat push failed:', pushErr.message);
          }
        }

        // If driver sent the message, check if we should fetch and send trip status
        // Only show trip status:
        // 1. First message from driver in this chat
        // 2. If 30 minutes have passed since last message
        if (senderType === 'driver') {
          // For drivers, use socketUser._id as the driverId (more reliable than data.driverId)
          const actualDriverId = socketUser._id?.toString() || driverId;

          try {
            // Check the last message time in this chat (excluding the current message we just created)
            const lastMessage = await ChatMessage.findOne({
              driverId: new mongoose.Types.ObjectId(actualDriverId),
              _id: { $ne: chatMessage._id } // Exclude the current message
            })
              .sort({ createdAt: -1 })
              .lean();

            let shouldFetchTripStatus = false;
            let reason = '';

            if (!lastMessage) {
              // This is the first message in the chat
              shouldFetchTripStatus = true;
              reason = 'First message in chat';
              console.log(`📋 Driver ${socketUser.name} sent first message. Will fetch trip status.`);
            } else if (lastMessage.createdAt) {
              // Check if 30 minutes have passed since last message
              const timeDiff = Date.now() - new Date(lastMessage.createdAt).getTime();
              const minutesDiff = timeDiff / (1000 * 60);

              if (minutesDiff >= 30) {
                shouldFetchTripStatus = true;
                reason = `${minutesDiff.toFixed(1)} minutes since last message`;
                console.log(`⏰ Driver ${socketUser.name} sent message after ${minutesDiff.toFixed(1)} minutes. Will fetch trip status.`);
              } else {
                console.log(`⏱️ Only ${minutesDiff.toFixed(1)} minutes since last message. Skipping trip status (showing only once per 30 minutes).`);
              }
            }

            if (shouldFetchTripStatus) {
              console.log(`🔍 Driver details:`, {
                socketUserId: socketUser._id?.toString(),
                dataDriverId: driverId,
                actualDriverId: actualDriverId,
                reason: reason
              });

              // Validate driverId before calling
              if (!mongoose.Types.ObjectId.isValid(actualDriverId)) {
                console.error(`❌ Invalid driverId format: ${actualDriverId}`);
                throw new Error(`Invalid driverId format: ${actualDriverId}`);
              }

              // Get driver trip status with AI summary
              const { getDriverTripStatusWithAI } = await import('../controllers/chat/driverTripStatusController.js');
              const tripStatusResult = await getDriverTripStatusWithAI(actualDriverId, socketCompanyId);

              if (tripStatusResult.success && tripStatusResult.data) {
                const tripStatusData = tripStatusResult.data;
                console.log(`✅ Trip status fetched for driver ${socketUser.name}:`, {
                  isCurrentlyDriving: tripStatusData.summary.isCurrentlyDriving,
                  totalActive: tripStatusData.summary.totalActive,
                  totalPending: tripStatusData.summary.totalPending,
                  activeTrips: tripStatusData.activeTrips.length,
                  activeOrders: tripStatusData.activeOrders.length
                });

                // Create a system message object for socket emission (not saved to DB)
                // System messages are ephemeral and only sent via socket
                // The trip status will be included in the message payload
                const systemMessage = {
                  _id: `trip-status-${Date.now()}-${Math.random()}`,
                  driverId: actualDriverId.toString(),
                  senderId: {
                    _id: 'system',
                    name: 'System',
                    email: 'system@blackriver.com'
                  },
                  senderType: 'system',
                  senderName: 'System',
                  message: 'Driver Trip Status Update',
                  tripStatus: tripStatusData,
                  readBy: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  isSystemMessage: true,
                  forDispatchersOnly: true
                };

                // Broadcast trip status to all dispatchers
                // Use io.to() to broadcast to all sockets in the room, dispatchers will receive it
                // Drivers will filter it out on the frontend
                const room = io.sockets.adapter.rooms.get(roomName);
                const roomSize = room?.size || 0;

                console.log(`📊 Broadcasting trip status message to room: ${roomName}`, {
                  roomMembers: roomSize,
                  driverId: actualDriverId,
                  hasTripStatus: !!tripStatusData,
                  systemMessageId: systemMessage._id
                });

                // Log who's in the room for debugging
                if (room && room.size > 0) {
                  console.log(`📊 Room ${roomName} has ${room.size} member(s):`);
                  room.forEach((socketId) => {
                    const socketInRoom = io.sockets.sockets.get(socketId);
                    if (socketInRoom && socketInRoom.socketUser) {
                      const userRole = socketInRoom.socketUser.role?.toLowerCase() || '';
                      const userName = socketInRoom.socketUser.name || socketInRoom.socketUser.email || 'Unknown';
                      console.log(`  - ${userName} (role: ${userRole}, socketId: ${socketId.substring(0, 8)}...)`);
                    }
                  });
                } else {
                  console.log(`⚠️ Room ${roomName} is empty or doesn't exist`);
                }

                // Broadcast to all in room - dispatchers will show it, drivers will filter it
                io.to(roomName).emit("newChatMessage", systemMessage);
                console.log(`✅ Trip status system message emitted to room: ${roomName}`);
              } else {
                console.error(`⚠️ Failed to fetch trip status for driver ${socketUser.name}:`, {
                  message: tripStatusResult.message,
                  dataDriverId: driverId,
                  actualDriverId: actualDriverId,
                  socketUserId: socketUser._id?.toString(),
                  socketUserRole: socketUser.role
                });
              }
            }
          } catch (tripStatusError) {
            console.error('❌ Error fetching trip status:', {
              error: tripStatusError.message,
              stack: tripStatusError.stack,
              dataDriverId: driverId,
              actualDriverId: actualDriverId,
              socketUserId: socketUser._id?.toString(),
              socketUserRole: socketUser.role
            });
            // Don't block message sending if trip status fetch fails
          }
        }
      } catch (error) {
        console.error(`❌ Error sending driver chat message from ${socket.id}:`, error.message);
        socket.emit("error", { message: error.message });
      }
    });

    // Typing indicator for driver chat
    socket.on("driverTyping", (data) => {
      try {
        if (!socketUser) return;

        const { driverId, isTyping } = data;
        if (!driverId) return;

        const roomName = `driver-chat-${driverId}`;
        socket.to(roomName).emit("userTyping", {
          userId: socketUser._id.toString(),
          userName: socketUser.name || socketUser.email || "Unknown",
          driverId,
          isTyping
        });
      } catch (error) {
        console.error(`❌ Error handling driver typing indicator for ${socket.id}:`, error.message);
      }
    });


    // ==================== WEBRTC CALL HANDLERS ====================

    socket.on("call-user", async ({ to, offer }) => {
      const callerRole = socketUser?.role?.toLowerCase();
      const isDriverCalling = callerRole === 'driver';

      if (isDriverCalling) {
        // Driver calling dispatcher — route to company dispatcher room (always joined on auth)
        const companyId = socketCompanyId;
        const callerName = socketUser?.name || 'Driver';
        if (companyId) {
          socket.to(`dispatchers_${companyId}`).emit("incoming-call", {
            from: socket.id,
            offer,
            callerName,
            driverId: socketUser?._id?.toString(),
          });
        }
      } else {
        // Dispatcher calling driver — route to driver's chat room
        socket.to(`driver-chat-${to}`).emit("incoming-call", {
          from: socket.id,
          offer,
          callerName: socketUser?.name || 'Dispatcher',
        });
        // Push notification so driver gets alerted even if screen is off
        try {
          const UserModel = (await import("../models/driver/userModel.js")).User;
          const driver = await UserModel.findById(to).select("expoPushToken name").lean();
          const callerName = socketUser?.name || "Dispatcher";
          if (driver?.expoPushToken) {
            await sendPushToDriver(
              driver.expoPushToken,
              "📞 Incoming Call",
              `${callerName} is calling you`,
              { type: "incoming_call", from: socket.id, callerName, channelId: "logistiq-default" }
            );
          }
        } catch (err) {
          console.error("[Call] Push notification failed:", err.message);
        }
      }
    });

    socket.on("answer-call", ({ to, answer }) => {
      // Route by socket-id first; fall back to driver room for legacy MongoDB-id callers
      if (to) {
        io.to(to).emit("call-answered", { answer, from: socket.id });
      }
    });

    socket.on("call-ice", ({ to, candidate }) => {
      if (to) {
        io.to(to).emit("call-ice", { candidate });
      }
    });

    socket.on("call-end", async ({ to, cancelRinging }) => {
      const callerRole = socketUser?.role?.toLowerCase();
      if (to) {
        // Direct socket-id route (connected calls or post-answer cancels)
        io.to(to).emit("call-ended");
        // Room fallback: covers dispatcher cancelling before answer (to = driver MongoDB _id)
        socket.to(`driver-chat-${to}`).emit("call-ended");
        // If dispatcher cancelled a ringing call, send missed-call push to driver
        if (callerRole !== 'driver') {
          try {
            const UserModel = (await import("../models/driver/userModel.js")).User;
            const driver = await UserModel.findById(to).select("expoPushToken name").lean();
            if (driver?.expoPushToken) {
              await sendPushToDriver(
                driver.expoPushToken,
                '📵 Missed Call',
                `${socketUser?.name || 'Dispatcher'} tried to call you`,
                { type: 'missed_call', channelId: 'logistiq-default' }
              );
            }
          } catch {}
        }
      } else if (cancelRinging) {
        // Driver cancelled a ringing outgoing call before it was answered.
        // Route to the company dispatcher room using server-side auth state.
        if (callerRole === 'driver' && socketCompanyId) {
          socket.to(`dispatchers_${socketCompanyId}`).emit("call-ended");
        }
      }
    });

    socket.on("call-rejected", ({ to }) => {
      if (to) {
        io.to(to).emit("call-rejected");
      }
    });
  });




  // Broadcast all vehicle locations every 5 seconds for compliance GPS
  setInterval(async () => {
    try {
      const { Vehicle } = await import("../models/driver/vehicleModel.js");
      const { updateVehicleByTrackingKey } = await import("../services/samsara.js");

      // Get all vehicles with tracking capability (trackingKey or internalId)
      const vehicles = await Vehicle.find({
        $or: [
          { trackingKey: { $exists: true, $ne: null, $ne: '' } },
          { internalId: { $exists: true, $ne: null, $ne: '' } }
        ]
      })
        .select('_id unitNumber internalId plateNumber licensePlate make model status operationStatus currentLocation speed engineOn trackingKey driverBehaviour engineHealth yard')
        .populate('driver', 'name email phone')
        .populate('yard', 'yardName yardCode coordinates address city stateProvince')
        .lean();

      const vehicleLocations = [];

      // Update each vehicle from Samsara and collect locations
      for (const vehicle of vehicles) {
        try {
          let updatedVehicle = vehicle;

          // Try to update from Samsara if trackingKey exists
          if (vehicle.trackingKey) {
            try {
              const samsaraData = await updateVehicleByTrackingKey(vehicle.trackingKey);
              if (samsaraData && samsaraData.currentLocation) {
                updatedVehicle = { ...vehicle, ...samsaraData };
              }
            } catch (error) {
              // Use cached data if Samsara update fails
            }
          }

          // Determine status
          let status = 'stopped';
          if (updatedVehicle.operationStatus === 'in-transit' || updatedVehicle.operationStatus === 'in_transit') {
            status = 'moving';
          } else if (updatedVehicle.operationStatus === 'idle') {
            status = 'idle';
          } else if (updatedVehicle.status === 'moving' || (updatedVehicle.engineOn && updatedVehicle.speed > 0)) {
            status = 'moving';
          } else if (updatedVehicle.status === 'idle' || (updatedVehicle.engineOn && updatedVehicle.speed === 0)) {
            status = 'idle';
          } else if (updatedVehicle.operationStatus === 'available' || updatedVehicle.status === 'In Service') {
            status = 'active';
          }

          // Check for Samsara location first
          let locationData = null;
          if (updatedVehicle.currentLocation) {
            const lat = parseFloat(updatedVehicle.currentLocation.latitude);
            const lng = parseFloat(updatedVehicle.currentLocation.longitude);

            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
              locationData = {
                latitude: lat,
                longitude: lng,
                address: updatedVehicle.currentLocation.address || '',
                updatedAt: updatedVehicle.currentLocation.updatedAt || updatedVehicle.updatedAt || new Date()
              };
            }
          }

          // If no Samsara location, try yard location
          if (!locationData && updatedVehicle.yard && updatedVehicle.yard.coordinates) {
            const yardLat = parseFloat(updatedVehicle.yard.coordinates.latitude);
            const yardLng = parseFloat(updatedVehicle.yard.coordinates.longitude);

            if (!isNaN(yardLat) && !isNaN(yardLng) && yardLat !== 0 && yardLng !== 0) {
              locationData = {
                latitude: yardLat,
                longitude: yardLng,
                address: `${updatedVehicle.yard.yardName || 'Yard'} - ${updatedVehicle.yard.address || ''}, ${updatedVehicle.yard.city || ''}, ${updatedVehicle.yard.stateProvince || ''}`,
                updatedAt: new Date()
              };
            }
          }

          // Add vehicle to locations if we have any location (Samsara or yard)
          if (locationData) {
            vehicleLocations.push({
              _id: updatedVehicle._id.toString(),
              unitNo: updatedVehicle.unitNumber || updatedVehicle.internalId || updatedVehicle.plateNumber || updatedVehicle._id.toString(),
              internalId: updatedVehicle.internalId || updatedVehicle.unitNumber || '',
              licensePlate: updatedVehicle.plateNumber || updatedVehicle.licensePlate || '',
              makeModel: updatedVehicle.make && updatedVehicle.model
                ? `${updatedVehicle.make} ${updatedVehicle.model}`
                : updatedVehicle.make || updatedVehicle.model || '',
              status: status,
              operationStatus: updatedVehicle.operationStatus || updatedVehicle.status || 'available',
              location: locationData,
              speed: updatedVehicle.speed || 0,
              engineOn: updatedVehicle.engineOn || false,
              engineHours: updatedVehicle.engineHealth?.engineHours || 0,
              driver: updatedVehicle.driver?.name || null,
              yard: updatedVehicle.yard ? {
                _id: updatedVehicle.yard._id?.toString() || updatedVehicle.yard.toString(),
                yardName: updatedVehicle.yard.yardName,
                coordinates: updatedVehicle.yard.coordinates
              } : undefined
            });
          }
        } catch (error) {
          console.warn(`⚠️ Error processing vehicle ${vehicle._id}:`, error.message);
        }
      }

      // Broadcast to all clients in compliance-gps room
      io.to("compliance-gps").emit("vehicleLocationsUpdate", vehicleLocations);

      if (vehicleLocations.length > 0) {
        // console.log(`📍 Broadcasted ${vehicleLocations.length} vehicle locations to compliance GPS clients`);
      }
    } catch (error) {
      console.error('❌ Error broadcasting vehicle locations:', error.message);
    }
  }, 5000); // Every 5 seconds

  // Store global reference
  globalIO = io;

  return io;
};

// Helper function to emit document upload notifications
export const emitDocumentUploadNotification = async (orderData) => {
  console.log('🔔 emitDocumentUploadNotification called with:', orderData);

  if (!globalIO) {
    console.error('❌ Socket.IO not initialized, cannot send document upload notification');
    console.error('❌ globalIO is null/undefined');
    return;
  }

  console.log('✅ globalIO exists, connected clients:', globalIO.engine.clientsCount);

  try {
    const notification = {
      type: 'DOCUMENT_UPLOAD',
      title: 'Driver Documents Uploaded',
      message: `Driver ${orderData.driverName || 'Unknown'} has uploaded POD and Manifest documents for order ${orderData.orderNumber || orderData.orderId}`,
      orderId: orderData.orderId,
      orderNumber: orderData.orderNumber,
      driverName: orderData.driverName,
      timestamp: new Date().toISOString(),
      link: `/admin/dispatch/trips?orderId=${orderData.orderId}`
    };

    console.log('📤 Emitting documentUploadNotification event:', notification);

    // Get all connected sockets
    const sockets = await globalIO.fetchSockets();
    console.log(`📊 Total connected sockets: ${sockets.length}`);

    // Log all socket details for debugging
    for (const socket of sockets) {
      const rooms = Array.from(socket.rooms);
      console.log(`📊 Socket ${socket.id} is in rooms:`, rooms);
      console.log(`📊 Socket ${socket.id} data:`, socket.data);
    }

    // Count dispatchers
    let dispatcherCount = 0;
    const dispatcherRooms = new Set();

    // Emit to all dispatcher rooms (company-specific and global)
    // First, try to get company ID from order if available
    const Order = (await import("../models/orderModel.js")).default;
    let orderCompanyId = null;
    try {
      const order = await Order.findById(orderData.orderId).select('company').lean();
      if (order && order.company) {
        orderCompanyId = order.company.toString();
        const companyDispatcherRoom = `dispatchers_${orderCompanyId}`;
        dispatcherRooms.add(companyDispatcherRoom);
        console.log(`📤 Emitting to company dispatcher room: ${companyDispatcherRoom}`);
        const companyRoomSockets = await globalIO.in(companyDispatcherRoom).fetchSockets();
        console.log(`📊 Company room "${companyDispatcherRoom}" has ${companyRoomSockets.length} socket(s)`);
        if (companyRoomSockets.length > 0) {
          globalIO.to(companyDispatcherRoom).emit('documentUploadNotification', notification);
          console.log(`✅ Emitted to company room: ${companyDispatcherRoom}`);
        } else {
          console.warn(`⚠️ Company room "${companyDispatcherRoom}" is empty, no sockets to emit to`);
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch order company ID:', err.message);
    }

    // Also emit to global dispatchers room (for superadmins and cross-company dispatchers)
    dispatcherRooms.add('dispatchers_all');
    console.log(`📤 Emitting to global dispatcher room: dispatchers_all`);
    const globalRoomSockets = await globalIO.in('dispatchers_all').fetchSockets();
    console.log(`📊 Global room "dispatchers_all" has ${globalRoomSockets.length} socket(s)`);
    if (globalRoomSockets.length > 0) {
      globalIO.to('dispatchers_all').emit('documentUploadNotification', notification);
      console.log(`✅ Emitted to global room: dispatchers_all`);
    } else {
      console.warn(`⚠️ Global room "dispatchers_all" is empty, no sockets to emit to`);
    }

    // Count dispatchers in rooms
    for (const room of dispatcherRooms) {
      const roomSockets = await globalIO.in(room).fetchSockets();
      dispatcherCount += roomSockets.length;
      console.log(`📊 Room "${room}" has ${roomSockets.length} dispatcher(s)`);
    }

    // Also emit to all clients as fallback (for backward compatibility)
    console.log(`📤 Also emitting to ALL clients as fallback (broadcast)`);
    globalIO.emit('documentUploadNotification', notification);
    console.log(`✅ Broadcast emission completed`);

    console.log('✅ Document upload notification emitted successfully!');
    console.log('📢 Notification details:', {
      orderNumber: orderData.orderNumber,
      driver: orderData.driverName,
      orderId: orderData.orderId,
      dispatcherRooms: Array.from(dispatcherRooms),
      estimatedDispatcherCount: dispatcherCount
    });
  } catch (error) {
    console.error('❌ Error sending document upload notification:', error);
    console.error('❌ Error stack:', error.stack);
  }
};

// Helper function to get Socket.IO instance
export const getIO = () => globalIO;
