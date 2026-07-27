import { VehicleService } from "../../models/driver/vehicleService.js";
import { Vehicle } from "../../models/driver/vehicleModel.js";
import { FleetUnit } from "../../models/fleet/fleetUnitModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// Service intervals in KM (when to schedule next service)
const SERVICE_INTERVALS = {
  "oil-change": 10000,
  "dpf-filter": 12000,
  "valve-adjustment": 50000,
  "radiator-change": 60000,
  "oil-pump": 70000,
  "coolant-filter": 20000,
  "after-treatment-system": 30000,
  "transmission-service": 40000,
  "brake-inspection": 20000,
  "tire-rotation": 15000,
  "general-maintenance": 25000,
  "other": 30000,
  "inspection": 365 // days
};

// Mapping from vehicle model's lastService field names (camelCase) to serviceType (hyphen-case)
const SERVICE_KEY_TO_TYPE = {
  oilChange: "oil-change",
  dpfFilter: "dpf-filter",
  valveAdjustment: "valve-adjustment",
  radiatorChange: "radiator-change",
  oilPump: "oil-pump",
  coolantFilter: "coolant-filter",
  afterTreatmentSystem: "after-treatment-system",
  transmissionService: "transmission-service",
  brakeInspection: "brake-inspection",
  tireRotation: "tire-rotation",
  generalMaintenance: "general-maintenance",
  other: "other",
  inspection: "inspection"
};

// {
//   "vehicleId": "67100d48f2e54b1e8b7e55d2",
//   "serviceType": "oil-change",
//   "priority": "high",
//   "dueDate": "2025-10-25",
//   "dueMileage": 15000,
//   "assignedMechanic": "67100d55f2e54b1e8b7e55f1",
//   "description": "Engine oil due for replacement"
// }

// ✅ Calculate upcoming services based on lastService and odometer
const calculateUpcomingServices = (vehicle) => {
  const upcomingServices = [];
  const currentOdometer = vehicle.odometer || 0;
  
  Object.keys(vehicle.lastService || {}).forEach(serviceKey => {
    const serviceType = SERVICE_KEY_TO_TYPE[serviceKey];
    const lastServiceData = vehicle.lastService[serviceKey];
    
    if (serviceType && lastServiceData && lastServiceData.mileage) {
      const lastMileage = lastServiceData.mileage || 0;
      const interval = SERVICE_INTERVALS[serviceType];
      
      if (interval && interval !== 365) { // Skip inspection (days, not km)
        const nextMileage = lastMileage + interval;
        const remainingKm = nextMileage - currentOdometer;
        const dueDate = new Date(lastServiceData.date || Date.now());
        dueDate.setDate(dueDate.getDate() + 90); // 90 days default
        
        upcomingServices.push({
          serviceType: serviceType,
          status: remainingKm < 0 ? "overdue" : "upcoming",
          dueDate: dueDate,
          dueMileage: nextMileage
        });
      }
    }
  });
  
  return upcomingServices;
};

