// services/geotabService.js
import axios from "axios";
import HOSLog from "../models/driver/hosManagement.js";
import { FleetUnit } from "../models/fleet/fleetUnitModel.js";

const DATABASE = process.env.GEO_TAB_DB;
const USERNAME = process.env.GEO_TAB_USER_NAME;
const PASSWORD = process.env.GEO_TAB_PASSWORD;

let cachedSession = null;

export async function authenticate() {

  if (cachedSession && cachedSession.expiry > Date.now()) {

    return cachedSession;

  }

  try {
    const authRes = await axios.post("https://my.geotab.com/apiv1", {
      method: "Authenticate",
      params: { database: DATABASE, userName: USERNAME, password: PASSWORD },
    });

    const credentials = authRes?.data?.result;

    if (!credentials || !credentials.credentials) {
      const errorMsg = authRes?.data?.error?.message || "Authentication failed";
      // console.error(`❌ Geotab authentication failed: ${errorMsg}`);
      throw new Error(`Authentication failed: ${errorMsg}`);
    }

    const { sessionId, userName, database } = credentials.credentials;

    const server = credentials.path === "ThisServer" ? "my.geotab.com" : credentials.path;

    cachedSession = { sessionId, userName, database, server, expiry: Date.now() + 15 * 60 * 1000 };

    return cachedSession;
  } catch (error) {
    // console.error('❌ Geotab authentication error:', error.message);
    throw error;
  }
}

// DEPRECATED: Use updateFleetUnitById instead. Keeping for backward compatibility only.
// This function now delegates to updateFleetUnitById for FleetUnit with unitType="Truck"
export async function updateVehicleById(internalId) {
  console.warn('⚠️ updateVehicleById is deprecated. Use updateFleetUnitById instead.');
  // Delegate to updateFleetUnitById for trucks
  return await updateFleetUnitById(internalId);
}

// DEPRECATED: Use updateFleetUnitById instead. Keeping for backward compatibility only.
// This function now delegates to updateFleetUnitById for FleetUnit with unitType!="Truck"
export async function updateTrailerById(internalId) {
  console.warn('⚠️ updateTrailerById is deprecated. Use updateFleetUnitById instead.');
  // Delegate to updateFleetUnitById for trailers (non-truck FleetUnits)
  return await updateFleetUnitById(internalId);
}

// Fetch vehicles from Geotab
export async function fetchGeotabVehicles() {
  const session = await authenticate();

  const res = await axios.post(`https://${session.server}/apiv1`, {
    method: "Get",
    params: { typeName: "Device" },
  }, {
    headers: { "Geotab-SessionId": session.sessionId }
  });

  return res.data?.result || [];
}

// Update FleetUnits in MongoDB from Geotab
// DEPRECATED: This function is kept for backward compatibility but now updates FleetUnit model
export async function updateVehiclesInDB() {
  console.warn('⚠️ updateVehiclesInDB is deprecated. Consider using FleetUnit sync directly.');
  const geotabVehicles = await fetchGeotabVehicles();
  const fleetUnitData = [];

  for (const gv of geotabVehicles) {
    // Update FleetUnit instead of Vehicle
    // Try to find existing FleetUnit by internalId
    const existingFleetUnit = await FleetUnit.findOne({ internalId: gv.id }).lean();
    
    // Determine unitType based on existing data or default to "Truck"
    const unitType = existingFleetUnit?.unitType || "Truck";

    const updatedFleetUnit = await FleetUnit.findOneAndUpdate(
      { internalId: gv.id },
      {
        status: gv.status || "stopped",
        speed: gv.speed || 0,
        engineOn: gv.engineOn || false,
        currentLocation: {
          latitude: gv.latitude || 0,
          longitude: gv.longitude || 0,
          address: gv.address || "",
          updatedAt: new Date(),
        },
        // Preserve unitType if FleetUnit exists, otherwise default to Truck
        ...(existingFleetUnit ? {} : { unitType }),
      },
      { upsert: false, new: true } // Don't upsert - FleetUnit must exist first
    );
    
    if (updatedFleetUnit) {
      fleetUnitData.push(updatedFleetUnit);
    }
  }

  return fleetUnitData;
}

