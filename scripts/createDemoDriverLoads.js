import mongoose from 'mongoose';
import Load from '../models/loadModel.js';
import { User } from '../models/driver/userModel.js';
import { Vehicle } from '../models/driver/vehicleModel.js';
import dotenv from 'dotenv';

dotenv.config();

const createDemoDriverLoads = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blackriver');
    console.log('✅ Connected to MongoDB');

    // Find demodriver by email
    const driver = await User.findOne({ email: 'demodriver@gmail.com' });
    if (!driver) {
      console.log('❌ Demo driver not found. Email: demodriver@gmail.com');
      await mongoose.connection.close();
      return;
    }

    console.log(`✅ Found driver: ${driver.name} (ID: ${driver._id})`);

    // Set mile rate for the driver if not set
    if (!driver.details?.mileRate || driver.details.mileRate === 0) {
      if (!driver.details) driver.details = {};
      driver.details.mileRate = 0.65; // $0.65 per mile
      await driver.save();
      console.log('✅ Set driver mile rate to $0.65/mile');
    }

    // Find or create a vehicle for this driver
    let vehicle = await Vehicle.findOne({ driver: driver._id });
    if (!vehicle) {
      // Create a vehicle for the driver
      vehicle = await Vehicle.create({
        internalId: `VEH-${driver._id.toString().slice(-6)}`,
        plateNumber: `DEMO-${Math.floor(Math.random() * 10000)}`,
        vinNumber: `1HGBH41JXMN${Math.floor(Math.random() * 100000)}`,
        make: 'Freightliner',
        model: 'Cascadia',
        year: 2022,
        driver: driver._id,
        status: 'idle',
        currentLocation: {
          address: 'Toronto, ON',
          longitude: '-79.3832',
          latitude: '43.6532'
        },
        odometer: 50000,
      });
      console.log(`✅ Created vehicle: ${vehicle.internalId} - ${vehicle.make} ${vehicle.model}`);
    } else {
      console.log(`✅ Using existing vehicle: ${vehicle.internalId} - ${vehicle.make} ${vehicle.model}`);
    }

    // Check existing loads for this driver
    const existingLoads = await Load.find({ 'details.driver': driver._id });
    console.log(`ℹ️  Found ${existingLoads.length} existing loads for driver`);

    const now = new Date();
    
    // Sample locations for loads
    const locations = [
      { pickup: { place: 'Toronto, ON', latitude: '43.6532', longitude: '-79.3832' }, dropoff: { place: 'Montreal, QC', latitude: '45.5017', longitude: '-73.5673' } },
      { pickup: { place: 'New York, NY', latitude: '40.7128', longitude: '-74.0060' }, dropoff: { place: 'Boston, MA', latitude: '42.3601', longitude: '-71.0589' } },
      { pickup: { place: 'Chicago, IL', latitude: '41.8781', longitude: '-87.6298' }, dropoff: { place: 'Detroit, MI', latitude: '42.3314', longitude: '-83.0458' } },
      { pickup: { place: 'Los Angeles, CA', latitude: '34.0522', longitude: '-118.2437' }, dropoff: { place: 'San Francisco, CA', latitude: '37.7749', longitude: '-122.4194' } },
      { pickup: { place: 'Dallas, TX', latitude: '32.7767', longitude: '-96.7970' }, dropoff: { place: 'Houston, TX', latitude: '29.7604', longitude: '-95.3698' } },
    ];

    const cargoTypes = [
      { itemName: 'Electronics', weight: 15000, description: 'Consumer electronics shipment' },
      { itemName: 'Medical Supplies', weight: 8500, description: 'Temperature controlled medical supplies' },
      { itemName: 'Automotive Parts', weight: 22000, description: 'Heavy automotive components' },
      { itemName: 'Food Products', weight: 18000, description: 'Perishable food items' },
      { itemName: 'Building Materials', weight: 25000, description: 'Construction materials' },
    ];

    // Create loads with different statuses
    const loadsToCreate = [
      // PENDING LOADS (2 loads)
      {
        details: {
          internalId: `LOAD-PEND-${Date.now().toString().slice(-6)}`,
          orderType: 'standard',
          customer: null,
          driver: driver._id,
          vehicle: vehicle._id,
          amount: 1500,
          rate: 1.5
        },
        route: {
          multipleDropOffs: false,
          selectPickup: locations[0].pickup,
          selectDropOff: locations[0].dropoff
        },
        payloads: [{
          itemName: cargoTypes[0].itemName,
          description: cargoTypes[0].description,
          measurementAndWeight: {
            length: 120,
            width: 80,
            height: 100,
            weight: cargoTypes[0].weight
          }
        }],
        status: 'planned',
        notes: 'Handle with care - fragile items',
        assignedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      },
      {
        details: {
          internalId: `LOAD-PEND-${Date.now().toString().slice(-7)}`,
          orderType: 'standard',
          customer: null,
          driver: driver._id,
          vehicle: vehicle._id,
          amount: 2000,
          rate: 1.8
        },
        route: {
          multipleDropOffs: false,
          selectPickup: locations[1].pickup,
          selectDropOff: locations[1].dropoff
        },
        payloads: [{
          itemName: cargoTypes[1].itemName,
          description: cargoTypes[1].description,
          measurementAndWeight: {
            length: 100,
            width: 80,
            height: 90,
            weight: cargoTypes[1].weight
          }
        }],
        status: 'dispatched',
        notes: 'Temperature controlled - keep refrigerated',
        assignedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      },
      // ACTIVE LOADS (2 loads - in-delivery)
      {
        details: {
          internalId: `LOAD-ACT-${Date.now().toString().slice(-6)}`,
          orderType: 'standard',
          customer: null,
          driver: driver._id,
          vehicle: vehicle._id,
          amount: 2200,
          rate: 2.0
        },
        route: {
          multipleDropOffs: false,
          selectPickup: locations[2].pickup,
          selectDropOff: locations[2].dropoff
        },
        payloads: [{
          itemName: cargoTypes[2].itemName,
          description: cargoTypes[2].description,
          measurementAndWeight: {
            length: 140,
            width: 90,
            height: 110,
            weight: cargoTypes[2].weight
          }
        }],
        status: 'in-delivery',
        notes: 'Heavy load - drive carefully',
        assignedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        startedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      },
      {
        details: {
          internalId: `LOAD-ACT-${Date.now().toString().slice(-7)}`,
          orderType: 'standard',
          customer: null,
          driver: driver._id,
          vehicle: vehicle._id,
          amount: 1800,
          rate: 1.7
        },
        route: {
          multipleDropOffs: false,
          selectPickup: locations[3].pickup,
          selectDropOff: locations[3].dropoff
        },
        payloads: [{
          itemName: cargoTypes[3].itemName,
          description: cargoTypes[3].description,
          measurementAndWeight: {
            length: 130,
            width: 85,
            height: 95,
            weight: cargoTypes[3].weight
          }
        }],
        status: 'in-delivery',
        notes: 'Perishable goods - expedited delivery',
        assignedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        startedAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
      },
      // COMPLETED LOADS (3 loads)
      {
        details: {
          internalId: `LOAD-COMP-${Date.now().toString().slice(-6)}`,
          orderType: 'standard',
          customer: null,
          driver: driver._id,
          vehicle: vehicle._id,
          amount: 1900,
          rate: 1.6
        },
        route: {
          multipleDropOffs: false,
          selectPickup: locations[4].pickup,
          selectDropOff: locations[4].dropoff
        },
        payloads: [{
          itemName: cargoTypes[4].itemName,
          description: cargoTypes[4].description,
          measurementAndWeight: {
            length: 150,
            width: 100,
            height: 120,
            weight: cargoTypes[4].weight
          }
        }],
        status: 'completed',
        notes: 'Delivery completed successfully',
        assignedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        startedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // 10 days ago + 1 hour
        completedAt: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000), // 9 days ago
      },
      {
        details: {
          internalId: `LOAD-COMP-${Date.now().toString().slice(-7)}`,
          orderType: 'standard',
          customer: null,
          driver: driver._id,
          vehicle: vehicle._id,
          amount: 1600,
          rate: 1.5
        },
        route: {
          multipleDropOffs: false,
          selectPickup: { place: 'Vancouver, BC', latitude: '49.2827', longitude: '-123.1207' },
          selectDropOff: { place: 'Seattle, WA', latitude: '47.6062', longitude: '-122.3321' }
        },
        payloads: [{
          itemName: cargoTypes[0].itemName,
          description: cargoTypes[0].description,
          measurementAndWeight: {
            length: 125,
            width: 85,
            height: 105,
            weight: cargoTypes[0].weight
          }
        }],
        status: 'completed',
        notes: 'On-time delivery',
        assignedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
        startedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 14 days ago + 2 hours
        completedAt: new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000), // 13 days ago
      },
      {
        details: {
          internalId: `LOAD-COMP-${Date.now().toString().slice(-8)}`,
          orderType: 'standard',
          customer: null,
          driver: driver._id,
          vehicle: vehicle._id,
          amount: 2100,
          rate: 1.9
        },
        route: {
          multipleDropOffs: false,
          selectPickup: { place: 'Philadelphia, PA', latitude: '39.9526', longitude: '-75.1652' },
          selectDropOff: { place: 'Washington, DC', latitude: '38.9072', longitude: '-77.0369' }
        },
        payloads: [{
          itemName: cargoTypes[2].itemName,
          description: cargoTypes[2].description,
          measurementAndWeight: {
            length: 135,
            width: 90,
            height: 115,
            weight: cargoTypes[2].weight
          }
        }],
        status: 'completed',
        notes: 'Delivered ahead of schedule',
        assignedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
        startedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // 20 days ago + 1 hour
        completedAt: new Date(now.getTime() - 19 * 24 * 60 * 60 * 1000), // 19 days ago
      },
    ];

    // Create loads (skip if they already exist)
    let createdCount = 0;
    let skippedCount = 0;

    for (const loadData of loadsToCreate) {
      // Check if load with same internalId exists
      const existing = await Load.findOne({ 'details.internalId': loadData.details.internalId });
      
      if (existing) {
        console.log(`⚠️  Load ${loadData.details.internalId} already exists, skipping`);
        skippedCount++;
        continue;
      }

      const load = await Load.create(loadData);
      console.log(`✅ Created load: ${loadData.details.internalId} - Status: ${loadData.status}`);
      createdCount++;
    }

    console.log('\n📊 Summary:');
    console.log(`   Created: ${createdCount} loads`);
    console.log(`   Skipped: ${skippedCount} loads (already exist)`);
    console.log(`   Driver: ${driver.name} (${driver.email})`);
    console.log(`   Vehicle: ${vehicle.internalId} - ${vehicle.make} ${vehicle.model}`);
    
    // Show final counts by status
    const pendingCount = await Load.countDocuments({ 'details.driver': driver._id, status: { $in: ['planned', 'dispatched'] } });
    const activeCount = await Load.countDocuments({ 'details.driver': driver._id, status: 'in-delivery' });
    const completedCount = await Load.countDocuments({ 'details.driver': driver._id, status: 'completed' });
    
    console.log('\n📈 Load Counts by Status:');
    console.log(`   Pending: ${pendingCount}`);
    console.log(`   Active (in-delivery): ${activeCount}`);
    console.log(`   Completed: ${completedCount}`);
    console.log(`   Total: ${pendingCount + activeCount + completedCount}`);

    await mongoose.connection.close();
    console.log('\n✅ Script completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the script
createDemoDriverLoads();

