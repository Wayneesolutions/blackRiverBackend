/**
 * @swagger
 * tags:
 *   - name: HR Management
 *     description: Human Resources management APIs
 */

/**
 * @swagger
 * /hr/dashboard:
 *   get:
 *     tags: [HR Management]
 *     summary: Get HR dashboard data
 *     description: Retrieve dashboard statistics and overview data for HR management
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
 *                     totalEmployees:
 *                       type: integer
 *                       example: 150
 *                     activeEmployees:
 *                       type: integer
 *                       example: 142
 *                     newHires:
 *                       type: integer
 *                       example: 8
 *                     pendingApprovals:
 *                       type: integer
 *                       example: 12
 *                     departmentStats:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           department:
 *                             type: string
 *                             example: "Operations"
 *                           count:
 *                             type: integer
 *                             example: 45
 *                           activeCount:
 *                             type: integer
 *                             example: 42
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
 * /hr/employees:
 *   get:
 *     tags: [HR Management]
 *     summary: Get all employees
 *     description: Retrieve a list of all employees with HR management filters
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
 *         description: Number of employees per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for employee name, email, or ID
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, superadmin, driver, dispatcher, hr, contact, customer, reporter]
 *         description: Filter by employee role
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter by employee status
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
 *         description: Employees retrieved successfully
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
 *                   example: "Employees fetched successfully"
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
 * /hr/employees/{id}:
 *   get:
 *     tags: [HR Management]
 *     summary: Get employee details
 *     description: Retrieve detailed information about a specific employee
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Employee details retrieved successfully
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
 *                   example: "Employee details fetched successfully"
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: Employee not found
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
 * /hr/employees/{id}/performance:
 *   get:
 *     tags: [HR Management]
 *     summary: Get employee performance metrics
 *     description: Retrieve performance metrics and statistics for a specific employee
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *           default: month
 *         description: Performance period
 *     responses:
 *       200:
 *         description: Performance metrics retrieved successfully
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
 *                   example: "Performance metrics fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     employeeId:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     employeeName:
 *                       type: string
 *                       example: "John Smith"
 *                     period:
 *                       type: string
 *                       example: "month"
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         totalTasks:
 *                           type: integer
 *                           example: 45
 *                         completedTasks:
 *                           type: integer
 *                           example: 42
 *                         completionRate:
 *                           type: number
 *                           example: 93.3
 *                         averageRating:
 *                           type: number
 *                           example: 4.5
 *                         totalHours:
 *                           type: number
 *                           example: 160.5
 *                         overtimeHours:
 *                           type: number
 *                           example: 8.5
 *                         punctuality:
 *                           type: number
 *                           example: 96.8
 *                     achievements:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           title:
 *                             type: string
 *                             example: "Employee of the Month"
 *                           date:
 *                             type: string
 *                             format: date
 *                             example: "2024-01-01"
 *                           description:
 *                             type: string
 *                             example: "Outstanding performance in January"
 *       404:
 *         description: Employee not found
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
 * /hr/employees/{id}/attendance:
 *   get:
 *     tags: [HR Management]
 *     summary: Get employee attendance record
 *     description: Retrieve attendance records for a specific employee
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *           default: 1
 *         description: Month (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           minimum: 2020
 *           default: 2024
 *         description: Year
 *     responses:
 *       200:
 *         description: Attendance record retrieved successfully
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
 *                   example: "Attendance record fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     employeeId:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     employeeName:
 *                       type: string
 *                       example: "John Smith"
 *                     month:
 *                       type: integer
 *                       example: 1
 *                     year:
 *                       type: integer
 *                       example: 2024
 *                     attendance:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                             example: "2024-01-01"
 *                           checkIn:
 *                             type: string
 *                             format: time
 *                             example: "09:00:00"
 *                           checkOut:
 *                             type: string
 *                             format: time
 *                             example: "17:30:00"
 *                           totalHours:
 *                             type: number
 *                             example: 8.5
 *                           status:
 *                             type: string
 *                             enum: [present, absent, late, half-day]
 *                             example: "present"
 *                           notes:
 *                             type: string
 *                             example: "Regular working day"
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalDays:
 *                           type: integer
 *                           example: 22
 *                         presentDays:
 *                           type: integer
 *                           example: 20
 *                         absentDays:
 *                           type: integer
 *                           example: 2
 *                         lateDays:
 *                           type: integer
 *                           example: 1
 *                         totalHours:
 *                           type: number
 *                           example: 170.5
 *                         averageHours:
 *                           type: number
 *                           example: 8.5
 *       404:
 *         description: Employee not found
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
 * /hr/employees/{id}/attendance:
 *   post:
 *     tags: [HR Management]
 *     summary: Record employee attendance
 *     description: Record check-in or check-out for an employee
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [check-in, check-out]
 *                 example: "check-in"
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-01-15T09:00:00.000Z"
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
 *                     example: "123 Main St, Los Angeles, CA"
 *               notes:
 *                 type: string
 *                 example: "Regular check-in"
 *     responses:
 *       200:
 *         description: Attendance recorded successfully
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
 *                   example: "Attendance recorded successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     employeeId:
 *                       type: string
 *                       example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                     action:
 *                       type: string
 *                       example: "check-in"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     totalHours:
 *                       type: number
 *                       example: 8.5
 *       400:
 *         description: Validation error or invalid action
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Employee not found
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
 * /hr/reports/attendance:
 *   get:
 *     tags: [HR Management]
 *     summary: Get attendance report
 *     description: Generate attendance report for all employees or specific department
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *           default: 1
 *         description: Month (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           minimum: 2020
 *           default: 2024
 *         description: Year
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, pdf]
 *           default: json
 *         description: Report format
 *     responses:
 *       200:
 *         description: Attendance report generated successfully
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
 *                   example: "Attendance report generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: string
 *                       example: "January 2024"
 *                     totalEmployees:
 *                       type: integer
 *                       example: 150
 *                     summary:
 *                       type: object
 *                       properties:
 *                         averageAttendance:
 *                           type: number
 *                           example: 94.5
 *                         totalWorkingDays:
 *                           type: integer
 *                           example: 22
 *                         totalHours:
 *                           type: number
 *                           example: 2640.5
 *                     departmentBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           department:
 *                             type: string
 *                             example: "Operations"
 *                           employeeCount:
 *                             type: integer
 *                             example: 45
 *                           averageAttendance:
 *                             type: number
 *                             example: 96.2
 *                           totalHours:
 *                             type: number
 *                             example: 792.5
 *                     employees:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           employeeId:
 *                             type: string
 *                             example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                           name:
 *                             type: string
 *                             example: "John Smith"
 *                           department:
 *                             type: string
 *                             example: "Operations"
 *                           presentDays:
 *                             type: integer
 *                             example: 20
 *                           absentDays:
 *                             type: integer
 *                             example: 2
 *                           totalHours:
 *                             type: number
 *                             example: 170.5
 *                           attendancePercentage:
 *                             type: number
 *                             example: 90.9
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
 * /hr/reports/performance:
 *   get:
 *     tags: [HR Management]
 *     summary: Get performance report
 *     description: Generate performance report for all employees
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [month, quarter, year]
 *           default: month
 *         description: Performance period
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, pdf]
 *           default: json
 *         description: Report format
 *     responses:
 *       200:
 *         description: Performance report generated successfully
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
 *                   example: "Performance report generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: string
 *                       example: "January 2024"
 *                     totalEmployees:
 *                       type: integer
 *                       example: 150
 *                     summary:
 *                       type: object
 *                       properties:
 *                         averageRating:
 *                           type: number
 *                           example: 4.2
 *                         averageCompletionRate:
 *                           type: number
 *                           example: 92.5
 *                         topPerformers:
 *                           type: integer
 *                           example: 15
 *                     topPerformers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           employeeId:
 *                             type: string
 *                             example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                           name:
 *                             type: string
 *                             example: "John Smith"
 *                           department:
 *                             type: string
 *                             example: "Operations"
 *                           rating:
 *                             type: number
 *                             example: 4.8
 *                           completionRate:
 *                             type: number
 *                             example: 98.5
 *                           achievements:
 *                             type: integer
 *                             example: 3
 *                     departmentPerformance:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           department:
 *                             type: string
 *                             example: "Operations"
 *                           averageRating:
 *                             type: number
 *                             example: 4.3
 *                           averageCompletionRate:
 *                             type: number
 *                             example: 94.2
 *                           employeeCount:
 *                             type: integer
 *                             example: 45
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
