import express from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import hpp from "hpp";
import bcrypt from "bcryptjs";
import jwt from 'jsonwebtoken'
import path from "path";
import { User } from "./models/driver/userModel.js";
import { CompanySettings } from "./models/driver/companysettingsModel.js";
import { updateDocumentStatuses } from "./controllers/employee/employeeDocumentController.js";
import { syncVehiclesFromGeotab } from "./jobs/vehicleSync.js";
import { runDocumentStatusUpdateJob } from "./jobs/documentStatusUpdate.js";
import { runVehicleServiceUpdateJob } from "./jobs/vehicleServiceUpdate.js";
import { runIncomingMaintenanceCheckJob } from "./jobs/incomingMaintenanceCheck.js";
import { runDailyOdometerUpdateJob } from "./jobs/dailyOdometerUpdate.js";
import { runMaintenanceOrderCleanupJob } from "./jobs/maintenanceOrderCleanup.js";
// import xss from "xss-clean";
// import mongoSanitize from "express-mongo-sanitize";
import morgan from "morgan";
import { superAdminRoute } from "./routes/superAdminRoute.js";
import { adminRoute } from "./routes/adminRoute.js";
import { driverRoute } from "./routes/driverRoute.js";
import { getPublicConfig } from "./controllers/configController.js";
import { getPlaceAutocomplete, getPlaceTextSearch, getPlaceDetails } from "./controllers/placesController.js";
import { hrRoute } from "./routes/hrRoute.js";
import { healthSafetyRoute } from "./routes/healthSafetyRoute.js";
import { complianceRoute } from "./routes/complianceRoute.js";
import { dispatcherRoute } from "./routes/dispatcherRoute.js";
import employeeRoute from "./routes/employeeRoute.js";
import employeeDocumentRoute from "./routes/employeeDocumentRoute.js";
import { trailerTrackingRoute } from "./routes/trailerTrackingRoute.js";
import companyDocumentRoute from "./routes/companyDocumentRoute.js";
import { chatRoute, driverChatRoute } from "./routes/chatRoute.js";
import { aiChatRoute } from "./routes/aiChatRoute.js";
import violationRoute from "./routes/driverViolationRoute.js";
import { swaggerUi, specs } from "./swagger/swagger.js";
import { fileUploadErrorHandler } from "./middleware/fileUploadErrorHandler.js";
import { createPaymentSession } from "./controllers/user/paymentController.js";
import { handleLogout, handleAutoLogout } from "./controllers/hr/logoutController.js";;
import { handleStripeWebhook } from "./controllers/user/paymentWebhook.js";
import { handleSubscriptionWebhook } from "./controllers/subscriptionWebhook.js";
import crypto from "crypto";
import { authMiddleware } from "./middleware/authMiddleware.js";
import { getCurrentUserProfile, updateCurrentUserProfile, changePassword } from "./controllers/user/userController.js";
import { sendPasswordResetEmail, sendContactInquiryEmail } from "./services/emailService.js";
import { apiLogger } from "./middleware/apiLogger.js";

// (async () => {
//   await syncVehiclesFromGeotab();
// })();

export const app = express();

// ✅ Gzip all API responses — must come before routes, after webhooks
app.use(compression());

