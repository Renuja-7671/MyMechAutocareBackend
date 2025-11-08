// Mock everything FIRST
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    customer: { 
      count: jest.fn(), 
      findMany: jest.fn(), 
      create: jest.fn() 
    },
    employee: {
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    serviceLog: {
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    appointment: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    project: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma)
  };
});

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}));

// Mock console methods to avoid cluttering test output
const mockConsole = {
  error: jest.fn(),
  log: jest.fn(),
};
global.console = mockConsole;

// Now require the controller
const adminController = require('../../../src/controllers/adminController');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const makeReq = (overrides = {}) => ({
  params: {},
  body: {},
  query: {},
  user: { userId: 1 },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ==================== getDashboardStats ====================
describe('getDashboardStats', () => {
  test('should return all dashboard stats successfully', async () => {
    const req = makeReq();
    const res = makeRes();

    prisma.customer.count.mockResolvedValue(10);
    prisma.employee.count.mockResolvedValue(5);
    prisma.serviceLog.count
      .mockResolvedValueOnce(3) // in_progress
      .mockResolvedValueOnce(7); // completed
    prisma.appointment.count.mockResolvedValue(4);
    prisma.project.aggregate.mockResolvedValue({
      _sum: { actualCost: 25000 },
    });

    await adminController.getDashboardStats(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        totalCustomers: 10,
        totalEmployees: 5,
        activeServices: 3,
        completedServices: 7,
        pendingAppointments: 4,
        revenue: 25000,
      },
    });
  });

  test('should handle zero revenue', async () => {
    const req = makeReq();
    const res = makeRes();

    prisma.customer.count.mockResolvedValue(5);
    prisma.employee.count.mockResolvedValue(2);
    prisma.serviceLog.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    prisma.appointment.count.mockResolvedValue(3);
    prisma.project.aggregate.mockResolvedValue({
      _sum: { actualCost: null },
    });

    await adminController.getDashboardStats(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        revenue: 0,
      }),
    });
  });

  test('should handle Prisma error', async () => {
    const req = makeReq();
    const res = makeRes();
    prisma.customer.count.mockRejectedValue(new Error('DB failed'));
    
    await adminController.getDashboardStats(req, res);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to fetch dashboard statistics',
    });
  });
});

// ==================== getAllUsers ====================
describe('getAllUsers', () => {
  test('should format and return user list with customer profile', async () => {
    const req = makeReq();
    const res = makeRes();
    
    const mockUsers = [
      {
        id: 1,
        email: 'customer@test.com',
        role: 'customer',
        isActive: true,
        createdAt: new Date(),
        customer: {
          id: 1,
          firstName: 'John',
          lastName: 'Customer',
          phone: '123',
        },
        employee: null,
      },
      {
        id: 2,
        email: 'employee@test.com',
        role: 'employee',
        isActive: true,
        createdAt: new Date(),
        customer: null,
        employee: {
          id: 99,
          firstName: 'Jane',
          lastName: 'Employee',
          phone: '456',
          position: 'Tech',
        },
      },
    ];
    
    prisma.user.findMany.mockResolvedValue(mockUsers);
    
    await adminController.getAllUsers(req, res);
    
    expect(prisma.user.findMany).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          id: '1',
          name: 'John Customer',
          role: 'customer',
        }),
        expect.objectContaining({
          id: '2',
          name: 'Jane Employee',
          role: 'employee',
          position: 'Tech',
        }),
      ]),
    });
  });

  test('should handle user with no profile', async () => {
    const req = makeReq();
    const res = makeRes();
    
    const mockUsers = [
      {
        id: 1,
        email: 'test@test.com',
        role: 'customer',
        isActive: true,
        createdAt: new Date(),
        customer: null,
        employee: null,
      },
    ];
    
    prisma.user.findMany.mockResolvedValue(mockUsers);
    
    await adminController.getAllUsers(req, res);
    
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          name: 'No Name',
          phone: '',
        }),
      ]),
    });
  });

  test('should handle DB error', async () => {
    const req = makeReq();
    const res = makeRes();
    prisma.user.findMany.mockRejectedValue(new Error('fail'));
    
    await adminController.getAllUsers(req, res);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to fetch users',
    });
  });
});

