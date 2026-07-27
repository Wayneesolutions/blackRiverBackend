// controllers/complianceController.js
import mongoose from "mongoose";
import VehicleDocuments from "../../models/driver/vehicleDocumentsModel.js";
import { EmployeeDocument } from "../../models/driver/employeeDocumentModel.js";
import { CvsaInspection } from "../../models/cvsaInspectionModel.js";
import CarrierPerformance from "../../models/compliance/carrierPerformanceModel.js";
import { Ticket } from "../../models/ticketModel.js";
import { Incident } from "../../models/incidentModel.js";
import { Vehicle } from "../../models/driver/vehicleModel.js";
import { FleetUnit } from "../../models/fleet/fleetUnitModel.js";
import { User } from "../../models/driver/userModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { RegulatorySafety } from "../../models/fleet/regulatorySafetyModel.js";
import { GeneralRepair } from "../../models/fleet/generalRepairModel.js";
import { VehicleService } from "../../models/driver/vehicleService.js";
import { Trailer } from "../../models/driver/trailerModel.js";
import { CompanySettings } from "../../models/driver/companysettingsModel.js";
import { updateGeneralRepair, deleteGeneralRepair } from "../fleet/generalRepairController.js";
import { updateVehicleService, deleteVehicleService } from "../vehicleService/vehicleServiceController.js";
import { updateRegulatorySafetyRecord, deleteRegulatorySafetyRecord } from "../fleet/regulatorySafetyController.js";
import { extractCarrierProfileData } from "../../services/openaiService.js";
import fs from "fs";

// Helper function to convert service name to kebab-case (matching frontend logic)
const nameToServiceType = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Helper to convert serviceType (kebab-case) back to original service name
const serviceTypeToName = (serviceType, customServices) => {
  if (!serviceType) return 'Unknown Service';
  
  // Normalize the serviceType for comparison (lowercase, trim)
  const normalizedServiceType = serviceType.toLowerCase().trim();
  
  // First check if it matches any custom service name (converted to kebab-case)
  for (const customService of customServices) {
    const customServiceType = nameToServiceType(customService.name);
    if (customServiceType === normalizedServiceType) {
      // Return the original custom service name (preserve original casing)
      return customService.name.trim();
    }
  }
  
  // If not found in custom services, return the serviceType with proper formatting
  return serviceType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const normalizeToObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === "object" && value._id) {
    return normalizeToObjectId(value._id);
  }
  if (typeof value === "string" && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return null;
};

const applyCompanyFilter = (target, companyId) => {
  if (!companyId) return;
  const normalized = normalizeToObjectId(companyId);
  target.company = normalized ? { $in: [normalized, companyId] } : companyId;
};

// Helper function to extract real ID from prefixed IDs (e.g., "custom-123" -> "123")
const extractRealId = (prefixedId) => {
  if (!prefixedId) return null;
  
  // Check if it's a prefixed ID
  if (prefixedId.startsWith("custom-")) {
    return prefixedId.replace("custom-", "");
  }
  if (prefixedId.startsWith("vehicle-")) {
    return prefixedId.replace("vehicle-", "");
  }
  if (prefixedId.startsWith("trailer-")) {
    return prefixedId.replace("trailer-", "");
  }
  
  // Return as-is if not prefixed
  return prefixedId;
};

// Helper function to check if an ID is a valid ObjectId
const isValidObjectId = (id) => {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id);
};

// Helper function to find vehicle or trailer (Vehicle/Trailer models) by ID
const findVehicleById = async (vehicleId) => {
  // Extract real ID if prefixed
  const realId = extractRealId(vehicleId);
  
  // Find Vehicle first
  let unitDoc = null;
  
  // Try Vehicle by ObjectId first
  if (isValidObjectId(realId)) {
    unitDoc = await Vehicle.findById(new mongoose.Types.ObjectId(realId));
  }
  
  // If not found, try Trailer by ObjectId
  if (!unitDoc && isValidObjectId(realId)) {
    unitDoc = await Trailer.findById(new mongoose.Types.ObjectId(realId));
  }
  
  // If not found by ObjectId, try by identifiers (Vehicle first)
  if (!unitDoc && realId) {
    unitDoc = await Vehicle.findOne({
      $or: [
        { unitNumber: realId },
        { internalId: realId },
        { plateNumber: realId }
      ]
    });
  }
  
  // If still not found, try Trailer by identifiers
  if (!unitDoc && realId) {
    unitDoc = await Trailer.findOne({
      $or: [
        { unitNumber: realId },
        { trailer: realId },
        { internalId: realId }
      ]
    });
  }
  
  return unitDoc;
};

// Helper function to populate vehicle/trailer info from Vehicle/Trailer models
const populateVehicleInfo = async (vehicleId) => {
  if (!vehicleId) return null;
  
  // Convert vehicle to string if it's an ObjectId (from .lean())
  let vehicleIdStr = vehicleId;
  if (vehicleId && typeof vehicleId === 'object' && vehicleId.toString) {
    vehicleIdStr = vehicleId.toString();
  } else {
    vehicleIdStr = String(vehicleId || '');
  }
  
  let unitDoc = null;
  let unitType = 'Truck';
  
  // Try Vehicle by _id first (most common case)
  if (isValidObjectId(vehicleIdStr)) {
    try {
      unitDoc = await Vehicle.findById(new mongoose.Types.ObjectId(vehicleIdStr))
        .select("plateNumber vinNumber unitNumber internalId make model year")
        .lean();
      if (unitDoc) {
        unitType = 'Truck';
      }
    } catch (err) {
      console.error(`Error finding Vehicle by _id ${vehicleIdStr}:`, err.message);
    }
  }
  
  // If not found, try Trailer by _id
  if (!unitDoc && isValidObjectId(vehicleIdStr)) {
    try {
      unitDoc = await Trailer.findById(new mongoose.Types.ObjectId(vehicleIdStr))
        .select("plateNumber vinNumber unitNumber trailer internalId make model")
        .lean();
      if (unitDoc) {
        unitType = 'Trailer';
      }
    } catch (err) {
      console.error(`Error finding Trailer by _id ${vehicleIdStr}:`, err.message);
    }
  }
  
  // If not found by _id, try by other identifiers (Vehicle first)
  if (!unitDoc && vehicleIdStr) {
    try {
      unitDoc = await Vehicle.findOne({
        $or: [
          { unitNumber: vehicleIdStr },
          { internalId: vehicleIdStr },
          { plateNumber: vehicleIdStr }
        ]
      })
      .select("plateNumber vinNumber unitNumber internalId make model year")
      .lean();
      if (unitDoc) {
        unitType = 'Truck';
      }
    } catch (err) {
      console.error(`Error finding Vehicle by identifier ${vehicleIdStr}:`, err.message);
    }
  }
  
  // If still not found, try Trailer by identifiers
  if (!unitDoc && vehicleIdStr) {
    try {
      unitDoc = await Trailer.findOne({
        $or: [
          { unitNumber: vehicleIdStr },
          { trailer: vehicleIdStr },
          { internalId: vehicleIdStr }
        ]
      })
      .select("plateNumber vinNumber unitNumber trailer internalId make model")
      .lean();
      if (unitDoc) {
        unitType = 'Trailer';
      }
    } catch (err) {
      console.error(`Error finding Trailer by identifier ${vehicleIdStr}:`, err.message);
    }
  }
  
  if (!unitDoc) {
    console.warn(`Vehicle/Trailer not found, vehicleId: ${vehicleIdStr}`);
    return null;
  }
  
  // Extract make and model
  const make = unitDoc.make || '';
  const model = unitDoc.model || '';
  const displayName = [make, model].filter(Boolean).join(' ').trim();
  const identifier = unitDoc.plateNumber || unitDoc.unitNumber || (unitType === 'Trailer' ? unitDoc.trailer : null) || unitDoc.internalId || 'N/A';
  
  // Map to consistent format
  const vehicleInfo = {
    _id: unitDoc._id,
    plateNumber: unitDoc.plateNumber || identifier,
    vinNumber: unitDoc.vinNumber || 'N/A',
    make: make || (displayName ? displayName.split(' ')[0] : ''),
    model: model || (displayName ? displayName.split(' ').slice(1).join(' ') : ''),
    internalId: unitDoc.internalId || unitDoc.unitNumber || (unitType === 'Trailer' ? unitDoc.trailer : null) || 'N/A',
    year: unitDoc.year || null,
    unitType: unitType
  };
  
  // Ensure we don't show empty values - use unitNumber as fallback
  if ((!vehicleInfo.make && !vehicleInfo.model)) {
    vehicleInfo.make = unitDoc.unitNumber || (unitType === 'Trailer' ? unitDoc.trailer : null) || identifier || 'Vehicle';
    vehicleInfo.model = '';
  }
  
  return vehicleInfo;
};

