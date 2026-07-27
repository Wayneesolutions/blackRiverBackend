import axios from 'axios';
import { DriverViolation } from '../models/driverViolationModel.js';
import { User } from '../models/driver/userModel.js';
import { FleetUnit } from '../models/fleet/fleetUnitModel.js';

/**
 * Geotab API Integration Service
 * Handles communication with Geotab API and processes vehicle telemetry data
 */

class GeotabService {
  constructor() {
    this.baseUrl = process.env.GEOTAB_API_URL || 'https://my.geotab.com/apiv1';
    this.database = process.env.GEOTAB_DATABASE;
    this.username = process.env.GEOTAB_USERNAME;
    this.password = process.env.GEOTAB_PASSWORD;
    this.sessionId = null;
    
    // Violation thresholds (configurable)
    this.thresholds = {
      speedingMinor: 10, // 10 km/h over limit
      speedingModerate: 20, // 20 km/h over limit
      speedingMajor: 30, // 30 km/h over limit
      harshBrakingGForce: 0.35, // G-force threshold
      harshAccelerationGForce: 0.35,
      excessiveIdlingMinutes: 10,
      hoursOfServiceLimit: 11 // hours
    };
  }

  /**
   * Authenticate with Geotab API
   */
  async authenticate() {
    try {
      const response = await axios.post(this.baseUrl, {
        method: 'Authenticate',
        params: {
          database: this.database,
          userName: this.username,
          password: this.password
        }
      });

      if (response.data && response.data.result) {
        this.sessionId = response.data.result.credentials.sessionId;
        this.database = response.data.result.credentials.database;
        console.log('✅ Geotab authenticated successfully');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Geotab authentication failed:', error.message);
      return false;
    }
  }

  /**
   * Make authenticated API call to Geotab
   */
  async call(method, params = {}) {
    if (!this.sessionId) {
      await this.authenticate();
    }

    try {
      const response = await axios.post(this.baseUrl, {
        method,
        params: {
          ...params,
          credentials: {
            database: this.database,
            sessionId: this.sessionId
          }
        }
      });

      if (response.data && response.data.result) {
        return response.data.result;
      }

      return null;
    } catch (error) {
      // Try re-authentication if session expired
      if (error.response && error.response.status === 401) {
        await this.authenticate();
        return this.call(method, params);
      }
      console.error(`Geotab API call failed (${method}):`, error.message);
      throw error;
    }
  }

  /**
   * Get all devices (vehicles)
   */
  async getDevices() {
    return await this.call('Get', {
      typeName: 'Device'
    });
  }

  /**
   * Get device by serial number or name
   */
  async getDeviceByIdentifier(identifier) {
    const devices = await this.call('Get', {
      typeName: 'Device',
      search: {
        name: identifier
      }
    });
    return devices && devices.length > 0 ? devices[0] : null;
  }

  /**
   * Get speeding violations from Geotab
   */
  async getSpeedingViolations(deviceId, fromDate, toDate, companyId) {
    try {
      const exceptionEvents = await this.call('Get', {
        typeName: 'ExceptionEvent',
        search: {
          deviceSearch: { id: deviceId },
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString(),
          ruleSearch: {
            name: '%Speeding%' // Get all speeding-related rules
          }
        }
      });

      const violations = [];
      for (const event of exceptionEvents || []) {
        const violation = await this.processSpeedingEvent(event, companyId);
        if (violation) {
          violations.push(violation);
        }
      }

      return violations;
    } catch (error) {
      console.error('Error fetching speeding violations:', error);
      return [];
    }
  }

  /**
   * Process speeding event and create violation
   */
  async processSpeedingEvent(event, companyId) {
    try {
      // Get vehicle from database
      const vehicle = await FleetUnit.findOne({
        'geotabData.deviceId': event.device.id,
        company: companyId
      });

      if (!vehicle) {
        console.log(`Vehicle not found for Geotab device ${event.device.id}`);
        return null;
      }

      // Get driver if available
      let driver = null;
      if (event.driver && event.driver.id) {
        driver = await User.findOne({
          'geotabData.driverId': event.driver.id,
          company: companyId
        });
      }

      // Calculate severity
      const speedOver = event.speed - event.speedLimit;
      let severity = 'minor';
      if (speedOver >= this.thresholds.speedingMajor) {
        severity = 'critical';
      } else if (speedOver >= this.thresholds.speedingModerate) {
        severity = 'major';
      } else if (speedOver >= this.thresholds.speedingMinor) {
        severity = 'moderate';
      }

      // Check if violation already exists
      const existingViolation = await DriverViolation.findOne({
        'geotabData.eventId': event.id,
        company: companyId
      });

      if (existingViolation) {
        return null; // Already recorded
      }

      // Create violation
      const violation = {
        driver: driver ? driver._id : null,
        vehicle: vehicle._id,
        company: companyId,
        violationType: 'speeding',
        severity,
        date: new Date(event.activeFrom),
        location: {
          latitude: event.latitude,
          longitude: event.longitude
        },
        violationDetails: {
          speedLimit: event.speedLimit || 0,
          actualSpeed: event.speed || 0,
          speedOver: speedOver
        },
        source: 'geotab',
        geotabData: {
          deviceId: event.device.id,
          eventId: event.id,
          diagnosticId: event.diagnostic ? event.diagnostic.id : null
        },
        description: `Speeding violation: ${speedOver} km/h over the limit`,
        points: this.calculatePoints('speeding', severity),
        status: 'pending'
      };

      return violation;
    } catch (error) {
      console.error('Error processing speeding event:', error);
      return null;
    }
  }

  /**
   * Get harsh braking events
   */
  async getHarshBrakingViolations(deviceId, fromDate, toDate, companyId) {
    try {
      const events = await this.call('Get', {
        typeName: 'ExceptionEvent',
        search: {
          deviceSearch: { id: deviceId },
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString(),
          ruleSearch: {
            name: '%Harsh%Braking%'
          }
        }
      });

      const violations = [];
      for (const event of events || []) {
        const violation = await this.processHarshBrakingEvent(event, companyId);
        if (violation) {
          violations.push(violation);
        }
      }

      return violations;
    } catch (error) {
      console.error('Error fetching harsh braking violations:', error);
      return [];
    }
  }

  /**
   * Process harsh braking event
   */
  async processHarshBrakingEvent(event, companyId) {
    // Similar to processSpeedingEvent
    // Implementation details...
    return null; // Placeholder
  }

  /**
   * Calculate violation points based on type and severity
   */
  calculatePoints(violationType, severity) {
    const pointsMap = {
      speeding: { minor: 1, moderate: 3, major: 5, critical: 10 },
      'harsh-braking': { minor: 1, moderate: 2, major: 3, critical: 5 },
      'harsh-acceleration': { minor: 1, moderate: 2, major: 3, critical: 5 },
      'excessive-idling': { minor: 1, moderate: 2, major: 3, critical: 4 },
      'hours-of-service': { minor: 3, moderate: 5, major: 8, critical: 15 },
      'lane-violation': { minor: 2, moderate: 4, major: 6, critical: 10 },
      'traffic-light': { minor: 3, moderate: 5, major: 8, critical: 12 },
      other: { minor: 1, moderate: 2, major: 3, critical: 5 }
    };

    return pointsMap[violationType]?.[severity] || 1;
  }

  /**
   * Sync violations for a specific company
   */
  async syncViolationsForCompany(companyId, daysBack = 7) {
    try {
      console.log(`🔄 Syncing Geotab violations for company ${companyId}...`);

      // Get company vehicles with Geotab integration
      const vehicles = await FleetUnit.find({
        company: companyId,
        'geotabData.deviceId': { $exists: true, $ne: null }
      });

      if (vehicles.length === 0) {
        console.log('No vehicles with Geotab integration found');
        return { success: true, message: 'No vehicles to sync', violationsCreated: 0 };
      }

      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - daysBack);

      let totalViolations = 0;

      for (const vehicle of vehicles) {
        const deviceId = vehicle.geotabData.deviceId;

        // Get speeding violations
        const speedingViolations = await this.getSpeedingViolations(
          deviceId,
          fromDate,
          toDate,
          companyId
        );

        // Save violations to database
        for (const violationData of speedingViolations) {
          try {
            const violation = new DriverViolation(violationData);
            await violation.save();
            totalViolations++;
          } catch (error) {
            console.error('Error saving violation:', error.message);
          }
        }

        // Get harsh braking violations
        const harshBrakingViolations = await this.getHarshBrakingViolations(
          deviceId,
          fromDate,
          toDate,
          companyId
        );

        for (const violationData of harshBrakingViolations) {
          try {
            const violation = new DriverViolation(violationData);
            await violation.save();
            totalViolations++;
          } catch (error) {
            console.error('Error saving violation:', error.message);
          }
        }
      }

      console.log(`✅ Geotab sync completed: ${totalViolations} violations created`);
      return {
        success: true,
        message: `Successfully synced ${totalViolations} violations`,
        violationsCreated: totalViolations
      };
    } catch (error) {
      console.error('Error syncing Geotab violations:', error);
      return {
        success: false,
        message: error.message,
        violationsCreated: 0
      };
    }
  }
}

// Export singleton instance
export const geotabService = new GeotabService();
export default GeotabService;

