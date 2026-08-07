import { Invoice } from "../../models/hr/invoiceModel.js";
import { Expense } from "../../models/hr/expenseModel.js";
import { Payroll } from "../../models/hr/payrollSchemaModel.js";
import { Settlement } from "../../models/hr/settlementModel.js";
import { User } from "../../models/driver/userModel.js";
import FuelReport from "../../models/driver/fuelReportsModel.js";
import { GeneralRepair } from "../../models/fleet/generalRepairModel.js";
import { FleetInvoice } from "../../models/driver/fleetInvoiceModel.js";
import { Vehicle } from "../../models/driver/vehicleModel.js";
import { Trailer } from "../../models/driver/trailerModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";

// Get Accounts Dashboard Statistics
export const getAccountsDashboard = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // If user is not superadmin and has no company, return zeros
    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        data: {
          totalRevenue: 0,
          totalExpenses: 0,
          totalPayroll: 0,
          netProfit: 0,
          paidInvoices: 0,
          unpaidOverdue: 0,
          paidEmployeeUnpaid: 0,
          paidDriverUnpaid: 0,
          vendorPayment: 0,
          invoiceCount: 0,
          expenseCount: 0,
          payrollCount: 0,
          fleetCounts: { drivers: 0, employees: 0, trucks: 0, trailers: 0 }
        },
        message: "Please complete company settings first to view statistics."
      });
    }

    // Build company filter
    const companyFilter = companyId ? { company: companyId } : null;
    
    // Get combined filter (company + trial data filter)
    // For superadmin, use empty filter (no company restriction)
    // For others, use company filter
    let baseFilter = {};
    if (!isSuperadmin && companyId) {
      const combinedFilter = await getCombinedFilter(req.user, companyFilter);
      baseFilter = combinedFilter || { company: companyId };
    }
    
    const invoiceFilter = baseFilter;
    const expenseFilter = baseFilter;
    const payrollFilter = baseFilter;
    const settlementFilter = baseFilter;
    
    console.log('📊 [Accounts Dashboard] Filters:', {
      companyId,
      isSuperadmin,
      baseFilter: JSON.stringify(baseFilter),
      invoiceFilter: JSON.stringify(invoiceFilter),
      payrollFilter: JSON.stringify(payrollFilter),
      settlementFilter: JSON.stringify(settlementFilter)
    });

    // Helper function to normalize amount (handle string or number)
    const normalizeAmount = (value) => {
      if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
        return isNaN(parsed) ? 0 : parsed;
      }
      return typeof value === 'number' ? value : 0;
    };

    // Get today's date for overdue calculation
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // === INVOICES ===
    const invoices = await Invoice.find(invoiceFilter).lean();
    const totalRevenue = invoices.reduce((sum, inv) => sum + normalizeAmount(inv.amount), 0);
    const paidInvoices = invoices
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + normalizeAmount(inv.amount), 0);
    
    // Unpaid Overdue: invoices with status='pending' and dueDate < today
    const unpaidOverdue = invoices
      .filter(inv => {
        if (inv.status !== 'pending') return false;
        if (!inv.dueDate) return false;
        const dueDate = new Date(inv.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < today;
      })
      .reduce((sum, inv) => sum + normalizeAmount(inv.amount), 0);

    // === EXPENSES ===
    const expenses = await Expense.find(expenseFilter).lean();
    const directExpenses = expenses.reduce((sum, exp) => sum + normalizeAmount(exp.amount), 0);

    // Include the same additional expense sources as the Finance Report so both totals agree
    const fuelReports = await FuelReport.find({ ...baseFilter, status: { $in: ['approved', 'pending'] } }).lean();
    const fuelCost = fuelReports.reduce((sum, f) => sum + normalizeAmount(f.totalCost || f.amount || 0), 0);

    const repairs = await GeneralRepair.find({ ...baseFilter, amount: { $gt: 0 } }).lean();
    const repairCost = repairs.reduce((sum, r) => sum + normalizeAmount(r.amount || 0), 0);

    const paidFleetInvoices = await FleetInvoice.find({ ...baseFilter, status: 'paid' }).lean();
    // FleetInvoice's total cost field is `total`, not `amount` (which doesn't exist on the schema)
    const fleetInvoiceCost = paidFleetInvoices.reduce((sum, fi) => sum + normalizeAmount(fi.total || 0), 0);

    const totalExpenses = directExpenses + fuelCost + repairCost + fleetInvoiceCost;

    // Vendor Payment: direct expenses only (not fuel/repair which are fleet costs)
    const vendorPayment = directExpenses;

    // === PAYROLL ===
    const payrolls = await Payroll.find(payrollFilter)
      .populate('userId', 'role company')
      .lean();
    
    const totalPayroll = payrolls.reduce((sum, payroll) => sum + normalizeAmount(payroll.totalSalary), 0);
    
    console.log('📊 [Accounts Dashboard] Payroll data:', {
      payrollCount: payrolls.length,
      payrollFilter,
      samplePayroll: payrolls[0] ? {
        userId: payrolls[0].userId?._id || payrolls[0].userId,
        role: payrolls[0].userId?.role
      } : null
    });

    // === SETTLEMENTS (for driver payments) ===
    const settlements = await Settlement.find(settlementFilter)
      .populate('driver', 'role company')
      .lean();
    
    console.log('📊 [Accounts Dashboard] Settlement data:', {
      settlementCount: settlements.length,
      settlementFilter,
      sampleSettlement: settlements[0] ? {
        driverId: settlements[0].driver?._id || settlements[0].driver,
        role: settlements[0].driver?.role,
        status: settlements[0].status
      } : null
    });
    
    // Filter settlements by status
    const paidSettlements = settlements.filter(s => 
      s.status === 'Paid' || s.status === 'Completed'
    );
    const unpaidSettlements = settlements.filter(s => 
      s.status === 'Pending' || s.status === 'Processing'
    );
    
    // Driver settlements
    const paidDriverSettlements = paidSettlements.filter(s => {
      const role = s.driver?.role;
      return role === 'driver';
    });
    const unpaidDriverSettlements = unpaidSettlements.filter(s => {
      const role = s.driver?.role;
      return role === 'driver';
    });
    
    const driverPaid = paidDriverSettlements.reduce((sum, settlement) => 
      sum + normalizeAmount(settlement.netPay), 0);
    const driverUnpaid = unpaidDriverSettlements.reduce((sum, settlement) => 
      sum + normalizeAmount(settlement.netPay), 0);

    // === GET ALL EMPLOYEES AND DRIVERS ===
    // Build employee filter - exclude inactive and specific roles
    const employeeFilter = {
      role: { 
        $nin: ['driver', 'customer', 'contact', 'admin', 'superadmin', 'reporter'] 
      },
      status: { $ne: 'inactive' } // Only active employees
    };
    
    // Add company filter (same as other filters)
    if (!isSuperadmin && companyId) {
      employeeFilter.company = companyId;
    }
    
    // Get all employees (excluding drivers, customers, contacts, admin, superadmin, reporter)
    const allEmployees = await User.find(employeeFilter).select('_id role company').lean();
    
    // Build driver filter
    const driverFilter = {
      role: 'driver',
      status: { $ne: 'inactive' } // Only active drivers
    };
    
    // Add company filter (same as other filters)
    if (!isSuperadmin && companyId) {
      driverFilter.company = companyId;
    }
    
    // Get all drivers
    const allDrivers = await User.find(driverFilter).select('_id role company').lean();
    
    console.log('📊 [Accounts Dashboard] User counts:', {
      totalEmployees: allEmployees.length,
      totalDrivers: allDrivers.length,
      companyId,
      isSuperadmin,
      employeeFilter: JSON.stringify(employeeFilter),
      driverFilter: JSON.stringify(driverFilter),
      sampleEmployee: allEmployees[0] ? {
        _id: allEmployees[0]._id.toString(),
        role: allEmployees[0].role,
        company: allEmployees[0].company?.toString() || allEmployees[0].company
      } : null,
      sampleDriver: allDrivers[0] ? {
        _id: allDrivers[0]._id.toString(),
        role: allDrivers[0].role,
        company: allDrivers[0].company?.toString() || allDrivers[0].company
      } : null
    });

    // Total counts
    const totalEmployeeCount = allEmployees.length;
    const totalDriverCount = allDrivers.length;
    
    // Get all employee and driver IDs as sets for comparison
    const allEmployeeIds = new Set(allEmployees.map(emp => emp._id.toString()));
    const allDriverIds = new Set(allDrivers.map(driver => driver._id.toString()));

    // === PAYROLL (for employee payments) ===
    // Separate employees and drivers from payrolls
    const employeePayrolls = payrolls.filter(p => {
      const role = p.userId?.role;
      return role && role !== 'driver' && role !== 'customer' && role !== 'contact' && role !== 'admin' && role !== 'superadmin';
    });
    
    // Driver payrolls: Filter payrolls where role is 'driver'
    const driverPayrolls = payrolls.filter(p => {
      const role = p.userId?.role;
      return role === 'driver';
    });
    
    // Get unique employee IDs who have payroll records
    // Since payroll creation typically means payment has been processed, we consider employees with payroll as "paid"
    const employeesWithPayroll = new Set(employeePayrolls.map(p => {
      const userId = p.userId?._id || p.userId;
      const userIdStr = userId ? userId.toString() : null;
      // Only count if this employee is in our allEmployees list
      if (userIdStr && allEmployeeIds.has(userIdStr)) {
        return userIdStr;
      }
      return null;
    }).filter(Boolean));
    
    console.log('📊 [Accounts Dashboard] Payroll analysis:', {
      totalEmployeeCount,
      totalPayrolls: payrolls.length,
      employeePayrollsCount: employeePayrolls.length,
      employeesWithPayrollCount: employeesWithPayroll.size,
      allEmployeeIdsCount: allEmployeeIds.size,
      employeePayrolls: employeePayrolls.slice(0, 5).map(p => ({
        userId: p.userId?._id || p.userId,
        userIdStr: (p.userId?._id || p.userId)?.toString(),
        role: p.userId?.role,
        inAllEmployees: allEmployeeIds.has((p.userId?._id || p.userId)?.toString())
      }))
    });
    
    // Employee paid count = Employees with payroll records (payroll creation means payment processed)
    const employeePaidCount = employeesWithPayroll.size;
    
    // Employee unpaid count = Total employees - Employees with payroll
    // This includes employees without any payroll records
    const employeeUnpaidCount = Math.max(0, totalEmployeeCount - employeesWithPayroll.size);
    
    // Calculate amounts
    const employeePaid = 0; // TODO: Add payment tracking to Payroll model
    const employeeUnpaid = employeePayrolls.reduce((sum, payroll) => 
      sum + normalizeAmount(payroll.totalSalary), 0);
    
    // === DRIVER PAYMENT COUNTS ===
    // Get unique driver IDs who have payroll records (similar to employees)
    // Since payroll creation typically means payment has been processed, we consider drivers with payroll as "paid"
    const driversWithPayroll = new Set(driverPayrolls.map(p => {
      const userId = p.userId?._id || p.userId;
      const userIdStr = userId ? userId.toString() : null;
      // Only count if this driver is in our allDrivers list
      if (userIdStr && allDriverIds.has(userIdStr)) {
        return userIdStr;
      }
      return null;
    }).filter(Boolean));
    
    console.log('📊 [Accounts Dashboard] Driver payroll analysis:', {
      totalDriverCount,
      totalPayrolls: payrolls.length,
      driverPayrollsCount: driverPayrolls.length,
      driversWithPayrollCount: driversWithPayroll.size,
      allDriverIdsCount: allDriverIds.size,
      driverPayrolls: driverPayrolls.slice(0, 5).map(p => ({
        userId: p.userId?._id || p.userId,
        userIdStr: (p.userId?._id || p.userId)?.toString(),
        role: p.userId?.role,
        inAllDrivers: allDriverIds.has((p.userId?._id || p.userId)?.toString())
      })),
      allDriverIds: Array.from(allDriverIds).slice(0, 5),
      driversWithPayrollIds: Array.from(driversWithPayroll)
    });
    
    // Driver paid count = Drivers with payroll records (payroll creation means payment processed)
    const driverPaidCount = driversWithPayroll.size;
    
    // Driver unpaid count = Total drivers - Drivers with payroll
    // This includes drivers without any payroll records
    const driverUnpaidCount = Math.max(0, totalDriverCount - driversWithPayroll.size);

    // === FLEET COUNTS (Trucks, Trailers) ===
    const fleetFilter = isSuperadmin ? {} : { company: companyId };
    const [truckCount, trailerCount] = await Promise.all([
      Vehicle.countDocuments(fleetFilter),
      Trailer.countDocuments(fleetFilter)
    ]);
    const fleetCounts = {
      drivers: totalDriverCount,
      employees: totalEmployeeCount,
      trucks: truckCount,
      trailers: trailerCount
    };

    // === NET PROFIT ===
    const netProfit = totalRevenue - totalExpenses - totalPayroll;

    const responseData = {
      totalRevenue,
      totalExpenses,
      totalPayroll,
      netProfit,
      paidInvoices,
      unpaidOverdue,
      employeePaid,
      employeeUnpaid,
      driverPaid,
      driverUnpaid,
      vendorPayment,
      invoiceCount: invoices.length,
      expenseCount: expenses.length,
      payrollCount: employeePayrolls.length, // Count of employee payroll records
      employeePayrollCount: employeePayrolls.length,
      driverPayrollCount: driverPayrolls.length,
      // Payment counts
      employeePaidCount,
      employeeUnpaidCount,
      driverPaidCount,
      driverUnpaidCount,
      fleetCounts
    };
    
    console.log('📊 [Accounts Dashboard] Final response data:', {
      ...responseData,
      summary: {
        totalEmployees: totalEmployeeCount,
        totalDrivers: totalDriverCount,
        employeesWithPayroll: employeesWithPayroll.size,
        driversWithPayroll: driversWithPayroll.size
      }
    });
    
    res.json({
      success: true,
      data: responseData,
      message: "Accounts dashboard data fetched successfully"
    });
  } catch (error) {
    console.error("Get Accounts Dashboard Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

