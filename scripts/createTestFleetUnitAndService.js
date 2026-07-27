import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FleetUnit } from '../models/fleet/fleetUnitModel.js';
import { VehicleService } from '../models/driver/vehicleService.js';
import { User } from '../models/driver/userModel.js';
import { CompanySettings } from '../models/driver/companysettingsModel.js';

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/logistiq';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const createTestFleetUnitAndService = async () => {
  try {
    await connectDB();

    // Get company ID from environment, or find first user with company, or use first company
    let companyId = process.env.TEST_COMPANY_ID || null;
    
    if (!companyId) {
      // Try to find CompanySettings directly first
      const company = await CompanySettings.findOne().select('_id').lean();
      if (company && company._id) {
        companyId = company._id.toString();
        console.log('📋 Found company from CompanySettings:', companyId);
      } else {
        // Try to find a user with a company
        const userWithCompany = await User.findOne({ company: { $exists: true, $ne: null } })
          .select('company')
          .lean();
        
        if (userWithCompany && userWithCompany.company) {
          companyId = typeof userWithCompany.company === 'object' && userWithCompany.company._id
            ? userWithCompany.company._id.toString()
            : userWithCompany.company.toString();
          console.log('📋 Found company from user:', companyId);
        }
      }
    }
    
    if (!companyId) {
      console.log('⚠️  No company ID found. Creating test data without company filter.');
      console.log('   Note: If you have company-based filtering, this data may not appear in your API responses.');
      console.log('   You can set TEST_COMPANY_ID in .env file to specify a company ID.');
    } else {
      console.log('✅ Using company ID:', companyId);
    }

    // Create a test fleet unit
    const testUnit = new FleetUnit({
      unitNo: `TEST-${Date.now()}`,
      internalId: `TEST-INT-${Date.now()}`,
      unitType: 'Truck',
      makeModel: 'Test Truck Model',
      make: 'Test',
      model: 'Truck Model',
      vinNo: `TEST-VIN-${Date.now()}`,
      licensePlate: `TEST-${Math.floor(Math.random() * 10000)}`,
      year: 2020,
      truckType: 'Semi-Truck',
      initialOdometer: 50000,
      currentOdometer: 55000,
      status: 'Active',
      operationStatus: 'available',
      serviceIntervalDays: 90, // Service every 90 days
      serviceIntervalMileage: 10000, // Service every 10,000 km
      company: companyId,
    });

    await testUnit.save();
    console.log('✅ Test Fleet Unit created:', testUnit.unitNo);

    // Create a test service that will be "incoming" (due within 30 days)
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days (within 30 days)

    const testService = new VehicleService({
      unitNumber: testUnit.unitNo,
      unitType: testUnit.unitType,
      makeModel: testUnit.makeModel,
      serviceType: 'oil-change',
      priority: 'high',
      dueDate: dueDate,
      dueMileage: 60000, // Current odometer is 55000, so 5000 km remaining (within 7500 km)
      assignedMechanic: 'Test Mechanic',
      description: 'Test service for notification testing',
      status: 'pending',
      odometer: testUnit.currentOdometer,
      company: companyId,
    });

    await testService.save();
    console.log('✅ Test Service created:', testService._id);
    console.log('   - Unit Number:', testService.unitNumber);
    console.log('   - Due Date:', testService.dueDate.toISOString().split('T')[0]);
    console.log('   - Due Mileage:', testService.dueMileage);
    console.log('   - Current Odometer:', testUnit.currentOdometer);
    console.log('   - Remaining KM:', testService.dueMileage - testUnit.currentOdometer);

    console.log('\n✅ Test data created successfully!');
    console.log('📊 Summary:');
    console.log('   - Fleet Unit:', testUnit.unitNo);
    console.log('   - Service ID:', testService._id);
    console.log('   - Service Status: pending');
    console.log('   - Due Date:', dueDate.toISOString().split('T')[0], '(7 days from now)');
    console.log('   - Remaining KM:', testService.dueMileage - testUnit.currentOdometer, 'km (within 7500 km threshold)');
    console.log('\n🔔 The notification should now show 1 incoming maintenance service!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test data:', error);
    process.exit(1);
  }
};

// Run the script
createTestFleetUnitAndService();

