/**
 * @swagger
 * tags:
 *   - name: Vehicle Services
 *     description: Vehicle service management system
 */

/**
 * @swagger
 * /admin/vehicle-service:
 *   post:
 *     tags: [Vehicle Services]
 *     summary: Create a new vehicle service
 *     description: Create a new vehicle service record
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateVehicleServiceRequest'
 *           example:
 *             vehicleId: "64f1a2b3c4d5e6f7g8h9i0j2"
 *             serviceType: "oil-change"
 *             priority: "medium"
 *             dueDate: "2024-02-15"
 *             dueMileage: 50000
 *             assignedMechanic: "John Smith"
 *             description: "Regular oil change service"
 *     responses:
 *       201:
 *         description: Vehicle service created successfully
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
 *                   example: "Vehicle service created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/VehicleService'
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
 * /admin/vehicle-service:
 *   get:
 *     tags: [Vehicle Services]
 *     summary: Get all vehicle services with filters
 *     description: Retrieve vehicle services with optional filtering
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in-progress, completed]
 *         description: Filter by service status
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         description: Filter by priority level
 *       - in: query
 *         name: serviceType
 *         schema:
 *           type: string
 *           enum: [oil-change, tire-rotation, bike-inspection, general-maintenance, other]
 *         description: Filter by service type
 *       - in: query
 *         name: vehicleId
 *         schema:
 *           type: string
 *         description: Filter by vehicle ID
 *       - in: query
 *         name: mechanic
 *         schema:
 *           type: string
 *         description: Filter by assigned mechanic
 *     responses:
 *       200:
 *         description: Vehicle services retrieved successfully
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
 *                   example: "Vehicle services fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VehicleService'
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
 * /admin/vehicle-service/{id}:
 *   get:
 *     tags: [Vehicle Services]
 *     summary: Get vehicle service by ID
 *     description: Retrieve a specific vehicle service by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vehicle service ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Vehicle service retrieved successfully
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
 *                   example: "Vehicle service fetched successfully"
 *                 data:
 *                   $ref: '#/components/schemas/VehicleService'
 *       404:
 *         description: Vehicle service not found
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
 * /admin/vehicle-service/{id}:
 *   put:
 *     tags: [Vehicle Services]
 *     summary: Update vehicle service
 *     description: Update an existing vehicle service
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vehicle service ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateVehicleServiceRequest'
 *           example:
 *             vehicleId: "64f1a2b3c4d5e6f7g8h9i0j2"
 *             serviceType: "oil-change"
 *             priority: "high"
 *             dueDate: "2024-02-20"
 *             dueMileage: 52000
 *             assignedMechanic: "Mike Johnson"
 *             description: "Updated service description"
 *     responses:
 *       200:
 *         description: Vehicle service updated successfully
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
 *                   example: "Vehicle service updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/VehicleService'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Vehicle service not found
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
 * /admin/vehicle-service/{id}/status:
 *   patch:
 *     tags: [Vehicle Services]
 *     summary: Update vehicle service status
 *     description: Update the status of a vehicle service
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vehicle service ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateServiceStatusRequest'
 *           example:
 *             status: "in-progress"
 *     responses:
 *       200:
 *         description: Vehicle service status updated successfully
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
 *                   example: "Vehicle service status updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/VehicleService'
 *       400:
 *         description: Invalid status value
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Vehicle service not found
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
 * /admin/vehicle-service/{id}:
 *   delete:
 *     tags: [Vehicle Services]
 *     summary: Delete vehicle service
 *     description: Delete a vehicle service permanently
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vehicle service ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Vehicle service deleted successfully
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
 *                   example: "Vehicle service deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     vehicleId:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *                     serviceType:
 *                       type: string
 *                       example: "oil-change"
 *       404:
 *         description: Vehicle service not found
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
