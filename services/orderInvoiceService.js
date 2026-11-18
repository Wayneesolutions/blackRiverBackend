import { Invoice } from "../models/hr/invoiceModel.js";
import { User } from "../models/driver/userModel.js";

// Create the customer invoice for an order the first time it reaches Delivered or Completed.
//
// This used to live inline in updateOrder, so it only ran when the order was saved through the
// full edit endpoint. The Nov 2026 status rules moved the normal flow to other endpoints
// (status dropdown -> PATCH /order/:id/status, Dispatch approving documents, driver finishing),
// and from then on no invoice was created at all. Every path that moves an order to
// Delivered/Completed now calls this.
//
// Safe to call more than once: it does nothing if the order already has an invoice.
export const ensureOrderInvoice = async (order) => {
  try {
    if (!order?._id) return null;
    const status = String(order.status || '').toLowerCase();
    if (!['delivered', 'completed'].includes(status)) return null;

    const orderNumber = order.orderNumber || order.customerOrderNo || String(order._id);

    const existingInvoice = await Invoice.findOne({ orderId: order._id });
    if (existingInvoice) {
      console.log(`ℹ️ [AUTO-INVOICE] Invoice already exists for order ${orderNumber}: ${existingInvoice._id}`);
      return existingInvoice;
    }

    let clientName = '';
    let clientEmail = '';
    let clientAddress = '';
    let clientPhone = '';
    if (order.customer) {
      if (order.customer.name) {
        clientName = order.customer.name;
        clientEmail = order.customer.email;
        clientPhone = order.customer.phone;
        clientAddress = order.customer.address;
      } else {
        const customerUser = await User.findById(order.customer);
        if (customerUser) {
          clientName = customerUser.name;
          clientEmail = customerUser.email;
          clientPhone = customerUser.phone;
          clientAddress = customerUser.address || customerUser.customerDetails?.address;
        } else {
          console.warn(`⚠️ [AUTO-INVOICE] Customer not found for order ${orderNumber}`);
        }
      }
    } else {
      console.warn(`⚠️ [AUTO-INVOICE] Order ${orderNumber} has no customer`);
    }

    // Use totalAmount OR rate OR 0 (a $0 invoice is updated when the rate is filled in later)
    const invoiceAmountVal = order.totalAmount || order.rate || 0;

    const newInvoice = new Invoice({
      orderId: order._id,
      clientName: clientName || `Client for Order ${orderNumber}`,
      clientEmail,
      clientPhone,
      clientAddress,
      amount: String(invoiceAmountVal),
      currency: order.currency || order.rateCurrency || 'CAD',
      status: 'pending',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Net 30
      invoiceDate: new Date(),
      company: order.company,
      serviceBreakdown: [{
        description: `Freight Charges - Order #${orderNumber}`,
        unitPrice: invoiceAmountVal,
        amount: invoiceAmountVal,
        quantity: 1
      }]
    });

    const saved = await newInvoice.save();
    console.log(`✅ [AUTO-INVOICE] Invoice created for order ${orderNumber}: ${saved._id}`);
    return saved;
  } catch (err) {
    // Never block the status change because of the invoice
    console.error('❌ [AUTO-INVOICE] Failed to create invoice:', err?.message, err?.errors || '');
    return null;
  }
};
