/**
 * Log Controller
 * Handles client-side log submissions from mobile app
 */

export const createLog = async (req, res) => {
  try {
    const { level, message, data, component, timestamp, platform, environment } = req.body;

    // Log to console for debugging (in production, you might want to store in database or external service)
    const logEntry = {
      level: level || 'INFO',
      message: message || 'No message',
      data: data || {},
      component: component || 'unknown',
      timestamp: timestamp || new Date().toISOString(),
      platform: platform || 'unknown',
      environment: environment || 'unknown',
      ip: req.ip || req.connection?.remoteAddress || 'Unknown'
    };

    // Log based on level
    switch (level?.toUpperCase()) {
      case 'ERROR':
        console.error('📱 [CLIENT ERROR]', logEntry);
        break;
      case 'WARN':
        console.warn('📱 [CLIENT WARN]', logEntry);
        break;
      case 'INFO':
        console.log('📱 [CLIENT INFO]', logEntry);
        break;
      default:
        console.log('📱 [CLIENT LOG]', logEntry);
    }

    // In production, you might want to:
    // - Store in MongoDB
    // - Send to external logging service (Sentry, LogRocket, etc.)
    // - Filter sensitive data

    res.status(200).json({
      success: true,
      message: 'Log received'
    });
  } catch (error) {
    console.error('Error processing log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process log'
    });
  }
};

