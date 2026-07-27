import mongoose from 'mongoose';
import Load from '../models/loadModel.js';
import { User } from '../models/driver/userModel.js';
import dotenv from 'dotenv';

dotenv.config();

const testQuery = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blackriver');
    console.log('✅ Connected to MongoDB');

    // Get driver
    const driver = await User.findOne({ name: /test admin/i, role: 'driver' });
    if (!driver) {
      console.log('❌ Driver not found');
      await mongoose.connection.close();
      return;
    }

    console.log(`\n📋 Driver: ${driver.name}`);
    console.log(`   ID: ${driver._id}`);
    console.log(`   Company: ${driver.company}`);
    console.log(`   Mile Rate: ${driver.details?.mileRate || 'Not set'}`);

    // Check loads
    const allLoads = await Load.find({ 'details.driver': driver._id });
    console.log(`\n📦 Total loads for driver: ${allLoads.length}`);

    const testLoads = await Load.find({
      'details.driver': driver._id,
      'details.internalId': { $in: ['PAYROLL-TEST-001', 'PAYROLL-TEST-002', 'PAYROLL-TEST-003'] }
    });

    console.log(`\n📦 Test loads found: ${testLoads.length}`);
    testLoads.forEach(load => {
      console.log(`\n  - ${load.details?.internalId}`);
      console.log(`    Company: ${load.company}`);
      console.log(`    Status: ${load.status}`);
      console.log(`    AssignedAt: ${load.assignedAt}`);
      console.log(`    CreatedAt: ${load.createdAt}`);
      console.log(`    CompletedAt: ${load.completedAt}`);
    });

    // Test date range query (last 30 days)
    const now = new Date();
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);

    console.log(`\n📅 Testing date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const dateFilteredLoads = await Load.find({
      'details.driver': driver._id,
      $or: [
        { assignedAt: { $gte: startDate, $lte: endDate } },
        { createdAt: { $gte: startDate, $lte: endDate } }
      ]
    });

    console.log(`📦 Loads in date range: ${dateFilteredLoads.length}`);

    // Test with company filter
    if (driver.company) {
      const companyFilteredLoads = await Load.find({
        'details.driver': driver._id,
        company: driver.company,
        $or: [
          { assignedAt: { $gte: startDate, $lte: endDate } },
          { createdAt: { $gte: startDate, $lte: endDate } }
        ]
      });

      console.log(`📦 Loads with company filter: ${companyFilteredLoads.length}`);
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
  }
};

testQuery();

