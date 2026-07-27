import cron from 'node-cron';
import { deleteOldMaintenanceOrders } from '../controllers/fleet/generalRepairController.js';
import { waitForMongoConnection, isMongoConnected } from '../config/mongoConnection.js';

// ✅ MAINTENANCE ORDER CLEANUP JOB
// Runs every day at 3:00 AM UTC to delete maintenance orders older than 2 years
// This ensures service records are stored for exactly 2 years as per requirement
const runMaintenanceOrderCleanupJob = () => {
    console.log('🔄 Setting up maintenance order cleanup job (2-year retention)...');
    
    cron.schedule('0 3 * * *', async () => {
        try {
            console.log('🔄 Running maintenance order cleanup job (deleting records older than 2 years)...');
            
            // Wait for MongoDB connection before running
            if (!isMongoConnected()) {
                console.log('⏳ Waiting for MongoDB connection...');
                await waitForMongoConnection(30000);
            }
            
            const result = await deleteOldMaintenanceOrders();
            
            if (result.success) {
                console.log(`✅ Maintenance order cleanup completed: ${result.message}`);
                if (result.deletedCount > 0) {
                    console.log(`   Deleted ${result.deletedCount} record(s) older than ${result.cutoffDate}`);
                } else {
                    console.log('   No records found to delete');
                }
            } else {
                console.error(`❌ Maintenance order cleanup failed: ${result.message}`);
            }
        } catch (error) {
            console.error('❌ Error in maintenance order cleanup job:', error);
        }
    }, {
        scheduled: true,
        timezone: "UTC"
    });

    console.log('✅ Maintenance order cleanup job scheduled for 3:00 AM UTC daily');
};

export { runMaintenanceOrderCleanupJob };

