const express = require('express');
const router = express.Router();
const multer = require('multer');
const vehicleController = require('../controllers/vehicleController');
const { authenticateToken } = require('../middleware/auth');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * All vehicle routes require authentication
 */

// GET /api/vehicles - Get all vehicles for authenticated customer
router.get('/', authenticateToken, vehicleController.getCustomerVehicles);

// GET /api/vehicles/:vehicleId - Get specific vehicle by ID
router.get('/:vehicleId', authenticateToken, vehicleController.getVehicleById);

// POST /api/vehicles - Create a new vehicle (with image uploads)
router.post(
  '/',
  authenticateToken,
  upload.fields([
    { name: 'exteriorImage1', maxCount: 1 },
    { name: 'exteriorImage2', maxCount: 1 },
    { name: 'interiorImage', maxCount: 1 },
  ]),
  vehicleController.createVehicle
);

// PUT /api/vehicles/:vehicleId - Update a vehicle
router.put('/:vehicleId', authenticateToken, vehicleController.updateVehicle);

// DELETE /api/vehicles/:vehicleId - Delete a vehicle
router.delete('/:vehicleId', authenticateToken, vehicleController.deleteVehicle);

// GET /api/vehicles/:vehicleId/service-history - Get service history for a vehicle
router.get('/:vehicleId/service-history', authenticateToken, vehicleController.getVehicleServiceHistory);

// GET /api/vehicles/:vehicleId/images - Get vehicle images
router.get('/:vehicleId/images', authenticateToken, vehicleController.getVehicleImages);

module.exports = router;
