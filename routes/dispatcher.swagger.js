/**
 * @swagger
 * tags:
 *   - name: Dispatcher Management
 *     description: Dispatcher panel management APIs
 */

/**
 * @swagger
 * /dispatcher/trip/{id}/documents:
 *   post:
 *     tags: [Dispatcher Management]
 *     summary: Upload a document for a trip (max 3 documents per trip)
 *     description: Upload a document (POD, stamped manifest, BOL, etc.) for a trip. Total uploaded documents per trip is limited to 3.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Trip ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *                 description: The file to upload
 *               documentType:
 *                 type: string
 *                 enum: [bol, pod, stamped_manifest, manifest, other]
 *                 description: Type of document being uploaded
 *               description:
 *                 type: string
 *                 description: Optional description for the uploaded document
 *             required:
 *               - document
 *     responses:
 *       200:
 *         description: Document uploaded successfully
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
 *                   example: "Document uploaded successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     fileUrl:
 *                       type: string
 *                     fileName:
 *                       type: string
 *                     type:
 *                       type: string
 *                       example: pod
 *       400:
 *         description: Bad request / validation error (e.g., max documents reached)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /dispatcher/dashboard:
 *   get:
 *     tags: [Dispatcher Management]
 *     summary: Get dispatcher dashboard data
 *     description: Retrieve dashboard statistics and overview data for dispatchers
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
 *                     totalDrivers:
 *                       type: integer
 *                       example: 85
 *                     activeDrivers:
 *                       type: integer
 *                       example: 72
 *                     totalVehicles:
 *                       type: integer
 *                       example: 150
 *                     activeVehicles:
 *                       type: integer
 *                       example: 142
 *                     pendingAssignments:
 *                       type: integer
 *                       example: 8
 *                     completedAssignments:
 *                       type: integer
 *                       example: 245
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
 * /dispatcher/drivers:
 *   get:
 *     tags: [Dispatcher Management]
 *     summary: Get all drivers
 *     description: Retrieve a list of all drivers with their current status and location
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
 *         description: Number of drivers per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for driver name or email
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, on-duty, off-duty]
 *         description: Filter by driver status
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Filter by driver location/city
 *     responses:
 *       200:
 *         description: Drivers retrieved successfully
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
 *                   example: "Drivers fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                       name:
 *                         type: string
 *                         example: "John Smith"
 *                       email:
 *                         type: string
 *                         example: "john.smith@example.com"
 *                       phone:
 *                         type: string
 *                         example: "+1234567890"
 *                       status:
 *                         type: string
 *                         example: "on-duty"
 *                       currentLocation:
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
 *                           lastUpdated:
 *                             type: string
 *                             format: date-time
 *                       assignedVehicle:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *                           plateNumber:
 *                             type: string
 *                             example: "ABC123"
 *                           make:
 *                             type: string
 *                             example: "Ford"
 *                           model:
 *                             type: string
 *                             example: "Transit"
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
 * /dispatcher/assignments:
 *   get:
 *     tags: [Dispatcher Management]
 *     summary: Get all assignments
 *     description: Retrieve a list of all assignments with their current status
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
 *         description: Number of assignments per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, assigned, in-progress, completed, cancelled]
 *         description: Filter by assignment status
 *       - in: query
 *         name: driverId
 *         schema:
 *           type: string
 *         description: Filter by assigned driver ID
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by assignment date
 *     responses:
 *       200:
 *         description: Assignments retrieved successfully
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
 *                   example: "Assignments fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                       assignmentNumber:
 *                         type: string
 *                         example: "ASS-2024-001"
 *                       type:
 *                         type: string
 *                         example: "delivery"
 *                       priority:
 *                         type: string
 *                         example: "high"
 *                       status:
 *                         type: string
 *                         example: "in-progress"
 *                       pickupLocation:
 *                         type: object
 *                         properties:
 *                           address:
 *                             type: string
 *                             example: "123 Pickup St, Los Angeles, CA"
 *                           latitude:
 *                             type: number
 *                             example: 34.0522
 *                           longitude:
 *                             type: number
 *                             example: -118.2437
 *                       deliveryLocation:
 *                         type: object
 *                         properties:
 *                           address:
 *                             type: string
 *                             example: "456 Delivery Ave, San Francisco, CA"
 *                           latitude:
 *                             type: number
 *                             example: 37.7749
 *                           longitude:
 *                             type: number
 *                             example: -122.4194
 *                       assignedDriver:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "64f1a2b3c4d5e6f7g8h9i0j3"
 *                           name:
 *                             type: string
 *                             example: "John Smith"
 *                           phone:
 *                             type: string
 *                             example: "+1234567890"
 *                       scheduledDate:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-15T09:00:00.000Z"
 *                       estimatedDuration:
 *                         type: integer
 *                         example: 120
 *                       createdAt:
 *                         type: string
 *                         format: date-time
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
 * /dispatcher/assignments:
 *   post:
 *     tags: [Dispatcher Management]
 *     summary: Create new assignment
 *     description: Create a new assignment for a driver
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, priority, pickupLocation, deliveryLocation, assignedDriver, scheduledDate]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [delivery, pickup, maintenance, inspection]
 *                 example: "delivery"
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 example: "high"
 *               pickupLocation:
 *                 type: object
 *                 required: [address, latitude, longitude]
 *                 properties:
 *                   address:
 *                     type: string
 *                     example: "123 Pickup St, Los Angeles, CA"
 *                   latitude:
 *                     type: number
 *                     example: 34.0522
 *                   longitude:
 *                     type: number
 *                     example: -118.2437
 *               deliveryLocation:
 *                 type: object
 *                 required: [address, latitude, longitude]
 *                 properties:
 *                   address:
 *                     type: string
 *                     example: "456 Delivery Ave, San Francisco, CA"
 *                   latitude:
 *                     type: number
 *                     example: 37.7749
 *                   longitude:
 *                     type: number
 *                     example: -122.4194
 *               assignedDriver:
 *                 type: string
 *                 example: "64f1a2b3c4d5e6f7g8h9i0j3"
 *               scheduledDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-01-15T09:00:00.000Z"
 *               estimatedDuration:
 *                 type: integer
 *                 example: 120
 *               description:
 *                 type: string
 *                 example: "Urgent delivery of medical supplies"
 *               notes:
 *                 type: string
 *                 example: "Handle with care - fragile items"
 *     responses:
 *       201:
 *         description: Assignment created successfully
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
 *                   example: "Assignment created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     assignmentNumber:
 *                       type: string
 *                       example: "ASS-2024-001"
 *                     type:
 *                       type: string
 *                       example: "delivery"
 *                     priority:
 *                       type: string
 *                       example: "high"
 *                     status:
 *                       type: string
 *                       example: "pending"
 *                     assignedDriver:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j3"
 *                     scheduledDate:
 *                       type: string
 *                       format: date-time
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
 * /dispatcher/assignments/{id}:
 *   put:
 *     tags: [Dispatcher Management]
 *     summary: Update assignment
 *     description: Update an existing assignment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Assignment ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 example: "urgent"
 *               status:
 *                 type: string
 *                 enum: [pending, assigned, in-progress, completed, cancelled]
 *                 example: "in-progress"
 *               assignedDriver:
 *                 type: string
 *                 example: "64f1a2b3c4d5e6f7g8h9i0j4"
 *               scheduledDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-01-15T10:00:00.000Z"
 *               estimatedDuration:
 *                 type: integer
 *                 example: 150
 *               notes:
 *                 type: string
 *                 example: "Updated priority due to customer request"
 *     responses:
 *       200:
 *         description: Assignment updated successfully
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
 *                   example: "Assignment updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     assignmentNumber:
 *                       type: string
 *                       example: "ASS-2024-001"
 *                     priority:
 *                       type: string
 *                       example: "urgent"
 *                     status:
 *                       type: string
 *                       example: "in-progress"
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
 *         description: Assignment not found
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
 * /dispatcher/assignments/{id}:
 *   delete:
 *     tags: [Dispatcher Management]
 *     summary: Delete assignment
 *     description: Delete an assignment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Assignment ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Assignment deleted successfully
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
 *                   example: "Assignment deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     assignmentNumber:
 *                       type: string
 *                       example: "ASS-2024-001"
 *       404:
 *         description: Assignment not found
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
 * /dispatcher/tracking:
 *   get:
 *     tags: [Dispatcher Management]
 *     summary: Get real-time tracking data
 *     description: Retrieve real-time location data for all active drivers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: driverId
 *         schema:
 *           type: string
 *         description: Filter by specific driver ID
 *     responses:
 *       200:
 *         description: Tracking data retrieved successfully
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
 *                   example: "Tracking data fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       driverId:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                       driverName:
 *                         type: string
 *                         example: "John Smith"
 *                       vehicleId:
 *                         type: string
 *                         example: "64f1a2b3c4d5e6f7g8h9i0j2"
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
 *                           address:
 *                             type: string
 *                             example: "Los Angeles, CA"
 *                           speed:
 *                             type: number
 *                             example: 65.5
 *                           heading:
 *                             type: number
 *                             example: 270
 *                           lastUpdated:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00.000Z"
 *                       status:
 *                         type: string
 *                         example: "on-duty"
 *                       currentAssignment:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "64f1a2b3c4d5e6f7g8h9i0j3"
 *                           assignmentNumber:
 *                             type: string
 *                             example: "ASS-2024-001"
 *                           type:
 *                             type: string
 *                             example: "delivery"
 *                           status:
 *                             type: string
 *                             example: "in-progress"
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
 * /dispatcher/trailer:
 *   post:
 *     tags: [Dispatcher Management]
 *     summary: Create new trailer
 *     description: Create a new trailer in the fleet management system
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [trailer, plateNumber, type, capacity, currentLocation]
 *             properties:
 *               trailer:
 *                 type: string
 *                 example: "Trailer-001"
 *                 description: "Trailer name or identifier"
 *               plateNumber:
 *                 type: string
 *                 example: "TRL-12345"
 *                 description: "Trailer license plate number"
 *               type:
 *                 type: string
 *                 enum: [dry_van, refrigerated, flatbed, tanker, container]
 *                 example: "dry_van"
 *                 description: "Type of trailer"
 *               capacity:
 *                 type: string
 *                 example: "26,000 lbs"
 *                 description: "Trailer capacity"
 *               currentLocation:
 *                 type: object
 *                 required: [latitude, longitude]
 *                 properties:
 *                   latitude:
 *                     type: string
 *                     example: "34.0522"
 *                   longitude:
 *                     type: string
 *                     example: "-118.2437"
 *                   address:
 *                     type: string
 *                     example: "Los Angeles, CA"
 *               ownerShip:
 *                 type: string
 *                 example: "Company Owned"
 *               internalId:
 *                 type: string
 *                 example: "GEOTAB-TRL-001"
 *                 description: "Geotab device ID for tracking"
 *               cargoDetails:
 *                 type: object
 *                 properties:
 *                   cargoType:
 *                     type: string
 *                     example: "General Cargo"
 *                   weight:
 *                     type: number
 *                     example: 0
 *                   capacity:
 *                     type: number
 *                     example: 26000
 *                   description:
 *                     type: string
 *                     example: "Standard dry van trailer"
 *                   isRefrigerated:
 *                     type: boolean
 *                     example: false
 *               sensors:
 *                 type: object
 *                 properties:
 *                   doorStatus:
 *                     type: string
 *                     enum: [locked, unlocked, open]
 *                     example: "locked"
 *                   temperature:
 *                     type: number
 *                     example: 20
 *                   humidity:
 *                     type: number
 *                     example: 45
 *                   shockDetection:
 *                     type: boolean
 *                     example: false
 *                   tilting:
 *                     type: boolean
 *                     example: false
 *               maintenance:
 *                 type: object
 *                 properties:
 *                   lastService:
 *                     type: string
 *                     format: date
 *                     example: "2024-01-01"
 *                   nextService:
 *                     type: string
 *                     format: date
 *                     example: "2024-04-01"
 *                   tyreCondition:
 *                     type: string
 *                     enum: [good, fair, poor]
 *                     example: "good"
 *                   brakeCondition:
 *                     type: string
 *                     enum: [good, fair, poor]
 *                     example: "good"
 *                   issues:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: []
 *               note:
 *                 type: string
 *                 example: "New trailer added to fleet"
 *     responses:
 *       201:
 *         description: Trailer created successfully
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
 *                   example: "Trailer created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Trailer'
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
 * /dispatcher/trailer:
 *   get:
 *     tags: [Dispatcher Management]
 *     summary: Get all trailers
 *     description: Retrieve a list of all trailers with filtering and pagination
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
 *         description: Number of trailers per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for trailer name, plate number, or type
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [dry_van, refrigerated, flatbed, tanker, container]
 *         description: Filter by trailer type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [moving, idle, stopped, maintenance]
 *         description: Filter by trailer status
 *       - in: query
 *         name: operationStatus
 *         schema:
 *           type: string
 *           enum: [in_transit, loading, idle, maintenance, available]
 *         description: Filter by operation status
 *       - in: query
 *         name: isAttached
 *         schema:
 *           type: boolean
 *         description: Filter by attachment status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, plateNumber, type, status]
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Trailers retrieved successfully
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
 *                   example: "Trailers retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Trailer'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     current:
 *                       type: integer
 *                       example: 1
 *                     pages:
 *                       type: integer
 *                       example: 5
 *                     total:
 *                       type: integer
 *                       example: 47
 *                     limit:
 *                       type: integer
 *                       example: 10
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
 * /dispatcher/trailer/search:
 *   get:
 *     tags: [Dispatcher Management]
 *     summary: Search trailers
 *     description: Search trailers by name, plate number, or type
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *         example: "TRL-123"
 *     responses:
 *       200:
 *         description: Search completed successfully
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
 *                   example: "Search completed"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Trailer'
 *       400:
 *         description: Search query required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * /dispatcher/trailer/stats:
 *   get:
 *     tags: [Dispatcher Management]
 *     summary: Get trailer statistics
 *     description: Retrieve trailer statistics and analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
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
 *                   example: "Trailer statistics retrieved"
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 150
 *                     inTransit:
 *                       type: integer
 *                       example: 45
 *                     loading:
 *                       type: integer
 *                       example: 12
 *                     idle:
 *                       type: integer
 *                       example: 35
 *                     maintenance:
 *                       type: integer
 *                       example: 8
 *                     available:
 *                       type: integer
 *                       example: 50
 *                     attached:
 *                       type: integer
 *                       example: 85
 *                     unattached:
 *                       type: integer
 *                       example: 65
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
 * /dispatcher/trailer/{id}:
 *   get:
 *     tags: [Dispatcher Management]
 *     summary: Get trailer by ID
 *     description: Retrieve a specific trailer by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Trailer ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Trailer retrieved successfully
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
 *                   example: "Trailer retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Trailer'
 *       404:
 *         description: Trailer not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * /dispatcher/trailer/{id}:
 *   put:
 *     tags: [Dispatcher Management]
 *     summary: Update trailer
 *     description: Update an existing trailer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Trailer ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               trailer:
 *                 type: string
 *                 example: "Trailer-001-Updated"
 *               plateNumber:
 *                 type: string
 *                 example: "TRL-12345-NEW"
 *               type:
 *                 type: string
 *                 enum: [dry_van, refrigerated, flatbed, tanker, container]
 *                 example: "refrigerated"
 *               capacity:
 *                 type: string
 *                 example: "28,000 lbs"
 *               currentLocation:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: string
 *                     example: "34.0522"
 *                   longitude:
 *                     type: string
 *                     example: "-118.2437"
 *                   address:
 *                     type: string
 *                     example: "Updated Location, CA"
 *               ownerShip:
 *                 type: string
 *                 example: "Leased"
 *               operationStatus:
 *                 type: string
 *                 enum: [in_transit, loading, idle, maintenance, available]
 *                 example: "available"
 *               status:
 *                 type: string
 *                 enum: [moving, idle, stopped, maintenance]
 *                 example: "idle"
 *               isAttached:
 *                 type: boolean
 *                 example: false
 *               attachedVehicle:
 *                 type: string
 *                 example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *               note:
 *                 type: string
 *                 example: "Updated trailer information"
 *     responses:
 *       200:
 *         description: Trailer updated successfully
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
 *                   example: "Trailer updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Trailer'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Trailer not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * /dispatcher/trailer/{id}/status:
 *   patch:
 *     tags: [Dispatcher Management]
 *     summary: Update trailer status
 *     description: Update trailer operation status and tracking status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Trailer ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               operationStatus:
 *                 type: string
 *                 enum: [in_transit, loading, idle, maintenance, available]
 *                 example: "in_transit"
 *               status:
 *                 type: string
 *                 enum: [moving, idle, stopped, maintenance]
 *                 example: "moving"
 *     responses:
 *       200:
 *         description: Trailer status updated successfully
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
 *                   example: "Trailer status updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Trailer'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Trailer not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * /dispatcher/trailer/{id}:
 *   delete:
 *     tags: [Dispatcher Management]
 *     summary: Delete trailer
 *     description: Delete a trailer from the system
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Trailer ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Trailer deleted successfully
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
 *                   example: "Trailer deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     trailer:
 *                       type: string
 *                       example: "Trailer-001"
 *                     plateNumber:
 *                       type: string
 *                       example: "TRL-12345"
 *       404:
 *         description: Trailer not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
