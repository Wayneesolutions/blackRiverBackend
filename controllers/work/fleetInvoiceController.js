import mongoose from "mongoose";
import { FleetInvoice } from "../../models/driver/fleetInvoiceModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { CompanySettings } from "../../models/driver/companysettingsModel.js";
import { sendInvoiceEmail } from "../../services/emailService.js";
import { extractFleetInvoiceData } from "../../services/openaiService.js";

// Get invoice summary (paid, unpaid, overdue amounts)
export const getFleetInvoiceSummary = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        data: {
          paidAmount: 0,
          unpaidAmount: 0,
          overdueAmount: 0,
          totalAmount: 0,
          paidCount: 0,
          unpaidCount: 0,
          overdueCount: 0,
        },
      });
    }

    // Build match query - use ObjectId for aggregation (Mongoose aggregate doesn't auto-cast)
    const matchQuery = {};
    if (companyId) {
      try {
        matchQuery.company = mongoose.Types.ObjectId.isValid(companyId)
          ? new mongoose.Types.ObjectId(companyId)
          : companyId;
      } catch {
        matchQuery.company = companyId;
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use $facet to compute all summaries in a single pass
    const pipeline = [
      ...(Object.keys(matchQuery).length > 0 ? [{ $match: matchQuery }] : []),
      {
        $facet: {
          paid: [
            { $match: { status: 'paid' } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } }, count: { $sum: 1 } } },
          ],
          unpaid: [
            { $match: { status: { $in: ['draft', 'sent'] } } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } }, count: { $sum: 1 } } },
          ],
          overdue: [
            {
              $match: {
                status: { $in: ['draft', 'sent'] },
                dueDate: { $lt: today },
              },
            },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } }, count: { $sum: 1 } } },
          ],
          all: [
            { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } }, count: { $sum: 1 } } },
          ],
        },
      },
      {
        $project: {
          paidAmount: { $ifNull: [{ $let: { vars: { p: { $arrayElemAt: ['$paid', 0] } }, in: '$$p.total' } }, 0] },
          paidCount: { $ifNull: [{ $let: { vars: { p: { $arrayElemAt: ['$paid', 0] } }, in: '$$p.count' } }, 0] },
          unpaidAmount: { $ifNull: [{ $let: { vars: { p: { $arrayElemAt: ['$unpaid', 0] } }, in: '$$p.total' } }, 0] },
          unpaidCount: { $ifNull: [{ $let: { vars: { p: { $arrayElemAt: ['$unpaid', 0] } }, in: '$$p.count' } }, 0] },
          overdueAmount: { $ifNull: [{ $let: { vars: { p: { $arrayElemAt: ['$overdue', 0] } }, in: '$$p.total' } }, 0] },
          overdueCount: { $ifNull: [{ $let: { vars: { p: { $arrayElemAt: ['$overdue', 0] } }, in: '$$p.count' } }, 0] },
          totalAmount: { $ifNull: [{ $let: { vars: { p: { $arrayElemAt: ['$all', 0] } }, in: '$$p.total' } }, 0] },
          totalCount: { $ifNull: [{ $let: { vars: { p: { $arrayElemAt: ['$all', 0] } }, in: '$$p.count' } }, 0] },
        },
      },
    ];

    let result;

    try {
      const aggResult = await FleetInvoice.aggregate(pipeline);
      const summary = aggResult[0];
      const hasData = summary && (summary.totalCount > 0 || summary.totalAmount > 0);

      if (hasData) {
        result = summary;
      } else {
        // Fallback: compute from find() when aggregation returns empty (e.g. type mismatch)
        const findQuery = companyId ? { company: companyId } : {};
        const invoices = await FleetInvoice.find(findQuery).select('total status dueDate').lean();
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        let paidAmount = 0, paidCount = 0, unpaidAmount = 0, unpaidCount = 0, overdueAmount = 0, overdueCount = 0;
        for (const inv of invoices) {
          const total = Number(inv.total) || 0;
          const status = inv.status || 'draft';
          const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;

          if (status === 'paid') {
            paidAmount += total;
            paidCount += 1;
          } else if (status === 'draft' || status === 'sent') {
            unpaidAmount += total;
            unpaidCount += 1;
            if (dueDate && dueDate < now) {
              overdueAmount += total;
              overdueCount += 1;
            }
          }
        }

        result = {
          paidAmount,
          paidCount,
          unpaidAmount,
          unpaidCount,
          overdueAmount,
          overdueCount,
          totalAmount: invoices.reduce((s, i) => s + (Number(i.total) || 0), 0),
          totalCount: invoices.length,
        };
      }
    } catch (aggErr) {
      console.error('Fleet invoice summary aggregation error:', aggErr?.message);
      // Fallback on aggregation error
      const findQuery = companyId ? { company: companyId } : {};
      const invoices = await FleetInvoice.find(findQuery).select('total status dueDate').lean();
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      let paidAmount = 0, paidCount = 0, unpaidAmount = 0, unpaidCount = 0, overdueAmount = 0, overdueCount = 0;
      for (const inv of invoices) {
        const total = Number(inv.total) || 0;
        const status = inv.status || 'draft';
        const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;

        if (status === 'paid') {
          paidAmount += total;
          paidCount += 1;
        } else if (status === 'draft' || status === 'sent') {
          unpaidAmount += total;
          unpaidCount += 1;
          if (dueDate && dueDate < now) {
            overdueAmount += total;
            overdueCount += 1;
          }
        }
      }

      result = {
        paidAmount,
        paidCount,
        unpaidAmount,
        unpaidCount,
        overdueAmount,
        overdueCount,
        totalAmount: invoices.reduce((s, i) => s + (Number(i.total) || 0), 0),
        totalCount: invoices.length,
      };
    }

    result = result || {
      paidAmount: 0,
      paidCount: 0,
      unpaidAmount: 0,
      unpaidCount: 0,
      overdueAmount: 0,
      overdueCount: 0,
      totalAmount: 0,
      totalCount: 0,
    };

    res.json({
      success: true,
      message: "Fleet invoice summary fetched successfully",
      data: result,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Get all invoices
export const getFleetInvoices = async (req, res) => {
  try {
    const { status, search } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({ success: true, message: "No company assigned to the current admin.", data: [] });
    }

    const query = {};
    if (companyId) {
      query.company = companyId;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerEmail: { $regex: search, $options: 'i' } }
      ];
    }

    const invoices = await FleetInvoice.find(query)
      .populate('items.partId')
      .populate('customerId', 'name email phone billing')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Fleet invoices fetched successfully",
      data: invoices
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Get invoice by ID
export const getFleetInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const query = { _id: id };
    if (companyId) {
      query.company = companyId;
    }

    const invoice = await FleetInvoice.findOne(query)
      .populate('items.partId')
      .populate('customerId', 'name email phone billing');

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    res.json({
      success: true,
      message: "Invoice fetched successfully",
      data: invoice
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Create invoice
export const createFleetInvoice = async (req, res) => {
  try {
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating invoices. Go to Company Settings to set up your company."
        });
      }
    }

    // If invoiceNumber not provided, generate it
    let invoiceNumber = req.body.invoiceNumber;
    if (!invoiceNumber) {
      const year = new Date().getFullYear();
      const count = await FleetInvoice.countDocuments({ 
        createdAt: { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) }
      });
      invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;
    }

    const companyId = getUserCompanyId(req.user);
    
    // Process items and calculate totals
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    let subtotal = 0;
    let totalTaxAmount = 0;

    const processedItems = items.map((item) => {
      const quantity = Number(item.quantity || item.qty || 1);
      const unitPrice = Number(item.unitPrice || item.rate || 0);
      const totalPrice = quantity * unitPrice;
      subtotal += totalPrice;

      // Calculate tax for this item
      const taxPercent = Number(item.taxPercent || 0);
      const itemTax = totalPrice * (taxPercent / 100);
      totalTaxAmount += itemTax;

      return {
        // Legacy part fields (optional)
        partId: item.partId || null,
        partNumber: item.partNumber || null,
        partName: item.partName || null,
        
        // New service/maintenance fields
        serviceDate: item.serviceDate || null,
        productService: item.productService || null,
        description: item.description || '',
        
        quantity: quantity,
        unitPrice: unitPrice,
        totalPrice: totalPrice,
        taxId: item.taxId || null,
        taxName: item.taxName || null,
        taxPercent: taxPercent
      };
    });

    // Process labour charges (outside line items)
    const labourHours = Number(req.body.labourHours || 0);
    const labourRate = Number(req.body.labourRate || 0);
    const labourAmount = labourHours * labourRate;
    const labourTaxPercent = Number(req.body.labourTaxPercent || 0);
    const labourTaxAmount = labourAmount * (labourTaxPercent / 100);

    // Calculate totals: subtotal includes items + labour, tax includes items tax + labour tax
    const itemsSubtotal = subtotal; // Items subtotal
    const finalSubtotal = itemsSubtotal + labourAmount; // Items + Labour
    const finalTaxAmount = totalTaxAmount + labourTaxAmount; // Items tax + Labour tax
    const total = finalSubtotal + finalTaxAmount;

    const invoiceData = {
      invoiceNumber,
      invoiceDate: req.body.invoiceDate ? new Date(req.body.invoiceDate) : new Date(),
      customerName: req.body.customerName || '',
      customerEmail: req.body.customerEmail || null,
      customerPhone: req.body.customerPhone || null,
      customerAddress: req.body.customerAddress || null,
      customerId: req.body.customerId || null,
      terms: req.body.terms || null,
      items: processedItems,
      subtotal: finalSubtotal, // Items + Labour
      taxAmount: finalTaxAmount, // Items tax + Labour tax
      labourHours: labourHours || 0,
      labourRate: labourRate || 0,
      labourAmount: labourAmount || 0,
      labourTaxId: req.body.labourTaxId || null,
      labourTaxName: req.body.labourTaxName || null,
      labourTaxPercent: labourTaxPercent || 0,
      total: total,
      status: req.body.status || 'draft',
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : new Date(),
      messageOnInvoice: req.body.messageOnInvoice || null,
      notes: req.body.notes || null,
      ...(companyId && { company: companyId })
    };

    const invoice = await FleetInvoice.create(invoiceData);
    const populatedInvoice = await FleetInvoice.findById(invoice._id)
      .populate('items.partId')
      .populate('customerId', 'name email phone billing');

    res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: populatedInvoice
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, error: err.message });
  }
};

