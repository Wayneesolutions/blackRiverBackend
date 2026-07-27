# 🚀 Complete Swagger/OpenAPI Documentation Guide

## 📋 Overview

This guide provides comprehensive documentation for all APIs in the BlackRiver Fleet Management System. The Swagger documentation is now complete and covers all endpoints across different user roles and functionalities.

## 🎯 What's Included

### ✅ **Complete API Coverage:**

1. **🔐 Authentication APIs**
   - User login with JWT token generation
   - Secure authentication flow

2. **👥 Employee Management APIs**
   - Create, read, update, delete employees
   - Bulk operations and filtering
   - Employee statistics and reporting
   - Status management and password reset

3. **🚛 Vehicle Services APIs**
   - Service creation and management
   - Status updates and priority management
   - Filtering and search capabilities
   - Mechanic assignment

4. **🏢 Admin Management APIs**
   - Dashboard statistics
   - Vehicle management (CRUD)
   - Maintenance scheduling
   - Cost reporting

5. **🚗 Driver Management APIs**
   - Profile management
   - Vehicle assignment and odometer updates
   - Activity logging and tracking
   - Location updates

6. **📡 Dispatcher Management APIs**
   - Driver tracking and management
   - Assignment creation and management
   - Real-time location tracking
   - Dashboard analytics

7. **👔 HR Management APIs**
   - Employee performance metrics
   - Attendance tracking and reporting
   - HR dashboard and statistics
   - Performance reports

8. **⚡ Super Admin Management APIs**
   - System-wide user management
   - Company management
   - System logs and audit trails
   - System settings and configuration

## 🔧 Installation & Setup

### 1. Install Dependencies

```bash
cd blackRiverBackend
npm install swagger-jsdoc swagger-ui-express
```

### 2. Start the Server

```bash
npm start
```

### 3. Access Swagger Documentation

Open your browser and navigate to:
```
http://localhost:3000/api-docs
```

## 🎨 Features

### **Interactive Documentation**
- **Live Testing**: Test all APIs directly from the browser
- **Request/Response Examples**: See real examples for every endpoint
- **Schema Validation**: Automatic request/response validation
- **Authentication Support**: JWT Bearer token integration

### **Comprehensive Coverage**
- **50+ Endpoints**: All APIs documented with examples
- **Multiple User Roles**: Admin, Driver, Dispatcher, HR, Super Admin
- **Complete CRUD Operations**: Create, Read, Update, Delete for all resources
- **Advanced Filtering**: Search, pagination, and filtering options

### **Professional UI**
- **Custom Styling**: Clean, modern interface
- **Responsive Design**: Works on all devices
- **Dark/Light Theme**: Professional appearance
- **Search Functionality**: Find endpoints quickly

## 🔐 Authentication Flow

### 1. **Login to Get Token**
```http
POST /api/v1/login
Content-Type: application/json

{
  "email": "admin@blackriver.com",
  "password": "password123"
}
```

### 2. **Use Token in Requests**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. **Test Protected Endpoints**
- Click "Authorize" button in Swagger UI
- Enter: `Bearer your-jwt-token-here`
- Test any protected endpoint

## 📊 API Categories

### **🔐 Authentication**
- `POST /api/v1/login` - User authentication

### **👥 Employee Management** (`/api/v1/employee`)
- `POST /` - Create employee
- `GET /` - List employees with filters
- `GET /:id` - Get employee by ID
- `PUT /:id` - Update employee
- `PATCH /:id/status` - Update employee status
- `POST /:id/reset-password` - Reset employee password
- `DELETE /:id` - Delete employee
- `DELETE /bulk` - Bulk delete employees
- `GET /stats` - Get employee statistics

### **🚛 Vehicle Services** (`/api/v1/admin/vehicle-services`)
- `POST /` - Create vehicle service
- `GET /` - List vehicle services with filters
- `GET /:id` - Get vehicle service by ID
- `PUT /:id` - Update vehicle service
- `PATCH /:id/status` - Update service status
- `DELETE /:id` - Delete vehicle service

### **🏢 Admin Management** (`/api/v1/admin`)
- `GET /dashboard` - Admin dashboard data
- `GET /vehicles` - List all vehicles
- `POST /vehicles` - Create new vehicle
- `GET /vehicles/:id` - Get vehicle by ID
- `PUT /vehicles/:id` - Update vehicle
- `DELETE /vehicles/:id` - Delete vehicle
- `GET /maintenance-schedule` - Get maintenance schedule
- `GET /maintenance-cost-report` - Get cost report

### **🚗 Driver Management** (`/api/v1/driver`)
- `GET /profile` - Get driver profile
- `PUT /profile` - Update driver profile
- `GET /vehicle` - Get assigned vehicle
- `PUT /odometer` - Update vehicle odometer
- `GET /activities` - Get driver activities
- `POST /activities` - Log driver activity
- `POST /location` - Update driver location

