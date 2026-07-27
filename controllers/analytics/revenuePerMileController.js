import Order from "../../models/orderModel.js";
import { Vehicle } from "../../models/driver/vehicleModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

/**
 * Get Revenue Per Mile analytics for all vehicles
 * Groups orders by truck/vehicle and calculates:
 * - Total miles driven
 * - Total revenue generated
 * - Revenue per mile
 */
export const getRevenuePerMile = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { startDate, endDate, vehicleId } = req.query;

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: {
          vehicleRevenue: [],
          summary: {
            totalRevenue: 0,
            totalMiles: 0,
            averageRevenuePerMile: 0,
            totalVehicles: 0
          },
          monthlyTrend: []
        }
      });
    }

    // Build filter for orders
    const orderFilter = {
      // Include all orders with assigned trucks (removed strict status filter to get all data)
      truck: { $exists: true, $ne: null }
    };

    if (!isSuperadmin) {
      orderFilter.company = companyId;
    }

    // Filter by specific vehicle if provided
    if (vehicleId) {
      orderFilter.truck = vehicleId;
    }

    // Filter by date range
    if (startDate || endDate) {
      orderFilter.orderDate = {};
      if (startDate) {
        orderFilter.orderDate.$gte = new Date(startDate);
      }
      if (endDate) {
        orderFilter.orderDate.$lte = new Date(endDate);
      }
    }

    console.log('🔍 Order filter:', JSON.stringify(orderFilter));

    // Fetch orders with truck information
    const orders = await Order.find(orderFilter)
      .populate('truck', 'unitNumber plateNumber internalId make model')
      .lean();

    console.log(`📊 Found ${orders.length} orders with trucks assigned`);
    
    // Debug: Log first few orders
    if (orders.length > 0) {
      console.log('Sample order:', {
        orderNumber: orders[0].orderNumber,
        truck: orders[0].truck,
        distance: orders[0].distance,
        totalAmount: orders[0].totalAmount,
        status: orders[0].status
      });
    }

    // Group orders by truck and calculate metrics
    const vehicleMetrics = {};

    orders.forEach(order => {
      if (!order.truck || !order.truck._id) return; // Skip orders without truck assignment

      const truckId = order.truck._id.toString();
      
      if (!vehicleMetrics[truckId]) {
        vehicleMetrics[truckId] = {
          vehicleId: truckId,
          unitNumber: order.truck.unitNumber || order.truck.internalId || 'N/A',
          plateNumber: order.truck.plateNumber || 'N/A',
          make: order.truck.make || '',
          model: order.truck.model || '',
          totalMiles: 0,
          totalRevenue: 0,
          orderCount: 0
        };
      }

      // Add distance (convert to miles if needed, assuming distance is in miles)
      const distance = order.distance || 0;
      vehicleMetrics[truckId].totalMiles += distance;

      // Add revenue
      const revenue = order.totalAmount || 0;
      vehicleMetrics[truckId].totalRevenue += revenue;

      vehicleMetrics[truckId].orderCount += 1;
    });

    // Calculate revenue per mile for each vehicle
    const vehicleRevenueData = Object.values(vehicleMetrics).map(vehicle => ({
      ...vehicle,
      revenuePerMile: vehicle.totalMiles > 0 ? vehicle.totalRevenue / vehicle.totalMiles : 0
    }));

    // Sort by revenue per mile (highest first)
    vehicleRevenueData.sort((a, b) => b.revenuePerMile - a.revenuePerMile);

    // Calculate overall summary
    const totalRevenue = vehicleRevenueData.reduce((sum, v) => sum + v.totalRevenue, 0);
    const totalMiles = vehicleRevenueData.reduce((sum, v) => sum + v.totalMiles, 0);
    const averageRevenuePerMile = totalMiles > 0 ? totalRevenue / totalMiles : 0;

    console.log('📈 Summary:', {
      totalVehicles: vehicleRevenueData.length,
      totalRevenue,
      totalMiles,
      averageRevenuePerMile
    });

    // Calculate monthly trend (last 6 months)
    const monthlyTrend = await calculateMonthlyTrend(orderFilter, isSuperadmin, companyId);

    res.json({
      success: true,
      message: "Revenue per mile data fetched successfully",
      data: {
        vehicleRevenue: vehicleRevenueData,
        summary: {
          totalRevenue,
          totalMiles,
          averageRevenuePerMile,
          totalVehicles: vehicleRevenueData.length
        },
        monthlyTrend,
        debug: {
          totalOrdersFound: orders.length,
          ordersWithTrucks: orders.filter(o => o.truck).length
        }
      }
    });
  } catch (error) {
    console.error("❌ Error fetching revenue per mile:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching revenue per mile data",
      error: error.message
    });
  }
};

