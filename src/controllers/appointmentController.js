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

/**
 * Get available time slots for a specific date
 * Business hours:
 * - Weekdays (Mon-Fri): 9:00 AM - 6:00 PM
 * - Saturday: 8:00 AM - 7:00 PM
 * - Sunday: CLOSED
 */
async function getAvailableTimeSlots(req, res) {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date is required',
      });
    }

    const selectedDate = new Date(date);
    const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Check if Sunday (closed)
    if (dayOfWeek === 0) {
      return res.status(200).json({
        success: true,
        data: {
          availableSlots: [],
          message: 'Service station is closed on Sundays',
        },
      });
    }

    // Define business hours based on day
    let startHour, endHour;
    if (dayOfWeek === 6) {
      // Saturday
      startHour = 8;
      endHour = 19; // 7 PM (19:00)
    } else {
      // Weekdays (Monday-Friday)
      startHour = 9;
      endHour = 18; // 6 PM (18:00)
    }

    // Generate all possible time slots
    const allSlots = [];
    for (let hour = startHour; hour < endHour; hour++) {
      allSlots.push({
        hour,
        time: `${hour.toString().padStart(2, '0')}:00`,
        display: formatHourDisplay(hour),
      });
    }

    // Get existing appointments for the selected date
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        scheduledDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          in: ['scheduled', 'confirmed', 'in_progress'],
        },
      },
      select: {
        scheduledDate: true,
      },
    });

    // Extract booked hours
    const bookedHours = existingAppointments.map((apt) => {
      return new Date(apt.scheduledDate).getHours();
    });

    // Filter out booked slots
    const availableSlots = allSlots.filter((slot) => {
      return !bookedHours.includes(slot.hour);
    });

    return res.status(200).json({
      success: true,
      data: {
        date,
        dayOfWeek: getDayName(dayOfWeek),
        businessHours: `${formatHourDisplay(startHour)} - ${formatHourDisplay(endHour)}`,
        availableSlots,
        totalSlots: allSlots.length,
        bookedSlots: bookedHours.length,
      },
    });
  } catch (error) {
    console.error('Error fetching available time slots:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch available time slots',
    });
  }
}

/**
 * Helper function to format hour for display
 */
function formatHourDisplay(hour) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:00 ${period}`;
}

/**
 * Helper function to get day name
 */
function getDayName(dayOfWeek) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek];
}

module.exports = {
  getCustomerAppointments,
  getServiceProgress,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  getAvailableTimeSlots,
};
