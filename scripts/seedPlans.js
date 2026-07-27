import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Plan } from '../models/planModel.js';

dotenv.config();

const connectDB = async () => {
  try {
    const mongoURI = process.env.DB || process.env.MONGO_URI || 'mongodb://localhost:27017/logistiq';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const plans = [
  {
    planName: 'Standard Fleet Plan',
    planType: 'monthly',
    description: 'Flexible monthly pricing based on fleet size. Pay only for what you need with full access to all features.',
    monthly: {
      fullApp: { price: 0, currency: 'CAD', enabled: false },
      truckPricing: {
        tiers: [
          { minTrucks: 1, maxTrucks: 10, monthlyPrice: 199, currency: 'CAD' },
          { minTrucks: 11, maxTrucks: 20, monthlyPrice: 399, currency: 'CAD' },
        ],
        extraTruckPrice: 19.99,
        extraTruckCurrency: 'CAD',
        sixMonthBonusDays: 15,
        annualFreeMonths: 1,
      },
      yearly: { price: 0, currency: 'CAD', enabled: false },
    },
    features: [
      { name: 'Dispatch & Load Management', included: true },
      { name: 'Driver Management', included: true },
      { name: 'Fleet Maintenance', included: true },
      { name: 'Real-time GPS Tracking', included: true },
      { name: 'Invoicing & Billing', included: true },
      { name: 'HR & Payroll', included: true },
      { name: 'Document Management', included: true },
      { name: 'Reports & Analytics', included: true },
    ],
    allowedRoles: undefined,
    blockedRoles: [],
    status: 'active',
    isDefault: true,
  },
];

const seed = async () => {
  await connectDB();

  for (const planData of plans) {
    const existing = await Plan.findOne({ planName: planData.planName });
    if (existing) {
      console.log(`⚠️  Plan "${planData.planName}" already exists — skipping.`);
      continue;
    }

    // Unset any existing default if this one is default
    if (planData.isDefault) {
      await Plan.updateMany({ isDefault: true }, { isDefault: false });
    }

    const plan = new Plan(planData);
    await plan.save();
    console.log(`✅ Created plan: "${plan.planName}"`);
  }

  console.log('\n🎉 Seed complete.');
  process.exit(0);
};

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
