import { Settlement, DeductionAddition, MilesTracking } from "../../models/hr/settlementModel.js";
import { User } from "../../models/driver/userModel.js";
import { Vehicle } from "../../models/driver/vehicleModel.js";
import { Trailer } from "../../models/driver/trailerModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import mongoose from "mongoose";
import Order from "../../models/orderModel.js";
import { normalizePayItems, missingMemoError, sumItems, PAYROLL_ORDER_STATUSES } from "../../utils/payrollItems.js";

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

// Helper to check if ID is a prefixed FleetUnit ID
const isPrefixedFleetUnitId = (id) => {
  if (!id) return false;
  return id.startsWith("custom-") || id.startsWith("vehicle-") || id.startsWith("trailer-");
};

// Helper function to generate settlement ID
const generateSettlementId = async (companyId) => {
  const year = new Date().getFullYear();
  const query = { 
    settlementId: new RegExp(`^STL-${year}-`)
  };
  
  // Filter by company if provided (for multi-tenant support)
  if (companyId) {
    query.company = companyId;
  }
  
  const count = await Settlement.countDocuments(query);
  const sequence = String(count + 1).padStart(3, '0');
  return `STL-${year}-${sequence}`;
};


// ==================== TRUCK (OWNER-OPERATOR) SETTLEMENT ====================

const KM_TO_MILES = 0.621371;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isOwnerOperator = (u) => !!(u && (u.details?.companyFlag ?? u.companyFlag));

/**
 * GET /hr/settlement/truck-work?truckId=&startDate=&endDate=&ratePerMile=&emptyRatePerMile=
 * Everything a truck did in the period, whoever drove it. Loads driven by our own company
 * drivers come back as suggested deductions ("we deduct his salary from the settlement").
 */
