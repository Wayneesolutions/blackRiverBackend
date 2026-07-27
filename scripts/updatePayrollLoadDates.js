import mongoose from 'mongoose';
import Load from '../models/loadModel.js';
import { User } from '../models/driver/userModel.js';
import dotenv from 'dotenv';

dotenv.config();

const updatePayrollLoadDates = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blackriver');
    console.log('✅ Connected to MongoDB');

    // First, delete old test loads
    const deleteResult = await Load.deleteMany({
      'details.internalId': { $in: ['PAYROLL-TEST-001', 'PAYROLL-TEST-002', 'PAYROLL-TEST-003'] }
    });
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} old test loads`);

    // Get the first driver
    const driver = await User.findOne({ role: 'driver' });
    if (!driver) {
      console.log('❌ No driver found');
      await mongoose.connection.close();
      return;
    }

    console.log(`✅ Found driver: ${driver.name} (${driver.internalId})`);

    // Create new loads for current month (November 2025)
    const now = new Date(2025, 10, 1); // November 1, 2025
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
            place: 'Toronto, ON',
            latitude: '43.6532',
            longitude: '-79.3832'
          },
          selectDropOff: {
            place: 'Montreal, QC',
            latitude: '45.5017',
            longitude: '-73.5673'
          },
          selectReturn: null
        },
        status: 'completed',
        assignedAt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // Nov 2
        startedAt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // Nov 2 + 1hr
        completedAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000) // Nov 3
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
            place: 'Montreal, QC',
            latitude: '45.5017',
            longitude: '-73.5673'
          },
          selectDropOff: {
            place: 'Ottawa, ON',
            latitude: '45.4215',
            longitude: '-75.6972'
          },
          selectReturn: null
        },
        status: 'completed',
        assignedAt: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000), // Nov 5
        startedAt: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        completedAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) // Nov 6
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
            place: 'Ottawa, ON',
            latitude: '45.4215',
            longitude: '-75.6972'
          },
          selectDropOff: {
            place: 'Toronto, ON',
            latitude: '43.6532',
            longitude: '-79.3832'
          },
          selectReturn: null
        },
        status: 'completed',
        assignedAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // Nov 8
        startedAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        completedAt: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000) // Nov 9
      }
    ];

    const createdLoads = await Load.insertMany(testLoads);
    console.log(`✅ Created ${createdLoads.length} test loads for November 2025:`);
    createdLoads.forEach(load => {
      console.log(`  - ${load.details.internalId}: Completed ${new Date(load.completedAt).toLocaleDateString()}`);
    });

    await mongoose.connection.close();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
};

updatePayrollLoadDates();

