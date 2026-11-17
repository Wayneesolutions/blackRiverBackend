// controllers/expenseController.js
import { Expense } from "../../models/hr/expenseModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../../config/awsConfig.js";
import { extractExpenseFromReceipt } from "../../services/openaiService.js";
import fs from 'fs';

// ✅ Update Expense
// Optional reference fields arrive as "" from multipart forms when nothing is selected
// (e.g. no employee). Mongoose cannot cast "" to ObjectId, so the save failed with
// "Cast to ObjectId failed for value \"\" at path userId".
const OPTIONAL_REF_FIELDS = ["userId", "orderId", "vehicle", "trailer", "truckId", "trailerId"];
const dropEmptyRefs = (obj, unsetForUpdate = false) => {
  for (const key of OPTIONAL_REF_FIELDS) {
    const v = obj[key];
    if (v === "" || v === "null" || v === "undefined" || v === null) {
      delete obj[key];
      if (unsetForUpdate && key === "userId") obj.$unset = { ...(obj.$unset || {}), userId: 1 };
    }
  }
  return obj;
};


// A Trailer document shaped like a fleet unit for the expense screens. "TRL-203" is
// usually stored in `trailer` (the trailer number), which the old mapping skipped.
const trailerToUnit = (t) => ({
  _id: t._id,
  unitNo: t.trailer || t.unitNumber || t.internalId || t.plateNumber,
  unitNumber: t.unitNumber || t.trailer,
  internalId: t.internalId,
  licensePlate: t.plateNumber,
  plateNumber: t.plateNumber,
  make: t.make,
  model: t.model,
});

