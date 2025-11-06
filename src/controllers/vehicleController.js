const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { uploadVehicleImage, deleteMultipleVehicleImages } = require('../services/supabaseService');

/**
 * Get all vehicles for the authenticated customer
 */
async function getCustomerVehicles(req, res) {
  try {
    const userId = req.user.userId;

    // Get customer ID from user ID
    const customer = await prisma.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer profile not found',
      });
    }

    // Fetch all vehicles for this customer
    const vehicles = await prisma.vehicle.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: vehicles,
    });
  } catch (error) {
    console.error('Error fetching customer vehicles:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch vehicles',
    });
  }
}

/**
 * Get a specific vehicle by ID
 */
async function getVehicleById(req, res) {
  try {
    const userId = req.user.userId;
    const { vehicleId } = req.params;

    // Get customer ID
    const customer = await prisma.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer profile not found',
      });
    }

    // Fetch vehicle and ensure it belongs to this customer
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: parseInt(vehicleId),
        customerId: customer.id,
      },
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: vehicle,
    });
  } catch (error) {
    console.error('Error fetching vehicle:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch vehicle',
    });
  }
}

/**
 * Create a new vehicle
 */
async function createVehicle(req, res) {
  try {
    const userId = req.user.userId;
    const { make, model, year, licensePlate, vin, color, mileage } = req.body;

    // Validate required fields
    if (!make || !model || !year) {
      return res.status(400).json({
        success: false,
        error: 'Make, model, and year are required',
      });
    }

    // Get customer ID
    const customer = await prisma.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer profile not found',
      });
    }

    // Handle image uploads
    let exteriorImage1Url = null;
    let exteriorImage2Url = null;
    let interiorImageUrl = null;

    try {
      // Upload exterior images if provided
      if (req.files && req.files.exteriorImage1) {
        const file = req.files.exteriorImage1[0];
        exteriorImage1Url = await uploadVehicleImage(
          file.buffer,
          file.originalname,
          file.mimetype
        );
      }

      if (req.files && req.files.exteriorImage2) {
        const file = req.files.exteriorImage2[0];
        exteriorImage2Url = await uploadVehicleImage(
          file.buffer,
          file.originalname,
          file.mimetype
        );
      }

      // Upload interior image if provided
      if (req.files && req.files.interiorImage) {
        const file = req.files.interiorImage[0];
        interiorImageUrl = await uploadVehicleImage(
          file.buffer,
          file.originalname,
          file.mimetype
        );
      }
    } catch (uploadError) {
      console.error('Error uploading images:', uploadError);
      return res.status(500).json({
        success: false,
        error: 'Failed to upload images',
      });
    }

    // Create vehicle
    const vehicle = await prisma.vehicle.create({
      data: {
        customerId: customer.id,
        make,
        model,
        year: parseInt(year),
        licensePlate,
        vin,
        color,
        mileage: mileage ? parseInt(mileage) : null,
        exteriorImage1: exteriorImage1Url,
        exteriorImage2: exteriorImage2Url,
        interiorImage: interiorImageUrl,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Vehicle created successfully',
      data: vehicle,
    });
  } catch (error) {
    console.error('Error creating vehicle:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create vehicle',
    });
  }
}

/**
 * Update a vehicle
 */
async function updateVehicle(req, res) {
  try {
    const userId = req.user.userId;
    const { vehicleId } = req.params;
    const { make, model, year, licensePlate, vin, color, mileage } = req.body;

    // Get customer ID
    const customer = await prisma.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer profile not found',
      });
    }

    // Check if vehicle exists and belongs to this customer
    const existingVehicle = await prisma.vehicle.findFirst({
      where: {
        id: parseInt(vehicleId),
        customerId: customer.id,
      },
    });

    if (!existingVehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found',
      });
    }

    // Update vehicle
    const updatedVehicle = await prisma.vehicle.update({
      where: { id: parseInt(vehicleId) },
      data: {
        make: make || existingVehicle.make,
        model: model || existingVehicle.model,
        year: year ? parseInt(year) : existingVehicle.year,
        licensePlate: licensePlate !== undefined ? licensePlate : existingVehicle.licensePlate,
        vin: vin !== undefined ? vin : existingVehicle.vin,
        color: color !== undefined ? color : existingVehicle.color,
        mileage: mileage !== undefined ? (mileage ? parseInt(mileage) : null) : existingVehicle.mileage,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Vehicle updated successfully',
      data: updatedVehicle,
    });
  } catch (error) {
    console.error('Error updating vehicle:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update vehicle',
    });
  }
}

/**
 * Delete a vehicle
 */
async function deleteVehicle(req, res) {
  try {
    const userId = req.user.userId;
    const { vehicleId } = req.params;

    // Get customer ID
    const customer = await prisma.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer profile not found',
      });
    }

    // Check if vehicle exists and belongs to this customer
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: parseInt(vehicleId),
        customerId: customer.id,
      },
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found',
      });
    }

    // Delete associated images from Supabase
    const imageUrls = [
      vehicle.exteriorImage1,
      vehicle.exteriorImage2,
      vehicle.interiorImage,
    ].filter(Boolean);

    if (imageUrls.length > 0) {
      await deleteMultipleVehicleImages(imageUrls);
    }

    // Delete vehicle
    await prisma.vehicle.delete({
      where: { id: parseInt(vehicleId) },
    });

    return res.status(200).json({
      success: true,
      message: 'Vehicle deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete vehicle',
    });
  }
}

/**
 * Get service history for a specific vehicle
 */
async function getVehicleServiceHistory(req, res) {
  try {
    const userId = req.user.userId;
    const { vehicleId } = req.params;

    // Get customer ID
    const customer = await prisma.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer profile not found',
      });
    }

    // Check if vehicle belongs to this customer
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: parseInt(vehicleId),
        customerId: customer.id,
      },
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found',
      });
    }

    // Get service history (appointments for this vehicle)
    const serviceHistory = await prisma.appointment.findMany({
      where: { vehicleId: parseInt(vehicleId) },
      include: {
        service: true,
        serviceLogs: {
          include: {
            employee: {
              include: {
                user: {
                  select: {
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { scheduledDate: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: serviceHistory,
    });
  } catch (error) {
    console.error('Error fetching vehicle service history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch service history',
    });
  }
}

/**
 * Get vehicle images
 */
async function getVehicleImages(req, res) {
  try {
    const userId = req.user.userId;
    const { vehicleId } = req.params;

    // Get customer ID
    const customer = await prisma.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer profile not found',
      });
    }

    // Fetch vehicle and ensure it belongs to this customer
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: parseInt(vehicleId),
        customerId: customer.id,
      },
      select: {
        exteriorImage1: true,
        exteriorImage2: true,
        interiorImage: true,
      },
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        exteriorImages: [vehicle.exteriorImage1, vehicle.exteriorImage2].filter(Boolean),
        interiorImage: vehicle.interiorImage,
      },
    });
  } catch (error) {
    console.error('Error fetching vehicle images:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch vehicle images',
    });
  }
}

module.exports = {
  getCustomerVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleServiceHistory,
  getVehicleImages,
};
