import { Plan } from "../models/planModel.js";

// Truck tiers must be whole numbers, ascending and back-to-back (1–10, 11–20, 21–35 …)
// so every truck count maps to exactly one price. Returns an error message or null.
export const validateTruckTiers = (tiers) => {
  if (tiers === undefined || tiers === null) return null;
  if (!Array.isArray(tiers)) return "Truck tiers must be a list";
  if (tiers.length === 0) return "Add at least one truck tier";
  if (tiers.length > 20) return "A plan can have at most 20 truck tiers";
  const sorted = [...tiers].sort((a, b) => Number(a.minTrucks) - Number(b.minTrucks));
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const min = Number(t.minTrucks), max = Number(t.maxTrucks), price = Number(t.monthlyPrice);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1) return `Tier ${i + 1}: truck counts must be whole numbers from 1`;
    if (max < min) return `Tier ${i + 1}: "to" trucks must be at least "from" trucks`;
    if (isNaN(price) || price < 0) return `Tier ${i + 1}: price must be 0 or more`;
    if (i === 0 && min !== 1) return "The first tier must start at 1 truck";
    if (i > 0 && min !== Number(sorted[i - 1].maxTrucks) + 1) {
      return `Tier ${i + 1} must start at ${Number(sorted[i - 1].maxTrucks) + 1} trucks (right after the previous tier)`;
    }
  }
  return null;
};

const sortTiersIn = (monthly) => {
  if (monthly?.truckPricing?.tiers) {
    monthly.truckPricing.tiers = [...monthly.truckPricing.tiers]
      .map(t => ({ ...t, minTrucks: Number(t.minTrucks), maxTrucks: Number(t.maxTrucks), monthlyPrice: Number(t.monthlyPrice) }))
      .sort((a, b) => a.minTrucks - b.minTrucks);
  }
  return monthly;
};

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

    if (planType === 'monthly') {
      const tierError = validateTruckTiers(monthly?.truckPricing?.tiers);
      if (tierError) return res.status(400).json({ success: false, message: tierError });
      sortTiersIn(monthly);
    }

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

    if (monthly) {
      const tierError = validateTruckTiers(monthly?.truckPricing?.tiers);
      if (tierError) return res.status(400).json({ success: false, message: tierError });
      sortTiersIn(monthly);
    }

    const trimmedName = typeof planName === 'string' ? planName.trim() : planName;
    if (trimmedName && trimmedName !== plan.planName) {
      const duplicate = await Plan.findOne({
        _id: { $ne: id },
        planName: trimmedName,
        planType: planType || plan.planType
      }).select('_id').lean();
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "Plan with this name and type already exists"
        });
      }
    }

    // If this is set as default, unset other defaults
    if (isDefault && !plan.isDefault) {
      await Plan.updateMany({ isDefault: true }, { isDefault: false });
    }

    const updateData = {};
    if (trimmedName) updateData.planName = trimmedName;
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

