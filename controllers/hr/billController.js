// controllers/hr/billController.js
// Accounts Payable: bills the company has to pay, payments against them, and the payable
// that is created automatically when a load is sold (booked) to another trucking company.
import mongoose from "mongoose";
import { Bill } from "../../models/hr/billModel.js";
import Vendor from "../../models/vendorModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { signS3Url } from "../../utils/s3SignedUrl.js";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const companyScope = (req) => {
  const companyId = getUserCompanyId(req.user);
  const isSuperadmin = req.user?.role === 'superadmin';
  return { companyId, isSuperadmin, filter: isSuperadmin ? {} : { company: companyId } };
};

const fileUrlFrom = (req) => {
  if (!req.file) return null;
  return req.file.location || `${req.protocol}://${req.get("host")}/${String(req.file.path || '').replace(/\\/g, '/')}`;
};

/** Next bill number for the company: AP-2026-0001 */
const nextBillNumber = async (companyId) => {
  const year = new Date().getFullYear();
  const prefix = `AP-${year}-`;
  const last = await Bill.findOne({ company: companyId, billNumber: new RegExp(`^${prefix}`) })
    .sort({ billNumber: -1 }).select('billNumber').lean();
  const seq = last ? (parseInt(last.billNumber.slice(prefix.length), 10) || 0) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

const createWithNumber = async (data) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const billNumber = await nextBillNumber(data.company);
      return await Bill.create({ ...data, billNumber });
    } catch (err) {
      if (err.code !== 11000) throw err; // duplicate number from a parallel request: retry
    }
  }
  throw new Error('Could not allocate a bill number, please try again');
};

const toNumber = (v, d = 0) => {
  const n = Number(v);
  return isNaN(n) ? d : n;
};

