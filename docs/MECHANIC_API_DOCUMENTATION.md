# 🔧 Mechanic Maintenance Orders API Documentation

## Overview
This document provides complete API documentation for mechanics to manage maintenance orders assigned to them.

**Base URL:** `/api/v1/admin/fleet-maintenance`

**Authentication:** All endpoints require Bearer token authentication.

**Authorized Roles:** `admin`, `superadmin`, `Maintenance Crew (Mechanics)`, `Fleet Maintenance Manager`

---

## 📋 API Endpoints

### 1. List Mechanic Orders
Get all maintenance orders assigned to the logged-in mechanic.

**Endpoint:** `GET /mechanic/orders`

**Query Parameters:**
- `status` (optional): Filter by status (`Assigned`, `Shared`, `in-progress`, `completed`)
- `mechanicId` (optional, admin only): Filter by specific mechanic ID

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "serviceDate": "2026-02-26T00:00:00.000Z",
      "unitNumber": "325",
      "makeModel": "1243 2323",
      "vinLicensePlate": "124",
      "description": "Oil change required",
      "odometer": 2000,
      "serviceProvider": "John Mechanic",
      "serviceProviderId": "65a1b2c3d4e5f6g7h8i9j0k2",
      "status": "Assigned",
      "shared": false,
      "customer": "owner operator 1",
      "createdAt": "2026-02-26T10:00:00.000Z",
      "updatedAt": "2026-02-26T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

**Postman Collection:**
```json
{
  "name": "List Mechanic Orders",
  "request": {
    "method": "GET",
    "header": [
      {
        "key": "Authorization",
        "value": "Bearer {{token}}",
        "type": "text"
      }
    ],
    "url": {
      "raw": "{{baseUrl}}/admin/fleet-maintenance/mechanic/orders?status=Assigned",
      "host": ["{{baseUrl}}"],
      "path": ["admin", "fleet-maintenance", "mechanic", "orders"],
      "query": [
        {
          "key": "status",
          "value": "Assigned"
        }
      ]
    }
  }
}
```

---

### 2. Update Order Status to In-Progress
Update a maintenance order status to "in-progress".

**Endpoint:** `PATCH /general-repairs/:id/status`

