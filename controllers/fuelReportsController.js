import FuelReport from "../models/driver/fuelReportsModel.js";
import FuelType from "../models/fuelTypeModel.js";
import Unit from "../models/unitModel.js";
import FuelVendor from "../models/fuelVendorModel.js";
import { getCoordinatesFromAddress } from "../services/googlemap.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { Vehicle } from "../models/driver/vehicleModel.js";
import { FleetUnit } from "../models/fleet/fleetUnitModel.js";
import { User } from "../models/driver/userModel.js";
import Trip from "../models/tripModel.js";
import mongoose from "mongoose";
import { extractFuelReceiptData } from "../services/openaiService.js";
import fs from "fs";

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

// Create Fuel Report
export const createFuelReport = async (req, res) => {
  try {
    const { 
      reporter, driver, vehicle, status, odometer, cost, volume, volumeUnit, address, type,
      // New fields
      state, city, cityLocation, paymentNotes, product, unit, types, fuelAmounts, transactionAmount, currentOdometer, units, measurementUnit, currency, date, fuelVendors, fuelVendor, fuelAmount,orderId
    } = req.body;

    // Use unit if vehicle is not provided (for new form structure)
    const vehicleId = vehicle || unit;

    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating fuel reports. Go to Company Settings to set up your company."
        });
      }
    }

    const companyId = getUserCompanyId(req.user);

    // Extract real ID if prefixed
    const realVehicleId = extractRealId(vehicleId);
    
    // Try to find FleetUnit first (new approach) - use comprehensive search strategies
    let vehicleDoc = null;
    
    // Strategy 1: Try to find FleetUnit by _id if it's a valid ObjectId (with Truck filter)
    if (realVehicleId && isValidObjectId(realVehicleId)) {
      try {
        vehicleDoc = await FleetUnit.findOne({
          _id: new mongoose.Types.ObjectId(realVehicleId),
          unitType: "Truck",
          ...(companyId ? { company: companyId } : {})
        });
      } catch (err) {
        console.error(`Error finding FleetUnit by _id ${realVehicleId}:`, err.message);
      }
    }
    
    // Strategy 1b: Try without unitType filter if not found (in case unitType is not set)
    if (!vehicleDoc && realVehicleId && isValidObjectId(realVehicleId)) {
      try {
        vehicleDoc = await FleetUnit.findOne({
          _id: new mongoose.Types.ObjectId(realVehicleId),
          ...(companyId ? { company: companyId } : {})
        });
      } catch (err) {
        console.error(`Error finding FleetUnit by _id (no type filter) ${realVehicleId}:`, err.message);
      }
    }
    
    // Strategy 2: Try by internalId, unitNo, or the original prefixed ID (with Truck filter)
    if (!vehicleDoc && realVehicleId) {
      try {
        vehicleDoc = await FleetUnit.findOne({
          $or: [
            { internalId: realVehicleId },
            { unitNo: realVehicleId },
            { internalId: vehicle },
            { unitNo: vehicle }
          ],
          unitType: "Truck",
          ...(companyId ? { company: companyId } : {})
        });
      } catch (err) {
        console.error(`Error finding FleetUnit by internalId/unitNo:`, err.message);
      }
    }
    
    // Strategy 2b: Try without unitType filter
    if (!vehicleDoc && realVehicleId) {
      try {
        vehicleDoc = await FleetUnit.findOne({
          $or: [
            { internalId: realVehicleId },
            { unitNo: realVehicleId },
            { internalId: vehicle },
            { unitNo: vehicle }
          ],
          ...(companyId ? { company: companyId } : {})
        });
      } catch (err) {
        console.error(`Error finding FleetUnit by internalId/unitNo (no type filter):`, err.message);
      }
    }
    
    // Fall back to Vehicle model for backward compatibility
    if (!vehicleDoc) {
      if (realVehicleId && isValidObjectId(realVehicleId)) {
        try {
          vehicleDoc = await Vehicle.findOne({
            _id: new mongoose.Types.ObjectId(realVehicleId),
            ...(companyId ? { company: companyId } : {})
          });
        } catch (err) {
          console.error(`Error finding Vehicle by _id ${realVehicleId}:`, err.message);
        }
      }
      
      if (!vehicleDoc && realVehicleId) {
        try {
          vehicleDoc = await Vehicle.findOne({
            $or: [
              { internalId: realVehicleId },
              { internalId: vehicle }
            ],
            ...(companyId ? { company: companyId } : {})
          });
        } catch (err) {
          console.error(`Error finding Vehicle by internalId:`, err.message);
        }
      }
    }
    
    if (!vehicleDoc) {
      console.error(`Vehicle not found. Searched with:`, {
        originalVehicle: vehicleId,
        realVehicleId: realVehicleId,
        companyId: companyId
      });
      return res.status(404).json({ 
        success: false, 
        message: `Vehicle not found with ID: ${vehicleId || 'undefined'}. Please ensure the vehicle exists and belongs to your company.` 
      });
    }

    if (req.user?.role !== 'superadmin' && companyId && vehicleDoc.company && vehicleDoc.company.toString() !== companyId) {
      return res.status(403).json({ success: false, message: "You do not have permission to create fuel reports for this vehicle." });
    }
    
    // Use the real ID for saving the fuel report
    const vehicleIdToSave = vehicleDoc._id;

    if (driver) {
      const driverDoc = await User.findById(driver);
      if (!driverDoc) {
        return res.status(404).json({ success: false, message: "Driver not found" });
      }
    }

    // Validate reporter if provided
    if (reporter) {
      const reporterDoc = await User.findById(reporter);
      if (!reporterDoc) {
        return res.status(404).json({ success: false, message: "Reporter not found" });
      }
      
      // Validate reporter belongs to same company (unless superadmin)
      if (req.user?.role !== 'superadmin' && companyId) {
        if (reporterDoc.company && reporterDoc.company.toString() !== companyId) {
          return res.status(403).json({ 
            success: false, 
            message: "Reporter does not belong to your company." 
          });
        }
      }
    }

    const coords = address ? await getCoordinatesFromAddress(address) : { longitude: null, latitude: null };
    const longitude = coords?.longitude || null;
    const latitude = coords?.latitude || null;

    // Handle volume - combine volume and volumeUnit if volumeUnit is provided
    let finalVolume = volume;
    if (volumeUnit && volume) {
      finalVolume = `${volume} ${volumeUnit}`;
    } else if (req.body.volumeUnit && volume) {
      finalVolume = `${volume} ${req.body.volumeUnit}`;
    }

    // Generate transaction number with timestamp to avoid duplicates
    // Format: timestamp as number (e.g., 1704067200000)
    let transactionNumber = req.body.transactionNumber;
    
    // If transactionNumber is provided, validate uniqueness
    if (transactionNumber) {
      const existing = await FuelReport.findOne({ transactionNumber });
      if (existing) {
        return res.status(400).json({ 
          success: false, 
          message: `Transaction number "${transactionNumber}" already exists. Please use a unique transaction number.` 
        });
      }
    } else {
      // Auto-generate transaction number if not provided
      const timestamp = Date.now();
      transactionNumber = timestamp.toString();
      
      // Try to ensure uniqueness by checking if it exists
      let attempts = 0;
      while (attempts < 10) {
        const existing = await FuelReport.findOne({ transactionNumber });
        if (!existing) break;
        // If exists, add a small random number to make it unique
        transactionNumber = (timestamp + Math.floor(Math.random() * 1000)).toString();
        attempts++;
      }
    }

    // Use unit if provided, otherwise use vehicle
    const unitIdToSave = unit ? extractRealId(unit) : vehicleIdToSave;
    let unitDoc = vehicleDoc;
    if (unit && unit !== vehicle) {
      // Try to find the unit
      const realUnitId = extractRealId(unit);
      if (realUnitId && isValidObjectId(realUnitId)) {
        try {
          unitDoc = await FleetUnit.findOne({
            _id: new mongoose.Types.ObjectId(realUnitId),
            ...(companyId ? { company: companyId } : {})
          });
        } catch (err) {
          console.error(`Error finding Unit by _id ${realUnitId}:`, err.message);
        }
      }
    }

    const report = new FuelReport({
      reporter: reporter || null,
      driver: driver || null,
      vehicle: vehicleIdToSave,
      unit: unitDoc ? unitDoc._id : vehicleIdToSave,
      status: status || 'pending',
      odometer: odometer || null,
      cost: cost || null,
      volume: finalVolume || null,
      type: type || null,
      location: {
        address: address || null,
        longitude: longitude || null,
        latitude: latitude || null
      },
      // New fields
      state: state || null,
      city: city || cityLocation || null,
      cityLocation: cityLocation || city || null,
      paymentNotes: paymentNotes || null,
      product: product || type || null,
      types: Array.isArray(types) ? types.filter(t => t && t.trim()) : (product || type ? [product || type] : []),
      fuelAmounts: Array.isArray(fuelAmounts) ? fuelAmounts.filter(f => f != null) : [],
      transactionAmount: transactionAmount || null,
      currentOdometer: currentOdometer || odometer || null,
      units: Array.isArray(units) ? units.filter(u => u && u.trim()) : [],
      measurementUnit: measurementUnit || null,
      currency: currency || 'USA',
      date: date ? new Date(date) : new Date(),
      fuelVendors: Array.isArray(fuelVendors) ? fuelVendors.filter(v => v && v.trim()) : [],
      fuelVendor: fuelVendor || null,
      fuelAmount: fuelAmount || null,
      transactionNumber: transactionNumber,
      company: vehicleDoc.company || companyId || null,
      orderId:req.body.orderId,
      // createdAt and updatedAt are automatically handled by { timestamps: true } in the schema
    });
    await report.save();
    return res.status(201).json({ success: true, message: "Fuel report created successfully", data: report });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update Fuel Report (partial update – only fields passed will update)
