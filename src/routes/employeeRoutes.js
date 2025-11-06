const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

/**
 * All employee routes require authentication and employee role
 */

// GET /api/employees/assigned-services - Get assigned services
router.get(
  '/assigned-services',
  authenticateToken,
  authorizeRole('employee'),
  employeeController.getAssignedServices
);

// GET /api/employees/upcoming-appointments - Get upcoming appointments
router.get(
  '/upcoming-appointments',
  authenticateToken,
  authorizeRole('employee'),
  employeeController.getUpcomingAppointments
);

// POST /api/employees/time-logs - Log time for a service
router.post(
  '/time-logs',
  authenticateToken,
  authorizeRole('employee'),
  employeeController.logTime
);

// GET /api/employees/time-logs - Get time logs
router.get(
  '/time-logs',
  authenticateToken,
  authorizeRole('employee'),
  employeeController.getTimeLogs
);

// PATCH /api/employees/services/:serviceId/status - Update service status
router.patch(
  '/services/:serviceId/status',
  authenticateToken,
  authorizeRole('employee'),
  employeeController.updateServiceStatus
);

module.exports = router;
