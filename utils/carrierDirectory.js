// Carriers live in two places: the Vendor collection (type "Carrier") that the order form's
// carrier picker and Accounts Payable read, and the Customer page (User, role "customer",
// customerDetails.customerType "Carrier") where the client looks for them ("could not locate
// where are carriers and customs brokers" - 19 Nov). These helpers keep both in step, matched
// by name inside the company.
import Vendor from "../models/vendorModel.js";
import { User } from "../models/driver/userModel.js";

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sameName = (name) => ({ $regex: `^${escapeRegex(String(name).trim())}$`, $options: "i" });

export const CUSTOMER_CATEGORIES = [
  "Customer", "Shipper", "Receiver", "Shipper-Receiver", "Broker",
  "Customs Broker", "Carrier", "Vendor", "Other",
];

/** Vendor(type Carrier) for a Customer-page carrier. Never throws. */
export const ensureCarrierVendor = async ({ companyId, name, phone, email, address }) => {
  try {
    if (!companyId || !name || !String(name).trim()) return null;
    const existing = await Vendor.findOne({ company: companyId, type: "Carrier", name: sameName(name) });
    if (existing) {
      let changed = false;
      if (phone && !existing.phone) { existing.phone = phone; changed = true; }
      if (email && !existing.email) { existing.email = email; changed = true; }
      if (address && !existing.address) { existing.address = address; changed = true; }
      if (existing.status === "inactive") { existing.status = "active"; changed = true; }
      if (changed) await existing.save();
      return existing;
    }
    return await Vendor.create({
      name: String(name).trim(), phone: phone || "", email: email || "", address: address || "",
      type: "Carrier", status: "active", company: companyId,
    });
  } catch (err) {
    console.warn("ensureCarrierVendor:", err.message);
    return null;
  }
};

/** Customer-page entry (category Carrier) for a carrier added from the order form. Never throws. */
export const ensureCarrierCustomer = async ({ companyId, name, phone, email, address }) => {
  try {
    if (!companyId || !name || !String(name).trim()) return null;
    const existing = await User.findOne({ company: companyId, role: "customer", name: sameName(name) }).select("_id").lean();
    if (existing) return existing;
    return await User.create({
      name: String(name).trim(),
      email: email || undefined,
      phone: phone || undefined,
      role: "customer",
      company: companyId,
      joinDate: new Date(),
      customerDetails: {
        customerType: "Carrier",
        emailPrimary: email || undefined,
        phonePrimary: phone || undefined,
        address: address || undefined,
      },
    });
  } catch (err) {
    console.warn("ensureCarrierCustomer:", err.message);
    return null;
  }
};

/** Carriers that exist only as vendors get a Customer-page entry (one query when nothing is missing). */
export const backfillCarrierCustomers = async (companyId) => {
  try {
    if (!companyId) return;
    const vendors = await Vendor.find({ company: companyId, type: "Carrier", status: { $ne: "inactive" } }).select("name phone email address").lean();
    if (!vendors.length) return;
    const customers = await User.find({ company: companyId, role: "customer" }).select("name").lean();
    const have = new Set(customers.map(c => String(c.name || "").trim().toLowerCase()));
    for (const v of vendors) {
      if (!v.name || have.has(String(v.name).trim().toLowerCase())) continue;
      await ensureCarrierCustomer({ companyId, name: v.name, phone: v.phone, email: v.email, address: v.address });
      have.add(String(v.name).trim().toLowerCase());
    }
  } catch (err) {
    console.warn("backfillCarrierCustomers:", err.message);
  }
};
