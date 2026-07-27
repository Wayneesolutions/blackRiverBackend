import { InsuranceClaim } from '../../models/insuranceClaimModel.js';
import { Vehicle } from '../../models/driver/vehicleModel.js';
import { FleetUnit } from '../../models/fleet/fleetUnitModel.js';
import { User } from '../../models/driver/userModel.js';
import { getUserCompanyId } from '../../utils/companyFilter.js';
import mongoose from 'mongoose';

// Helper to extract real ID from prefixed IDs
const extractRealId = (prefixedId) => {
  if (!prefixedId) return null;
  if (prefixedId.startsWith('vehicle-')) {
    return prefixedId.replace('vehicle-', '');
  }
  if (prefixedId.startsWith('trailer-')) {
    return prefixedId.replace('trailer-', '');
  }
  return prefixedId;
};

// Helper to find vehicle by ID
const findVehicleById = async (vehicleId, companyId) => {
  const realId = extractRealId(vehicleId);
  if (!realId || !mongoose.Types.ObjectId.isValid(realId)) return null;

  // Try Vehicle model first
  let vehicle = await Vehicle.findById(realId);
  if (vehicle) {
    // Check if vehicle belongs to company
    const vehicleCompany = vehicle.company?.toString() || vehicle.companyId?.toString();
    if (vehicleCompany === companyId?.toString()) {
      return { model: 'Vehicle', doc: vehicle };
    }
  }

  // Try FleetUnit model
  const fleetUnit = await FleetUnit.findById(realId);
  if (fleetUnit) {
    const fleetCompany = fleetUnit.company?.toString();
    if (fleetCompany === companyId?.toString()) {
      return { model: 'FleetUnit', doc: fleetUnit };
    }
  }

  return null;
};

// Create insurance claim
export const createInsuranceClaim = async (req, res) => {
  try {
    const companyId = await getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(403).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    const {
      claimNumber,
      accidentNumber,
      incidentDate,
      claimDate,
      claimType,
      status,
      amount,
      deductible,
      driver,
      vehicle,
      insuranceCompany,
      policyNumber,
      adjusterName,
      adjusterContact,
      description,
      location,
      notes
    } = req.body;

    // Validate required fields
    if (!incidentDate || !claimDate || !claimType || !amount || !driver || !vehicle || !insuranceCompany || !policyNumber || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Validate driver exists and belongs to company
    const driverDoc = await User.findById(driver);
    if (!driverDoc) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    const driverCompany = driverDoc.company?.toString();
    if (driverCompany !== companyId?.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Driver does not belong to your company'
      });
    }

    // Validate vehicle exists and belongs to company
    const vehicleResult = await findVehicleById(vehicle, companyId);
    if (!vehicleResult) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found or does not belong to your company'
      });
    }

    // Check if claim number already exists
    let finalClaimNumber = claimNumber;
    if (finalClaimNumber) {
      const existingClaim = await InsuranceClaim.findOne({ claimNumber: finalClaimNumber, company: companyId });
      if (existingClaim) {
        return res.status(400).json({
          success: false,
          message: 'Claim number already exists'
        });
      }
    }

    // Create claim
    const claimData = {
      claimNumber: finalClaimNumber,
      accidentNumber: accidentNumber || '',
      incidentDate: new Date(incidentDate),
      claimDate: new Date(claimDate),
      claimType,
      status: status || 'pending',
      amount: parseFloat(amount),
      deductible: parseFloat(deductible || 0),
      driver: new mongoose.Types.ObjectId(driver),
      vehicle: new mongoose.Types.ObjectId(extractRealId(vehicle)),
      insuranceCompany,
      policyNumber,
      adjusterName: adjusterName || '',
      adjusterContact: adjusterContact || '',
      description,
      location: location || '',
      notes: notes || '',
      company: new mongoose.Types.ObjectId(companyId),
      createdBy: req.user.id
    };

    const claim = new InsuranceClaim(claimData);
    await claim.save();

    // Populate and return
    const populatedClaim = await InsuranceClaim.findById(claim._id)
      .populate('driver', 'name email')
      .populate('vehicle', 'internalId plateNumber licensePlate make model')
      .populate('createdBy', 'name')
      .lean();

    res.status(201).json({
      success: true,
      message: 'Insurance claim created successfully',
      data: populatedClaim
    });
  } catch (error) {
    console.error('Error creating insurance claim:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating insurance claim'
    });
  }
};

