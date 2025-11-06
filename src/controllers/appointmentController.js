const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get all appointments for authenticated customer
 */
async function getCustomerAppointments(req, res) {
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

    // Fetch appointments
    const appointments = await prisma.appointment.findMany({
      where: { customerId: customer.id },
      include: {
        vehicle: true,
        service: true,
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
        },
      },
      orderBy: { scheduledDate: 'desc' },
    });

    // Format response to match frontend expectations
    const formattedAppointments = appointments.map((apt) => ({
      id: apt.id.toString(),
      vehicleName: `${apt.vehicle.year} ${apt.vehicle.make} ${apt.vehicle.model}`,
      serviceType: apt.service?.name || 'General Service',
      date: apt.scheduledDate.toISOString().split('T')[0],
      time: apt.scheduledDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      status: apt.status,
      notes: apt.notes,
      vehicleId: apt.vehicleId,
      serviceId: apt.serviceId,
      scheduledDate: apt.scheduledDate,
      createdAt: apt.createdAt,
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
 * Get service progress (in-progress appointments with service logs)
 */
async function getServiceProgress(req, res) {
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

    // Fetch in-progress appointments with service logs
    const appointments = await prisma.appointment.findMany({
      where: {
        customerId: customer.id,
        status: {
          in: ['confirmed', 'in_progress'],
        },
      },
      include: {
        vehicle: true,
        service: true,
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

    // Format response
    const serviceProgress = appointments.map((apt) => {
      const latestLog = apt.serviceLogs[0];
      return {
        id: apt.id.toString(),
        vehicleName: `${apt.vehicle.year} ${apt.vehicle.make} ${apt.vehicle.model}`,
        serviceType: apt.service?.name || 'General Service',
        status: latestLog?.status || apt.status,
        progress: latestLog?.progressPercentage || 0,
        startDate: apt.scheduledDate.toISOString().split('T')[0],
        estimatedCompletion: apt.scheduledDate.toISOString().split('T')[0], // TODO: Calculate based on estimated duration
        assignedEmployee: latestLog?.employee
          ? `${latestLog.employee.firstName} ${latestLog.employee.lastName}`
          : null,
      };
    });

    return res.status(200).json({
      success: true,
      data: serviceProgress,
    });
  } catch (error) {
    console.error('Error fetching service progress:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch service progress',
    });
  }
}

/**
 * Create a new appointment
 */
async function createAppointment(req, res) {
  try {
    const userId = req.user.userId;
    const { vehicleId, serviceType, preferredDate, preferredTime, description } = req.body;

    // Validate required fields
    if (!vehicleId || !serviceType || !preferredDate || !preferredTime) {
      return res.status(400).json({
        success: false,
        error: 'Vehicle, service type, date, and time are required',
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

    // Find or create service
    let service = await prisma.service.findFirst({
      where: {
        name: {
          contains: serviceType,
          mode: 'insensitive',
        },
      },
    });

    if (!service) {
      // Create new service if doesn't exist
      service = await prisma.service.create({
        data: {
          name: serviceType,
          description: description || `${serviceType} service`,
          category: 'general',
          isActive: true,
        },
      });
    }

    // Combine date and time
    const scheduledDate = new Date(`${preferredDate}T${preferredTime}`);

    // Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        customerId: customer.id,
        vehicleId: parseInt(vehicleId),
        serviceId: service.id,
        scheduledDate,
        status: 'scheduled',
        notes: description,
      },
      include: {
        vehicle: true,
        service: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      data: {
        id: appointment.id.toString(),
        vehicleName: `${appointment.vehicle.year} ${appointment.vehicle.make} ${appointment.vehicle.model}`,
        serviceType: appointment.service.name,
        date: appointment.scheduledDate.toISOString().split('T')[0],
        time: appointment.scheduledDate.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        status: appointment.status,
      },
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create appointment',
    });
  }
}

/**
 * Update appointment status (cancel, reschedule, etc.)
 */
async function updateAppointment(req, res) {
  try {
    const userId = req.user.userId;
    const { appointmentId } = req.params;
    const { status, scheduledDate, notes } = req.body;

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

    // Verify appointment belongs to customer
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: parseInt(appointmentId),
        customerId: customer.id,
      },
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found',
      });
    }

    // Update appointment
    const updatedAppointment = await prisma.appointment.update({
      where: { id: parseInt(appointmentId) },
      data: {
        status: status || appointment.status,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : appointment.scheduledDate,
        notes: notes !== undefined ? notes : appointment.notes,
      },
      include: {
        vehicle: true,
        service: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Appointment updated successfully',
      data: updatedAppointment,
    });
  } catch (error) {
    console.error('Error updating appointment:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update appointment',
    });
  }
}

/**
 * Cancel an appointment
 */
async function cancelAppointment(req, res) {
  try {
    const userId = req.user.userId;
    const { appointmentId } = req.params;

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

    // Verify appointment belongs to customer
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: parseInt(appointmentId),
        customerId: customer.id,
      },
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found',
      });
    }

    // Update status to cancelled
    const cancelledAppointment = await prisma.appointment.update({
      where: { id: parseInt(appointmentId) },
      data: {
        status: 'cancelled',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully',
      data: cancelledAppointment,
    });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel appointment',
    });
  }
}

module.exports = {
  getCustomerAppointments,
  getServiceProgress,
  createAppointment,
  updateAppointment,
  cancelAppointment,
};