// ✅ Compliance Summary (Vehicles + Drivers)
export const getComplianceSummary = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: {
          vehicles: { total: 0, valid: 0, expired: 0, expiringSoon: 0, complianceRate: 0 },
          drivers: { total: 0, valid: 0, expired: 0, expiringSoon: 0, complianceRate: 0 }
        }
      });
    }

    const vehicleDocFilter = {
      ignoreExpiration: { $ne: true } // Exclude documents with ignoreExpiration: true
    };
    if (!isSuperadmin && companyId) {
      applyCompanyFilter(vehicleDocFilter, companyId);
    }

    // --- VEHICLE DOCUMENTS ---
    const totalVehiclesDocs = await VehicleDocuments.countDocuments(vehicleDocFilter);
    const validVehicleDocs = await VehicleDocuments.countDocuments({ ...vehicleDocFilter, status: "completed" });
    const expiredVehicleDocs = await VehicleDocuments.countDocuments({ ...vehicleDocFilter, status: "expired" });
    const expiringSoonVehicleDocs = await VehicleDocuments.countDocuments({ ...vehicleDocFilter, status: "expiring-soon" });

    const vehicleCompliance = {
      total: totalVehiclesDocs,
      valid: validVehicleDocs,
      expired: expiredVehicleDocs,
      expiringSoon: expiringSoonVehicleDocs,
      complianceRate: totalVehiclesDocs > 0 ? Math.round((validVehicleDocs / totalVehiclesDocs) * 100) : 0,
    };

    const driverDocFilter = {};
    if (!isSuperadmin && companyId) {
      applyCompanyFilter(driverDocFilter, companyId);
    }

    // --- EMPLOYEE DOCUMENTS (INCLUDING DRIVERS) ---
    const totalDriverDocs = await EmployeeDocument.countDocuments(driverDocFilter);
    const validDriverDocs = await EmployeeDocument.countDocuments({ ...driverDocFilter, status: "valid" });
    const expiredDriverDocs = await EmployeeDocument.countDocuments({ ...driverDocFilter, status: "expired" });
    const expiringSoonDriverDocs = await EmployeeDocument.countDocuments({ ...driverDocFilter, status: "expiring-soon" });

    const driverCompliance = {
      total: totalDriverDocs,
      valid: validDriverDocs,
      expired: expiredDriverDocs,
      expiringSoon: expiringSoonDriverDocs,
      complianceRate: totalDriverDocs > 0 ? Math.round((validDriverDocs / totalDriverDocs) * 100) : 0,
    };

    res.json({
      success: true,
      message: "Compliance summary fetched",
      data: {
        vehicles: vehicleCompliance,
        drivers: driverCompliance,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getComplianceDashboardData = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === "superadmin";

    if (!isSuperadmin && !companyId) {
      return res.status(200).json({
        success: true,
        requiresCompanySetup: true,
        data: {
          fleetOperational: {
            activeTrucks: 0,
            outOfServiceTrucks: 0,
            vehiclesUnderRepair: 0,
            vehiclesWithPendingService: 0
          },
          safetyAlerts: [],
          pmStatus: [],
          invoiceSummary: {
            month: { total: 0, byType: { scheduled: 0, general: 0, safety: 0 }, count: 0 },
            ytd: { total: 0, byType: { scheduled: 0, general: 0, safety: 0 }, count: 0 }
          },
          inactiveUnits: 0,
          complianceDocuments: []
        }
      });
    }

    const filter = {};
    const companyFilter = companyId ? { company: companyId } : null;
    if (!isSuperadmin && companyFilter) {
      filter.company = companyId;
    }

    const safetyFilter = companyFilter ? { company: companyId } : {};
    const repairsFilter = companyFilter ? { company: companyId } : {};
    const serviceFilter = companyFilter ? { company: companyId } : {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const safetyRecordQuery = {
      ...safetyFilter,
      safetyExpiryDate: { $lte: thirtyDaysFromNow }
    };

    // Fetch company custom services
    let companySettings = null;
    if (companyId) {
      companySettings = await CompanySettings.findById(companyId).lean();
    } else if (isSuperadmin) {
      // For superadmin, try to get company settings from the first company or from vehicles
      // If vehicles exist, use the first vehicle's company
      const firstVehicle = await Vehicle.findOne({}).lean();
      if (firstVehicle?.company) {
        companySettings = await CompanySettings.findById(firstVehicle.company).lean();
      }
    }
    const customServices = companySettings?.maintenancePolicies?.customServices || [];
    
    // Debug logging (can be removed in production)
    console.log('Compliance Dashboard - Company ID:', companyId);
    console.log('Compliance Dashboard - Custom Services Count:', customServices.length);

    const [safetyRecords, generalRepairs, vehicleServices, pendingServices, vehicles, trailers] = await Promise.all([
      RegulatorySafety.find(safetyRecordQuery).lean(),
      GeneralRepair.find(repairsFilter).lean(),
      VehicleService.find({ ...serviceFilter, status: 'completed' }).lean(), // Only completed services
      VehicleService.find({ ...serviceFilter, status: 'pending' }).lean(), // Pending services for dashboard cards
      Vehicle.find(filter).lean(),
      Trailer.find(filter).lean()
    ]);

    const safetyAlerts = safetyRecords
      .map((record) => {
        console.log('record =====',record);
        const daysUntilExpiry = Math.ceil((record.safetyExpiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const status = daysUntilExpiry < 0 ? "expired" : "warning";
        return {
          unitNo: record.unitNo,
          makeModel: record.makeModel,
          safetyExpiry: record.safetyExpiryDate,
          daysUntilExpiry,
          status
        };
      })
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    // Group completed services by unit number
    const servicesByUnit = vehicleServices.reduce((acc, service) => {
      if (!service.unitNumber || !service.serviceType) return acc;
      const list = acc.get(service.unitNumber) || [];
      list.push(service);
      acc.set(service.unitNumber, list);
      return acc;
    }, new Map());

    // Helper function to calculate next services for a unit
    const calculateNextServicesForUnit = (unit, unitType, unitNumber, currentOdometer, trailerType = null) => {
      if (customServices.length === 0) {
        return { nextServices: [], overdueCount: 0, dueCount: 0 };
      }

      const unitServices = servicesByUnit.get(unitNumber) || [];
      const nextServices = [];
      const todayDate = new Date(today); // Use today from outer scope

      for (const customService of customServices) {
        // Check if service applies to this unit type
        let interval, intervalUnit;
        if (unitType === 'truck') {
          interval = customService.truck.value;
          intervalUnit = customService.truck.unit;
        } else {
          // Trailer - check if excluded
          if (trailerType) {
            const normalizedTrailerType = trailerType.toLowerCase().replace(/[^a-z]/g, '');
            const excludeTypes = (customService.excludeTypes || []).map(t => {
              const normalized = t.toLowerCase().replace(/[^a-z]/g, '');
              // Map common abbreviations
              if (normalized === 'reefer' || normalized === 'rf') return 'reefer';
              if (normalized === 'dryvan' || normalized === 'dv' || normalized === 'dryvan') return 'dryvan';
              if (normalized === 'flatbed' || normalized === 'fb') return 'flatbed';
              return normalized;
            });
            
            // Check if trailer type matches any exclusion
            const isExcluded = excludeTypes.some(excluded => {
              if (normalizedTrailerType.includes(excluded) || excluded.includes(normalizedTrailerType)) {
                return true;
              }
              // Handle abbreviations
              if ((normalizedTrailerType === 'rf' || normalizedTrailerType === 'reefer') && excluded === 'reefer') return true;
              if ((normalizedTrailerType === 'dv' || normalizedTrailerType === 'dryvan') && excluded === 'dryvan') return true;
              if ((normalizedTrailerType === 'fb' || normalizedTrailerType === 'flatbed') && excluded === 'flatbed') return true;
              return false;
            });
            
            if (isExcluded) {
              continue; // Skip this service for excluded trailer types
            }
          }
          interval = customService.trailer.value;
          intervalUnit = customService.trailer.unit;
        }

        // Convert service name to kebab-case for matching
        const serviceTypeKey = nameToServiceType(customService.name);

        // Find last completed service for this service type
        const lastService = unitServices
          .filter(s => nameToServiceType(s.serviceType) === serviceTypeKey)
          .sort((a, b) => {
            // Sort by serviceDate first, then odometer
            const dateA = a.serviceDate ? new Date(a.serviceDate) : new Date(0);
            const dateB = b.serviceDate ? new Date(b.serviceDate) : new Date(0);
            if (dateB.getTime() !== dateA.getTime()) {
              return dateB.getTime() - dateA.getTime();
            }
            return (b.odometer || 0) - (a.odometer || 0);
          })[0];

        // Calculate next due based on interval unit
        let kmRemaining, dueAt, status, dueDate = null;

        if (lastService) {
          // Unit has service history - calculate next due date based on last service
          if (intervalUnit === 'days') {
            const lastServiceDate = lastService.serviceDate ? new Date(lastService.serviceDate) : new Date();
            const nextDueDate = new Date(lastServiceDate);
            nextDueDate.setDate(nextDueDate.getDate() + interval);
            const daysRemaining = Math.ceil((nextDueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
            
            // Convert to approximate km (assume 100 km/day average for sorting)
            kmRemaining = daysRemaining * 100;
            dueAt = nextDueDate.getTime(); // Use timestamp for sorting
            dueDate = nextDueDate.toISOString().split('T')[0];
            
            status = daysRemaining < 0 ? "overdue" : daysRemaining <= 7 ? "due" : "ok";
          } else {
            // miles or km
            const lastOdometer = lastService.odometer || 0;
            let intervalKm = interval;
            if (intervalUnit === 'miles') {
              intervalKm = interval * 1.60934; // Convert miles to km
            }
            
            dueAt = lastOdometer + intervalKm;
            kmRemaining = dueAt - currentOdometer;
            
            status = kmRemaining < 0 ? "overdue" : kmRemaining <= 5000 ? "due" : "ok";
          }
        } else {
          // No service history - calculate first service due date from current odometer/today
          if (intervalUnit === 'days') {
            // First service due in X days from today
            const nextDueDate = new Date(todayDate);
            nextDueDate.setDate(nextDueDate.getDate() + interval);
            const daysRemaining = Math.ceil((nextDueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
            
            kmRemaining = daysRemaining * 100;
            dueAt = nextDueDate.getTime();
            dueDate = nextDueDate.toISOString().split('T')[0];
            
            status = daysRemaining <= 7 ? "due" : "ok";
          } else {
            // miles or km - first service due at current odometer + interval
            let intervalKm = interval;
            if (intervalUnit === 'miles') {
              intervalKm = interval * 1.60934; // Convert miles to km
            }
            
            dueAt = currentOdometer + intervalKm;
            kmRemaining = intervalKm; // Full interval remaining
            
            status = kmRemaining <= 5000 ? "due" : "ok";
          }
        }

        nextServices.push({
          type: customService.name, // Use original name for display
          dueAt: dueAt,
          kmRemaining: Math.round(kmRemaining),
          status: status,
          dueDate: dueDate
        });
      }

      const overdueCount = nextServices.filter(s => s.status === "overdue").length;
      const dueCount = nextServices.filter(s => s.status === "due").length;

      return { nextServices, overdueCount, dueCount };
    };

    // Process trucks
    const truckPmStatus = vehicles
      .filter((vehicle) => vehicle.status !== "inactive")
      .map((vehicle) => {
        const unitNumber = vehicle.internalId || vehicle.unitNumber || vehicle.plateNumber;
        const currentOdometer = vehicle.odometer || 0;
        const { nextServices, overdueCount, dueCount } = calculateNextServicesForUnit(
          vehicle,
          'truck',
          unitNumber,
          currentOdometer
        );

        return {
          unitNo: unitNumber,
          unitType: 'Truck',
          makeModel: [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim() || 'N/A',
          currentOdometer: currentOdometer,
          nextServices,
          overdueCount,
          dueCount
        };
      });

    // Process trailers
    const trailerPmStatus = trailers
      .filter((trailer) => trailer.status !== "inactive" && trailer.status !== "Out of Service")
      .map((trailer) => {
        const unitNumber = trailer.trailer || trailer.plateNumber || trailer.unitNumber;
        
        // Get current odometer: use attached truck's odometer if available
        let currentOdometer = 0;
        if (trailer.isAttached && trailer.attachedVehicle) {
          const attachedTruck = vehicles.find(v => 
            v._id?.toString() === trailer.attachedVehicle?.toString()
          );
          currentOdometer = attachedTruck?.odometer || 0;
        }
        
        // Fallback to last service odometer
        if (currentOdometer === 0) {
          const lastService = vehicleServices
            .filter(s => s.unitNumber === unitNumber)
            .sort((a, b) => (b.odometer || 0) - (a.odometer || 0))[0];
          currentOdometer = lastService?.odometer || 0;
        }

        const { nextServices, overdueCount, dueCount } = calculateNextServicesForUnit(
          trailer,
          'trailer',
          unitNumber,
          currentOdometer,
          trailer.type
        );

        return {
          unitNo: unitNumber,
          unitType: 'Trailer',
          makeModel: [trailer.make, trailer.model].filter(Boolean).join(" ").trim() || 'N/A',
          currentOdometer: currentOdometer,
          nextServices,
          overdueCount,
          dueCount
        };
      });

    // Combine trucks and trailers
    // Only include units if custom services are configured
    const pmStatus = [...truckPmStatus, ...trailerPmStatus]
      .filter(unit => {
        // Only show units if custom services are configured
        // If customServices is empty, don't show any units
        if (customServices.length === 0) return false;
        
        // Show all active units (they will have nextServices calculated even without history)
        return true;
      });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const invoices = [
      ...generalRepairs.map((repair) => ({
        amount: Number(repair.cost || 0),
        type: "general",
        date: repair.serviceDate
      })),
      ...vehicleServices.map((service) => ({
        amount: Number(service.estimatedCost || 0),
        type: "scheduled",
        date: service.serviceDate
      })),
      ...safetyRecords.map((record) => ({
        amount: Number(record.invoiceAmount || 0),
        type: "safety",
        date: record.safetyExpiryDate
      }))
    ];

    const summarizeInvoices = (fromDate) => {
      const filtered = invoices.filter((inv) => inv.date && new Date(inv.date) >= fromDate);
      const total = filtered.reduce((sum, inv) => sum + (inv.amount || 0), 0);
      const byType = filtered.reduce(
        (acc, inv) => {
          acc[inv.type] += inv.amount || 0;
          return acc;
        },
        { scheduled: 0, general: 0, safety: 0 }
      );
      return { total, byType, count: filtered.length };
    };

    const invoiceSummary = {
      month: summarizeInvoices(startOfMonth),
      ytd: summarizeInvoices(startOfYear)
    };

    const inactiveUnits = vehicles.filter((vehicle) => 
      vehicle.status === "Out of Service" || 
      vehicle.status === "stopped" ||
      (vehicle.operationStatus && vehicle.operationStatus === "OUT OF SERVICE")
    ).length;

    // Calculate fleet operational stats
    // Since we're querying from Vehicle model, all vehicles are trucks (trailers are in Trailer model)
    // Active trucks: status is "In Service", "moving", or "idle", OR operationStatus indicates active
    const activeTrucks = vehicles.filter((vehicle) => {
      const statusActive = vehicle.status === "In Service" || 
                          vehicle.status === "moving" || 
                          vehicle.status === "idle";
      const operationStatusActive = vehicle.operationStatus === "IN SERVICE" ||
                                   vehicle.operationStatus === "in_transit" ||
                                   vehicle.operationStatus === "available" ||
                                   vehicle.operationStatus === "loading";
      // Default to active if status is not explicitly "Out of Service" or "Maintenance"
      const notExplicitlyInactive = vehicle.status !== "Out of Service" && 
                                   vehicle.status !== "Maintenance" &&
                                   vehicle.status !== "maintenance" &&
                                   vehicle.status !== "stopped";
      return statusActive || operationStatusActive || (notExplicitlyInactive && !vehicle.operationStatus);
    }).length;
    
    // Out of service trucks: status is "Out of Service" or "stopped", OR operationStatus is "OUT OF SERVICE"
    const outOfServiceTrucks = vehicles.filter((vehicle) => {
      return vehicle.status === "Out of Service" || 
             vehicle.status === "stopped" ||
             vehicle.operationStatus === "OUT OF SERVICE";
    }).length;
    
    // Vehicles under repair: status is "Maintenance" or operationStatus is "MAINTENANCE" or "maintenance"
    const vehiclesUnderRepair = vehicles.filter((vehicle) => 
      vehicle.status === "Maintenance" || 
      vehicle.status === "maintenance" ||
      (vehicle.operationStatus && (
        vehicle.operationStatus === "MAINTENANCE" ||
        vehicle.operationStatus === "maintenance"
      ))
    ).length;
    
    const vehiclesWithPendingService = pmStatus.filter((unit) => 
      unit.dueCount > 0 || unit.overdueCount > 0
    ).length;

    // Calculate overdue services from actual VehicleService records
    const todayForOverdue = new Date();
    todayForOverdue.setHours(0, 0, 0, 0);
    
    // Get all vehicles and trailers for odometer lookup
    const allUnitsMap = new Map();
    vehicles.forEach(v => {
      const unitNo = v.internalId || v.unitNumber || v.plateNumber;
      if (unitNo) allUnitsMap.set(unitNo, { odometer: v.odometer || 0, type: 'truck' });
    });
    trailers.forEach(t => {
      const unitNo = t.trailer || t.plateNumber || t.unitNumber;
      if (unitNo) {
        // For trailers, try to get odometer from attached vehicle
        let odometer = 0;
        if (t.isAttached && t.attachedVehicle) {
          const attachedTruck = vehicles.find(v => 
            v._id?.toString() === t.attachedVehicle?.toString()
          );
          odometer = attachedTruck?.odometer || 0;
        }
        allUnitsMap.set(unitNo, { odometer, type: 'trailer' });
      }
    });
    
    // Count overdue services (pending/in-progress services that are past due date or due mileage)
    let overdueServicesCount = 0;
    pendingServices.forEach(service => {
      let isOverdue = false;
      
      // Check by due date
      if (service.dueDate) {
        const dueDate = new Date(service.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        if (dueDate < todayForOverdue) {
          isOverdue = true;
        }
      }
      
      // Check by due mileage
      if (!isOverdue && service.dueMileage && service.unitNumber) {
        const unit = allUnitsMap.get(service.unitNumber);
        if (unit) {
          const currentOdometer = service.odometer || unit.odometer || 0;
          if (currentOdometer >= service.dueMileage) {
            isOverdue = true;
          }
        }
      }
      
      if (isOverdue) {
        overdueServicesCount++;
      }
    });

    // Group pending services by service type
    // Use serviceType (kebab-case) as the primary key to avoid duplicates
    const pendingServicesByTypeMap = new Map(); // Key: serviceType (normalized), Value: { name: displayName, count: number }
    
    console.log('🔍 Grouping pending services. Total pending:', pendingServices.length);
    console.log('🔍 Custom services available:', customServices.map(cs => cs.name));
    pendingServices.forEach((service, index) => {
      if (!service.serviceType) {
        console.log(`  ⚠️ Service ${index} has no serviceType, skipping`);
        return;
      }
      
      // Use the serviceType itself as the key (already normalized to kebab-case)
      const serviceTypeKey = service.serviceType.toLowerCase().trim();
      console.log(`  📝 Service ${index}: serviceType="${service.serviceType}" -> key="${serviceTypeKey}"`);
      
      if (pendingServicesByTypeMap.has(serviceTypeKey)) {
        // Increment count for existing service type
        const existing = pendingServicesByTypeMap.get(serviceTypeKey);
        existing.count++;
        console.log(`  ✅ Incremented ${existing.name} (${serviceTypeKey}): ${existing.count}`);
      } else {
        // New service type - get display name
        const serviceName = serviceTypeToName(service.serviceType, customServices).trim();
        console.log(`  ➕ New service: "${serviceName}" (${serviceTypeKey}): 1`);
        pendingServicesByTypeMap.set(serviceTypeKey, {
          name: serviceName,
          count: 1
        });
      }
    });
    
    console.log('📦 After first grouping, pendingServicesByTypeMap has', pendingServicesByTypeMap.size, 'entries:');
    pendingServicesByTypeMap.forEach(({ name, count }, key) => {
      console.log(`    - "${name}" (${key}): ${count}`);
    });
    
    // Convert Map to object for JSON response (using display names)
    // Ensure no duplicate display names by using case-insensitive keys
    const pendingServicesByType = {};
    const nameKeyMap = new Map(); // Track normalized key -> original name
    
    console.log('🔄 Converting to display names...');
    pendingServicesByTypeMap.forEach(({ name, count }, serviceTypeKey) => {
      // Use lowercase as key for case-insensitive deduplication
      const normalizedNameKey = name.toLowerCase().trim();
      console.log(`  🔄 Processing: "${name}" (normalized: "${normalizedNameKey}") from serviceType "${serviceTypeKey}"`);
      
      if (nameKeyMap.has(normalizedNameKey)) {
        // Merge counts if duplicate display name found (case-insensitive)
        const originalName = nameKeyMap.get(normalizedNameKey);
        if (originalName && pendingServicesByType[originalName] !== undefined) {
          pendingServicesByType[originalName] += count;
          console.log(`  ⚠️ Merged duplicate display name "${name}" -> "${originalName}": ${pendingServicesByType[originalName]} total`);
        } else if (originalName) {
          // Edge case: originalName exists but not in pendingServicesByType yet
          pendingServicesByType[originalName] = count;
          console.log(`  ➕ Added "${originalName}": ${count}`);
        }
      } else {
        // New service - use original name for display
        // But first check if this exact name (case-sensitive) already exists
        if (pendingServicesByType[name]) {
          // Same name exists, merge counts
          pendingServicesByType[name] += count;
          console.log(`  ⚠️ Merged exact duplicate name "${name}": ${pendingServicesByType[name]} total`);
        } else {
          pendingServicesByType[name] = count;
          console.log(`  ➕ Added new service "${name}": ${count}`);
        }
        nameKeyMap.set(normalizedNameKey, name);
      }
    });
    
    console.log('📦 After display name conversion, pendingServicesByType has', Object.keys(pendingServicesByType).length, 'keys:');
    Object.entries(pendingServicesByType).forEach(([key, value]) => {
      console.log(`    - "${key}": ${value}`);
    });
    
    // Final safety check: remove any duplicates that might have slipped through
    const finalDeduplicated = {};
    const seenKeys = new Map(); // Map: normalizedKey -> originalKey
    
    for (const [key, value] of Object.entries(pendingServicesByType)) {
      const normalizedKey = key.toLowerCase().trim();
      if (seenKeys.has(normalizedKey)) {
        // Find the existing key with this normalized value
        const existingKey = seenKeys.get(normalizedKey);
        if (existingKey) {
          finalDeduplicated[existingKey] += value;
          console.log(`  🔧 Final deduplication: merged "${key}" into "${existingKey}": ${finalDeduplicated[existingKey]}`);
        }
      } else {
        finalDeduplicated[key] = value;
        seenKeys.set(normalizedKey, key);
      }
    }
    
    console.log('📊 Final pendingServicesByType:', JSON.stringify(finalDeduplicated, null, 2));
    console.log('📊 Keys in pendingServicesByType:', Object.keys(finalDeduplicated));

    const fleetOperational = {
      activeTrucks,
      outOfServiceTrucks,
      vehiclesUnderRepair,
      vehiclesWithPendingService
    };

    return res.json({
      success: true,
      data: {
        fleetOperational,
        safetyAlerts,
        pmStatus,
        invoiceSummary,
        inactiveUnits,
        complianceDocuments: [], // Can be populated from VehicleDocuments if needed
        pendingServicesByType: finalDeduplicated, // New: pending services grouped by type (deduplicated)
        overdueServicesCount // New: count of overdue services from scheduled-services-log
      }
    });
  } catch (error) {
    console.error("❌ Compliance dashboard error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load compliance dashboard",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Helper function to generate signed URL for CVSA inspection documents
const generateDocumentSignedUrl = async (documentUrl) => {
  if (!documentUrl) {
    return null;
  }
  // Already a full URL (e.g. signed URL or external)
  if (documentUrl.startsWith('http://') || documentUrl.startsWith('https://')) {
    return documentUrl;
  }
  // Check if AWS credentials are configured
  if (!process.env.AWS_S3_BUCKET_NAME || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    // Fallback: local file served by backend
    if (documentUrl.includes('uploads/') || documentUrl.includes('documents/')) {
      return `${process.env.BASE_URL || 'http://localhost:3000'}/${documentUrl.replace(/^\/+/, '')}`;
    }
    return null;
  }

  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  let key = null;
  
  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { s3 } = await import("../../config/awsConfig.js");
    
    // Check if documentUrl is already a full S3 URL
    if (documentUrl.includes('s3.amazonaws.com') || documentUrl.includes('.s3.')) {
      try {
        const cleanUrl = documentUrl.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        
        if (urlObj.hostname.includes('.s3.')) {
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }
        
        if (key && key.includes('?')) key = key.split('?')[0];
        if (key && key.includes('&')) key = key.split('&')[0];
      } catch (urlError) {
        console.error('Error parsing S3 URL:', urlError);
      }
    }
    
    // If documentUrl contains a path (but not a full URL), use it as-is
    // This is the most common case: "documents/123-file.pdf"
    if (!key && documentUrl.includes('/')) {
      key = documentUrl;
    }
    
    // If still no key, assume it's in documents folder
    if (!key) {
      key = `documents/${documentUrl}`;
    }

    if (!key) {
      console.error('❌ Could not determine S3 key for document:', documentUrl);
      return null;
    }

    // Extract filename for Content-Disposition
    let fileName = key.split('/').pop() || 'document.pdf';
    try {
      fileName = decodeURIComponent(fileName);
    } catch (e) {
      // If decoding fails, use as-is
    }
    
    // Determine content type based on file extension
    const getContentType = (fileName) => {
      const ext = fileName.split('.').pop()?.toLowerCase();
      const typeMap = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
      };
      return typeMap[ext] || 'application/pdf';
    };

    const contentType = getContentType(fileName);

    // Clean the key - remove any query parameters or fragments
    const cleanKey = key.split('?')[0].split('#')[0];

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: cleanKey,
      ResponseContentType: contentType,
      ResponseContentDisposition: `inline; filename="${encodeURIComponent(fileName)}"`
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
    if (signedUrl) {
      console.log(`✅ Successfully generated signed URL for document: ${key}`);
    } else {
      console.error(`❌ Failed to generate signed URL for document: ${key}`);
    }
    
    return signedUrl;
  } catch (error) {
    console.error(`❌ Error generating signed URL for document:`, {
      error: error.message,
      documentUrl: documentUrl,
      key: key
    });
    return null;
  }
};

// ✅ CVSA Inspection - Get All Inspections
export const getCvsaInspections = async (req, res) => {
  try {
    const { country, status, search, page = 1, limit = 50 } = req.query;
    const query = {};

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: [],
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0
        }
      });
    }

    if (!isSuperadmin && companyId) {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        query.company = new mongoose.Types.ObjectId(companyId);
      } else {
        applyCompanyFilter(query, companyId);
      }
    }

    // Filter by country
    if (country && ['canada', 'usa'].includes(country)) {
      query.country = country;
    }

    // Filter by status
    if (status && ['pass', 'fail', 'warning', 'out-of-service'].includes(status)) {
      query.status = status;
    }

    // Search filter
    if (search) {
      query.$or = [
        { inspectionId: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { inspectorName: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let inspections = await CvsaInspection.find(query)
      .populate('driver', 'name email')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Manually populate vehicle field - use FleetUnit only
    for (let inspection of inspections) {
      if (inspection.vehicle) {
        inspection.vehicle = await populateVehicleInfo(inspection.vehicle);
      }
      
      // Generate signed URLs for documents
      if (inspection.documents && Array.isArray(inspection.documents) && inspection.documents.length > 0) {
        inspection.documents = await Promise.all(
          inspection.documents.map(async (doc) => {
            const signedUrl = await generateDocumentSignedUrl(doc.documentUrl);
            return {
              ...doc,
              signedUrl: signedUrl || doc.documentUrl
            };
          })
        );
      }
    }

    const total = await CvsaInspection.countDocuments(query);

    res.json({
      success: true,
      message: "CVSA inspections fetched successfully",
      data: inspections,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ CVSA Inspection - Get Inspection by ID
export const getCvsaInspectionById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && !companyId) {
      return res.status(404).json({ success: false, message: "Inspection not found" });
    }
    if (!isSuperadmin && companyId) {
      applyCompanyFilter(query, companyId);
    }

    let inspection = await CvsaInspection.findOne(query)
      .populate('driver', 'name email phone')
      .lean();
    
    // Manually populate vehicle field - use FleetUnit only
    if (inspection && inspection.vehicle) {
      inspection.vehicle = await populateVehicleInfo(inspection.vehicle);
    }

    if (!inspection) {
      return res.status(404).json({ success: false, message: "Inspection not found" });
    }

    // Generate signed URLs for documents
    if (inspection.documents && Array.isArray(inspection.documents) && inspection.documents.length > 0) {
      inspection.documents = await Promise.all(
        inspection.documents.map(async (doc) => {
          const signedUrl = await generateDocumentSignedUrl(doc.documentUrl);
          return {
            ...doc,
            signedUrl: signedUrl || doc.documentUrl
          };
        })
      );
    }

    res.json({
      success: true,
      message: "CVSA inspection fetched successfully",
      data: inspection
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ CVSA Inspection - Create Inspection
export const createCvsaInspection = async (req, res) => {
  try {
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating CVSA inspections. Go to Company Settings to set up your company."
        });
      }
    }
    const {
      country,
      date,
      location,
      status,
      vehicle,
      driver,
      inspectorName,
      violations,
      notes,
      inspectionType,
      outOfServiceDate,
      // New fields
      reportNumber,
      inspectionLevel,
      jurisdiction,
      driverLicenseNumber,
      carrierUSDOTNumber,
      carrierMotorCarrierNumber,
      timeOfInspection,
      documentLink,
      outOfServiceIssued,
      outOfServiceReleaseDate,
      defectRepairNeeded
    } = req.body;

    // Validate required fields
    if (!country || !location || !status || !vehicle || !driver) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: country, location, status, vehicle, driver"
      });
    }

    // Validate country
    if (!['canada', 'usa'].includes(country)) {
      return res.status(400).json({
        success: false,
        message: "Invalid country. Must be 'canada' or 'usa'"
      });
    }

    // Validate status
    if (!['pass', 'fail', 'warning', 'out-of-service'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'pass', 'fail', 'warning', or 'out-of-service'"
      });
    }

    // Verify vehicle or trailer exists
    const vehicleExists = await findVehicleById(vehicle);
    if (!vehicleExists) {
      return res.status(404).json({ success: false, message: "Vehicle not found" });
    }
    
    // Use the real ObjectId for saving
    const vehicleIdToSave = vehicleExists._id;

    // Verify driver exists
    const driverExists = await User.findById(driver);
    if (!driverExists) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    // Handle file uploads - multiple documents
    const documents = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      req.files.forEach((file) => {
        let documentUrl = null;
        if (process.env.NODE_ENV === "production") {
          // In production, file is uploaded to S3 via multer-s3
          documentUrl = file.key || file.location || file.originalname;
        } else {
          // In development, store local file path
          documentUrl = file.path ? file.path.replace(/\\/g, '/') : file.originalname;
        }
        
        if (documentUrl) {
          documents.push({
            documentUrl: documentUrl,
            documentType: file.mimetype || 'application/pdf'
          });
        }
      });
    }

    // Create inspection
    const inspection = new CvsaInspection({
      country,
      date: date ? new Date(date) : null,
      location,
      status,
      vehicle: vehicleIdToSave,
      driver,
      inspectorName: inspectorName || null,
      violations: violations || [],
      notes: notes || null,
      inspectionType: inspectionType || 'level-1',
      outOfServiceDate: outOfServiceDate ? new Date(outOfServiceDate) : null,
      // New fields
      reportNumber: (reportNumber && reportNumber.trim() !== '') ? reportNumber.trim() : null,
      inspectionLevel: inspectionLevel || 'I',
      jurisdiction: (jurisdiction && jurisdiction.trim() !== '') ? jurisdiction.trim() : null,
      driverLicenseNumber: (driverLicenseNumber && driverLicenseNumber.trim() !== '') ? driverLicenseNumber.trim() : null,
      carrierUSDOTNumber: (carrierUSDOTNumber && carrierUSDOTNumber.trim() !== '') ? carrierUSDOTNumber.trim() : null,
      carrierMotorCarrierNumber: (carrierMotorCarrierNumber && carrierMotorCarrierNumber.trim() !== '') ? carrierMotorCarrierNumber.trim() : null,
      timeOfInspection: (timeOfInspection && timeOfInspection.trim() !== '') ? timeOfInspection.trim() : null,
      documentLink: (documentLink && documentLink.trim() !== '') ? documentLink.trim() : null,
      documents: documents.length > 0 ? documents : undefined,
      outOfServiceIssued: outOfServiceIssued || false,
      outOfServiceReleaseDate: outOfServiceReleaseDate ? new Date(outOfServiceReleaseDate) : null,
      defectRepairNeeded: defectRepairNeeded || false,
      company: req.user?.company || null
    });

    await inspection.save();

    // Populate before sending response
    let populatedInspection = await CvsaInspection.findById(inspection._id)
      .populate('driver', 'name email')
      .lean();
    
    // Manually populate vehicle field - use FleetUnit only
    if (populatedInspection && populatedInspection.vehicle) {
      populatedInspection.vehicle = await populateVehicleInfo(populatedInspection.vehicle);
    }

    res.status(201).json({
      success: true,
      message: "CVSA inspection created successfully",
      data: populatedInspection
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Inspection ID already exists"
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ CVSA Inspection - Update Inspection
export const updateCvsaInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate country if provided
    if (updateData.country && !['canada', 'usa'].includes(updateData.country)) {
      return res.status(400).json({
        success: false,
        message: "Invalid country. Must be 'canada' or 'usa'"
      });
    }

    // Validate status if provided
    if (updateData.status && !['pass', 'fail', 'warning', 'out-of-service'].includes(updateData.status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'pass', 'fail', 'warning', or 'out-of-service'"
      });
    }

    // Verify vehicle or trailer exists if provided
    let vehicleIdToUpdate = null;
    if (updateData.vehicle) {
      const vehicleExists = await findVehicleById(updateData.vehicle);
      if (!vehicleExists) {
        return res.status(404).json({ success: false, message: "Vehicle not found" });
      }
      vehicleIdToUpdate = vehicleExists._id;
    }

    // Verify driver exists if provided
    if (updateData.driver) {
      const driverExists = await User.findById(updateData.driver);
      if (!driverExists) {
        return res.status(404).json({ success: false, message: "Driver not found" });
      }
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && !companyId) {
      return res.status(404).json({ success: false, message: "Inspection not found" });
    }
    if (!isSuperadmin && companyId) {
      applyCompanyFilter(query, companyId);
    }

    // Handle file uploads - multiple documents
    const updateFields = {};
    
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const newDocuments = [];
      req.files.forEach((file) => {
        let documentUrl = null;
        if (process.env.NODE_ENV === "production") {
          // In production, file is uploaded to S3 via multer-s3
          documentUrl = file.key || file.location || file.originalname;
        } else {
          // In development, store local file path
          documentUrl = file.path ? file.path.replace(/\\/g, '/') : file.originalname;
        }
        
        if (documentUrl) {
          newDocuments.push({
            documentUrl: documentUrl,
            documentType: file.mimetype || 'application/pdf'
          });
        }
      });
      
      // Get existing inspection to merge documents
      const existingInspection = await CvsaInspection.findById(id);
      const existingDocuments = existingInspection?.documents || [];
      
      // Merge existing documents with new ones
      updateFields.documents = [...existingDocuments, ...newDocuments];
    }
    
    // Basic fields
    if (updateData.country !== undefined) updateFields.country = updateData.country;
    if (updateData.date !== undefined) updateFields.date = updateData.date ? new Date(updateData.date) : null;
    if (updateData.location !== undefined) updateFields.location = updateData.location;
    if (updateData.status !== undefined) updateFields.status = updateData.status;
    if (vehicleIdToUpdate !== null) updateFields.vehicle = vehicleIdToUpdate;
    if (updateData.driver !== undefined) updateFields.driver = updateData.driver;
    if (updateData.inspectorName !== undefined) updateFields.inspectorName = updateData.inspectorName;
    if (updateData.violations !== undefined) updateFields.violations = updateData.violations;
    if (updateData.notes !== undefined) updateFields.notes = updateData.notes || null;
    if (updateData.inspectionType !== undefined) updateFields.inspectionType = updateData.inspectionType;
    if (updateData.outOfServiceDate !== undefined) updateFields.outOfServiceDate = updateData.outOfServiceDate || null;
    
    // New fields
    if (updateData.reportNumber !== undefined) updateFields.reportNumber = (updateData.reportNumber && updateData.reportNumber.trim() !== '') ? updateData.reportNumber.trim() : null;
    if (updateData.inspectionLevel !== undefined) updateFields.inspectionLevel = updateData.inspectionLevel || 'I';
    if (updateData.jurisdiction !== undefined) updateFields.jurisdiction = (updateData.jurisdiction && updateData.jurisdiction.trim() !== '') ? updateData.jurisdiction.trim() : null;
    if (updateData.driverLicenseNumber !== undefined) updateFields.driverLicenseNumber = (updateData.driverLicenseNumber && updateData.driverLicenseNumber.trim() !== '') ? updateData.driverLicenseNumber.trim() : null;
    if (updateData.carrierUSDOTNumber !== undefined) updateFields.carrierUSDOTNumber = (updateData.carrierUSDOTNumber && updateData.carrierUSDOTNumber.trim() !== '') ? updateData.carrierUSDOTNumber.trim() : null;
    if (updateData.carrierMotorCarrierNumber !== undefined) updateFields.carrierMotorCarrierNumber = (updateData.carrierMotorCarrierNumber && updateData.carrierMotorCarrierNumber.trim() !== '') ? updateData.carrierMotorCarrierNumber.trim() : null;
    if (updateData.timeOfInspection !== undefined) updateFields.timeOfInspection = (updateData.timeOfInspection && updateData.timeOfInspection.trim() !== '') ? updateData.timeOfInspection.trim() : null;
    if (updateData.documentLink !== undefined) updateFields.documentLink = (updateData.documentLink && updateData.documentLink.trim() !== '') ? updateData.documentLink.trim() : null;
    if (updateData.outOfServiceIssued !== undefined) updateFields.outOfServiceIssued = updateData.outOfServiceIssued || false;
    if (updateData.outOfServiceReleaseDate !== undefined) updateFields.outOfServiceReleaseDate = updateData.outOfServiceReleaseDate ? new Date(updateData.outOfServiceReleaseDate) : null;
    if (updateData.defectRepairNeeded !== undefined) updateFields.defectRepairNeeded = updateData.defectRepairNeeded || false;

    let inspection = await CvsaInspection.findOneAndUpdate(
      query,
      updateFields,
      { new: true, runValidators: true }
    )
      .populate('driver', 'name email')
      .lean();
    
    // Manually populate vehicle field - use FleetUnit only
    if (inspection && inspection.vehicle) {
      inspection.vehicle = await populateVehicleInfo(inspection.vehicle);
    }

    if (!inspection) {
      return res.status(404).json({ success: false, message: "Inspection not found" });
    }

    res.json({
      success: true,
      message: "CVSA inspection updated successfully",
      data: inspection
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ CVSA Inspection - Delete Inspection
export const deleteCvsaInspection = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && !companyId) {
      return res.status(404).json({ success: false, message: "Inspection not found" });
    }
    if (!isSuperadmin && companyId) {
      applyCompanyFilter(query, companyId);
    }

    const inspection = await CvsaInspection.findOneAndDelete(query);

    if (!inspection) {
      return res.status(404).json({ success: false, message: "Inspection not found" });
    }

    res.json({
      success: true,
      message: "CVSA inspection deleted successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ CVSA Inspection - Get Statistics
export const getCvsaInspectionStats = async (req, res) => {
  try {
    const { country } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: {
          total: 0,
          pass: 0,
          fail: 0,
          warning: 0,
          outOfService: 0
        }
      });
    }

    const query = country && ['canada', 'usa'].includes(country) ? { country } : {};
    if (!isSuperadmin && companyId) {
      applyCompanyFilter(query, companyId);
    }

    const [
      total,
      pass,
      fail,
      warning,
      outOfService
    ] = await Promise.all([
      CvsaInspection.countDocuments(query),
      CvsaInspection.countDocuments({ ...query, status: 'pass' }),
      CvsaInspection.countDocuments({ ...query, status: 'fail' }),
      CvsaInspection.countDocuments({ ...query, status: 'warning' }),
      CvsaInspection.countDocuments({ ...query, status: 'out-of-service' })
    ]);

    res.json({
      success: true,
      message: "CVSA inspection statistics fetched successfully",
      data: {
        total,
        pass,
        fail,
        warning,
        outOfService
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ CVSA Inspection - Monthly Report
export const getCvsaMonthlyReport = async (req, res) => {
  try {
    const { year, country } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    
    // Build query
    const query = {};
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: {
          monthlyData: [],
          summary: {
            totalInspections: 0,
            totalPass: 0,
            totalFail: 0,
            totalWarning: 0,
            totalOutOfService: 0,
            totalCanada: 0,
            totalUSA: 0,
            averagePassRate: 0
          },
          year: targetYear
        }
      });
    }

    if (country && ['canada', 'usa'].includes(country)) {
      query.country = country;
    }

    if (!isSuperadmin && companyId) {
      applyCompanyFilter(query, companyId);
    }

    // Get all inspections for the year
    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);
    query.date = { $gte: startDate, $lte: endDate };

    // Aggregate monthly data
    const pipeline = [{ $match: query }];
    const monthlyData = await CvsaInspection.aggregate([
      ...pipeline,
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          totalInspections: { $sum: 1 },
          passCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pass'] }, 1, 0] }
          },
          failCount: {
            $sum: { $cond: [{ $eq: ['$status', 'fail'] }, 1, 0] }
          },
          warningCount: {
            $sum: { $cond: [{ $eq: ['$status', 'warning'] }, 1, 0] }
          },
          outOfServiceCount: {
            $sum: { $cond: [{ $eq: ['$status', 'out-of-service'] }, 1, 0] }
          },
          canadaInspections: {
            $sum: { $cond: [{ $eq: ['$country', 'canada'] }, 1, 0] }
          },
          usaInspections: {
            $sum: { $cond: [{ $eq: ['$country', 'usa'] }, 1, 0] }
          },
          uniqueVehicles: { $addToSet: '$vehicle' },
          uniqueDrivers: { $addToSet: '$driver' }
        }
      },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          totalInspections: 1,
          passCount: 1,
          failCount: 1,
          warningCount: 1,
          outOfServiceCount: 1,
          canadaInspections: 1,
          usaInspections: 1,
          vehiclesInspected: { $size: '$uniqueVehicles' },
          driversInspected: { $size: '$uniqueDrivers' }
        }
      },
      { $sort: { year: 1, month: 1 } }
    ]);

    // Get month names
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Format data with month names and fill missing months with zeros
    const formattedData = [];
    for (let month = 1; month <= 12; month++) {
      const monthData = monthlyData.find(m => m.month === month);
      if (monthData) {
        formattedData.push({
          month: monthNames[month - 1],
          year: monthData.year,
          totalInspections: monthData.totalInspections,
          passCount: monthData.passCount,
          failCount: monthData.failCount,
          warningCount: monthData.warningCount,
          outOfServiceCount: monthData.outOfServiceCount,
          canadaInspections: monthData.canadaInspections,
          usaInspections: monthData.usaInspections,
          vehiclesInspected: monthData.vehiclesInspected,
          driversInspected: monthData.driversInspected
        });
      } else {
        formattedData.push({
          month: monthNames[month - 1],
          year: targetYear,
          totalInspections: 0,
          passCount: 0,
          failCount: 0,
          warningCount: 0,
          outOfServiceCount: 0,
          canadaInspections: 0,
          usaInspections: 0,
          vehiclesInspected: 0,
          driversInspected: 0
        });
      }
    }

    // Calculate summary statistics
    const totalInspectionsSummary = formattedData.reduce((sum, m) => sum + m.totalInspections, 0);
    const totalPassSummary = formattedData.reduce((sum, m) => sum + m.passCount, 0);
    const summary = {
      totalInspections: formattedData.reduce((sum, m) => sum + m.totalInspections, 0),
      totalPass: formattedData.reduce((sum, m) => sum + m.passCount, 0),
      totalFail: formattedData.reduce((sum, m) => sum + m.failCount, 0),
      totalWarning: formattedData.reduce((sum, m) => sum + m.warningCount, 0),
      totalOutOfService: formattedData.reduce((sum, m) => sum + m.outOfServiceCount, 0),
      totalCanada: formattedData.reduce((sum, m) => sum + m.canadaInspections, 0),
      totalUSA: formattedData.reduce((sum, m) => sum + m.usaInspections, 0),
      averagePassRate:
        totalInspectionsSummary > 0
          ? Math.round((totalPassSummary / totalInspectionsSummary) * 100)
          : 0
    };

    res.json({
      success: true,
      message: "Monthly CVSA inspection report fetched successfully",
      data: {
        monthlyData: formattedData,
        summary,
        year: targetYear
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ CVSA Inspection - Delete Old Data (older than 2 years)
export const deleteOldCvsaData = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned. Cannot delete data."
      });
    }

    // Calculate cutoff date (2 years ago from today)
    const now = new Date();
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(now.getFullYear() - 2);
    twoYearsAgo.setHours(0, 0, 0, 0);

    // Build query for old data
    const query = {
      date: { $lt: twoYearsAgo }
    };

    // Apply company filter if not superadmin
    if (!isSuperadmin && companyId) {
      applyCompanyFilter(query, companyId);
    }

    // Count records to be deleted
    const countToDelete = await CvsaInspection.countDocuments(query);

    if (countToDelete === 0) {
      return res.json({
        success: true,
        message: "No old data found to delete (data must be older than 2 years)",
        data: {
          deletedCount: 0,
          cutoffDate: twoYearsAgo.toISOString()
        }
      });
    }

    // Delete old data
    const result = await CvsaInspection.deleteMany(query);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} old CVSA inspection record(s)`,
      data: {
        deletedCount: result.deletedCount,
        cutoffDate: twoYearsAgo.toISOString()
      }
    });
  } catch (error) {
    console.error('Error deleting old CVSA data:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ CVSA Inspection - Upload Carrier Profile Document and Extract Data
export const uploadCarrierProfileDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a carrier profile document (image or PDF)"
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

    // Check if this is a preview request (extract only, don't save)
    const isPreview = req.query.preview === 'true' || req.body.preview === true;

    // Read the file buffer
    let fileBuffer;
    try {
      if (req.file.buffer) {
        // File is in memory (multer memory storage)
        fileBuffer = req.file.buffer;
      } else if (req.file.path) {
        // Fallback: File is on disk
        if (!fs.existsSync(req.file.path)) {
          console.error('File path does not exist:', req.file.path);
          return res.status(400).json({
            success: false,
            message: "File not found on server"
          });
        }
        fileBuffer = fs.readFileSync(req.file.path);
      } else {
        console.error('File object structure:', {
          hasBuffer: !!req.file.buffer,
          hasPath: !!req.file.path,
          hasLocation: !!req.file.location,
          fileKeys: Object.keys(req.file),
          mimetype: req.file.mimetype,
          originalname: req.file.originalname
        });
        return res.status(400).json({
          success: false,
          message: "Unable to read uploaded file. Expected buffer or path."
        });
      }
    } catch (readError) {
      console.error('Error reading file:', readError);
      return res.status(500).json({
        success: false,
        message: "Error reading file: " + readError.message
      });
    }

    console.log('🤖 Starting AI extraction for carrier profile document...');

    // Extract carrier profile data using OpenAI
    const extractionResult = await extractCarrierProfileData(fileBuffer, req.file.mimetype);

    if (!extractionResult.success) {
      return res.status(500).json({
        success: false,
        message: extractionResult.error || "Failed to extract data from carrier profile document",
        data: null
      });
    }

    let extractedData = extractionResult.data;

    // Helper function to infer country from location
    const inferCountryFromLocation = (location) => {
      if (!location) return null;
      const locationUpper = location.toUpperCase();
      const locationLower = location.toLowerCase();
      
      // Canadian province/territory codes (2-letter)
      const canadaProvinceCodes = ['MB', 'BC', 'ON', 'AB', 'SK', 'QC', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU'];
      
      // US state codes (2-letter)
      const usaStateCodes = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'];
      
      // Check for province/state codes first (most reliable)
      for (const code of canadaProvinceCodes) {
        // Check if location contains the code as a standalone word or at start
        if (locationUpper.includes(` ${code} `) || locationUpper.startsWith(`${code} `) || locationUpper.endsWith(` ${code}`) || locationUpper === code) {
          return 'canada';
        }
      }
      
      for (const code of usaStateCodes) {
        if (locationUpper.includes(` ${code} `) || locationUpper.startsWith(`${code} `) || locationUpper.endsWith(` ${code}`) || locationUpper === code) {
          return 'usa';
        }
      }
      
      // Canada indicators (full names and cities)
      const canadaIndicators = ['ontario', 'quebec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan', 'nova scotia', 'new brunswick', 'newfoundland', 'prince edward island', 'yukon', 'northwest territories', 'nunavut', 'toronto', 'vancouver', 'montreal', 'calgary', 'edmonton', 'ottawa', 'winnipeg', 'halifax', 'quebec city', 'canada', 'cad', 'cbsa', 'manitoba', 'winnipeg'];
      
      // USA indicators
      const usaIndicators = ['california', 'texas', 'florida', 'new york', 'illinois', 'pennsylvania', 'ohio', 'georgia', 'north carolina', 'michigan', 'new jersey', 'virginia', 'washington', 'arizona', 'massachusetts', 'tennessee', 'indiana', 'missouri', 'maryland', 'wisconsin', 'colorado', 'minnesota', 'south carolina', 'alabama', 'louisiana', 'kentucky', 'oregon', 'oklahoma', 'connecticut', 'utah', 'iowa', 'nevada', 'arkansas', 'mississippi', 'kansas', 'new mexico', 'nebraska', 'west virginia', 'idaho', 'hawaii', 'new hampshire', 'maine', 'montana', 'rhode island', 'delaware', 'south dakota', 'north dakota', 'alaska', 'vermont', 'wyoming', 'usa', 'us', 'united states', 'dot', 'federal', 'cvs'];
      
      for (const indicator of canadaIndicators) {
        if (locationLower.includes(indicator)) return 'canada';
      }
      
      for (const indicator of usaIndicators) {
        if (locationLower.includes(indicator)) return 'usa';
      }
      
      return null;
    };

    // Calculate Canada/USA counts from individual inspections if summary values are missing or 0
    if (extractedData && extractedData.inspections && Array.isArray(extractedData.inspections) && extractedData.inspections.length > 0) {
      if (!extractedData.summary) {
        extractedData.summary = {};
      }
      
      // Calculate country counts from individual inspections
      // First try explicit country field, then infer from location
      let canadaCount = 0;
      let usaCount = 0;
      
      for (const inspection of extractedData.inspections) {
        let country = null;
        
        // Check explicit country field first
        if (inspection.country) {
          country = inspection.country.toLowerCase();
        } 
        // Check province/state codes (most reliable)
        else if (inspection.province) {
          // Canadian provinces
          const canadaProvinces = ['MB', 'BC', 'ON', 'AB', 'SK', 'QC', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU'];
          if (canadaProvinces.includes(inspection.province.toUpperCase())) {
            country = 'canada';
          }
        } else if (inspection.state) {
          // US states (2-letter codes)
          const usaStates = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'];
          if (usaStates.includes(inspection.state.toUpperCase())) {
            country = 'usa';
          }
        }
        // Infer from location if country/province/state not set
        else if (inspection.location) {
          country = inferCountryFromLocation(inspection.location);
        }
        // Infer from report number pattern (e.g., MBE25-xxx, ONEA-xxx, AB29xxx)
        else if (inspection.reportNumber) {
          const reportUpper = inspection.reportNumber.toUpperCase();
          if (reportUpper.startsWith('MBE') || reportUpper.startsWith('ONEA') || reportUpper.startsWith('AB') || reportUpper.startsWith('BC') || reportUpper.startsWith('SK')) {
            country = 'canada';
          } else if (reportUpper.match(/^[A-Z]{2}\d/)) {
            // US state codes at start of report number
            const stateCode = reportUpper.substring(0, 2);
            const usaStates = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'];
            if (usaStates.includes(stateCode)) {
              country = 'usa';
            }
          }
        }
        
        if (country === 'canada') {
          canadaCount++;
        } else if (country === 'usa') {
          usaCount++;
        }
      }
      
      // Use calculated values if summary values are missing or null
      if (!extractedData.summary.canadaInspections || extractedData.summary.canadaInspections === null) {
        extractedData.summary.canadaInspections = canadaCount;
      }
      if (!extractedData.summary.usaInspections || extractedData.summary.usaInspections === null) {
        extractedData.summary.usaInspections = usaCount;
      }
    } else if (extractedData && extractedData.summary && extractedData.summary.totalInspections) {
      // If no individual inspections but we have totals, try to infer from document context
      // This is a fallback - ideally AI should extract individual inspections
      if ((!extractedData.summary.canadaInspections || extractedData.summary.canadaInspections === null) &&
          (!extractedData.summary.usaInspections || extractedData.summary.usaInspections === null)) {
        // If we can't determine, set to null so frontend can show appropriate message
        // But try to infer from document if possible (this would require parsing the full document text)
        console.log('⚠️ No individual inspections extracted and no country breakdown in summary. Cannot calculate Canada/USA counts.');
      }
    }

    // Check for duplicates in preview mode
    let duplicateWarnings = [];
    if (isPreview && extractedData) {
      // Check individual inspections for duplicates
      if (extractedData.inspections && Array.isArray(extractedData.inspections) && extractedData.inspections.length > 0) {
        for (const inspectionData of extractedData.inspections) {
          const duplicateQuery = { company: companyId };
          
          // Check by inspectionId
          if (inspectionData.inspectionId) {
            duplicateQuery.inspectionId = inspectionData.inspectionId;
            const existing = await CvsaInspection.findOne(duplicateQuery);
            if (existing) {
              duplicateWarnings.push(`Inspection ID "${inspectionData.inspectionId}" already exists`);
              continue;
            }
          }
          
          // Check by reportNumber
          if (inspectionData.reportNumber) {
            duplicateQuery.inspectionId = undefined;
            duplicateQuery.reportNumber = inspectionData.reportNumber;
            const existing = await CvsaInspection.findOne(duplicateQuery);
            if (existing) {
              duplicateWarnings.push(`Report Number "${inspectionData.reportNumber}" already exists`);
              continue;
            }
          }
          
          // Check by date, location, and status (fuzzy duplicate check)
          if (inspectionData.date && inspectionData.location) {
            const inspectionDate = new Date(inspectionData.date);
            const startOfDay = new Date(inspectionDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(inspectionDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            const fuzzyQuery = {
              company: companyId,
              date: { $gte: startOfDay, $lte: endOfDay },
              location: { $regex: inspectionData.location, $options: 'i' },
              status: inspectionData.status || 'pass'
            };
            
            const existing = await CvsaInspection.findOne(fuzzyQuery);
            if (existing) {
              duplicateWarnings.push(`Similar inspection on ${inspectionData.date} at ${inspectionData.location} may already exist`);
            }
          }
        }
      }
    }

    // If preview mode, return extracted data without saving
    if (isPreview) {
      return res.json({
        success: true,
        message: duplicateWarnings.length > 0 
          ? `Data extracted successfully. Found ${duplicateWarnings.length} potential duplicate(s). Please review before saving.`
          : "Data extracted successfully. Please review and confirm to save.",
        data: {
          extractedData: extractedData,
          preview: true,
          duplicateWarnings: duplicateWarnings.length > 0 ? duplicateWarnings : undefined
        }
      });
    }

    const createdInspections = [];
    const errors = [];

    // Helper function to find vehicle by unit number or plate
    const findVehicle = async (unitNo, plateNumber, companyId) => {
      if (!unitNo && !plateNumber) return null;
      
      const query = { company: companyId };
      const orConditions = [];
      
      if (unitNo) {
        orConditions.push(
          { unitNumber: unitNo },
          { internalId: unitNo }
        );
      }
      if (plateNumber) {
        orConditions.push({ plateNumber: plateNumber });
      }
      
      if (orConditions.length > 0) {
        query.$or = orConditions;
      }
      
      return await Vehicle.findOne(query);
    };

    // Helper function to find driver by name or license number
    const findDriver = async (driverName, licenseNumber, companyId) => {
      if (!driverName && !licenseNumber) return null;
      
      const query = { company: companyId, role: 'driver' };
      const orConditions = [];
      
      if (driverName) {
        orConditions.push({ name: { $regex: driverName, $options: 'i' } });
      }
      if (licenseNumber) {
        orConditions.push({ licenseNumber: licenseNumber });
      }
      
      if (orConditions.length > 0) {
        query.$or = orConditions;
      }
      
      return await User.findOne(query);
    };

    // Process individual inspections if available
    if (extractedData.inspections && Array.isArray(extractedData.inspections) && extractedData.inspections.length > 0) {
      console.log(`📋 Processing ${extractedData.inspections.length} individual inspection records...`);
      
      for (const inspectionData of extractedData.inspections) {
        try {
          // Parse date
          let inspectionDate = new Date();
          if (inspectionData.date) {
            inspectionDate = new Date(inspectionData.date);
          } else if (inspectionData.month && inspectionData.year) {
            const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
            const monthIndex = monthNames.findIndex(m => m.toLowerCase() === inspectionData.month.toLowerCase());
            if (monthIndex !== -1) {
              inspectionDate = new Date(inspectionData.year, monthIndex, 15); // Use 15th as default day
            }
          }

          // Find vehicle
          let vehicle = null;
          if (inspectionData.vehicleUnitNo) {
            vehicle = await findVehicle(inspectionData.vehicleUnitNo, null, companyId);
          }

          // Find driver
          let driver = null;
          if (inspectionData.driverName || inspectionData.driverLicenseNumber) {
            driver = await findDriver(inspectionData.driverName, inspectionData.driverLicenseNumber, companyId);
          }

          // If no vehicle/driver found, we'll still create the record but without references
          // This allows the data to be saved and manually linked later

          // Create inspection record
          const inspectionRecord = {
            inspectionId: inspectionData.inspectionId || `CVSA-${inspectionData.year || new Date().getFullYear()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            country: inspectionData.country || null,
            date: inspectionDate,
            location: inspectionData.location || 'Unknown',
            status: inspectionData.status || 'pass',
            inspectionType: inspectionData.inspectionType || 'level-1',
            reportNumber: inspectionData.reportNumber || null,
            inspectorName: inspectionData.inspectorName || 'Unknown',
            driverLicenseNumber: inspectionData.driverLicenseNumber || null,
            notes: inspectionData.notes || null,
            company: companyId,
            vehicle: vehicle ? vehicle._id : null,
            driver: driver ? driver._id : null,
            violations: inspectionData.violations && Array.isArray(inspectionData.violations) 
              ? inspectionData.violations.map(v => ({
                  code: v.code || 'N/A',
                  description: v.description || 'No description',
                  severity: v.severity || 'minor'
                }))
              : []
          };

          // Check if inspection already exists (by inspectionId or reportNumber)
          const existingQuery = { company: companyId };
          if (inspectionRecord.inspectionId) {
            existingQuery.inspectionId = inspectionRecord.inspectionId;
          } else if (inspectionRecord.reportNumber) {
            existingQuery.reportNumber = inspectionRecord.reportNumber;
          }

          const existing = await CvsaInspection.findOne(existingQuery);
          if (existing) {
            console.log(`⚠️ Inspection already exists: ${inspectionRecord.inspectionId || inspectionRecord.reportNumber}`);
            errors.push(`Inspection ${inspectionRecord.inspectionId || inspectionRecord.reportNumber} already exists`);
            continue;
          }

          const created = await CvsaInspection.create(inspectionRecord);
          createdInspections.push(created);
          console.log(`✅ Created inspection: ${created.inspectionId}`);
        } catch (error) {
          console.error('Error creating inspection record:', error);
          errors.push(`Failed to create inspection: ${error.message}`);
        }
      }
    }

    // If only summary data is available, create aggregated records
    if (createdInspections.length === 0 && extractedData.summary) {
      const summary = extractedData.summary;
      console.log('📊 Processing summary data...');
      
      // Parse period to get year/month
      let year = new Date().getFullYear();
      let month = new Date().getMonth();
      
      if (summary.period) {
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        const periodLower = summary.period.toLowerCase();
        
        // Try to extract year
        const yearMatch = periodLower.match(/\b(20\d{2})\b/);
        if (yearMatch) {
          year = parseInt(yearMatch[1]);
        }
        
        // Try to extract month
        for (let i = 0; i < monthNames.length; i++) {
          if (periodLower.includes(monthNames[i])) {
            month = i;
            break;
          }
        }
      }

      // Create records for each status type
      const statusCounts = {
        pass: summary.totalPass || 0,
        fail: summary.totalFail || 0,
        warning: summary.totalWarning || 0,
        'out-of-service': summary.totalOutOfService || 0
      };

      // Create aggregated inspection records
      for (const [status, count] of Object.entries(statusCounts)) {
        if (count > 0) {
          // Create multiple records based on count
          for (let i = 0; i < Math.min(count, 100); i++) { // Limit to 100 per status to avoid too many records
            try {
              const inspectionDate = new Date(year, month, 15 + i); // Spread dates across the month
              
              const inspectionRecord = {
                inspectionId: `CVSA-${year}-${month + 1}-${status}-${i + 1}-${Date.now()}`,
                country: summary.canadaInspections > summary.usaInspections ? 'canada' : 'usa',
                date: inspectionDate,
                location: 'From Carrier Profile Document',
                status: status,
                inspectionType: 'level-1',
                inspectorName: 'Document Import',
                notes: `Imported from carrier profile document. Summary: ${summary.period || 'Unknown period'}`,
                company: companyId
              };

              const created = await CvsaInspection.create(inspectionRecord);
              createdInspections.push(created);
            } catch (error) {
              console.error(`Error creating aggregated inspection record for ${status}:`, error);
              errors.push(`Failed to create ${status} inspection: ${error.message}`);
            }
          }
        }
      }
    }

    res.json({
      success: true,
      message: `Successfully processed carrier profile document. Created ${createdInspections.length} inspection record(s).`,
      data: {
        createdCount: createdInspections.length,
        errors: errors.length > 0 ? errors : undefined,
        inspections: createdInspections.map(i => ({
          _id: i._id,
          inspectionId: i.inspectionId,
          date: i.date,
          status: i.status,
          location: i.location
        })),
        summary: extractedData.summary || null
      }
    });
  } catch (err) {
    console.error('Error processing carrier profile document:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to process carrier profile document"
    });
  }
};

