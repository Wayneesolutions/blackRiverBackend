import mongoose from "mongoose";
import { FleetUnit } from "../../models/fleet/fleetUnitModel.js";
import { User } from "../../models/driver/userModel.js";
import Order from "../../models/orderModel.js";
import { WorkOrder } from "../../models/driver/workOrderModel.js";
import { Invoice } from "../../models/hr/invoiceModel.js";
import moment from "moment";
import HosLog from "../../models/driver/hosManagement.js";
import VehicleDocuments from "../../models/driver/vehicleDocumentsModel.js";
import { EmployeeDocument } from "../../models/driver/employeeDocumentModel.js";
import { VehicleService } from "../../models/driver/vehicleService.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";
import { Expense } from "../../models/hr/expenseModel.js";
import { Payroll } from "../../models/hr/payrollSchemaModel.js";
import { Incident } from "../../models/healthSafety/incidentModel.js";
import { Certificate } from "../../models/healthSafety/certificateModel.js";
import { PolicyDocument } from "../../models/healthSafety/policyDocumentModel.js";
import { Training } from "../../models/healthSafety/trainingModel.js";
import { GeneralRepair } from "../../models/fleet/generalRepairModel.js";
import { Vehicle } from '../../models/driver/vehicleModel.js'


export async function getPendingMaintenanceCount(req, res) {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: {
          overdue: 0,
          upcoming: 0,
          completed: 0,
          totalPending: 0
        }
      });
    }

    const query = {};
    if (companyId) {
      query.company = companyId;
    }
    // Use FleetUnit instead of Vehicle
    const fleetUnits = await FleetUnit.find(query, { upcomingServices: 1 });

    let overdueCount = 0;
    let upcomingCount = 0;
    let completedCount = 0;

    fleetUnits.forEach(unit => {
      if (unit.upcomingServices && unit.upcomingServices.length > 0) {
        unit.upcomingServices.forEach(service => {
          if (service.status === "overdue") overdueCount++;
          if (service.status === "upcoming") upcomingCount++;
          if (service.status === 'completed') completedCount++
        });
      }
    });

    return res.json({
      success: true,
      message: "Pending maintenance counts",
      data: {
        overdue: overdueCount,
        upcoming: upcomingCount,
        completed: completedCount,
        totalPending: overdueCount + upcomingCount
      }
    });
  } catch (err) {
    console.error("Error fetching pending maintenance counts:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getVehicleServicesDashboard(req, res) {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }
    const query = {};
    if (companyId) {
      query.company = companyId;
    }
    // Use FleetUnit instead of Vehicle
    const fleetUnits = await FleetUnit.find(query, {
      licensePlate: 1,
      makeModel: 1,
      unitType: 1,
      upcomingServices: 1
    });

    // Optional: Flatten the services for easier dashboard consumption
    const dashboardData = fleetUnits.map(unit => {
      if (unit.upcomingServices && unit.upcomingServices.length > 0) {
        return unit.upcomingServices.map(service => ({
          plateNumber: unit.licensePlate,
          model: unit.makeModel,
          unitType: unit.unitType,
          serviceType: service.serviceType,
          status: service.status,
          dueDate: service.dueDate,
          dueMileage: service.dueMileage
        }));
      }
      return [];
    }).flat();

    return res.json({ success: true, message: "upcoming and due services", data: dashboardData })

  } catch (err) {
    console.error("Error fetching vehicle services:", err);
    return res.json({ success: false, message: err.message })
  }
}

