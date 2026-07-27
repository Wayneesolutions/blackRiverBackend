import mongoose from 'mongoose';
import Load from '../models/loadModel.js';
import dotenv from 'dotenv';

dotenv.config();

const createTestDeliveryLoads = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blackriver');
    console.log('✅ Connected to MongoDB');

    // Check if test loads already exist
    const existingLoads = await Load.find({ 
      'details.internalId': { $in: ['TEST-DELIVERY-001', 'TEST-DELIVERY-002', 'TEST-DELIVERY-003'] } 
    });
    
    if (existingLoads.length >= 3) {
      console.log('⚠️ All test loads already exist, skipping creation');
      await mongoose.connection.close();
      return;
    } else if (existingLoads.length > 0) {
      console.log(`⚠️ Found ${existingLoads.length}/3 test loads, will create missing ones`);
    }

    // Create test delivery loads
    const testLoads = [
      {
        details: {
          internalId: 'TEST-DELIVERY-001',
          customer: new mongoose.Types.ObjectId(),
          amount: 4500,
          rate: 4500
        },
        route: {
          multipleDropOffs: false,
          selectPickup: {
            place: 'New York, NY',
            latitude: '40.7128',
            longitude: '-74.0060'
          },
          selectDropOff: {
            place: 'Boston, MA',
            latitude: '42.3601',
            longitude: '-71.0589'
          }
        },
        status: 'completed',
        paymentStatus: 'paid',
        completedAt: new Date(),
        paymentDetails: {
          paymentMethod: 'Bank Transfer',
          paymentReference: 'TXN-001-2024',
          paymentDate: new Date(),
          notes: 'Payment received successfully'
        },
        deliveryDocuments: {
          bol: {
            url: 'https://example.com/documents/bol-001.pdf',
            uploadedAt: new Date(),
            uploadedBy: new mongoose.Types.ObjectId()
          },
          pod: {
            url: 'https://example.com/documents/pod-001.pdf',
            uploadedAt: new Date(),
            uploadedBy: new mongoose.Types.ObjectId()
          },
          billOfSale: {
            url: 'https://example.com/documents/bill-001.pdf',
            uploadedAt: new Date(),
            uploadedBy: new mongoose.Types.ObjectId()
          }
        }
      },
      {
        details: {
          internalId: 'TEST-DELIVERY-002',
          customer: new mongoose.Types.ObjectId(),
          amount: 3200,
          rate: 3200
        },
        route: {
          multipleDropOffs: false,
          selectPickup: {
            place: 'Los Angeles, CA',
            latitude: '34.0522',
            longitude: '-118.2437'
          },
          selectDropOff: {
            place: 'San Francisco, CA',
            latitude: '37.7749',
            longitude: '-122.4194'
          }
        },
        status: 'completed',
        paymentStatus: 'due',
        completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        deliveryDocuments: {
          bol: {
            url: 'https://example.com/documents/bol-002.pdf',
            uploadedAt: new Date(),
            uploadedBy: new mongoose.Types.ObjectId()
          },
          pod: {
            url: 'https://example.com/documents/pod-002.pdf',
            uploadedAt: new Date(),
            uploadedBy: new mongoose.Types.ObjectId()
          }
        }
      },
      {
        details: {
          internalId: 'TEST-DELIVERY-003',
          customer: new mongoose.Types.ObjectId(),
          amount: 5500,
          rate: 5500
        },
        route: {
          multipleDropOffs: false,
          selectPickup: {
            place: 'Chicago, IL',
            latitude: '41.8781',
            longitude: '-87.6298'
          },
          selectDropOff: {
            place: 'Detroit, MI',
            latitude: '42.3314',
            longitude: '-83.0458'
          }
        },
        status: 'delivered',
        paymentStatus: 'pending',
        completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
      }
    ];

    const createdLoads = await Load.insertMany(testLoads);
    console.log(`✅ Created ${createdLoads.length} test delivery loads:`);
    createdLoads.forEach(load => {
      console.log(`  - ${load.details.internalId}: ${load.status} (Payment: ${load.paymentStatus})`);
    });

    await mongoose.connection.close();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
};

createTestDeliveryLoads();

