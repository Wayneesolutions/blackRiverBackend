import { Invoice } from "../../models/hr/invoiceModel.js";
import { Expense } from "../../models/hr/expenseModel.js";
import { Payroll } from "../../models/hr/payrollSchemaModel.js";
import FuelReport from "../../models/driver/fuelReportsModel.js";
import { GeneralRepair } from "../../models/fleet/generalRepairModel.js";
import { FleetInvoice } from "../../models/driver/fleetInvoiceModel.js";
import { FleetUnit } from "../../models/fleet/fleetUnitModel.js";
import { Vehicle } from "../../models/driver/vehicleModel.js";
import Order from "../../models/orderModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import mongoose from "mongoose";

const normalizeAmount = (value) => {
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }
  return typeof value === 'number' ? value : 0;
};

export const getFinanceReport = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const hasValidCompany =
      companyId &&
      String(companyId).trim() !== '' &&
      String(companyId) !== 'null' &&
      String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      return res.json({
        success: true,
        data: {
          overview: { totalRevenue: 0, totalExpenses: 0, totalPayroll: 0, netProfit: 0, totalTrips: 0, activeTrucks: 0 },
          truckWise: [],
          tripWise: [],
          timeBased: []
        }
      });
    }

    const companyObjectId = mongoose.Types.ObjectId.isValid(companyId)
      ? new mongoose.Types.ObjectId(companyId)
      : null;

    const matchFilter = (!isSuperadmin && companyObjectId)
      ? { company: companyObjectId }
      : {};

    // ===== FETCH =====
    const invoices = await Invoice.find(matchFilter)
      .populate({
        path: 'orderId',
        populate: [
          { path: 'truck', select: 'unitNumber plateNumber internalId' },
          { path: 'driver', select: 'name' }
        ]
      })
      .lean();

    const expenses  = await Expense.find({ ...matchFilter, vehicle: { $exists: true, $ne: null } }).lean();
    const payrolls  = await Payroll.find(matchFilter).lean();
    const fuelReports = await FuelReport.find({ ...matchFilter, status: { $in: ['approved', 'pending'] } }).lean();

    // GeneralRepair.unitReference → FleetUnit._id or Vehicle._id depending on unitSource
    const repairs = await GeneralRepair.find({
      ...matchFilter,
      unitReference: { $exists: true, $ne: null },
      amount: { $gt: 0 }
    }).lean();

    // Paid fleet invoices (company-level cost, no truck reference)
    const paidFleetInvoices = await FleetInvoice.find({ ...matchFilter, status: 'paid' }).lean();

    // ===== PAYROLL MAP (by order/trip) =====
    // Support both 'orders' and legacy 'trips' field stored in MongoDB
    const payByOrderMap = new Map();
    const allPayrollOrderIds = new Set();

    payrolls.forEach(payroll => {
      const orderIds = [...(payroll.orders || []), ...(payroll.trips || [])];
      orderIds.forEach(id => allPayrollOrderIds.add(id.toString()));

      const payPerOrder = normalizeAmount(payroll.totalSalary) / (orderIds.length || 1);
      orderIds.forEach(orderId => {
        payByOrderMap.set(orderId.toString(), payPerOrder);
      });
    });

    // ===== EXPENSE MAP (by order) =====
    const expenseByOrderMap = new Map();
    expenses.forEach(exp => {
      if (!exp.orderId) return;
      const id = exp.orderId.toString();
      expenseByOrderMap.set(id, (expenseByOrderMap.get(id) || 0) + normalizeAmount(exp.amount));
    });

    // ===== FUEL MAP (by truck) =====
    const fuelByTruckMap = new Map();
    fuelReports.forEach(fr => {
      const truckId = fr.vehicle?.toString();
      if (!truckId) return;
      const cost = normalizeAmount(fr.transactionAmount || fr.cost || 0);
      fuelByTruckMap.set(truckId, (fuelByTruckMap.get(truckId) || 0) + cost);
    });

    // ===== EXPENSE MAP (by truck/vehicle) =====
    const expenseByTruckMap = new Map();
    expenses.forEach(exp => {
      const vehicleId = exp.vehicle?.toString();
      if (!vehicleId) return;
      expenseByTruckMap.set(vehicleId, (expenseByTruckMap.get(vehicleId) || 0) + normalizeAmount(exp.amount));
    });

    // ===== REPAIR MAP (by truck) =====
    // unitSource === 'vehicle' → unitReference is a Vehicle._id
    // unitSource === 'trailer'/'custom' → unitReference is a FleetUnit._id
    const repairByFleetUnitMap = new Map();
    const repairByTruckMap = new Map();
    repairs.forEach(r => {
      const refId = r.unitReference?.toString();
      if (!refId) return;
      const amt = normalizeAmount(r.amount);
      if (r.unitSource === 'vehicle') {
        repairByTruckMap.set(refId, (repairByTruckMap.get(refId) || 0) + amt);
      } else {
        repairByFleetUnitMap.set(refId, (repairByFleetUnitMap.get(refId) || 0) + amt);
      }
    });

    // FleetUnit and Vehicle are separate systems with no cross-reference
    const fleetUnitToVehicleMap = new Map();

    // FleetInvoice has no truck reference — compute total early for proportional distribution
    const fleetInvTotal = paidFleetInvoices.reduce((sum, fi) => sum + normalizeAmount(fi.total), 0);

    // ===== PAY BY TRUCK MAP =====
    // Cross-reference payroll orders/trips → truck via invoice order data
    const orderToTruckMap = new Map();
    invoices.forEach(inv => {
      const order = inv.orderId;
      if (!order?._id || !order?.truck?._id) return;
      orderToTruckMap.set(order._id.toString(), order.truck._id.toString());
    });

    const payByTruckMap = new Map();
    const truckInfoFromPayroll = new Map(); // payroll has no truck info
    payrolls.forEach(payroll => {
      const orderIds = [...(payroll.orders || []), ...(payroll.trips || [])];
      const truckIds = new Set();
      orderIds.forEach(id => {
        const truckId = orderToTruckMap.get(id.toString());
        if (truckId) truckIds.add(truckId);
      });
      if (truckIds.size === 0) return;
      const payPerTruck = normalizeAmount(payroll.totalSalary) / truckIds.size;
      truckIds.forEach(truckId => {
        payByTruckMap.set(truckId, (payByTruckMap.get(truckId) || 0) + payPerTruck);
      });
    });

    // ===== TRUCK-WISE =====
    const truckMap = new Map();

    const ensureTruck = (id, obj) => {
      if (!truckMap.has(id)) {
        truckMap.set(id, {
          id,
          truckNumber: obj.unitNumber || obj.internalId || obj.plateNumber || 'N/A',
          revenue: 0,
          expenses: 0,
          fuelCost: 0,
          fleetInvoiceCost: 0,
          payroll: 0,
          trips: 0,
          miles: 0,
          netProfit: 0
        });
      }
      return truckMap.get(id);
    };

    invoices.forEach(inv => {
      const order = inv.orderId;
      if (!order?.truck) return;
      const truckId = order.truck._id.toString();
      const t = ensureTruck(truckId, order.truck);
      t.revenue += normalizeAmount(inv.amount);
      t.trips   += 1;
      t.miles   += normalizeAmount(order.distance || 0);
    });

    // Include trucks that have payroll but no invoices
    payByTruckMap.forEach((pay, vehicleId) => {
      if (!truckMap.has(vehicleId) && truckInfoFromPayroll.has(vehicleId)) {
        ensureTruck(vehicleId, truckInfoFromPayroll.get(vehicleId));
      }
    });

    // FleetInvoice has no truck reference — distribute total proportionally by revenue
    const totalTruckRevenue = Array.from(truckMap.values()).reduce((s, t) => s + t.revenue, 0);
    const truckCount = truckMap.size || 1;

    // Attach all financial data per truck
    truckMap.forEach((t, vehicleId) => {
      const directExp   = expenseByTruckMap.get(vehicleId) || 0;
      const fuelExp     = fuelByTruckMap.get(vehicleId)    || 0;
      const repairExp   = repairByTruckMap.get(vehicleId)  || 0;

      // Distribute fleet invoice total proportionally by revenue; fallback to even split
      const revenueShare = totalTruckRevenue > 0 ? t.revenue / totalTruckRevenue : 1 / truckCount;
      const allocatedFleetInv = fleetInvTotal * revenueShare;

      t.fuelCost         = fuelExp;
      t.fleetInvoiceCost = repairExp + allocatedFleetInv;
      t.expenses         = directExp + fuelExp + repairExp + allocatedFleetInv;
      t.payroll          = payByTruckMap.get(vehicleId) || 0;
      t.netProfit        = t.revenue - t.expenses - t.payroll;
    });

    const truckWiseData = Array.from(truckMap.values());

    // ===== TRIP-WISE =====
    const tripMap = new Map();
    invoices.forEach(inv => {
      const order = inv.orderId;
      if (!order) return;
      const id = order._id.toString();
      if (!tripMap.has(id)) {
        const driverPay = payByOrderMap.get(id) || 0;
        const otherExpenses = expenseByOrderMap.get(id) || 0;
        const fuelCost = fuelByTruckMap.get(order.truck?._id?.toString()) || 0;

        const totalMiles = normalizeAmount(order.distance || 0);
        const totalExpenses = driverPay + otherExpenses + fuelCost;

        tripMap.set(id, {
          id,
          tripNumber:  order.orderNumber,
          truckNumber: order.truck?.unitNumber || 'N/A',
          driverName: order.driver?.name || 'N/A',

          origin: order.pickupLocation?.place || 'N/A',
          destination: order.deliveryLocation?.place || 'N/A',

          revenue: 0,

          driverPay,
          otherExpenses,
          fuelCost,
          expenses: totalExpenses,

          totalMiles,

          startDate: order.pickupDate || order.orderDate,
          endDate: order.deliveryDate || null,

          date: order.pickupDate || order.orderDate
        });
      }
      tripMap.get(id).revenue += normalizeAmount(inv.amount);
    });

    const tripWiseData = Array.from(tripMap.values()).map(t => {
      const costPerMile = t.totalMiles > 0 ? t.expenses / t.totalMiles : 0;
      return { ...t, costPerMile, netProfit: t.revenue - t.expenses };
    });

    // ===== OVERVIEW TOTALS =====
    const totalRevenue  = truckWiseData.reduce((sum, t) => sum + t.revenue, 0);
    const totalPayroll  = payrolls.reduce((sum, p) => sum + normalizeAmount(p.totalSalary), 0);
    const totalExpenses = truckWiseData.reduce((sum, t) => sum + t.expenses, 0);

    // ===== INVOICE SUMMARY =====
    const invoiceSummary = {
      paidInvoices:    invoices.filter(inv => inv.status === 'paid').reduce((s, inv) => s + normalizeAmount(inv.amount), 0),
      pendingInvoices: invoices.filter(inv => inv.status !== 'paid').reduce((s, inv) => s + normalizeAmount(inv.amount), 0),
      overdueInvoices: 0
    };

    // ===== EXPENSE BREAKDOWN =====
    const expenseBreakdown = {
      fuelCosts:      Array.from(fuelByTruckMap.values()).reduce((s, v) => s + v, 0),
      fleetInvoices:  Array.from(repairByTruckMap.values()).reduce((s, v) => s + v, 0) + fleetInvTotal,
      otherExpenses:  Array.from(expenseByTruckMap.values()).reduce((s, v) => s + v, 0)
    };

    res.json({
      success: true,
      data: {
        overview: {
          totalRevenue,
          totalExpenses,
          totalPayroll,
          netProfit: totalRevenue - totalExpenses - totalPayroll,
          totalTrips:   tripWiseData.length,
          activeTrucks: truckWiseData.length
        },
        invoiceSummary,
        expenseBreakdown,
        truckWise: truckWiseData,
        tripWise:  tripWiseData,
      }
    });

  } catch (error) {
    console.error("Finance Report Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
