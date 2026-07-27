# Complete Repair API - Postman Collection

## Endpoint
```
POST /api/v1/admin/fleet-maintenance/general-repairs/:id/complete
```

## Headers
```
Authorization: Bearer {{token}}
Content-Type: multipart/form-data
```

## Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repairDetails` | string | ✅ Yes | Detailed description of the repair work performed |
| `totalAmount` | number | ✅ Yes | Total amount including parts, labor, and taxes |
| `invoice` | file | ⚠️ Conditional* | Invoice PDF or image file (PDF, JPG, PNG) |
| `invoiceNumber` | string | ⚠️ Conditional* | Invoice number (required if invoice file not uploaded) |
| `parts` | JSON string | ❌ No | Array of parts used (must be JSON string in form-data) |
| `taxes` | JSON string | ❌ No | Array of tax information (must be JSON string in form-data) |
| `completionDate` | string (ISO) | ❌ No | Completion date (defaults to current date) |

*Either `invoice` file OR `invoiceNumber` must be provided.

---

## Postman Examples

### Example 1: With Invoice File Upload (Recommended)

**Method:** `POST`  
**URL:** `{{baseUrl}}/admin/fleet-maintenance/general-repairs/:orderId/complete`

**Body Type:** `form-data`

| Key | Type | Value |
|-----|------|-------|
| `repairDetails` | Text | `Completed oil change, replaced filter, checked all fluids. Vehicle is in good condition.` |
| `totalAmount` | Text | `74.03` |
| `invoice` | File | Select PDF or image file |
| `parts` | Text | `[{"partId":"699d3e1977e2ee14eafca9e5","partName":"Engine Oil Filter","partNumber":"OF-12345","quantity":1,"cost":25.50}]` |
| `taxes` | Text | `[{"name":"GST","percentage":5,"amount":3.53}]` |
| `completionDate` | Text | `2026-02-26T14:30:00.000Z` |

**JSON for `parts` field:**
```json
[
  {
    "partId": "699d3e1977e2ee14eafca9e5",
    "partName": "Engine Oil Filter",
    "partNumber": "OF-12345",
    "quantity": 1,
    "cost": 25.50
  }
]
```

**JSON for `taxes` field:**
```json
[
  {
    "name": "GST",
    "percentage": 5,
    "amount": 3.53
  }
]
```

---

### Example 2: With Invoice Number Only (No File)

**Method:** `POST`  
**URL:** `{{baseUrl}}/admin/fleet-maintenance/general-repairs/:orderId/complete`

**Body Type:** `form-data`

| Key | Type | Value |
|-----|------|-------|
| `repairDetails` | Text | `Completed oil change, replaced filter, checked all fluids. Vehicle is in good condition.` |
| `totalAmount` | Text | `74.03` |
| `invoiceNumber` | Text | `INV-REP-2026-001` |
| `parts` | Text | `[{"partName":"Engine Oil Filter","partNumber":"OF-12345","quantity":1,"cost":25.50}]` |
| `taxes` | Text | `[{"name":"GST","percentage":5,"amount":3.53}]` |

---

### Example 3: Minimal (Required Fields Only)

**Method:** `POST`  
**URL:** `{{baseUrl}}/admin/fleet-maintenance/general-repairs/:orderId/complete`

**Body Type:** `form-data`

| Key | Type | Value |
|-----|------|-------|
| `repairDetails` | Text | `Completed oil change and filter replacement.` |
| `totalAmount` | Text | `50.00` |
| `invoice` | File | Select PDF or image file |

---

### Example 4: Multiple Parts with File Upload

**Method:** `POST`  
**URL:** `{{baseUrl}}/admin/fleet-maintenance/general-repairs/:orderId/complete`

**Body Type:** `form-data`

| Key | Type | Value |
|-----|------|-------|
| `repairDetails` | Text | `Completed comprehensive brake service. Replaced front brake pads, rotors, and brake fluid.` |
| `totalAmount` | Text | `246.97` |
| `invoice` | File | Select PDF or image file |
| `parts` | Text | `[{"partName":"Front Brake Pads","partNumber":"BP-FRONT-001","quantity":2,"cost":85.00},{"partName":"Front Brake Rotors","partNumber":"BR-FRONT-001","quantity":2,"cost":120.00},{"partName":"Brake Fluid DOT 4","partNumber":"BF-DOT4-001","quantity":1,"cost":15.50}]` |
| `taxes` | Text | `[{"name":"GST","percentage":5,"amount":11.03},{"name":"PST","percentage":7,"amount":15.44}]` |
| `completionDate` | Text | `2026-02-26T16:45:00.000Z` |

