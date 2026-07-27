import { WorkOrder } from "../../models/driver/workOrderModel.js";
import { Vehicle } from "../../models/driver/vehicleModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";

export async function getCurrentMonthWorkOrderCost(req, res) {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: { totalMonthlyCost: 0 }
      });
    }
    const match = {
      createdAt: { $gte: startOfMonth, $lt: endOfMonth },
    };
    if (companyId) {
      match.company = companyId;
    }

    // Sum estimatedCost for all work orders created this month
    const result = await WorkOrder.aggregate([
      {
        $match: match,
      },
      {
        $group: {
          _id: null,
          totalMonthlyCost: { $sum: "$estimatedCost" },
        },
      },
    ]);

    const totalMonthlyCost = result.length > 0 ? result[0].totalMonthlyCost : 0;

    return res.json({
      success: true,
      message: "Total estimated cost for this month",
      data:{totalMonthlyCost},
    });
  } catch (err) {
    console.error("Error calculating monthly cost:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while calculating monthly cost",
      error: err.message,
    });
  }
}

export async function getRecentWorkOrders(req, res) {
  try {
    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }
    const query = {};
    if (companyId) {
      query.company = companyId;
    }
    
    const recentOrders = await WorkOrder.find(query)
      .populate("vehicleId", "internalId plateNumber make model year vinNumber status odometer") // populate vehicle info
      .sort({ createdAt: -1 }) // latest first
      .limit(10) // only 10 records
      .lean(); // Use lean() for better performance

    return res.json({
      success: true,
      message: "Recent work orders fetched successfully",
      data: recentOrders,
    });
  } catch (err) {
    console.error("Error fetching recent work orders:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
export async function maintenanceCostReport(req, res) {
  try {
    const { vehicleId, year } = req.query;
    const companyId = getUserCompanyId(req.user);
    const report = await getMaintenanceCostReport({ vehicleId, year, companyId });
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getMaintenanceCostReport({ vehicleId, year, companyId }) {
  const match = {};
  if (companyId) match.company = companyId;
  if (vehicleId) match.vehicleId = vehicleId;
  if (year) {
    match.createdAt = {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31`),
    };
  }

  return await WorkOrder.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          vehicleId: "$vehicleId",
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        totalCost: { $sum: "$estimatedCost" },
        workOrders: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "vehicles",
        localField: "_id.vehicleId",
        foreignField: "_id",
        as: "vehicle",
      },
    },
    { $unwind: "$vehicle" },
    {
      $project: {
        _id: 0,
        vehicleId: "$_id.vehicleId",
        plateNumber: "$vehicle.plateNumber",
        year: "$_id.year",
        month: "$_id.month",
        totalCost: 1,
        workOrders: 1,
      },
    },
    { $sort: { year: 1, month: 1 } },
  ]);
}

export const getMaintenanceSchedule = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    if (!isSuperadmin && !companyId) {
      return res.json({ success: true, message: "No company assigned to the current admin.", data: [] });
    }
    const query = {};
    if (companyId) {
      query.company = companyId;
    }
    const vehicles = await Vehicle.find(query, "plateNumber upcomingServices odometer");
    res.json({success:true,data:vehicles,message:"maintanance details"});
  } catch (err) {
    res.status(500).json({success:false,message:err.message, error: err.message });
  }
};
// Create Work Order
export const createWorkOrder = async (req, res) => {
  try {
    // Check if admin/user has company settings (except superadmin)
    if (req.user && req.user.role !== 'superadmin') {
      if (!req.user.company) {
        return res.status(400).json({
          success: false,
          message: "Please complete company settings first before creating work orders. Go to Company Settings to set up your company."
        });
      }
    }

    const {
      vehicleId,
      issue,
      description,
      assignedMechanic,
      estimatedCost,
      estimatedTime,
      unitNumber,
      completionDate,
      odometerReading,
      partsUsed,
      serviceProvider,
      invoiceReference,
      mechanicType,
      externalMechanicName,
      externalMechanicCompany,
      externalMechanicPhone,
      externalMechanicEmail,
    } = req.body;

    // Get company ID for the admin
    const companyId = getUserCompanyId(req.user);

    // Process partsUsed - convert string to array if needed
    let partsUsedArray = null;
    if (partsUsed !== undefined && partsUsed !== null) {
      if (Array.isArray(partsUsed)) {
        partsUsedArray = partsUsed.length > 0 ? partsUsed : null;
      } else if (typeof partsUsed === 'string' && partsUsed.trim() !== '') {
        partsUsedArray = partsUsed.split(',').map(p => p.trim()).filter(Boolean);
        if (partsUsedArray.length === 0) partsUsedArray = null;
      }
    }

    // Build the work order object with all fields - always include new fields so they're saved
    const workOrder = await WorkOrder.create({
      vehicleId,
      issue,
      description: description || null,
      assignedMechanic: assignedMechanic || null,
      estimatedCost: estimatedCost !== undefined ? estimatedCost : null,
      estimatedTime: estimatedTime || null,
      // Always include new fields - set to null if not provided or empty
      unitNumber: (unitNumber !== undefined && unitNumber !== null && unitNumber !== '') ? unitNumber : null,
      completionDate: (completionDate !== undefined && completionDate !== null && completionDate !== '') ? new Date(completionDate) : null,
      odometerReading: (odometerReading !== undefined && odometerReading !== null) ? odometerReading : null,
      partsUsed: partsUsedArray,
      serviceProvider: (serviceProvider !== undefined && serviceProvider !== null && serviceProvider !== '') ? serviceProvider : null,
      invoiceReference: (invoiceReference !== undefined && invoiceReference !== null && invoiceReference !== '') ? invoiceReference : null,
      mechanicType: mechanicType || 'internal',
      externalMechanicName: externalMechanicName || null,
      externalMechanicCompany: externalMechanicCompany || null,
      externalMechanicPhone: externalMechanicPhone || null,
      externalMechanicEmail: externalMechanicEmail || null,
      status: "open",      // always start as open
      repairUpdates: [],    // start empty
      company: companyId    // Associate with admin's company
    });

    res.status(201).json({
      success: true,
      message: "Work order created",
      data: workOrder
    });
  } catch (err) {
    res.status(400).json({ success: false, message: "Server error", error: err.message });
  }
};

// Get All Work Orders
export const getWorkOrders = async (req, res) => {
  try {
    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({ success: true, message: "No company assigned to the current admin.", data: [] });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    
    // Get combined filter (company + trial data filter)
    const query = await getCombinedFilter(req.user, companyFilter) || {};
    
    // Populate vehicleId with all necessary fields and sort by creation date (newest first)
    const workOrders = await WorkOrder.find(query)
      .populate("vehicleId", "internalId plateNumber make model year vinNumber status odometer")
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance
    
    // Ensure all work orders have consistent structure and use vehicle data as fallbacks
    const formattedWorkOrders = workOrders.map(order => {
      // Use vehicle's internalId as fallback for unitNumber if not set
      const unitNumber = (order.unitNumber !== undefined && order.unitNumber !== null && order.unitNumber !== '') 
        ? order.unitNumber 
        : (order.vehicleId?.internalId || null);
      
      // Use vehicle's odometer as fallback for odometerReading if not set
      const odometerReading = (order.odometerReading !== undefined && order.odometerReading !== null)
        ? order.odometerReading 
        : (order.vehicleId?.odometer !== undefined && order.vehicleId.odometer !== null ? order.vehicleId.odometer : null);
      
      // Handle partsUsed - can be array or string
      let partsUsed = null;
      if (order.partsUsed !== undefined && order.partsUsed !== null) {
        if (Array.isArray(order.partsUsed)) {
          partsUsed = order.partsUsed.length > 0 ? order.partsUsed : null;
        } else if (typeof order.partsUsed === 'string' && order.partsUsed.trim() !== '') {
          partsUsed = order.partsUsed;
        }
      }
      
      // Explicitly include all fields to ensure they're in the response
      const formatted = {
        _id: order._id,
        vehicleId: order.vehicleId,
        issue: order.issue,
        status: order.status,
        description: order.description || null,
        assignedMechanic: order.assignedMechanic || null,
        estimatedCost: order.estimatedCost || null,
        estimatedTime: order.estimatedTime || null,
        repairUpdates: order.repairUpdates || [],
        unitNumber: unitNumber,
        completionDate: order.completionDate || null,
        odometerReading: odometerReading,
        partsUsed: partsUsed,
        serviceProvider: order.serviceProvider || null,
        invoiceReference: order.invoiceReference || null,
        mechanicType: order.mechanicType || 'internal',
        externalMechanicName: order.externalMechanicName || null,
        externalMechanicCompany: order.externalMechanicCompany || null,
        externalMechanicPhone: order.externalMechanicPhone || null,
        externalMechanicEmail: order.externalMechanicEmail || null,
        company: order.company,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        __v: order.__v
      };
      
      return formatted;
    });
    
    res.json({success:true,data:formattedWorkOrders,message:"orders"});
  } catch (err) {
    res.status(500).json({success:false,message:"server error", error: err.message });
  }
};

// Get Work Order by ID
export const getWorkOrderById = async (req, res) => {
  try {
    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    if (!isSuperadmin && !companyId) {
      return res.status(404).json({success:false, message: "Work Order not found" });
    }
    const query = { _id: req.params.id };
    if (companyId) {
      query.company = companyId;
    }
    
    const workOrder = await WorkOrder.findOne(query)
      .populate("vehicleId", "internalId plateNumber make model year vinNumber status odometer")
      .lean();
    
    if (!workOrder) return res.status(404).json({success:false, message: "Work Order not found" });
    
    // Ensure consistent structure
    const formattedWorkOrder = {
      ...workOrder,
      unitNumber: workOrder.unitNumber || undefined,
      completionDate: workOrder.completionDate || undefined,
      odometerReading: workOrder.odometerReading || undefined,
      partsUsed: workOrder.partsUsed || undefined,
      serviceProvider: workOrder.serviceProvider || undefined,
      invoiceReference: workOrder.invoiceReference || undefined,
    };
    
    res.json({success:true,message:"order by id",data:formattedWorkOrder});
  } catch (err) {
    res.status(500).json({success:false,message:"server error", error: err.message });
  }
};

// Update Work Order
export const updateWorkOrder = async (req, res) => {
  try {
    const {
      status,
      description,
      assignedMechanic,
      estimatedCost,
      estimatedTime,
      repairUpdate,
      unitNumber,
      completionDate,
      odometerReading,
      partsUsed,
      serviceProvider,
      invoiceReference,
      mechanicType,
      externalMechanicName,
      externalMechanicCompany,
      externalMechanicPhone,
      externalMechanicEmail,
    } = req.body;

    const updateFields = {};
    if (status) updateFields.status = status;
    if (description !== undefined) updateFields.description = description;
    if (assignedMechanic !== undefined) updateFields.assignedMechanic = assignedMechanic;
    if (estimatedCost !== undefined) updateFields.estimatedCost = estimatedCost;
    if (estimatedTime !== undefined) updateFields.estimatedTime = estimatedTime;
    if (unitNumber !== undefined) updateFields.unitNumber = unitNumber;
    if (completionDate !== undefined) {
      updateFields.completionDate = completionDate ? new Date(completionDate) : null;
    }
    if (odometerReading !== undefined) updateFields.odometerReading = odometerReading;
    if (serviceProvider !== undefined) updateFields.serviceProvider = serviceProvider;
    if (invoiceReference !== undefined) updateFields.invoiceReference = invoiceReference;
    if (mechanicType !== undefined) updateFields.mechanicType = mechanicType;
    if (externalMechanicName !== undefined) updateFields.externalMechanicName = externalMechanicName;
    if (externalMechanicCompany !== undefined) updateFields.externalMechanicCompany = externalMechanicCompany;
    if (externalMechanicPhone !== undefined) updateFields.externalMechanicPhone = externalMechanicPhone;
    if (externalMechanicEmail !== undefined) updateFields.externalMechanicEmail = externalMechanicEmail;
    
    // Process partsUsed - convert string to array if needed
    if (partsUsed !== undefined) {
      if (Array.isArray(partsUsed)) {
        updateFields.partsUsed = partsUsed;
      } else if (typeof partsUsed === 'string') {
        updateFields.partsUsed = partsUsed.split(',').map(p => p.trim()).filter(Boolean);
      } else {
        updateFields.partsUsed = [];
      }
    }

    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    if (!isSuperadmin && !companyId) {
      return res.status(403).json({ success: false, message: "No company assigned to the current admin." });
    }
    const query = { _id: req.params.id };
    if (companyId) {
      query.company = companyId;
    }
    
    let workOrder = await WorkOrder.findOneAndUpdate(
      query,
      { $set: updateFields },
      { new: true }
    );

    // If repairUpdate is passed, push it instead of replacing the array
    if (repairUpdate) {
      workOrder.repairUpdates.push({
        time: new Date(),
        note: repairUpdate
      });
      await workOrder.save();
    }

    if (!workOrder) {
      return res.status(404).json({ success: false, message: "Work Order not found" });
    }

    res.json({ success: true, message: "Updated work order", data: workOrder });
  } catch (err) {
    res.status(400).json({ success: false, message: "Server error", error: err.message });
  }
};


// Delete Work Order
export const deleteWorkOrder = async (req, res) => {
  try {
    // Get company filter
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    if (!isSuperadmin && !companyId) {
      return res.status(403).json({success:false,message:"No company assigned to the current admin."});
    }

    const query = { _id: req.params.id };
    if (companyId) {
      query.company = companyId;
    }
    
    const workOrder = await WorkOrder.findOneAndDelete(query);
    if (!workOrder) return res.status(404).json({success:false, message: "Work Order not found" });
    res.json({success:true,message: "Work Order deleted" });
  } catch (err) {
    res.status(500).json({success:false,message:"server error", error: err.message });
  }
};
