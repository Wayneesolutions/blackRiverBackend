// controllers/hr/accountConfigController.js
import { ChartOfAccount } from '../../models/hr/chartOfAccountModel.js';
import { AccountTaxCode } from '../../models/hr/accountTaxCodeModel.js';
import { PaymentMethod } from '../../models/hr/paymentMethodModel.js';
import { SmsBilling } from '../../models/hr/smsBillingModel.js';
import { getUserCompanyId } from '../../utils/companyFilter.js';
import { getCombinedFilter } from '../../utils/trialDataFilter.js';

// ==================== CHART OF ACCOUNTS ====================

// Get all Chart of Accounts
export const getChartOfAccounts = async (req, res) => {
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

    let accounts = await ChartOfAccount.find(query).lean().sort({ number: 1 });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      accounts = accounts.filter(account => 
        account.name.toLowerCase().includes(searchLower) ||
        account.number.includes(search) ||
        account.type.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      message: 'Chart of accounts fetched successfully',
      data: accounts
    });
  } catch (err) {
    console.error('Error fetching chart of accounts:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Create Chart of Account
export const createChartOfAccount = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'No company assigned' });
    }

    const { number, name, type, balance } = req.body;

    const account = new ChartOfAccount({
      number,
      name,
      type,
      balance: balance || 0,
      company: companyId
    });

    await account.save();

    res.json({
      success: true,
      message: 'Chart of account created successfully',
      data: account
    });
  } catch (err) {
    console.error('Error creating chart of account:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update Chart of Account
export const updateChartOfAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { number, name, type, balance } = req.body;

    const account = await ChartOfAccount.findByIdAndUpdate(
      id,
      { number, name, type, balance },
      { new: true, runValidators: true }
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Chart of account not found' });
    }

    res.json({
      success: true,
      message: 'Chart of account updated successfully',
      data: account
    });
  } catch (err) {
    console.error('Error updating chart of account:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete Chart of Account
export const deleteChartOfAccount = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await ChartOfAccount.findByIdAndDelete(id);

    if (!account) {
      return res.status(404).json({ success: false, message: 'Chart of account not found' });
    }

    res.json({
      success: true,
      message: 'Chart of account deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting chart of account:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== TAX CODES ====================

// Get all Tax Codes
export const getTaxCodes = async (req, res) => {
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

    let taxCodes = await AccountTaxCode.find(query).lean().sort({ code: 1 });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      taxCodes = taxCodes.filter(tax => 
        tax.code.toLowerCase().includes(searchLower) ||
        tax.description.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      message: 'Tax codes fetched successfully',
      data: taxCodes
    });
  } catch (err) {
    console.error('Error fetching tax codes:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Create Tax Code
export const createTaxCode = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'No company assigned' });
    }

    const { code, description, rate, category } = req.body;

    const taxCode = new AccountTaxCode({
      code,
      description,
      rate,
      category,
      company: companyId
    });

    await taxCode.save();

    res.json({
      success: true,
      message: 'Tax code created successfully',
      data: taxCode
    });
  } catch (err) {
    console.error('Error creating tax code:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update Tax Code
export const updateTaxCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, description, rate, category } = req.body;

    const taxCode = await AccountTaxCode.findByIdAndUpdate(
      id,
      { code, description, rate, category },
      { new: true, runValidators: true }
    );

    if (!taxCode) {
      return res.status(404).json({ success: false, message: 'Tax code not found' });
    }

    res.json({
      success: true,
      message: 'Tax code updated successfully',
      data: taxCode
    });
  } catch (err) {
    console.error('Error updating tax code:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete Tax Code
export const deleteTaxCode = async (req, res) => {
  try {
    const { id } = req.params;

    const taxCode = await AccountTaxCode.findByIdAndDelete(id);

    if (!taxCode) {
      return res.status(404).json({ success: false, message: 'Tax code not found' });
    }

    res.json({
      success: true,
      message: 'Tax code deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting tax code:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== PAYMENT METHODS ====================

// Get all Payment Methods
export const getPaymentMethods = async (req, res) => {
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

    let paymentMethods = await PaymentMethod.find(query).lean().sort({ method: 1 });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      paymentMethods = paymentMethods.filter(method => 
        method.method.toLowerCase().includes(searchLower) ||
        method.description.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      message: 'Payment methods fetched successfully',
      data: paymentMethods
    });
  } catch (err) {
    console.error('Error fetching payment methods:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Create Payment Method
export const createPaymentMethod = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'No company assigned' });
    }

    const { method, description, preferred } = req.body;

    const paymentMethod = new PaymentMethod({
      method,
      description,
      preferred,
      company: companyId
    });

    await paymentMethod.save();

    res.json({
      success: true,
      message: 'Payment method created successfully',
      data: paymentMethod
    });
  } catch (err) {
    console.error('Error creating payment method:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update Payment Method
export const updatePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const { method, description, preferred } = req.body;

    const paymentMethod = await PaymentMethod.findByIdAndUpdate(
      id,
      { method, description, preferred },
      { new: true, runValidators: true }
    );

    if (!paymentMethod) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }

    res.json({
      success: true,
      message: 'Payment method updated successfully',
      data: paymentMethod
    });
  } catch (err) {
    console.error('Error updating payment method:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete Payment Method
export const deletePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;

    const paymentMethod = await PaymentMethod.findByIdAndDelete(id);

    if (!paymentMethod) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }

    res.json({
      success: true,
      message: 'Payment method deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting payment method:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== SMS BILLING ====================

// Get all SMS Billing records
export const getSmsBilling = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { search, startDate, endDate } = req.query;

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    // Add date range filter if provided
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }

    let smsBilling = await SmsBilling.find(query).lean().sort({ timestamp: -1 });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      smsBilling = smsBilling.filter(sms => 
        sms.recipient.includes(search) ||
        sms.content.toLowerCase().includes(searchLower) ||
        sms.account.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      message: 'SMS billing records fetched successfully',
      data: smsBilling
    });
  } catch (err) {
    console.error('Error fetching SMS billing:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get SMS Billing Stats
export const getSmsBillingStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        data: {
          totalCost: 0,
          totalMessages: 0,
          avgCostPerSms: 0
        }
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    // Get last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    query.timestamp = { $gte: thirtyDaysAgo };

    const smsRecords = await SmsBilling.find(query).lean();

    const totalCost = smsRecords.reduce((sum, sms) => sum + (sms.cost || 0), 0);
    const totalMessages = smsRecords.length;
    const avgCostPerSms = totalMessages > 0 ? totalCost / totalMessages : 0;

    res.json({
      success: true,
      data: {
        totalCost,
        totalMessages,
        avgCostPerSms
      }
    });
  } catch (err) {
    console.error('Error fetching SMS billing stats:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

