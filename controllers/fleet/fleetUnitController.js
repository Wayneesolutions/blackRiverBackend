import mongoose from "mongoose";
import { Subscription } from "../../models/subscriptionModel.js";
import { FleetUnit } from "../../models/fleet/fleetUnitModel.js";
import { VehicleService } from "../../models/driver/vehicleService.js";
import { Vehicle } from "../../models/driver/vehicleModel.js";
import { Trailer } from "../../models/driver/trailerModel.js";
import VehicleDocuments from "../../models/driver/vehicleDocumentsModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";
import { getCoordinatesFromAddress } from "../../services/googlemap.js";
import { initializeAllFleetUnitLocations } from "../../services/samsara.js";

const DEFAULT_SUMMARY = {
  totalUnits: 0,
  activeUnits: 0,
  inactiveUnits: 0,
  trucks: 0,
  trailers: 0,
  expiringSoon: 0,
  expired: 0
};

const normalizeMakeModel = (value = "") => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { makeModel: "", make: "", model: "" };
  }
  const [make, ...rest] = trimmed.split(" ");
  return {
    makeModel: trimmed,
    make,
    model: rest.join(" ").trim()
  };
};

const normalizeUnitPayload = (payload = {}, userId, companyId, existingUnit) => {
  const { makeModel, make, model } = normalizeMakeModel(payload.makeModel || payload.makeModelText || "");

  const isTruck = payload.unitType === "Truck";
  const parsedInitial = payload.initialOdometer ? Number(payload.initialOdometer) : 0;
  const parsedCurrent =
    payload.currentOdometer !== undefined && payload.currentOdometer !== null && payload.currentOdometer !== ""
      ? Number(payload.currentOdometer)
      : parsedInitial;

  const status = payload.status === "Inactive" ? "Inactive" : "Active";
  const operationStatus = payload.operationStatus || existingUnit?.operationStatus || "available";

  const toDate = (value) => {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  return {
    unitNo: payload.unitNo?.trim(),
    internalId: payload.internalId?.trim() || undefined,
    unitType: payload.unitType,
    makeModel,
    make: payload.make?.trim() || make,
    model: payload.model?.trim() || model,
    vinNo: payload.vinNo?.trim(),
    licensePlate: payload.licensePlate?.trim(),
    year: payload.year ? Number(payload.year) : undefined,
    truckType: isTruck ? payload.truckType : undefined,
    trailerType: !isTruck ? payload.trailerType : undefined,
    capacity: !isTruck ? payload.capacity : undefined,
    initialOdometer: parsedInitial,
    currentOdometer: parsedCurrent,
    status,
    operationStatus: !isTruck ? operationStatus : "available",
    lastDate: status === "Inactive" ? toDate(payload.lastDate) : undefined,
    reason: status === "Inactive" ? payload.reason : undefined,
    safetyExpiryDate: toDate(payload.safetyExpiryDate),
    safetyDecalNumber: payload.safetyDecalNumber || undefined,
    safetyPaperNumber: payload.safetyPaperNumber || undefined,
    lastInspectionShop: payload.lastInspectionShop || undefined,
    lastInspectionInvoice: payload.lastInspectionInvoice || undefined,
    serviceIntervalDays: payload.serviceIntervalDays ? Number(payload.serviceIntervalDays) : undefined,
    serviceIntervalMileage: payload.serviceIntervalMileage ? Number(payload.serviceIntervalMileage) : undefined,
    company: companyId || existingUnit?.company,
    updatedBy: userId,
    ...(existingUnit ? {} : { createdBy: userId })
  };
};

const buildSummary = (units = []) => {
  if (!units.length) {
    return { ...DEFAULT_SUMMARY };
  }

  const summary = { ...DEFAULT_SUMMARY };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  units.forEach((unit) => {
    summary.totalUnits += 1;
    if (unit.status === "Active") summary.activeUnits += 1;
    if (unit.status === "Inactive") summary.inactiveUnits += 1;
    if (unit.unitType === "Truck") summary.trucks += 1;
    if (unit.unitType !== "Truck") summary.trailers += 1;

    if (unit.safetyExpiryDate) {
      const expiry = new Date(unit.safetyExpiryDate);
      expiry.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        summary.expired += 1;
      } else if (diffDays <= 30) {
        summary.expiringSoon += 1;
      }
    }
  });

  return summary;
};

