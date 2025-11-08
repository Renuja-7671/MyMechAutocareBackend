// tests/unit/controllers/employee.controller.unit.test.js

// Mock Prisma so the controller's `new PrismaClient()` returns our mock
const mockPrisma = {
  employee: { findUnique: jest.fn() },
  serviceLog: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  appointment: { findMany: jest.fn() },
};

jest.mock("@prisma/client", () => {
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

const employeeController = require("../../../src/controllers/employeeController");

describe("employeeController (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeReq({ userId = 1, body = {}, params = {}, query = {} } = {}) {
    return { user: { userId }, body, params, query };
  }
  function makeRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  }

  //
  // getAssignedServices
  //
  test("getAssignedServices: returns formatted services when employee exists", async () => {
    const userId = 10;
    const req = makeReq({ userId });
    const res = makeRes();

    const employee = { id: 100, userId };
    mockPrisma.employee.findUnique.mockResolvedValue(employee);

    const now = new Date();
    const serviceLogs = [
      {
        id: 1,
        appointment: {
          vehicle: { year: 2020, make: "Toyota", model: "Corolla" },
          customer: { firstName: "A", lastName: "B" },
          service: { name: "Oil Change" },
        },
        status: "in_progress",
        progressPercentage: 50,
        startTime: now,
        createdAt: now,
        hoursWorked: "2",
        notes: "initial",
      },
    ];
    mockPrisma.serviceLog.findMany.mockResolvedValue(serviceLogs);

    await employeeController.getAssignedServices(req, res);

    expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
      where: { userId },
    });
    expect(mockPrisma.serviceLog.findMany).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toHaveProperty("vehicleName");
    expect(body.data[0]).toHaveProperty("customerName");
  });

  test("getAssignedServices: returns 404 when employee not found", async () => {
    const req = makeReq({ userId: 99 });
    const res = makeRes();

    mockPrisma.employee.findUnique.mockResolvedValue(null);

    await employeeController.getAssignedServices(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Employee profile not found",
    });
  });

  //
  // getUpcomingAppointments
  //
  test("getUpcomingAppointments: returns formatted appointments for employee", async () => {
    const userId = 20;
    const req = makeReq({ userId });
    const res = makeRes();

    const employee = { id: 200, userId };
    mockPrisma.employee.findUnique.mockResolvedValue(employee);

    mockPrisma.serviceLog.findMany.mockResolvedValue([
      { appointmentId: 5 },
      { appointmentId: 6 },
    ]);
    const appointments = [
      {
        id: 5,
        vehicle: { year: 2019, make: "Ford", model: "Figo" },
        customer: { firstName: "C", lastName: "D", phone: "12345" },
        serviceType: "Check",
        date: "2025-12-01",
        timeSlot: "10:00",
        status: "scheduled",
      },
    ];
    mockPrisma.appointment.findMany.mockResolvedValue(appointments);

    await employeeController.getUpcomingAppointments(req, res);

    expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
      where: { userId },
    });
    expect(mockPrisma.serviceLog.findMany).toHaveBeenCalled();
    expect(mockPrisma.appointment.findMany).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toHaveProperty("vehicleName");
    expect(body.data[0]).toHaveProperty("customerName");
  });

  test("getUpcomingAppointments: 404 when employee not found", async () => {
    const req = makeReq({ userId: 999 });
    const res = makeRes();

    mockPrisma.employee.findUnique.mockResolvedValue(null);

    await employeeController.getUpcomingAppointments(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Employee profile not found",
    });
  });

  //
  // logTime
  //
  test("logTime: returns 400 when missing serviceId or hours", async () => {
    const req = makeReq({ body: { serviceId: null, hours: null } });
    const res = makeRes();

    await employeeController.logTime(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Service ID and hours are required",
    });
  });

  test("logTime: returns 404 when employee not found", async () => {
    const req = makeReq({ userId: 50, body: { serviceId: "1", hours: 2 } });
    const res = makeRes();

    mockPrisma.employee.findUnique.mockResolvedValue(null);

    await employeeController.logTime(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Employee profile not found",
    });
  });

  test("logTime: returns 404 when serviceLog not found or not assigned", async () => {
    const userId = 60;
    const req = makeReq({ userId, body: { serviceId: "99", hours: 1 } });
    const res = makeRes();

    mockPrisma.employee.findUnique.mockResolvedValue({ id: 600, userId });
    mockPrisma.serviceLog.findFirst.mockResolvedValue(null);

    await employeeController.logTime(req, res);

    expect(mockPrisma.serviceLog.findFirst).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Service not found or not assigned to you",
    });
  });

  test("logTime: success updates hoursWorked, notes and returns 201", async () => {
    const userId = 70;
    const req = makeReq({
      userId,
      body: {
        serviceId: "7",
        hours: "2.5",
        description: "did work",
        date: "2025-11-01",
      },
    });
    const res = makeRes();

    const serviceLog = {
      id: 7,
      hoursWorked: "1",
      notes: "existing",
      endTime: null,
    };
    mockPrisma.employee.findUnique.mockResolvedValue({ id: 700, userId });
    mockPrisma.serviceLog.findFirst.mockResolvedValue(serviceLog);
    mockPrisma.serviceLog.update.mockResolvedValue({
      id: serviceLog.id,
      hoursWorked: "3.5",
      notes: expect.any(String),
    });

    await employeeController.logTime(req, res);

    expect(mockPrisma.serviceLog.update).toHaveBeenCalledWith({
      where: { id: parseInt(req.body.serviceId) },
      data: expect.objectContaining({
        hoursWorked: expect.any(Number),
        notes: expect.any(String),
        endTime: expect.any(Date),
      }),
    });

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.serviceId).toBe(req.body.serviceId);
    expect(body.data.hoursAdded).toBe(parseFloat(req.body.hours));
    expect(body.data.totalHours).toBeCloseTo(3.5);
  });

  //
  // getTimeLogs
  //
  test("getTimeLogs: returns parsed logs when employee exists (no serviceId)", async () => {
    const userId = 80;
    const req = makeReq({ userId, query: {} });
    const res = makeRes();

    mockPrisma.employee.findUnique.mockResolvedValue({ id: 800, userId });

    // service logs with notes that include Logged entries
    const updatedAt = new Date();
    const serviceLogs = [
      {
        id: 9,
        appointment: {
          serviceType: "Repair",
          vehicle: { year: 2018, make: "Nissan", model: "Sunny" },
        },
        notes: `[${new Date().toLocaleString()}] Logged 2 hrs: fixed brakes\nOther`,
        hoursWorked: "2",
        updatedAt,
      },
      {
        id: 10,
        appointment: {
          serviceType: "Check",
          vehicle: { year: 2020, make: "Honda", model: "City" },
        },
        notes: null,
        hoursWorked: "3",
        updatedAt,
      },
    ];
    mockPrisma.serviceLog.findMany.mockResolvedValue(serviceLogs);

    await employeeController.getTimeLogs(req, res);

    expect(mockPrisma.employee.findUnique).toHaveBeenCalled();
    expect(mockPrisma.serviceLog.findMany).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("getTimeLogs: returns 404 when employee not found", async () => {
    const req = makeReq({ userId: 9999 });
    const res = makeRes();

    mockPrisma.employee.findUnique.mockResolvedValue(null);

    await employeeController.getTimeLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Employee profile not found",
    });
  });

  //
  // updateServiceStatus
  //
  test("updateServiceStatus: 400 when status missing", async () => {
    const req = makeReq({ body: {}, params: { serviceId: "1" } });
    const res = makeRes();

    await employeeController.updateServiceStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Status is required",
    });
  });

  test("updateServiceStatus: 404 when employee not found", async () => {
    const req = makeReq({
      userId: 2000,
      body: { status: "in_progress" },
      params: { serviceId: "1" },
    });
    const res = makeRes();

    mockPrisma.employee.findUnique.mockResolvedValue(null);

    await employeeController.updateServiceStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Employee profile not found",
    });
  });

  test("updateServiceStatus: 404 when serviceLog not found", async () => {
    const userId = 300;
    const req = makeReq({
      userId,
      body: { status: "in_progress" },
      params: { serviceId: "999" },
    });
    const res = makeRes();

    mockPrisma.employee.findUnique.mockResolvedValue({ id: 300, userId });
    mockPrisma.serviceLog.findFirst.mockResolvedValue(null);

    await employeeController.updateServiceStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Service not found or not assigned to you",
    });
  });

  test("updateServiceStatus: success updates and returns 200 (completed sets progress to 100)", async () => {
    const userId = 400;
    const serviceId = 55;
    const req = makeReq({
      userId,
      body: { status: "completed", progress: undefined, notes: "done" },
      params: { serviceId: String(serviceId) },
    });
    const res = makeRes();

    const serviceLog = {
      id: serviceId,
      notes: "old",
      startTime: new Date(),
      endTime: null,
      progressPercentage: 50,
    };
    mockPrisma.employee.findUnique.mockResolvedValue({ id: 400, userId });
    mockPrisma.serviceLog.findFirst.mockResolvedValue(serviceLog);

    const updated = {
      id: serviceId,
      status: "completed",
      progressPercentage: 100,
      notes: expect.any(String),
    };
    mockPrisma.serviceLog.update.mockResolvedValue(updated);

    await employeeController.updateServiceStatus(req, res);

    expect(mockPrisma.serviceLog.update).toHaveBeenCalledWith({
      where: { id: parseInt(String(serviceId)) },
      data: expect.objectContaining({
        status: "completed",
        progressPercentage: 100,
        notes: expect.any(String),
        endTime: expect.any(Date),
      }),
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(String(serviceId));
    expect(body.data.progress).toBe(updated.progressPercentage);
  });
});
