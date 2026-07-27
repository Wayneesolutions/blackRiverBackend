import mongoose from 'mongoose';
import Load from '../models/loadModel.js';
import { User } from '../models/driver/userModel.js';
import { haversineDistance } from '../utils/distance.js';
import dotenv from 'dotenv';

dotenv.config();

const verifyPayrollLoads = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blackriver');
    console.log('✅ Connected to MongoDB');

    const driver = await User.findOne({ role: 'driver' });
    if (!driver) {
      console.log('❌ No driver found');
      await mongoose.connection.close();
      return;
    }

    console.log(`\n📋 Driver: ${driver.name} (${driver.internalId})`);
    console.log(`💰 Mile Rate: $${driver.details?.mileRate || 0}/mile`);

    const loads = await Load.find({ 
      'details.driver': driver._id, 
      status: 'completed' 
    }).sort({ completedAt: -1 });

    console.log(`\n📦 Found ${loads.length} completed loads\n`);

    let totalMiles = 0;
    let totalEarnings = 0;

    loads.forEach((load, index) => {
      let distance = 0;
      
      if (load.route?.selectPickup && load.route?.selectDropOff) {
        distance = haversineDistance(
          parseFloat(load.route.selectPickup.latitude),
          parseFloat(load.route.selectPickup.longitude),
          parseFloat(load.route.selectDropOff.latitude),
          parseFloat(load.route.selectDropOff.longitude)
        );
      }

      const distanceInMiles = distance * 0.621371;
      const earnings = distanceInMiles * (driver.details?.mileRate || 0);

      totalMiles += distanceInMiles;
      totalEarnings += earnings;

      console.log(`Load ${index + 1}: ${load.details?.internalId || 'N/A'}`);
      console.log(`  Route: ${load.route?.selectPickup?.place} → ${load.route?.selectDropOff?.place}`);
      console.log(`  Distance: ${Math.round(distance)} km (${Math.round(distanceInMiles)} miles)`);
      console.log(`  Earnings: $${earnings.toFixed(2)}`);
      console.log(`  Completed: ${load.completedAt ? new Date(load.completedAt).toLocaleDateString() : 'N/A'}\n`);
    });

    console.log('═══════════════════════════════════════════════');
    console.log(`📊 TOTAL: ${Math.round(totalMiles)} miles`);
    console.log(`💰 TOTAL EARNINGS: $${totalEarnings.toFixed(2)}`);
    console.log('═══════════════════════════════════════════════');

    await mongoose.connection.close();
    console.log('\n✅ Verification complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
};

verifyPayrollLoads();


