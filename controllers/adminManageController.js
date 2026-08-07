import { User } from "../models/driver/userModel.js";
import { Plan } from "../models/planModel.js";
import { Subscription } from "../models/subscriptionModel.js";
import { hashPassword } from "../services/bcrypt.js";
import { checkRoleCreationPermission, getAllowedRoles } from "../utils/subscriptionPermissions.js";
import { startTrial, resolveDefaultTrialDays } from "../utils/trialUtils.js";
import { calculateTruckPricing } from "./subscriptionController.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// Helper function to generate signed URL for S3 images
const generateSignedUrl = async (url) => {
  if (!url || (!url.includes('s3.amazonaws.com') && !url.includes('.s3.'))) {
    return url; // Return as-is if not an S3 URL
  }

  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { s3 } = await import("../config/awsConfig.js");
    
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


// Public registration endpoint (no auth required)
export const registerAdmin = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password,
      phone,
      country,
      state,
      city,
      address,
      companyName,
      policies
    } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Name, email, and password are required" 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide a valid email address" 
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: "Password must be at least 8 characters long" 
      });
    }

    // Check if admin already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: "An account with this email already exists" 
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Get coordinates from address if provided
    let coordinates = { latitude: null, longitude: null };
    if (address) {
      try {
        const { getCoordinatesFromAddress } = await import("../services/googlemap.js");
        coordinates = await getCoordinatesFromAddress(address);
      } catch (geoError) {
        console.error("Geocoding error:", geoError);
        // Continue without coordinates if geocoding fails
      }
    }

    // Generate internalId
    const internalId = `ADMIN-${Date.now()}`;

    // Create new admin user
    const adminData = {
      name,
      email,
      phone: phone || undefined,
      country: country || undefined,
      state: state || undefined,
      city: city || undefined,
      role: 'admin', // Always create as admin
      password: hashedPassword,
      status: 'active',
      policies: policies || undefined,
      joinDate: new Date(),
      internalId,
      location: address ? {
        address,
        longitude: coordinates.longitude,
        latitude: coordinates.latitude
      } : undefined
    };

    const admin = new User(adminData);
    await admin.save();

    // Start the Super Admin's configured default free trial for this new admin.
    // Public signup has no field for this — always uses the global default (falls back to 30 days).
    let trialDaysUsed = 30;
    try {
      trialDaysUsed = await resolveDefaultTrialDays();
      await startTrial(admin._id, trialDaysUsed);
      console.log(`✅ Trial started for new admin: ${admin.email}`);
    } catch (trialError) {
      console.error('Error starting trial for new admin:', trialError);
      // Don't fail admin creation if trial start fails
    }

    // Generate JWT token for immediate login
    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({
      success: true,
      message: `Admin account created successfully. Your ${trialDaysUsed}-day free trial has started!`,
      token: token,
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        status: admin.status,
        internalId: admin.internalId,
        joinDate: admin.joinDate
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred during registration. Please try again."
    });
  }
};

