/**
 * Script to test and demonstrate route building with two orders
 * showing pickup and dropoff locations as waypoints
 * 
 * Usage: node scripts/testRouteWithOrders.js
 */

// Mock data for two orders with pickup and delivery locations
const mockOrder1 = {
  _id: 'order1',
  orderNumber: 'ORD-001',
  customerOrderNo: 'CUST-001',
  pickupLocation: {
    place: '123 Main St, Toronto, ON',
    latitude: '43.6532',
    longitude: '-79.3832'
  },
  deliveryLocation: {
    place: '456 Queen St, Montreal, QC',
    latitude: '45.5017',
    longitude: '-73.5673'
  }
};

const mockOrder2 = {
  _id: 'order2',
  orderNumber: 'ORD-002',
  customerOrderNo: 'CUST-002',
  pickupLocation: {
    place: '789 Yonge St, Toronto, ON',
    latitude: '43.6702',
    longitude: '-79.3868'
  },
  deliveryLocation: {
    place: '321 Saint-Catherine St, Montreal, QC',
    latitude: '45.5088',
    longitude: '-73.5617'
  }
};

/**
 * Extract coordinates from location object
 */
function extractCoordinates(location) {
  if (!location) return null;

  // Try direct latitude/longitude first
  if (location.latitude && location.longitude) {
    const lat = parseFloat(location.latitude);
    const lng = parseFloat(location.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }

  // Try placeId's currentLocation
  if (location.placeId?.currentLocation) {
    const loc = location.placeId.currentLocation;
    if (loc.latitude && loc.longitude) {
      const lat = parseFloat(loc.latitude);
      const lng = parseFloat(loc.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
  }

  return null;
}

/**
 * Build route waypoints from orders
 * Combines pickup and delivery locations in order
 */
function buildRouteWaypoints(orders) {
  const waypoints = [];

  orders.forEach((order) => {
    // Extract pickup location
    const pickupCoords = extractCoordinates(order.pickupLocation);
    if (pickupCoords) {
      waypoints.push({
        type: 'pickup',
        orderNumber: order.orderNumber,
        customerOrderNo: order.customerOrderNo,
        lat: pickupCoords.lat,
        lng: pickupCoords.lng,
        address: order.pickupLocation.place || '',
        orderId: order._id
      });
    }

    // Extract delivery location
    const deliveryCoords = extractCoordinates(order.deliveryLocation);
    if (deliveryCoords) {
      waypoints.push({
        type: 'delivery',
        orderNumber: order.orderNumber,
        customerOrderNo: order.customerOrderNo,
        lat: deliveryCoords.lat,
        lng: deliveryCoords.lng,
        address: order.deliveryLocation.place || '',
        orderId: order._id
      });
    }
  });

  return waypoints;
}

/**
 * Build Google Maps Directions Request
 */
function buildDirectionsRequest(waypoints) {
  if (!waypoints || waypoints.length < 2) {
    return null;
  }

  const startWaypoint = waypoints[0];
  const endWaypoint = waypoints[waypoints.length - 1];

  // Get intermediate waypoints (skip first and last)
  const intermediateWaypoints = waypoints
    .slice(1, -1)
    .map(wp => ({
      location: { lat: wp.lat, lng: wp.lng },
      stopover: true,
    }));

  return {
    origin: { lat: startWaypoint.lat, lng: startWaypoint.lng },
    destination: { lat: endWaypoint.lat, lng: endWaypoint.lng },
    waypoints: intermediateWaypoints.length > 0 ? intermediateWaypoints : undefined,
    travelMode: 'DRIVING',
    optimizeWaypoints: false,
  };
}

/**
 * Generate route visualization output
 */
function visualizeRoute(orders, waypoints, directionsRequest) {
  console.log('\n🚚 ==========================================');
  console.log('   ROUTE VISUALIZATION WITH TWO ORDERS');
  console.log('==========================================\n');

  console.log('📦 ORDERS:');
  orders.forEach((order, index) => {
    console.log(`\n   Order ${index + 1}: ${order.orderNumber} (${order.customerOrderNo})`);
    console.log(`   ├─ Pickup:  ${order.pickupLocation.place}`);
    console.log(`   │           📍 ${order.pickupLocation.latitude}, ${order.pickupLocation.longitude}`);
    console.log(`   └─ Delivery: ${order.deliveryLocation.place}`);
    console.log(`              📍 ${order.deliveryLocation.latitude}, ${order.deliveryLocation.longitude}`);
  });

  console.log('\n🗺️  ROUTE WAYPOINTS:');
  waypoints.forEach((wp, index) => {
    const icon = wp.type === 'pickup' ? '📦' : '📬';
    console.log(`   ${index + 1}. ${icon} ${wp.type.toUpperCase()} - ${wp.orderNumber}`);
    console.log(`      Location: ${wp.address}`);
    console.log(`      Coordinates: ${wp.lat}, ${wp.lng}`);
  });

  console.log('\n📍 DIRECTIONS REQUEST:');
  if (directionsRequest) {
    console.log(`   Origin: ${directionsRequest.origin.lat}, ${directionsRequest.origin.lng}`);
    console.log(`   Destination: ${directionsRequest.destination.lat}, ${directionsRequest.destination.lng}`);
    console.log(`   Intermediate Waypoints: ${directionsRequest.waypoints?.length || 0}`);
    if (directionsRequest.waypoints && directionsRequest.waypoints.length > 0) {
      directionsRequest.waypoints.forEach((wp, index) => {
        console.log(`      ${index + 1}. ${wp.location.lat}, ${wp.location.lng}`);
      });
    }
  } else {
    console.log('   ❌ Invalid route (need at least 2 waypoints)');
  }

  console.log('\n🗺️  MAP VISUALIZATION:');
  console.log('   Route Flow:');
  waypoints.forEach((wp, index) => {
    const arrow = index < waypoints.length - 1 ? '→' : '';
    const icon = wp.type === 'pickup' ? '📦' : '📬';
    console.log(`   ${index + 1}. ${icon} ${wp.type.toUpperCase()} (${wp.orderNumber}) ${arrow}`);
  });

  console.log('\n📊 ROUTE SUMMARY:');
  console.log(`   Total Orders: ${orders.length}`);
  console.log(`   Total Waypoints: ${waypoints.length}`);
  console.log(`   Pickup Points: ${waypoints.filter(wp => wp.type === 'pickup').length}`);
  console.log(`   Delivery Points: ${waypoints.filter(wp => wp.type === 'delivery').length}`);
  console.log('\n==========================================\n');
}

/**
 * Main function
 */
function main() {
  console.log('🚀 Starting Route Building Script...\n');

  // Create array of orders
  const orders = [mockOrder1, mockOrder2];

  // Build route waypoints
  const waypoints = buildRouteWaypoints(orders);

  // Build directions request
  const directionsRequest = buildDirectionsRequest(waypoints);

  // Visualize the route
  visualizeRoute(orders, waypoints, directionsRequest);

  // Export data structure that matches backend format
  const routeData = {
    orders,
    routeWaypoints: waypoints,
    directionsRequest,
    summary: {
      totalOrders: orders.length,
      totalWaypoints: waypoints.length,
      pickupCount: waypoints.filter(wp => wp.type === 'pickup').length,
      deliveryCount: waypoints.filter(wp => wp.type === 'delivery').length
    }
  };

  console.log('📤 ROUTE DATA STRUCTURE (for backend/frontend use):');
  console.log(JSON.stringify(routeData, null, 2));

  console.log('\n✅ Script completed successfully!');
}

// Run the script directly
main();

