import mongoose from 'mongoose';
import { User } from "../../models/driver/userModel.js";
import { Payroll } from "../../models/hr/payrollSchemaModel.js";
import { Paystub } from "../../models/hr/paystubModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { analyzeDriverPayrollWithTrips } from "../../services/openaiService.js";
import Order from "../../models/orderModel.js";
import { haversineDistance } from "../../utils/distance.js";
import { getRouteDistance, getCoordinatesFromAddress } from "../../services/googlemap.js";

/**
 * Generate AI-powered payroll recommendations for a driver based on trips
 */
export const generateAIDriverPayroll = async (req, res) => {
  try {
    const { driverId, startDate, endDate } = req.body;

    if (!driverId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Driver ID, start date, and end date are required"
      });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    // Get driver information
    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    // Get salary rates
    const baseRate = driver.details?.salaryPerMile || driver.details?.mileRate || 0;
    const teamRate = driver.details?.mileRateTeam || 0;
    const emptyRate = driver.details?.emptyMileRate || 0;
    const emptyTeamRate = driver.details?.emptyMileRateTeam || 0;
    const snowRate = driver.details?.salaryPerMileSnow || 0;
    const highTempRate = driver.details?.salaryPerMileHighTemp || 0;
    const highTempThreshold = driver.details?.highTempThreshold || 35;

    // Build date range filter
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    endDateObj.setHours(23, 59, 59, 999);

    // Get completed orders for the driver in the date range (as primary driver OR co-driver)
    const driverObjectId = new mongoose.Types.ObjectId(driverId);
    const matchQuery = {
      $and: [
        {
          $or: [
            { driver: driverObjectId },
            { coDriver: driverObjectId }
          ]
        },
        {
          status: 'COMPLETED' // Order status is 'COMPLETED' (uppercase)
        },
        {
          $or: [
            { deliveryDate: { $gte: startDateObj, $lte: endDateObj } },
            { updatedAt: { $gte: startDateObj, $lte: endDateObj } }
          ]
        }
      ]
    };

    if (!isSuperadmin && companyId) {
      const companyObjectId = mongoose.Types.ObjectId.isValid(companyId) 
        ? new mongoose.Types.ObjectId(companyId) 
        : companyId;
      matchQuery.$and.push({ company: { $in: [companyObjectId, companyId] } });
    }

    // Fetch orders with proper population
    const ordersDataRaw = await Order.find(matchQuery)
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'unitNumber plateNumber internalId make model type')
      .populate('trailer', 'unitNumber plateNumber internalId make model type capacity')
      .populate({
        path: 'pickupLocation.placeId',
        select: 'name currentLocation.address currentLocation.latitude currentLocation.longitude',
        model: 'Place'
      })
      .populate({
        path: 'deliveryLocation.placeId',
        select: 'name currentLocation.address currentLocation.latitude currentLocation.longitude',
        model: 'Place'
      })
      .sort({ deliveryDate: -1, updatedAt: -1 })
      .lean();

    // Transform orders data to extract location information
    const ordersData = ordersDataRaw.map(order => {
      let pickupLocation = order.pickupLocation;
      let deliveryLocation = order.deliveryLocation;

      // Extract pickup location
      if (pickupLocation && pickupLocation.placeId && typeof pickupLocation.placeId === 'object') {
        const place = pickupLocation.placeId;
        if (place.currentLocation && place.currentLocation.latitude && place.currentLocation.longitude) {
          pickupLocation = {
            place: place.name || place.currentLocation.address || pickupLocation.place || 'Unknown',
            latitude: String(place.currentLocation.latitude),
            longitude: String(place.currentLocation.longitude)
          };
        } else if (pickupLocation.latitude && pickupLocation.longitude) {
          pickupLocation = {
            place: pickupLocation.place || place.name || 'Unknown',
            latitude: String(pickupLocation.latitude),
            longitude: String(pickupLocation.longitude)
          };
        } else if (pickupLocation.place) {
          pickupLocation = {
            place: pickupLocation.place || place.name || 'Unknown',
            latitude: '',
            longitude: ''
          };
        }
      } else if (pickupLocation && (pickupLocation.place || pickupLocation.latitude)) {
        pickupLocation = {
          place: pickupLocation.place || 'Unknown',
          latitude: pickupLocation.latitude ? String(pickupLocation.latitude) : '',
          longitude: pickupLocation.longitude ? String(pickupLocation.longitude) : ''
        };
      } else {
        pickupLocation = { place: 'Unknown', latitude: '', longitude: '' };
      }

      // Extract delivery location
      if (deliveryLocation && deliveryLocation.placeId && typeof deliveryLocation.placeId === 'object') {
        const place = deliveryLocation.placeId;
        if (place.currentLocation && place.currentLocation.latitude && place.currentLocation.longitude) {
          deliveryLocation = {
            place: place.name || place.currentLocation.address || deliveryLocation.place || 'Unknown',
            latitude: String(place.currentLocation.latitude),
            longitude: String(place.currentLocation.longitude)
          };
        } else if (deliveryLocation.latitude && deliveryLocation.longitude) {
          deliveryLocation = {
            place: deliveryLocation.place || place.name || 'Unknown',
            latitude: String(deliveryLocation.latitude),
            longitude: String(deliveryLocation.longitude)
          };
        } else if (deliveryLocation.place) {
          deliveryLocation = {
            place: deliveryLocation.place || place.name || 'Unknown',
            latitude: '',
            longitude: ''
          };
        }
      } else if (deliveryLocation && (deliveryLocation.place || deliveryLocation.latitude)) {
        deliveryLocation = {
          place: deliveryLocation.place || 'Unknown',
          latitude: deliveryLocation.latitude ? String(deliveryLocation.latitude) : '',
          longitude: deliveryLocation.longitude ? String(deliveryLocation.longitude) : ''
        };
      } else {
        deliveryLocation = { place: 'Unknown', latitude: '', longitude: '' };
      }

      return {
        ...order,
        startLocation: pickupLocation,
        endLocation: deliveryLocation,
        pickupLocation: pickupLocation,
        deliveryLocation: deliveryLocation,
        tripNumber: order.orderNumber // Use orderNumber as tripNumber for compatibility
      };
    });

    if (!ordersData || ordersData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No completed orders found for the selected date range"
      });
    }

    // Calculate order earnings and distances
    const trips = await Promise.all(ordersData.map(async (order) => {
      let distance = 0;
      let pickupLocation = order.pickupLocation || order.startLocation;
      let deliveryLocation = order.deliveryLocation || order.endLocation;

      try {
        // Ensure we have location objects
        if (!pickupLocation) pickupLocation = { place: 'Unknown', latitude: '', longitude: '' };
        if (!deliveryLocation) deliveryLocation = { place: 'Unknown', latitude: '', longitude: '' };

        // Geocode locations if addresses exist but coordinates are missing
        if (pickupLocation.place && pickupLocation.place !== 'Unknown' && (!pickupLocation.latitude || !pickupLocation.longitude)) {
          const coords = await getCoordinatesFromAddress(pickupLocation.place);
          if (coords && coords.latitude && coords.longitude) {
            pickupLocation.latitude = String(coords.latitude);
            pickupLocation.longitude = String(coords.longitude);
          }
        }

        if (deliveryLocation.place && deliveryLocation.place !== 'Unknown' && (!deliveryLocation.latitude || !deliveryLocation.longitude)) {
          const coords = await getCoordinatesFromAddress(deliveryLocation.place);
          if (coords && coords.latitude && coords.longitude) {
            deliveryLocation.latitude = String(coords.latitude);
            deliveryLocation.longitude = String(coords.longitude);
          }
        }

        // Distance calculation priority:
        // 1. order.distance
        // 2. Calculate from coordinates (Google Maps/Haversine)
        if (order.distance && order.distance > 0) {
          distance = order.distance;
        } else if (pickupLocation.latitude && deliveryLocation.latitude) {
          const origin = {
            latitude: parseFloat(pickupLocation.latitude),
            longitude: parseFloat(pickupLocation.longitude)
          };
          const destination = {
            latitude: parseFloat(deliveryLocation.latitude),
            longitude: parseFloat(deliveryLocation.longitude)
          };

          if (!isNaN(origin.latitude) && !isNaN(origin.longitude) && !isNaN(destination.latitude) && !isNaN(destination.longitude)) {
            const routeDistance = await getRouteDistance(origin, destination);
            if (routeDistance !== null && routeDistance > 0) {
              distance = routeDistance;
            } else {
              distance = haversineDistance(
                origin.latitude,
                origin.longitude,
                destination.latitude,
                destination.longitude
              );
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error calculating distance for order ${order.orderNumber || order._id}:`, error.message);
        distance = 0;
      }

      const distanceInMiles = distance * 0.621371;

      // Determine if this driver is primary or co-driver
      const isPrimaryDriver = order.driver && order.driver._id?.toString() === driverId;
      const isCoDriver = order.coDriver && order.coDriver._id?.toString() === driverId;
      const hasCoDriver = !!order.coDriver;

      // Get primary driver's rates (both driver and co-driver get same pay based on primary driver's rates)
      let primaryDriverBaseRate = baseRate;
      let primaryDriverTeamRate = teamRate;
      let primaryDriverEmptyRate = emptyRate;
      let primaryDriverEmptyTeamRate = emptyTeamRate;
      let primaryDriverSnowRate = snowRate;
      let primaryDriverHighTempRate = highTempRate;

      if (isCoDriver && order.driver && order.driver._id) {
        try {
          const primaryDriver = await User.findById(order.driver._id).lean();
          if (primaryDriver) {
            primaryDriverBaseRate = primaryDriver.details?.salaryPerMile || primaryDriver.details?.mileRate || baseRate;
            primaryDriverTeamRate = primaryDriver.details?.mileRateTeam || teamRate;
            primaryDriverEmptyRate = primaryDriver.details?.emptyMileRate || emptyRate;
            primaryDriverEmptyTeamRate = primaryDriver.details?.emptyMileRateTeam || emptyTeamRate;
            primaryDriverSnowRate = primaryDriver.details?.salaryPerMileSnow || snowRate;
            primaryDriverHighTempRate = primaryDriver.details?.salaryPerMileHighTemp || highTempRate;
          }
        } catch (err) {
          console.warn('Could not fetch primary driver rates, using current driver rates:', err.message);
        }
      }

      // Check weather conditions from order
      let hasSnow = false;
      let hasHighTemp = false;

      if (order.weatherConditions?.snow === true) {
        hasSnow = true;
      }

      if (order.weatherConditions?.highTemperature === true) {
        hasHighTemp = true;
      } else if (order.temperature !== null && order.temperature !== undefined) {
        const tempInCelsius = order.temperatureUnit === 'Fahrenheit'
          ? (order.temperature - 32) * 5 / 9
          : order.temperature;
        hasHighTemp = tempInCelsius >= highTempThreshold;
      }

      // Determine which base rate to use based on empty status and co-driver presence
      let rateToUse = primaryDriverBaseRate;
      
      if (order.empty === true) {
        // Order is marked as empty - use empty rates
        if (hasCoDriver) {
          // Empty order with co-driver - use EMPTY-TEAM rate
          rateToUse = primaryDriverEmptyTeamRate || primaryDriverEmptyRate || primaryDriverBaseRate;
        } else {
          // Empty order without co-driver - use EMPTY rate
          rateToUse = primaryDriverEmptyRate || primaryDriverBaseRate;
        }
      } else {
        // Normal (not empty) order
        if (hasCoDriver) {
          // Normal order with co-driver - use TEAM rate
          rateToUse = primaryDriverTeamRate || primaryDriverBaseRate;
        }
        // else use primaryDriverBaseRate (ALONE rate)
      }

      // Calculate earnings using primary driver's rates (same for both driver and co-driver)
      let earnings = distanceInMiles * rateToUse;
      if (hasSnow && primaryDriverSnowRate > 0) {
        earnings += distanceInMiles * primaryDriverSnowRate;
      }
      if (hasHighTemp && primaryDriverHighTempRate > 0) {
        earnings += distanceInMiles * primaryDriverHighTempRate;
      }

      // Determine rate type based on empty flag and co-driver presence
      let rateType = 'ALONE';
      let rateTypeLabel = 'ALONE';
      
      if (order.empty === true) {
        // Order is marked as empty
        if (hasCoDriver) {
          rateType = 'EMPTY-TEAM';
          rateTypeLabel = 'EMPTY-TEAM';
        } else {
          rateType = 'EMPTY';
          rateTypeLabel = 'EMPTY';
        }
      } else {
        // Normal orders (not empty)
        if (hasCoDriver) {
          rateType = 'TEAM';
          rateTypeLabel = 'TEAM';
        }
        // else remains 'ALONE'
      }

      return {
        _id: order._id,
        orderNumber: order.orderNumber || 'N/A',
        tripNumber: order.orderNumber || order.tripNumber, // Use orderNumber as tripNumber for compatibility
        distance: Math.round(distance * 100) / 100,
        distanceInMiles: Math.round(distanceInMiles * 100) / 100,
        earnings: parseFloat(earnings.toFixed(2)),
        baseRate: rateToUse, // The rate that was actually used
        rateType: rateType, // Trip type indicator
        rateTypeLabel: rateTypeLabel, // Label for display
        weatherConditions: {
          snow: hasSnow,
          highTemperature: hasHighTemp
        },
        driverRole: isPrimaryDriver ? 'driver' : (isCoDriver ? 'coDriver' : 'unknown'),
        // Include full order details for UI display
        driver: order.driver,
        coDriver: order.coDriver,
        truck: order.truck,
        trailer: order.trailer,
        startLocation: order.startLocation || order.pickupLocation || { place: 'Unknown', latitude: '', longitude: '' },
        endLocation: order.endLocation || order.deliveryLocation || { place: 'Unknown', latitude: '', longitude: '' },
        pickupLocation: order.pickupLocation || order.startLocation || { place: 'Unknown', latitude: '', longitude: '' },
        deliveryLocation: order.deliveryLocation || order.endLocation || { place: 'Unknown', latitude: '', longitude: '' },
        actualEndDate: order.deliveryDate || order.updatedAt,
        deliveryDate: order.deliveryDate,
        completedDate: order.deliveryDate || order.updatedAt
      };
    }));

    const totalTrips = trips.length;
    const totalMiles = trips.reduce((sum, trip) => sum + (trip.distanceInMiles || 0), 0);
    const totalEarnings = trips.reduce((sum, trip) => sum + (trip.earnings || 0), 0);
    
    // Count trips by type
    const tripsByType = {
      ALONE: trips.filter(t => t.rateType === 'ALONE').length,
      EMPTY: trips.filter(t => t.rateType === 'EMPTY').length,
      TEAM: trips.filter(t => t.rateType === 'TEAM').length,
      'EMPTY-TEAM': trips.filter(t => t.rateType === 'EMPTY-TEAM').length,
      DROP: 0, // Placeholder for future use
      PICK: 0, // Placeholder for future use
      'BONUS/LAYOVER': 0 // Placeholder for future use
    };
    
    const summary = {
      totalTrips,
      totalDistanceMiles: totalMiles,
      totalEarnings,
      tripsByType
    };

    // Calculate performance metrics
    const averageDistancePerTrip = totalTrips > 0 ? totalMiles / totalTrips : 0;

    // Count trips with weather conditions
    const weatherConditionsCount = trips.filter(trip => 
      trip.weatherConditions?.snow || trip.weatherConditions?.highTemperature
    ).length;

    // Calculate on-time delivery rate (simplified - assume all completed trips are on-time)
    // In a real system, you'd check actual vs expected delivery dates
    const onTimeDeliveryRate = totalTrips > 0 ? 0.95 : 0; // Default to 95% as approximation

    // Prepare trip performance data (using orders, but keeping trip naming for compatibility)
    const tripPerformance = trips.slice(0, 10).map(trip => ({
      tripNumber: trip.tripNumber || trip.orderNumber,
      miles: trip.distanceInMiles || 0,
      earnings: typeof trip.earnings === 'string' ? parseFloat(trip.earnings) : trip.earnings,
      weatherConditions: trip.weatherConditions,
      completedDate: trip.actualEndDate || trip.deliveryDate || trip.updatedAt
    }));

    // Get previous payrolls for context
    const previousPayrolls = await Payroll.find({
      userId: driverId,
      company: companyId
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    // Prepare data for AI analysis
    const driverData = {
      driverName: driver.name,
      baseSalary: totalEarnings, // Total earnings from trips
      totalTrips,
      totalMiles,
      totalEarnings,
      tripPerformance,
      startDate,
      endDate,
      previousPayrolls: previousPayrolls.map(p => ({
        baseSalary: p.baseSalary,
        bonus: p.bonus,
        deductions: p.deductions,
        totalSalary: p.totalSalary,
        payDate: p.payDate,
        totalMiles: p.totalMiles
      })),
      onTimeDeliveryRate,
      weatherConditionsCount,
      averageDistancePerTrip
    };

    // Get AI recommendations
    const aiAnalysis = await analyzeDriverPayrollWithTrips(driverData);

    if (!aiAnalysis.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate AI analysis. Please try again or calculate manually.",
        error: aiAnalysis.error
      });
    }

    const recommendations = aiAnalysis.data;
    const bonus = recommendations.recommendedBonus || 0;
    const deductions = recommendations.recommendedDeductions || 0;
    
    // Calculate taxes based on gross salary (base + bonus) for suggestions
    const grossSalary = totalEarnings + bonus;
    const country = 'USA'; // Default, can be made configurable per driver
    
    // Calculate taxes (simplified calculations - same as bulk generation)
    let federalIncomeTaxUS = 0;
    let stateIncomeTaxUS = 0;
    let socialSecurityTax = 0;
    let medicareTax = 0;
    let stateDisabilityInsurance = 0;
    let localTax = 0;
    let federalIncomeTaxCA = 0;
    let provincialIncomeTaxCA = 0;
    let cpp = 0;
    let ei = 0;
    let provincialHealthTaxCA = 0;

    if (country === 'Canada') {
      if (grossSalary > 0) {
        federalIncomeTaxCA = Math.round(grossSalary * 0.15 * 100) / 100;
        provincialIncomeTaxCA = Math.round(grossSalary * 0.10 * 100) / 100;
        cpp = Math.round(Math.min(grossSalary * 0.0595, 3754.45) * 100) / 100;
        ei = Math.round(Math.min(grossSalary * 0.0166, 1002.45) * 100) / 100;
        provincialHealthTaxCA = grossSalary > 20000 ? Math.round(grossSalary * 0.01 * 100) / 100 : 0;
      }
    } else {
      if (grossSalary > 0) {
        federalIncomeTaxUS = Math.round(grossSalary * 0.12 * 100) / 100;
        stateIncomeTaxUS = Math.round(grossSalary * 0.05 * 100) / 100;
        socialSecurityTax = Math.round(Math.min(grossSalary * 0.062, 10453.20) * 100) / 100;
        medicareTax = Math.round(grossSalary * 0.0145 * 100) / 100;
        stateDisabilityInsurance = Math.round(grossSalary * 0.009 * 100) / 100;
        localTax = Math.round(grossSalary * 0.01 * 100) / 100;
      }
    }

    // Return AI recommendations (don't create payroll yet, let user review)
    res.json({
      success: true,
      message: "AI payroll analysis completed successfully",
      data: {
        recommendedBonus: bonus,
        recommendedDeductions: deductions,
        performanceScore: recommendations.performanceScore || 0,
        recommendations: recommendations.recommendations || [],
        performanceNotes: recommendations.performanceNotes || '',
        reasoning: recommendations.reasoning || '',
        // Include tax suggestions
        suggestedTaxes: {
          country: country,
          // Canada taxes
          federalIncomeTaxCA: Math.round(federalIncomeTaxCA * 100) / 100,
          provincialIncomeTaxCA: Math.round(provincialIncomeTaxCA * 100) / 100,
          cpp: Math.round(cpp * 100) / 100,
          ei: Math.round(ei * 100) / 100,
          provincialHealthTaxCA: Math.round(provincialHealthTaxCA * 100) / 100,
          // USA taxes
          federalIncomeTaxUS: Math.round(federalIncomeTaxUS * 100) / 100,
          stateIncomeTaxUS: Math.round(stateIncomeTaxUS * 100) / 100,
          socialSecurityTax: Math.round(socialSecurityTax * 100) / 100,
          medicareTax: Math.round(medicareTax * 100) / 100,
          stateDisabilityInsurance: Math.round(stateDisabilityInsurance * 100) / 100,
          localTax: Math.round(localTax * 100) / 100
        },
        // Include trip summary for reference
        tripSummary: {
          totalTrips,
          totalMiles,
          totalEarnings,
          tripsByType
        },
        // Include trips data with rate type information
        trips: trips
      }
    });
  } catch (error) {
    console.error("❌ Error generating AI driver payroll:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error generating AI payroll analysis",
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Bulk analyze AI-powered payroll for ALL drivers with completed trips in date range
 * Returns suggestions without creating payroll records (user can review and edit)
 */
export const bulkAnalyzeAIDriverPayrolls = async (req, res) => {
  try {
    const { startDate, endDate, payDate, companyFlag } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required"
      });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    // Build date range filter
    const startDateObj = new Date(startDate);
    startDateObj.setHours(0, 0, 0, 0);
    const endDateObj = new Date(endDate);
    endDateObj.setHours(23, 59, 59, 999);

    // Find all drivers who have completed orders in the date range
    // Use flexible date filtering like getCompletedOrdersByDriver (check both deliveryDate and updatedAt)
    const ordersQuery = {
      status: 'completed',
      $or: [
        { deliveryDate: { $gte: startDateObj, $lte: endDateObj } },
        { updatedAt: { $gte: startDateObj, $lte: endDateObj } }
      ]
    };

    // Add company filter (handle both ObjectId and string)
    if (!isSuperadmin && companyId) {
      const companyObjectId = mongoose.Types.ObjectId.isValid(companyId) 
        ? new mongoose.Types.ObjectId(companyId) 
        : companyId;
      ordersQuery.company = { $in: [companyObjectId, companyId] };
    }

    console.log('🔍 Bulk payroll query:', JSON.stringify(ordersQuery, null, 2));

    // Get unique driver IDs from completed orders (both primary drivers AND co-drivers)
    const driversWithOrders = await Order.aggregate([
      { $match: ordersQuery },
      {
        $project: {
          driver: 1,
          coDriver: 1
        }
      },
      {
        $group: {
          _id: null,
          primaryDrivers: { $addToSet: '$driver' },
          coDrivers: { $addToSet: '$coDriver' }
        }
      },
      {
        $project: {
          allDrivers: {
            $setUnion: ['$primaryDrivers', '$coDrivers']
          }
        }
      },
      { $unwind: '$allDrivers' },
      { $match: { allDrivers: { $ne: null } } },
      {
        $group: {
          _id: '$allDrivers'
        }
      }
    ]);

    console.log(`📊 Found ${driversWithOrders?.length || 0} drivers (including co-drivers) with completed orders in date range ${startDate} to ${endDate}`);

    // Debug: Check total completed orders
    const totalCompletedOrders = await Order.countDocuments({
      status: 'completed',
      ...(ordersQuery.company ? { company: ordersQuery.company } : {})
    });
    console.log(`📊 Total completed orders in database (all dates): ${totalCompletedOrders}`);

    if (!driversWithOrders || driversWithOrders.length === 0) {
      // Try to provide more helpful error message
      const anyCompletedOrders = await Order.countDocuments({
        status: 'completed',
        ...(ordersQuery.company ? { company: ordersQuery.company } : {})
      });
      
      const ordersInDateRange = await Order.countDocuments({
        status: 'completed',
        deliveryDate: { $gte: startDateObj, $lte: endDateObj },
        ...(ordersQuery.company ? { company: ordersQuery.company } : {})
      });

      return res.status(400).json({
        success: false,
        message: `No drivers found with completed orders in the selected date range. Total completed orders: ${anyCompletedOrders}, Orders in date range: ${ordersInDateRange}`,
        debug: {
          dateRange: { startDate, endDate },
          totalCompletedOrders: anyCompletedOrders,
          ordersInDateRange: ordersInDateRange,
          companyId: companyId || 'none',
          isSuperadmin: isSuperadmin
        }
      });
    }

    const driverIds = driversWithOrders.map(d => d._id);
    console.log(`📊 Found ${driverIds.length} drivers with completed orders`);

    const results = {
      total: driverIds.length,
      successful: [],
      failed: [],
      skipped: []
    };

    // Process each driver
    for (const driverId of driverIds) {
      try {
        // Get driver information
        const driver = await User.findById(driverId);
        if (!driver) {
          results.skipped.push({
            driverId: driverId.toString(),
            reason: 'Driver not found'
          });
          continue;
        }

        // Skip if driver role is restricted
        const restrictedRoles = ['contact', 'customer', 'reporter', 'admin'];
        if (driver.role && restrictedRoles.includes(driver.role.toLowerCase())) {
          results.skipped.push({
            driverId: driverId.toString(),
            driverName: driver.name,
            reason: `Cannot create payroll for ${driver.role} role`
          });
          continue;
        }

        // Filter by driver type (companyFlag) if provided
        if (companyFlag !== undefined && companyFlag !== null) {
          const driverCompanyFlag = driver.details?.companyFlag ?? driver.companyFlag ?? false;
          if (driverCompanyFlag !== companyFlag) {
            results.skipped.push({
              driverId: driverId.toString(),
              driverName: driver.name,
              reason: `Driver type mismatch (expected companyFlag: ${companyFlag}, got: ${driverCompanyFlag})`
            });
            continue;
          }
        }

        // Check if payroll already exists for this driver and date range
        const existingPayroll = await Payroll.findOne({
          userId: driverId,
          startDate: { $lte: endDateObj },
          endDate: { $gte: startDateObj },
          company: companyId
        });

        if (existingPayroll) {
          results.skipped.push({
            driverId: driverId.toString(),
            driverName: driver.name,
            reason: 'Payroll already exists for this date range'
          });
          continue;
        }

        // Get salary rates
        const baseRate = driver.details?.salaryPerMile || driver.details?.mileRate || 0;
        const teamRate = driver.details?.mileRateTeam || 0;
        const emptyRate = driver.details?.emptyMileRate || 0;
        const emptyTeamRate = driver.details?.emptyMileRateTeam || 0;
        const snowRate = driver.details?.salaryPerMileSnow || 0;
        const highTempRate = driver.details?.salaryPerMileHighTemp || 0;
        const highTempThreshold = driver.details?.highTempThreshold || 35;

        // Fetch additions and deductions for this driver (same as manual payroll creation)
        const { DeductionAddition } = await import("../../models/hr/settlementModel.js");
        const driverAdditions = await DeductionAddition.find({
          assignedTo: driverId,
          type: 'Addition',
          isActive: true
        }).lean();

        const driverDeductions = await DeductionAddition.find({
          assignedTo: driverId,
          type: 'Deduction',
          isActive: true
        }).lean();

        // Calculate additions and deductions for the payroll period (same logic as frontend handleCreate)
        let totalAdditions = 0;
        let totalDeductions = 0;
        const applicableAdditions = [];
        const applicableDeductions = [];

        // Calculate additions (same as frontend lines 1231-1257)
        for (const addition of driverAdditions) {
          if (!addition.isActive) continue;
          
          const addStartDate = addition.startDate ? new Date(addition.startDate) : null;
          const addEndDate = addition.endDate ? new Date(addition.endDate) : null;
          
          // Check if addition is active during the payroll period
          if (addStartDate && addStartDate > endDateObj) continue;
          if (addEndDate && addEndDate < startDateObj) continue;
          
          // Calculate amount based on recurrence
          let amount = addition.amount || 0;
          if (addition.recurrence === 'Weekly') {
            const weeks = Math.ceil((endDateObj.getTime() - Math.max(startDateObj.getTime(), (addStartDate || startDateObj).getTime())) / (7 * 24 * 60 * 60 * 1000));
            amount = amount * Math.max(1, weeks);
          } else if (addition.recurrence === 'Bi-weekly') {
            const biWeeks = Math.ceil((endDateObj.getTime() - Math.max(startDateObj.getTime(), (addStartDate || startDateObj).getTime())) / (14 * 24 * 60 * 60 * 1000));
            amount = amount * Math.max(1, biWeeks);
          } else if (addition.recurrence === 'Monthly') {
            const months = Math.ceil((endDateObj.getTime() - Math.max(startDateObj.getTime(), (addStartDate || startDateObj).getTime())) / (30 * 24 * 60 * 60 * 1000));
            amount = amount * Math.max(1, months);
          }
          // One-time, Quarterly, Yearly are just the amount itself
          
          totalAdditions += amount;
          
          // Store addition details for frontend display
          applicableAdditions.push({
            _id: addition._id,
            name: addition.name || addition.description || 'Addition',
            description: addition.description || '',
            recurrence: addition.recurrence,
            amount: addition.amount || 0,
            calculatedAmount: amount,
            startDate: addition.startDate,
            endDate: addition.endDate,
            currency: addition.currency || 'CAD'
          });
        }

        // Calculate deductions (same as frontend lines 1259-1286)
        for (const deduction of driverDeductions) {
          if (!deduction.isActive) continue;
          
          const dedStartDate = deduction.startDate ? new Date(deduction.startDate) : null;
          const dedEndDate = deduction.endDate ? new Date(deduction.endDate) : null;
          
          // Check if deduction is active during the payroll period
          if (dedStartDate && dedStartDate > endDateObj) continue;
          if (dedEndDate && dedEndDate < startDateObj) continue;
          
          // Calculate amount based on recurrence
          let amount = deduction.amount || 0;
          if (deduction.recurrence === 'Weekly') {
            const weeks = Math.ceil((endDateObj.getTime() - Math.max(startDateObj.getTime(), (dedStartDate || startDateObj).getTime())) / (7 * 24 * 60 * 60 * 1000));
            amount = amount * Math.max(1, weeks);
          } else if (deduction.recurrence === 'Bi-weekly') {
            const biWeeks = Math.ceil((endDateObj.getTime() - Math.max(startDateObj.getTime(), (dedStartDate || startDateObj).getTime())) / (14 * 24 * 60 * 60 * 1000));
            amount = amount * Math.max(1, biWeeks);
          } else if (deduction.recurrence === 'Monthly') {
            const months = Math.ceil((endDateObj.getTime() - Math.max(startDateObj.getTime(), (dedStartDate || startDateObj).getTime())) / (30 * 24 * 60 * 60 * 1000));
            amount = amount * Math.max(1, months);
          }
          // One-time, Quarterly, Yearly are just the amount itself
          
          totalDeductions += amount;
          
          // Store deduction details for frontend display
          applicableDeductions.push({
            _id: deduction._id,
            name: deduction.name || deduction.description || 'Deduction',
            description: deduction.description || '',
            recurrence: deduction.recurrence,
            amount: deduction.amount || 0,
            calculatedAmount: amount,
            startDate: deduction.startDate,
            endDate: deduction.endDate,
            currency: deduction.currency || 'CAD'
          });
        }

        console.log(`💰 Additions/Deductions for ${driver.name}:`, {
          totalAdditions,
          totalDeductions,
          additionsCount: applicableAdditions.length,
          deductionsCount: applicableDeductions.length
        });

        // Get completed orders for this driver (as primary driver OR co-driver)
        const driverObjectId = new mongoose.Types.ObjectId(driverId);
        const driverOrdersQuery = {
          $or: [
            { driver: driverObjectId },
            { coDriver: driverObjectId }
          ],
          status: 'completed'
        };

        // Add date filtering
        const dateConditions = [];
        if (startDate && endDate) {
          dateConditions.push(
            { deliveryDate: { $gte: startDateObj, $lte: endDateObj } },
            { updatedAt: { $gte: startDateObj, $lte: endDateObj } }
          );
        }

        if (dateConditions.length > 0) {
          driverOrdersQuery.$and = [
            {
              $or: [
                { driver: driverObjectId },
                { coDriver: driverObjectId }
              ]
            },
            { $or: dateConditions }
          ];
          delete driverOrdersQuery.$or;
        }

        // Add company filter for individual driver orders
        if (!isSuperadmin && companyId) {
          const companyObjectId = mongoose.Types.ObjectId.isValid(companyId) 
            ? new mongoose.Types.ObjectId(companyId) 
            : companyId;
          driverOrdersQuery.company = { $in: [companyObjectId, companyId] };
        }

        // Use find with proper population (same as getCompletedOrdersByDriver)
        const ordersDataRaw = await Order.find(driverOrdersQuery)
          .populate('driver', 'name email phone')
          .populate('coDriver', 'name email phone')
          .populate('truck', 'unitNumber plateNumber internalId make model type')
          .populate('trailer', 'unitNumber plateNumber internalId')
          .populate({
            path: 'pickupLocation.placeId',
            select: 'name currentLocation.address currentLocation.latitude currentLocation.longitude',
            model: 'Place'
          })
          .populate({
            path: 'deliveryLocation.placeId',
            select: 'name currentLocation.address currentLocation.latitude currentLocation.longitude',
            model: 'Place'
          })
          .sort({ deliveryDate: -1, updatedAt: -1 })
          .lean();

        console.log(`📦 Found ${ordersDataRaw.length} orders for driver ${driver.name}`);

        // Transform to match expected format and extract location data (same as getCompletedOrdersByDriver)
        const ordersData = ordersDataRaw.map(order => {
          let pickupLocation = order.pickupLocation;
          let deliveryLocation = order.deliveryLocation;

          // Extract pickup location
          if (pickupLocation && pickupLocation.placeId && typeof pickupLocation.placeId === 'object') {
            const place = pickupLocation.placeId;
            if (place.currentLocation && place.currentLocation.latitude && place.currentLocation.longitude) {
              pickupLocation = {
                place: place.name || place.currentLocation.address || pickupLocation.place || 'Unknown',
                latitude: String(place.currentLocation.latitude),
                longitude: String(place.currentLocation.longitude)
              };
            } else if (pickupLocation.latitude && pickupLocation.longitude) {
              pickupLocation = {
                place: pickupLocation.place || place.name || 'Unknown',
                latitude: String(pickupLocation.latitude),
                longitude: String(pickupLocation.longitude)
              };
            } else if (pickupLocation.place) {
              pickupLocation = {
                place: pickupLocation.place || place.name || 'Unknown',
                latitude: '',
                longitude: ''
              };
            }
          } else if (pickupLocation && (pickupLocation.place || pickupLocation.latitude)) {
            pickupLocation = {
              place: pickupLocation.place || 'Unknown',
              latitude: pickupLocation.latitude ? String(pickupLocation.latitude) : '',
              longitude: pickupLocation.longitude ? String(pickupLocation.longitude) : ''
            };
          } else {
            pickupLocation = { place: 'Unknown', latitude: '', longitude: '' };
          }

          // Extract delivery location
          if (deliveryLocation && deliveryLocation.placeId && typeof deliveryLocation.placeId === 'object') {
            const place = deliveryLocation.placeId;
            if (place.currentLocation && place.currentLocation.latitude && place.currentLocation.longitude) {
              deliveryLocation = {
                place: place.name || place.currentLocation.address || deliveryLocation.place || 'Unknown',
                latitude: String(place.currentLocation.latitude),
                longitude: String(place.currentLocation.longitude)
              };
            } else if (deliveryLocation.latitude && deliveryLocation.longitude) {
              deliveryLocation = {
                place: deliveryLocation.place || place.name || 'Unknown',
                latitude: String(deliveryLocation.latitude),
                longitude: String(deliveryLocation.longitude)
              };
            } else if (deliveryLocation.place) {
              deliveryLocation = {
                place: deliveryLocation.place || place.name || 'Unknown',
                latitude: '',
                longitude: ''
              };
            }
          } else if (deliveryLocation && (deliveryLocation.place || deliveryLocation.latitude)) {
            deliveryLocation = {
              place: deliveryLocation.place || 'Unknown',
              latitude: deliveryLocation.latitude ? String(deliveryLocation.latitude) : '',
              longitude: deliveryLocation.longitude ? String(deliveryLocation.longitude) : ''
            };
          } else {
            deliveryLocation = { place: 'Unknown', latitude: '', longitude: '' };
          }
          
          return {
            _id: order._id,
            orderNumber: order.orderNumber || 'N/A',
            tripNumber: order.orderNumber || 'N/A', // Use orderNumber as tripNumber for compatibility
            deliveryDate: order.deliveryDate,
            updatedAt: order.updatedAt,
            distance: order.distance,
            pickupLocation: pickupLocation || { place: 'Unknown', latitude: '', longitude: '' },
            deliveryLocation: deliveryLocation || { place: 'Unknown', latitude: '', longitude: '' },
            startLocation: pickupLocation || { place: 'Unknown', latitude: '', longitude: '' }, // For compatibility
            endLocation: deliveryLocation || { place: 'Unknown', latitude: '', longitude: '' }, // For compatibility
            weatherConditions: order.weatherConditions,
            temperature: order.temperature,
            temperatureUnit: order.temperatureUnit,
            driver: order.driver,
            coDriver: order.coDriver,
            truck: order.truck,
            trailer: order.trailer
          };
        });

        if (!ordersData || ordersData.length === 0) {
          results.skipped.push({
            driverId: driverId.toString(),
            driverName: driver.name,
            reason: 'No orders found'
          });
          continue;
        }

        // Calculate order earnings and distances (EXACT same logic as getCompletedOrdersByDriver)
        const orders = await Promise.all(ordersData.map(async (order) => {
          let distance = 0;
          let pickupLocation = order.pickupLocation;
          let deliveryLocation = order.deliveryLocation;

          try {
            // Ensure we have location objects
            if (!pickupLocation) pickupLocation = { place: 'Unknown', latitude: '', longitude: '' };
            if (!deliveryLocation) deliveryLocation = { place: 'Unknown', latitude: '', longitude: '' };

            // Geocode locations if addresses exist but coordinates are missing
            if (pickupLocation.place && pickupLocation.place !== 'Unknown' && (!pickupLocation.latitude || !pickupLocation.longitude)) {
              const coords = await getCoordinatesFromAddress(pickupLocation.place);
              if (coords && coords.latitude && coords.longitude) {
                pickupLocation.latitude = String(coords.latitude);
                pickupLocation.longitude = String(coords.longitude);
              }
            }
            
            if (deliveryLocation.place && deliveryLocation.place !== 'Unknown' && (!deliveryLocation.latitude || !deliveryLocation.longitude)) {
              const coords = await getCoordinatesFromAddress(deliveryLocation.place);
              if (coords && coords.latitude && coords.longitude) {
                deliveryLocation.latitude = String(coords.latitude);
                deliveryLocation.longitude = String(coords.longitude);
              }
            }

            // Distance calculation priority (same as getCompletedOrdersByDriver):
            // 1. order.distance
            // 2. Calculate from coordinates (Google Maps/Haversine)

            if (order.distance && order.distance > 0) {
              distance = order.distance;
            } else if (pickupLocation.latitude && deliveryLocation.latitude) {
              // Calculate distance from coordinates
              const origin = {
                latitude: parseFloat(pickupLocation.latitude),
                longitude: parseFloat(pickupLocation.longitude)
              };
              const destination = {
                latitude: parseFloat(deliveryLocation.latitude),
                longitude: parseFloat(deliveryLocation.longitude)
              };

              if (!isNaN(origin.latitude) && !isNaN(origin.longitude) && !isNaN(destination.latitude) && !isNaN(destination.longitude)) {
                // Try Google Maps route distance first
                const routeDistance = await getRouteDistance(origin, destination);
                if (routeDistance !== null && routeDistance > 0) {
                  distance = routeDistance;
                } else {
                  // Fallback to haversine
                  distance = haversineDistance(
                    origin.latitude,
                    origin.longitude,
                    destination.latitude,
                    destination.longitude
                  );
                }
              }
            }
          } catch (error) {
            console.error(`❌ Error calculating distance for order ${order.orderNumber || order._id}:`, error.message);
            distance = 0;
          }

          const distanceInMiles = distance * 0.621371;

          // Determine if this driver is primary or co-driver
          const isPrimaryDriver = order.driver && order.driver._id?.toString() === driverId.toString();
          const isCoDriver = order.coDriver && order.coDriver._id?.toString() === driverId.toString();
          const hasCoDriver = !!order.coDriver;

          // Get primary driver's rates (both driver and co-driver get same pay based on primary driver's rates)
          let primaryDriverBaseRate = baseRate;
          let primaryDriverTeamRate = teamRate;
          let primaryDriverEmptyRate = emptyRate;
          let primaryDriverEmptyTeamRate = emptyTeamRate;
          let primaryDriverSnowRate = snowRate;
          let primaryDriverHighTempRate = highTempRate;

          if (isCoDriver && order.driver && order.driver._id) {
            try {
              const primaryDriver = await User.findById(order.driver._id).lean();
              if (primaryDriver) {
                primaryDriverBaseRate = primaryDriver.details?.salaryPerMile || primaryDriver.details?.mileRate || baseRate;
                primaryDriverTeamRate = primaryDriver.details?.mileRateTeam || teamRate;
                primaryDriverEmptyRate = primaryDriver.details?.emptyMileRate || emptyRate;
                primaryDriverEmptyTeamRate = primaryDriver.details?.emptyMileRateTeam || emptyTeamRate;
                primaryDriverSnowRate = primaryDriver.details?.salaryPerMileSnow || snowRate;
                primaryDriverHighTempRate = primaryDriver.details?.salaryPerMileHighTemp || highTempRate;
              }
            } catch (err) {
              console.warn('Could not fetch primary driver rates, using current driver rates:', err.message);
            }
          }

          // Check weather conditions
          let hasSnow = false;
          let hasHighTemp = false;
          
          if (order.weatherConditions?.snow === true) {
            hasSnow = true;
          }

          if (order.weatherConditions?.highTemperature === true) {
            hasHighTemp = true;
          } else if (order.temperature !== null && order.temperature !== undefined) {
            // Auto-detect from temperature if not explicitly set
            const tempInCelsius = order.temperatureUnit === 'Fahrenheit'
              ? (order.temperature - 32) * 5 / 9
              : order.temperature;
            hasHighTemp = tempInCelsius >= highTempThreshold;
          }

          // Determine which base rate to use based on empty status and co-driver presence
          let rateToUse = primaryDriverBaseRate;
          
          if (order.empty === true) {
            // Order is marked as empty - use empty rates
            if (hasCoDriver) {
              // Empty order with co-driver - use EMPTY-TEAM rate
              rateToUse = primaryDriverEmptyTeamRate || primaryDriverEmptyRate || primaryDriverBaseRate;
            } else {
              // Empty order without co-driver - use EMPTY rate
              rateToUse = primaryDriverEmptyRate || primaryDriverBaseRate;
            }
          } else {
            // Normal (not empty) order
            if (hasCoDriver) {
              // Normal order with co-driver - use TEAM rate
              rateToUse = primaryDriverTeamRate || primaryDriverBaseRate;
            }
            // else use primaryDriverBaseRate (ALONE rate)
          }

          // Calculate earnings using primary driver's rates (same for both driver and co-driver)
          let earnings = distanceInMiles * rateToUse;
          if (hasSnow && primaryDriverSnowRate > 0) {
            earnings += distanceInMiles * primaryDriverSnowRate;
          }
          if (hasHighTemp && primaryDriverHighTempRate > 0) {
            earnings += distanceInMiles * primaryDriverHighTempRate;
          }

          // Determine rate type based on empty flag and co-driver presence
          let rateType = 'ALONE';
          let rateTypeLabel = 'ALONE';
          
          if (order.empty === true) {
            // Order is marked as empty
            if (hasCoDriver) {
              rateType = 'EMPTY-TEAM';
              rateTypeLabel = 'EMPTY-TEAM';
            } else {
              rateType = 'EMPTY';
              rateTypeLabel = 'EMPTY';
            }
          } else {
            // Normal orders (not empty)
            if (hasCoDriver) {
              rateType = 'TEAM';
              rateTypeLabel = 'TEAM';
            }
            // else remains 'ALONE'
          }

          return {
            _id: order._id,
            orderNumber: order.orderNumber || 'N/A',
            tripNumber: order.orderNumber || 'N/A', // For compatibility
            distance: Math.round(distance * 100) / 100,
            distanceInMiles: Math.round(distanceInMiles * 100) / 100,
            earnings: parseFloat(earnings.toFixed(2)),
            baseRate: rateToUse, // The rate that was actually used
            rateType: rateType, // Trip type indicator
            rateTypeLabel: rateTypeLabel, // Label for display
            weatherConditions: {
              snow: hasSnow,
              highTemperature: hasHighTemp
            },
            driverRole: isPrimaryDriver ? 'driver' : (isCoDriver ? 'coDriver' : 'unknown'),
            // Include full order details for UI display
            driver: order.driver,
            coDriver: order.coDriver,
            truck: order.truck,
            trailer: order.trailer,
            startLocation: pickupLocation || { place: 'Unknown', latitude: '', longitude: '' },
            endLocation: deliveryLocation || { place: 'Unknown', latitude: '', longitude: '' },
            pickupLocation: pickupLocation || { place: 'Unknown', latitude: '', longitude: '' },
            deliveryLocation: deliveryLocation || { place: 'Unknown', latitude: '', longitude: '' },
            actualEndDate: order.deliveryDate || order.updatedAt,
            deliveryDate: order.deliveryDate,
            completedDate: order.deliveryDate || order.updatedAt
          };
        }));

        const totalTrips = orders.length;
        const totalMiles = orders.reduce((sum, order) => sum + (order.distanceInMiles || 0), 0);
        const totalEarnings = orders.reduce((sum, order) => sum + (order.earnings || 0), 0);

        // Count trips by type
        const tripsByType = {
          ALONE: orders.filter(o => o.rateType === 'ALONE').length,
          EMPTY: orders.filter(o => o.rateType === 'EMPTY').length,
          TEAM: orders.filter(o => o.rateType === 'TEAM').length,
          'EMPTY-TEAM': orders.filter(o => o.rateType === 'EMPTY-TEAM').length,
          DROP: 0, // Placeholder for future use
          PICK: 0, // Placeholder for future use
          'BONUS/LAYOVER': 0 // Placeholder for future use
        };

        // Debug: Check if we have order IDs
        console.log(`📋 Orders for ${driver.name}:`, orders.map(o => ({ 
          orderNumber: o.orderNumber, 
          _id: o._id?.toString()?.substring(0, 8), 
          miles: o.distanceInMiles, 
          earnings: o.earnings 
        })));

        console.log(`💰 Driver ${driver.name}: ${totalTrips} orders, ${totalMiles.toFixed(2)} miles, $${totalEarnings.toFixed(2)} earnings, baseRate=$${baseRate}/mi`);

        // If no miles/earnings calculated, log warning
        if (totalMiles === 0 || totalEarnings === 0) {
          console.warn(`⚠️ Warning: Driver ${driver.name} has 0 miles or earnings. Check order data.`);
          console.warn(`   Sample order data:`, JSON.stringify(ordersData[0], null, 2));
        }
        const averageDistancePerTrip = totalTrips > 0 ? totalMiles / totalTrips : 0;
        const weatherConditionsCount = orders.filter(order => 
          order.weatherConditions?.snow || order.weatherConditions?.highTemperature
        ).length;
        const onTimeDeliveryRate = totalTrips > 0 ? 0.95 : 0; // Default approximation

        // Get previous payrolls for context
        const previousPayrolls = await Payroll.find({
          userId: driverId,
          company: companyId
        })
          .sort({ createdAt: -1 })
          .limit(3)
          .lean();

        // Prepare data for AI analysis
        const driverData = {
          driverName: driver.name,
          baseSalary: totalEarnings,
          totalTrips,
          totalMiles,
          totalEarnings,
          tripPerformance: orders.slice(0, 10).map(order => ({
            tripNumber: order.orderNumber || order.tripNumber,
            miles: order.distanceInMiles || 0,
            earnings: order.earnings,
            weatherConditions: order.weatherConditions,
            completedDate: ordersData.find(o => o._id.toString() === order._id.toString())?.deliveryDate
          })),
          startDate,
          endDate,
          previousPayrolls: previousPayrolls.map(p => ({
            baseSalary: p.baseSalary,
            bonus: p.bonus,
            deductions: p.deductions,
            totalSalary: p.totalSalary,
            payDate: p.payDate,
            totalMiles: p.totalMiles
          })),
          onTimeDeliveryRate,
          weatherConditionsCount,
          averageDistancePerTrip
        };

        // Get AI recommendations
        const aiAnalysis = await analyzeDriverPayrollWithTrips(driverData);

        if (!aiAnalysis.success) {
          results.failed.push({
            driverId: driverId.toString(),
            driverName: driver.name,
            reason: 'AI analysis failed',
            error: aiAnalysis.error
          });
          continue;
        }

        const recommendations = aiAnalysis.data;
        const aiRecommendedBonus = recommendations.recommendedBonus || 0;
        
        // Use calculated deductions from driver profile (not AI recommendations)
        // Same as frontend: finalDeductions = totalDeductions
        const finalDeductions = totalDeductions;
        
        // Calculate taxes based on gross salary (base earnings + bonus + additions)
        // Gross Earnings = Trip Earnings + Bonus + Additions (same as manual payroll)
        // Note: bonus and additions are separate (bonus is AI recommended, additions come from driver profile)
        const grossSalary = totalEarnings + aiRecommendedBonus + totalAdditions;
        const country = 'USA'; // Default, can be made configurable per driver
        
        // Calculate taxes (simplified calculations - can be enhanced with actual tax brackets)
        let federalIncomeTaxUS = 0;
        let stateIncomeTaxUS = 0;
        let socialSecurityTax = 0;
        let medicareTax = 0;
        let stateDisabilityInsurance = 0;
        let localTax = 0;
        let federalIncomeTaxCA = 0;
        let provincialIncomeTaxCA = 0;
        let cpp = 0;
        let ei = 0;
        let provincialHealthTaxCA = 0;

        if (country === 'Canada') {
          // Canada tax calculations (simplified)
          if (grossSalary > 0) {
            federalIncomeTaxCA = Math.round(grossSalary * 0.15 * 100) / 100; // Simplified 15%
            provincialIncomeTaxCA = Math.round(grossSalary * 0.10 * 100) / 100; // Simplified 10%
            cpp = Math.round(Math.min(grossSalary * 0.0595, 3754.45) * 100) / 100; // CPP max for 2024
            ei = Math.round(Math.min(grossSalary * 0.0166, 1002.45) * 100) / 100; // EI max for 2024
            provincialHealthTaxCA = grossSalary > 20000 ? Math.round(grossSalary * 0.01 * 100) / 100 : 0;
          }
        } else {
          // USA tax calculations (simplified)
          if (grossSalary > 0) {
            federalIncomeTaxUS = Math.round(grossSalary * 0.12 * 100) / 100; // Simplified 12%
            stateIncomeTaxUS = Math.round(grossSalary * 0.05 * 100) / 100; // Simplified 5%
            // Social Security: 6.2% up to wage base limit ($168,600 for 2024)
            socialSecurityTax = Math.round(Math.min(grossSalary * 0.062, 10453.20) * 100) / 100;
            // Medicare: 1.45% on all earnings
            medicareTax = Math.round(grossSalary * 0.0145 * 100) / 100;
            stateDisabilityInsurance = Math.round(grossSalary * 0.009 * 100) / 100; // Simplified 0.9%
            localTax = Math.round(grossSalary * 0.01 * 100) / 100; // Simplified 1%
          }
        }

        // Calculate total taxes
        let totalTaxes = 0;
        if (country === 'Canada') {
          totalTaxes = federalIncomeTaxCA + provincialIncomeTaxCA + cpp + ei + provincialHealthTaxCA;
        } else {
          totalTaxes = federalIncomeTaxUS + stateIncomeTaxUS + socialSecurityTax + medicareTax + stateDisabilityInsurance + localTax;
        }

        // Calculate final total salary (gross - deductions - taxes) - for suggestion only
        // Same as manual payroll: Net Pay = Gross Earnings - Total Deductions - Taxes
        const finalTotalSalary = Math.round((grossSalary - finalDeductions - totalTaxes) * 100) / 100;

        // Get order IDs - use original ordersData to ensure we have _id
        // Note: For payroll, we still use tripIds field but populate with order IDs
        const orderIds = ordersData.map(order => order._id).filter(id => id);
        
        console.log(`🔗 Order IDs for ${driver.name}:`, orderIds.length, 'orders');

        // Return suggestion instead of creating payroll (user will review and create)
        results.successful.push({
          driverId: driverId.toString(),
          driverName: driver.name,
          driverEmail: driver.email || '',
          driverPhone: driver.phone || '',
          baseSalary: totalEarnings, // Trip earnings only
          bonus: aiRecommendedBonus, // AI recommended bonus only (additions are separate)
          deductions: finalDeductions, // Calculated deductions from driver profile (same as manual payroll)
          totalSalary: finalTotalSalary,
          totalTrips,
          totalMiles: Math.round(totalMiles * 100) / 100,
          ratePerMile: baseRate,
          tripIds: orderIds.map(id => id.toString()), // Store order IDs in tripIds field for compatibility
          // Include additions and deductions details for frontend display (same as manual payroll)
          additions: applicableAdditions, // Full addition objects with details
          deductionsDetails: applicableDeductions, // Full deduction objects with details
          totalAdditions: totalAdditions, // Total calculated additions amount
          totalDeductions: totalDeductions, // Total calculated deductions amount
          // Tax suggestions (user can edit)
          country: country,
          // Canada taxes
          federalIncomeTaxCA: Math.round(federalIncomeTaxCA * 100) / 100,
          provincialIncomeTaxCA: Math.round(provincialIncomeTaxCA * 100) / 100,
          cpp: Math.round(cpp * 100) / 100,
          ei: Math.round(ei * 100) / 100,
          provincialHealthTaxCA: Math.round(provincialHealthTaxCA * 100) / 100,
          // USA taxes
          federalIncomeTaxUS: Math.round(federalIncomeTaxUS * 100) / 100,
          stateIncomeTaxUS: Math.round(stateIncomeTaxUS * 100) / 100,
          socialSecurityTax: Math.round(socialSecurityTax * 100) / 100,
          medicareTax: Math.round(medicareTax * 100) / 100,
          stateDisabilityInsurance: Math.round(stateDisabilityInsurance * 100) / 100,
          localTax: Math.round(localTax * 100) / 100,
          // AI analysis data
          performanceScore: recommendations.performanceScore || 0,
          recommendations: recommendations.recommendations || [],
          performanceNotes: recommendations.performanceNotes || '',
          reasoning: recommendations.reasoning || '',
          // Trip type breakdown and trips data
          tripsByType: tripsByType,
          trips: orders // Include trips data with rate type information
        });

        console.log(`✅ Analyzed payroll for ${driver.name}: $${finalTotalSalary.toFixed(2)}`);

      } catch (error) {
        console.error(`❌ Error processing driver ${driverId}:`, error);
        results.failed.push({
          driverId: driverId.toString(),
          reason: error.message || 'Unknown error',
          error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    }

    // Return suggestions (not created payrolls)
    res.json({
      success: true,
      message: `Analyzed ${results.total} drivers. ${results.successful.length} payroll suggestions generated.`,
      data: {
        summary: {
          total: results.total,
          successful: results.successful.length,
          failed: results.failed.length,
          skipped: results.skipped.length
        },
        suggestions: results.successful, // Return as suggestions
        failed: results.failed,
        skipped: results.skipped,
        startDate,
        endDate,
        payDate: payDate || new Date().toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error("❌ Error bulk analyzing AI driver payrolls:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error bulk analyzing payrolls",
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Bulk create payrolls from AI suggestions (after user review and edit)
 */
export const bulkCreateDriverPayrolls = async (req, res) => {
  try {
    const { payrolls, startDate, endDate, payDate } = req.body;

    if (!payrolls || !Array.isArray(payrolls) || payrolls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Payrolls array is required"
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required"
      });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const startDateObj = new Date(startDate);
    startDateObj.setHours(0, 0, 0, 0);
    const endDateObj = new Date(endDate);
    endDateObj.setHours(23, 59, 59, 999);

    const results = {
      total: payrolls.length,
      successful: [],
      failed: []
    };

    // Create payroll for each driver
    for (const payrollData of payrolls) {
      try {
        const {
          driverId,
          baseSalary,
          bonus,
          deductions,
          totalAdditions, // Sum of edited addition amounts
          totalDeductions, // Sum of edited deduction amounts
          additions, // Array of addition objects with edited calculatedAmount
          deductionsDetails, // Array of deduction objects with edited calculatedAmount
          country,
          tripIds,
          // Canada taxes
          federalIncomeTaxCA,
          provincialIncomeTaxCA,
          cpp,
          ei,
          provincialHealthTaxCA,
          // USA taxes
          federalIncomeTaxUS,
          stateIncomeTaxUS,
          socialSecurityTax,
          medicareTax,
          stateDisabilityInsurance,
          localTax
        } = payrollData;

        // Calculate final bonus: AI recommended bonus + edited additions
        // If additions array exists, sum the edited calculatedAmount values
        let finalAdditions = 0;
        if (additions && Array.isArray(additions) && additions.length > 0) {
          finalAdditions = additions.reduce((sum, a) => {
            return sum + (parseFloat(a.calculatedAmount || a.amount || 0));
          }, 0);
        } else if (totalAdditions) {
          finalAdditions = parseFloat(totalAdditions) || 0;
        }

        // Calculate final deductions: use edited deduction amounts
        let finalDeductions = 0;
        if (deductionsDetails && Array.isArray(deductionsDetails) && deductionsDetails.length > 0) {
          finalDeductions = deductionsDetails.reduce((sum, d) => {
            return sum + (parseFloat(d.calculatedAmount || d.amount || 0));
          }, 0);
        } else if (totalDeductions) {
          finalDeductions = parseFloat(totalDeductions) || 0;
        } else if (deductions) {
          finalDeductions = parseFloat(deductions) || 0;
        }

        // Final bonus = AI recommended bonus + edited additions (same as manual payroll)
        const finalBonus = (parseFloat(bonus || 0)) + finalAdditions;

        if (!driverId) {
          results.failed.push({
            driverId: driverId || 'unknown',
            reason: 'Driver ID is required'
          });
          continue;
        }

        // Check if payroll already exists
        const existingPayroll = await Payroll.findOne({
          userId: driverId,
          startDate: { $lte: endDateObj },
          endDate: { $gte: startDateObj },
          company: companyId
        });

        if (existingPayroll) {
          results.failed.push({
            driverId: driverId.toString(),
            reason: 'Payroll already exists for this date range'
          });
          continue;
        }

        // Calculate total taxes
        let totalTaxes = 0;
        if (country === 'Canada') {
          totalTaxes = (parseFloat(federalIncomeTaxCA || 0)) +
            (parseFloat(provincialIncomeTaxCA || 0)) +
            (parseFloat(cpp || 0)) +
            (parseFloat(ei || 0)) +
            (parseFloat(provincialHealthTaxCA || 0));
        } else {
          totalTaxes = (parseFloat(federalIncomeTaxUS || 0)) +
            (parseFloat(stateIncomeTaxUS || 0)) +
            (parseFloat(socialSecurityTax || 0)) +
            (parseFloat(medicareTax || 0)) +
            (parseFloat(stateDisabilityInsurance || 0)) +
            (parseFloat(localTax || 0));
        }

        // Calculate final total salary
        // Gross Earnings = Trip Earnings + Bonus + Additions (same as manual payroll)
        const grossSalary = parseFloat(baseSalary || 0) + finalBonus;
        // Net Pay = Gross Earnings - Deductions - Taxes
        const finalTotalSalary = Math.round((grossSalary - finalDeductions - totalTaxes) * 100) / 100;

        // Create payroll record
        const payroll = new Payroll({
          userId: driverId,
          baseSalary: parseFloat(baseSalary || 0),
          bonus: finalBonus, // AI recommended bonus + edited additions
          deductions: finalDeductions, // Edited deductions from driver profile
          totalSalary: finalTotalSalary,
          payDate: payDate ? new Date(payDate) : new Date(),
          startDate: startDateObj,
          endDate: endDateObj,
          trips: Array.isArray(tripIds) ? tripIds.map(id => new mongoose.Types.ObjectId(id)) : [],
          totalMiles: parseFloat(payrollData.totalMiles || 0),
          ratePerMile: parseFloat(Number(payrollData.ratePerMile || 0).toFixed(2)),
          // Tax fields
          country: country || 'USA',
          // Canada taxes
          federalIncomeTaxCA: Math.round((parseFloat(federalIncomeTaxCA || 0)) * 100) / 100,
          provincialIncomeTaxCA: Math.round((parseFloat(provincialIncomeTaxCA || 0)) * 100) / 100,
          cpp: Math.round((parseFloat(cpp || 0)) * 100) / 100,
          ei: Math.round((parseFloat(ei || 0)) * 100) / 100,
          provincialHealthTaxCA: Math.round((parseFloat(provincialHealthTaxCA || 0)) * 100) / 100,
          // USA taxes
          federalIncomeTaxUS: Math.round((parseFloat(federalIncomeTaxUS || 0)) * 100) / 100,
          stateIncomeTaxUS: Math.round((parseFloat(stateIncomeTaxUS || 0)) * 100) / 100,
          socialSecurityTax: Math.round((parseFloat(socialSecurityTax || 0)) * 100) / 100,
          medicareTax: Math.round((parseFloat(medicareTax || 0)) * 100) / 100,
          stateDisabilityInsurance: Math.round((parseFloat(stateDisabilityInsurance || 0)) * 100) / 100,
          localTax: Math.round((parseFloat(localTax || 0)) * 100) / 100,
          company: companyId
        });

        await payroll.save();

        // Automatically create paystub (same as manual payroll creation)
        try {
          // Get driver/user details
          const driver = await User.findById(driverId).lean();
          if (!driver) {
            throw new Error('Driver not found');
          }

          // Populate payroll to get company details
          await payroll.populate('company', 'companyName address contactPhone contactEmail logoUrl');
          
          // Fetch company settings for details
          const CompanySettings = (await import("../../models/driver/companysettingsModel.js")).CompanySettings;
          const companyDetails = companyId ? await CompanySettings.findById(companyId).lean() : null;
          
          // Fetch trip/order details if tripIds exist
          let tripDetailsArray = [];
          if (tripIds && Array.isArray(tripIds) && tripIds.length > 0) {
            try {
              const orders = await Order.find({ _id: { $in: tripIds } })
                .populate('truck', 'unitNumber plateNumber internalId')
                .populate('driver', 'name')
                .populate('coDriver', 'name')
                .lean();
              
              for (const order of orders) {
                const truckNumber = order.truck?.internalId || order.truck?.unitNumber || order.truck?.plateNumber || 'N/A';
                const payType = 'Paid Per Mile';
                const loadNumber = order.orderNumber || 'N/A';
                
                // Determine trip type based on order data
                let tripType = 'ALONE';
                const hasCoDriver = !!order.coDriver;
                const isEmpty = order.empty === true;
                
                if (isEmpty) {
                  tripType = hasCoDriver ? 'EMPTY-TEAM' : 'EMPTY';
                } else if (hasCoDriver) {
                  tripType = 'TEAM';
                }
                
                const periodFrom = order.pickupDate || order.createdAt || new Date();
                const periodTo = order.deliveryDate || order.updatedAt || new Date();
                const origin = order.pickupLocation?.place || 'N/A';
                const destination = order.deliveryLocation?.place || 'N/A';
                
                // Calculate miles from distance
                const distanceKm = order.distance || 0;
                const miles = Math.round((distanceKm * 0.621371) * 100) / 100;
                
                const payRate = parseFloat(Number(payrollData.ratePerMile || 0).toFixed(2));
                const amountCAD = Math.round((miles * payRate) * 100) / 100;
                const amountUSD = amountCAD;
                
                tripDetailsArray.push({
                  truckNumber,
                  payType,
                  loadNumber,
                  tripType,
                  periodFrom,
                  periodTo,
                  origin,
                  destination,
                  payRate,
                  miles,
                  hours: 0,
                  amountCAD,
                  amountUSD
                });
              }
            } catch (tripError) {
              console.error('⚠️ Error fetching trip details for paystub:', tripError);
            }
          }
          
          // Build additions array from payrollData
          let additionsArray = [];
          if (additions && Array.isArray(additions) && additions.length > 0) {
            additionsArray = additions.map(add => ({
              loadDate: add.loadDate ? new Date(add.loadDate) : new Date(),
              memo: add.memo || add.description || add.name || '',
              amount: parseFloat(add.calculatedAmount || add.amount || 0),
              per: add.per || 'One Time',
              gst: parseFloat(add.gst || 0),
              totalCAD: parseFloat(add.calculatedAmount || add.amount || 0)
            }));
          }
          
          // Calculate totals
          const base = parseFloat(baseSalary || 0);
          const extra = finalBonus;
          const deduct = finalDeductions;
          const grossPay = base + extra;
          const mileageEarnings = parseFloat(payrollData.totalMiles || 0) * parseFloat(payrollData.ratePerMile || 0);
          const totalDeductions = deduct + totalTaxes;
          const netPay = finalTotalSalary;
          
          // Count trips
          const tripsCount = tripIds && Array.isArray(tripIds) ? tripIds.length : 0;
          const loadsCount = tripsCount; // Same as trips for drivers
          
          // Determine work type based on driver's companyFlag
          // Note: companyFlag=true = Owner Operator, companyFlag=false = Company Driver
          const companyFlag = driver.details?.companyFlag ?? driver.companyFlag ?? false;
          // companyFlag=false means Company Driver, companyFlag=true means Owner Operator
          const workType = companyFlag === false ? 'Driver' : 'Owner-Operator';
          
          // Generate paystub ID
          const paystubId = `PS-${payroll._id.toString().slice(-8).toUpperCase()}-${new Date().getFullYear()}`;
          
          // Build earnings breakdown
          const earningsBreakdown = [];
          if (base > 0) {
            earningsBreakdown.push({
              type: 'Basic Pay',
              units: 'Trips',
              rate: 0,
              amount: base
            });
          }
          if (extra > 0) {
            earningsBreakdown.push({
              type: 'Bonus',
              units: '',
              rate: 0,
              amount: extra
            });
          }
          if (mileageEarnings > 0) {
            earningsBreakdown.push({
              type: 'Trip Pay / Mileage',
              units: `${payrollData.totalMiles || 0} Miles`,
              rate: parseFloat(payrollData.ratePerMile || 0),
              amount: mileageEarnings
            });
          }
          
          // Build deductions breakdown
          const deductionsBreakdown = [];
          if (deduct > 0) {
            deductionsBreakdown.push({
              type: 'Other Deductions',
              amount: deduct
            });
          }
          if (country === 'Canada') {
            if (federalIncomeTaxCA > 0) deductionsBreakdown.push({ type: 'Federal Income Tax', amount: parseFloat(federalIncomeTaxCA || 0) });
            if (provincialIncomeTaxCA > 0) deductionsBreakdown.push({ type: 'Provincial Income Tax', amount: parseFloat(provincialIncomeTaxCA || 0) });
            if (cpp > 0) deductionsBreakdown.push({ type: 'CPP', amount: parseFloat(cpp || 0) });
            if (ei > 0) deductionsBreakdown.push({ type: 'EI', amount: parseFloat(ei || 0) });
            if (provincialHealthTaxCA > 0) deductionsBreakdown.push({ type: 'Provincial Health Tax', amount: parseFloat(provincialHealthTaxCA || 0) });
          } else {
            if (federalIncomeTaxUS > 0) deductionsBreakdown.push({ type: 'Federal Income Tax', amount: parseFloat(federalIncomeTaxUS || 0) });
            if (stateIncomeTaxUS > 0) deductionsBreakdown.push({ type: 'State Income Tax', amount: parseFloat(stateIncomeTaxUS || 0) });
            if (socialSecurityTax > 0) deductionsBreakdown.push({ type: 'Social Security Tax', amount: parseFloat(socialSecurityTax || 0) });
            if (medicareTax > 0) deductionsBreakdown.push({ type: 'Medicare Tax', amount: parseFloat(medicareTax || 0) });
            if (stateDisabilityInsurance > 0) deductionsBreakdown.push({ type: 'State Disability Insurance', amount: parseFloat(stateDisabilityInsurance || 0) });
            if (localTax > 0) deductionsBreakdown.push({ type: 'Local Tax', amount: parseFloat(localTax || 0) });
          }
          
          // Calculate YTD (Year-to-Date)
          const currentYear = new Date().getFullYear();
          const yearStart = new Date(currentYear, 0, 1);
          const existingPaystubs = await Paystub.find({
            userId: driverId,
            'payPeriod.payDate': { $gte: yearStart },
            status: { $ne: 'void' }
          }).select('summary').lean();
          
          const ytdEarnings = existingPaystubs.reduce((sum, ps) => sum + (ps.summary?.grossPay || 0), 0) + (grossPay + mileageEarnings);
          const ytdDeductions = existingPaystubs.reduce((sum, ps) => sum + (ps.summary?.totalDeductions || 0), 0) + totalDeductions;
          const ytdNetPay = existingPaystubs.reduce((sum, ps) => sum + (ps.summary?.netPay || 0), 0) + netPay;
          
          // Get user address
          const userAddress = driver.city && driver.state 
            ? `${driver.city}, ${driver.state}${driver.country ? ', ' + driver.country : ''}`
            : driver.country || '';
          
          // Create paystub
          const paystub = new Paystub({
            payrollId: payroll._id,
            userId: driverId,
            employeeName: driver.name || 'Unknown',
            employeeId: driver.internalId || '',
            employeeEmail: driver.email || '',
            employeeRole: driver.role || '',
            employeeDepartment: '',
            employeeAddress: userAddress,
            workType: workType,
            payPeriod: {
              startDate: startDateObj,
              endDate: endDateObj,
              payDate: payDate ? new Date(payDate) : new Date()
            },
            paystubId: paystubId,
            earnings: {
              baseSalary: base,
              bonus: extra,
              overtime: 0,
              overtimeHours: 0,
              overtimeRate: 0,
              mileageEarnings: mileageEarnings,
              tripPay: mileageEarnings,
              allowance: 0,
              incentives: 0,
              regularHours: 0,
              hourlyRate: 0,
              totalEarnings: grossPay + mileageEarnings,
              earningsBreakdown: earningsBreakdown
            },
            deductions: {
              totalDeductions: totalDeductions,
              otherDeductions: deduct,
              advanceRecovery: 0,
              loanEMI: 0,
              insurance: 0,
              payrollPenalty: 0,
              deductionsBreakdown: deductionsBreakdown
            },
            taxesCA: country === 'Canada' ? {
              federalIncomeTax: parseFloat(federalIncomeTaxCA || 0),
              provincialIncomeTax: parseFloat(provincialIncomeTaxCA || 0),
              cpp: parseFloat(cpp || 0),
              ei: parseFloat(ei || 0),
              provincialHealthTax: parseFloat(provincialHealthTaxCA || 0),
              totalTaxes: totalTaxes
            } : {
              federalIncomeTax: 0,
              provincialIncomeTax: 0,
              cpp: 0,
              ei: 0,
              provincialHealthTax: 0,
              totalTaxes: 0
            },
            taxesUS: country === 'USA' ? {
              federalIncomeTax: parseFloat(federalIncomeTaxUS || 0),
              stateIncomeTax: parseFloat(stateIncomeTaxUS || 0),
              socialSecurityTax: parseFloat(socialSecurityTax || 0),
              medicareTax: parseFloat(medicareTax || 0),
              stateDisabilityInsurance: parseFloat(stateDisabilityInsurance || 0),
              localTax: parseFloat(localTax || 0),
              totalTaxes: totalTaxes
            } : {
              federalIncomeTax: 0,
              stateIncomeTax: 0,
              socialSecurityTax: 0,
              medicareTax: 0,
              stateDisabilityInsurance: 0,
              localTax: 0,
              totalTaxes: 0
            },
            summary: {
              grossPay: grossPay + mileageEarnings,
              totalDeductions: totalDeductions,
              totalTaxes: totalTaxes,
              netPay: netPay
            },
            country: country || 'USA',
            driverInfo: {
              totalMiles: parseFloat(payrollData.totalMiles || 0),
              ratePerMile: parseFloat(Number(payrollData.ratePerMile || 0).toFixed(2)),
              tripsCount: tripsCount,
              loadsCount: loadsCount
            },
            company: isSuperadmin ? null : companyId,
            companyDetails: {
              companyName: companyDetails?.companyName || payroll.company?.companyName || 'N/A',
              companyAddress: companyDetails?.address || payroll.company?.address || '',
              companyPhone: companyDetails?.contactPhone || payroll.company?.contactPhone || '',
              companyEmail: companyDetails?.contactEmail || payroll.company?.contactEmail || '',
              companyLogo: companyDetails?.logoUrl || payroll.company?.logoUrl || '',
              gstNumber: companyDetails?.taxNumber || ''
            },
            tripDetails: tripDetailsArray,
            additions: additionsArray,
            employerContributions: {
              companyInsurance: 0,
              pensionPF: 0,
              benefitContributions: 0,
              total: 0
            },
            ytd: {
              earnings: ytdEarnings,
              deductions: ytdDeductions,
              netPay: ytdNetPay
            },
            payment: {
              mode: 'Bank Transfer',
              bankLast4Digits: '',
              bankName: '',
              accountNumber: ''
            },
            notes: '',
            hrSignature: '',
            hrName: req.user?.name || '',
            status: 'issued'
          });

          await paystub.save();
          console.log('✅ Paystub created successfully for driver:', driver.name, paystub._id);
        } catch (paystubError) {
          console.error('⚠️ Error creating paystub (payroll still created):', paystubError);
          // Don't fail the payroll creation if paystub creation fails
        }

        results.successful.push({
          driverId: driverId.toString(),
          payrollId: payroll._id.toString(),
          totalSalary: finalTotalSalary
        });

      } catch (error) {
        console.error(`❌ Error creating payroll for driver ${payrollData.driverId}:`, error);
        results.failed.push({
          driverId: payrollData.driverId?.toString() || 'unknown',
          reason: error.message || 'Unknown error',
          error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    }

    res.json({
      success: true,
      message: `Created ${results.successful.length} payrolls successfully.`,
      data: {
        summary: {
          total: results.total,
          successful: results.successful.length,
          failed: results.failed.length
        },
        successful: results.successful,
        failed: results.failed
      }
    });

  } catch (error) {
    console.error("❌ Error bulk creating driver payrolls:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error bulk creating payrolls",
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Keep old function name for backward compatibility (but it now returns suggestions)
export const bulkGenerateAIDriverPayrolls = bulkAnalyzeAIDriverPayrolls;

