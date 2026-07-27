// Get public configuration (including Google Maps API key)
export const getPublicConfig = async (req, res) => {
  try {
    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    
    // Debug logging to verify API key is available
    const maskedKey = googleMapsApiKey.length > 10 
      ? `${googleMapsApiKey.substring(0, 10)}...${googleMapsApiKey.substring(googleMapsApiKey.length - 4)}`
      : 'EMPTY';
    
    console.log('🔑 [Config API] Config endpoint called:', {
      hasKey: !!process.env.GOOGLE_MAPS_API_KEY,
      keyLength: googleMapsApiKey.length,
      keyPreview: maskedKey,
      keySource: 'process.env.GOOGLE_MAPS_API_KEY',
      timestamp: new Date().toISOString()
    });
    
    return res.status(200).json({
      success: true,
      data: {
        googleMapsApiKey: googleMapsApiKey,
        // Add other public config here if needed
      }
    });
  } catch (error) {
    console.error('Error fetching public config:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching configuration'
    });
  }
};