// ✅ Webhook routes (must be before 404 handler)
app.post("/api/v1/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);
app.post("/api/v1/webhook/subscription", express.raw({ type: "application/json" }), handleSubscriptionWebhook);


// ✅ Body parsers
app.use(
  express.json({
    limit: "100mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// ✅ Security middleware
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: false, // Disable for development
    crossOriginOpenerPolicy: false, // Disable for development
    crossOriginResourcePolicy: false, // Disable for development
  })
);
// Configure CORS with proper headers for static files and socket.io
app.use(cors({
  origin: "*", // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', '*'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar']
}));

// Serve static files with comprehensive CORS headers
app.use("/uploads", (req, res, next) => {
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Set Cross-Origin Resource Policy headers
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // Allow embedding uploads in iframes during development (for doc viewers)
  if (process.env.NODE_ENV !== 'production') {
    res.header('X-Frame-Options', 'ALLOWALL');
    // Modern replacement for X-Frame-Options; allow any ancestor in dev
    res.header('Content-Security-Policy', "frame-ancestors *");
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  next();
}, express.static("uploads"));
app.use(hpp()); // Prevent HTTP Parameter Pollution

// ✅ API Request Logger - Log all API calls
app.use(apiLogger);
// app.use(xss()); // ❌ Deprecated, do not use
// app.use(mongoSanitize()); // Prevent NoSQL injection

app.get("/api/v1/health", (req, res) => {
  res.json({
    status: "ok",
    message: "health is fine!",
    timestamp: new Date().toISOString(),
    server: "BlackRiver Backend"
  });
});

// Public config endpoint (no auth required)
app.get("/api/v1/config", getPublicConfig);

// Public contact form endpoint (no auth required)
app.post("/api/v1/public/contact", async (req, res) => {
  try {
    const { name, email, company, fleetSize, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: "Name, email, and message are required." });
    }
    const result = await sendContactInquiryEmail({ name, email, company, fleetSize, message });
    if (!result.success) {
      return res.status(500).json({ success: false, message: "Failed to send email. Please try again later." });
    }
    res.json({ success: true, message: "Your message has been sent. We'll be in touch shortly." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Google Places API proxy endpoints (no auth required for address search)
app.get("/api/v1/places/autocomplete", getPlaceAutocomplete);
app.get("/api/v1/places/textsearch", getPlaceTextSearch);
app.get("/api/v1/places/details", getPlaceDetails);

// Test route for image access
app.get("/api/v1/test-image/:filename", (req, res) => {
  const filename = req.params.filename;
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(path.join(process.cwd(), 'uploads', 'images', filename));
});

app.post("/api/v1/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Search user in all collections OR in one "users" collection with role field
    const user = await User.findOne({ email }); // Assuming all users in one collection
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Block login for roles that should not use the main login page
    // These roles (driver, contact, customer, reporter) should use their specific login endpoints
    const restrictedRoles = ['driver', 'contact', 'customer', 'reporter'];
    if (restrictedRoles.includes(user.role)) {
      console.log('❌ Universal login blocked - restricted role:', {
        userId: user._id,
        email: user.email,
        role: user.role
      });
      return res.status(403).json({
        success: false,
        message: `This login page is not available for ${user.role} accounts. Please use the appropriate login portal.`
      });
    }

    // Block login if account is not active
    if (user.status !== 'active') {
      console.log('❌ Universal login blocked - inactive account:', {
        userId: user._id,
        email: user.email,
        status: user.status,
        role: user.role
      });
      return res.status(403).json({
        success: false,
        message: "Your account is not active. Please contact administrator."
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Incorrect password" });

    // Check admin subscription/trial access for all users (except superadmin)
    let subscriptionStatus = null;
    if (user.role !== 'superadmin') {
      const { checkUserAccess } = await import('./utils/adminAccessUtils.js');
      const accessCheck = await checkUserAccess(user._id);

      subscriptionStatus = {
        accessLevel: accessCheck.accessLevel || (accessCheck.hasAccess ? 'full' : 'none'),
        reason: accessCheck.reason,
        message: accessCheck.message
      };

      if (!accessCheck.hasAccess && accessCheck.accessLevel !== 'limited') {
        console.log('❌ Universal login blocked - admin subscription/trial issue:', {
          userId: user._id,
          email: user.email,
          role: user.role,
          reason: accessCheck.reason,
          message: accessCheck.message
        });
        return res.status(403).json({
          success: false,
          message: accessCheck.message || "Access denied. Please contact administrator."
        });
      }
    }

    // Fetch company information if available (for non-superadmin users)
    let company = null;
    if (user.role !== 'superadmin' && user.company) {
      try {
        const companyDoc = await CompanySettings.findById(user.company).lean();
        if (companyDoc) {
          company = {
            _id: companyDoc._id,
            companyName: companyDoc.companyName,
            companyCode: companyDoc.companyCode,
            address: companyDoc.address,
            contactEmail: companyDoc.contactEmail,
            contactPhone: companyDoc.contactPhone,
          };
        }
      } catch (companyErr) {
        console.error('⚠️ Unable to fetch company info for user during login:', companyErr);
      }
    }

    // Update document statuses for admin/hr/superadmin users
    if (['admin', 'hr', 'superadmin'].includes(user.role)) {
      try {
        console.log('🔄 Updating employee document statuses on login...');
        await updateDocumentStatuses();
      } catch (error) {
        console.error('❌ Error updating employee document statuses on login:', error);
        // Don't fail login if document update fails
      }

    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "12d" }
    );

    // Record login for attendance tracking (if applicable)
    try {
      const { recordLogin } = await import('./services/attendanceTrackingService.js');
      const companyId = user.company ? (typeof user.company === 'object' ? user.company._id : user.company) : null;
      await recordLogin(user._id, companyId);
    } catch (attendanceError) {
      console.error('Error recording login for attendance:', attendanceError);
      // Don't fail login if attendance tracking fails
    }

    res.json({
      success: true,
      message: "login success",
      token: token,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        subscriptionStatus,
        company
      }
    });
  } catch (error) {
    res.json({ success: false, message: error.message })
  }
});

// ✅ Current User Profile Routes (for all authenticated users)
app.get("/api/v1/auth/me", authMiddleware, getCurrentUserProfile);
app.put("/api/v1/auth/me", authMiddleware, updateCurrentUserProfile);
app.put("/api/v1/auth/change-password", authMiddleware, changePassword);

// ✅ Logout Route (for attendance tracking)
app.post("/api/v1/auth/logout", authMiddleware, handleLogout);
app.post("/api/v1/auth/auto-logout", authMiddleware, handleAutoLogout);

// ✅ Forgot Password — generates a hashed reset token and emails a secure link
app.post("/api/v1/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: "Email is required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always respond the same way — never reveal whether the email exists
    if (!user) {
      return res.json({ success: true, message: "If that email is registered, a reset link has been sent." });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password/${rawToken}`;

    const emailResult = await sendPasswordResetEmail({ userEmail: user.email, userName: user.name, resetUrl });

    if (!emailResult.success) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return res.json({ success: false, message: "Failed to send reset email. Please try again." });
    }

    res.json({ success: true, message: "If that email is registered, a reset link has been sent." });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ✅ Reset Password — validates token, hashes new password, clears token
app.post("/api/v1/auth/reset-password/:token", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.json({ success: false, message: "Password must be at least 8 characters." });
    }

    const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.json({ success: false, message: "This reset link is invalid or has expired. Please request a new one." });
    }

    user.password = await bcrypt.hash(password, 12);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: "Password updated successfully. You can now sign in with your new password." });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ✅ Accept Employee Invite — validates token, sets password, activates account
app.post("/api/v1/auth/accept-invite/:token", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.json({ success: false, message: "Password must be at least 8 characters." });
    }

    const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.json({ success: false, message: "This invite link is invalid or has expired. Please ask your administrator to resend it." });
    }

    user.password = await bcrypt.hash(password, 12);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.status = 'active';
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: "Password set successfully. You can now sign in." });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ✅ Swagger Documentation
app.use('/api/v1/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "BlackRiver Fleet Management API"
}));

// ✅ Routes
app.use("/api/v1/superadmin", superAdminRoute);
app.use("/api/v1/admin", adminRoute);
app.use("/api/v1/driver", driverRoute);
app.use('/api/v1/dispatcher', dispatcherRoute)
app.use('/api/v1/hr', hrRoute)
app.use('/api/v1/health-safety', healthSafetyRoute)
app.use('/api/v1/compliance', complianceRoute)
app.use('/api/v1/employee', employeeRoute)
app.use('/api/v1/employee-documents', employeeDocumentRoute)
app.use('/api/v1/trailer-tracking', trailerTrackingRoute)
app.use('/api/v1/company-documents', companyDocumentRoute)
app.use('/api/v1/chat', chatRoute)
app.use('/api/v1/driver/chat', driverChatRoute)
app.use('/api/v1/ai', aiChatRoute)
app.use('/api/v1/violations', violationRoute)

// ✅ Logs endpoint (for mobile app client-side logging)
import { createLog } from './controllers/logController.js';
app.post('/api/v1/logs', createLog);

// ✅ Public routes for customers (no authentication required)
app.get('/api/public/invoice/:id', async (req, res) => {
  try {
    console.log('🔍 Public invoice route called with ID:', req.params.id);
    const { Invoice } = await import('./models/hr/invoiceModel.js');

    console.log('📡 Searching for invoice in database...');
    const invoice = await Invoice.findById(req.params.id)
      .populate('company', 'companyName address contactEmail contactPhone taxNumber logoUrl')
      .populate({
        path: 'tripId',
        select: 'tripNumber status startLocation endLocation route plannedStartDate plannedEndDate actualStartDate actualEndDate notes',
        populate: [
          {
            path: 'truck',
            select: 'unitNo licensePlate makeModel internalId unitType'
          },
          {
            path: 'trailer',
            select: 'unitNo licensePlate makeModel unitType type capacity'
          },
          {
            path: 'orders',
            select: 'orderNumber customerOrderNo pickupLocation deliveryLocation commodity weight weightUnit orderType equipment noOfPackages noOfPackagesType temperature additionalInfo dimensions',
            populate: {
              path: 'customer',
              select: 'name email phone company'
            }
          }
        ]
      });
    console.log('📡 Database query result:', invoice ? 'Found' : 'Not found');

    if (!invoice) {
      console.log('❌ Invoice not found in database');
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    // Generate signed URL for company logo if it exists
    const invoiceObj = invoice.toObject();
    if (invoiceObj.company && invoiceObj.company.logoUrl) {
      try {
        const logoUrl = invoiceObj.company.logoUrl;
        // Check if it's an S3 URL
        if (logoUrl && (logoUrl.includes('s3.amazonaws.com') || logoUrl.includes('.s3.'))) {
          const { GetObjectCommand } = await import("@aws-sdk/client-s3");
          const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
          const { s3 } = await import("./config/awsConfig.js");

          const cleanUrl = logoUrl.split('?')[0].split('#')[0];
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
            ResponseContentType: logoUrl.toLowerCase().includes('.png') ? 'image/png' :
              logoUrl.toLowerCase().includes('.gif') ? 'image/gif' :
                logoUrl.toLowerCase().includes('.webp') ? 'image/webp' :
                  'image/jpeg',
          });

          invoiceObj.company.logoUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        }
      } catch (error) {
        console.error('Error generating signed URL for company logo:', error);
        // Keep the original URL if signing fails
      }
    }

    console.log('✅ Invoice found, returning data');
    res.json({ success: true, data: invoiceObj });
  } catch (error) {
    console.error('❌ Error in public invoice route:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test endpoint to verify backend is working
app.get('/api/public/test', (req, res) => {
  res.json({ success: true, message: "Backend is working!" });
});

// Test webhook endpoint
app.post('/api/v1/webhook-test', (req, res) => {
  console.log('🔍 Webhook test endpoint called');
  console.log('📡 Request body:', req.body);
  console.log('📡 Request headers:', req.headers);
  res.json({ success: true, message: "Webhook test successful!" });
});

// // ✅ Webhook routes (must be before 404 handler)
// app.post("/api/v1/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);
// app.post("/api/v1/webhook/subscription", express.raw({ type: "application/json" }), handleSubscriptionWebhook);

// ✅ Logging
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    skip: (req, res) => res.statusCode === 304 || req.path === "/health",
  })
);

// ✅ 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// ✅ Global file upload error handler
app.use(fileUploadErrorHandler);

// ✅ Generic fallback error handler
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({
    success: false,
    message: "Something went wrong, please try again later",
  });
});
// every 30s is safer than 5s (to avoid Geotab API rate limits)
// setInterval(syncVehiclesFromGeotab, 30_000);

// ✅ Schedule document status update jobs
runDocumentStatusUpdateJob();

// ✅ Schedule daily odometer update job (Samsara for vehicles, Termoking for trailers)
runDailyOdometerUpdateJob();

// ✅ Schedule vehicle upcoming services update job
runVehicleServiceUpdateJob();

// ✅ Schedule incoming maintenance check job
runIncomingMaintenanceCheckJob();

// ✅ Schedule maintenance order cleanup job (deletes records older than 2 years)
runMaintenanceOrderCleanupJob();

