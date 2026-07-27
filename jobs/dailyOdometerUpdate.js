import cron from 'node-cron';
import { Vehicle } from "../models/driver/vehicleModel.js";
import { Trailer } from "../models/driver/trailerModel.js";
import { updateVehicleByTrackingKey } from "../services/samsara.js";
import { waitForMongoConnection, isMongoConnected } from '../config/mongoConnection.js';
// Note: Termoking integration would go here when implemented
// import { updateTrailerByInternalId } from "../services/termoking.js";

/**
 * Daily job to update odometers from Samsara (vehicles) and Termoking (trailers)
 * This ensures current odometer readings are available for service calculations
 */
async function updateOdometersDaily() {
  try {
    console.log("🔄 Starting daily odometer update from Samsara and Termoking...");
    
    // Update vehicles from Samsara
    const vehicles = await Vehicle.find({ 
      trackingKey: { $exists: true, $ne: null, $ne: "" },
      status: { $ne: "inactive" }
    }).lean();

    console.log(`📊 Found ${vehicles.length} vehicles with tracking keys`);

    let vehiclesUpdated = 0;
    let vehiclesFailed = 0;

    for (const vehicle of vehicles) {
      try {
        // Get company ID for Samsara API call
        const companyId = vehicle.company?.toString() || null;
        
        // Update vehicle from Samsara
        const updatedData = await updateVehicleByTrackingKey(vehicle.trackingKey, companyId);
        
        if (updatedData && updatedData.odometer !== undefined) {
          await Vehicle.findByIdAndUpdate(vehicle._id, {
            odometer: updatedData.odometer,
            currentLocation: updatedData.currentLocation || vehicle.currentLocation,
            speed: updatedData.speed || vehicle.speed,
            fuelLevel: updatedData.fuelLevel || vehicle.fuelLevel,
            engineOn: updatedData.engineOn !== undefined ? updatedData.engineOn : vehicle.engineOn,
            operationStatus: updatedData.operationStatus || vehicle.operationStatus,
            status: updatedData.status || vehicle.status
          });
          vehiclesUpdated++;
        }
      } catch (error) {
        console.error(`❌ Error updating vehicle ${vehicle.internalId || vehicle._id}:`, error.message);
        vehiclesFailed++;
      }
    }

    console.log(`✅ Updated ${vehiclesUpdated} vehicles from Samsara`);
    if (vehiclesFailed > 0) {
      console.log(`⚠️  Failed to update ${vehiclesFailed} vehicles`);
    }

    // Update trailers from Termoking (or use attached vehicle's odometer)
    const trailers = await Trailer.find({
      status: { $ne: "inactive" },
      status: { $ne: "Out of Service" }
    })
    .populate('attachedVehicle', 'odometer internalId')
    .lean();

    console.log(`📊 Found ${trailers.length} active trailers`);

    let trailersUpdated = 0;

    for (const trailer of trailers) {
      try {
        // Priority 1: Use attached truck's odometer (most accurate)
        if (trailer.isAttached && trailer.attachedVehicle && trailer.attachedVehicle.odometer) {
          // Trailer location is already synced with attached vehicle
          // No need to update odometer separately
          trailersUpdated++;
          continue;
        }

        // Priority 2: Update from Termoking if internalId exists
        // TODO: Implement Termoking API integration when available
        // if (trailer.internalId) {
        //   const termokingData = await updateTrailerByInternalId(trailer.internalId);
        //   if (termokingData && termokingData.odometer !== undefined) {
        //     await Trailer.findByIdAndUpdate(trailer._id, {
        //       currentLocation: termokingData.currentLocation || trailer.currentLocation,
        //       speed: termokingData.speed || trailer.speed
        //     });
        //     trailersUpdated++;
        //   }
        // }

        // Note: Trailers don't have odometers, but we track their location
        // Location updates happen via Termoking or attached vehicle tracking
        if (trailer.internalId) {
          // Termoking location updates would go here
          trailersUpdated++;
        }
      } catch (error) {
        console.error(`❌ Error updating trailer ${trailer.trailer || trailer._id}:`, error.message);
      }
    }

    console.log(`✅ Processed ${trailersUpdated} trailers`);
    console.log("✅ Daily odometer update completed");

    return {
      success: true,
      vehiclesUpdated,
      vehiclesFailed,
      trailersProcessed: trailersUpdated
    };
  } catch (error) {
    console.error("❌ Error in daily odometer update:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ✅ DAILY ODOMETER UPDATE JOB
// Runs every day at 6:00 AM UTC (before other maintenance jobs)
const runDailyOdometerUpdateJob = () => {
  console.log('🔄 Setting up daily odometer update job...');
  
  cron.schedule('0 6 * * *', async () => {
    try {
      console.log('🔄 Running daily odometer update job...');
      
      // Wait for MongoDB connection before running
      if (!isMongoConnected()) {
        console.log('⏳ Waiting for MongoDB connection...');
        await waitForMongoConnection(30000);
      }
      
      const result = await updateOdometersDaily();
      console.log('✅ Daily odometer update completed:', result);
    } catch (error) {
      console.error('❌ Error in daily odometer update job:', error);
    }
  }, {
    scheduled: true,
    timezone: "UTC"
  });

  console.log('✅ Daily odometer update job scheduled for 6:00 AM UTC');
};

export { runDailyOdometerUpdateJob, updateOdometersDaily };

