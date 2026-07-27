import mongoose from 'mongoose';
import { User } from '../../models/driver/userModel.js';
import Trip from '../../models/tripModel.js';
import Order from '../../models/orderModel.js';
import { callOpenAI } from '../../services/openaiService.js';
import { getUserCompanyId } from '../../utils/companyFilter.js';

/**
 * Get driver's current trip status and generate AI summary
 */
export const getDriverTripStatusWithAI = async (driverId, companyId = null) => {
  try {
    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
      return {
        success: false,
        message: "Invalid driver ID"
      };
    }

    // Get driver info (include role field)
    const driver = await User.findById(driverId)
      .select('name email phone status company role')
      .lean();

    console.log(`🔍 Looking up driver: ${driverId}`, {
      driverFound: !!driver,
      driverRole: driver?.role,
      driverName: driver?.name
    });

    if (!driver) {
      console.error(`❌ Driver not found in database: ${driverId}`);
      return {
        success: false,
        message: "Driver not found"
      };
    }

    if (driver.role !== 'driver') {
      console.error(`❌ User found but role is not 'driver': ${driver.role}`, {
        driverId,
        driverName: driver.name,
        actualRole: driver.role
      });
      return {
        success: false,
        message: `User found but role is '${driver.role}', expected 'driver'`
      };
    }

    // Build company filter
    const companyFilter = companyId ? { company: companyId } : {};

    // Get active trips (in-progress) - where driver is either driver or coDriver
    const activeTrips = await Trip.find({
      $or: [
        { driver: driverId },
        { coDriver: driverId }
      ],
      status: 'in-progress',
      ...companyFilter
    })
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'plateNumber make model internalId')
      .populate('trailer', 'plateNumber trailerNumber')
      .populate({
        path: 'orders',
        populate: [
          { path: 'customer', select: 'name email phone' },
          { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
          { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
        ]
      })
      .sort({ actualStartDate: -1 })
      .limit(5)
      .lean();

    // Get all orders that are NOT completed or canceled (all active/pending/delivered orders)
    // This includes: planned, quoted, in-delivery, delivered, and any other non-final statuses
    const activeOrdersQuery = {
      $or: [
        { driver: driverId },
        { coDriver: driverId }
      ],
      status: { $nin: ['completed', 'canceled'] }, // Exclude completed and canceled
      ...companyFilter
    };
    
    console.log('🔍 Querying active orders (excluding completed/canceled):', JSON.stringify(activeOrdersQuery, null, 2));
    
    const activeOrders = await Order.find(activeOrdersQuery)
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'plateNumber make model internalId')
      .populate('trailer', 'plateNumber trailerNumber')
      .populate('customer', 'name email phone')
      .populate('pickupLocation.placeId', 'name currentLocation city state')
      .populate('deliveryLocation.placeId', 'name currentLocation city state')
      .sort({ actualStartDate: -1, pickupDate: -1, createdAt: -1 })
      .lean(); // Remove limit to show all orders
    
    console.log(`📦 Found ${activeOrders.length} active orders (non-completed/canceled) for driver ${driverId}`);

    // Get pending trips (planned) - where driver is either driver or coDriver
    const pendingTrips = await Trip.find({
      $or: [
        { driver: driverId },
        { coDriver: driverId }
      ],
      status: 'planned',
      ...companyFilter
    })
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'plateNumber make model internalId')
      .populate('trailer', 'plateNumber trailerNumber')
      .populate({
        path: 'orders',
        populate: [
          { path: 'customer', select: 'name email phone' },
          { path: 'pickupLocation.placeId', select: 'name currentLocation city state' },
          { path: 'deliveryLocation.placeId', select: 'name currentLocation city state' }
        ]
      })
      .sort({ plannedStartDate: 1 })
      .limit(3)
      .lean();

    // Get pending orders (planned, quoted) - these are already included in activeOrders above
    // But we'll keep this for categorization in the response
    const pendingOrdersQuery = {
      $or: [
        { driver: driverId },
        { coDriver: driverId }
      ],
      status: { $in: ['planned', 'quoted'] },
      ...companyFilter
    };
    
    console.log('🔍 Querying pending orders:', JSON.stringify(pendingOrdersQuery, null, 2));
    
    const pendingOrders = await Order.find(pendingOrdersQuery)
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'plateNumber make model internalId')
      .populate('trailer', 'plateNumber trailerNumber')
      .populate('customer', 'name email phone')
      .populate('pickupLocation.placeId', 'name currentLocation city state')
      .populate('deliveryLocation.placeId', 'name currentLocation city state')
      .sort({ pickupDate: 1 })
      .lean(); // Remove limit to show all pending orders
    
    console.log(`📦 Found ${pendingOrders.length} pending orders for driver ${driverId}`);

    // Prepare data for AI
    const tripData = {
      driver: {
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        status: driver.status
      },
      activeTrips: activeTrips.map(trip => {
        // Determine if driver is main driver or co-driver
        const isMainDriver = trip.driver?._id?.toString() === driverId || trip.driver?.toString() === driverId;
        const isCoDriver = trip.coDriver?._id?.toString() === driverId || trip.coDriver?.toString() === driverId;
        const driverRole = isMainDriver ? 'Driver' : (isCoDriver ? 'Co-Driver' : 'Driver');
        
        return {
          tripNumber: trip.tripNumber,
          status: trip.status,
          plannedStartDate: trip.plannedStartDate,
          actualStartDate: trip.actualStartDate,
          plannedEndDate: trip.plannedEndDate,
          startLocation: trip.startLocation?.place || 'N/A',
          endLocation: trip.endLocation?.place || 'N/A',
          ordersCount: trip.orders?.length || 0,
          truck: trip.truck ? `${trip.truck.plateNumber || trip.truck.internalId} (${trip.truck.make || ''} ${trip.truck.model || ''})` : 'N/A',
          trailer: trip.trailer ? `${trip.trailer.plateNumber || trip.trailer.trailerNumber || 'N/A'}` : 'N/A',
          driverRole: driverRole,
          mainDriver: trip.driver?.name || 'N/A',
          coDriver: trip.coDriver?.name || null
        };
      }),
      activeOrders: activeOrders.map(order => {
        // Get detailed route information
        const pickupLocation = order.pickupLocation?.placeId?.name || 
                              order.pickupLocation?.place || 
                              (order.pickupLocation?.address ? `${order.pickupLocation.address}, ${order.pickupLocation.city || ''} ${order.pickupLocation.state || ''}`.trim() : 'N/A');
        
        const deliveryLocation = order.deliveryLocation?.placeId?.name || 
                                order.deliveryLocation?.place || 
                                (order.deliveryLocation?.address ? `${order.deliveryLocation.address}, ${order.deliveryLocation.city || ''} ${order.deliveryLocation.state || ''}`.trim() : 'N/A');
        
        // Get full address if available
        const pickupFullAddress = order.pickupLocation?.placeId?.currentLocation || 
                                 (order.pickupLocation?.address ? `${order.pickupLocation.address}, ${order.pickupLocation.city || ''}, ${order.pickupLocation.state || ''} ${order.pickupLocation.zipCode || ''}`.trim() : null);
        
        const deliveryFullAddress = order.deliveryLocation?.placeId?.currentLocation || 
                                   (order.deliveryLocation?.address ? `${order.deliveryLocation.address}, ${order.deliveryLocation.city || ''}, ${order.deliveryLocation.state || ''} ${order.deliveryLocation.zipCode || ''}`.trim() : null);
        
        return {
          orderNumber: order.orderNumber || order.customerOrderNo,
          status: order.status,
          pickupDate: order.pickupDate,
          deliveryDate: order.deliveryDate,
          actualStartDate: order.actualStartDate,
          pickupLocation: pickupLocation,
          pickupFullAddress: pickupFullAddress,
          deliveryLocation: deliveryLocation,
          deliveryFullAddress: deliveryFullAddress,
          customer: order.customer?.name || 'N/A',
          truck: order.truck ? `${order.truck.plateNumber || order.truck.internalId} (${order.truck.make || ''} ${order.truck.model || ''})` : 'N/A',
          trailer: order.trailer ? `${order.trailer.plateNumber || order.trailer.trailerNumber || 'N/A'}` : 'N/A'
        };
      }),
      pendingTrips: pendingTrips.map(trip => {
        // Determine if driver is main driver or co-driver
        const isMainDriver = trip.driver?._id?.toString() === driverId || trip.driver?.toString() === driverId;
        const isCoDriver = trip.coDriver?._id?.toString() === driverId || trip.coDriver?.toString() === driverId;
        const driverRole = isMainDriver ? 'Driver' : (isCoDriver ? 'Co-Driver' : 'Driver');
        
        return {
          tripNumber: trip.tripNumber,
          status: trip.status,
          plannedStartDate: trip.plannedStartDate,
          startLocation: trip.startLocation?.place || 'N/A',
          endLocation: trip.endLocation?.place || 'N/A',
          ordersCount: trip.orders?.length || 0,
          driverRole: driverRole,
          mainDriver: trip.driver?.name || 'N/A',
          coDriver: trip.coDriver?.name || null
        };
      }),
      pendingOrders: pendingOrders.map(order => {
        // Get detailed route information
        const pickupLocation = order.pickupLocation?.placeId?.name || 
                              order.pickupLocation?.place || 
                              (order.pickupLocation?.address ? `${order.pickupLocation.address}, ${order.pickupLocation.city || ''} ${order.pickupLocation.state || ''}`.trim() : 'N/A');
        
        const deliveryLocation = order.deliveryLocation?.placeId?.name || 
                                order.deliveryLocation?.place || 
                                (order.deliveryLocation?.address ? `${order.deliveryLocation.address}, ${order.deliveryLocation.city || ''} ${order.deliveryLocation.state || ''}`.trim() : 'N/A');
        
        // Get full address if available
        const pickupFullAddress = order.pickupLocation?.placeId?.currentLocation || 
                                 (order.pickupLocation?.address ? `${order.pickupLocation.address}, ${order.pickupLocation.city || ''}, ${order.pickupLocation.state || ''} ${order.pickupLocation.zipCode || ''}`.trim() : null);
        
        const deliveryFullAddress = order.deliveryLocation?.placeId?.currentLocation || 
                                   (order.deliveryLocation?.address ? `${order.deliveryLocation.address}, ${order.deliveryLocation.city || ''}, ${order.deliveryLocation.state || ''} ${order.deliveryLocation.zipCode || ''}`.trim() : null);
        
        return {
          orderNumber: order.orderNumber || order.customerOrderNo,
          status: order.status,
          pickupDate: order.pickupDate,
          deliveryDate: order.deliveryDate,
          pickupLocation: pickupLocation,
          pickupFullAddress: pickupFullAddress,
          deliveryLocation: deliveryLocation,
          deliveryFullAddress: deliveryFullAddress,
          customer: order.customer?.name || 'N/A'
        };
      })
    };

    // Generate AI summary
    const aiPrompt = `You are a logistics dispatcher assistant. Analyze the following driver's trip and order information and provide a concise summary.

Driver: ${tripData.driver.name} (${tripData.driver.email})
Driver Status: ${tripData.driver.status}

Active Trips (Currently Driving): ${tripData.activeTrips.length}
${tripData.activeTrips.length > 0 ? tripData.activeTrips.map((trip, idx) => `
  ${idx + 1}. Trip ${trip.tripNumber}:
     - Status: ${trip.status}
     - Started: ${trip.actualStartDate ? new Date(trip.actualStartDate).toLocaleString() : 'Not started'}
     - Route: ${trip.startLocation} → ${trip.endLocation}
     - Orders: ${trip.ordersCount}
     - Vehicle: ${trip.truck}
     - Trailer: ${trip.trailer}
     - Expected End: ${trip.plannedEndDate ? new Date(trip.plannedEndDate).toLocaleString() : 'N/A'}
