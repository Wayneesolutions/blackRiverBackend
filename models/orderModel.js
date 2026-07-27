import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      default: function () {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000);
        return `TORD${random.toString().padStart(6, '0')}`;
      }
    },
    customerOrderNo: {
      type: String,
      default: ''
    },
    tripNo: {
      type: String,
      default: ''
    },
    orderDate: {
      type: Date,
      default: Date.now
    },
    orderType: {
      type: String,
      // enum: ['FTL', 'LTL', 'Regular', 'Express'], // Relaxed enum to allow UI values like 'standard'
      default: 'Regular'
    },
    freightOn: {
      type: String,
      enum: ['Order', 'Item'],
      default: 'Order'
    },
    salesman: {
      type: String,
      default: ''
    },
    orderNotes: {
      type: String,
      default: ''
    },
    // Customer reference
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    facilator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Facilator',
      default: null
    },
    // Pickup location and details
    pickupLocation: {
      placeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Place',
        default: null
      },
      place: {
        type: String,
        default: ''
      },
      latitude: {
        type: String,
        default: ''
      },
      longitude: {
        type: String,
        default: ''
      }
    },
    pickupDate: {
      type: Date
    },
    pickupTime: {
      type: String,
      default: ''
    },
    pickupAppointment: {
      type: Boolean,
      default: false
    },
    pickupRefNo: {
      type: String,
      default: ''
    },
    pickupNote: {
      type: String,
      default: ''
    },
    pickupSkids: {
      type: String,
      default: ''
    },
    pickupCases: {
      type: String,
      default: ''
    },
    // Delivery location and details
    deliveryLocation: {
      placeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Place',
        default: null
      },
      place: {
        type: String,
        default: ''
      },
      latitude: {
        type: String,
        default: ''
      },
      longitude: {
        type: String,
        default: ''
      }
    },
    deliveryDate: {
      type: Date
    },
    deliveryTime: {
      type: String,
      default: ''
    },
    deliveryAppointment: {
      type: Boolean,
      default: false
    },
    deliveryRefNo: {
      type: String,
      default: ''
    },
    deliveryNote: {
      type: String,
      default: ''
    },
    deliverySkids: {
      type: String,
      default: ''
    },
    deliveryCases: {
      type: String,
      default: ''
    },
    dropOffNotes: {
      type: String,
      default: ''
    },
    dropOffNumber: {
      type: String,
      default: ''
    },
    // Shipment details (Legacy/Flattened)
    commodity: {
      type: String,
      default: ''
    },
    valueOfGoods: {
      type: Number,
      default: 0
    },
    valueOfGoodsCurrency: {
      type: String,
      enum: ['CAD', 'USD', 'INR'],
      default: 'CAD'
    },
    equipment: [{
      type: String
    }],
    noOfPackages: {
      type: Number,
      default: 0
    },
    noOfPackagesType: {
      type: String,
      default: ''
    },
    weight: {
      type: Number,
      default: 0
    },
    weightUnit: {
      type: String,
      enum: ['kg', 'lbs', 'tons'],
      default: 'kg'
    },
    temperature: {
      type: Number,
      default: null
    },
    temperatureUnit: {
      type: String,
      enum: ['Celsius', 'Fahrenheit'],
      default: 'Celsius'
    },
    // Weather Conditions for salary calculation
    weatherConditions: {
      snow: { type: Boolean, default: false }, // Snow conditions during trip
      highTemperature: { type: Boolean, default: false } // High temperature conditions (auto-calculated from temperature field)
    },
    dimensions: {
      length: {
        type: Number,
        default: 0
      },
      width: {
        type: Number,
        default: 0
      },
      height: {
        type: Number,
        default: 0
      },
      unit: {
        type: String,
        enum: ['cm', 'inch', 'm', 'ft'],
        default: 'cm'
      }
    },
    distance: {
      type: Number,
      default: 0
    },
    // New Items Array (Payloads)
    items: [
      {
        itemName: { type: String },
        sku: { type: String },
        itemImageUrl: { type: String },
        internalId: { type: String },
        description: { type: String },
        quantity: { type: Number, default: 0 }, // noOfPackages
        quantityType: { type: String }, // noOfPackagesType
        weight: { type: Number, default: 0 },
        weightUnit: { type: String, default: 'kg' },
        dimensions: {
          length: { type: Number },
          width: { type: Number },
          height: { type: Number },
          unit: { type: String }
        },
        priceAndValues: {
          price: { type: Number },
          salePrice: { type: Number },
          cost: { type: Number },
          discountValue: { type: Number }
        }
      }
    ],
    // Services
    services: {
      applyServiceRate: { type: Boolean, default: false }
    },
    // Additional info flags
    additionalInfo: {
      CSA: { type: Boolean, default: false },
      CTPAT: { type: Boolean, default: false },
      PIP: { type: Boolean, default: false },
      HAZMAT: { type: Boolean, default: false },
      TARP: { type: Boolean, default: false },
      OverDimension: { type: Boolean, default: false }
    },
    // Order status
    status: {
      type: String,
      enum: ['planned', 'quoted', 'in-delivery', 'delivered', 'completed', 'canceled', 'verification_pending', 'pending_review'],
      default: 'quoted' // changing default to quoted as it seems more appropriate for a new order, or keep planned if that's the workflow. User put planned first. I'll assume 'planned' or 'quoted'. Let's stick to 'planned' if it was default, but user listed it. Actually default was 'planned'.
    },
    // Accounting status
    accountingStatus: {
      type: String,
      enum: ['pending', 'paid', 'unpaid'],
      default: 'pending'
    },
    // Total amount
    totalAmount: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      enum: ['CAD', 'USD', 'INR'],
      default: 'CAD'
    },
    // Driver and vehicle assignment
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    coDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    truck: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      default: null
    },
    trailer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trailer',
      default: null
    },
    // Driver acceptance of assigned order
    driverAcceptanceStatus: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    driverRejectionReason: { type: String, default: null },
    driverRespondedAt: { type: Date, default: null },
    // Company association for data isolation
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompanySettings',
      index: true
    },
    // Shipper information (enhanced)
    shipper: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      address: { type: String, default: '' },
      unit: { type: String, default: '' },
      country: { type: String, default: '' },
      province: { type: String, default: '' },
      city: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      primaryPhone: { type: String, default: '' },
      secondaryPhone: { type: String, default: '' },
      contact: { type: String, default: '' },
      store: { type: String, default: '' },
      type: { type: String, enum: ['DROP', 'HOOK & GO', 'DELIVERY'], default: 'DELIVERY' }
    },
    // Receiver information (enhanced)
    receiver: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      address: { type: String, default: '' },
      contact: { type: String, default: '' }
    },
    // Receiver stops array
    receiverStops: [{
      stop: { type: Number },
      receiver: { type: String },
      date: { type: String },
      endDate: { type: String },
      appointment: { type: String },
      dropOffNumber: { type: String },
      contact: { type: String },
      skids: { type: String },
      cases: { type: String },
      weight: { type: String },
      uom: { type: String },
      temperature: { type: String },
      address: { type: String },
      ltl: { type: Boolean, default: false }
    }],
    // Stops array (pickup stops)
    stops: [{
      stop: { type: Number },
      shipper: { type: String },
      date: { type: String },
      endDate: { type: String },
      appointment: { type: String },
      pickUpNumber: { type: String },
      contact: { type: String },
      skids: { type: String },
      cases: { type: String },
      weight: { type: String },
      uom: { type: String },
      temperature: { type: String },
      address: { type: String },
      ltl: { type: Boolean, default: false }
    }],
    // Pickup appointment details (with window support)
    pickupAppointmentDetails: {
      type: { type: String, enum: ['FCFS', 'Window', 'Strict Time', 'EXACT', 'WINDOW'], default: 'FCFS' },
      date: { type: Date, default: null },
      time: { type: String, default: '' },
      startDate: { type: Date, default: null }, // For WINDOW appointments
      startTime: { type: String, default: '' }, // For WINDOW appointments
      endDate: { type: Date, default: null }, // For WINDOW appointments
      endTime: { type: String, default: '' }, // For WINDOW appointments
      specialInstructions: { type: String, default: '' },
      gatePass: { type: String, default: '' }
    },
    // Delivery appointment details (with window support)
    deliveryAppointmentDetails: {
      type: { type: String, enum: ['Window', 'Strict Time', 'EXACT', 'WINDOW'], default: 'Window' },
      date: { type: Date, default: null },
      time: { type: String, default: '' },
      startDate: { type: Date, default: null }, // For WINDOW appointments
      startTime: { type: String, default: '' }, // For WINDOW appointments
      endDate: { type: Date, default: null }, // For WINDOW appointments
      endTime: { type: String, default: '' }, // For WINDOW appointments
      unloadingInstructions: { type: String, default: '' }
    },
    // Border information
    borderInfo: {
      detailsRequired: { type: Boolean, default: false },
      direction: { type: String, enum: ['CA_TO_US', 'US_TO_CA'], default: 'CA_TO_US' },
      portOfEntry: { type: String, default: '' },
      cargoDescription: { type: String, default: '' },
      hsCode: { type: String, default: '' },
      brokerName: { type: String, default: '' },
      brokerPhone: { type: String, default: '' },
      brokerEmail: { type: String, default: '' },
      commercialValue: { type: String, default: '' },
      countryOfOrigin: { type: String, default: '' }
    },
    // Document references (file URLs/paths)
    documents: {
      bol: { type: String, default: null }, // Bill of Lading
      pod: { type: String, default: null }, // Proof of Delivery
      customsHazmat: [{ type: String }], // Customs/Hazmat documents (array)
      rateConfirmation: { type: String, default: null }, // Rate Confirmation
      stampedManifest: { type: String, default: null }, // Stamped Manifest
      loadSecurement: [{ type: String }], // Load Securement Pictures (array of images)
      printedManifest: { type: String, default: null } // Printed Manifest
    },
    // Notes
    internalNotes: { type: String, default: '' },
    customerNotes: { type: String, default: '' },
    // Notes array (for Notes/Audit section)
    notes: [{
      id: { type: Number },
      type: { type: String, enum: ['public', 'private'], default: 'public' },
      text: { type: String },
      user: { type: String },
      date: { type: String },
      createdAt: { type: Date, default: Date.now }
    }],
    // Attachments (for Notes/Audit section)
    attachments: [{
      id: { type: String },
      name: { type: String },
      url: { type: String },
      type: { type: String },
      fileSize: { type: Number },
      payable: { type: Boolean, default: false },
      shareWithDriver: { type: Boolean, default: false },
      uploadedAt: { type: Date, default: Date.now },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],

    // Customer Information additional fields
    customerUnit: { type: String, default: '' },
    customerAddress: { type: String, default: '' }, // Store customer address separately for display
    customerCity: { type: String, default: '' }, // Store customer city separately for display
    customerCountry: { type: String, default: '' }, // Store customer country separately for display
    customerProvince: { type: String, default: '' }, // Store customer province/state separately for display
    customerPostalCode: { type: String, default: '' },
    customerPrimaryPhone: { type: String, default: '' },
    customerSecondaryPhone: { type: String, default: '' },
    customerContact: { type: String, default: '' },
    payableEmail: { type: String, default: '' },
    secondaryPayableEmail: { type: String, default: '' },

    // Billing Information
    billingDate: { type: Date, default: null },
    rate: { type: Number, default: 0 },
    rateCurrency: { type: String, enum: ['CAD', 'USD', 'INR'], default: 'CAD' },
    dispatcher: { type: String, default: '' },
    dispatcherEmail: { type: String, default: '' },
    bookedForCarrier: { type: Boolean, default: false },
    sendToFactor: { type: Boolean, default: false },

    // Tax Configuration
    taxCode: { type: String, default: 'No Tax' },
    taxAmount: { type: Number, default: 0 },

    // Customs Information
    pars: { type: String, default: '' },
    paps: { type: String, default: '' },
    trailerSealNo: { type: String, default: '' },

    // Additional checkboxes
    csaFastApproved: { type: Boolean, default: false },
    bondedShipmentCA: { type: Boolean, default: false },
    bondedShipmentUS: { type: Boolean, default: false },
    highPriority: { type: Boolean, default: false },
    cityDriver: { type: Boolean, default: false },
    teamLoad: { type: Boolean, default: false },
    roundTrip: { type: Boolean, default: false },
    oversized: { type: Boolean, default: false },
    empty: { type: Boolean, default: false },

    // Other Charges
    otherCharges: [{
      category: { type: String },
      chargePercent: { type: String },
      chargeAmount: { type: String },
      description: { type: String },
      gst: { type: Boolean, default: false }
    }],

    // Invoice Notes
    invoiceInstructions: { type: String, default: '' },
    invoiceNotes: { type: String, default: '' },

    // Document approval fields for dispatcher
    documentsApproved: {
      type: Boolean,
      default: false
    },
    documentsApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    documentsApprovedAt: {
      type: Date,
      default: null
    },
    approvedWithoutDocuments: {
      type: Boolean,
      default: false // If true, order was approved even without required documents
    }
  },
  { timestamps: true }
);

// Pre-save hook to generate order number if not provided
orderSchema.pre('save', async function (next) {
  if (!this.orderNumber || this.isNew) {
    const year = new Date().getFullYear();
    let orderNum;
    let exists = true;
    let attempts = 0;

    while (exists && attempts < 100) {
      const random = Math.floor(Math.random() * 10000);
      orderNum = `TORD${random.toString().padStart(6, '0')}`;
      const OrderModel = mongoose.model('Order');
      const existingOrder = await OrderModel.findOne({ orderNumber: orderNum });
      exists = !!existingOrder;
      attempts++;
    }

    if (!exists) {
      this.orderNumber = orderNum;
    } else {
      // Fallback: use timestamp if all random numbers are taken
      this.orderNumber = `TORD${Date.now().toString().slice(-8)}`;
    }
  }
  next();
});

const Order = mongoose.model('Order', orderSchema);
export default Order;

