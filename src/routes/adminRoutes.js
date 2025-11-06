const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

/**
 * All admin routes require authentication and admin role
 */

// GET /api/admin/dashboard-stats - Get dashboard statistics
router.get(
  '/dashboard-stats',
  authenticateToken,
  authorizeRole('admin'),
  adminController.getDashboardStats
);

// GET /api/admin/users - Get all users
router.get(
  '/users',
  authenticateToken,
  authorizeRole('admin'),
  adminController.getAllUsers
);

// PATCH /api/admin/users/:userId/role - Update user role
router.patch(
  '/users/:userId/role',
  authenticateToken,
  authorizeRole('admin'),
  adminController.updateUserRole
);

// DELETE /api/admin/users/:userId - Delete user
router.delete(
  '/users/:userId',
  authenticateToken,
  authorizeRole('admin'),
  adminController.deleteUser
);

// GET /api/admin/services - Get all services
router.get(
  '/services',
  authenticateToken,
  authorizeRole('admin'),
  adminController.getAllServices
);

// POST /api/admin/services/:serviceId/assign - Assign service to employee
router.post(
  '/services/:serviceId/assign',
  authenticateToken,
  authorizeRole('admin'),
  adminController.assignServiceToEmployee
);

// GET /api/admin/reports - Generate reports
router.get(
  '/reports',
  authenticateToken,
  authorizeRole('admin'),
  adminController.getReports
);

// POST /api/admin/employees - Create new employee
router.post(
  '/employees',
  authenticateToken,
  authorizeRole('admin'),
  adminController.createEmployee
);

// GET /api/admin/appointments - Get all appointments (admin view)
router.get(
  '/appointments',
  authenticateToken,
  authorizeRole('admin'),
  adminController.getAllAppointments
);

// GET /api/admin/modifications - Get all modification requests
router.get(
  '/modifications',
  authenticateToken,
  authorizeRole('admin'),
  adminController.getAllModificationRequests
);

// PATCH /api/admin/modifications/:projectId - Update modification status and approved cost
router.patch(
  '/modifications/:projectId',
  authenticateToken,
  authorizeRole('admin'),
  adminController.updateModificationStatus
);

module.exports = router;