// Get all insurance claims
export const getInsuranceClaims = async (req, res) => {
  try {
    const companyId = await getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(403).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    const { status, claimType, search, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = { company: companyId };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (claimType && claimType !== 'all') {
      query.claimType = claimType;
    }

    if (search) {
      query.$or = [
        { claimNumber: { $regex: search, $options: 'i' } },
        { accidentNumber: { $regex: search, $options: 'i' } },
        { policyNumber: { $regex: search, $options: 'i' } },
        { insuranceCompany: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Get total count
    const total = await InsuranceClaim.countDocuments(query);

    // Get claims
    const claims = await InsuranceClaim.find(query)
      .populate('driver', 'name email')
      .populate('vehicle', 'internalId plateNumber licensePlate make model')
      .populate('createdBy', 'name')
      .sort({ claimDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.json({
      success: true,
      message: 'Insurance claims fetched successfully',
      data: claims,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching insurance claims:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching insurance claims'
    });
  }
};

// Get insurance claim by ID
export const getInsuranceClaimById = async (req, res) => {
  try {
    const companyId = await getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(403).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    const { id } = req.params;

    const claim = await InsuranceClaim.findById(id)
      .populate('driver', 'name email')
      .populate('vehicle', 'internalId plateNumber licensePlate make model')
      .populate('createdBy', 'name')
      .lean();

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Insurance claim not found'
      });
    }

    // Check company access
    if (claim.company?.toString() !== companyId?.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      message: 'Insurance claim fetched successfully',
      data: claim
    });
  } catch (error) {
    console.error('Error fetching insurance claim:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching insurance claim'
    });
  }
};

// Update insurance claim
export const updateInsuranceClaim = async (req, res) => {
  try {
    const companyId = await getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(403).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    const { id } = req.params;
    const claim = await InsuranceClaim.findById(id);

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Insurance claim not found'
      });
    }

    // Check company access
    if (claim.company?.toString() !== companyId?.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const {
      claimNumber,
      accidentNumber,
      incidentDate,
      claimDate,
      claimType,
      status,
      amount,
      deductible,
      driver,
      vehicle,
      insuranceCompany,
      policyNumber,
      adjusterName,
      adjusterContact,
      description,
      location,
      notes
    } = req.body;

    // Validate driver if provided
    if (driver) {
      const driverDoc = await User.findById(driver);
      if (!driverDoc) {
        return res.status(404).json({
          success: false,
          message: 'Driver not found'
        });
      }
      const driverCompany = driverDoc.company?.toString();
      if (driverCompany !== companyId?.toString() && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Driver does not belong to your company'
        });
      }
      claim.driver = new mongoose.Types.ObjectId(driver);
    }

    // Validate vehicle if provided
    if (vehicle) {
      const vehicleResult = await findVehicleById(vehicle, companyId);
      if (!vehicleResult) {
        return res.status(404).json({
          success: false,
          message: 'Vehicle not found or does not belong to your company'
        });
      }
      claim.vehicle = new mongoose.Types.ObjectId(extractRealId(vehicle));
      claim.vehicleModel = vehicleResult.model;
    }

    // Check claim number uniqueness if changed
    if (claimNumber && claimNumber !== claim.claimNumber) {
      const existingClaim = await InsuranceClaim.findOne({ claimNumber, company: companyId, _id: { $ne: id } });
      if (existingClaim) {
        return res.status(400).json({
          success: false,
          message: 'Claim number already exists'
        });
      }
      claim.claimNumber = claimNumber;
    }

    // Update fields
    if (incidentDate) claim.incidentDate = new Date(incidentDate);
    if (claimDate) claim.claimDate = new Date(claimDate);
    if (claimType) claim.claimType = claimType;
    if (status) claim.status = status;
    if (amount !== undefined) claim.amount = parseFloat(amount);
    if (deductible !== undefined) claim.deductible = parseFloat(deductible);
    if (accidentNumber !== undefined) claim.accidentNumber = accidentNumber;
    if (insuranceCompany) claim.insuranceCompany = insuranceCompany;
    if (policyNumber) claim.policyNumber = policyNumber;
    if (adjusterName !== undefined) claim.adjusterName = adjusterName;
    if (adjusterContact !== undefined) claim.adjusterContact = adjusterContact;
    if (description) claim.description = description;
    if (location !== undefined) claim.location = location;
    if (notes !== undefined) claim.notes = notes;

    await claim.save();

    // Populate and return
    const populatedClaim = await InsuranceClaim.findById(claim._id)
      .populate('driver', 'name email')
      .populate('vehicle', 'internalId plateNumber licensePlate make model')
      .populate('createdBy', 'name')
      .lean();

    res.json({
      success: true,
      message: 'Insurance claim updated successfully',
      data: populatedClaim
    });
  } catch (error) {
    console.error('Error updating insurance claim:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating insurance claim'
    });
  }
};

// Delete insurance claim
export const deleteInsuranceClaim = async (req, res) => {
  try {
    const companyId = await getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(403).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    const { id } = req.params;
    const claim = await InsuranceClaim.findById(id);

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Insurance claim not found'
      });
    }

    // Check company access
    if (claim.company?.toString() !== companyId?.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await InsuranceClaim.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Insurance claim deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting insurance claim:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting insurance claim'
    });
  }
};

// Get insurance claim statistics
export const getInsuranceClaimStats = async (req, res) => {
  try {
    const companyId = await getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(403).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    const stats = await InsuranceClaim.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(companyId) } },
      {
        $group: {
          _id: null,
          totalClaims: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          approved: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
          },
          denied: {
            $sum: { $cond: [{ $eq: ['$status', 'denied'] }, 1, 0] }
          },
          underReview: {
            $sum: { $cond: [{ $eq: ['$status', 'under-review'] }, 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalClaims: 0,
      totalAmount: 0,
      pending: 0,
      approved: 0,
      denied: 0,
      underReview: 0
    };

    res.json({
      success: true,
      message: 'Insurance claim statistics fetched successfully',
      data: result
    });
  } catch (error) {
    console.error('Error fetching insurance claim statistics:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching insurance claim statistics'
    });
  }
};

