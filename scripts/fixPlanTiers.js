import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  const mongoURI = process.env.DB || process.env.MONGO_URI;
  await mongoose.connect(mongoURI);
  console.log('✅ MongoDB Connected');
};

const fix = async () => {
  await connectDB();

  const db = mongoose.connection.db;
  const plans = await db.collection('plans').find({}).toArray();

  console.log(`Found ${plans.length} plan(s)`);

  let fixed = 0;

  for (const plan of plans) {
    const tiers = plan.monthly?.truckPricing?.tiers;
    if (!tiers || tiers.length === 0) continue;

    const needsFix = tiers.some(t => t.totalPrice !== undefined && t.monthlyPrice === undefined);
    if (!needsFix) {
      console.log(`  ✅ "${plan.planName}" — tiers already correct`);
      continue;
    }

    const updatedTiers = tiers.map(t => ({
      minTrucks: t.minTrucks ?? 0,
      maxTrucks: t.maxTrucks ?? 0,
      monthlyPrice: t.monthlyPrice ?? t.totalPrice ?? 0,
      currency: t.currency ?? 'CAD',
    }));

    await db.collection('plans').updateOne(
      { _id: plan._id },
      {
        $set: { 'monthly.truckPricing.tiers': updatedTiers },
        $unset: {},
      }
    );

    console.log(`  🔧 Fixed "${plan.planName}" — migrated ${tiers.length} tier(s) totalPrice → monthlyPrice`);
    fixed++;
  }

  console.log(`\n🎉 Done. Fixed ${fixed} plan(s).`);
  process.exit(0);
};

fix().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
