const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get all modification requests for authenticated customer
 */
async function getCustomerProjects(req, res) {
  try {
    const userId = req.user.userId;

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

    // Fetch projects
    const projects = await prisma.project.findMany({
      where: { customerId: customer.id },
      include: {
        vehicle: true,
        projectLogs: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format response
    const formattedProjects = projects.map((project) => ({
      id: project.id.toString(),
      vehicleId: project.vehicleId,
      vehicleName: `${project.vehicle.year} ${project.vehicle.make} ${project.vehicle.model}`,
      title: project.title,
      description: project.description,
      projectType: project.projectType,
      status: project.status,
      priority: project.priority,
      estimatedCost: project.estimatedCost ? parseFloat(project.estimatedCost) : null,
      actualCost: project.actualCost ? parseFloat(project.actualCost) : null,
      startDate: project.startDate,
      endDate: project.endDate,
      approvedBy: project.approvedBy,
      approvedAt: project.approvedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      data: formattedProjects,
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch modification requests',
    });
  }
}

/**
 * Get a specific project by ID
 */
async function getProjectById(req, res) {
  try {
    const userId = req.user.userId;
    const { projectId } = req.params;

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

    // Fetch project and ensure it belongs to this customer
    const project = await prisma.project.findFirst({
      where: {
        id: parseInt(projectId),
        customerId: customer.id,
      },
      include: {
        vehicle: true,
        projectLogs: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Modification request not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch modification request',
    });
  }
}

/**
 * Create a new modification request
 */
async function createProject(req, res) {
  try {
    const userId = req.user.userId;
    const { vehicleId, modificationDetails, estimatedBudget, title, projectType, priority } = req.body;

    // Validate required fields
    if (!vehicleId || !modificationDetails) {
      return res.status(400).json({
        success: false,
        error: 'Vehicle and modification details are required',
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

    // Verify vehicle belongs to customer
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

    // Create project
    const project = await prisma.project.create({
      data: {
        customerId: customer.id,
        vehicleId: parseInt(vehicleId),
        title: title || 'Custom Modification Request',
        description: modificationDetails,
        projectType: projectType || 'modification',
        status: 'pending',
        priority: priority || 'medium',
        estimatedCost: estimatedBudget ? parseFloat(estimatedBudget) : null,
      },
      include: {
        vehicle: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Modification request created successfully',
      data: {
        id: project.id.toString(),
        vehicleId: project.vehicleId,
        vehicleName: `${project.vehicle.year} ${project.vehicle.make} ${project.vehicle.model}`,
        title: project.title,
        description: project.description,
        status: project.status,
        estimatedCost: project.estimatedCost ? parseFloat(project.estimatedCost) : null,
        createdAt: project.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating project:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create modification request',
    });
  }
}

/**
 * Update a modification request
 */
async function updateProject(req, res) {
  try {
    const userId = req.user.userId;
    const { projectId } = req.params;
    const { title, description, estimatedCost, priority } = req.body;

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

    // Verify project belongs to customer and is still pending
    const project = await prisma.project.findFirst({
      where: {
        id: parseInt(projectId),
        customerId: customer.id,
        status: 'pending', // Only allow updates to pending projects
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Modification request not found or cannot be modified',
      });
    }

    // Update project
    const updatedProject = await prisma.project.update({
      where: { id: parseInt(projectId) },
      data: {
        title: title || project.title,
        description: description || project.description,
        estimatedCost: estimatedCost !== undefined ? parseFloat(estimatedCost) : project.estimatedCost,
        priority: priority || project.priority,
      },
      include: {
        vehicle: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Modification request updated successfully',
      data: updatedProject,
    });
  } catch (error) {
    console.error('Error updating project:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update modification request',
    });
  }
}

/**
 * Delete a modification request (only if pending)
 */
async function deleteProject(req, res) {
  try {
    const userId = req.user.userId;
    const { projectId } = req.params;

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

    // Verify project belongs to customer and is still pending
    const project = await prisma.project.findFirst({
      where: {
        id: parseInt(projectId),
        customerId: customer.id,
        status: 'pending', // Only allow deletion of pending projects
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Modification request not found or cannot be deleted',
      });
    }

    // Delete project
    await prisma.project.delete({
      where: { id: parseInt(projectId) },
    });

    return res.status(200).json({
      success: true,
      message: 'Modification request deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete modification request',
    });
  }
}

module.exports = {
  getCustomerProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
};
