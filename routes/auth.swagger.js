/**
 * @swagger
 * tags:
 *   - name: Authentication
 *     description: User authentication endpoints
 */

/**
 * @swagger
 * /login:
 *   post:
 *     tags: [Authentication]
 *     summary: User login
 *     description: Authenticate user and return JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           example:
 *             email: "admin@blackriver.com"
 *             password: "password123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *             example:
 *               success: true
 *               message: "login success"
 *               token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               data:
 *                 _id: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                 name: "Admin User"
 *                 email: "admin@blackriver.com"
 *                 role: "admin"
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "Incorrect password"
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "User not found"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "Server error"
 */
