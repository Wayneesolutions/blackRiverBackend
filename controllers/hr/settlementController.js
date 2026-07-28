import { Settlement, DeductionAddition, MilesTracking } from "../../models/hr/settlementModel.js";
import { User } from "../../models/driver/userModel.js";
import { Vehicle } from "../../models/driver/vehicleModel.js";
import { Trailer } from "../../models/driver/trailerModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import mongoose from "mongoose";

// Helper function to extract real ID from prefixed IDs (e.g., "custom-123" -> "123")
const extractRealId = (prefixedId) => {
  if (!prefixedId) return null;
  
  // Check if it's a prefixed ID
  if (prefixedId.startsWith("custom-")) {
    return prefixedId.replace("custom-", "");
  }
  if (prefixedId.startsWith("vehicle-")) {
    return prefixedId.replace("vehicle-", "");
  }
  if (prefixedId.startsWith("trailer-")) {
    return prefixedId.replace("trailer-", "");
  }
  
  // Return as-is if not prefixed
  return prefixedId;
};

// Helper function to check if an ID is a valid ObjectId
const isValidObjectId = (id) => {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id);
};

// Helper to check if ID is a prefixed FleetUnit ID
const isPrefixedFleetUnitId = (id) => {
  if (!id) return false;
  return id.startsWith("custom-") || id.startsWith("vehicle-") || id.startsWith("trailer-");
};

// Helper function to generate settlement ID
const generateSettlementId = async (companyId) => {
  const year = new Date().getFullYear();
  const query = { 
    settlementId: new RegExp(`^STL-${year}-`)
  };
  
  // Filter by company if provided (for multi-tenant support)
  if (companyId) {
    query.company = companyId;
  }
  
  const count = await Settlement.countDocuments(query);
  const sequence = String(count + 1).padStart(3, '0');
  return `STL-${year}-${sequence}`;
};

// ==================== SETTLEMENTS ====================

