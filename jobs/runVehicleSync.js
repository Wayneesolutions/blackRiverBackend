import cron from "node-cron";
import { syncVehiclesFromGeotab } from "./vehicleSync.js";

// Run every day at 2:00 AM
cron.schedule("0 2 * * *", async () => {
  console.log("⏱ Starting daily vehicle sync job...");
  await syncVehiclesFromGeotab();
});