export const getTruckWork = async (req, res) => {
  try {
    const { truckId, startDate, endDate } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!truckId || !mongoose.Types.ObjectId.isValid(truckId)) {
      return res.status(400).json({ success: false, message: "Select a truck" });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: "Start date and end date are required" });
    }

    const truck = await Vehicle.findOne({ _id: truckId, ...(isSuperadmin ? {} : { company: companyId }) })
      .populate('operator', 'name address city state country details companyFlag')
      .populate('driver', 'name address city state country details companyFlag')
      .lean();
    if (!truck) {
      return res.status(404).json({ success: false, message: "Truck not found" });
    }

    // Payee: the owner-operator linked to the truck (operator first, then assigned driver)
    const owner = [truck.operator, truck.driver].find(isOwnerOperator) || truck.operator || truck.driver || null;
    const ownerRate = Number(owner?.details?.salaryPerMile || owner?.details?.mileRate || 0);
    const ownerTeamRate = Number(owner?.details?.mileRateTeam || 0);
    const ownerEmptyRate = Number(owner?.details?.emptyMileRate || 0);
    // No rate on the owner-operator's profile: start from the rate used on this truck's
    // last settlement, so the modal doesn't open with an empty rate, $0 gross and a
    // negative net pay (client retest 17 Nov).
    let lastRates = null;
    if (!Number(req.query.ratePerMile) && !ownerRate) {
      const last = await Settlement.findOne({ truck: truck._id, 'lineItems.0': { $exists: true } })
        .sort({ createdAt: -1 }).select('lineItems.rate lineItems.tripType').lean();
      if (last) {
        const pick = (types) => Number((last.lineItems.find(l => types.includes(l.tripType) && Number(l.rate) > 0) || {}).rate) || 0;
        lastRates = { solo: pick(['SOLO']), team: pick(['TEAM']), empty: pick(['EMPTY', 'EMPTY-T']) };
        lastRates.solo = lastRates.solo || Number((last.lineItems.find(l => Number(l.rate) > 0) || {}).rate) || 0;
      }
    }
    const rate = Number(req.query.ratePerMile) || ownerRate || lastRates?.solo || 0;
    const emptyRate = Number(req.query.emptyRatePerMile) || ownerEmptyRate || lastRates?.empty || rate;
    const teamRate = Number(req.query.teamRatePerMile) || ownerTeamRate || lastRates?.team || rate;
    const rateSource = Number(req.query.ratePerMile) ? 'entered' : ownerRate ? 'profile' : lastRates?.solo ? 'lastSettlement' : 'none';

    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);

    const orders = await Order.find({
      truck: truck._id,
      status: { $in: PAYROLL_ORDER_STATUSES },
      ...(isSuperadmin ? {} : { company: { $in: [new mongoose.Types.ObjectId(companyId), companyId] } }),
      $or: [
        { deliveryDate: { $gte: start, $lte: end } },
        { deliveryDate: null, pickupDate: { $gte: start, $lte: end } },
        { deliveryDate: null, pickupDate: null, updatedAt: { $gte: start, $lte: end } },
      ],
    })
      .populate('driver', 'name details companyFlag')
      .populate('coDriver', 'name details companyFlag')
      .select('orderNumber customerOrderNo driver coDriver empty teamLoad pickupDate deliveryDate pickupLocation deliveryLocation distance status')
      .sort({ pickupDate: 1, deliveryDate: 1 })
      .lean();

    // Loads already in another settlement are flagged so they are not paid twice
    const settled = orders.length
      // A cancelled settlement no longer holds its loads (they stayed greyed out and could not
      // be ticked again - client 19 Nov: "not able to click on any load")
      ? await Settlement.find({ 'lineItems.order': { $in: orders.map(o => o._id) }, status: { $ne: 'Cancelled' } }).select('settlementId lineItems.order').lean()
      : [];
    const settledMap = new Map();
    settled.forEach(st => (st.lineItems || []).forEach(li => li.order && settledMap.set(String(li.order), st.settlementId)));

    const companyDriverMiles = new Map(); // driverId -> { name, miles, amount }
    const lines = orders.map(o => {
      const miles = r2((Number(o.distance) || 0) * KM_TO_MILES);
      const team = !!(o.coDriver || o.teamLoad);
      const lineRate = o.empty ? emptyRate : (team ? teamRate : rate);
      const amount = r2(miles * lineRate);
      const drivers = [o.driver, o.coDriver].filter(Boolean);

      // Our own drivers on this truck: their pay comes off the owner-operator settlement
      drivers.filter(d => !isOwnerOperator(d)).forEach(d => {
        const dRate = Number(o.empty ? (d.details?.emptyMileRate || d.details?.salaryPerMile || d.details?.mileRate)
          : (team ? (d.details?.mileRateTeam || d.details?.salaryPerMile || d.details?.mileRate) : (d.details?.salaryPerMile || d.details?.mileRate))) || 0;
        const cur = companyDriverMiles.get(String(d._id)) || { driverId: d._id, name: d.name, miles: 0, amount: 0, rate: dRate };
        cur.miles = r2(cur.miles + miles);
        cur.amount = r2(cur.amount + miles * dRate);
        companyDriverMiles.set(String(d._id), cur);
      });

      return {
        order: o._id,
        loadNumber: o.empty ? '' : (o.orderNumber || o.customerOrderNo || ''),
        tripType: o.empty ? (team ? 'EMPTY-T' : 'EMPTY') : (team ? 'TEAM' : 'SOLO'),
        driverNames: drivers.map(d => d.name).join(' / '),
        periodFrom: o.pickupDate || o.deliveryDate,
        periodTo: o.deliveryDate || o.pickupDate,
        origin: o.pickupLocation?.place || '',
        destination: o.deliveryLocation?.place || '',
        payType: 'Paid Per Mile',
        rate: lineRate,
        miles,
        amount,
        status: o.status,
        alreadySettledIn: settledMap.get(String(o._id)) || null,
      };
    });

    const suggestedDeductions = Array.from(companyDriverMiles.values())
      .filter(d => d.miles > 0)
      .map(d => ({
        memo: `PAYROLL: DRIVER DEDUCTION FOR ${d.miles.toFixed(2)} MILES (${d.name})`,
        amount: r2(d.amount),
        driverId: d.driverId,
        miles: d.miles,
        rate: d.rate,
      }));

    const payeeAddress = owner ? [owner.address, owner.city, owner.state, owner.country].filter(Boolean).join(', ') : '';
    res.json({
      success: true,
      data: {
        truck: {
          _id: truck._id,
          truckNumber: truck.internalId || truck.unitNumber || truck.plateNumber || '',
          ownership: truck.ownership,
        },
        payee: owner ? { _id: owner._id, name: owner.name, address: payeeAddress, isOwnerOperator: isOwnerOperator(owner) } : null,
        rates: { ratePerMile: rate, teamRatePerMile: teamRate, emptyRatePerMile: emptyRate, source: rateSource },
        lines,
        suggestedDeductions,
        totals: {
          loads: lines.length,
          miles: r2(lines.reduce((s, l) => s + l.miles, 0)),
          grossPay: r2(lines.filter(l => !l.alreadySettledIn).reduce((s, l) => s + l.amount, 0)),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching truck work:", error);
    res.status(500).json({ success: false, message: error.message || "Error fetching truck work" });
  }
};

// ==================== SETTLEMENTS ====================

// Create Settlement
export const createSettlement = async (req, res) => {
  try {
    const { driver, payPeriod, grossPay, status = 'Pending', paymentMethod, paymentReference, notes, appliedDeductions, milesRecords } = req.body;
    let { deductions = 0, additions = 0 } = req.body;

    // Itemised lines (memo required on each addition / deduction)
    const additionItems = normalizePayItems(req.body.additionItems);
    const deductionItems = normalizePayItems(req.body.deductionItems);
    const memoError = missingMemoError(additionItems, deductionItems);
    if (memoError) {
      return res.status(400).json({ success: false, message: memoError });
    }
    if (Array.isArray(req.body.additionItems)) additions = sumItems(additionItems);
    if (Array.isArray(req.body.deductionItems)) deductions = sumItems(deductionItems);

    const truckId = req.body.truck && mongoose.Types.ObjectId.isValid(req.body.truck) ? req.body.truck : null;
    const lineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems.map(l => ({
      order: l.order && mongoose.Types.ObjectId.isValid(l.order) ? l.order : undefined,
      loadNumber: l.loadNumber || '',
      tripType: l.tripType || '',
      driverNames: l.driverNames || '',
      periodFrom: l.periodFrom ? new Date(l.periodFrom) : undefined,
      periodTo: l.periodTo ? new Date(l.periodTo) : undefined,
      origin: l.origin || '',
      destination: l.destination || '',
      payType: l.payType || 'Paid Per Mile',
      rate: Number(l.rate) || 0,
      miles: Math.round((Number(l.miles) || 0) * 100) / 100,
      amount: Math.round((Number(l.amount) || 0) * 100) / 100,
    })) : [];

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    // Validate payee: a driver is required for driver settlements; truck settlements may
    // have no owner profile linked yet (payeeName is printed instead)
    const driverUser = driver ? await User.findById(driver) : null;
    if (!driverUser && !truckId) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    let truckDoc = null;
    if (truckId) {
      truckDoc = await Vehicle.findById(truckId).select('internalId unitNumber plateNumber').lean();
      if (!truckDoc) {
        return res.status(404).json({ success: false, message: "Truck not found" });
      }
      // Stop paying the same load twice
      const orderIds = lineItems.map(l => l.order).filter(Boolean);
      if (orderIds.length) {
        const dup = await Settlement.findOne({ company: companyId, 'lineItems.order': { $in: orderIds }, status: { $ne: 'Cancelled' } }).select('settlementId').lean();
        if (dup) {
          return res.status(409).json({ success: false, message: `Some of these loads are already in settlement ${dup.settlementId}. Untick them and try again.` });
        }
      }
    }

    // Miles typed in on the settlement for a load that had none (0 miles because its address
    // wasn't found on the map): save them on the load too, so driver payroll and the next
    // settlement agree (client 19 Nov: "no option to correct or write the miles")
    const milesFixes = lineItems.filter(l => l.order && l.miles > 0);
    if (milesFixes.length) {
      try {
        await Order.bulkWrite(milesFixes.map(l => ({
          updateOne: {
            filter: { _id: l.order, $or: [{ distance: { $exists: false } }, { distance: null }, { distance: { $lte: 0 } }] },
            update: { $set: { distance: Math.round((l.miles / KM_TO_MILES) * 100) / 100 } },
          },
        })));
      } catch (err) {
        console.error('Could not save corrected miles on the loads:', err.message);
      }
    }

    // Auto-compute grossPay from miles if caller doesn't provide it (or sends 0)
    let computedGrossPay = Number(grossPay) || 0;
    let computedTotalMiles = 0;
    let computedRatePerMile = 0;

    if (lineItems.length > 0) {
      // Truck settlement: gross pay is the sum of the loads
      computedGrossPay = Math.round(lineItems.reduce((s, l) => s + l.amount, 0) * 100) / 100;
      computedTotalMiles = Math.round(lineItems.reduce((s, l) => s + l.miles, 0) * 100) / 100;
      computedRatePerMile = computedTotalMiles > 0 ? Math.round((computedGrossPay / computedTotalMiles) * 100) / 100 : 0;
    } else if (driverUser && (!grossPay || Number(grossPay) === 0) && payPeriod?.startDate && payPeriod?.endDate) {
      // Pull miles records for this driver in the pay period
      const periodMiles = await MilesTracking.find({
        driver,
        date: {
          $gte: new Date(payPeriod.startDate),
          $lte: new Date(payPeriod.endDate)
        }
      }).lean();

      computedTotalMiles = periodMiles.reduce((sum, r) => sum + (r.totalMiles || 0), 0);

      // Get rate from driver profile (prefer salaryPerMile, fall back to mileRate)
      const rate = driverUser.details?.salaryPerMile || driverUser.details?.mileRate || 0;
      computedRatePerMile = Number(rate);

      if (computedTotalMiles > 0 && computedRatePerMile > 0) {
        computedGrossPay = parseFloat((computedTotalMiles * computedRatePerMile).toFixed(2));
      }
    }

    // Calculate net pay
    const netPay = computedGrossPay + Number(additions) - Number(deductions);

    // Generate settlement ID with retry logic for duplicate key errors
    let settlementId = await generateSettlementId(companyId);
    let maxRetries = 5;
    let retryCount = 0;
    let settlement;

    while (retryCount < maxRetries) {
      try {
        settlement = new Settlement({
          settlementId,
          driver: driverUser ? driverUser._id : null,
          settlementType: truckId ? 'truck' : 'driver',
          truck: truckId,
          truckNumber: truckDoc ? (truckDoc.internalId || truckDoc.unitNumber || truckDoc.plateNumber || '') : undefined,
          payeeName: req.body.payeeName || driverUser?.name || '',
          payeeAddress: req.body.payeeAddress || '',
          gstNumber: req.body.gstNumber || '',
          billNumber: req.body.billNumber || '',
          chequeNumber: req.body.chequeNumber || '',
          lineItems,
          additionItems,
          deductionItems,
          payPeriod: {
            startDate: new Date(payPeriod.startDate),
            endDate: new Date(payPeriod.endDate)
          },
          grossPay: computedGrossPay,
          totalMiles: computedTotalMiles,
          ratePerMile: computedRatePerMile,
          deductions: Number(deductions),
          additions: Number(additions),
          netPay,
          status,
          paymentMethod,
          paymentReference,
          notes,
          appliedDeductions: appliedDeductions || [],
          milesRecords: milesRecords || [],
          company: companyId,
          createdBy: req.user._id
        });

        await settlement.save();
        break; // Success, exit retry loop
      } catch (saveError) {
        // Check if it's a duplicate key error for settlementId
        if (saveError.code === 11000 && saveError.keyPattern && saveError.keyPattern.settlementId) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to generate unique settlement ID after ${maxRetries} attempts. Please try again.`);
          }
          // Generate a new ID with a higher sequence number
          const year = new Date().getFullYear();
          const query = { 
            settlementId: new RegExp(`^STL-${year}-`)
          };
          if (companyId) {
            query.company = companyId;
          }
          const count = await Settlement.countDocuments(query);
          // Add retry count to ensure uniqueness
          const sequence = String(count + retryCount + 1).padStart(3, '0');
          settlementId = `STL-${year}-${sequence}`;
          console.log(`⚠️ Duplicate settlement ID detected, retrying with: ${settlementId}`);
        } else {
          // Not a duplicate key error, rethrow
          throw saveError;
        }
      }
    }
    await settlement.populate([
      { path: 'driver', select: 'name email phone internalId' },
      { path: 'truck', select: 'internalId unitNumber plateNumber' },
      { path: 'appliedDeductions', select: 'name type amount' },
      { path: 'createdBy', select: 'name email' }
    ]);

    res.status(201).json({
      success: true,
      message: "Settlement created successfully",
      data: settlement
    });
  } catch (error) {
    console.error("Error creating settlement:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating settlement"
    });
  }
};

// Get All Settlements
export const getSettlements = async (req, res) => {
  try {
    const { search, status, driver, startDate, endDate, page = 1, limit = 10 } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = {};
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    // Search filter
    if (search) {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { settlementId: { $regex: safe, $options: 'i' } },
        { truckNumber: { $regex: safe, $options: 'i' } },
        { payeeName: { $regex: safe, $options: 'i' } }
      ];
    }
    if (req.query.settlementType) filter.settlementType = req.query.settlementType;
    if (req.query.truck && mongoose.Types.ObjectId.isValid(req.query.truck)) filter.truck = req.query.truck;

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Driver filter
    if (driver) {
      filter.driver = driver;
    }

    // Date range filter
    if (startDate || endDate) {
      filter['payPeriod.startDate'] = {};
      if (startDate) {
        filter['payPeriod.startDate'].$gte = new Date(startDate);
      }
      if (endDate) {
        filter['payPeriod.endDate'] = { $lte: new Date(endDate) };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const settlements = await Settlement.find(filter)
      .populate('driver', 'name email phone internalId')
      .populate('truck', 'internalId unitNumber plateNumber')
      .populate('appliedDeductions', 'name type amount')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Settlement.countDocuments(filter);

    res.json({
      success: true,
      data: settlements,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching settlements:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching settlements"
    });
  }
};

// Get Settlement by ID
export const getSettlementById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = { _id: id };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const settlement = await Settlement.findOne(filter)
      .populate('driver', 'name email phone internalId')
      .populate('truck', 'internalId unitNumber plateNumber')
      .populate('appliedDeductions')
      .populate('milesRecords')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: "Settlement not found"
      });
    }

    res.json({
      success: true,
      data: settlement
    });
  } catch (error) {
    console.error("Error fetching settlement:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching settlement"
    });
  }
};

// Update Settlement
export const updateSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { payPeriod, grossPay, deductions, additions, status, paymentDate, paymentMethod, paymentReference, notes } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = { _id: id };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const settlement = await Settlement.findOne(filter);

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: "Settlement not found"
      });
    }

    // Update fields
    if (payPeriod) {
      settlement.payPeriod = {
        startDate: payPeriod.startDate ? new Date(payPeriod.startDate) : settlement.payPeriod.startDate,
        endDate: payPeriod.endDate ? new Date(payPeriod.endDate) : settlement.payPeriod.endDate
      };
    }

    if (grossPay !== undefined) settlement.grossPay = Number(grossPay);
    if (deductions !== undefined) settlement.deductions = Number(deductions);
    if (additions !== undefined) settlement.additions = Number(additions);
    if (Array.isArray(req.body.additionItems) || Array.isArray(req.body.deductionItems)) {
      const additionItems = normalizePayItems(req.body.additionItems ?? settlement.additionItems);
      const deductionItems = normalizePayItems(req.body.deductionItems ?? settlement.deductionItems);
      const memoError = missingMemoError(additionItems, deductionItems);
      if (memoError) return res.status(400).json({ success: false, message: memoError });
      settlement.additionItems = additionItems;
      settlement.deductionItems = deductionItems;
      settlement.additions = sumItems(additionItems);
      settlement.deductions = sumItems(deductionItems);
    }
    if (req.body.chequeNumber !== undefined) settlement.chequeNumber = req.body.chequeNumber;
    if (req.body.billNumber !== undefined) settlement.billNumber = req.body.billNumber;
    if (status) settlement.status = status;
    if (paymentDate) settlement.paymentDate = new Date(paymentDate);
    if (paymentMethod) settlement.paymentMethod = paymentMethod;
    if (paymentReference !== undefined) settlement.paymentReference = paymentReference;
    if (notes !== undefined) settlement.notes = notes;

    // Recalculate net pay
    settlement.netPay = settlement.grossPay + settlement.additions - settlement.deductions;
    settlement.updatedBy = req.user._id;

    await settlement.save();
    await settlement.populate([
      { path: 'driver', select: 'name email phone internalId' },
      { path: 'appliedDeductions', select: 'name type amount' },
      { path: 'updatedBy', select: 'name email' }
    ]);

    res.json({
      success: true,
      message: "Settlement updated successfully",
      data: settlement
    });
  } catch (error) {
    console.error("Error updating settlement:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating settlement"
    });
  }
};

// Delete Settlement
export const deleteSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = { _id: id };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const settlement = await Settlement.findOneAndDelete(filter);

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: "Settlement not found"
      });
    }

    res.json({
      success: true,
      message: "Settlement deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting settlement:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting settlement"
    });
  }
};

// Get Settlement Statistics
export const getSettlementStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = {};
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const stats = await Settlement.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalSettlements: { $sum: 1 },
          totalGrossPay: { $sum: '$grossPay' },
          totalDeductions: { $sum: '$deductions' },
          totalAdditions: { $sum: '$additions' },
          totalNetPay: { $sum: '$netPay' },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] }
          },
          pendingAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, '$netPay', 0] }
          },
          processingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Processing'] }, 1, 0] }
          },
          processingAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'Processing'] }, '$netPay', 0] }
          },
          paidCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Paid'] }, 1, 0] }
          },
          paidAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'Paid'] }, '$netPay', 0] }
          }
        }
      }
    ]);

    const activeDrivers = await Settlement.distinct('driver', filter);

    res.json({
      success: true,
      data: {
        totalSettlements: stats[0]?.totalSettlements || 0,
        totalGrossPay: stats[0]?.totalGrossPay || 0,
        totalDeductions: stats[0]?.totalDeductions || 0,
        totalAdditions: stats[0]?.totalAdditions || 0,
        totalNetPay: stats[0]?.totalNetPay || 0,
        pendingCount: stats[0]?.pendingCount || 0,
        pendingAmount: stats[0]?.pendingAmount || 0,
        processingCount: stats[0]?.processingCount || 0,
        processingAmount: stats[0]?.processingAmount || 0,
        paidCount: stats[0]?.paidCount || 0,
        paidAmount: stats[0]?.paidAmount || 0,
        activeDrivers: activeDrivers.length
      }
    });
  } catch (error) {
    console.error("Error fetching settlement stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching settlement statistics"
    });
  }
};

// ==================== DEDUCTIONS & ADDITIONS ====================

// Create Deduction/Addition
export const createDeductionAddition = async (req, res) => {
  try {
    const { name, type, recurrence, amount, amountType = 'flat', currency, assignedTo, startDate, endDate, description, isActive = true } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    // Validate driver exists
    const driver = await User.findById(assignedTo);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    const deductionAddition = new DeductionAddition({
      name,
      type,
      recurrence,
      amount: Number(amount),
      amountType: amountType || 'flat',
      currency: currency || 'CAD',
      assignedTo,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      description,
      isActive,
      company: companyId,
      createdBy: req.user._id
    });

    await deductionAddition.save();
    await deductionAddition.populate([
      { path: 'assignedTo', select: 'name email phone internalId' },
      { path: 'createdBy', select: 'name email' }
    ]);

    res.status(201).json({
      success: true,
      message: `${type} created successfully`,
      data: deductionAddition
    });
  } catch (error) {
    console.error("Error creating deduction/addition:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating deduction/addition"
    });
  }
};

// Get All Deductions/Additions
export const getDeductionAdditions = async (req, res) => {
  try {
    const { search, type, assignedTo, isActive, page = 1, limit = 10 } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Get company filter with strict validation
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // CRITICAL: If not superadmin and no valid company, return empty data immediately
    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ getDeductionAdditions: Admin has no company - returning empty data');
      return res.json({
        success: true,
        data: [],
        pagination: {
          current: parseInt(page),
          pages: 0,
          total: 0,
          limit: parseInt(limit)
        },
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    let filter = {};
    // Always apply company filter for non-superadmin users
    if (!isSuperadmin && hasValidCompany) {
      filter.company = companyId;
    }

    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    if (type) {
      filter.type = type;
    }

    if (assignedTo) {
      filter.assignedTo = assignedTo;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const deductionAdditions = await DeductionAddition.find(filter)
      .populate('assignedTo', 'name email phone internalId')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DeductionAddition.countDocuments(filter);

    res.json({
      success: true,
      data: deductionAdditions,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching deductions/additions:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching deductions/additions"
    });
  }
};

// Get Deduction/Addition by ID
export const getDeductionAdditionById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Get company filter with strict validation
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // CRITICAL: If not superadmin and no valid company, return 403
    if (!isSuperadmin && !hasValidCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    let filter = { _id: id };
    // Always apply company filter for non-superadmin users
    if (!isSuperadmin && hasValidCompany) {
      filter.company = companyId;
    }

    const deductionAddition = await DeductionAddition.findOne(filter)
      .populate('assignedTo', 'name email phone internalId')
      .populate('createdBy', 'name email');

    if (!deductionAddition) {
      return res.status(404).json({
        success: false,
        message: "Deduction/Addition not found"
      });
    }

    res.json({
      success: true,
      data: deductionAddition
    });
  } catch (error) {
    console.error("Error fetching deduction/addition:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching deduction/addition"
    });
  }
};

// Update Deduction/Addition
export const updateDeductionAddition = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, recurrence, amount, amountType, currency, assignedTo, startDate, endDate, description, isActive } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Get company filter with strict validation
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // CRITICAL: If not superadmin and no valid company, return 403
    if (!isSuperadmin && !hasValidCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    let filter = { _id: id };
    // Always apply company filter for non-superadmin users
    if (!isSuperadmin && hasValidCompany) {
      filter.company = companyId;
    }

    const deductionAddition = await DeductionAddition.findOne(filter);

    if (!deductionAddition) {
      return res.status(404).json({
        success: false,
        message: "Deduction/Addition not found"
      });
    }

    // Validate new assignee still exists before reassigning
    if (assignedTo && assignedTo !== deductionAddition.assignedTo?.toString()) {
      const assignee = await User.findById(assignedTo);
      if (!assignee) {
        return res.status(404).json({ success: false, message: "Assigned employee not found" });
      }
    }

    if (name) deductionAddition.name = name;
    if (type) deductionAddition.type = type;
    if (recurrence) deductionAddition.recurrence = recurrence;
    if (amount !== undefined) deductionAddition.amount = Number(amount);
    if (amountType !== undefined) deductionAddition.amountType = amountType;
    if (currency !== undefined) deductionAddition.currency = currency;
    if (assignedTo) deductionAddition.assignedTo = assignedTo;
    if (startDate) deductionAddition.startDate = new Date(startDate);
    if (endDate) deductionAddition.endDate = new Date(endDate);
    if (description !== undefined) deductionAddition.description = description;
    if (isActive !== undefined) deductionAddition.isActive = isActive;

    await deductionAddition.save();
    await deductionAddition.populate([
      { path: 'assignedTo', select: 'name email phone internalId' },
      { path: 'createdBy', select: 'name email' }
    ]);

    res.json({
      success: true,
      message: "Deduction/Addition updated successfully",
      data: deductionAddition
    });
  } catch (error) {
    console.error("Error updating deduction/addition:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating deduction/addition"
    });
  }
};

// Delete Deduction/Addition
export const deleteDeductionAddition = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Get company filter with strict validation
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // CRITICAL: If not superadmin and no valid company, return 403
    if (!isSuperadmin && !hasValidCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    let filter = { _id: id };
    // Always apply company filter for non-superadmin users
    if (!isSuperadmin && hasValidCompany) {
      filter.company = companyId;
    }

    const deductionAddition = await DeductionAddition.findOneAndDelete(filter);

    if (!deductionAddition) {
      return res.status(404).json({
        success: false,
        message: "Deduction/Addition not found"
      });
    }

    // Remove stale reference from any settlements that still hold this ID
    await Settlement.updateMany(
      { appliedDeductions: deductionAddition._id },
      { $pull: { appliedDeductions: deductionAddition._id } }
    );

    res.json({
      success: true,
      message: "Deduction/Addition deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting deduction/addition:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting deduction/addition"
    });
  }
};

// ==================== MILES TRACKING ====================

// Create Miles Tracking Record
export const createMilesTracking = async (req, res) => {
  try {
    const { date, vehicle, driver, state, totalMiles, loadedMiles = 0, emptyMiles = 0, iftaMiles, trip, notes } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    // Validate driver and vehicle exist
    const driverUser = await User.findById(driver);
    if (!driverUser) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    // Find vehicle in Vehicle model
    let vehicleDoc = null;
    let vehicleId = vehicle;
    let vehicleModelType = "Vehicle";
    
    // Extract real ID if prefixed
    const realId = extractRealId(vehicle);
    
    // Try Vehicle by ObjectId first
    if (isValidObjectId(realId)) {
      vehicleDoc = await Vehicle.findById(new mongoose.Types.ObjectId(realId));
    }
    
    // If not found by ObjectId, try by identifiers
    if (!vehicleDoc && realId) {
      vehicleDoc = await Vehicle.findOne({
        $or: [
          { unitNumber: realId },
          { internalId: realId },
          { plateNumber: realId }
        ]
      });
    }
    
    if (!vehicleDoc) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found"
      });
    }
    
    vehicleId = vehicleDoc._id;

    const milesTracking = new MilesTracking({
      date: new Date(date),
      vehicle: vehicleId, // Use the resolved vehicle ID
      vehicleModel: vehicleModelType, // Set the model type
      driver,
      state: state.toUpperCase(),
      totalMiles: Number(totalMiles),
      loadedMiles: Number(loadedMiles),
      emptyMiles: Number(emptyMiles),
      iftaMiles: Number(iftaMiles),
      trip: trip || undefined,
      notes,
      company: companyId,
      createdBy: req.user._id
    });

    await milesTracking.save();
    await milesTracking.populate([
      { path: 'driver', select: 'name email phone internalId' },
      { path: 'trip', select: 'tripNumber' },
      { path: 'createdBy', select: 'name email' }
    ]);

    // Manually populate vehicle for response
    let createdVehicleData = null;
    const vehicleData = await Vehicle.findById(milesTracking.vehicle)
      .select('plateNumber unitNumber make model internalId')
      .lean();
    if (vehicleData) {
      createdVehicleData = {
        _id: vehicleData._id,
        plateNumber: vehicleData.plateNumber,
        unitNumber: vehicleData.unitNumber,
        internalId: vehicleData.internalId,
        make: vehicleData.make,
        model: vehicleData.model
      };
    }
    
    // Convert to plain object and add vehicle data
    const createdResponseData = milesTracking.toObject();
    createdResponseData.vehicle = createdVehicleData;

    res.status(201).json({
      success: true,
      message: "Miles tracking record created successfully",
      data: createdResponseData
    });
  } catch (error) {
    console.error("Error creating miles tracking:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating miles tracking record"
    });
  }
};

// Get All Miles Tracking Records
export const getMilesTracking = async (req, res) => {
  try {
    const { search, driver, vehicle, state, startDate, endDate, page = 1, limit = 10 } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = {};
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    if (driver) {
      filter.driver = driver;
    }

    if (vehicle) {
      // Resolve vehicle ID - try ObjectId first, then by identifiers
      let resolvedVehicleId = vehicle;
      const realId = extractRealId(vehicle);
      
      if (isValidObjectId(realId)) {
        const vehicleDoc = await Vehicle.findById(new mongoose.Types.ObjectId(realId));
        if (vehicleDoc) {
          resolvedVehicleId = vehicleDoc._id;
        }
      } else if (realId) {
        const vehicleDoc = await Vehicle.findOne({
          $or: [
            { unitNumber: realId },
            { internalId: realId },
            { plateNumber: realId }
          ]
        });
        if (vehicleDoc) {
          resolvedVehicleId = vehicleDoc._id;
        }
      }
      
      filter.vehicle = resolvedVehicleId;
    }

    if (state) {
      filter.state = state.toUpperCase();
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.date.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let milesRecords = await MilesTracking.find(filter)
      .populate('driver', 'name email phone internalId')
      .populate('trip', 'tripNumber')
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Manually populate vehicle
    for (let record of milesRecords) {
      if (record.vehicle) {
        const vehicleData = await Vehicle.findById(record.vehicle)
          .select('plateNumber unitNumber make model internalId')
          .lean();
        if (vehicleData) {
          record.vehicle = {
            _id: vehicleData._id,
            plateNumber: vehicleData.plateNumber,
            unitNumber: vehicleData.unitNumber,
            internalId: vehicleData.internalId,
            make: vehicleData.make,
            model: vehicleData.model
          };
        }
      }
    }

    const total = await MilesTracking.countDocuments(filter);

    res.json({
      success: true,
      data: milesRecords,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching miles tracking:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching miles tracking records"
    });
  }
};

// Get Miles Tracking by ID
export const getMilesTrackingById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = { _id: id };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    let milesTracking = await MilesTracking.findOne(filter)
      .populate('driver', 'name email phone internalId')
      .populate('trip', 'tripNumber')
      .populate('createdBy', 'name email')
      .lean();

    // Manually populate vehicle
    if (milesTracking && milesTracking.vehicle) {
      const vehicleData = await Vehicle.findById(milesTracking.vehicle)
        .select('plateNumber unitNumber make model internalId')
        .lean();
      if (vehicleData) {
        milesTracking.vehicle = {
          _id: vehicleData._id,
          plateNumber: vehicleData.plateNumber,
          unitNumber: vehicleData.unitNumber,
          internalId: vehicleData.internalId,
          make: vehicleData.make,
          model: vehicleData.model
        };
      }
    }

    if (!milesTracking) {
      return res.status(404).json({
        success: false,
        message: "Miles tracking record not found"
      });
    }

    res.json({
      success: true,
      data: milesTracking
    });
  } catch (error) {
    console.error("Error fetching miles tracking:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching miles tracking record"
    });
  }
};

// Update Miles Tracking
export const updateMilesTracking = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, vehicle, driver, state, totalMiles, loadedMiles, emptyMiles, iftaMiles, trip, notes } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = { _id: id };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const milesTracking = await MilesTracking.findOne(filter);

    if (!milesTracking) {
      return res.status(404).json({
        success: false,
        message: "Miles tracking record not found"
      });
    }

    if (date) milesTracking.date = new Date(date);
    if (vehicle) {
      // Find vehicle in Vehicle model
      let vehicleDoc = null;
      const realId = extractRealId(vehicle);
      
      // Try Vehicle by ObjectId first
      if (isValidObjectId(realId)) {
        vehicleDoc = await Vehicle.findById(new mongoose.Types.ObjectId(realId));
      }
      
      // If not found by ObjectId, try by identifiers
      if (!vehicleDoc && realId) {
        vehicleDoc = await Vehicle.findOne({
          $or: [
            { unitNumber: realId },
            { internalId: realId },
            { plateNumber: realId }
          ]
        });
      }
      
      if (!vehicleDoc) {
        return res.status(404).json({
          success: false,
          message: "Vehicle not found"
        });
      }
      
      milesTracking.vehicle = vehicleDoc._id;
      milesTracking.vehicleModel = "Vehicle";
    }
    if (driver) milesTracking.driver = driver;
    if (state) milesTracking.state = state.toUpperCase();
    if (totalMiles !== undefined) milesTracking.totalMiles = Number(totalMiles);
    if (loadedMiles !== undefined) milesTracking.loadedMiles = Number(loadedMiles);
    if (emptyMiles !== undefined) milesTracking.emptyMiles = Number(emptyMiles);
    if (iftaMiles !== undefined) milesTracking.iftaMiles = Number(iftaMiles);
    if (trip !== undefined) milesTracking.trip = trip;
    if (notes !== undefined) milesTracking.notes = notes;

    await milesTracking.save();
    await milesTracking.populate([
      { path: 'driver', select: 'name email phone internalId' },
      { path: 'trip', select: 'tripNumber' }
    ]);

    // Manually populate vehicle for response
    let updatedVehicleData = null;
    const vehicleDoc = await Vehicle.findById(milesTracking.vehicle)
      .select('plateNumber unitNumber make model internalId')
      .lean();
    if (vehicleDoc) {
      updatedVehicleData = {
        _id: vehicleDoc._id,
        plateNumber: vehicleDoc.plateNumber,
        unitNumber: vehicleDoc.unitNumber,
        internalId: vehicleDoc.internalId,
        make: vehicleDoc.make,
        model: vehicleDoc.model
      };
    }
    
    const updatedResponseData = milesTracking.toObject();
    updatedResponseData.vehicle = updatedVehicleData;

    res.json({
      success: true,
      message: "Miles tracking record updated successfully",
      data: updatedResponseData
    });
  } catch (error) {
    console.error("Error updating miles tracking:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating miles tracking record"
    });
  }
};

// Delete Miles Tracking
export const deleteMilesTracking = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = { _id: id };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const milesTracking = await MilesTracking.findOneAndDelete(filter);

    if (!milesTracking) {
      return res.status(404).json({
        success: false,
        message: "Miles tracking record not found"
      });
    }

    res.json({
      success: true,
      message: "Miles tracking record deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting miles tracking:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting miles tracking record"
    });
  }
};

// Get Miles Tracking Statistics
export const getMilesTrackingStats = async (req, res) => {
  try {
    const { startDate, endDate, driver, vehicle } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = {};
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    if (driver) filter.driver = driver;
    if (vehicle) filter.vehicle = vehicle;

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const stats = await MilesTracking.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalMiles: { $sum: '$totalMiles' },
          totalLoadedMiles: { $sum: '$loadedMiles' },
          totalEmptyMiles: { $sum: '$emptyMiles' },
          totalIftaMiles: { $sum: '$iftaMiles' },
          recordCount: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalMiles: stats[0]?.totalMiles || 0,
        totalLoadedMiles: stats[0]?.totalLoadedMiles || 0,
        totalEmptyMiles: stats[0]?.totalEmptyMiles || 0,
        totalIftaMiles: stats[0]?.totalIftaMiles || 0,
        recordCount: stats[0]?.recordCount || 0
      }
    });
  } catch (error) {
    console.error("Error fetching miles tracking stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching miles tracking statistics"
    });
  }
};

