import mongoose from 'mongoose';
import { User } from '../models/driver/userModel.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blackriver');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Generate internal ID for drivers
const generateInternalId = (role = 'driver') => {
  const timestamp = Date.now().toString().slice(-6);
  const rolePrefix = role === 'driver' ? 'DRV' : 'EMP';
  return `${rolePrefix}-${timestamp}`;
};

// Update drivers with internal IDs
const updateDriversWithInternalId = async () => {
  try {
    console.log('🔄 Starting driver internal ID update...');

    // Find all drivers without internalId
    const driversWithoutInternalId = await User.find({
      role: 'driver',
      $or: [
        { internalId: { $exists: false } },
        { internalId: null },
        { internalId: '' }
      ]
    });

    console.log(`📊 Found ${driversWithoutInternalId.length} drivers without internal ID`);

    if (driversWithoutInternalId.length === 0) {
      console.log('✅ All drivers already have internal IDs');
      return;
    }

    // Update each driver with a unique internal ID
    for (let i = 0; i < driversWithoutInternalId.length; i++) {
      const driver = driversWithoutInternalId[i];
      
      // Generate unique internal ID
      let internalId = generateInternalId('driver');
      
      // Ensure uniqueness
      let attempts = 0;
      while (attempts < 10) {
        const existingDriver = await User.findOne({ internalId });
        if (!existingDriver) {
          break;
        }
        internalId = generateInternalId('driver');
        attempts++;
      }

      if (attempts >= 10) {
        console.error(`❌ Could not generate unique internal ID for driver ${driver.name} (${driver.email})`);
        continue;
      }

      // Update the driver
      await User.findByIdAndUpdate(driver._id, { internalId });
      console.log(`✅ Updated driver ${driver.name} (${driver.email}) with internal ID: ${internalId}`);
    }

    console.log('✅ Driver internal ID update completed successfully!');

    // Verify the update
    const remainingDriversWithoutInternalId = await User.find({
      role: 'driver',
      $or: [
        { internalId: { $exists: false } },
        { internalId: null },
        { internalId: '' }
      ]
    });

    console.log(`📊 Remaining drivers without internal ID: ${remainingDriversWithoutInternalId.length}`);

  } catch (error) {
    console.error('❌ Error updating drivers with internal ID:', error);
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await updateDriversWithInternalId();
  } catch (error) {
    console.error('❌ Script execution failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

// Run the script
main();
