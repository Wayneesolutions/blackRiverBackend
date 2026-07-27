import mongoose from 'mongoose';
import Trip from '../models/tripModel.js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const addSampleTripCoordinates = async () => {
  try {
    // Connect to database
    let dbUrl = process.env.MONGODB_URI || process.env.DB || process.env.DB1 || 'mongodb://localhost:27017/blackriver';
    
    // Clean up connection string - remove empty appName parameter (same as mongoConnection.js)
    if (dbUrl) {
      // Remove appName parameter if it has no value (e.g., ?appName or &appName)
      dbUrl = dbUrl.replace(/[?&]appName(?=&|$)/g, '').replace(/\?&/g, '?').replace(/&+/g, '&');
      // Remove trailing ? or & if present
      dbUrl = dbUrl.replace(/[?&]$/, '');
    }
    
    await mongoose.connect(dbUrl);
    console.log('✅ Connected to MongoDB');

    // Find the trip by tripNumber
    const tripNumber = 'TRIP20250012';
    const trip = await Trip.findOne({ tripNumber });

    if (!trip) {
      console.log(`❌ Trip with number "${tripNumber}" not found.`);
      await mongoose.connection.close();
      return;
    }

    console.log(`✅ Found trip: ${trip.tripNumber} (ID: ${trip._id})`);

    // Determine start and end coordinates
    let startLat, startLng, endLat, endLng;

    // Get start location coordinates
    if (trip.startLocation?.latitude && trip.startLocation?.longitude) {
      startLat = parseFloat(trip.startLocation.latitude);
      startLng = parseFloat(trip.startLocation.longitude);
    } else if (trip.orders && trip.orders.length > 0 && trip.orders[0].pickupLocation?.latitude) {
      startLat = parseFloat(trip.orders[0].pickupLocation.latitude);
      startLng = parseFloat(trip.orders[0].pickupLocation.longitude);
    } else {
      // Default to Toronto if no start location
      startLat = 43.6532;
      startLng = -79.3832;
      console.log('⚠️ No start location found, using default Toronto coordinates');
    }

    // Get end location coordinates
    if (trip.endLocation?.latitude && trip.endLocation?.longitude) {
      endLat = parseFloat(trip.endLocation.latitude);
      endLng = parseFloat(trip.endLocation.longitude);
    } else if (trip.orders && trip.orders.length > 0) {
      const lastOrder = trip.orders[trip.orders.length - 1];
      if (lastOrder.deliveryLocation?.latitude && lastOrder.deliveryLocation?.longitude) {
        endLat = parseFloat(lastOrder.deliveryLocation.latitude);
        endLng = parseFloat(lastOrder.deliveryLocation.longitude);
      }
    }

    // If no end location, create a route from start
    if (!endLat || !endLng) {
      // Create a route heading northeast from start
      endLat = startLat + 0.5; // ~55km north
      endLng = startLng + 0.5; // ~55km east
      console.log('⚠️ No end location found, creating a route from start location');
    }

    console.log(`📍 Start: ${startLat}, ${startLng}`);
    console.log(`📍 End: ${endLat}, ${endLng}`);

    // Get actual route using Google Maps Directions API
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    let routeCoordinates = [];
    
    if (apiKey) {
      console.log('🗺️ Fetching route from Google Maps Directions API...');
      
      try {
        const originStr = `${startLat},${startLng}`;
        const destStr = `${endLat},${endLng}`;
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&mode=driving&key=${apiKey}`;
        
        const response = await axios.get(url);
        
        if (response.data.status === "OK" && response.data.routes && response.data.routes.length > 0) {
          const route = response.data.routes[0];
          
          // Extract detailed coordinates from route steps (more accurate than overview polyline)
          if (route.legs && route.legs.length > 0) {
            routeCoordinates = extractDetailedCoordinatesFromSteps(route.legs);
            console.log(`✅ Extracted ${routeCoordinates.length} detailed route points from route steps`);
          } else if (route.overview_polyline && route.overview_polyline.points) {
            // Fallback to overview polyline if steps not available
            routeCoordinates = decodePolyline(route.overview_polyline.points);
            console.log(`✅ Decoded ${routeCoordinates.length} route points from overview polyline`);
          }
        } else {
          console.log(`⚠️ Directions API returned status: ${response.data.status}, using fallback route`);
        }
      } catch (error) {
        console.log(`⚠️ Error fetching route from Directions API: ${error.message}, using fallback route`);
      }
    } else {
      console.log('⚠️ Google Maps API key not found, using fallback route');
    }

    // If we didn't get route coordinates from Directions API, generate a curved route
    if (routeCoordinates.length === 0) {
      routeCoordinates = generateCurvedRoute(startLat, startLng, endLat, endLng);
    }

    // Convert route coordinates to traveledPath format
    const samplePath = [];
    const now = new Date();
    const startTime = new Date(now.getTime() - routeCoordinates.length * 60000); // Start based on number of points
    
    let cumulativeDistance = 0;
    
    routeCoordinates.forEach((coord, i) => {
      const isFirst = i === 0;
      const isLast = i === routeCoordinates.length - 1;
      
      // Calculate distance from previous point
      if (i > 0) {
        const prevCoord = routeCoordinates[i - 1];
        const segmentDistance = haversineDistance(
          prevCoord.lat,
          prevCoord.lng,
          coord.lat,
          coord.lng
        );
        cumulativeDistance += segmentDistance;
      }
      
      // Calculate speed (slower at start and end, faster in middle)
      let speed = 60; // Default 60 km/h
      if (isFirst || isLast) {
        speed = 20; // Slower at start/end
      } else if (i > 3 && i < routeCoordinates.length - 3) {
        speed = Math.floor(Math.random() * 30) + 70; // 70-100 km/h in middle
      } else {
        speed = Math.floor(Math.random() * 20) + 50; // 50-70 km/h during acceleration/deceleration
      }

      // Calculate timestamp (approximately 1 minute per point)
      const timestamp = new Date(startTime.getTime() + i * 60000);

      samplePath.push({
        latitude: coord.lat.toString(),
        longitude: coord.lng.toString(),
        timestamp: timestamp,
        speed: speed,
        odometer: Math.round(cumulativeDistance * 10) / 10 // Round to 1 decimal
      });
    });
    
    // Helper function to decode Google Maps polyline
    function decodePolyline(encoded) {
      const coordinates = [];
      let index = 0;
      let lat = 0;
      let lng = 0;
      
      while (index < encoded.length) {
        let b;
        let shift = 0;
        let result = 0;
        
        do {
          b = encoded.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        
        const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
        lat += deltaLat;
        
        shift = 0;
        result = 0;
        
        do {
          b = encoded.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        
        const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
        lng += deltaLng;
        
        coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
      }
      
      return coordinates;
    }
    
    // Helper function to extract detailed coordinates from route steps
    function extractDetailedCoordinatesFromSteps(legs) {
      const coordinates = [];
      
      if (!legs || legs.length === 0) return coordinates;
      
      legs.forEach(leg => {
        if (leg.steps && leg.steps.length > 0) {
          leg.steps.forEach(step => {
            // Add start location
            if (step.start_location) {
              coordinates.push({
                lat: step.start_location.lat,
                lng: step.start_location.lng
              });
            }
            
            // If step has a polyline, decode it for detailed path
            if (step.polyline && step.polyline.points) {
              const stepPoints = decodePolyline(step.polyline.points);
              // Skip first point (already added as start_location) to avoid duplicates
              for (let i = 1; i < stepPoints.length; i++) {
                coordinates.push(stepPoints[i]);
              }
            } else if (step.end_location) {
              // Fallback: just add end location if no polyline
              coordinates.push({
                lat: step.end_location.lat,
                lng: step.end_location.lng
              });
            }
          });
        }
      });
      
      return coordinates;
    }
    
    // Helper function to generate a curved route (fallback)
    function generateCurvedRoute(startLat, startLng, endLat, endLng) {
      const numPoints = 30;
      const coordinates = [];
      
      // Calculate total distance
      const totalDistance = Math.sqrt(
        Math.pow(endLat - startLat, 2) + Math.pow(endLng - startLng, 2)
      );
      
      for (let i = 0; i <= numPoints; i++) {
        const ratio = i / numPoints;
        
        // Linear interpolation with curvature
        let lat = startLat + (endLat - startLat) * ratio;
        let lng = startLng + (endLng - startLng) * ratio;

        // Add sinusoidal curve to simulate road turns
        if (i > 0 && i < numPoints) {
          const curveAmount = 0.02; // Curve amplitude
          const frequency = 3; // Number of curves
          const curve = Math.sin((i / numPoints) * Math.PI * frequency) * curveAmount;
          const perpendicularLat = -(endLng - startLng) / totalDistance * curve;
          const perpendicularLng = (endLat - startLat) / totalDistance * curve;
          lat += perpendicularLat;
          lng += perpendicularLng;
        }
        
        coordinates.push({ lat, lng });
      }
      
      return coordinates;
    }
    
    // Helper function to calculate distance between two points (Haversine formula)
    function haversineDistance(lat1, lon1, lat2, lon2) {
      const R = 6371; // Earth's radius in kilometers
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c; // Distance in kilometers
    }

    // Update the trip with the sample path
    await Trip.findByIdAndUpdate(trip._id, {
      $set: { traveledPath: samplePath }
    });

    const totalDistanceKm = samplePath.length > 0 ? samplePath[samplePath.length - 1].odometer : 0;
    
    console.log(`✅ Added ${samplePath.length} coordinate points to trip ${tripNumber}`);
    console.log(`   Path spans from ${samplePath[0].latitude}, ${samplePath[0].longitude}`);
    console.log(`   to ${samplePath[samplePath.length - 1].latitude}, ${samplePath[samplePath.length - 1].longitude}`);
    console.log(`   Total distance: ~${totalDistanceKm.toFixed(1)} km`);

    await mongoose.connection.close();
    console.log('✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the script
addSampleTripCoordinates();

