// tests/unit/models/userModel.unit.test.js

// Import the module under test
const userModel = require("../../../src/models/userModel");

// Mock the prisma client module that userModel imports
jest.mock("../../../src/config/database", () => {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    customer: { create: jest.fn() },
    employee: { create: jest.fn() },
    $transaction: jest.fn(),
  };
});

const prisma = require("../../../src/config/database");

describe("userModel (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("findByEmail", () => {
    test("calls prisma.user.findUnique with include and returns user", async () => {
      const fakeUser = { id: 1, email: "a@b.com" };
      prisma.user.findUnique.mockResolvedValue(fakeUser);

      const res = await userModel.findByEmail("a@b.com");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "a@b.com" },
        include: { customer: true, employee: true },
      });
      expect(res).toBe(fakeUser);
    });
  });

  describe("findById", () => {
    test("calls prisma.user.findUnique with select and returns user", async () => {
      const fakeUser = {
        id: 2,
        email: "x@y.com",
        role: "customer",
        isActive: true,
      };
      prisma.user.findUnique.mockResolvedValue(fakeUser);

      const res = await userModel.findById(2);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 2 },
        select: expect.any(Object),
      });
      expect(res).toBe(fakeUser);
    });
  });

  describe("emailExists", () => {
    test("returns true if user found", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 7 });
      const exists = await userModel.emailExists("test@example.com");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
        select: { id: true },
      });
      expect(exists).toBe(true);
    });

    test("returns false if user not found", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const exists = await userModel.emailExists("noone@example.com");
      expect(exists).toBe(false);
    });
  });

  describe("createUser", () => {
    test("creates user and customer profile when role is customer", async () => {
      const createdUser = { id: 11, email: "cust@example.com" };

      // Make $transaction call the provided callback with a mock tx object
      prisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          user: { create: jest.fn().mockResolvedValue(createdUser) },
          customer: { create: jest.fn().mockResolvedValue({ id: 100 }) },
          employee: { create: jest.fn().mockResolvedValue({ id: 200 }) },
        };
        return cb(tx);
      });

      const payload = {
        email: "cust@example.com",
        passwordHash: "hashed",
        role: "customer",
        firstName: "Foo",
        lastName: "Bar",
        phone: "123",
        address: "addr",
      };

      const res = await userModel.createUser(payload);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(res).toBe(createdUser);
    });

    test("creates user and employee profile when role is employee", async () => {
      const createdUser = { id: 12, email: "emp@example.com" };

      prisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          user: { create: jest.fn().mockResolvedValue(createdUser) },
          customer: { create: jest.fn().mockResolvedValue({ id: 100 }) },
          employee: { create: jest.fn().mockResolvedValue({ id: 201 }) },
        };
        return cb(tx);
      });

      const payload = {
        email: "emp@example.com",
        passwordHash: "hashed",
        role: "employee",
        firstName: "E",
        lastName: "M",
        phone: "555",
        department: "service",
        position: "tech",
      };

      const res = await userModel.createUser(payload);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(res).toBe(createdUser);
    });
  });
});
