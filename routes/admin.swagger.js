/**
 * @swagger
 * tags:
 *   - name: Admin Management
 *     description: Admin panel management APIs
 */

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     tags: [Admin Management]
 *     summary: Get admin dashboard statistics
 *     description: Retrieve dashboard statistics and overview data
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
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
 *                   example: "Dashboard statistics fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalVehicles:
 *                       type: integer
 *                       example: 150
 *                     activeDrivers:
 *                       type: integer
 *                       example: 85
 *                     pendingServices:
 *                       type: integer
 *                       example: 12
 *                     completedServices:
 *                       type: integer
 *                       example: 238
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
 * /admin/vehicles/list:
 *   get:
 *     tags: [Admin Management]
 *     summary: Get all vehicles list
 *     description: Retrieve a list of all vehicles from GPS tracking system
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Vehicles list retrieved successfully
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
 *                   example: "Vehicles list fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                       plateNumber:
 *                         type: string
 *                         example: "ABC123"
 *                       make:
 *                         type: string
 *                         example: "Ford"
 *                       model:
 *                         type: string
 *                         example: "Transit"
 *                       year:
 *                         type: integer
 *                         example: 2020
 *                       status:
 *                         type: string
 *                         example: "active"
 *                       odometer:
 *                         type: integer
 *                         example: 45000
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
 * /admin/vehicles:
 *   get:
 *     tags: [Admin Management]
 *     summary: Get all vehicles (DEPRECATED - Use /vehicles/list instead)
 *     description: This route does not exist. Use /admin/vehicles/list instead.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       404:
 *         description: Route not found
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
 *                   example: "Route not found"
 */

/**
 * @swagger
 * /admin/vehicles/live:
 *   get:
 *     tags: [Admin Management]
 *     summary: Get live vehicles
 *     description: Retrieve live vehicle tracking data
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Live vehicles retrieved successfully
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
 *                   example: "Live vehicles fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                       plateNumber:
 *                         type: string
 *                         example: "ABC123"
 *                       currentLocation:
 *                         type: object
 *                         properties:
 *                           latitude:
 *                             type: number
 *                             example: 34.0522
 *                           longitude:
 *                             type: number
 *                             example: -118.2437
 *                           speed:
 *                             type: number
 *                             example: 65.5
 *                           heading:
 *                             type: number
 *                             example: 270
 *                           lastUpdated:
 *                             type: string
 *                             format: date-time
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
 * /admin/vehicle-details/{id}:
 *   get:
 *     tags: [Admin Management]
 *     summary: Get vehicle details
 *     description: Retrieve detailed information about a specific vehicle
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vehicle ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Vehicle details retrieved successfully
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
 *                   example: "Vehicle details fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     plateNumber:
 *                       type: string
 *                       example: "ABC123"
 *                     make:
 *                       type: string
 *                       example: "Ford"
 *                     model:
 *                       type: string
 *                       example: "Transit"
 *                     year:
 *                       type: integer
 *                       example: 2020
 *                     status:
 *                       type: string
 *                       example: "active"
 *                     odometer:
 *                       type: integer
 *                       example: 45000
 *                     currentLocation:
 *                       type: object
 *                       properties:
 *                         latitude:
 *                           type: number
 *                           example: 34.0522
 *                         longitude:
 *                           type: number
 *                           example: -118.2437
 *                         lastUpdated:
 *                           type: string
 *                           format: date-time
 *       404:
 *         description: Vehicle not found
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
 * /admin/maintanance-details:
 *   get:
 *     tags: [Admin Management]
 *     summary: Get maintenance schedule
 *     description: Retrieve the maintenance schedule for all vehicles
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Maintenance schedule retrieved successfully
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
 *                   example: "Maintenance schedule fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                       plateNumber:
 *                         type: string
 *                         example: "ABC123"
 *                       make:
 *                         type: string
 *                         example: "Ford"
 *                       model:
 *                         type: string
 *                         example: "Transit"
 *                       upcomingServices:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             serviceType:
 *                               type: string
 *                               example: "oil-change"
 *                             serviceOdometer:
 *                               type: integer
 *                               example: 50000
 *                             scheduledDate:
 *                               type: string
 *                               format: date
 *                               example: "2024-02-15"
 *                             priority:
 *                               type: string
 *                               example: "medium"
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
 * /admin/maintenance-cost:
 *   get:
 *     tags: [Admin Management]
 *     summary: Get maintenance cost report
 *     description: Retrieve maintenance cost report for a specific year
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           default: 2024
 *         description: Year for the cost report
 *         example: 2024
 *       - in: query
 *         name: vehicleId
 *         schema:
 *           type: string
 *         description: Filter by specific vehicle ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Maintenance cost report retrieved successfully
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
 *                   example: "Maintenance cost report fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       vehicleId:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                       plateNumber:
 *                         type: string
 *                         example: "ABC123"
 *                       make:
 *                         type: string
 *                         example: "Ford"
 *                       model:
 *                         type: string
 *                         example: "Transit"
 *                       year:
 *                         type: integer
 *                         example: 2024
 *                       month:
 *                         type: integer
 *                         example: 1
 *                       totalCost:
 *                         type: number
 *                         example: 1250.50
 *                       avgCost:
 *                         type: number
 *                         example: 625.25
 *                       workOrders:
 *                         type: integer
 *                         example: 2
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
 * /admin/user:
 *   get:
 *     tags: [Admin Management]
 *     summary: Get all users
 *     description: Retrieve a list of all users with filtering options
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
 *         description: Search term for user name or email
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, superadmin, driver, dispatcher, hr, contact, customer, reporter]
 *         description: Filter by user role
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
 * /admin/user:
 *   post:
 *     tags: [Admin Management]
 *     summary: Create new user
 *     description: Create a new user in the system
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateEmployeeRequest'
 *     responses:
 *       201:
 *         description: User created successfully
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
 *                   example: "User created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/User'
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
 * /admin/user/{id}:
 *   put:
 *     tags: [Admin Management]
 *     summary: Update user
 *     description: Update an existing user's information
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
 *             $ref: '#/components/schemas/UpdateEmployeeRequest'
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
 * /admin/user/{id}:
 *   delete:
 *     tags: [Admin Management]
 *     summary: Delete user
 *     description: Delete a user from the system
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
 *                       example: "user@example.com"
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
 * /admin/user/{id}/status:
 *   patch:
 *     tags: [Admin Management]
 *     summary: Update user status
 *     description: Update the status of a user (active/inactive)
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
 *             $ref: '#/components/schemas/UpdateStatusRequest'
 *     responses:
 *       200:
 *         description: User status updated successfully
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
 *                   example: "User status updated successfully"
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