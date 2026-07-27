import mongoose from 'mongoose';
import { ChatMessage } from '../models/chat/chatMessageModel.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const deleteDriverChatMessages = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/your-database';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // First, check how many messages exist
    const totalMessages = await ChatMessage.countDocuments({});
    console.log(`📊 Total chat messages in database: ${totalMessages}`);

    // Count driver chat messages
    const driverMessagesCount = await ChatMessage.countDocuments({
      driverId: { $exists: true, $ne: null }
    });
    console.log(`📊 Driver chat messages: ${driverMessagesCount}`);

    // Count system messages
    const systemMessagesCount = await ChatMessage.countDocuments({
      $or: [
        { senderType: 'system' },
        { isSystemMessage: true }
      ]
    });
    console.log(`📊 System messages: ${systemMessagesCount}`);

    // Get command line argument for delete all
    const deleteAll = process.argv.includes('--all') || process.argv.includes('-a');

    if (deleteAll) {
      // Delete ALL chat messages
      console.log('\n🗑️  Deleting ALL chat messages...');
      const allResult = await ChatMessage.deleteMany({});
      console.log(`✅ Deleted ${allResult.deletedCount} total chat messages (ALL messages)`);
    } else {
      // Delete only driver chat messages and system messages
      console.log('\n🗑️  Deleting driver chat messages and system messages...');
      
      // Delete all driver chat messages (messages with driverId)
      const result = await ChatMessage.deleteMany({
        driverId: { $exists: true, $ne: null }
      });
      console.log(`✅ Deleted ${result.deletedCount} driver chat messages`);

      // Also delete any system messages
      const systemResult = await ChatMessage.deleteMany({
        $or: [
          { senderType: 'system' },
          { isSystemMessage: true }
        ]
      });
      console.log(`✅ Deleted ${systemResult.deletedCount} system messages`);

      console.log(`\n✅ Total messages deleted: ${result.deletedCount + systemResult.deletedCount}`);
    }

    // Verify deletion
    const remainingMessages = await ChatMessage.countDocuments({});
    console.log(`\n📊 Remaining chat messages in database: ${remainingMessages}`);
    console.log('✅ Chat messages cleared successfully!');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error deleting chat messages:', error);
    process.exit(1);
  }
};

// Run the script
deleteDriverChatMessages();

