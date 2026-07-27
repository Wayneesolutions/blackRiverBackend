# Employee Management API Documentation

## Overview
Complete REST API for managing employees using the User model. Includes CRUD operations, filtering, pagination, statistics, and bulk operations.

## Base URL
```
http://localhost:3000/api/v1/employee
```

## Authentication
All endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Authorization Roles
- **admin**: Full access to all employee operations
- **superadmin**: Full access to all employee operations
- **hr**: Full access to all employee operations
- **dispatcher**: Read-only access to employee data

---

## 📋 API Endpoints

### 1. Create Employee
**POST** `/`

**Authorization:** admin, superadmin, hr

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john.doe@company.com",
  "phone": "+1234567890",
  "role": "driver",
  "country": "USA",
  "state": "California",
  "city": "Los Angeles",
  "joinDate": "2024-01-15T00:00:00.000Z",
  "status": "active",
  "company": "64f1a2b3c4d5e6f7g8h9i0j1",
  "internalId": "EMP001",
  "address": "123 Main St, Los Angeles, CA",
  "longitude": "-118.2437",
  "latitude": "34.0522",
  "licenceNumber": "DL123456789",
  "vendor": "ABC Transport",
  "vehicle": "64f1a2b3c4d5e6f7g8h9i0j2"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Employee created successfully",
  "data": {
    "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
    "name": "John Doe",
    "email": "john.doe@company.com",
    "phone": "+1234567890",
    "role": "driver",
    "status": "active",
    "joinDate": "2024-01-15T00:00:00.000Z",
    "internalId": "EMP001"
  }
}
```

### 2. Get All Employees
**GET** `/`

**Authorization:** admin, superadmin, hr, dispatcher

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `search` (optional): Search in name, email, phone, internalId
- `role` (optional): Filter by role
- `status` (optional): Filter by status (active/inactive)
- `company` (optional): Filter by company ID
- `sortBy` (optional): Sort field (default: createdAt)
- `sortOrder` (optional): Sort order (asc/desc, default: desc)

**Example:**
```
GET /?page=1&limit=10&search=john&role=driver&status=active&sortBy=name&sortOrder=asc
```

**Response:**
```json
{
  "success": true,
  "message": "Employees fetched successfully",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
      "name": "John Doe",
      "email": "john.doe@company.com",
      "phone": "+1234567890",
      "role": "driver",
      "status": "active",
      "joinDate": "2024-01-15T00:00:00.000Z",
      "internalId": "EMP001",
      "company": {
        "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
        "name": "ABC Company"
      },
      "location": {
        "address": "123 Main St, Los Angeles, CA",
        "longitude": "-118.2437",
        "latitude": "34.0522"
      },
      "details": {
        "licenceNumber": "DL123456789",
        "vendor": "ABC Transport",
        "vehicle": {
          "_id": "64f1a2b3c4d5e6f7g8h9i0j2",
          "plateNumber": "ABC123",
          "make": "Ford",
          "model": "Transit"
        }
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalEmployees": 47,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### 3. Get Employee by ID
**GET** `/:id`

**Authorization:** admin, superadmin, hr, dispatcher

**Response:**
```json
{
  "success": true,
  "message": "Employee fetched successfully",
  "data": {
    "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
    "name": "John Doe",
    "email": "john.doe@company.com",
    "phone": "+1234567890",
    "role": "driver",
    "status": "active",
    "joinDate": "2024-01-15T00:00:00.000Z",
    "internalId": "EMP001",
    "company": {
      "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
      "name": "ABC Company"
    },
    "location": {
      "address": "123 Main St, Los Angeles, CA",
      "longitude": "-118.2437",
      "latitude": "34.0522"
    },
    "details": {
      "licenceNumber": "DL123456789",
      "vendor": "ABC Transport",
      "vehicle": {
        "_id": "64f1a2b3c4d5e6f7g8h9i0j2",
        "plateNumber": "ABC123",
        "make": "Ford",
        "model": "Transit"
      }
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 4. Update Employee
**PUT** `/:id`

**Authorization:** admin, superadmin, hr

**Request Body:** (All fields optional)
```json
{
  "name": "John Smith",
  "email": "john.smith@company.com",
  "phone": "+1234567891",
  "role": "dispatcher",
  "status": "active",
  "address": "456 Oak St, Los Angeles, CA"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Employee updated successfully",
  "data": {
    "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
    "name": "John Smith",
    "email": "john.smith@company.com",
    "phone": "+1234567891",
    "role": "dispatcher",
    "status": "active",
    "updatedAt": "2024-01-15T11:30:00.000Z"
  }
}
```

### 5. Update Employee Status
**PATCH** `/:id/status`

**Authorization:** admin, superadmin, hr

**Request Body:**
```json
{
  "status": "inactive"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Employee status updated successfully",
  "data": {
    "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
    "name": "John Smith",
    "email": "john.smith@company.com",
    "role": "dispatcher",
    "status": "inactive",
    "updatedAt": "2024-01-15T12:00:00.000Z"
  }
}
```

### 6. Reset Employee Password
**PATCH** `/:id/reset-password`

**Authorization:** admin, superadmin, hr

**Response:**
```json
{
  "success": true,
  "message": "Employee password reset successfully. Default password: Employee@123",
  "data": {
    "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
    "name": "John Smith",
    "email": "john.smith@company.com"
  }
}
```

### 7. Delete Employee
**DELETE** `/:id`

**Authorization:** admin, superadmin, hr

**Response:**
```json
{
  "success": true,
  "message": "Employee deleted successfully",
  "data": {
    "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
    "name": "John Smith",
    "email": "john.smith@company.com"
  }
}
```

### 8. Bulk Delete Employees
**DELETE** `/bulk/delete`

**Authorization:** admin, superadmin, hr

**Request Body:**
```json
{
  "employeeIds": [
    "64f1a2b3c4d5e6f7g8h9i0j3",
    "64f1a2b3c4d5e6f7g8h9i0j4",
    "64f1a2b3c4d5e6f7g8h9i0j5"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "3 employees deleted successfully",
  "data": {
    "deletedCount": 3
  }
}
```

### 9. Get Employee Statistics
**GET** `/stats`

**Authorization:** admin, superadmin, hr

**Response:**
```json
{
  "success": true,
  "message": "Employee statistics fetched successfully",
  "data": {
    "total": 150,
    "active": 142,
    "inactive": 8,
    "byRole": [
      {
        "_id": "driver",
        "count": 85
      },
      {
        "_id": "dispatcher",
        "count": 25
      },
      {
        "_id": "hr",
        "count": 15
      },
      {
        "_id": "admin",
        "count": 10
      },
      {
        "_id": "customer",
        "count": 15
      }
    ],
    "monthlyJoins": [
      {
        "_id": {
          "year": 2024,
          "month": 1
        },
        "count": 12
      },
      {
        "_id": {
          "year": 2023,
          "month": 12
        },
        "count": 8
      }
    ]
  }
}
```

---

## 🔧 Data Models

### Employee Object Structure
```javascript
{
  _id: ObjectId,
  name: String,
  email: String,
  phone: String,
  country: String,
  state: String,
  city: String,
  role: String, // enum: ['admin','superadmin','driver','dispatcher','hr','contact','customer','reporter']
  status: String, // enum: ['active','inactive']
  joinDate: Date,
  profileImageUrl: String,
  avatar: String,
  company: ObjectId, // ref: CompanySettings
  internalId: String,
  location: {
    address: String,
    longitude: String,
    latitude: String
  },
  details: {
    licenceNumber: String,
    vendor: String,
    vehicle: ObjectId // ref: Vehicle
  },
  createdAt: Date,
  updatedAt: Date
}
```

---

## ⚠️ Error Responses

### Validation Error (400)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "msg": "Name is required",
      "param": "name",
      "location": "body"
    }
  ]
}
```

### Not Found Error (404)
```json
{
  "success": false,
  "message": "Employee not found"
}
```

### Server Error (500)
```json
{
  "success": false,
  "message": "Server error",
  "error": "Detailed error message"
}
```

---

## 🚀 Usage Examples

### Frontend Integration Examples

#### 1. Fetch Employees with Filters
```javascript
const fetchEmployees = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.keys(filters).forEach(key => {
    if (filters[key]) params.append(key, filters[key]);
  });
  
  const response = await fetch(`/api/v1/employee?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return response.json();
};
```

#### 2. Create Employee
```javascript
const createEmployee = async (employeeData) => {
  const response = await fetch('/api/v1/employee', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(employeeData)
  });
  
  return response.json();
};
```

#### 3. Update Employee Status
```javascript
const updateEmployeeStatus = async (employeeId, status) => {
  const response = await fetch(`/api/v1/employee/${employeeId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ status })
  });
  
  return response.json();
};
```

---

## 📝 Notes

1. **Default Password**: New employees are created with default password "Employee@123"
2. **Email Uniqueness**: Email addresses must be unique across all employees
3. **Role Validation**: Only valid roles from the enum are accepted
4. **Pagination**: Default page size is 10, maximum recommended is 100
5. **Search**: Searches across name, email, phone, and internalId fields
6. **Sorting**: Can sort by any field in the employee document
7. **Bulk Operations**: Bulk delete supports up to 100 employees at once
8. **Statistics**: Real-time statistics for dashboard and reporting

This API provides a complete employee management system with all necessary CRUD operations, filtering, pagination, and administrative features.
