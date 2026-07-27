import { Vehicle } from "../../models/driver/vehicleModel.js";
import { FleetUnit } from "../../models/fleet/fleetUnitModel.js";
import { User } from "../../models/driver/userModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";

// GET /api/vehicles/live
export const getLiveVehicles = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    
    // Strict validation: For non-superadmin, companyId MUST be valid
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // If not superadmin and no valid company, return empty data immediately
    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ getLiveVehicles: Admin has no company - returning empty data');
      return res.json({
        success: true,
        data: []
      });
    }

    const companyFilter = hasValidCompany ? { company: companyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);
    
    // CRITICAL: For non-superadmin, query MUST include company filter
    let query = { unitType: "Truck" };
    if (isSuperadmin) {
      if (baseFilter) {
        query = { ...baseFilter, unitType: "Truck" };
      }
    } else {
      // Non-superadmin MUST have company filter
      if (!hasValidCompany || !companyId) {
        console.error('❌ getLiveVehicles: No valid company - returning empty data');
        return res.json({
          success: true,
          data: []
        });
      }
      
      if (baseFilter) {
        if (baseFilter.$and && Array.isArray(baseFilter.$and)) {
          const hasCompany = baseFilter.$and.some(cond => cond && cond.company);
          if (!hasCompany) {
            query = {
              ...baseFilter,
              $and: [...baseFilter.$and, { company: companyId }],
              unitType: "Truck"
            };
          } else {
            query = { ...baseFilter, unitType: "Truck" };
          }
        } else if (baseFilter.company) {
          query = { ...baseFilter, unitType: "Truck" };
        } else {
          query = { ...baseFilter, company: companyId, unitType: "Truck" };
        }
      } else {
        query = { company: companyId, unitType: "Truck" };
      }
    }
    const fleetUnits = await FleetUnit.find(query, "licensePlate operationStatus currentLocation speed fuelLevel")
      .lean();
    
    // Map FleetUnit to expected format
    const vehicles = fleetUnits.map(unit => ({
      _id: unit._id,
      plateNumber: unit.licensePlate,
      status: unit.operationStatus === "in-transit" ? "moving" : 
              unit.operationStatus === "maintenance" ? "maintenance" :
              unit.operationStatus === "idle" ? "idle" : "stopped",
      currentLocation: unit.currentLocation || {},
      speed: unit.speed || 0,
      fuelLevel: unit.fuelLevel || 0
    }));
    
    res.json({ success: true, data: vehicles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/vehicles/list
export const getVehicleList = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    
    // Strict validation: For non-superadmin, companyId MUST be valid
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // If not superadmin and no valid company, return empty data immediately
    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ getVehicleList: Admin has no company - returning empty data');
      return res.json({
        success: true,
        message: "No company assigned to the current user.",
        data: { vehicles: [] }
      });
    }

    const companyFilter = hasValidCompany ? { company: companyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);
    
    // CRITICAL: For non-superadmin, query MUST include company filter
    // If baseFilter is null but we have companyId, create filter with company
    let query = {};
    if (isSuperadmin) {
      query = baseFilter || {};
    } else {
      // Non-superadmin MUST have company filter
      if (!hasValidCompany || !companyId) {
        console.error('❌ getVehicleList: No valid company - returning empty data');
        return res.json({
          success: true,
          message: "No company assigned to the current user.",
          data: { vehicles: [] }
        });
      }
      
      // Ensure company filter is in query
      if (baseFilter) {
        if (baseFilter.$and && Array.isArray(baseFilter.$and)) {
          const hasCompany = baseFilter.$and.some(cond => cond && cond.company);
          if (!hasCompany) {
            query = {
              ...baseFilter,
              $and: [...baseFilter.$and, { company: companyId }]
            };
          } else {
            query = baseFilter;
          }
        } else if (baseFilter.company) {
          query = baseFilter;
        } else {
          query = { ...baseFilter, company: companyId };
        }
      } else {
        query = { company: companyId };
      }
    }
    
    console.log('🔍 getVehicleList query:', {
      companyId: companyId?.toString(),
      hasValidCompany,
      isSuperadmin,
      query: JSON.stringify(query)
    });
    
    // Use Vehicle model instead of FleetUnit
    const vehicles = await Vehicle.find(query)
      .populate('driver', 'name email phone')
      .populate('trailer', 'trailerNumber plateNumber unitNumber')
      .lean();
    
    // Map Vehicle model to expected format
    const formattedVehicles = vehicles.map(vehicle => {
      // Map operationStatus to status
      let status = 'stopped';
      if (vehicle.operationStatus === 'in-transit' || vehicle.operationStatus === 'in_transit') {
        status = 'moving';
      } else if (vehicle.operationStatus === 'idle') {
        status = 'idle';
      } else if (vehicle.operationStatus === 'maintenance' || vehicle.operationStatus === 'MAINTENANCE') {
        status = 'maintenance';
      } else if (vehicle.status === 'moving') {
        status = 'moving';
      } else if (vehicle.status === 'idle') {
        status = 'idle';
      } else if (vehicle.status === 'maintenance') {
        status = 'maintenance';
      } else if (vehicle.engineOn && vehicle.speed > 0) {
        status = 'moving';
      } else if (vehicle.engineOn && vehicle.speed === 0) {
        status = 'idle';
      }

      return {
        _id: vehicle._id,
        internalId: vehicle.internalId || vehicle.unitNumber || vehicle._id.toString(),
        plateNumber: vehicle.plateNumber || vehicle.licensePlate || 'N/A',
        vinNumber: vehicle.vinNumber || vehicle.vinNo || 'N/A',
        make: vehicle.make || 'Unknown',
        model: vehicle.model || 'Unknown',
        year: vehicle.year || new Date().getFullYear(),
        driver: vehicle.driver ? {
          _id: vehicle.driver._id,
          name: vehicle.driver.name,
          phone: vehicle.driver.phone || ''
        } : null,
        status: status,
        currentLocation: {
          address: vehicle.currentLocation?.address || 'Location not available',
          longitude: String(vehicle.currentLocation?.longitude || '0'),
          latitude: String(vehicle.currentLocation?.latitude || '0'),
          updatedAt: vehicle.currentLocation?.updatedAt || vehicle.updatedAt || new Date()
        },
        speed: vehicle.speed || 0,
        fuelLevel: vehicle.fuelLevel || 0,
        odometer: vehicle.odometer || 0,
        engineOn: vehicle.engineOn || false,
        driverBehaviour: vehicle.driverBehaviour || {
          harshBraking: 0,
          speedingEvents: 0,
          idlingDuration: 0
        },
        engineHealth: vehicle.engineHealth || {
          faultCodes: [],
          batteryVoltage: 12.0,
          engineHours: vehicle.engineHours || 0
        },
        // Additional Vehicle model fields
        unitNumber: vehicle.unitNumber,
        trackingKey: vehicle.trackingKey,
        type: vehicle.type,
        ownership: vehicle.ownership,
        trailer: vehicle.trailer,
        hasTrailer: !!vehicle.trailer,
        trailerDetails: vehicle.trailer ? {
          serialNumber: vehicle.trailer.trailerNumber || vehicle.trailer.unitNumber || '',
          capacity: vehicle.trailer.capacity || '',
          status: vehicle.trailer.operationStatus || 'unknown'
        } : null
      };
    });
    
    res.json({ success: true, data: { vehicles: formattedVehicles } });
  } catch (err) {
    console.error('Error in getVehicleList:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/vehicles/:id
export const getVehicleDetails = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    
    // Strict validation: For non-superadmin, companyId MUST be valid
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // If not superadmin and no valid company, return error
    if (!isSuperadmin && !hasValidCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current user."
      });
    }

    const companyFilter = hasValidCompany ? { company: companyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);
    
    // CRITICAL: For non-superadmin, query MUST include company filter
    let query = { _id: req.params.id };
    if (isSuperadmin) {
      if (baseFilter) {
        query = { _id: req.params.id, ...baseFilter };
      }
    } else {
      // Non-superadmin MUST have company filter
      if (!hasValidCompany || !companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned to the current user."
        });
      }
      
      if (baseFilter) {
        if (baseFilter.$and && Array.isArray(baseFilter.$and)) {
          const hasCompany = baseFilter.$and.some(cond => cond && cond.company);
          if (!hasCompany) {
            query = {
              _id: req.params.id,
              ...baseFilter,
              $and: [...baseFilter.$and, { company: companyId }]
            };
          } else {
            query = { _id: req.params.id, ...baseFilter };
          }
        } else if (baseFilter.company) {
          query = { _id: req.params.id, ...baseFilter };
        } else {
          query = { _id: req.params.id, ...baseFilter, company: companyId };
        }
      } else {
        query = { _id: req.params.id, company: companyId };
      }
    }
    const vehicle = await Vehicle.findOne(query).populate("driver", "name email phone");
    if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
    res.json({ success: true, data: vehicle });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/gps-vehicle/dashboard-stats
export const getGpsVehicleDashboardStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    
    // Strict validation: For non-superadmin, companyId MUST be valid
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // If not superadmin and no valid company, return empty stats
    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ getGpsVehicleDashboardStats: Admin has no company - returning empty stats');
      return res.json({
        success: true,
        data: {
          totalVehicles: 0,
          activeVehicles: 0,
          vehiclesWithDrivers: 0,
          vehiclesByStatus: {},
          watchingReport: Array.from({ length: 24 }, (_, i) => ({ name: String(i).padStart(2, '0'), value: 0 })),
          driverUtilization: 0,
          driverUtilizationData: [],
          speedingData: [],
          safetyScore: 0,
          speedingVehicles: 0
        }
      });
    }

    const companyFilter = hasValidCompany ? { company: companyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);
    
    // CRITICAL: For non-superadmin, query MUST include company filter
    let query = { unitType: "Truck" };
    if (isSuperadmin) {
      if (baseFilter) {
        query = { ...baseFilter, unitType: "Truck" };
      }
    } else {
      // Non-superadmin MUST have company filter
      if (!hasValidCompany || !companyId) {
        console.error('❌ getGpsVehicleDashboardStats: No valid company - returning empty stats');
        return res.json({
          success: true,
          data: {
            totalVehicles: 0,
            activeVehicles: 0,
            vehiclesWithDrivers: 0,
            vehiclesByStatus: {},
            watchingReport: Array.from({ length: 24 }, (_, i) => ({ name: String(i).padStart(2, '0'), value: 0 })),
            driverUtilization: 0,
            driverUtilizationData: [],
            speedingData: [],
            safetyScore: 0,
            speedingVehicles: 0
          }
        });
      }
      
      if (baseFilter) {
        if (baseFilter.$and && Array.isArray(baseFilter.$and)) {
          const hasCompany = baseFilter.$and.some(cond => cond && cond.company);
          if (!hasCompany) {
            query = {
              ...baseFilter,
              $and: [...baseFilter.$and, { company: companyId }],
              unitType: "Truck"
            };
          } else {
            query = { ...baseFilter, unitType: "Truck" };
          }
        } else if (baseFilter.company) {
          query = { ...baseFilter, unitType: "Truck" };
        } else {
          query = { ...baseFilter, company: companyId, unitType: "Truck" };
        }
      } else {
        query = { company: companyId, unitType: "Truck" };
      }
    }
    
    // Get total vehicles (trucks from FleetUnit)
    const totalVehicles = await FleetUnit.countDocuments(query);
    
    // Get vehicles by status (map operationStatus to status)
    const vehiclesByStatus = await FleetUnit.aggregate([
      { $match: query },
      {
        $project: {
          status: {
            $switch: {
              branches: [
                { case: { $eq: ["$operationStatus", "in-transit"] }, then: "moving" },
                { case: { $eq: ["$operationStatus", "idle"] }, then: "idle" },
                { case: { $eq: ["$operationStatus", "maintenance"] }, then: "maintenance" },
                { case: { $eq: ["$operationStatus", "available"] }, then: "stopped" }
              ],
              default: "stopped"
            }
          }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Get active vehicles (in-transit or idle)
    const activeVehicles = await FleetUnit.countDocuments({
      ...query,
      operationStatus: { $in: ["in-transit", "idle"] }
    });
    
    // Get vehicles with drivers (need to check from Loads/Trips)
    // For now, we'll use a simplified approach - count vehicles in active loads/trips
    const Load = (await import("../../models/loadModel.js")).default;
    const Trip = (await import("../../models/tripModel.js")).default;
    
    const vehiclesInLoads = await Load.distinct("details.vehicle", {
      ...(companyFilter || {}),
      "details.vehicle": { $exists: true, $ne: null }
    });
    const vehiclesInTrips = await Trip.distinct("truck", {
      ...(companyFilter || {}),
      truck: { $exists: true, $ne: null }
    });
    const vehiclesWithDriversSet = new Set([
      ...vehiclesInLoads.map(id => id.toString()),
      ...vehiclesInTrips.map(id => id.toString())
    ]);
    const vehiclesWithDrivers = vehiclesWithDriversSet.size;
    
    // Get watching report data (vehicles activity by hour of day)
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    
    const watchingReportData = await FleetUnit.aggregate([
      { $match: { ...query, "currentLocation.updatedAt": { $exists: true } } },
      {
        $group: {
          _id: { $hour: "$currentLocation.updatedAt" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Format watching report (24 hours)
    const watchingReport = Array.from({ length: 24 }, (_, i) => {
      const hourData = watchingReportData.find(d => d._id === i);
      return {
        name: String(i).padStart(2, '0'),
        value: hourData ? hourData.count : 0
      };
    });
    
    // Get driver utilization (vehicles with drivers vs total)
    const driverUtilization = vehiclesWithDrivers > 0 
      ? Math.round((vehiclesWithDrivers / totalVehicles) * 100) 
      : 0;
    
    // Get speeding violations (vehicles with speed > 80 km/h)
    const speedingVehicles = await FleetUnit.countDocuments({
      ...query,
      speed: { $gt: 80 }
    });
    
    // Get speeding violations by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const speedingByMonth = await FleetUnit.aggregate([
      {
        $match: {
          ...query,
          speed: { $gt: 80 },
          "currentLocation.updatedAt": { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$currentLocation.updatedAt" },
            year: { $year: "$currentLocation.updatedAt" }
          },
          speeding: { $sum: 1 },
          events: { $sum: { $cond: [{ $gt: ["$speed", 100] }, 1, 0] } }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const speedingData = speedingByMonth.map(item => ({
      month: monthNames[item._id.month - 1],
      speeding: item.speeding,
      events: item.events
    }));
    
    // Calculate driver safety scorecard (based on speeding violations and active vehicles)
    const safetyScore = totalVehicles > 0
      ? Math.max(0, Math.min(100, Math.round(100 - (speedingVehicles / totalVehicles) * 100)))
      : 0;
    
    // Driver utilization by day of week (last 7 days) - using vehicles in active loads/trips
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const driverUtilizationByDay = await Load.aggregate([
      {
        $match: {
          ...(companyFilter || {}),
          "details.vehicle": { $exists: true, $ne: null },
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dayOfWeek: "$createdAt" },
          count: { $addToSet: "$details.vehicle" }
        }
      },
      {
        $project: {
          _id: 1,
          count: { $size: "$count" }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const driverUtilizationData = dayNames.map((day, index) => {
      const dayData = driverUtilizationByDay.find(d => d._id === index + 1);
      return {
        day,
        value: dayData ? dayData.count : 0
      };
    });
    
    res.json({
      success: true,
      data: {
        totalVehicles,
        activeVehicles,
        vehiclesWithDrivers,
        vehiclesByStatus: vehiclesByStatus.reduce((acc, item) => {
          acc[item._id || "unknown"] = item.count;
          return acc;
        }, {}),
        watchingReport,
        driverUtilization,
        driverUtilizationData,
        speedingData,
        safetyScore,
        speedingVehicles
      }
    });
  } catch (err) {
    console.error("Error fetching GPS vehicle dashboard stats:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


