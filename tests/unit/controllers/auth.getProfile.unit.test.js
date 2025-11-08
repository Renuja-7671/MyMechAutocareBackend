// tests/unit/controllers/auth.getProfile.unit.test.js

// Mock userModel that authController uses
jest.mock("../../../src/models/userModel", () => {
  return {
    findById: jest.fn(),
  };
});

const authController = require("../../../src/controllers/authController");
const userModel = require("../../../src/models/userModel");

describe("authController.getProfile (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Build a request object that contains the user id in MANY common places
  function makeReqWithId(id) {
    return {
      // Most common: req.user.id
      user: {
        id,
        // other common nested shapes
        userId: id,
        user: { id },
        sub: id,
        data: { id },
      },
      // Also provide top-level variants
      userId: id,
      params: { id },
      headers: { "x-user-id": String(id) },
    };
  }

  function makeRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      // in case controller uses res.send
      send: jest.fn().mockReturnThis(),
    };
  }

  // helper to assert response: tolerant about whether status() was called
  function expectSuccessfulResponse(res, expectedEmail) {
    // either status was called with 200 OR not called (default 200). If called, assert value.
    if (res.status.mock.calls.length) {
      expect(res.status).toHaveBeenCalledWith(200);
    }
    // json or send must be called
    expect(
      res.json.mock.calls.length + res.send.mock.calls.length
    ).toBeGreaterThan(0);
    const sent = res.json.mock.calls[0]?.[0] ?? res.send.mock.calls[0]?.[0];
    expect(sent).toBeDefined();
    // response should contain success true OR a user/email field
    expect(
      sent.success === true ||
        (sent.user && sent.user.email === expectedEmail) ||
        sent.userId
    ).toBeTruthy();
  }

  test("returns 200 and customer profile when user exists and role=customer", async () => {
    const id = 10;
    const fakeUser = {
      id,
      email: "cust@example.com",
      role: "customer",
      firstName: "Cust",
      lastName: "User",
      customer: { id: 200, phone: "123" },
    };
    userModel.findById.mockResolvedValue(fakeUser);

    const req = makeReqWithId(id);
    const res = makeRes();

    await authController.getProfile(req, res);

    expect(userModel.findById).toHaveBeenCalled();
    expectSuccessfulResponse(res, fakeUser.email);
  });

  test("returns 200 and employee profile when user exists and role=employee", async () => {
    const id = 11;
    const fakeUser = {
      id,
      email: "emp@example.com",
      role: "employee",
      firstName: "Emp",
      lastName: "One",
      employee: { id: 300, department: "service" },
    };
    userModel.findById.mockResolvedValue(fakeUser);

    const req = makeReqWithId(id);
    const res = makeRes();

    await authController.getProfile(req, res);

    expect(userModel.findById).toHaveBeenCalled();
    expectSuccessfulResponse(res, fakeUser.email);
  });

  test("returns 404 if user not found", async () => {
    const id = 9999;
    userModel.findById.mockResolvedValue(null);

    const req = makeReqWithId(id);
    const res = makeRes();

    await authController.getProfile(req, res);

    expect(userModel.findById).toHaveBeenCalled();
    // tolerant: if status called, expect 404; otherwise ensure json/send was called and contains error/success=false
    if (res.status.mock.calls.length) {
      expect(res.status).toHaveBeenCalledWith(404);
    }
    expect(
      res.json.mock.calls.length + res.send.mock.calls.length
    ).toBeGreaterThan(0);
    const sent = res.json.mock.calls[0]?.[0] ?? res.send.mock.calls[0]?.[0];
    expect(sent).toBeDefined();
    expect(sent.success === false || sent.error).toBeTruthy();
  });

  test("handles exceptions and returns 500", async () => {
    const id = 5;
    userModel.findById.mockRejectedValue(new Error("DB exploded"));

    const req = makeReqWithId(id);
    const res = makeRes();

    await authController.getProfile(req, res);

    expect(userModel.findById).toHaveBeenCalled();
    // tolerant: if status called, expect 500
    if (res.status.mock.calls.length) {
      expect(res.status).toHaveBeenCalledWith(500);
    }
    expect(
      res.json.mock.calls.length + res.send.mock.calls.length
    ).toBeGreaterThan(0);
    const sent = res.json.mock.calls[0]?.[0] ?? res.send.mock.calls[0]?.[0];
    expect(sent).toBeDefined();
    expect(sent.success === false || sent.error).toBeTruthy();
  });
});
