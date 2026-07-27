/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeDocument:
 *       type: object
 *       required:
 *         - employee
 *         - documentType
 *       properties:
 *         _id:
 *           type: string
 *           description: Unique identifier for the document
 *           example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *         employee:
 *           type: string
 *           description: Employee ID reference
 *           example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *         documentType:
 *           type: string
 *           enum: ["Employment Contract", "ID Document", "Passport", "Work Permit", "Background Check", "Drug Test", "Training Certificate", "Insurance Policy", "Company Policy", "Performance Review", "Payroll Document", "Tax Document", "Emergency Contact", "Medical Certificate", "Driving Licence", "Travel Document", "Other"]
 *           description: Type of document
 *           example: "Employment Contract"
 *         documentNumber:
 *           type: string
 *           description: Document number or reference
 *           example: "EMP-CONTRACT-2024-001"
 *         issueDate:
 *           type: string
 *           format: date
 *           description: Date when document was issued
 *           example: "2024-01-15"
 *         expiryDate:
 *           type: string
 *           format: date
 *           description: Date when document expires
 *           example: "2025-01-15"
 *         fileUrl:
 *           type: string
 *           description: URL to the uploaded file
 *           example: "https://storage.example.com/documents/contract-001.pdf"
 *         fileName:
 *           type: string
 *           description: Original filename
 *           example: "employment_contract_2024.pdf"
 *         fileSize:
 *           type: integer
 *           description: File size in bytes
 *           example: 2048576
 *         mimeType:
 *           type: string
 *           description: File MIME type
 *           example: "application/pdf"
 *         status:
 *           type: string
 *           enum: ["valid", "expiring-soon", "expired", "pending", "rejected"]
 *           description: Document status
 *           example: "valid"
 *         description:
 *           type: string
 *           description: Additional description or notes
 *           example: "Initial employment contract for new hire"
 *         uploadedBy:
 *           type: string
 *           description: User ID who uploaded the document
 *           example: "64f1a2b3c4d5e6f7g8h9i0j3"
 *         verifiedBy:
 *           type: string
 *           description: User ID who verified the document
 *           example: "64f1a2b3c4d5e6f7g8h9i0j4"
 *         verifiedAt:
 *           type: string
 *           format: date-time
 *           description: Date when document was verified
 *           example: "2024-01-15T10:30:00.000Z"
 *         rejectionReason:
 *           type: string
 *           description: Reason for rejection if status is rejected
 *           example: "Document is unclear and needs to be re-uploaded"
 *         company:
 *           type: string
 *           description: Company ID reference
 *           example: "64f1a2b3c4d5e6f7g8h9i0j5"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Document creation date
 *           example: "2024-01-15T09:00:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Document last update date
 *           example: "2024-01-15T10:30:00.000Z"
 *
 *     CreateEmployeeDocumentRequest:
 *       type: object
 *       required:
 *         - employee
 *         - documentType
 *       properties:
 *         employee:
 *           type: string
 *           description: Employee ID reference
 *           example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *         documentType:
 *           type: string
 *           enum: ["Employment Contract", "ID Document", "Passport", "Work Permit", "Background Check", "Drug Test", "Training Certificate", "Insurance Policy", "Company Policy", "Performance Review", "Payroll Document", "Tax Document", "Emergency Contact", "Medical Certificate", "Driving Licence", "Travel Document", "Other"]
 *           description: Type of document
 *           example: "Employment Contract"
 *         documentNumber:
 *           type: string
 *           description: Document number or reference
 *           example: "EMP-CONTRACT-2024-001"
 *         issueDate:
 *           type: string
 *           format: date
 *           description: Date when document was issued
 *           example: "2024-01-15"
 *         expiryDate:
 *           type: string
 *           format: date
 *           description: Date when document expires
 *           example: "2025-01-15"
 *         description:
 *           type: string
 *           description: Additional description or notes
 *           example: "Initial employment contract for new hire"
 *         status:
 *           type: string
 *           enum: ["valid", "expiring-soon", "expired", "pending", "rejected"]
 *           description: Document status
 *           example: "valid"
 *         documentFile:
 *           type: string
 *           format: binary
 *           description: Document file (PDF, DOC, DOCX, XLS, XLSX, TXT, JPG, PNG)
 *
 *     UpdateEmployeeDocumentRequest:
 *       type: object
 *       properties:
 *         documentType:
 *           type: string
 *           enum: ["Employment Contract", "ID Document", "Passport", "Work Permit", "Background Check", "Drug Test", "Training Certificate", "Insurance Policy", "Company Policy", "Performance Review", "Payroll Document", "Tax Document", "Emergency Contact", "Medical Certificate", "Driving Licence", "Travel Document", "Other"]
 *           description: Type of document
 *         documentNumber:
 *           type: string
 *           description: Document number or reference
 *         issueDate:
 *           type: string
 *           format: date
 *           description: Date when document was issued
 *         expiryDate:
 *           type: string
 *           format: date
 *           description: Date when document expires
 *         description:
 *           type: string
 *           description: Additional description or notes
 *         status:
 *           type: string
 *           enum: ["valid", "expiring-soon", "expired", "pending", "rejected"]
 *           description: Document status
 *         documentFile:
 *           type: string
 *           format: binary
 *           description: New document file (optional - only if replacing existing file)
 *
 *     UpdateDocumentStatusRequest:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           enum: ["valid", "expiring-soon", "expired", "pending", "rejected"]
 *           description: New document status
 *           example: "valid"
 *         rejectionReason:
 *           type: string
 *           description: Reason for rejection (required if status is rejected)
 *           example: "Document is unclear and needs to be re-uploaded"
 *
 *     BulkDeleteEmployeeDocumentsRequest:
 *       type: object
 *       required:
 *         - documentIds
 *       properties:
 *         documentIds:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of document IDs to delete
 *           example: ["64f1a2b3c4d5e6f7g8h9i0j1", "64f1a2b3c4d5e6f7g8h9i0j2"]
 *
 *     EmployeeDocumentResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Employee document created successfully"
 *         data:
 *           $ref: '#/components/schemas/EmployeeDocument'
 *
 *     EmployeeDocumentListResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/EmployeeDocument'
 *         pagination:
 *           type: object
 *           properties:
 *             current:
 *               type: integer
 *               example: 1
 *             pages:
 *               type: integer
 *               example: 5
 *             total:
 *               type: integer
 *               example: 50
 *             limit:
 *               type: integer
 *               example: 10
 *
 *     EmployeeWithDocumentsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               employee:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                   name:
 *                     type: string
 *                     example: "John Doe"
 *                   email:
 *                     type: string
 *                     example: "john.doe@company.com"
 *                   phone:
 *                     type: string
 *                     example: "+1234567890"
 *                   country:
 *                     type: string
 *                     example: "USA"
 *                   state:
 *                     type: string
 *                     example: "California"
 *                   city:
 *                     type: string
 *                     example: "Los Angeles"
 *                   role:
 *                     type: string
 *                     example: "driver"
 *                   status:
 *                     type: string
 *                     example: "active"
 *                   joinDate:
 *                     type: string
 *                     format: date-time
 *                     example: "2024-01-15T00:00:00.000Z"
 *                   internalId:
 *                     type: string
 *                     example: "EMP001"
 *                   location:
 *                     type: object
 *                     properties:
 *                       address:
 *                         type: string
 *                         example: "123 Main St, Los Angeles, CA"
 *                       longitude:
 *                         type: string
 *                         example: "-118.2437"
 *                       latitude:
 *                         type: string
 *                         example: "34.0522"
 *                   company:
 *                     type: string
 *                     example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *               documents:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/EmployeeDocument'
 *         pagination:
 *           type: object
 *           properties:
 *             current:
 *               type: integer
 *               example: 1
 *             pages:
 *               type: integer
 *               example: 5
 *             total:
 *               type: integer
 *               example: 47
 *             limit:
 *               type: integer
 *               example: 10
 *
 *     EmployeeDocumentStatsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             totalDocuments:
 *               type: integer
 *               example: 150
 *             validDocuments:
 *               type: integer
 *               example: 120
 *             expiringDocuments:
 *               type: integer
 *               example: 15
 *             expiredDocuments:
 *               type: integer
 *               example: 10
 *             pendingDocuments:
 *               type: integer
 *               example: 3
 *             rejectedDocuments:
 *               type: integer
 *               example: 2
 *             expiringIn30Days:
 *               type: integer
 *               example: 15
 *             documentTypes:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: "Employment Contract"
 *                   count:
 *                     type: integer
 *                     example: 25
 *
 * tags:
 *   - name: Employee Document Management
 *     description: Operations related to employee document management
 */