export const getDashboardStats = async (req, res) => {
  try {

    console.log('📊 getDashboardStats called for user:', req.user._id);

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // If user is not superadmin and has no company, return zeros
    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        data: {
          totalVehicles: 0,
          driversOnDuty: 0,
          activeLoads: 0,
          pendingWorkOrders: 0,
          pendingInvoices: 0,
        },
        message: "Please complete company settings first to view statistics.",
        requiresCompanySetup: true
      });
    }

    // Always use a proper ObjectId so both countDocuments and aggregate match correctly
    const companyObjId = companyId && mongoose.Types.ObjectId.isValid(companyId)
      ? new mongoose.Types.ObjectId(companyId)
      : null;
    const companyMatch = companyObjId ? { company: companyObjId } : (isSuperadmin ? {} : { company: null });

    console.log("companyMatch..........", companyMatch);

    // Count trucks (FleetUnit with unitType "Truck")
    const totalVehicles = await Vehicle.countDocuments({ ...companyMatch, type: "Truck", status: "In Service" });


    // Count drivers on duty based on orders that are accepted and active
    const onDutyDriverIds = await Order.distinct('driver', {
      ...companyMatch,
      driver: { $ne: null },
      driverAcceptanceStatus: 'accepted',
      status: { $in: ['in-delivery', 'planned'] }
    });
    const driversOnDuty = onDutyDriverIds.length;
    console.log("drivers on duty..............", driversOnDuty)

    const Trip = (await import("../../models/tripModel.js")).default;
    // const activeTrips = await Trip.countDocuments({ ...companyMatch, status: "in-progress" });

    // Count pending work orders from GeneralRepair (all statuses except completed)
    const pendingWorkOrders = await GeneralRepair.countDocuments({
      ...companyMatch,
      status: { $in: ['Created', 'Assigned', 'Shared', 'in-progress'] }
    });
    console.log("pending work orders..............", pendingWorkOrders)
    const pendingInvoices = await Invoice.countDocuments({ ...companyMatch, status: "pending" });



    const activeTrips = await Order.countDocuments({ ...companyMatch, status: "in-delivery" });

    const trips = await Order.aggregate([
      {
        $match: {
          ...companyMatch
        }
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          total: { $sum: 1 }
        }
      }
    ]);


    const monthMap = {};
    trips.forEach(item => {
      monthMap[item._id] = item.total;
    });

    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const tripsPerMonth = months.map((month, index) => ({
      month,
      total: monthMap[index + 1] || 0
    }));

    // ✅ final output
    console.log(tripsPerMonth);








    res.json({
      success: true,
      data: {
        totalVehicles: totalVehicles,
        driversOnDuty: driversOnDuty,
        pendingWorkOrders: pendingWorkOrders,
        pendingInvoices: pendingInvoices,
        activeLoads: activeTrips,

        tripsPerMonth: tripsPerMonth

      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};



// Get Loads Per Month (with all months, 0 if none) - Now uses Trips
export const getLoadsPerMonth = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    // If user is not superadmin and has no company, return zeros for all months
    if (!isSuperadmin && !companyId) {
      return res.json({ success: true, data: monthNames.map(m => ({ month: m, total: 0 })) });
    }

    // Convert to ObjectId — aggregate $match does NOT auto-cast strings
    const companyObjId = companyId && mongoose.Types.ObjectId.isValid(companyId)
      ? new mongoose.Types.ObjectId(companyId)
      : null;

    // Restrict to current calendar year so months don't bleed across years
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(`${currentYear}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${currentYear}-12-31T23:59:59.999Z`);

    const matchStage = { createdAt: { $gte: yearStart, $lte: yearEnd } };
    if (companyObjId) matchStage.company = companyObjId;
    else if (!isSuperadmin) matchStage.company = null;

    // Aggregate trips by month
    const pipeline = [
      { $match: matchStage },
      { $group: { _id: { $month: "$createdAt" }, total: { $sum: 1 } } },
    ];

    // Dynamic import for Trip model
    const Trip = (await import("../../models/tripModel.js")).default;
    const tripsData = await Trip.aggregate(pipeline);

    // Initialize all months with 0
    const loadsPerMonth = monthNames.map((month, index) => {
      const monthData = tripsData.find(t => t._id === index + 1);
      return {
        month,
        total: monthData ? monthData.total : 0
      };
    });

    res.json({ success: true, data: loadsPerMonth });
  } catch (err) {
    console.error("Error fetching loads per month:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


// Get Revenue Trend Per Month (with all months and names) - Now uses Trip data via Invoice tripId
export const getRevenueTrend = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    // If user is not superadmin and has no company, return zeros for all months
    if (!isSuperadmin && !companyId) {
      return res.json({ success: true, data: monthNames.map(m => ({ month: m, totalRevenue: 0 })) });
    }

    // Convert to ObjectId — aggregate $match does NOT auto-cast strings
    const companyObjId = companyId && mongoose.Types.ObjectId.isValid(companyId)
      ? new mongoose.Types.ObjectId(companyId)
      : null;

    // Restrict to current calendar year so months don't bleed across years
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(`${currentYear}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${currentYear}-12-31T23:59:59.999Z`);

    // Build match: paid invoices, current year, filtered by company
    // Invoice.amount is stored as String so use $toDouble in the group stage
    const matchStage = {
      status: "paid",
      createdAt: { $gte: yearStart, $lte: yearEnd },
    };

    console.log("matchStage", matchStage)
    if (companyObjId) matchStage.company = companyObjId;
    else if (!isSuperadmin) matchStage.company = null;

    const revenue = await Invoice.find({ matchStage })
    console.log("revenue", revenue)

    // Aggregate paid invoices by month
    const revenueData = await Invoice.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $month: "$createdAt" },
          totalRevenue: { $sum: { $toDouble: "$amount" } },
        },
      },
    ]);



    // Fill all months with 0 if no revenue
    const revenuePerMonth = monthNames.map((month, index) => {
      const monthData = revenueData.find(r => r._id === index + 1);
      return {
        month,
        totalRevenue: monthData ? monthData.totalRevenue : 0
      };
    });

    res.json({ success: true, data: revenuePerMonth });
  } catch (err) {
    console.error("Revenue trend error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getFuelEfficiency = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // If user is not superadmin and has no company, return zeros
    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        data: { avgMileage: 0, totalFuel: 0 }
      });
    }

    // Build company filter
    const companyFilter = companyId ? { company: companyId } : (isSuperadmin ? null : { company: null });

    // Get combined filter (company + trial data filter)
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    const pipeline = [];
    // Build match stage - filter by trucks only (unitType: "Truck")
    const matchStage = { unitType: "Truck" };
    if (baseFilter) {
      if (baseFilter.$or) {
        matchStage.$and = [
          { $or: baseFilter.$or },
          { unitType: "Truck" }
        ];
      } else {
        Object.assign(matchStage, baseFilter);
        matchStage.unitType = "Truck";
      }
    } else if (companyId) {
      matchStage.company = companyId;
    } else if (!isSuperadmin) {
      matchStage.company = null;
    }

    pipeline.push({ $match: matchStage });
    pipeline.push({
      $group: {
        _id: null,
        avgMileage: { $avg: "$odometer" }, // Average odometer reading
        totalFuel: { $sum: "$fuelLevel" }, // Sum of fuel levels
      },
    });

    // Use FleetUnit instead of Vehicle
    const fleetUnits = await FleetUnit.aggregate(pipeline);

    res.json({
      success: true,
      data: fleetUnits[0] || { avgMileage: 0, totalFuel: 0 }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};



export const getRecentAlerts = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNow = moment().add(30, "days").toDate();

    // Build company filter for employee documents
    const employeeDocFilter = {
      expiryDate: { $lte: thirtyDaysFromNow },
      status: { $in: ["expiring-soon", "pending", "valid"] }
    };

    // Build company filter for vehicle documents
    const vehicleDocFilter = {
      expiryDate: { $lte: thirtyDaysFromNow },
      status: { $in: ["expiring-soon", "pending"] },
      ignoreExpiration: { $ne: true } // Exclude documents with ignoreExpiration: true
    };

    // If user is not superadmin and has no company, return empty arrays
    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        alerts: {
          driverDocs: [],
          vehicleDocs: [],
          maintenanceDue: [],
          delayedLoads: [],
        },
      });
    }

    // Build company filter
    const companyFilter = companyId ? { company: companyId } : (isSuperadmin ? null : { company: null });

    // Get combined filter (company + trial data filter)
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // For employee documents, we need to filter by employee's company
    // Since EmployeeDocument doesn't have company field directly, we filter through employee
    let driverDocs = [];
    if (companyId) {
      // Find employees with this company, then their documents
      const employees = await User.find({ company: companyId }).select('_id');
      const employeeIds = employees.map(emp => emp._id);
      driverDocs = await EmployeeDocument.find({
        ...employeeDocFilter,
        employee: { $in: employeeIds }
      })
        .populate("employee", "name email")
        .select("documentType documentNumber expiryDate status employee");
    } else if (isSuperadmin) {
      driverDocs = await EmployeeDocument.find(employeeDocFilter)
        .populate("employee", "name email")
        .select("documentType documentNumber expiryDate status employee");
    }

    // For vehicle documents, filter by FleetUnit's company (replacing Vehicle with FleetUnit)
    // VehicleDocuments can have vehicleId (legacy) or fleetUnitId (new), so we check both
    let vehicleDocs = [];
    if (companyId) {
      // Get FleetUnit IDs for this company (both trucks and trailers)
      const fleetUnitIds = await FleetUnit.find({ company: companyId }).distinct('_id');
      // Combine expiryDate/status filter with fleetUnitId/vehicleId filter
      const finalFilter = {
        ...vehicleDocFilter,
        $or: [
          { vehicleId: { $in: fleetUnitIds } },
          { fleetUnitId: { $in: fleetUnitIds } }
        ]
      };
      vehicleDocs = await VehicleDocuments.find(finalFilter)
        .populate("vehicleId", "licensePlate internalId unitType")
        .populate("fleetUnitId", "licensePlate internalId unitType")
        .select("documentType documentNumber expiryDate status vehicleId fleetUnitId");
    } else if (isSuperadmin) {
      vehicleDocs = await VehicleDocuments.find(vehicleDocFilter)
        .populate("vehicleId", "licensePlate internalId unitType")
        .populate("fleetUnitId", "licensePlate internalId unitType")
        .select("documentType documentNumber expiryDate status vehicleId fleetUnitId");
    }

    // Maintenance Due - Use VehicleService (scheduled service log)
    const maintenanceFilter = {
      status: "pending",
      dueDate: { $lte: today }
    };
    if (companyId) {
      maintenanceFilter.company = companyId;
    } else if (!isSuperadmin) {
      maintenanceFilter.company = null;
    }

    const overdueServices = await VehicleService.find(maintenanceFilter)
      .select("unitNumber makeModel dueDate dueMileage")
      .sort({ dueDate: 1 })
      .limit(10);

    const maintenanceDue = overdueServices.map(service => ({
      plateNumber: service.unitNumber || service.makeModel || "N/A",
      nextServiceDate: service.dueDate
    }));

    // Delayed Loads - Use Trip (trips that are in-progress but past plannedEndDate)
    const delayedTripFilter = {
      status: "in-progress",
      plannedEndDate: { $lt: today } // Past planned end date
    };

    if (baseFilter) {
      if (baseFilter.$or) {
        delayedTripFilter.$and = [
          { $or: baseFilter.$or },
          { status: "in-progress" },
          { plannedEndDate: { $lt: today } }
        ];
      } else {
        Object.assign(delayedTripFilter, baseFilter);
        delayedTripFilter.status = "in-progress";
        delayedTripFilter.plannedEndDate = { $lt: today };
      }
    } else if (companyId) {
      delayedTripFilter.company = companyId;
    } else if (!isSuperadmin) {
      delayedTripFilter.company = null;
    }

    // Dynamic import for Trip model
    const Trip = (await import("../../models/tripModel.js")).default;
    const delayedTrips = await Trip.find(delayedTripFilter)
      .select("tripNumber plannedEndDate actualEndDate status")
      .sort({ plannedEndDate: 1 })
      .limit(10);

    const delayedLoads = delayedTrips.map(trip => ({
      _id: trip._id.toString(),
      loadId: trip.tripNumber || trip._id.toString(),
      deliveryDate: trip.plannedEndDate || trip.actualEndDate || new Date(),
      status: trip.status
    }));

    // Normalize expiringDocs combining driver + vehicle docs for frontend consumption
    const expiringDocs = [
      ...driverDocs.map(doc => ({
        name: doc.employee?.name || "Unknown Driver",
        type: "driver",
        documentType: doc.documentType || "Document",
        expiryDate: doc.expiryDate,
        license: { expiryDate: doc.expiryDate }
      })),
      ...vehicleDocs.map(doc => ({
        name: doc.fleetUnitId?.licensePlate || doc.vehicleId?.licensePlate || "Unknown Vehicle",
        type: "vehicle",
        documentType: doc.documentType || "Document",
        expiryDate: doc.expiryDate,
        license: { expiryDate: doc.expiryDate }
      }))
    ];

    res.json({
      success: true,
      alerts: {
        driverDocs,
        vehicleDocs,
        expiringDocs,
        maintenanceDue,
        delayedLoads,
      },
    });
  } catch (err) {
    console.error("Error fetching document alerts:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getVehicleAndWorkOrderStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // If user is not superadmin and has no company, return zeros
    if (!isSuperadmin && !companyId) {
      return res.status(200).json({
        success: true,
        message: "Please complete company settings first to view statistics.",
        data: {
          totalVehicles: 0,
          activeWorkOrders: 0,
          totalTrailers: 0,
          trailersInTransit: 0,
          trailersAvailable: 0,
          trailersMaintenance: 0,
          trailersAttached: 0,
          trailersUnattached: 0
        },
        requiresCompanySetup: true
      });
    }

    const companyFilter = companyId ? { company: companyId } : (isSuperadmin ? {} : { company: null });

    // Count total trucks (FleetUnit with unitType: "Truck")
    const totalVehicles = await FleetUnit.countDocuments({ ...companyFilter, unitType: "Truck" });

    // Count active (in-progress) work orders
    const activeWorkOrders = await WorkOrder.countDocuments({ ...companyFilter, status: "inprogress" });

    // Count total trailers (FleetUnit with unitType that includes trailer types)
    // Trailer types: "Trailer", "Reefer Trailer", "Tri-Axle Trailer", "Dry Van", "Flatbed", "Step Deck", "Lowboy", "Tank Trailer", "Dump Trailer"
    const trailerTypes = ["Trailer", "Reefer Trailer", "Tri-Axle Trailer", "Dry Van", "Flatbed", "Step Deck", "Lowboy", "Tank Trailer", "Dump Trailer"];
    const totalTrailers = await FleetUnit.countDocuments({ ...companyFilter, unitType: { $in: trailerTypes } });

    // Count trailers by operation status
    const trailersInTransit = await FleetUnit.countDocuments({ ...companyFilter, unitType: { $in: trailerTypes }, operationStatus: 'in-transit' });
    const trailersAvailable = await FleetUnit.countDocuments({ ...companyFilter, unitType: { $in: trailerTypes }, operationStatus: 'available' });
    const trailersMaintenance = await FleetUnit.countDocuments({ ...companyFilter, unitType: { $in: trailerTypes }, operationStatus: 'maintenance' });

    // For trailers attached, check if they're assigned to active trips
    // Dynamic import for Trip model
    const Trip = (await import("../../models/tripModel.js")).default;
    const activeTrips = await Trip.find({ ...companyFilter, status: "in-progress" }).select('trailer');
    const attachedTrailerIds = activeTrips.map(trip => trip.trailer).filter(id => id !== null);
    const trailersAttached = attachedTrailerIds.length;

    // Return combined data
    return res.status(200).json({
      success: true,
      message: "Dashboard statistics fetched successfully",
      data: {
        totalVehicles,
        activeWorkOrders,
        totalTrailers,
        trailersInTransit,
        trailersAvailable,
        trailersMaintenance,
        trailersAttached,
        trailersUnattached: totalTrailers - trailersAttached
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get Admin Dashboard Data with Trips and Truck Locations
export const getAdminDashboard = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Strict validation: For non-superadmin, companyId MUST be a valid non-empty string/ObjectId
    // Check for undefined, null, empty string, or whitespace
    const hasValidCompany = companyId !== null &&
      companyId !== undefined &&
      companyId !== '' &&
      String(companyId).trim() !== '' &&
      String(companyId) !== 'null' &&
      String(companyId) !== 'undefined';

    console.log('🔍 Dashboard Access Check:', {
      userId: req.user?._id?.toString(),
      userRole: req.user?.role,
      userCompany: req.user?.company,
      userCompanyType: typeof req.user?.company,
      companyId: companyId,
      companyIdType: typeof companyId,
      hasValidCompany: hasValidCompany,
      isSuperadmin: isSuperadmin
    });

    // CRITICAL: If not superadmin and no valid company, return empty data immediately
    // This MUST happen before any database queries
    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ BLOCKED: Admin has no company - returning empty data immediately');
      console.log('❌ Blocking reason:', {
        isSuperadmin,
        companyId,
        companyIdType: typeof companyId,
        hasValidCompany
      });
      return res.json({
        success: true,
        message: "No company assigned to the current user. Please contact administrator to assign a company.",
        data: {
          stats: {
            activeLoads: 0,
            vehiclesOnline: 0,
            activeDrivers: 0,
            pendingTasks: 0,
            complianceRate: 0,
            monthlyRevenue: 0,
            openIncidents: 0,
            maintenanceOrdersCount: 0
          },
          trips: [],
          trucks: []
        }
      });
    }

    // CRITICAL: Double-check validation before proceeding
    // This is a safety net in case the first check somehow didn't catch it
    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ BLOCKED (safety check): Admin has no company - returning empty data');
      return res.json({
        success: true,
        message: "No company assigned to the current user.",
        data: {
          stats: {
            activeLoads: 0,
            vehiclesOnline: 0,
            activeDrivers: 0,
            pendingTasks: 0,
            complianceRate: 0,
            monthlyRevenue: 0,
            openIncidents: 0,
            maintenanceOrdersCount: 0
          },
          trips: [],
          trucks: []
        }
      });
    }

    const companyFilter = hasValidCompany ? { company: companyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Import mongoose for ObjectId conversion
    const mongoose = (await import('mongoose')).default;

    // For non-superadmin, ALL filters MUST include company filter - no exceptions
    // If baseFilter is null but we have companyId, create filter with company
    // For non-superadmin, we MUST have company in every filter
    const ensureCompanyFilter = (filter) => {
      if (isSuperadmin) {
        return filter || {};
      }

      // CRITICAL: For non-superadmin, company filter is MANDATORY
      // If companyId is undefined/null, return invalid filter that matches nothing
      if (!hasValidCompany || companyId === undefined || companyId === null) {
        console.error('❌ ensureCompanyFilter: companyId is invalid - returning no-match filter');
        // Return filter that will match nothing (invalid ObjectId)
        return { company: mongoose.Types.ObjectId('000000000000000000000000') };
      }

      // CRITICAL: Double-check companyId is valid before using it
      if (companyId === undefined || companyId === null) {
        console.error('❌ ensureCompanyFilter: companyId is undefined/null - returning no-match filter');
        return { company: mongoose.Types.ObjectId('000000000000000000000000') };
      }

      if (!filter || Object.keys(filter).length === 0) {
        // No existing filter, create simple company filter
        return { company: companyId };
      }

      // Check if company filter already exists
      if (filter.company) {
        // Already has company filter, verify it matches our companyId
        if (String(filter.company) !== String(companyId)) {
          console.warn('⚠️ Filter has different company - overwriting with correct company');
          return { ...filter, company: companyId };
        }
        return { ...filter };
      }

      if (filter.$and && Array.isArray(filter.$and)) {
        // Check if company is already in $and array
        const hasCompany = filter.$and.some(cond => cond && cond.company);
        if (!hasCompany) {
          // Add company to $and array
          return {
            ...filter,
            $and: [...filter.$and, { company: companyId }]
          };
        }
        return { ...filter };
      } else {
        // Simple filter, add company directly
        return {
          ...filter,
          company: companyId
        };
      }
    };

    let orderFilter = ensureCompanyFilter(baseFilter);
    let fleetFilter = ensureCompanyFilter(baseFilter);
    let userFilter = ensureCompanyFilter(baseFilter);
    let expenseFilter = ensureCompanyFilter(baseFilter);
    let payrollFilter = ensureCompanyFilter(baseFilter);
    let workOrderFilter = ensureCompanyFilter(baseFilter);
    let invoiceFilter = ensureCompanyFilter(baseFilter);
    let generalRepairFilter = ensureCompanyFilter(baseFilter);

    // Apply company filter for non-superadmin - ensure it's always present
    // Handle both string and ObjectId formats for company field
    if (!isSuperadmin && companyId) {
      // Check if baseFilter already has $and structure
      if (baseFilter && baseFilter.$and && Array.isArray(baseFilter.$and)) {
        // baseFilter already has $and, check if company is in it
        const hasCompanyInAnd = baseFilter.$and.some(condition => {
          if (!condition) return false;
          // Check if condition has company field (could be direct or in $or)
          return condition.company || (condition.$or && condition.$or.some(or => or.company));
        });

        if (!hasCompanyInAnd) {
          // Ensure $and array exists in filters
          if (!orderFilter.$and) orderFilter.$and = [...baseFilter.$and];
          if (!fleetFilter.$and) fleetFilter.$and = [...baseFilter.$and];
          if (!userFilter.$and) userFilter.$and = [...baseFilter.$and];
          if (!expenseFilter.$and) expenseFilter.$and = [...baseFilter.$and];
          if (!payrollFilter.$and) payrollFilter.$and = [...baseFilter.$and];
          if (!workOrderFilter.$and) workOrderFilter.$and = [...baseFilter.$and];
          if (!invoiceFilter.$and) invoiceFilter.$and = [...baseFilter.$and];
          if (!generalRepairFilter.$and) generalRepairFilter.$and = [...baseFilter.$and];

          // Add company filter - Mongoose will handle string/ObjectId conversion
          orderFilter.$and.push({ company: companyId });
          fleetFilter.$and.push({ company: companyId });
          userFilter.$and.push({ company: companyId });
          expenseFilter.$and.push({ company: companyId });
          payrollFilter.$and.push({ company: companyId });
          workOrderFilter.$and.push({ company: companyId });
          invoiceFilter.$and.push({ company: companyId });
          generalRepairFilter.$and.push({ company: companyId });
        }
      } else {
        // Simple object, add company directly (Mongoose handles conversion)
        if (!orderFilter.company) orderFilter.company = companyId;
        if (!fleetFilter.company) fleetFilter.company = companyId;
        if (!userFilter.company) userFilter.company = companyId;
        if (!expenseFilter.company) expenseFilter.company = companyId;
        if (!payrollFilter.company) payrollFilter.company = companyId;
        if (!workOrderFilter.company) workOrderFilter.company = companyId;
        if (!invoiceFilter.company) invoiceFilter.company = companyId;
        if (!generalRepairFilter.company) generalRepairFilter.company = companyId;
      }
    }

    // Debug logging
    console.log('🔍 Dashboard Query Debug:', {
      userId: req.user?._id?.toString(),
      userRole: req.user?.role,
      companyId: companyId?.toString(),
      hasValidCompany,
      isSuperadmin,
      orderFilter: JSON.stringify(orderFilter),
      fleetFilter: JSON.stringify(fleetFilter),
      userFilter: JSON.stringify(userFilter)
    });

    // CRITICAL: Verify all filters have company for non-superadmin
    if (!isSuperadmin && hasValidCompany) {
      const verifyCompanyInFilter = (filter, filterName) => {
        if (!filter) {
          console.error(`❌ ${filterName} is null/undefined`);
          return false;
        }
        if (filter.company) {
          return true;
        }
        if (filter.$and && Array.isArray(filter.$and)) {
          const hasCompany = filter.$and.some(cond => cond && cond.company);
          if (!hasCompany) {
            console.error(`❌ ${filterName} missing company in $and array`);
            return false;
          }
          return true;
        }
        console.error(`❌ ${filterName} missing company filter:`, JSON.stringify(filter));
        return false;
      };

      const filtersValid = [
        verifyCompanyInFilter(orderFilter, 'orderFilter'),
        verifyCompanyInFilter(fleetFilter, 'fleetFilter'),
        verifyCompanyInFilter(userFilter, 'userFilter'),
        verifyCompanyInFilter(expenseFilter, 'expenseFilter'),
        verifyCompanyInFilter(payrollFilter, 'payrollFilter'),
        verifyCompanyInFilter(workOrderFilter, 'workOrderFilter'),
        verifyCompanyInFilter(invoiceFilter, 'invoiceFilter'),
        verifyCompanyInFilter(generalRepairFilter, 'generalRepairFilter')
      ];

      if (filtersValid.some(valid => !valid)) {
        console.error('❌ CRITICAL: Some filters missing company - returning empty data for safety');
        return res.json({
          success: true,
          message: "Data filtering error. Please contact administrator.",
          data: {
            stats: {
              activeLoads: 0,
              vehiclesOnline: 0,
              activeDrivers: 0,
              pendingTasks: 0,
              complianceRate: 0,
              monthlyRevenue: 0,
              openIncidents: 0,
              maintenanceOrdersCount: 0
            },
            trips: [],
            trucks: []
          }
        });
      }
    }

    // CRITICAL: Final check before executing queries
    // If companyId is still undefined/null for non-superadmin, block all queries
    if (!isSuperadmin && (!hasValidCompany || !companyId)) {
      console.error('❌ CRITICAL ERROR: Attempting to execute queries without company filter!');
      console.error('❌ Blocking all queries - returning empty data');
      return res.json({
        success: true,
        message: "Data access error. No company assigned.",
        data: {
          stats: {
            activeLoads: 0,
            vehiclesOnline: 0,
            activeDrivers: 0,
            pendingTasks: 0,
            complianceRate: 0,
            monthlyRevenue: 0,
            openIncidents: 0,
            maintenanceOrdersCount: 0
          },
          trips: [],
          trucks: []
        }
      });
    }

    // CRITICAL: Final safety check - if companyId is undefined, BLOCK ALL QUERIES
    if (!isSuperadmin && (companyId === undefined || companyId === null || !hasValidCompany)) {
      console.error('❌ CRITICAL: companyId is undefined/null - BLOCKING ALL QUERIES');
      console.error('❌ Final check failed:', {
        companyId,
        companyIdType: typeof companyId,
        hasValidCompany,
        isSuperadmin
      });
      return res.json({
        success: true,
        message: "No company assigned. Cannot access data.",
        data: {
          stats: {
            activeLoads: 0,
            vehiclesOnline: 0,
            activeDrivers: 0,
            pendingTasks: 0,
            complianceRate: 0,
            monthlyRevenue: 0,
            openIncidents: 0,
            maintenanceOrdersCount: 0
          },
          trips: [],
          trucks: []
        }
      });
    }

    // --- Pre-compute filters and date ranges before parallel queries ---
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const certificateFilter = baseFilter ? { ...baseFilter } : {};
    if (!isSuperadmin && companyId) {
      if (certificateFilter.$and) certificateFilter.$and.push({ company: companyId });
      else certificateFilter.company = companyId;
    }

    const policyFilter = baseFilter ? { ...baseFilter } : {};
    if (!isSuperadmin && companyId) {
      if (policyFilter.$and) policyFilter.$and.push({ company: companyId });
      else policyFilter.company = companyId;
    }

    const incidentFilter = baseFilter ? { ...baseFilter } : {};
    if (!isSuperadmin && companyId) {
      if (incidentFilter.$and) incidentFilter.$and.push({ company: companyId });
      else incidentFilter.company = companyId;
    }

    // --- Run all independent DB queries in parallel (was ~20 sequential round-trips) ---
    const [
      activeLoads,
      totalTrucks,
      vehiclesOnlineCount,
      activeDriversWithStatus,
      allDriversCount,
      pendingTasks,
      fleetUnits,
      totalVehicleDocs,
      expiredVehicleDocs,
      totalCertificates,
      expiredCertificates,
      totalPolicies,
      expiredPolicies,
      monthlyInvoicesByPaymentDate,
      pendingInvoicesThisMonth,
      openIncidents,
      maintenanceOrdersCount,
      activeOrders,
      trucks,
      recentTrips,
    ] = await Promise.all([
      Order.countDocuments({ ...orderFilter, status: { $in: ['planned', 'in-delivery'] } }),
      FleetUnit.countDocuments({ ...fleetFilter, unitType: 'Truck', status: 'Active' }),
      FleetUnit.countDocuments({ ...fleetFilter, unitType: 'Truck', status: 'Active', operationStatus: { $in: ['in-transit', 'idle', 'available'] } }),
      User.countDocuments({ ...userFilter, role: 'driver', status: 'active' }),
      User.countDocuments({ ...userFilter, role: 'driver' }),
      WorkOrder.countDocuments({ ...workOrderFilter, status: { $in: ['pending', 'inprogress', 'in-progress'] } }),
      FleetUnit.find({ ...fleetFilter }).select('upcomingServices').lean(),
      VehicleDocuments.countDocuments({ ...fleetFilter }),
      VehicleDocuments.countDocuments({ ...fleetFilter, expiryDate: { $lt: new Date() } }),
      Certificate.countDocuments(certificateFilter),
      Certificate.countDocuments({ ...certificateFilter, expiryDate: { $lt: new Date() } }),
      PolicyDocument.countDocuments(policyFilter),
      PolicyDocument.countDocuments({ ...policyFilter, reviewDate: { $lt: new Date() }, status: { $in: ['active', 'expiring'] } }),
      Invoice.find({ ...invoiceFilter, status: 'paid', paymentDate: { $gte: startOfMonth, $ne: null } }).select('amount subtotal taxAmount').lean(),
      Invoice.find({ ...invoiceFilter, status: 'pending', invoiceDate: { $gte: startOfMonth } }).select('amount subtotal taxAmount').lean(),
      Incident.countDocuments({ ...incidentFilter, status: { $in: ['open', 'investigating', 'action-required'] } }),
      GeneralRepair.countDocuments(generalRepairFilter),
      Order.find({ ...orderFilter, status: { $in: ['planned', 'in-delivery'] } })
        .populate('driver', 'name email phone')
        .populate({
          path: 'truck',
          select: 'unitNo licensePlate makeModel internalId unitType currentLocation operationStatus yard',
          populate: { path: 'yard', select: 'yardName yardCode address city stateProvince coordinates', model: 'Yard' }
        })
        .populate('trailer', 'unitNo licensePlate makeModel unitType')
        .populate('customer', 'name email phone')
        .populate({ path: 'pickupLocation.placeId', select: 'name city state currentLocation', model: 'Place' })
        .populate({ path: 'deliveryLocation.placeId', select: 'name city state currentLocation', model: 'Place' })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      FleetUnit.find({ ...fleetFilter, unitType: 'Truck', status: 'Active' })
        .select('unitNo licensePlate makeModel internalId currentLocation operationStatus')
        .lean(),
      Order.find({ company: companyId }).sort({ createdAt: -1 }).limit(5)
        .select('tripNo status deliveryLocation createdAt driverAcceptanceStatus customerOrderNo')
        .populate({ path: 'driver', select: 'name' }),
    ]);

    const totalActiveOrders = activeLoads;

    // Vehicles online: fallback to totalTrucks if no trucks found with operational statuses
    let vehiclesOnline = vehiclesOnlineCount;
    if (vehiclesOnline === 0 && totalTrucks > 0) vehiclesOnline = totalTrucks;

    // Active drivers: use status='active' count first, then fall back to all drivers
    let activeDrivers = activeDriversWithStatus;
    if (activeDrivers === 0) activeDrivers = allDriversCount;

    // Monthly invoices: fallback to invoiceDate if no paymentDate results
    let monthlyInvoices = monthlyInvoicesByPaymentDate;
    if (monthlyInvoices.length === 0) {
      monthlyInvoices = await Invoice.find({
        ...invoiceFilter, status: 'paid', invoiceDate: { $gte: startOfMonth }
      }).select('amount subtotal taxAmount').lean();
    }

    // Maintenance count from fleet units
    let pendingMaintenance = 0;
    fleetUnits.forEach(unit => {
      (unit.upcomingServices || []).forEach(service => {
        if (service.status === 'overdue' || service.status === 'upcoming') pendingMaintenance++;
      });
    });

    // Compliance rate
    const totalComplianceItems = totalVehicleDocs + totalCertificates + totalPolicies;
    const expiredComplianceItems = expiredVehicleDocs + expiredCertificates + expiredPolicies;
    const complianceRate = totalComplianceItems > 0
      ? Math.max(0, Math.round(((totalComplianceItems - expiredComplianceItems) / totalComplianceItems) * 100))
      : 0;

    // Revenue from paid invoices
    const calcRevenue = (invoices) => invoices.reduce((sum, inv) => {
      let amount = 0;
      if (inv.subtotal !== undefined && inv.taxAmount !== undefined) {
        amount = (inv.subtotal || 0) + (inv.taxAmount || 0);
      } else {
        amount = typeof inv.amount === 'string' ? parseFloat(inv.amount) : (inv.amount || 0);
      }
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
    const monthlyRevenue = calcRevenue(monthlyInvoices);

    // Try to get yard information from Vehicle model for trucks that don't have current location
    const { Vehicle } = await import("../../models/driver/vehicleModel.js");
    const trucksWithYard = await Promise.all(trucks.map(async (truck) => {
      // Check if truck has current location
      const hasCurrentLocation = truck.currentLocation &&
        truck.currentLocation.latitude &&
        truck.currentLocation.longitude &&
        parseFloat(truck.currentLocation.latitude) !== 0 &&
        parseFloat(truck.currentLocation.longitude) !== 0;

      // If no current location, try to find matching Vehicle and get its yard
      if (!hasCurrentLocation) {
        const vehicleQuery = {
          $or: [
            { unitNumber: truck.unitNo },
            { licensePlate: truck.licensePlate },
            { internalId: truck.internalId }
          ]
        };

        // MANDATORY: Add company filter for non-superadmin - no exceptions
        if (!isSuperadmin) {
          if (!hasValidCompany) {
            // Skip this vehicle if admin has no company
            return truck;
          }
          vehicleQuery.company = companyId;
        }

        const vehicle = await Vehicle.findOne(vehicleQuery)
          .populate('yard', 'yardName yardCode address city stateProvince coordinates')
          .lean();

        if (vehicle && vehicle.yard) {
          return { ...truck, yard: vehicle.yard };
        }
      }

      return truck;
    }));

    // Format orders for frontend (treating each order as a "trip" for compatibility)
    const formattedTrips = activeOrders.map(order => {
      const driver = order.driver ? {
        name: order.driver.name || 'Unknown',
        email: order.driver.email || '',
        phone: order.driver.phone || ''
      } : null;

      const truck = order.truck ? {
        id: order.truck._id?.toString() || '',
        unitNo: order.truck.unitNo || '',
        licensePlate: order.truck.licensePlate || '',
        makeModel: order.truck.makeModel || '',
        internalId: order.truck.internalId || '',
        operationStatus: order.truck.operationStatus || 'available',
        currentLocation: order.truck.currentLocation || null,
        yard: order.truck.yard ? {
          yardName: order.truck.yard.yardName || '',
          yardCode: order.truck.yard.yardCode || '',
          address: order.truck.yard.address || '',
          city: order.truck.yard.city || '',
          stateProvince: order.truck.yard.stateProvince || '',
          coordinates: order.truck.yard.coordinates || null
        } : null
      } : null;

      // Get route information from order pickup and delivery locations
      let origin = 'Unknown';
      let destination = 'Unknown';
      let originLat = null;
      let originLng = null;
      let destLat = null;
      let destLng = null;
      let routeWaypoints = [];
      let routeSummary = '';

      // Handle pickup location
      if (order.pickupLocation) {
        let placeName = order.pickupLocation.place || '';
        let lat = order.pickupLocation.latitude ? parseFloat(order.pickupLocation.latitude) : null;
        let lng = order.pickupLocation.longitude ? parseFloat(order.pickupLocation.longitude) : null;

        // If place name is empty, try to get from populated placeId
        if (!placeName && order.pickupLocation.placeId && typeof order.pickupLocation.placeId === 'object') {
          const pickupPlace = order.pickupLocation.placeId;
          const parts = [];
          if (pickupPlace.name) parts.push(pickupPlace.name);
          if (pickupPlace.city) parts.push(pickupPlace.city);
          if (pickupPlace.state) parts.push(pickupPlace.state);
          placeName = parts.join(', ') || pickupPlace.name || '';

          // Get coordinates from populated place if not already set
          if (!lat && pickupPlace.currentLocation && pickupPlace.currentLocation.latitude) {
            lat = parseFloat(pickupPlace.currentLocation.latitude);
          }
          if (!lng && pickupPlace.currentLocation && pickupPlace.currentLocation.longitude) {
            lng = parseFloat(pickupPlace.currentLocation.longitude);
          }
        }

        if (placeName && placeName.trim() !== '') {
          origin = placeName.trim();
          originLat = lat;
          originLng = lng;
          routeWaypoints.push({
            place: origin,
            latitude: originLat,
            longitude: originLng,
            type: 'pickup',
            orderId: order._id?.toString() || null
          });
        }
      }

      // Handle delivery location
      if (order.deliveryLocation) {
        let placeName = order.deliveryLocation.place || '';
        let lat = order.deliveryLocation.latitude ? parseFloat(order.deliveryLocation.latitude) : null;
        let lng = order.deliveryLocation.longitude ? parseFloat(order.deliveryLocation.longitude) : null;

        // If place name is empty, try to get from populated placeId
        if (!placeName && order.deliveryLocation.placeId && typeof order.deliveryLocation.placeId === 'object') {
          const deliveryPlace = order.deliveryLocation.placeId;
          const parts = [];
          if (deliveryPlace.name) parts.push(deliveryPlace.name);
          if (deliveryPlace.city) parts.push(deliveryPlace.city);
          if (deliveryPlace.state) parts.push(deliveryPlace.state);
          placeName = parts.join(', ') || deliveryPlace.name || '';

          // Get coordinates from populated place if not already set
          if (!lat && deliveryPlace.currentLocation && deliveryPlace.currentLocation.latitude) {
            lat = parseFloat(deliveryPlace.currentLocation.latitude);
          }
          if (!lng && deliveryPlace.currentLocation && deliveryPlace.currentLocation.longitude) {
            lng = parseFloat(deliveryPlace.currentLocation.longitude);
          }
        }

        if (placeName && placeName.trim() !== '') {
          destination = placeName.trim();
          destLat = lat;
          destLng = lng;
          routeWaypoints.push({
            place: destination,
            latitude: destLat,
            longitude: destLng,
            type: 'delivery',
            orderId: order._id?.toString() || null
          });
        }
      }

      // Build route summary
      if (routeWaypoints.length > 0) {
        routeSummary = routeWaypoints.map(wp => wp.place).join(' → ');
      } else if (origin !== 'Unknown' && destination !== 'Unknown') {
        routeSummary = `${origin} → ${destination}`;
      }

      // Calculate ETA (placeholder - can be enhanced)
      const eta = 'Calculating...';

      return {
        id: order._id?.toString() || '',
        tripNumber: order.orderNumber || '',
        origin,
        destination,
        originLat,
        originLng,
        destLat,
        destLng,
        driver: driver?.name || 'Unassigned',
        driverInfo: driver,
        truck: truck?.licensePlate || truck?.unitNo || 'No Truck',
        truckInfo: truck,
        status: order.status || 'Unknown',
        eta,
        // Use truck's current location if available, otherwise use yard location, otherwise use origin
        currentLat: truck?.currentLocation?.latitude ? parseFloat(truck.currentLocation.latitude) :
          (truck?.yard?.coordinates?.latitude ? parseFloat(truck.yard.coordinates.latitude) : originLat),
        currentLng: truck?.currentLocation?.longitude ? parseFloat(truck.currentLocation.longitude) :
          (truck?.yard?.coordinates?.longitude ? parseFloat(truck.yard.coordinates.longitude) : originLng),
        // Route information
        route: {
          waypoints: routeWaypoints,
          summary: routeSummary,
          totalDistance: 0,
          estimatedDuration: 0
        }
      };
    });

    // Format trucks for map (include trucks with current location OR yard location)
    const formattedTrucks = trucksWithYard
      .filter(truck => {
        // Check if truck has current location
        const hasCurrentLocation = truck.currentLocation &&
          truck.currentLocation.latitude &&
          truck.currentLocation.longitude &&
          parseFloat(truck.currentLocation.latitude) !== 0 &&
          parseFloat(truck.currentLocation.longitude) !== 0;

        // Check if truck has yard with coordinates
        const hasYardLocation = truck.yard &&
          truck.yard.coordinates &&
          truck.yard.coordinates.latitude &&
          truck.yard.coordinates.longitude;

        return hasCurrentLocation || hasYardLocation;
      })
      .map(truck => {
        // Prefer current location, fallback to yard location
        const hasCurrentLocation = truck.currentLocation &&
          truck.currentLocation.latitude &&
          truck.currentLocation.longitude &&
          parseFloat(truck.currentLocation.latitude) !== 0 &&
          parseFloat(truck.currentLocation.longitude) !== 0;

        const useYardLocation = !hasCurrentLocation && truck.yard &&
          truck.yard.coordinates &&
          truck.yard.coordinates.latitude &&
          truck.yard.coordinates.longitude;

        return {
          id: truck._id?.toString() || '',
          unitNo: truck.unitNo || '',
          licensePlate: truck.licensePlate || '',
          makeModel: truck.makeModel || '',
          internalId: truck.internalId || '',
          operationStatus: truck.operationStatus || 'available',
          latitude: hasCurrentLocation ? parseFloat(truck.currentLocation.latitude) :
            (useYardLocation ? parseFloat(truck.yard.coordinates.latitude) : 0),
          longitude: hasCurrentLocation ? parseFloat(truck.currentLocation.longitude) :
            (useYardLocation ? parseFloat(truck.yard.coordinates.longitude) : 0),
          address: hasCurrentLocation ? (truck.currentLocation.address || '') :
            (useYardLocation ? `${truck.yard.yardName || 'Yard'} - ${truck.yard.address || ''}, ${truck.yard.city || ''}, ${truck.yard.stateProvince || ''}` : ''),
          updatedAt: hasCurrentLocation ? (truck.currentLocation.updatedAt || new Date()) : new Date(),
          isYardLocation: useYardLocation,
          yard: useYardLocation ? {
            yardName: truck.yard.yardName || '',
            yardCode: truck.yard.yardCode || ''
          } : null
        };
      });

    // Debug logging for results
    console.log('📊 Dashboard Stats:', {
      companyId: companyId?.toString(),
      isSuperadmin,
      activeLoads: totalActiveOrders,
      vehiclesOnline,
      totalTrucks,
      activeDrivers,
      pendingTasks,
      pendingMaintenance,
      complianceRate,
      monthlyRevenue,
      openIncidents,
      ordersCount: formattedTrips.length,
      trucksCount: formattedTrucks.length,
      orderFilter: JSON.stringify(orderFilter),
      fleetFilter: JSON.stringify(fleetFilter),
      userFilter: JSON.stringify(userFilter)
    });

    // Ensure all stats are numbers (not undefined or null)
    const finalStats = {
      activeLoads: Number(totalActiveOrders) || 0,
      vehiclesOnline: Number(vehiclesOnline || totalTrucks) || 0,
      activeDrivers: Number(activeDrivers) || 0,
      pendingTasks: Number(pendingTasks + pendingMaintenance) || 0,
      complianceRate: Number(complianceRate) || 0,
      monthlyRevenue: Number(Math.round(monthlyRevenue * 100) / 100) || 0,
      openIncidents: Number(openIncidents) || 0,
      maintenanceOrdersCount: Number(maintenanceOrdersCount) || 0
    };

    return res.json({
      success: true,
      data: {
        stats: finalStats,
        trips: formattedTrips,
        trucks: formattedTrucks,
        recentTrips: recentTrips
      }
    });

  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching dashboard data',
      data: null
    });
  }
};
