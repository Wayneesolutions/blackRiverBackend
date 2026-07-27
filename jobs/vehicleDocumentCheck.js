import cron from "node-cron";
import VehicleDocuments from "../models/driver/vehicleDocumentsModel.js";
import mongoose from "mongoose";

// ✅ Run every day at midnight
cron.schedule("0 0 * * *", async () => {
  console.log("🔄 Running daily document expiry check...");

  try {
    const today = new Date();

    // 1️⃣ Expired: expiryDate < today
    // Exclude documents with ignoreExpiration: true
    await VehicleDocuments.updateMany(
      { 
        expiryDate: { $lt: today.toISOString().split("T")[0] },
        ignoreExpiration: { $ne: true } // Exclude documents with ignoreExpiration: true
      },
      { $set: { status: "expired" } }
    );

    // 2️⃣ Expiring soon: expiryDate within 30 days
    // Exclude documents with ignoreExpiration: true
    const next30Days = new Date();
    next30Days.setDate(today.getDate() + 30);

    await VehicleDocuments.updateMany(
      {
        expiryDate: {
          $gte: today.toISOString().split("T")[0],
          $lte: next30Days.toISOString().split("T")[0],
        },
        status: { $ne: "expired" }, // avoid overwriting expired
        ignoreExpiration: { $ne: true } // Exclude documents with ignoreExpiration: true
      },
      { $set: { status: "expiring-soon" } }
    );

    console.log("✅ Document expiry statuses updated");
  } catch (error) {
    console.error("❌ Error running expiry check:", error.message);
  }
});
