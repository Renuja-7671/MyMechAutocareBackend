// tests/unit/controllers/auth.register.unit.test.js

// Mock userModel used by the controller (match actual API: createUser, emailExists)
jest.mock("../../../src/models/userModel", () => {
  return {
    createUser: jest.fn(),
    emailExists: jest.fn(),
  };
});

// Mock bcryptjs
jest.mock("bcryptjs", () => {
  return {
    hash: jest.fn(),
    compare: jest.fn(),
  };
});

// Mock express-validator
jest.mock("express-validator", () => {
  return {
    validationResult: jest.fn(),
  };
});

const authController = require("../../../src/controllers/authController");
const userModel = require("../../../src/models/userModel");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");

describe("authController.register (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  }

  test("successful register -> responds with 201 and userId", async () => {
    const req = {
      body: {
        email: "new.user@example.com",
        password: "pass1234",
        role: "customer",
        firstName: "New",
        lastName: "User",
      },
    };
    const res = makeRes();

    // Arrange mocks
    validationResult.mockReturnValue({ isEmpty: () => true, array: () => [] });
    userModel.emailExists.mockResolvedValue(false);
    bcrypt.hash.mockResolvedValue("hashedPassword123");

    // controller ultimately calls createUser and the controller responds with { userId: id }
    const createdUser = {
      id: 42,
      email: req.body.email,
      role: req.body.role,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
    };
    userModel.createUser.mockResolvedValue(createdUser);

    // Act
    await authController.register(req, res);

    // Assert important behaviors (do not over-specify internal shapes)
    expect(validationResult).toHaveBeenCalledWith(req);
    expect(userModel.emailExists).toHaveBeenCalledWith(req.body.email);
    expect(bcrypt.hash).toHaveBeenCalledWith(
      req.body.password,
      expect.any(Number)
    );
    expect(userModel.createUser).toHaveBeenCalled();

    // Controller responds with userId (match actual controller behavior)
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "User registered successfully",
      userId: createdUser.id,
    });
  });

  test("validation fails -> responds with 400 and errors array", async () => {
    const req = { body: { email: "bad", password: "123" } };
    const res = makeRes();

    const fakeErrors = [{ msg: "Invalid email", param: "email" }];
    validationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => fakeErrors,
    });

    await authController.register(req, res);

    expect(validationResult).toHaveBeenCalledWith(req);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      errors: fakeErrors,
    });

    expect(userModel.createUser).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  test("email already exists -> responds with 400 and controller message", async () => {
    const req = {
      body: {
        email: "exists@example.com",
        password: "abc123",
      },
    };
    const res = makeRes();

    validationResult.mockReturnValue({ isEmpty: () => true, array: () => [] });
    userModel.emailExists.mockResolvedValue(true);

    await authController.register(req, res);

    expect(userModel.emailExists).toHaveBeenCalledWith(req.body.email);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "User already exists with this email",
    });
    expect(userModel.createUser).not.toHaveBeenCalled();
  });

  test("error during create -> responds with 500 and controller's message", async () => {
    const req = {
      body: {
        email: "error.user@example.com",
        password: "pass1234",
        role: "customer",
        firstName: "Error",
        lastName: "User",
      },
    };
    const res = makeRes();

    validationResult.mockReturnValue({ isEmpty: () => true, array: () => [] });
    userModel.emailExists.mockResolvedValue(false);
    bcrypt.hash.mockResolvedValue("hashedPassword123");
    userModel.createUser.mockRejectedValue(new Error("DB failure"));

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Registration failed. Please try again.",
    });
  });
});
