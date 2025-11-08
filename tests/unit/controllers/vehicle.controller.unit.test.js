// tests/unit/controllers/vehicle.controller.unit.test.js

// Mock Prisma so the controller's `new PrismaClient()` returns our mock
const mockPrisma = {
  customer: { findUnique: jest.fn() },
  vehicle: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  appointment: { findMany: jest.fn() },
  service: {},
  serviceLogs: {},
};

jest.mock("@prisma/client", () => {
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

// Mock supabaseService functions used by controller
jest.mock("../../../src/services/supabaseService", () => ({
  uploadVehicleImage: jest.fn(),
  deleteMultipleVehicleImages: jest.fn(),
}));

const {
  uploadVehicleImage,
  deleteMultipleVehicleImages,
} = require("../../../src/services/supabaseService");

const vehicleController = require("../../../src/controllers/vehicleController");

describe("vehicleController (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeReq({
    userId = 1,
    body = {},
    params = {},
    files = undefined,
  } = {}) {
    const req = { user: { userId }, body, params };
    if (files !== undefined) req.files = files;
    return req;
  }
  function makeRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  }

  //
  // getCustomerVehicles
  //
  test("getCustomerVehicles: success returns vehicles array", async () => {
    const userId = 11;
    const req = makeReq({ userId });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 100, userId });
    const vehicles = [{ id: 1 }, { id: 2 }];
    mockPrisma.vehicle.findMany.mockResolvedValue(vehicles);

    await vehicleController.getCustomerVehicles(req, res);

    expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith({
      where: { userId },
    });
    expect(mockPrisma.vehicle.findMany).toHaveBeenCalledWith({
      where: { customerId: 100 },
      orderBy: { createdAt: "desc" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toEqual(vehicles);
  });

  test("getCustomerVehicles: 404 when customer not found", async () => {
    const req = makeReq({ userId: 99 });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await vehicleController.getCustomerVehicles(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  //
  // getVehicleById
  //
  test("getVehicleById: success returns vehicle", async () => {
    const userId = 12;
    const vehicleId = "5";
    const req = makeReq({ userId, params: { vehicleId } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 200, userId });
    const vehicle = { id: 5, customerId: 200 };
    mockPrisma.vehicle.findFirst.mockResolvedValue(vehicle);

    await vehicleController.getVehicleById(req, res);

    expect(mockPrisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { id: parseInt(vehicleId), customerId: 200 },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: vehicle })
    );
  });

  test("getVehicleById: 404 when vehicle not found", async () => {
    const req = makeReq({ userId: 13, params: { vehicleId: "99" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 201, userId: 13 });
    mockPrisma.vehicle.findFirst.mockResolvedValue(null);

    await vehicleController.getVehicleById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Vehicle not found",
    });
  });

  //
  // createVehicle
  //
  test("createVehicle: 400 when missing required fields", async () => {
    const req = makeReq({
      userId: 14,
      body: { make: "", model: "", year: "" },
    });
    const res = makeRes();

    await vehicleController.createVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Make, model, and year are required",
    });
  });

  test("createVehicle: 404 when customer not found", async () => {
    const req = makeReq({
      userId: 15,
      body: { make: "A", model: "B", year: "2020" },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await vehicleController.createVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("createVehicle: success without images returns 201", async () => {
    const userId = 16;
    const req = makeReq({
      userId,
      body: { make: "Honda", model: "Civic", year: "2019", mileage: "12000" },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 300, userId });
    const created = { id: 7, make: "Honda" };
    mockPrisma.vehicle.create.mockResolvedValue(created);

    await vehicleController.createVehicle(req, res);

    expect(mockPrisma.vehicle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 300,
        make: "Honda",
        model: "Civic",
        year: 2019,
        mileage: 12000,
      }),
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Vehicle created successfully",
        data: created,
      })
    );
  });

  test("createVehicle: success with images calls uploadVehicleImage", async () => {
    const userId = 17;
    // Simulate one exteriorImage1 and an interiorImage
    const exteriorFile = {
      buffer: Buffer.from("x"),
      originalname: "e1.jpg",
      mimetype: "image/jpeg",
    };
    const interiorFile = {
      buffer: Buffer.from("y"),
      originalname: "i.jpg",
      mimetype: "image/jpeg",
    };
    const req = makeReq({
      userId,
      body: { make: "Toyota", model: "Corolla", year: "2021" },
      files: {
        exteriorImage1: [exteriorFile],
        interiorImage: [interiorFile],
      },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 400, userId });
    uploadVehicleImage.mockResolvedValueOnce("https://cdn/ex1.jpg");
    uploadVehicleImage.mockResolvedValueOnce("https://cdn/int1.jpg");

    const created = {
      id: 8,
      make: "Toyota",
      exteriorImage1: "https://cdn/ex1.jpg",
      interiorImage: "https://cdn/int1.jpg",
    };
    mockPrisma.vehicle.create.mockResolvedValue(created);

    await vehicleController.createVehicle(req, res);

    expect(uploadVehicleImage).toHaveBeenCalledTimes(2);
    expect(mockPrisma.vehicle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 400,
        make: "Toyota",
        exteriorImage1: "https://cdn/ex1.jpg",
        interiorImage: "https://cdn/int1.jpg",
      }),
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: created })
    );
  });

  test("createVehicle: 500 when image upload fails", async () => {
    const userId = 18;
    const file = {
      buffer: Buffer.from("x"),
      originalname: "e1.jpg",
      mimetype: "image/jpeg",
    };
    const req = makeReq({
      userId,
      body: { make: "Mazda", model: "3", year: "2020" },
      files: { exteriorImage1: [file] },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 500, userId });
    uploadVehicleImage.mockRejectedValue(new Error("upload failed"));

    await vehicleController.createVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Failed to upload images",
    });
  });

  //
  // updateVehicle
  //
  test("updateVehicle: 404 when customer not found", async () => {
    const req = makeReq({
      userId: 19,
      params: { vehicleId: "1" },
      body: { make: "X" },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await vehicleController.updateVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("updateVehicle: 404 when vehicle not found", async () => {
    const userId = 20;
    const req = makeReq({
      userId,
      params: { vehicleId: "2" },
      body: { make: "Y" },
    });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 600, userId });
    mockPrisma.vehicle.findFirst.mockResolvedValue(null);

    await vehicleController.updateVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Vehicle not found",
    });
  });

  test("updateVehicle: success updates and returns 200", async () => {
    const userId = 21;
    const vehicleId = "3";
    const req = makeReq({
      userId,
      params: { vehicleId },
      body: { make: "NewMake", mileage: "5000" },
    });
    const res = makeRes();

    const existing = {
      id: 3,
      make: "Old",
      model: "M",
      year: 2015,
      mileage: 10000,
      customerId: 700,
    };
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 700, userId });
    mockPrisma.vehicle.findFirst.mockResolvedValue(existing);

    const updated = { ...existing, make: "NewMake", mileage: 5000 };
    mockPrisma.vehicle.update.mockResolvedValue(updated);

    await vehicleController.updateVehicle(req, res);

    expect(mockPrisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: parseInt(vehicleId) },
      data: expect.objectContaining({
        make: "NewMake",
        mileage: 5000,
      }),
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: updated })
    );
  });

  //
  // deleteVehicle
  //
  test("deleteVehicle: 404 when customer not found", async () => {
    const req = makeReq({ userId: 22, params: { vehicleId: "10" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await vehicleController.deleteVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("deleteVehicle: 404 when vehicle not found", async () => {
    const userId = 23;
    const req = makeReq({ userId, params: { vehicleId: "11" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 800, userId });
    mockPrisma.vehicle.findFirst.mockResolvedValue(null);

    await vehicleController.deleteVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Vehicle not found",
    });
  });

  test("deleteVehicle: success deletes images and vehicle", async () => {
    const userId = 24;
    const vehicleId = "12";
    const req = makeReq({ userId, params: { vehicleId } });
    const res = makeRes();

    const vehicle = {
      id: 12,
      customerId: 900,
      exteriorImage1: "https://cdn/e1.jpg",
      exteriorImage2: null,
      interiorImage: "https://cdn/i1.jpg",
    };

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 900, userId });
    mockPrisma.vehicle.findFirst.mockResolvedValue(vehicle);
    deleteMultipleVehicleImages.mockResolvedValue(true);
    mockPrisma.vehicle.delete.mockResolvedValue({});

    await vehicleController.deleteVehicle(req, res);

    expect(deleteMultipleVehicleImages).toHaveBeenCalledWith([
      "https://cdn/e1.jpg",
      "https://cdn/i1.jpg",
    ]);
    expect(mockPrisma.vehicle.delete).toHaveBeenCalledWith({
      where: { id: parseInt(vehicleId) },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Vehicle deleted successfully",
    });
  });

  //
  // getVehicleServiceHistory
  //
  test("getVehicleServiceHistory: 404 when customer not found", async () => {
    const req = makeReq({ userId: 25, params: { vehicleId: "2" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await vehicleController.getVehicleServiceHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("getVehicleServiceHistory: 404 when vehicle not found", async () => {
    const userId = 26;
    const req = makeReq({ userId, params: { vehicleId: "3" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 1000, userId });
    mockPrisma.vehicle.findFirst.mockResolvedValue(null);

    await vehicleController.getVehicleServiceHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Vehicle not found",
    });
  });

  test("getVehicleServiceHistory: success returns appointments", async () => {
    const userId = 27;
    const vehicleId = "4";
    const req = makeReq({ userId, params: { vehicleId } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 1100, userId });
    mockPrisma.vehicle.findFirst.mockResolvedValue({ id: 4, customerId: 1100 });

    const appointments = [
      { id: 1, vehicleId: 4 },
      { id: 2, vehicleId: 4 },
    ];
    mockPrisma.appointment.findMany.mockResolvedValue(appointments);

    await vehicleController.getVehicleServiceHistory(req, res);

    expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith({
      where: { vehicleId: parseInt(vehicleId) },
      include: {
        service: true,
        serviceLogs: {
          include: {
            employee: {
              include: {
                user: { select: { email: true } },
              },
            },
          },
        },
      },
      orderBy: { scheduledDate: "desc" },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: appointments })
    );
  });

  //
  // getVehicleImages
  //
  test("getVehicleImages: 404 when customer not found", async () => {
    const req = makeReq({ userId: 28, params: { vehicleId: "7" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue(null);

    await vehicleController.getVehicleImages(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Customer profile not found",
    });
  });

  test("getVehicleImages: 404 when vehicle not found", async () => {
    const userId = 29;
    const req = makeReq({ userId, params: { vehicleId: "8" } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 1200, userId });
    mockPrisma.vehicle.findFirst.mockResolvedValue(null);

    await vehicleController.getVehicleImages(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Vehicle not found",
    });
  });

  test("getVehicleImages: success returns image list", async () => {
    const userId = 30;
    const vehicleId = "9";
    const req = makeReq({ userId, params: { vehicleId } });
    const res = makeRes();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: 1300, userId });
    mockPrisma.vehicle.findFirst.mockResolvedValue({
      exteriorImage1: "https://cdn/e1.jpg",
      exteriorImage2: null,
      interiorImage: "https://cdn/i1.jpg",
    });

    await vehicleController.getVehicleImages(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: {
          exteriorImages: ["https://cdn/e1.jpg"],
          interiorImage: "https://cdn/i1.jpg",
        },
      })
    );
  });
});