// ✅ CVSA Inspection - Save Extracted Carrier Profile Data
export const saveCarrierProfileData = async (req, res) => {
  try {
    const { extractedData } = req.body;

    if (!extractedData) {
      return res.status(400).json({
        success: false,
        message: "Extracted data is required"
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

    const createdInspections = [];
    const errors = [];

    // Helper function to find vehicle by unit number or plate
    const findVehicle = async (unitNo, plateNumber, companyId) => {
      if (!unitNo && !plateNumber) return null;
      
      const query = { company: companyId };
      const orConditions = [];
      
      if (unitNo) {
        orConditions.push(
          { unitNumber: unitNo },
          { internalId: unitNo }
        );
      }
      if (plateNumber) {
        orConditions.push({ plateNumber: plateNumber });
      }
      
      if (orConditions.length > 0) {
        query.$or = orConditions;
      }
      
      return await Vehicle.findOne(query);
    };

    // Helper function to find driver by name or license number
    const findDriver = async (driverName, licenseNumber, companyId) => {
      if (!driverName && !licenseNumber) return null;
      
      const query = { company: companyId, role: 'driver' };
      const orConditions = [];
      
      if (driverName) {
        orConditions.push({ name: { $regex: driverName, $options: 'i' } });
      }
      if (licenseNumber) {
        orConditions.push({ licenseNumber: licenseNumber });
      }
      
      if (orConditions.length > 0) {
        query.$or = orConditions;
      }
      
      return await User.findOne(query);
    };

    // Process individual inspections if available
    if (extractedData.inspections && Array.isArray(extractedData.inspections) && extractedData.inspections.length > 0) {
      console.log(`📋 Processing ${extractedData.inspections.length} individual inspection records...`);
      
      for (const inspectionData of extractedData.inspections) {
        try {
          // Parse date
          let inspectionDate = new Date();
          if (inspectionData.date) {
            inspectionDate = new Date(inspectionData.date);
          } else if (inspectionData.month && inspectionData.year) {
            const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
            const monthIndex = monthNames.findIndex(m => m.toLowerCase() === inspectionData.month.toLowerCase());
            if (monthIndex !== -1) {
              inspectionDate = new Date(inspectionData.year, monthIndex, 15);
            }
          }

          // Find vehicle
          let vehicle = null;
          if (inspectionData.vehicleUnitNo) {
            vehicle = await findVehicle(inspectionData.vehicleUnitNo, null, companyId);
          }

          // Find driver
          let driver = null;
          if (inspectionData.driverName || inspectionData.driverLicenseNumber) {
            driver = await findDriver(inspectionData.driverName, inspectionData.driverLicenseNumber, companyId);
          }

          // Create inspection record
          const inspectionRecord = {
            inspectionId: inspectionData.inspectionId || `CVSA-${inspectionData.year || new Date().getFullYear()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            country: inspectionData.country || null,
            date: inspectionDate,
            location: inspectionData.location || 'Unknown',
            status: inspectionData.status || 'pass',
            inspectionType: inspectionData.inspectionType || 'level-1',
            reportNumber: inspectionData.reportNumber || null,
            inspectorName: inspectionData.inspectorName || 'Unknown',
            driverLicenseNumber: inspectionData.driverLicenseNumber || null,
            notes: inspectionData.notes || null,
            company: companyId,
            vehicle: vehicle ? vehicle._id : null,
            driver: driver ? driver._id : null,
            violations: inspectionData.violations && Array.isArray(inspectionData.violations) 
              ? inspectionData.violations.map(v => ({
                  code: v.code || 'N/A',
                  description: v.description || 'No description',
                  severity: v.severity || 'minor'
                }))
              : []
          };

          // Check if inspection already exists (multiple criteria to prevent duplicates)
          let existing = null;
          
          // First check by inspectionId
          if (inspectionRecord.inspectionId) {
            existing = await CvsaInspection.findOne({ 
              company: companyId, 
              inspectionId: inspectionRecord.inspectionId 
            });
            if (existing) {
              console.log(`⚠️ Inspection already exists (by ID): ${inspectionRecord.inspectionId}`);
              errors.push(`Inspection ID "${inspectionRecord.inspectionId}" already exists`);
              continue;
            }
          }
          
          // Check by reportNumber
          if (inspectionRecord.reportNumber) {
            existing = await CvsaInspection.findOne({ 
              company: companyId, 
              reportNumber: inspectionRecord.reportNumber 
            });
            if (existing) {
              console.log(`⚠️ Inspection already exists (by Report Number): ${inspectionRecord.reportNumber}`);
              errors.push(`Report Number "${inspectionRecord.reportNumber}" already exists`);
              continue;
            }
          }
          
          // Fuzzy duplicate check: same date, location, and status
          if (inspectionRecord.date && inspectionRecord.location) {
            const inspectionDate = new Date(inspectionRecord.date);
            const startOfDay = new Date(inspectionDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(inspectionDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            existing = await CvsaInspection.findOne({
              company: companyId,
              date: { $gte: startOfDay, $lte: endOfDay },
              location: { $regex: inspectionRecord.location, $options: 'i' },
              status: inspectionRecord.status
            });
            
            if (existing) {
              console.log(`⚠️ Similar inspection already exists: ${inspectionRecord.date.toLocaleDateString()} at ${inspectionRecord.location}`);
              errors.push(`Similar inspection on ${inspectionRecord.date.toLocaleDateString()} at ${inspectionRecord.location} already exists`);
              continue;
            }
          }

          const created = await CvsaInspection.create(inspectionRecord);
          createdInspections.push(created);
          console.log(`✅ Created inspection: ${created.inspectionId}`);
        } catch (error) {
          console.error('Error creating inspection record:', error);
          errors.push(`Failed to create inspection: ${error.message}`);
        }
      }
    }

    // If only summary data is available, create aggregated records
    if (createdInspections.length === 0 && extractedData.summary) {
      const summary = extractedData.summary;
      console.log('📊 Processing summary data...');
      
      // Parse period to get year/month
      let year = new Date().getFullYear();
      let month = new Date().getMonth();
      
      if (summary.period) {
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        const periodLower = summary.period.toLowerCase();
        
        // Try to extract year
        const yearMatch = periodLower.match(/\b(20\d{2})\b/);
        if (yearMatch) {
          year = parseInt(yearMatch[1]);
        }
        
        // Try to extract month
        for (let i = 0; i < monthNames.length; i++) {
          if (periodLower.includes(monthNames[i])) {
            month = i;
            break;
          }
        }
      }

      // Create records for each status type
      const statusCounts = {
        pass: summary.totalPass || 0,
        fail: summary.totalFail || 0,
        warning: summary.totalWarning || 0,
        'out-of-service': summary.totalOutOfService || 0
      };

      // Create aggregated inspection records
      for (const [status, count] of Object.entries(statusCounts)) {
        if (count > 0) {
          // Check if similar aggregated records already exist for this period
          const periodStart = new Date(year, month, 1);
          const periodEnd = new Date(year, month + 1, 0, 23, 59, 59);
          
          const existingAggregated = await CvsaInspection.countDocuments({
            company: companyId,
            date: { $gte: periodStart, $lte: periodEnd },
            location: 'From Carrier Profile Document',
            status: status,
            inspectorName: 'Document Import'
          });
          
          if (existingAggregated > 0) {
            console.log(`⚠️ ${existingAggregated} similar aggregated ${status} inspection(s) already exist for this period`);
            errors.push(`${existingAggregated} similar ${status} inspection(s) already exist for ${summary.period || 'this period'}. Skipping to avoid duplicates.`);
            continue;
          }
          
          // Create multiple records based on count
          for (let i = 0; i < Math.min(count, 100); i++) {
            try {
              const inspectionDate = new Date(year, month, 15 + i);
              
              const inspectionRecord = {
                inspectionId: `CVSA-${year}-${month + 1}-${status}-${i + 1}-${Date.now()}`,
                country: summary.canadaInspections > summary.usaInspections ? 'canada' : 'usa',
                date: inspectionDate,
                location: 'From Carrier Profile Document',
                status: status,
                inspectionType: 'level-1',
                inspectorName: 'Document Import',
                notes: `Imported from carrier profile document. Summary: ${summary.period || 'Unknown period'}`,
                company: companyId
              };

              const created = await CvsaInspection.create(inspectionRecord);
              createdInspections.push(created);
            } catch (error) {
              console.error(`Error creating aggregated inspection record for ${status}:`, error);
              errors.push(`Failed to create ${status} inspection: ${error.message}`);
            }
          }
        }
      }
    }

    // Automatically create/update Carrier Performance record
    let performanceRecord = null;
    if (extractedData.summary) {
      try {
        const summary = extractedData.summary;
        const currentDate = new Date();
        const month = currentDate.getMonth() + 1; // 1-12
        const year = currentDate.getFullYear();
        
        // Determine month/year from period if available, otherwise use current month
        let recordMonth = month;
        let recordYear = year;
        
        if (summary.period) {
          // Try to extract month/year from period string (e.g., "January 2024", "Q1 2024", "2024")
          const periodLower = summary.period.toLowerCase();
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
          for (let i = 0; i < monthNames.length; i++) {
            if (periodLower.includes(monthNames[i])) {
              recordMonth = i + 1;
              break;
            }
          }
          // Extract year
          const yearMatch = summary.period.match(/\b(20\d{2})\b/);
          if (yearMatch) {
            recordYear = parseInt(yearMatch[1]);
          }
        }

        // Calculate performance metrics
        const totalInspections = summary.totalInspections || 0;
        const passCount = summary.totalPass || 0;
        const failCount = summary.totalFail || 0;
        const warningCount = summary.totalWarning || 0;
        const outOfServiceCount = summary.totalOutOfService || 0;
        const canadaInspections = summary.canadaInspections || 0;
        const usaInspections = summary.usaInspections || 0;
        
        const passRate = totalInspections > 0 ? Math.round((passCount / totalInspections) * 100) : 0;
        const ossRate = totalInspections > 0 ? Math.round((outOfServiceCount / totalInspections) * 100) : 0;

        // Use upsert to create or update
        performanceRecord = await CarrierPerformance.findOneAndUpdate(
          { company: companyId, year: recordYear, month: recordMonth },
          {
            company: companyId,
            month: recordMonth,
            year: recordYear,
            totalInspections,
            passCount,
            failCount,
            warningCount,
            outOfServiceCount,
            canadaInspections,
            usaInspections,
            passRate,
            ossRate,
            safetyRating: summary.safetyRating || null,
            documentSource: req.body.documentSource || null,
            documentUploadedAt: new Date(),
            notes: `Auto-generated from carrier profile document upload`,
            createdBy: req.user?._id
          },
          { upsert: true, new: true }
        );

        console.log(`✅ Carrier Performance record ${performanceRecord ? 'created/updated' : 'failed'} for ${recordMonth}/${recordYear}`);
      } catch (perfError) {
        console.error('Error creating/updating carrier performance record:', perfError);
        // Don't fail the whole request if performance record creation fails
        errors.push(`Warning: Could not create carrier performance record: ${perfError.message}`);
      }
    }

    res.json({
      success: true,
      message: `Successfully saved carrier profile data. Created ${createdInspections.length} inspection record(s).${performanceRecord ? ' Carrier performance record updated.' : ''}`,
      data: {
        createdCount: createdInspections.length,
        errors: errors.length > 0 ? errors : undefined,
        inspections: createdInspections.map(i => ({
          _id: i._id,
          inspectionId: i.inspectionId,
          date: i.date,
          status: i.status,
          location: i.location
        })),
        summary: extractedData.summary || null,
        performanceRecord: performanceRecord ? {
          month: performanceRecord.month,
          year: performanceRecord.year,
          passRate: performanceRecord.passRate,
          ossRate: performanceRecord.ossRate
        } : null
      }
    });
  } catch (err) {
    console.error('Error saving carrier profile data:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to save carrier profile data"
    });
  }
};

/**
 * Get Carrier Performance History and Trends
 */
export const getCarrierPerformance = async (req, res) => {
  try {
    const { year, months } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company assignment required'
      });
    }

    const query = {};
    if (!isSuperadmin) query.company = companyId;
    
    if (year) {
      query.year = parseInt(year);
    }

    // Get all performance records
    const records = await CarrierPerformance.find(query)
      .sort({ year: -1, month: -1 })
      .lean();

    // Calculate trends
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    // Get last 12 months of data
    const last12Months = [];
    for (let i = 0; i < 12; i++) {
      const date = new Date(currentYear, currentMonth - 1 - i, 1);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const record = records.find(r => r.year === year && r.month === month);
      last12Months.unshift({
        month,
        year,
        monthName: date.toLocaleString('default', { month: 'long' }),
        ...(record || {
          totalInspections: 0,
          passCount: 0,
          failCount: 0,
          warningCount: 0,
          outOfServiceCount: 0,
          canadaInspections: 0,
          usaInspections: 0,
          passRate: 0,
          ossRate: 0
        })
      });
    }

    // Calculate overall statistics
    const totalRecords = records.length;
    const avgPassRate = totalRecords > 0 
      ? Math.round(records.reduce((sum, r) => sum + (r.passRate || 0), 0) / totalRecords)
      : 0;
    const avgOssRate = totalRecords > 0
      ? Math.round(records.reduce((sum, r) => sum + (r.ossRate || 0), 0) / totalRecords)
      : 0;

    // Calculate trend (comparing last 3 months vs previous 3 months)
    const recent3Months = last12Months.slice(-3);
    const previous3Months = last12Months.slice(-6, -3);
    
    const recentAvgPassRate = recent3Months.length > 0
      ? Math.round(recent3Months.reduce((sum, m) => sum + (m.passRate || 0), 0) / recent3Months.length)
      : 0;
    const previousAvgPassRate = previous3Months.length > 0
      ? Math.round(previous3Months.reduce((sum, m) => sum + (m.passRate || 0), 0) / previous3Months.length)
      : 0;

    const passRateTrend = recentAvgPassRate - previousAvgPassRate;
    const isImproving = passRateTrend > 0;
    const isDeclining = passRateTrend < 0;

    // Get latest record
    const latestRecord = records.length > 0 ? records[0] : null;

    res.json({
      success: true,
      data: {
        records,
        monthlyData: last12Months,
        summary: {
          totalRecords,
          avgPassRate,
          avgOssRate,
          latestRecord: latestRecord ? {
            month: latestRecord.month,
            year: latestRecord.year,
            passRate: latestRecord.passRate,
            ossRate: latestRecord.ossRate,
            totalInspections: latestRecord.totalInspections,
            safetyRating: latestRecord.safetyRating
          } : null
        },
        trends: {
          passRateTrend,
          isImproving,
          isDeclining,
          recentAvgPassRate,
          previousAvgPassRate,
          trendPercentage: previousAvgPassRate > 0 
            ? Math.round((passRateTrend / previousAvgPassRate) * 100)
            : 0
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching carrier performance:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching carrier performance'
    });
  }
};

// ✅ Ticket - Get All Tickets
export const getTickets = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const query = {};

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: [],
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0
        }
      });
    }

    // Filter by status
    if (status && ['paid', 'unpaid', 'fight', 'dismissed', 'reduced'].includes(status)) {
      query.status = status;
    }

    if (!isSuperadmin && companyId) {
      applyCompanyFilter(query, companyId);
    }

    // Search filter
    if (search) {
      query.$or = [
        { ticketNumber: { $regex: search, $options: 'i' } },
        { violationType: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { officerName: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let tickets = await Ticket.find(query)
      .populate('driver', 'name email')
      .sort({ dateIssued: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Manually populate vehicle field - use FleetUnit only
    for (let ticket of tickets) {
      if (ticket.vehicle) {
        ticket.vehicle = await populateVehicleInfo(ticket.vehicle);
      }
    }

    const total = await Ticket.countDocuments(query);

    res.json({
      success: true,
      message: "Tickets fetched successfully",
      data: tickets,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Ticket - Get Ticket by ID
export const getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && !companyId) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }
    if (!isSuperadmin && companyId) {
      applyCompanyFilter(query, companyId);
    }

    let ticket = await Ticket.findOne(query)
      .populate('driver', 'name email phone')
      .lean();
    
    // Manually populate vehicle field - use FleetUnit only
    if (ticket && ticket.vehicle) {
      ticket.vehicle = await populateVehicleInfo(ticket.vehicle);
    }

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    res.json({
      success: true,
      message: "Ticket fetched successfully",
      data: ticket
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Ticket - Create Ticket
export const createTicket = async (req, res) => {
  try {
    const {
      country,
      ticketType,
      violationType,
      violationDescription,
      title,
      description,
      dateIssued,
      location,
      issuingAuthority,
      amount,
      currency,
      finalAmount,
      status,
      paymentStatus,
      outcome,
      driver,
      vehicle,
      unitNumber,
      trailerNumber,
      officerName,
      dueDate,
      paymentDate,
      courtDate,
      fightingBy,
      lawyerDetails,
      notes,
      paidDate,
      paymentMethod,
      paymentReference
    } = req.body;

    
    // Get ticketNumber from body if provided, otherwise it will be auto-generated by model
    const { ticketNumber } = req.body;
    
    // If ticketNumber is provided, validate it's not empty
    if (ticketNumber && !ticketNumber.trim()) {
      return res.status(400).json({
        success: false,
        message: "Ticket number cannot be empty"
      });
    }

    // Validate country
    if (country && !['usa', 'canada'].includes(country)) {
      return res.status(400).json({
        success: false,
        message: "Invalid country. Must be 'usa' or 'canada'"
      });
    }

    // Validate status
    if (!['paid', 'unpaid', 'fight', 'dismissed', 'reduced'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'paid', 'unpaid', 'fight', 'dismissed', or 'reduced'"
      });
    }

    // Validate lawyer details if status is 'fight'
    if (status === 'fight' && lawyerDetails) {
      if (!lawyerDetails.name || !lawyerDetails.firm || !lawyerDetails.phone || 
          !lawyerDetails.email || !lawyerDetails.address) {
        return res.status(400).json({
          success: false,
          message: "All lawyer details fields are required when status is 'fight'"
        });
      }
    }

    // Verify vehicle or trailer exists (only if provided)
    let vehicleExists = null;
    let vehicleIdToSave = null;
    if (vehicle) {
      vehicleExists = await findVehicleById(vehicle);
      if (!vehicleExists) {
        return res.status(404).json({ success: false, message: "Vehicle not found" });
      }
      // Use the real ObjectId for saving
      vehicleIdToSave = vehicleExists._id;
    }

    // Verify driver exists (only if provided)
    let driverExists = null;
    if (driver) {
      driverExists = await User.findById(driver);
      if (!driverExists) {
        return res.status(404).json({ success: false, message: "Driver not found" });
      }
    }

    const requestCompanyId = getUserCompanyId(req.user);
    const normalizedRequestCompany = normalizeToObjectId(requestCompanyId);
    const vehicleCompany = vehicleExists ? normalizeToObjectId(vehicleExists.company) : null;
    const driverCompany = driverExists ? normalizeToObjectId(driverExists.company) : null;

    const resolvedCompany =
      normalizedRequestCompany ||
      vehicleCompany ||
      driverCompany ||
      null;

    // Handle file uploads
    let ticketFileMetadata = {};
    let receiptFileMetadata = {};
    
    if (req.files) {
      // Handle ticket file
      if (req.files.ticketFile && req.files.ticketFile[0]) {
        const file = req.files.ticketFile[0];
        const fileUrl = file.location || 
          (file.path ? `${req.protocol}://${req.get("host")}/${file.path.replace(/\\/g, '/')}` : null);
        ticketFileMetadata = {
          ticketFileUrl: fileUrl,
          ticketFileName: file.originalname,
          ticketFileSize: file.size,
          ticketFileMimeType: file.mimetype
        };
      }
      
      // Handle receipt file
      if (req.files.receiptFile && req.files.receiptFile[0]) {
        const file = req.files.receiptFile[0];
        const fileUrl = file.location || 
          (file.path ? `${req.protocol}://${req.get("host")}/${file.path.replace(/\\/g, '/')}` : null);
        receiptFileMetadata = {
          receiptFileUrl: fileUrl,
          receiptFileName: file.originalname,
          receiptFileSize: file.size,
          receiptFileMimeType: file.mimetype
        };
      }
    }

    // Create ticket
    const ticketData = {
      country: country || 'usa',
      ticketType: ticketType || violationType,
      violationType: violationType || ticketType,
      violationDescription: violationDescription || description || '',
      title: title || '',
      description: description || violationDescription || '',
      dateIssued: dateIssued ? new Date(dateIssued) : new Date(),
      location: location || '',
      issuingAuthority: issuingAuthority || officerName || '',
      amount: amount || null,
      currency: currency || 'CAD',
      finalAmount: finalAmount || null,
      status: status || 'unpaid',
      paymentStatus: paymentStatus || '',
      outcome: outcome || null,
      ...(driver && { driver }),
      ...(vehicleIdToSave && { vehicle: vehicleIdToSave }),
      unitNumber: unitNumber || null,
      trailerNumber: trailerNumber || null,
      officerName: officerName || issuingAuthority || '',
      dueDate: dueDate ? new Date(dueDate) : null,
      paymentDate: paymentDate ? new Date(paymentDate) : null,
      courtDate: courtDate ? new Date(courtDate) : null,
      fightingBy: fightingBy || null,
      lawyerDetails: status === 'fight' && lawyerDetails ? lawyerDetails : undefined,
      notes: notes || description || '',
      paidDate: paidDate || paymentDate ? new Date(paidDate || paymentDate) : null,
      paymentMethod: paymentMethod || null,
      paymentReference: paymentReference || null,
      company: resolvedCompany || undefined,
      ...ticketFileMetadata,
      ...receiptFileMetadata
    };
    
    // Add ticketNumber if provided
    if (ticketNumber) {
      ticketData.ticketNumber = ticketNumber;
    }
    
    const ticket = new Ticket(ticketData);

    await ticket.save();

    // Populate before sending response
    let populatedTicket = await Ticket.findById(ticket._id)
      .populate('driver', 'name email')
      .lean();
    
    // Manually populate vehicle field - use FleetUnit only
    if (populatedTicket && populatedTicket.vehicle) {
      populatedTicket.vehicle = await populateVehicleInfo(populatedTicket.vehicle);
    }

    res.status(201).json({
      success: true,
      message: "Ticket created successfully",
      data: populatedTicket
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Ticket number already exists"
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Ticket - Update Ticket
export const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      ticketType,
      title,
      description,
      issuingAuthority,
      currency,
      paymentStatus,
      paymentDate,
      ...otherFields
    } = req.body;
    
    const updateData = { ...otherFields };

    // Handle new fields from frontend
    if (ticketType !== undefined) updateData.ticketType = ticketType;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (issuingAuthority !== undefined) updateData.issuingAuthority = issuingAuthority;
    if (currency !== undefined) updateData.currency = currency;
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;
    if (paymentDate !== undefined) updateData.paymentDate = paymentDate ? new Date(paymentDate) : null;

    // Handle file uploads
    if (req.files) {
      // Handle ticket file
      if (req.files.ticketFile && req.files.ticketFile[0]) {
        const file = req.files.ticketFile[0];
        const fileUrl = file.location || 
          (file.path ? `${req.protocol}://${req.get("host")}/${file.path.replace(/\\/g, '/')}` : null);
        updateData.ticketFileUrl = fileUrl;
        updateData.ticketFileName = file.originalname;
        updateData.ticketFileSize = file.size;
        updateData.ticketFileMimeType = file.mimetype;
      }
      
      // Handle receipt file
      if (req.files.receiptFile && req.files.receiptFile[0]) {
        const file = req.files.receiptFile[0];
        const fileUrl = file.location || 
          (file.path ? `${req.protocol}://${req.get("host")}/${file.path.replace(/\\/g, '/')}` : null);
        updateData.receiptFileUrl = fileUrl;
        updateData.receiptFileName = file.originalname;
        updateData.receiptFileSize = file.size;
        updateData.receiptFileMimeType = file.mimetype;
      }
    }

    // Validate country if provided
    if (updateData.country && !['usa', 'canada'].includes(updateData.country)) {
      return res.status(400).json({
        success: false,
        message: "Invalid country. Must be 'usa' or 'canada'"
      });
    }

    // Validate status if provided
    if (updateData.status && !['paid', 'unpaid', 'fight', 'dismissed', 'reduced'].includes(updateData.status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'paid', 'unpaid', 'fight', 'dismissed', or 'reduced'"
      });
    }

    // Validate lawyer details if status is 'fight'
    if (updateData.status === 'fight' && updateData.lawyerDetails) {
      if (!updateData.lawyerDetails.name || !updateData.lawyerDetails.firm || 
          !updateData.lawyerDetails.phone || !updateData.lawyerDetails.email || 
          !updateData.lawyerDetails.address) {
        return res.status(400).json({
          success: false,
          message: "All lawyer details fields are required when status is 'fight'"
        });
      }
    }

    // If status is not 'fight', remove lawyer details
    if (updateData.status && updateData.status !== 'fight') {
      updateData.lawyerDetails = undefined;
    }

    // Verify vehicle or trailer exists if provided
    let vehicleIdToUpdate = null;
    if (updateData.vehicle) {
      const vehicleExists = await findVehicleById(updateData.vehicle);
      if (!vehicleExists) {
        return res.status(404).json({ success: false, message: "Vehicle not found" });
      }
      vehicleIdToUpdate = vehicleExists._id;
    }

    // Verify driver exists if provided
    if (updateData.driver) {
      const driverExists = await User.findById(updateData.driver);
      if (!driverExists) {
        return res.status(404).json({ success: false, message: "Driver not found" });
      }
    }

    // Build update object with proper handling of all fields
    const updateFields = {};
    
    // Basic fields
    if (updateData.country !== undefined) updateFields.country = updateData.country;
    if (updateData.violationType !== undefined) updateFields.violationType = updateData.violationType;
    if (updateData.violationDescription !== undefined) updateFields.violationDescription = updateData.violationDescription;
    if (updateData.dateIssued !== undefined) updateFields.dateIssued = updateData.dateIssued ? new Date(updateData.dateIssued) : new Date();
    if (updateData.location !== undefined) updateFields.location = updateData.location;
    if (updateData.amount !== undefined) updateFields.amount = updateData.amount;
    if (updateData.finalAmount !== undefined) updateFields.finalAmount = updateData.finalAmount || null;
    if (updateData.status !== undefined) updateFields.status = updateData.status;
    if (updateData.outcome !== undefined) updateFields.outcome = updateData.outcome || null;
    if (updateData.driver !== undefined) updateFields.driver = updateData.driver;
    // vehicle field is handled above with findVehicleById - use vehicleIdToUpdate if set
    if (vehicleIdToUpdate !== null) updateFields.vehicle = vehicleIdToUpdate;
    if (updateData.unitNumber !== undefined) updateFields.unitNumber = updateData.unitNumber || null;
    if (updateData.trailerNumber !== undefined) updateFields.trailerNumber = updateData.trailerNumber || null;
    if (updateData.officerName !== undefined) updateFields.officerName = updateData.officerName;
    if (updateData.dueDate !== undefined) updateFields.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : new Date();
    if (updateData.courtDate !== undefined) updateFields.courtDate = updateData.courtDate ? new Date(updateData.courtDate) : null;
    if (updateData.fightingBy !== undefined) updateFields.fightingBy = updateData.fightingBy || null;
    if (updateData.notes !== undefined) updateFields.notes = updateData.notes || null;
    if (updateData.paidDate !== undefined) updateFields.paidDate = updateData.paidDate ? new Date(updateData.paidDate) : null;
    if (updateData.paymentMethod !== undefined) updateFields.paymentMethod = updateData.paymentMethod || null;
    if (updateData.paymentReference !== undefined) updateFields.paymentReference = updateData.paymentReference || null;
    
    // Handle lawyer details
    if (updateData.status === 'fight' && updateData.lawyerDetails) {
      updateFields.lawyerDetails = updateData.lawyerDetails;
    } else if (updateData.status && updateData.status !== 'fight') {
      updateFields.lawyerDetails = undefined;
    }

    let ticket = await Ticket.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: true }
    )
      .populate('driver', 'name email')
      .lean();
    
    // Manually populate vehicle field - use FleetUnit only
    if (ticket && ticket.vehicle) {
      ticket.vehicle = await populateVehicleInfo(ticket.vehicle);
    }

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    res.json({
      success: true,
      message: "Ticket updated successfully",
      data: ticket
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Ticket - Delete Ticket
export const deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findByIdAndDelete(id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    res.json({
      success: true,
      message: "Ticket deleted successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Compliance Invoices - Get All Invoices
export const getComplianceInvoices = async (req, res) => {
  try {
    const { unitNumber, driver, serviceProvider, search, page = 1, limit = 50 } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: [],
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0
        }
      });
    }

    const companyFilter = companyId ? { company: companyId } : {};
    
    // Build query filters
    const generalRepairFilter = { ...companyFilter };
    const vehicleServiceFilter = { ...companyFilter };
    const regulatorySafetyFilter = { ...companyFilter };

    if (unitNumber && unitNumber !== 'all') {
      generalRepairFilter.unitNumber = unitNumber;
      vehicleServiceFilter.unitNumber = unitNumber;
      regulatorySafetyFilter.unitNo = unitNumber;
    }

    if (serviceProvider && serviceProvider !== 'all') {
      generalRepairFilter.serviceProvider = serviceProvider;
      vehicleServiceFilter.serviceProvider = serviceProvider;
      regulatorySafetyFilter.shopName = serviceProvider;
    }

    // Fetch all three types of invoices
    // Only fetch records that have invoice numbers (since these are invoices)
    const [generalRepairs, vehicleServices, regulatorySafety] = await Promise.all([
      GeneralRepair.find(generalRepairFilter).lean(), // invoiceNumber is required, so all have it
      VehicleService.find({ 
        ...vehicleServiceFilter,
        invoiceNumber: { $exists: true, $ne: null, $ne: '' } // Only services with invoice numbers
      })
      .populate({
        path: 'vehicleId',
        select: 'internalId plateNumber vinNumber make model makeModel',
        model: 'Vehicle'
      })
      .lean(),
      RegulatorySafety.find({ 
        ...regulatorySafetyFilter,
        invoiceNo: { $exists: true, $ne: null, $ne: '' } // Only safety records with invoice numbers
      }).lean()
    ]);

    // Collect all unit references and IDs for batch lookup
    const unitRefs = new Set();
    const unitNumbers = new Set();
    
    generalRepairs.forEach(repair => {
      if (repair.unitReference) unitRefs.add(repair.unitReference.toString());
      if (repair.unitNumber) {
        unitNumbers.add(repair.unitNumber);
        unitNumbers.add(repair.unitNumber.toString());
      }
    });
    
    vehicleServices.forEach(service => {
      // Handle vehicleId (could be ObjectId or populated object)
      if (service.vehicleId) {
        if (typeof service.vehicleId === 'object' && service.vehicleId._id) {
          // Populated Vehicle object
          unitRefs.add(service.vehicleId._id.toString());
          if (service.vehicleId.internalId) {
            unitNumbers.add(service.vehicleId.internalId);
            unitNumbers.add(service.vehicleId.internalId.toString());
          }
          if (service.vehicleId.plateNumber) {
            unitNumbers.add(service.vehicleId.plateNumber);
          }
        } else {
          // Just ObjectId - could be Vehicle or FleetUnit
          unitRefs.add(service.vehicleId.toString());
        }
      }
      if (service.unitNumber) {
        unitNumbers.add(service.unitNumber);
        unitNumbers.add(service.unitNumber.toString());
      }
    });
    
    regulatorySafety.forEach(safety => {
      if (safety.unitReference) unitRefs.add(safety.unitReference.toString());
      if (safety.unitNo) {
        unitNumbers.add(safety.unitNo);
        unitNumbers.add(safety.unitNo.toString());
      }
    });

    // Batch fetch FleetUnits and Vehicles
    const fleetUnitsMap = new Map();
    if (unitRefs.size > 0 || unitNumbers.size > 0) {
      // Fetch FleetUnits
      const fleetUnits = await FleetUnit.find({
        $or: [
          { _id: { $in: Array.from(unitRefs).map(id => new mongoose.Types.ObjectId(id)) } },
          { unitNo: { $in: Array.from(unitNumbers) } },
          { internalId: { $in: Array.from(unitNumbers) } }
        ]
      })
        .select("_id unitNo licensePlate vinNo make model makeModel unitType internalId")
        .lean();
      
      fleetUnits.forEach(unit => {
        fleetUnitsMap.set(unit._id.toString(), unit);
        if (unit.unitNo) {
          fleetUnitsMap.set(unit.unitNo, unit);
          fleetUnitsMap.set(unit.unitNo.toString(), unit);
        }
        if (unit.internalId) {
          fleetUnitsMap.set(unit.internalId, unit);
          fleetUnitsMap.set(unit.internalId.toString(), unit);
        }
      });
      
      // Also fetch Vehicles and map them (for VehicleService.vehicleId references)
      const vehicles = await Vehicle.find({
        $or: [
          { _id: { $in: Array.from(unitRefs).map(id => new mongoose.Types.ObjectId(id)) } },
          { internalId: { $in: Array.from(unitNumbers) } },
          { plateNumber: { $in: Array.from(unitNumbers) } }
        ]
      })
        .select("_id internalId plateNumber vinNumber make model")
        .lean();
      
      // Map Vehicle data to FleetUnit-like structure for consistency
      vehicles.forEach(vehicle => {
        if (!fleetUnitsMap.has(vehicle._id.toString())) {
          const vehicleAsFleetUnit = {
            _id: vehicle._id,
            unitNo: vehicle.internalId || vehicle.plateNumber,
            internalId: vehicle.internalId,
            licensePlate: vehicle.plateNumber,
            vinNo: vehicle.vinNumber,
            make: vehicle.make,
            model: vehicle.model,
            makeModel: vehicle.make && vehicle.model ? `${vehicle.make} ${vehicle.model}` : (vehicle.make || vehicle.model || 'N/A'),
            unitType: 'Truck'
          };
          fleetUnitsMap.set(vehicle._id.toString(), vehicleAsFleetUnit);
          if (vehicle.internalId) {
            fleetUnitsMap.set(vehicle.internalId, vehicleAsFleetUnit);
            fleetUnitsMap.set(vehicle.internalId.toString(), vehicleAsFleetUnit);
          }
          if (vehicle.plateNumber) {
            fleetUnitsMap.set(vehicle.plateNumber, vehicleAsFleetUnit);
          }
        }
      });
    }

    // Combine and transform invoices
    const allInvoices = [];

    // Process General Repairs
    for (const repair of generalRepairs) {
      let fleetUnit = null;

      // Try to find FleetUnit from map
      if (repair.unitReference) {
        fleetUnit = fleetUnitsMap.get(repair.unitReference.toString());
      }
      if (!fleetUnit && repair.unitNumber) {
        // Try multiple lookup methods
        fleetUnit = fleetUnitsMap.get(repair.unitNumber) || 
                   fleetUnitsMap.get(repair.unitNumber.toString());
      }

      // Parse parts if it's a string
      let parts = [];
      if (repair.parts) {
        try {
          if (typeof repair.parts === 'string') {
            // Split by comma and parse each part
            const partStrings = repair.parts.split(',').map(p => p.trim()).filter(p => p.length > 0);
            parts = partStrings.map(p => {
              // Try to match patterns like "tire $50" or "tire (50)" or "tire 50" or just "tire"
              const matchWithPrice = p.match(/(.+?)\s*[\($]?\s*\$?\s*(\d+(?:\.\d+)?)\s*[\)]?/);
              if (matchWithPrice) {
                return { name: matchWithPrice[1].trim(), cost: parseFloat(matchWithPrice[2]) || 0 };
              }
              // If no price found, just use the part name
              return { name: p.trim(), cost: 0 };
            });
          } else if (Array.isArray(repair.parts)) {
            parts = repair.parts;
          }
        } catch (e) {
          console.error('Error parsing parts:', e);
          parts = [];
        }
      }

      // Calculate total with taxes
      const baseAmount = repair.amount || 0;
      let totalTaxAmount = 0;
      let totalAmount = baseAmount;
      
      if (repair.taxes && Array.isArray(repair.taxes) && repair.taxes.length > 0) {
        // Calculate tax for each tax entry
        repair.taxes.forEach((tax) => {
          if (tax.percentage && tax.percentage > 0) {
            const taxAmount = baseAmount * (tax.percentage / 100);
            totalTaxAmount += taxAmount;
          }
        });
        totalAmount = baseAmount + totalTaxAmount;
      }

      // GeneralRepair always has invoiceNumber (required field)
      allInvoices.push({
        id: repair._id.toString(),
        type: 'general',
        serviceDate: repair.serviceDate,
        unitNumber: repair.unitNumber || fleetUnit?.unitNo || fleetUnit?.internalId || 'N/A',
        makeModel: repair.makeModel || fleetUnit?.makeModel || (fleetUnit?.make && fleetUnit?.model ? `${fleetUnit.make} ${fleetUnit.model}` : 'N/A'),
        vinOrPlate: repair.vinLicensePlate || fleetUnit?.licensePlate || fleetUnit?.vinNo || 'N/A',
        description: repair.description || '',
        odometer: repair.odometer || 0,
        parts: parts,
        notes: repair.notes || '',
        serviceProvider: repair.serviceProvider || 'N/A',
        invoiceNumber: repair.invoiceNumber || 'N/A',
        passedInspection: true, // General repairs are typically passed
        driver: 'N/A', // Driver info not available in GeneralRepair model
        serviceCategory: 'General Repairs',
        location: 'N/A',
        customer: repair.customer || 'N/A',
        amount: baseAmount,
        taxes: repair.taxes || [],
        taxAmount: totalTaxAmount,
        totalAmount: totalAmount
      });
    }

    // Process Vehicle Services
    for (const service of vehicleServices) {
      let fleetUnit = null;

      // Try to find FleetUnit from map - handle both ObjectId and populated object
      if (service.vehicleId) {
        if (typeof service.vehicleId === 'object' && service.vehicleId._id) {
          // Populated vehicle object
          fleetUnit = fleetUnitsMap.get(service.vehicleId._id.toString());
          if (!fleetUnit && service.vehicleId.internalId) {
            fleetUnit = fleetUnitsMap.get(service.vehicleId.internalId);
          }
        } else {
          // Just ObjectId
          fleetUnit = fleetUnitsMap.get(service.vehicleId.toString());
        }
      }
      if (!fleetUnit && service.unitNumber) {
        // Try multiple lookup methods
        fleetUnit = fleetUnitsMap.get(service.unitNumber) || 
                   fleetUnitsMap.get(service.unitNumber.toString());
      }

      // Parse parts if it's a string
      let parts = [];
      if (service.parts) {
        try {
          if (typeof service.parts === 'string') {
            // Split by comma and parse each part
            const partStrings = service.parts.split(',').map(p => p.trim()).filter(p => p.length > 0);
            parts = partStrings.map(p => {
              // Try to match patterns like "tire $50" or "tire (50)" or "tire 50" or just "tire"
              const matchWithPrice = p.match(/(.+?)\s*[\($]?\s*\$?\s*(\d+(?:\.\d+)?)\s*[\)]?/);
              if (matchWithPrice) {
                return { name: matchWithPrice[1].trim(), cost: parseFloat(matchWithPrice[2]) || 0 };
              }
              // If no price found, just use the part name
              return { name: p.trim(), cost: 0 };
            });
          } else if (Array.isArray(service.parts)) {
            parts = service.parts;
          }
        } catch (e) {
          console.error('Error parsing parts:', e);
          parts = [];
        }
      }

      // Only include services that have invoice numbers
      if (service.invoiceNumber) {
        // Get better unit info - try multiple sources
        let resolvedUnitNumber = service.unitNumber;
        if (!resolvedUnitNumber && fleetUnit) {
          resolvedUnitNumber = fleetUnit.unitNo || fleetUnit.internalId;
        }
        if (!resolvedUnitNumber && service.vehicleId) {
          if (typeof service.vehicleId === 'object' && service.vehicleId.internalId) {
            resolvedUnitNumber = service.vehicleId.internalId;
          }
        }
        resolvedUnitNumber = resolvedUnitNumber || 'N/A';
        
        let resolvedMakeModel = service.makeModel;
        if (!resolvedMakeModel && fleetUnit) {
          resolvedMakeModel = fleetUnit.makeModel || (fleetUnit.make && fleetUnit.model ? `${fleetUnit.make} ${fleetUnit.model}` : null);
        }
        if (!resolvedMakeModel && service.vehicleId) {
          if (typeof service.vehicleId === 'object') {
            if (service.vehicleId.makeModel) {
              resolvedMakeModel = service.vehicleId.makeModel;
            } else if (service.vehicleId.make && service.vehicleId.model) {
              resolvedMakeModel = `${service.vehicleId.make} ${service.vehicleId.model}`;
            }
          }
        }
        resolvedMakeModel = resolvedMakeModel || 'N/A';
        
        let resolvedVinOrPlate = 'N/A';
        if (fleetUnit) {
          resolvedVinOrPlate = fleetUnit.licensePlate || fleetUnit.vinNo || 'N/A';
        } else if (service.vehicleId && typeof service.vehicleId === 'object') {
          resolvedVinOrPlate = service.vehicleId.plateNumber || service.vehicleId.vinNumber || 'N/A';
        }
        
        // Build description with service type and details
        let description = service.description || '';
        const serviceTypeLabel = service.serviceType 
          ? service.serviceType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
          : 'Scheduled Service';
        if (description && serviceTypeLabel) {
          description = `${serviceTypeLabel}: ${description}`;
        } else {
          description = description || serviceTypeLabel || 'Scheduled Service';
        }
        
        allInvoices.push({
          id: service._id.toString(),
          type: 'scheduled',
          serviceDate: service.serviceDate || service.dueDate || service.createdAt,
          unitNumber: resolvedUnitNumber,
          makeModel: resolvedMakeModel,
          vinOrPlate: resolvedVinOrPlate,
          description: description,
          odometer: service.odometer || service.dueMileage || 0,
          parts: parts,
          notes: service.notes || '',
          serviceProvider: service.serviceProvider || service.assignedMechanic || 'N/A',
          invoiceNumber: service.invoiceNumber,
          passedInspection: service.status === 'completed',
          driver: 'N/A', // Driver info not available in VehicleService model
          serviceCategory: serviceTypeLabel,
          location: 'N/A',
          customer: 'N/A', // Customer info not available in VehicleService model
          estimatedCost: service.estimatedCost || null // Include estimated cost if available
        });
      }
    }

    // Process Regulatory Safety
    for (const safety of regulatorySafety) {
      let fleetUnit = null;

      // Try to find FleetUnit from map
      if (safety.unitReference) {
        fleetUnit = fleetUnitsMap.get(safety.unitReference.toString());
      }
      if (!fleetUnit && safety.unitNo) {
        fleetUnit = fleetUnitsMap.get(safety.unitNo);
      }

      // Only include safety records that have invoice numbers
      if (safety.invoiceNo) {
        allInvoices.push({
          id: safety._id.toString(),
          type: 'safety',
          serviceDate: safety.safetyExpiryDate,
          unitNumber: safety.unitNo || fleetUnit?.unitNo || 'N/A',
          makeModel: safety.makeModel || fleetUnit?.makeModel || 'N/A',
          vinOrPlate: fleetUnit?.licensePlate || fleetUnit?.vinNo || 'N/A',
          description: `Safety inspection - ${safety.safetyDecalNumber || 'N/A'}`,
          odometer: 0,
          parts: [],
          notes: safety.notes || '',
          serviceProvider: safety.shopName || 'N/A',
          invoiceNumber: safety.invoiceNo,
          passedInspection: true,
          driver: 'N/A',
          serviceCategory: 'Safety Inspection',
          location: 'N/A',
          customer: 'N/A' // Customer info not available in RegulatorySafety model
        });
      }
    }

    // Apply search filter
    let filteredInvoices = allInvoices;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredInvoices = allInvoices.filter(invoice => 
        invoice.invoiceNumber?.toLowerCase().includes(searchLower) ||
        invoice.unitNumber?.toLowerCase().includes(searchLower) ||
        invoice.makeModel?.toLowerCase().includes(searchLower) ||
        invoice.serviceProvider?.toLowerCase().includes(searchLower) ||
        invoice.description?.toLowerCase().includes(searchLower)
      );
    }

    // Apply driver filter (if we had driver data)
    if (driver && driver !== 'all') {
      filteredInvoices = filteredInvoices.filter(invoice => 
        invoice.driver?.toLowerCase().includes(driver.toLowerCase())
      );
    }

    // Sort by service date (newest first)
    filteredInvoices.sort((a, b) => {
      const dateA = new Date(a.serviceDate || 0);
      const dateB = new Date(b.serviceDate || 0);
      return dateB - dateA;
    });

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedInvoices = filteredInvoices.slice(skip, skip + parseInt(limit));
    const total = filteredInvoices.length;

    res.json({
      success: true,
      message: "Compliance invoices fetched successfully",
      data: paginatedInvoices,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching compliance invoices:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Update Compliance Invoice
export const updateComplianceInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body; // 'general', 'scheduled', or 'safety'

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Invoice type is required"
      });
    }

    // Route to appropriate controller based on type
    if (type === 'general') {
      // Update GeneralRepair
      return await updateGeneralRepair(req, res);
    } else if (type === 'scheduled') {
      // Update VehicleService
      return await updateVehicleService(req, res);
    } else if (type === 'safety') {
      // Update RegulatorySafety
      return await updateRegulatorySafetyRecord(req, res);
    } else {
      return res.status(400).json({
        success: false,
        message: `Invalid invoice type: ${type}. Must be 'general', 'scheduled', or 'safety'`
      });
    }
  } catch (error) {
    console.error("❌ Error updating compliance invoice:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update compliance invoice",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ✅ Delete Compliance Invoice
export const deleteComplianceInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query; // Get type from query params

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Invoice type is required as query parameter"
      });
    }

    // Route to appropriate controller based on type
    if (type === 'general') {
      // Delete GeneralRepair
      return await deleteGeneralRepair(req, res);
    } else if (type === 'scheduled') {
      // Delete VehicleService
      return await deleteVehicleService(req, res);
    } else if (type === 'safety') {
      // Delete RegulatorySafety
      return await deleteRegulatorySafetyRecord(req, res);
    } else {
      return res.status(400).json({
        success: false,
        message: `Invalid invoice type: ${type}. Must be 'general', 'scheduled', or 'safety'`
      });
    }
  } catch (error) {
    console.error("❌ Error deleting compliance invoice:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete compliance invoice",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ✅ Ticket - Get Statistics
export const getTicketStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // If user has no company, return empty stats (tickets are company-based)
    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "Ticket statistics fetched successfully",
        data: {
          _id: null,
          total: 0,
          paid: 0,
          unpaid: 0,
          fight: 0,
          totalAmount: 0,
          paidAmount: 0,
          unpaidAmount: 0,
          fightAmount: 0
        }
      });
    }

    const matchStage = {};
    if (!isSuperadmin && companyId) {
      const normalizedCompany = normalizeToObjectId(companyId);
      matchStage.company = normalizedCompany ? { $in: [normalizedCompany, companyId] } : companyId;
    }

    const pipeline = [];
    if (Object.keys(matchStage).length) {
      pipeline.push({ $match: matchStage });
    }

    const stats = await Ticket.aggregate([
      ...pipeline,
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          paid: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
          },
          unpaid: {
            $sum: { $cond: [{ $eq: ['$status', 'unpaid'] }, 1, 0] }
          },
          fight: {
            $sum: { $cond: [{ $eq: ['$status', 'fight'] }, 1, 0] }
          },
          totalAmount: { $sum: '$amount' },
          paidAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] }
          },
          unpaidAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'unpaid'] }, '$amount', 0] }
          },
          fightAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'fight'] }, '$amount', 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      _id: null,
      total: 0,
      paid: 0,
      unpaid: 0,
      fight: 0,
      totalAmount: 0,
      paidAmount: 0,
      unpaidAmount: 0,
      fightAmount: 0
    };

    res.json({
      success: true,
      message: "Ticket statistics fetched successfully",
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper function to generate signed URL for incident files
const generateIncidentFileSignedUrl = async (fileName, fileType = 'image') => {
  if (!fileName) {
    console.log('⚠️ generateIncidentFileSignedUrl: fileName is empty');
    return null;
  }
  
  // Check if AWS credentials are configured
  if (!process.env.AWS_S3_BUCKET_NAME || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('⚠️ AWS credentials not configured, skipping signed URL generation');
    return null;
  }

  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  let key = null;
  
  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { s3 } = await import("../../config/awsConfig.js");
    
    // Check if fileName is already a full S3 URL
    if (fileName.includes('s3.amazonaws.com') || fileName.includes('.s3.')) {
      try {
        const cleanUrl = fileName.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        
        if (urlObj.hostname.includes('.s3.')) {
          key = decodeURIComponent(urlObj.pathname.substring(1));
          console.log(`✅ Extracted S3 key from URL: ${key}`);
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
          console.log(`✅ Extracted S3 key from s3.amazonaws.com URL: ${key}`);
        }
        
        if (key && key.includes('?')) key = key.split('?')[0];
        if (key && key.includes('&')) key = key.split('&')[0];
      } catch (urlError) {
        console.error(`❌ Error parsing S3 URL:`, urlError.message);
      }
    }
    
    // If fileName already contains a path (but not a full URL), use it as-is (most common case)
    // This handles cases like "documents/123-file.pdf" or "images/123-photo.jpg"
    if (!key && fileName.includes('/')) {
      key = fileName;
      console.log(`✅ Using fileName directly as S3 key: ${key}`);
    }
    
    // If still no key, construct it based on file type
    // This handles cases where only filename is stored (legacy data)
    if (!key) {
      const folder = fileType === 'video' ? 'videos' : 
                     fileType === 'document' ? 'documents' : 
                     'images';
      key = `${folder}/${fileName}`;
      console.log(`⚠️ Constructed S3 key from fileType: ${key}`);
    }

    if (!key) {
      console.error(`❌ Could not determine S3 key for fileName: ${fileName}`);
      return null;
    }

    console.log(`🔍 Generating signed URL: key="${key}", bucket="${bucketName}", fileType="${fileType}"`);

    // Determine content type based on file extension
    const getContentType = (fileName) => {
      const ext = fileName.split('.').pop()?.toLowerCase();
      const typeMap = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'pdf': 'application/pdf',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'webm': 'video/webm',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'txt': 'text/plain'
      };
      return typeMap[ext] || (fileType === 'video' ? 'video/mp4' : fileType === 'document' ? 'application/pdf' : 'image/jpeg');
    };

    const contentType = getContentType(fileName);

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      ResponseContentType: contentType,
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
    if (signedUrl) {
      console.log(`✅ Successfully generated signed URL for key: ${key}`);
    } else {
      console.error(`❌ Failed to generate signed URL for key: ${key} - getSignedUrl returned null`);
    }
    
    return signedUrl;
  } catch (error) {
    console.error(`❌ Error generating signed URL for "${fileName}" (key: ${key || 'unknown'}):`, error.message);
    if (error.name === 'NoSuchKey' || error.message.includes('NoSuchKey')) {
      console.error(`   File does not exist in S3 bucket: ${bucketName}/${key}`);
    } else if (error.name === 'AccessDenied' || error.message.includes('AccessDenied')) {
      console.error(`   Access denied to S3 bucket: ${bucketName}`);
    }
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    });
    return null;
  }
};

