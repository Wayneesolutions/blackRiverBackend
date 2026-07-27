import mongoose from 'mongoose';
import ActivityLog from '../models/activitylogModel.js';
import { User } from '../models/driver/userModel.js';
import Load from '../models/loadModel.js';
import dotenv from 'dotenv';

dotenv.config();

const createDemoNotifications = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blackriver');
    console.log('✅ Connected to MongoDB');

    // Find demo driver by email
    const driver = await User.findOne({ email: 'demodriver@gmail.com' });
    if (!driver) {
      console.log('❌ Demo driver not found. Email: demodriver@gmail.com');
      console.log('   Creating notifications for all drivers instead...');
      
      // Find all drivers
      const allDrivers = await User.find({ role: 'driver' }).limit(5);
      if (allDrivers.length === 0) {
        console.log('❌ No drivers found in database');
        await mongoose.connection.close();
        return;
      }
      
      // Create notifications for all drivers
      for (const drv of allDrivers) {
        await createNotificationsForDriver(drv._id);
      }
      
      console.log(`✅ Created demo notifications for ${allDrivers.length} drivers`);
      await mongoose.connection.close();
      return;
    }

    console.log(`✅ Found driver: ${driver.name} (ID: ${driver._id})`);

    // Create demo notifications for this driver
    await createNotificationsForDriver(driver._id);

    console.log('✅ Demo notifications created successfully!');
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error creating demo notifications:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

const createNotificationsForDriver = async (driverId) => {
  try {
    // Check if notifications already exist for this driver
    const existingCount = await ActivityLog.countDocuments({ driver: driverId });
    if (existingCount > 0) {
      console.log(`   ℹ️  Driver already has ${existingCount} notifications. Adding more...`);
    }

    // Get some loads for this driver to reference
    const loads = await Load.find({ 'details.driver': driverId }).limit(5);
    
    // Create various types of notifications
    const notifications = [
      {
        driver: driverId,
        action: 'Load Completed',
        changeSummary: loads[0] 
          ? `Load ${loads[0].details?.internalId || loads[0]._id.toString().slice(-6)} has been completed. Great job!`
          : 'Load LD-001 has been completed. Great job!',
        performedBy: null,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      },
      {
        driver: driverId,
        action: 'Load Delivered',
        changeSummary: loads[1]
          ? `Load ${loads[1].details?.internalId || loads[1]._id.toString().slice(-6)} has been delivered successfully`
          : 'Load LD-002 has been delivered successfully',
        performedBy: null,
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000) // 5 hours ago
      },
      {
        driver: driverId,
        action: 'Load Started',
        changeSummary: loads[2]
          ? `Load ${loads[2].details?.internalId || loads[2]._id.toString().slice(-6)} has been started`
          : 'Load LD-003 has been started',
        performedBy: null,
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
      },
      {
        driver: driverId,
        action: 'Load Completed',
        changeSummary: loads[3]
          ? `Load ${loads[3].details?.internalId || loads[3]._id.toString().slice(-6)} has been completed. Excellent work!`
          : 'Load LD-004 has been completed. Excellent work!',
        performedBy: null,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
      },
      {
        driver: driverId,
        action: 'Load Delivered',
        changeSummary: loads[4]
          ? `Load ${loads[4].details?.internalId || loads[4]._id.toString().slice(-6)} has been delivered successfully`
          : 'Load LD-005 has been delivered successfully',
        performedBy: null,
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
      },
      {
        driver: driverId,
        action: 'Load Started',
        changeSummary: 'New load assignment: Load LD-006 from Toronto to Montreal',
        performedBy: null,
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // 4 days ago
      },
      {
        driver: driverId,
        action: 'Load Completed',
        changeSummary: 'Load LD-007 has been completed. Outstanding performance!',
        performedBy: null,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      },
      {
        driver: driverId,
        action: 'Load Delivered',
        changeSummary: 'Load LD-008 has been delivered successfully. Keep up the great work!',
        performedBy: null,
        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) // 6 days ago
      }
    ];

    // Insert notifications
    const created = await ActivityLog.insertMany(notifications);
    console.log(`   ✅ Created ${created.length} notifications for driver ${driverId}`);
    
    return created;
  } catch (error) {
    console.error(`   ❌ Error creating notifications for driver ${driverId}:`, error.message);
    throw error;
  }
};

// Run the script
createDemoNotifications();