/**
 * Calculate monthly trend for revenue per mile
 */
async function calculateMonthlyTrend(baseFilter, isSuperadmin, companyId) {
  try {
    const monthlyData = [];
    const now = new Date();

    // Get last 6 months
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      const monthFilter = {
        truck: { $exists: true, $ne: null }, // Ensure truck exists
        orderDate: {
          $gte: monthStart,
          $lte: monthEnd
        }
      };

      if (!isSuperadmin && companyId) {
        monthFilter.company = companyId;
      }

      const monthOrders = await Order.find(monthFilter).lean();

      let totalRevenue = 0;
      let totalMiles = 0;

      monthOrders.forEach(order => {
        totalRevenue += order.totalAmount || 0;
        totalMiles += order.distance || 0;
      });

      const revenuePerMile = totalMiles > 0 ? totalRevenue / totalMiles : 0;

      monthlyData.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short' }),
        year: monthStart.getFullYear(),
        revenuePerMile,
        totalRevenue,
        totalMiles,
        orderCount: monthOrders.length
      });
    }

    return monthlyData;
  } catch (error) {
    console.error("Error calculating monthly trend:", error);
    return [];
  }
}

/**
 * Get Revenue Per Mile for a specific vehicle
 */
export const getVehicleRevenuePerMile = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { startDate, endDate } = req.query;

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    // Verify vehicle exists and user has access
    const vehicleFilter = { _id: vehicleId };
    if (!isSuperadmin) {
      vehicleFilter.company = companyId;
    }

    const vehicle = await Vehicle.findOne(vehicleFilter).lean();
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found or access denied"
      });
    }

    // Build filter for orders
    const orderFilter = {
      truck: vehicleId
    };

    if (!isSuperadmin) {
      orderFilter.company = companyId;
    }

    // Filter by date range
    if (startDate || endDate) {
      orderFilter.orderDate = {};
      if (startDate) {
        orderFilter.orderDate.$gte = new Date(startDate);
      }
      if (endDate) {
        orderFilter.orderDate.$lte = new Date(endDate);
      }
    }

    // Fetch orders for this vehicle
    const orders = await Order.find(orderFilter).lean();

    let totalMiles = 0;
    let totalRevenue = 0;

    orders.forEach(order => {
      totalMiles += order.distance || 0;
      totalRevenue += order.totalAmount || 0;
    });

    const revenuePerMile = totalMiles > 0 ? totalRevenue / totalMiles : 0;

    res.json({
      success: true,
      message: "Vehicle revenue per mile fetched successfully",
      data: {
        vehicleId: vehicle._id,
        unitNumber: vehicle.unitNumber || vehicle.internalId,
        plateNumber: vehicle.plateNumber,
        make: vehicle.make,
        model: vehicle.model,
        totalMiles,
        totalRevenue,
        revenuePerMile,
        orderCount: orders.length
      }
    });
  } catch (error) {
    console.error("❌ Error fetching vehicle revenue per mile:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching vehicle revenue per mile",
      error: error.message
    });
  }
};