/** Fetch latest status bundle for a vehicle */
export async function fetchVehicleData(vehicleId, sessionOverride = null) {
  const session = sessionOverride || await authenticate();
  const { sessionId, userName, database, server } = session;

  // Latest log (location + speed)
  const locationRes = await axios.post(`https://${server}/apiv1`, {
    method: "Get",
    params: {
      typeName: "LogRecord",
      search: { deviceSearch: { id: vehicleId } },
      resultsLimit: 1,
      credentials: { database, sessionId, userName },
    },
  });

  const latestLog = locationRes?.data?.result?.[0] || {};

  // StatusData (fuel, idling, harsh braking, etc.)
  const statusRes = await axios.post(`https://${server}/apiv1`, {
    method: "Get",
    params: {
      typeName: "StatusData",
      search: { deviceSearch: { id: vehicleId }, fromDate: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() },
      resultsLimit: 50,
      credentials: { database, sessionId, userName },
    },
  });

  const statusData = statusRes?.data?.result || [];

  // Fault data (engine health)
  const faultRes = await axios.post(`https://${server}/apiv1`, {
    method: "Get",
    params: {
      typeName: "FaultData",
      search: { deviceSearch: { id: vehicleId } },
      resultsLimit: 10,
      credentials: { database, sessionId, userName },
    },
  });

  const faults = faultRes?.data?.result || [];

  // Trip history (last 1 trip)
  const tripRes = await axios.post(`https://${server}/apiv1`, {
    method: "Get",
    params: {
      typeName: "Trip",
      search: { deviceSearch: { id: vehicleId }, fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
      resultsLimit: 1,
      credentials: { database, sessionId, userName },
    },
  });

  const trips = tripRes?.data?.result || [];

  // Extract metrics
  const driverBehaviour = {

    harshBraking: statusData.filter((s) => s.diagnostic?.name?.includes("Braking")).length,
    speedingEvents: statusData.filter((s) => s.diagnostic?.name?.includes("Speed")).length,
    idlingDuration: statusData
      .filter((s) => s.diagnostic?.name?.includes("Idling"))
      .reduce((sum, s) => sum + (s.data || 0), 0),
  };

  const parseNumeric = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const num = typeof value === "number" ? value : parseFloat(value);
    return Number.isFinite(num) ? num : null;
  };

  const fuelStatusCandidates = statusData.filter(
    (s) => s?.diagnostic?.name && s.diagnostic.name.toLowerCase().includes("fuel")
  );
  const fuelPercentStatus = fuelStatusCandidates.find((s) => {
    const name = s.diagnostic?.name?.toLowerCase() || "";
    const unit = s.diagnostic?.unitOfMeasure?.name?.toLowerCase() || "";
    return name.includes("percent") || unit.includes("percent");
  });
  const fuelVolumeStatus = fuelStatusCandidates.find((s) => {
    const name = s.diagnostic?.name?.toLowerCase() || "";
    const unit = s.diagnostic?.unitOfMeasure?.name?.toLowerCase() || "";
    return (
      name.includes("litre") ||
      name.includes("liter") ||
      unit.includes("litre") ||
      unit.includes("liter")
    );
  });

  const fuelLevelPercent =
    parseNumeric(fuelPercentStatus?.data) ??
    parseNumeric(fuelStatusCandidates[0]?.data) ??
    null;
  const fuelLevelLiters = parseNumeric(fuelVolumeStatus?.data);

  const engineHealth = {
    faultCodes: faults.map((f) => ({ code: f.code, description: f.diagnostic?.name })),
    batteryVoltage: statusData.find((s) => s.diagnostic?.name?.includes("Battery"))?.data || 12,
    engineHours: statusData.find((s) => s.diagnostic?.name?.includes("Engine Hours"))?.data || 0,
  };

  return {
    currentLocation: {
      latitude: latestLog.latitude || null,
      longitude: latestLog.longitude || null,
      address: "", // optionally use Google Maps API reverse geocode
      updatedAt: latestLog.dateTime || new Date(),
    },
    speed: latestLog.speed || 0,
    fuelLevel: fuelLevelPercent ?? 0,
    fuelLevelLiters,
    odometer: statusData.find((s) => s.diagnostic?.name?.includes("Odometer"))?.data || 0,
    engineOn: !!statusData.find((s) => s.diagnostic?.name?.includes("Engine On")),

    driverBehaviour,
    engineHealth,
    trips: trips.map((t) => ({
      startTime: t.start,
      endTime: t.stop,
      route: t.waypoints?.map((wp) => ({
        latitude: wp.latitude,
        longitude: wp.longitude,
        timestamp: wp.dateTime,
      })),
    })),
  };
}


