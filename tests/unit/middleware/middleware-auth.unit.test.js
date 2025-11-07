// tests/unit/middleware/middleware-auth.unit.test.js
const {
  authenticateToken,
  authorizeRole,
} = require("../../../src/middleware/auth");
const jwt = require("jsonwebtoken");

// Mock jsonwebtoken so we control verify() behavior
jest.mock("jsonwebtoken");

describe("middleware-auth", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("authenticateToken", () => {
    test("attaches user and calls next when token is valid", () => {
      const req = { headers: { authorization: "Bearer VALID.TOKEN" } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      // jwt.verify should return payload
      jwt.verify.mockReturnValue({ userId: 1, role: "admin" });

      authenticateToken(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith(
        "VALID.TOKEN",
        process.env.JWT_SECRET
      );
      expect(req.user).toEqual({ userId: 1, role: "admin" });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test("returns 401 when no Authorization header present", () => {
      const req = { headers: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Access denied. No token provided.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    test("returns 403 when token invalid (jwt.verify throws)", () => {
      const req = { headers: { authorization: "Bearer BAD.TOKEN" } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      jwt.verify.mockImplementation(() => {
        throw new Error("invalid token");
      });

      authenticateToken(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith(
        "BAD.TOKEN",
        process.env.JWT_SECRET
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid or expired token",
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("authorizeRole", () => {
    test("calls next when user role is allowed", () => {
      const middleware = authorizeRole("admin", "manager");
      const req = { user: { role: "admin" } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test("returns 401 when req.user is not present", () => {
      const middleware = authorizeRole("admin");
      const req = {}; // no user
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
      expect(next).not.toHaveBeenCalled();
    });

    test("returns 403 when role not allowed", () => {
      const middleware = authorizeRole("admin");
      const req = { user: { role: "employee" } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Access denied. Insufficient permissions.",
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