// Protected endpoint for creating admin (requires auth)
export const createAdmin = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password,
      phone,
      country,
      state,
      city,
      address,
      internalId,
      company,
      status = 'active',
      policies,
      role = 'admin', // Default role is 'admin', but can create other roles if permitted
      trialDays // Optional: Super Admin can set a custom trial length for this specific customer
    } = req.body;

    // Get the requesting user (admin creating another user)
    const requestingAdminId = req.user._id;
    const requestingUser = await User.findById(requestingAdminId);

    // If requesting user is not superadmin, check subscription permissions
    if (requestingUser.role !== 'superadmin') {
      const permissionCheck = await checkRoleCreationPermission(requestingAdminId, role);
      
      if (!permissionCheck.allowed) {
        return res.status(403).json({
          success: false,
          message: permissionCheck.reason || "You don't have permission to create users with this role"
        });
      }
    }

    // Check if admin already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: "Admin with this email already exists" });
    }

    // Check if internalId already exists
    if (internalId) {
      const existingId = await User.findOne({ internalId });
      if (existingId) {
        return res.status(400).json({ success: false, message: "Internal ID already exists" });
      }
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Get coordinates from address if provided
    let coordinates = { latitude: null, longitude: null };
    if (address) {
      const { getCoordinatesFromAddress } = await import("../services/googlemap.js");
      coordinates = await getCoordinatesFromAddress(address);
    }

    // Create new admin/user
    const adminData = {
      name,
      email,
      phone,
      country,
      state,
      city,
      role: role, // Use the role from request (validated above)
      password: hashedPassword,
      status,
      policies,
      joinDate: new Date(),
      internalId: internalId || `${role.toUpperCase()}-${Date.now()}`,
      location: {
        address,
        longitude: coordinates.longitude,
        latitude: coordinates.latitude
      }
    };

    // Add company reference if provided
    if (company) {
      adminData.company = company;
    }

    const admin = new User(adminData);
    await admin.save();

    // Start a free trial for admin role (not superadmin).
    // trialDays, if provided by the Super Admin, overrides the configured global default.
    if (role === 'admin') {
      try {
        await startTrial(admin._id, trialDays);
        console.log(`✅ Trial started for new admin: ${admin.email}`);
      } catch (trialError) {
        console.error('Error starting trial for new admin:', trialError);
        // Don't fail admin creation if trial start fails
      }
    }

    // Populate company data for response
    await admin.populate('company', 'companyName companyCode address contactEmail contactPhone logoUrl');

    // Generate signed URL for company logo if it exists
    const adminObj = admin.toObject();
    if (adminObj.company && adminObj.company.logoUrl) {
      try {
        adminObj.company.logoUrl = await generateSignedUrl(adminObj.company.logoUrl);
      } catch (error) {
        console.error('Error generating signed URL for company logo:', error);
        // Keep the original URL if signing fails
      }
    }

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      data: {
        id: adminObj._id,
        name: adminObj.name,
        email: adminObj.email,
        phone: adminObj.phone,
        role: adminObj.role,
        status: adminObj.status,
        internalId: adminObj.internalId,
        company: adminObj.company,
        joinDate: adminObj.joinDate
      },
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred. Please try again."
    });
  }
};