// ==================== updateUserRole ====================
describe('updateUserRole', () => {
  test('should update role from customer to employee successfully', async () => {
    const req = makeReq({ 
      params: { userId: '1' }, 
      body: { role: 'employee' } 
    });
    const res = makeRes();

    prisma.user.findUnique.mockResolvedValue({
      id: 1,
      role: 'customer',
      customer: { firstName: 'John', lastName: 'Doe', phone: '123' },
      employee: null,
    });
    prisma.employee.create.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({ id: 1, role: 'employee' });

    await adminController.updateUserRole(req, res);
    
    expect(prisma.employee.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'User role updated successfully',
      data: expect.any(Object),
    });
  });

  test('should update role from employee to customer successfully', async () => {
    const req = makeReq({ 
      params: { userId: '1' }, 
      body: { role: 'customer' } 
    });
    const res = makeRes();

    prisma.user.findUnique.mockResolvedValue({
      id: 1,
      role: 'employee',
      customer: null,
      employee: { firstName: 'Jane', lastName: 'Smith', phone: '456' },
    });
    prisma.customer.create.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({ id: 1, role: 'customer' });

    await adminController.updateUserRole(req, res);
    
    expect(prisma.customer.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('should update role without profile creation when same role', async () => {
    const req = makeReq({ 
      params: { userId: '1' }, 
      body: { role: 'admin' } 
    });
    const res = makeRes();

    prisma.user.findUnique.mockResolvedValue({
      id: 1,
      role: 'customer',
      customer: { firstName: 'John', lastName: 'Doe', phone: '123' },
      employee: null,
    });
    prisma.user.update.mockResolvedValue({ id: 1, role: 'admin' });

    await adminController.updateUserRole(req, res);
    
    expect(prisma.employee.create).not.toHaveBeenCalled();
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('should return 400 for invalid role', async () => {
    const req = makeReq({ 
      params: { userId: '1' }, 
      body: { role: 'invalid' } 
    });
    const res = makeRes();
    
    await adminController.updateUserRole(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid role. Must be customer, employee, or admin',
    });
  });

  test('should return 404 for user not found', async () => {
    const req = makeReq({ 
      params: { userId: '1' }, 
      body: { role: 'employee' } 
    });
    const res = makeRes();
    prisma.user.findUnique.mockResolvedValue(null);
    
    await adminController.updateUserRole(req, res);
    
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User not found',
    });
  });

  test('should handle database errors', async () => {
    const req = makeReq({ 
      params: { userId: '1' }, 
      body: { role: 'employee' } 
    });
    const res = makeRes();
    prisma.user.findUnique.mockRejectedValue(new Error('DB error'));
    
    await adminController.updateUserRole(req, res);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to update user role',
    });
  });
});

// ==================== deleteUser ====================
describe('deleteUser', () => {
  test('should delete non-admin user', async () => {
    const req = makeReq({ params: { userId: '1' } });
    const res = makeRes();
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'employee' });
    prisma.user.delete.mockResolvedValue({});
    
    await adminController.deleteUser(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'User deleted successfully',
    });
  });

  test('should not delete last admin', async () => {
    const req = makeReq({ params: { userId: '2' } });
    const res = makeRes();
    prisma.user.findUnique.mockResolvedValue({ id: 2, role: 'admin' });
    prisma.user.count.mockResolvedValue(1);
    
    await adminController.deleteUser(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot delete the last admin user',
    });
  });

  test('should allow deleting admin when multiple admins exist', async () => {
    const req = makeReq({ params: { userId: '2' } });
    const res = makeRes();
    prisma.user.findUnique.mockResolvedValue({ id: 2, role: 'admin' });
    prisma.user.count.mockResolvedValue(3); // Multiple admins
    
    await adminController.deleteUser(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(prisma.user.delete).toHaveBeenCalled();
  });

  test('should return 404 if user not found', async () => {
    const req = makeReq({ params: { userId: '3' } });
    const res = makeRes();
    prisma.user.findUnique.mockResolvedValue(null);
    
    await adminController.deleteUser(req, res);
    
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User not found',
    });
  });

  test('should handle database errors', async () => {
    const req = makeReq({ params: { userId: '1' } });
    const res = makeRes();
    prisma.user.findUnique.mockRejectedValue(new Error('DB error'));
    
    await adminController.deleteUser(req, res);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to delete user',
    });
  });
});

