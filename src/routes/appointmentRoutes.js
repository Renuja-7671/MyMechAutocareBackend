const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { authenticateToken } = require('../middleware/auth');

/**
 * All appointment routes require authentication
 */

// GET /api/appointments - Get all appointments for authenticated customer
router.get('/', authenticateToken, appointmentController.getCustomerAppointments);

// GET /api/appointments/service-progress - Get service progress
router.get('/service-progress', authenticateToken, appointmentController.getServiceProgress);

// POST /api/appointments - Create a new appointment
router.post('/', authenticateToken, appointmentController.createAppointment);

// PUT /api/appointments/:appointmentId - Update an appointment
router.put('/:appointmentId', authenticateToken, appointmentController.updateAppointment);

// DELETE /api/appointments/:appointmentId/cancel - Cancel an appointment
router.delete('/:appointmentId/cancel', authenticateToken, appointmentController.cancelAppointment);

module.exports = router;
