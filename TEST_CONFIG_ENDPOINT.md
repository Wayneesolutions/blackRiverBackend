# Test Config Endpoint

## Verify Backend Returns Google Maps API Key

### Step 1: Check if Backend .env has the Key

Make sure your backend `.env` file has:
```
GOOGLE_MAPS_API_KEY=AIzaSyCv8vuE1jOgt-F6Szqvfn1DPrQdbPn5aEI
```

### Step 2: Test the Endpoint Directly

**Using curl:**
```bash
curl http://localhost:3000/api/v1/config
```

**Using browser:**
```
http://localhost:3000/api/v1/config
```

**Using PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/config" -Method Get
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "googleMapsApiKey": "AIzaSyCv8vuE1jOgt-F6Szqvfn1DPrQdbPn5aEI"
  }
}
```

### Step 3: Check What Your App is Receiving

Since the app is calling this endpoint, check:
1. Does the response have `success: true`?
2. Does `data.googleMapsApiKey` contain the actual key (not empty string)?

### Step 4: Add Logging to Backend

If the key is empty, add logging to `configController.js`:

```javascript
export const getPublicConfig = async (req, res) => {
  try {
    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    
    console.log('🔑 Config endpoint called:', {
      hasKey: !!process.env.GOOGLE_MAPS_API_KEY,
      keyLength: googleMapsApiKey.length,
      keyPreview: googleMapsApiKey ? `${googleMapsApiKey.substring(0, 10)}...` : 'EMPTY'
    });
    
    return res.status(200).json({
      success: true,
      data: {
        googleMapsApiKey: googleMapsApiKey,
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
```


