// tests/unit/controllers/auth.controller.extra.unit.test.js

// Same mocks pattern as your existing tests
jest.mock("../../../src/models/userModel");
jest.mock("bcryptjs");
jest.mock("jsonwebtoken");

// Mock express-validator's validationResult used in controller
jest.mock("express-validator", () => ({
  validationResult: jest.fn(),
}));

const userModel = require("../../../src/models/userModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");

const authController = require("../../../src/controllers/authController");

describe("authController extra coverage (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  }

  //
  // register - validation error
  //
  test("register: returns 400 if validation errors present", async () => {
    const req = { body: {} };
    const res = makeRes();

    validationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: "error" }],
    });

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      errors: [{ msg: "error" }],
    });
  });

  test("register: returns 400 if email already exists", async () => {
    const req = { body: { email: "a@b.com", password: "pass", name: "A B" } };
    const res = makeRes();

    validationResult.mockReturnValue({ isEmpty: () => true });
    userModel.emailExists.mockResolvedValue(true);

    await authController.register(req, res);

    expect(userModel.emailExists).toHaveBeenCalledWith("a@b.com");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "User already exists with this email",
    });
  });

  test("register: successful creation returns 201 with userId and role", async () => {
    const req = {
      body: {
        email: "c@d.com",
        password: "secret",
        name: "John Doe",
        phone: "123",
      },
    };
    const res = makeRes();

    validationResult.mockReturnValue({ isEmpty: () => true });
    userModel.emailExists.mockResolvedValue(false);
    bcrypt.hash.mockResolvedValue("hashedpw");
    userModel.createUser.mockResolvedValue({ id: 77, role: "customer" });

    await authController.register(req, res);

    expect(bcrypt.hash).toHaveBeenCalledWith("secret", 12);
    expect(userModel.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "c@d.com",
        passwordHash: "hashedpw",
        firstName: "John",
        lastName: "Doe",
        phone: "123",
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "User registered successfully",
      userId: 77,
      role: "customer",
    });
  });

  test("register: 500 on DB error", async () => {
    const req = { body: { email: "err@x.com", password: "p", name: "X Y" } };
    const res = makeRes();

    validationResult.mockReturnValue({ isEmpty: () => true });
    userModel.emailExists.mockResolvedValue(false);
    bcrypt.hash.mockResolvedValue("h");
    userModel.createUser.mockRejectedValue(new Error("DB fail"));

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Registration failed. Please try again.",
    });
  });

  //
  // logout
  //
  test("logout: returns success message", async () => {
    const req = {};
    const res = makeRes();

    await authController.logout(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Logged out successfully",
    });
  });

  //
  // getProfile
  //
  test("getProfile: 404 when user not found", async () => {
    const req = { user: { userId: 5 } };
    const res = makeRes();

    userModel.findById.mockResolvedValue(null);

    await authController.getProfile(req, res);

    expect(userModel.findById).toHaveBeenCalledWith(5);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "User not found",
    });
  });

  test("getProfile: returns formatted user when customer profile exists", async () => {
    const req = { user: { userId: 6 } };
    const res = makeRes();

    const user = {
      id: 6,
      email: "u@u.com",
      role: "customer",
      customer: { firstName: "Jane", lastName: "Doe", phone: "555" },
    };
    userModel.findById.mockResolvedValue(user);

    await authController.getProfile(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      user: expect.objectContaining({
        id: 6,
        email: "u@u.com",
        role: "customer",
        name: "Jane Doe",
        phone: "555",
      }),
    });
  });

  test("getProfile: returns formatted user when employee profile exists", async () => {
    const req = { user: { userId: 7 } };
    const res = makeRes();

    const user = {
      id: 7,
      email: "e@e.com",
      role: "employee",
      employee: {
        firstName: "Emp",
        lastName: "Loyee",
        department: "Svc",
        position: "Tech",
        phone: "999",
      },
    };
    userModel.findById.mockResolvedValue(user);

    await authController.getProfile(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      user: expect.objectContaining({
        id: 7,
        email: "e@e.com",
        role: "employee",
        name: "Emp Loyee",
        phone: "999",
        profile: expect.objectContaining({
          department: "Svc",
          position: "Tech",
        }),
      }),
    });
  });

  test("getProfile: 500 on DB error", async () => {
    const req = { user: { userId: 8 } };
    const res = makeRes();

    userModel.findById.mockRejectedValue(new Error("boom"));

    await authController.getProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Failed to fetch profile",
    });
  });
});
