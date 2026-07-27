// services/thermoking.js
// ThermoKing API Integration Service
// Used for tracking trailer refrigeration unit service hours
import axios from "axios";
import { Trailer } from "../models/driver/trailerModel.js";
import { CompanySettings } from "../models/driver/companysettingsModel.js";

// Fallback to env variables if company settings not available
const THERMOKING_API_BASE_URL = process.env.THERMOKING_API_BASE_URL || "https://api.thermoking.com";
const THERMOKING_API_KEY = process.env.THERMOKING_API_KEY;
const THERMOKING_API_SECRET = process.env.THERMOKING_API_SECRET;
const THERMOKING_API_VERSION = process.env.THERMOKING_API_VERSION || "v1";

// Cache tokens per company
const tokenCache = new Map(); // companyId -> { token, expiry }
let lastAuthError = null;
let authErrorCount = 0;
const MAX_AUTH_ERROR_LOGS = 5; // Only log auth errors every 5 attempts to reduce spam

// Cache for failed trailer service attempts
const failedServiceAttempts = new Map();
const FAILED_SERVICE_CACHE_TIME = 60000; // Skip updates for 60 seconds after consecutive failures
const MAX_FAILED_ATTEMPTS = 3; // After 3 failures, skip for cache time

/**
 * Get ThermoKing API credentials from company settings or fallback to env
 * @param {string} companyId - Company ID to fetch credentials for
 * @returns {Promise<{apiBaseUrl: string, apiKey: string, apiSecret: string, apiVersion: string}>}
 */
