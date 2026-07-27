import mongoose from "mongoose";

const placeSchema = new mongoose.Schema({
    name:{type:String},
    street1:{type:String},
    street2:{type:String},
    neighbourHood:{type:String},
    building:{type:String},
    securityAccessCode:{type:String},
    postalCode:{type:String},
    city:{type:String},
    state:{type:String},
    country:{type:String},
    status:{type:String,enum:['active','inactive'],default:'active'},
    currentLocation:{address:{type:String},longitude:{type:String},latitude:{type:String}},
    phone:{type:String},
    // Company association for data isolation
    company: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "CompanySettings" 
    },
}, { timestamps: true });



const Place = mongoose.model("Place", placeSchema);
export default Place;
