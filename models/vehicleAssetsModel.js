import mongoose from "mongoose";

const VehicleAssessmentSchema = new mongoose.Schema({
   vehicle:{type:mongoose.Types.ObjectId,ref:"Vehicle"},
   vin:{type:String},
   licencePlate:{type:String},
   serialNumber:{type:String},
   odoMeter:{type:String},
   ratePlan:{type:String},
   group:{type:String},
   installation:{type:String}
}, { timestamps: true });



const VehicleAssessment = mongoose.model("VehicleAssessment", VehicleAssessmentSchema);
export default VehicleAssessment;
