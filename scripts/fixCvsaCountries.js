// One-off: put existing CVSA inspections under the country their location names.
// Client (14 Nov): "Texas, USA" inspections showed on the Canada tab.
//   node scripts/fixCvsaCountries.js          → dry run, lists what would change
//   node scripts/fixCvsaCountries.js --apply  → saves the changes
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/mongoConnection.js";
import { CvsaInspection } from "../models/cvsaInspectionModel.js";
import { countryFromInspectionPlace } from "../utils/carrierProfileUtils.js";

const apply = process.argv.includes("--apply");

await connectDB();
const rows = await CvsaInspection.find({}).select("inspectionId country location jurisdiction").lean();
let changed = 0;
for (const row of rows) {
  const placeCountry = countryFromInspectionPlace(row);
  if (placeCountry && placeCountry !== row.country) {
    changed++;
    console.log(`${row.inspectionId}: "${row.location}" ${row.country} → ${placeCountry}`);
    if (apply) await CvsaInspection.updateOne({ _id: row._id }, { $set: { country: placeCountry } });
  }
}
console.log(`${changed} of ${rows.length} inspection(s) ${apply ? "updated" : "would change (run with --apply to save)"}`);
await mongoose.disconnect();
