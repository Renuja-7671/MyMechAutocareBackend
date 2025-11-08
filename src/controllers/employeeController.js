const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get assigned services for the logged-in employee
 */
async function getAssignedServices(req, res) {
  try {
    const userId = req.user.userId;

    // Get employee ID
    const employee = await prisma.employee.findUnique({
      where: { userId },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee profile not found',
      });
    }

    // Get assigned service logs
    const serviceLogs = await prisma.serviceLog.findMany({
      where: {
        employeeId: employee.id,
        status: {
          in: ['not_started', 'in_progress', 'on_hold']
        }
      },
      include: {
        appointment: {
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
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format response
    const formattedServices = serviceLogs.map((log) => {
      const vehicle = log.appointment.vehicle;
      const customer = log.appointment.customer;

      // Calculate estimated completion (7 days from start)
      const estimatedCompletion = log.startTime
        ? new Date(log.startTime.getTime() + 7 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      return {
        id: log.id.toString(),
        vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        customerName: `${customer.firstName} ${customer.lastName}`,
        serviceType: log.appointment.service?.name || 'Service',
        status: log.status,
        progress: log.progressPercentage || 0,
        startDate: log.startTime || log.createdAt,
        estimatedCompletion,
        totalHoursLogged: log.hoursWorked ? Number(log.hoursWorked) : 0,
        notes: log.notes,
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedServices,
    });
  } catch (error) {
    console.error('Error fetching assigned services:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch assigned services',
    });
  }
}

/**
 * Get upcoming appointments for the logged-in employee
 */
async function getUpcomingAppointments(req, res) {
  try {
    const userId = req.user.userId;

    // Get employee ID
    const employee = await prisma.employee.findUnique({
      where: { userId },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee profile not found',
      });
    }

    // Get service logs to find appointments
    const serviceLogs = await prisma.serviceLog.findMany({
      where: {
        employeeId: employee.id,
      },
      select: {
        appointmentId: true,
      },
    });

    const appointmentIds = serviceLogs.map((log) => log.appointmentId);

    // Get appointments
    const appointments = await prisma.appointment.findMany({
      where: {
        id: { in: appointmentIds },
        status: { in: ['scheduled', 'confirmed'] },
        scheduledDate: { gte: new Date() }, // Only upcoming
      },
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
          },
        },
        service: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { scheduledDate: 'asc' },
    });

    // Format response
    const formattedAppointments = appointments.map((appointment) => ({
      id: appointment.id.toString(),
      vehicleName: `${appointment.vehicle.year} ${appointment.vehicle.make} ${appointment.vehicle.model}`,
      customerName: `${appointment.customer.firstName} ${appointment.customer.lastName}`,
      customerPhone: appointment.customer.phone || 'N/A',
      serviceType: appointment.service?.name || 'Service',
      date: appointment.scheduledDate,
      time: new Date(appointment.scheduledDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      status: appointment.status,
    }));

    return res.status(200).json({
      success: true,
      data: formattedAppointments,
    });
  } catch (error) {
    console.error('Error fetching upcoming appointments:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming appointments',
    });
  }
}

/**
 * Log time for a service (updates hoursWorked on ServiceLog)
 */
async function logTime(req, res) {
  try {
    const userId = req.user.userId;
    const { serviceId, hours, description, date } = req.body;

    // Validate required fields
    if (!serviceId || !hours) {
      return res.status(400).json({
        success: false,
        error: 'Service ID and hours are required',
      });
    }

    // Get employee ID
    const employee = await prisma.employee.findUnique({
      where: { userId },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee profile not found',
      });
    }

    // Verify the service log belongs to this employee
    const serviceLog = await prisma.serviceLog.findFirst({
      where: {
        id: parseInt(serviceId),
        employeeId: employee.id,
      },
    });

    if (!serviceLog) {
      return res.status(404).json({
        success: false,
        error: 'Service not found or not assigned to you',
      });
    }

    // Update service log with additional hours
    const currentHours = serviceLog.hoursWorked ? Number(serviceLog.hoursWorked) : 0;
    const newTotalHours = currentHours + parseFloat(hours);

    const updateData = {
      hoursWorked: newTotalHours,
    };

    // Update notes if description is provided
    if (description) {
      const timestamp = new Date().toLocaleString();
      const newNote = `[${timestamp}] Logged ${hours} hrs: ${description}`;
      updateData.notes = serviceLog.notes
        ? `${serviceLog.notes}\n${newNote}`
        : newNote;
    }

    // Update end time if not set
    if (!serviceLog.endTime) {
      updateData.endTime = new Date();
    }

    await prisma.serviceLog.update({
      where: { id: parseInt(serviceId) },
      data: updateData,
    });

    return res.status(201).json({
      success: true,
      message: 'Time logged successfully',
      data: {
        serviceId: serviceId,
        hoursAdded: parseFloat(hours),
        totalHours: newTotalHours,
        description,
      },
    });
  } catch (error) {
    console.error('Error logging time:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to log time',
    });
  }
}

