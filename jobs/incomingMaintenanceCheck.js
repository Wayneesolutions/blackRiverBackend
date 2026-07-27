import cron from 'node-cron';
import { VehicleService } from '../models/driver/vehicleService.js';
import { FleetUnit } from '../models/fleet/fleetUnitModel.js';
import { waitForMongoConnection, isMongoConnected } from '../config/mongoConnection.js';

/**
 * Calculate incoming maintenance count for all companies
 * Services are considered "incoming" if:
 * - Due date is within 30 days, OR
 * - Due mileage is within 7,500 km, OR
 * - Based on fleet unit service intervals (days/mileage)
 */
const calculateIncomingMaintenance = async () => {
  try {
    console.log('🔄 [INCOMING MAINTENANCE] Calculating incoming maintenance count...');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    thirtyDaysFromNow.setHours(23, 59, 59, 999);

    // Get all pending and in-progress services
    const services = await VehicleService.find({
      status: { $in: ['pending', 'in-progress'] }
    })
      .populate("vehicleId", "internalId plateNumber odometer")
      .lean();

    // Get all fleet units with service intervals
    const unitNumbers = [...new Set(services.map(s => s.unitNumber).filter(Boolean))];
    const fleetUnits = unitNumbers.length > 0 
      ? await FleetUnit.find({ 
          unitNo: { $in: unitNumbers }
        })
          .select("unitNo serviceIntervalDays serviceIntervalMileage currentOdometer company")
          .lean()
      : [];
    
    const fleetUnitsMap = new Map(fleetUnits.map(fu => [fu.unitNo, fu]));

    // Group by company
    const companyCounts = new Map();

    services.forEach(service => {
      const companyId = service.company?.toString() || 'no-company';
      
      if (!companyCounts.has(companyId)) {
        companyCounts.set(companyId, {
          incoming: 0,
          dueSoon: 0,
          overdue: 0
        });
      }

      const counts = companyCounts.get(companyId);
      let isIncoming = false;
      let isDueSoon = false;
      let isOverdue = false;

      // Check by due date
      if (service.dueDate) {
        const dueDate = new Date(service.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilDue >= 0 && daysUntilDue <= 30) {
          isIncoming = true;
          if (daysUntilDue >= 0 && daysUntilDue <= 7) {
            isDueSoon = true;
          }
        }
        if (daysUntilDue < 0) {
          isOverdue = true;
          isIncoming = true;
        }
      }

      // Check by mileage (within 7,500 km)
      if (service.dueMileage && service.odometer !== undefined) {
        const remainingKm = service.dueMileage - service.odometer;
        if (remainingKm >= 0 && remainingKm <= 7500) {
          isIncoming = true;
        }
        if (remainingKm < 0) {
          isOverdue = true;
          isIncoming = true;
        }
      }

      // Check using fleet unit service intervals
      const fleetUnit = service.unitNumber ? fleetUnitsMap.get(service.unitNumber) : null;
      if (fleetUnit) {
        // Check mileage interval
        if (fleetUnit.serviceIntervalMileage && fleetUnit.currentOdometer !== undefined) {
          // Calculate next service based on interval
          // We need to find the last service mileage - for now use dueMileage as reference
          if (service.dueMileage) {
            const lastServiceMileage = service.dueMileage - fleetUnit.serviceIntervalMileage;
            const nextServiceMileage = lastServiceMileage + fleetUnit.serviceIntervalMileage;
            const remainingKm = nextServiceMileage - fleetUnit.currentOdometer;
            
            if (remainingKm >= 0 && remainingKm <= 7500) {
              isIncoming = true;
            }
            if (remainingKm < 0) {
              isOverdue = true;
              isIncoming = true;
            }
          }
        }

        // Check days interval
        if (fleetUnit.serviceIntervalDays && service.serviceDate) {
          const lastServiceDate = new Date(service.serviceDate);
          const nextServiceDate = new Date(lastServiceDate);
          nextServiceDate.setDate(nextServiceDate.getDate() + fleetUnit.serviceIntervalDays);
          const daysUntilDue = Math.ceil((nextServiceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysUntilDue >= 0 && daysUntilDue <= 30) {
            isIncoming = true;
            if (daysUntilDue >= 0 && daysUntilDue <= 7) {
              isDueSoon = true;
            }
          }
          if (daysUntilDue < 0) {
            isOverdue = true;
            isIncoming = true;
          }
        }
      }

      if (isIncoming) counts.incoming++;
      if (isDueSoon) counts.dueSoon++;
      if (isOverdue) counts.overdue++;
    });

    console.log(`✅ [INCOMING MAINTENANCE] Calculated counts for ${companyCounts.size} company/companies`);
    
    // Store counts (you can store in a cache, database, or return)
    // For now, we'll just log it - you can extend this to store in a MaintenanceNotification model
    const results = {};
    companyCounts.forEach((counts, companyId) => {
      results[companyId] = counts;
      console.log(`   Company ${companyId}: ${counts.incoming} incoming, ${counts.dueSoon} due soon, ${counts.overdue} overdue`);
    });

    return { success: true, results };
  } catch (error) {
    console.error('❌ [INCOMING MAINTENANCE] Error calculating incoming maintenance:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Daily cron job to check for incoming maintenance
 * Runs every day at 9:00 AM UTC (after vehicle service update at 8 AM)
 */
const runIncomingMaintenanceCheckJob = () => {
  console.log('🔄 [INCOMING MAINTENANCE] Setting up daily incoming maintenance check job...');
  
  cron.schedule('0 9 * * *', async () => {
    try {
      console.log('🔄 [INCOMING MAINTENANCE] Running daily incoming maintenance check...');
      
      // Wait for MongoDB connection
      if (!isMongoConnected()) {
        console.log('⏳ [INCOMING MAINTENANCE] Waiting for MongoDB connection...');
        await waitForMongoConnection(30000);
      }
      
      const result = await calculateIncomingMaintenance();
      console.log('✅ [INCOMING MAINTENANCE] Daily check completed:', result);
    } catch (error) {
      console.error('❌ [INCOMING MAINTENANCE] Error in daily check job:', error);
    }
  }, {
    scheduled: true,
    timezone: "UTC"
  });

  console.log('✅ [INCOMING MAINTENANCE] Daily incoming maintenance check job scheduled for 9:00 AM UTC');
};

export { runIncomingMaintenanceCheckJob, calculateIncomingMaintenance };