// Create Settlement
export const createSettlement = async (req, res) => {
  try {
    const { driver, payPeriod, grossPay, deductions = 0, additions = 0, status = 'Pending', paymentMethod, paymentReference, notes, appliedDeductions, milesRecords } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    // Validate driver exists
    const driverUser = await User.findById(driver);
    if (!driverUser) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    // Auto-compute grossPay from miles if caller doesn't provide it (or sends 0)
    let computedGrossPay = Number(grossPay) || 0;
    let computedTotalMiles = 0;
    let computedRatePerMile = 0;

    if ((!grossPay || Number(grossPay) === 0) && payPeriod?.startDate && payPeriod?.endDate) {
      // Pull miles records for this driver in the pay period
      const periodMiles = await MilesTracking.find({
        driver,
        date: {
          $gte: new Date(payPeriod.startDate),
          $lte: new Date(payPeriod.endDate)
        }
      }).lean();

      computedTotalMiles = periodMiles.reduce((sum, r) => sum + (r.totalMiles || 0), 0);

      // Get rate from driver profile (prefer salaryPerMile, fall back to mileRate)
      const rate = driverUser.details?.salaryPerMile || driverUser.details?.mileRate || 0;
      computedRatePerMile = Number(rate);

      if (computedTotalMiles > 0 && computedRatePerMile > 0) {
        computedGrossPay = parseFloat((computedTotalMiles * computedRatePerMile).toFixed(2));
      }
    }

    // Calculate net pay
    const netPay = computedGrossPay + Number(additions) - Number(deductions);

    // Generate settlement ID with retry logic for duplicate key errors
    let settlementId = await generateSettlementId(companyId);
    let maxRetries = 5;
    let retryCount = 0;
    let settlement;

    while (retryCount < maxRetries) {
      try {
        settlement = new Settlement({
          settlementId,
          driver,
          payPeriod: {
            startDate: new Date(payPeriod.startDate),
            endDate: new Date(payPeriod.endDate)
          },
          grossPay: computedGrossPay,
          totalMiles: computedTotalMiles,
          ratePerMile: computedRatePerMile,
          deductions: Number(deductions),
          additions: Number(additions),
          netPay,
          status,
          paymentMethod,
          paymentReference,
          notes,
          appliedDeductions: appliedDeductions || [],
          milesRecords: milesRecords || [],
          company: companyId,
          createdBy: req.user._id
        });

        await settlement.save();
        break; // Success, exit retry loop
      } catch (saveError) {
        // Check if it's a duplicate key error for settlementId
        if (saveError.code === 11000 && saveError.keyPattern && saveError.keyPattern.settlementId) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to generate unique settlement ID after ${maxRetries} attempts. Please try again.`);
          }
          // Generate a new ID with a higher sequence number
          const year = new Date().getFullYear();
          const query = { 
            settlementId: new RegExp(`^STL-${year}-`)
          };
          if (companyId) {
            query.company = companyId;
          }
          const count = await Settlement.countDocuments(query);
          // Add retry count to ensure uniqueness
          const sequence = String(count + retryCount + 1).padStart(3, '0');
          settlementId = `STL-${year}-${sequence}`;
          console.log(`⚠️ Duplicate settlement ID detected, retrying with: ${settlementId}`);
        } else {
          // Not a duplicate key error, rethrow
          throw saveError;
        }
      }
    }
    await settlement.populate([
      { path: 'driver', select: 'name email phone internalId' },
      { path: 'appliedDeductions', select: 'name type amount' },
      { path: 'createdBy', select: 'name email' }
    ]);

    res.status(201).json({
      success: true,
      message: "Settlement created successfully",
      data: settlement
    });
  } catch (error) {
    console.error("Error creating settlement:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating settlement"
    });
  }
};

// Get All Settlements
export const getSettlements = async (req, res) => {
  try {
    const { search, status, driver, startDate, endDate, page = 1, limit = 10 } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = {};
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    // Search filter
    if (search) {
      filter.$or = [
        { settlementId: { $regex: search, $options: 'i' } },
        { 'driver.name': { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Driver filter
    if (driver) {
      filter.driver = driver;
    }

    // Date range filter
    if (startDate || endDate) {
      filter['payPeriod.startDate'] = {};
      if (startDate) {
        filter['payPeriod.startDate'].$gte = new Date(startDate);
      }
      if (endDate) {
        filter['payPeriod.endDate'] = { $lte: new Date(endDate) };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const settlements = await Settlement.find(filter)
      .populate('driver', 'name email phone internalId')
      .populate('appliedDeductions', 'name type amount')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Settlement.countDocuments(filter);

    res.json({
      success: true,
      data: settlements,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching settlements:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching settlements"
    });
  }
};

// Get Settlement by ID
export const getSettlementById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = { _id: id };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const settlement = await Settlement.findOne(filter)
      .populate('driver', 'name email phone internalId')
      .populate('appliedDeductions')
      .populate('milesRecords')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: "Settlement not found"
      });
    }

    res.json({
      success: true,
      data: settlement
    });
  } catch (error) {
    console.error("Error fetching settlement:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching settlement"
    });
  }
};

// Update Settlement
export const updateSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { payPeriod, grossPay, deductions, additions, status, paymentDate, paymentMethod, paymentReference, notes } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = { _id: id };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const settlement = await Settlement.findOne(filter);

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: "Settlement not found"
      });
    }

    // Update fields
    if (payPeriod) {
      settlement.payPeriod = {
        startDate: payPeriod.startDate ? new Date(payPeriod.startDate) : settlement.payPeriod.startDate,
        endDate: payPeriod.endDate ? new Date(payPeriod.endDate) : settlement.payPeriod.endDate
      };
    }

    if (grossPay !== undefined) settlement.grossPay = Number(grossPay);
    if (deductions !== undefined) settlement.deductions = Number(deductions);
    if (additions !== undefined) settlement.additions = Number(additions);
    if (status) settlement.status = status;
    if (paymentDate) settlement.paymentDate = new Date(paymentDate);
    if (paymentMethod) settlement.paymentMethod = paymentMethod;
    if (paymentReference !== undefined) settlement.paymentReference = paymentReference;
    if (notes !== undefined) settlement.notes = notes;

    // Recalculate net pay
    settlement.netPay = settlement.grossPay + settlement.additions - settlement.deductions;
    settlement.updatedBy = req.user._id;

    await settlement.save();
    await settlement.populate([
      { path: 'driver', select: 'name email phone internalId' },
      { path: 'appliedDeductions', select: 'name type amount' },
      { path: 'updatedBy', select: 'name email' }
    ]);

    res.json({
      success: true,
      message: "Settlement updated successfully",
      data: settlement
    });
  } catch (error) {
    console.error("Error updating settlement:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating settlement"
    });
  }
};

// Delete Settlement
export const deleteSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = { _id: id };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const settlement = await Settlement.findOneAndDelete(filter);

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: "Settlement not found"
      });
    }

    res.json({
      success: true,
      message: "Settlement deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting settlement:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting settlement"
    });
  }
};

// Get Settlement Statistics
export const getSettlementStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = {};
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const stats = await Settlement.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalSettlements: { $sum: 1 },
          totalGrossPay: { $sum: '$grossPay' },
          totalDeductions: { $sum: '$deductions' },
          totalAdditions: { $sum: '$additions' },
          totalNetPay: { $sum: '$netPay' },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] }
          },
          pendingAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, '$netPay', 0] }
          },
          processingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Processing'] }, 1, 0] }
          },
          processingAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'Processing'] }, '$netPay', 0] }
          },
          paidCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Paid'] }, 1, 0] }
          },
          paidAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'Paid'] }, '$netPay', 0] }
          }
        }
      }
    ]);

    const activeDrivers = await Settlement.distinct('driver', filter);

    res.json({
      success: true,
      data: {
        totalSettlements: stats[0]?.totalSettlements || 0,
        totalGrossPay: stats[0]?.totalGrossPay || 0,
        totalDeductions: stats[0]?.totalDeductions || 0,
        totalAdditions: stats[0]?.totalAdditions || 0,
        totalNetPay: stats[0]?.totalNetPay || 0,
        pendingCount: stats[0]?.pendingCount || 0,
        pendingAmount: stats[0]?.pendingAmount || 0,
        processingCount: stats[0]?.processingCount || 0,
        processingAmount: stats[0]?.processingAmount || 0,
        paidCount: stats[0]?.paidCount || 0,
        paidAmount: stats[0]?.paidAmount || 0,
        activeDrivers: activeDrivers.length
      }
    });
  } catch (error) {
    console.error("Error fetching settlement stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching settlement statistics"
    });
  }
};

// ==================== DEDUCTIONS & ADDITIONS ====================

// Create Deduction/Addition
export const createDeductionAddition = async (req, res) => {
  try {
    const { name, type, recurrence, amount, assignedTo, startDate, endDate, description, isActive = true } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    // Validate driver exists
    const driver = await User.findById(assignedTo);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    const deductionAddition = new DeductionAddition({
      name,
      type,
      recurrence,
      amount: Number(amount),
      assignedTo,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      description,
      isActive,
      company: companyId,
      createdBy: req.user._id
    });

    await deductionAddition.save();
    await deductionAddition.populate([
      { path: 'assignedTo', select: 'name email phone internalId' },
      { path: 'createdBy', select: 'name email' }
    ]);

    res.status(201).json({
      success: true,
      message: `${type} created successfully`,
      data: deductionAddition
    });
  } catch (error) {
    console.error("Error creating deduction/addition:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating deduction/addition"
    });
  }
};

// Get All Deductions/Additions
export const getDeductionAdditions = async (req, res) => {
  try {
    const { search, type, assignedTo, isActive, page = 1, limit = 10 } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Get company filter with strict validation
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // CRITICAL: If not superadmin and no valid company, return empty data immediately
    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ getDeductionAdditions: Admin has no company - returning empty data');
      return res.json({
        success: true,
        data: [],
        pagination: {
          current: parseInt(page),
          pages: 0,
          total: 0,
          limit: parseInt(limit)
        },
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    let filter = {};
    // Always apply company filter for non-superadmin users
    if (!isSuperadmin && hasValidCompany) {
      filter.company = companyId;
    }

    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    if (type) {
      filter.type = type;
    }

    if (assignedTo) {
      filter.assignedTo = assignedTo;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const deductionAdditions = await DeductionAddition.find(filter)
      .populate('assignedTo', 'name email phone internalId')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DeductionAddition.countDocuments(filter);

    res.json({
      success: true,
      data: deductionAdditions,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching deductions/additions:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching deductions/additions"
    });
  }
};

// Get Deduction/Addition by ID
export const getDeductionAdditionById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Get company filter with strict validation
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // CRITICAL: If not superadmin and no valid company, return 403
    if (!isSuperadmin && !hasValidCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    let filter = { _id: id };
    // Always apply company filter for non-superadmin users
    if (!isSuperadmin && hasValidCompany) {
      filter.company = companyId;
    }

    const deductionAddition = await DeductionAddition.findOne(filter)
      .populate('assignedTo', 'name email phone internalId')
      .populate('createdBy', 'name email');

    if (!deductionAddition) {
      return res.status(404).json({
        success: false,
        message: "Deduction/Addition not found"
      });
    }

    res.json({
      success: true,
      data: deductionAddition
    });
  } catch (error) {
    console.error("Error fetching deduction/addition:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching deduction/addition"
    });
  }
};

// Update Deduction/Addition
export const updateDeductionAddition = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, recurrence, amount, assignedTo, startDate, endDate, description, isActive } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Get company filter with strict validation
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // CRITICAL: If not superadmin and no valid company, return 403
    if (!isSuperadmin && !hasValidCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    let filter = { _id: id };
    // Always apply company filter for non-superadmin users
    if (!isSuperadmin && hasValidCompany) {
      filter.company = companyId;
    }

    const deductionAddition = await DeductionAddition.findOne(filter);

    if (!deductionAddition) {
      return res.status(404).json({
        success: false,
        message: "Deduction/Addition not found"
      });
    }

    // Validate new assignee still exists before reassigning
    if (assignedTo && assignedTo !== deductionAddition.assignedTo?.toString()) {
      const assignee = await User.findById(assignedTo);
      if (!assignee) {
        return res.status(404).json({ success: false, message: "Assigned employee not found" });
      }
    }

    if (name) deductionAddition.name = name;
    if (type) deductionAddition.type = type;
    if (recurrence) deductionAddition.recurrence = recurrence;
    if (amount !== undefined) deductionAddition.amount = Number(amount);
    if (assignedTo) deductionAddition.assignedTo = assignedTo;
    if (startDate) deductionAddition.startDate = new Date(startDate);
    if (endDate) deductionAddition.endDate = new Date(endDate);
    if (description !== undefined) deductionAddition.description = description;
    if (isActive !== undefined) deductionAddition.isActive = isActive;

    await deductionAddition.save();
    await deductionAddition.populate([
      { path: 'assignedTo', select: 'name email phone internalId' },
      { path: 'createdBy', select: 'name email' }
    ]);

    res.json({
      success: true,
      message: "Deduction/Addition updated successfully",
      data: deductionAddition
    });
  } catch (error) {
    console.error("Error updating deduction/addition:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating deduction/addition"
    });
  }
};

// Delete Deduction/Addition
export const deleteDeductionAddition = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Get company filter with strict validation
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // CRITICAL: If not superadmin and no valid company, return 403
    if (!isSuperadmin && !hasValidCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    let filter = { _id: id };
    // Always apply company filter for non-superadmin users
    if (!isSuperadmin && hasValidCompany) {
      filter.company = companyId;
    }

    const deductionAddition = await DeductionAddition.findOneAndDelete(filter);

    if (!deductionAddition) {
      return res.status(404).json({
        success: false,
        message: "Deduction/Addition not found"
      });
    }

    // Remove stale reference from any settlements that still hold this ID
    await Settlement.updateMany(
      { appliedDeductions: deductionAddition._id },
      { $pull: { appliedDeductions: deductionAddition._id } }
    );

    res.json({
      success: true,
      message: "Deduction/Addition deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting deduction/addition:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting deduction/addition"
    });
  }
};

// ==================== MILES TRACKING ====================

// Create Miles Tracking Record
export const createMilesTracking = async (req, res) => {
  try {
    const { date, vehicle, driver, state, totalMiles, loadedMiles = 0, emptyMiles = 0, iftaMiles, trip, notes } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    // Validate driver and vehicle exist
    const driverUser = await User.findById(driver);
    if (!driverUser) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    // Find vehicle in Vehicle model
    let vehicleDoc = null;
    let vehicleId = vehicle;
    let vehicleModelType = "Vehicle";
    
    // Extract real ID if prefixed
    const realId = extractRealId(vehicle);
    
    // Try Vehicle by ObjectId first
    if (isValidObjectId(realId)) {
      vehicleDoc = await Vehicle.findById(new mongoose.Types.ObjectId(realId));
    }
    
    // If not found by ObjectId, try by identifiers
    if (!vehicleDoc && realId) {
      vehicleDoc = await Vehicle.findOne({
        $or: [
          { unitNumber: realId },
          { internalId: realId },
          { plateNumber: realId }
        ]
      });
    }
    
    if (!vehicleDoc) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found"
      });
    }
    
    vehicleId = vehicleDoc._id;

    const milesTracking = new MilesTracking({
      date: new Date(date),
      vehicle: vehicleId, // Use the resolved vehicle ID
      vehicleModel: vehicleModelType, // Set the model type
      driver,
      state: state.toUpperCase(),
      totalMiles: Number(totalMiles),
      loadedMiles: Number(loadedMiles),
      emptyMiles: Number(emptyMiles),
      iftaMiles: Number(iftaMiles),
      trip: trip || undefined,
      notes,
      company: companyId,
      createdBy: req.user._id
    });

    await milesTracking.save();
    await milesTracking.populate([
      { path: 'driver', select: 'name email phone internalId' },
      { path: 'trip', select: 'tripNumber' },
      { path: 'createdBy', select: 'name email' }
    ]);

    // Manually populate vehicle for response
    let createdVehicleData = null;
    const vehicleData = await Vehicle.findById(milesTracking.vehicle)
      .select('plateNumber unitNumber make model internalId')
      .lean();
    if (vehicleData) {
      createdVehicleData = {
        _id: vehicleData._id,
        plateNumber: vehicleData.plateNumber,
        unitNumber: vehicleData.unitNumber,
        internalId: vehicleData.internalId,
        make: vehicleData.make,
        model: vehicleData.model
      };
    }
    
    // Convert to plain object and add vehicle data
    const createdResponseData = milesTracking.toObject();
    createdResponseData.vehicle = createdVehicleData;

    res.status(201).json({
      success: true,
      message: "Miles tracking record created successfully",
      data: createdResponseData
    });
  } catch (error) {
    console.error("Error creating miles tracking:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating miles tracking record"
    });
  }
};

// Get All Miles Tracking Records
export const getMilesTracking = async (req, res) => {
  try {
    const { search, driver, vehicle, state, startDate, endDate, page = 1, limit = 10 } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = {};
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    if (driver) {
      filter.driver = driver;
    }

    if (vehicle) {
      // Resolve vehicle ID - try ObjectId first, then by identifiers
      let resolvedVehicleId = vehicle;
      const realId = extractRealId(vehicle);
      
      if (isValidObjectId(realId)) {
        const vehicleDoc = await Vehicle.findById(new mongoose.Types.ObjectId(realId));
        if (vehicleDoc) {
          resolvedVehicleId = vehicleDoc._id;
        }
      } else if (realId) {
        const vehicleDoc = await Vehicle.findOne({
          $or: [
            { unitNumber: realId },
            { internalId: realId },
            { plateNumber: realId }
          ]
        });
        if (vehicleDoc) {
          resolvedVehicleId = vehicleDoc._id;
        }
      }
      
      filter.vehicle = resolvedVehicleId;
    }

    if (state) {
      filter.state = state.toUpperCase();
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.date.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let milesRecords = await MilesTracking.find(filter)
      .populate('driver', 'name email phone internalId')
      .populate('trip', 'tripNumber')
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Manually populate vehicle
    for (let record of milesRecords) {
      if (record.vehicle) {
        const vehicleData = await Vehicle.findById(record.vehicle)
          .select('plateNumber unitNumber make model internalId')
          .lean();
        if (vehicleData) {
          record.vehicle = {
            _id: vehicleData._id,
            plateNumber: vehicleData.plateNumber,
            unitNumber: vehicleData.unitNumber,
            internalId: vehicleData.internalId,
            make: vehicleData.make,
            model: vehicleData.model
          };
        }
      }
    }

    const total = await MilesTracking.countDocuments(filter);

    res.json({
      success: true,
      data: milesRecords,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching miles tracking:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching miles tracking records"
    });
  }
};

// Get Miles Tracking by ID
export const getMilesTrackingById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = { _id: id };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    let milesTracking = await MilesTracking.findOne(filter)
      .populate('driver', 'name email phone internalId')
      .populate('trip', 'tripNumber')
      .populate('createdBy', 'name email')
      .lean();

    // Manually populate vehicle
    if (milesTracking && milesTracking.vehicle) {
      const vehicleData = await Vehicle.findById(milesTracking.vehicle)
        .select('plateNumber unitNumber make model internalId')
        .lean();
      if (vehicleData) {
        milesTracking.vehicle = {
          _id: vehicleData._id,
          plateNumber: vehicleData.plateNumber,
          unitNumber: vehicleData.unitNumber,
          internalId: vehicleData.internalId,
          make: vehicleData.make,
          model: vehicleData.model
        };
      }
    }

    if (!milesTracking) {
      return res.status(404).json({
        success: false,
        message: "Miles tracking record not found"
      });
    }

    res.json({
      success: true,
      data: milesTracking
    });
  } catch (error) {
    console.error("Error fetching miles tracking:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching miles tracking record"
    });
  }
};

// Update Miles Tracking
export const updateMilesTracking = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, vehicle, driver, state, totalMiles, loadedMiles, emptyMiles, iftaMiles, trip, notes } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = { _id: id };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const milesTracking = await MilesTracking.findOne(filter);

    if (!milesTracking) {
      return res.status(404).json({
        success: false,
        message: "Miles tracking record not found"
      });
    }

    if (date) milesTracking.date = new Date(date);
    if (vehicle) {
      // Find vehicle in Vehicle model
      let vehicleDoc = null;
      const realId = extractRealId(vehicle);
      
      // Try Vehicle by ObjectId first
      if (isValidObjectId(realId)) {
        vehicleDoc = await Vehicle.findById(new mongoose.Types.ObjectId(realId));
      }
      
      // If not found by ObjectId, try by identifiers
      if (!vehicleDoc && realId) {
        vehicleDoc = await Vehicle.findOne({
          $or: [
            { unitNumber: realId },
            { internalId: realId },
            { plateNumber: realId }
          ]
        });
      }
      
      if (!vehicleDoc) {
        return res.status(404).json({
          success: false,
          message: "Vehicle not found"
        });
      }
      
      milesTracking.vehicle = vehicleDoc._id;
      milesTracking.vehicleModel = "Vehicle";
    }
    if (driver) milesTracking.driver = driver;
    if (state) milesTracking.state = state.toUpperCase();
    if (totalMiles !== undefined) milesTracking.totalMiles = Number(totalMiles);
    if (loadedMiles !== undefined) milesTracking.loadedMiles = Number(loadedMiles);
    if (emptyMiles !== undefined) milesTracking.emptyMiles = Number(emptyMiles);
    if (iftaMiles !== undefined) milesTracking.iftaMiles = Number(iftaMiles);
    if (trip !== undefined) milesTracking.trip = trip;
    if (notes !== undefined) milesTracking.notes = notes;

    await milesTracking.save();
    await milesTracking.populate([
      { path: 'driver', select: 'name email phone internalId' },
      { path: 'trip', select: 'tripNumber' }
    ]);

    // Manually populate vehicle for response
    let updatedVehicleData = null;
    const vehicleDoc = await Vehicle.findById(milesTracking.vehicle)
      .select('plateNumber unitNumber make model internalId')
      .lean();
    if (vehicleDoc) {
      updatedVehicleData = {
        _id: vehicleDoc._id,
        plateNumber: vehicleDoc.plateNumber,
        unitNumber: vehicleDoc.unitNumber,
        internalId: vehicleDoc.internalId,
        make: vehicleDoc.make,
        model: vehicleDoc.model
      };
    }
    
    const updatedResponseData = milesTracking.toObject();
    updatedResponseData.vehicle = updatedVehicleData;

    res.json({
      success: true,
      message: "Miles tracking record updated successfully",
      data: updatedResponseData
    });
  } catch (error) {
    console.error("Error updating miles tracking:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating miles tracking record"
    });
  }
};

// Delete Miles Tracking
export const deleteMilesTracking = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = { _id: id };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const milesTracking = await MilesTracking.findOneAndDelete(filter);

    if (!milesTracking) {
      return res.status(404).json({
        success: false,
        message: "Miles tracking record not found"
      });
    }

    res.json({
      success: true,
      message: "Miles tracking record deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting miles tracking:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting miles tracking record"
    });
  }
};

// Get Miles Tracking Statistics
export const getMilesTrackingStats = async (req, res) => {
  try {
    const { startDate, endDate, driver, vehicle } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    let filter = {};
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    if (driver) filter.driver = driver;
    if (vehicle) filter.vehicle = vehicle;

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const stats = await MilesTracking.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalMiles: { $sum: '$totalMiles' },
          totalLoadedMiles: { $sum: '$loadedMiles' },
          totalEmptyMiles: { $sum: '$emptyMiles' },
          totalIftaMiles: { $sum: '$iftaMiles' },
          recordCount: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalMiles: stats[0]?.totalMiles || 0,
        totalLoadedMiles: stats[0]?.totalLoadedMiles || 0,
        totalEmptyMiles: stats[0]?.totalEmptyMiles || 0,
        totalIftaMiles: stats[0]?.totalIftaMiles || 0,
        recordCount: stats[0]?.recordCount || 0
      }
    });
  } catch (error) {
    console.error("Error fetching miles tracking stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching miles tracking statistics"
    });
  }
};

