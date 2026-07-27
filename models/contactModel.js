import mongoose from "mongoose";

const contactSchema = new mongoose.Schema({
  name:{type:String},
  email:{type:String},
  phone:{type:String},
  title:{type:String},
  internalId:{type:String},
  address:{type:String},
  placeDetails:{
    name:{type:String},
    street1:{type:String},
    street2:{type:String},
    neighbourHood:{type:String},
    building:{type:String},
    SecurityAccessCode:{type:String},
    postalCode:{type:String},
    city:{type:String},
    state:{type:String},
    country:{type:String},
    cordinates:{longitude:{type:String},latitude:{type:String}},
    phone:{type:String}
  },
  avatar:{type:String}
}, { timestamps: true });



const Contact = mongoose.model("Contact", contactSchema);
export default Contact;
