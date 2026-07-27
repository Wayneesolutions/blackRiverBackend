# Route Building Script for Two Orders

This script demonstrates how to build a route with two orders, showing pickup and delivery locations as waypoints.

## Purpose

The script shows how multiple orders are combined into a single route with:
- Pickup locations as waypoints
- Delivery locations as waypoints
- Proper route ordering (pickup before delivery for each order)
- Google Maps Directions API request format

## Usage

```bash
node scripts/testRouteWithOrders.js
```

## Output

The script will output:
1. Order details (pickup and delivery locations)
2. Route waypoints in order
3. Google Maps Directions Request format
4. Visual route flow
5. Route summary statistics

## Route Flow Example

For two orders, the route would be:
1. 📦 PICKUP (Order 1) → 
2. 📬 DELIVERY (Order 1) → 
3. 📦 PICKUP (Order 2) → 
4. 📬 DELIVERY (Order 2)

## Integration

This script matches the logic used in:
- `logistiqbackend/controllers/loadController.js` - `getActiveOrdersWithTracking`
- `blackRiverFrontend/src/pages/admin/gpsvehicle/livetracking/TripTracker.tsx` - Route rendering