/** Fetch HOS / Duty Status of a driver */
export async function fetchDriverHOS(driverId) {
  const { sessionId, userName, database, server } = await authenticate();

  // Get duty logs
  const res = await axios.post(`https://${server}/apiv1`, {
    method: "Get",
    params: {
      typeName: "DutyStatusLog",
      search: { user: driverId },
      resultsLimit: 50, // last 50 logs
      credentials: { database, sessionId, userName },
    },
  });

  const logs = res?.data?.result || [];

  // Calculate total hours
  let totalDrivingHours = 0,
    totalOnDutyHours = 0,
    totalOffDutyHours = 0;

  logs.forEach((log) => {
    const duration = (new Date(log.endTime) - new Date(log.startTime)) / (1000 * 60 * 60);
    if (log.status === "Driving") totalDrivingHours += duration;
    else if (log.status === "OnDuty") totalOnDutyHours += duration;
    else if (log.status === "OffDuty") totalOffDutyHours += duration;
  });

  const violation = totalDrivingHours > 13; // Canada HOS rule

  return {
    driverId,
    totalDrivingHours,
    totalOnDutyHours,
    totalOffDutyHours,
    violation,
    logs: logs.map((l) => ({
      status: l.status,
      startTime: l.startTime,
      endTime: l.endTime,
    })),
  };
}

export async function fetchAndSaveDriverHOS(driverId, vehicleId = null) {
  const hos = await fetchDriverHOS(driverId); // your existing Geotab fetch function

  // Prepare log for today
  const today = new Date();
  
  today.setHours(0, 0, 0, 0);

  // Upsert (update if exists, insert if not)
  const savedLog = await HOSLog.findOneAndUpdate(
    { driverId, date: today },
    {
      driverId,
      vehicleId,
      date: today,
      totalDrivingHours: hos.totalDrivingHours,
      totalOnDutyHours: hos.totalOnDutyHours,
      totalOffDutyHours: hos.totalOffDutyHours,
      violations: hos.violation,
      logs: hos.logs,
    },
    { upsert: true, new: true }
  );

  return savedLog;
}