export const updateFuelReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      vehicle: vehicleUpdate, 
      unit: unitUpdate,
      address: addressUpdate, 
      types,
      fuelAmounts,
      units,
      measurementUnit,
      fuelVendors,
      date,
      ...otherUpdates 
    } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    // Find existing report first
    const existingReport = await FuelReport.findOne(query);
    if (!existingReport) {
      return res.status(404).json({ success: false, message: "Fuel report not found" });
    }

    // Prepare update payload
    const updatePayload = { ...otherUpdates };
    
    // Handle vehicle update if provided
    if (vehicleUpdate !== undefined) {
      const realVehicleId = extractRealId(vehicleUpdate);
      let vehicleDoc = null;
      
      // Strategy 1: Try to find FleetUnit by _id if it's a valid ObjectId
      if (realVehicleId && isValidObjectId(realVehicleId)) {
        try {
          vehicleDoc = await FleetUnit.findOne({
            _id: new mongoose.Types.ObjectId(realVehicleId),
            unitType: "Truck",
            ...(companyId ? { company: companyId } : {})
          });
        } catch (err) {
          console.error(`Error finding FleetUnit by _id ${realVehicleId}:`, err.message);
        }
      }
      
      // Strategy 2: Try by internalId, unitNo, or the original prefixed ID
      if (!vehicleDoc && realVehicleId) {
        try {
          vehicleDoc = await FleetUnit.findOne({
            $or: [
              { internalId: realVehicleId },
              { unitNo: realVehicleId },
              { internalId: vehicleUpdate },
              { unitNo: vehicleUpdate }
            ],
            unitType: "Truck",
            ...(companyId ? { company: companyId } : {})
          });
        } catch (err) {
          console.error(`Error finding FleetUnit by internalId/unitNo:`, err.message);
        }
      }
      
      // Fall back to Vehicle model for backward compatibility
      if (!vehicleDoc) {
        if (realVehicleId && isValidObjectId(realVehicleId)) {
          try {
            vehicleDoc = await Vehicle.findOne({
              _id: new mongoose.Types.ObjectId(realVehicleId),
              ...(companyId ? { company: companyId } : {})
            });
          } catch (err) {
            console.error(`Error finding Vehicle by _id ${realVehicleId}:`, err.message);
          }
        }
        
        if (!vehicleDoc && realVehicleId) {
          try {
            vehicleDoc = await Vehicle.findOne({
              $or: [
                { internalId: realVehicleId },
                { internalId: vehicleUpdate }
              ],
              ...(companyId ? { company: companyId } : {})
            });
          } catch (err) {
            console.error(`Error finding Vehicle by internalId:`, err.message);
          }
        }
      }
      
      if (!vehicleDoc) {
        return res.status(404).json({ 
          success: false, 
          message: `Vehicle not found with ID: ${vehicleUpdate}. Please ensure the vehicle exists and belongs to your company.` 
        });
      }
      
      updatePayload.vehicle = vehicleDoc._id;
      
      // Update company if vehicle has a different company
      if (vehicleDoc.company) {
        updatePayload.company = vehicleDoc.company;
      }
    }
    
    // Handle address/location update if provided
    if (addressUpdate !== undefined && addressUpdate !== null && addressUpdate !== '') {
      try {
        const coords = await getCoordinatesFromAddress(addressUpdate);
        updatePayload.location = {
          address: addressUpdate,
          longitude: coords?.longitude || null,
          latitude: coords?.latitude || null
        };
      } catch (err) {
        console.error(`Error getting coordinates for address:`, err.message);
        updatePayload.location = {
          address: addressUpdate,
          longitude: existingReport.location?.longitude || null,
          latitude: existingReport.location?.latitude || null
        };
      }
    }

    // Handle volume - combine volume and volumeUnit if volumeUnit is provided
    if (req.body.volumeUnit && req.body.volume) {
      updatePayload.volume = `${req.body.volume} ${req.body.volumeUnit}`;
    }

    // Handle unit update if provided
    if (unitUpdate !== undefined) {
      const realUnitId = extractRealId(unitUpdate);
      let unitDoc = null;
      
      if (realUnitId && isValidObjectId(realUnitId)) {
        try {
          unitDoc = await FleetUnit.findOne({
            _id: new mongoose.Types.ObjectId(realUnitId),
            ...(companyId ? { company: companyId } : {})
          });
        } catch (err) {
          console.error(`Error finding Unit by _id ${realUnitId}:`, err.message);
        }
      }
      
      if (unitDoc) {
        updatePayload.unit = unitDoc._id;
      } else if (vehicleUpdate && updatePayload.vehicle) {
        // If unit not found but vehicle is updated, use vehicle as unit
        updatePayload.unit = updatePayload.vehicle;
      }
    }

    // Handle new array fields
    if (types !== undefined) {
      updatePayload.types = Array.isArray(types) ? types.filter(t => t && t.trim()) : [];
    }
    if (fuelAmounts !== undefined) {
      updatePayload.fuelAmounts = Array.isArray(fuelAmounts) ? fuelAmounts.filter(f => f != null) : [];
    }
    if (units !== undefined) {
      updatePayload.units = Array.isArray(units) ? units.filter(u => u && u.trim()) : [];
    }
    if (fuelVendors !== undefined) {
      updatePayload.fuelVendors = Array.isArray(fuelVendors) ? fuelVendors.filter(v => v && v.trim()) : [];
    }
    if (req.body.fuelVendor !== undefined) {
      updatePayload.fuelVendor = req.body.fuelVendor || null;
    }
    if (req.body.fuelAmount !== undefined) {
      updatePayload.fuelAmount = req.body.fuelAmount ? parseFloat(req.body.fuelAmount) : null;
    }
    if (date !== undefined) {
      updatePayload.date = date ? new Date(date) : new Date();
    }
    // Handle city, paymentNotes, and product fields
    if (req.body.city !== undefined) {
      updatePayload.city = req.body.city || null;
      updatePayload.cityLocation = req.body.city || null;
    }
    if (req.body.cityLocation !== undefined) {
      updatePayload.cityLocation = req.body.cityLocation || null;
      updatePayload.city = req.body.cityLocation || null;
    }
    if (req.body.paymentNotes !== undefined) {
      updatePayload.paymentNotes = req.body.paymentNotes || null;
    }
    if (req.body.product !== undefined) {
      updatePayload.product = req.body.product || null;
      // Also update type if product is provided
      if (req.body.product) {
        updatePayload.type = req.body.product;
      }
    }
    if (req.body.state !== undefined) {
      updatePayload.state = req.body.state || null;
    }
    if (req.body.transactionAmount !== undefined) {
      updatePayload.transactionAmount = req.body.transactionAmount ? parseFloat(req.body.transactionAmount) : null;
    }
    if (req.body.currentOdometer !== undefined) {
      updatePayload.currentOdometer = req.body.currentOdometer || null;
    }
    if (req.body.transactionNumber !== undefined) {
      const newTransactionNumber = req.body.transactionNumber || null;
      if (newTransactionNumber && newTransactionNumber !== existingReport.transactionNumber) {
        // Check if transaction number already exists (excluding current report)
        const existingWithNumber = await FuelReport.findOne({ 
          transactionNumber: newTransactionNumber,
          _id: { $ne: id }
        });
        if (existingWithNumber) {
          return res.status(400).json({ 
            success: false, 
            message: `Transaction number "${newTransactionNumber}" already exists. Please use a unique transaction number.` 
          });
        }
      }
      updatePayload.transactionNumber = newTransactionNumber;
    }

    // updatedAt is automatically handled by { timestamps: true } in the schema
    const report = await FuelReport.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    );

    if (!report) {
      return res.status(404).json({ success: false, message: "Fuel report not found" });
    }

    return res.status(200).json({ success: true, data: report });
  } catch (error) {
    console.error("❌ Error updating fuel report:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete Fuel Report
export const deleteFuelReport = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const report = await FuelReport.findOneAndDelete(query);

    if (!report) {
      return res.status(404).json({ success: false, message: "Fuel report not found" });
    }

    return res.status(200).json({ success: true, message: "Fuel report deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get All Fuel Reports
export const getFuelReports = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(200).json({ 
        success: true, 
        message: "No company assigned to the current admin.", 
        count: 0, 
        data: [],
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0
        }
      });
    }

    const filter = {};
    if (!isSuperadmin && companyId) {
      const normalizedCompany = typeof companyId === 'string' ? companyId : companyId.toString();
      filter.company = normalizedCompany;
    }

    // Add status filter
    if (status && status !== 'all') {
      filter.status = status;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Get all reports first (for search filtering on populated fields)
    let allReports = await FuelReport.find(filter)
      .populate("reporter", "name email")
      .populate("driver", "name email")
      .sort(sortOptions)
      .lean();
    
    // Manually populate vehicle and trip fields
    for (let report of allReports) {
      // Store original vehicle ID before populating (needed for trip matching)
      const originalVehicleId = report.vehicle;
      
      // Populate vehicle field - try FleetUnit first, then Vehicle
      if (report.vehicle) {
        // Try FleetUnit first
        let vehicleDoc = await FleetUnit.findById(report.vehicle)
          .select("licensePlate vinNo unitNo unitType makeModel make model internalId")
          .lean();
        
        // If not found in FleetUnit, try Vehicle model
        if (!vehicleDoc) {
          vehicleDoc = await Vehicle.findById(report.vehicle)
            .select("plateNumber vinNumber make model")
            .lean();
        }
        
        if (vehicleDoc) {
          // Construct makeModel from make and model if makeModel is not available
          let makeModel = vehicleDoc.makeModel;
          if (!makeModel || makeModel === 'N/A') {
            const make = vehicleDoc.make || '';
            const model = vehicleDoc.model || '';
            makeModel = [make, model].filter(Boolean).join(' ').trim() || 'N/A';
          }
          
          // Use fallback fields for unitNo
          let unitNo = vehicleDoc.unitNo;
          if (!unitNo || unitNo === 'N/A') {
            unitNo = vehicleDoc.internalId || vehicleDoc.licensePlate || 'N/A';
          }
          
          // Map to consistent format
          report.vehicle = {
            _id: report.vehicle,
            plateNumber: vehicleDoc.licensePlate || vehicleDoc.plateNumber || 'N/A',
            vinNumber: vehicleDoc.vinNo || vehicleDoc.vinNumber || 'N/A',
            unitNo: unitNo,
            unitType: vehicleDoc.unitType || 'N/A',
            makeModel: makeModel
          };
        } else {
          report.vehicle = {
            _id: report.vehicle,
            plateNumber: 'N/A',
            vinNumber: 'N/A',
            unitNo: 'N/A',
            unitType: 'N/A',
            makeModel: 'N/A'
          };
        }
      }

      // Populate unit field (same as vehicle but separate field)
      if (report.unit) {
        // Try FleetUnit first
        let unitDoc = await FleetUnit.findById(report.unit)
          .select("licensePlate vinNo unitNo unitType makeModel make model internalId")
          .lean();
        
        // If not found in FleetUnit, try Vehicle model
        if (!unitDoc) {
          unitDoc = await Vehicle.findById(report.unit)
            .select("plateNumber vinNumber make model")
            .lean();
        }
        
        if (unitDoc) {
          // Construct makeModel from make and model if makeModel is not available
          let makeModel = unitDoc.makeModel;
          if (!makeModel || makeModel === 'N/A') {
            const make = unitDoc.make || '';
            const model = unitDoc.model || '';
            makeModel = [make, model].filter(Boolean).join(' ').trim() || 'N/A';
          }
          
          // Use fallback fields for unitNo
          let unitNo = unitDoc.unitNo;
          if (!unitNo || unitNo === 'N/A') {
            unitNo = unitDoc.internalId || unitDoc.licensePlate || 'N/A';
          }
          
          // Map to consistent format
          report.unit = {
            _id: report.unit,
            unitNo: unitNo,
            unitType: unitDoc.unitType || 'N/A',
            makeModel: makeModel
          };
        } else {
          report.unit = {
            _id: report.unit,
            unitNo: 'N/A',
            unitType: 'N/A',
            makeModel: 'N/A'
          };
        }
      } else if (report.vehicle && report.vehicle._id) {
        // If unit is not set, use vehicle as unit
        report.unit = report.vehicle;
      }

      // Populate trip field - first check if trip ID exists, otherwise try to find matching trip
      let tripDoc = null;
      
      if (report.trip) {
        // If trip ID is set, fetch that trip
        try {
          tripDoc = await Trip.findById(report.trip)
            .select("tripNumber status plannedStartDate plannedEndDate actualStartDate actualEndDate startLocation endLocation")
            .populate('driver', 'name')
            .populate('coDriver', 'name')
            .lean();
        } catch (tripError) {
          console.error('Error fetching trip by ID:', tripError);
        }
      }
      
      // If no trip found by ID, try to find matching trip by driver, vehicle, and date
      // Use originalVehicleId (ObjectId) instead of report.vehicle (which is now an object)
      if (!tripDoc && report.driver && originalVehicleId) {
        try {
          const fuelReportDate = report.createdAt ? new Date(report.createdAt) : new Date();
          const startOfDay = new Date(fuelReportDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(fuelReportDate);
          endOfDay.setHours(23, 59, 59, 999);
          
          // Find trips that match:
          // 1. Same driver (or co-driver)
          // 2. Same vehicle (truck)
          // 3. Date range overlaps (trip dates or fuel report date within trip range)
          const tripQuery = {
            $and: [
              {
                $or: [
                  { driver: report.driver },
                  { coDriver: report.driver }
                ]
              },
              { truck: originalVehicleId },
              {
                $or: [
                  {
                    // Trip planned dates overlap with fuel report date
                    plannedStartDate: { $lte: endOfDay },
                    plannedEndDate: { $gte: startOfDay }
                  },
                  {
                    // Trip actual dates overlap with fuel report date
                    actualStartDate: { $lte: endOfDay },
                    actualEndDate: { $gte: startOfDay }
                  },
                  {
                    // Trip is in progress and has planned start date before or on fuel report date
                    status: 'in-progress',
                    plannedStartDate: { $lte: endOfDay }
                  },
                  {
                    // Trip is in progress and has actual start date before or on fuel report date
                    status: 'in-progress',
                    actualStartDate: { $lte: endOfDay }
                  },
                  {
                    // Fallback: if no date match, get active trips for this driver/vehicle
                    status: { $in: ['in-progress', 'planned', 'manifest_pending'] }
                  }
                ]
              }
            ]
          };
          
          tripDoc = await Trip.findOne(tripQuery)
            .select("tripNumber status plannedStartDate plannedEndDate actualStartDate actualEndDate startLocation endLocation")
            .populate('driver', 'name')
            .populate('coDriver', 'name')
            .sort({ createdAt: -1 }) // Get most recent trip
            .lean();
        } catch (tripError) {
          console.error('Error finding matching trip:', tripError);
        }
      }
      
      // Format trip data if found
      if (tripDoc) {
        report.trip = {
          _id: tripDoc._id,
          tripNumber: tripDoc.tripNumber || 'N/A',
          status: tripDoc.status || 'N/A',
          plannedStartDate: tripDoc.plannedStartDate || null,
          plannedEndDate: tripDoc.plannedEndDate || null,
          actualStartDate: tripDoc.actualStartDate || null,
          actualEndDate: tripDoc.actualEndDate || null,
          startLocation: tripDoc.startLocation ? {
            place: tripDoc.startLocation.place || 'N/A',
            latitude: tripDoc.startLocation.latitude || 'N/A',
            longitude: tripDoc.startLocation.longitude || 'N/A'
          } : null,
          endLocation: tripDoc.endLocation ? {
            place: tripDoc.endLocation.place || 'N/A',
            latitude: tripDoc.endLocation.latitude || 'N/A',
            longitude: tripDoc.endLocation.longitude || 'N/A'
          } : null,
          driver: tripDoc.driver ? {
            _id: tripDoc.driver._id,
            name: tripDoc.driver.name || 'N/A'
          } : null,
          coDriver: tripDoc.coDriver ? {
            _id: tripDoc.coDriver._id,
            name: tripDoc.coDriver.name || 'N/A'
          } : null
        };
      } else {
        report.trip = null;
      }
    }

    // Apply search filter on populated data
    if (search) {
      const searchLower = search.toLowerCase();
      allReports = allReports.filter(report => {
        const reporterName = report.reporter?.name?.toLowerCase() || '';
        const driverName = report.driver?.name?.toLowerCase() || '';
        const plateNumber = report.vehicle?.plateNumber?.toLowerCase() || '';
        const vinNumber = report.vehicle?.vinNumber?.toLowerCase() || '';
        const unitNo = report.vehicle?.unitNo?.toLowerCase() || report.unit?.unitNo?.toLowerCase() || '';
        const statusStr = report.status?.toLowerCase() || '';
        const tripNumber = report.trip?.tripNumber?.toLowerCase() || '';
        const tripStatus = report.trip?.status?.toLowerCase() || '';
        const transactionNumber = report.transactionNumber?.toLowerCase() || '';
        const city = (report.city || report.cityLocation || '').toLowerCase();
        const state = (report.state || '').toLowerCase();
        const paymentNotes = (report.paymentNotes || '').toLowerCase();
        const product = (report.product || report.type || '').toLowerCase();
        const fuelVendor = (report.fuelVendor || '').toLowerCase();
        
        return reporterName.includes(searchLower) ||
               driverName.includes(searchLower) ||
               plateNumber.includes(searchLower) ||
               vinNumber.includes(searchLower) ||
               unitNo.includes(searchLower) ||
               statusStr.includes(searchLower) ||
               tripNumber.includes(searchLower) ||
               tripStatus.includes(searchLower) ||
               transactionNumber.includes(searchLower) ||
               city.includes(searchLower) ||
               state.includes(searchLower) ||
               paymentNotes.includes(searchLower) ||
               product.includes(searchLower) ||
               fuelVendor.includes(searchLower);
      });
    }

    // Get total count after search filtering
    const total = allReports.length;

    // Apply pagination
    const reports = allReports.slice(skip, skip + parseInt(limit));

    return res.status(200).json({ 
      success: true, 
      count: reports.length, 
      data: reports,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get Reporters (users who can create fuel reports - admin, dispatcher, hr, etc., excluding drivers)
// Get Fuel Types
export const getFuelTypes = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const filter = {};
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    } else if (!isSuperadmin) {
      // If no company, return empty array
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    const fuelTypes = await FuelType.find(filter)
      .select('name _id')
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: fuelTypes
    });
  } catch (error) {
    console.error('Error fetching fuel types:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create Fuel Type
export const createFuelType = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Fuel type name is required'
      });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: 'Please complete company settings first'
      });
    }

    // Check if fuel type already exists
    const existingFilter = { name: name.trim() };
    if (!isSuperadmin && companyId) {
      existingFilter.company = companyId;
    }

    const existing = await FuelType.findOne(existingFilter);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Fuel type already exists'
      });
    }

    const fuelType = new FuelType({
      name: name.trim(),
      company: companyId || null,
      createdBy: req.user?.id || null
    });

    await fuelType.save();

    return res.status(201).json({
      success: true,
      message: 'Fuel type created successfully',
      data: fuelType
    });
  } catch (error) {
    console.error('Error creating fuel type:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Fuel type already exists'
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Units
export const getUnits = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const filter = {};
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    } else if (!isSuperadmin) {
      // If no company, return empty array
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    const units = await Unit.find(filter)
      .select('name _id')
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: units
    });
  } catch (error) {
    console.error('Error fetching units:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create Unit
export const createUnit = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Unit name is required'
      });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: 'Please complete company settings first'
      });
    }

    // Check if unit already exists
    const existingFilter = { name: name.trim() };
    if (!isSuperadmin && companyId) {
      existingFilter.company = companyId;
    }

    const existing = await Unit.findOne(existingFilter);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Unit already exists'
      });
    }

    const unit = new Unit({
      name: name.trim(),
      company: companyId || null,
      createdBy: req.user?.id || null
    });

    await unit.save();

    return res.status(201).json({
      success: true,
      message: 'Unit created successfully',
      data: unit
    });
  } catch (error) {
    console.error('Error creating unit:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Unit already exists'
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Fuel Vendors
export const getFuelVendors = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const filter = {};
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    } else if (!isSuperadmin) {
      // If no company, return empty array
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    const fuelVendors = await FuelVendor.find(filter)
      .select('name _id')
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: fuelVendors
    });
  } catch (error) {
    console.error('Error fetching fuel vendors:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create Fuel Vendor
export const createFuelVendor = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Fuel vendor name is required'
      });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: 'Please complete company settings first'
      });
    }

    // Check if fuel vendor already exists
    const existingFilter = { name: name.trim() };
    if (!isSuperadmin && companyId) {
      existingFilter.company = companyId;
    }

    const existing = await FuelVendor.findOne(existingFilter);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Fuel vendor already exists'
      });
    }

    const fuelVendor = new FuelVendor({
      name: name.trim(),
      company: companyId || null,
      createdBy: req.user?.id || null
    });

    await fuelVendor.save();

    return res.status(201).json({
      success: true,
      message: 'Fuel vendor created successfully',
      data: fuelVendor
    });
  } catch (error) {
    console.error('Error creating fuel vendor:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Fuel vendor already exists'
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getReporters = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(200).json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    // Build query - exclude drivers and customers, include admin, dispatcher, hr, and other reporting roles
    const query = {
      role: { 
        $nin: ['driver', 'customer'] 
      }
    };

    // Filter by company if not superadmin
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const reporters = await User.find(query)
      .select('name email phone role internalId')
      .sort({ name: 1 });

    return res.status(200).json({ 
      success: true, 
      count: reporters.length, 
      data: reporters 
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Change Status (approved / pending / rejected)
export const changeFuelReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["approved", "pending", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const report = await FuelReport.findOneAndUpdate(query, { status }, { new: true });

    if (!report) {
      return res.status(404).json({ success: false, message: "Fuel report not found" });
    }

    return res.status(200).json({ success: true, data: report });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Extract Fuel Receipt Data from Image/PDF using OpenAI
export const extractFuelReceipt = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a fuel receipt file (image or PDF)"
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

    // Read the file buffer
    let fileBuffer;
    try {
      if (req.file.buffer) {
        fileBuffer = req.file.buffer;
      } else if (req.file.path) {
        if (!fs.existsSync(req.file.path)) {
          return res.status(400).json({
            success: false,
            message: "File not found on server"
          });
        }
        fileBuffer = fs.readFileSync(req.file.path);
      } else {
        return res.status(400).json({
          success: false,
          message: "Unable to read uploaded file."
        });
      }
    } catch (readError) {
      console.error('Error reading file:', readError);
      return res.status(500).json({
        success: false,
        message: "Error reading file: " + readError.message
      });
    }

    // Extract fuel receipt data using OpenAI
    const extractionResult = await extractFuelReceiptData(fileBuffer, req.file.mimetype);

    if (!extractionResult.success) {
      return res.status(500).json({
        success: false,
        message: extractionResult.error || "Failed to extract data from fuel receipt",
        data: null
      });
    }

    return res.status(200).json({
      success: true,
      message: "Fuel receipt data extracted successfully",
      data: extractionResult.data,
      usage: extractionResult.usage
    });
  } catch (error) {
    console.error('Error extracting fuel receipt data:', error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to extract fuel receipt data"
    });
  }
};

// Parse CSV and return column headers for mapping
export const parseCsvHeaders = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a CSV file"
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

    // Read the file buffer
    let fileBuffer;
    try {
      if (req.file.buffer) {
        fileBuffer = req.file.buffer;
      } else if (req.file.path) {
        if (!fs.existsSync(req.file.path)) {
          return res.status(400).json({
            success: false,
            message: "File not found on server"
          });
        }
        fileBuffer = fs.readFileSync(req.file.path);
      } else {
        return res.status(400).json({
          success: false,
          message: "Unable to read uploaded file."
        });
      }
    } catch (readError) {
      console.error('Error reading file:', readError);
      return res.status(500).json({
        success: false,
        message: "Error reading file: " + readError.message
      });
    }

    // Parse CSV
    const csvText = fileBuffer.toString('utf-8');
    const lines = csvText.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return res.status(400).json({
        success: false,
        message: "CSV file is empty"
      });
    }

    // Parse header row (handle both comma and semicolon delimiters)
    const delimiter = csvText.includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
    
    // Get first few rows as sample data
    const sampleRows = lines.slice(1, Math.min(6, lines.length)).map(line => {
      const values = line.split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
      return headers.reduce((obj, header, index) => {
        obj[header] = values[index] || '';
        return obj;
      }, {});
    });

    return res.status(200).json({
      success: true,
      message: "CSV parsed successfully",
      data: {
        headers,
        sampleRows,
        totalRows: lines.length - 1,
        delimiter
      }
    });
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to parse CSV file"
    });
  }
};