export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Initialize companyId and isSuperadmin first (before they are used)
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }
    
    let updateData = dropEmptyRefs({ ...req.body }, true);
    
    // Handle categoryId if provided (for dynamic categories)
    if (req.body.categoryId !== undefined) {
      updateData.categoryId = req.body.categoryId;
    }
    
    // Handle typeId if provided (for dynamic types)
    // If typeId is provided, use it; otherwise keep the type string for backward compatibility
    if (req.body.typeId !== undefined) {
      updateData.typeId = req.body.typeId;
    }

    // Handle vehicle/truckId (frontend sends truckId, map to vehicle)
    // Strip "vehicle-" prefix if present and validate company ownership
    if (req.body.truckId !== undefined) {
      if (req.body.truckId && req.body.truckId.trim() !== '') {
        let vehicleId = req.body.truckId;
        if (typeof vehicleId === 'string' && vehicleId.startsWith('vehicle-')) {
          vehicleId = vehicleId.replace('vehicle-', '');
        }
        // Validate that the vehicle belongs to the company
        const { FleetUnit } = await import("../../models/fleet/fleetUnitModel.js");
        const vehicleQuery = { _id: vehicleId };
        if (!isSuperadmin && companyId) {
          vehicleQuery.company = companyId;
        }
        const { Vehicle } = await import("../../models/driver/vehicleModel.js");
        // Trucks can be Fleet Maintenance units or Vehicles; an update used to drop a
        // Vehicle silently because only FleetUnit was checked.
        const vehicle = (await FleetUnit.findOne(vehicleQuery)) || (await Vehicle.findOne({ _id: vehicleId }));
        if (vehicle) {
          updateData.vehicle = vehicleId;
        } else {
          console.warn(`Vehicle ${vehicleId} not found or doesn't belong to company`);
          updateData.vehicle = null;
        }
      } else {
        updateData.vehicle = null;
      }
    } else if (req.body.vehicle !== undefined) {
      if (req.body.vehicle && req.body.vehicle.trim() !== '') {
        let vehicleId = req.body.vehicle;
        if (typeof vehicleId === 'string' && vehicleId.startsWith('vehicle-')) {
          vehicleId = vehicleId.replace('vehicle-', '');
        }
        const { FleetUnit } = await import("../../models/fleet/fleetUnitModel.js");
        const vehicleQuery = { _id: vehicleId };
        if (!isSuperadmin && companyId) {
          vehicleQuery.company = companyId;
        }
        const { Vehicle } = await import("../../models/driver/vehicleModel.js");
        // Trucks can be Fleet Maintenance units or Vehicles; an update used to drop a
        // Vehicle silently because only FleetUnit was checked.
        const vehicle = (await FleetUnit.findOne(vehicleQuery)) || (await Vehicle.findOne({ _id: vehicleId }));
        if (vehicle) {
          updateData.vehicle = vehicleId;
        } else {
          updateData.vehicle = null;
        }
      } else {
        updateData.vehicle = null;
      }
    }

    // Handle trailer/trailerId (frontend sends trailerId, map to trailer)
    // Strip "trailer-" prefix if present and validate company ownership
    if (req.body.trailerId !== undefined) {
      if (req.body.trailerId && req.body.trailerId.trim() !== '') {
        let trailerId = req.body.trailerId;
        if (typeof trailerId === 'string' && trailerId.startsWith('trailer-')) {
          trailerId = trailerId.replace('trailer-', '');
        }
        // Validate that the trailer belongs to the company
        const { FleetUnit } = await import("../../models/fleet/fleetUnitModel.js");
        const trailerQuery = { _id: trailerId };
        if (!isSuperadmin && companyId) {
          trailerQuery.company = companyId;
        }
        const { Trailer } = await import("../../models/driver/trailerModel.js");
        const trailer = (await FleetUnit.findOne(trailerQuery)) || (await Trailer.findOne({ _id: trailerId }));
        if (trailer) {
          updateData.trailer = trailerId;
        } else {
          console.warn(`Trailer ${trailerId} not found or doesn't belong to company`);
          updateData.trailer = null;
        }
      } else {
        updateData.trailer = null;
      }
    } else if (req.body.trailer !== undefined) {
      if (req.body.trailer && req.body.trailer.trim() !== '') {
        let trailerId = req.body.trailer;
        if (typeof trailerId === 'string' && trailerId.startsWith('trailer-')) {
          trailerId = trailerId.replace('trailer-', '');
        }
        const { FleetUnit } = await import("../../models/fleet/fleetUnitModel.js");
        const trailerQuery = { _id: trailerId };
        if (!isSuperadmin && companyId) {
          trailerQuery.company = companyId;
        }
        const { Trailer } = await import("../../models/driver/trailerModel.js");
        const trailer = (await FleetUnit.findOne(trailerQuery)) || (await Trailer.findOne({ _id: trailerId }));
        if (trailer) {
          updateData.trailer = trailerId;
        } else {
          updateData.trailer = null;
        }
      } else {
        updateData.trailer = null;
      }
    }

    console.log('Updating expense with data:', {
      categoryId: updateData.categoryId,
      typeId: updateData.typeId,
      type: updateData.type,
      vehicle: updateData.vehicle,
      trailer: updateData.trailer
    });

    // Handle file update if a new file is uploaded
    if (req.file) {
      if (process.env.NODE_ENV === "production") {
        updateData.receiptUrl = req.file.location;
      } else {
        updateData.receiptUrl = `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, '/')}`;
      }
    }

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const updatedExpense = await Expense.findOneAndUpdate(query, updateData, {
      new: true,
      runValidators: true,
    })
    .populate("userId", "name role")
    .populate("categoryId", "name status")
    .populate("typeId", "name status categoryId");

    if (!updatedExpense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    // populate() sets the field to null when the id is a Vehicle / Trailer rather than a
    // FleetUnit, so keep the raw ids to look those up below.
    const rawVehicleId = updatedExpense.vehicle ? String(updatedExpense.vehicle._id || updatedExpense.vehicle) : null;
    const rawTrailerId = updatedExpense.trailer ? String(updatedExpense.trailer._id || updatedExpense.trailer) : null;
    // Try to populate vehicle and trailer from FleetUnit
    try {
      await updatedExpense.populate("vehicle", "unitNo unitType makeModel make model licensePlate unitType");
      await updatedExpense.populate("trailer", "unitNo unitType makeModel make model licensePlate unitType");
    } catch (populateError) {
      console.warn('Error populating vehicle/trailer from FleetUnit:', populateError.message);
    }

    // Map vehicle and trailer to truckId and trailerId for frontend compatibility
    const expenseObj = updatedExpense.toObject();
    if (rawVehicleId && !(expenseObj.vehicle && expenseObj.vehicle._id)) expenseObj.vehicle = rawVehicleId;
    if (rawTrailerId && !(expenseObj.trailer && expenseObj.trailer._id)) expenseObj.trailer = rawTrailerId;
    
    // If vehicle/trailer weren't populated (might be from Vehicle/Trailer models), fetch them manually
    if (expenseObj.vehicle && typeof expenseObj.vehicle === 'string') {
      try {
        const { Vehicle } = await import("../../models/driver/vehicleModel.js");
        const vehicle = await Vehicle.findById(expenseObj.vehicle).select("unitNumber internalId plateNumber make model");
        if (vehicle) {
          expenseObj.vehicle = {
            _id: vehicle._id,
            unitNo: vehicle.unitNumber || vehicle.internalId,
            unitNumber: vehicle.unitNumber,
            internalId: vehicle.internalId,
            licensePlate: vehicle.plateNumber,
            plateNumber: vehicle.plateNumber,
            make: vehicle.make,
            model: vehicle.model
          };
        }
      } catch (err) {
        console.warn('Could not populate vehicle from Vehicle model:', err.message);
      }
    }
    
    if (expenseObj.trailer && typeof expenseObj.trailer === 'string') {
      try {
        const { Trailer } = await import("../../models/driver/trailerModel.js");
        const trailer = await Trailer.findById(expenseObj.trailer).select("unitNumber trailer internalId plateNumber make model").lean();
        if (trailer) expenseObj.trailer = trailerToUnit(trailer);
      } catch (err) {
        console.warn('Could not populate trailer from Trailer model:', err.message);
      }
    }
    
    // Map to truckId and trailerId for frontend
    if (expenseObj.vehicle) {
      expenseObj.truckId = typeof expenseObj.vehicle === 'object' ? expenseObj.vehicle._id : expenseObj.vehicle;
    }
    if (expenseObj.trailer) {
      expenseObj.trailerId = typeof expenseObj.trailer === 'object' ? expenseObj.trailer._id : expenseObj.trailer;
    }

    res.json({
      success: true,
      message: "Expense updated successfully",
      data: expenseObj,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Delete Expense
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const deletedExpense = await Expense.findOneAndDelete(query);
    if (!deletedExpense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    res.json({
      success: true,
      message: "Expense deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createExpense = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first before creating expenses."
      });
    }

    let fileUrl = null;
    if (req.file) {
      if (process.env.NODE_ENV === "production") {
        // If using AWS S3 (multer-s3)
        fileUrl = req.file.location;
      } else {
        // Local storage
        fileUrl = `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, '/')}`;
      }
    }

    const payload = dropEmptyRefs({
      ...req.body,
      receiptUrl: fileUrl,
      company: isSuperadmin ? req.body.company || null : companyId
    });

    if(req.body.orderId){
      let orderId = req.body.orderId;
      if(typeof orderId ==='string'){
        payload.orderId = orderId
      }
    }

    // Handle categoryId if provided (for dynamic categories)
    if (req.body.categoryId) {
      payload.categoryId = req.body.categoryId;
    }

    // Handle typeId if provided (for dynamic types)
    // If typeId is provided, use it; otherwise keep the type string for backward compatibility
    if (req.body.typeId) {
      payload.typeId = req.body.typeId;
      // Optionally set type from the typeId's name for backward compatibility
      // This will be populated when fetching
    }

    // Handle vehicle/truckId (frontend sends truckId, map to vehicle)
    // Strip "vehicle-" prefix if present
    if (req.body.truckId) {
      let vehicleId = req.body.truckId;
      if (typeof vehicleId === 'string' && vehicleId.startsWith('vehicle-')) {
        vehicleId = vehicleId.replace('vehicle-', '');
      }
      // Validate that the vehicle exists (check FleetUnit and Vehicle models)
      if (vehicleId && vehicleId.trim() !== '') {
        const { FleetUnit } = await import("../../models/fleet/fleetUnitModel.js");
        const { Vehicle } = await import("../../models/driver/vehicleModel.js");
        
        let vehicle = null;
        
        // First try to find in FleetUnit (with company check if not superadmin)
        if (!isSuperadmin && companyId) {
          vehicle = await FleetUnit.findOne({ _id: vehicleId, company: companyId });
        } else {
          vehicle = await FleetUnit.findOne({ _id: vehicleId });
        }
        
        // If not found in FleetUnit, check Vehicle model
        if (!vehicle) {
          if (!isSuperadmin && companyId) {
            vehicle = await Vehicle.findOne({ _id: vehicleId, company: companyId });
            // If still not found with company, try without company check (some vehicles might not have company set)
            if (!vehicle) {
              vehicle = await Vehicle.findOne({ _id: vehicleId });
            }
          } else {
            vehicle = await Vehicle.findOne({ _id: vehicleId });
          }
        }
        
        if (vehicle) {
          payload.vehicle = vehicleId;
          console.log(`✅ Vehicle ${vehicleId} found and assigned to expense`);
        } else {
          console.warn(`⚠️ Vehicle ${vehicleId} not found in FleetUnit or Vehicle models - saving ID anyway`);
          // Still save the ID even if validation fails (might be a valid ID from another source)
          payload.vehicle = vehicleId;
        }
      }
    } else if (req.body.vehicle) {
      let vehicleId = req.body.vehicle;
      if (typeof vehicleId === 'string' && vehicleId.startsWith('vehicle-')) {
        vehicleId = vehicleId.replace('vehicle-', '');
      }
      if (vehicleId && vehicleId.trim() !== '') {
        const { FleetUnit } = await import("../../models/fleet/fleetUnitModel.js");
        const { Vehicle } = await import("../../models/driver/vehicleModel.js");
        
        let vehicle = null;
        
        // First try to find in FleetUnit (with company check if not superadmin)
        if (!isSuperadmin && companyId) {
          vehicle = await FleetUnit.findOne({ _id: vehicleId, company: companyId });
        } else {
          vehicle = await FleetUnit.findOne({ _id: vehicleId });
        }
        
        // If not found in FleetUnit, check Vehicle model
        if (!vehicle) {
          if (!isSuperadmin && companyId) {
            vehicle = await Vehicle.findOne({ _id: vehicleId, company: companyId });
            // If still not found with company, try without company check
            if (!vehicle) {
              vehicle = await Vehicle.findOne({ _id: vehicleId });
            }
          } else {
            vehicle = await Vehicle.findOne({ _id: vehicleId });
          }
        }
        
        if (vehicle) {
          payload.vehicle = vehicleId;
          console.log(`✅ Vehicle ${vehicleId} found and assigned to expense`);
        } else {
          console.warn(`⚠️ Vehicle ${vehicleId} not found in FleetUnit or Vehicle models`);
        }
      }
    }

    // Handle trailer/trailerId (frontend sends trailerId, map to trailer)
    // Strip "trailer-" prefix if present
    if (req.body.trailerId) {
      let trailerId = req.body.trailerId;
      if (typeof trailerId === 'string' && trailerId.startsWith('trailer-')) {
        trailerId = trailerId.replace('trailer-', '');
      }
      // Validate that the trailer exists (check FleetUnit and Trailer models)
      if (trailerId && trailerId.trim() !== '') {
        const { FleetUnit } = await import("../../models/fleet/fleetUnitModel.js");
        const { Trailer } = await import("../../models/driver/trailerModel.js");
        
        let trailer = null;
        
        // First try to find in FleetUnit (with company check if not superadmin)
        if (!isSuperadmin && companyId) {
          trailer = await FleetUnit.findOne({ _id: trailerId, company: companyId });
        } else {
          trailer = await FleetUnit.findOne({ _id: trailerId });
        }
        
        // If not found in FleetUnit, check Trailer model
        if (!trailer) {
          if (!isSuperadmin && companyId) {
            trailer = await Trailer.findOne({ _id: trailerId, company: companyId });
            // If still not found with company, try without company check (some trailers might not have company set)
            if (!trailer) {
              trailer = await Trailer.findOne({ _id: trailerId });
            }
          } else {
            trailer = await Trailer.findOne({ _id: trailerId });
          }
        }
        
        if (trailer) {
          payload.trailer = trailerId;
          console.log(`✅ Trailer ${trailerId} found and assigned to expense`);
        } else {
          console.warn(`⚠️ Trailer ${trailerId} not found in FleetUnit or Trailer models - saving ID anyway`);
          // Still save the ID even if validation fails (might be a valid ID from another source)
          payload.trailer = trailerId;
        }
      }
    } else if (req.body.trailer) {
      let trailerId = req.body.trailer;
      if (typeof trailerId === 'string' && trailerId.startsWith('trailer-')) {
        trailerId = trailerId.replace('trailer-', '');
      }
      if (trailerId && trailerId.trim() !== '') {
        const { FleetUnit } = await import("../../models/fleet/fleetUnitModel.js");
        const { Trailer } = await import("../../models/driver/trailerModel.js");
        
        let trailer = null;
        
        // First try to find in FleetUnit (with company check if not superadmin)
        if (!isSuperadmin && companyId) {
          trailer = await FleetUnit.findOne({ _id: trailerId, company: companyId });
        } else {
          trailer = await FleetUnit.findOne({ _id: trailerId });
        }
        
        // If not found in FleetUnit, check Trailer model
        if (!trailer) {
          if (!isSuperadmin && companyId) {
            trailer = await Trailer.findOne({ _id: trailerId, company: companyId });
            // If still not found with company, try without company check
            if (!trailer) {
              trailer = await Trailer.findOne({ _id: trailerId });
            }
          } else {
            trailer = await Trailer.findOne({ _id: trailerId });
          }
        }
        
        if (trailer) {
          payload.trailer = trailerId;
          console.log(`✅ Trailer ${trailerId} found and assigned to expense`);
        } else {
          console.warn(`⚠️ Trailer ${trailerId} not found in FleetUnit or Trailer models`);
        }
      }
    }

    console.log('Creating expense with payload:', {
      categoryId: payload.categoryId,
      typeId: payload.typeId,
      type: payload.type,
      userId: payload.userId,
      amount: payload.amount,
      vehicle: payload.vehicle,
      trailer: payload.trailer,
      truckId: req.body.truckId,
      trailerId: req.body.trailerId
    });

    const expense = new Expense(payload);
    await expense.save();
    await expense.populate("userId", "name role");
    await expense.populate("categoryId", "name status");
    await expense.populate("typeId", "name status categoryId");
    
    // populate() sets the field to null when the id is a Vehicle / Trailer rather than a
    // FleetUnit, so keep the raw ids to look those up below.
    const rawVehicleId = expense.vehicle ? String(expense.vehicle._id || expense.vehicle) : null;
    const rawTrailerId = expense.trailer ? String(expense.trailer._id || expense.trailer) : null;
    // Try to populate vehicle and trailer from FleetUnit first
    try {
      await expense.populate("vehicle", "unitNo unitType makeModel make model licensePlate unitType");
      await expense.populate("trailer", "unitNo unitType makeModel make model licensePlate unitType");
    } catch (populateError) {
      console.warn('Error populating vehicle/trailer from FleetUnit:', populateError.message);
    }
    
    // Map vehicle and trailer to truckId and trailerId for frontend compatibility
    const expenseObj = expense.toObject();
    if (rawVehicleId && !(expenseObj.vehicle && expenseObj.vehicle._id)) expenseObj.vehicle = rawVehicleId;
    if (rawTrailerId && !(expenseObj.trailer && expenseObj.trailer._id)) expenseObj.trailer = rawTrailerId;
    
    // If vehicle/trailer weren't populated (might be from Vehicle/Trailer models), fetch them manually
    if (expenseObj.vehicle && typeof expenseObj.vehicle === 'string') {
      try {
        const { Vehicle } = await import("../../models/driver/vehicleModel.js");
        const vehicle = await Vehicle.findById(expenseObj.vehicle).select("unitNumber internalId plateNumber make model");
        if (vehicle) {
          expenseObj.vehicle = {
            _id: vehicle._id,
            unitNo: vehicle.unitNumber || vehicle.internalId,
            unitNumber: vehicle.unitNumber,
            internalId: vehicle.internalId,
            licensePlate: vehicle.plateNumber,
            plateNumber: vehicle.plateNumber,
            make: vehicle.make,
            model: vehicle.model
          };
        }
      } catch (err) {
        console.warn('Could not populate vehicle from Vehicle model:', err.message);
      }
    }
    
    if (expenseObj.trailer && typeof expenseObj.trailer === 'string') {
      try {
        const { Trailer } = await import("../../models/driver/trailerModel.js");
        const trailer = await Trailer.findById(expenseObj.trailer).select("unitNumber trailer internalId plateNumber make model").lean();
        if (trailer) expenseObj.trailer = trailerToUnit(trailer);
      } catch (err) {
        console.warn('Could not populate trailer from Trailer model:', err.message);
      }
    }
    
    // Map to truckId and trailerId for frontend
    if (expenseObj.vehicle) {
      expenseObj.truckId = typeof expenseObj.vehicle === 'object' ? expenseObj.vehicle._id : expenseObj.vehicle;
    }
    if (expenseObj.trailer) {
      expenseObj.trailerId = typeof expenseObj.trailer === 'object' ? expenseObj.trailer._id : expenseObj.trailer;
    }
    
    res.json({ success: true,message:"created expenses", data:expenseObj });
  } catch (err) {
    res.status(500).json({success:false,message:err.message });
  }
};

export const getExpenses = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    if (req.query.documentType) query.documentType = req.query.documentType;

    // Get expenses with basic populate (don't populate vehicle/trailer yet to preserve IDs)
    const expenses = await Expense.find(query)
      .populate("userId", "name role")
      .populate("categoryId", "name status")
      .populate("typeId", "name status categoryId")
      .sort({ createdAt: -1 });
    
    console.log('=== Fetched expenses ===');
    console.log('Total expenses:', expenses.length);
    
    // Look every truck / trailer up in one batch per model. The old code ran 2-4
    // queries per expense plus several console.logs each, so the list got slower with
    // every expense and a freshly saved one could take a while to show up.
    const { Vehicle } = await import("../../models/driver/vehicleModel.js");
    const { Trailer } = await import("../../models/driver/trailerModel.js");
    const { FleetUnit } = await import("../../models/fleet/fleetUnitModel.js");

    const ids = [...new Set(expenses.flatMap(e => [e.vehicle, e.trailer]).filter(Boolean).map(String))];
    const [fleetUnits, vehicles, trailers] = ids.length ? await Promise.all([
      FleetUnit.find({ _id: { $in: ids } }).select("unitNo unitType makeModel make model licensePlate").lean(),
      Vehicle.find({ _id: { $in: ids } }).select("unitNumber internalId plateNumber make model").lean(),
      Trailer.find({ _id: { $in: ids } }).select("unitNumber trailer internalId plateNumber make model").lean(),
    ]) : [[], [], []];
    const fleetById = new Map(fleetUnits.map(u => [String(u._id), u]));
    const vehicleById = new Map(vehicles.map(v => [String(v._id), {
      _id: v._id, unitNo: v.unitNumber || v.internalId || v.plateNumber, unitNumber: v.unitNumber,
      internalId: v.internalId, licensePlate: v.plateNumber, plateNumber: v.plateNumber, make: v.make, model: v.model,
    }]));
    const trailerById = new Map(trailers.map(t => [String(t._id), trailerToUnit(t)]));

    const expensesWithMappedFields = expenses.map((exp) => {
      const expObj = exp.toObject();
      const vehicleId = exp.vehicle ? String(exp.vehicle) : null;
      const trailerId = exp.trailer ? String(exp.trailer) : null;
      if (vehicleId) {
        expObj.vehicle = fleetById.get(vehicleId) || vehicleById.get(vehicleId) || expObj.vehicle;
        expObj.truckId = vehicleId;
      }
      if (trailerId) {
        expObj.trailer = fleetById.get(trailerId) || trailerById.get(trailerId) || expObj.trailer;
        expObj.trailerId = trailerId;
      }
      return expObj;
    });

    res.json({ success: true,message:'All expenses', data:expensesWithMappedFields });
  } catch (err) {
    res.status(500).json({success:false,message:err.message });
  }
};