// ✅ CREATE SERVICE
export const createVehicleService = async (req, res) => {
  try {
    console.log("🚀 CREATE VEHICLE SERVICE API CALLED");
    console.log("📝 Request Body:", req.body);
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating vehicle services. Go to Company Settings to set up your company."
        });
      }
    }
    
    const {
      vehicleId,
      unitNumber,
      unitType,
      makeModel,
      serviceType,
      priority,
      dueDate,
      dueMileage,
      assignedMechanic,
      description,
      status,
      serviceDate,
      odometer,
      parts,
      notes,
      serviceProvider,
      invoiceNumber,
      estimatedCost,
      estimatedTime,
      amount,
      mechanicType,
      externalMechanicName,
      externalMechanicCompany,
      externalMechanicPhone,
      externalMechanicEmail,
    } = req.body;

    let vehicle = null;
    let resolvedVehicleId = vehicleId;

    if (resolvedVehicleId) {
      console.log("🔍 Validating vehicle ID:", resolvedVehicleId);
      vehicle = await Vehicle.findById(resolvedVehicleId);
      if (!vehicle) {
        console.log("❌ Vehicle not found:", resolvedVehicleId);
        return res.status(404).json({ success: false, message: "Vehicle not found" });
      }
    }

    let fleetUnit = null;
    
    if (!vehicle && unitNumber) {
      // Try to find in Vehicle model first
      vehicle = await Vehicle.findOne({ internalId: unitNumber });
      if (vehicle) {
        resolvedVehicleId = vehicle._id;
      } else {
        // Try to find in FleetUnit model
        fleetUnit = await FleetUnit.findOne({ unitNo: unitNumber });
      }
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin) {
      if (!companyId && !vehicle?.company && !fleetUnit?.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating vehicle services. Go to Company Settings to set up your company."
        });
      }
      if (vehicle && companyId && vehicle.company && vehicle.company.toString() !== companyId.toString()) {
        return res.status(403).json({ success: false, message: "You do not have permission to create services for this vehicle." });
      }
      if (fleetUnit && companyId && fleetUnit.company && fleetUnit.company.toString() !== companyId.toString()) {
        return res.status(403).json({ success: false, message: "You do not have permission to create services for this unit." });
      }
    }

    const resolvedUnitNumber = unitNumber || vehicle?.internalId || vehicle?.plateNumber || fleetUnit?.unitNo;
    if (!resolvedUnitNumber) {
      return res.status(400).json({ success: false, message: "Unit number is required for scheduled services." });
    }

    const resolvedUnitType = unitType || fleetUnit?.unitType || (vehicle ? "Truck" : null);
    const resolvedMakeModel = makeModel || fleetUnit?.makeModel || (vehicle ? `${vehicle.make || ""} ${vehicle.model || ""}`.trim() : null);

    const parsedDueMileage = dueMileage !== undefined ? Number(dueMileage) : null;
    const parsedOdometer = odometer !== undefined ? Number(odometer) : null;
    const parsedDueDate = dueDate ? new Date(dueDate) : null;
    const parsedServiceDate = serviceDate ? new Date(serviceDate) : null;

    const newService = new VehicleService({
      vehicleId: vehicle ? vehicle._id : resolvedVehicleId,
      serviceType,
      priority,
      dueDate: parsedDueDate || parsedServiceDate || new Date(),
      dueMileage: parsedDueMileage ?? parsedOdometer ?? 0,
      assignedMechanic: mechanicType === 'external' ? null : ((assignedMechanic && String(assignedMechanic).trim() !== "") ? String(assignedMechanic).trim() : "Fleet Team"),
      description: description || null,
      status: status || "pending",
      unitNumber: resolvedUnitNumber,
      unitType: resolvedUnitType,
      makeModel: resolvedMakeModel,
      serviceDate: parsedServiceDate,
      odometer: parsedOdometer,
      parts: (() => {
        // Accept both array and string formats for backward compatibility
        if (Array.isArray(parts) && parts.length > 0) {
          return parts;
        } else if (typeof parts === 'string' && parts.trim() !== '') {
          return parts.trim();
        }
        return null;
      })(),
      notes: (notes !== undefined && notes !== null && notes !== '') ? notes : null,
      serviceProvider: (serviceProvider !== undefined && serviceProvider !== null && serviceProvider !== '') ? serviceProvider : null,
      invoiceNumber: (invoiceNumber !== undefined && invoiceNumber !== null && invoiceNumber !== '') ? invoiceNumber : null,
      estimatedCost: (estimatedCost !== undefined && estimatedCost !== null) ? estimatedCost : null,
      estimatedTime: (estimatedTime !== undefined && estimatedTime !== null && estimatedTime !== '') ? estimatedTime : null,
      amount: (amount !== undefined && amount !== null && amount !== '') ? Number(amount) : null,
      mechanicType: mechanicType || 'internal',
      externalMechanicName: externalMechanicName || null,
      externalMechanicCompany: externalMechanicCompany || null,
      externalMechanicPhone: externalMechanicPhone || null,
      externalMechanicEmail: externalMechanicEmail || null,
      company: companyId || vehicle?.company || fleetUnit?.company || null
    });

    console.log("💾 Saving new service:", newService);
    await newService.save();
    console.log("✅ Service created successfully:", newService._id);
    
    // Ensure amount is included in response even if null
    const responseData = newService.toObject();
    if (responseData.amount === undefined) {
      responseData.amount = null;
    }
    
    res
      .status(201)
      .json({ success: true, message: "Service created successfully", data: responseData });
  } catch (error) {
    console.log("❌ CREATE SERVICE ERROR:", error.message);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// ✅ UPDATE SERVICE (full update)
export const updateVehicleService = async (req, res) => {
  try {
    console.log("🚀 UPDATE VEHICLE SERVICE API CALLED");
    console.log("📝 Service ID:", req.params.id);
    console.log("📝 Update Data:", req.body);
    
    const { id } = req.params;
    const {
      vehicleId,
      unitNumber,
      unitType,
      makeModel,
      serviceType,
      priority,
      dueDate,
      dueMileage,
      assignedMechanic,
      description,
      status,
      serviceDate,
      odometer,
      parts,
      notes,
      serviceProvider,
      invoiceNumber,
      estimatedCost,
      estimatedTime,
      amount,
      mechanicType,
      externalMechanicName,
      externalMechanicCompany,
      externalMechanicPhone,
      externalMechanicEmail,
    } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const existingService = await VehicleService.findById(id);

    if (!existingService) {
      console.log("❌ Service not found:", id);
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    // Check if user is a mechanic - mechanics can only update services assigned to them
    const isMechanic = req.user?.role === 'Maintenance Crew (Mechanics)';
    const mechanicId = req.user?._id?.toString();

    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
      }
      if (existingService.company && existingService.company.toString() !== companyId) {
        return res.status(403).json({ success: false, message: "You do not have permission to modify this service." });
      }
      
      // Mechanics can only update services assigned to them
      if (isMechanic && mechanicId) {
        const assignedMechanicId = existingService.assignedMechanic?.toString();
        if (assignedMechanicId !== mechanicId) {
          return res.status(403).json({ 
            success: false, 
            message: "You can only update services assigned to you." 
          });
        }
      }
    }

    // Build update object with all fields
    const updateData = {};
    if (vehicleId !== undefined) updateData.vehicleId = vehicleId || null;
    if (serviceType !== undefined) updateData.serviceType = serviceType;
    if (priority !== undefined) updateData.priority = priority;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (dueMileage !== undefined) updateData.dueMileage = dueMileage;
    if (assignedMechanic !== undefined || mechanicType !== undefined) {
      const resolvedType = mechanicType ?? existingService.mechanicType;
      updateData.assignedMechanic = resolvedType === 'external' ? null : ((assignedMechanic && String(assignedMechanic).trim() !== "") ? String(assignedMechanic).trim() : "Fleet Team");
    }
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;

    if (unitNumber !== undefined) updateData.unitNumber = (unitNumber !== null && unitNumber !== '') ? unitNumber : null;
    if (unitType !== undefined) updateData.unitType = (unitType !== null && unitType !== '') ? unitType : null;
    if (makeModel !== undefined) updateData.makeModel = (makeModel !== null && makeModel !== '') ? makeModel : null;
    if (serviceDate !== undefined) updateData.serviceDate = (serviceDate !== null && serviceDate !== '') ? new Date(serviceDate) : null;
    if (odometer !== undefined) updateData.odometer = (odometer !== null && odometer !== '') ? Number(odometer) : null;
    if (parts !== undefined) {
      // Accept both array and string formats for backward compatibility
      if (Array.isArray(parts) && parts.length > 0) {
        updateData.parts = parts;
      } else if (typeof parts === 'string' && parts.trim() !== '') {
        updateData.parts = parts.trim();
      } else {
        updateData.parts = null;
      }
    }
    if (notes !== undefined) updateData.notes = (notes !== null && notes !== '') ? notes : null;
    if (serviceProvider !== undefined) updateData.serviceProvider = (serviceProvider !== null && serviceProvider !== '') ? serviceProvider : null;
    if (invoiceNumber !== undefined) updateData.invoiceNumber = (invoiceNumber !== null && invoiceNumber !== '') ? invoiceNumber : null;
    if (estimatedCost !== undefined) updateData.estimatedCost = (estimatedCost !== null) ? estimatedCost : null;
    if (estimatedTime !== undefined) updateData.estimatedTime = (estimatedTime !== null && estimatedTime !== '') ? estimatedTime : null;
    if (amount !== undefined) updateData.amount = (amount !== null && amount !== '') ? Number(amount) : null;
    if (mechanicType !== undefined) updateData.mechanicType = mechanicType || 'internal';
    if (externalMechanicName !== undefined) updateData.externalMechanicName = externalMechanicName || null;
    if (externalMechanicCompany !== undefined) updateData.externalMechanicCompany = externalMechanicCompany || null;
    if (externalMechanicPhone !== undefined) updateData.externalMechanicPhone = externalMechanicPhone || null;
    if (externalMechanicEmail !== undefined) updateData.externalMechanicEmail = externalMechanicEmail || null;

    const updatedService = await VehicleService.findByIdAndUpdate(id, updateData, {
      new: true,
    }).populate("vehicleId", "internalId plateNumber model make year vinNumber status odometer");

    console.log("✅ Service updated successfully:", id);
    
    // Ensure amount is included in response even if null
    const responseData = updatedService.toObject();
    if (responseData.amount === undefined) {
      responseData.amount = null;
    }
    
    res.json({
      success: true,
      message: "Service updated successfully",
      data: responseData,
    });
  } catch (error) {
    console.log("❌ UPDATE SERVICE ERROR:", error.message);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

//  UPDATE SERVICE STATUS
export const updateServiceStatus = async (req, res) => {
  try {
    console.log("🚀 UPDATE SERVICE STATUS API CALLED");
    console.log("📝 Service ID:", req.params.id);
    console.log("📝 New Status:", req.body.status);
    console.log("📝 Additional Data:", req.body);
    
    const { id } = req.params;
    const { status, performedBy, notes } = req.body;

    if (!["pending", "in-progress", "completed"].includes(status)) {
      console.log("❌ Invalid status value:", status);
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const updatedService = await VehicleService.findById(id).populate("vehicleId");
    if (!updatedService) {
      console.log("❌ Service not found:", id);
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    // Check if user is a mechanic - mechanics can only update services assigned to them
    const isMechanic = req.user?.role === 'Maintenance Crew (Mechanics)';
    const mechanicId = req.user?._id?.toString();

    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
      }
      if (updatedService.company && updatedService.company.toString() !== companyId) {
        return res.status(403).json({ success: false, message: "You do not have permission to modify this service." });
      }
      
      // Mechanics can only update services assigned to them
      if (isMechanic && mechanicId) {
        const assignedMechanicId = updatedService.assignedMechanic?.toString();
        if (assignedMechanicId !== mechanicId) {
          return res.status(403).json({ 
            success: false, 
            message: "You can only update services assigned to you." 
          });
        }
      }
    }

    // Update service status
    updatedService.status = status;
    await updatedService.save();

    // ✅ If service is completed, update vehicle's lastService and serviceHistory
    if (status === "completed") {
      const vehicle = updatedService.vehicleId;
      const serviceType = updatedService.serviceType;
      const currentOdometer = vehicle.odometer || 0;
      
      // Convert hyphen-case serviceType to camelCase serviceKey
      const serviceKey = Object.keys(SERVICE_KEY_TO_TYPE).find(
        key => SERVICE_KEY_TO_TYPE[key] === serviceType
      );
      
      console.log(`🔧 Updating vehicle ${vehicle.internalId} with completed ${serviceType} service`);

      // Ensure lastService exists
      if (!vehicle.lastService) {
        vehicle.lastService = {};
      }

      // Update lastService (create if doesn't exist)
      if (serviceKey) {
        if (!vehicle.lastService[serviceKey]) {
          vehicle.lastService[serviceKey] = {};
        }
        vehicle.lastService[serviceKey].mileage = currentOdometer;
        vehicle.lastService[serviceKey].date = new Date();
      }

      // Add to serviceHistory
      const historyEntry = {
        serviceType: serviceType,
        status: "completed",
        performedBy: performedBy || req.user?._id,
        performedAt: new Date(),
        mileageAtService: currentOdometer,
        notes: notes || ""
      };
      
      if (!vehicle.serviceHistory) {
        vehicle.serviceHistory = [];
      }
      vehicle.serviceHistory.push(historyEntry);

      // Recalculate upcoming services
      vehicle.upcomingServices = calculateUpcomingServices(vehicle);
      
      await vehicle.save();
      console.log("✅ Vehicle service history and upcoming services updated");
    }

    console.log("✅ Service status updated successfully:", id);
    res.json({
      success: true,
      message: "Service status updated successfully",
      data: updatedService,
    });
  } catch (error) {
    console.log("❌ UPDATE STATUS ERROR:", error.message);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// ✅ DELETE SERVICE
export const deleteVehicleService = async (req, res) => {
  try {
    console.log("🚀 DELETE VEHICLE SERVICE API CALLED");
    console.log("📝 Service ID:", req.params.id);
    
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const service = await VehicleService.findById(id);
    if (!service) {
      console.log("❌ Service not found:", id);
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
      }
      if (service.company && service.company.toString() !== companyId) {
        return res.status(403).json({ success: false, message: "You do not have permission to delete this service." });
      }
    }

    await VehicleService.findByIdAndDelete(id);

    console.log("✅ Service deleted successfully:", id);
    res.json({ success: true, message: "Service deleted successfully" });
  } catch (error) {
    console.log("❌ DELETE SERVICE ERROR:", error.message);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// ✅ LIST SERVICES (with filters)
export const listVehicleServices = async (req, res) => {
  try {
    console.log("🚀 LIST VEHICLE SERVICES API CALLED");
    console.log("📝 Query Parameters:", req.query);
    
    const { priority, status, serviceType, mechanic, vehicleId, unitNumber } = req.query;
    const userRole = req.user?.role;
    const mechanicId = req.user?._id;

    const filter = {};
    if (priority) filter.priority = priority;
    if (status) filter.status = status;
    if (serviceType) filter.serviceType = serviceType;
    
    // Handle mechanic filter - assignedMechanic is stored as String (mechanic ID or name)
    // If user is a mechanic, automatically filter by their ID unless explicitly overridden
    if (userRole === 'Maintenance Crew (Mechanics)') {
      // Automatically filter by logged-in mechanic's ID
      const mechanicIdStr = String(mechanicId).trim();
      filter.assignedMechanic = mechanicIdStr;
      console.log("🔧 Auto-filtering by logged-in mechanic ID:", mechanicIdStr);
    } else if (mechanic) {
      // For admins/managers, use the mechanic parameter if provided
      const mechanicIdStr = String(mechanic).trim();
      filter.assignedMechanic = mechanicIdStr;
      console.log("🔧 Filtering by mechanic ID (from query):", mechanicIdStr);
    }
    
    if (vehicleId) filter.vehicleId = vehicleId;
    if (unitNumber) filter.unitNumber = unitNumber;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({ success: true, message: "No company assigned to the current admin.", count: 0, data: [] });
    }

    if (companyId) {
      filter.company = companyId;
    }

    console.log("🔍 Applied Filters:", JSON.stringify(filter, null, 2));

    // Debug: Check total services before filtering
    const totalServicesCount = await VehicleService.countDocuments({ ...(companyId ? { company: companyId } : {}) });
    console.log(`📊 Total services in database (company: ${companyId || 'all'}):`, totalServicesCount);
    
    // Debug: Check services with assignedMechanic
    if (mechanic) {
      const mechanicIdStr = String(mechanic).trim();
      const servicesWithMechanic = await VehicleService.find({ 
        ...(companyId ? { company: companyId } : {}),
        assignedMechanic: { $exists: true, $ne: null, $ne: "" }
      }).select("assignedMechanic").lean();
      console.log(`📋 Sample assignedMechanic values:`, servicesWithMechanic.slice(0, 5).map(s => s.assignedMechanic));
      console.log(`🔍 Looking for mechanic ID: "${mechanicIdStr}"`);
    }

    const services = await VehicleService.find(filter)
      .populate("vehicleId", "internalId plateNumber model make year vinNumber status odometer")
      .sort({ createdAt: -1 })
      .lean();
    
    // Also fetch FleetUnits for services that might reference them by unitNumber
    const unitNumbers = [...new Set(services.map(s => s.unitNumber).filter(Boolean))];
    const fleetUnits = unitNumbers.length > 0 
      ? await FleetUnit.find({ unitNo: { $in: unitNumbers }, ...(companyId ? { company: companyId } : {}) })
          .select("unitNo unitType makeModel currentOdometer company")
          .lean()
      : [];
    
    const fleetUnitsMap = new Map(fleetUnits.map(fu => [fu.unitNo, fu]));
    
    // Ensure all services have consistent structure with all fields
    const formattedServices = services.map(service => {
      // Use vehicle's internalId as fallback for unitNumber if not set
      let unitNumber = service.unitNumber || service.vehicleId?.internalId || null;
      
      // Try to get FleetUnit data if service references one
      const fleetUnit = unitNumber ? fleetUnitsMap.get(unitNumber) : null;
      
      // Use FleetUnit odometer, vehicle odometer, or service odometer as fallback
      const odometer = service.odometer || fleetUnit?.currentOdometer || service.vehicleId?.odometer || null;
      
      // Determine unitType from FleetUnit, service, or vehicle
      const unitType = service.unitType || fleetUnit?.unitType || (service.vehicleId ? "Truck" : null);
      
      // Determine makeModel from FleetUnit, service, or vehicle
      const makeModel = service.makeModel || fleetUnit?.makeModel || 
        [service.vehicleId?.make, service.vehicleId?.model].filter(Boolean).join(" ").trim() || null;
      
      return {
        _id: service._id,
        vehicleId: service.vehicleId,
        serviceType: service.serviceType,
        priority: service.priority,
        dueDate: service.dueDate,
        dueMileage: service.dueMileage,
        assignedMechanic: service.assignedMechanic || null,
        description: service.description || null,
        status: service.status,
        unitNumber: unitNumber,
        unitType: unitType,
        makeModel: makeModel,
        serviceDate: service.serviceDate || null,
        odometer: odometer,
        parts: service.parts || null,
        notes: service.notes || null,
        serviceProvider: service.serviceProvider || null,
        invoiceNumber: service.invoiceNumber || null,
        amount: service.amount !== undefined && service.amount !== null ? service.amount : null,
        estimatedCost: service.estimatedCost || null,
        estimatedTime: service.estimatedTime || null,
        mechanicType: service.mechanicType || 'internal',
        externalMechanicName: service.externalMechanicName || null,
        externalMechanicCompany: service.externalMechanicCompany || null,
        externalMechanicPhone: service.externalMechanicPhone || null,
        externalMechanicEmail: service.externalMechanicEmail || null,
        company: service.company,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
        __v: service.__v
      };
    });

    console.log("✅ Found services:", formattedServices.length);
    if (mechanic && formattedServices.length === 0) {
      console.log("⚠️ No services found for mechanic:", mechanic);
      console.log("💡 Tip: Make sure services are assigned to this mechanic when creating/updating them.");
    }
    res.json({
      success: true,
      count: formattedServices.length,
      data: formattedServices,
    });
  } catch (error) {
    console.log("❌ LIST SERVICES ERROR:", error.message);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// ✅ GET INCOMING MAINTENANCE COUNT (services due within 30 days)
export const getIncomingMaintenanceCount = async (req, res) => {
  try {
    console.log("🚀 GET INCOMING MAINTENANCE COUNT API CALLED");
    console.log("👤 User:", req.user?.email || req.user?.name || 'Unknown', "Role:", req.user?.role || 'Unknown');
    
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    console.log("🏢 Company ID:", companyId || 'None (superadmin or no company)');
    console.log("🔐 Is Superadmin:", isSuperadmin);

    if (!isSuperadmin && !companyId) {
      console.log("⚠️  User has no company - returning 0");
      return res.json({ 
        success: true, 
        count: 0,
        incomingMaintenance: 0,
        dueSoon: 0,
        overdue: 0
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    thirtyDaysFromNow.setHours(23, 59, 59, 999);

    // Build filter
    const filter = {
      status: { $in: ['pending', 'in-progress'] }
    };

    if (companyId) {
      filter.company = companyId;
      console.log("🔍 Filtering by company:", companyId);
    } else {
      console.log("🔍 No company filter (superadmin or all companies)");
    }

    // Get all pending and in-progress services
    const services = await VehicleService.find(filter)
      .populate("vehicleId", "internalId plateNumber odometer")
      .lean();

    console.log("📊 [INCOMING MAINTENANCE] Found services:", services.length);
    if (services.length > 0) {
      console.log("📊 [INCOMING MAINTENANCE] Sample service:", {
        unitNumber: services[0].unitNumber,
        status: services[0].status,
        dueDate: services[0].dueDate,
        dueMileage: services[0].dueMileage,
        odometer: services[0].odometer,
        vehicleOdometer: services[0].vehicleId?.odometer
      });
    }

    // Also get FleetUnits to check service intervals
    const unitNumbers = [...new Set(services.map(s => s.unitNumber).filter(Boolean))];
    const fleetUnits = unitNumbers.length > 0 
      ? await FleetUnit.find({ 
          unitNo: { $in: unitNumbers }, 
          ...(companyId ? { company: companyId } : {}) 
        })
          .select("unitNo serviceIntervalDays serviceIntervalMileage currentOdometer")
          .lean()
      : [];
    
    console.log("📊 [INCOMING MAINTENANCE] Found fleet units:", fleetUnits.length);
    
    const fleetUnitsMap = new Map(fleetUnits.map(fu => [fu.unitNo, fu]));

    // Calculate incoming maintenance
    let incomingCount = 0;
    let dueSoonCount = 0; // Due within 7 days
    let overdueCount = 0;

    services.forEach((service, index) => {
      let isIncoming = false;
      let isDueSoon = false;
      let isOverdue = false;
      const reasons = [];

      // Check by due date
      if (service.dueDate) {
        const dueDate = new Date(service.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilDue >= 0 && daysUntilDue <= 30) {
          isIncoming = true;
          reasons.push(`dueDate within 30 days (${daysUntilDue} days)`);
          if (daysUntilDue >= 0 && daysUntilDue <= 7) {
            isDueSoon = true;
            reasons.push(`due soon (${daysUntilDue} days)`);
          }
        }
        if (daysUntilDue < 0) {
          isOverdue = true;
          isIncoming = true; // Overdue is also incoming
          reasons.push(`overdue by ${Math.abs(daysUntilDue)} days`);
        } else if (daysUntilDue > 30) {
          reasons.push(`dueDate too far (${daysUntilDue} days)`);
        }
      } else {
        reasons.push('no dueDate');
      }

      // Check by mileage (within 7,500 km)
      // Use service odometer, vehicle odometer, or fleet unit odometer
      const serviceOdometer = service.odometer ?? service.vehicleId?.odometer ?? null;
      if (service.dueMileage && serviceOdometer !== null && serviceOdometer !== undefined) {
        const remainingKm = service.dueMileage - serviceOdometer;
        if (remainingKm >= 0 && remainingKm <= 7500) {
          isIncoming = true;
          reasons.push(`dueMileage within 7500 km (${remainingKm} km remaining)`);
        }
        if (remainingKm < 0) {
          isOverdue = true;
          isIncoming = true;
          reasons.push(`overdue by mileage (${Math.abs(remainingKm)} km)`);
        } else if (remainingKm > 7500) {
          reasons.push(`dueMileage too far (${remainingKm} km remaining)`);
        }
      } else {
        if (!service.dueMileage) reasons.push('no dueMileage');
        if (serviceOdometer === null || serviceOdometer === undefined) {
          reasons.push(`no odometer (service: ${service.odometer}, vehicle: ${service.vehicleId?.odometer})`);
        }
      }

      // Check using fleet unit service intervals if available
      const fleetUnit = service.unitNumber ? fleetUnitsMap.get(service.unitNumber) : null;
      if (fleetUnit) {
        // Check mileage interval
        if (fleetUnit.serviceIntervalMileage && fleetUnit.currentOdometer !== undefined && fleetUnit.currentOdometer !== null) {
          // Find last service date for this unit and service type
          // For now, use dueMileage if available, otherwise calculate from current odometer
          const lastServiceMileage = service.dueMileage 
            ? service.dueMileage - fleetUnit.serviceIntervalMileage 
            : fleetUnit.currentOdometer;
          const nextServiceMileage = lastServiceMileage + fleetUnit.serviceIntervalMileage;
          const remainingKm = nextServiceMileage - fleetUnit.currentOdometer;
          
          if (remainingKm >= 0 && remainingKm <= 7500) {
            isIncoming = true;
          }
          if (remainingKm < 0) {
            isOverdue = true;
            isIncoming = true;
          }
        }

        // Check days interval
        if (fleetUnit.serviceIntervalDays && service.serviceDate) {
          const lastServiceDate = new Date(service.serviceDate);
          const nextServiceDate = new Date(lastServiceDate);
          nextServiceDate.setDate(nextServiceDate.getDate() + fleetUnit.serviceIntervalDays);
          const daysUntilDue = Math.ceil((nextServiceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysUntilDue >= 0 && daysUntilDue <= 30) {
            isIncoming = true;
            if (daysUntilDue >= 0 && daysUntilDue <= 7) {
              isDueSoon = true;
            }
          }
          if (daysUntilDue < 0) {
            isOverdue = true;
            isIncoming = true;
          }
        }
      }

      if (isIncoming) {
        incomingCount++;
        console.log(`✅ [INCOMING MAINTENANCE] Service ${index + 1} (${service.unitNumber || 'N/A'}) is incoming:`, reasons.join(', '));
      } else if (index < 3) {
        // Log first 3 non-incoming services for debugging
        console.log(`❌ [INCOMING MAINTENANCE] Service ${index + 1} (${service.unitNumber || 'N/A'}) NOT incoming:`, reasons.join(', '));
      }
      if (isDueSoon) dueSoonCount++;
      if (isOverdue) overdueCount++;
    });

    console.log("✅ Incoming maintenance count:", { 
      totalServices: services.length,
      incomingCount, 
      dueSoonCount, 
      overdueCount 
    });
    
    res.json({
      success: true,
      count: incomingCount,
      incomingMaintenance: incomingCount,
      dueSoon: dueSoonCount,
      overdue: overdueCount
    });
  } catch (error) {
    console.log("❌ GET INCOMING MAINTENANCE COUNT ERROR:", error.message);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// ✅ GET UPCOMING SERVICES FROM SAMSARA VEHICLES
export const getSamsaraUpcomingServices = async (req, res) => {
  try {
    console.log("🚀 GET SAMSARA UPCOMING SERVICES API CALLED");
    
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({ 
        success: true, 
        count: 0,
        data: []
      });
    }

    const { Vehicle } = await import("../../models/driver/vehicleModel.js");
    const { FleetUnit } = await import("../../models/fleet/fleetUnitModel.js");
    const { updateVehicleByTrackingKey } = await import("../../services/samsara.js");

    // Build filter for vehicles with Samsara tracking
    const vehicleFilter = {
      trackingKey: { $exists: true, $ne: null, $ne: '' }
    };
    
    if (companyId) {
      vehicleFilter.company = companyId;
    }

    // Get all vehicles with Samsara tracking
    const vehicles = await Vehicle.find(vehicleFilter)
      .select("_id trackingKey internalId plateNumber make model odometer lastService company")
      .lean();

    console.log(`📊 Found ${vehicles.length} vehicles with Samsara tracking`);

    const upcomingServices = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Process each vehicle
    for (const vehicle of vehicles) {
      try {
        // Update vehicle data from Samsara to get latest odometer
        const updatedVehicle = await updateVehicleByTrackingKey(vehicle.trackingKey);
        const currentOdometer = updatedVehicle?.odometer || vehicle.odometer || 0;

        // Calculate upcoming services based on lastService and intervals
        const vehicleUpcomingServices = calculateUpcomingServices({
          ...vehicle,
          odometer: currentOdometer
        });

        // Filter services that are due within 30 days or within 7,500 km
        for (const service of vehicleUpcomingServices) {
          const daysUntilDue = Math.ceil((new Date(service.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const remainingKm = service.dueMileage - currentOdometer;

          if ((daysUntilDue >= 0 && daysUntilDue <= 30) || (remainingKm >= 0 && remainingKm <= 7500) || remainingKm < 0) {
            upcomingServices.push({
              _id: `samsara-${vehicle._id}-${service.serviceType}`,
              unitNo: vehicle.internalId || vehicle.plateNumber || 'N/A',
              unitType: 'Truck',
              makeModel: `${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'N/A',
              serviceType: service.serviceType,
              serviceDate: null,
              dueDate: service.dueDate.toISOString().split('T')[0],
              dueMileage: service.dueMileage,
              odometer: currentOdometer,
              invoiceNo: null,
              notes: `Samsara: ${remainingKm < 0 ? 'OVERDUE' : remainingKm <= 7500 ? 'Due Soon' : 'Upcoming'}`,
              status: service.status === 'overdue' ? 'pending' : 'pending',
              priority: remainingKm < 0 ? 'urgent' : remainingKm <= 7500 ? 'high' : 'medium',
              source: 'samsara',
              vehicleId: vehicle._id,
              trackingKey: vehicle.trackingKey
            });
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error processing vehicle ${vehicle._id}:`, error.message);
        continue;
      }
    }

    // Sort by priority and due date
    upcomingServices.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
      if (priorityDiff !== 0) return priorityDiff;
      
      const dateA = new Date(a.dueDate || 0);
      const dateB = new Date(b.dueDate || 0);
      return dateA.getTime() - dateB.getTime();
    });

    console.log(`✅ Found ${upcomingServices.length} upcoming services from Samsara`);

    res.json({
      success: true,
      count: upcomingServices.length,
      data: upcomingServices
    });
  } catch (error) {
    console.error("❌ GET SAMSARA UPCOMING SERVICES ERROR:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};


