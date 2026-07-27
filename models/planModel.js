import mongoose from "mongoose";

const planSchema = new mongoose.Schema({
  planName: {
    type: String,
    required: true,
    trim: true
  },
  planType: {
    type: String,
    enum: ['lifetime', 'monthly'],
    required: true
  },
  description: {
    type: String,
    default: ''
  },

  // Lifetime pricing options
  lifetime: {
    oneTime: {
      price: { type: Number, default: 0 },
      currency: { type: String, default: 'CAD' }
    },
    installments: {
      threeMonths: {
        price: { type: Number, default: 0 },
        currency: { type: String, default: 'CAD' },
        enabled: { type: Boolean, default: false }
      },
      sixMonths: {
        price: { type: Number, default: 0 },
        currency: { type: String, default: 'CAD' },
        enabled: { type: Boolean, default: false }
      }
    }
  },



  monthly: {
    fullApp: {
      price: { type: Number, default: 0 },
      currency: { type: String, default: 'CAD' },
      enabled: { type: Boolean, default: false }
    },
    truckPricing: {
      tiers: [
        {
          minTrucks: { type: Number, default: 0 },
          maxTrucks: { type: Number, default: 0 },
          monthlyPrice: { type: Number, default: 0 },
          currency: { type: String, default: 'CAD' }
        }
      ],
      extraTruckPrice: { type: Number, default: 0 },
      extraTruckCurrency: { type: String, default: 'CAD' },
      sixMonthBonusDays: { type: Number, default: 15 },
      annualFreeMonths: { type: Number, default: 1 }
    },
    yearly: {
      price: { type: Number, default: 0 },
      currency: { type: String, default: 'CAD' },
      enabled: { type: Boolean, default: false }
    },
  },

  features: [{
    name: String,
    included: { type: Boolean, default: true }
  }],

  // Allowed roles that can be created with this plan
  // If not specified, all roles are allowed
  allowedRoles: {
    type: [String],
    enum: ['driver', 'dispatcher', 'hr', 'contact', 'customer', 'reporter',
      'Maintenance Crew (Mechanics)', 'Fleet Maintenance Manager', 'Compliance Manager', 'safety officer'],
    default: undefined // undefined means all roles allowed
  },

  // Explicitly blocked roles (has priority over allowedRoles)
  blockedRoles: {
    type: [String],
    enum: ['driver', 'dispatcher', 'hr', 'contact', 'customer', 'reporter',
      'Maintenance Crew (Mechanics)', 'Fleet Maintenance Manager', 'Compliance Manager', 'safety officer'],
    default: []
  },

  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },

  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

export const Plan = mongoose.model("Plan", planSchema);