// Update invoice
export const updateFleetInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const invoiceExists = await FleetInvoice.findById(id);

    if (!invoiceExists) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    if (!isSuperadmin && invoiceExists.company && invoiceExists.company.toString() !== companyId) {
      return res.status(403).json({ success: false, message: "You do not have permission to modify this invoice." });
    }
    
    // Recalculate totals if items are updated
    if (req.body.items && Array.isArray(req.body.items)) {
      let subtotal = 0;
      let totalTaxAmount = 0;

      const processedItems = req.body.items.map((item) => {
        const quantity = Number(item.quantity || item.qty || 1);
        const unitPrice = Number(item.unitPrice || item.rate || 0);
        const totalPrice = quantity * unitPrice;
        subtotal += totalPrice;

        // Calculate tax for this item
        const taxPercent = Number(item.taxPercent || 0);
        const itemTax = totalPrice * (taxPercent / 100);
        totalTaxAmount += itemTax;

        return {
          partId: item.partId || null,
          partNumber: item.partNumber || null,
          partName: item.partName || null,
          serviceDate: item.serviceDate || null,
          productService: item.productService || null,
          description: item.description || '',
          quantity: quantity,
          unitPrice: unitPrice,
          totalPrice: totalPrice,
          taxId: item.taxId || null,
          taxName: item.taxName || null,
          taxPercent: taxPercent
        };
      });

      // Process labour charges (outside line items)
      const labourHours = Number(req.body.labourHours || 0);
      const labourRate = Number(req.body.labourRate || 0);
      const labourAmount = labourHours * labourRate;
      const labourTaxPercent = Number(req.body.labourTaxPercent || 0);
      const labourTaxAmount = labourAmount * (labourTaxPercent / 100);

      // Calculate totals: subtotal includes items + labour, tax includes items tax + labour tax
      const itemsSubtotal = subtotal; // Items subtotal
      const finalSubtotal = itemsSubtotal + labourAmount; // Items + Labour
      const finalTaxAmount = totalTaxAmount + labourTaxAmount; // Items tax + Labour tax
      const total = finalSubtotal + finalTaxAmount;
      
      req.body.items = processedItems;
      req.body.subtotal = finalSubtotal;
      req.body.taxAmount = finalTaxAmount;
      req.body.labourHours = labourHours || 0;
      req.body.labourRate = labourRate || 0;
      req.body.labourAmount = labourAmount || 0;
      req.body.labourTaxId = req.body.labourTaxId || null;
      req.body.labourTaxName = req.body.labourTaxName || null;
      req.body.labourTaxPercent = labourTaxPercent || 0;
      req.body.total = total;
    }
    
    // Handle date fields
    if (req.body.invoiceDate) {
      req.body.invoiceDate = new Date(req.body.invoiceDate);
    }
    if (req.body.dueDate) {
      req.body.dueDate = new Date(req.body.dueDate);
    }

    const invoice = await FleetInvoice.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    ).populate('items.partId');

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    res.json({
      success: true,
      message: "Invoice updated successfully",
      data: invoice
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, error: err.message });
  }
};

