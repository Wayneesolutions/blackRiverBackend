import mongoose from 'mongoose'

const loadSchema = new mongoose.Schema(
  {
    details: {
      orderType: { type: String, default: '' },
      internalId: { type: String, default: '' },
      customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      },
      facilator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Facilator',
        default: null
      },
      driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      },
      vehicle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vehicle',
        default: null
      },
      adHoc: { type: Number, default: null },
      addMisc: { type: Boolean, default: null },
      dispatchImmediately: { type: Boolean, default: null },
      requiredProof: {
        type: String,
        enums: ['scan', 'signature', 'photo'],
        default: null
      },
      // Load amount/rate
      amount: { type: Number, default: 0 },
      rate: { type: Number, default: 0 },
      // Receiver details
      receiver: {
        name: { type: String },
        email: { type: String },
        phone: { type: String },
        address: { type: String },
        contactPerson: { type: String },
        notes: { type: String }
      }
    },
    route: {
      multipleDropOffs: { type: Boolean, default: null },
      selectPickup: { 
        place:{type:String},
        longitude:{type:String},
        latitude:{type:String},
        placeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', default: null }
      },
      selectDropOff: { 
        place:{type:String},
        longitude:{type:String},
        latitude:{type:String},
        placeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', default: null }
      },
      selectReturn: { type: String, default: null },
      wayPoints: [
        {
           address:{
             place:{type:String},
             longitude:{type:String},
             latitude:{type:String},
             placeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', default: null }
           },
          customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
          },
          dropOff: { type: Boolean, default: false },
          pickup: { type: Boolean, default: false }
        }
      ]
    },
    // Pickup and delivery scheduling for route grouping
    pickupDate: { type: Date },
    pickupTime: { type: String },
    deliveryDate: { type: Date },
    deliveryTime: { type: String },
    pickupAppointment: { type: Boolean, default: false },
    deliveryAppointment: { type: Boolean, default: false },
    pickupRefNo: { type: String },
    deliveryRefNo: { type: String },
    pickupNote: { type: String },
    deliveryNote: { type: String },
    payloads: [
      {
        itemName: { type: String },
        sku: { type: String },
        itemImageUrl: { type: String },
        internalId: { type: String },
        description: { type: String },
        priceAndValues: {
          price: { type: Number },
          salePrice: { type: Number },
          cost: { type: Number },
          discountValue: { type: Number }
        },
        measurementAndWeight: {
          length: { type: Number },
          width: { type: Number },
          height: { type: Number },
          weight: { type: Number }
        }
      }
    ],
    services: {
      applyServiceRate: { type: Boolean }
    },
    notes: {
      type: String
    },
    documents: [
      {
        documentUrl: {
          type: String
        },
        originalName: {
          type: String
        }
      }
    ],
    status:{
      type:String,
      enum: ["planned", "dispatched", "in-delivery", "delivered", "completed"],
      default:'planned'
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "due", "paid"],
      default: "pending"
    },
    paymentDetails: {
      paymentMethod: { type: String },
      paymentReference: { type: String },
      paymentDate: { type: Date },
      paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      notes: { type: String }
    },
    deliveryDocuments: {
      bol: {
        url: { type: String },
        uploadedAt: { type: Date },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
      },
      billOfSale: {
        url: { type: String },
        uploadedAt: { type: Date },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
      },
      pod: {
        url: { type: String },
        uploadedAt: { type: Date },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
      }
    },
    assignedAt: { type: Date, default: null },
  startedAt: { type: Date},
  completedAt: { type: Date},
  liveLocation: {
  latitude: { type: String, default: null },
  longitude: { type: String, default: null },
  updatedAt: { type: Date }
     },
  locationHistory: [
        {
          latitude: String,
          longitude: String,
          timestamp: { type: Date, default: Date.now }
        }
    ],
    // Company association for data isolation
    company: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "CompanySettings",
      index: true // Index for faster queries
    }
  },
  { timestamps: true }
)

const Load = mongoose.model('Load', loadSchema)
export default Load
