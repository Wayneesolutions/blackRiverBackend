import jwt from "jsonwebtoken";
import { User } from "../models/driver/userModel.js";
import { hashPassword, comparePassword } from "../services/bcrypt.js"
import { getCoordinatesFromAddress } from "../services/googlemap.js";
import 'dotenv/config'
const JWT_SECRET = process.env.JWT_SECRET 
console.log(JWT_SECRET);

// ✅ Register Super Admin
export const registerSuperAdmin = async (req, res) => {
  try {
    const { name, email, password, address, country, city, state, policies, internalId } = req.body;

    // Validate required fields
    if (!name || !email || !password || !internalId) {
      return res
        .status(400)
        .json({ success: false, message: "Name, email, password, and internalId are required" });
    }

    // Check if email already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res
        .status(400)
        .json({ success: false, message: "Super Admin with this email already exists" });
    }

    // Check if internalId already exists
    const existingInternalId = await User.findOne({ internalId });
    if (existingInternalId) {
      return res
        .status(400)
        .json({ success: false, message: "Super Admin with this internalId already exists" });
    }

    const hashedPassword = await hashPassword(password);
    
    // Get coordinates if address is provided
    let latitude, longitude;
    if (address) {
      try {
        const coords = await getCoordinatesFromAddress(address);
        latitude = coords.latitude;
        longitude = coords.longitude;
      } catch (geoError) {
        console.error("Geocoding error:", geoError);
        // Continue without coordinates if geocoding fails
        latitude = null;
        longitude = null;
      }
    }

    const superAdmin = new User({
      name,
      email,
      password: hashedPassword,
      country: country || undefined,
      city: city || undefined,
      state: state || undefined,
      location: address ? { address, longitude, latitude } : undefined,
      role: 'superadmin',
      status: 'active',
      policies: policies || undefined,
      internalId,
      joinDate: new Date()
    });

    await superAdmin.save();

    res
      .status(201)
      .json({ success: true, message: "Super Admin created successfully" });
  } catch (err) {
    console.error("Super Admin Registration Error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// ✅ Login Super Admin
export const loginSuperAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const superAdmin = await User.findOne({ email });
    if (!superAdmin) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Verify user is actually a superadmin
    if (superAdmin.role !== 'superadmin') {
      return res
        .status(403)
        .json({ success: false, message: "Access denied. Super Admin access required." });
    }

    // Check if user is active (must be before password validation)
    if (superAdmin.status !== 'active') {
      console.log('❌ Login attempt blocked - inactive account:', {
        userId: superAdmin._id,
        email: superAdmin.email,
        status: superAdmin.status,
        role: superAdmin.role
      });
      return res
        .status(403)
        .json({ success: false, message: "Your account is not active. Please contact administrator." });
    }

    const isMatch = await comparePassword(password, superAdmin.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: superAdmin._id, role: superAdmin.role },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Record login for attendance tracking (if applicable - superadmin typically not tracked)
    try {
      const { recordLogin } = await import("../services/attendanceTrackingService.js");
      const companyId = superAdmin.company ? superAdmin.company.toString() : null;
      await recordLogin(superAdmin._id, companyId);
    } catch (attendanceError) {
      console.error('Error recording login for attendance:', attendanceError);
      // Don't fail login if attendance tracking fails
    }

    res.json({
      success: true,
      message: "Login successful",
      data: {
        id: superAdmin._id,
        name: superAdmin.name,
        email: superAdmin.email,
        role: superAdmin.role,
        status: superAdmin.status,
        token,
      },
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};
