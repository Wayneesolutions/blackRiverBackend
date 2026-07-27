import { Invoice } from '../../models/hr/invoiceModel.js';
import { Expense } from '../../models/hr/expenseModel.js';
import { Payroll } from '../../models/hr/payrollSchemaModel.js';
import { getUserCompanyId } from '../../utils/companyFilter.js';
import { getCombinedFilter } from '../../utils/trialDataFilter.js';
import { analyzeCashFlowInsights } from '../../services/openaiService.js';

/**
 * Get Cash Flow Insights with AI Analysis
 * @route GET /hr/cash-flow-insights
 */
export const getCashFlowInsights = async (req, res) => {
  try {
    const { startDate, endDate, period = 90 } = req.query;
    
    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: 'No company assigned to the current user.',
        data: null
      });
    }

    // Calculate date range
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(Date.now() - (parseInt(period) * 24 * 60 * 60 * 1000));
    
    // Set to start and end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // Build base filter - ensure company filtering for non-superadmin
    const companyFilter = companyId ? { company: companyId } : null;
    let baseFilter = await getCombinedFilter(req.user, companyFilter);
    
    // For non-superadmin, ensure company filter is always applied
    if (!isSuperadmin && companyId) {
      if (!baseFilter) {
        baseFilter = { company: companyId };
      } else if (baseFilter.$and) {
        // Check if company filter already exists in $and
        const hasCompanyFilter = baseFilter.$and.some(condition => condition.company);
        if (!hasCompanyFilter) {
          baseFilter.$and.push({ company: companyId });
        }
      } else {
        // baseFilter is a plain object, ensure company is set
        if (!baseFilter.company) {
          baseFilter.company = companyId;
        }
      }
    }

    // Add date filter
    const dateFilter = {
      $gte: start,
      $lte: end
    };

    // Fetch invoices (both paid and pending) - with proper company and date filtering
    const invoiceMatch = baseFilter ? { ...baseFilter } : {};
    
    // Add date filter to invoice query
    invoiceMatch.invoiceDate = dateFilter;

    const invoices = await Invoice.find(invoiceMatch)
      .select('amount status invoiceDate dueDate paymentDate clientName company')
      .lean();

    // Filter invoices by date range (already filtered by query, but double-check for safety)
    // Also verify company filter was applied correctly
    const invoicesInRange = invoices.filter(inv => {
      // Double-check company filter for non-superadmin
      if (!isSuperadmin && companyId) {
        const invCompanyId = inv.company?.toString ? inv.company.toString() : (typeof inv.company === 'string' ? inv.company : String(inv.company));
        if (invCompanyId !== companyId) {
          return false; // Skip invoices from other companies
        }
      }
      const invDate = new Date(inv.invoiceDate);
      return invDate >= start && invDate <= end;
    });

    // Separate paid and pending invoices
    const paidInvoices = invoicesInRange.filter(inv => inv.status === 'paid');
    const pendingInvoices = invoicesInRange.filter(inv => inv.status === 'pending');

    // Calculate totals
    const totalRevenue = paidInvoices.reduce((sum, inv) => {
      const amount = typeof inv.amount === 'string' ? parseFloat(inv.amount) : inv.amount;
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    const pendingAmount = pendingInvoices.reduce((sum, inv) => {
      const amount = typeof inv.amount === 'string' ? parseFloat(inv.amount) : inv.amount;
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // Calculate average collection days
    const paidWithDates = paidInvoices.filter(inv => inv.invoiceDate && inv.paymentDate);
    let averageCollectionDays = 0;
    if (paidWithDates.length > 0) {
      const totalDays = paidWithDates.reduce((sum, inv) => {
        const invDate = new Date(inv.invoiceDate);
        const payDate = new Date(inv.paymentDate);
        const days = Math.floor((payDate - invDate) / (1000 * 60 * 60 * 24));
        return sum + (days > 0 ? days : 0);
      }, 0);
      averageCollectionDays = Math.floor(totalDays / paidWithDates.length);
    }

    // Calculate aging for pending invoices
    const now = new Date();
    const agingBreakdown = {
      '0-30': { count: 0, amount: 0 },
      '31-60': { count: 0, amount: 0 },
      '61-90': { count: 0, amount: 0 },
      '90+': { count: 0, amount: 0 }
    };

    pendingInvoices.forEach(inv => {
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.invoiceDate);
      const daysPastDue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
      const amount = typeof inv.amount === 'string' ? parseFloat(inv.amount) : inv.amount;
      const validAmount = isNaN(amount) ? 0 : amount;

      if (daysPastDue <= 30) {
        agingBreakdown['0-30'].count++;
        agingBreakdown['0-30'].amount += validAmount;
      } else if (daysPastDue <= 60) {
        agingBreakdown['31-60'].count++;
        agingBreakdown['31-60'].amount += validAmount;
      } else if (daysPastDue <= 90) {
        agingBreakdown['61-90'].count++;
        agingBreakdown['61-90'].amount += validAmount;
      } else {
        agingBreakdown['90+'].count++;
        agingBreakdown['90+'].amount += validAmount;
      }
    });

    // Fetch expenses - ensure company filtering
    const expenseMatch = baseFilter ? { ...baseFilter } : {};
    
    // For non-superadmin, ensure company filter
    if (!isSuperadmin && companyId && !expenseMatch.company) {
      expenseMatch.company = companyId;
    }
    
    expenseMatch.date = dateFilter;

    const expenses = await Expense.find(expenseMatch)
      .select('amount type date')
      .lean();

    const totalExpenses = expenses.reduce((sum, exp) => {
      const amount = typeof exp.amount === 'string' ? parseFloat(exp.amount) : exp.amount;
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // Fetch payrolls - ensure company filtering
    const payrollMatch = baseFilter ? { ...baseFilter } : {};
    
    // For non-superadmin, ensure company filter
    if (!isSuperadmin && companyId && !payrollMatch.company) {
      payrollMatch.company = companyId;
    }
    
    payrollMatch.payDate = dateFilter;

    const payrolls = await Payroll.find(payrollMatch)
      .select('totalSalary baseSalary bonus deductions payDate')
      .lean();

    const totalPayroll = payrolls.reduce((sum, payroll) => {
      const amount = typeof payroll.totalSalary === 'string' ? parseFloat(payroll.totalSalary) : payroll.totalSalary;
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // Calculate monthly breakdown
    const monthlyBreakdown = [];
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

      const monthInvoices = invoicesInRange.filter(inv => {
        const invDate = new Date(inv.invoiceDate);
        return invDate >= monthStart && invDate <= monthEnd;
      });

      const monthPaid = monthInvoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => {
        const amount = typeof inv.amount === 'string' ? parseFloat(inv.amount) : inv.amount;
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

      const monthExpenses = expenses.filter(exp => {
        const expDate = new Date(exp.date);
        return expDate >= monthStart && expDate <= monthEnd;
      }).reduce((sum, exp) => {
        const amount = typeof exp.amount === 'string' ? parseFloat(exp.amount) : exp.amount;
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

      const monthPayroll = payrolls.filter(pay => {
        const payDate = new Date(pay.payDate);
        return payDate >= monthStart && payDate <= monthEnd;
      }).reduce((sum, pay) => {
        const amount = typeof pay.totalSalary === 'string' ? parseFloat(pay.totalSalary) : pay.totalSalary;
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

      monthlyBreakdown.push({
        month: monthStart.toISOString().substring(0, 7), // YYYY-MM
        monthName: monthStart.toLocaleString('default', { month: 'long', year: 'numeric' }),
        revenue: monthPaid,
        expenses: monthExpenses,
        payroll: monthPayroll,
        netCashFlow: monthPaid - monthExpenses - monthPayroll
      });

      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Calculate upcoming expenses (next 30 days) - ensure company filter maintained
    const next30Days = new Date();
    next30Days.setDate(next30Days.getDate() + 30);
    const upcomingExpensesMatch = { ...expenseMatch };
    upcomingExpensesMatch.date = { $gte: new Date(), $lte: next30Days };
    
    // Ensure company filter for non-superadmin
    if (!isSuperadmin && companyId && !upcomingExpensesMatch.company) {
      upcomingExpensesMatch.company = companyId;
    }
    
    const upcomingExpensesData = await Expense.find(upcomingExpensesMatch)
      .select('amount company')
      .lean();

    const upcomingExpenses = upcomingExpensesData.reduce((sum, exp) => {
      const amount = typeof exp.amount === 'string' ? parseFloat(exp.amount) : exp.amount;
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // Calculate upcoming payroll (next 30 days) - ensure company filter maintained
    const upcomingPayrollMatch = { ...payrollMatch };
    upcomingPayrollMatch.payDate = { $gte: new Date(), $lte: next30Days };
    
    // Ensure company filter for non-superadmin
    if (!isSuperadmin && companyId && !upcomingPayrollMatch.company) {
      upcomingPayrollMatch.company = companyId;
    }
    
    const upcomingPayrollData = await Payroll.find(upcomingPayrollMatch)
      .select('totalSalary company')
      .lean();

    const upcomingPayroll = upcomingPayrollData.reduce((sum, pay) => {
      const amount = typeof pay.totalSalary === 'string' ? parseFloat(pay.totalSalary) : pay.totalSalary;
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // Calculate payment trends (last 3 months)
    const paymentTrends = [];
    for (let i = 2; i >= 0; i--) {
      const trendDate = new Date();
      trendDate.setMonth(trendDate.getMonth() - i);
      const trendMonthStart = new Date(trendDate.getFullYear(), trendDate.getMonth(), 1);
      const trendMonthEnd = new Date(trendDate.getFullYear(), trendDate.getMonth() + 1, 0, 23, 59, 59);

      const trendInvoices = invoices.filter(inv => {
        // Verify company filter for non-superadmin
        if (!isSuperadmin && companyId) {
          const invCompanyId = inv.company?.toString ? inv.company.toString() : (typeof inv.company === 'string' ? inv.company : String(inv.company));
          if (invCompanyId !== companyId) {
            return false; // Skip invoices from other companies
          }
        }
        if (inv.status !== 'paid' || !inv.paymentDate) return false;
        const payDate = new Date(inv.paymentDate);
        return payDate >= trendMonthStart && payDate <= trendMonthEnd;
      });

      const trendAmount = trendInvoices.reduce((sum, inv) => {
        const amount = typeof inv.amount === 'string' ? parseFloat(inv.amount) : inv.amount;
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

      paymentTrends.push({
        month: trendMonthStart.toISOString().substring(0, 7),
        monthName: trendMonthStart.toLocaleString('default', { month: 'short', year: 'numeric' }),
        amount: trendAmount,
        count: trendInvoices.length
      });
    }

    // Prepare data for AI analysis
    const cashFlowData = {
      totalRevenue,
      totalExpenses,
      totalPayroll,
      pendingInvoices: {
        totalAmount: pendingAmount,
        count: pendingInvoices.length,
        agingBreakdown
      },
      paidInvoices: {
        totalAmount: totalRevenue,
        count: paidInvoices.length
      },
      monthlyBreakdown,
      upcomingExpenses,
      upcomingPayroll,
      averageCollectionDays,
      paymentTrends,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };

    // Call AI service
    const aiInsights = await analyzeCashFlowInsights(cashFlowData);

    // Combine raw data with AI insights
    const response = {
      success: true,
      data: {
        ...cashFlowData,
        aiInsights: aiInsights.success ? aiInsights.data : null,
        metadata: {
          period: period,
          startDate: start.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0],
          generatedAt: new Date().toISOString()
        }
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Error generating cash flow insights:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating cash flow insights',
      data: null
    });
  }
};

