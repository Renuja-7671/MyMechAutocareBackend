const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

/**
 * Get dashboard statistics
 */
async function getDashboardStats(req, res) {
  try {
    // Get total customers
    const totalCustomers = await prisma.customer.count();

    // Get total employees
    const totalEmployees = await prisma.employee.count();

    // Get active services (in_progress service logs)
    const activeServices = await prisma.serviceLog.count({
      where: {
        status: 'in_progress',
      },
    });

    // Get completed services
    const completedServices = await prisma.serviceLog.count({
      where: {
        status: 'completed',
      },
    });

    // Get pending appointments
    const pendingAppointments = await prisma.appointment.count({
      where: {
        status: {
          in: ['scheduled', 'confirmed'],
        },
      },
    });

    // Calculate revenue (sum of actual costs from completed projects)
    const completedProjects = await prisma.project.aggregate({
      where: {
        status: 'completed',
        actualCost: {
          not: null,
        },
      },
      _sum: {
        actualCost: true,
      },
    });

    const revenue = completedProjects._sum.actualCost || 0;

    return res.status(200).json({
      success: true,
      data: {
        totalCustomers,
        totalEmployees,
        activeServices,
        completedServices,
        pendingAppointments,
        revenue: Number(revenue),
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
    });
  }
}

/**
 * Get all users with their profile information
 */
async function getAllUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            position: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format users to match frontend expectations
    const formattedUsers = users.map((user) => {
      const profile = user.customer || user.employee;
      return {
        id: user.id.toString(),
        employeeId: user.employee?.id,
        name: profile ? `${profile.firstName} ${profile.lastName}` : 'No Name',
        email: user.email,
        phone: profile?.phone || '',
        role: user.role,
        position: user.employee?.position,
        createdAt: user.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedUsers,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
    });
  }
}

/**
 * Update user role
 */
async function updateUserRole(req, res) {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // Validate role
    if (!['customer', 'employee', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be customer, employee, or admin',
      });
    }

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: {
        customer: true,
        employee: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // If changing from customer to employee or vice versa, we need to handle profile creation
    if (user.role === 'customer' && role === 'employee') {
      // Create employee profile if customer has one
      if (user.customer) {
        await prisma.employee.create({
          data: {
            userId: user.id,
            firstName: user.customer.firstName,
            lastName: user.customer.lastName,
            phone: user.customer.phone,
            hireDate: new Date(),
          },
        });
      }
    } else if (user.role === 'employee' && role === 'customer') {
      // Create customer profile if employee has one
      if (user.employee) {
        await prisma.customer.create({
          data: {
            userId: user.id,
            firstName: user.employee.firstName,
            lastName: user.employee.lastName,
            phone: user.employee.phone,
          },
        });
      }
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { role },
    });

    return res.status(200).json({
      success: true,
      message: 'User role updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update user role',
    });
  }
}

/**
 * Delete user
 */
async function deleteUser(req, res) {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Prevent deleting the last admin
    if (user.role === 'admin') {
      const adminCount = await prisma.user.count({
        where: { role: 'admin' },
      });

      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete the last admin user',
        });
      }
    }

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: parseInt(userId) },
    });

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete user',
    });
  }
}

/**
 * Get all services (appointments with service logs)
 */
async function getAllServices(req, res) {
  try {
    const appointments = await prisma.appointment.findMany({
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
          },
        },
        service: {
          select: {
            name: true,
          },
        },
        serviceLogs: {
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
          take: 1,
        },
      },
      orderBy: { scheduledDate: 'desc' },
    });

    // Format services to match frontend expectations
    const formattedServices = appointments.map((apt) => {
      const latestLog = apt.serviceLogs[0];
      return {
        id: apt.id.toString(),
        vehicleName: `${apt.vehicle.year} ${apt.vehicle.make} ${apt.vehicle.model}`,
        customerName: `${apt.customer.firstName} ${apt.customer.lastName}`,
        serviceType: apt.service?.name || 'General Service',
        status: latestLog?.status || 'not_started',
        progress: latestLog?.progressPercentage || 0,
        assignedEmployee: latestLog?.employee
          ? `${latestLog.employee.firstName} ${latestLog.employee.lastName}`
          : null,
        assignedEmployeeId: latestLog?.employeeId,
        startDate: apt.scheduledDate,
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedServices,
    });
  } catch (error) {
    console.error('Error fetching services:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch services',
    });
  }
}

