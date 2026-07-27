/**
 * Example: Route Building Logic for Two Orders
 * Demonstrates how pickup and delivery locations are combined into a route
 * 
 * This matches the logic used in getActiveOrdersWithTracking
 */

// Example: Two orders with their locations
const exampleOrders = [
  {
    orderNumber: 'ORD-001',
    pickupLocation: { latitude: '43.6532', longitude: '-79.3832', place: 'Toronto Warehouse' },
    deliveryLocation: { latitude: '45.5017', longitude: '-73.5673', place: 'Montreal Store' }
  },
  {
    orderNumber: 'ORD-002',
    pickupLocation: { latitude: '43.6702', longitude: '-79.3868', place: 'Toronto Distribution Center' },
    deliveryLocation: { latitude: '45.5088', longitude: '-73.5617', place: 'Montreal Warehouse' }
  }
];

/**
 * Step 1: Extract coordinates from order locations
 */
function extractCoordinates(location) {
  if (!location) return null;
  
  if (location.latitude && location.longitude) {
    const lat = parseFloat(location.latitude);
    const lng = parseFloat(location.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng, address: location.place || '' };
    }
  }
  
  return null;
}

/**
 * Step 2: Build route waypoints from orders
 * For each order: Add pickup first, then delivery
 */
function buildRouteWaypoints(orders) {
  const waypoints = [];
  
  orders.forEach(order => {
    // Add pickup location
    const pickup = extractCoordinates(order.pickupLocation);
    if (pickup) {
      waypoints.push({
        type: 'pickup',
        orderNumber: order.orderNumber,
        lat: pickup.lat,
        lng: pickup.lng,
        address: pickup.address
      });
    }
    
    // Add delivery location
    const delivery = extractCoordinates(order.deliveryLocation);
    if (delivery) {
      waypoints.push({
        type: 'delivery',
        orderNumber: order.orderNumber,
        lat: delivery.lat,
        lng: delivery.lng,
        address: delivery.address
      });
    }
  });
  
  return waypoints;
}

/**
 * Step 3: Build Google Maps Directions Request
 */
function buildDirectionsRequest(waypoints) {
  if (waypoints.length < 2) return null;
  
  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const intermediate = waypoints.slice(1, -1);
  
  return {
    origin: { lat: origin.lat, lng: origin.lng },
    destination: { lat: destination.lat, lng: destination.lng },
    waypoints: intermediate.map(wp => ({
      location: { lat: wp.lat, lng: wp.lng },
      stopover: true
    })),
    travelMode: 'DRIVING'
  };
}

// Execute example
console.log('📦 EXAMPLE: Route Building with Two Orders\n');
console.log('Input Orders:');
exampleOrders.forEach((order, i) => {
  console.log(`  ${i + 1}. ${order.orderNumber}`);
  console.log(`     Pickup:  ${order.pickupLocation.place}`);
  console.log(`     Delivery: ${order.deliveryLocation.place}`);
});

console.log('\n📍 Generated Waypoints:');
const waypoints = buildRouteWaypoints(exampleOrders);
waypoints.forEach((wp, i) => {
  console.log(`  ${i + 1}. ${wp.type.toUpperCase()} - ${wp.orderNumber}`);
  console.log(`     ${wp.address} (${wp.lat}, ${wp.lng})`);
});

console.log('\n🗺️  Google Maps Directions Request:');
const directionsRequest = buildDirectionsRequest(waypoints);
console.log(JSON.stringify(directionsRequest, null, 2));

console.log('\n✅ Route is ready for Google Maps API!');
console.log('\nRoute Flow:');
waypoints.forEach((wp, i) => {
  const arrow = i < waypoints.length - 1 ? ' → ' : '';
  console.log(`${wp.type === 'pickup' ? '📦' : '📬'} ${wp.orderNumber}${arrow}`);
});