const ensureCompanyContext = (req) => {
  const companyId = getUserCompanyId(req.user);
  const isSuperadmin = req.user?.role === "superadmin";
  return { companyId, isSuperadmin };
};

const vehicleStatusMap = {
  available: "idle",
  idle: "idle",
  "in-transit": "moving",
  moving: "moving",
  stopped: "stopped",
  maintenance: "maintenance",
  active: "idle",
  inactive: "maintenance"
};

const trailerTypeReverseMap = {
  "Dry Van": "dry_van",
  "Reefer Trailer": "refrigerated",
  "Tri-Axle Trailer": "container",
  "Flatbed": "flatbed",
  "Step Deck": "flatbed",
  "Lowboy": "flatbed",
  "Tank Trailer": "tanker",
  "Dump Trailer": "flatbed",
  "Bus/Van": "dry_van",
  Truck: "dry_van"
};

const parseIdWithSource = (rawId) => {
  if (!rawId) {
    return { id: rawId, source: "custom" };
  }
  if (rawId.startsWith("vehicle-")) {
    return { id: rawId.replace("vehicle-", ""), source: "vehicle" };
  }
  if (rawId.startsWith("trailer-")) {
    return { id: rawId.replace("trailer-", ""), source: "trailer" };
  }
  if (rawId.startsWith("custom-")) {
    return { id: rawId.replace("custom-", ""), source: "custom" };
  }
  return { id: rawId, source: "custom" };
};

const ensureAccess = (doc, companyId, isSuperadmin, resourceLabel) => {
  if (isSuperadmin) {
    return null;
  }
  if (!companyId) {
    return {
      status: 403,
      message: "No company assigned to the current admin."
    };
  }
  if (doc.company && doc.company.toString() !== companyId.toString()) {
    return {
      status: 403,
      message: `You do not have permission to modify this ${resourceLabel}.`
    };
  }
  return null;
};

const applyVehicleUpdates = (vehicle, payload) => {
  if (payload.unitNo) vehicle.internalId = payload.unitNo;
  if (payload.licensePlate) vehicle.plateNumber = payload.licensePlate;
  if (payload.vinNo) vehicle.vinNumber = payload.vinNo;
  if (payload.make) vehicle.make = payload.make;
  if (payload.model) vehicle.model = payload.model;
  if (payload.year) vehicle.year = payload.year;
  if (payload.currentOdometer !== undefined) {
    vehicle.odometer = payload.currentOdometer;
  } else if (payload.initialOdometer !== undefined && !vehicle.odometer) {
    vehicle.odometer = payload.initialOdometer;
  }
  if (payload.operationStatus) {
    vehicle.status = vehicleStatusMap[payload.operationStatus] || vehicle.status;
  } else if (payload.status) {
    vehicle.status = vehicleStatusMap[payload.status.toLowerCase()] || vehicle.status;
  }
  if (payload.safetyExpiryDate !== undefined) vehicle.safetyExpiryDate = payload.safetyExpiryDate;
  if (payload.safetyDecalNumber !== undefined) vehicle.safetyDecalNumber = payload.safetyDecalNumber;
  if (payload.safetyPaperNumber !== undefined) vehicle.safetyPaperNumber = payload.safetyPaperNumber;
  if (payload.lastInspectionShop !== undefined) vehicle.lastInspectionShop = payload.lastInspectionShop;
  if (payload.lastInspectionInvoice !== undefined) vehicle.lastInspectionInvoice = payload.lastInspectionInvoice;
};

