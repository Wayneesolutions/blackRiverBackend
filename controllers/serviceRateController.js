import ServiceRate from "../models/serviceRate.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { getCombinedFilter } from "../utils/trialDataFilter.js";

// Create Service Rate
export const createServiceRate = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);

    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(403).json({success:false, message: "No company assigned to the current admin." });
    }

    const serviceRate = new ServiceRate({
      ...req.body,
      company: companyId,
      createdBy: req.user?._id
    });
    await serviceRate.save();
    res.status(201).json({success:true, message: "Service Rate created successfully", data: serviceRate });
  } catch (error) {
    res.status(400).json({success:false, message: "Error creating service rate", error: error.message });
  }
};

// Get All Service Rates
export const getServiceRates = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(200).json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    const serviceRates = await ServiceRate.find(baseFilter || {});
    res.status(200).json({success:true,data:serviceRates});
  } catch (error) {
    res.status(500).json({success:false, message: "Error fetching service rates", error: error.message });
  }
};

// Update Service Rate
export const updateServiceRate = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = isSuperadmin ? { _id: id } : { _id: id, company: companyId };

    const serviceRate = await ServiceRate.findOneAndUpdate(query, req.body, { new: true });
    if (!serviceRate) {
      return res.status(404).json({success:false, message: "Service Rate not found" });
    }
    res.status(200).json({success:true, message: "Service Rate updated successfully", data: serviceRate });
  } catch (error) {
    res.status(400).json({ success:false, message: "Error updating service rate", error: error.message });
  }
};

// Delete Service Rate
export const deleteServiceRate = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = isSuperadmin ? { _id: id } : { _id: id, company: companyId };

    const serviceRate = await ServiceRate.findOneAndDelete(query);
    if (!serviceRate) {
      return res.status(404).json({success:false, message: "Service Rate not found" });
    }
    res.status(200).json({success:true, message: "Service Rate deleted successfully" });
  } catch (error) {
    res.status(500).json({success:false, message: "Error deleting service rate", error: error.message });
  }
};
