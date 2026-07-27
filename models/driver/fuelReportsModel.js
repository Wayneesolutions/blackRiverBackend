import mongoose from "mongoose";

const fuelReportSchema = new mongoose.Schema({
    reporter:{type:mongoose.Types.ObjectId,ref:"User"},
    driver:{type:mongoose.Types.ObjectId,ref:"User"}, // Keep for backward compatibility
    vehicle:{type:mongoose.Types.ObjectId,ref:"FleetUnit"}, // Primary reference to FleetUnit
    order:{type:mongoose.Types.ObjectId,ref:"Order",default:null}, // Keep for backward compatibility
    // New fields
    state:{type:String},
    city:{type:String}, // City name
    cityLocation:{type:String}, // Alias for city
    paymentNotes:{type:String}, // Payment notes/remarks
    product:{type:String}, // Product type (Truck Diesel, Reefer Diesel, DEF, etc.)
    unit:{type:mongoose.Types.ObjectId,ref:"FleetUnit"}, // Same as vehicle, but clearer naming
    types:[{type:String}], // Dynamic array of fuel types
    fuelAmounts:[{type:Number}], // Dynamic array matching types
    transactionAmount:{type:Number},
    currentOdometer:{type:String},
    units:[{type:String}], // Dynamic array of units (legacy)
    measurementUnit:{type:String}, // Single measurement unit (e.g., L, gal)
    currency:{type:String,enum:['USA','CAD'],default:'USA'},
    date:{type:Date,default:Date.now},
    fuelVendors:[{type:String}], // Dynamic array of fuel vendors (legacy)
    fuelVendor:{type:String}, // Single fuel vendor
    fuelAmount:{type:Number}, // Fuel amount
    transactionNumber:{type:String,unique:true}, // Auto-generated with timestamp
    // Legacy fields (keep for backward compatibility)
    odometer:{type:String},
    cost:{type:String},
    volume:{type:String},
    type:{type:String},
    location:{address:{type:String},longitude:{type:String},latitude:{type:String}},
    status:{type:String,enum:['approved','pending','rejected'],default:'pending'},
    company:{type:mongoose.Types.ObjectId,ref:"CompanySettings",index:true}
}, { timestamps: true });



const FuelReport = mongoose.model("FuelReport", fuelReportSchema);
export default FuelReport;