// Import fuel reports from CSV with column mapping
export const importFuelReportsFromCsv = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a CSV file"
      });
    }

    const { columnMapping, defaultUnit, defaultCurrency = 'USA', defaultProduct } = req.body;
    
    if (!columnMapping) {
      return res.status(400).json({
        success: false,
        message: "Column mapping is required"
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

    // Read the file buffer
    let fileBuffer;
    try {
      if (req.file.buffer) {
        fileBuffer = req.file.buffer;
      } else if (req.file.path) {
        if (!fs.existsSync(req.file.path)) {
          return res.status(400).json({
            success: false,
            message: "File not found on server"
          });
        }
        fileBuffer = fs.readFileSync(req.file.path);
      } else {
        return res.status(400).json({
          success: false,
          message: "Unable to read uploaded file."
        });
      }
    } catch (readError) {
      console.error('Error reading file:', readError);
      return res.status(500).json({
        success: false,
        message: "Error reading file: " + readError.message
      });
    }

    // Parse CSV
    const csvText = fileBuffer.toString('utf-8');
    const lines = csvText.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return res.status(400).json({
        success: false,
        message: "CSV file must have at least a header row and one data row"
      });
    }

    const delimiter = csvText.includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
    
    // Parse mapping (expecting JSON string or object)
    let mapping;
    try {
      mapping = typeof columnMapping === 'string' ? JSON.parse(columnMapping) : columnMapping;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: "Invalid column mapping format"
      });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Process each row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const values = line.split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
        const rowData = headers.reduce((obj, header, index) => {
          obj[header] = values[index] || '';
          return obj;
        }, {});

        // Map CSV columns to fuel report fields
        const dateValue = mapping.date ? rowData[mapping.date] : null;
        const transactionAmountValue = mapping.transactionAmount ? parseFloat(rowData[mapping.transactionAmount]?.replace(/[^0-9.-]/g, '')) : null;
        const fuelAmountValue = mapping.fuelAmount ? parseFloat(rowData[mapping.fuelAmount]?.replace(/[^0-9.-]/g, '')) : null;
        const transactionNumberValue = mapping.transactionNumber ? rowData[mapping.transactionNumber] : null;
        const fuelVendorValue = mapping.fuelVendor ? rowData[mapping.fuelVendor] : null;
        const unitValue = mapping.unit ? rowData[mapping.unit] : defaultUnit;
        const cityValue = mapping.city ? rowData[mapping.city] : null;
        const stateValue = mapping.state ? rowData[mapping.state] : null;
        const addressValue = mapping.address ? rowData[mapping.address] : null;
        const odometerValue = mapping.odometer ? rowData[mapping.odometer] : null;
        const productValue = mapping.product ? rowData[mapping.product] : defaultProduct;

        // Validate required fields
        if (!dateValue || !transactionAmountValue || !fuelAmountValue) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Missing required fields (date, transactionAmount, or fuelAmount)`);
          continue;
        }

        // Parse date (handle various formats)
        let parsedDate;
        try {
          const dateStr = dateValue.toString();
          // Try common date formats
          if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            parsedDate = new Date(dateStr);
          } else if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            const [month, day, year] = dateStr.split('/');
            parsedDate = new Date(`${year}-${month}-${day}`);
          } else if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
            const [month, day, year] = dateStr.split('-');
            parsedDate = new Date(`${year}-${month}-${day}`);
          } else {
            parsedDate = new Date(dateStr);
          }
          
          if (isNaN(parsedDate.getTime())) {
            throw new Error('Invalid date format');
          }
        } catch (dateError) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Invalid date format: ${dateValue}`);
          continue;
        }

        // Find unit/vehicle
        if (!unitValue) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Unit is required`);
          continue;
        }

        const realVehicleId = extractRealId(unitValue);
        let vehicleDoc = null;
        
        if (realVehicleId && isValidObjectId(realVehicleId)) {
          vehicleDoc = await FleetUnit.findOne({
            _id: new mongoose.Types.ObjectId(realVehicleId),
            ...(companyId ? { company: companyId } : {})
          });
        }
        
        if (!vehicleDoc && realVehicleId) {
          vehicleDoc = await FleetUnit.findOne({
            $or: [
              { internalId: realVehicleId },
              { unitNo: realVehicleId }
            ],
            ...(companyId ? { company: companyId } : {})
          });
        }

        if (!vehicleDoc) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Unit not found: ${unitValue}`);
          continue;
        }

        // Generate transaction number if not provided
        let transactionNumber = transactionNumberValue;
        if (!transactionNumber) {
          const timestamp = Date.now();
          transactionNumber = (timestamp + i).toString();
        }

        // Check for duplicate transaction number
        const existingReport = await FuelReport.findOne({ transactionNumber });
        if (existingReport) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Transaction number already exists: ${transactionNumber}`);
          continue;
        }

        // Create fuel report
        const report = new FuelReport({
          reporter: req.user._id || null,
          vehicle: vehicleDoc._id,
          unit: vehicleDoc._id,
          status: 'pending',
          transactionAmount: transactionAmountValue,
          fuelAmount: fuelAmountValue,
          date: parsedDate,
          transactionNumber: transactionNumber,
          fuelVendor: fuelVendorValue || null,
          product: productValue || null,
          type: productValue || null,
          currentOdometer: odometerValue || null,
          currency: defaultCurrency || 'USA',
          state: stateValue || null,
          city: cityValue || null,
          location: addressValue ? {
            address: addressValue,
            longitude: null,
            latitude: null
          } : null,
          company: vehicleDoc.company || companyId || null
        });

        await report.save();
        results.success++;
      } catch (rowError) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${rowError.message || 'Unknown error'}`);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Import completed: ${results.success} successful, ${results.failed} failed`,
      data: {
        success: results.success,
        failed: results.failed,
        errors: results.errors.slice(0, 20) // Limit errors to first 20
      }
    });
  } catch (error) {
    console.error('Error importing fuel reports from CSV:', error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to import fuel reports from CSV"
    });
  }
};
