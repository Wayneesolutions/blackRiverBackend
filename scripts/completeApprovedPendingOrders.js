// scripts/completeApprovedPendingOrders.js
//
// One-off fix: orders whose POD documents were already approved by a dispatcher
// but which stayed in 'pending_review' / 'verification_pending' (the old approve
// endpoint never moved them to 'completed'). Those orders never reached driver
// payroll, settlements or invoicing.
//
// Dry run (default, changes nothing):   node scripts/completeApprovedPendingOrders.js
// Apply the change:                     node scripts/completeApprovedPendingOrders.js --apply
//
// Take a mongodump backup before running with --apply.

import mongoose from 'mongoose';
import { connectDB } from '../config/mongoConnection.js';
import Order from '../models/orderModel.js';

const APPLY = process.argv.includes('--apply');

const run = async () => {
  await connectDB();

  const filter = {
    documentsApproved: true,
    status: { $in: ['pending_review', 'verification_pending'] },
  };

  const stuck = await Order.find(filter)
    .select('_id orderNumber customerOrderNo status driver company documentsApprovedAt')
    .lean();

  console.log(`Found ${stuck.length} approved order(s) still waiting in pending_review/verification_pending.`);
  stuck.forEach(o => {
    console.log(`  - ${o.orderNumber || o.customerOrderNo || o._id}  status=${o.status}  approvedAt=${o.documentsApprovedAt ? new Date(o.documentsApprovedAt).toISOString() : 'n/a'}`);
  });

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to mark these orders as completed.');
  } else if (stuck.length > 0) {
    const result = await Order.updateMany(filter, { $set: { status: 'completed' } });
    console.log(`\nUpdated ${result.modifiedCount} order(s) to 'completed'.`);
  }

  await mongoose.connection.close();
};

run().catch(async (err) => {
  console.error('Failed:', err);
  try { await mongoose.connection.close(); } catch { /* ignore */ }
  process.exit(1);
});
