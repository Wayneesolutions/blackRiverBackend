// controllers/fleet/fleetMaintenanceFinanceController.js
import { WorkOrder } from "../../models/driver/workOrderModel.js";
import { VehicleService } from "../../models/driver/vehicleService.js";
import { PartsCostLog } from "../../models/fleet/partsCostLogModel.js";
import { LaborRate } from "../../models/fleet/laborRateModel.js";
import { MaintenancePlan } from "../../models/fleet/maintenancePlanModel.js";
import { FleetUnit } from "../../models/fleet/fleetUnitModel.js";
import { GeneralRepair } from "../../models/fleet/generalRepairModel.js";
import { Vehicle } from "../../models/driver/vehicleModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";
import mongoose from "mongoose";

// Mongoose casts string ids in find(), but NOT inside aggregate() pipelines.
// getUserCompanyId() returns a string, so every aggregate $match on company
// matched nothing and the stat cards always showed $0. Match both forms.
const toAggregateMatch = (query = {}) => {
  const match = { ...query };
  const company = match.company;
  if (typeof company === 'string' && mongoose.Types.ObjectId.isValid(company)) {
    match.company = { $in: [new mongoose.Types.ObjectId(company), company] };
  }
  return match;
};

// Cost of a maintenance order (GeneralRepair): final invoice total if the mechanic
// completed it, otherwise the amount entered when it was logged.
const generalRepairCost = (gr) => Number(gr.completionTotalAmount) || Number(gr.amount) || 0;

