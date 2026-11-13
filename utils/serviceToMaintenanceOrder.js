import mongoose from "mongoose";
import { GeneralRepair } from "../models/fleet/generalRepairModel.js";
import { User } from "../models/driver/userModel.js";

const toTitle = (value) =>
  String(value || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const normalizeParts = (parts) => {
  if (!Array.isArray(parts)) return [];
  return parts
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      partId: p.partId && mongoose.Types.ObjectId.isValid(p.partId) ? p.partId : null,
      partName: String(p.partName || "").trim(),
      partNumber: String(p.partNumber || "").trim(),
      quantity: Math.max(1, Number(p.quantity) || 1),
      cost: Math.max(0, Number(p.cost) || 0),
    }));
};

/**
 * When a scheduled service assigned to a mechanic is completed, log it in the
 * Maintenance Orders Log (GeneralRepair) so the fleet manager sees it there and
 * the mechanic sees it under Completed Orders.
 *
 * Idempotent: one maintenance order per service (linked by sourceServiceId).
 * Never throws — a failure here must not block the service completion itself.
 */
export const logCompletedServiceAsMaintenanceOrder = async (service, user) => {
  try {
    if (!service?._id) return null;

    const existing = await GeneralRepair.findOne({ sourceServiceId: service._id }).select("_id").lean();
    if (existing) return existing;

    const vehicle = service.vehicleId && typeof service.vehicleId === "object" ? service.vehicleId : null;

    // Resolve who did the work
    let serviceProviderId = null;
    let serviceProvider = "";
    const isExternal = service.mechanicType === "external";
    if (isExternal) {
      serviceProvider = service.externalMechanicName || service.externalMechanicCompany || "External Mechanic";
    } else if (service.assignedMechanic && mongoose.Types.ObjectId.isValid(service.assignedMechanic)) {
      serviceProviderId = service.assignedMechanic;
      const mech = await User.findById(service.assignedMechanic).select("name").lean();
      serviceProvider = mech?.name || "";
    }
    if (!serviceProvider && user?.role === "Maintenance Crew (Mechanics)") {
      serviceProviderId = serviceProviderId || user._id;
      serviceProvider = user.name || "";
    }
    if (!serviceProvider) serviceProvider = service.serviceProvider || service.assignedMechanic || "Fleet Team";

    const parts = normalizeParts(service.parts);
    const partsTotal = parts.reduce((sum, p) => sum + p.quantity * p.cost, 0);
    const total = partsTotal > 0 ? partsTotal : Number(service.amount) || 0;

    const serviceLabel = toTitle(service.serviceType) || "Scheduled Service";
    const description = service.description
      ? `${serviceLabel} — ${service.description}`
      : `${serviceLabel} (scheduled service)`;

    const now = new Date();
    const unitNumber = service.unitNumber || vehicle?.internalId || vehicle?.plateNumber || "N/A";
    const makeModel = service.makeModel || [vehicle?.make, vehicle?.model].filter(Boolean).join(" ").trim() || undefined;

    const order = await GeneralRepair.create({
      serviceDate: service.serviceDate || now,
      unitNumber,
      makeModel,
      vinLicensePlate: vehicle?.vinNumber || vehicle?.plateNumber || undefined,
      description,
      odometer: service.odometer != null ? Number(service.odometer) : (vehicle?.odometer ?? undefined),
      notes: service.notes || undefined,
      serviceProvider,
      serviceProviderId,
      mechanicType: isExternal ? "external" : "internal",
      externalMechanicCompany: service.externalMechanicCompany || undefined,
      externalMechanicPhone: service.externalMechanicPhone || undefined,
      externalMechanicEmail: service.externalMechanicEmail || undefined,
      invoiceNumber: service.invoiceNumber || undefined,
      amount: total || undefined,
      unitSource: vehicle ? "vehicle" : "unknown",
      unitReference: vehicle?._id || undefined,
      company: service.company || undefined,
      createdBy: user?._id,
      updatedBy: user?._id,
      status: "completed",
      repairDetails: service.notes || description,
      completedParts: parts,
      completionTotalAmount: total,
      completionDate: now,
      completedBy: user?._id,
      verificationStatus: "not-verified",
      sourceServiceId: service._id,
    });

    console.log(`✅ Logged completed service ${service._id} as maintenance order ${order._id}`);
    return order;
  } catch (error) {
    console.error("❌ Failed to log completed service as maintenance order:", error.message);
    return null;
  }
};