// Get allowed roles for admin
export const getAllowedRolesForAdmin = async (req, res) => {
  try {
    const adminId = req.user._id;
    const roles = await getAllowedRoles(adminId);
    res.json({ success: true, data: roles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get All Admins
export const getAllAdmins = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 100 } = req.query;
    
    // Build filter - only get users with role 'admin'
    const filter = { role: 'admin' };
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { internalId: { $regex: search, $options: 'i' } },
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get admins with populated company data
    const admins = await User.find(filter)
      .populate('company', 'companyName companyCode address contactEmail contactPhone logoUrl')
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get current active/pending-paid subscription (with plan) for each admin
    const adminIds = admins.map((admin) => admin._id);
    const subscriptions = await Subscription.find({
      admin: { $in: adminIds },
      $or: [
        { status: 'active' },
        { status: 'pending', paymentStatus: 'paid' }
      ]
    })
      .populate('plan', 'planName planType status')
      .sort({ createdAt: -1 });

    const subscriptionByAdmin = {};
    for (const sub of subscriptions) {
      const key = sub.admin.toString();
      // Keep the most recent one only (already sorted desc by createdAt)
      if (!subscriptionByAdmin[key]) {
        subscriptionByAdmin[key] = sub;
      }
    }

    // Generate signed URLs for company logos
    const adminsWithSignedUrls = await Promise.all(
      admins.map(async (admin) => {
        const adminObj = admin.toObject();

        // Generate signed URL for company logo if it exists
        if (adminObj.company && adminObj.company.logoUrl) {
          try {
            adminObj.company.logoUrl = await generateSignedUrl(adminObj.company.logoUrl);
          } catch (error) {
            console.error('Error generating signed URL for company logo:', error);
            // Keep the original URL if signing fails
          }
        }

        adminObj.currentSubscription = subscriptionByAdmin[admin._id.toString()] || null;

        return adminObj;
      })
    );

    const total = await User.countDocuments(filter);
    
    res.json({
      success: true,
      message: "Admin list retrieved successfully",
      data: adminsWithSignedUrls,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalAdmins: total,
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (err) {
    res.status(500).json({success:false, message: "Server error", error: err.message });
  }
};

// ✅ Update Admin
export const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      email, 
      phone,
      country,
      state,
      city,
      address,
      status,
      policies,
      company,
      password
    } = req.body;

    const admin = await User.findById(id);
    if (!admin) {
      return res.status(404).json({success:false, message: "Admin not found" });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== admin.email) {
      const emailExists = await User.findOne({ email, _id: { $ne: id } });
      if (emailExists) {
        return res.status(400).json({ 
          success: false, 
          message: "Email already exists for another user" 
        });
      }
    }

    // Get coordinates from address if provided and changed
    let coordinates = { latitude: null, longitude: null };
    if (address && address !== admin.location?.address) {
      try {
        const { getCoordinatesFromAddress } = await import("../services/googlemap.js");
        coordinates = await getCoordinatesFromAddress(address);
      } catch (geoError) {
        console.error("Geocoding error:", geoError);
        // Continue without coordinates if geocoding fails
      }
    } else if (admin.location) {
      coordinates = {
        latitude: admin.location.latitude,
        longitude: admin.location.longitude
      };
    }

    // Hash password if provided
    let hashedPassword = admin.password;
    if (password) {
      hashedPassword = await hashPassword(password);
    }

    // Prepare update data
    const updateData = {
      name,
      email,
      phone,
      country,
      state,
      city,
      status,
      policies,
      password: hashedPassword,
      location: {
        address: address || admin.location?.address,
        longitude: coordinates.longitude,
        latitude: coordinates.latitude
      }
    };

    // Add company if provided
    if (company) {
      updateData.company = company;
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Use updateOne to avoid full document validation issues
    await User.updateOne(
      { _id: id },
      { $set: updateData }
    );

    // Fetch updated admin with populated company
    const updatedAdmin = await User.findById(id)
      .populate('company', 'companyName companyCode address contactEmail contactPhone logoUrl')
      .select("-password");

    // Generate signed URL for company logo if it exists
    const adminObj = updatedAdmin.toObject();
    if (adminObj.company && adminObj.company.logoUrl) {
      try {
        adminObj.company.logoUrl = await generateSignedUrl(adminObj.company.logoUrl);
      } catch (error) {
        console.error('Error generating signed URL for company logo:', error);
        // Keep the original URL if signing fails
      }
    }

    res.json({
      success: true, 
      message: "Admin updated successfully", 
      data: adminObj 
    });
  } catch (err) {
    console.error('Error updating admin:', err);
    res.status(500).json({success:false, message: "Server error", error: err.message });
  }
};

// ✅ Delete Admin
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await User.findByIdAndDelete(id);
    if (!admin) return res.status(404).json({success:false, message: "Admin not found" });

    res.json({success:true, message: "Admin deleted successfully" });
  } catch (err) {
    res.status(500).json({success:false, message: "Server error", error: err.message });
  }
};