// Vehicle services that already produced a maintenance order (GeneralRepair.sourceServiceId)
// are counted once, through the maintenance order, to avoid double counting.
const getLinkedServiceIds = async (query) => {
  const linked = await GeneralRepair.find({ ...query, sourceServiceId: { $ne: null } })
    .select('sourceServiceId')
    .lean();
  return linked.map(gr => gr.sourceServiceId).filter(Boolean);
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

// ✅ Get Maintenance Expense Summary
// Client (15 Nov): show how much we spend on each truck and trailer, per month, with a custom
// date range; in-house repairs and outside breakdowns; parts; what each unit was bought for.
// GET /hr/fleet-maintenance/expense-summary?startDate=&endDate=&unitType=Truck|Trailer&search=
export const getMaintenanceExpenseSummary = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { search, startDate, endDate, unitType } = req.query;

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    // Date range (inclusive). Without a range every record counts (old behaviour).
    const from = startDate ? new Date(startDate) : null;
    if (from) from.setHours(0, 0, 0, 0);
    const to = endDate ? new Date(endDate) : null;
    if (to) to.setHours(23, 59, 59, 999);
    const inRange = (d) => {
      if (!from && !to) return true;
      if (!d) return false;
      const t = new Date(d);
      return (!from || t >= from) && (!to || t <= to);
    };
    const monthKey = (d) => {
      const t = d ? new Date(d) : null;
      return t && !isNaN(t) ? `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}` : 'Undated';
    };

    // Units: Fleet Maintenance units (FleetUnit), trucks (Vehicle) and trailers (Trailer)
    const { Trailer } = await import("../../models/driver/trailerModel.js");
    const { Expense } = await import("../../models/hr/expenseModel.js");
    const [fleetUnits, vehicles, trailers] = await Promise.all([
      FleetUnit.find(query).select('_id internalId unitNo licensePlate odometer currentOdometer unitType purchasePrice').lean(),
      Vehicle.find(query).select('_id internalId unitNumber plateNumber odometer assetValue purchasePrice').lean(),
      Trailer.find(query).select('_id unitNumber trailer plateNumber purchasePrice').lean(),
    ]);

    const units = new Map(); // key -> unit info
    const unitName = new Map(); // any name/number -> key
    const register = (key, name, type, odometerMiles, purchasePrice) => {
      if (!units.has(key)) units.set(key, { key, name, type, odometerMiles: odometerMiles || 0, purchasePrice: Number(purchasePrice) || 0 });
      if (name) unitName.set(String(name).trim().toLowerCase(), key);
    };
    fleetUnits.forEach(u => {
      const type = /trailer/i.test(u.unitType || '') ? 'Trailer' : 'Truck';
      register(u._id.toString(), u.internalId || u.unitNo || u.licensePlate || u._id.toString(), type,
        u.currentOdometer || u.odometer || 0, u.purchasePrice);
      [u.unitNo, u.licensePlate].forEach(n => n && unitName.set(String(n).trim().toLowerCase(), u._id.toString()));
    });
    vehicles.forEach(v => {
      // Vehicle odometer is stored in km
      register(v._id.toString(), v.internalId || v.unitNumber || v.plateNumber || v._id.toString(), 'Truck',
        (Number(v.odometer) || 0) * 0.621371, v.purchasePrice || v.assetValue);
      [v.unitNumber, v.plateNumber].forEach(n => n && unitName.set(String(n).trim().toLowerCase(), v._id.toString()));
    });
    trailers.forEach(t => {
      register(t._id.toString(), t.unitNumber || t.trailer || t.plateNumber || t._id.toString(), 'Trailer', 0, t.purchasePrice);
      [t.trailer, t.plateNumber].forEach(n => n && unitName.set(String(n).trim().toLowerCase(), t._id.toString()));
    });

    const resolveKey = (id, name, fallbackType = 'Truck') => {
      if (id && units.has(String(id))) return String(id);
      const byName = name ? unitName.get(String(name).trim().toLowerCase()) : null;
      if (byName) return byName;
      if (!name && !id) return null;
      const key = String(name || id);
      register(key, String(name || id), fallbackType, 0, 0);
      return key;
    };

    const spend = new Map(); // key -> totals
    const fleetMonthly = {};
    const add = (key, category, cost, date) => {
      if (!key || !(cost > 0) || !inRange(date)) return;
      if (!spend.has(key)) {
        spend.set(key, { total: 0, inHouse: 0, outside: 0, parts: 0, services: 0, otherExpenses: 0, entries: 0, monthly: {}, serviceTypes: {} });
      }
      const e = spend.get(key);
      e.total += cost;
      e.entries += 1;
      if (category === 'inHouse') e.inHouse += cost;
      else if (category === 'outside') e.outside += cost;
      else if (category === 'parts') e.parts += cost;
      else if (category === 'services') e.services += cost;
      else e.otherExpenses += cost;
      const m = monthKey(date);
      e.monthly[m] = (e.monthly[m] || 0) + cost;
      fleetMonthly[m] = (fleetMonthly[m] || 0) + cost;
      return e;
    };

    // 1. Maintenance orders (in-house mechanic or outside shop / roadside breakdown)
    const generalRepairs = await GeneralRepair.find(query)
      .select('unitNumber unitReference unitSource description amount completionTotalAmount serviceDate completionDate mechanicType serviceProvider')
      .lean();
    generalRepairs.forEach(gr => {
      const key = resolveKey(gr.unitReference, gr.unitNumber, gr.unitSource === 'trailer' ? 'Trailer' : 'Truck');
      const e = add(key, gr.mechanicType === 'external' ? 'outside' : 'inHouse', generalRepairCost(gr), gr.completionDate || gr.serviceDate);
      if (e) {
        const label = gr.mechanicType === 'external' ? 'Outside repairs' : 'In-house repairs';
        e.serviceTypes[label] = (e.serviceTypes[label] || 0) + generalRepairCost(gr);
      }
    });

    // 2. Vehicle services not already turned into a maintenance order
    const linkedServiceIds = await getLinkedServiceIds(query);
    const vehicleServices = await VehicleService.find({ ...query, _id: { $nin: linkedServiceIds } })
      .select('vehicleId unitNumber unitType serviceType actualCost estimatedCost amount serviceDate createdAt')
      .lean();
    vehicleServices.forEach(vs => {
      const cost = Number(vs.actualCost) || Number(vs.amount) || Number(vs.estimatedCost) || 0;
      const key = resolveKey(vs.vehicleId, vs.unitNumber, /trailer/i.test(vs.unitType || '') ? 'Trailer' : 'Truck');
      const e = add(key, 'services', cost, vs.serviceDate || vs.createdAt);
      if (e) e.serviceTypes[vs.serviceType || 'Service'] = (e.serviceTypes[vs.serviceType || 'Service'] || 0) + cost;
    });

    // 3. Work orders
    const workOrders = await WorkOrder.find(query)
      .select('vehicleId unitNumber issue actualCost estimatedCost completionDate createdAt')
      .lean();
    workOrders.forEach(wo => {
      const cost = Number(wo.actualCost) || Number(wo.estimatedCost) || 0;
      const key = resolveKey(wo.vehicleId, wo.unitNumber);
      const e = add(key, 'inHouse', cost, wo.completionDate || wo.createdAt);
      if (e) e.serviceTypes[wo.issue || 'Work order'] = (e.serviceTypes[wo.issue || 'Work order'] || 0) + cost;
    });

    // 4. Parts
    const partsCostLogEntries = await PartsCostLog.find(query).lean();
    partsCostLogEntries.forEach(pcl => {
      const key = resolveKey(pcl.vehicleId, pcl.vehicle);
      const e = add(key, 'parts', Number(pcl.totalCost) || 0, pcl.dateOfUse || pcl.createdAt);
      if (e) e.serviceTypes['Parts'] = (e.serviceTypes['Parts'] || 0) + (Number(pcl.totalCost) || 0);
    });

    // 5. Expenses entered in Expense Management against a truck or trailer
    const unitExpenses = await Expense.find({ ...query, $or: [{ vehicle: { $ne: null } }, { trailer: { $ne: null } }] })
      .populate('categoryId', 'name')
      .select('vehicle trailer amount date categoryId type')
      .lean();
    unitExpenses.forEach(ex => {
      const key = resolveKey(ex.vehicle || ex.trailer, null, ex.trailer ? 'Trailer' : 'Truck');
      const label = ex.categoryId?.name || ex.type || 'Expenses';
      const e = add(key, 'other', Number(ex.amount) || 0, ex.date);
      if (e) e.serviceTypes[label] = (e.serviceTypes[label] || 0) + (Number(ex.amount) || 0);
    });

    const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    let summary = Array.from(spend.entries()).map(([key, e]) => {
      const u = units.get(key) || { name: key, type: 'Truck', odometerMiles: 0, purchasePrice: 0 };
      const breakdown = Object.entries(e.serviceTypes)
        .filter(([, cost]) => Number(cost) > 0)
        .sort((x, y) => y[1] - x[1])
        .map(([type, cost]) => `${type}: $${Number(cost).toFixed(2)}`)
        .join(', ');
      return {
        vehicle: u.name,
        vehicleId: key,
        unitType: u.type,
        totalExpense: r2(e.total),
        inHouseRepairs: r2(e.inHouse),
        outsideRepairs: r2(e.outside),
        parts: r2(e.parts),
        services: r2(e.services),
        otherExpenses: r2(e.otherExpenses),
        entries: e.entries,
        purchasePrice: r2(u.purchasePrice),
        monthly: Object.fromEntries(Object.entries(e.monthly).sort().map(([m, v]) => [m, r2(v)])),
        costPerMile: u.odometerMiles > 0 ? r2(e.total / u.odometerMiles) : 0,
        breakdown: breakdown || 'No breakdown available',
        topExpenses: Object.entries(e.serviceTypes).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([t]) => t),
      };
    });

    if (unitType) summary = summary.filter(s => s.unitType.toLowerCase() === String(unitType).toLowerCase());
    if (search) {
      const q = String(search).toLowerCase();
      summary = summary.filter(s => s.vehicle.toLowerCase().includes(q));
    }
    summary.sort((x, y) => y.totalExpense - x.totalExpense);

    const months = Object.keys(fleetMonthly).filter(m => m !== 'Undated').sort();
    res.json({
      success: true,
      message: 'Maintenance expense summary fetched successfully',
      data: summary,
      meta: {
        startDate: from, endDate: to,
        months,
        monthlyTotals: Object.fromEntries(months.map(m => [m, r2(fleetMonthly[m])])),
        totals: {
          total: r2(summary.reduce((s, x) => s + x.totalExpense, 0)),
          trucks: r2(summary.filter(x => x.unitType === 'Truck').reduce((s, x) => s + x.totalExpense, 0)),
          trailers: r2(summary.filter(x => x.unitType === 'Trailer').reduce((s, x) => s + x.totalExpense, 0)),
          inHouseRepairs: r2(summary.reduce((s, x) => s + x.inHouseRepairs, 0)),
          outsideRepairs: r2(summary.reduce((s, x) => s + x.outsideRepairs, 0)),
          parts: r2(summary.reduce((s, x) => s + x.parts, 0)),
          purchasePrice: r2(Array.from(units.values()).filter(u => !unitType || u.type.toLowerCase() === String(unitType).toLowerCase()).reduce((s, u) => s + (u.purchasePrice || 0), 0)),
        },
      },
    });
  } catch (err) {
    console.error('Error fetching maintenance expense summary:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Set what a truck / trailer was bought for (shown in the fleet spend report)
// PATCH /hr/fleet-maintenance/unit-purchase-price  { unitId, purchasePrice, purchaseDate }
export const setUnitPurchasePrice = async (req, res) => {
  try {
    const { unitId, purchasePrice, purchaseDate } = req.body;
    if (!unitId || !isValidObjectId(unitId)) {
      return res.status(400).json({ success: false, message: 'Select a unit' });
    }
    const price = Number(purchasePrice);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ success: false, message: 'Purchase price must be a positive number' });
    }
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const filter = { _id: unitId, ...(isSuperadmin ? {} : { company: companyId }) };
    const update = { purchasePrice: price, ...(purchaseDate ? { purchaseDate: new Date(purchaseDate) } : {}) };
    const { Trailer } = await import("../../models/driver/trailerModel.js");
    const updated = (await FleetUnit.findOneAndUpdate(filter, update, { new: true }))
      || (await Vehicle.findOneAndUpdate(filter, update, { new: true }))
      || (await Trailer.findOneAndUpdate(filter, update, { new: true }));
    if (!updated) return res.status(404).json({ success: false, message: 'Unit not found' });
    res.json({ success: true, message: 'Purchase price saved', data: { unitId, purchasePrice: price } });
  } catch (err) {
    console.error('Error saving purchase price:', err);
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

    // Calculate total maintenance cost (work orders + vehicle services + parts log + maintenance orders)
    // aggregate() does not cast string company ids -> use toAggregateMatch()
    const aggQuery = toAggregateMatch(query);
    const linkedServiceIds = await getLinkedServiceIds(query);

    const workOrdersCost = await WorkOrder.aggregate([
      { 
        $match: { 
          ...aggQuery,
          estimatedCost: { $exists: true, $ne: null, $gt: 0 }
        } 
      },
      { $group: { _id: null, total: { $sum: '$estimatedCost' } } }
    ]);
    const woTotal = workOrdersCost[0]?.total || 0;

    const vehicleServicesCost = await VehicleService.aggregate([
      { 
        $match: { 
          ...aggQuery,
          _id: { $nin: linkedServiceIds },
          estimatedCost: { $exists: true, $ne: null, $gt: 0 }
        } 
      },
      { $group: { _id: null, total: { $sum: '$estimatedCost' } } }
    ]);
    const vsTotal = vehicleServicesCost[0]?.total || 0;

    // Also include parts cost log entries
    const partsCostLogTotal = await PartsCostLog.aggregate([
      { $match: aggQuery },
      { $group: { _id: null, total: { $sum: '$totalCost' } } }
    ]);
    const partsTotal = partsCostLogTotal[0]?.total || 0;

    // Maintenance orders (Fleet Maintenance > Maintenance Orders Log)
    const generalRepairDocs = await GeneralRepair.find(query)
      .select('amount completionTotalAmount serviceDate createdAt')
      .lean();
    const grTotal = generalRepairDocs.reduce((sum, gr) => sum + generalRepairCost(gr), 0);

    const totalMaintenanceCost = woTotal + vsTotal + partsTotal + grTotal;

    // Calculate average cost per mile (FleetUnit odometer is miles; Vehicle odometer is km)
    const fleetUnitsData = await FleetUnit.find(query).select('odometer currentOdometer').lean();
    let totalMiles = fleetUnitsData.reduce((sum, unit) => sum + (unit.currentOdometer || unit.odometer || 0), 0);
    if (totalMiles === 0) {
      const vehiclesData = await Vehicle.find(query).select('odometer').lean();
      totalMiles = vehiclesData.reduce((sum, v) => sum + ((v.odometer || 0) * 0.621371), 0);
    }
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
          ...toAggregateMatch(partsQuery),
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
          ...aggQuery,
          createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
          estimatedCost: { $exists: true, $ne: null, $gt: 0 }
        } 
      },
      { $group: { _id: null, total: { $sum: '$estimatedCost' } } }
    ]);
    const lastMonthServices = await VehicleService.aggregate([
      { 
        $match: { 
          ...aggQuery,
          _id: { $nin: linkedServiceIds },
          createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
          estimatedCost: { $exists: true, $ne: null, $gt: 0 }
        } 
      },
      { $group: { _id: null, total: { $sum: '$estimatedCost' } } }
    ]);
    const lastMonthParts = await PartsCostLog.aggregate([
      { 
        $match: { 
          ...aggQuery,
          dateOfUse: { $gte: lastMonthStart, $lte: lastMonthEnd }
        } 
      },
      { $group: { _id: null, total: { $sum: '$totalCost' } } }
    ]);
    
    const lastMonthRepairs = generalRepairDocs
      .filter(gr => {
        const d = new Date(gr.serviceDate || gr.createdAt);
        return d >= lastMonthStart && d <= lastMonthEnd;
      })
      .reduce((sum, gr) => sum + generalRepairCost(gr), 0);

    const lastMonthTotal = (lastMonthWorkOrders[0]?.total || 0) + 
                          (lastMonthServices[0]?.total || 0) + 
                          (lastMonthParts[0]?.total || 0) +
                          lastMonthRepairs;
    
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