`).join('') : '  None'}

Active Orders (Currently Delivering): ${tripData.activeOrders.length}
${tripData.activeOrders.length > 0 ? tripData.activeOrders.map((order, idx) => `
  ${idx + 1}. Order ${order.orderNumber}:
     - Status: ${order.status}
     - Started: ${order.actualStartDate ? new Date(order.actualStartDate).toLocaleString() : 'Not started'}
     - Route: ${order.pickupLocation} → ${order.deliveryLocation}
     - Customer: ${order.customer}
     - Vehicle: ${order.truck}
     - Trailer: ${order.trailer}
     - Delivery Date: ${order.deliveryDate ? new Date(order.deliveryDate).toLocaleString() : 'N/A'}
`).join('') : '  None'}

Pending Trips (Assigned but not started): ${tripData.pendingTrips.length}
${tripData.pendingTrips.length > 0 ? tripData.pendingTrips.map((trip, idx) => `
  ${idx + 1}. Trip ${trip.tripNumber}:
     - Status: ${trip.status}
     - Planned Start: ${trip.plannedStartDate ? new Date(trip.plannedStartDate).toLocaleString() : 'N/A'}
     - Route: ${trip.startLocation} → ${trip.endLocation}
     - Orders: ${trip.ordersCount}
`).join('') : '  None'}

Pending Orders (Assigned but not started): ${tripData.pendingOrders.length}
${tripData.pendingOrders.length > 0 ? tripData.pendingOrders.map((order, idx) => `
  ${idx + 1}. Order ${order.orderNumber}:
     - Status: ${order.status}
     - Pickup Date: ${order.pickupDate ? new Date(order.pickupDate).toLocaleString() : 'N/A'}
     - Route: ${order.pickupLocation} → ${order.deliveryLocation}
     - Customer: ${order.customer}