async function getThermokingCredentials(companyId = null) {
  // If companyId provided, fetch from company settings
  if (companyId) {
    try {
      const companySettings = await CompanySettings.findById(companyId)
        .select('thermokingConfig')
        .lean();
      
      if (companySettings?.thermokingConfig?.apiKey && 
          companySettings?.thermokingConfig?.apiSecret &&
          companySettings?.thermokingConfig?.apiBaseUrl) {
        return {
          apiBaseUrl: companySettings.thermokingConfig.apiBaseUrl,
          apiKey: companySettings.thermokingConfig.apiKey,
          apiSecret: companySettings.thermokingConfig.apiSecret,
          apiVersion: companySettings.thermokingConfig.apiVersion || 'v1'
        };
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching ThermoKing credentials for company ${companyId}:`, error.message);
    }
  }
  
  // Fallback to environment variables
  if (THERMOKING_API_KEY && THERMOKING_API_SECRET) {
    return {
      apiBaseUrl: THERMOKING_API_BASE_URL,
      apiKey: THERMOKING_API_KEY,
      apiSecret: THERMOKING_API_SECRET,
      apiVersion: THERMOKING_API_VERSION
    };
  }
  
  // No credentials found
  return null;
}

/**
 * Authenticate with ThermoKing API
 * ThermoKing typically uses API key and secret for authentication
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
  const credentials = await getThermokingCredentials(companyId);
  
  if (!credentials || !credentials.apiKey || !credentials.apiSecret) {
    // Only log this once every 60 seconds to avoid spam
    const now = Date.now();
    if (!lastAuthError || (now - lastAuthError) > 60000) {
      if (companyId) {
        console.error(`❌ ThermoKing API credentials not configured for company ${companyId}!`);
        console.error("   Please configure ThermoKing API credentials in company settings.");
      } else {
        console.error("❌ THERMOKING_API_KEY or THERMOKING_API_SECRET environment variable is not set!");
        console.error("   Please set them in your .env file or configure in company settings.");
      }
      lastAuthError = now;
    }
    throw new Error(companyId 
      ? "ThermoKing API credentials not configured for this company" 
      : "ThermoKing API credentials are not set");
  }

  try {
    // Authenticate with ThermoKing API to get access token
    // Adjust endpoint based on ThermoKing's actual API structure
    const authResponse = await axios.post(
      `${credentials.apiBaseUrl}/${credentials.apiVersion}/auth/token`,
      {
        apiKey: credentials.apiKey,
        apiSecret: credentials.apiSecret
      },
      {
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    const tokenData = authResponse.data;
    
    // Cache the token (adjust expiry based on ThermoKing's token expiry)
    const token = tokenData.accessToken || tokenData.token;
    const expiresIn = tokenData.expiresIn || 3600; // Default to 1 hour
    
    tokenCache.set(cacheKey, {
      token: token,
      expiry: Date.now() + (expiresIn * 1000)
    });

    return token;
  } catch (error) {
    authErrorCount++;
    const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
    
    if (authErrorCount <= MAX_AUTH_ERROR_LOGS) {
      if (companyId) {
        console.error(`❌ ThermoKing API Authentication Failed for company ${companyId}:`, errorMessage);
        console.error("   Please verify API credentials in company settings.");
      } else {
        console.error("❌ ThermoKing API Authentication Failed:", errorMessage);
        console.error("   Please verify THERMOKING_API_KEY and THERMOKING_API_SECRET are correct.");
      }
    }
    
    throw new Error(`ThermoKing authentication failed: ${errorMessage}`);
  }
}

/**
 * Make authenticated API call to ThermoKing
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {object} params - Request parameters
 * @param {string} companyId - Optional company ID to use company-specific credentials
 */
async function thermokingApiCall(endpoint, method = "GET", params = {}, companyId = null) {
  try {
    const token = await authenticate(companyId);
    const credentials = await getThermokingCredentials(companyId);
    
    if (!token || !credentials) {
      authErrorCount++;
      if (authErrorCount === 1 || authErrorCount % 10 === 0) {
        if (companyId) {
          console.error(`❌ ThermoKing API credentials not configured for company ${companyId}.`);
        } else {
          console.error("❌ ThermoKing API Token is missing or invalid.");
        }
      }
      throw new Error("ThermoKing API token is not configured");
    }
    
    // Reset auth error count if we have a valid token
    if (authErrorCount > 0) {
      authErrorCount = 0;
      lastAuthError = null;
    }
    
    const config = {
      method,
      url: `${credentials.apiBaseUrl}/${credentials.apiVersion}${endpoint}`,
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
      const now = Date.now();
      
      const shouldLog = !lastAuthError || 
                        (now - lastAuthError) > 30000 || 
                        authErrorCount <= MAX_AUTH_ERROR_LOGS;
      
      if (shouldLog) {
        console.error(`❌ ThermoKing API Authentication Failed (401 Unauthorized) for endpoint ${endpoint}`);
        console.error(`   Please verify API credentials are correct.`);
        if (authErrorCount > MAX_AUTH_ERROR_LOGS) {
          console.error(`   ⚠️ Suppressing repeated auth errors.`);
        }
        lastAuthError = now;
      }
      // Clear cached token on auth error
      if (companyId) {
        tokenCache.delete(companyId);
      } else {
        tokenCache.delete('default');
      }
    } else if (statusCode === 403) {
      console.error(`❌ ThermoKing API Forbidden (403): Token does not have permission to access endpoint ${endpoint}`);
    } else if (statusCode === 404) {
      console.warn(`⚠️ Trailer unit not found in ThermoKing (404) for endpoint: ${endpoint}`);
      return null;
    } else if (statusCode === 429) {
      console.warn(`⚠️ ThermoKing API Rate Limit (429): Too many requests. Please wait before retrying.`);
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error(`❌ ThermoKing API Connection Error: Cannot connect to API. Check network connectivity.`);
    }
    
    // Don't throw for 404s - return null instead
    if (statusCode === 404) {
      return null;
    }
    
    throw error;
  }
}

/**
 * Fetch service hours for a ThermoKing unit
 * @param {string} unitId - ThermoKing unit ID or serial number
 * @param {string} companyId - Optional company ID to use company-specific credentials
 * @returns {Object|null} Service hours data
 */
export async function fetchUnitServiceHours(unitId, companyId = null) {
  try {
    if (!unitId) {
      console.warn(`⚠️ fetchUnitServiceHours: unitId is empty or null`);
      return null;
    }

    // Fetch service hours from ThermoKing API
    // Adjust endpoint based on ThermoKing's actual API structure
    const response = await thermokingApiCall(`/units/${unitId}/service-hours`, "GET", {}, companyId);
    
    if (!response || !response.data) {
      return null;
    }

    // Parse service hours data
    // Adjust fields based on ThermoKing's actual response structure
    const serviceHours = response.data.serviceHours || response.data.totalHours || 0;
    const lastServiceHours = response.data.lastServiceHours || 0;
    const lastServiceDate = response.data.lastServiceDate || null;
    const nextServiceHours = response.data.nextServiceHours || (serviceHours + 1000); // Default interval
    const hoursUntilService = nextServiceHours - serviceHours;

    return {
      unitId,
      currentServiceHours: serviceHours,
      lastServiceHours,
      lastServiceDate: lastServiceDate ? new Date(lastServiceDate) : null,
      nextServiceHours,
      hoursUntilService,
      serviceDue: hoursUntilService <= 0,
      needsService: hoursUntilService <= 100 // Service due within 100 hours
    };
  } catch (error) {
    console.error(`❌ Error fetching service hours from ThermoKing for unit ${unitId}:`, error.message);
    return null;
  }
}

/**
 * Fetch all units and their service hours
 * @param {string} companyId - Optional company ID to use company-specific credentials
 * @returns {Array} Array of unit service data
 */
export async function fetchAllUnitsServiceHours(companyId = null) {
  try {
    // Fetch all units from ThermoKing API
    // Adjust endpoint based on ThermoKing's actual API structure
    const response = await thermokingApiCall("/units", "GET", {}, companyId);
    
    if (!response || !response.data || !Array.isArray(response.data)) {
      return [];
    }

    const units = response.data;
    const unitsWithServiceHours = [];

    // Fetch service hours for each unit
    for (const unit of units) {
      const unitId = unit.id || unit.serialNumber || unit.unitId;
      if (unitId) {
        const serviceHours = await fetchUnitServiceHours(unitId, companyId);
        if (serviceHours) {
          unitsWithServiceHours.push({
            ...unit,
            serviceHours
          });
        }
      }
    }

    return unitsWithServiceHours;
  } catch (error) {
    console.error(`❌ Error fetching all units service hours from ThermoKing:`, error.message);
    return [];
  }
}

/**
 * Update trailer service hours from ThermoKing
 * @param {string} trailerId - MongoDB trailer ID
 * @param {string} thermokingUnitId - ThermoKing unit ID or serial number
 * @param {string} companyId - Optional company ID to use company-specific credentials
 */
export async function updateTrailerServiceHours(trailerId, thermokingUnitId, companyId = null) {
  try {
    if (!trailerId || !thermokingUnitId) {
      console.warn(`⚠️ updateTrailerServiceHours: trailerId or thermokingUnitId is missing`);
      return null;
    }

    // Get companyId from trailer if not provided
    let trailer;
    if (!companyId) {
      trailer = await Trailer.findById(trailerId).select('company').lean();
      if (trailer?.company) {
        companyId = trailer.company.toString();
      }
    }

    // Check if we should skip this unit due to recent failures
    const failedAttempt = failedServiceAttempts.get(thermokingUnitId);
    if (failedAttempt) {
      const timeSinceLastAttempt = Date.now() - failedAttempt.lastAttempt;
      if (failedAttempt.count >= MAX_FAILED_ATTEMPTS && timeSinceLastAttempt < FAILED_SERVICE_CACHE_TIME) {
        return null;
      }
      if (timeSinceLastAttempt >= FAILED_SERVICE_CACHE_TIME) {
        failedServiceAttempts.delete(thermokingUnitId);
      }
    }

    // Fetch service hours from ThermoKing
    const serviceHoursData = await fetchUnitServiceHours(thermokingUnitId, companyId);
    
    if (!serviceHoursData) {
      // Track failed attempt
      const failedAttempt = failedServiceAttempts.get(thermokingUnitId) || { count: 0, lastAttempt: 0 };
      failedAttempt.count += 1;
      failedAttempt.lastAttempt = Date.now();
      failedServiceAttempts.set(thermokingUnitId, failedAttempt);
      
      if (failedAttempt.count <= MAX_FAILED_ATTEMPTS) {
        console.warn(`⚠️ No service hours data returned from ThermoKing for unit: ${thermokingUnitId}`);
      }
      return null;
    }

    // Success - clear failed attempts cache
    if (failedServiceAttempts.has(thermokingUnitId)) {
      failedServiceAttempts.delete(thermokingUnitId);
    }

    // Fetch full trailer data if we only got company field earlier
    if (!trailer || !trailer.maintenance) {
      trailer = await Trailer.findById(trailerId).lean();
    }
    
    if (!trailer) {
      console.warn(`⚠️ Trailer ${trailerId} not found in MongoDB database.`);
      return null;
    }

    // Update trailer maintenance information
    const updatePayload = {
      "maintenance.lastService": serviceHoursData.lastServiceDate || trailer.maintenance?.lastService,
      "maintenance.currentServiceHours": serviceHoursData.currentServiceHours,
      "maintenance.nextServiceHours": serviceHoursData.nextServiceHours,
      "maintenance.hoursUntilService": serviceHoursData.hoursUntilService,
      "maintenance.serviceDue": serviceHoursData.serviceDue,
      "maintenance.serviceDueSoon": serviceHoursData.needsService,
      thermokingUnitId: thermokingUnitId, // Store ThermoKing unit ID for future updates
      thermokingLastSync: new Date()
    };

    // Calculate next service date (if we have service hours and estimated usage)
    if (serviceHoursData.currentServiceHours && serviceHoursData.hoursUntilService > 0) {
      // Estimate based on average hours per day (adjust as needed)
      const avgHoursPerDay = 8; // Default assumption
      const daysUntilService = Math.ceil(serviceHoursData.hoursUntilService / avgHoursPerDay);
      const nextServiceDate = new Date();
      nextServiceDate.setDate(nextServiceDate.getDate() + daysUntilService);
      updatePayload["maintenance.nextService"] = nextServiceDate;
    }

    const updatedTrailer = await Trailer.findByIdAndUpdate(
      trailerId,
      { $set: updatePayload },
      { new: true, lean: true }
    );

    if (!updatedTrailer) {
      return null;
    }

    return {
      trailer: updatedTrailer,
      serviceHours: serviceHoursData
    };
  } catch (error) {
    // Track failed attempt for auth errors
    const isAuthError = error.message.includes("token") || error.message.includes("401") || error.message.includes("Unauthorized");
    if (isAuthError || error.response?.status === 401) {
      const failedAttempt = failedServiceAttempts.get(thermokingUnitId) || { count: 0, lastAttempt: 0 };
      failedAttempt.count += 1;
      failedAttempt.lastAttempt = Date.now();
      failedServiceAttempts.set(thermokingUnitId, failedAttempt);
      
      if (failedAttempt.count <= MAX_FAILED_ATTEMPTS) {
        console.error(`❌ ThermoKing Authentication Error for unit ${thermokingUnitId}:`, error.message);
        console.error(`   This usually means API credentials are invalid or expired.`);
      }
    } else {
      console.error(`❌ Error updating trailer service hours from ThermoKing:`, error.message);
    }
    return null;
  }
}

/**
 * Sync service hours for all trailers with ThermoKing units
 */
export async function syncAllTrailerServiceHours() {
  try {
    // Find all trailers that have ThermoKing units
    const trailers = await Trailer.find({
      $or: [
        { thermokingUnitId: { $exists: true, $ne: null } },
        { type: { $in: ['RF', 'Reefer Trailer', 'refrigerated'] } } // Reefer trailers likely have ThermoKing
      ]
    }).lean();

    if (!trailers || trailers.length === 0) {
      return {
        success: true,
        total: 0,
        updated: 0,
        failed: 0,
        message: 'No trailers with ThermoKing units found'
      };
    }

    let updated = 0;
    let failed = 0;

    for (const trailer of trailers) {
      const thermokingUnitId = trailer.thermokingUnitId || trailer.serialNumber || trailer.unitNumber;
      
      if (!thermokingUnitId) {
        continue;
      }

      try {
        // Get companyId from trailer
        const companyId = trailer.company?.toString() || null;
        const result = await updateTrailerServiceHours(trailer._id.toString(), thermokingUnitId, companyId);
        if (result) {
          updated++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`❌ Error syncing service hours for trailer ${trailer._id}:`, error.message);
        failed++;
      }
    }

    return {
      success: true,
      total: trailers.length,
      updated,
      failed
    };
  } catch (error) {
    console.error('❌ Error syncing all trailer service hours:', error.message);
    return {
      success: false,
      total: 0,
      updated: 0,
      failed: 0,
      error: error.message
    };
  }
}

