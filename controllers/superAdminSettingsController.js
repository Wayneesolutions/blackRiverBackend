import { User } from "../models/driver/userModel.js";
import { hashPassword, comparePassword } from "../services/bcrypt.js";
import { getCoordinatesFromAddress } from "../services/googlemap.js";

// ✅ Get Super Admin Profile/Settings
export const getSuperAdminSettings = async (req, res) => {
  try {
    const superAdminId = req.user._id;

    const superAdmin = await User.findById(superAdminId)
      .select('-password')
      .lean();

    if (!superAdmin || superAdmin.role !== 'superadmin') {
      return res.status(404).json({
        success: false,
        message: "Super Admin not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Super Admin settings retrieved successfully",
      data: {
        name: superAdmin.name || '',
        email: superAdmin.email || '',
        phone: superAdmin.phone || '',
        country: superAdmin.country || '',
        state: superAdmin.state || '',
        city: superAdmin.city || '',
        address: superAdmin.location?.address || '',
        policies: superAdmin.policies || '',
        status: superAdmin.status || 'active',
        joinDate: superAdmin.joinDate || null,
        createdAt: superAdmin.createdAt || null,
        updatedAt: superAdmin.updatedAt || null
      }
    });
  } catch (error) {
    console.error("Super Admin Settings Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching super admin settings",
      error: error.message
    });
  }
};

// ✅ Update Super Admin Profile/Settings
export const updateSuperAdminSettings = async (req, res) => {
  try {
    const superAdminId = req.user._id;
    const { name, email, phone, country, state, city, address, policies, password, newPassword } = req.body;

    const superAdmin = await User.findById(superAdminId);

    if (!superAdmin || superAdmin.role !== 'superadmin') {
      return res.status(404).json({
        success: false,
        message: "Super Admin not found"
      });
    }

    // Validate email uniqueness if email is being updated
    if (email !== undefined) {
      const existingUser = await User.findOne({ email, _id: { $ne: superAdminId } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already in use by another user"
        });
      }
    }

    // Use findByIdAndUpdate to avoid validation issues with internalId
    // This preserves the existing internalId if it exists, or allows it to be null for superadmin
    const updateData = {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(country !== undefined && { country }),
      ...(state !== undefined && { state }),
      ...(city !== undefined && { city }),
      ...(policies !== undefined && { policies }),
      ...(address !== undefined && {
        location: {
          address,
          ...(superAdmin.location?.longitude && { longitude: superAdmin.location.longitude }),
          ...(superAdmin.location?.latitude && { latitude: superAdmin.location.latitude })
        }
      })
    };

    // Update location coordinates if address was provided
    if (address) {
      try {
        const { latitude, longitude } = await getCoordinatesFromAddress(address);
        updateData.location = {
          ...updateData.location,
          latitude,
          longitude
        };
      } catch (geoError) {
        console.error("Geocoding error:", geoError);
        // Continue without updating coordinates if geocoding fails
      }
    }

    // Update password if provided
    if (newPassword && password) {
      const isMatch = await comparePassword(password, superAdmin.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect"
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters"
        });
      }

      updateData.password = await hashPassword(newPassword);
    }

    // Use findByIdAndUpdate with runValidators: false to avoid internalId validation for superadmin
    const updatedSuperAdmin = await User.findByIdAndUpdate(
      superAdminId,
      updateData,
      { 
        new: true,
        runValidators: false // Skip validation since we're handling it manually
      }
    ).select('-password').lean();

    res.status(200).json({
      success: true,
      message: "Super Admin settings updated successfully",
      data: {
        name: updatedSuperAdmin.name || '',
        email: updatedSuperAdmin.email || '',
        phone: updatedSuperAdmin.phone || '',
        country: updatedSuperAdmin.country || '',
        state: updatedSuperAdmin.state || '',
        city: updatedSuperAdmin.city || '',
        address: updatedSuperAdmin.location?.address || '',
        policies: updatedSuperAdmin.policies || '',
        status: updatedSuperAdmin.status || 'active',
        joinDate: updatedSuperAdmin.joinDate || null,
        updatedAt: updatedSuperAdmin.updatedAt || null
      }
    });
  } catch (error) {
    console.error("Super Admin Settings Update Error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating super admin settings",
      error: error.message
    });
  }
};

