// controllers/invoiceController.js
import { Invoice } from "../../models/hr/invoiceModel.js";
import Order from "../../models/orderModel.js"; // Import Order model
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";
import { sendInvoiceEmail } from "../../services/emailService.js";

// Helper function to generate signed URL for S3 images
const generateSignedUrl = async (url) => {
  if (!url || (!url.includes('s3.amazonaws.com') && !url.includes('.s3.'))) {
    return url; // Return as-is if not an S3 URL
  }

  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { s3 } = await import("../../config/awsConfig.js");
    
    const cleanUrl = url.split('?')[0].split('#')[0];
    const urlObj = new URL(cleanUrl);
    let bucketName = process.env.AWS_S3_BUCKET_NAME;
    let key = decodeURIComponent(urlObj.pathname.substring(1));

    if (urlObj.hostname.includes('.s3.')) {
      bucketName = urlObj.hostname.split('.s3.')[0];
      key = decodeURIComponent(urlObj.pathname.substring(1));
    } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      bucketName = pathParts[0];
      key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
    }

    // Clean key from query parameters
    if (key.includes('?')) key = key.split('?')[0];
    if (key.includes('&')) key = key.split('&')[0];

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      ResponseContentType: url.toLowerCase().includes('.png') ? 'image/png' : 
                          url.toLowerCase().includes('.gif') ? 'image/gif' : 
                          url.toLowerCase().includes('.webp') ? 'image/webp' : 
                          'image/jpeg',
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return url; // Return original URL if signing fails
  }
};


