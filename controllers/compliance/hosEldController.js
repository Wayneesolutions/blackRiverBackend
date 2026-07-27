import HOSLog from "../../models/driver/hosManagement.js";
import { Vehicle } from "../../models/driver/vehicleModel.js";
import { User } from "../../models/driver/userModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";
import { updateVehicleByTrackingKey, fetchAndSaveDriverHOSFromSamsara, fetchVehicleHOS } from "../../services/samsara.js";
import mongoose from "mongoose";
import ELog from "../../models/compliance/elogModel.js";
import HosAuditForm from "../../models/compliance/hosAuditFormModel.js";

/**
 * Get all HOS/ELD data for compliance dashboard
 * Fetches data from Samsara for all drivers with vehicles using trackingKey
 */
export const getHOSEldData = async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === 'superadmin';
    
    // Get company filter with strict validation
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // CRITICAL: If not superadmin and no valid company, return empty data immediately
    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ getHOSEldData: Admin has no company - returning empty data');
      return res.json({
        success: true,
        data: {
          summary: {
            totalVehicles: 0,
            activeVehicles: 0,
            totalDrivers: 0,
            compliantDrivers: 0,
            activeViolations: 0,
            uncertifiedLogs: 0
          },
          auditLogs: [],
          vehicleStatusList: [],
          vehicles: []
        },
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    // Get date range (default to last 7 days)
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) {
        dateFilter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.date.$lte = new Date(endDate);
      }
    } else {
      // Default to last 7 days
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      dateFilter.date = { $gte: start, $lte: end };
    }

    // Get base filter for company/trial data - CRITICAL: Must include company for non-superadmin
    const companyFilter = hasValidCompany ? { company: companyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Get all active drivers - CRITICAL: Must filter by company for non-superadmin
    let driverFilter = {
      role: 'driver',
      status: 'active'
    };
    
    if (isSuperadmin) {
      if (baseFilter) {
        driverFilter = { ...driverFilter, ...baseFilter };
      }
    } else {
      // Non-superadmin MUST have company filter
      if (baseFilter) {
        if (baseFilter.$and && Array.isArray(baseFilter.$and)) {
          const hasCompany = baseFilter.$and.some(cond => cond && cond.company);
          if (!hasCompany) {
            driverFilter = {
              ...driverFilter,
              ...baseFilter,
              $and: [...baseFilter.$and, { company: companyId }]
            };
          } else {
            driverFilter = { ...driverFilter, ...baseFilter };
          }
        } else if (baseFilter.company) {
          driverFilter = { ...driverFilter, ...baseFilter };
        } else {
          driverFilter = { ...driverFilter, ...baseFilter, company: companyId };
        }
      } else {
        driverFilter = { ...driverFilter, company: companyId };
      }
    }

    const drivers = await User.find(driverFilter)
      .select('_id name email phone internalId')
      .lean();

    // Get all Vehicles with trackingKey for Samsara integration
    const vehicleFilter = {
      ...baseFilter,
      trackingKey: { $exists: true, $ne: null, $ne: '' }
    };

    const vehicles = await Vehicle.find(vehicleFilter)
      .select('_id unitNumber internalId plateNumber licensePlate make model year status operationStatus currentLocation speed fuelLevel odometer engineOn trackingKey driverBehaviour engineHealth driver engineHours yard')
      .populate('driver', 'name email phone')
      .populate('yard', 'yardName yardCode coordinates address city stateProvince')
      .lean();
    
    console.log(`🚛 Found ${vehicles.length} vehicles with tracking integration`);
    if (vehicles.length > 0) {
      console.log('🚛 Sample vehicles:', vehicles.slice(0, 3).map(v => ({
        _id: v._id.toString(),
        unitNumber: v.unitNumber,
        internalId: v.internalId,
        trackingKey: v.trackingKey ? 'Yes' : 'No'
      })));
    }

    // Get active orders to link drivers to vehicles
    const OrderModel = (await import("../../models/orderModel.js")).default;
    
    const activeOrdersQuery = {
      ...baseFilter,
      status: { $nin: ['COMPLETED', 'completed', 'CANCELLED', 'cancelled'] },
      truck: { $exists: true, $ne: null },
      driver: { $exists: true, $ne: null }
    };
    
    const activeOrders = await OrderModel.find(activeOrdersQuery)
      .select('driver coDriver truck orderNumber customerOrderNo tripNo status company pickupDate deliveryDate')
      .populate('driver', 'name email phone')
      .populate('coDriver', 'name email phone')
      .populate('truck', 'unitNumber internalId _id plateNumber')
      .lean();
    
    console.log(`📍 Found ${activeOrders.length} active orders with trucks and drivers`);
    if (activeOrders.length > 0) {
      activeOrders.forEach((order, idx) => {
        if (idx < 3) {
          console.log(`📍 Order ${idx + 1}:`, {
            orderNumber: order.orderNumber,
            customerOrderNo: order.customerOrderNo,
            tripNo: order.tripNo,
            driver: order.driver?.name || (typeof order.driver === 'string' ? order.driver : 'No driver'),
            coDriver: order.coDriver?.name || (typeof order.coDriver === 'string' ? order.coDriver : null),
            truck: order.truck ? {
              _id: order.truck._id?.toString() || order.truck.toString(),
              unitNumber: order.truck.unitNumber || 'N/A',
              internalId: order.truck.internalId || 'N/A',
              plateNumber: order.truck.plateNumber || 'N/A'
            } : 'No truck',
            status: order.status
          });
        }
      });
    }

    // Create driver-vehicle mapping from active orders
    const driverVehicleMap = {};
    activeOrders.forEach(order => {
      if (order.driver && order.truck) {
        const driverId = typeof order.driver === 'object' ? order.driver._id.toString() : order.driver.toString();
        const truckId = typeof order.truck === 'object' ? order.truck._id.toString() : order.truck.toString();
        
        if (!driverVehicleMap[driverId]) {
          driverVehicleMap[driverId] = [];
        }
        
        driverVehicleMap[driverId].push({
          vehicleId: truckId,
          vehicleInternalId: order.truck.internalId || order.truck.unitNumber,
          vehicleUnitNo: order.truck.unitNumber || order.truck.plateNumber,
          orderNumber: order.orderNumber || order.customerOrderNo || order.tripNo
        });
      }
    });

    // Get HOS logs from database - CRITICAL: Must filter by company for non-superadmin
    let hosLogFilter = { ...dateFilter };
    
    if (isSuperadmin) {
      // Superadmin can see all logs
    } else if (hasValidCompany && companyId) {
      hosLogFilter.company = companyId;
    } else {
      // No company - return empty logs
      hosLogFilter.company = mongoose.Types.ObjectId('000000000000000000000000'); // Match nothing
    }

    const hosLogs = await HOSLog.find(hosLogFilter)
      .populate('driverId', 'name email phone')
      .populate('vehicleId', 'unitNo licensePlate')
      .sort({ date: -1 })
      .lean();

    // Calculate compliance statistics
    const totalLogs = hosLogs.length;
    const compliantLogs = hosLogs.filter(log => !log.violations).length;
    const violationLogs = hosLogs.filter(log => log.violations).length;
    const uncertifiedLogs = hosLogs.filter(log => !log.logs || log.logs.length === 0).length;

    // Format HOS audit logs for frontend
    const auditLogs = hosLogs.map(log => {
      const driver = log.driverId || {};
      const vehicle = log.vehicleId || {};
      
      // Calculate hours from logs
      let driveUsed = 0;
      let dutyUsed = 0;
      
      if (log.logs && log.logs.length > 0) {
        log.logs.forEach(entry => {
          const duration = (new Date(entry.endTime) - new Date(entry.startTime)) / (1000 * 60 * 60);
          if (entry.status === 'Driving') {
            driveUsed += duration;
          } else if (entry.status === 'OnDuty') {
            dutyUsed += duration;
          }
        });
      } else {
        // Use totals if logs not available
        driveUsed = log.totalDrivingHours || 0;
        dutyUsed = log.totalOnDutyHours || 0;
      }

      // Determine violation type
      let violationType = 'None';
      if (log.violations) {
        if (driveUsed > 11) {
          violationType = '11-Hour Limit';
        } else if (driveUsed + dutyUsed > 14) {
          violationType = '14-Hour Limit';
        } else if (driveUsed + dutyUsed > 70) {
          violationType = '70-Hour Limit';
        } else {
          violationType = 'HOS Violation';
        }
      }

      return {
        id: log._id.toString(),
        driver: driver.name || 'Unknown',
        driverId: driver._id?.toString() || '',
        date: log.date ? new Date(log.date).toISOString().split('T')[0] : '',
        driveUsed: `${Math.floor(driveUsed)}h ${Math.round((driveUsed % 1) * 60)}m`,
        dutyUsed: `${Math.floor(dutyUsed)}h ${Math.round((dutyUsed % 1) * 60)}m`,
        status: log.violations ? 'violation' : (driveUsed > 10 ? 'warning' : 'compliant'),
        violation: violationType,
        vehicle: vehicle.unitNo || 'N/A',
        totalDrivingHours: driveUsed,
        totalOnDutyHours: dutyUsed,
        totalOffDutyHours: log.totalOffDutyHours || 0,
        violations: log.violations || false,
        logs: log.logs || []
      };
    });

    // Update vehicles with live data from Samsara if trackingKey exists
    const updatedVehicles = await Promise.all(vehicles.map(async (vehicle) => {
      // Try to update from Samsara if trackingKey exists
      if (vehicle.trackingKey) {
        try {
          const companyId = vehicle.company?.toString() || null;
          const updatedVehicle = await updateVehicleByTrackingKey(vehicle.trackingKey, companyId);
          if (updatedVehicle && updatedVehicle.currentLocation) {
            return { ...vehicle, ...updatedVehicle };
          }
        } catch (error) {
          console.warn(`⚠️ Could not update vehicle ${vehicle.unitNumber || vehicle.plateNumber} from Samsara:`, error.message);
        }
      }
      return vehicle;
    }));

    // Get vehicle status list with order information
    const vehicleStatusList = updatedVehicles.map(vehicle => {
      // Find active order(s) for this vehicle
      const assignedOrders = activeOrders.filter(order => {
        if (!order.truck) return false;
        
        const truckId = typeof order.truck === 'object' 
          ? order.truck._id.toString() 
          : order.truck.toString();
        const vehicleId = vehicle._id.toString();
        
        // Match by _id
        if (truckId === vehicleId) return true;
        
        // Match by unitNumber, internalId, or plateNumber
        if (typeof order.truck === 'object') {
          if (order.truck.unitNumber && vehicle.unitNumber && order.truck.unitNumber === vehicle.unitNumber) return true;
          if (order.truck.internalId && vehicle.internalId && order.truck.internalId === vehicle.internalId) return true;
          if (order.truck.plateNumber && vehicle.plateNumber && order.truck.plateNumber === vehicle.plateNumber) return true;
        }
        
        return false;
      });
      
      // Get the most relevant order (first active order)
      const assignedOrder = assignedOrders.length > 0 ? assignedOrders[0] : null;
      
      if (assignedOrder) {
        console.log(`✅ Matched vehicle ${vehicle.unitNumber || vehicle.plateNumber} to order ${assignedOrder.orderNumber || assignedOrder.customerOrderNo || assignedOrder.tripNo} with driver ${assignedOrder.driver?.name || assignedOrder.coDriver?.name || 'Unknown'}`);
      }
      
      // Get driver from order or vehicle (prefer order, fallback to vehicle's assigned driver)
      let driver = null;
      let isCoDriver = false;
      
      if (assignedOrder) {
        // Prefer primary driver from order
        if (assignedOrder.driver) {
          if (typeof assignedOrder.driver === 'object' && assignedOrder.driver.name) {
            driver = assignedOrder.driver;
            isCoDriver = false;
          }
        }
        
        // If no primary driver, try co-driver
        if (!driver && assignedOrder.coDriver) {
          if (typeof assignedOrder.coDriver === 'object' && assignedOrder.coDriver.name) {
            driver = assignedOrder.coDriver;
            isCoDriver = true;
          }
        }
      }
      
      // Fallback to vehicle's assigned driver
      if (!driver && vehicle.driver) {
        if (typeof vehicle.driver === 'object' && vehicle.driver.name) {
          driver = vehicle.driver;
          isCoDriver = false;
        }
      }
      
      // Calculate idle time (if available from driverBehaviour)
      const idleMinutes = vehicle.driverBehaviour?.idlingDuration || 0;
      const idleHours = Math.floor(idleMinutes / 60);
      const idleMins = Math.round(idleMinutes % 60);
      const idleTime = idleMinutes > 0 ? `${idleHours}h ${idleMins}m` : '-';

      // Determine status from Vehicle model
      let status = 'offline'; // Default to offline
      if (vehicle.operationStatus === 'in-transit' || vehicle.operationStatus === 'in_transit') {
        status = 'moving';
      } else if (vehicle.operationStatus === 'idle') {
        status = 'idle';
      } else if (vehicle.status === 'moving' || (vehicle.engineOn && vehicle.speed > 0)) {
        status = 'moving';
      } else if (vehicle.status === 'idle' || (vehicle.engineOn && vehicle.speed === 0)) {
        status = 'idle';
      } else if (vehicle.operationStatus === 'available' || vehicle.status === 'In Service' || vehicle.status === 'in-service') {
        status = 'idle'; // Show as idle instead of active
      } else if (vehicle.currentLocation && vehicle.currentLocation.updatedAt) {
        // If vehicle has recent location update, consider it active
        const lastUpdate = new Date(vehicle.currentLocation.updatedAt);
        const minutesSinceUpdate = (Date.now() - lastUpdate.getTime()) / 60000;
        if (minutesSinceUpdate < 30) {
          status = 'idle'; // Recent update but not moving
        } else {
          status = 'offline'; // No recent updates
        }
      } else {
        status = 'offline';
      }

      // Calculate last ping (from currentLocation.updatedAt)
      const lastPingDate = vehicle.currentLocation?.updatedAt 
        ? new Date(vehicle.currentLocation.updatedAt)
        : vehicle.updatedAt 
        ? new Date(vehicle.updatedAt)
        : null;
      
      let lastPing = 'Unknown';
      if (lastPingDate) {
        const diffMs = Date.now() - lastPingDate.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) {
          lastPing = 'Just now';
        } else if (diffMins < 60) {
          lastPing = `${diffMins} mins ago`;
        } else if (diffMins < 1440) {
          const hours = Math.floor(diffMins / 60);
          lastPing = `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else {
          const days = Math.floor(diffMins / 1440);
          lastPing = `${days} day${days > 1 ? 's' : ''} ago`;
        }
      }

      return {
        id: vehicle.unitNumber || vehicle.internalId || vehicle.plateNumber || vehicle._id.toString(),
        _id: vehicle._id.toString(),
        unitNo: vehicle.unitNumber || vehicle.internalId || vehicle.plateNumber || vehicle._id.toString(),
        internalId: vehicle.internalId || vehicle.unitNumber || '',
        licensePlate: vehicle.plateNumber || vehicle.licensePlate || '',
        makeModel: vehicle.make && vehicle.model ? `${vehicle.make} ${vehicle.model}` : vehicle.make || vehicle.model || '',
        driver: driver?.name || 'Unassigned',
        driverId: driver?._id?.toString() || driver?.toString() || null,
        driverEmail: driver?.email || null,
        driverPhone: driver?.phone || null,
        isCoDriver: isCoDriver || false,
        orderNumber: assignedOrder?.orderNumber || assignedOrder?.customerOrderNo || assignedOrder?.tripNo || null,
        tripNumber: assignedOrder?.tripNo || assignedOrder?.orderNumber || assignedOrder?.customerOrderNo || null,
        status,
        operationStatus: vehicle.operationStatus || vehicle.status || 'available',
        engineHours: vehicle.engineHours || vehicle.engineHealth?.engineHours || (vehicle.odometer ? Math.round(vehicle.odometer / 50) : 0), // Use stored engineHours, fallback to estimate from odometer
        idleTime,
        lastPing,
        location: vehicle.currentLocation?.address || 'Unknown',
        coordinates: {
          x: parseFloat(vehicle.currentLocation?.latitude || 0) * 100,
          y: parseFloat(vehicle.currentLocation?.longitude || 0) * 100
        },
        speed: vehicle.speed || 0,
        engineOn: vehicle.engineOn || false,
        fuelLevel: vehicle.fuelLevel || 0,
        signal: (vehicle.operationStatus === 'in-transit' || vehicle.operationStatus === 'in_transit' || status === 'moving') ? 'strong' : 
                (vehicle.operationStatus === 'idle' || status === 'idle') ? 'strong' : 'weak'
      };
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalVehicles: vehicles.length,
          activeVehicles: vehicles.filter(v => 
            v.operationStatus === 'in-transit' || 
            v.operationStatus === 'in_transit' || 
            v.operationStatus === 'idle' ||
            (v.engineOn && v.speed > 0)
          ).length,
          totalDrivers: drivers.length,
          compliantDrivers: Math.round((compliantLogs / Math.max(totalLogs, 1)) * 100),
          activeViolations: violationLogs,
          uncertifiedLogs
        },
        auditLogs,
        vehicleStatusList,
        vehicles: updatedVehicles.map(v => ({
          _id: v._id.toString(),
          unitNumber: v.unitNumber,
          internalId: v.internalId,
          plateNumber: v.plateNumber,
          licensePlate: v.licensePlate || v.plateNumber,
          make: v.make,
          model: v.model,
          makeModel: v.make && v.model ? `${v.make} ${v.model}` : v.make || v.model || '',
          operationStatus: v.operationStatus,
          status: v.status,
          currentLocation: v.currentLocation,
          speed: v.speed,
          fuelLevel: v.fuelLevel,
          engineOn: v.engineOn,
          trackingKey: v.trackingKey,
          yard: v.yard ? {
            _id: v.yard._id?.toString() || v.yard.toString(),
            yardName: v.yard.yardName,
            yardCode: v.yard.yardCode,
            coordinates: v.yard.coordinates,
            address: v.yard.address,
            city: v.yard.city,
            stateProvince: v.yard.stateProvince
          } : null
        }))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching HOS/ELD data:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching HOS/ELD data'
    });
  }
};

/**
 * Submit HOS Audit
 * Creates or updates an audit record for a driver's HOS compliance
 */
export const submitHOSAudit = async (req, res) => {
  try {
    const {
      driverId,
      auditDate,
      drivingHours,
      onDutyHours,
      offDutyHours,
      violations,
      notes,
      auditorName
    } = req.body;

    // Validation
    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required'
      });
    }

    if (!auditDate) {
      return res.status(400).json({
        success: false,
        message: 'Audit date is required'
      });
    }

    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      return res.status(400).json({
        success: false,
        message: 'Company assignment required'
      });
    }

    // Verify driver exists and belongs to company
    const driverFilter = isSuperadmin ? { _id: driverId, role: 'driver' } : { _id: driverId, role: 'driver', company: companyId };
    const driver = await User.findOne(driverFilter);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found or access denied'
      });
    }

    // Create or update HOS log with audit information
    const auditDateObj = new Date(auditDate);
    const startOfDay = new Date(auditDateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(auditDateObj);
    endOfDay.setHours(23, 59, 59, 999);

    // Check if HOS log exists for this date
    const existingLog = await HOSLog.findOne({
      driverId: driverId,
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });

    const auditData = {
      totalDrivingHours: drivingHours || 0,
      totalOnDutyHours: onDutyHours || 0,
      totalOffDutyHours: offDutyHours || 0,
      violations: violations && violations.length > 0,
      auditNotes: notes || '',
      auditorName: auditorName || req.user?.name || 'Unknown',
      auditedAt: new Date(),
      auditViolations: violations || []
    };

    if (existingLog) {
      // Update existing log with audit data
      existingLog.totalDrivingHours = auditData.totalDrivingHours;
      existingLog.totalOnDutyHours = auditData.totalOnDutyHours;
      existingLog.totalOffDutyHours = auditData.totalOffDutyHours;
      existingLog.violations = auditData.violations;
      existingLog.auditNotes = auditData.auditNotes;
      existingLog.auditorName = auditData.auditorName;
      existingLog.auditedAt = auditData.auditedAt;
      existingLog.auditViolations = auditData.auditViolations;
      
      await existingLog.save();
    } else {
      // Create new HOS log with audit data
      const newLog = new HOSLog({
        driverId: driverId,
        date: startOfDay,
        totalDrivingHours: auditData.totalDrivingHours,
        totalOnDutyHours: auditData.totalOnDutyHours,
        totalOffDutyHours: auditData.totalOffDutyHours,
        violations: auditData.violations,
        auditNotes: auditData.auditNotes,
        auditorName: auditData.auditorName,
        auditedAt: auditData.auditedAt,
        auditViolations: auditData.auditViolations,
        company: companyId
      });
      
      await newLog.save();
    }

    res.json({
      success: true,
      message: 'HOS audit submitted successfully',
      data: {
        driverId,
        auditDate,
        ...auditData
      }
    });
  } catch (error) {
    console.error('❌ Error submitting HOS audit:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error submitting HOS audit'
    });
  }
};

/**
 * Sync HOS data from Samsara for all active drivers
 * This should be called periodically to keep HOS data up to date
 * Uses vehicle trackingKey to fetch HOS data from Samsara
 */
export const syncHOSFromSamsara = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Company assignment required"
      });
    }

    // Get all active drivers
    const driverFilter = {
      role: 'driver',
      status: 'active',
      ...(companyId && !isSuperadmin ? { company: companyId } : {})
    };

    const drivers = await User.find(driverFilter)
      .select('_id name email internalId')
      .lean();

    // Get base filter
    const baseFilter = await getCombinedFilter(req.user, companyId ? { company: companyId } : null);
    
    // Get active orders to link drivers to vehicles with trackingKey
    const OrderModel = (await import("../../models/orderModel.js")).default;
    const activeOrders = await OrderModel.find({
      ...baseFilter,
      status: { $nin: ['COMPLETED', 'completed', 'CANCELLED', 'cancelled'] },
      truck: { $exists: true, $ne: null },
      driver: { $exists: true, $ne: null }
    })
      .populate('truck', 'internalId trackingKey unitNumber _id')
      .lean();

    const driverVehicleMap = {};
    activeOrders.forEach(order => {
      if (order.driver && order.truck) {
        const driverId = typeof order.driver === 'object' ? order.driver._id.toString() : order.driver.toString();
        const truck = typeof order.truck === 'object' ? order.truck : null;
        
        if (truck && truck.trackingKey) {
          if (!driverVehicleMap[driverId]) {
            driverVehicleMap[driverId] = {
              vehicleId: truck._id?.toString() || truck.toString(),
              trackingKey: truck.trackingKey
            };
          }
        }
      }
    });

    const results = {
      total: drivers.length,
      successful: [],
      failed: []
    };

    // Try to fetch HOS for each driver from Samsara using vehicle trackingKey
    for (const driver of drivers) {
      try {
        const driverId = driver._id.toString();
        const vehicleInfo = driverVehicleMap[driverId];
        
        if (!vehicleInfo || !vehicleInfo.trackingKey) {
          results.failed.push({
            driverId: driverId,
            driverName: driver.name,
            reason: 'No vehicle with trackingKey found for this driver'
          });
          continue;
        }

        const savedLog = await fetchAndSaveDriverHOSFromSamsara(
          driverId, 
          vehicleInfo.vehicleId, 
          vehicleInfo.trackingKey
        );
        
        if (savedLog) {
          results.successful.push({
            driverId: driverId,
            driverName: driver.name,
            logId: savedLog._id.toString(),
            trackingKey: vehicleInfo.trackingKey
          });
        } else {
          results.failed.push({
            driverId: driverId,
            driverName: driver.name,
            reason: 'Failed to fetch HOS data from Samsara'
          });
        }
      } catch (error) {
        console.error(`❌ Error syncing HOS for driver ${driver.name}:`, error.message);
        results.failed.push({
          driverId: driver._id.toString(),
          driverName: driver.name,
          reason: error.message || 'Unknown error'
        });
      }
    }

    res.json({
      success: true,
      message: `Synced HOS data from Samsara for ${results.successful.length} drivers`,
      data: results
    });
  } catch (error) {
    console.error('❌ Error syncing HOS from Samsara:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing HOS data'
    });
  }
};

/**
 * Get HOS data for a specific driver
 */
export const getDriverHOS = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) {
        dateFilter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.date.$lte = new Date(endDate);
      }
    }

    const logs = await HOSLog.find({
      driverId,
      ...dateFilter
    })
      .populate('vehicleId', 'unitNo licensePlate')
      .sort({ date: -1 })
      .lean();

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('❌ Error fetching driver HOS:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching driver HOS data'
    });
  }
};

/**
 * Get vehicle ELD status and location
 */
export const getVehicleELDStatus = async (req, res) => {
  try {
    const { vehicleId } = req.params;

    // Find Vehicle by ID, trackingKey, internalId, or unitNumber
    const vehicle = await Vehicle.findOne({
      $or: [
        { _id: vehicleId },
        { trackingKey: vehicleId },
        { internalId: vehicleId },
        { unitNumber: vehicleId },
        { plateNumber: vehicleId }
      ]
    })
      .populate('driver', 'name email phone')
      .lean();

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    // If vehicle has trackingKey, fetch latest data from Samsara
    if (vehicle.trackingKey) {
      try {
        const companyId = vehicle.company?.toString() || null;
        const updatedVehicle = await updateVehicleByTrackingKey(vehicle.trackingKey, companyId);
        if (updatedVehicle && updatedVehicle.currentLocation) {
          return res.json({
            success: true,
            data: {
              ...updatedVehicle,
              driver: vehicle.driver
            }
          });
        }
      } catch (samsaraError) {
        console.warn(`⚠️ Could not fetch from Samsara for ${vehicle.trackingKey}:`, samsaraError.message);
        // Fall through to return cached data
      }
    }

    // Return cached data if Samsara fetch fails
    res.json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    console.error('❌ Error fetching vehicle ELD status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching vehicle ELD status'
    });
  }
};

/**
 * Upload E-Log file
 * Handles file upload for electronic logs
 */
export const uploadELogFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { driverId } = req.body;
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      return res.status(400).json({
        success: false,
        message: 'Company assignment required'
      });
    }

    // Verify driver exists and belongs to company (if driverId provided)
    if (driverId) {
      const driverFilter = isSuperadmin ? { _id: driverId, role: 'driver' } : { _id: driverId, role: 'driver', company: companyId };
      const driver = await User.findOne(driverFilter);
      
      if (!driver) {
        return res.status(404).json({
          success: false,
          message: 'Driver not found or access denied'
        });
      }
    }

    // Get file URL from multer (either S3 location or local path)
    const fileUrl = req.file.location || req.file.path || req.file.filename;
    
    // Create E-Log entry
    const elog = new ELog({
      driverId: driverId || null,
      fileName: req.file.originalname || req.file.filename,
      fileUrl: fileUrl,
      fileSize: req.file.size || 0,
      mimeType: req.file.mimetype || req.file.contentType,
      uploadedBy: req.user._id,
      company: companyId
    });

    await elog.save();

    res.json({
      success: true,
      message: 'E-Log file uploaded successfully',
      data: {
        _id: elog._id,
        fileName: elog.fileName,
        fileUrl: elog.fileUrl,
        fileSize: elog.fileSize,
        mimeType: elog.mimeType,
        driverId: elog.driverId,
        uploadedAt: elog.uploadedAt
      }
    });
  } catch (error) {
    console.error('❌ Error uploading E-Log file:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error uploading E-Log file'
    });
  }
};

/**
 * Get E-Logs list
 * Retrieves electronic logs with optional filtering
 */
export const getELogs = async (req, res) => {
  try {
    const { driverId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0
        },
        message: "No company assigned to the current user."
      });
    }

    // Build query
    const query = {};
    if (!isSuperadmin) {
      query.company = companyId;
    }
    if (driverId) {
      query.driverId = driverId;
    }
    if (startDate || endDate) {
      query.uploadedAt = {};
      if (startDate) {
        query.uploadedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.uploadedAt.$lte = new Date(endDate);
      }
    }

    // Get total count
    const total = await ELog.countDocuments(query);

    // Get paginated results
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const elogs = await ELog.find(query)
      .populate('driverId', 'name email phone')
      .populate('uploadedBy', 'name email')
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: elogs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching E-Logs:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching E-Logs'
    });
  }
};

/**
 * Delete E-Log file
 * Removes an electronic log entry
 */
export const deleteELog = async (req, res) => {
  try {
    const { logId } = req.params;
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      return res.status(400).json({
        success: false,
        message: 'Company assignment required'
      });
    }

    // Find and verify ownership
    const query = { _id: logId };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const elog = await ELog.findOne(query);
    
    if (!elog) {
      return res.status(404).json({
        success: false,
        message: 'E-Log not found or access denied'
      });
    }

    // Delete the log
    await ELog.deleteOne({ _id: logId });

    res.json({
      success: true,
      message: 'E-Log deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting E-Log:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting E-Log'
    });
  }
};

/**
 * Download E-Log file
 * Returns the file URL or generates a signed URL for S3 files
 */
export const downloadELog = async (req, res) => {
  try {
    const { logId } = req.params;
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      return res.status(400).json({
        success: false,
        message: 'Company assignment required'
      });
    }

    // Find and verify ownership
    const query = { _id: logId };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const elog = await ELog.findOne(query);
    
    if (!elog) {
      return res.status(404).json({
        success: false,
        message: 'E-Log not found or access denied'
      });
    }

    // If it's an S3 URL, generate a signed URL
    if (elog.fileUrl && elog.fileUrl.includes('amazonaws.com')) {
      const { getS3ClientForBucket } = await import('../../config/awsConfig.js');
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      
      try {
        const s3Client = await getS3ClientForBucket(process.env.AWS_S3_BUCKET_NAME, elog.fileUrl);
        const urlParts = elog.fileUrl.split('/');
        const key = urlParts.slice(3).join('/'); // Remove https://bucket.s3.region.amazonaws.com/
        
        const command = new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: key
        });
        
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        
        return res.json({
          success: true,
          data: {
            downloadUrl: signedUrl,
            fileName: elog.fileName
          }
        });
      } catch (s3Error) {
        console.error('Error generating signed URL:', s3Error);
        // Fall through to return direct URL
      }
    }

    // Return direct URL (for local files or if S3 signing fails)
    res.json({
      success: true,
      data: {
        downloadUrl: elog.fileUrl,
        fileName: elog.fileName
      }
    });
  } catch (error) {
    console.error('❌ Error downloading E-Log:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error downloading E-Log'
    });
  }
};

/**
 * Create HOS Audit Form record
 */
export const createHosAuditForm = async (req, res) => {
  try {
    const {
      driverId,
      driverIdDisplay,
      reportingTo,
      auditDate,
      incidentDate,
      incidentTime,
      incidentLocation,
      drivingHours,
      onDutyHours,
      offDutyHours,
      violations,
      incidentTypes,
      priorCounseling,
      correctiveActionType,
      notes,
      auditorName,
      documents
    } = req.body;

    if (!driverId) {
      return res.status(400).json({ success: false, message: 'Driver is required' });
    }
    if (!auditDate) {
      return res.status(400).json({ success: false, message: 'Audit date is required' });
    }

    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && companyId !== undefined && companyId !== '' &&
      String(companyId).trim() !== '' && String(companyId) !== 'null' && String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      return res.status(400).json({ success: false, message: 'Company assignment required' });
    }

    const driverFilter = isSuperadmin ? { _id: driverId, role: 'driver' } : { _id: driverId, role: 'driver', company: companyId };
    const driver = await User.findOne(driverFilter);
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found or access denied' });
    }

    // Process uploaded files
    const uploadedDocuments = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        let fileUrl = '';
        let s3Key = '';
        
        // Handle S3 uploads (production)
        if (file.location) {
          fileUrl = file.location;
          s3Key = file.key || '';
        } 
        // Handle local uploads (development)
        else if (file.path) {
          fileUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/${file.path.replace(/\\/g, '/')}`;
        }
        
        if (fileUrl) {
          uploadedDocuments.push({
            name: file.originalname || file.filename || 'Unknown',
            size: file.size || 0,
            url: fileUrl,
            key: s3Key,
            mimeType: file.mimetype || ''
          });
        }
      }
    }

    const auditDateObj = new Date(auditDate);
    const payload = {
      driverId,
      driverIdDisplay: driverIdDisplay || '',
      reportingTo: reportingTo || '',
      auditDate: auditDateObj,
      incidentDate: incidentDate ? new Date(incidentDate) : undefined,
      incidentTime: incidentTime || '',
      incidentLocation: incidentLocation || '',
      drivingHours: typeof drivingHours === 'number' ? drivingHours : parseFloat(drivingHours) || 0,
      onDutyHours: typeof onDutyHours === 'number' ? onDutyHours : parseFloat(onDutyHours) || 0,
      offDutyHours: typeof offDutyHours === 'number' ? offDutyHours : parseFloat(offDutyHours) || 0,
      violations: Array.isArray(violations) ? violations : [],
      incidentTypes: Array.isArray(incidentTypes) ? incidentTypes : [],
      priorCounseling: priorCounseling || '',
      correctiveActionType: correctiveActionType || '',
      notes: notes || '',
      auditorName: auditorName || '',
      documents: uploadedDocuments.length > 0 ? uploadedDocuments : [],
      company: companyId,
      createdBy: req.user?._id
    };

    const record = new HosAuditForm(payload);
    await record.save();
    const data = record.toObject();
    data.driverName = driver.name || `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || 'Unknown';

    // Also create/update HOSLog so the entry appears in HOS Audit Tracker (works without Samsara)
    const startOfDay = new Date(auditDateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const drivingHrs = typeof drivingHours === 'number' ? drivingHours : parseFloat(drivingHours) || 0;
    const onDutyHrs = typeof onDutyHours === 'number' ? onDutyHours : parseFloat(onDutyHours) || 0;
    const offDutyHrs = typeof offDutyHours === 'number' ? offDutyHours : parseFloat(offDutyHours) || 0;
    const hasViolations = Array.isArray(violations) && violations.length > 0;
    await HOSLog.findOneAndUpdate(
      { driverId, date: startOfDay },
      {
        driverId,
        date: startOfDay,
        totalDrivingHours: drivingHrs,
        totalOnDutyHours: onDutyHrs,
        totalOffDutyHours: offDutyHrs,
        violations: hasViolations,
        logs: [], // Manual audits have no duty-status breakdown from ELD
        auditNotes: notes || '',
        auditorName: auditorName || req.user?.name || 'Unknown',
        auditedAt: new Date(),
        auditViolations: Array.isArray(violations) ? violations : [],
        company: companyId
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ success: true, message: 'HOS audit form saved successfully', data });
  } catch (error) {
    console.error('❌ Error creating HOS audit form:', error);
    res.status(500).json({ success: false, message: error.message || 'Error creating HOS audit form' });
  }
};

/**
 * Get HOS Audit Form list
 */
export const getHosAuditForms = async (req, res) => {
  try {
    const { driverId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && companyId !== undefined && companyId !== '' &&
      String(companyId).trim() !== '' && String(companyId) !== 'null' && String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      return res.json({
        success: true,
        data: [],
        pagination: { total: 0, page: parseInt(page, 10), limit: parseInt(limit, 10), totalPages: 0 },
        message: 'No company assigned to the current user.'
      });
    }

    const query = {};
    if (!isSuperadmin) query.company = companyId;
    if (driverId) query.driverId = driverId;
    if (startDate || endDate) {
      query.auditDate = {};
      if (startDate) query.auditDate.$gte = new Date(startDate);
      if (endDate) query.auditDate.$lte = new Date(endDate);
    }

    const total = await HosAuditForm.countDocuments(query);
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const list = await HosAuditForm.find(query)
      .populate('driverId', 'name email phone')
      .sort({ auditDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean();

    const data = list.map((row) => {
      const d = { ...row };
      d.driverName = row.driverId?.name || (row.driverId?.firstName || row.driverId?.lastName ? `${row.driverId?.firstName || ''} ${row.driverId?.lastName || ''}`.trim() : 'Unknown');
      d.id = d._id.toString();
      return d;
    });

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching HOS audit forms:', error);
    res.status(500).json({ success: false, message: error.message || 'Error fetching HOS audit forms' });
  }
};

/**
 * Get signed URL for HOS Audit Form document
 */
export const getHosAuditDocumentUrl = async (req, res) => {
  try {
    const { auditId, documentIndex } = req.params;
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && companyId !== undefined && companyId !== '' &&
      String(companyId).trim() !== '' && String(companyId) !== 'null' && String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      return res.status(400).json({ success: false, message: 'Company assignment required' });
    }

    const query = { _id: auditId };
    if (!isSuperadmin) query.company = companyId;

    const audit = await HosAuditForm.findOne(query);
    if (!audit) {
      return res.status(404).json({ success: false, message: 'Audit not found or access denied' });
    }

    const docIndex = parseInt(documentIndex, 10);
    if (!audit.documents || !audit.documents[docIndex]) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const document = audit.documents[docIndex];

    // If document has no URL, return error
    if (!document.url) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document URL not available. The file was not uploaded properly.' 
      });
    }

    // If it's an S3 URL, generate a signed URL
    const isS3Url = document.url && (document.url.includes('amazonaws.com') || document.url.includes('.s3.'));
    if (isS3Url) {
      try {
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
        const { getS3ClientForBucket } = await import('../../config/awsConfig.js');
        
        // Extract bucket and key from S3 URL
        const cleanUrl = document.url.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let s3Key = document.key || '';
        
        // If key is not stored, extract it from URL
        if (!s3Key) {
          if (urlObj.hostname.includes('.s3.')) {
            bucketName = urlObj.hostname.split('.s3.')[0];
            s3Key = decodeURIComponent(urlObj.pathname.substring(1));
          } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            bucketName = pathParts[0];
            s3Key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
          } else {
            s3Key = decodeURIComponent(urlObj.pathname.substring(1));
          }
        }
        
        // Clean key from query parameters
        if (s3Key.includes('?')) s3Key = s3Key.split('?')[0];
        if (s3Key.includes('&')) s3Key = s3Key.split('&')[0];
        
        // Get content type
        const getContentType = (fileName) => {
          const ext = fileName.split('.').pop()?.toLowerCase();
          const contentTypes = {
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'txt': 'text/plain'
          };
          return contentTypes[ext] || document.mimeType || 'application/octet-stream';
        };
        
        const contentType = getContentType(document.name);
        
        const s3Client = await getS3ClientForBucket(bucketName, document.url);
        
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          ResponseContentDisposition: `inline; filename="${encodeURIComponent(document.name)}"`,
          ResponseContentType: contentType
        });
        
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour expiry
        
        return res.json({
          success: true,
          data: {
            url: signedUrl,
            fileName: document.name,
            mimeType: contentType
          }
        });
      } catch (s3Error) {
        console.error('Error generating signed URL:', s3Error);
        return res.status(500).json({
          success: false,
          message: 'Failed to generate signed URL: ' + s3Error.message
        });
      }
    }

    // Return direct URL (for local files)
    res.json({
      success: true,
      data: {
        url: document.url,
        fileName: document.name,
        mimeType: document.mimeType
      }
    });
  } catch (error) {
    console.error('❌ Error getting document URL:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting document URL'
    });
  }
};