// ✅ Incident - Get All Incidents
export const getIncidents = async (req, res) => {
  try {
    const { status, type, location, driver, search, page = 1, limit = 50, sortBy = 'incidentDateTime', sortOrder = 'desc' } = req.query;
    const query = {};

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: [],
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0
        }
      });
    }

    if (!isSuperadmin && companyId) {
      const normalizedCompany = normalizeToObjectId(companyId);
      query.company = normalizedCompany ? { $in: [normalizedCompany, companyId] } : companyId;
    }

    if (status && status !== 'all') {
      query.incidentStatus = status;
    }

    if (type && type !== 'all') {
      query.incidentType = type;
    }

    if (location && location !== 'all') {
      query.$or = [
        { 'location.stateProvince': location },
        { 'location.city': location }
      ];
    }

    if (driver && driver !== 'all') {
      query.driver = driver;
    }

    if (search) {
      query.$or = [
        { incidentNumber: { $regex: search, $options: 'i' } },
        { incidentType: { $regex: search, $options: 'i' } },
        { caseFileNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'location.city': { $regex: search, $options: 'i' } },
        { 'location.stateProvince': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const incidents = await Incident.find(query)
      .populate('driver', 'name email')
      .populate('coDriver', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Incident.countDocuments(query);

    // Generate signed URLs for accident pictures, videos, and reports in each incident
    const incidentsWithSignedUrls = await Promise.all(incidents.map(async (incident) => {
      // Generate signed URLs for accident pictures
      if (incident.accidentPictures && Array.isArray(incident.accidentPictures) && incident.accidentPictures.length > 0) {
        incident.accidentPictures = await Promise.all(
          incident.accidentPictures.map(async (picture) => {
            // Extract fileName - handle both string and object formats
            let fileName = typeof picture === 'string' ? picture : picture.fileName || picture;
            
            // If it's already an object with a valid signedUrl (not null), preserve it; otherwise regenerate
            if (typeof picture === 'object' && picture.signedUrl && picture.signedUrl !== null) {
              return picture; // Already has valid signed URL, keep it
            }
            
            // Generate new signed URL
            const signedUrl = await generateIncidentFileSignedUrl(fileName, 'image');
            return {
              fileName: fileName,
              signedUrl: signedUrl
            };
          })
        );
      }

      // Generate signed URL for accident video
      if (incident.accidentVideo) {
        // Extract fileName - handle both string and object formats
        let fileName = typeof incident.accidentVideo === 'string' ? incident.accidentVideo : incident.accidentVideo.fileName || incident.accidentVideo;
        
        // Always regenerate if signedUrl is null, undefined, or missing
        const needsRegeneration = typeof incident.accidentVideo !== 'object' || 
                                  !incident.accidentVideo.signedUrl || 
                                  incident.accidentVideo.signedUrl === null;
        
        if (needsRegeneration) {
          const signedUrl = await generateIncidentFileSignedUrl(fileName, 'video');
          incident.accidentVideo = {
            fileName: fileName,
            signedUrl: signedUrl
          };
        }
      }

      // Generate signed URL for accident report
      if (incident.accidentReport) {
        // Extract fileName - handle both string and object formats
        let fileName = typeof incident.accidentReport === 'string' ? incident.accidentReport : incident.accidentReport.fileName || incident.accidentReport;
        
        // Always regenerate if signedUrl is null, undefined, or missing
        const needsRegeneration = typeof incident.accidentReport !== 'object' || 
                                  !incident.accidentReport.signedUrl || 
                                  incident.accidentReport.signedUrl === null;
        
        if (needsRegeneration) {
          const signedUrl = await generateIncidentFileSignedUrl(fileName, 'document');
          incident.accidentReport = {
            fileName: fileName,
            signedUrl: signedUrl
          };
        }
      }

      return incident;
    }));

    res.json({
      success: true,
      message: "Incidents fetched successfully",
      data: incidentsWithSignedUrls,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Incident - Get Incident by ID
export const getIncidentById = async (req, res) => {
  try {
    const { id } = req.params;

    const incident = await Incident.findById(id)
      .populate('driver', 'name email licenseNumber')
      .populate('coDriver', 'name email licenseNumber')
      .lean();

    if (!incident) {
      return res.status(404).json({ success: false, message: "Incident not found" });
    }

    // Generate signed URLs for accident pictures
    if (incident.accidentPictures && Array.isArray(incident.accidentPictures) && incident.accidentPictures.length > 0) {
      incident.accidentPictures = await Promise.all(
        incident.accidentPictures.map(async (picture) => {
          const fileName = typeof picture === 'string' ? picture : picture.fileName || picture;
          const signedUrl = await generateIncidentFileSignedUrl(fileName, 'image');
          return {
            fileName: fileName,
            signedUrl: signedUrl
          };
        })
      );
    }

    // Generate signed URL for accident video
    if (incident.accidentVideo) {
      const fileName = typeof incident.accidentVideo === 'string' ? incident.accidentVideo : incident.accidentVideo.fileName || incident.accidentVideo;
      const signedUrl = await generateIncidentFileSignedUrl(fileName, 'video');
      incident.accidentVideo = {
        fileName: fileName,
        signedUrl: signedUrl
      };
    }

    // Generate signed URL for accident report
    if (incident.accidentReport) {
      const fileName = typeof incident.accidentReport === 'string' ? incident.accidentReport : incident.accidentReport.fileName || incident.accidentReport;
      const signedUrl = await generateIncidentFileSignedUrl(fileName, 'document');
      incident.accidentReport = {
        fileName: fileName,
        signedUrl: signedUrl
      };
    }

    res.json({
      success: true,
      message: "Incident fetched successfully",
      data: incident
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Incident - Create Incident
export const createIncident = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    // Parse location if it's a JSON string
    let location = req.body.location || {};
    if (typeof location === 'string') {
      try {
        location = JSON.parse(location);
      } catch (e) {
        location = {};
      }
    }

    const incidentData = {
      incidentDateTime: req.body.incidentDateTime ? new Date(req.body.incidentDateTime) : new Date(),
      location: location,
      incidentType: req.body.incidentType || '',
      incidentStatus: req.body.incidentStatus || 'open',
      driver: req.body.driver,
      company: isSuperadmin ? req.body.company : companyId
    };

    // Optional fields
    if (req.body.incidentId !== undefined) incidentData.incidentId = req.body.incidentId?.trim() || null;
    if (req.body.caseFileNumber !== undefined) incidentData.caseFileNumber = req.body.caseFileNumber?.trim() || null;
    if (req.body.supportingMedia !== undefined) incidentData.supportingMedia = req.body.supportingMedia || [];
    if (req.body.coDriver !== undefined && req.body.coDriver) incidentData.coDriver = req.body.coDriver;
    if (req.body.driversLicense !== undefined) incidentData.driversLicense = req.body.driversLicense?.trim() || null;
    if (req.body.reportingParty !== undefined) incidentData.reportingParty = req.body.reportingParty?.trim() || null;
    if (req.body.unitNumber !== undefined) incidentData.unitNumber = req.body.unitNumber?.trim() || null;
    if (req.body.trailerNumber !== undefined) incidentData.trailerNumber = req.body.trailerNumber?.trim() || null;
    if (req.body.vinPlateNumber !== undefined) incidentData.vinPlateNumber = req.body.vinPlateNumber?.trim() || null;
    if (req.body.damageDescription !== undefined) incidentData.damageDescription = req.body.damageDescription || null;
    if (req.body.actionTakenLog !== undefined) {
      let actionTakenLog = req.body.actionTakenLog;
      if (typeof actionTakenLog === 'string') {
        try {
          actionTakenLog = JSON.parse(actionTakenLog);
        } catch (e) {
          actionTakenLog = [];
        }
      }
      incidentData.actionTakenLog = actionTakenLog || [];
    }
    if (req.body.preventativeMeasures !== undefined) incidentData.preventativeMeasures = req.body.preventativeMeasures || null;
    if (req.body.costTracking !== undefined) {
      let costTracking = req.body.costTracking;
      if (typeof costTracking === 'string') {
        try {
          costTracking = JSON.parse(costTracking);
        } catch (e) {
          costTracking = [];
        }
      }
      incidentData.costTracking = costTracking || [];
    }
    if (req.body.cvsaDotImpact !== undefined) incidentData.cvsaDotImpact = req.body.cvsaDotImpact || false;
    if (req.body.fmcsaReportable !== undefined) incidentData.fmcsaReportable = req.body.fmcsaReportable || false;
    if (req.body.fmcsaNotes !== undefined) incidentData.fmcsaNotes = req.body.fmcsaNotes || null;
    if (req.body.description !== undefined) incidentData.description = req.body.description || null;
    if (req.body.witnessInfo !== undefined) incidentData.witnessInfo = req.body.witnessInfo || null;
    if (req.body.policeReportNumber !== undefined) incidentData.policeReportNumber = req.body.policeReportNumber?.trim() || null;
    if (req.body.notes !== undefined) incidentData.notes = req.body.notes || null;
    
    // Process uploaded files for accident-related fields
    // Handle accident report file upload
    if (req.files && req.files.accidentReport && req.files.accidentReport[0]) {
      const reportFile = req.files.accidentReport[0];
      let s3Key = null;
      
      if (process.env.NODE_ENV === "production") {
        // In production, file is uploaded to S3 via multer-s3
        // The file object has a 'key' property with the S3 key
        if (reportFile.key) {
          s3Key = reportFile.key;
        } else if (reportFile.location) {
          // Fallback: extract key from S3 URL
          try {
            const urlObj = new URL(reportFile.location);
            s3Key = decodeURIComponent(urlObj.pathname.substring(1));
          } catch (e) {
            console.error('Error extracting S3 key from URL:', e);
            s3Key = reportFile.location;
          }
        }
        incidentData.accidentReport = s3Key;
        console.log('✅ Accident report file uploaded to S3:', s3Key);
      } else {
        // In development, store local file path
        const localPath = reportFile.path.replace(/\\/g, '/');
        incidentData.accidentReport = localPath;
        console.log('✅ Accident report file uploaded locally:', localPath);
      }
    } else if (req.body.accidentReport !== undefined && req.body.accidentReport !== null && req.body.accidentReport !== '') {
      // Keep existing file name if no new file uploaded
      incidentData.accidentReport = req.body.accidentReport;
    }
    
    // Handle accident pictures file uploads
    if (req.files && req.files.accidentPictures && req.files.accidentPictures.length > 0) {
      const pictureFiles = req.files.accidentPictures;
      incidentData.accidentPictures = pictureFiles.map(pictureFile => {
        if (process.env.NODE_ENV === "production") {
          // In production, file is uploaded to S3 via multer-s3
          // The file object has a 'key' property with the S3 key
          if (pictureFile.key) {
            return pictureFile.key;
          } else if (pictureFile.location) {
            // Fallback: extract key from S3 URL
            try {
              const urlObj = new URL(pictureFile.location);
              return decodeURIComponent(urlObj.pathname.substring(1));
            } catch (e) {
              console.error('Error extracting S3 key from URL:', e);
              return pictureFile.location;
            }
          }
          return pictureFile.originalname; // Fallback
        } else {
          // In development, store local file path
          return pictureFile.path.replace(/\\/g, '/');
        }
      });
      console.log('✅ Accident pictures uploaded:', incidentData.accidentPictures.length, 'files');
      console.log('✅ Accident pictures keys:', incidentData.accidentPictures);
    } else if (req.body.accidentPictures !== undefined) {
      // Handle comma-separated string or array from body (existing file names)
      if (typeof req.body.accidentPictures === 'string' && req.body.accidentPictures.trim()) {
        incidentData.accidentPictures = req.body.accidentPictures.split(',').map(p => p.trim()).filter(Boolean);
      } else if (Array.isArray(req.body.accidentPictures)) {
        incidentData.accidentPictures = req.body.accidentPictures;
      } else {
        incidentData.accidentPictures = [];
      }
    }
    
    // Handle accident video file upload
    if (req.files && req.files.accidentVideo && req.files.accidentVideo[0]) {
      const videoFile = req.files.accidentVideo[0];
      let s3Key = null;
      
      if (process.env.NODE_ENV === "production") {
        // In production, file is uploaded to S3 via multer-s3
        // The file object has a 'key' property with the S3 key
        if (videoFile.key) {
          s3Key = videoFile.key;
        } else if (videoFile.location) {
          // Fallback: extract key from S3 URL
          try {
            const urlObj = new URL(videoFile.location);
            s3Key = decodeURIComponent(urlObj.pathname.substring(1));
          } catch (e) {
            console.error('Error extracting S3 key from URL:', e);
            s3Key = videoFile.location;
          }
        }
        incidentData.accidentVideo = s3Key;
        console.log('✅ Accident video file uploaded to S3:', s3Key);
      } else {
        // In development, store local file path
        const localPath = videoFile.path.replace(/\\/g, '/');
        incidentData.accidentVideo = localPath;
        console.log('✅ Accident video file uploaded locally:', localPath);
      }
    } else if (req.body.accidentVideo !== undefined && req.body.accidentVideo !== null && req.body.accidentVideo !== '') {
      // Keep existing file name if no new file uploaded
      incidentData.accidentVideo = req.body.accidentVideo;
    }

    const incident = new Incident(incidentData);
    await incident.save();

    const populatedIncident = await Incident.findById(incident._id)
      .populate('driver', 'name email')
      .populate('coDriver', 'name email')
      .lean();

    res.status(201).json({
      success: true,
      message: "Incident created successfully",
      data: populatedIncident
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Incident - Update Incident
export const updateIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updateFields = {};

    if (updateData.incidentDateTime !== undefined) {
      updateFields.incidentDateTime = updateData.incidentDateTime ? new Date(updateData.incidentDateTime) : new Date();
    }
    if (updateData.location !== undefined) {
      // Parse location if it's a JSON string
      let location = updateData.location;
      if (typeof location === 'string') {
        try {
          location = JSON.parse(location);
        } catch (e) {
          location = updateData.location;
        }
      }
      updateFields.location = location;
    }
    if (updateData.incidentType !== undefined) updateFields.incidentType = updateData.incidentType;
    if (updateData.incidentStatus !== undefined) updateFields.incidentStatus = updateData.incidentStatus;
    if (updateData.driver !== undefined) updateFields.driver = updateData.driver;
    if (updateData.incidentId !== undefined) updateFields.incidentId = updateData.incidentId?.trim() || null;
    if (updateData.caseFileNumber !== undefined) updateFields.caseFileNumber = updateData.caseFileNumber?.trim() || null;
    if (updateData.supportingMedia !== undefined) updateFields.supportingMedia = updateData.supportingMedia || [];
    if (updateData.coDriver !== undefined) {
      if (updateData.coDriver) {
        updateFields.coDriver = updateData.coDriver;
      } else {
        updateFields.coDriver = null; // Allow clearing coDriver
      }
    }
    if (updateData.driversLicense !== undefined) updateFields.driversLicense = updateData.driversLicense?.trim() || null;
    if (updateData.reportingParty !== undefined) updateFields.reportingParty = updateData.reportingParty?.trim() || null;
    if (updateData.unitNumber !== undefined) updateFields.unitNumber = updateData.unitNumber?.trim() || null;
    if (updateData.trailerNumber !== undefined) updateFields.trailerNumber = updateData.trailerNumber?.trim() || null;
    if (updateData.vinPlateNumber !== undefined) updateFields.vinPlateNumber = updateData.vinPlateNumber?.trim() || null;
    if (updateData.damageDescription !== undefined) updateFields.damageDescription = updateData.damageDescription || null;
    if (updateData.actionTakenLog !== undefined) {
      let actionTakenLog = updateData.actionTakenLog;
      if (typeof actionTakenLog === 'string') {
        try {
          actionTakenLog = JSON.parse(actionTakenLog);
        } catch (e) {
          actionTakenLog = [];
        }
      }
      updateFields.actionTakenLog = actionTakenLog || [];
    }
    if (updateData.preventativeMeasures !== undefined) updateFields.preventativeMeasures = updateData.preventativeMeasures || null;
    if (updateData.costTracking !== undefined) {
      let costTracking = updateData.costTracking;
      if (typeof costTracking === 'string') {
        try {
          costTracking = JSON.parse(costTracking);
        } catch (e) {
          costTracking = [];
        }
      }
      updateFields.costTracking = costTracking || [];
    }
    if (updateData.cvsaDotImpact !== undefined) updateFields.cvsaDotImpact = updateData.cvsaDotImpact || false;
    if (updateData.fmcsaReportable !== undefined) updateFields.fmcsaReportable = updateData.fmcsaReportable || false;
    if (updateData.fmcsaNotes !== undefined) updateFields.fmcsaNotes = updateData.fmcsaNotes || null;
    if (updateData.description !== undefined) updateFields.description = updateData.description || null;
    if (updateData.witnessInfo !== undefined) updateFields.witnessInfo = updateData.witnessInfo || null;
    if (updateData.policeReportNumber !== undefined) updateFields.policeReportNumber = updateData.policeReportNumber?.trim() || null;
    if (updateData.notes !== undefined) updateFields.notes = updateData.notes || null;
    // Process uploaded files for accident-related fields
    // Handle accident report file upload
    if (req.files && req.files.accidentReport && req.files.accidentReport[0]) {
      const reportFile = req.files.accidentReport[0];
      let fileUrl;
      if (process.env.NODE_ENV === "production") {
        fileUrl = reportFile.location; // S3 URL
      } else {
        fileUrl = `${req.protocol}://${req.get("host")}/${reportFile.path.replace(/\\/g, '/')}`;
      }
      // Store the S3 key or full URL - extract just the key for S3 URLs
      if (fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.')) {
        try {
          const urlObj = new URL(fileUrl);
          const key = decodeURIComponent(urlObj.pathname.substring(1));
          updateFields.accidentReport = key; // Store S3 key
        } catch (e) {
          updateFields.accidentReport = fileUrl; // Fallback to full URL
        }
      } else {
        updateFields.accidentReport = reportFile.originalname; // Store filename for local
      }
      console.log('✅ Accident report file uploaded (update):', updateFields.accidentReport);
    } else if (updateData.accidentReport !== undefined) {
      // Keep existing or update from body if no new file uploaded
      updateFields.accidentReport = updateData.accidentReport || null;
    }
    
    // Handle accident pictures file uploads
    if (req.files && req.files.accidentPictures && req.files.accidentPictures.length > 0) {
      const pictureFiles = req.files.accidentPictures;
      updateFields.accidentPictures = pictureFiles.map(pictureFile => {
        let fileUrl;
        if (process.env.NODE_ENV === "production") {
          fileUrl = pictureFile.location; // S3 URL
        } else {
          fileUrl = `${req.protocol}://${req.get("host")}/${pictureFile.path.replace(/\\/g, '/')}`;
        }
        // Store the S3 key or full URL - extract just the key for S3 URLs
        if (fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.')) {
          try {
            const urlObj = new URL(fileUrl);
            const key = decodeURIComponent(urlObj.pathname.substring(1));
            return key; // Store S3 key
          } catch (e) {
            return fileUrl; // Fallback to full URL
          }
        } else {
          return pictureFile.originalname; // Store filename for local
        }
      });
      console.log('✅ Accident pictures uploaded (update):', updateFields.accidentPictures.length, 'files');
    } else if (updateData.accidentPictures !== undefined) {
      // Handle comma-separated string or array from body (existing file names)
      if (typeof updateData.accidentPictures === 'string' && updateData.accidentPictures.trim()) {
        updateFields.accidentPictures = updateData.accidentPictures.split(',').map(p => p.trim()).filter(Boolean);
      } else if (Array.isArray(updateData.accidentPictures)) {
        updateFields.accidentPictures = updateData.accidentPictures;
      } else {
        updateFields.accidentPictures = [];
      }
    }
    
    // Handle accident video file upload
    if (req.files && req.files.accidentVideo && req.files.accidentVideo[0]) {
      const videoFile = req.files.accidentVideo[0];
      let fileUrl;
      if (process.env.NODE_ENV === "production") {
        fileUrl = videoFile.location; // S3 URL
      } else {
        fileUrl = `${req.protocol}://${req.get("host")}/${videoFile.path.replace(/\\/g, '/')}`;
      }
      // Store the S3 key or full URL - extract just the key for S3 URLs
      if (fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.')) {
        try {
          const urlObj = new URL(fileUrl);
          const key = decodeURIComponent(urlObj.pathname.substring(1));
          updateFields.accidentVideo = key; // Store S3 key
        } catch (e) {
          updateFields.accidentVideo = fileUrl; // Fallback to full URL
        }
      } else {
        updateFields.accidentVideo = videoFile.originalname; // Store filename for local
      }
      console.log('✅ Accident video file uploaded (update):', updateFields.accidentVideo);
    } else if (updateData.accidentVideo !== undefined) {
      // Keep existing or update from body if no new file uploaded
      updateFields.accidentVideo = updateData.accidentVideo || null;
    }

    const incident = await Incident.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: true }
    )
      .populate('driver', 'name email')
      .populate('coDriver', 'name email')
      .lean();

    if (!incident) {
      return res.status(404).json({ success: false, message: "Incident not found" });
    }

    res.json({
      success: true,
      message: "Incident updated successfully",
      data: incident
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Incident - Delete Incident
export const deleteIncident = async (req, res) => {
  try {
    const { id } = req.params;

    const incident = await Incident.findByIdAndDelete(id);

    if (!incident) {
      return res.status(404).json({ success: false, message: "Incident not found" });
    }

    res.json({
      success: true,
      message: "Incident deleted successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Incident - Get Statistics
export const getIncidentStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "Incident statistics fetched successfully",
        data: {
          total: 0,
          open: 0,
          underReview: 0,
          closed: 0
        }
      });
    }

    const matchStage = {};
    if (!isSuperadmin && companyId) {
      const normalizedCompany = normalizeToObjectId(companyId);
      matchStage.company = normalizedCompany ? { $in: [normalizedCompany, companyId] } : companyId;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$incidentStatus',
          count: { $sum: 1 }
        }
      }
    ];

    const results = await Incident.aggregate(pipeline);

    const stats = {
      total: 0,
      open: 0,
      underReview: 0,
      closed: 0
    };

    results.forEach((result) => {
      stats.total += result.count;
      if (result._id === 'open') stats.open = result.count;
      if (result._id === 'under-review') stats.underReview = result.count;
      if (result._id === 'closed') stats.closed = result.count;
    });

    res.json({
      success: true,
      message: "Incident statistics fetched successfully",
      data: stats
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
