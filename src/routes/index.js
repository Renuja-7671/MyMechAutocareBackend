const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./authRoutes');
const chatbotRoutes = require('./chatbotRoutes');
const vehicleRoutes = require('./vehicleRoutes');
const appointmentRoutes = require('./appointmentRoutes');
const projectRoutes = require('./projectRoutes');

// Health check endpoint (can be accessed at /api/health)
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    message: 'API Server is running',
    timestamp: new Date().toISOString()
  });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/chatbot', chatbotRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/projects', projectRoutes);

// API documentation endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to MyMech AutoCare API',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        profile: 'GET /api/auth/profile (protected)',
        me: 'GET /api/auth/me (protected)',
      },
      chatbot: {
        message: 'POST /api/chatbot/message',
      },
      vehicles: {
        list: 'GET /api/vehicles (protected)',
        get: 'GET /api/vehicles/:vehicleId (protected)',
        create: 'POST /api/vehicles (protected)',
        update: 'PUT /api/vehicles/:vehicleId (protected)',
        delete: 'DELETE /api/vehicles/:vehicleId (protected)',
        serviceHistory: 'GET /api/vehicles/:vehicleId/service-history (protected)',
      },
      appointments: {
        list: 'GET /api/appointments (protected)',
        serviceProgress: 'GET /api/appointments/service-progress (protected)',
        create: 'POST /api/appointments (protected)',
        update: 'PUT /api/appointments/:appointmentId (protected)',
        cancel: 'DELETE /api/appointments/:appointmentId/cancel (protected)',
      },
      projects: {
        list: 'GET /api/projects (protected)',
        get: 'GET /api/projects/:projectId (protected)',
        create: 'POST /api/projects (protected)',
        update: 'PUT /api/projects/:projectId (protected)',
        delete: 'DELETE /api/projects/:projectId (protected)',
      },
      health: 'GET /api/health',
    }
  });
});

// 404 handler for undefined API routes
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl
  });
});

module.exports = router;
