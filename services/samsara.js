// services/samsara.js
// Samsara API Integration Service
import axios from "axios";
import { FleetUnit } from "../models/fleet/fleetUnitModel.js";
import { Vehicle } from "../models/driver/vehicleModel.js";
import { CompanySettings } from "../models/driver/companysettingsModel.js";

// Fallback to env variables if company settings not available
const SAMSARA_API_BASE_URL = process.env.SAMSARA_API_BASE_URL || "https://api.samsara.com";
const SAMSARA_API_TOKEN = process.env.SAMSARA_API_TOKEN;

// Cache tokens per company
const tokenCache = new Map(); // companyId -> { token, expiry }
let lastAuthError = null;
let authErrorCount = 0;
const MAX_AUTH_ERROR_LOGS = 5; // Only log auth errors every 5 attempts to reduce spam

// Cache for failed vehicle tracking attempts to prevent spam
const failedTrackingAttempts = new Map(); // trackingKey -> { lastAttempt: timestamp, count: number }
const FAILED_TRACKING_CACHE_TIME = 60000; // Skip updates for 60 seconds after consecutive failures
const MAX_FAILED_ATTEMPTS = 3; // After 3 failures, skip for cache time

/**
 * Get Samsara API credentials from company settings or fallback to env
 * @param {string} companyId - Company ID to fetch credentials for
 * @returns {Promise<{apiBaseUrl: string, apiToken: string}>}
 */
