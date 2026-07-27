import cron from 'node-cron';
import { Vehicle } from '../models/driver/vehicleModel.js';
import { waitForMongoConnection, isMongoConnected } from '../config/mongoConnection.js';

// Service intervals in KM (when to schedule next service)
const SERVICE_INTERVALS = {
  "oil-change": 10000,
  "tire-rotation": 15000,
  "brake-inspection": 20000,
  "general-maintenance": 25000,
  "other": 30000,
  "inspection": 365 // days
};

// Mapping from vehicle model's lastService field names (camelCase) to serviceType (hyphen-case)
const SERVICE_KEY_TO_TYPE = {
  "oilChange": "oil-change",
  "tireRotation": "tire-rotation",
  "brakeInspection": "brake-inspection",
  "generalMaintenance": "general-maintenance",
  "other": "other",
  "inspection": "inspection"
};

// ✅ Calculate upcoming services based on lastService and odometer
const calculateUpcomingServices = (vehicle) => {
  const upcomingServices = [];
  const currentOdometer = vehicle.odometer || 0;
  
  Object.keys(vehicle.lastService || {}).forEach(serviceKey => {
    const serviceType = SERVICE_KEY_TO_TYPE[serviceKey];
    const lastServiceData = vehicle.lastService[serviceKey];
    
    if (serviceType && lastServiceData && lastServiceData.mileage) {
      const lastMileage = lastServiceData.mileage || 0;
      const interval = SERVICE_INTERVALS[serviceType];
      
      if (interval && interval !== 365) { // Skip inspection (days, not km)
        const nextMileage = lastMileage + interval;
        const remainingKm = nextMileage - currentOdometer;
        const dueDate = new Date(lastServiceData.date || Date.now());
        dueDate.setDate(dueDate.getDate() + 90); // 90 days default
        
        upcomingServices.push({
          serviceType: serviceType,
          status: remainingKm < 0 ? "overdue" : "upcoming",
          dueDate: dueDate,
          dueMileage: nextMileage
        });
      }
    }
  });
  
  return upcomingServices;
};

// ✅ Update vehicle upcoming services based on current odometer
const updateVehicleUpcomingServices = async () => {
  try {
    console.log('🔄 Running vehicle upcoming services update job...');
    
    // Wait for MongoDB connection before running
    if (!isMongoConnected()) {
      console.log('⏳ Waiting for MongoDB connection...');
      await waitForMongoConnection(30000);
    }
    
    const vehicles = await Vehicle.find({});
    let updatedCount = 0;

    for (const vehicle of vehicles) {
      const newUpcomingServices = calculateUpcomingServices(vehicle);
      
      // Check if upcoming services have changed
      const hasChanged = JSON.stringify(vehicle.upcomingServices) !== JSON.stringify(newUpcomingServices);
      
      if (hasChanged) {
        vehicle.upcomingServices = newUpcomingServices;
        await vehicle.save();
        updatedCount++;
      }
    }

    console.log(`✅ Updated ${updatedCount} vehicles' upcoming services`);
    return { success: true, updatedCount };
  } catch (error) {
    console.error('❌ Error in vehicle upcoming services update job:', error);
    return { success: false, error: error.message };
  }
};

// ✅ DAILY VEHICLE UPCOMING SERVICES UPDATE JOB
// Runs every day at 8:00 AM (before document status update at 9 AM)
const runVehicleServiceUpdateJob = () => {
    console.log('🔄 Setting up daily vehicle upcoming services update job...');
    
    cron.schedule('0 8 * * *', async () => {
        try {
            console.log('🔄 Running daily vehicle upcoming services update job...');
            
            // Connection check is handled inside updateVehicleUpcomingServices
            const result = await updateVehicleUpcomingServices();
            console.log('✅ Daily vehicle upcoming services update completed:', result);
        } catch (error) {
            console.error('❌ Error in daily vehicle upcoming services update job:', error);
        }
    }, {
        scheduled: true,
        timezone: "UTC"
    });

    console.log('✅ Daily vehicle upcoming services update job scheduled for 8:00 AM UTC');
};

export { runVehicleServiceUpdateJob, updateVehicleUpcomingServices };