const applyTrailerUpdates = (trailer, payload) => {
  if (payload.unitNo) trailer.trailer = payload.unitNo;
  if (payload.licensePlate) trailer.plateNumber = payload.licensePlate;
  if (payload.vinNo) trailer.internalId = payload.vinNo;
  if (payload.trailerType) {
    trailer.type = trailerTypeReverseMap[payload.trailerType] || trailer.type;
  } else if (payload.unitType) {
    trailer.type = trailerTypeReverseMap[payload.unitType] || trailer.type;
  }
  if (payload.capacity !== undefined) trailer.capacity = payload.capacity;
  if (payload.operationStatus) trailer.operationStatus = payload.operationStatus;
  if (payload.status) {
    trailer.status = payload.status === "Inactive" ? "maintenance" : "idle";
  }
  if (payload.safetyExpiryDate !== undefined) trailer.safetyExpiryDate = payload.safetyExpiryDate;
  if (payload.safetyDecalNumber !== undefined) trailer.safetyDecalNumber = payload.safetyDecalNumber;
  if (payload.safetyPaperNumber !== undefined) trailer.safetyPaperNumber = payload.safetyPaperNumber;
  if (payload.lastInspectionShop !== undefined) trailer.lastInspectionShop = payload.lastInspectionShop;
  if (payload.lastInspectionInvoice !== undefined) trailer.lastInspectionInvoice = payload.lastInspectionInvoice;
};

const mapCustomFleetUnit = (unit, servicesByUnit) => {
  const services = servicesByUnit.get(unit.unitNo) || [];
  services.sort((a, b) => new Date(b.serviceDate || b.createdAt || 0) - new Date(a.serviceDate || a.createdAt || 0));
  const lastService = services.find((svc) => svc.status === "completed") || null;
  const upcomingService = services.find((svc) => svc.status !== "completed") || null;

  // Ensure currentLocation always exists with proper structure
  const currentLocation = unit.currentLocation || {};
  const location = {
    address: currentLocation.address || "",
    latitude: currentLocation.latitude ? String(currentLocation.latitude) : "0",
    longitude: currentLocation.longitude ? String(currentLocation.longitude) : "0",
    updatedAt: currentLocation.updatedAt || unit.updatedAt || unit.createdAt || new Date()
  };

  return {
    _id: `custom-${unit._id}`,
    unitNo: unit.unitNo,
    internalId: unit.internalId,
    unitType: unit.unitType,
    makeModel: unit.makeModel,
    make: unit.make,
    model: unit.model,
    vinNo: unit.vinNo,
    licensePlate: unit.licensePlate,
    year: unit.year,
    truckType: unit.truckType,
    trailerType: unit.trailerType,
    capacity: unit.capacity,
    initialOdometer: unit.initialOdometer || 0,
    currentOdometer: unit.currentOdometer || unit.initialOdometer || 0,
    status: unit.status,
    operationStatus: unit.operationStatus,
    currentLocation: location,
    speed: unit.speed || 0,
    fuelLevel: unit.fuelLevel || 0,
    odometer: unit.odometer || unit.currentOdometer || 0,
    engineOn: unit.engineOn || false,
    lastDate: unit.lastDate,
    reason: unit.reason,
    safetyExpiryDate: unit.safetyExpiryDate,
    safetyDecalNumber: unit.safetyDecalNumber,
    safetyPaperNumber: unit.safetyPaperNumber,
    lastInspectionShop: unit.lastInspectionShop,
    lastInspectionInvoice: unit.lastInspectionInvoice,
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
    source: "custom",
    lastService,
    upcomingService,
    serviceHistory: services,
    referenceId: unit._id.toString(),
    referenceType: "custom"
  };
};

const deriveStatusFromVehicle = (status) => {
  return status === "maintenance" ? "Inactive" : "Active";
};

const trailerTypeMap = {
  dry_van: "Dry Van",
  refrigerated: "Reefer Trailer",
  flatbed: "Flatbed",
  tanker: "Tank Trailer",
  container: "Tri-Axle Trailer"
};

const buildServicesByUnit = (services = []) => {
  const map = new Map();
  services.forEach((service) => {
    const unitKey =
      service.unitNumber ||
      service.vehicleId?.internalId ||
      service.vehicleId?.plateNumber ||
      (service.vehicleId?._id?.toString());
    if (!unitKey) return;

    const normalized = {
      _id: service._id,
      serviceType: service.serviceType,
      status: service.status,
      serviceDate: service.serviceDate,
      dueDate: service.dueDate,
      odometer: service.odometer ?? service.dueMileage ?? null,
      invoiceNumber: service.invoiceNumber || null,
      notes: service.notes || null,
      priority: service.priority,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt
    };

    if (!map.has(unitKey)) {
      map.set(unitKey, []);
    }
    map.get(unitKey).push(normalized);
  });
  return map;
};