**JSON for `parts` field:**
```json
[
  {
    "partName": "Front Brake Pads",
    "partNumber": "BP-FRONT-001",
    "quantity": 2,
    "cost": 85.00
  },
  {
    "partName": "Front Brake Rotors",
    "partNumber": "BR-FRONT-001",
    "quantity": 2,
    "cost": 120.00
  },
  {
    "partName": "Brake Fluid DOT 4",
    "partNumber": "BF-DOT4-001",
    "quantity": 1,
    "cost": 15.50
  }
]
```

**JSON for `taxes` field:**
```json
[
  {
    "name": "GST",
    "percentage": 5,
    "amount": 11.03
  },
  {
    "name": "PST",
    "percentage": 7,
    "amount": 15.44
  }
]
```

---

## Parts Array Structure

Each part object in the `parts` array:

| Key | Type | Required | Example |
|-----|------|----------|---------|
| `partId` | string | ❌ No | `"699d3e1977e2ee14eafca9e5"` |
| `partName` | string | ✅ Yes* | `"Engine Oil Filter"` |
| `partNumber` | string | ❌ No | `"OF-12345"` |
| `quantity` | number | ❌ No (default: 1) | `1` |
| `cost` | number | ❌ No (default: 0) | `25.50` |

*Required if `partId` is not provided

---

## Taxes Array Structure

Each tax object in the `taxes` array:

| Key | Type | Required | Example |
|-----|------|----------|---------|
| `name` | string | ✅ Yes | `"GST"` |
| `percentage` | number | ✅ Yes | `5` |
| `amount` | number | ❌ No | `3.53` |

---

## Response

**Success Response (200):**
```json
{
  "success": true,
  "message": "Repair completed successfully",
  "data": {
    "_id": "69a016218b41cf2204ce3886",
    "status": "completed",
    "repairDetails": "Completed oil change, replaced filter, checked all fluids. Vehicle is in good condition.",
    "completedParts": [
      {
        "partId": "699d3e1977e2ee14eafca9e5",
        "partName": "Engine Oil Filter",
        "partNumber": "OF-12345",
        "quantity": 1,
        "cost": 25.50
      }
    ],
    "completionInvoiceNumber": null,
    "invoiceUploadUrl": "documents/1737891234567-invoice.pdf",
    "completionTaxes": [
      {
        "name": "GST",
        "percentage": 5,
        "amount": 3.53
      }
    ],
    "completionTotalAmount": 74.03,
    "completionDate": "2026-02-26T14:30:00.000Z",
    "completedBy": "69848891e121b232196e69d1"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "repairDetails and totalAmount are required"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "Either invoice file must be uploaded or invoiceNumber must be provided"
}
```

---

## Important Notes

1. **File Upload**: The invoice file must be uploaded as `multipart/form-data` with the field name `invoice`
2. **JSON Fields**: `parts` and `taxes` must be sent as JSON strings in form-data (not as raw JSON)
3. **File Types**: Supported file types for invoice: PDF, JPG, PNG
4. **File Size**: Maximum file size is 20 MB
5. **S3 Storage**: In production, files are automatically uploaded to AWS S3 and the S3 key is stored
6. **Local Storage**: In development, files are stored locally in the `uploads/documents` folder

---

## Postman Collection JSON

```json
{
  "name": "Complete Repair with File Upload",
  "request": {
    "method": "POST",
    "header": [
      {
        "key": "Authorization",
        "value": "Bearer {{token}}"
      }
    ],
    "body": {
      "mode": "formdata",
      "formdata": [
        {
          "key": "repairDetails",
          "value": "Completed oil change, replaced filter, checked all fluids. Vehicle is in good condition.",
          "type": "text"
        },
        {
          "key": "totalAmount",
          "value": "74.03",
          "type": "text"
        },
        {
          "key": "invoice",
          "type": "file",
          "src": []
        },
        {
          "key": "parts",
          "value": "[{\"partId\":\"699d3e1977e2ee14eafca9e5\",\"partName\":\"Engine Oil Filter\",\"partNumber\":\"OF-12345\",\"quantity\":1,\"cost\":25.50}]",
          "type": "text"
        },
        {
          "key": "taxes",
          "value": "[{\"name\":\"GST\",\"percentage\":5,\"amount\":3.53}]",
          "type": "text"
        },
        {
          "key": "completionDate",
          "value": "2026-02-26T14:30:00.000Z",
          "type": "text"
        }
      ]
    },
    "url": {
      "raw": "{{baseUrl}}/admin/fleet-maintenance/general-repairs/:orderId/complete",
      "host": ["{{baseUrl}}"],
      "path": ["admin", "fleet-maintenance", "general-repairs", ":orderId", "complete"],
      "variable": [
        {
          "key": "orderId",
          "value": "69a016218b41cf2204ce3886"
        }
      ]
    }
  }
}
```