// ==================== getAllServices ====================
describe('getAllServices', () => {
  test('should return formatted services with service logs', async () => {
    const req = makeReq();
    const res = makeRes();
    
    const mockAppointments = [
      {
        id: 1,
        customer: { firstName: 'A', lastName: 'B' },
        vehicle: { make: 'Honda', model: 'Civic', year: 2020 },
        service: { name: 'Oil Change' },
        serviceLogs: [
          {
            status: 'in_progress',
            progressPercentage: 20,
            employee: { id: 1, firstName: 'X', lastName: 'Y' },
          },
        ],
        scheduledDate: new Date(),
      },
    ];
    
    prisma.appointment.findMany.mockResolvedValue(mockAppointments);
    
    await adminController.getAllServices(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          id: '1',
          customerName: 'A B',
          vehicleName: '2020 Honda Civic',
          serviceType: 'Oil Change',
          status: 'in_progress',
          progress: 20,
        }),
      ]),
    });
  });

  test('should handle services without service logs', async () => {
    const req = makeReq();
    const res = makeRes();
    
    const mockAppointments = [
      {
        id: 1,
        customer: { firstName: 'A', lastName: 'B' },
        vehicle: { make: 'Honda', model: 'Civic', year: 2020 },
        service: null,
        serviceLogs: [],
        scheduledDate: new Date(),
      },
    ];
    
    prisma.appointment.findMany.mockResolvedValue(mockAppointments);
    
    await adminController.getAllServices(req, res);
    
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          status: 'not_started',
          progress: 0,
          assignedEmployee: null,
          serviceType: 'General Service',
        }),
      ]),
    });
  });

  test('should handle database errors', async () => {
    const req = makeReq();
    const res = makeRes();
    prisma.appointment.findMany.mockRejectedValue(new Error('DB error'));
    
    await adminController.getAllServices(req, res);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to fetch services',
    });
  });
});

// ==================== assignServiceToEmployee ====================
describe('assignServiceToEmployee', () => {
  test('should return 400 if employeeId missing', async () => {
    const req = makeReq({ 
      params: { serviceId: '1' }, 
      body: {} 
    });
    const res = makeRes();
    
    await adminController.assignServiceToEmployee(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Employee ID is required',
    });
  });

  test('should assign employee successfully (create new log)', async () => {
    const req = makeReq({ 
      params: { serviceId: '1' }, 
      body: { employeeId: '2' } 
    });
    const res = makeRes();

    prisma.appointment.findUnique.mockResolvedValue({
      id: 1,
      status: 'scheduled',
    });
    prisma.employee.findUnique.mockResolvedValue({ id: 2 });
    prisma.serviceLog.findFirst.mockResolvedValue(null);
    prisma.serviceLog.create.mockResolvedValue({ id: 1 });
    prisma.appointment.update.mockResolvedValue({});
    
    await adminController.assignServiceToEmployee(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Employee assigned successfully',
      data: expect.any(Object),
    });
    expect(prisma.appointment.update).toHaveBeenCalled();
  });

  test('should reassign employee if service log already exists', async () => {
    const req = makeReq({ 
      params: { serviceId: '1' }, 
      body: { employeeId: '2' } 
    });
    const res = makeRes();

    prisma.appointment.findUnique.mockResolvedValue({
      id: 1,
      status: 'confirmed',
    });
    prisma.employee.findUnique.mockResolvedValue({ id: 2 });
    prisma.serviceLog.findFirst.mockResolvedValue({ 
      id: 5, 
      appointmentId: 1, 
      employeeId: 3 
    });
    prisma.serviceLog.update.mockResolvedValue({ id: 5, employeeId: 2 });
    
    await adminController.assignServiceToEmployee(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Employee reassigned successfully',
      data: expect.any(Object),
    });
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  test('should return 404 if appointment not found', async () => {
    const req = makeReq({ 
      params: { serviceId: '999' }, 
      body: { employeeId: '2' } 
    });
    const res = makeRes();
    prisma.appointment.findUnique.mockResolvedValue(null);
    
    await adminController.assignServiceToEmployee(req, res);
    
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Appointment not found',
    });
  });

  test('should return 404 if employee not found', async () => {
    const req = makeReq({ 
      params: { serviceId: '1' }, 
      body: { employeeId: '999' } 
    });
    const res = makeRes();
    prisma.appointment.findUnique.mockResolvedValue({ id: 1 });
    prisma.employee.findUnique.mockResolvedValue(null);
    
    await adminController.assignServiceToEmployee(req, res);
    
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Employee not found',
    });
  });

  test('should handle database errors', async () => {
    const req = makeReq({ 
      params: { serviceId: '1' }, 
      body: { employeeId: '2' } 
    });
    const res = makeRes();
    prisma.appointment.findUnique.mockRejectedValue(new Error('DB error'));
    
    await adminController.assignServiceToEmployee(req, res);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to assign employee to service',
    });
  });
});

