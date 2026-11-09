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
import { getSuperAdminRevenue, getSuperAdminInvoices } from '../controllers/superAdminRevenueController.js'
import { getSuperAdminSettings, updateSuperAdminSettings } from '../controllers/superAdminSettingsController.js'
import { createManualInvoice, updateInvoiceStatus, emailInvoice } from '../controllers/superadminInvoice.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { authorizeRoles } from '../middleware/authRoles.js'
import { ContactInquiry } from '../models/contactInquiryModel.js'
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
superAdminRoute.post(
  '/invoices',
  authMiddleware,
  authorizeRoles('superadmin'),
  createManualInvoice
)
superAdminRoute.patch(
  '/invoices/:id',
  authMiddleware,
  authorizeRoles('superadmin'),
  updateInvoiceStatus
)
superAdminRoute.post(
  '/invoices/:id/email',
  authMiddleware,
  authorizeRoles('superadmin'),
  emailInvoice
)

// Website contact-form leads (logistiqinnovations.ca/contact)
superAdminRoute.get(
  '/contact-inquiries',
  authMiddleware,
  authorizeRoles('superadmin'),
  async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500)
      const inquiries = await ContactInquiry.find({}).sort({ createdAt: -1 }).limit(limit).lean()
      res.json({ success: true, data: inquiries })
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load inquiries' })
    }
  }
)

superAdminRoute.patch(
  '/contact-inquiries/:id/status',
  authMiddleware,
  authorizeRoles('superadmin'),
  async (req, res) => {
    try {
      const { status } = req.body || {}
      if (!['new', 'contacted', 'closed'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' })
      }
      const updated = await ContactInquiry.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean()
      if (!updated) return res.status(404).json({ success: false, message: 'Inquiry not found' })
      res.json({ success: true, data: updated })
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to update inquiry' })
    }
  }
)
