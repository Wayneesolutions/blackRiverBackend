# Swagger Dependencies

To use the Swagger documentation, you need to install the following packages:

```bash
npm install swagger-jsdoc swagger-ui-express
```

## Installation Commands

```bash
# Install Swagger dependencies
npm install swagger-jsdoc swagger-ui-express

# Or if using yarn
yarn add swagger-jsdoc swagger-ui-express
```

## Package.json Dependencies

Add these to your package.json dependencies:

```json
{
  "dependencies": {
    "swagger-jsdoc": "^6.2.8",
    "swagger-ui-express": "^5.0.0"
  }
}
```

## Usage

After installation, the Swagger documentation will be available at:

- **Development**: http://localhost:3000/api-docs
- **Production**: https://your-domain.com/api-docs

## Features

- ✅ Complete API documentation
- ✅ Interactive API testing
- ✅ Authentication support (JWT Bearer tokens)
- ✅ Request/Response examples
- ✅ Schema validation
- ✅ Error response documentation
- ✅ Custom styling

## API Documentation Includes

1. **Employee Management API**
   - Create, Read, Update, Delete employees
   - Bulk operations
   - Statistics and reporting
   - Status management
   - Password reset

2. **Vehicle Services API**
   - Service creation and management
   - Status updates
   - Filtering and search
   - Priority management

3. **Authentication API**
   - User login
   - JWT token generation
   - Role-based access

4. **All Other APIs**
   - Admin routes
   - Driver routes
   - HR routes
   - Dispatcher routes
   - Super admin routes

## Testing with Swagger UI

1. Go to http://localhost:3000/api-docs
2. Click "Authorize" button
3. Enter your JWT token: `Bearer your-jwt-token-here`
4. Test any endpoint directly from the interface
5. View request/response examples
6. Download the OpenAPI specification

## Customization

The Swagger configuration can be customized in:
- `blackRiverBackend/swagger/swagger.js` - Main configuration
- `blackRiverBackend/routes/*.swagger.js` - Route-specific documentation
