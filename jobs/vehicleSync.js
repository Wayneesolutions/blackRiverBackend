import { Vehicle } from "../models/driver/vehicleModel.js";
import { fetchVehicleData } from "../services/geotab.js";

// ------------------- Calculate all services -------------------
export function calculateMaintenance(vehicle) {
  const now = new Date();
  const alerts = [];

  // Define all services with mileage and date intervals
  const services = [
    { key: "oilChange", type: "oil-change", mileageInterval: 5000, monthsInterval: 6 },
    { key: "tireRotation", type: "tire-rotation", mileageInterval: 10000, monthsInterval: null },
    { key: "brakeInspection", type: "brake-inspection", mileageInterval: 20000, monthsInterval: null },
    { key: "generalMaintenance", type: "general-maintenance", mileageInterval: 30000, monthsInterval: null },
    { key: "other", type: "other", mileageInterval: 0, monthsInterval: null },
    { key: "inspection", type: "inspection", mileageInterval: 0, monthsInterval: 12 }
  ];

  for (const s of services) {
    const last = vehicle.lastService?.[s.key] || {};
    const lastMileage = last.mileage || 0;
    const lastDate = last.date ? new Date(last.date) : null;

    let dueMileage = s.mileageInterval ? lastMileage + s.mileageInterval : null;
    let dueDate = s.monthsInterval && lastDate ? new Date(lastDate) : null;
    if (dueDate) dueDate.setMonth(dueDate.getMonth() + s.monthsInterval);

    const isOverdue =
      (dueMileage !== null && vehicle.odometer >= dueMileage) ||
      (dueDate !== null && now >= dueDate);

    alerts.push({
      serviceType: s.type,
      status: isOverdue ? "Overdue" : "Upcoming",
      dueMileage,
      dueDate
    });
  }

  return alerts;
}

// ------------------- Sync vehicles from Geotab -------------------
export async function syncVehiclesFromGeotab() {
  try {
    const vehicles = await Vehicle.find();

    for (const vehicle of vehicles) {
      if (!vehicle.geotabId) continue;

      const geotabData = await fetchVehicleData(vehicle.geotabId);

      // Update upcoming services
      vehicle.upcomingServices = calculateMaintenance(vehicle);

      // Merge Geotab data
      Object.assign(vehicle, geotabData);

      await vehicle.save();
    }

    console.log("✅ Vehicles updated from Geotab");
  } catch (err) {
    console.error("❌ Error syncing vehicles:", err.message);
  }
}
