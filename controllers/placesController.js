// Proxy controller for Google Places Autocomplete API
// This allows the frontend to call Places API through the backend
// to avoid CORS restrictions

// Google Places Text Search API - better for full addresses
export const getPlaceTextSearch = async (req, res) => {
  try {
    const { query, location, radius, type } = req.query;
    
    // Validate required parameters
    if (!query || query.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Query must be at least 3 characters'
      });
    }

    // Get API key from environment
    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    
    // Log which API key is being used (masked for security)
    if (googleMapsApiKey) {
      const maskedKey = googleMapsApiKey.length > 10 
        ? `${googleMapsApiKey.substring(0, 10)}...${googleMapsApiKey.substring(googleMapsApiKey.length - 4)}`
        : '***';
      console.log('🔑 [Places Text Search API] Using Google Maps API Key:', maskedKey);
      console.log('🔑 [Places Text Search API] Key source: process.env.GOOGLE_MAPS_API_KEY');
    } else {
      console.warn('⚠️ [Places Text Search API] Google Maps API key is NOT configured in environment');
    }
    
    if (!googleMapsApiKey) {
      return res.status(500).json({
        success: false,
        message: 'Google Maps API key is not configured'
      });
    }

    // Build Text Search API URL
    let textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query.trim())}&key=${googleMapsApiKey}`;
    
    // Add location bias for better results
    if (location) {
      textSearchUrl += `&location=${encodeURIComponent(location)}`;
    }
    
    // Add radius if provided
    if (radius) {
      textSearchUrl += `&radius=${encodeURIComponent(radius)}`;
    }
    
    // Add type filter if provided
    if (type) {
      textSearchUrl += `&type=${encodeURIComponent(type)}`;
    } else {
      // Default to address type
      textSearchUrl += `&type=address`;
    }

    console.log('🔍 [Places Text Search] Searching for:', query.substring(0, 80));
    console.log('🌐 [Places Text Search] Google Places Text Search API URL (masked key):', 
      textSearchUrl.replace(googleMapsApiKey, 'API_KEY_MASKED'));

    // Call Google Places Text Search API
    const response = await fetch(textSearchUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Places Text Search API error:', response.status, errorText);
      return res.status(response.status).json({
        success: false,
        message: `Places Text Search API error: ${response.status}`,
        error: errorText
      });
    }

    const data = await response.json();
    
    // Check for API errors
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('❌ Places Text Search API returned error:', data.status, data.error_message);
      
      // For billing/authentication errors
      if (data.status === 'REQUEST_DENIED' || data.status === 'OVER_QUERY_LIMIT') {
        return res.status(503).json({
          success: false,
          message: `Google Places Text Search API ${data.status}: ${data.error_message || 'Service unavailable'}`,
          error_message: data.error_message,
          status: data.status,
          fallback_available: true
        });
      }
      
      return res.status(400).json({
        success: false,
        message: `Places Text Search API error: ${data.status}`,
        error_message: data.error_message,
        status: data.status
      });
    }

    console.log('✅ Places Text Search API request successful:', {
      resultsCount: data.results?.length || 0,
      status: data.status
    });
    
    // Convert Text Search results to Autocomplete-like format for frontend compatibility
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const predictions = data.results.map((result) => ({
        place_id: result.place_id,
        description: result.formatted_address || result.name,
        structured_formatting: {
          main_text: result.name,
          secondary_text: result.formatted_address
        },
        types: result.types || [],
        geometry: result.geometry
      }));

      return res.status(200).json({
        success: true,
        data: {
          predictions: predictions,
          status: 'OK',
          rawResults: data.results // Include raw results for place details
        }
      });
    }
    
    // Return ZERO_RESULTS
    return res.status(200).json({
      success: true,
      data: {
        predictions: [],
        status: 'ZERO_RESULTS'
      }
    });
  } catch (error) {
    console.error('❌ Error in getPlaceTextSearch controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching place text search',
      error: error.message
    });
  }
};

export const getPlaceAutocomplete = async (req, res) => {
  try {
    let { input, components, types = 'address', sessiontoken } = req.query;
    
    // Validate required parameters
    if (!input || input.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Input query must be at least 3 characters'
      });
    }

    // Store original input for fallback attempts
    const originalInput = input.trim();
    
    // Clean and optimize the input query
    // Remove postal codes and extra details that might confuse Google Places
    let optimizedInput = originalInput;
    
    // Try to extract just the street address part (before postal code)
    // Example: "12 Aster Dr Unit 103 A, Rosser, MB R0G 1N0 Winnipeg, Canada" 
    // -> "12 Aster Dr, Rosser, MB, Canada"
    const postalCodeMatch = originalInput.match(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i);
    if (postalCodeMatch) {
      // Remove everything after postal code
      optimizedInput = originalInput.substring(0, originalInput.indexOf(postalCodeMatch[0])).trim();
      // Remove "Unit", "Apt", etc. from the end
      optimizedInput = optimizedInput.replace(/,\s*(Unit|Apt|Apartment|Suite|#)\s*[\w\s]+$/i, '');
    }
    
    // Remove redundant city names if they appear twice
    const parts = optimizedInput.split(',').map(p => p.trim());
    const uniqueParts = [];
    const seenCities = new Set();
    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      // Skip if it's a duplicate city/province
      if (!seenCities.has(lowerPart) || part.match(/^\d+/) || part.length < 3) {
        uniqueParts.push(part);
        if (part.length > 3 && !part.match(/^\d+/)) {
          seenCities.add(lowerPart);
        }
      }
    }
    optimizedInput = uniqueParts.join(', ');
    
    console.log('🔍 [Places Autocomplete] Query optimization:', {
      original: originalInput.substring(0, 80),
      optimized: optimizedInput.substring(0, 80),
      originalLength: originalInput.length,
      optimizedLength: optimizedInput.length
    });
    
    // Use optimized input
    input = optimizedInput;

    // Get API key from environment
    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    
    // Log which API key is being used (masked for security)
    if (googleMapsApiKey) {
      const maskedKey = googleMapsApiKey.length > 10 
        ? `${googleMapsApiKey.substring(0, 10)}...${googleMapsApiKey.substring(googleMapsApiKey.length - 4)}`
        : '***';
      console.log('🔑 [Places Autocomplete API] Using Google Maps API Key:', maskedKey);
      console.log('🔑 [Places Autocomplete API] Key length:', googleMapsApiKey.length, 'characters');
      console.log('🔑 [Places Autocomplete API] Key source: process.env.GOOGLE_MAPS_API_KEY');
    } else {
      console.warn('⚠️ [Places Autocomplete API] Google Maps API key is NOT configured in environment');
    }
    
    if (!googleMapsApiKey) {
      return res.status(500).json({
        success: false,
        message: 'Google Maps API key is not configured'
      });
    }

    // Build Places Autocomplete API URL
    // Try without strict country restriction first for better results
    let autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${googleMapsApiKey}`;
    
    // Add components filter (country restriction) - but make it less restrictive
    // Instead of strict country filter, use location bias for better results
    if (components) {
      // For Canadian addresses, try with location bias instead of strict filter
      if (components.includes('country:ca')) {
        // Use location bias to prefer Canada but not restrict to it
        autocompleteUrl += `&locationbias=country:ca`;
      } else {
        autocompleteUrl += `&components=${encodeURIComponent(components)}`;
      }
    }
    
    // Add types filter
    if (types) {
      autocompleteUrl += `&types=${encodeURIComponent(types)}`;
    }
    
    console.log('🌐 [Places Autocomplete] Google Places API URL (masked key):', 
      autocompleteUrl.replace(googleMapsApiKey, 'API_KEY_MASKED'));
    
    // Add session token if provided (for billing optimization)
    if (sessiontoken) {
      autocompleteUrl += `&sessiontoken=${encodeURIComponent(sessiontoken)}`;
    }

    console.log('🔍 Proxying Places Autocomplete API request:', {
      input: input.substring(0, 50) + '...',
      hasComponents: !!components,
      types
    });

    // Call Google Places Autocomplete API
    const response = await fetch(autocompleteUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Places Autocomplete API error:', response.status, errorText);
      return res.status(response.status).json({
        success: false,
        message: `Places Autocomplete API error: ${response.status}`,
        error: errorText
      });
    }

    const data = await response.json();
    
    // If we get ZERO_RESULTS, try Text Search API as fallback (better for full addresses)
    if (data.status === 'ZERO_RESULTS') {
      console.log('⚠️ [Places Autocomplete] Got ZERO_RESULTS, trying Text Search API as fallback...');
      
      try {
        // Import the text search function (or call it directly)
        const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(originalInput)}&key=${googleMapsApiKey}&type=address`;
        
        const textSearchResponse = await fetch(textSearchUrl);
        if (textSearchResponse.ok) {
          const textSearchData = await textSearchResponse.json();
          if (textSearchData.status === 'OK' && textSearchData.results && textSearchData.results.length > 0) {
            console.log('✅ [Places Autocomplete] Text Search fallback successful! Found', textSearchData.results.length, 'results');
            
            // Convert Text Search results to Autocomplete format
            const predictions = textSearchData.results.map((result) => ({
              place_id: result.place_id,
              description: result.formatted_address || result.name,
              structured_formatting: {
                main_text: result.name,
                secondary_text: result.formatted_address
              },
              types: result.types || []
            }));

            return res.status(200).json({
              success: true,
              data: {
                predictions: predictions,
                status: 'OK',
                source: 'textsearch' // Indicate this came from text search
              }
            });
          }
        }
      } catch (textSearchError) {
        console.warn('⚠️ [Places Autocomplete] Text Search fallback failed:', textSearchError);
      }
      
      // If Text Search also fails, try simpler queries
      if (originalInput !== input) {
        console.log('⚠️ [Places Autocomplete] Got ZERO_RESULTS with optimized query, trying even simpler query...');
        
        // Extract just street number and name, city, province
        const simpleMatch = originalInput.match(/^(\d+\s+[\w\s]+?)(?:,|\s+)([^,]+?)(?:,|\s+)([A-Z]{2})(?:\s|,)/i);
        if (simpleMatch) {
          const [, street, city, province] = simpleMatch;
          const simpleQuery = `${street.trim()}, ${city.trim()}, ${province.trim()}, Canada`;
          console.log('🔄 [Places Autocomplete] Trying simplified query:', simpleQuery);
          
          let simpleUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(simpleQuery)}&key=${googleMapsApiKey}&types=address&locationbias=country:ca`;
          
          try {
            const simpleResponse = await fetch(simpleUrl);
            if (simpleResponse.ok) {
              const simpleData = await simpleResponse.json();
              if (simpleData.status === 'OK' && simpleData.predictions && simpleData.predictions.length > 0) {
                console.log('✅ [Places Autocomplete] Simplified query successful! Found', simpleData.predictions.length, 'results');
                return res.status(200).json({
                  success: true,
                  data: simpleData
                });
              } else {
                console.log('⚠️ [Places Autocomplete] Simplified query also returned:', simpleData.status);
              }
            }
          } catch (simpleError) {
            console.warn('⚠️ [Places Autocomplete] Simplified query failed:', simpleError);
          }
        }
      }
      
      // If we still have ZERO_RESULTS after all fallbacks, return it
      return res.status(200).json({
        success: true,
        data: {
          predictions: [],
          status: 'ZERO_RESULTS'
        }
      });
    }
    
    // Check for API errors
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('❌ Places Autocomplete API returned error:', data.status, data.error_message);
      
      // For billing/authentication errors, return a specific status that frontend can handle gracefully
      if (data.status === 'REQUEST_DENIED' || data.status === 'OVER_QUERY_LIMIT') {
        return res.status(503).json({
          success: false,
          message: `Google Places API ${data.status}: ${data.error_message || 'Service unavailable'}`,
          error_message: data.error_message,
          status: data.status,
          fallback_available: true // Signal that frontend should use fallback
        });
      }
      
      return res.status(400).json({
        success: false,
        message: `Places Autocomplete API error: ${data.status}`,
        error_message: data.error_message,
        status: data.status
      });
    }

    console.log('✅ Places Autocomplete API request successful:', {
      predictionsCount: data.predictions?.length || 0,
      status: data.status
    });
    
    // Return the autocomplete data
    return res.status(200).json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('❌ Error in getPlaceAutocomplete controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching place autocomplete',
      error: error.message
    });
  }
};

