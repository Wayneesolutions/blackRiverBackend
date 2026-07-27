# 🚀 Actual API Routes Guide

## 📋 Overview

This guide shows the **actual routes** that exist in your BlackRiver backend, based on the route files analysis.

## ✅ **Working Admin Routes**

### **Vehicle Management**
- `GET /api/v1/admin/vehicles/list` - Get all vehicles list
- `GET /api/v1/admin/vehicles/live` - Get live vehicles tracking
- `GET /api/v1/admin/vehicle-details/:id` - Get specific vehicle details

### **Maintenance & Services**
- `GET /api/v1/admin/maintanance-details` - Get maintenance schedule
- `GET /api/v1/admin/maintenance-cost` - Get maintenance cost report
- `POST /api/v1/admin/vehicle-service` - Create vehicle service
- `GET /api/v1/admin/vehicle-service` - List vehicle services
- `PUT /api/v1/admin/vehicle-service/:id` - Update vehicle service
- `PATCH /api/v1/admin/vehicle-service/:id/status` - Update service status
- `DELETE /api/v1/admin/vehicle-service/:id` - Delete vehicle service

### **User Management**
- `GET /api/v1/admin/user` - List all users
- `POST /api/v1/admin/user` - Create new user
- `PUT /api/v1/admin/user/:id` - Update user
- `DELETE /api/v1/admin/user/:id` - Delete user
- `PATCH /api/v1/admin/user/:id/status` - Update user status

### **Dashboard & Stats**
- `GET /api/v1/admin/stats` - Get dashboard statistics
- `GET /api/v1/admin/loads-per-month` - Get loads per month
- `GET /api/v1/admin/revenue-trend` - Get revenue trend
- `GET /api/v1/admin/fuel-efficiency` - Get fuel efficiency
- `GET /api/v1/admin/recent-alerts` - Get recent alerts

### **Fleet Management**
- `GET /api/v1/admin/fleet-management/dashboard-stats` - Fleet dashboard stats
- `GET /api/v1/admin/fleet-management/upcoming-overdue` - Upcoming/overdue services
- `GET /api/v1/admin/fleet-management/pending-maintenance-count` - Pending maintenance count
- `GET /api/v1/admin/fleet-management/recent-work-orders` - Recent work orders
- `GET /api/v1/admin/fleet-management/monthly-cost` - Monthly cost

## ❌ **Routes That DON'T Exist**

These routes are **NOT implemented** in your backend:
- `GET /api/v1/admin/vehicles` ❌
- `POST /api/v1/admin/vehicles` ❌
- `PUT /api/v1/admin/vehicles/:id` ❌
- `DELETE /api/v1/admin/vehicles/:id` ❌
- `GET /api/v1/admin/dashboard` ❌

## 🔧 **How to Fix the Issue**

### **Problem:**
You're trying to access `/admin/vehicles` but it doesn't exist.

### **Solution:**
Use the correct route: `/admin/vehicles/list`

### **Example:**
```javascript
// ❌ This will give "Route not found"
fetch('/api/v1/admin/vehicles')

// ✅ This will work
fetch('/api/v1/admin/vehicles/list')
```

## 🎯 **Quick Reference**

### **For Vehicle List:**
```http
GET /api/v1/admin/vehicles/list
Authorization: Bearer your-jwt-token
```

### **For Vehicle Details:**
```http
GET /api/v1/admin/vehicle-details/64f1a2b3c4d5e6f7g8h9i0j1
Authorization: Bearer your-jwt-token
```

### **For Live Vehicle Tracking:**
```http
GET /api/v1/admin/vehicles/live
Authorization: Bearer your-jwt-token
```

### **For Dashboard Stats:**
```http
GET /api/v1/admin/stats
Authorization: Bearer your-jwt-token
```

## 📊 **Complete Route Summary**

**Total Routes Found: 179**

### **Admin Routes: 52**
- User management: 5 routes
- Vehicle management: 3 routes  
- Maintenance: 2 routes
- Vehicle services: 5 routes
- Dashboard stats: 5 routes
- Fleet management: 5 routes
- Other admin functions: 27 routes

### **Super Admin Routes: 6**
- Authentication: 2 routes
- Admin management: 4 routes

### **Driver Routes: 18**
- Authentication: 2 routes
- Loads: 5 routes
- Vehicles: 2 routes
- Profile: 2 routes
- Other: 7 routes

### **Dispatcher Routes: 67**
- Fuel reports: 5 routes
- Places: 6 routes
- Customers: 6 routes
- Contacts: 6 routes
- Vendors: 6 routes
- Fleet: 6 routes
- Trailers: 4 routes
- Service rates: 4 routes
- Vehicles: 6 routes
- Loads: 6 routes
- Other: 12 routes

### **HR Routes: 32**
- Driver management: 6 routes
- Documents: 8 routes
- Payroll: 4 routes
- Expenses: 4 routes
- Invoices: 5 routes
- Reports: 5 routes

### **Employee Routes: 9**
- CRUD operations: 7 routes
- Bulk operations: 1 route
- Statistics: 1 route

## 🚀 **Next Steps**

1. **Update your frontend** to use the correct routes
2. **Use the Swagger documentation** at `/api-docs` to test the APIs
3. **Check the actual route list** above for the correct endpoints
4. **Test with Postman or curl** to verify the routes work

## 🔍 **Testing the Routes**

### **Test with curl:**
```bash
# Test vehicle list
curl -X GET "http://localhost:3000/api/v1/admin/vehicles/list" \
  -H "Authorization: Bearer your-jwt-token"

# Test dashboard stats
curl -X GET "http://localhost:3000/api/v1/admin/stats" \
  -H "Authorization: Bearer your-jwt-token"
```

### **Test with Swagger UI:**
1. Go to `http://localhost:3000/api-docs`
2. Login to get JWT token
3. Authorize with Bearer token
4. Test the routes directly in the UI

---

**🎯 The key issue is that `/admin/vehicles` doesn't exist - use `/admin/vehicles/list` instead!**
