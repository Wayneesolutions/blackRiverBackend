/**
 * API Request Logger Middleware
 * Logs all incoming API requests with method, URL, timestamp, and user info
 */

export const apiLogger = (req, res, next) => {
  // Get timestamp
  const timestamp = new Date().toISOString();
  
  // Get method and URL
  const method = req.method;
  const url = req.originalUrl || req.url;
  const baseUrl = req.baseUrl || '';
  const fullPath = baseUrl + url;
  
  // Get user info from token if available (without blocking request)
  let userInfo = 'Unauthenticated';
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      // Just indicate if token is present, don't decode here (middleware will do that)
      userInfo = 'Token provided';
    }
  } catch (e) {
    // Ignore errors in token checking
  }
  
  // Get IP address
  const ip = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'Unknown';
  
  // Log the API call
  console.log(`\n📡 API Call: ${method} ${fullPath}`);
  console.log(`   └─ Timestamp: ${timestamp}`);
  console.log(`   └─ IP: ${ip}`);
  console.log(`   └─ Auth: ${userInfo}`);
  
  // Log query parameters if present
  if (Object.keys(req.query || {}).length > 0) {
    console.log(`   └─ Query:`, req.query);
  }
  
  // Log body for POST/PUT/PATCH (but limit size for security)
  if (['POST', 'PUT', 'PATCH'].includes(method) && req.body) {
    const bodyPreview = JSON.stringify(req.body).substring(0, 200);
    console.log(`   └─ Body: ${bodyPreview}${JSON.stringify(req.body).length > 200 ? '...' : ''}`);
  }
  
  // Continue to next middleware
  next();
};