// Get place details by place_id
export const getPlaceDetails = async (req, res) => {
  try {
    const { place_id, fields = 'formatted_address,geometry,address_components,place_id' } = req.query;
    
    // Validate required parameters
    if (!place_id) {
      return res.status(400).json({
        success: false,
        message: 'place_id is required'
      });
    }

    // Get API key from environment
    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    
    // Log which API key is being used (masked for security)
    if (googleMapsApiKey) {
      const maskedKey = googleMapsApiKey.length > 10 
        ? `${googleMapsApiKey.substring(0, 10)}...${googleMapsApiKey.substring(googleMapsApiKey.length - 4)}`
        : '***';
      console.log('🔑 [Places Details API] Using Google Maps API Key:', maskedKey);
      console.log('🔑 [Places Details API] Key source: process.env.GOOGLE_MAPS_API_KEY');
    } else {
      console.warn('⚠️ [Places Details API] Google Maps API key is NOT configured in environment');
    }
    
    if (!googleMapsApiKey) {
      return res.status(500).json({
        success: false,
        message: 'Google Maps API key is not configured'
      });
    }

    // Build Places Details API URL
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place_id)}&key=${googleMapsApiKey}&fields=${encodeURIComponent(fields)}`;

    console.log('📍 Proxying Places Details API request:', {
      place_id: place_id.substring(0, 30) + '...'
    });

    // Call Google Places Details API
    const response = await fetch(detailsUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Places Details API error:', response.status, errorText);
      return res.status(response.status).json({
        success: false,
        message: `Places Details API error: ${response.status}`,
        error: errorText
      });
    }

    const data = await response.json();
    
    // Check for API errors
    if (data.status && data.status !== 'OK') {
      console.error('❌ Places Details API returned error:', data.status, data.error_message);
      return res.status(400).json({
        success: false,
        message: `Places Details API error: ${data.status}`,
        error_message: data.error_message
      });
    }

    console.log('✅ Places Details API request successful');
    
    // Return the place details
    return res.status(200).json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('❌ Error in getPlaceDetails controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching place details',
      error: error.message
    });
  }
};

