import mongoose from 'mongoose';
import Trip from '../models/tripModel.js';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DB || process.env.DB1;

// Find and fix duplicate trip numbers
const fixDuplicateTripNumbers = async () => {
  try {
    console.log('🔌 Connecting to database...');
    await mongoose.connect(dbUrl);
    console.log('✅ Connected to database');

    // Find all trips grouped by tripNumber
    const trips = await Trip.find({}).select('_id tripNumber createdAt');
    
    console.log(`\n📊 Total trips in database: ${trips.length}`);
    
    // Group trips by tripNumber to find duplicates
    const tripsByNumber = {};
    trips.forEach(trip => {
      if (trip.tripNumber) {
        if (!tripsByNumber[trip.tripNumber]) {
          tripsByNumber[trip.tripNumber] = [];
        }
        tripsByNumber[trip.tripNumber].push(trip);
      }
    });

    // Find duplicates
    const duplicates = {};
    Object.keys(tripsByNumber).forEach(tripNumber => {
      if (tripsByNumber[tripNumber].length > 1) {
        duplicates[tripNumber] = tripsByNumber[tripNumber];
      }
    });

    if (Object.keys(duplicates).length === 0) {
      console.log('✅ No duplicate trip numbers found!');
      await mongoose.disconnect();
      return;
    }

    console.log(`\n⚠️  Found ${Object.keys(duplicates).length} duplicate trip number(s):`);
    Object.keys(duplicates).forEach(tripNumber => {
      console.log(`   ${tripNumber}: ${duplicates[tripNumber].length} trips`);
    });

    // Fix duplicates - keep the oldest one, regenerate numbers for the rest
    let fixedCount = 0;
    for (const [tripNumber, tripList] of Object.entries(duplicates)) {
      if (tripList.length <= 1) continue;

      // Sort by creation date - keep the oldest one
      tripList.sort((a, b) => a.createdAt - b.createdAt);
      const tripsToFix = tripList.slice(1); // All except the first (oldest)

      console.log(`\n🔧 Fixing duplicate: ${tripNumber}`);
      console.log(`   Keeping oldest trip: ${tripList[0]._id} (created: ${tripList[0].createdAt})`);
      console.log(`   Regenerating ${tripsToFix.length} duplicate(s)...`);

      for (const trip of tripsToFix) {
        const year = new Date().getFullYear();
        let newTripNumber;
        let attempts = 0;
        let unique = false;

        while (!unique && attempts < 50) {
          if (attempts < 10) {
            // Try sequential numbers first
            const count = await Trip.countDocuments({
              tripNumber: new RegExp(`^TRIP${year}`)
            }).catch(() => 0);
            const sequence = String(count + attempts + 1).padStart(4, '0');
            newTripNumber = `TRIP${year}${sequence}`;
          } else {
            // Use timestamp + random for guaranteed uniqueness
            const timestamp = Date.now().toString().slice(-6);
            const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            newTripNumber = `TRIP${year}${timestamp}${random}`;
          }

          // Check if this number exists
          const existing = await Trip.findOne({ tripNumber: newTripNumber });
          if (!existing) {
            unique = true;
          } else {
            attempts++;
          }
        }

        if (unique && newTripNumber) {
          await Trip.findByIdAndUpdate(trip._id, { tripNumber: newTripNumber });
          console.log(`   ✅ Updated trip ${trip._id} to ${newTripNumber}`);
          fixedCount++;
        } else {
          console.error(`   ❌ Failed to generate unique number for trip ${trip._id}`);
        }
      }
    }

    console.log(`\n✅ Fixed ${fixedCount} duplicate trip number(s)`);

    // Verify no duplicates remain
    const remainingTrips = await Trip.find({}).select('_id tripNumber');
    const remainingByNumber = {};
    remainingTrips.forEach(trip => {
      if (trip.tripNumber) {
        if (!remainingByNumber[trip.tripNumber]) {
          remainingByNumber[trip.tripNumber] = [];
        }
        remainingByNumber[trip.tripNumber].push(trip);
      }
    });

    const remainingDuplicates = Object.keys(remainingByNumber).filter(
      num => remainingByNumber[num].length > 1
    );

    if (remainingDuplicates.length > 0) {
      console.log(`\n⚠️  Warning: ${remainingDuplicates.length} duplicate(s) still remain:`);
      remainingDuplicates.forEach(num => {
        console.log(`   ${num}: ${remainingByNumber[num].length} trips`);
      });
    } else {
      console.log('\n✅ All duplicates fixed! No remaining duplicates.');
    }

    await mongoose.disconnect();
    console.log('\n✅ Script completed successfully!');
  } catch (error) {
    console.error('❌ Error fixing duplicate trip numbers:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the script
fixDuplicateTripNumbers();