### **📡 Dispatcher Management** (`/api/v1/dispatcher`)
- `GET /dashboard` - Dispatcher dashboard
- `GET /drivers` - List all drivers
- `GET /assignments` - List all assignments
- `POST /assignments` - Create new assignment
- `PUT /assignments/:id` - Update assignment
- `DELETE /assignments/:id` - Delete assignment
- `GET /tracking` - Get real-time tracking data

### **👔 HR Management** (`/api/v1/hr`)
- `GET /dashboard` - HR dashboard data
- `GET /employees` - List all employees
- `GET /employees/:id` - Get employee details
- `GET /employees/:id/performance` - Get performance metrics
- `GET /employees/:id/attendance` - Get attendance record
- `POST /employees/:id/attendance` - Record attendance
- `GET /reports/attendance` - Generate attendance report
- `GET /reports/performance` - Generate performance report

### **⚡ Super Admin Management** (`/api/v1/superadmin`)
- `GET /dashboard` - Super admin dashboard
- `GET /users` - List all users
- `PUT /users/:id` - Update any user
- `DELETE /users/:id` - Delete any user
- `GET /companies` - List all companies
- `POST /companies` - Create new company
- `PUT /companies/:id` - Update company
- `DELETE /companies/:id` - Delete company
- `GET /system-logs` - Get system logs
- `GET /system-settings` - Get system settings
- `PUT /system-settings` - Update system settings

## 🎯 Key Features

### **📝 Complete Documentation**
- **Request/Response Examples**: Every endpoint has realistic examples
- **Schema Definitions**: Detailed data models and validation rules
- **Error Handling**: Comprehensive error response documentation
- **Authentication**: JWT Bearer token integration

### **🔍 Advanced Filtering**
- **Pagination**: Page-based navigation with metadata
- **Search**: Text search across multiple fields
- **Date Ranges**: Filter by date ranges
- **Status Filtering**: Filter by various status types
- **Role-based Access**: Different endpoints for different user roles

### **📊 Analytics & Reporting**
- **Dashboard APIs**: Statistics and overview data
- **Performance Metrics**: Employee and system performance
- **Attendance Tracking**: Comprehensive attendance management
- **Cost Reports**: Financial and maintenance reporting
- **System Logs**: Audit trails and system monitoring

### **🚀 Real-time Features**
- **Location Tracking**: Real-time driver location updates
- **Status Updates**: Live status updates for services and assignments
- **Notifications**: System-wide notification management
- **Live Dashboards**: Real-time data visualization

## 🛠️ Development Workflow

### **1. Testing APIs**
```bash
# Start the server
npm start

# Access Swagger UI
open http://localhost:3000/api-docs

# Login to get token
POST /api/v1/login

# Authorize in Swagger UI
Bearer your-jwt-token-here

# Test any endpoint
```

### **2. API Integration**
```javascript
// Example API call
const response = await fetch('/api/v1/employee', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

### **3. Error Handling**
```javascript
// Example error handling
try {
  const response = await fetch('/api/v1/employee', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(employeeData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  const result = await response.json();
  console.log('Success:', result);
} catch (error) {
  console.error('Error:', error.message);
}
```

## 🔧 Configuration

### **Environment Variables**
```bash
# .env file
PORT=3000
MONGODB_URI=mongodb://localhost:27017/blackriver
JWT_SECRET=your-jwt-secret
NODE_ENV=development
```

### **Swagger Configuration**
```javascript
// swagger/swagger.js
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BlackRiver Fleet Management API',
      version: '1.0.0',
      description: 'Comprehensive API for Fleet Management System'
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Development server'
      }
    ]
  },
  apis: ['./routes/*.js', './routes/*.swagger.js']
};
```

## 🎉 Benefits

### **For Developers**
- **Quick Integration**: Copy-paste examples for immediate use
- **Schema Validation**: Automatic request/response validation
- **Interactive Testing**: Test APIs without writing code
- **Complete Documentation**: No need for separate documentation

### **For QA/Testing**
- **Comprehensive Coverage**: Test all endpoints systematically
- **Example Data**: Realistic test data for all scenarios
- **Error Scenarios**: Documented error responses
- **Authentication Testing**: Easy token management

### **For Product Managers**
- **API Overview**: Complete system functionality overview
- **Feature Discovery**: Understand all available capabilities
- **Integration Planning**: Plan frontend-backend integration
- **Documentation**: Always up-to-date API documentation

## 🚀 Next Steps

1. **Install Dependencies**: Run `npm install swagger-jsdoc swagger-ui-express`
2. **Start Server**: Run `npm start`
3. **Access Documentation**: Visit `http://localhost:3000/api-docs`
4. **Login & Test**: Get JWT token and test endpoints
5. **Integrate Frontend**: Use examples to integrate with frontend

## 📞 Support

For any questions or issues with the API documentation:
- Check the Swagger UI for interactive examples
- Review the error responses for troubleshooting
- Use the search functionality to find specific endpoints
- Test endpoints directly in the Swagger UI

---

**🎯 The Swagger documentation is now complete and ready for use!** All APIs are documented with examples, authentication, and comprehensive coverage of the entire BlackRiver Fleet Management System.