// ✅ Super Admin manually assigns a plan to a client (no Stripe payment collected)
export const assignPlanToAdmin = async (req, res) => {
  try {
    const { id } = req.params; // target admin (client) id
    const {
      planId,
      subscriptionType,
      truckCount,
      // Per-customer customization on top of the template plan — none of these
      // change the underlying Plan document, only this specific Subscription.
      customAmount,
      allowedRoles: overrideAllowedRoles,
      blockedRoles: overrideBlockedRoles
    } = req.body;

    if (!planId || !subscriptionType) {
      return res.status(400).json({
        success: false,
        message: "planId and subscriptionType are required"
      });
    }

    if (customAmount !== undefined && customAmount !== null && customAmount !== '' && (isNaN(Number(customAmount)) || Number(customAmount) < 0)) {
      return res.status(400).json({ success: false, message: "customAmount must be a non-negative number" });
    }

    const admin = await User.findById(id);
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ success: false, message: "Client account not found" });
    }

    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    // Determine amount/currency/maxTrucks per plan type + subscriptionType,
    // mirroring the pricing rules used by the self-service checkout flow.
    let amount = 0;
    let currency = 'CAD';
    let maxTrucks = 0;

    if (plan.planType === 'lifetime') {
      if (subscriptionType === 'one-time') {
        amount = plan.lifetime?.oneTime?.price || 0;
        currency = plan.lifetime?.oneTime?.currency || 'CAD';
      } else if (subscriptionType === '3-months') {
        amount = plan.lifetime?.installments?.threeMonths?.price || 0;
        currency = plan.lifetime?.installments?.threeMonths?.currency || 'CAD';
      } else if (subscriptionType === '6-months') {
        amount = plan.lifetime?.installments?.sixMonths?.price || 0;
        currency = plan.lifetime?.installments?.sixMonths?.currency || 'CAD';
      } else {
        return res.status(400).json({ success: false, message: "Invalid subscriptionType for a lifetime plan" });
      }
    } else if (plan.planType === 'monthly') {
      if (subscriptionType === 'full-app') {
        amount = plan.monthly?.fullApp?.price || 0;
        currency = plan.monthly?.fullApp?.currency || 'CAD';
      } else if (subscriptionType === 'without-hr') {
        amount = plan.monthly?.withoutHR?.price || 0;
        currency = plan.monthly?.withoutHR?.currency || 'CAD';
      } else if (['1-month', '6-months', '1-year'].includes(subscriptionType)) {
        if (!plan.monthly?.truckPricing?.tiers?.length) {
          return res.status(400).json({ success: false, message: "Truck pricing not configured for this plan" });
        }
        if (!truckCount || truckCount < 1) {
          return res.status(400).json({ success: false, message: "truckCount is required for this subscription type" });
        }
        const monthlyPrice = calculateTruckPricing(truckCount, plan.monthly.truckPricing);
        currency = plan.monthly.truckPricing.tiers[0]?.currency || 'CAD';
        maxTrucks = truckCount;
        if (subscriptionType === '1-month') amount = monthlyPrice;
        else if (subscriptionType === '6-months') amount = monthlyPrice * 6;
        else amount = monthlyPrice * 12;
      } else {
        return res.status(400).json({ success: false, message: "Invalid subscriptionType for a monthly plan" });
      }
    }

    // Per-customer price override — takes precedence over the computed template price
    if (customAmount !== undefined && customAmount !== null && customAmount !== '') {
      amount = Number(customAmount);
    }

    // Supersede any existing active/pending-paid subscription for this client
    await Subscription.updateMany(
      {
        admin: admin._id,
        $or: [{ status: 'active' }, { status: 'pending', paymentStatus: 'paid' }]
      },
      { $set: { status: 'cancelled', cancelledAt: new Date() } }
    );

    const now = new Date();
    let endDate = null;
    let nextBillingDate = null;

    if (subscriptionType === '1-month') {
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 1);
      nextBillingDate = endDate;
    } else if (subscriptionType === '6-months') {
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 6);
      const bonusDays = plan.monthly?.truckPricing?.sixMonthBonusDays ?? 15;
      endDate.setDate(endDate.getDate() + bonusDays);
      nextBillingDate = endDate;
    } else if (subscriptionType === '1-year') {
      const freeMonths = plan.monthly?.truckPricing?.annualFreeMonths ?? 1;
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 12 + freeMonths);
      nextBillingDate = new Date(now);
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 12);
    }
    // 'one-time', '3-months' (lifetime), 'full-app', 'without-hr' → no recurring end date

    const subscription = new Subscription({
      admin: admin._id,
      plan: plan._id,
      planType: plan.planType,
      subscriptionType,
      amount,
      currency,
      status: 'active',
      paymentStatus: 'paid',
      startDate: now,
      endDate,
      nextBillingDate,
      maxTrucks,
      planSnapshot: {
        planName: plan.planName,
        allowedRoles: overrideAllowedRoles !== undefined
          ? overrideAllowedRoles
          : (plan.allowedRoles ? [...plan.allowedRoles] : undefined),
        blockedRoles: overrideBlockedRoles !== undefined
          ? overrideBlockedRoles
          : (plan.blockedRoles ? [...plan.blockedRoles] : []),
        snapshotDate: now
      }
    });

    await subscription.save();
    await subscription.populate('plan', 'planName planType status');

    res.json({
      success: true,
      message: `Plan "${plan.planName}" assigned to ${admin.name} successfully`,
      data: subscription
    });
  } catch (err) {
    console.error('Error assigning plan to admin:', err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};
