import axios from 'axios';

const DATABASE = 'demo_wayneesolutionsdb';
const USERNAME = 'skrishnadas38@gmail.com';
const PASSWORD = 'aw*-Yhm.a6x3u4Q';

async function authenticate() {
  const authRes = await axios.post('https://my.geotab.com/apiv1', {
    method: 'Authenticate',
    params: {
      database: DATABASE,
      userName: USERNAME,
      password: PASSWORD,
    },
  });

  const credentials = authRes?.data?.result;
  if (!credentials) {
    throw new Error('Authentication failed');
  }

  const { sessionId, userName, database } = credentials.credentials;
  const server = credentials.path === "ThisServer" ? "my.geotab.com" : credentials.path;

  return { sessionId, userName, database, server };
}

async function trackVehicle(vehicleId) {
  try {
    const { sessionId, userName, database, server } = await authenticate();

    console.log(`🔍 Tracking vehicle with ID: ${vehicleId}`);
    console.log('=' * 50);

    const vehicleRes = await axios.post(`https://${server}/apiv1`, {
      method: "Get",
      params: {
        typeName: "Device",
        search: {
          id: vehicleId
        },
        credentials: {
          database: database,
          sessionId: sessionId,
          userName: userName
        }
      }
    });

    const vehicle = vehicleRes?.data?.result?.[0];
    if (!vehicle) {
      console.log('❌ Vehicle not found');
      return;
    }

    console.log('🚛 Vehicle Information:');
    console.log(`   Name: ${vehicle.name}`);
    console.log(`   ID: ${vehicle.id}`);
    console.log(`   VIN: ${vehicle.vehicleIdentificationNumber || 'N/A'}`);
    console.log(`   License Plate: ${vehicle.licensePlate || 'N/A'}`);
    console.log(`   Device Type: ${vehicle.deviceType}`);
    console.log(`   Serial Number: ${vehicle.serialNumber}`);
    console.log('');

    const locationRes = await axios.post(`https://${server}/apiv1`, {
      method: "Get",
      params: {
        typeName: "LogRecord",
        search: {
          deviceSearch: {
            id: vehicleId
          },
          fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Last 24 hours
        },
        resultsLimit: 1,
        credentials: {
          database: database,
          sessionId: sessionId,
          userName: userName
        }
      }
    });

    const latestLocation = locationRes?.data?.result?.[0];
    if (latestLocation) {
      console.log('📍 Latest Location:');
      console.log(`   Latitude: ${latestLocation.latitude}`);
      console.log(`   Longitude: ${latestLocation.longitude}`);
      console.log(`   Speed: ${latestLocation.speed || 0} km/h`);
      console.log(`   Date/Time: ${new Date(latestLocation.dateTime).toLocaleString()}`);
      console.log(`   Google Maps: https://maps.google.com/?q=${latestLocation.latitude},${latestLocation.longitude}`);
      console.log('');
    }

    // Get device status data
    const statusRes = await axios.post(`https://${server}/apiv1`, {
      method: "Get",
      params: {
        typeName: "StatusData",
        search: {
          deviceSearch: {
            id: vehicleId
          },
          fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Last 24 hours
        },
        resultsLimit: 10,
        credentials: {
          database: database,
          sessionId: sessionId,
          userName: userName
        }
      }
    });

    const statusData = statusRes?.data?.result;
    if (statusData && statusData.length > 0) {
      console.log('⚡ Recent Status Data:');
      statusData.forEach((status, index) => {
        if (index < 5) { // Show only first 5 status entries
          console.log(`   ${status.diagnostic?.name || 'Unknown'}: ${status.data} ${status.diagnostic?.unitOfMeasure || ''} - ${new Date(status.dateTime).toLocaleString()}`);
        }
      });
      console.log('');
    }

    // Get trip data
    const tripRes = await axios.post(`https://${server}/apiv1`, {
      method: "Get",
      params: {
        typeName: "Trip",
        search: {
          deviceSearch: {
            id: vehicleId
          },
          fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Last 24 hours
        },
        resultsLimit: 5,
        credentials: {
          database: database,
          sessionId: sessionId,
          userName: userName
        }
      }
    });

    const trips = tripRes?.data?.result;
    if (trips && trips.length > 0) {
      console.log('🛣️ Recent Trips:');
      trips.forEach((trip, index) => {
        const startTime = new Date(trip.start).toLocaleString();
        const stopTime = trip.stop ? new Date(trip.stop).toLocaleString() : 'Ongoing';
        const distance = trip.distance ? (trip.distance / 1000).toFixed(2) : '0';
        
        console.log(`   Trip ${index + 1}:`);
        console.log(`     Start: ${startTime}`);
        console.log(`     Stop: ${stopTime}`);
        console.log(`     Distance: ${distance} km`);
        console.log(`     Max Speed: ${trip.maximumSpeed || 0} km/h`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error tracking vehicle:', error.response?.data || error.message);
  }
}

// Function to get all vehicles and let user choose one to track
async function trackVehicleInteractive() {
  try {
    const { sessionId, userName, database, server } = await authenticate();

    // Get all vehicles
    const vehicleRes = await axios.post(`https://${server}/apiv1`, {
      method: "Get",
      params: {
        typeName: "Device",
        credentials: {
          database: database,
          sessionId: sessionId,
          userName: userName
        }
      }
    });

    const vehicles = vehicleRes?.data?.result;
    if (!vehicles || vehicles.length === 0) {
      console.log('No vehicles found');
      return;
    }

    console.log('🚛 Available Vehicles:');
    vehicles.slice(0, 10).forEach((v, i) => { // Show first 10 vehicles
      console.log(`${i + 1}. ${v.name} (ID: ${v.id})`);
    });

    // For demo, let's track the first vehicle
    console.log('\n🎯 Tracking first vehicle...\n');
    await trackVehicle(vehicles[0].id);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// Export functions
export { trackVehicle, trackVehicleInteractive };

// Example usage:
// trackVehicle('b8'); // Track specific vehicle by ID
// trackVehicleInteractive(); // Show all vehicles and track the first one

// Run interactive tracking
trackVehicleInteractive();