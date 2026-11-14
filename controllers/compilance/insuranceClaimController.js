import { InsuranceClaim } from '../../models/insuranceClaimModel.js';
import { Vehicle } from '../../models/driver/vehicleModel.js';
import { FleetUnit } from '../../models/fleet/fleetUnitModel.js';
import { User } from '../../models/driver/userModel.js';
import { getUserCompanyId } from '../../utils/companyFilter.js';
import mongoose from 'mongoose';
import { generateDocumentSignedUrl } from './compilanceController.js';
import { Incident } from '../../models/incidentModel.js';

const normalizeObjectId = (v) => (mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);

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

// Adds `documentLinks` (name + viewable URL) next to the stored document keys

// ---- Country (Canada / USA tabs) ----
const normalizeCountry = (v) => {
  const c = String(v || '').trim().toLowerCase();
  if (['canada', 'ca', 'can'].includes(c)) return 'canada';
  if (['usa', 'us', 'united states', 'united states of america'].includes(c)) return 'usa';
  return null;
};

const PROVINCES = ['manitoba', 'ontario', 'quebec', 'québec', 'alberta', 'saskatchewan', 'british columbia', 'nova scotia',
  'new brunswick', 'newfoundland', 'prince edward island', 'yukon', 'nunavut', 'northwest territories',
  ' mb', ' on', ' qc', ' ab', ' sk', ' bc', ' ns', ' nb', ' nl', ' pe', ' yt', ' nu', ' nt', 'canada', 'winnipeg'];
const STATES = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida',
  'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland',
  'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire',
  'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
  'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
  'west virginia', 'wisconsin', 'wyoming', 'usa', 'united states'];

/** Best guess from a free-text location such as "Hwy 1, Brandon, MB" or "Fargo, North Dakota". */
const guessCountryFromText = (text) => {
  const t = ` ${String(text || '').toLowerCase().replace(/[,.]/g, ' ')} `;
  if (!t.trim()) return null;
  if (STATES.some((s) => t.includes(` ${s} `))) return 'usa';
  if (PROVINCES.some((p) => t.includes(p.startsWith(' ') ? `${p} ` : ` ${p} `))) return 'canada';
  return null;
};

const attachDocumentLinks = async (claim) => {
  if (!claim || !Array.isArray(claim.documents) || claim.documents.length === 0) {
    if (claim) claim.documentLinks = [];
    return claim;
  }
  claim.documentLinks = await Promise.all(
    claim.documents.map(async (key) => {
      const rawName = String(key).split('/').pop() || 'document';
      // Uploaded files are stored as "<timestamp>-<original name>"
      const name = rawName.replace(/^\d{10,}-/, '');
      return { key, name, url: (await generateDocumentSignedUrl(key)) || key };
    })
  );
  return claim;
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
      country,
      notes
    } = req.body;

    // Validate required fields (amount may legitimately be 0 while the claim is being assessed)
    const missing = [];
    if (!incidentDate) missing.push('incident date');
    if (!claimDate) missing.push('claim date');
    if (!claimType) missing.push('claim type');
    if (amount === undefined || amount === null || amount === '' || Number.isNaN(parseFloat(amount))) missing.push('amount');
    if (!driver) missing.push('driver');
    if (!vehicle) missing.push('vehicle');
    if (!insuranceCompany) missing.push('insurance company');
    if (!policyNumber) missing.push('policy number');
    if (!description) missing.push('description');
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
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
      vehicleModel: vehicleResult.model,
      insuranceCompany,
      policyNumber,
      adjusterName: adjusterName || '',
      adjusterContact: adjusterContact || '',
      description,
      location: location || '',
      country: normalizeCountry(country) || guessCountryFromText(location) || undefined,
      notes: notes || '',
      company: new mongoose.Types.ObjectId(companyId),
      createdBy: req.user.id
    };

    // Process uploaded document files
    if (req.files && req.files.length > 0) {
      claimData.documents = req.files.map(file => {
        if (process.env.NODE_ENV === 'production') {
          return file.key || file.location;
        }
        return file.path.replace(/\\/g, '/');
      });
    }

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

    const { status, claimType, search, page = 1, limit = 500 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    // The claims page filters client-side, so it needs the full list (was capped at 10)
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit) || 500));
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

    await Promise.all(claims.map(attachDocumentLinks));

    // Older claims have no country: take it from the linked accident, else from the location text.
    // `countryIsGuess` tells the page to show it as unconfirmed until someone saves the claim.
    const unknown = claims.filter((c) => !c.country);
    if (unknown.length) {
      const accidentNumbers = [...new Set(unknown.map((c) => c.accidentNumber).filter(Boolean))];
      const accidents = accidentNumbers.length
        ? await Incident.find({ company: { $in: [companyId, normalizeObjectId(companyId)].filter(Boolean) }, incidentNumber: { $in: accidentNumbers } })
            .select('incidentNumber location.country').lean()
        : [];
      const byNumber = new Map(accidents.map((a) => [a.incidentNumber, normalizeCountry(a.location?.country)]));
      unknown.forEach((c) => {
        const guess = byNumber.get(c.accidentNumber) || guessCountryFromText(c.location);
        if (guess) { c.country = guess; c.countryIsGuess = true; }
      });
    }

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

    await attachDocumentLinks(claim);

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
      country,
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
    if (country !== undefined) claim.country = normalizeCountry(country) || undefined;
    if (notes !== undefined) claim.notes = notes;

    // Remove documents the user deleted (JSON list of stored keys)
    if (req.body.removeDocuments) {
      let toRemove = req.body.removeDocuments;
      if (typeof toRemove === 'string') {
        try { toRemove = JSON.parse(toRemove); } catch { toRemove = [toRemove]; }
      }
      if (Array.isArray(toRemove) && toRemove.length > 0) {
        claim.documents = (claim.documents || []).filter((doc) => !toRemove.includes(doc));
      }
    }

    // Append newly uploaded document files
    if (req.files && req.files.length > 0) {
      const newDocs = req.files.map(file => {
        if (process.env.NODE_ENV === 'production') {
          return file.key || file.location;
        }
        return file.path.replace(/\\/g, '/');
      });
      claim.documents = [...(claim.documents || []), ...newDocs];
    }

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