/**
 * Assign service to employee
 */
async function assignServiceToEmployee(req, res) {
  try {
    const { serviceId } = req.params;
    const { employeeId } = req.body;

    console.log('Assign service request:', { serviceId, employeeId });

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        error: 'Employee ID is required',
      });
    }

    // Verify appointment exists
    const appointment = await prisma.appointment.findUnique({
      where: { id: parseInt(serviceId) },
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found',
      });
    }

    // Verify employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: parseInt(employeeId) },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found',
      });
    }

    // Check if service log already exists for this appointment
    const existingLog = await prisma.serviceLog.findFirst({
      where: {
        appointmentId: parseInt(serviceId),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingLog) {
      // Update existing service log
      const updatedLog = await prisma.serviceLog.update({
        where: { id: existingLog.id },
        data: {
          employeeId: parseInt(employeeId),
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Employee reassigned successfully',
        data: updatedLog,
      });
    } else {
      // Create new service log
      const serviceLog = await prisma.serviceLog.create({
        data: {
          appointmentId: parseInt(serviceId),
          employeeId: parseInt(employeeId),
          startTime: new Date(),
          status: 'not_started',
          progressPercentage: 0,
        },
      });

      // Update appointment status to confirmed if it's still scheduled
      if (appointment.status === 'scheduled') {
        await prisma.appointment.update({
          where: { id: parseInt(serviceId) },
          data: { status: 'confirmed' },
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Employee assigned successfully',
        data: serviceLog,
      });
    }
  } catch (error) {
    console.error('Error assigning service to employee:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to assign employee to service',
    });
  }
}

/**
 * Get all appointments (for admin view)
 */
async function getAllAppointments(req, res) {
  try {
    const appointments = await prisma.appointment.findMany({
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
          },
        },
        service: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { scheduledDate: 'desc' },
    });

    // Format appointments to match frontend expectations
    const formattedAppointments = appointments.map((apt) => ({
      id: apt.id.toString(),
      vehicleName: `${apt.vehicle.year} ${apt.vehicle.make} ${apt.vehicle.model}`,
      customerName: `${apt.customer.firstName} ${apt.customer.lastName}`,
      customerEmail: '', // Email not directly available from customer, would need to join with user
      serviceType: apt.service?.name || 'General Service',
      date: apt.scheduledDate.toISOString().split('T')[0],
      time: apt.scheduledDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      status: apt.status,
    }));

    return res.status(200).json({
      success: true,
      data: formattedAppointments,
    });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch appointments',
    });
  }
}

/**
 * Generate reports
 */
async function getReports(req, res) {
  try {
    const { type, startDate, endDate } = req.query;

    if (!type || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Report type, start date, and end date are required',
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include the entire end date

    let reportData = {};

    switch (type) {
      case 'revenue':
        // Get revenue from completed projects
        const projects = await prisma.project.findMany({
          where: {
            status: 'completed',
            endDate: {
              gte: start,
              lte: end,
            },
            actualCost: {
              not: null,
            },
          },
        });

        const totalRevenue = projects.reduce(
          (sum, project) => sum + Number(project.actualCost || 0),
          0
        );

        reportData = {
          totalRecords: projects.length,
          totalAmount: totalRevenue,
          average: projects.length > 0 ? totalRevenue / projects.length : 0,
          growth: 0, // Would need historical data to calculate
        };
        break;

      case 'services':
        // Get service statistics
        const appointments = await prisma.appointment.findMany({
          where: {
            scheduledDate: {
              gte: start,
              lte: end,
            },
          },
          include: {
            service: true,
          },
        });

        reportData = {
          totalRecords: appointments.length,
          totalAmount: 0, // Services don't have direct cost in appointments
          average: 0,
          growth: 0,
        };
        break;

      case 'customers':
        // Get customer activity
        const customers = await prisma.customer.findMany({
          where: {
            createdAt: {
              gte: start,
              lte: end,
            },
          },
        });

        reportData = {
          totalRecords: customers.length,
          totalAmount: 0,
          average: 0,
          growth: 0,
        };
        break;

      case 'employees':
        // Get employee performance
        const serviceLogs = await prisma.serviceLog.findMany({
          where: {
            createdAt: {
              gte: start,
              lte: end,
            },
            status: 'completed',
          },
        });

        const totalHours = serviceLogs.reduce(
          (sum, log) => sum + Number(log.hoursWorked || 0),
          0
        );

        reportData = {
          totalRecords: serviceLogs.length,
          totalAmount: totalHours,
          average: serviceLogs.length > 0 ? totalHours / serviceLogs.length : 0,
          growth: 0,
        };
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid report type',
        });
    }

    return res.status(200).json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    console.error('Error generating report:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate report',
    });
  }
}