// ==================== getReports ====================
describe('getReports', () => {
  test('should return 400 if missing query parameters', async () => {
    const req = makeReq({ query: {} });
    const res = makeRes();
    
    await adminController.getReports(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Report type, start date, and end date are required',
    });
  });

  test('should return revenue report', async () => {
    const req = makeReq({
      query: {
        type: 'revenue',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
    });
    const res = makeRes();
    
    prisma.project.findMany.mockResolvedValue([
      { actualCost: 100 },
      { actualCost: 50 },
    ]);
    
    await adminController.getReports(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        totalAmount: 150,
        totalRecords: 2,
        average: 75,
      }),
    });
  });

  test('should return employees report', async () => {
    const req = makeReq({
      query: {
        type: 'employees',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
    });
    const res = makeRes();
    
    prisma.serviceLog.findMany.mockResolvedValue([
      { hoursWorked: 8 },
      { hoursWorked: 6 },
    ]);
    
    await adminController.getReports(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        totalAmount: 14,
        totalRecords: 2,
        average: 7,
      }),
    });
  });

  test('should return services report', async () => {
    const req = makeReq({
      query: {
        type: 'services',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
    });
    const res = makeRes();
    
    prisma.appointment.findMany.mockResolvedValue([
      { service: { name: 'Oil Change' } },
      { service: { name: 'Brake Service' } },
    ]);
    
    await adminController.getReports(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        totalRecords: 2,
        totalAmount: 0,
      }),
    });
  });

  test('should return customers report', async () => {
    const req = makeReq({
      query: {
        type: 'customers',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
    });
    const res = makeRes();
    
    prisma.customer.findMany.mockResolvedValue([
      { id: 1, firstName: 'John' },
      { id: 2, firstName: 'Jane' },
    ]);
    
    await adminController.getReports(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        totalRecords: 2,
        totalAmount: 0,
      }),
    });
  });

  test('should return 400 for invalid report type', async () => {
    const req = makeReq({
      query: {
        type: 'invalid',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
    });
    const res = makeRes();
    
    await adminController.getReports(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid report type',
    });
  });

  test('should handle database errors', async () => {
    const req = makeReq({
      query: {
        type: 'revenue',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
    });
    const res = makeRes();
    
    prisma.project.findMany.mockRejectedValue(new Error('DB error'));
    
    await adminController.getReports(req, res);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to generate report',
    });
  });
});

// ==================== createEmployee ====================
describe('createEmployee', () => {
  test('should return 400 if missing required fields', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    
    await adminController.createEmployee(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Email, password, first name, last name, and phone are required',
    });
  });

  test('should return 400 if email already exists', async () => {
    const req = makeReq({
      body: {
        email: 'existing@test.com',
        password: '123',
        firstName: 'a',
        lastName: 'b',
        phone: '1',
      },
    });
    const res = makeRes();

    prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'existing@test.com' });
    
    await adminController.createEmployee(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'A user with this email already exists',
    });
  });

  test('should create employee successfully', async () => {
    const req = makeReq({
      body: {
        email: 'x@test.com',
        password: '123',
        firstName: 'a',
        lastName: 'b',
        phone: '1',
        position: 'Tech',
      },
    });
    const res = makeRes();

    prisma.user.findUnique.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed');
    
    // Mock transaction properly
    prisma.$transaction.mockImplementation(async (callback) => {
      const mockTx = {
        user: {
          create: jest.fn().mockResolvedValue({
            id: 1,
            email: 'x@test.com',
            role: 'employee',
          }),
        },
        employee: {
          create: jest.fn().mockResolvedValue({
            id: 2,
            firstName: 'a',
            lastName: 'b',
            phone: '1',
            position: 'Tech',
            userId: 1,
          }),
        },
      };
      return callback(mockTx);
    });

    await adminController.createEmployee(req, res);
    
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Employee created successfully',
      data: expect.objectContaining({
        email: 'x@test.com',
        role: 'employee',
        firstName: 'a',
        lastName: 'b',
      }),
    });
  });

  test('should create employee with default position', async () => {
    const req = makeReq({
      body: {
        email: 'x@test.com',
        password: '123',
        firstName: 'a',
        lastName: 'b',
        phone: '1',
        // position not provided
      },
    });
    const res = makeRes();

    prisma.user.findUnique.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed');
    
    prisma.$transaction.mockImplementation(async (callback) => {
      const mockTx = {
        user: {
          create: jest.fn().mockResolvedValue({
            id: 1,
            email: 'x@test.com',
            role: 'employee',
          }),
        },
        employee: {
          create: jest.fn().mockResolvedValue({
            id: 2,
            firstName: 'a',
            lastName: 'b',
            phone: '1',
            position: 'Technician', // Default position
            userId: 1,
          }),
        },
      };
      return callback(mockTx);
    });

    await adminController.createEmployee(req, res);
    
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('should handle database errors', async () => {
    const req = makeReq({
      body: {
        email: 'x@test.com',
        password: '123',
        firstName: 'a',
        lastName: 'b',
        phone: '1',
      },
    });
    const res = makeRes();

    prisma.user.findUnique.mockRejectedValue(new Error('DB error'));
    
    await adminController.createEmployee(req, res);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to create employee',
    });
  });

  test('should handle transaction errors', async () => {
    const req = makeReq({
      body: {
        email: 'x@test.com',
        password: '123',
        firstName: 'a',
        lastName: 'b',
        phone: '1',
      },
    });
    const res = makeRes();

    prisma.user.findUnique.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed');
    prisma.$transaction.mockRejectedValue(new Error('Transaction failed'));
    
    await adminController.createEmployee(req, res);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to create employee',
    });
  });
});