async function getSamsaraCredentials(companyId = null) {
  // If companyId provided, fetch from company settings
  if (companyId) {
    try {
      const companySettings = await CompanySettings.findById(companyId)
        .select('samsaraConfig')
        .lean();
      
      if (companySettings?.samsaraConfig?.apiToken && companySettings?.samsaraConfig?.apiBaseUrl) {
        return {
          apiBaseUrl: companySettings.samsaraConfig.apiBaseUrl,
          apiToken: companySettings.samsaraConfig.apiToken
        };
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching Samsara credentials for company ${companyId}:`, error.message);
    }
  }
  
  // Fallback to environment variables
  if (SAMSARA_API_TOKEN) {
    return {
      apiBaseUrl: SAMSARA_API_BASE_URL,
      apiToken: SAMSARA_API_TOKEN
    };
  }
  
  // No credentials found
  return null;
}

/**
 * Authenticate with Samsara API
 * Samsara uses API tokens (no OAuth needed for basic API access)
 * @param {string} companyId - Optional company ID to fetch credentials from company settings
 */
export async function authenticate(companyId = null) {
  // Check cache first
  const cacheKey = companyId || 'default';
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.token;
  }

  // Get credentials from company settings or env
  const credentials = await getSamsaraCredentials(companyId);
  
  if (!credentials || !credentials.apiToken) {
    // Only log this once every 60 seconds to avoid spam
    const now = Date.now();
    if (!lastAuthError || (now - lastAuthError) > 60000) {
      if (companyId) {
        console.error(`❌ Samsara API credentials not configured for company ${companyId}!`);
        console.error("   Please configure Samsara API credentials in company settings.");
      } else {
        console.error("❌ SAMSARA_API_TOKEN environment variable is not set!");
        console.error("   Please set it in your .env file or configure in company settings.");
      }
      lastAuthError = now;
    }
    throw new Error(companyId 
      ? "Samsara API credentials not configured for this company" 
      : "SAMSARA_API_TOKEN environment variable is not set");
  }

  // Cache the token
  const token = credentials.apiToken;
  tokenCache.set(cacheKey, {
    token: token,
    expiry: Date.now() + (24 * 60 * 60 * 1000) // Cache for 24 hours
  });

  return token;
}

/**
 * Make authenticated API call to Samsara
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {object} params - Request parameters
 * @param {string} companyId - Optional company ID to use company-specific credentials
 */
async function samsaraApiCall(endpoint, method = "GET", params = {}, companyId = null) {
  try {
    const token = await authenticate(companyId);
    const credentials = await getSamsaraCredentials(companyId);
    
    if (!token || !credentials) {
      // Only log token missing error once or every 10 attempts to reduce spam
      authErrorCount++;
      if (authErrorCount === 1 || authErrorCount % 10 === 0) {
        if (companyId) {
          console.error(`❌ Samsara API credentials not configured for company ${companyId}.`);
        } else {
          console.error("❌ Samsara API Token is missing or invalid. Please check SAMSARA_API_TOKEN environment variable.");
        }
      }
      throw new Error("Samsara API token is not configured");
    }
    
    // Reset auth error count if we have a valid token
    if (authErrorCount > 0) {
      authErrorCount = 0;
      lastAuthError = null;
    }
    
    const config = {
      method,
      url: `${credentials.apiBaseUrl}${endpoint}`,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      timeout: 10000 // 10 second timeout
    };

    if (method === "GET") {
      config.params = params;
    } else {
      config.data = params;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
    const statusCode = error.response?.status;
    
    // Handle specific error cases
    if (statusCode === 401) {
      authErrorCount++;
      const errorKey = `401-${endpoint}`;
      const now = Date.now();
      
      // Only log auth errors occasionally to reduce spam (once every 30 seconds per endpoint, or first 5 times)
      const shouldLog = !lastAuthError || 
                        (now - lastAuthError) > 30000 || 
                        authErrorCount <= MAX_AUTH_ERROR_LOGS;
      
      if (shouldLog) {
        // console.error(`❌ Samsara API Authentication Failed (401 Unauthorized): Invalid or expired API token for endpoint ${endpoint}`);
        // console.error(`   expired.`);
        // console.error(`   Error count: ${authErrorCount} (will only log occasionally to reduce spam)`);
        if (authErrorCount > MAX_AUTH_ERROR_LOGS) {
          console.error(`   ⚠️ Suppressing repeated auth errors. Please fix SAMSARA_API_TOKEN in environment variables.`);
        }
        lastAuthError = now;
      }
    } else if (statusCode === 403) {
      console.error(`❌ Samsara API Forbidden (403): Token does not have permission to access endpoint ${endpoint}`);
    } else if (statusCode === 404) {
      // Vehicle not found in Samsara - this is expected for vehicles that don't exist
      // console.warn(`⚠️ Vehicle not found in Samsara (404) for endpoint: ${endpoint}`);
      return null;
    } else if (statusCode === 429) {
      console.warn(`⚠️ Samsara API Rate Limit (429): Too many requests. Please wait before retrying.`);
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error(`❌ Samsara API Connection Error: Cannot connect to Samsara API. Check network connectivity and SAMSARA_API_BASE_URL.`);
    } else if (error.message === "Samsara API token is not configured") {
      // Already logged above
      throw error;
    } else {
      console.error(`❌ Samsara API call failed (${method} ${endpoint}):`, errorMessage);
    }
    
    // Don't throw for 404s - return null instead (vehicle doesn't exist in Samsara)
    if (statusCode === 404) {
      return null;
    }
    
    throw error;
  }
}

/**
 * Fetch all vehicles from Samsara
 * @param {string} companyId - Optional company ID to use company-specific credentials
 */
export async function fetchSamsaraVehicles(companyId = null) {
  try {
    const response = await samsaraApiCall("/v1/fleet/vehicles", "GET", {}, companyId);
    return response.data || [];
  } catch (error) {
    // console.error("Error fetching Samsara vehicles:", error.message);
    return [];
  }
}

/**
 * Fetch vehicle location and telemetry data from Samsara
 * @param {string} vehicleId - Vehicle ID in Samsara
 * @param {string} companyId - Optional company ID to use company-specific credentials
 */
export async function fetchVehicleData(vehicleId, companyId = null) {
  try {
    // Get vehicle location - Samsara API endpoint
    const locationResponse = await samsaraApiCall(`/v1/fleet/vehicles/${vehicleId}/locations`, "GET", {
      startTime: new Date(Date.now() - 5 * 60 * 1000).toISOString() // Last 5 minutes
    }, companyId);

    // Get vehicle stats (fuel, engine, odometer, etc.)
    const statsResponse = await samsaraApiCall(`/v1/fleet/vehicles/stats`, "GET", {
      vehicleIds: vehicleId,
      types: "engineState,fuelPerc,obdOdometerMeters",
      startTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() // Last hour
    }, companyId);

    // Get safety events (harsh braking, speeding, etc.)
    const safetyResponse = await samsaraApiCall(`/v1/fleet/vehicles/${vehicleId}/safety/events`, "GET", {
      startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24 hours
      types: "harshBraking,harshAcceleration,harshTurning,speeding"
    }, companyId);

    // Check if all API calls failed
    if (!locationResponse && !statsResponse) {
      console.warn(`⚠️ Both location and stats API calls failed for vehicleId: ${vehicleId}`);
      console.warn(`   Possible reasons: Vehicle not found in Samsara, invalid trackingKey, or Samsara token issue.`);
      return null;
    }

    const locations = locationResponse?.data || [];
    const latestLocation = locations.length > 0 ? locations[locations.length - 1] : null;
    
    const stats = statsResponse?.data || [];
    const latestStats = stats.length > 0 ? stats[stats.length - 1] : null;

    const safetyEvents = safetyResponse?.data || [];

    // Extract location data
    const location = latestLocation?.location || {};
    const latitude = location.latitude || null;
    const longitude = location.longitude || null;
    const address = location.address || "";

    // Extract speed - Samsara provides speed in different formats
    let speed = 0;
    if (latestLocation) {
      if (latestLocation.speedMilesPerHour !== undefined) {
        speed = Math.round(latestLocation.speedMilesPerHour * 1.60934); // Convert MPH to km/h
      } else if (latestLocation.speedKilometersPerHour !== undefined) {
        speed = Math.round(latestLocation.speedKilometersPerHour);
      } else if (latestLocation.speed !== undefined) {
        speed = Math.round(latestLocation.speed);
      }
    }

    // Extract fuel level from stats
    let fuelLevel = 0;
    let fuelLevelLiters = null;
    if (latestStats && latestStats.engineStates) {
      const fuelData = latestStats.engineStates.find(s => s.name === "fuelPerc" || s.name === "fuelPercent");
      if (fuelData) {
        fuelLevel = fuelData.value || 0;
      }
    }

    // Extract odometer
    let odometer = 0;
    if (latestStats) {
      if (latestStats.obdOdometerMeters !== undefined) {
        odometer = Math.round(latestStats.obdOdometerMeters / 1000); // Convert meters to km
      } else if (latestStats.obdOdometerKilometers !== undefined) {
        odometer = Math.round(latestStats.obdOdometerKilometers);
      }
    }

    // Extract engine state
    const engineOn = latestStats?.engineStates?.some(s => 
      (s.name === "engineState" || s.name === "engineOn") && (s.value === "on" || s.value === true)
    ) || false;

    // Extract driver behavior from safety events
    const driverBehaviour = {
      harshBraking: safetyEvents.filter(e => 
        e.harshEventType?.type === "Harsh Braking" || e.harshEventType?.type === "harshBraking"
      ).length,
      speedingEvents: safetyEvents.filter(e => 
        e.harshEventType?.type === "Speeding" || e.harshEventType?.type === "speeding"
      ).length,
      idlingDuration: 0 // Samsara doesn't provide idling duration in this format, would need separate query
    };

    // Extract engine health (Samsara provides fault codes differently)
    const engineHealth = {
      faultCodes: [], // Samsara fault codes would need separate API call to /v1/fleet/vehicles/{id}/fault_codes
      batteryVoltage: 12, // Default, would need separate API call
      engineHours: 0 // Would need separate API call
    };

    return {
      currentLocation: {
        latitude: latitude?.toString() || "0",
        longitude: longitude?.toString() || "0",
        address: address,
        updatedAt: latestLocation?.time || latestLocation?.timeMs || new Date()
      },
      speed: speed,
      fuelLevel: fuelLevel,
      fuelLevelLiters: fuelLevelLiters,
      odometer: odometer,
      engineOn: engineOn,
      driverBehaviour: driverBehaviour,
      engineHealth: engineHealth
    };
  } catch (error) {
    // More detailed error logging for debugging
    if (error.message && (error.message.includes("token") || error.message.includes("401"))) {
      // console.error(`❌ Samsara Authentication Error when fetching vehicle ${vehicleId}:`, error.message);
    } else if (error.message && error.message.includes("404")) {
      // console.warn(`⚠️ Vehicle ${vehicleId} not found in Samsara. Check if trackingKey matches Samsara vehicle ID.`);
    } else {
      // console.error(`❌ Error fetching Samsara vehicle data for ${vehicleId}:`, error.message || error);
    }
    return null;
  }
}

/**
 * Fetch HOS (Hours of Service) data from Samsara for a vehicle using trackingKey
 * @param {string} trackingKey - Vehicle tracking key
 * @param {string} startTime - Start time for HOS query
 * @param {string} endTime - End time for HOS query
 * @param {string} companyId - Optional company ID to use company-specific credentials
 */
export async function fetchVehicleHOS(trackingKey, startTime = null, endTime = null, companyId = null) {
  try {
    if (!trackingKey) {
      // console.warn(`⚠️ fetchVehicleHOS: trackingKey is empty or null`);
      return null;
    }

    // Default to last 7 days if no date range provided
    if (!startTime || !endTime) {
      endTime = new Date().toISOString();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      startTime = start.toISOString();
    }

    // Samsara HOS API endpoint - using vehicle ID (trackingKey) to fetch HOS logs
    // Samsara uses POST for HOS queries with body parameters
    const endpoint = `/v1/fleet/hos/daily_logs`;
    
    const requestBody = {
      driverIds: [], // We'll fetch by vehicle, not driver
      vehicleIds: [trackingKey], // Use trackingKey as vehicle ID
      startTime: startTime,
      endTime: endTime
    };

    const response = await samsaraApiCall(endpoint, "POST", requestBody, companyId);
    
    if (!response || !response.data || !Array.isArray(response.data)) {
      return null;
    }

    // Process Samsara HOS logs - response.data is an array of daily logs
    const logs = response.data || [];
    let totalDrivingHours = 0;
    let totalOnDutyHours = 0;
    let totalOffDutyHours = 0;
    const hosLogs = [];

    // Process each daily log entry
    logs.forEach((dailyLog) => {
      // Samsara daily logs contain an array of duty status changes
      if (dailyLog.dutyStatuses && Array.isArray(dailyLog.dutyStatuses)) {
        dailyLog.dutyStatuses.forEach((statusChange) => {
          const startTime = new Date(statusChange.startTime || statusChange.startMs);
          const endTime = new Date(statusChange.endTime || statusChange.endMs);
          const duration = (endTime - startTime) / (1000 * 60 * 60); // Convert to hours

          // Map Samsara duty status to our format
          let status = 'OffDuty';
          const dutyStatus = statusChange.dutyStatus || statusChange.status || '';
          
          if (dutyStatus.toLowerCase() === 'driving' || dutyStatus.toLowerCase() === 'drive') {
            status = 'Driving';
            totalDrivingHours += duration;
          } else if (dutyStatus.toLowerCase() === 'onduty' || dutyStatus.toLowerCase() === 'on_duty' || dutyStatus.toLowerCase() === 'ondutynotdriving') {
            status = 'OnDuty';
            totalOnDutyHours += duration;
          } else {
            status = 'OffDuty';
            totalOffDutyHours += duration;
          }

          hosLogs.push({
            status: status,
            startTime: startTime,
            endTime: endTime
          });
        });
      } else if (dailyLog.logs && Array.isArray(dailyLog.logs)) {
        // Alternative structure - logs array
        dailyLog.logs.forEach((log) => {
          const startTime = new Date(log.startTime || log.startMs);
          const endTime = new Date(log.endTime || log.endMs);
          const duration = (endTime - startTime) / (1000 * 60 * 60);

          let status = 'OffDuty';
          const dutyStatus = log.dutyStatus || log.status || '';
          
          if (dutyStatus.toLowerCase() === 'driving' || dutyStatus.toLowerCase() === 'drive') {
            status = 'Driving';
            totalDrivingHours += duration;
          } else if (dutyStatus.toLowerCase() === 'onduty' || dutyStatus.toLowerCase() === 'on_duty' || dutyStatus.toLowerCase() === 'ondutynotdriving') {
            status = 'OnDuty';
            totalOnDutyHours += duration;
          } else {
            status = 'OffDuty';
            totalOffDutyHours += duration;
          }

          hosLogs.push({
            status: status,
            startTime: startTime,
            endTime: endTime
          });
        });
      }
    });

    // Check for violations (11-hour driving limit, 14-hour on-duty limit, 70-hour limit)
    const violation = totalDrivingHours > 11 || (totalDrivingHours + totalOnDutyHours) > 14 || 
                      (totalDrivingHours + totalOnDutyHours) > 70;

    return {
      trackingKey,
      totalDrivingHours,
      totalOnDutyHours,
      totalOffDutyHours,
      violation,
      logs: hosLogs
    };
  } catch (error) {
    console.error(`❌ Error fetching HOS data from Samsara for trackingKey ${trackingKey}:`, error.message);
    return null;
  }
}

/**
 * Fetch and save HOS data from Samsara for a driver/vehicle
 * @param {string} driverId - Driver ID
 * @param {string} vehicleId - Optional vehicle ID
 * @param {string} trackingKey - Optional tracking key
 * @param {string} companyId - Optional company ID to use company-specific credentials
 */
export async function fetchAndSaveDriverHOSFromSamsara(driverId, vehicleId = null, trackingKey = null, companyId = null) {
  try {
    // If trackingKey not provided, try to get it from vehicle
    if (!trackingKey && vehicleId) {
      const Vehicle = (await import("../models/driver/vehicleModel.js")).Vehicle;
      const vehicle = await Vehicle.findById(vehicleId).select('trackingKey company').lean();
      if (vehicle && vehicle.trackingKey) {
        trackingKey = vehicle.trackingKey;
        // Use vehicle's company if companyId not provided
        if (!companyId && vehicle.company) {
          companyId = vehicle.company.toString();
        }
      } else {
        // console.warn(`⚠️ No trackingKey found for vehicle ${vehicleId}`);
        return null;
      }
    }

    if (!trackingKey) {
      // console.warn(`⚠️ fetchAndSaveDriverHOSFromSamsara: No trackingKey provided`);
      return null;
    }

    // Get companyId from driver if still not set
    if (!companyId && driverId) {
      const User = (await import("../models/driver/userModel.js")).User;
      const driver = await User.findById(driverId).select('company').lean();
      if (driver?.company) {
        companyId = driver.company.toString();
      }
    }

    // Fetch HOS data from Samsara
    const hos = await fetchVehicleHOS(trackingKey, null, null, companyId);
    
    if (!hos) {
      return null;
    }

    // Import HOSLog model
    const HOSLog = (await import("../models/driver/hosManagement.js")).default;
    const { getUserCompanyId } = await import("../utils/companyFilter.js");

    // Prepare log for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // companyId already determined above

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
        company: companyId
      },
      { upsert: true, new: true }
    );

    return savedLog;
  } catch (error) {
    console.error(`❌ Error fetching and saving HOS from Samsara:`, error.message);
    return null;
  }
}

/**
 * Update Vehicle from Samsara using trackingKey and update MongoDB
 * @param {string} trackingKey - Vehicle tracking key
 * @param {string} companyId - Optional company ID to use company-specific credentials
 */
export async function updateVehicleByTrackingKey(trackingKey, companyId = null) {
  try {
    if (!trackingKey) {
      // console.warn(`⚠️ updateVehicleByTrackingKey: trackingKey is empty or null`);
      return null;
    }

    // Get companyId from vehicle if not provided
    if (!companyId) {
      const vehicle = await Vehicle.findOne({ trackingKey }).select('company').lean();
      if (vehicle?.company) {
        companyId = vehicle.company.toString();
      }
    }

    // Check if we should skip this trackingKey due to recent failures
    const failedAttempt = failedTrackingAttempts.get(trackingKey);
    if (failedAttempt) {
      const timeSinceLastAttempt = Date.now() - failedAttempt.lastAttempt;
      if (failedAttempt.count >= MAX_FAILED_ATTEMPTS && timeSinceLastAttempt < FAILED_TRACKING_CACHE_TIME) {
        // Skip this update - too many recent failures
        return null;
      }
      // Reset if enough time has passed
      if (timeSinceLastAttempt >= FAILED_TRACKING_CACHE_TIME) {
        failedTrackingAttempts.delete(trackingKey);
      }
    }

    // Fetch vehicle data from Samsara using trackingKey
    const vehicleData = await fetchVehicleData(trackingKey, companyId);
    
    if (!vehicleData) {
      // Track failed attempt
      const failedAttempt = failedTrackingAttempts.get(trackingKey) || { count: 0, lastAttempt: 0 };
      failedAttempt.count += 1;
      failedAttempt.lastAttempt = Date.now();
      failedTrackingAttempts.set(trackingKey, failedAttempt);
      
      // Only log if not cached/suppressed
      if (failedAttempt.count <= MAX_FAILED_ATTEMPTS) {
        // console.warn(`⚠️ No vehicle data returned from Samsara for trackingKey: ${trackingKey}. Vehicle may not exist in Samsara or token may be invalid.`);
      }
      return null;
    }

    // Success - clear failed attempts cache for this trackingKey
    if (failedTrackingAttempts.has(trackingKey)) {
      failedTrackingAttempts.delete(trackingKey);
    }

    // Find Vehicle by trackingKey
    const vehicle = await Vehicle.findOne({ trackingKey }).lean();
    
    if (!vehicle) {
      // console.warn(`⚠️ Vehicle with trackingKey "${trackingKey}" not found in MongoDB database.`);
      return null;
    }

    // Map Samsara status to operationStatus
    let operationStatus = "IN SERVICE";
    if (vehicleData.engineOn && vehicleData.speed > 0) {
      operationStatus = "in_transit";
    } else if (vehicleData.engineOn && vehicleData.speed === 0) {
      operationStatus = "idle";
    } else {
      operationStatus = "available";
    }

    // Map to status enum
    let status = "In Service";
    if (operationStatus === "in_transit") {
      status = "moving";
    } else if (operationStatus === "idle") {
      status = "idle";
    } else if (operationStatus === "available") {
      status = "stopped";
    }

    const updatePayload = {
      operationStatus: operationStatus,
      status: status,
      speed: vehicleData.speed || 0,
      engineOn: vehicleData.engineOn || false,
      fuelLevel: vehicleData.fuelLevel || 0,
      odometer: vehicleData.odometer || 0,
      driverBehaviour: vehicleData.driverBehaviour || {},
      engineHealth: vehicleData.engineHealth || {},
      currentLocation: vehicleData.currentLocation
    };

    const updatedVehicleDoc = await Vehicle.findOneAndUpdate(
      { trackingKey },
      updatePayload,
      { upsert: false, new: true }
    );

    if (!updatedVehicleDoc) {
      return null;
    }

    const updatedVehicle = typeof updatedVehicleDoc.toObject === "function"
      ? updatedVehicleDoc.toObject()
      : updatedVehicleDoc;

    updatedVehicle.fuelLevel = vehicleData.fuelLevel || 0;
    updatedVehicle.fuelLevelPercentage = vehicleData.fuelLevel || 0;

    return updatedVehicle;
  } catch (error) {
    // Track failed attempt for auth errors
    const isAuthError = error.message.includes("token") || error.message.includes("401") || error.message.includes("Unauthorized");
    if (isAuthError || error.response?.status === 401) {
      const failedAttempt = failedTrackingAttempts.get(trackingKey) || { count: 0, lastAttempt: 0 };
      failedAttempt.count += 1;
      failedAttempt.lastAttempt = Date.now();
      failedTrackingAttempts.set(trackingKey, failedAttempt);
      
      // Only log if not cached/suppressed
      if (failedAttempt.count <= MAX_FAILED_ATTEMPTS) {
        // console.error(`❌ Samsara Authentication Error for trackingKey ${trackingKey}:`, error.message);
        // console.error(`   This usually means SAMSARA_API_TOKEN is invalid or expired.`);
        if (failedAttempt.count === MAX_FAILED_ATTEMPTS) {
          console.error(`   ⚠️ Suppressing further errors for this vehicle. Fix SAMSARA_API_TOKEN to resume tracking.`);
        }
      }
    } else if (error.message.includes("404") || error.message.includes("not found")) {
      // console.warn(`⚠️ Vehicle with trackingKey "${trackingKey}" not found in Samsara. Ensure the trackingKey matches the vehicle ID in Samsara.`);
    } else {
      // console.error(`❌ Error updating Vehicle from Samsara for trackingKey ${trackingKey}:`, error.message);
    }
    return null;
  }
}

/**
 * Fetch single FleetUnit status from Samsara and update MongoDB
 * @param {string} internalId - Fleet unit internal ID
 * @param {string} companyId - Optional company ID to use company-specific credentials
 */
export async function updateFleetUnitById(internalId, companyId = null) {
  try {
    // Get companyId from fleet unit if not provided
    if (!companyId) {
      const fleetUnit = await FleetUnit.findOne({ internalId }).select('company').lean();
      if (fleetUnit?.company) {
        companyId = fleetUnit.company.toString();
      }
    }

    // Fetch vehicle data from Samsara
    const vehicleData = await fetchVehicleData(internalId, companyId);
    
    if (!vehicleData) {
      return null;
    }

    // Find FleetUnit by internalId
    const fleetUnit = await FleetUnit.findOne({ internalId }).lean();
    
    if (!fleetUnit) {
    //   console.warn(`⚠️ FleetUnit with internalId ${internalId} not found in database`);
      return null;
    }

    // Map Samsara status to operationStatus
    // Samsara doesn't have explicit status, we infer from speed/engine state
    let operationStatus = "available";
    if (vehicleData.engineOn && vehicleData.speed > 0) {
      operationStatus = "in-transit";
    } else if (vehicleData.engineOn && vehicleData.speed === 0) {
      operationStatus = "idle";
    } else {
      operationStatus = "available";
    }

    const updatePayload = {
      operationStatus: operationStatus,
      speed: vehicleData.speed || 0,
      engineOn: vehicleData.engineOn || false,
      fuelLevel: vehicleData.fuelLevel || 0,
      currentOdometer: vehicleData.odometer || 0,
      odometer: vehicleData.odometer || 0,
      driverBehaviour: vehicleData.driverBehaviour || {},
      engineHealth: vehicleData.engineHealth || {},
      currentLocation: vehicleData.currentLocation
    };

    const updatedFleetUnitDoc = await FleetUnit.findOneAndUpdate(
      { internalId },
      updatePayload,
      { upsert: false, new: true }
    );

    if (!updatedFleetUnitDoc) {
    //   console.warn(`⚠️ FleetUnit with internalId ${internalId} not found in database`);
      return null;
    }

    const updatedFleetUnit = typeof updatedFleetUnitDoc.toObject === "function"
      ? updatedFleetUnitDoc.toObject()
      : updatedFleetUnitDoc;

    updatedFleetUnit.fuelLevel = vehicleData.fuelLevel || 0;
    updatedFleetUnit.fuelLevelPercentage = vehicleData.fuelLevel || 0;
    updatedFleetUnit.fuelLevelLitres = vehicleData.fuelLevelLiters || null;
    updatedFleetUnit.fuelLevelLiters = vehicleData.fuelLevelLiters || null;
    updatedFleetUnit.fuel = {
      percentage: vehicleData.fuelLevel || 0,
      liters: vehicleData.fuelLevelLiters || null,
      updatedAt: vehicleData.currentLocation?.updatedAt || new Date()
    };

    // Map operationStatus to status for compatibility
    updatedFleetUnit.status = operationStatus === "in-transit" ? "moving" : 
                             operationStatus === "maintenance" ? "maintenance" :
                             operationStatus === "idle" ? "idle" : "stopped";

    // Add plateNumber for compatibility
    updatedFleetUnit.plateNumber = updatedFleetUnit.licensePlate;

    return updatedFleetUnit;
  } catch (error) {
    // console.error(`Error updating FleetUnit from Samsara for ${internalId}:`, error.message);
    return null;
  }
}

/**
 * Update all vehicles in DB from Samsara
 */
export async function updateVehiclesInDB() {
  try {
    // Note: This function processes all vehicles from all companies
    // Since each company may have its own Samsara account, we can't fetch all vehicles at once
    // Instead, we'll process vehicles company by company
    // For now, fallback to env if no companyId (for backward compatibility)
    const samsaraVehicles = await fetchSamsaraVehicles(null);
    const fleetUnitData = [];

    for (const sv of samsaraVehicles) {
      // Find FleetUnit by internalId (Samsara vehicle ID)
      const existingFleetUnit = await FleetUnit.findOne({ internalId: sv.id }).lean();
      
      if (!existingFleetUnit) {
        continue; // Skip if FleetUnit doesn't exist
      }

      // Get companyId from fleet unit
      const companyId = existingFleetUnit?.company?.toString() || null;

      // Fetch latest data for this vehicle using company-specific credentials
      const vehicleData = await fetchVehicleData(sv.id, companyId);
      
      if (!vehicleData) {
        continue;
      }

      // Determine operationStatus
      let operationStatus = "available";
      if (vehicleData.engineOn && vehicleData.speed > 0) {
        operationStatus = "in-transit";
      } else if (vehicleData.engineOn && vehicleData.speed === 0) {
        operationStatus = "idle";
      }

      const updatedFleetUnit = await FleetUnit.findOneAndUpdate(
        { internalId: sv.id },
        {
          operationStatus: operationStatus,
          speed: vehicleData.speed || 0,
          engineOn: vehicleData.engineOn || false,
          fuelLevel: vehicleData.fuelLevel || 0,
          currentOdometer: vehicleData.odometer || 0,
          currentLocation: vehicleData.currentLocation
        },
        { upsert: false, new: true }
      );
      
      if (updatedFleetUnit) {
        fleetUnitData.push(updatedFleetUnit);
      }
    }

    return fleetUnitData;
  } catch (error) {
    // console.error("Error updating vehicles from Samsara:", error.message);
    return [];
  }
}

/**
 * Initialize locations for all FleetUnits
 * (Same as Geotab version, kept for compatibility)
 */
export async function initializeAllFleetUnitLocations() {
  try {
    const allFleetUnits = await FleetUnit.find({}).lean();

    if (!allFleetUnits || allFleetUnits.length === 0) {
      return {
        success: true,
        total: 0,
        initialized: 0,
        skipped: 0,
        message: 'No FleetUnits found'
      };
    }

    let initialized = 0;
    let skipped = 0;

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
          await FleetUnit.findByIdAndUpdate(unit._id, {
            currentLocation: {
              address: unit.currentLocation?.address || "",
              latitude: unit.currentLocation?.latitude || "0",
              longitude: unit.currentLocation?.longitude || "0",
              updatedAt: new Date()
            }
          }, { new: true });
          initialized++;
        } else {
          skipped++;
        }
      } catch (error) {
        // console.error(`Error initializing location for FleetUnit ${unit.unitNo}:`, error.message);
      }
    }

    return {
      success: true,
      total: allFleetUnits.length,
      initialized,
      skipped
    };
  } catch (error) {
    // console.error('Error in location initialization:', error);
    return {
      success: false,
      total: 0,
      initialized: 0,
      skipped: 0,
      error: error.message
    };
  }
}

