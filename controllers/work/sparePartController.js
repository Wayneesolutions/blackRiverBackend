import { SparePart } from "../../models/driver/sparePartModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { Vehicle } from "../../models/driver/vehicleModel.js";
import { Trailer } from "../../models/driver/trailerModel.js";
import { WorkOrder } from "../../models/driver/workOrderModel.js";

// Get all spare parts with usage history (and work order details)
export const getSpareParts = async (req, res) => {
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

    const filter = {};
    if (companyId) {
      filter.company = companyId;
    }

    const parts = await SparePart.find(filter)
      .populate('supplier')
      .populate({
        path: "usageHistory.workOrderId",
        populate: { path: "vehicleId" } // also populate vehicle info inside work order
      })
      .sort({ createdAt: -1 })
      .lean();

    // Get all unique unitNumbers from work orders to fetch Vehicle/Trailer data
    const unitNumbers = new Set();
    parts.forEach(part => {
      part.usageHistory?.forEach(usage => {
        if (usage.workOrderId && typeof usage.workOrderId === 'object' && usage.workOrderId.unitNumber) {
          unitNumbers.add(usage.workOrderId.unitNumber);
        }
      });
    });

    // Fetch Vehicle data for all unitNumbers
    const vehicles = unitNumbers.size > 0
      ? await Vehicle.find({ 
          $or: [
            { unitNumber: { $in: Array.from(unitNumbers) } },
            { internalId: { $in: Array.from(unitNumbers) } },
            { plateNumber: { $in: Array.from(unitNumbers) } }
          ]
        })
          .select("_id unitNumber internalId plateNumber make model vinNumber")
          .lean()
      : [];

    // Fetch Trailer data for all unitNumbers
    const trailers = unitNumbers.size > 0
      ? await Trailer.find({ 
          $or: [
            { unitNumber: { $in: Array.from(unitNumbers) } },
            { trailer: { $in: Array.from(unitNumbers) } },
            { internalId: { $in: Array.from(unitNumbers) } }
          ]
        })
          .select("_id unitNumber trailer internalId plateNumber make model vinNumber")
          .lean()
      : [];

    // Create a map of unitNumber to Vehicle/Trailer for quick lookup
    const unitMap = new Map();
    vehicles.forEach(vehicle => {
      const unitNo = vehicle.unitNumber || vehicle.internalId || vehicle.plateNumber;
      if (unitNo) {
        unitMap.set(unitNo, {
          _id: vehicle._id,
          unitNo: unitNo,
          licensePlate: vehicle.plateNumber,
          makeModel: [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim(),
          make: vehicle.make,
          model: vehicle.model,
          vinNo: vehicle.vinNumber,
          unitType: 'Truck'
        });
      }
    });
    trailers.forEach(trailer => {
      const unitNo = trailer.unitNumber || trailer.trailer || trailer.internalId;
      if (unitNo) {
        unitMap.set(unitNo, {
          _id: trailer._id,
          unitNo: unitNo,
          licensePlate: trailer.plateNumber,
          makeModel: [trailer.make, trailer.model].filter(Boolean).join(' ').trim(),
          make: trailer.make,
          model: trailer.model,
          vinNo: trailer.vinNumber,
          unitType: 'Trailer'
        });
      }
    });

    // Ensure all parts have consistent structure with all fields
    const formattedParts = parts.map(part => {
      // Enhance usage history with FleetUnit data
      const enhancedUsageHistory = (part.usageHistory || []).map(usage => {
        if (usage.workOrderId && typeof usage.workOrderId === 'object') {
          const unitNumber = usage.workOrderId.unitNumber;
          const unit = unitNumber ? unitMap.get(unitNumber) : null;
          
          return {
            ...usage,
            workOrderId: {
              ...usage.workOrderId,
              vehicle: unit?.unitType === 'Truck' ? unit : null,
              trailer: unit?.unitType === 'Trailer' ? unit : null,
              fleetUnit: unit || null // Keep for backward compatibility
            }
          };
        }
        return usage;
      });

      return {
        _id: part._id,
        partNumber: part.partNumber || null,
        partName: part.partName || null,
        description: part.description || null,
        category: part.category || null,
        stockQty: part.stockQty || 0,
        minStockLevel: part.minStockLevel || 0,
        maxStockLevel: part.maxStockLevel || 0,
        buyingPrice: part.buyingPrice || 0,
        sellingPrice: part.sellingPrice || 0,
        purchaseDate: part.purchaseDate || null,
        supplier: part.supplier || null,
        location: part.location || null,
        condition: part.condition || null,
        warrantyPeriod: part.warrantyPeriod || null,
        warrantyExpiry: part.warrantyExpiry || null,
        usageHistory: enhancedUsageHistory,
        company: part.company,
        createdAt: part.createdAt,
        updatedAt: part.updatedAt,
        __v: part.__v
      };
    });

    res.json({
      success: true,
      message: "Spare parts with usage history",
      data: formattedParts
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Get spare part by ID
export const getSparePartById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    if (!isSuperadmin && !companyId) {
      return res.status(404).json({ success: false, message: "Spare part not found" });
    }

    const query = { _id: id };
    if (companyId) {
      query.company = companyId;
    }

    const part = await SparePart.findOne(query)
      .populate('supplier')
      .populate({
        path: "usageHistory.workOrderId",
        populate: { path: "vehicleId" }
      })
      .lean();

    if (!part) {
      return res.status(404).json({ success: false, message: "Spare part not found" });
    }

    // Get all unique unitNumbers from work orders to fetch Vehicle/Trailer data
    const unitNumbers = new Set();
    part.usageHistory?.forEach(usage => {
      if (usage.workOrderId && typeof usage.workOrderId === 'object' && usage.workOrderId.unitNumber) {
        unitNumbers.add(usage.workOrderId.unitNumber);
      }
    });

    // Fetch Vehicle data for all unitNumbers
    const vehicles = unitNumbers.size > 0
      ? await Vehicle.find({ 
          $or: [
            { unitNumber: { $in: Array.from(unitNumbers) } },
            { internalId: { $in: Array.from(unitNumbers) } },
            { plateNumber: { $in: Array.from(unitNumbers) } }
          ]
        })
          .select("_id unitNumber internalId plateNumber make model vinNumber")
          .lean()
      : [];

    // Fetch Trailer data for all unitNumbers
    const trailers = unitNumbers.size > 0
      ? await Trailer.find({ 
          $or: [
            { unitNumber: { $in: Array.from(unitNumbers) } },
            { trailer: { $in: Array.from(unitNumbers) } },
            { internalId: { $in: Array.from(unitNumbers) } }
          ]
        })
          .select("_id unitNumber trailer internalId plateNumber make model vinNumber")
          .lean()
      : [];

    // Create a map of unitNumber to Vehicle/Trailer for quick lookup
    const unitMap = new Map();
    vehicles.forEach(vehicle => {
      const unitNo = vehicle.unitNumber || vehicle.internalId || vehicle.plateNumber;
      if (unitNo) {
        unitMap.set(unitNo, {
          _id: vehicle._id,
          unitNo: unitNo,
          licensePlate: vehicle.plateNumber,
          makeModel: [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim(),
          make: vehicle.make,
          model: vehicle.model,
          vinNo: vehicle.vinNumber,
          unitType: 'Truck'
        });
      }
    });
    trailers.forEach(trailer => {
      const unitNo = trailer.unitNumber || trailer.trailer || trailer.internalId;
      if (unitNo) {
        unitMap.set(unitNo, {
          _id: trailer._id,
          unitNo: unitNo,
          licensePlate: trailer.plateNumber,
          makeModel: [trailer.make, trailer.model].filter(Boolean).join(' ').trim(),
          make: trailer.make,
          model: trailer.model,
          vinNo: trailer.vinNumber,
          unitType: 'Trailer'
        });
      }
    });

    // Enhance usage history with Vehicle/Trailer data
    const enhancedUsageHistory = (part.usageHistory || []).map(usage => {
      if (usage.workOrderId && typeof usage.workOrderId === 'object') {
        const unitNumber = usage.workOrderId.unitNumber;
        const unit = unitNumber ? unitMap.get(unitNumber) : null;
        
        return {
          ...usage,
          workOrderId: {
            ...usage.workOrderId,
            vehicle: unit?.unitType === 'Truck' ? unit : null,
            trailer: unit?.unitType === 'Trailer' ? unit : null,
            fleetUnit: unit || null // Keep for backward compatibility
          }
        };
      }
      return usage;
    });

    const enhancedPart = {
      ...part,
      usageHistory: enhancedUsageHistory
    };

    res.json({
      success: true,
      message: "Spare part fetched successfully",
      data: enhancedPart
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Add spare part
export const createSparePart = async (req, res) => {
  try {
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating spare parts. Go to Company Settings to set up your company."
        });
      }
    }

    // Calculate warranty expiry if purchase date and warranty period are provided
    let warrantyExpiry = null;
    if (req.body.purchaseDate && req.body.warrantyPeriod) {
      const purchaseDate = new Date(req.body.purchaseDate);
      warrantyExpiry = new Date(purchaseDate);
      warrantyExpiry.setMonth(warrantyExpiry.getMonth() + req.body.warrantyPeriod);
    }

    const companyId = getUserCompanyId(req.user);
    
    // Build part data with all fields, ensuring empty strings become null
    const partData = {
      partNumber: req.body.partNumber,
      partName: req.body.partName,
      description: (req.body.description && req.body.description.trim() !== '') ? req.body.description : null,
      category: (req.body.category && req.body.category.trim() !== '') ? req.body.category : null,
      stockQty: req.body.stockQty || 0,
      minStockLevel: req.body.minStockLevel || 0,
      maxStockLevel: req.body.maxStockLevel || 100,
      buyingPrice: req.body.buyingPrice || 0,
      sellingPrice: req.body.sellingPrice || 0,
      purchaseDate: (req.body.purchaseDate && req.body.purchaseDate !== '') ? new Date(req.body.purchaseDate) : null,
      supplier: (req.body.supplier && req.body.supplier !== '') ? req.body.supplier : null,
      location: (req.body.location && req.body.location.trim() !== '') ? req.body.location : null,
      condition: req.body.condition || 'new',
      warrantyPeriod: req.body.warrantyPeriod || 0,
      warrantyExpiry: warrantyExpiry,
      ...(companyId && { company: companyId })
    };

    const part = await SparePart.create(partData);
    const populatedPart = await SparePart.findById(part._id).populate('supplier');

    res.status(201).json({
      success: true,
      message: "Spare part created successfully",
      data: populatedPart
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, error: err.message });
  }
};

// Update spare part
export const updateSparePart = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const existingPart = await SparePart.findById(id);

    if (!existingPart) {
      return res.status(404).json({ success: false, message: "Spare part not found" });
    }

    if (!isSuperadmin && existingPart.company && existingPart.company.toString() !== companyId) {
      return res.status(403).json({ success: false, message: "You do not have permission to modify this spare part." });
    }

    // Calculate warranty expiry if purchase date and warranty period are provided
    let warrantyExpiry = null;
    if (req.body.purchaseDate && req.body.warrantyPeriod) {
      const purchaseDate = new Date(req.body.purchaseDate);
      warrantyExpiry = new Date(purchaseDate);
      warrantyExpiry.setMonth(warrantyExpiry.getMonth() + req.body.warrantyPeriod);
    } else if (req.body.purchaseDate || req.body.warrantyPeriod) {
      // If only one is provided, fetch existing part to calculate
      if (existingPart) {
        const purchaseDate = new Date(req.body.purchaseDate || existingPart.purchaseDate);
        const warrantyPeriod = req.body.warrantyPeriod || existingPart.warrantyPeriod;
        if (purchaseDate && warrantyPeriod) {
          warrantyExpiry = new Date(purchaseDate);
          warrantyExpiry.setMonth(warrantyExpiry.getMonth() + warrantyPeriod);
        }
      }
    }

    // Build update data with all fields, ensuring empty strings become null
    const updateData = {};
    if (req.body.partNumber !== undefined) updateData.partNumber = req.body.partNumber;
    if (req.body.partName !== undefined) updateData.partName = req.body.partName;
    if (req.body.description !== undefined) updateData.description = (req.body.description && req.body.description.trim() !== '') ? req.body.description : null;
    if (req.body.category !== undefined) updateData.category = (req.body.category && req.body.category.trim() !== '') ? req.body.category : null;
    if (req.body.stockQty !== undefined) updateData.stockQty = req.body.stockQty || 0;
    if (req.body.minStockLevel !== undefined) updateData.minStockLevel = req.body.minStockLevel || 0;
    if (req.body.maxStockLevel !== undefined) updateData.maxStockLevel = req.body.maxStockLevel || 100;
    if (req.body.buyingPrice !== undefined) updateData.buyingPrice = req.body.buyingPrice || 0;
    if (req.body.sellingPrice !== undefined) updateData.sellingPrice = req.body.sellingPrice || 0;
    if (req.body.purchaseDate !== undefined) updateData.purchaseDate = (req.body.purchaseDate && req.body.purchaseDate !== '') ? new Date(req.body.purchaseDate) : null;
    if (req.body.supplier !== undefined) updateData.supplier = (req.body.supplier && req.body.supplier !== '') ? req.body.supplier : null;
    if (req.body.location !== undefined) updateData.location = (req.body.location && req.body.location.trim() !== '') ? req.body.location : null;
    if (req.body.condition !== undefined) updateData.condition = req.body.condition || 'new';
    if (req.body.warrantyPeriod !== undefined) updateData.warrantyPeriod = req.body.warrantyPeriod || 0;
    if (warrantyExpiry !== null) updateData.warrantyExpiry = warrantyExpiry;

    const part = await SparePart.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('supplier');

    res.json({
      success: true,
      message: "Spare part updated successfully",
      data: part
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, error: err.message });
  }
};

// Delete spare part
export const deleteSparePart = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const part = await SparePart.findById(id);

    if (!part) {
      return res.status(404).json({ success: false, message: "Spare part not found" });
    }

    if (!isSuperadmin && part.company && part.company.toString() !== companyId) {
      return res.status(403).json({ success: false, message: "You do not have permission to delete this spare part." });
    }

    await SparePart.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Spare part deleted successfully"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Update stock (use part in work order)
export const useSparePart = async (req, res) => {
  try {
    const { id } = req.params;
    const { workOrderId, unitNumber, qtyUsed } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }

    const part = await SparePart.findById(id);
    if (!part) return res.status(404).json({ success: false, message: "Part not found" });

    if (!isSuperadmin && part.company && part.company.toString() !== companyId) {
      return res.status(403).json({ success: false, message: "You do not have permission to update this spare part." });
    }

    if (part.stockQty < qtyUsed) {
      return res.status(400).json({ success: false, message: "Not enough stock" });
    }

    let finalWorkOrderId = workOrderId;

    // If unitNumber is provided instead of workOrderId, find or create a work order for that truck
    if (unitNumber && !workOrderId) {
      // Find the Vehicle or Trailer by unitNumber
      const vehicleQuery = {
        $or: [
          { unitNumber: unitNumber },
          { internalId: unitNumber },
          { plateNumber: unitNumber }
        ],
        ...(companyId ? { company: companyId } : {})
      };
      
      let unit = await Vehicle.findOne(vehicleQuery);
      let unitType = 'Truck';
      
      if (!unit) {
        const trailerQuery = {
          $or: [
            { unitNumber: unitNumber },
            { trailer: unitNumber },
            { internalId: unitNumber }
          ],
          ...(companyId ? { company: companyId } : {})
        };
        unit = await Trailer.findOne(trailerQuery);
        unitType = 'Trailer';
      }

      if (!unit) {
        return res.status(404).json({ success: false, message: `Vehicle or Trailer with unit number "${unitNumber}" not found` });
      }

      // Try to find an existing open or in-progress work order for this truck
      const existingWorkOrder = await WorkOrder.findOne({
        unitNumber: unitNumber,
        ...(companyId ? { company: companyId } : {}),
        status: { $in: ['open', 'inprogress'] }
      }).sort({ createdAt: -1 });

      if (existingWorkOrder) {
        finalWorkOrderId = existingWorkOrder._id;
      } else {
        // Create a new work order for this unit
        const newWorkOrder = await WorkOrder.create({
          vehicleId: unitType === 'Truck' ? unit._id : undefined,
          trailerId: unitType === 'Trailer' ? unit._id : undefined,
          unitNumber: unitNumber,
          issue: `Spare part usage - ${part.partName}`,
          status: 'open',
          description: `Spare part ${part.partNumber} (${part.partName}) used`,
          ...(companyId ? { company: companyId } : {})
        });
        finalWorkOrderId = newWorkOrder._id;
      }
    }

    if (!finalWorkOrderId) {
      return res.status(400).json({ success: false, message: "Either workOrderId or unitNumber must be provided" });
    }

    part.stockQty -= qtyUsed;
    part.usageHistory.push({ workOrderId: finalWorkOrderId, qtyUsed });

    await part.save();
    const populatedPart = await SparePart.findById(part._id)
      .populate('supplier')
      .populate({
        path: "usageHistory.workOrderId",
        populate: { path: "vehicleId" }
      });

    res.json({
      success: true,
      message: "Part used successfully",
      data: populatedPart
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
