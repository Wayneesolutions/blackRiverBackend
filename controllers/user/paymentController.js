// controllers/paymentController.js
import Stripe from "stripe";
import { Invoice } from "../../models/hr/invoiceModel.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createPaymentSession = async (req, res) => {
  try {
    const { invoiceId } = req.body;

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({success:false, message: "Invoice not found" });
    if (invoice.status === "paid") return res.status(400).json({success:false, message: "Already paid" });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: invoice.currency.toLowerCase(),
            product_data: {
              name: `Invoice #${invoice._id}`,
              description: invoice.notes || "Invoice payment",
            },
            unit_amount: Math.round(parseFloat(invoice.amount) * 100), // Stripe works in cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.CLIENT_URL}/invoice/${invoice._id}?status=success`,
      cancel_url: `${process.env.CLIENT_URL}/invoice/${invoice._id}?status=cancel`,

      // ✅ Attach invoiceId and client info for later reference
      metadata: {
        invoiceId: invoice._id.toString(),
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail || "",
        clientCompany: invoice.clientCompany || "",
      },
    });

    res.json({success:true, url: session.url });
  } catch (err) {
    console.error("Stripe session error:", err);
    res.status(500).json({success:false, message: err.message });
  }
};

// Test Stripe connection
export const testStripeConnection = async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Stripe secret key not configured"
      });
    }

    // Test Stripe connection by listing products
    const products = await stripe.products.list({ limit: 1 });
    
    res.json({
      success: true,
      message: "Stripe connection successful",
      stripeConfigured: true
    });
  } catch (err) {
    console.error("Stripe connection test error:", err);
    res.status(500).json({
      success: false,
      message: "Stripe connection failed",
      error: err.message
    });
  }
};