/**
 * Get time logs for the logged-in employee (parsed from notes)
 */
async function getTimeLogs(req, res) {
  try {
    const userId = req.user.userId;
    const { serviceId } = req.query;

    // Get employee ID
    const employee = await prisma.employee.findUnique({
      where: { userId },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee profile not found',
      });
    }

    // Build query
    const where = {
      employeeId: employee.id,
      hoursWorked: { not: null },
    };

    if (serviceId) {
      where.id = parseInt(serviceId);
    }

    // Get service logs
    const serviceLogs = await prisma.serviceLog.findMany({
      where,
      include: {
        appointment: {
          select: {
            service: {
              select: {
                name: true,
              },
            },
            vehicle: {
              select: {
                make: true,
                model: true,
                year: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Parse time logs from notes and service data
    const formattedLogs = serviceLogs.flatMap((log) => {
      const vehicle = log.appointment.vehicle;
      const serviceTypeName = log.appointment.service?.name || 'Service';
      const serviceName = `${vehicle.year} ${vehicle.make} ${vehicle.model} - ${serviceTypeName}`;

      // If there are notes with time log entries, parse them
      if (log.notes && log.notes.includes('Logged')) {
        const noteLines = log.notes.split('\n');
        return noteLines
          .filter(line => line.includes('Logged') && line.includes('hrs:'))
          .map((line, index) => {
            // Extract timestamp, hours, and description
            const timestampMatch = line.match(/\[(.*?)\]/);
            const hoursMatch = line.match(/Logged ([\d.]+) hrs:/);
            const descMatch = line.split('hrs: ')[1];

            return {
              id: `${log.id}-${index}`,
              serviceName,
              hours: hoursMatch ? parseFloat(hoursMatch[1]) : 0,
              description: descMatch || 'Time logged',
              date: timestampMatch ? new Date(timestampMatch[1]) : log.updatedAt,
            };
          });
      }

      // Otherwise, return a single entry for the total hours worked
      return [{
        id: log.id.toString(),
        serviceName,
        hours: Number(log.hoursWorked),
        description: 'Total hours worked',
        date: log.updatedAt,
      }];
    });

    return res.status(200).json({
      success: true,
      data: formattedLogs,
    });
  } catch (error) {
    console.error('Error fetching time logs:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch time logs',
    });
  }
}

/**
 * Update service status
 */
async function updateServiceStatus(req, res) {
  try {
    const userId = req.user.userId;
    const { serviceId } = req.params;
    const { status, progress, notes } = req.body;

    // Validate required fields
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
      });
    }

    // Get employee ID
    const employee = await prisma.employee.findUnique({
      where: { userId },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee profile not found',
      });
    }

    // Verify the service log belongs to this employee
    const serviceLog = await prisma.serviceLog.findFirst({
      where: {
        id: parseInt(serviceId),
        employeeId: employee.id,
      },
    });

    if (!serviceLog) {
      return res.status(404).json({
        success: false,
        error: 'Service not found or not assigned to you',
      });
    }

    // Prepare update data
    const updateData = {
      status,
    };

    if (progress !== undefined) {
      updateData.progressPercentage = parseInt(progress);
    }

    if (notes !== undefined) {
      const timestamp = new Date().toLocaleString();
      const newNote = `[${timestamp}] Status updated to ${status}: ${notes}`;
      updateData.notes = serviceLog.notes
        ? `${serviceLog.notes}\n${newNote}`
        : newNote;
    }

    // Set dates based on status
    if (status === 'in_progress' && !serviceLog.startTime) {
      updateData.startTime = new Date();
    }

    if (status === 'completed' && !serviceLog.endTime) {
      updateData.endTime = new Date();
      updateData.progressPercentage = 100;
    }

    // Update service log
    const updatedServiceLog = await prisma.serviceLog.update({
      where: { id: parseInt(serviceId) },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: 'Service status updated successfully',
      data: {
        id: updatedServiceLog.id.toString(),
        status: updatedServiceLog.status,
        progress: updatedServiceLog.progressPercentage,
        notes: updatedServiceLog.notes,
      },
    });
  } catch (error) {
    console.error('Error updating service status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update service status',
    });
  }
}

module.exports = {
  getAssignedServices,
  getUpcomingAppointments,
  logTime,
  getTimeLogs,
  updateServiceStatus,
};