// ✅ Get Signed URL for Expense Receipt
export const getExpenseReceiptSignedUrl = async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { disposition = 'inline' } = req.query; // 'inline' or 'attachment'
    
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const query = { _id: expenseId };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const expense = await Expense.findOne(query);
    
    if (!expense) {
      return res.status(404).json({ 
        success: false, 
        message: "Expense not found" 
      });
    }

    if (!expense.receiptUrl) {
      return res.status(404).json({ 
        success: false, 
        message: "Receipt URL not found for this expense" 
      });
    }

    const fileUrl = expense.receiptUrl;
    const isS3Url = fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.');

    if (isS3Url) {
      try {
        // Extract bucket and key from S3 URL
        const cleanUrl = fileUrl.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let key = decodeURIComponent(urlObj.pathname.substring(1));

        // Handle different S3 URL formats
        if (urlObj.hostname.includes('.s3.')) {
          bucketName = urlObj.hostname.split('.s3.')[0];
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          bucketName = pathParts[0];
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }
        
        // Clean up key
        if (key.includes('?')) {
          key = key.split('?')[0];
        }
        if (key.includes('&')) {
          key = key.split('&')[0];
        }
        
        // Remove signature data that might be appended to filename
        const fileExtensionPattern = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|gif|webp|txt|csv|zip|rar)/i;
        const extensionMatch = key.match(fileExtensionPattern);
        if (extensionMatch) {
          const extensionEndIndex = extensionMatch.index + extensionMatch[0].length;
          const baseKey = key.substring(0, extensionEndIndex);
          const afterExtension = key.substring(extensionEndIndex);
          
          if (afterExtension && /^[A-Za-z0-9+/=]{20,}/.test(afterExtension)) {
            key = baseKey;
          }
        } else {
          key = key.replace(/[A-Za-z0-9+/=]{50,}$/, '').replace(/[+/=]+$/, '');
        }

        // Determine content type from file extension
        const getContentType = (url) => {
          const urlMatch = url.match(/\.([^.?#]+)(\?|#|$)/);
          if (!urlMatch) return 'application/octet-stream';
          
          const ext = urlMatch[1].toLowerCase();
          const typeMap = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'txt': 'text/plain',
            'csv': 'text/csv',
          };
          
          return typeMap[ext] || 'application/octet-stream';
        };

        const contentType = getContentType(fileUrl);
        const contentDisposition = disposition === 'attachment' 
          ? `attachment; filename="${encodeURIComponent('receipt')}"` 
          : 'inline';
        
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentDisposition: contentDisposition,
          ResponseContentType: contentType,
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        
        return res.json({
          success: true,
          url: signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('Error generating signed URL for expense receipt:', s3Error);
        return res.json({
          success: true,
          url: fileUrl,
          expiresIn: 0
        });
      }
    } else {
      // Not an S3 URL, return as-is
      return res.json({
        success: true,
        url: fileUrl,
        expiresIn: 0
      });
    }
  } catch (err) {
    console.error('Error getting signed expense receipt URL:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Extract Expense Data from Receipt using OpenAI
export const extractReceiptData = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a receipt file (image or PDF)"
      });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    // Read the file buffer (should be in memory with FileUploadMemory)
    let fileBuffer;
    try {
      if (req.file.buffer) {
        // File is in memory (multer memory storage)
        fileBuffer = req.file.buffer;
      } else if (req.file.path) {
        // Fallback: File is on disk (shouldn't happen with memory storage, but handle it)
        if (!fs.existsSync(req.file.path)) {
          console.error('File path does not exist:', req.file.path);
          return res.status(400).json({
            success: false,
            message: "File not found on server"
          });
        }
        fileBuffer = fs.readFileSync(req.file.path);
      } else {
        console.error('File object structure:', {
          hasBuffer: !!req.file.buffer,
          hasPath: !!req.file.path,
          hasLocation: !!req.file.location,
          fileKeys: Object.keys(req.file),
          mimetype: req.file.mimetype,
          originalname: req.file.originalname
        });
        return res.status(400).json({
          success: false,
          message: "Unable to read uploaded file. Expected buffer or path."
        });
      }
    } catch (readError) {
      console.error('Error reading file:', readError);
      return res.status(500).json({
        success: false,
        message: "Error reading file: " + readError.message
      });
    }

    // Extract expense data using OpenAI
    const extractionResult = await extractExpenseFromReceipt(fileBuffer, req.file.mimetype);

    if (!extractionResult.success) {
      return res.status(500).json({
        success: false,
        message: extractionResult.error || "Failed to extract data from receipt",
        data: null
      });
    }

    // No cleanup needed for memory storage

    res.json({
      success: true,
      message: "Receipt data extracted successfully",
      data: extractionResult.data
    });
  } catch (err) {
    console.error('Error extracting receipt data:', err);
    
    // No cleanup needed for memory storage
    
    res.status(500).json({
      success: false,
      message: err.message || "Failed to extract receipt data"
    });
  }
};