/**
 * @swagger
 * /employee-documents:
 *   post:
 *     tags: [Employee Document Management]
 *     summary: Create a new employee document with file upload
 *     description: Create a new document for an employee with file upload support (multipart/form-data)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - employee
 *               - documentType
 *             properties:
 *               employee:
 *                 type: string
 *                 description: Employee ID reference
 *                 example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *               documentType:
 *                 type: string
 *                 enum: ["Employment Contract", "ID Document", "Passport", "Work Permit", "Background Check", "Drug Test", "Training Certificate", "Insurance Policy", "Company Policy", "Performance Review", "Payroll Document", "Tax Document", "Emergency Contact", "Medical Certificate", "Other"]
 *                 description: Type of document
 *                 example: "Employment Contract"
 *               documentNumber:
 *                 type: string
 *                 description: Document number or reference
 *                 example: "EMP-CONTRACT-2024-001"
 *               issueDate:
 *                 type: string
 *                 format: date
 *                 description: Date when document was issued
 *                 example: "2024-01-15"
 *               expiryDate:
 *                 type: string
 *                 format: date
 *                 description: Date when document expires
 *                 example: "2025-01-15"
 *               description:
 *                 type: string
 *                 description: Additional description or notes
 *                 example: "Initial employment contract for new hire"
 *               status:
 *                 type: string
 *                 enum: ["valid", "expiring-soon", "expired", "pending", "rejected"]
 *                 description: Document status
 *                 example: "valid"
 *               documentFile:
 *                 type: string
 *                 format: binary
 *                 description: Document file (PDF, DOC, DOCX, XLS, XLSX, TXT, JPG, PNG)
 *           examples:
 *             employmentContract:
 *               summary: Employment Contract with File
 *               value:
 *                 employee: "64f1a2b3c4d5e6f7g8h9i0j2"
 *                 documentType: "Employment Contract"
 *                 documentNumber: "EMP-CONTRACT-2024-001"
 *                 issueDate: "2024-01-15"
 *                 expiryDate: "2025-01-15"
 *                 description: "Initial employment contract for new hire"
 *                 status: "valid"
 *                 documentFile: "[File upload]"
 *     responses:
 *       201:
 *         description: Employee document created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployeeDocumentResponse'
 *       400:
 *         description: Validation error, duplicate document, or file upload error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   examples:
 *                     validation: "Validation failed"
 *                     duplicate: "Document of type 'Employment Contract' already exists for this employee"
 *                     fileSize: "File size too large. Maximum size is 10MB."
 *                     fileType: "Invalid file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, TXT, JPG, PNG"
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                       message:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access"
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Access denied"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Server error"
 *
 *   get:
 *     tags: [Employee Document Management]
 *     summary: Get all employees with their documents
 *     description: Retrieve all employees with their associated documents grouped together. Supports filtering by employee, document type, and status with pagination and sorting
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: employee
 *         schema:
 *           type: string
 *         description: Filter by employee ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *       - in: query
 *         name: documentType
 *         schema:
 *           type: string
 *           enum: ["Employment Contract", "ID Document", "Passport", "Work Permit", "Background Check", "Drug Test", "Training Certificate", "Insurance Policy", "Company Policy", "Performance Review", "Payroll Document", "Tax Document", "Emergency Contact", "Medical Certificate", "Driving Licence", "Travel Document", "Other"]
 *         description: Filter by document type
 *         example: "Employment Contract"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ["valid", "expiring-soon", "expired", "pending", "rejected"]
 *         description: Filter by document status
 *         example: "valid"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of documents per page
 *         example: 10
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, expiryDate, documentType, status]
 *           default: createdAt
 *         description: Field to sort by
 *         example: "createdAt"
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *         example: "desc"
 *     responses:
 *       200:
 *         description: Employees with their documents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployeeWithDocumentsResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /employee-documents/stats:
 *   get:
 *     tags: [Employee Document Management]
 *     summary: Get employee document statistics
 *     description: Retrieve comprehensive statistics about employee documents including counts by status and type
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Employee document statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployeeDocumentStatsResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /employee-documents/expiring:
 *   get:
 *     tags: [Employee Document Management]
 *     summary: Get documents expiring soon
 *     description: Retrieve all documents that are expiring within a specified number of days
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 30
 *         description: Number of days to check for expiring documents
 *         example: 30
 *     responses:
 *       200:
 *         description: Expiring documents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployeeDocumentListResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /employee-documents/employee/{employeeId}:
 *   get:
 *     tags: [Employee Document Management]
 *     summary: Get documents by employee ID
 *     description: Retrieve all documents for a specific employee
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *     responses:
 *       200:
 *         description: Employee documents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployeeDocumentListResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Employee not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /employee-documents/{id}:
 *   get:
 *     tags: [Employee Document Management]
 *     summary: Get employee document by ID
 *     description: Retrieve a specific employee document by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Employee document retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployeeDocumentResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Employee document not found"
 *       500:
 *         description: Server error
 *
 *   put:
 *     tags: [Employee Document Management]
 *     summary: Update employee document with optional file upload
 *     description: Update an existing employee document with new information and optional file replacement
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               documentType:
 *                 type: string
 *                 enum: ["Employment Contract", "ID Document", "Passport", "Work Permit", "Background Check", "Drug Test", "Training Certificate", "Insurance Policy", "Company Policy", "Performance Review", "Payroll Document", "Tax Document", "Emergency Contact", "Medical Certificate", "Other"]
 *                 description: Type of document
 *               documentNumber:
 *                 type: string
 *                 description: Document number or reference
 *               issueDate:
 *                 type: string
 *                 format: date
 *                 description: Date when document was issued
 *               expiryDate:
 *                 type: string
 *                 format: date
 *                 description: Date when document expires
 *               description:
 *                 type: string
 *                 description: Additional description or notes
 *               status:
 *                 type: string
 *                 enum: ["valid", "expiring-soon", "expired", "pending", "rejected"]
 *                 description: Document status
 *               documentFile:
 *                 type: string
 *                 format: binary
 *                 description: New document file (optional - only if replacing existing file)
 *           examples:
 *             updateContract:
 *               summary: Update Employment Contract
 *               value:
 *                 documentNumber: "EMP-CONTRACT-2024-002"
 *                 expiryDate: "2026-01-15"
 *                 description: "Updated employment contract with new terms"
 *                 status: "valid"
 *             updateWithNewFile:
 *               summary: Update with New File
 *               value:
 *                 documentNumber: "EMP-CONTRACT-2024-002"
 *                 description: "Updated employment contract with new file"
 *                 documentFile: "[File upload]"
 *     responses:
 *       200:
 *         description: Employee document updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployeeDocumentResponse'
 *       400:
 *         description: Validation error or duplicate document
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Server error
 *
 *   delete:
 *     tags: [Employee Document Management]
 *     summary: Delete employee document
 *     description: Delete a specific employee document by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Employee document deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Employee document deleted successfully"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /employee-documents/{id}/status:
 *   patch:
 *     tags: [Employee Document Management]
 *     summary: Update document status
 *     description: Update the status of a specific employee document
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateDocumentStatusRequest'
 *           examples:
 *             approveDocument:
 *               summary: Approve Document
 *               value:
 *                 status: "valid"
 *             rejectDocument:
 *               summary: Reject Document
 *               value:
 *                 status: "rejected"
 *                 rejectionReason: "Document is unclear and needs to be re-uploaded"
 *             markExpired:
 *               summary: Mark as Expired
 *               value:
 *                 status: "expired"
 *     responses:
 *       200:
 *         description: Document status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployeeDocumentResponse'
 *       400:
 *         description: Validation error or missing rejection reason
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Rejection reason is required when status is rejected"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /employee-documents/bulk/delete:
 *   delete:
 *     tags: [Employee Document Management]
 *     summary: Bulk delete employee documents
 *     description: Delete multiple employee documents at once
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkDeleteEmployeeDocumentsRequest'
 *           examples:
 *             bulkDelete:
 *               summary: Bulk Delete Documents
 *               value:
 *                 documentIds: ["64f1a2b3c4d5e6f7g8h9i0j1", "64f1a2b3c4d5e6f7g8h9i0j2", "64f1a2b3c4d5e6f7g8h9i0j3"]
 *     responses:
 *       200:
 *         description: Documents deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "3 employee documents deleted successfully"
 *                 deletedCount:
 *                   type: integer
 *                   example: 3
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Server error
 */
