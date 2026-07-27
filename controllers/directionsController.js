// Proxy controller for Google Maps Directions API
// This allows the mobile app to call Directions API through the backend
// to avoid API key restriction issues

export const getDirections = async (req, res) => {
  try {
    const { origin, destination, waypoints, mode = 'driving' } = req.query;

    // Validate required parameters
    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        message: 'Origin and destination are required'
      });
    }

    // Always use the backend server-side API key.
    // Never use a key passed from the client — mobile app keys are restricted
    // to app signatures and will be rejected (REQUEST_DENIED) when called
    // from a server environment.
    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!googleMapsApiKey) {
      return res.status(500).json({
        success: false,
        message: 'Google Maps API key is required'
      });
    }

    // Build Directions API URL
    let directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}&key=${googleMapsApiKey}`;
    
    // Add waypoints if provided
    if (waypoints && waypoints.length > 0) {
      const waypointsParam = Array.isArray(waypoints) 
        ? waypoints.join('|') 
        : waypoints;
      directionsUrl += `&waypoints=${encodeURIComponent(waypointsParam)}`;
    }

    console.log('🛣️ Proxying Directions API request:', {
      origin,
      destination,
      hasWaypoints: !!waypoints,
      mode
    });

    // Call Google Directions API
    const response = await fetch(directionsUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Directions API error:', response.status, errorText);
      return res.status(response.status).json({
        success: false,
        message: `Directions API error: ${response.status}`,
        error: errorText
      });
    }

    const data = await response.json();
    
    // Check for API errors
    if (data.status !== 'OK') {
      console.error('❌ Directions API returned error:', data.status, data.error_message);
      return res.status(400).json({
        success: false,
        message: `Directions API error: ${data.status}`,
        error_message: data.error_message
      });
    }

    console.log('✅ Directions API request successful');
    
    // Return the directions data
    return res.status(200).json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('❌ Error in getDirections controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching directions',
      error: error.message
    });
  }
};