// ==================== Additional Tests for Remaining Functions ====================

describe('getAllAppointments', () => {
  test('should return formatted appointments', async () => {
    const req = makeReq();
    const res = makeRes();
    
    const mockAppointments = [
      {
        id: 1,
        scheduledDate: new Date('2024-01-01T10:00:00Z'),
        status: 'scheduled',
        customer: { firstName: 'John', lastName: 'Doe' },
        vehicle: { make: 'Toyota', model: 'Camry', year: 2020 },
        service: { name: 'Oil Change' },
      },
    ];
    
    prisma.appointment.findMany.mockResolvedValue(mockAppointments);
    
    await adminController.getAllAppointments(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.any(Array),
    });
  });
});

describe('getAllModificationRequests', () => {
  test('should return modification requests', async () => {
    const req = makeReq();
    const res = makeRes();
    
    const mockProjects = [
      {
        id: 1,
        title: 'Engine Tune-up',
        description: 'Performance upgrade',
        projectType: 'performance',
        status: 'pending',
        priority: 'medium',
        estimatedCost: 1500.00,
        actualCost: null,
        createdAt: new Date(),
        startDate: null,
        endDate: null,
        customer: { firstName: 'John', lastName: 'Doe', phone: '123-456-7890' },
        vehicle: { make: 'Toyota', model: 'Camry', year: 2020, licensePlate: 'ABC123' },
      },
    ];
    
    prisma.project.findMany.mockResolvedValue(mockProjects);
    
    await adminController.getAllModificationRequests(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.any(Array),
    });
  });
});

describe('updateModificationStatus', () => {
  test('should update modification status successfully', async () => {
    const req = makeReq({ 
      params: { projectId: '1' },
      body: { status: 'approved', approvedCost: 1500 },
      user: { userId: 1 }
    });
    const res = makeRes();

    prisma.project.findUnique.mockResolvedValue({
      id: 1,
      status: 'pending',
      startDate: null,
      endDate: null,
    });
    prisma.project.update.mockResolvedValue({
      id: 1,
      status: 'approved',
      actualCost: 1500,
      customer: { firstName: 'John', lastName: 'Doe' },
      vehicle: { make: 'Toyota', model: 'Camry', year: 2020 },
    });

    await adminController.updateModificationStatus(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Modification request updated successfully',
      data: expect.any(Object),
    });
  });

  test('should return 400 if status is missing', async () => {
    const req = makeReq({ 
      params: { projectId: '1' },
      body: { approvedCost: 1500 }
    });
    const res = makeRes();
    
    await adminController.updateModificationStatus(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Status is required',
    });
  });

  test('should return 404 if project not found', async () => {
    const req = makeReq({ 
      params: { projectId: '999' },
      body: { status: 'approved' }
    });
    const res = makeRes();
    
    prisma.project.findUnique.mockResolvedValue(null);
    
    await adminController.updateModificationStatus(req, res);
    
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Modification request not found',
    });
  });
});