export const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const query = { _id: id };
    if (companyId) {
      query.company = companyId;
    }

    const updatedInvoice = await Invoice.findOneAndUpdate(query, updateData, {
      new: true, // return the updated document
      runValidators: true, // validate according to schema
    });

    if (!updatedInvoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    // SYNC: Update Order payment status if linked
    if (updatedInvoice.orderId && updateData.status) {
      const orderStatus = updateData.status === 'paid' ? 'paid' : 'pending';
      await Order.findByIdAndUpdate(updatedInvoice.orderId, {
        accountingStatus: orderStatus
      });
      console.log(`🔄 [SYNC] Updated Order ${updatedInvoice.orderId} accounting status to ${orderStatus}`);
    }

    res.json({
      success: true,
      data: updatedInvoice,
      message: "Invoice updated successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Delete Invoice
export const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const query = { _id: id };
    if (companyId) {
      query.company = companyId;
    }

    const deletedInvoice = await Invoice.findOneAndDelete(query);
    if (!deletedInvoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    res.json({
      success: true,
      message: "Invoice deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getBillingReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get company filter
    const companyId = getUserCompanyId(req.user);

    // Optional date filter
    const match = {};
    if (companyId) {
      match.company = companyId;
    }
    if (startDate && endDate) {
      match.invoiceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // 1️⃣ Totals by status (Paid, Pending)
    const statusSummary = await Invoice.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // 2️⃣ Monthly Revenue (Paid + Pending)
    const monthlyRevenue = await Invoice.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } },
          totalAmount: { $sum: "$amount" },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0],
            },
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0],
            },
          },
        },
      },
      { $sort: { "_id": 1 } },
    ]);

    // 3️⃣ Revenue by Client (Paid + Pending)
    const clientRevenue = await Invoice.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$clientName",
          totalAmount: { $sum: "$amount" },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0],
            },
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0],
            },
          },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        statusSummary: statusSummary,
        monthlyRevenue: monthlyRevenue,
        clientRevenue: clientRevenue
      }
    });
  } catch (err) {
    console.error("Billing report error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createInvoice = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating invoices. Go to Company Settings to set up your company."
        });
      }
    }

    // Get company ID for the admin
    const companyId = getUserCompanyId(req.user);

    const invoice = new Invoice({
      ...req.body,
      company: companyId // Associate with admin's company
    });
    // unique invoice URL (frontend route or direct API)
    const invoiceUrl = `${process.env.CLIENT_URL}/invoice/${invoice._id}`;
    invoice.invoiceUrl = invoiceUrl

    await invoice.save();

    // Populate order data if orderId exists (preferred) or trip data if tripId exists
    let tripData = null;
    if (invoice.orderId) {
      // Handle orderId - fetch order data
      const Order = (await import('../../models/orderModel.js')).default;
      const orderData = await Order.findById(invoice.orderId)
        .populate('truck', 'unitNumber plateNumber internalId make model type')
        .populate('trailer', 'unitNumber plateNumber internalId make model type capacity')
        .populate('customer', 'name email phone address company city state country')
        .populate('pickupLocation.placeId', 'name currentLocation.address currentLocation.latitude currentLocation.longitude city state')
        .populate('deliveryLocation.placeId', 'name currentLocation.address currentLocation.latitude currentLocation.longitude city state')
        .lean();
      
      // Convert order data to tripData format for email compatibility
      if (orderData) {
        tripData = {
          orders: [orderData],
          tripNumber: orderData.orderNumber || orderData._id.toString(),
          truck: orderData.truck,
          trailer: orderData.trailer
        };
      }
    } else if (invoice.tripId) {
      // Handle tripId - fetch trip data (legacy support)
      const Trip = (await import('../../models/tripModel.js')).default;
      tripData = await Trip.findById(invoice.tripId)
        .populate('truck', 'unitNumber plateNumber internalId make model type')
        .populate('trailer', 'unitNumber plateNumber internalId make model type capacity')
        .populate({
          path: 'orders',
          select: 'orderNumber customerOrderNo pickupLocation deliveryLocation commodity weight weightUnit orderType equipment noOfPackages noOfPackagesType temperature additionalInfo dimensions',
          populate: {
            path: 'customer',
            select: 'name email phone address company'
          }
        })
        .lean();
    }

    // Populate company data for email
    const companyData = invoice.company
      ? await (await import('../../models/driver/companysettingsModel.js')).CompanySettings.findById(invoice.company).lean()
      : null;

    // Send email to customer if email is provided
    if (invoice.clientEmail) {
      const emailResult = await sendInvoiceEmail({
        customerEmail: invoice.clientEmail,
        customerName: invoice.clientName,
        invoiceId: invoice._id.toString(),
        invoiceNumber: invoice._id.toString().slice(-8).toUpperCase(),
        amount: invoice.amount,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        paymentTerms: invoice.paymentTerms,
        invoiceUrl: invoice.invoiceUrl,
        tripData: tripData,
        companyData: companyData
      });

      if (emailResult && emailResult.success) {
        console.log('✅ Invoice email sent successfully to:', invoice.clientEmail);
      } else {
        console.warn('⚠️ Failed to send invoice email:', emailResult?.error || emailResult?.message || 'Unknown error');
        console.warn('⚠️ Invoice created successfully, but email notification failed. Please check SMTP configuration.');
        // Don't fail the invoice creation if email fails - invoice is still created
      }
    }

    res.json({ success: true, data: invoice, message: "invoice created" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listInvoices = async (req, res) => {
  try {
    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;

    // Get combined filter (company + trial data filter)
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    const invoices = await Invoice.find(query)
      .populate('company', 'companyName address contactEmail contactPhone taxNumber logoUrl')
      .populate({
        path: 'orderId',
        select: 'orderNumber customerOrderNo pickupLocation deliveryLocation driver coDriver truck trailer',
        populate: [
          {
            path: 'driver',
            select: 'name email phone internalId'
          },
          {
            path: 'coDriver',
            select: 'name email phone internalId'
          },
          {
            path: 'truck',
            select: 'unitNumber plateNumber internalId make model type'
          },
          {
            path: 'trailer',
            select: 'unitNumber plateNumber internalId make model type capacity'
          }
        ]
      })
      .sort({ createdAt: -1 });

    // Generate signed URLs for company logos
    const invoicesWithSignedUrls = await Promise.all(
      invoices.map(async (invoice) => {
        const invoiceObj = invoice.toObject();
        
        // Generate signed URL for company logo if it exists
        if (invoiceObj.company && invoiceObj.company.logoUrl) {
          try {
            invoiceObj.company.logoUrl = await generateSignedUrl(invoiceObj.company.logoUrl);
          } catch (error) {
            console.error('Error generating signed URL for company logo:', error);
            // Keep the original URL if signing fails
          }
        }
        
        return invoiceObj;
      })
    );

    res.json({ success: true, data: invoicesWithSignedUrls });
  } catch (err) {
    res.status(500).json({ success: false, data: err.message });
  }
};

export const getInvoiceById = async (req, res) => {
  try {
    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const query = { _id: req.params.id };
    if (companyId) {
      query.company = companyId;
    }

    const invoice = await Invoice.findOne(query)
      .populate('company', 'companyName address contactEmail contactPhone taxNumber logoUrl')
      .populate({
        path: 'orderId',
        select: 'orderNumber customerOrderNo pickupLocation deliveryLocation driver coDriver truck trailer',
        populate: [
          {
            path: 'driver',
            select: 'name email phone internalId'
          },
          {
            path: 'coDriver',
            select: 'name email phone internalId'
          },
          {
            path: 'truck',
            select: 'unitNumber plateNumber internalId make model type'
          },
          {
            path: 'trailer',
            select: 'unitNumber plateNumber internalId make model type capacity'
          }
        ]
      })
      .populate({
        path: 'tripId',
        select: 'tripNumber status startLocation endLocation route plannedStartDate plannedEndDate actualStartDate actualEndDate notes driver coDriver',
        populate: [
          {
            path: 'truck',
            select: 'unitNumber plateNumber internalId make model type'
          },
          {
            path: 'trailer',
            select: 'unitNumber plateNumber internalId make model type capacity'
          },
          {
            path: 'driver',
            select: 'name email phone'
          },
          {
            path: 'coDriver',
            select: 'name email phone'
          },
          {
            path: 'orders',
            select: 'orderNumber customerOrderNo pickupLocation deliveryLocation commodity weight weightUnit orderType equipment noOfPackages noOfPackagesType temperature additionalInfo dimensions',
            populate: [
              {
                path: 'customer',
                select: 'name email phone address company location'
              },
              {
                path: 'pickupLocation.placeId',
                select: 'name currentLocation.address currentLocation.city currentLocation.state'
              },
              {
                path: 'deliveryLocation.placeId',
                select: 'name currentLocation.address currentLocation.city currentLocation.state'
              }
            ]
          }
        ]
      });
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    // Generate signed URL for company logo if it exists
    const invoiceObj = invoice.toObject();
    if (invoiceObj.company && invoiceObj.company.logoUrl) {
      try {
        invoiceObj.company.logoUrl = await generateSignedUrl(invoiceObj.company.logoUrl);
      } catch (error) {
        console.error('Error generating signed URL for company logo:', error);
        // Keep the original URL if signing fails
      }
    }

    res.json({ success: true, data: invoiceObj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