const mapVehicleToUnit = (vehicle, servicesByUnit) => {
  const makeModel = [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim();
  const name = makeModel || vehicle.make || vehicle.model || "Truck";
  const status = deriveStatusFromVehicle(vehicle.status);
  const unitNo = vehicle.internalId || vehicle.plateNumber || vehicle._id.toString();
  const services = servicesByUnit.get(unitNo) || [];
  services.sort((a, b) => new Date(b.serviceDate || b.createdAt || 0) - new Date(a.serviceDate || a.createdAt || 0));
  const lastService = services.find((svc) => svc.status === "completed") || null;
  const upcomingService = services.find((svc) => svc.status !== "completed") || null;

  // Ensure currentLocation always exists with proper structure
  const currentLocation = vehicle.currentLocation || {};
  const location = {
    address: currentLocation.address || "",
    latitude: currentLocation.latitude ? String(currentLocation.latitude) : "0",
    longitude: currentLocation.longitude ? String(currentLocation.longitude) : "0",
    updatedAt: currentLocation.updatedAt || vehicle.updatedAt || vehicle.createdAt || new Date()
  };

  return {
    _id: `vehicle-${vehicle._id}`,
    unitNo,
    internalId: vehicle.internalId,
    unitType: "Truck",
    makeModel: name,
    make: vehicle.make,
    model: vehicle.model,
    vinNo: vehicle.vinNumber,
    licensePlate: vehicle.plateNumber,
    year: vehicle.year,
    truckType: vehicle.details?.vehicleType || "Truck",
    trailerType: undefined,
    capacity: vehicle.capacity,
    initialOdometer: vehicle.odometer || 0,
    currentOdometer: vehicle.odometer || 0,
    status,
    operationStatus: vehicle.status || "idle",
    currentLocation: location,
    speed: vehicle.speed || 0,
    fuelLevel: vehicle.fuelLevel || 0,
    odometer: vehicle.odometer || 0,
    engineOn: vehicle.engineOn || false,
    lastDate: undefined,
    reason: undefined,
    safetyExpiryDate: vehicle.safetyExpiryDate,
    safetyDecalNumber: vehicle.safetyDecalNumber,
    safetyPaperNumber: vehicle.safetyPaperNumber,
    lastInspectionShop: vehicle.lastInspectionShop,
    lastInspectionInvoice: vehicle.lastInspectionInvoice,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
    source: "vehicle",
    referenceId: vehicle._id.toString(),
    referenceType: "vehicle",
    lastService,
    upcomingService,
    serviceHistory: services
  };
};

const mapTrailerToUnit = (trailer, servicesByUnit) => {
  const mappedType = trailerTypeMap[trailer.type] || "Trailer";
  const status = deriveStatusFromVehicle(trailer.status);
  const unitNo = trailer.trailer || trailer.internalId || trailer.plateNumber || trailer._id.toString();
  const services = servicesByUnit.get(unitNo) || [];
  services.sort((a, b) => new Date(b.serviceDate || b.createdAt || 0) - new Date(a.serviceDate || a.createdAt || 0));
  const lastService = services.find((svc) => svc.status === "completed") || null;
  const upcomingService = services.find((svc) => svc.status !== "completed") || null;

  // Ensure currentLocation always exists with proper structure
  const currentLocation = trailer.currentLocation || {};
  const location = {
    address: currentLocation.address || "",
    latitude: currentLocation.latitude ? String(currentLocation.latitude) : "0",
    longitude: currentLocation.longitude ? String(currentLocation.longitude) : "0",
    updatedAt: currentLocation.updatedAt || trailer.updatedAt || trailer.createdAt || new Date()
  };

  return {
    _id: `trailer-${trailer._id}`,
    unitNo,
    internalId: trailer.internalId,
    unitType: mappedType,
    makeModel: trailer.trailer || mappedType,
    make: undefined,
    model: undefined,
    vinNo: trailer.internalId || trailer.plateNumber || trailer._id.toString(),
    licensePlate: trailer.plateNumber || "",
    year: undefined,
    truckType: undefined,
    trailerType: mappedType,
    capacity: trailer.capacity,
    initialOdometer: 0,
    currentOdometer: 0,
    status,
    operationStatus: trailer.operationStatus || trailer.status || "idle",
    currentLocation: location,
    speed: trailer.speed || 0,
    lastDate: undefined,
    reason: undefined,
    safetyExpiryDate: trailer.safetyExpiryDate,
    safetyDecalNumber: trailer.safetyDecalNumber,
    safetyPaperNumber: trailer.safetyPaperNumber,
    lastInspectionShop: trailer.lastInspectionShop,
    lastInspectionInvoice: trailer.lastInspectionInvoice,
    createdAt: trailer.createdAt,
    updatedAt: trailer.updatedAt,
    source: "trailer",
    referenceId: trailer._id.toString(),
    referenceType: "trailer",
    lastService,
    upcomingService,
    serviceHistory: services
  };
};

const applyFilters = (units, { search, status, category }) => {
  return units.filter((unit) => {
    const matchesCategory =
      category === "all"
        ? true
        : category === "trucks"
          ? unit.unitType === "Truck"
          : unit.unitType !== "Truck";

    const matchesStatus =
      !status || status === "all"
        ? true
        : status === "active"
          ? unit.status === "Active"
          : unit.status === "Inactive";

    const matchesSearch = search
      ? [unit.unitNo, unit.makeModel, unit.licensePlate, unit.vinNo]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(search.toLowerCase()))
      : true;

    return matchesCategory && matchesStatus && matchesSearch;
  });
};

