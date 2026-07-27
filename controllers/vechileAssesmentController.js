import VehicleAssessment from "../models/vehicleAssetsModel.js";

// Create Vehicle Assessment
export const createVehicleAssessment = async (req, res) => {
  try {
    const vehicleAssessment = new VehicleAssessment(req.body);
    await vehicleAssessment.save();
    res.status(201).json({ message: "Vehicle Assessment created", data: vehicleAssessment });
  } catch (error) {
    res.status(400).json({ message: "Error creating vehicle assessment", error: error.message });
  }
};

// Get All Vehicle Assessments
export const getVehicleAssessments = async (req, res) => {
  try {
    const assessments = await VehicleAssessment.find().populate("vehicle");
    res.status(200).json(assessments);
  } catch (error) {
    res.status(500).json({ message: "Error fetching assessments", error: error.message });
  }
};

// Get Single Vehicle Assessment by ID
export const getVehicleAssessmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const assessment = await VehicleAssessment.findById(id).populate("vehicle");
    if (!assessment) return res.status(404).json({ message: "Vehicle Assessment not found" });
    res.status(200).json(assessment);
  } catch (error) {
    res.status(500).json({ message: "Error fetching assessment", error: error.message });
  }
};

// Update Vehicle Assessment
export const updateVehicleAssessment = async (req, res) => {
  try {
    const { id } = req.params;
    const assessment = await VehicleAssessment.findByIdAndUpdate(id, req.body, { new: true });
    if (!assessment) return res.status(404).json({ message: "Vehicle Assessment not found" });
    res.status(200).json({ message: "Updated successfully", data: assessment });
  } catch (error) {
    res.status(400).json({ message: "Error updating assessment", error: error.message });
  }
};

// Delete Vehicle Assessment
export const deleteVehicleAssessment = async (req, res) => {
  try {
    const { id } = req.params;
    const assessment = await VehicleAssessment.findByIdAndDelete(id);
    if (!assessment) return res.status(404).json({ message: "Vehicle Assessment not found" });
    res.status(200).json({ message: "Deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting assessment", error: error.message });
  }
};

// Search Vehicle Assessments
export const searchVehicleAssessments = async (req, res) => {
  try {
    const { query } = req.query; // search text
    if (!query) return res.status(400).json({ message: "Search query required" });

    const assessments = await VehicleAssessment.find({
      $or: [
        { vin: { $regex: query, $options: "i" } },
        { licencePlate: { $regex: query, $options: "i" } },
        { serialNumber: { $regex: query, $options: "i" } }
      ]
    }).populate("vehicle");

    // filter by vehicle.name if it exists
    const filtered = assessments.filter(item => {
      return item.vehicle?.name?.toLowerCase().includes(query.toLowerCase());
    });

    // combine mongo results + filtered ones without duplicates
    const combined = [...new Map([...assessments, ...filtered].map(a => [a._id.toString(), a])).values()];

    res.status(200).json(combined);
  } catch (error) {
    res.status(500).json({ message: "Error searching assessments", error: error.message });
  }
};
