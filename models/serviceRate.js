import mongoose from "mongoose";

const servicerateSchema = new mongoose.Schema({
   company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      index: true
   },
   serviceName:{type:String},
   client:{type:String},
   price:{type:String},
   duration:{type:String},
   status:{type:String},
   tags:[{type:String}],
   orderType:{type:String},
   rateCalculationMethod:{type:String},
   cashOnDeliver:{type:Boolean},
   cashOnDeliverMethod:{type:String},
   peekHoursPricing: {
      peakHoursStart:{type:String},
      peakHoursEnd:{type:String},
      peakHoursMethod:{type:String},
   },
   serviceRestriction:{type:String},
}, { timestamps: true });



const ServiceRate = mongoose.model("ServiceRate", servicerateSchema);
export default ServiceRate;
