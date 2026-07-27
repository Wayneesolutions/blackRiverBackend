import FleetCustomer from '../../models/fleet/fleetCustomerModel.js';
import { getUserCompanyId } from '../../utils/companyFilter.js';
import { getCombinedFilter } from '../../utils/trialDataFilter.js';

/**
 * GET /hr/fleet-maintenance/customers
 * Get all fleet customers (company-scoped)
 */
export const getAllFleetCustomers = async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany =
      companyId !== null &&
      companyId !== undefined &&
      companyId !== '' &&
      String(companyId).trim() !== '' &&
      String(companyId) !== 'null' &&
      String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'No company assigned. Please contact administrator.',
      });
    }

    const companyFilter = hasValidCompany ? { company: companyId } : null;
    const filter = await getCombinedFilter(req.user, companyFilter);

    let query = {};
    if (isSuperadmin) {
      query = filter || {};
    } else {
      if (filter && filter.$and && Array.isArray(filter.$and)) {
        const hasCompany = filter.$and.some((cond) => cond && cond.company);
        query = hasCompany ? filter : { ...filter, $and: [...(filter.$and || []), { company: companyId }] };
      } else if (filter && filter.company) {
        query = filter;
      } else {
        query = filter ? { ...filter, company: companyId } : { company: companyId };
      }
    }

    const customers = await FleetCustomer.find(query)
      .populate('company', 'companyName')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: customers,
      count: customers.length,
    });
  } catch (error) {
    console.error('Error fetching fleet customers:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch fleet customers',
    });
  }
};

/**
 * GET /hr/fleet-maintenance/customers/:id
 * Get fleet customer by ID
 */
export const getFleetCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const customer = await FleetCustomer.findOne(query)
      .populate('company', 'companyName')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Fleet customer not found',
      });
    }

    res.json({
      success: true,
      data: customer,
    });
  } catch (error) {
    console.error('Error fetching fleet customer:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch fleet customer',
    });
  }
};

/**
 * POST /hr/fleet-maintenance/customers
 * Create fleet customer
 */
export const createFleetCustomer = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);

    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(400).json({
        success: false,
        message: 'Company is required to create a fleet customer.',
      });
    }

    const {
      name,
      email,
      phone,
      contactPerson,
      billing,
      sameAsBilling,
      shipping,
      notes,
      primaryPaymentMethod,
      terms,
      customerType,
      businessNumber,
      assignDefaultTaxCode,
      openingBalanceAmount,
      openingBalanceAsOf,
      documents,
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required.',
      });
    }

    const customerData = {
      name: (name || '').trim(),
      email: (email || '').trim().toLowerCase(),
      phone: (phone || '').trim(),
      contactPerson: (contactPerson || '').trim(),
      billing: billing && typeof billing === 'object' ? billing : {},
      sameAsBilling: sameAsBilling !== false,
      shipping: shipping && typeof shipping === 'object' ? shipping : {},
      notes: (notes || '').trim(),
      primaryPaymentMethod: (primaryPaymentMethod || '').trim(),
      terms: (terms || '').trim(),
      customerType: (customerType || '').trim(),
      businessNumber: (businessNumber || '').trim(),
      assignDefaultTaxCode: !!assignDefaultTaxCode,
      openingBalanceAmount:
        openingBalanceAmount !== '' && openingBalanceAmount != null
          ? parseFloat(openingBalanceAmount)
          : null,
      openingBalanceAsOf:
        openingBalanceAsOf ? new Date(openingBalanceAsOf) : null,
      documents: Array.isArray(documents) ? documents : [],
      company: companyId || undefined,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    };

    const customer = new FleetCustomer(customerData);
    await customer.save();

    const populated = await FleetCustomer.findById(customer._id)
      .populate('company', 'companyName')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Fleet customer created successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Error creating fleet customer:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create fleet customer',
    });
  }
};

/**
 * PUT /hr/fleet-maintenance/customers/:id
 * Update fleet customer
 */
export const updateFleetCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const customer = await FleetCustomer.findOne(query);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Fleet customer not found',
      });
    }

    const {
      name,
      email,
      phone,
      contactPerson,
      billing,
      sameAsBilling,
      shipping,
      notes,
      primaryPaymentMethod,
      terms,
      customerType,
      businessNumber,
      assignDefaultTaxCode,
      openingBalanceAmount,
      openingBalanceAsOf,
      documents,
    } = req.body;

    if (name !== undefined) customer.name = (name || '').trim();
    if (email !== undefined) customer.email = (email || '').trim().toLowerCase();
    if (phone !== undefined) customer.phone = (phone || '').trim();
    if (contactPerson !== undefined) customer.contactPerson = (contactPerson || '').trim();
    if (billing !== undefined && typeof billing === 'object') customer.billing = billing;
    if (sameAsBilling !== undefined) customer.sameAsBilling = sameAsBilling !== false;
    if (shipping !== undefined && typeof shipping === 'object') customer.shipping = shipping;
    if (notes !== undefined) customer.notes = (notes || '').trim();
    if (primaryPaymentMethod !== undefined) customer.primaryPaymentMethod = (primaryPaymentMethod || '').trim();
    if (terms !== undefined) customer.terms = (terms || '').trim();
    if (customerType !== undefined) customer.customerType = (customerType || '').trim();
    if (businessNumber !== undefined) customer.businessNumber = (businessNumber || '').trim();
    if (assignDefaultTaxCode !== undefined) customer.assignDefaultTaxCode = !!assignDefaultTaxCode;
    if (openingBalanceAmount !== undefined)
      customer.openingBalanceAmount =
        openingBalanceAmount !== '' && openingBalanceAmount != null
          ? parseFloat(openingBalanceAmount)
          : null;
    if (openingBalanceAsOf !== undefined)
      customer.openingBalanceAsOf = openingBalanceAsOf ? new Date(openingBalanceAsOf) : null;
    if (documents !== undefined && Array.isArray(documents)) customer.documents = documents;

    customer.updatedBy = req.user._id;
    await customer.save();

    const populated = await FleetCustomer.findById(customer._id)
      .populate('company', 'companyName')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({
      success: true,
      message: 'Fleet customer updated successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Error updating fleet customer:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update fleet customer',
    });
  }
};

/**
 * DELETE /hr/fleet-maintenance/customers/:id
 * Delete fleet customer
 */
export const deleteFleetCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const customer = await FleetCustomer.findOneAndDelete(query);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Fleet customer not found',
      });
    }

    res.json({
      success: true,
      message: 'Fleet customer deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting fleet customer:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete fleet customer',
    });
  }
};
