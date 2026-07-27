import mongoose from 'mongoose';
import Load from '../models/loadModel.js';
import { User } from '../models/driver/userModel.js';
import dotenv from 'dotenv';

dotenv.config();

// Haversine distance calculation (same as in loadController)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

const createPayrollTestLoads = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blackriver');
    console.log('✅ Connected to MongoDB');

    // Get the driver by name (test admin) or get first driver
    const driverName = process.argv[2] || 'test admin';
    let driver = await User.findOne({ 
      $or: [
        { name: { $regex: driverName, $options: 'i' } },
        { email: { $regex: driverName, $options: 'i' } }
      ],
      role: 'driver'
    });
    
    // If not found by name, get first driver
    if (!driver) {
      driver = await User.findOne({ role: 'driver' });
    }
    
    if (!driver) {
      console.log('❌ No driver found in database');
      await mongoose.connection.close();
      return;
    }

    console.log(`✅ Found driver: ${driver.name} (${driver.internalId || driver.email})`);
    console.log(`   Company: ${driver.company || 'No company assigned'}`);

    // Set mile rate for the driver if not set
    if (!driver.details?.mileRate || driver.details.mileRate === 0) {
      if (!driver.details) {
        driver.details = {};
      }
      driver.details.mileRate = 0.50; // $0.50 per mile (default)
      await driver.save();
      console.log('✅ Set driver mile rate to $0.50/mile');
    } else {
      console.log(`💰 Driver mile rate: $${driver.details.mileRate}/mile`);
    }

    // Use current month date range (last 30 days to ensure loads are within range)
    const now = new Date();
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999); // End of today
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30); // 30 days ago
    startDate.setHours(0, 0, 0, 0);
    
    console.log(`📅 Creating loads between ${startDate.toLocaleDateString()} and ${endDate.toLocaleDateString()}`);

    // Delete old test loads first to avoid duplicates
    const deletedCount = await Load.deleteMany({
      'details.driver': driver._id,
      'details.internalId': { $in: ['PAYROLL-TEST-001', 'PAYROLL-TEST-002', 'PAYROLL-TEST-003', 'PAYROLL-TEST-004', 'PAYROLL-TEST-005'] }
    });
    
    if (deletedCount.deletedCount > 0) {
      console.log(`🗑️  Deleted ${deletedCount.deletedCount} old test loads`);
    }

    // Create test loads for payroll within the specified date range
    const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
    const daysBetween = daysDiff / 5; // Spread 5 loads across the date range
    
    const testLoads = [
      {
        details: {
          internalId: 'PAYROLL-TEST-001',
          customer: null,
          driver: driver._id,
          vehicle: null,
          amount: 0,
          rate: 0
        },
        route: {
          multipleDropOffs: false,
          selectPickup: {
            place: 'Toronto, ON, Canada',
            latitude: '43.6532',
            longitude: '-79.3832'
          },
          selectDropOff: {
            place: 'Montreal, QC, Canada',
            latitude: '45.5017',
            longitude: '-73.5673'
          },
          selectReturn: null
        },
        company: driver.company || null,
        status: 'completed'
      },
      {
        details: {
          internalId: 'PAYROLL-TEST-002',
          customer: null,
          driver: driver._id,
          vehicle: null,
          amount: 0,
          rate: 0
        },
        route: {
          multipleDropOffs: false,
          selectPickup: {
            place: 'Montreal, QC, Canada',
            latitude: '45.5017',
            longitude: '-73.5673'
          },
          selectDropOff: {
            place: 'Ottawa, ON, Canada',
            latitude: '45.4215',
            longitude: '-75.6972'
          },
          selectReturn: null
        },
        company: driver.company || null,
        status: 'completed'
      },
      {
        details: {
          internalId: 'PAYROLL-TEST-003',
          customer: null,
          driver: driver._id,
          vehicle: null,
          amount: 0,
          rate: 0
        },
        route: {
          multipleDropOffs: false,
          selectPickup: {
            place: 'Ottawa, ON, Canada',
            latitude: '45.4215',
            longitude: '-75.6972'
          },
          selectDropOff: {
            place: 'Toronto, ON, Canada',
            latitude: '43.6532',
            longitude: '-79.3832'
          },
          selectReturn: null
        },
        company: driver.company || null,
        status: 'completed'
      },
      {
        details: {
          internalId: 'PAYROLL-TEST-004',
          customer: null,
          driver: driver._id,
          vehicle: null,
          amount: 0,
          rate: 0
        },
        route: {
          multipleDropOffs: false,
          selectPickup: {
            place: 'Toronto, ON, Canada',
            latitude: '43.6532',
            longitude: '-79.3832'
          },
          selectDropOff: {
            place: 'Hamilton, ON, Canada',
            latitude: '43.2557',
            longitude: '-79.8711'
          },
          selectReturn: null
        },
        company: driver.company || null,
        status: 'completed'
      },
      {
        details: {
          internalId: 'PAYROLL-TEST-005',
          customer: null,
          driver: driver._id,
          vehicle: null,
          amount: 0,
          rate: 0
        },
        route: {
          multipleDropOffs: false,
          selectPickup: {
            place: 'Hamilton, ON, Canada',
            latitude: '43.2557',
            longitude: '-79.8711'
          },
          selectDropOff: {
            place: 'London, ON, Canada',
            latitude: '42.9849',
            longitude: '-81.2453'
          },
          selectReturn: null
        },
        company: driver.company || null,
        status: 'completed'
      }
    ];

    // Set dates for each load, spreading them across the date range
    // Make sure dates are within the range and use assignedAt/createdAt for filtering
    testLoads.forEach((load, index) => {
      const daysAgo = Math.floor(daysBetween * (index + 1));
      const completedDate = new Date(endDate);
      completedDate.setDate(completedDate.getDate() - daysAgo);
      
      // Set assignedAt and createdAt to the same date (API filters by both)
      load.assignedAt = new Date(completedDate);
      load.assignedAt.setHours(8, 0, 0, 0);
      load.createdAt = new Date(completedDate); // Also set createdAt for date filtering
      load.createdAt.setHours(8, 0, 0, 0);
      load.startedAt = new Date(completedDate);
      load.startedAt.setHours(9, 0, 0, 0);
      load.completedAt = new Date(completedDate);
      load.completedAt.setHours(16, 0, 0, 0);
    });

    const createdLoads = await Load.insertMany(testLoads);
    console.log(`✅ Created ${createdLoads.length} test loads for payroll:`);
    createdLoads.forEach((load, index) => {
      const miles = load.route?.selectPickup && load.route?.selectDropOff 
        ? Math.round(calculateDistance(
            parseFloat(load.route.selectPickup.latitude),
            parseFloat(load.route.selectPickup.longitude),
            parseFloat(load.route.selectDropOff.latitude),
            parseFloat(load.route.selectDropOff.longitude)
          ) * 0.621371)
        : 0;
      const earnings = miles * (driver.details?.mileRate || 0.50);
      console.log(`  - ${load.details.internalId}: ${load.status}`);
      console.log(`    Route: ${load.route?.selectPickup?.place} → ${load.route?.selectDropOff?.place}`);
      console.log(`    Completed: ${load.completedAt ? new Date(load.completedAt).toLocaleDateString() : 'N/A'}`);
      console.log(`    Distance: ~${miles} miles, Earnings: $${earnings.toFixed(2)}`);
    });
    
    // Calculate total
    const totalMiles = createdLoads.reduce((sum, load) => {
      if (load.route?.selectPickup && load.route?.selectDropOff) {
        const km = calculateDistance(
          parseFloat(load.route.selectPickup.latitude),
          parseFloat(load.route.selectPickup.longitude),
          parseFloat(load.route.selectDropOff.latitude),
          parseFloat(load.route.selectDropOff.longitude)
        );
        return sum + Math.round(km * 0.621371);
      }
      return sum;
    }, 0);
    const totalEarnings = totalMiles * (driver.details?.mileRate || 0.50);
    console.log(`\n📊 Total: ${totalMiles} miles, $${totalEarnings.toFixed(2)} earnings`);

    await mongoose.connection.close();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
};

createPayrollTestLoads();

