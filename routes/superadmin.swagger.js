/**
 * @swagger
 * tags:
 *   - name: Super Admin Management
 *     description: Super Admin panel management APIs
 */

/**
 * @swagger
 * /superadmin/create:
 *   post:
 *     tags: [Super Admin Management]
 *     summary: Create a new super admin
 *     description: Register a new super admin account. This endpoint is typically used for initial setup or creating additional super admin accounts.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - internalId
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Super Admin"
 *                 description: Full name of the super admin
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "superadmin@blackriver.com"
 *                 description: Email address (must be unique)
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: "SuperAdmin@123"
 *                 description: Password (minimum 6 characters)
 *               internalId:
 *                 type: string
 *                 example: "BK99"
 *                 description: Unique internal identifier for the super admin (required, must be unique)
 *               address:
 *                 type: string
 *                 example: "123 Main St, Los Angeles, CA 90001"
 *                 description: Full address (will be geocoded for coordinates)
 *               country:
 *                 type: string
 *                 example: "USA"
 *                 description: Country
 *               city:
 *                 type: string
 *                 example: "Los Angeles"
 *                 description: City
 *               state:
 *                 type: string
 *                 example: "California"
 *                 description: State/Province
 *               policies:
 *                 type: string
 *                 example: "Company policies and terms agreement"
 *                 description: Policies and terms agreement
 *     responses:
 *       201:
 *         description: Super admin created successfully
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
 *                   example: "Super Admin created successfully"
 *       400:
 *         description: Validation error or super admin already exists
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
 *                     - "Name, email, password, and internalId are required"
 *                     - "Super Admin with this email already exists"
 *                     - "Super Admin with this internalId already exists"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /superadmin/login:
 *   post:
 *     tags: [Super Admin Management]
 *     summary: Login super admin
 *     description: Authenticate super admin and receive JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "superadmin@blackriver.com"
 *               password:
 *                 type: string
 *                 example: "SuperAdmin@123"
 *     responses:
 *       200:
 *         description: Login successful
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
 *                   example: "Login successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     name:
 *                       type: string
 *                       example: "Super Admin"
 *                     email:
 *                       type: string
 *                       example: "superadmin@blackriver.com"
 *                     role:
 *                       type: string
 *                       example: "superadmin"
 *                     token:
 *                       type: string
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Invalid credentials
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
 *                   example: "Invalid email or password"
 *       403:
 *         description: Access denied or account inactive
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
 *                   example: "Access denied. Super Admin access required."
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /superadmin/dashboard:
 *   get:
 *     tags: [Super Admin Management]
 *     summary: Get super admin dashboard data
 *     description: Retrieve comprehensive dashboard statistics and overview data
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
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
 *                   example: "Dashboard data fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     systemStats:
 *                       type: object
 *                       properties:
 *                         totalUsers:
 *                           type: integer
 *                           example: 250
 *                         totalVehicles:
 *                           type: integer
 *                           example: 150
 *                         totalServices:
 *                           type: integer
 *                           example: 1250
 *                         totalRevenue:
 *                           type: number
 *                           example: 125000.50
 *                     userStats:
 *                       type: object
 *                       properties:
 *                         activeUsers:
 *                           type: integer
 *                           example: 235
 *                         newUsers:
 *                           type: integer
 *                           example: 15
 *                         userGrowth:
 *                           type: number
 *                           example: 6.4
 *                     vehicleStats:
 *                       type: object
 *                       properties:
 *                         activeVehicles:
 *                           type: integer
 *                           example: 142
 *                         vehiclesInMaintenance:
 *                           type: integer
 *                           example: 8
 *                         maintenanceCost:
 *                           type: number
 *                           example: 15000.25
 *                     serviceStats:
 *                       type: object
 *                       properties:
 *                         completedServices:
 *                           type: integer
 *                           example: 1180
 *                         pendingServices:
 *                           type: integer
 *                           example: 70
 *                         averageServiceTime:
 *                           type: number
 *                           example: 2.5
 *                     recentActivity:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             example: "user_registration"
 *                           description:
 *                             type: string
 *                             example: "New user registered: John Doe"
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00.000Z"
 *                           userId:
 *                             type: string
 *                             example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /superadmin/users:
 *   get:
 *     tags: [Super Admin Management]
 *     summary: Get all users
 *     description: Retrieve a comprehensive list of all users with advanced filtering
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of users per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for user name, email, or ID
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, superadmin, driver, dispatcher, hr, contact, customer, reporter]
 *         description: Filter by user role
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter by user status
 *       - in: query
 *         name: company
 *         schema:
 *           type: string
 *         description: Filter by company ID
 *       - in: query
 *         name: joinDateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by join date from (YYYY-MM-DD)
 *       - in: query
 *         name: joinDateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by join date to (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Users retrieved successfully
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
 *                   example: "Users fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /superadmin/users/{id}:
 *   put:
 *     tags: [Super Admin Management]
 *     summary: Update user (super admin)
 *     description: Update any user's information with super admin privileges
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John Smith"
 *               email:
 *                 type: string
 *                 example: "john.smith@example.com"
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               role:
 *                 type: string
 *                 enum: [admin, superadmin, driver, dispatcher, hr, contact, customer, reporter]
 *                 example: "driver"
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 example: "active"
 *               country:
 *                 type: string
 *                 example: "USA"
 *               state:
 *                 type: string
 *                 example: "California"
 *               city:
 *                 type: string
 *                 example: "Los Angeles"
 *               company:
 *                 type: string
 *                 example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *               internalId:
 *                 type: string
 *                 example: "EMP-001"
 *               location:
 *                 type: object
 *                 properties:
 *                   address:
 *                     type: string
 *                     example: "123 Main St, Los Angeles, CA"
 *                   longitude:
 *                     type: string
 *                     example: "-118.2437"
 *                   latitude:
 *                     type: string
 *                     example: "34.0522"
 *               details:
 *                 type: object
 *                 properties:
 *                   licenceNumber:
 *                     type: string
 *                     example: "DL123456789"
 *                   vendor:
 *                     type: string
 *                     example: "ABC Transport"
 *                   vehicle:
 *                     type: string
 *                     example: "64f1a2b3c4d5e6f7g8h9i0j3"
 *     responses:
 *       200:
 *         description: User updated successfully
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
 *                   example: "User updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /superadmin/users/{id}:
 *   delete:
 *     tags: [Super Admin Management]
 *     summary: Delete user (super admin)
 *     description: Delete a user with super admin privileges
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: User deleted successfully
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
 *                   example: "User deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     email:
 *                       type: string
 *                       example: "john.smith@example.com"
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /superadmin/companies:
 *   get:
 *     tags: [Super Admin Management]
 *     summary: Get all companies
 *     description: Retrieve a list of all companies in the system
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of companies per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for company name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter by company status
 *     responses:
 *       200:
 *         description: Companies retrieved successfully
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
 *                   example: "Companies fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                       companyName:
 *                         type: string
 *                         example: "BlackRiver Transport"
 *                       email:
 *                         type: string
 *                         example: "info@blackriver.com"
 *                       phone:
 *                         type: string
 *                         example: "+1234567890"
 *                       address:
 *                         type: string
 *                         example: "123 Business St, City, State"
 *                       status:
 *                         type: string
 *                         example: "active"
 *                       userCount:
 *                         type: integer
 *                         example: 45
 *                       vehicleCount:
 *                         type: integer
 *                         example: 25
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-01T00:00:00.000Z"
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /superadmin/companies:
 *   post:
 *     tags: [Super Admin Management]
 *     summary: Create new company
 *     description: Create a new company in the system
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyName, email]
 *             properties:
 *               companyName:
 *                 type: string
 *                 example: "New Transport Company"
 *               email:
 *                 type: string
 *                 example: "info@newtransport.com"
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               address:
 *                 type: string
 *                 example: "456 New St, City, State"
 *               contactPerson:
 *                 type: string
 *                 example: "Jane Doe"
 *               contactEmail:
 *                 type: string
 *                 example: "jane@newtransport.com"
 *               contactPhone:
 *                 type: string
 *                 example: "+1234567891"
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 example: "active"
 *     responses:
 *       201:
 *         description: Company created successfully
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
 *                   example: "Company created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     companyName:
 *                       type: string
 *                       example: "New Transport Company"
 *                     email:
 *                       type: string
 *                       example: "info@newtransport.com"
 *                     status:
 *                       type: string
 *                       example: "active"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /superadmin/companies/{id}:
 *   put:
 *     tags: [Super Admin Management]
 *     summary: Update company
 *     description: Update company information
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *                 example: "Updated Transport Company"
 *               email:
 *                 type: string
 *                 example: "updated@transport.com"
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               address:
 *                 type: string
 *                 example: "789 Updated St, City, State"
 *               contactPerson:
 *                 type: string
 *                 example: "John Updated"
 *               contactEmail:
 *                 type: string
 *                 example: "john@transport.com"
 *               contactPhone:
 *                 type: string
 *                 example: "+1234567892"
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 example: "active"
 *     responses:
 *       200:
 *         description: Company updated successfully
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
 *                   example: "Company updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     companyName:
 *                       type: string
 *                       example: "Updated Transport Company"
 *                     email:
 *                       type: string
 *                       example: "updated@transport.com"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Company not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /superadmin/companies/{id}:
 *   delete:
 *     tags: [Super Admin Management]
 *     summary: Delete company
 *     description: Delete a company from the system
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Company deleted successfully
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
 *                   example: "Company deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     companyName:
 *                       type: string
 *                       example: "Deleted Company"
 *       404:
 *         description: Company not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /superadmin/system-logs:
 *   get:
 *     tags: [Super Admin Management]
 *     summary: Get system logs
 *     description: Retrieve system logs and audit trails
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of logs per page
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [info, warn, error, debug]
 *         description: Filter by log level
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date from (YYYY-MM-DD)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date to (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: System logs retrieved successfully
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
 *                   example: "System logs fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                       level:
 *                         type: string
 *                         example: "info"
 *                       message:
 *                         type: string
 *                         example: "User login successful"
 *                       action:
 *                         type: string
 *                         example: "login"
 *                       userId:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *                       userEmail:
 *                         type: string
 *                         example: "john@example.com"
 *                       ipAddress:
 *                         type: string
 *                         example: "192.168.1.1"
 *                       userAgent:
 *                         type: string
 *                         example: "Mozilla/5.0..."
 *                       metadata:
 *                         type: object
 *                         properties:
 *                           endpoint:
 *                             type: string
 *                             example: "/api/v1/login"
 *                           method:
 *                             type: string
 *                             example: "POST"
 *                           statusCode:
 *                             type: integer
 *                             example: 200
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-15T10:30:00.000Z"
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /superadmin/system-settings:
 *   get:
 *     tags: [Super Admin Management]
 *     summary: Get system settings
 *     description: Retrieve system configuration settings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System settings retrieved successfully
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
 *                   example: "System settings fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     systemName:
 *                       type: string
 *                       example: "BlackRiver Fleet Management"
 *                     version:
 *                       type: string
 *                       example: "1.0.0"
 *                     maintenanceMode:
 *                       type: boolean
 *                       example: false
 *                     maxUsers:
 *                       type: integer
 *                       example: 1000
 *                     maxVehicles:
 *                       type: integer
 *                       example: 500
 *                     features:
 *                       type: object
 *                       properties:
 *                         trackingEnabled:
 *                           type: boolean
 *                           example: true
 *                         notificationsEnabled:
 *                           type: boolean
 *                           example: true
 *                         reportingEnabled:
 *                           type: boolean
 *                           example: true
 *                         maintenanceEnabled:
 *                           type: boolean
 *                           example: true
 *                     emailSettings:
 *                       type: object
 *                       properties:
 *                         smtpHost:
 *                           type: string
 *                           example: "smtp.gmail.com"
 *                         smtpPort:
 *                           type: integer
 *                           example: 587
 *                         fromEmail:
 *                           type: string
 *                           example: "noreply@blackriver.com"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /superadmin/system-settings:
 *   put:
 *     tags: [Super Admin Management]
 *     summary: Update system settings
 *     description: Update system configuration settings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               systemName:
 *                 type: string
 *                 example: "Updated Fleet Management"
 *               maintenanceMode:
 *                 type: boolean
 *                 example: false
 *               maxUsers:
 *                 type: integer
 *                 example: 1500
 *               maxVehicles:
 *                 type: integer
 *                 example: 750
 *               features:
 *                 type: object
 *                 properties:
 *                   trackingEnabled:
 *                     type: boolean
 *                     example: true
 *                   notificationsEnabled:
 *                     type: boolean
 *                     example: true
 *                   reportingEnabled:
 *                     type: boolean
 *                     example: true
 *                   maintenanceEnabled:
 *                     type: boolean
 *                     example: true
 *               emailSettings:
 *                 type: object
 *                 properties:
 *                   smtpHost:
 *                     type: string
 *                     example: "smtp.gmail.com"
 *                   smtpPort:
 *                     type: integer
 *                     example: 587
 *                   fromEmail:
 *                     type: string
 *                     example: "noreply@blackriver.com"
 *     responses:
 *       200:
 *         description: System settings updated successfully
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
 *                   example: "System settings updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     systemName:
 *                       type: string
 *                       example: "Updated Fleet Management"
 *                     maintenanceMode:
 *                       type: boolean
 *                       example: false
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
