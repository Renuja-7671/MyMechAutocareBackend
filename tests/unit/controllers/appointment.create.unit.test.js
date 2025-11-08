// tests/unit/controllers/appointment.controller.unit.test.js

// Mock Prisma client used by the controller
const mockPrisma = {
  customer: { findUnique: jest.fn() },
  appointment: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  vehicle: { findFirst: jest.fn() },
  service: { findFirst: jest.fn(), create: jest.fn() },
};

jest.mock("@prisma/client", () => {
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

const appointmentController = require("../../../src/controllers/appointmentController");

describe("appointmentController (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeReq = ({
    userId = 1,
    body = {},
    params = {},
    query = {},
  } = {}) => ({
    user: { userId },
    body,
    params,
    query,
  });

  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  //
  // getCustomerAppointments
  //
  test("getCustomerAppointments: 404 when customer not found", async () => {
    const req = makeReq({ userId: 50 });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await appointmentController.getCustomerAppointments(req, res);

    expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith({
      where: { userId: 50 },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("getCustomerAppointments: returns formatted appointments", async () => {
    const userId = 51;
    const req = makeReq({ userId });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 600 });

    const scheduledDate = new Date("2025-11-20T09:15:00Z");
    const appointments = [
      {
        id: 10,
        vehicle: { year: 2020, make: "Toyota", model: "Corolla" },
        service: { name: "Oil Change" },
        scheduledDate,
        status: "scheduled",
        notes: "please check brakes",
        vehicleId: 3,
        serviceId: 2,
        createdAt: new Date("2025-10-01T00:00:00Z"),
      },
    ];

    mockPrisma.appointment.findMany.mockResolvedValue(appointments);

    await appointmentController.getCustomerAppointments(req, res);

    expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith({
      where: { customerId: 600 },
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
      orderBy: { scheduledDate: "desc" },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        id: "10",
        vehicleName: "2020 Toyota Corolla",
        serviceType: "Oil Change",
        status: "scheduled",
        notes: "please check brakes",
        vehicleId: 3,
        serviceId: 2,
      })
    );
    // date/time formatted checks
    expect(body.data[0].date).toBe(scheduledDate.toISOString().split("T")[0]);
    expect(typeof body.data[0].time).toBe("string");
  });

  //
  // getServiceProgress
  //
  test("getServiceProgress: 404 when customer not found", async () => {
    const req = makeReq({ userId: 52 });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await appointmentController.getServiceProgress(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("getServiceProgress: returns progress mapping with latest log", async () => {
    const userId = 53;
    const req = makeReq({ userId });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 700 });

    const sched = new Date("2025-11-21T08:00:00Z");
    const appointments = [
      {
        id: 20,
        vehicle: { year: 2018, make: "Ford", model: "Fiesta" },
        service: { name: "Check" },
        status: "in_progress",
        scheduledDate: sched,
        serviceLogs: [
          {
            id: 5,
            status: "in_progress",
            progressPercentage: 40,
            employee: { firstName: "John", lastName: "Doe" },
            createdAt: new Date(),
          },
        ],
      },
    ];

    mockPrisma.appointment.findMany.mockResolvedValue(appointments);

    await appointmentController.getServiceProgress(req, res);

    expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith({
      where: {
        customerId: 700,
        status: {
          in: ["confirmed", "in_progress"],
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
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { scheduledDate: "desc" },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        id: "20",
        vehicleName: "2018 Ford Fiesta",
        serviceType: "Check",
        status: "in_progress",
        progress: 40,
        assignedEmployee: "John Doe",
      })
    );
  });

  //
  // createAppointment - branch where service is created when not found
  //
  test("createAppointment: create service when not found and return 201", async () => {
    const req = makeReq({
      userId: 60,
      body: {
        vehicleId: "77",
        serviceType: "New Fancy Service",
        preferredDate: "2025-12-01",
        preferredTime: "09:00",
        description: "testing new service",
      },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 900 });
    mockPrisma.vehicle.findFirst.mockResolvedValue({
      id: 77,
      year: 2022,
      make: "Kia",
      model: "Rio",
    });
    // service not found
    mockPrisma.service.findFirst.mockResolvedValue(null);
    // service created
    mockPrisma.service.create.mockResolvedValue({
      id: 501,
      name: "New Fancy Service",
    });

    const appointmentObj = {
      id: 333,
      vehicle: { year: 2022, make: "Kia", model: "Rio" },
      service: { name: "New Fancy Service" },
      scheduledDate: new Date("2025-12-01T09:00:00Z"),
      status: "scheduled",
    };
    mockPrisma.appointment.create.mockResolvedValue(appointmentObj);

    await appointmentController.createAppointment(req, res);

    expect(mockPrisma.service.create).toHaveBeenCalledWith({
      data: {
        name: "New Fancy Service",
        description: "testing new service" || "New Fancy Service service",
        category: "general",
        isActive: true,
      },
    });

    expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 900,
          vehicleId: 77,
          serviceId: 501,
          status: "scheduled",
        }),
        include: { vehicle: true, service: true },
      })
    );

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.message).toBe("Appointment created successfully");
    expect(body.data).toEqual(
      expect.objectContaining({
        id: "333",
        vehicleName: "2022 Kia Rio",
        serviceType: "New Fancy Service",
      })
    );
  });

  //
  // updateAppointment
  //
  test("updateAppointment: 404 when customer not found", async () => {
    const req = makeReq({
      userId: 70,
      params: { appointmentId: "1" },
      body: {},
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await appointmentController.updateAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("updateAppointment: 404 when appointment not found", async () => {
    const req = makeReq({
      userId: 71,
      params: { appointmentId: "2" },
      body: { status: "rescheduled" },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 1000 });
    mockPrisma.appointment.findFirst.mockResolvedValue(null);

    await appointmentController.updateAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Appointment not found",
    });
  });

  test("updateAppointment: success updates and returns 200", async () => {
    const req = makeReq({
      userId: 72,
      params: { appointmentId: "3" },
      body: {
        status: "rescheduled",
        scheduledDate: "2025-12-10T10:00:00Z",
        notes: "new notes",
      },
    });
    const res = makeRes();

    const existing = {
      id: 3,
      customerId: 1100,
      status: "scheduled",
      scheduledDate: new Date("2025-11-01T00:00:00Z"),
      notes: "",
    };
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 1100 });
    mockPrisma.appointment.findFirst.mockResolvedValue(existing);

    const updated = {
      id: 3,
      status: "rescheduled",
      scheduledDate: new Date("2025-12-10T10:00:00Z"),
      notes: "new notes",
      vehicle: { year: 2017, make: "Mazda", model: "3" },
      service: { name: "General Service" },
    };
    mockPrisma.appointment.update.mockResolvedValue(updated);

    await appointmentController.updateAppointment(req, res);

    expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: {
        status: "rescheduled",
        scheduledDate: new Date("2025-12-10T10:00:00Z"),
        notes: "new notes",
      },
      include: { vehicle: true, service: true },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.message).toBe("Appointment updated successfully");
    expect(body.data).toEqual(updated);
  });

  //
  // cancelAppointment
  //
  test("cancelAppointment: 404 when customer not found", async () => {
    const req = makeReq({ userId: 80, params: { appointmentId: "9" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await appointmentController.cancelAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("cancelAppointment: 404 when appointment not found", async () => {
    const req = makeReq({ userId: 81, params: { appointmentId: "10" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 1300 });
    mockPrisma.appointment.findFirst.mockResolvedValue(null);

    await appointmentController.cancelAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Appointment not found",
    });
  });

  test("cancelAppointment: success updates status to cancelled and returns 200", async () => {
    const req = makeReq({ userId: 82, params: { appointmentId: "11" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 1400 });
    mockPrisma.appointment.findFirst.mockResolvedValue({
      id: 11,
      customerId: 1400,
      status: "scheduled",
    });
    mockPrisma.appointment.update.mockResolvedValue({
      id: 11,
      status: "cancelled",
    });

    await appointmentController.cancelAppointment(req, res);

    expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { status: "cancelled" },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Appointment cancelled successfully",
      data: { id: 11, status: "cancelled" },
    });
  });

  //
  // error branch: createAppointment with DB failure already covered in your file,
  // but add one more error path for getCustomerAppointments to increase coverage
  //
  test("getCustomerAppointments: 500 on DB error", async () => {
    const req = makeReq({ userId: 90 });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockRejectedValue(new Error("boom"));

    await appointmentController.getCustomerAppointments(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Failed to fetch appointments",
    });
  });
});