**URL Parameters:**
- `id` (required): Maintenance order ID

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "status": "in-progress"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "status": "in-progress",
    "updatedBy": "65a1b2c3d4e5f6g7h8i9j0k2",
    "updatedAt": "2026-02-26T11:00:00.000Z"
  }
}
```

**Postman Collection:**
```json
{
  "name": "Update Order Status to In-Progress",
  "request": {
    "method": "PATCH",
    "header": [
      {
        "key": "Authorization",
        "value": "Bearer {{token}}",
        "type": "text"
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "type": "text"
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"status\": \"in-progress\"\n}"
    },
    "url": {
      "raw": "{{baseUrl}}/admin/fleet-maintenance/general-repairs/65a1b2c3d4e5f6g7h8i9j0k1/status",
      "host": ["{{baseUrl}}"],
      "path": ["admin", "fleet-maintenance", "general-repairs", "65a1b2c3d4e5f6g7h8i9j0k1", "status"]
    }
  }
}
```

---

### 3. Complete Repair
Complete a maintenance order with all repair details, parts, invoice, and completion information.

**Endpoint:** `POST /general-repairs/:id/complete`

**URL Parameters:**
- `id` (required): Maintenance order ID

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "repairDetails": "Completed oil change, replaced filter, checked all fluids. Vehicle is in good condition.",
  "parts": [
    {
      "partId": "65a1b2c3d4e5f6g7h8i9j0k3",
      "partName": "Engine Oil Filter",
      "partNumber": "OF-12345",
      "quantity": 1,
      "cost": 25.50
    },
    {
      "partId": "65a1b2c3d4e5f6g7h8i9j0k4",
      "partName": "Synthetic Engine Oil 5W-30",
      "partNumber": "OIL-56789",
      "quantity": 5,
      "cost": 45.00
    }
  ],
  "invoiceNumber": "INV-REP-2026-001",
  "invoiceUploadUrl": "https://storage.example.com/invoices/inv-rep-2026-001.pdf",
  "taxes": [
    {
      "name": "GST",
      "percentage": 5,
      "amount": 3.53
    }
  ],
  "totalAmount": 74.03,
  "completionDate": "2026-02-26T14:30:00.000Z"
}
```

**Field Descriptions:**
- `repairDetails` (required): Detailed description of the repair work performed
- `parts` (optional): Array of parts used in the repair
  - `partId` (optional): Reference to SparePart document
  - `partName` (required if partId not provided): Name of the part
  - `partNumber` (optional): Part number/SKU
  - `quantity` (required): Number of units used (default: 1)
  - `cost` (optional): Cost per part (default: 0)
- `invoiceNumber` (required): Invoice number for this repair
- `invoiceUploadUrl` (optional): URL to uploaded PDF invoice
- `taxes` (optional): Array of tax information
  - `name` (required): Tax name (e.g., "GST", "PST")
  - `percentage` (required): Tax percentage (0-100)
  - `amount` (optional): Calculated tax amount
- `totalAmount` (required): Total amount including parts, labor, and taxes
- `completionDate` (optional): Date and time of completion (defaults to current date)

**Response:**
```json
{
  "success": true,
  "message": "Repair completed successfully",
  "data": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "status": "completed",
    "repairDetails": "Completed oil change, replaced filter, checked all fluids. Vehicle is in good condition.",
    "completedParts": [
      {
        "partId": "65a1b2c3d4e5f6g7h8i9j0k3",
        "partName": "Engine Oil Filter",
        "partNumber": "OF-12345",
        "quantity": 1,
        "cost": 25.50
      },
      {
        "partId": "65a1b2c3d4e5f6g7h8i9j0k4",
        "partName": "Synthetic Engine Oil 5W-30",
        "partNumber": "OIL-56789",
        "quantity": 5,
        "cost": 45.00
      }
    ],
    "completionInvoiceNumber": "INV-REP-2026-001",
    "invoiceUploadUrl": "https://storage.example.com/invoices/inv-rep-2026-001.pdf",
    "completionTaxes": [
      {
        "name": "GST",
        "percentage": 5,
        "amount": 3.53
      }
    ],
    "completionTotalAmount": 74.03,
    "completionDate": "2026-02-26T14:30:00.000Z",
    "completedBy": "65a1b2c3d4e5f6g7h8i9j0k2",
    "updatedAt": "2026-02-26T14:30:00.000Z"
  }
}
```

**Postman Collection:**
```json
{
  "name": "Complete Repair",
  "request": {
    "method": "POST",
    "header": [
      {
        "key": "Authorization",
        "value": "Bearer {{token}}",
        "type": "text"
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "type": "text"
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"repairDetails\": \"Completed oil change, replaced filter, checked all fluids. Vehicle is in good condition.\",\n  \"parts\": [\n    {\n      \"partId\": \"65a1b2c3d4e5f6g7h8i9j0k3\",\n      \"partName\": \"Engine Oil Filter\",\n      \"partNumber\": \"OF-12345\",\n      \"quantity\": 1,\n      \"cost\": 25.50\n    },\n    {\n      \"partId\": \"65a1b2c3d4e5f6g7h8i9j0k4\",\n      \"partName\": \"Synthetic Engine Oil 5W-30\",\n      \"partNumber\": \"OIL-56789\",\n      \"quantity\": 5,\n      \"cost\": 45.00\n    }\n  ],\n  \"invoiceNumber\": \"INV-REP-2026-001\",\n  \"invoiceUploadUrl\": \"https://storage.example.com/invoices/inv-rep-2026-001.pdf\",\n  \"taxes\": [\n    {\n      \"name\": \"GST\",\n      \"percentage\": 5,\n      \"amount\": 3.53\n    }\n  ],\n  \"totalAmount\": 74.03,\n  \"completionDate\": \"2026-02-26T14:30:00.000Z\"\n}"
    },
    "url": {
      "raw": "{{baseUrl}}/admin/fleet-maintenance/general-repairs/65a1b2c3d4e5f6g7h8i9j0k1/complete",
      "host": ["{{baseUrl}}"],
      "path": ["admin", "fleet-maintenance", "general-repairs", "65a1b2c3d4e5f6g7h8i9j0k1", "complete"]
    }
  }
}
```

---

## 📝 Example Scenarios

### Scenario 1: Mechanic starts working on an order
1. **List assigned orders:**
   ```
   GET /admin/fleet-maintenance/mechanic/orders?status=Assigned
   ```

2. **Update status to in-progress:**
   ```
   PATCH /admin/fleet-maintenance/general-repairs/:id/status
   Body: { "status": "in-progress" }
   ```

### Scenario 2: Mechanic completes a repair
1. **Complete the repair with all details:**
   ```
   POST /admin/fleet-maintenance/general-repairs/:id/complete
   Body: {
     "repairDetails": "...",
     "parts": [...],
     "invoiceNumber": "...",
     "totalAmount": 100.00
   }
   ```

---

## ⚠️ Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Mechanic ID not found in token"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "You are not assigned to this maintenance order"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Maintenance order not found"
}
```

### 400 Bad Request
```json
{
  "success": false,
  "message": "repairDetails, invoiceNumber, and totalAmount are required"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Failed to complete repair",
  "error": "Detailed error message (development only)"
}
```

---

## 🔐 Authorization Rules

1. **Mechanics** can only see and update orders assigned to them (`serviceProviderId` matches their user ID)
2. **Admins and Fleet Maintenance Managers** can see all orders and filter by `mechanicId` query parameter
3. **Status transitions:**
   - `Assigned` or `Shared` → `in-progress` ✅
   - `in-progress` → `completed` ✅ (via complete endpoint)
   - Other transitions are not allowed

---

## 📦 Complete Postman Collection

Save this as `Mechanic_Maintenance_Orders.postman_collection.json`:

```json
{
  "info": {
    "name": "Mechanic Maintenance Orders API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "List Mechanic Orders",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "url": {
          "raw": "{{baseUrl}}/admin/fleet-maintenance/mechanic/orders?status=Assigned",
          "host": ["{{baseUrl}}"],
          "path": ["admin", "fleet-maintenance", "mechanic", "orders"],
          "query": [
            {
              "key": "status",
              "value": "Assigned"
            }
          ]
        }
      }
    },
    {
      "name": "Update Order Status to In-Progress",
      "request": {
        "method": "PATCH",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"status\": \"in-progress\"\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/admin/fleet-maintenance/general-repairs/:orderId/status",
          "host": ["{{baseUrl}}"],
          "path": ["admin", "fleet-maintenance", "general-repairs", ":orderId", "status"],
          "variable": [
            {
              "key": "orderId",
              "value": "65a1b2c3d4e5f6g7h8i9j0k1"
            }
          ]
        }
      }
    },
    {
      "name": "Complete Repair",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"repairDetails\": \"Completed oil change, replaced filter, checked all fluids. Vehicle is in good condition.\",\n  \"parts\": [\n    {\n      \"partId\": \"65a1b2c3d4e5f6g7h8i9j0k3\",\n      \"partName\": \"Engine Oil Filter\",\n      \"partNumber\": \"OF-12345\",\n      \"quantity\": 1,\n      \"cost\": 25.50\n    },\n    {\n      \"partName\": \"Synthetic Engine Oil 5W-30\",\n      \"partNumber\": \"OIL-56789\",\n      \"quantity\": 5,\n      \"cost\": 45.00\n    }\n  ],\n  \"invoiceNumber\": \"INV-REP-2026-001\",\n  \"invoiceUploadUrl\": \"https://storage.example.com/invoices/inv-rep-2026-001.pdf\",\n  \"taxes\": [\n    {\n      \"name\": \"GST\",\n      \"percentage\": 5,\n      \"amount\": 3.53\n    }\n  ],\n  \"totalAmount\": 74.03,\n  \"completionDate\": \"2026-02-26T14:30:00.000Z\"\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/admin/fleet-maintenance/general-repairs/:orderId/complete",
          "host": ["{{baseUrl}}"],
          "path": ["admin", "fleet-maintenance", "general-repairs", ":orderId", "complete"],
          "variable": [
            {
              "key": "orderId",
              "value": "65a1b2c3d4e5f6g7h8i9j0k1"
            }
          ]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:5000/api/v1"
    },
    {
      "key": "token",
      "value": "your-jwt-token-here"
    }
  ]
}
```

---

## 🎯 Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/mechanic/orders` | GET | List orders assigned to mechanic |
| `/general-repairs/:id/status` | PATCH | Update order status to in-progress |
| `/general-repairs/:id/complete` | POST | Complete repair with all details |

---

## 📌 Notes

1. **Invoice Upload:** The `invoiceUploadUrl` should be set after uploading the PDF to your storage service (S3, Cloudinary, etc.). The upload endpoint is separate and should be implemented based on your file upload strategy.

2. **Parts:** You can either reference existing parts using `partId` or create new part entries using `partName` and `partNumber`.

3. **Taxes:** Tax amounts can be calculated automatically or provided manually. The system validates that percentages are between 0-100.

4. **Status Flow:** 
   - `Created` → `Assigned` (by admin)
   - `Assigned` → `Shared` (when email sent)
   - `Assigned`/`Shared` → `in-progress` (by mechanic)
   - `in-progress` → `completed` (by mechanic via complete endpoint)