export const listFleetUnits = async (req, res) => {
  try {
    const { search = "", status, category = "all" } = req.query;
    const { companyId, isSuperadmin } = ensureCompanyContext(req);

    if (!isSuperadmin && !companyId) {
      return res.status(200).json({
        success: true,
        message: "Please complete company settings first to view fleet units. Go to Company Settings to set up your company.",
        data: [],
        summary: { ...DEFAULT_SUMMARY },
        requiresCompanySetup: true
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    const fleetFilter = baseFilter ? { ...baseFilter } : {};

    const serviceFilter = baseFilter ? { ...baseFilter } : {};

    const [customUnits, vehicles, trailers, services] = await Promise.all([
      FleetUnit.find(fleetFilter).sort({ createdAt: -1 }).lean(),
      Vehicle.find(baseFilter || {}).lean(),
      Trailer.find(baseFilter || {}).lean(),
      VehicleService.find(serviceFilter)
        .populate("vehicleId", "internalId plateNumber make model company")
        .lean()
    ]);

    const servicesByUnit = buildServicesByUnit(services);

    const combined = [
      ...customUnits.map((unit) => mapCustomFleetUnit(unit, servicesByUnit)),
      ...vehicles.map((vehicle) => mapVehicleToUnit(vehicle, servicesByUnit)),
      ...trailers.map((trailer) => mapTrailerToUnit(trailer, servicesByUnit))
    ];

    combined.sort((a, b) => {
      const aDate = new Date(a.createdAt || a.updatedAt || 0).getTime();
      const bDate = new Date(b.createdAt || b.updatedAt || 0).getTime();
      return bDate - aDate;
    });

    const filteredUnits = applyFilters(combined, { search, status, category });
    const summary = buildSummary(combined);

    return res.json({
      success: true,
      data: filteredUnits,
      summary
    });
  } catch (error) {
    console.error("❌ Error listing fleet units:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch fleet units",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const createFleetUnit = async (req, res) => {
  try {
    const { companyId, isSuperadmin } = ensureCompanyContext(req);

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first before creating fleet units."
      });
    }

    const requiredFields = ["unitNo", "unitType", "makeModel", "vinNo", "licensePlate", "initialOdometer"];
    const missing = requiredFields.filter((field) => !req.body[field]);
    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`
      });
    }

    const uniqueQuery = { unitNo: req.body.unitNo };
    const uniqueVinQuery = { vinNo: req.body.vinNo };
    const uniquePlateQuery = { licensePlate: req.body.licensePlate };
    const uniqueInternalIdQuery = req.body.internalId ? { internalId: req.body.internalId } : null;
    if (companyId) {
      uniqueQuery.company = companyId;
      uniqueVinQuery.company = companyId;
      uniquePlateQuery.company = companyId;
      if (uniqueInternalIdQuery) {
        uniqueInternalIdQuery.company = companyId;
      }
    }

    const duplicateQueries = [uniqueQuery, uniqueVinQuery, uniquePlateQuery];
    if (uniqueInternalIdQuery) {
      duplicateQueries.push(uniqueInternalIdQuery);
    }

    const duplicate = await FleetUnit.findOne({
      $or: duplicateQueries
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "Fleet unit with the same unit number, internal ID, VIN, or license plate already exists."
      });
    }

    // Enforce subscription truck limit (skip for superadmin)
    if (!isSuperadmin) {
      const subscription = await Subscription.findOne({
        admin: req.user._id,
        status: 'active'
      }).populate('plan');

      if (!subscription) {
        return res.status(403).json({
          success: false,
          message: 'No active subscription found'
        });
      }

      const plan = subscription.plan;
      if (
        plan?.planType === 'monthly' &&
        ['1-month', '6-months', '1-year'].includes(subscription.subscriptionType)
      ) {
        const usedTrucks = await FleetUnit.countDocuments({ company: companyId });
        if (subscription.maxTrucks <= usedTrucks) {
          return res.status(400).json({
            success: false,
            message: 'Truck limit reached. You have used all ' + subscription.maxTrucks + ' trucks allowed by your plan. Please purchase additional trucks from the Subscription page.',
            code: 'TRUCK_LIMIT_REACHED',
            maxTrucks: subscription.maxTrucks,
            usedTrucks: usedTrucks
          });
        }
      }
    }

    // Get coordinates from address if provided
    let currentLocation = undefined;
    if (req.body.address && req.body.address.trim()) {
      try {
        const coordinates = await getCoordinatesFromAddress(req.body.address);
        if (coordinates.latitude && coordinates.longitude) {
          currentLocation = {
            address: req.body.address.trim(),
            latitude: coordinates.latitude.toString(),
            longitude: coordinates.longitude.toString(),
            updatedAt: new Date()
          };
        }
      } catch (coordError) {
        console.error('Error fetching coordinates from address:', coordError);
        // Continue without coordinates if geocoding fails
        currentLocation = {
          address: req.body.address.trim(),
          latitude: '',
          longitude: '',
          updatedAt: new Date()
        };
      }
    }

    const payload = normalizeUnitPayload(req.body, req.user?._id, companyId);
    
    // Add currentLocation to payload if we have it
    if (currentLocation) {
      payload.currentLocation = currentLocation;
    }

    const unit = await FleetUnit.create(payload);

    // Fetch documents for this fleet unit (will be empty for new units, but included for consistency)
    let documents = [];
    try {
      const unitDocuments = await VehicleDocuments.find({ fleetUnitId: unit._id })
        .select('_id documentType documentNumber expiryDate issuedAt status files createdAt updatedAt')
        .lean();
      documents = unitDocuments || [];
    } catch (docError) {
      console.error('Error fetching documents for fleet unit:', docError);
      // Continue without documents if fetch fails
    }

    // Convert unit to plain object and add documents
    const unitData = unit.toObject ? unit.toObject() : unit;
    unitData.documents = documents;

    return res.status(201).json({
      success: true,
      message: "Fleet unit created successfully",
      data: unitData
    });
  } catch (error) {
    console.error("❌ Error creating fleet unit:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create fleet unit",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const updateFleetUnit = async (req, res) => {
  try {
    const { companyId, isSuperadmin } = ensureCompanyContext(req);
    const { id: parsedId, source } = parseIdWithSource(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(parsedId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid fleet unit identifier"
      });
    }

    if (source === "vehicle") {
      const vehicle = await Vehicle.findById(parsedId);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: "Vehicle not found" });
      }
      const accessError = ensureAccess(vehicle, companyId, isSuperadmin, "vehicle");
      if (accessError) {
        return res.status(accessError.status).json({ success: false, message: accessError.message });
      }
      const payload = normalizeUnitPayload(req.body, req.user?._id, companyId, vehicle);
      applyVehicleUpdates(vehicle, payload);
      await vehicle.save();

      return res.json({
        success: true,
        message: "Vehicle updated successfully",
        data: mapVehicleToUnit(vehicle)
      });
    }

    if (source === "trailer") {
      const trailer = await Trailer.findById(parsedId);
      if (!trailer) {
        return res.status(404).json({ success: false, message: "Trailer not found" });
      }
      const accessError = ensureAccess(trailer, companyId, isSuperadmin, "trailer");
      if (accessError) {
        return res.status(accessError.status).json({ success: false, message: accessError.message });
      }
      const payload = normalizeUnitPayload(req.body, req.user?._id, companyId, trailer);
      applyTrailerUpdates(trailer, payload);
      await trailer.save();

      return res.json({
        success: true,
        message: "Trailer updated successfully",
        data: mapTrailerToUnit(trailer)
      });
    }

    const unit = await FleetUnit.findById(parsedId);
    if (!unit) {
      return res.status(404).json({ success: false, message: "Fleet unit not found" });
    }

    const accessError = ensureAccess(unit, companyId, isSuperadmin, "fleet unit");
    if (accessError) {
      return res.status(accessError.status).json({ success: false, message: accessError.message });
    }

    // Get coordinates from address if provided and changed
    let currentLocation = undefined;
    if (req.body.address !== undefined && req.body.address.trim()) {
      const addressChanged = req.body.address.trim() !== (unit.currentLocation?.address || '');
      if (addressChanged) {
        try {
          const coordinates = await getCoordinatesFromAddress(req.body.address);
          if (coordinates.latitude && coordinates.longitude) {
            currentLocation = {
              address: req.body.address.trim(),
              latitude: coordinates.latitude.toString(),
              longitude: coordinates.longitude.toString(),
              updatedAt: new Date()
            };
          }
        } catch (coordError) {
          console.error('Error fetching coordinates from address:', coordError);
          // Continue without coordinates if geocoding fails
          currentLocation = {
            address: req.body.address.trim(),
            latitude: '',
            longitude: '',
            updatedAt: new Date()
          };
        }
      }
    }

    const payload = normalizeUnitPayload(req.body, req.user?._id, companyId, unit);
    
    // Add currentLocation to payload if we have it
    if (currentLocation) {
      payload.currentLocation = currentLocation;
    }

    Object.assign(unit, payload);
    await unit.save();

    // Fetch documents for this fleet unit
    let documents = [];
    try {
      const unitDocuments = await VehicleDocuments.find({ fleetUnitId: unit._id })
        .select('_id documentType documentNumber expiryDate issuedAt status files createdAt updatedAt')
        .lean();
      documents = unitDocuments || [];
    } catch (docError) {
      console.error('Error fetching documents for fleet unit:', docError);
      // Continue without documents if fetch fails
    }

    // Convert unit to plain object and add documents
    const unitData = unit.toObject ? unit.toObject() : unit;
    unitData.documents = documents;

    return res.json({
      success: true,
      message: "Fleet unit updated successfully",
      data: unitData
    });
  } catch (error) {
    console.error("❌ Error updating fleet unit:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update fleet unit",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const deleteFleetUnit = async (req, res) => {
  try {
    const { companyId, isSuperadmin } = ensureCompanyContext(req);
    const { id: parsedId, source } = parseIdWithSource(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(parsedId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid fleet unit identifier"
      });
    }

    if (source === "vehicle") {
      const vehicle = await Vehicle.findById(parsedId);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: "Vehicle not found" });
      }
      const accessError = ensureAccess(vehicle, companyId, isSuperadmin, "vehicle");
      if (accessError) {
        return res.status(accessError.status).json({ success: false, message: accessError.message });
      }
      await Vehicle.findByIdAndDelete(parsedId);
      return res.json({
        success: true,
        message: "Vehicle deleted successfully"
      });
    }

    if (source === "trailer") {
      const trailer = await Trailer.findById(parsedId);
      if (!trailer) {
        return res.status(404).json({ success: false, message: "Trailer not found" });
      }
      const accessError = ensureAccess(trailer, companyId, isSuperadmin, "trailer");
      if (accessError) {
        return res.status(accessError.status).json({ success: false, message: accessError.message });
      }
      await Trailer.findByIdAndDelete(parsedId);
      return res.json({
        success: true,
        message: "Trailer deleted successfully"
      });
    }

    const unit = await FleetUnit.findById(parsedId);
    if (!unit) {
      return res.status(404).json({ success: false, message: "Fleet unit not found" });
    }

    const accessError = ensureAccess(unit, companyId, isSuperadmin, "fleet unit");
    if (accessError) {
      return res.status(accessError.status).json({ success: false, message: accessError.message });
    }

    await FleetUnit.findByIdAndDelete(unit._id);

    return res.json({
      success: true,
      message: "Fleet unit deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting fleet unit:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete fleet unit",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const getFleetUnitById = async (req, res) => {
  try {
    const { companyId, isSuperadmin } = ensureCompanyContext(req);
    const { id: parsedId, source } = parseIdWithSource(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(parsedId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid fleet unit identifier"
      });
    }

    if (source === "vehicle") {
      const vehicle = await Vehicle.findById(parsedId);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: "Vehicle not found" });
      }
      const accessError = ensureAccess(vehicle, companyId, isSuperadmin, "vehicle");
      if (accessError) {
        return res.status(accessError.status).json({ success: false, message: accessError.message });
      }
      return res.json({ success: true, data: mapVehicleToUnit(vehicle) });
    }

    if (source === "trailer") {
      const trailer = await Trailer.findById(parsedId);
      if (!trailer) {
        return res.status(404).json({ success: false, message: "Trailer not found" });
      }
      const accessError = ensureAccess(trailer, companyId, isSuperadmin, "trailer");
      if (accessError) {
        return res.status(accessError.status).json({ success: false, message: accessError.message });
      }
      return res.json({ success: true, data: mapTrailerToUnit(trailer) });
    }

    const query = { _id: parsedId };
    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned to the current admin."
        });
      }
      query.company = companyId;
    }

    const unit = await FleetUnit.findOne(query);
    if (!unit) {
      return res.status(404).json({ success: false, message: "Fleet unit not found" });
    }

    // Fetch documents for this fleet unit
    let documents = [];
    try {
      const unitDocuments = await VehicleDocuments.find({ fleetUnitId: unit._id })
        .select('_id documentType documentNumber expiryDate issuedAt status files createdAt updatedAt')
        .lean();
      documents = unitDocuments || [];
    } catch (docError) {
      console.error('Error fetching documents for fleet unit:', docError);
      // Continue without documents if fetch fails
    }

    // Convert unit to plain object and add documents
    const unitData = unit.toObject ? unit.toObject() : unit;
    unitData.documents = documents;

    return res.json({
      success: true,
      data: unitData
    });
  } catch (error) {
    console.error("❌ Error fetching fleet unit:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch fleet unit",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Initialize locations for all FleetUnits (set default structure if missing)
export const initializeAllVehicleLocations = async (req, res) => {
  try {
    const { companyId, isSuperadmin } = ensureCompanyContext(req);

    // Only superadmin or users with company can initialize locations
    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    console.log('🔄 Initializing locations for all vehicles...');
    
    // Initialize locations for all FleetUnits
    const result = await initializeAllFleetUnitLocations();

    if (result.success) {
      return res.json({
        success: true,
        message: `Location initialization completed: ${result.initialized} initialized, ${result.skipped} skipped`,
        data: {
          total: result.total,
          initialized: result.initialized,
          skipped: result.skipped
        }
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Failed to initialize locations",
        error: result.error
      });
    }
  } catch (error) {
    console.error("❌ Error initializing all vehicle locations:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to initialize vehicle locations",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};


