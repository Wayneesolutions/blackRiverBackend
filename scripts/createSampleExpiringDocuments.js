// Script to create sample employee documents with expiry dates for testing the popup
// Run with: node scripts/createSampleExpiringDocuments.js

import mongoose from 'mongoose';
import { EmployeeDocument } from '../models/driver/employeeDocumentModel.js';
import { User } from '../models/driver/userModel.js';
import 'dotenv/config';

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

// Sample document data with different expiry scenarios
const sampleDocuments = [
  {
    documentType: 'Employment Contract',
    documentNumber: 'EMP-CONTRACT-2024-001',
    issueDate: new Date('2024-01-15'),
    expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now (CRITICAL)
    description: 'Initial employment contract - expires in 5 days',
    status: 'valid'
  },
  {
    documentType: 'ID Document',
    documentNumber: 'ID-DOC-2024-002',
    issueDate: new Date('2024-02-01'),
    expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now (WARNING)
    description: 'Government issued ID - expires in 10 days',
    status: 'valid'
  },
  {
    documentType: 'Passport',
    documentNumber: 'PASSPORT-2024-003',
    issueDate: new Date('2024-03-01'),
    expiryDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days from now (NOTICE)
    description: 'International passport - expires in 20 days',
    status: 'valid'
  },
  {
    documentType: 'Work Permit',
    documentNumber: 'WORK-PERMIT-2024-004',
    issueDate: new Date('2024-04-01'),
    expiryDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), // 25 days from now (NOTICE)
    description: 'Work authorization permit - expires in 25 days',
    status: 'valid'
  },
  {
    documentType: 'Background Check',
    documentNumber: 'BG-CHECK-2024-005',
    issueDate: new Date('2024-05-01'),
    expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now (CRITICAL)
    description: 'Criminal background check - expires in 3 days',
    status: 'valid'
  },
  {
    documentType: 'Medical Certificate',
    documentNumber: 'MED-CERT-2024-006',
    issueDate: new Date('2024-06-01'),
    expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now (WARNING)
    description: 'Health examination certificate - expires in 15 days',
    status: 'valid'
  },
  {
    documentType: 'Training Certificate',
    documentNumber: 'TRAIN-CERT-2024-007',
    issueDate: new Date('2024-07-01'),
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now (CRITICAL)
    description: 'Safety training completion - expires in 7 days',
    status: 'valid'
  },
  {
    documentType: 'Insurance Policy',
    documentNumber: 'INS-POLICY-2024-008',
    issueDate: new Date('2024-08-01'),
    expiryDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), // 12 days from now (WARNING)
    description: 'Health insurance policy - expires in 12 days',
    status: 'valid'
  }
];

const createSampleDocuments = async () => {
  try {
    console.log('🔄 Creating sample expiring documents...');

    // First, get or create a test employee
    let testEmployee = await User.findOne({ 
      email: 'test.employee@company.com' 
    });

    if (!testEmployee) {
      console.log('👤 Creating test employee...');
      testEmployee = new User({
        name: 'Test Employee',
        email: 'test.employee@company.com',
        phone: '+1234567890',
        role: 'employee',
        country: 'USA',
        state: 'California',
        city: 'Los Angeles',
        joinDate: new Date(),
        status: 'active',
        internalId: 'TEST-EMP-001',
        password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
        company: null // Will be set by the system
      });
      await testEmployee.save();
      console.log('✅ Test employee created:', testEmployee._id);
    } else {
      console.log('✅ Using existing test employee:', testEmployee._id);
    }

    // Clear existing test documents for this employee
    await EmployeeDocument.deleteMany({ 
      employee: testEmployee._id,
      documentNumber: { $regex: /^.*-2024-.*$/ } // Match our test document numbers
    });
    console.log('🧹 Cleared existing test documents');

    // Create sample documents
    const createdDocuments = [];
    for (const docData of sampleDocuments) {
      const document = new EmployeeDocument({
        ...docData,
        employee: testEmployee._id,
        uploadedBy: testEmployee._id,
        company: testEmployee.company
      });

      await document.save();
      createdDocuments.push(document);
      
      const daysUntilExpiry = Math.ceil((docData.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      console.log(`📄 Created ${docData.documentType} - expires in ${daysUntilExpiry} days`);
    }

    console.log(`\n✅ Successfully created ${createdDocuments.length} sample documents!`);
    console.log('\n📋 Document Summary:');
    console.log('==================');
    
    createdDocuments.forEach((doc, index) => {
      const daysUntilExpiry = Math.ceil((doc.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      let urgency = '';
      if (daysUntilExpiry <= 7) urgency = '🔴 CRITICAL';
      else if (daysUntilExpiry <= 14) urgency = '🟠 WARNING';
      else urgency = '🟡 NOTICE';
      
      console.log(`${index + 1}. ${doc.documentType} - ${daysUntilExpiry} days ${urgency}`);
    });

    console.log('\n🎯 To test the popup:');
    console.log('1. Go to: http://localhost:5173/admin/employee/documents');
    console.log('2. Or: http://localhost:5173/admin/employee');
    console.log('3. Or: http://localhost:5173/admin/dashboard');
    console.log('4. The popup should appear automatically after a few seconds!');
    
    console.log('\n📊 Test Employee Details:');
    console.log(`Name: ${testEmployee.name}`);
    console.log(`Email: ${testEmployee.email}`);
    console.log(`Internal ID: ${testEmployee.internalId}`);
    console.log(`Employee ID: ${testEmployee._id}`);

  } catch (error) {
    console.error('❌ Error creating sample documents:', error);
  }
};

const main = async () => {
  await connectDB();
  await createSampleDocuments();
  
  console.log('\n🏁 Script completed!');
  process.exit(0);
};

// Run the script
main().catch(console.error);
