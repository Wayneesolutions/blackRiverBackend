// controllers/fleet/fleetMaintenanceFinanceController.js
import { WorkOrder } from "../../models/driver/workOrderModel.js";
import { VehicleService } from "../../models/driver/vehicleService.js";
import { PartsCostLog } from "../../models/fleet/partsCostLogModel.js";
import { LaborRate } from "../../models/fleet/laborRateModel.js";
import { MaintenancePlan } from "../../models/fleet/maintenancePlanModel.js";
import { FleetUnit } from "../../models/fleet/fleetUnitModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";
import mongoose from "mongoose";

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

// ✅ Get Maintenance Expense Summary
export const getMaintenanceExpenseSummary = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { search } = req.query;

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    // Get fleet units FIRST for vehicle matching
    const fleetUnits = await FleetUnit.find(query).select('_id internalId unitNo licensePlate odometer currentOdometer').lean();
    const odometerMap = {};
    const vehicleNameMap = {}; // Map vehicle keys to display names
    fleetUnits.forEach(unit => {
      const unitId = unit.internalId || unit.unitNo;
      const unitKey = unit._id.toString();
      if (unitId) {
        odometerMap[unitId] = unit.currentOdometer || unit.odometer || 0;
        vehicleNameMap[unitKey] = unitId;
      }
      // Also map by internalId and unitNo for matching
      if (unit.internalId) {
        vehicleNameMap[unit.internalId] = unitKey;
      }
      if (unit.unitNo) {
        vehicleNameMap[unit.unitNo] = unitKey;
      }
    });

    // Get all work orders and vehicle services
    const workOrders = await WorkOrder.find(query)
      .populate('vehicleId', 'internalId plateNumber make model')
      .lean();

    const vehicleServices = await VehicleService.find(query)
      .populate('vehicleId', 'internalId plateNumber make model')
      .lean();

    // Aggregate expenses by vehicle
    const vehicleExpenses = {};

    // Get Parts Cost Log entries for expenses
    const partsCostLogEntries = await PartsCostLog.find(query)
      .populate('vehicleId', 'internalId unitNo licensePlate')
      .lean();

    // Build a map of vehicle IDs to their display names (internalId or unitNo)
    const vehicleMap = {};
    fleetUnits.forEach(unit => {
      const key = unit._id.toString();
      vehicleMap[key] = unit.internalId || unit.unitNo || key;
    });

    // Process work orders
    workOrders.forEach(wo => {
      // Try multiple ways to identify the vehicle
      let vehicleKey = null;
      let vehicleName = 'Unknown';
      
      if (wo.vehicleId?._id) {
        const vehId = wo.vehicleId._id.toString();
        vehicleKey = vehId;
        vehicleName = wo.vehicleId.internalId || wo.vehicleId.plateNumber || vehicleMap[vehId] || wo.unitNumber || 'Unknown';
      } else if (wo.unitNumber) {
        // Try to find FleetUnit by unitNumber or internalId
        const matchedUnit = fleetUnits.find(u => u.unitNo === wo.unitNumber || u.internalId === wo.unitNumber);
        if (matchedUnit) {
          vehicleKey = matchedUnit._id.toString();
          vehicleName = matchedUnit.internalId || matchedUnit.unitNo || wo.unitNumber;
        } else {
          vehicleKey = wo.unitNumber;
          vehicleName = wo.unitNumber;
        }
      }
      
      if (!vehicleKey) return;
      
      if (!vehicleExpenses[vehicleKey]) {
        vehicleExpenses[vehicleKey] = {
          vehicle: vehicleName,
          vehicleId: vehicleKey,
          totalExpense: 0,
          expenses: [],
          serviceTypes: {}
        };
      }
      
      // Use actualCost if available, otherwise estimatedCost
      const cost = Number(wo.actualCost) || Number(wo.estimatedCost) || 0;
      vehicleExpenses[vehicleKey].totalExpense += cost;
      
      const serviceType = wo.issue || 'Other';
      vehicleExpenses[vehicleKey].serviceTypes[serviceType] = 
        (vehicleExpenses[vehicleKey].serviceTypes[serviceType] || 0) + cost;
    });

    // Process vehicle services
    vehicleServices.forEach(vs => {
      // Try multiple ways to identify the vehicle
      let vehicleKey = null;
      let vehicleName = 'Unknown';
      
      if (vs.vehicleId?._id) {
        const vehId = vs.vehicleId._id.toString();
        vehicleKey = vehId;
        vehicleName = vs.vehicleId.internalId || vehicleMap[vehId] || vs.unitNumber || 'Unknown';
      } else if (vs.unitNumber) {
        // Try to find FleetUnit by unitNumber or internalId
        const matchedUnit = fleetUnits.find(u => u.unitNo === vs.unitNumber || u.internalId === vs.unitNumber);
        if (matchedUnit) {
          vehicleKey = matchedUnit._id.toString();
          vehicleName = matchedUnit.internalId || matchedUnit.unitNo || vs.unitNumber;
        } else {
          vehicleKey = vs.unitNumber;
          vehicleName = vs.unitNumber;
        }
      }
      
      if (!vehicleKey) return;
      
      if (!vehicleExpenses[vehicleKey]) {
        vehicleExpenses[vehicleKey] = {
          vehicle: vehicleName,
          vehicleId: vehicleKey,
          totalExpense: 0,
          expenses: [],
          serviceTypes: {}
        };
      }
      
      // Use actualCost if available, otherwise estimatedCost
      const cost = Number(vs.actualCost) || Number(vs.estimatedCost) || 0;
      vehicleExpenses[vehicleKey].totalExpense += cost;
      
      const serviceType = vs.serviceType || 'Other';
      vehicleExpenses[vehicleKey].serviceTypes[serviceType] = 
        (vehicleExpenses[vehicleKey].serviceTypes[serviceType] || 0) + cost;
    });

    // Process Parts Cost Log entries
    partsCostLogEntries.forEach(pcl => {
      // Try multiple ways to identify the vehicle
      let vehicleKey = null;
      let vehicleName = 'Unknown';
      
      if (pcl.vehicleId?._id) {
        const vehId = pcl.vehicleId._id.toString();
        vehicleKey = vehId;
        vehicleName = pcl.vehicleId.internalId || pcl.vehicleId.unitNo || vehicleMap[vehId] || pcl.vehicle || 'Unknown';
      } else if (pcl.vehicle) {
        // Try to find FleetUnit by unitNumber or internalId
        const matchedUnit = fleetUnits.find(u => u.unitNo === pcl.vehicle || u.internalId === pcl.vehicle);
        if (matchedUnit) {
          vehicleKey = matchedUnit._id.toString();
          vehicleName = matchedUnit.internalId || matchedUnit.unitNo || pcl.vehicle;
        } else {
          vehicleKey = pcl.vehicle;
          vehicleName = pcl.vehicle;
        }
      }
      
      if (!vehicleKey) return;
      
      if (!vehicleExpenses[vehicleKey]) {
        vehicleExpenses[vehicleKey] = {
          vehicle: vehicleName,
          vehicleId: vehicleKey,
          totalExpense: 0,
          expenses: [],
          serviceTypes: {}
        };
      }
      
      const cost = Number(pcl.totalCost) || 0;
      vehicleExpenses[vehicleKey].totalExpense += cost;
      
      vehicleExpenses[vehicleKey].serviceTypes['Parts'] = 
        (vehicleExpenses[vehicleKey].serviceTypes['Parts'] || 0) + cost;
    });

    // Format response
    const summary = Object.values(vehicleExpenses).map(exp => {
      // Try to get odometer reading - match by vehicle name (internalId or unitNo)
      let odometer = 0;
      const matchedUnit = fleetUnits.find(u => 
        (u.internalId && u.internalId === exp.vehicle) || 
        (u.unitNo && u.unitNo === exp.vehicle) ||
        (u._id.toString() === exp.vehicleId)
      );
      if (matchedUnit) {
        odometer = matchedUnit.currentOdometer || matchedUnit.odometer || 0;
      } else if (odometerMap[exp.vehicle]) {
        odometer = odometerMap[exp.vehicle];
      }
      
      // Calculate cost per mile (convert km to miles if needed, or use miles directly)
      // Assuming odometer is in miles, if in km, multiply by 0.621371
      const costPerMile = odometer > 0 ? (exp.totalExpense / odometer) : 0;

      // Create breakdown string
      const breakdown = Object.entries(exp.serviceTypes)
        .filter(([type, cost]) => Number(cost) > 0)
        .map(([type, cost]) => `${type}: $${Number(cost).toFixed(2)}`)
        .join(', ');

      // Get top 5 expense types
      const topExpenses = Object.entries(exp.serviceTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type]) => type);

      return {
        vehicle: exp.vehicle,
        totalExpense: exp.totalExpense,
        costPerMile: parseFloat(costPerMile.toFixed(2)),
        breakdown: breakdown || 'No breakdown available',
        topExpenses: topExpenses
      };
    }).filter(exp => exp.totalExpense > 0 || exp.breakdown !== 'No breakdown available'); // Filter out entries with no expenses

    // Apply search filter if provided
    let filteredSummary = summary;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredSummary = summary.filter(s => 
        s.vehicle.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      message: 'Maintenance expense summary fetched successfully',
      data: filteredSummary
    });
  } catch (err) {
    console.error('Error fetching maintenance expense summary:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Get Parts Cost Log
export const getPartsCostLog = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { search } = req.query;

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    // Search filter
    if (search) {
      query.$or = [
        { partNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { vehicle: { $regex: search, $options: 'i' } }
      ];
    }

    const partsCostLog = await PartsCostLog.find(query)
      .populate('vehicleId', 'internalId licensePlate')
      .sort({ dateOfUse: -1, createdAt: -1 });

    res.json({
      success: true,
      message: 'Parts cost log fetched successfully',
      data: partsCostLog
    });
  } catch (err) {
    console.error('Error fetching parts cost log:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Create Parts Cost Log Entry
export const createPartsCostLog = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const { partNumber, description, unitCost, quantity, dateOfUse, vehicle, vehicleId, workOrderId, sparePartId } = req.body;

    if (!partNumber || !description || !unitCost || !quantity || !vehicle || !dateOfUse) {
      return res.status(400).json({
        success: false,
        message: "Part number, description, unit cost, quantity, vehicle, and date of use are required."
      });
    }

    // Extract real ID from prefixed ID if needed
    let processedVehicleId = null;
    if (vehicleId) {
      const extractedId = extractRealId(vehicleId);
      if (isValidObjectId(extractedId)) {
        processedVehicleId = extractedId;
      }
    }

    const payload = {
      partNumber: partNumber.trim(),
      description: description.trim(),
      unitCost: Number(unitCost),
      quantity: Number(quantity),
      dateOfUse: new Date(dateOfUse),
      vehicle: vehicle.trim(),
      vehicleId: processedVehicleId,
      workOrderId: workOrderId || null,
      sparePartId: sparePartId || null,
      company: isSuperadmin ? req.body.company || null : companyId
    };

    const partsCostLogEntry = new PartsCostLog(payload);
    await partsCostLogEntry.save();

    res.json({
      success: true,
      message: "Parts cost log entry created successfully",
      data: partsCostLogEntry
    });
  } catch (err) {
    console.error('Error creating parts cost log entry:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Update Parts Cost Log Entry
export const updatePartsCostLog = async (req, res) => {
  try {
    const { id } = req.params;
    let updateData = { ...req.body };

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    // Convert number fields
    if (updateData.unitCost !== undefined) updateData.unitCost = Number(updateData.unitCost);
    if (updateData.quantity !== undefined) updateData.quantity = Number(updateData.quantity);
    if (updateData.dateOfUse) updateData.dateOfUse = new Date(updateData.dateOfUse);
    
    // Handle prefixed vehicleId
    if (updateData.vehicleId) {
      const extractedId = extractRealId(updateData.vehicleId);
      updateData.vehicleId = isValidObjectId(extractedId) ? extractedId : null;
    }

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const updatedEntry = await PartsCostLog.findOneAndUpdate(query, updateData, {
      new: true,
      runValidators: true,
    }).populate('vehicleId', 'internalId licensePlate');

    if (!updatedEntry) {
      return res.status(404).json({ success: false, message: "Parts cost log entry not found" });
    }

    res.json({
      success: true,
      message: "Parts cost log entry updated successfully",
      data: updatedEntry
    });
  } catch (err) {
    console.error('Error updating parts cost log entry:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Delete Parts Cost Log Entry
export const deletePartsCostLog = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const deletedEntry = await PartsCostLog.findOneAndDelete(query);
    if (!deletedEntry) {
      return res.status(404).json({ success: false, message: "Parts cost log entry not found" });
    }

    res.json({
      success: true,
      message: "Parts cost log entry deleted successfully"
    });
  } catch (err) {
    console.error('Error deleting parts cost log entry:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Get Labor Rates
export const getLaborRates = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { search } = req.query;

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    // Search filter
    if (search) {
      query.$or = [
        { rateType: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const laborRates = await LaborRate.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: 'Labor rates fetched successfully',
      data: laborRates
    });
  } catch (err) {
    console.error('Error fetching labor rates:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Create Labor Rate
export const createLaborRate = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const { rateType, description, rate, isActive } = req.body;

    if (!rateType || rate === undefined) {
      return res.status(400).json({
        success: false,
        message: "Rate type and rate are required."
      });
    }

    const payload = {
      rateType: rateType.trim(),
      description: description?.trim() || '',
      rate: Number(rate),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      company: isSuperadmin ? req.body.company || null : companyId
    };

    const laborRate = new LaborRate(payload);
    await laborRate.save();

    res.json({
      success: true,
      message: "Labor rate created successfully",
      data: laborRate
    });
  } catch (err) {
    console.error('Error creating labor rate:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Update Labor Rate
export const updateLaborRate = async (req, res) => {
  try {
    const { id } = req.params;
    let updateData = { ...req.body };

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    // Convert fields
    if (updateData.rate !== undefined) updateData.rate = Number(updateData.rate);
    if (updateData.isActive !== undefined) updateData.isActive = Boolean(updateData.isActive);
    if (updateData.rateType) updateData.rateType = updateData.rateType.trim();
    if (updateData.description) updateData.description = updateData.description.trim();

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const updatedRate = await LaborRate.findOneAndUpdate(query, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedRate) {
      return res.status(404).json({ success: false, message: "Labor rate not found" });
    }

    res.json({
      success: true,
      message: "Labor rate updated successfully",
      data: updatedRate
    });
  } catch (err) {
    console.error('Error updating labor rate:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Delete Labor Rate
export const deleteLaborRate = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const deletedRate = await LaborRate.findOneAndDelete(query);
    if (!deletedRate) {
      return res.status(404).json({ success: false, message: "Labor rate not found" });
    }

    res.json({
      success: true,
      message: "Labor rate deleted successfully"
    });
  } catch (err) {
    console.error('Error deleting labor rate:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Get Maintenance Plan Financials
export const getMaintenancePlans = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { search } = req.query;

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    // Search filter
    if (search) {
      query.$or = [
        { planName: { $regex: search, $options: 'i' } },
        { vehicle: { $regex: search, $options: 'i' } }
      ];
    }

    const maintenancePlans = await MaintenancePlan.find(query)
      .populate('vehicleId', 'internalId licensePlate')
      .sort({ plannedDate: -1, createdAt: -1 });

    res.json({
      success: true,
      message: 'Maintenance plans fetched successfully',
      data: maintenancePlans
    });
  } catch (err) {
    console.error('Error fetching maintenance plans:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Create Maintenance Plan
export const createMaintenancePlan = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const { planName, vehicle, vehicleId, plannedCost, actualCost, status, plannedDate, completedDate, description } = req.body;

    if (!planName || !vehicle || plannedCost === undefined) {
      return res.status(400).json({
        success: false,
        message: "Plan name, vehicle, and planned cost are required."
      });
    }

    // Extract real ID from prefixed ID if needed
    let processedVehicleId = null;
    if (vehicleId) {
      const extractedId = extractRealId(vehicleId);
      if (isValidObjectId(extractedId)) {
        processedVehicleId = extractedId;
      }
    }

    const payload = {
      planName: planName.trim(),
      vehicle: vehicle.trim(),
      vehicleId: processedVehicleId,
      plannedCost: Number(plannedCost),
      actualCost: actualCost !== undefined ? Number(actualCost) : 0,
      status: status || 'Scheduled',
      plannedDate: plannedDate ? new Date(plannedDate) : null,
      completedDate: completedDate ? new Date(completedDate) : null,
      description: description?.trim() || '',
      company: isSuperadmin ? req.body.company || null : companyId
    };

    const maintenancePlan = new MaintenancePlan(payload);
    await maintenancePlan.save();

    res.json({
      success: true,
      message: "Maintenance plan created successfully",
      data: maintenancePlan
    });
  } catch (err) {
    console.error('Error creating maintenance plan:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Update Maintenance Plan
export const updateMaintenancePlan = async (req, res) => {
  try {
    const { id } = req.params;
    let updateData = { ...req.body };

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    // Convert fields
    if (updateData.plannedCost !== undefined) updateData.plannedCost = Number(updateData.plannedCost);
    if (updateData.actualCost !== undefined) updateData.actualCost = Number(updateData.actualCost);
    if (updateData.plannedDate) updateData.plannedDate = new Date(updateData.plannedDate);
    if (updateData.completedDate) updateData.completedDate = new Date(updateData.completedDate);
    if (updateData.planName) updateData.planName = updateData.planName.trim();
    if (updateData.vehicle) updateData.vehicle = updateData.vehicle.trim();
    if (updateData.description) updateData.description = updateData.description.trim();
    
    // Handle prefixed vehicleId
    if (updateData.vehicleId) {
      const extractedId = extractRealId(updateData.vehicleId);
      updateData.vehicleId = isValidObjectId(extractedId) ? extractedId : null;
    }

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const updatedPlan = await MaintenancePlan.findOneAndUpdate(query, updateData, {
      new: true,
      runValidators: true,
    }).populate('vehicleId', 'internalId licensePlate');

    if (!updatedPlan) {
      return res.status(404).json({ success: false, message: "Maintenance plan not found" });
    }

    res.json({
      success: true,
      message: "Maintenance plan updated successfully",
      data: updatedPlan
    });
  } catch (err) {
    console.error('Error updating maintenance plan:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Delete Maintenance Plan
export const deleteMaintenancePlan = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const deletedPlan = await MaintenancePlan.findOneAndDelete(query);
    if (!deletedPlan) {
      return res.status(404).json({ success: false, message: "Maintenance plan not found" });
    }

    res.json({
      success: true,
      message: "Maintenance plan deleted successfully"
    });
  } catch (err) {
    console.error('Error deleting maintenance plan:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Get Fleet Maintenance Finance Stats
export const getFleetMaintenanceStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        data: {
          totalMaintenanceCost: 0,
          avgCostPerMile: 0,
          partsInventoryValue: 0,
          pendingPMPlans: 0
        }
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    // Calculate total maintenance cost (from work orders and vehicle services)
    // Include only completed work orders and services with costs
    const workOrdersCost = await WorkOrder.aggregate([
      { 
        $match: { 
          ...query,
          estimatedCost: { $exists: true, $ne: null, $gt: 0 }
        } 
      },
      { $group: { _id: null, total: { $sum: '$estimatedCost' } } }
    ]);
    const woTotal = workOrdersCost[0]?.total || 0;

    const vehicleServicesCost = await VehicleService.aggregate([
      { 
        $match: { 
          ...query,
          estimatedCost: { $exists: true, $ne: null, $gt: 0 }
        } 
      },
      { $group: { _id: null, total: { $sum: '$estimatedCost' } } }
    ]);
    const vsTotal = vehicleServicesCost[0]?.total || 0;

    // Also include parts cost log entries
    const partsCostLogTotal = await PartsCostLog.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$totalCost' } } }
    ]);
    const partsTotal = partsCostLogTotal[0]?.total || 0;

    const totalMaintenanceCost = woTotal + vsTotal + partsTotal;

    // Calculate average cost per mile
    const fleetUnitsData = await FleetUnit.find(query).select('odometer currentOdometer').lean();
    const totalMiles = fleetUnitsData.reduce((sum, unit) => sum + (unit.currentOdometer || unit.odometer || 0), 0);
    const avgCostPerMile = totalMiles > 0 ? (totalMaintenanceCost / totalMiles) : 0;

    // Calculate parts inventory value (from SparePart model)
    const { SparePart } = await import("../../models/driver/sparePartModel.js");
    const partsQuery = {};
    if (companyId) {
      partsQuery.company = companyId;
    }
    if (!isSuperadmin) {
      Object.assign(partsQuery, await getCombinedFilter(req.user, partsQuery));
    }
    
    const partsValue = await SparePart.aggregate([
      { 
        $match: {
          ...partsQuery,
          stockQty: { $exists: true, $gte: 0 },
          buyingPrice: { $exists: true, $gte: 0 }
        }
      },
      { 
        $group: { 
          _id: null, 
          total: { $sum: { $multiply: [{ $ifNull: ['$stockQty', 0] }, { $ifNull: ['$buyingPrice', 0] }] } },
          count: { $sum: 1 }
        } 
      }
    ]);
    const partsInventoryValue = partsValue[0]?.total || 0;
    const partsInventoryCount = partsValue[0]?.count || 0;

    // Count pending PM plans
    const pendingQuery = { ...query, status: 'Scheduled' };
    const pendingPMPlans = await MaintenancePlan.countDocuments(pendingQuery);

    // Calculate last month's maintenance cost for comparison
    const lastMonthStart = new Date();
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    lastMonthStart.setDate(1);
    lastMonthStart.setHours(0, 0, 0, 0);
    
    const lastMonthEnd = new Date();
    lastMonthEnd.setDate(0); // Last day of previous month
    lastMonthEnd.setHours(23, 59, 59, 999);

    const lastMonthWorkOrders = await WorkOrder.aggregate([
      { 
        $match: { 
          ...query,
          createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
          estimatedCost: { $exists: true, $ne: null, $gt: 0 }
        } 
      },
      { $group: { _id: null, total: { $sum: '$estimatedCost' } } }
    ]);
    const lastMonthServices = await VehicleService.aggregate([
      { 
        $match: { 
          ...query,
          createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
          estimatedCost: { $exists: true, $ne: null, $gt: 0 }
        } 
      },
      { $group: { _id: null, total: { $sum: '$estimatedCost' } } }
    ]);
    const lastMonthParts = await PartsCostLog.aggregate([
      { 
        $match: { 
          ...query,
          dateOfUse: { $gte: lastMonthStart, $lte: lastMonthEnd }
        } 
      },
      { $group: { _id: null, total: { $sum: '$totalCost' } } }
    ]);
    
    const lastMonthTotal = (lastMonthWorkOrders[0]?.total || 0) + 
                          (lastMonthServices[0]?.total || 0) + 
                          (lastMonthParts[0]?.total || 0);
    
    const percentChange = lastMonthTotal > 0 
      ? (((totalMaintenanceCost - lastMonthTotal) / lastMonthTotal) * 100).toFixed(1)
      : totalMaintenanceCost > 0 ? '100.0' : '0.0';

    res.json({
      success: true,
      data: {
        totalMaintenanceCost,
        avgCostPerMile: parseFloat(avgCostPerMile.toFixed(2)),
        partsInventoryValue,
        partsInventoryCount,
        pendingPMPlans,
        percentChange: parseFloat(percentChange)
      }
    });
  } catch (err) {
    console.error('Error fetching fleet maintenance stats:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

