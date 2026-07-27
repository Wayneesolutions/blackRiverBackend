import cron from 'node-cron';
import { updateDocumentStatuses } from '../controllers/employee/employeeDocumentController.js';
import { waitForMongoConnection, isMongoConnected } from '../config/mongoConnection.js';

// ✅ DAILY DOCUMENT STATUS UPDATE JOB
// Runs every day at 9:00 AM
const runDocumentStatusUpdateJob = () => {
    
    console.log('🔄 Setting up daily document status update job...');
    
    cron.schedule('0 9 * * *', async () => {
        try {
            console.log('🔄 Running daily document status update job...');
            
            // Wait for MongoDB connection before running
            if (!isMongoConnected()) {
                console.log('⏳ Waiting for MongoDB connection...');
                await waitForMongoConnection(30000);
            }
            
            const result = await updateDocumentStatuses();
            console.log('✅ Daily document status update completed:', result);
        } catch (error) {
            console.error('❌ Error in daily document status update job:', error);
        }
    }, {
        scheduled: true,
        timezone: "UTC"
    });

    console.log('✅ Daily document status update job scheduled for 9:00 AM UTC');
};

export { runDocumentStatusUpdateJob };
