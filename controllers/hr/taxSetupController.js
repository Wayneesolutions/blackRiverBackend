// controllers/hr/taxSetupController.js
import { IftaRate } from '../../models/hr/iftaRateModel.js';
import { SalesTax } from '../../models/hr/salesTaxModel.js';
import { PayrollTax } from '../../models/hr/payrollTaxModel.js';
import { VendorTax } from '../../models/hr/vendorTaxModel.js';
import { getUserCompanyId } from '../../utils/companyFilter.js';
import { getCombinedFilter } from '../../utils/trialDataFilter.js';

// ==================== IFTA RATES ====================

// Get all IFTA rates
export const getIftaRates = async (req, res) => {
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

    let iftaRates = await IftaRate.find(query).lean().sort({ effectiveDate: -1 });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      iftaRates = iftaRates.filter(rate => 
        rate.jurisdiction.toLowerCase().includes(searchLower) ||
        rate.rate.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      message: 'IFTA rates fetched successfully',
      data: iftaRates
    });
  } catch (err) {
    console.error('Error fetching IFTA rates:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Create IFTA rate
export const createIftaRate = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'No company assigned' });
    }

    const { jurisdiction, rate, effectiveDate } = req.body;

    const iftaRate = new IftaRate({
      jurisdiction,
      rate,
      effectiveDate,
      company: companyId
    });

    await iftaRate.save();

    res.json({
      success: true,
      message: 'IFTA rate created successfully',
      data: iftaRate
    });
  } catch (err) {
    console.error('Error creating IFTA rate:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update IFTA rate
export const updateIftaRate = async (req, res) => {
  try {
    const { id } = req.params;
    const { jurisdiction, rate, effectiveDate } = req.body;

    const iftaRate = await IftaRate.findByIdAndUpdate(
      id,
      { jurisdiction, rate, effectiveDate },
      { new: true, runValidators: true }
    );

    if (!iftaRate) {
      return res.status(404).json({ success: false, message: 'IFTA rate not found' });
    }

    res.json({
      success: true,
      message: 'IFTA rate updated successfully',
      data: iftaRate
    });
  } catch (err) {
    console.error('Error updating IFTA rate:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete IFTA rate
export const deleteIftaRate = async (req, res) => {
  try {
    const { id } = req.params;

    const iftaRate = await IftaRate.findByIdAndDelete(id);

    if (!iftaRate) {
      return res.status(404).json({ success: false, message: 'IFTA rate not found' });
    }

    res.json({
      success: true,
      message: 'IFTA rate deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting IFTA rate:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== SALES TAX ====================

// Get all Sales Tax rules
export const getSalesTaxRules = async (req, res) => {
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

    let salesTaxRules = await SalesTax.find(query).lean().sort({ createdAt: -1 });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      salesTaxRules = salesTaxRules.filter(rule => 
        rule.name.toLowerCase().includes(searchLower) ||
        rule.type.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      message: 'Sales tax rules fetched successfully',
      data: salesTaxRules
    });
  } catch (err) {
    console.error('Error fetching sales tax rules:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Create Sales Tax rule
export const createSalesTaxRule = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'No company assigned' });
    }

    const { name, type, qbSync } = req.body;

    const salesTax = new SalesTax({
      name,
      type,
      qbSync: qbSync || false,
      company: companyId
    });

    await salesTax.save();

    res.json({
      success: true,
      message: 'Sales tax rule created successfully',
      data: salesTax
    });
  } catch (err) {
    console.error('Error creating sales tax rule:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update Sales Tax rule
export const updateSalesTaxRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, qbSync } = req.body;

    const salesTax = await SalesTax.findByIdAndUpdate(
      id,
      { name, type, qbSync },
      { new: true, runValidators: true }
    );

    if (!salesTax) {
      return res.status(404).json({ success: false, message: 'Sales tax rule not found' });
    }

    res.json({
      success: true,
      message: 'Sales tax rule updated successfully',
      data: salesTax
    });
  } catch (err) {
    console.error('Error updating sales tax rule:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete Sales Tax rule
export const deleteSalesTaxRule = async (req, res) => {
  try {
    const { id } = req.params;

    const salesTax = await SalesTax.findByIdAndDelete(id);

    if (!salesTax) {
      return res.status(404).json({ success: false, message: 'Sales tax rule not found' });
    }

    res.json({
      success: true,
      message: 'Sales tax rule deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting sales tax rule:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== PAYROLL TAX ====================

// Get all Payroll Tax formulas
export const getPayrollTaxFormulas = async (req, res) => {
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

    let payrollFormulas = await PayrollTax.find(query).lean().sort({ createdAt: -1 });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      payrollFormulas = payrollFormulas.filter(formula => 
        formula.bracket.toLowerCase().includes(searchLower) ||
        formula.rate.toLowerCase().includes(searchLower) ||
        formula.classification.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      message: 'Payroll tax formulas fetched successfully',
      data: payrollFormulas
    });
  } catch (err) {
    console.error('Error fetching payroll tax formulas:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Create Payroll Tax formula
export const createPayrollTaxFormula = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'No company assigned' });
    }

    const { bracket, rate, classification } = req.body;

    const payrollTax = new PayrollTax({
      bracket,
      rate,
      classification,
      company: companyId
    });

    await payrollTax.save();

    res.json({
      success: true,
      message: 'Payroll tax formula created successfully',
      data: payrollTax
    });
  } catch (err) {
    console.error('Error creating payroll tax formula:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update Payroll Tax formula
export const updatePayrollTaxFormula = async (req, res) => {
  try {
    const { id } = req.params;
    const { bracket, rate, classification } = req.body;

    const payrollTax = await PayrollTax.findByIdAndUpdate(
      id,
      { bracket, rate, classification },
      { new: true, runValidators: true }
    );

    if (!payrollTax) {
      return res.status(404).json({ success: false, message: 'Payroll tax formula not found' });
    }

    res.json({
      success: true,
      message: 'Payroll tax formula updated successfully',
      data: payrollTax
    });
  } catch (err) {
    console.error('Error updating payroll tax formula:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete Payroll Tax formula
export const deletePayrollTaxFormula = async (req, res) => {
  try {
    const { id } = req.params;

    const payrollTax = await PayrollTax.findByIdAndDelete(id);

    if (!payrollTax) {
      return res.status(404).json({ success: false, message: 'Payroll tax formula not found' });
    }

    res.json({
      success: true,
      message: 'Payroll tax formula deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting payroll tax formula:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== VENDOR TAX ====================

// Get all Vendor Tax categories
export const getVendorTaxes = async (req, res) => {
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

    let vendorTaxes = await VendorTax.find(query).lean().sort({ createdAt: -1 });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      vendorTaxes = vendorTaxes.filter(tax => 
        tax.taxName.toLowerCase().includes(searchLower) ||
        tax.rate.toLowerCase().includes(searchLower) ||
        tax.payableAccount.toLowerCase().includes(searchLower) ||
        tax.expenseAccount.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      message: 'Vendor taxes fetched successfully',
      data: vendorTaxes
    });
  } catch (err) {
    console.error('Error fetching vendor taxes:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Create Vendor Tax category
export const createVendorTax = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'No company assigned' });
    }

    const { taxName, rate, payableAccount, expenseAccount } = req.body;

    const vendorTax = new VendorTax({
      taxName,
      rate,
      payableAccount,
      expenseAccount,
      company: companyId
    });

    await vendorTax.save();

    res.json({
      success: true,
      message: 'Vendor tax created successfully',
      data: vendorTax
    });
  } catch (err) {
    console.error('Error creating vendor tax:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update Vendor Tax category
export const updateVendorTax = async (req, res) => {
  try {
    const { id } = req.params;
    const { taxName, rate, payableAccount, expenseAccount } = req.body;

    const vendorTax = await VendorTax.findByIdAndUpdate(
      id,
      { taxName, rate, payableAccount, expenseAccount },
      { new: true, runValidators: true }
    );

    if (!vendorTax) {
      return res.status(404).json({ success: false, message: 'Vendor tax not found' });
    }

    res.json({
      success: true,
      message: 'Vendor tax updated successfully',
      data: vendorTax
    });
  } catch (err) {
    console.error('Error updating vendor tax:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete Vendor Tax category
export const deleteVendorTax = async (req, res) => {
  try {
    const { id } = req.params;

    const vendorTax = await VendorTax.findByIdAndDelete(id);

    if (!vendorTax) {
      return res.status(404).json({ success: false, message: 'Vendor tax not found' });
    }

    res.json({
      success: true,
      message: 'Vendor tax deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting vendor tax:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

