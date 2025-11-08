// tests/unit/controllers/project.controller.unit.test.js

// Mock Prisma so controller's `new PrismaClient()` returns our mock
const mockPrisma = {
  customer: { findUnique: jest.fn() },
  project: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  vehicle: { findFirst: jest.fn() },
};

jest.mock("@prisma/client", () => {
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

const projectController = require("../../../src/controllers/projectController");

describe("projectController (unit)", () => {
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
  // getCustomerProjects
  //
  test("getCustomerProjects: returns formatted projects when customer exists", async () => {
    const userId = 10;
    const req = makeReq({ userId });
    const res = makeRes();

    const customer = { id: 101, userId };
    mockPrisma.customer.findUnique.mockResolvedValue(customer);

    const now = new Date();
    const projects = [
      {
        id: 1,
        vehicleId: 5,
        vehicle: { year: 2018, make: "Ford", model: "Figo" },
        title: "Mod A",
        description: "Do A",
        projectType: "modification",
        status: "pending",
        priority: "medium",
        estimatedCost: "150.5",
        actualCost: "0",
        startDate: now,
        endDate: null,
        approvedBy: null,
        approvedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    mockPrisma.project.findMany.mockResolvedValue(projects);

    await projectController.getCustomerProjects(req, res);

    expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith({
      where: { userId },
    });
    expect(mockPrisma.project.findMany).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toHaveProperty("vehicleName");
    expect(body.data[0]).toHaveProperty("estimatedCost");
  });

  test("getCustomerProjects: returns 404 when customer not found", async () => {
    const req = makeReq({ userId: 999 });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await projectController.getCustomerProjects(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("getCustomerProjects: handles errors and returns 500", async () => {
    const req = makeReq({ userId: 20 });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockRejectedValue(new Error("DB boom"));

    await projectController.getCustomerProjects(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.success === false || body.error).toBeTruthy();
  });

  //
  // getProjectById
  //
  test("getProjectById: returns project when found and customer exists", async () => {
    const userId = 30;
    const projectId = 7;
    const req = makeReq({ userId, params: { projectId: String(projectId) } });
    const res = makeRes();

    const customer = { id: 201, userId };
    mockPrisma.customer.findUnique.mockResolvedValue(customer);

    const project = {
      id: projectId,
      customerId: customer.id,
      title: "X",
      vehicle: {},
      projectLogs: [],
    };
    mockPrisma.project.findFirst.mockResolvedValue(project);

    await projectController.getProjectById(req, res);

    expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith({
      where: { userId },
    });
    expect(mockPrisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.any(Object),
        include: expect.any(Object),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toBe(project);
  });

  test("getProjectById: 404 when customer not found", async () => {
    const req = makeReq({ userId: 9999, params: { projectId: "1" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await projectController.getProjectById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("getProjectById: 404 when project not found", async () => {
    const userId = 40;
    const req = makeReq({ userId, params: { projectId: "999" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 301, userId });
    mockPrisma.project.findFirst.mockResolvedValue(null);

    await projectController.getProjectById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Modification request not found",
    });
  });

  test("getProjectById: handles error returns 500", async () => {
    const userId = 42;
    const req = makeReq({ userId, params: { projectId: "2" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 401, userId });
    mockPrisma.project.findFirst.mockRejectedValue(new Error("boom"));

    await projectController.getProjectById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
  });

  //
  // createProject
  //
  test("createProject: returns 400 when missing required fields", async () => {
    const req = makeReq({
      userId: 50,
      body: { vehicleId: null, modificationDetails: null },
    });
    const res = makeRes();

    await projectController.createProject(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Vehicle and modification details are required",
    });
  });

  test("createProject: 404 when customer not found", async () => {
    const req = makeReq({
      userId: 51,
      body: {
        vehicleId: "10",
        modificationDetails: "fix",
        estimatedBudget: "100",
        title: "T",
      },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await projectController.createProject(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("createProject: 404 when vehicle not found", async () => {
    const userId = 52;
    const req = makeReq({
      userId,
      body: { vehicleId: "99", modificationDetails: "x" },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 500, userId });
    mockPrisma.vehicle.findFirst.mockResolvedValue(null);

    await projectController.createProject(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Vehicle not found",
    });
  });

  test("createProject: success creates project and returns 201 formatted data", async () => {
    const userId = 60;
    const reqBody = {
      vehicleId: "21",
      modificationDetails: "do mods",
      estimatedBudget: "250.5",
      title: "Custom",
      projectType: "upgrade",
      priority: "high",
    };
    const req = makeReq({ userId, body: reqBody });
    const res = makeRes();

    const customer = { id: 601, userId };
    mockPrisma.customer.findUnique.mockResolvedValue(customer);

    const vehicle = {
      id: parseInt(reqBody.vehicleId),
      year: 2017,
      make: "Mazda",
      model: "2",
      customerId: customer.id,
    };
    mockPrisma.vehicle.findFirst.mockResolvedValue(vehicle);

    const projectDb = {
      id: 900,
      vehicleId: vehicle.id,
      vehicle,
      title: reqBody.title,
      description: reqBody.modificationDetails,
      status: "pending",
      estimatedCost: "250.5",
      createdAt: new Date(),
    };
    mockPrisma.project.create.mockResolvedValue(projectDb);

    await projectController.createProject(req, res);

    expect(mockPrisma.project.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe(String(projectDb.id));
    expect(body.data.vehicleName).toContain(String(projectDb.vehicle.year));
  });

  test("createProject: handles DB error -> 500", async () => {
    const userId = 61;
    const req = makeReq({
      userId,
      body: { vehicleId: "2", modificationDetails: "x" },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 700, userId });
    mockPrisma.vehicle.findFirst.mockResolvedValue({ id: 2, customerId: 700 });
    mockPrisma.project.create.mockRejectedValue(new Error("DB fail"));

    await projectController.createProject(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
  });

  //
  // updateProject
  //
  test("updateProject: 404 when customer not found", async () => {
    const req = makeReq({
      userId: 80,
      params: { projectId: "1" },
      body: { title: "t" },
    });
    const res = makeRes();
    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await projectController.updateProject(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("updateProject: 404 when project not found or cannot be modified", async () => {
    const userId = 81;
    const req = makeReq({
      userId,
      params: { projectId: "999" },
      body: { title: "t" },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 800, userId });
    mockPrisma.project.findFirst.mockResolvedValue(null);

    await projectController.updateProject(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Modification request not found or cannot be modified",
    });
  });

  test("updateProject: success updates and returns 200", async () => {
    const userId = 82;
    const projectId = 123;
    const req = makeReq({
      userId,
      params: { projectId: String(projectId) },
      body: { title: "New" },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 900, userId });
    mockPrisma.project.findFirst.mockResolvedValue({
      id: projectId,
      customerId: 900,
      status: "pending",
      title: "Old",
    });
    const updated = {
      id: projectId,
      vehicle: { year: 2016, make: "Kia", model: "Rio" },
      title: "New",
    };
    mockPrisma.project.update.mockResolvedValue(updated);

    await projectController.updateProject(req, res);

    expect(mockPrisma.project.update).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("updateProject: handles DB error -> 500", async () => {
    const userId = 83;
    const projectId = 124;
    const req = makeReq({
      userId,
      params: { projectId: String(projectId) },
      body: { title: "New" },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 901, userId });
    mockPrisma.project.findFirst.mockResolvedValue({
      id: projectId,
      customerId: 901,
      status: "pending",
      title: "Old",
    });
    mockPrisma.project.update.mockRejectedValue(new Error("boom"));

    await projectController.updateProject(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
  });

  //
  // deleteProject
  //
  test("deleteProject: 404 when customer not found", async () => {
    const req = makeReq({ userId: 90, params: { projectId: "1" } });
    const res = makeRes();
    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await projectController.deleteProject(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("deleteProject: 404 when project not found or cannot be deleted", async () => {
    const userId = 91;
    const req = makeReq({ userId, params: { projectId: "999" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 1000, userId });
    mockPrisma.project.findFirst.mockResolvedValue(null);

    await projectController.deleteProject(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Modification request not found or cannot be deleted",
    });
  });

  test("deleteProject: success deletes and returns 200", async () => {
    const userId = 92;
    const projectId = 555;
    const req = makeReq({ userId, params: { projectId: String(projectId) } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 2000, userId });
    mockPrisma.project.findFirst.mockResolvedValue({
      id: projectId,
      customerId: 2000,
      status: "pending",
    });
    mockPrisma.project.delete.mockResolvedValue({});

    await projectController.deleteProject(req, res);

    expect(mockPrisma.project.delete).toHaveBeenCalledWith({
      where: { id: projectId },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Modification request deleted successfully",
    });
  });

  test("deleteProject: handles DB error -> 500", async () => {
    const userId = 93;
    const projectId = 556;
    const req = makeReq({ userId, params: { projectId: String(projectId) } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 3000, userId });
    mockPrisma.project.findFirst.mockResolvedValue({
      id: projectId,
      customerId: 3000,
      status: "pending",
    });
    mockPrisma.project.delete.mockRejectedValue(new Error("boom"));

    await projectController.deleteProject(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
  });
});
