import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { CompanySettings } from '../models/driver/companysettingsModel.js';
import { User } from '../models/driver/userModel.js';
import { VehicleService } from '../models/driver/vehicleService.js';
import { FleetUnit } from '../models/fleet/fleetUnitModel.js';

dotenv.config();

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/logistiq';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const listCompanies = async () => {
  try {
    await connectDB();

    console.log('\n📋 Finding companies from various sources...\n');

    // From CompanySettings
    const companies = await CompanySettings.find().select('_id companyName companyCode').lean();
    console.log('🏢 Companies from CompanySettings:');
    if (companies.length > 0) {
      companies.forEach((c, i) => {
        console.log(`   ${i + 1}. ID: ${c._id}, Name: ${c.companyName || 'N/A'}, Code: ${c.companyCode || 'N/A'}`);
      });
    } else {
      console.log('   (none found)');
    }

    // From Users
    const usersWithCompany = await User.find({ company: { $exists: true, $ne: null } })
      .select('company name email role')
      .populate('company', 'companyName companyCode')
      .lean();
    
    console.log('\n👤 Users with companies:');
    if (usersWithCompany.length > 0) {
      const uniqueCompanies = new Map();
      usersWithCompany.forEach(u => {
        if (u.company) {
          const companyId = typeof u.company === 'object' ? u.company._id?.toString() : u.company.toString();
          if (companyId && !uniqueCompanies.has(companyId)) {
            uniqueCompanies.set(companyId, {
              id: companyId,
              name: typeof u.company === 'object' ? u.company.companyName : 'N/A',
              user: u.name || u.email
            });
          }
        }
      });
      uniqueCompanies.forEach((c, i) => {
        console.log(`   ${i + 1}. ID: ${c.id}, Name: ${c.name}, User: ${c.user}`);
      });
    } else {
      console.log('   (none found)');
    }

    // From VehicleService
    const servicesWithCompany = await VehicleService.distinct('company', { company: { $exists: true, $ne: null } });
    console.log('\n🔧 VehicleServices with companies:');
    if (servicesWithCompany.length > 0) {
      servicesWithCompany.forEach((c, i) => {
        console.log(`   ${i + 1}. ID: ${c?.toString() || c}`);
      });
    } else {
      console.log('   (none found)');
    }

    // From FleetUnit
    const unitsWithCompany = await FleetUnit.distinct('company', { company: { $exists: true, $ne: null } });
    console.log('\n🚛 FleetUnits with companies:');
    if (unitsWithCompany.length > 0) {
      unitsWithCompany.forEach((c, i) => {
        console.log(`   ${i + 1}. ID: ${c?.toString() || c}`);
      });
    } else {
      console.log('   (none found)');
    }

    // Get first available company ID
    let firstCompanyId = null;
    if (companies.length > 0) {
      firstCompanyId = companies[0]._id.toString();
    } else if (servicesWithCompany.length > 0) {
      firstCompanyId = servicesWithCompany[0]?.toString() || servicesWithCompany[0];
    } else if (unitsWithCompany.length > 0) {
      firstCompanyId = unitsWithCompany[0]?.toString() || unitsWithCompany[0];
    } else if (usersWithCompany.length > 0 && usersWithCompany[0].company) {
      firstCompanyId = typeof usersWithCompany[0].company === 'object' 
        ? usersWithCompany[0].company._id?.toString()
        : usersWithCompany[0].company.toString();
    }

    if (firstCompanyId) {
      console.log(`\n✅ First available company ID: ${firstCompanyId}`);
      console.log('\n💡 To create test data with this company, run:');
      console.log(`   node scripts/createTestFleetUnitAndServiceWithCompany.js ${firstCompanyId}`);
    } else {
      console.log('\n❌ No company found. Please create a company first.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

listCompanies();

