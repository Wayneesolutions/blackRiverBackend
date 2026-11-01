import express from 'express'
import {
  loginSuperAdmin,
  registerSuperAdmin
} from '../controllers/superAdminAuthController.js'
import {
  createAdmin,
  deleteAdmin,
  getAllAdmins,
  updateAdmin,
  assignPlanToAdmin
} from '../controllers/adminManageController.js'
import {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan
} from '../controllers/planController.js'
import { getSuperAdminDashboard } from '../controllers/superAdminDashboardController.js'
import { getSuperAdminRevenue,getSuperAdminInvoices } from '../controllers/superAdminRevenueController.js'
import { getSuperAdminSettings, updateSuperAdminSettings } from '../controllers/superAdminSettingsController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { authorizeRoles } from '../middleware/authRoles.js'
export const superAdminRoute = express.Router()

superAdminRoute.post('/login', loginSuperAdmin)
// Creating a Super Admin is only allowed for an existing, logged-in Super Admin.
// The one exception is first-time setup, when no Super Admin exists yet.
const requireSuperAdminForCreate = async (req, res, next) => {
  try {
    const { User } = await import('../models/driver/userModel.js')
    const existing = await User.countDocuments({ role: 'superadmin' })
    if (existing === 0) return next()
    return authMiddleware(req, res, () => authorizeRoles('superadmin')(req, res, next))
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to verify permissions' })
  }
}

superAdminRoute.post('/create', requireSuperAdminForCreate, registerSuperAdmin)

// Dashboard
superAdminRoute.get(
  '/dashboard',
  authMiddleware,
  authorizeRoles('superadmin'),
  getSuperAdminDashboard
)

// Revenue
superAdminRoute.get(
  '/revenue',
  authMiddleware,
  authorizeRoles('superadmin'),
  getSuperAdminRevenue
)

//admin management
superAdminRoute.post(
  '/admin',
  authMiddleware,
  authorizeRoles('superadmin', 'hr'),
  createAdmin
)
superAdminRoute.get(
  '/admin',
  authMiddleware,
  authorizeRoles('superadmin', 'hr'),
  getAllAdmins
)
superAdminRoute.put(
  '/admin/:id',
  authMiddleware,
  authorizeRoles('superadmin', 'hr'),
  updateAdmin
)

superAdminRoute.delete(
  '/admin/:id',
  authMiddleware,
  authorizeRoles('superadmin', 'hr'),
  deleteAdmin
)

superAdminRoute.post(
  '/admin/:id/assign-plan',
  authMiddleware,
  authorizeRoles('superadmin'),
  assignPlanToAdmin
)

// Plan management
superAdminRoute.post(
  '/plan',
  authMiddleware,
  authorizeRoles('superadmin'),
  createPlan
)
superAdminRoute.get(
  '/plan',
  authMiddleware,
  authorizeRoles('superadmin'),
  getAllPlans
)
superAdminRoute.get(
  '/plan/:id',
  authMiddleware,
  authorizeRoles('superadmin'),
  getPlanById
)
superAdminRoute.put(
  '/plan/:id',
  authMiddleware,
  authorizeRoles('superadmin'),
  updatePlan
)
superAdminRoute.delete(
  '/plan/:id',
  authMiddleware,
  authorizeRoles('superadmin'),
  deletePlan
)

// System Settings (Super Admin Profile)
superAdminRoute.get(
  '/system-settings',
  authMiddleware,
  authorizeRoles('superadmin'),
  getSuperAdminSettings
)

superAdminRoute.put(
  '/system-settings',
  authMiddleware,
  authorizeRoles('superadmin'),
  updateSuperAdminSettings
)
superAdminRoute.get(  
  '/invoices',
  authMiddleware,
  authorizeRoles('superadmin'),
  getSuperAdminInvoices
)