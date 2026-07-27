import mongoose from 'mongoose';
import {config} from './config.js'


export const connectDB = async () => {
  let dbUrl =
    config.USE_DB === "production" ? config.DB_CLUSTER : config.DB_LOCAL;
  
  // Clean up connection string - remove empty appName parameter
  if (dbUrl) {
    // Remove appName parameter if it has no value (e.g., ?appName or &appName)
    dbUrl = dbUrl.replace(/[?&]appName(?=&|$)/g, '').replace(/\?&/g, '?').replace(/&+/g, '&');
    // Remove trailing ? or & if present
    dbUrl = dbUrl.replace(/[?&]$/, '');
  }
  
  console.log(dbUrl);
   
  // Configure Mongoose to disable buffering (set before connection)
  mongoose.set('bufferCommands', false);
  
  const connectionOptions = {
    serverSelectionTimeoutMS: 30000, // 30 seconds to select a server
    socketTimeoutMS: 45000, // 45 seconds for socket operations
    connectTimeoutMS: 30000, // 30 seconds to establish connection
    maxPoolSize: 10, // Maximum number of connections in the pool
    minPoolSize: 5, // Minimum number of connections in the pool
    retryWrites: true,
    retryReads: true,
  };

  try {
    await mongoose.connect(`${dbUrl}`, connectionOptions);
    console.log(`mongoDB connected to ${config.USE_DB} on ${dbUrl} ✅`);
    
    // Drop obsolete username_1 index if it exists (fixes E11000 duplicate key error)
    try {
      const { User } = await import('../models/driver/userModel.js');
      const indexes = await User.collection.getIndexes();
      
      // Find username index by name or by key pattern
      let usernameIndexName = null;
      for (const [indexName, indexSpec] of Object.entries(indexes)) {
        if (indexName === 'username_1' || 
            (indexSpec.key && indexSpec.key.username) ||
            (typeof indexSpec === 'object' && 'username' in indexSpec)) {
          usernameIndexName = indexName;
          break;
        }
      }
      
      if (usernameIndexName) {
        await User.collection.dropIndex(usernameIndexName);
        console.log(`✅ Dropped obsolete ${usernameIndexName} index from User collection`);
      }
    } catch (indexErr) {
      // Index might not exist or already dropped, which is fine
      if (!indexErr.message.includes('index not found') && indexErr.code !== 27) {
        console.warn('⚠️ Could not drop username index (this is usually fine):', indexErr.message);
      }
    }
    
    // Drop obsolete settlementId_1 index if it exists (fixes E11000 duplicate key error for settlements)
    try {
      const { Settlement } = await import('../models/hr/settlementModel.js');
      const indexes = await Settlement.collection.getIndexes();
      
      // Find settlementId index by name or by key pattern
      let settlementIndexName = null;
      for (const [indexName, indexSpec] of Object.entries(indexes)) {
        if (indexName === 'settlementId_1' || 
            (indexSpec.key && indexSpec.key.settlementId && !indexSpec.key.company)) {
          settlementIndexName = indexName;
          break;
        }
      }
      
      if (settlementIndexName) {
        await Settlement.collection.dropIndex(settlementIndexName);
        console.log(`✅ Dropped obsolete ${settlementIndexName} index from Settlement collection`);
      }
    } catch (indexErr) {
      // Index might not exist or already dropped, which is fine
      if (!indexErr.message.includes('index not found') && indexErr.code !== 27) {
        console.warn('⚠️ Could not drop settlementId index (this is usually fine):', indexErr.message);
      }
    }
    
    // Drop obsolete incidentNumber_1 index if it exists (fixes E11000 duplicate key error for incidents)
    try {
      const { Incident } = await import('../models/healthSafety/incidentModel.js');
      const indexes = await Incident.collection.getIndexes();
      
      // Find incidentNumber index by name or by key pattern
      let incidentIndexName = null;
      for (const [indexName, indexSpec] of Object.entries(indexes)) {
        if (indexName === 'incidentNumber_1' || 
            (indexSpec.key && indexSpec.key.incidentNumber && !indexSpec.key.company)) {
          incidentIndexName = indexName;
          break;
        }
      }
      
      if (incidentIndexName) {
        await Incident.collection.dropIndex(incidentIndexName);
        console.log(`✅ Dropped obsolete ${incidentIndexName} index from Incident collection`);
      }
    } catch (indexErr) {
      // Index might not exist or already dropped, which is fine
      if (!indexErr.message.includes('index not found') && indexErr.code !== 27) {
        console.warn('⚠️ Could not drop incidentNumber index (this is usually fine):', indexErr.message);
      }
    }
    
    // Drop obsolete capaNumber_1 index if it exists (fixes E11000 duplicate key error for CAPAs)
    try {
      const { CAPA } = await import('../models/healthSafety/capaModel.js');
      const indexes = await CAPA.collection.getIndexes();
      
      // Find capaNumber index by name or by key pattern
      let capaIndexName = null;
      for (const [indexName, indexSpec] of Object.entries(indexes)) {
        if (indexName === 'capaNumber_1' || 
            (indexSpec.key && indexSpec.key.capaNumber && !indexSpec.key.company)) {
          capaIndexName = indexName;
          break;
        }
      }
      
      if (capaIndexName) {
        await CAPA.collection.dropIndex(capaIndexName);
        console.log(`✅ Dropped obsolete ${capaIndexName} index from CAPA collection`);
      }
    } catch (indexErr) {
      // Index might not exist or already dropped, which is fine
      if (!indexErr.message.includes('index not found') && indexErr.code !== 27) {
        console.warn('⚠️ Could not drop capaNumber index (this is usually fine):', indexErr.message);
      }
    }
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });
    
  } catch (err) {
    console.error("❌ DB Connection ERROR ::", err.message);
    // Don't exit process, let it retry
    throw err;
  }
};

// Helper function to check if MongoDB is connected and ready
export const isMongoConnected = () => {
  return mongoose.connection.readyState === 1; // 1 = connected
};

// Helper function to wait for MongoDB connection (with timeout)
export const waitForMongoConnection = async (maxWaitTime = 30000) => {
  const startTime = Date.now();
  
  while (!isMongoConnected() && (Date.now() - startTime) < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
  }
  
  if (!isMongoConnected()) {
    throw new Error('MongoDB connection timeout - database not available');
  }
  
  return true;
};


