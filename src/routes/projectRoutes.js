const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authenticateToken } = require('../middleware/auth');

/**
 * All project/modification routes require authentication
 */

// GET /api/projects - Get all modification requests for authenticated customer
router.get('/', authenticateToken, projectController.getCustomerProjects);

// GET /api/projects/:projectId - Get specific project by ID
router.get('/:projectId', authenticateToken, projectController.getProjectById);

// POST /api/projects - Create a new modification request
router.post('/', authenticateToken, projectController.createProject);

// PUT /api/projects/:projectId - Update a modification request
router.put('/:projectId', authenticateToken, projectController.updateProject);

// DELETE /api/projects/:projectId - Delete a modification request
router.delete('/:projectId', authenticateToken, projectController.deleteProject);

module.exports = router;