// Fetch single FleetUnit status from Geotab and update MongoDB
export async function updateFleetUnitById(internalId) {
  const session = await authenticate();

  const res = await axios.post(
    `https://${session.server}/apiv1`,
    {
      method: "Get",
      params: { typeName: "Device", search: { id: internalId } },
    },
    { headers: { "Geotab-SessionId": session.sessionId } }
  );

  const gv = res.data?.result?.[0];
  if (!gv) return null;

  let telemetryData = null;
  try {
    telemetryData = await fetchVehicleData(internalId, session);
  } catch (telemetryError) {
    // console.error(`❌ Error fetching telemetry for FleetUnit ${internalId}:`, telemetryError.message);
  }

  const locationFromTelemetry = telemetryData?.currentLocation ?? {
    latitude: gv.latitude || 0,
    longitude: gv.longitude || 0,
    address: gv.address || "",
    updatedAt: new Date(),
  };

  // Map Geotab status to operationStatus
  const geotabStatus = gv.status || "stopped";
  let operationStatus = "available";
  if (geotabStatus === "moving") {
    operationStatus = "in-transit";
  } else if (geotabStatus === "idle") {
    operationStatus = "idle";
  } else if (geotabStatus === "maintenance") {
    operationStatus = "maintenance";
  }

  // Use the location directly (already formatted as strings)
  const location = {
    latitude: locationFromTelemetry.latitude,
    longitude: locationFromTelemetry.longitude,
    address: locationFromTelemetry.address,
    updatedAt: locationFromTelemetry.updatedAt,
  };

  const updatePayload = {
    operationStatus: operationStatus,
    speed: telemetryData?.speed ?? gv.speed ?? 0,
    engineOn: telemetryData?.engineOn ?? gv.engineOn ?? false,
    fuelLevel: telemetryData?.fuelLevel ?? gv.fuelLevel ?? 0,
    currentOdometer: telemetryData?.odometer ?? gv.odometer ?? 0,
    odometer: telemetryData?.odometer ?? gv.odometer ?? 0, // Keep both for compatibility
    driverBehaviour: telemetryData?.driverBehaviour ?? gv.driverBehaviour ?? {},
    engineHealth: telemetryData?.engineHealth ?? gv.engineHealth ?? {},
    currentLocation: location,
  };

  const updatedFleetUnitDoc = await FleetUnit.findOneAndUpdate(
    { internalId },
    updatePayload,
    { upsert: false, new: true } // Don't upsert - FleetUnit must exist first
  );

  if (!updatedFleetUnitDoc) {
    console.warn(`⚠️ FleetUnit with internalId ${internalId} not found in database`);
    return null;
  }

  const updatedFleetUnit =
    typeof updatedFleetUnitDoc.toObject === "function"
      ? updatedFleetUnitDoc.toObject()
      : updatedFleetUnitDoc;

  const fuelLevelPercent =
    telemetryData?.fuelLevel ?? updatedFleetUnit.fuelLevel ?? 0;

  updatedFleetUnit.fuelLevel = fuelLevelPercent;
  updatedFleetUnit.fuelLevelPercentage = fuelLevelPercent;
  updatedFleetUnit.fuelLevelLitres = telemetryData?.fuelLevelLiters ?? null;
  updatedFleetUnit.fuelLevelLiters = telemetryData?.fuelLevelLiters ?? null;
  updatedFleetUnit.fuel = {
    percentage: fuelLevelPercent,
    liters: telemetryData?.fuelLevelLiters ?? null,
    updatedAt: locationFromTelemetry?.updatedAt ?? new Date(),
  };

  // Map operationStatus to status for compatibility with existing code
  updatedFleetUnit.status = operationStatus === "in-transit" ? "moving" : 
                           operationStatus === "maintenance" ? "maintenance" :
                           operationStatus === "idle" ? "idle" : "stopped";

  // Add plateNumber for compatibility
  updatedFleetUnit.plateNumber = updatedFleetUnit.licensePlate;

  return updatedFleetUnit;
}

// Initialize locations for all FleetUnits that don't have location data
// This will set default location structure for all vehicles
export async function initializeAllFleetUnitLocations() {
  try {
    // console.log('🔄 Initializing locations for all FleetUnits...');
    
    // Find all FleetUnits
    const allFleetUnits = await FleetUnit.find({}).lean();

    if (!allFleetUnits || allFleetUnits.length === 0) {
      // console.log('⚠️ No FleetUnits found');
      return {
        success: true,
        total: 0,
        initialized: 0,
        skipped: 0,
        message: 'No FleetUnits found'
      };
    }

    // console.log(`📊 Found ${allFleetUnits.length} FleetUnits`);

    let initialized = 0;
    let skipped = 0;

    // Initialize location for each FleetUnit that doesn't have proper location data
    for (const unit of allFleetUnits) {
      try {
        const needsInitialization = 
          !unit.currentLocation ||
          !unit.currentLocation.latitude ||
          !unit.currentLocation.longitude ||
          unit.currentLocation.latitude === "0" ||
          unit.currentLocation.longitude === "0" ||
          !unit.currentLocation.address;

        if (needsInitialization) {
          // Set default location structure
          await FleetUnit.findByIdAndUpdate(unit._id, {
            currentLocation: {
              address: unit.currentLocation?.address || "",
              latitude: unit.currentLocation?.latitude || "0",
              longitude: unit.currentLocation?.longitude || "0",
              updatedAt: new Date()
            }
          }, { new: true });
          initialized++;
          // console.log(`✅ Initialized location for FleetUnit: ${unit.unitNo}`);
        } else {
          skipped++;
        }
      } catch (error) {
        // console.error(`❌ Error initializing location for FleetUnit ${unit.unitNo}:`, error.message);
      }
    }

    // console.log(`✅ Location initialization completed: ${initialized} initialized, ${skipped} skipped`);

    return {
      success: true,
      total: allFleetUnits.length,
      initialized,
      skipped
    };
  } catch (error) {
    // console.error('❌ Error in location initialization:', error);
    return {
      success: false,
      total: 0,
      initialized: 0,
      skipped: 0,
      error: error.message
    };
  }
}