// GET /hr/bills?status=&source=&vendor=&search=&startDate=&endDate=
export const listBills = async (req, res) => {
  try {
    const { companyId, isSuperadmin, filter } = companyScope(req);
    if (!isSuperadmin && !companyId) return res.json({ success: true, data: [] });

    const { status, source, vendor, search, startDate, endDate, category } = req.query;
    const query = { ...filter };
    if (status === 'open') query.status = { $in: ['unpaid', 'partial'] };
    else if (status === 'overdue') {
      query.status = { $in: ['unpaid', 'partial'] };
      query.dueDate = { $lt: new Date(new Date().setHours(0, 0, 0, 0)) };
    } else if (status) query.status = status;
    if (source) query.source = source;
    if (category) query.category = category;
    if (vendor && mongoose.Types.ObjectId.isValid(vendor)) query.vendor = vendor;
    if (startDate || endDate) {
      query.billDate = {};
      if (startDate) query.billDate.$gte = new Date(new Date(startDate).setHours(0, 0, 0, 0));
      if (endDate) query.billDate.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: 'i' };
      query.$or = [{ billNumber: rx }, { vendorName: rx }, { vendorInvoiceNumber: rx }, { orderNumber: rx }, { description: rx }];
    }

    const bills = await Bill.find(query).sort({ dueDate: 1, billDate: -1 }).lean();
    const data = bills.map(b => ({
      ...b,
      balance: Math.max(0, r2((b.amount || 0) + (b.taxAmount || 0) - (b.paidAmount || 0))),
    }));
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error listing bills:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /hr/bills/stats
export const getBillStats = async (req, res) => {
  try {
    const { companyId, isSuperadmin, filter } = companyScope(req);
    if (!isSuperadmin && !companyId) return res.json({ success: true, data: {} });

    const bills = await Bill.find({ ...filter, status: { $ne: 'void' } }).lean();
    const today = new Date(new Date().setHours(0, 0, 0, 0));
    const inAWeek = new Date(today.getTime() + 7 * 24 * 3600 * 1000);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const balance = (b) => Math.max(0, (b.amount || 0) + (b.taxAmount || 0) - (b.paidAmount || 0));
    const open = bills.filter(b => b.status === 'unpaid' || b.status === 'partial');

    res.json({
      success: true,
      data: {
        totalPayable: r2(open.reduce((s, b) => s + balance(b), 0)),
        openCount: open.length,
        overdue: r2(open.filter(b => b.dueDate && new Date(b.dueDate) < today).reduce((s, b) => s + balance(b), 0)),
        overdueCount: open.filter(b => b.dueDate && new Date(b.dueDate) < today).length,
        dueThisWeek: r2(open.filter(b => b.dueDate && new Date(b.dueDate) >= today && new Date(b.dueDate) <= inAWeek).reduce((s, b) => s + balance(b), 0)),
        carrierPayable: r2(open.filter(b => b.source === 'brokered_load').reduce((s, b) => s + balance(b), 0)),
        paidThisMonth: r2(bills.reduce((s, b) => s + (b.payments || [])
          .filter(p => p.date && new Date(p.date) >= monthStart)
          .reduce((x, p) => x + (Number(p.amount) || 0), 0), 0)),
      },
    });
  } catch (err) {
    console.error('Error getting bill stats:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /hr/bills  (multipart: attachment optional)
export const createBill = async (req, res) => {
  try {
    const { companyId, isSuperadmin } = companyScope(req);
    if (!isSuperadmin && !companyId) {
      return res.status(400).json({ success: false, message: 'Please complete company settings first.' });
    }
    const b = req.body;
    const amount = toNumber(b.amount, NaN);
    if (!b.vendorName && !b.vendor) return res.status(400).json({ success: false, message: 'Vendor / payee is required' });
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Amount must be more than 0' });

    let vendorName = b.vendorName;
    let vendorId = b.vendor && mongoose.Types.ObjectId.isValid(b.vendor) ? b.vendor : null;
    if (vendorId && !vendorName) {
      const v = await Vendor.findById(vendorId).select('name').lean();
      vendorName = v?.name || '';
    }

    const bill = await createWithNumber({
      vendor: vendorId,
      vendorName,
      vendorInvoiceNumber: b.vendorInvoiceNumber || '',
      category: b.category || 'Other',
      source: 'manual',
      description: b.description || '',
      billDate: b.billDate ? new Date(b.billDate) : new Date(),
      dueDate: b.dueDate ? new Date(b.dueDate) : undefined,
      amount: r2(amount),
      taxAmount: r2(toNumber(b.taxAmount)),
      currency: b.currency || 'CAD',
      attachmentUrl: fileUrlFrom(req) || undefined,
      attachmentName: req.file?.originalname,
      notes: b.notes || '',
      company: isSuperadmin ? (b.company || companyId) : companyId,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, message: 'Bill added', data: bill });
  } catch (err) {
    console.error('Error creating bill:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /hr/bills/:id  (multipart)
export const updateBill = async (req, res) => {
  try {
    const { filter } = companyScope(req);
    const bill = await Bill.findOne({ _id: req.params.id, ...filter });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    const b = req.body;
    ['vendorName', 'vendorInvoiceNumber', 'category', 'description', 'currency', 'notes'].forEach(k => {
      if (b[k] !== undefined) bill[k] = b[k];
    });
    if (b.vendor !== undefined) bill.vendor = b.vendor && mongoose.Types.ObjectId.isValid(b.vendor) ? b.vendor : null;
    if (b.billDate) bill.billDate = new Date(b.billDate);
    if (b.dueDate !== undefined) bill.dueDate = b.dueDate ? new Date(b.dueDate) : undefined;
    if (b.amount !== undefined) {
      const amount = toNumber(b.amount, NaN);
      if (isNaN(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Amount must be more than 0' });
      bill.amount = r2(amount);
    }
    if (b.taxAmount !== undefined) bill.taxAmount = r2(toNumber(b.taxAmount));
    if (req.file) {
      bill.attachmentUrl = fileUrlFrom(req);
      bill.attachmentName = req.file.originalname;
    }
    if (b.status === 'void') bill.status = 'void';
    else if (bill.status === 'void' && b.status === 'unpaid') bill.status = 'unpaid';
    bill.recalculate();
    bill.updatedBy = req.user._id;
    await bill.save();
    res.json({ success: true, message: 'Bill updated', data: bill });
  } catch (err) {
    console.error('Error updating bill:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /hr/bills/:id/payments  { amount, date, method, reference, notes }
export const recordBillPayment = async (req, res) => {
  try {
    const { filter } = companyScope(req);
    const bill = await Bill.findOne({ _id: req.params.id, ...filter });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    if (bill.status === 'void') return res.status(400).json({ success: false, message: 'This bill is void' });

    const balance = r2((bill.amount || 0) + (bill.taxAmount || 0) - (bill.paidAmount || 0));
    const amount = req.body.amount === undefined || req.body.amount === '' ? balance : r2(toNumber(req.body.amount, NaN));
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Payment amount must be more than 0' });
    if (amount > balance + 0.005) return res.status(400).json({ success: false, message: `Payment is more than the balance ($${balance.toFixed(2)})` });

    bill.payments.push({
      date: req.body.date ? new Date(req.body.date) : new Date(),
      amount,
      method: req.body.method || 'Cheque',
      reference: req.body.reference || '',
      notes: req.body.notes || '',
      recordedBy: req.user._id,
    });
    bill.recalculate();
    bill.updatedBy = req.user._id;
    await bill.save();
    res.json({ success: true, message: bill.status === 'paid' ? 'Bill paid in full' : 'Payment recorded', data: bill });
  } catch (err) {
    console.error('Error recording bill payment:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /hr/bills/:id/payments/:paymentId
export const deleteBillPayment = async (req, res) => {
  try {
    const { filter } = companyScope(req);
    const bill = await Bill.findOne({ _id: req.params.id, ...filter });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    bill.payments = bill.payments.filter(p => String(p._id) !== String(req.params.paymentId));
    bill.recalculate();
    await bill.save();
    res.json({ success: true, message: 'Payment removed', data: bill });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /hr/bills/:id  - a bill with payments is voided, not deleted
export const deleteBill = async (req, res) => {
  try {
    const { filter } = companyScope(req);
    const bill = await Bill.findOne({ _id: req.params.id, ...filter });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    if ((bill.payments || []).length > 0) {
      bill.status = 'void';
      await bill.save();
      return res.json({ success: true, message: 'Bill has payments, so it was voided instead of deleted', data: bill });
    }
    await bill.deleteOne();
    res.json({ success: true, message: 'Bill deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /hr/bills/:id/attachment-url
export const getBillAttachmentUrl = async (req, res) => {
  try {
    const { filter } = companyScope(req);
    const bill = await Bill.findOne({ _id: req.params.id, ...filter }).select('attachmentUrl').lean();
    if (!bill?.attachmentUrl) return res.status(404).json({ success: false, message: 'No file attached' });
    res.json({ success: true, url: await signS3Url(bill.attachmentUrl) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== CARRIERS (other trucking companies we sell loads to) ====================

// GET /hr/carriers?search=
export const listCarriers = async (req, res) => {
  try {
    const { companyId, isSuperadmin } = companyScope(req);
    const query = { type: 'Carrier', status: { $ne: 'inactive' }, ...(isSuperadmin ? {} : { company: companyId }) };
    if (req.query.search) query.name = { $regex: escapeRegex(req.query.search), $options: 'i' };
    const carriers = await Vendor.find(query).sort({ name: 1 }).limit(500).lean();
    res.json({ success: true, data: carriers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /hr/carriers  { name, phone, email, address }
export const createCarrier = async (req, res) => {
  try {
    const { companyId } = companyScope(req);
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Carrier name is required' });
    const existing = await Vendor.findOne({ company: companyId, type: 'Carrier', name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } }).lean();
    if (existing) return res.json({ success: true, message: 'Carrier already exists', data: existing });
    const carrier = await Vendor.create({
      name,
      phone: req.body.phone || '',
      email: req.body.email || '',
      address: req.body.address || '',
      type: 'Carrier',
      status: 'active',
      company: companyId,
    });
    res.status(201).json({ success: true, message: 'Carrier added', data: carrier });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Brokered load -> payable. Called after an order is created or updated.
 * - Load booked for a carrier with a carrier rate: create / update its bill.
 * - No longer booked (or rate removed): void the bill if nothing was paid on it.
 * A bill that has payments is never changed automatically.
 */
export const syncBrokeredLoadBill = async (order, userId = null) => {
  try {
    if (!order?._id || !order.company) return null;
    const existing = await Bill.findOne({ order: order._id, source: 'brokered_load' });
    const rate = r2(order.carrierRate);
    // A load booked to a carrier always gets a payable, even before the carrier rate is
    // typed in: it shows in Accounts Payable at $0 with a note, and Accounts enters the
    // amount there (client 19 Nov: "I manually add carrier and mark it delivered, it
    // doesn't show in Accounts Payable" - the rate was left at 0.00).
    const wantsBill = !!order.bookedForCarrier && !!(order.carrierName || order.carrier);

    if (!wantsBill) {
      if (existing && (existing.payments || []).length === 0 && existing.status !== 'void') {
        existing.status = 'void';
        existing.notes = [existing.notes, 'Voided: load is no longer booked for a carrier'].filter(Boolean).join(' | ');
        await existing.save();
      }
      return existing;
    }

    let vendorName = order.carrierName;
    if (!vendorName && order.carrier) {
      const v = await Vendor.findById(order.carrier).select('name').lean();
      vendorName = v?.name;
    }
    const route = [order.pickupLocation?.place, order.deliveryLocation?.place].filter(Boolean).join(' → ');
    const billDate = order.deliveryDate || order.pickupDate || new Date();
    const dueDate = new Date(new Date(billDate).getTime() + 30 * 24 * 3600 * 1000);
    const fields = {
      vendor: order.carrier || null,
      vendorName: vendorName || 'Carrier',
      category: 'Carrier',
      orderNumber: order.orderNumber,
      description: `Load ${order.orderNumber || ''}${route ? ` (${route})` : ''} sold to carrier`,
      amount: rate,
      currency: order.carrierCurrency || order.rateCurrency || 'CAD',
    };
    const missingRateNote = 'Carrier rate not entered on the load - enter the amount';
    if (rate <= 0) fields.notes = missingRateNote;

    if (existing) {
      if ((existing.payments || []).length > 0) return existing; // paid / partly paid: leave as is
      // No rate on the load but Accounts already typed the amount on the bill: keep theirs
      if (rate <= 0 && Number(existing.amount) > 0) {
        delete fields.amount;
        delete fields.notes;
      } else if (rate > 0 && existing.notes === missingRateNote) {
        fields.notes = '';
      }
      Object.assign(existing, fields);
      if (existing.status === 'void') existing.status = 'unpaid';
      existing.recalculate();
      existing.updatedBy = userId;
      await existing.save();
      return existing;
    }

    return await createWithNumber({
      ...fields,
      source: 'brokered_load',
      order: order._id,
      billDate,
      dueDate,
      company: order.company,
      createdBy: userId,
    });
  } catch (err) {
    console.error('⚠️ Could not sync carrier payable for order', order?._id, err.message);
    return null;
  }
};
