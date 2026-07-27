import mongoose from 'mongoose';
import Load from '../models/loadModel.js';
import { User } from '../models/driver/userModel.js';
import { Vehicle } from '../models/driver/vehicleModel.js';
import dotenv from 'dotenv';

dotenv.config();

const createDemoLoadsWithWaypoints = async () => {
  try {
    // Connect to database
    const dbUrl = process.env.DB || process.env.DB1 || 'mongodb://localhost:27017/blackriver';
    await mongoose.connect(dbUrl);
    console.log('✅ Connected to MongoDB');

    // Find demodriver by email
    const driver = await User.findOne({ email: 'demodriver@gmail.com' });
    if (!driver) {
      console.log('❌ Demo driver not found. Email: demodriver@gmail.com');
      console.log('   Please create a driver with email: demodriver@gmail.com');
      await mongoose.connection.close();
      return;
    }

    console.log(`✅ Found driver: ${driver.name} (ID: ${driver._id})`);

    // Find or create a vehicle for this driver
    let vehicle = await Vehicle.findOne({ driver: driver._id });
    if (!vehicle) {
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
      console.log(`✅ Created vehicle: ${vehicle.internalId}`);
    } else {
      console.log(`✅ Using existing vehicle: ${vehicle.internalId}`);
    }

    const now = new Date();

    // Loads with multiple waypoints
    const loadsWithWaypoints = [
      // Load 1: Toronto to Montreal with 3 stops
      {
        details: {
          internalId: `LOAD-WP-${Date.now().toString().slice(-6)}`,
          orderType: 'standard',
          customer: null,
          driver: driver._id,
          vehicle: vehicle._id,
          amount: 3500,
          rate: 2.5
        },
        route: {
          multipleDropOffs: true,
          selectPickup: {
            place: 'Toronto, ON',
            latitude: '43.6532',
            longitude: '-79.3832'
          },
          selectDropOff: null, // Not used when multipleDropOffs is true
          wayPoints: [
            {
              address: {
                place: 'Oshawa, ON',
                latitude: '43.8975',
                longitude: '-78.8658'
              },
              dropOff: true,
              pickup: false
            },
            {
              address: {
                place: 'Kingston, ON',
                latitude: '44.2312',
                longitude: '-76.4860'
              },
              dropOff: true,
              pickup: false
            },
            {
              address: {
                place: 'Montreal, QC',
                latitude: '45.5017',
                longitude: '-73.5673'
              },
              dropOff: true,
              pickup: false
            }
          ]
        },
        payloads: [{
          itemName: 'Electronics',
          description: 'Consumer electronics - multiple deliveries',
          measurementAndWeight: {
            length: 120,
            width: 80,
            height: 100,
            weight: 15000
          }
        }],
        status: 'dispatched',
        notes: 'Multiple drop-off locations - handle with care',
        assignedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      },
      // Load 2: Chicago to New York with 4 stops
      {
        details: {
          internalId: `LOAD-WP-${Date.now().toString().slice(-7)}`,
          orderType: 'standard',
          customer: null,
          driver: driver._id,
          vehicle: vehicle._id,
          amount: 4200,
          rate: 2.8
        },
        route: {
          multipleDropOffs: true,
          selectPickup: {
            place: 'Chicago, IL',
            latitude: '41.8781',
            longitude: '-87.6298'
          },
          selectDropOff: null,
          wayPoints: [
            {
              address: {
                place: 'Detroit, MI',
                latitude: '42.3314',
                longitude: '-83.0458'
              },
              dropOff: true,
              pickup: false
            },
            {
              address: {
                place: 'Cleveland, OH',
                latitude: '41.4993',
                longitude: '-81.6944'
              },
              dropOff: true,
              pickup: false
            },
            {
              address: {
                place: 'Pittsburgh, PA',
                latitude: '40.4406',
                longitude: '-79.9959'
              },
              dropOff: true,
              pickup: false
            },
            {
              address: {
                place: 'New York, NY',
                latitude: '40.7128',
                longitude: '-74.0060'
              },
              dropOff: true,
              pickup: false
            }
          ]
        },
        payloads: [{
          itemName: 'Medical Supplies',
          description: 'Temperature controlled medical supplies - 4 stops',
          measurementAndWeight: {
            length: 100,
            width: 80,
            height: 90,
            weight: 12000
          }
        }],
        status: 'in-delivery',
        notes: 'Temperature controlled - keep refrigerated',
        assignedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        startedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      },
      // Load 3: Los Angeles to Seattle with 5 stops
      {
        details: {
          internalId: `LOAD-WP-${Date.now().toString().slice(-8)}`,
          orderType: 'standard',
          customer: null,
          driver: driver._id,
          vehicle: vehicle._id,
          amount: 5500,
          rate: 3.0
        },
        route: {
          multipleDropOffs: true,
          selectPickup: {
            place: 'Los Angeles, CA',
            latitude: '34.0522',
            longitude: '-118.2437'
          },
          selectDropOff: null,
          wayPoints: [
            {
              address: {
                place: 'San Francisco, CA',
                latitude: '37.7749',
                longitude: '-122.4194'
              },
              dropOff: true,
              pickup: false
            },
            {
              address: {
                place: 'Sacramento, CA',
                latitude: '38.5816',
                longitude: '-121.4944'
              },
              dropOff: true,
              pickup: false
            },
            {
              address: {
                place: 'Portland, OR',
                latitude: '45.5152',
                longitude: '-122.6784'
              },
              dropOff: true,
              pickup: false
            },
            {
              address: {
                place: 'Tacoma, WA',
                latitude: '47.2529',
                longitude: '-122.4443'
              },
              dropOff: true,
              pickup: false
            },
            {
              address: {
                place: 'Seattle, WA',
                latitude: '47.6062',
                longitude: '-122.3321'
              },
              dropOff: true,
              pickup: false
            }
          ]
        },
        payloads: [{
          itemName: 'Food Products',
          description: 'Perishable food items - 5 delivery stops',
          measurementAndWeight: {
            length: 130,
            width: 85,
            height: 95,
            weight: 18000
          }
        }],
        status: 'planned',
        notes: 'Perishable goods - expedited delivery required',
        assignedAt: new Date(now.getTime() - 0.5 * 24 * 60 * 60 * 1000), // 12 hours ago
      },
      // Load 4: Dallas to Atlanta with 3 stops (completed)
      {
        details: {
          internalId: `LOAD-WP-COMP-${Date.now().toString().slice(-6)}`,
          orderType: 'standard',
          customer: null,
          driver: driver._id,
          vehicle: vehicle._id,
          amount: 3800,
          rate: 2.6
        },
        route: {
          multipleDropOffs: true,
          selectPickup: {
            place: 'Dallas, TX',
            latitude: '32.7767',
            longitude: '-96.7970'
          },
          selectDropOff: null,
          wayPoints: [
            {
              address: {
                place: 'Shreveport, LA',
                latitude: '32.5252',
                longitude: '-93.7502'
              },
              dropOff: true,
              pickup: false
            },
            {
              address: {
                place: 'Jackson, MS',
                latitude: '32.2988',
                longitude: '-90.1848'
              },
              dropOff: true,
              pickup: false
            },
            {
              address: {
                place: 'Atlanta, GA',
                latitude: '33.7490',
                longitude: '-84.3880'
              },
              dropOff: true,
              pickup: false
            }
          ]
        },
        payloads: [{
          itemName: 'Building Materials',
          description: 'Construction materials - 3 drops completed',
          measurementAndWeight: {
            length: 150,
            width: 100,
            height: 120,
            weight: 25000
          }
        }],
        status: 'completed',
        notes: 'All deliveries completed successfully',
        assignedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        startedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // 10 days ago + 1 hour
        completedAt: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000), // 9 days ago
      },
    ];

    // Create loads with waypoints
    let createdCount = 0;
    let skippedCount = 0;

    for (const loadData of loadsWithWaypoints) {
      // Check if load with same internalId exists
      const existing = await Load.findOne({ 'details.internalId': loadData.details.internalId });
      
      if (existing) {
        console.log(`⚠️  Load ${loadData.details.internalId} already exists, skipping`);
        skippedCount++;
        continue;
      }

      const load = await Load.create(loadData);
      console.log(`✅ Created load: ${loadData.details.internalId}`);
      console.log(`   Status: ${loadData.status}`);
      console.log(`   Waypoints: ${loadData.route.wayPoints.length} stops`);
      createdCount++;
    }

    console.log('\n📊 Summary:');
    console.log(`   Created: ${createdCount} loads with waypoints`);
    console.log(`   Skipped: ${skippedCount} loads (already exist)`);
    console.log(`   Driver: ${driver.name} (${driver.email})`);
    console.log(`   Vehicle: ${vehicle.internalId} - ${vehicle.make} ${vehicle.model}`);
    
    // Show final counts by status
    const pendingCount = await Load.countDocuments({ 
      'details.driver': driver._id, 
      status: { $in: ['planned', 'dispatched'] },
      'route.multipleDropOffs': true
    });
    const activeCount = await Load.countDocuments({ 
      'details.driver': driver._id, 
      status: 'in-delivery',
      'route.multipleDropOffs': true
    });
    const completedCount = await Load.countDocuments({ 
      'details.driver': driver._id, 
      status: 'completed',
      'route.multipleDropOffs': true
    });
    
    console.log('\n📈 Multiple Drop Load Counts by Status:');
    console.log(`   Pending/Dispatched: ${pendingCount}`);
    console.log(`   Active (in-delivery): ${activeCount}`);
    console.log(`   Completed: ${completedCount}`);
    console.log(`   Total Multiple Drop Loads: ${pendingCount + activeCount + completedCount}`);

    await mongoose.connection.close();
    console.log('\n✅ Script completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the script
createDemoLoadsWithWaypoints();

