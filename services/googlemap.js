import axios from "axios";

/**
 * Get coordinates from address using OpenCage Geocoding API
 * @param {string} address - The address to geocode
 * @returns {Promise<{latitude: number|null, longitude: number|null}>}
 */
export const getCoordinatesFromAddressOpenCage = async (address) => {
  try {
    if (!address || !address.trim()) {
      return { latitude: null, longitude: null };
    }

    // OpenCage Geocoding API - requires API key
    const apiKey = process.env.OPENCAGE_API_KEY || '9854722a0d444bbf96fa61cec79790b6';
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(address)}&key=${apiKey}`;
    
    const response = await axios.get(url, {
      timeout: 10000 // 10 second timeout
    });

    if (response.data && response.data.status && response.data.status.code === 200) {
      if (response.data.results && response.data.results.length > 0) {
        const result = response.data.results[0];
        if (result.geometry && result.geometry.lat && result.geometry.lng) {
          return {
            latitude: parseFloat(result.geometry.lat),
            longitude: parseFloat(result.geometry.lng),
          };
        }
      }
    }
    
    console.warn(`⚠️ OpenCage geocoding found no results for address: "${address}"`);
    if (response.data && response.data.status) {
      console.warn(`   Status: ${response.data.status.code} - ${response.data.status.message}`);
    }
    return { latitude: null, longitude: null };
  } catch (error) {
    console.error(`❌ OpenCage geocoding error for address "${address}":`, error.message);
    if (error.response) {
      console.error("   Response status:", error.response.status);
      console.error("   Response data:", error.response.data);
    }
    return { latitude: null, longitude: null };
  }
};

/**
 * Get coordinates from address using OpenStreetMap Nominatim API (free, no API key required)
 * @param {string} address - The address to geocode
 * @returns {Promise<{latitude: number|null, longitude: number|null}>}
 */
export const getCoordinatesFromAddressOSM = async (address) => {
  try {
    if (!address || !address.trim()) {
      return { latitude: null, longitude: null };
    }

    // OpenStreetMap Nominatim API - free, no API key required
    // Rate limit: 1 request per second (we'll add a small delay if needed)
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'BlackRiver Logistics App' // Required by Nominatim
      },
      timeout: 10000 // 10 second timeout
    });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      const result = response.data[0];
      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
      };
    } else {
      console.warn(`⚠️ OpenStreetMap geocoding found no results for address: "${address}"`);
      return { latitude: null, longitude: null };
    }
  } catch (error) {
    console.error(`❌ OpenStreetMap geocoding error for address "${address}":`, error.message);
    if (error.response) {
      console.error("   Response status:", error.response.status);
      console.error("   Response data:", error.response.data);
    }
    return { latitude: null, longitude: null };
  }
};

/**
 * Get coordinates from address using Google Maps API (requires API key)
 * @param {string} address - The address to geocode
 * @returns {Promise<{latitude: number|null, longitude: number|null}>}
 */
export const getCoordinatesFromAddressGoogle = async (address) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY; // store in .env
    if (!apiKey) {
      console.warn("⚠️ Google Maps API key not found, cannot geocode address");
      return { latitude: null, longitude: null };
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;

    const response = await axios.get(url);

    if (response.data.status === "OK" && response.data.results && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return {
        latitude: location.lat,
        longitude: location.lng,
      };
    } else {
      console.warn(`⚠️ Geocoding failed for address "${address}": ${response.data.status}${response.data.error_message ? ` - ${response.data.error_message}` : ''}`);
      return { latitude: null, longitude: null };
    }
  } catch (error) {
    console.error(`❌ Geocoding error for address "${address}":`, error.message);
    if (error.response) {
      console.error("   Response status:", error.response.status);
      console.error("   Response data:", error.response.data);
    }
    return { latitude: null, longitude: null }; // fallback
  }
};

/**
 * Get coordinates from address - tries OpenCage first, then OpenStreetMap, then Google Maps
 * @param {string} address - The address to geocode
 * @returns {Promise<{latitude: number|null, longitude: number|null}>}
 */
export const getCoordinatesFromAddress = async (address) => {
  if (!address || !address.trim()) {
    return { latitude: null, longitude: null };
  }

  // Try OpenCage first (primary geocoding service)
  console.log(`🌍 Geocoding address using OpenCage: ${address}`);
  const openCageResult = await getCoordinatesFromAddressOpenCage(address);
  
  if (openCageResult.latitude && openCageResult.longitude) {
    console.log(`✅ OpenCage geocoding successful: (${openCageResult.latitude}, ${openCageResult.longitude})`);
    return openCageResult;
  }

  // Fallback to OpenStreetMap if OpenCage fails
  console.log(`🔄 Falling back to OpenStreetMap geocoding...`);
  const osmResult = await getCoordinatesFromAddressOSM(address);
  
  if (osmResult.latitude && osmResult.longitude) {
    console.log(`✅ OpenStreetMap geocoding successful: (${osmResult.latitude}, ${osmResult.longitude})`);
    return osmResult;
  }

  // Fallback to Google Maps if both fail and API key is available
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    console.log(`🔄 Falling back to Google Maps geocoding...`);
    const googleResult = await getCoordinatesFromAddressGoogle(address);
    if (googleResult.latitude && googleResult.longitude) {
      console.log(`✅ Google Maps geocoding successful: (${googleResult.latitude}, ${googleResult.longitude})`);
      return googleResult;
    }
  }

  console.warn(`⚠️ Could not geocode address using any service: "${address}"`);
  return { latitude: null, longitude: null };
};

/**
 * Get route distance in kilometers using Google Maps Directions API
 * @param {Object} origin - { latitude, longitude }
 * @param {Object} destination - { latitude, longitude }
 * @param {Array} waypoints - Array of { latitude, longitude } objects (optional)
 * @returns {Promise<number>} Distance in kilometers, or null if API call fails
 */
export const getRouteDistance = async (origin, destination, waypoints = []) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn("⚠️ Google Maps API key not found, cannot calculate route distance");
      return null;
    }

    // Build origin and destination strings
    const originStr = `${origin.latitude},${origin.longitude}`;
    const destStr = `${destination.latitude},${destination.longitude}`;

    // Build waypoints string if provided
    // Note: By default, waypoints are visited in order (no optimization)
    // We explicitly avoid optimization to get accurate distance through all waypoints
    let waypointsParam = '';
    if (waypoints && waypoints.length > 0) {
      const waypointStrs = waypoints.map(wp => `${wp.latitude},${wp.longitude}`);
      // Pass waypoints without optimization to preserve order and get accurate distance
      waypointsParam = `&waypoints=${encodeURIComponent(waypointStrs.join('|'))}`;
    }

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}${waypointsParam}&mode=driving&key=${apiKey}`;

    console.log(`🗺️ Fetching route distance: ${originStr} → ${destStr}${waypoints.length > 0 ? ` (via ${waypoints.length} waypoints)` : ''}`);

    const response = await axios.get(url);

    if (response.data.status === "OK" && response.data.routes && response.data.routes.length > 0) {
      // Get total distance from the route
      const route = response.data.routes[0];
      let totalDistance = 0; // in meters

      // Sum up distance from all legs
      if (route.legs && route.legs.length > 0) {
        route.legs.forEach((leg, index) => {
          if (leg.distance && leg.distance.value) {
            totalDistance += leg.distance.value;
            console.log(`  Leg ${index + 1}: ${(leg.distance.value / 1000).toFixed(2)} km (${leg.distance.text})`);
          }
        });
      }

      // Convert meters to kilometers
      const distanceInKm = totalDistance / 1000;
      const distanceInMiles = distanceInKm * 0.621371;
      console.log(`✅ Total route distance: ${distanceInKm.toFixed(2)} km (${distanceInMiles.toFixed(2)} miles)`);
      
      return distanceInKm;
    } else {
      console.warn("⚠️ Google Directions API returned status:", response.data.status, response.data.error_message || '');
      return null;
    }
  } catch (error) {
    console.error("❌ Error fetching route distance from Google Maps:", error.message);
    if (error.response) {
      console.error("   Response status:", error.response.status);
      console.error("   Response data:", error.response.data);
    }
    return null;
  }
};