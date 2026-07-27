// Test file for Employee Management API
// Run with: node testEmployeeAPI.js

import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/v1/employee';
const TEST_TOKEN = 'your-jwt-token-here'; // Replace with actual token

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${TEST_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Test data
const testEmployee = {
  name: 'Test Employee',
  email: 'test.employee@company.com',
  phone: '+1234567890',
  role: 'driver',
  country: 'USA',
  state: 'California',
  city: 'Los Angeles',
  joinDate: new Date().toISOString(),
  status: 'active',
  internalId: 'TEST001',
  address: '123 Test St, Los Angeles, CA',
  longitude: '-118.2437',
  latitude: '34.0522',
  licenceNumber: 'DL123456789',
  vendor: 'Test Transport'
};

let createdEmployeeId = null;

// Test functions
async function testCreateEmployee() {
  console.log('🧪 Testing Create Employee...');
  try {
    const response = await api.post('/', testEmployee);
    console.log('✅ Create Employee Success:', response.data);
    createdEmployeeId = response.data.data._id;
    return response.data;
  } catch (error) {
    console.error('❌ Create Employee Error:', error.response?.data || error.message);
    return null;
  }
}

async function testGetAllEmployees() {
  console.log('🧪 Testing Get All Employees...');
  try {
    const response = await api.get('/?page=1&limit=5');
    console.log('✅ Get All Employees Success:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Get All Employees Error:', error.response?.data || error.message);
    return null;
  }
}

async function testGetEmployeeById() {
  if (!createdEmployeeId) {
    console.log('⚠️ No employee ID available for testing');
    return null;
  }
  
  console.log('🧪 Testing Get Employee by ID...');
  try {
    const response = await api.get(`/${createdEmployeeId}`);
    console.log('✅ Get Employee by ID Success:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Get Employee by ID Error:', error.response?.data || error.message);
    return null;
  }
}

async function testUpdateEmployee() {
  if (!createdEmployeeId) {
    console.log('⚠️ No employee ID available for testing');
    return null;
  }
  
  console.log('🧪 Testing Update Employee...');
  try {
    const updateData = {
      name: 'Updated Test Employee',
      phone: '+1234567891',
      status: 'active'
    };
    const response = await api.put(`/${createdEmployeeId}`, updateData);
    console.log('✅ Update Employee Success:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Update Employee Error:', error.response?.data || error.message);
    return null;
  }
}

async function testUpdateEmployeeStatus() {
  if (!createdEmployeeId) {
    console.log('⚠️ No employee ID available for testing');
    return null;
  }
  
  console.log('🧪 Testing Update Employee Status...');
  try {
    const response = await api.patch(`/${createdEmployeeId}/status`, { status: 'inactive' });
    console.log('✅ Update Employee Status Success:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Update Employee Status Error:', error.response?.data || error.message);
    return null;
  }
}

async function testResetEmployeePassword() {
  if (!createdEmployeeId) {
    console.log('⚠️ No employee ID available for testing');
    return null;
  }
  
  console.log('🧪 Testing Reset Employee Password...');
  try {
    const response = await api.patch(`/${createdEmployeeId}/reset-password`);
    console.log('✅ Reset Employee Password Success:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Reset Employee Password Error:', error.response?.data || error.message);
    return null;
  }
}

async function testGetEmployeeStats() {
  console.log('🧪 Testing Get Employee Stats...');
  try {
    const response = await api.get('/stats');
    console.log('✅ Get Employee Stats Success:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Get Employee Stats Error:', error.response?.data || error.message);
    return null;
  }
}

async function testDeleteEmployee() {
  if (!createdEmployeeId) {
    console.log('⚠️ No employee ID available for testing');
    return null;
  }
  
  console.log('🧪 Testing Delete Employee...');
  try {
    const response = await api.delete(`/${createdEmployeeId}`);
    console.log('✅ Delete Employee Success:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Delete Employee Error:', error.response?.data || error.message);
    return null;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Employee API Tests...\n');
  
  // Test sequence
  await testCreateEmployee();
  await testGetAllEmployees();
  await testGetEmployeeById();
  await testUpdateEmployee();
  await testUpdateEmployeeStatus();
  await testResetEmployeePassword();
  await testGetEmployeeStats();
  await testDeleteEmployee();
  
  console.log('\n🏁 All tests completed!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export {
  testCreateEmployee,
  testGetAllEmployees,
  testGetEmployeeById,
  testUpdateEmployee,
  testUpdateEmployeeStatus,
  testResetEmployeePassword,
  testGetEmployeeStats,
  testDeleteEmployee,
  runAllTests
};



