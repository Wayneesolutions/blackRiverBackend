import { Plan } from "../models/planModel.js";

// ✅ Create Plan
export const createPlan = async (req, res) => {
  try {
    const {
      planName,
      planType,
      description,
      lifetime,
      monthly,
      features,
      allowedRoles,
      blockedRoles,
      status = 'active',
      isDefault = false
    } = req.body;

    // If this is set as default, unset other defaults
    if (isDefault) {
      await Plan.updateMany({ isDefault: true }, { isDefault: false });
    }

    if (!['lifetime', 'monthly'].includes(planType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid planType"
      });
    }
    if (!['lifetime', 'monthly'].includes(planType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid planType"
      });
    };

    const existing = await Plan.findOne({ planName, planType });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Plan with this name and type already exists"
      });
    }

    const plan = new Plan({
      planName,
      planType,
      description,
      lifetime: lifetime || {},
      monthly: monthly || {},
      features: features || [],
      allowedRoles: allowedRoles || undefined,
      blockedRoles: blockedRoles || [],
      status,
      isDefault
    });

    await plan.save();

    // Convert to plain object and ensure fields are included
    const planData = plan.toObject();
    const planResponse = {
      ...planData,
      allowedRoles: planData.allowedRoles || undefined,
      blockedRoles: planData.blockedRoles || []
    };

    res.status(201).json({
      success: true,
      message: "Plan created successfully",
      data: planResponse
    });
  } catch (err) {
    console.error('Error creating plan:', err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Get All Plans
export const getAllPlans = async (req, res) => {
  try {
    const { status, planType } = req.query;

    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (planType && planType !== 'all') {
      filter.planType = planType;
    }

    const plans = await Plan.find(filter)
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance

    // Ensure allowedRoles and blockedRoles are always present in response
    const plansWithFields = plans.map(plan => ({
      ...plan,
      allowedRoles: plan.allowedRoles || undefined, // Explicitly include, even if undefined
      blockedRoles: plan.blockedRoles || []
    }));

    res.json({
      success: true,
      message: "Plans retrieved successfully",
      data: plansWithFields
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Get Plan by ID
export const getPlanById = async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await Plan.findById(id).lean();
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found"
      });
    }

    // Ensure allowedRoles and blockedRoles are always present in response
    const planWithFields = {
      ...plan,
      allowedRoles: plan.allowedRoles || undefined,
      blockedRoles: plan.blockedRoles || []
    };

    res.json({
      success: true,
      message: "Plan retrieved successfully",
      data: planWithFields
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Update Plan
export const updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      planName,
      planType,
      description,
      lifetime,
      monthly,
      features,
      allowedRoles,
      blockedRoles,
      status,
      isDefault
    } = req.body;

    const plan = await Plan.findById(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found"
      });
    }

    // If this is set as default, unset other defaults
    if (isDefault && !plan.isDefault) {
      await Plan.updateMany({ isDefault: true }, { isDefault: false });
    }

    const updateData = {};
    if (planName) updateData.planName = planName;
    if (planType) updateData.planType = planType;
    if (description !== undefined) updateData.description = description;
    if (lifetime) updateData.lifetime = lifetime;
    if (monthly) updateData.monthly = monthly;
    if (features !== undefined) updateData.features = features;
    if (allowedRoles !== undefined) updateData.allowedRoles = allowedRoles;
    if (blockedRoles !== undefined) updateData.blockedRoles = blockedRoles;
    if (status) updateData.status = status;
    if (isDefault !== undefined) updateData.isDefault = isDefault;

    const updatedPlan = await Plan.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    ).lean();

    // Ensure allowedRoles and blockedRoles are always present in response
    const planResponse = {
      ...updatedPlan,
      allowedRoles: updatedPlan.allowedRoles || undefined,
      blockedRoles: updatedPlan.blockedRoles || []
    };

    res.json({
      success: true,
      message: "Plan updated successfully",
      data: planResponse
    });
  } catch (err) {
    console.error('Error updating plan:', err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// ✅ Delete Plan
export const deletePlan = async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await Plan.findByIdAndDelete(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found"
      });
    }

    res.json({
      success: true,
      message: "Plan deleted successfully"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

