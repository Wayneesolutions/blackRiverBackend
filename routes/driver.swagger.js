/**
 * @swagger
 * tags:
 *   - name: Driver Management
 *     description: Driver-specific APIs and operations
 */

/**
 * @swagger
 * /driver/profile:
 *   get:
 *     tags: [Driver Management]
 *     summary: Get driver profile
 *     description: Retrieve the current driver's profile information
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver profile retrieved successfully
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
 *                   example: "Driver profile fetched successfully"
 *                 data:
 *                   $ref: '#/components/schemas/User'
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
 * /driver/profile:
 *   put:
 *     tags: [Driver Management]
 *     summary: Update driver profile
 *     description: Update the current driver's profile information
 *     security:
 *       - bearerAuth: []
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
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               country:
 *                 type: string
 *                 example: "USA"
 *               state:
 *                 type: string
 *                 example: "California"
 *               city:
 *                 type: string
 *                 example: "Los Angeles"
 *               address:
 *                 type: string
 *                 example: "123 Main St, Los Angeles, CA"
 *               licenceNumber:
 *                 type: string
 *                 example: "DL123456789"
 *               vendor:
 *                 type: string
 *                 example: "ABC Transport"
 *     responses:
 *       200:
 *         description: Driver profile updated successfully
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
 *                   example: "Driver profile updated successfully"
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
 * /driver/vehicle:
 *   get:
 *     tags: [Driver Management]
 *     summary: Get assigned vehicle
 *     description: Retrieve the vehicle assigned to the current driver
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Assigned vehicle retrieved successfully
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
 *                   example: "Assigned vehicle fetched successfully"
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
 *                     odometer:
 *                       type: integer
 *                       example: 45000
 *                     status:
 *                       type: string
 *                       example: "active"
 *                     vinNumber:
 *                       type: string
 *                       example: "1FTNE2EW5ADA12345"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: No vehicle assigned
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
 * /driver/odometer:
 *   put:
 *     tags: [Driver Management]
 *     summary: Update vehicle odometer
 *     description: Update the current odometer reading for the assigned vehicle
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [odometer]
 *             properties:
 *               odometer:
 *                 type: integer
 *                 minimum: 0
 *                 example: 46000
 *               notes:
 *                 type: string
 *                 example: "Updated after long trip"
 *     responses:
 *       200:
 *         description: Odometer updated successfully
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
 *                   example: "Odometer updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     plateNumber:
 *                       type: string
 *                       example: "ABC123"
 *                     odometer:
 *                       type: integer
 *                       example: 46000
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error or invalid odometer reading
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
 *       404:
 *         description: No vehicle assigned
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
 * /driver/activities:
 *   get:
 *     tags: [Driver Management]
 *     summary: Get driver activities
 *     description: Retrieve the current driver's activity log
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
 *         description: Number of activities per page
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter activities by date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Driver activities retrieved successfully
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
 *                   example: "Driver activities fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                       driverId:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *                       vehicleId:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j3"
 *                       activityType:
 *                         type: string
 *                         example: "trip_started"
 *                       description:
 *                         type: string
 *                         example: "Started trip from Los Angeles to San Francisco"
 *                       location:
 *                         type: object
 *                         properties:
 *                           latitude:
 *                             type: number
 *                             example: 34.0522
 *                           longitude:
 *                             type: number
 *                             example: -118.2437
 *                           address:
 *                             type: string
 *                             example: "Los Angeles, CA"
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-15T08:30:00.000Z"
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
 * /driver/activities:
 *   post:
 *     tags: [Driver Management]
 *     summary: Log driver activity
 *     description: Log a new activity for the current driver
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [activityType, description]
 *             properties:
 *               activityType:
 *                 type: string
 *                 enum: [trip_started, trip_ended, fuel_stop, maintenance, break_start, break_end, delivery_completed, pickup_completed]
 *                 example: "trip_started"
 *               description:
 *                 type: string
 *                 example: "Started trip from Los Angeles to San Francisco"
 *               location:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                     example: 34.0522
 *                   longitude:
 *                     type: number
 *                     example: -118.2437
 *                   address:
 *                     type: string
 *                     example: "Los Angeles, CA"
 *               notes:
 *                 type: string
 *                 example: "Heavy traffic on I-5"
 *     responses:
 *       201:
 *         description: Activity logged successfully
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
 *                   example: "Activity logged successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     driverId:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *                     activityType:
 *                       type: string
 *                       example: "trip_started"
 *                     description:
 *                       type: string
 *                       example: "Started trip from Los Angeles to San Francisco"
 *                     timestamp:
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
 * /driver/location:
 *   post:
 *     tags: [Driver Management]
 *     summary: Update driver location
 *     description: Update the current driver's location for real-time tracking
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *                 example: 34.0522
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *                 example: -118.2437
 *               address:
 *                 type: string
 *                 example: "123 Main St, Los Angeles, CA"
 *               speed:
 *                 type: number
 *                 minimum: 0
 *                 example: 65.5
 *               heading:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 360
 *                 example: 270
 *     responses:
 *       200:
 *         description: Location updated successfully
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
 *                   example: "Location updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     driverId:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *                     latitude:
 *                       type: number
 *                       example: 34.0522
 *                     longitude:
 *                       type: number
 *                       example: -118.2437
 *                     timestamp:
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
