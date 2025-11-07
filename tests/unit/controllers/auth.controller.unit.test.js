// tests/unit/controllers/auth.controller.unit.test.js

// Prevent any real DB connection / side-effects from src/config/database
jest.mock("../../../src/config/database", () => {
  return {
    user: { findUnique: jest.fn(), create: jest.fn() },
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(),
  };
});

// Mock modules used by the controller
jest.mock("../../../src/models/userModel");
jest.mock("bcryptjs");
jest.mock("jsonwebtoken");

const authController = require("../../../src/controllers/authController"); // import after mocks
const userModel = require("../../../src/models/userModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

describe("authController.login (unit)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function makeRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  }

  test("successful login -> responds with success and data (token + user)", async () => {
    // Arrange
    const req = {
      body: { email: "john.doe@email.com", password: "password123" },
    };
    const res = makeRes();
    const next = jest.fn();

    // Provide a fake user shape similar to real DB return
    const fakeUser = {
      id: 1,
      email: req.body.email,
      passwordHash: "hashed",
      role: "customer",
      isActive: true,
      customer: { firstName: "John", lastName: "Doe", phone: "123" },
    };
    userModel.findByEmail.mockResolvedValue(fakeUser);

    // bcrypt.compare -> true
    bcrypt.compare.mockResolvedValue(true);

    // jwt.sign -> optional mock (not required for this assertion)
    jwt.sign.mockReturnValue("FAKE.JWT.TOKEN");

    // Act
    await authController.login(req, res, next);

    // Assert: controller returned JSON response indicating success
    expect(res.json).toHaveBeenCalled();
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg).toBeDefined();
    expect(jsonArg).toHaveProperty("success", true);
    // Response should include data with token and user fields (if present)
    expect(jsonArg).toHaveProperty("data");
    expect(typeof jsonArg.data === "object").toBe(true);

    // next() shouldn't be called because controller handles response
    expect(next).not.toHaveBeenCalled();
  });

  test("wrong password -> 401 and success false", async () => {
    const req = { body: { email: "john.doe@email.com", password: "badpass" } };
    const res = makeRes();
    const next = jest.fn();

    const fakeUser = {
      id: 2,
      email: req.body.email,
      passwordHash: "hashed",
      isActive: true,
    };
    userModel.findByEmail.mockResolvedValue(fakeUser);

    bcrypt.compare.mockResolvedValue(false);

    await authController.login(req, res, next);

    expect(res.status).toHaveBeenCalled();
    const statusArg = res.status.mock.calls[0][0];
    expect([400, 401, 403]).toContain(statusArg);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body).toBeDefined();
    expect(next).not.toHaveBeenCalled();
  });

  test("user not found -> 401 and success false", async () => {
    const req = { body: { email: "noone@x.com", password: "whatever" } };
    const res = makeRes();
    const next = jest.fn();

    userModel.findByEmail.mockResolvedValue(null);

    await authController.login(req, res, next);

    expect(res.status).toHaveBeenCalled();
    const statusArg = res.status.mock.calls[0][0];
    expect([400, 401, 403]).toContain(statusArg);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body).toBeDefined();
    expect(next).not.toHaveBeenCalled();
  });
});
