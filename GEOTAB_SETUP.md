# Geotab Integration Setup Guide

## Overview
This guide will help you configure the Geotab integration for automatic driver violation tracking from your fleet telematics system.

## Prerequisites
1. Active Geotab account with API access
2. Geotab database name
3. Geotab API credentials (username/password)

## Environment Variables

Add the following variables to your `.env` file:

```env
# Geotab API Configuration
GEOTAB_API_URL=https://my.geotab.com/apiv1
GEOTAB_DATABASE=your_database_name
GEOTAB_USERNAME=your_geotab_username
GEOTAB_PASSWORD=your_geotab_password
```

### How to Get Geotab Credentials:

1. **Database Name**: 
   - Log in to MyGeotab (https://my.geotab.com)
   - Your database name is visible in the URL after login: `https://my.geotab.com/USERNAME.geotab.com/#...`
   - The part before `.geotab.com` is your database name

2. **API Username/Password**:
   - Use your MyGeotab login credentials
   - For production, consider creating a dedicated API user with read-only permissions
   - Contact Geotab support if you need help setting up API access

## Fleet Unit Configuration

For each vehicle in your fleet, you need to link it to its Geotab device:

1. Go to Fleet Management > Fleet Units
2. Edit each vehicle
3. Add the Geotab Device ID in the vehicle's settings
   - Find Device ID in MyGeotab under Administration > Devices
   - The Device ID format is usually like: `b1234`

### Database Schema Addition

The FleetUnit model needs a `geotabData` field:

```javascript
geotabData: {
  deviceId: String,  // Geotab device ID
  deviceName: String, // Device name for reference
  lastSync: Date     // Last sync timestamp
}
```

## Driver Configuration

Link drivers to their Geotab driver IDs:

1. Go to HR > Employees
2. Edit each driver
3. Add the Geotab Driver ID
   - Find in MyGeotab under Users & Drivers
   - Format is usually like: `b5678`

### Database Schema Addition

The User model needs a `geotabData` field:

```javascript
geotabData: {
  driverId: String,  // Geotab driver ID
  keyId: String,     // Geotab key ID if applicable
  lastSync: Date     // Last sync timestamp
}
```

## Violation Types Tracked

The system automatically tracks the following violations from Geotab:

1. **Speeding**: Exceeding posted speed limits
2. **Harsh Braking**: Sudden deceleration events
3. **Harsh Acceleration**: Aggressive acceleration events
4. **Excessive Idling**: Engine running while stationary for extended periods
5. **Hours of Service**: Driving beyond allowed hours

## Configuring Thresholds

You can adjust violation detection thresholds in `logistiqbackend/services/geotabService.js`:

```javascript
this.thresholds = {
  speedingMinor: 10,        // 10 km/h over limit
  speedingModerate: 20,     // 20 km/h over limit
  speedingMajor: 30,        // 30 km/h over limit
  harshBrakingGForce: 0.35, // G-force threshold
  harshAccelerationGForce: 0.35,
  excessiveIdlingMinutes: 10,
  hoursOfServiceLimit: 11   // hours
};
```

## Syncing Violations

### Manual Sync (via UI)
1. Navigate to Health & Safety > Driver Violations
2. Click "Sync from Geotab" button
3. Select number of days to sync (default: 7 days)

### Programmatic Sync
```javascript
import { geotabService } from './services/geotabService.js';

// Sync violations for a specific company
await geotabService.syncViolationsForCompany(companyId, daysBack);
```

### Automated Sync (Scheduled Job)
Add to your cron jobs in `logistiqbackend/jobs/`:

```javascript
import cron from 'node-cron';
import { geotabService } from '../services/geotabService.js';

// Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Running Geotab violation sync...');
  
  // Get all companies
  const companies = await CompanySettings.find({ geotabEnabled: true });
  
  for (const company of companies) {
    await geotabService.syncViolationsForCompany(company._id, 1); // Sync last 1 day
  }
});
```

## Violation Points System

Each violation type is assigned points based on severity:

| Violation Type | Minor | Moderate | Major | Critical |
|----------------|-------|----------|-------|----------|
| Speeding | 1 | 3 | 5 | 10 |
| Harsh Braking | 1 | 2 | 3 | 5 |
| Harsh Acceleration | 1 | 2 | 3 | 5 |
| Excessive Idling | 1 | 2 | 3 | 4 |
| Hours of Service | 3 | 5 | 8 | 15 |
| Lane Violation | 2 | 4 | 6 | 10 |
| Traffic Light | 3 | 5 | 8 | 12 |
| Other | 1 | 2 | 3 | 5 |

## Troubleshooting

### Common Issues:

1. **Authentication Failed**
   - Verify your Geotab credentials are correct
   - Check if your API user has proper permissions
   - Ensure database name is correct

2. **No Violations Syncing**
   - Verify vehicles have Geotab Device IDs configured
   - Check if Geotab has exception rules configured
   - Ensure date range has actual violations in Geotab

3. **Duplicate Violations**
   - The system automatically prevents duplicates using Geotab event IDs
   - If seeing duplicates, check the `geotabData.eventId` field

### Debug Logging

Enable debug logging in `geotabService.js`:

```javascript
console.log('Geotab API Call:', method, params);
console.log('Geotab Response:', response.data);
```

## API Endpoints

### Violation Management
- `GET /api/v1/violations` - Get all violations with filters
- `GET /api/v1/violations/stats` - Get violation statistics
- `GET /api/v1/violations/:id` - Get single violation
- `POST /api/v1/violations` - Create manual violation
- `PUT /api/v1/violations/:id` - Update violation
- `DELETE /api/v1/violations/:id` - Delete violation
- `POST /api/v1/violations/sync-geotab` - Trigger Geotab sync
- `GET /api/v1/violations/driver/:driverId` - Get driver's violation summary

## Frontend Access

Violations are displayed in two places:

1. **Compliance Monthly Report**: `/compliance/monthly-report`
   - Shows real violation data in the Driver Violations section
   - Automatically updates compliance scores based on violations

2. **Driver Violations Management**: `/healthandsafety/violations`
   - Full violations management interface
   - Filtering, searching, and detailed views
   - Manual sync and violation creation

## Security Considerations

1. **API Credentials**: Store in environment variables, never commit to code
2. **API User Permissions**: Use read-only Geotab user when possible
3. **Rate Limiting**: Geotab has API rate limits, avoid excessive syncing
4. **Data Privacy**: Violations contain driver and location data - handle securely

## Support

For Geotab-specific questions:
- Geotab Support: https://support.geotab.com
- API Documentation: https://geotab.github.io/sdk/software/api/reference/

For integration issues:
- Contact your system administrator
- Check application logs for error details