// Delete invoice
export const deleteFleetInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const invoice = await FleetInvoice.findById(id);

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    if (!isSuperadmin && invoice.company && invoice.company.toString() !== companyId) {
      return res.status(403).json({ success: false, message: "You do not have permission to delete this invoice." });
    }

    await FleetInvoice.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Invoice deleted successfully"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Email invoice to customer
export const emailFleetInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const query = { _id: id };
    if (companyId) {
      query.company = companyId;
    }

    const invoice = await FleetInvoice.findOne(query)
      .populate('customerId', 'name email')
      .lean();

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    // Build invoice details for email (line items, labour, subtotal, tax, total)
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const itemsSubtotal = items.reduce((sum, item) => {
      const qty = Number(item.quantity) || 1;
      const rate = Number(item.unitPrice) || 0;
      return sum + (qty * rate);
    }, 0);
    const labourHours = Number(invoice.labourHours) || 0;
    const labourRate = Number(invoice.labourRate) || 0;
    const labourAmount = Number(invoice.labourAmount) || (labourHours * labourRate);
    const invoiceDetails = {
      items: items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        taxName: item.taxName,
        taxPercent: item.taxPercent,
      })),
      itemsSubtotal,
      labourHours,
      labourRate,
      labourAmount,
      labourTaxName: invoice.labourTaxName || null,
      labourTaxPercent: Number(invoice.labourTaxPercent) || 0,
      subtotal: Number(invoice.subtotal) || 0,
      taxAmount: Number(invoice.taxAmount) || 0,
      total: Number(invoice.total) || 0,
    };

    const customerEmail =
      invoice.customerEmail ||
      (invoice.customerId && typeof invoice.customerId === 'object' ? invoice.customerId.email : null);

    const customerName =
      invoice.customerName ||
      (invoice.customerId && typeof invoice.customerId === 'object' ? invoice.customerId.name : 'Customer');

    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        message: "Customer email is not available for this invoice. Please add an email to the customer profile or invoice first.",
      });
    }

    // Build company data for email (optional)
    let companyData = null;
    if (invoice.company) {
      try {
        const companyDoc = await CompanySettings.findById(invoice.company)
          .select("companyName contactEmail contactPhone address logoUrl taxNumber")
          .lean();
        if (companyDoc) {
          companyData = {
            companyName: companyDoc.companyName,
            contactEmail: companyDoc.contactEmail,
            contactPhone: companyDoc.contactPhone,
            address: companyDoc.address,
            logoUrl: companyDoc.logoUrl,
            taxNumber: companyDoc.taxNumber,
          };
        }
      } catch (e) {
        console.error("Failed to load company settings for fleet invoice email:", e.message);
      }
    }

    const clientBaseUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const invoiceUrl = `${clientBaseUrl}/admin/fleetmaintenance/invoices`;

    // Accept optional PDF attachment sent from the frontend (base64-encoded)
    const { pdfBase64, pdfFileName } = req.body || {};

    const emailResult = await sendInvoiceEmail({
      customerEmail,
      customerName,
      invoiceId: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber || "N/A",
      amount: invoice.total,
      currency: companyData?.currency || "CAD",
      dueDate: invoice.dueDate,
      paymentTerms: invoice.terms || null,
      invoiceUrl,
      includePaymentLink: false,
      tripData: null,
      companyData,
      invoiceDetails,
      pdfBase64: pdfBase64 || null,
      pdfFileName: pdfFileName || null,
    });

    if (!emailResult?.success) {
      return res.status(500).json({
        success: false,
        message: emailResult?.message || "Failed to send invoice email",
        error: emailResult?.error || null,
      });
    }

    return res.json({
      success: true,
      message: "Invoice email sent successfully",
      data: {
        emailResult,
      },
    });
  } catch (err) {
    console.error("Error emailing fleet invoice:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Update invoice status
export const updateFleetInvoiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['draft', 'sent', 'paid', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const invoiceDoc = await FleetInvoice.findById(id);

    if (!invoiceDoc) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    if (!isSuperadmin && invoiceDoc.company && invoiceDoc.company.toString() !== companyId) {
      return res.status(403).json({ success: false, message: "You do not have permission to modify this invoice." });
    }

    invoiceDoc.status = status;
    await invoiceDoc.save();

    const invoice = await FleetInvoice.findById(id)
      .populate('items.partId')
      .populate('customerId', 'name email phone billing');

    res.json({
      success: true,
      message: "Invoice status updated successfully",
      data: invoice
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, error: err.message });
  }
};


// Upload a PDF/image invoice and extract data using AI
export const uploadAndExtractFleetInvoice = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Please attach a PDF or image.' });
    }

    const { buffer, mimetype, originalname, size } = req.file;

    // 10 MB limit
    if (size > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'File too large. Maximum size is 10 MB.' });
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(mimetype)) {
      return res.status(400).json({ success: false, message: 'Unsupported file type. Please upload a PDF, JPEG, PNG, or WebP.' });
    }

    console.log(`📄 Extracting fleet invoice data from: ${originalname} (${mimetype})`);
    const result = await extractFleetInvoiceData(buffer, mimetype);

    if (!result.success) {
      return res.status(422).json({ success: false, message: result.error || 'Failed to extract invoice data' });
    }

    return res.json({
      success: true,
      message: 'Invoice data extracted successfully',
      data: result.data,
      usage: result.usage
    });
  } catch (err) {
    console.error('Error in uploadAndExtractFleetInvoice:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};