`).join('') : '  None'}

Please provide a concise summary (2-3 sentences) answering:
1. Is this driver currently assigned to any trips or orders?
2. Is the driver currently driving/delivering?
3. What is their current status and location if available?

Format your response as a clear, professional summary suitable for a dispatcher.`;

    const aiResponse = await callOpenAI(aiPrompt, {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 500,
      systemPrompt: 'You are a professional logistics dispatcher assistant. Provide clear, concise summaries about driver trip status.'
    });

    return {
      success: true,
      data: {
        driver: tripData.driver,
        activeTrips: tripData.activeTrips,
        activeOrders: tripData.activeOrders,
        pendingTrips: tripData.pendingTrips,
        pendingOrders: tripData.pendingOrders,
        aiSummary: aiResponse.success ? aiResponse.data : 'Unable to generate AI summary at this time.',
        summary: {
          hasActiveTrips: tripData.activeTrips.length > 0,
          hasActiveOrders: tripData.activeOrders.length > 0,
          hasPendingTrips: tripData.pendingTrips.length > 0,
          hasPendingOrders: tripData.pendingOrders.length > 0,
          isCurrentlyDriving: tripData.activeTrips.length > 0 || tripData.activeOrders.length > 0,
          totalActive: tripData.activeTrips.length + tripData.activeOrders.length,
          totalPending: tripData.pendingTrips.length + tripData.pendingOrders.length
        }
      }
    };
  } catch (error) {
    console.error('Error getting driver trip status:', error);
    return {
      success: false,
      message: error.message || 'Failed to get driver trip status'
    };
  }
};

