# Swagger/OpenAPI Documentation Setup Guide

## Overview
Complete Swagger/OpenAPI documentation for the BlackRiver Fleet Management System. This provides interactive API documentation, testing interface, and comprehensive schema definitions.

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
npm install swagger-jsdoc swagger-ui-express
```

### 2. Start the Server
```bash
npm start
```

### 3. Access Swagger UI
Open your browser and go to:
```
http://localhost:3000/api-docs
```

## 📋 Available APIs

### Employee Management
- **POST** `/api/v1/employee/` - Create employee
- **GET** `/api/v1/employee/` - Get all employees (with filters)
- **GET** `/api/v1/employee/stats` - Get employee statistics
- **GET** `/api/v1/employee/:id` - Get employee by ID
- **PUT** `/api/v1/employee/:id` - Update employee
- **PATCH** `/api/v1/employee/:id/status` - Update employee status
- **PATCH** `/api/v1/employee/:id/reset-password` - Reset employee password
- **DELETE** `/api/v1/employee/:id` - Delete employee
- **DELETE** `/api/v1/employee/bulk/delete` - Bulk delete employees

### Vehicle Services
- **POST** `/api/v1/admin/vehicle-service/` - Create vehicle service
- **GET** `/api/v1/admin/vehicle-service/` - Get all vehicle services
- **GET** `/api/v1/admin/vehicle-service/:id` - Get vehicle service by ID
- **PUT** `/api/v1/admin/vehicle-service/:id` - Update vehicle service
- **PATCH** `/api/v1/admin/vehicle-service/:id/status` - Update service status
- **DELETE** `/api/v1/admin/vehicle-service/:id` - Delete vehicle service

### Authentication
- **POST** `/api/v1/login` - User login

## 🔐 Authentication

### Getting a JWT Token
1. Use the login endpoint:
   ```json
   POST /api/v1/login
   {
     "email": "admin@blackriver.com",
     "password": "your-password"
   }
   ```

2. Copy the token from the response

### Using Authentication in Swagger UI
1. Click the "Authorize" button in Swagger UI
2. Enter: `Bearer your-jwt-token-here`
3. Click "Authorize"
4. Now you can test protected endpoints

## 🧪 Testing APIs

### Using Swagger UI
1. **Navigate to endpoint**: Click on any endpoint to expand it
2. **Try it out**: Click "Try it out" button
3. **Fill parameters**: Enter required parameters
4. **Execute**: Click "Execute" button
5. **View results**: See response, status code, and headers

### Example: Creating an Employee
1. Go to **POST** `/api/v1/employee/`
2. Click "Try it out"
3. Fill in the request body:
   ```json
   {
     "name": "John Doe",
     "email": "john.doe@company.com",
     "phone": "+1234567890",
     "role": "driver",
     "country": "USA",
     "state": "California",
     "city": "Los Angeles",
     "status": "active",
     "internalId": "EMP001"
   }
   ```
4. Click "Execute"
5. View the response

## 📊 Features

### Interactive Documentation
- ✅ Live API testing
- ✅ Request/response examples
- ✅ Schema validation
- ✅ Error response documentation
- ✅ Authentication support

### Comprehensive Schemas
- ✅ User/Employee models
- ✅ Vehicle Service models
- ✅ Request/Response schemas
- ✅ Validation rules
- ✅ Error schemas

### Filtering and Search
- ✅ Employee filtering by role, status, company
- ✅ Search by name, email, phone, internal ID
- ✅ Pagination support
- ✅ Sorting options

### Bulk Operations
- ✅ Bulk delete employees
- ✅ Bulk operations for efficiency
- ✅ Transaction support

## 🔧 Customization

### Adding New Endpoints
1. Create route documentation in `routes/*.swagger.js`
2. Add JSDoc comments with `@swagger` tags
3. Define schemas in `swagger/swagger.js`
4. Restart server to see changes

### Modifying Schemas
1. Edit `swagger/swagger.js`
2. Update the `components.schemas` section
3. Add new schemas or modify existing ones
4. Restart server

### Custom Styling
Edit the Swagger UI setup in `app.js`:
```javascript
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "BlackRiver Fleet Management API"
}));
```

## 📁 File Structure

```
blackRiverBackend/
├── swagger/
│   └── swagger.js                 # Main Swagger configuration
├── routes/
│   ├── employeeRoute.swagger.js   # Employee API documentation
│   ├── vehicleService.swagger.js  # Vehicle Service API documentation
│   └── auth.swagger.js            # Authentication API documentation
├── docs/
│   └── swagger-setup.md           # This setup guide
└── app.js                         # Swagger UI setup
```

## 🚨 Troubleshooting

### Common Issues

1. **Swagger UI not loading**
   - Check if dependencies are installed
   - Verify server is running
   - Check console for errors

2. **Authentication not working**
   - Ensure JWT token is valid
   - Check token format: `Bearer your-token`
   - Verify user has required permissions

3. **API endpoints not showing**
   - Check if route files are properly imported
   - Verify JSDoc comments are correct
   - Restart server after changes

4. **Schema validation errors**
   - Check request body format
   - Verify required fields are provided
   - Check data types match schema

### Debug Mode
Enable debug mode by adding to your environment:
```bash
DEBUG=swagger:*
```

## 📚 Additional Resources

- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- [OpenAPI Specification](https://swagger.io/specification/)
- [swagger-jsdoc Documentation](https://github.com/Surnet/swagger-jsdoc)
- [swagger-ui-express Documentation](https://github.com/scottie1984/swagger-ui-express)

## 🎯 Best Practices

1. **Always use authentication** for protected endpoints
2. **Provide examples** in request/response schemas
3. **Document all parameters** including optional ones
4. **Use descriptive error messages**
5. **Keep schemas up to date** with actual implementation
6. **Test endpoints** before documenting them
7. **Use consistent naming** conventions

## 🔄 Updates

To update the documentation:
1. Modify the relevant `.swagger.js` file
2. Update schemas if needed
3. Restart the server
4. Refresh Swagger UI

The documentation is automatically generated from the JSDoc comments, so changes are reflected immediately after server restart.
