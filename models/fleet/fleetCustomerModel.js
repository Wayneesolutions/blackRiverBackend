import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    streetAddress1: { type: String, trim: true, default: '' },
    streetAddress2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    provinceState: { type: String, trim: true, default: '' },
    postalZip: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const fleetCustomerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    contactPerson: { type: String, trim: true, default: '' },
    billing: {
      type: addressSchema,
      default: () => ({}),
    },
    sameAsBilling: { type: Boolean, default: true },
    shipping: {
      type: addressSchema,
      default: () => ({}),
    },
    notes: { type: String, trim: true, default: '' },
    primaryPaymentMethod: { type: String, trim: true, default: '' },
    terms: { type: String, trim: true, default: '' },
    customerType: { type: String, trim: true, default: '' },
    businessNumber: { type: String, trim: true, default: '' },
    assignDefaultTaxCode: { type: Boolean, default: false },
    openingBalanceAmount: { type: Number, default: null },
    openingBalanceAsOf: { type: Date, default: null },
    documents: [
      {
        name: { type: String },
        size: { type: Number },
      },
    ],
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompanySettings',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

fleetCustomerSchema.index({ email: 1, company: 1 });

export default mongoose.model('FleetCustomer', fleetCustomerSchema);