/**
 * Create a new employee
 */
async function createEmployee(req, res) {
  try {
    const { email, password, firstName, lastName, phone, position } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, first name, last name, and phone are required',
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'A user with this email already exists',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user and employee in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'employee',
        },
      });

      // Create employee profile
      const employee = await tx.employee.create({
        data: {
          userId: user.id,
          firstName,
          lastName,
          phone,
          position: position || 'Technician',
          hireDate: new Date(),
        },
      });

      return { user, employee };
    });

    return res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        employeeId: result.employee.id,
        firstName: result.employee.firstName,
        lastName: result.employee.lastName,
        phone: result.employee.phone,
        position: result.employee.position,
      },
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create employee',
    });
  }
}

/**
 * Get all modification requests (admin view)
 */
async function getAllModificationRequests(req, res) {
  try {
    const projects = await prisma.project.findMany({
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            licensePlate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format projects to match frontend expectations
    const formattedProjects = projects.map((project) => ({
      id: project.id.toString(),
      customerName: `${project.customer.firstName} ${project.customer.lastName}`,
      customerPhone: project.customer.phone || 'N/A',
      vehicleName: `${project.vehicle.year} ${project.vehicle.make} ${project.vehicle.model}`,
      licensePlate: project.vehicle.licensePlate || 'N/A',
      title: project.title,
      description: project.description,
      projectType: project.projectType,
      estimatedCost: project.estimatedCost ? Number(project.estimatedCost) : 0,
      approvedCost: project.actualCost ? Number(project.actualCost) : null,
      status: project.status,
      priority: project.priority,
      createdAt: project.createdAt,
      startDate: project.startDate,
      endDate: project.endDate,
    }));

    return res.status(200).json({
      success: true,
      data: formattedProjects,
    });
  } catch (error) {
    console.error('Error fetching modification requests:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch modification requests',
    });
  }
}

/**
 * Update modification request status and approved cost
 */
async function updateModificationStatus(req, res) {
  try {
    const { projectId } = req.params;
    const { status, approvedCost } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
      });
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: parseInt(projectId) },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Modification request not found',
      });
    }

    // Prepare update data
    const updateData = {
      status,
    };

    // Set actual cost if provided (regardless of status)
    if (approvedCost) {
      updateData.actualCost = parseFloat(approvedCost);
    }

    // If approving, track approval metadata
    if (status === 'approved') {
      updateData.approvedBy = req.user.userId; // Track who approved it
      updateData.approvedAt = new Date();
    }

    // If starting work, set start date
    if (status === 'in_progress' && !project.startDate) {
      updateData.startDate = new Date();
    }

    // If completing, set end date
    if (status === 'completed' && !project.endDate) {
      updateData.endDate = new Date();
    }

    // Update project
    const updatedProject = await prisma.project.update({
      where: { id: parseInt(projectId) },
      data: updateData,
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            licensePlate: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Modification request updated successfully',
      data: {
        id: updatedProject.id.toString(),
        customerName: `${updatedProject.customer.firstName} ${updatedProject.customer.lastName}`,
        vehicleName: `${updatedProject.vehicle.year} ${updatedProject.vehicle.make} ${updatedProject.vehicle.model}`,
        status: updatedProject.status,
        estimatedCost: updatedProject.estimatedCost ? Number(updatedProject.estimatedCost) : 0,
        approvedCost: updatedProject.actualCost ? Number(updatedProject.actualCost) : null,
      },
    });
  } catch (error) {
    console.error('Error updating modification status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update modification request',
    });
  }
}

module.exports = {
  getDashboardStats,
  getAllUsers,
  updateUserRole,
  deleteUser,
  getAllServices,
  assignServiceToEmployee,
  getAllAppointments,
  getReports,
  createEmployee,
  getAllModificationRequests,
  updateModificationStatus,
};
