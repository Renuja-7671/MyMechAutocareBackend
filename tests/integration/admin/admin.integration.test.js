const request = require('supertest');
const express = require('express');
const adminRouter = require('../../../../routes/admin');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// 1. Mock the entire Prisma Client
jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    customer: { count: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    employee: { count: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    serviceLog: { count: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    appointment: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    project: { aggregate: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn(), create: jest.fn() },
    $transaction: jest.fn().mockImplementation((callback) => callback(mPrismaClient)),
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

// 2. Mock the bcrypt library
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}));

// 3. Mock the authentication middleware
jest.mock('../../../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 1, role: 'admin' };
    next();
  },
  authorizeRole: () => (req, res, next) => {
    next();
  },
}));

// 4. Setup the Express app for testing
const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

const prisma = new PrismaClient();

describe('Admin Controller - Integration Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  //================================================================================
  // GET /dashboard-stats
  //================================================================================
  describe('GET /api/admin/dashboard-stats', () => {
    it('should return all dashboard statistics successfully', async () => {
      prisma.customer.count.mockResolvedValue(15);
      prisma.employee.count.mockResolvedValue(8);
      prisma.serviceLog.count.mockResolvedValueOnce(4);
      prisma.serviceLog.count.mockResolvedValueOnce(25);
      prisma.appointment.count.mockResolvedValue(7);
      prisma.project.aggregate.mockResolvedValue({ _sum: { actualCost: 12500.50 } });

      const res = await request(app).get('/api/admin/dashboard-stats');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        totalCustomers: 15,
        totalEmployees: 8,
        activeServices: 4,
        completedServices: 25,
        pendingAppointments: 7,
        revenue: 12500.50,
      });
    });

    it('should handle database errors gracefully', async () => {
      prisma.customer.count.mockRejectedValue(new Error('Database connection lost'));

      const res = await request(app).get('/api/admin/dashboard-stats');

      expect(res.statusCode).toEqual(500);
      expect(res.body).toEqual({
        success: false,
        error: 'Failed to fetch dashboard statistics',
      });
    });
  });

  //================================================================================
  // GET /users
  //================================================================================
  describe('GET /api/admin/users', () => {
    it('should return a formatted list of all users', async () => {
      const mockUsers = [
        { id: 1, email: 'test@test.com', role: 'customer', isActive: true, createdAt: new Date(), customer: { id: 1, firstName: 'John', lastName: 'Doe', phone: '111' }, employee: null },
        { id: 2, email: 'emp@test.com', role: 'employee', isActive: true, createdAt: new Date(), customer: null, employee: { id: 1, firstName: 'Jane', lastName: 'Smith', phone: '222', position: 'Mechanic' } }
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const res = await request(app).get('/api/admin/users');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[0].name).toBe('John Doe');
      expect(res.body.data[1].position).toBe('Mechanic');
    });

    it('should handle database errors when fetching users', async () => {
      prisma.user.findMany.mockRejectedValue(new Error('DB Error'));
      const res = await request(app).get('/api/admin/users');
      expect(res.statusCode).toEqual(500);
      expect(res.body.error).toBe('Failed to fetch users');
    });
  });

  //================================================================================
  // PATCH /users/:userId/role
  //================================================================================
  describe('PATCH /api/admin/users/:userId/role', () => {
    it('should update a user role successfully', async () => {
      const mockUser = { id: 2, role: 'customer' };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, role: 'admin' });

      const res = await request(app)
        .patch('/api/admin/users/2/role')
        .send({ role: 'admin' });

      expect(res.statusCode).toEqual(200);
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { role: 'admin' } });
      expect(res.body.data.role).toBe('admin');
    });

    it('should create an employee profile when changing role from customer to employee', async () => {
      const mockUser = { id: 2, role: 'customer', customer: { firstName: 'Test', lastName: 'User', phone: '123' } };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, role: 'employee' });

      await request(app).patch('/api/admin/users/2/role').send({ role: 'employee' });
      
      expect(prisma.employee.create).toHaveBeenCalled();
    });

    it('should handle role change from employee to customer', async () => {
      const mockUser = { 
        id: 2, 
        role: 'employee', 
        employee: { firstName: 'Test', lastName: 'User', phone: '123' } 
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, role: 'customer' });

      await request(app).patch('/api/admin/users/2/role').send({ role: 'customer' });
      
      expect(prisma.customer.create).toHaveBeenCalled();
    });

    it('should return 400 for an invalid role', async () => {
      const res = await request(app)
        .patch('/api/admin/users/2/role')
        .send({ role: 'invalid_role' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('Invalid role');
    });

    it('should return 404 if the user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const res = await request(app)
        .patch('/api/admin/users/999/role')
        .send({ role: 'admin' });
        
      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toBe('User not found');
    });
  });

  //================================================================================
  // DELETE /users/:userId
  //================================================================================
  describe('DELETE /api/admin/users/:userId', () => {
    it('should delete a user successfully', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 2, role: 'customer' });
      prisma.user.delete.mockResolvedValue({});

      const res = await request(app).delete('/api/admin/users/2');

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toBe('User deleted successfully');
    });

    it('should return 404 if user to delete is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const res = await request(app).delete('/api/admin/users/999');
      expect(res.statusCode).toEqual(404);
    });

    it('should prevent deletion of the last admin user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'admin' });
      prisma.user.count.mockResolvedValue(1);

      const res = await request(app).delete('/api/admin/users/1');

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toBe('Cannot delete the last admin user');
    });
  });

  //================================================================================
  // POST /employees
  //================================================================================
  describe('POST /api/admin/employees', () => {
    const employeeData = { email: 'new@emp.com', password: 'password123', firstName: 'New', lastName: 'Hire', phone: '333' };

    it('should create a new employee successfully', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashed_password');
      prisma.$transaction.mockResolvedValue({
        user: { id: 10, email: employeeData.email, role: 'employee' },
        employee: { id: 5, ...employeeData }
      });

      const res = await request(app).post('/api/admin/employees').send(employeeData);

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(employeeData.email);
    });

    it('should return 400 if required fields are missing', async () => {
      const res = await request(app).post('/api/admin/employees').send({ email: 'test@test.com' });
      expect(res.statusCode).toEqual(400);
    });

    it('should return 400 if email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, email: employeeData.email });
      const res = await request(app).post('/api/admin/employees').send(employeeData);
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toBe('A user with this email already exists');
    });

    it('should handle transaction failures when creating employee', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashed_password');
      prisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      const res = await request(app).post('/api/admin/employees').send(employeeData);

      expect(res.statusCode).toEqual(500);
      expect(res.body.error).toBe('Failed to create employee');
    });
  });

  //================================================================================
  // GET /reports
  //================================================================================
  describe('GET /api/admin/reports', () => {
    const query = { type: 'revenue', startDate: '2025-01-01', endDate: '2025-01-31' };

    it('should generate a revenue report', async () => {
      prisma.project.findMany.mockResolvedValue([{ actualCost: 100 }, { actualCost: 150 }]);
      const res = await request(app).get('/api/admin/reports').query(query);
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.totalAmount).toBe(250);
    });

    it('should generate other report types (e.g., employees)', async () => {
      prisma.serviceLog.findMany.mockResolvedValue([{ hoursWorked: 8 }, { hoursWorked: 6 }]);
      const res = await request(app).get('/api/admin/reports').query({ ...query, type: 'employees' });
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.totalAmount).toBe(14);
    });

    it('should return 400 if query parameters are missing', async () => {
      const res = await request(app).get('/api/admin/reports').query({ type: 'revenue' });
      expect(res.statusCode).toEqual(400);
    });

    it('should return 400 for an invalid report type', async () => {
      const res = await request(app).get('/api/admin/reports').query({ ...query, type: 'invalid' });
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toBe('Invalid report type');
    });
  });

  //================================================================================
  // PATCH /modifications/:projectId
  //================================================================================
  describe('PATCH /api/admin/modifications/:projectId', () => {
    it('should update a modification request status and cost', async () => {
      const mockProject = { id: 1, status: 'pending', customer: { firstName: 'a', lastName: 'b' }, vehicle: { year: 2020, make: 'c', model: 'd' } };
      prisma.project.findUnique.mockResolvedValue(mockProject);
      prisma.project.update.mockResolvedValue({ ...mockProject, status: 'approved', actualCost: 1500 });
      
      const res = await request(app)
        .patch('/api/admin/modifications/1')
        .send({ status: 'approved', approvedCost: 1500 });
        
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.status).toBe('approved');
      expect(res.body.data.approvedCost).toBe(1500);
    });

    it('should set start date when status changes to in_progress', async () => {
      const mockProject = { 
        id: 1, 
        status: 'pending', 
        startDate: null,
        customer: { firstName: 'a', lastName: 'b' }, 
        vehicle: { year: 2020, make: 'c', model: 'd' } 
      };
      prisma.project.findUnique.mockResolvedValue(mockProject);
      prisma.project.update.mockResolvedValue({ 
        ...mockProject, 
        status: 'in_progress', 
        startDate: new Date() 
      });

      const res = await request(app)
        .patch('/api/admin/modifications/1')
        .send({ status: 'in_progress' });

      expect(res.statusCode).toEqual(200);
    });

    it('should set end date when status changes to completed', async () => {
      const mockProject = { 
        id: 1, 
        status: 'in_progress', 
        endDate: null,
        customer: { firstName: 'a', lastName: 'b' }, 
        vehicle: { year: 2020, make: 'c', model: 'd' } 
      };
      prisma.project.findUnique.mockResolvedValue(mockProject);
      prisma.project.update.mockResolvedValue({ 
        ...mockProject, 
        status: 'completed', 
        endDate: new Date() 
      });

      const res = await request(app)
        .patch('/api/admin/modifications/1')
        .send({ status: 'completed' });

      expect(res.statusCode).toEqual(200);
    });

    it('should return 400 if status is missing', async () => {
      const res = await request(app)
        .patch('/api/admin/modifications/1')
        .send({ approvedCost: 1500 });
      expect(res.statusCode).toEqual(400);
    });

    it('should return 404 if project is not found', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      const res = await request(app)
        .patch('/api/admin/modifications/999')
        .send({ status: 'approved' });
      expect(res.statusCode).toEqual(404);
    });
  });

  //================================================================================
  // GET /services
  //================================================================================
  describe('GET /api/admin/services', () => {
    it('should return all services with formatted data', async () => {
      const mockAppointments = [
        {
          id: 1,
          scheduledDate: new Date('2024-01-01'),
          customer: { firstName: 'John', lastName: 'Doe' },
          vehicle: { year: 2020, make: 'Toyota', model: 'Camry' },
          service: { name: 'Oil Change' },
          serviceLogs: [
            {
              status: 'in_progress',
              progressPercentage: 50,
              employee: { id: 1, firstName: 'Jane', lastName: 'Smith' }
            }
          ]
        }
      ];

      prisma.appointment.findMany.mockResolvedValue(mockAppointments);

      const res = await request(app).get('/api/admin/services');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[0].customerName).toBe('John Doe');
      expect(res.body.data[0].vehicleName).toBe('2020 Toyota Camry');
      expect(res.body.data[0].status).toBe('in_progress');
      expect(res.body.data[0].progress).toBe(50);
      expect(res.body.data[0].assignedEmployee).toBe('Jane Smith');
    });

    it('should handle database errors when fetching services', async () => {
      prisma.appointment.findMany.mockRejectedValue(new Error('DB Error'));
      
      const res = await request(app).get('/api/admin/services');
      
      expect(res.statusCode).toEqual(500);
      expect(res.body.error).toBe('Failed to fetch services');
    });

    it('should handle services without service logs', async () => {
      const mockAppointments = [
        {
          id: 1,
          scheduledDate: new Date('2024-01-01'),
          customer: { firstName: 'John', lastName: 'Doe' },
          vehicle: { year: 2020, make: 'Toyota', model: 'Camry' },
          service: { name: 'Oil Change' },
          serviceLogs: []
        }
      ];

      prisma.appointment.findMany.mockResolvedValue(mockAppointments);

      const res = await request(app).get('/api/admin/services');

      expect(res.statusCode).toEqual(200);
      expect(res.body.data[0].status).toBe('not_started');
      expect(res.body.data[0].progress).toBe(0);
      expect(res.body.data[0].assignedEmployee).toBeNull();
    });
  });

  //================================================================================
  // POST /services/:serviceId/assign
  //================================================================================
  describe('POST /api/admin/services/:serviceId/assign', () => {
    it('should assign an employee to a service successfully', async () => {
      const mockAppointment = { id: 1, status: 'scheduled' };
      const mockEmployee = { id: 1, firstName: 'Jane', lastName: 'Smith' };
      const mockServiceLog = { id: 1, appointmentId: 1, employeeId: 1 };

      prisma.appointment.findUnique.mockResolvedValue(mockAppointment);
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);
      prisma.serviceLog.findFirst.mockResolvedValue(null);
      prisma.serviceLog.create.mockResolvedValue(mockServiceLog);

      const res = await request(app)
        .post('/api/admin/services/1/assign')
        .send({ employeeId: 1 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Employee assigned successfully');
    });

    it('should reassign employee if service log already exists', async () => {
      const mockAppointment = { id: 1, status: 'confirmed' };
      const mockEmployee = { id: 1, firstName: 'Jane', lastName: 'Smith' };
      const mockExistingLog = { id: 1, appointmentId: 1, employeeId: 2 };

      prisma.appointment.findUnique.mockResolvedValue(mockAppointment);
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);
      prisma.serviceLog.findFirst.mockResolvedValue(mockExistingLog);
      prisma.serviceLog.update.mockResolvedValue({ ...mockExistingLog, employeeId: 1 });

      const res = await request(app)
        .post('/api/admin/services/1/assign')
        .send({ employeeId: 1 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toBe('Employee reassigned successfully');
    });

    it('should return 400 if employeeId is missing', async () => {
      const res = await request(app)
        .post('/api/admin/services/1/assign')
        .send({});

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toBe('Employee ID is required');
    });

    it('should return 404 if appointment is not found', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/admin/services/999/assign')
        .send({ employeeId: 1 });

      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toBe('Appointment not found');
    });

    it('should return 404 if employee is not found', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 1 });
      prisma.employee.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/admin/services/1/assign')
        .send({ employeeId: 999 });

      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toBe('Employee not found');
    });

    it('should handle database errors when assigning service', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 1 });
      prisma.employee.findUnique.mockResolvedValue({ id: 1 });
      prisma.serviceLog.findFirst.mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .post('/api/admin/services/1/assign')
        .send({ employeeId: 1 });

      expect(res.statusCode).toEqual(500);
      expect(res.body.error).toBe('Failed to assign employee to service');
    });
  });

  //================================================================================
  // GET /appointments
  //================================================================================
  describe('GET /api/admin/appointments', () => {
    it('should return all appointments with formatted data', async () => {
      const mockAppointments = [
        {
          id: 1,
          scheduledDate: new Date('2024-01-01T10:00:00Z'),
          status: 'scheduled',
          customer: { firstName: 'John', lastName: 'Doe' },
          vehicle: { year: 2020, make: 'Toyota', model: 'Camry' },
          service: { name: 'Oil Change' }
        }
      ];

      prisma.appointment.findMany.mockResolvedValue(mockAppointments);

      const res = await request(app).get('/api/admin/appointments');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[0].customerName).toBe('John Doe');
      expect(res.body.data[0].vehicleName).toBe('2020 Toyota Camry');
      expect(res.body.data[0].serviceType).toBe('Oil Change');
      expect(res.body.data[0].status).toBe('scheduled');
      expect(res.body.data[0].date).toBe('2024-01-01');
    });

    it('should handle appointments without service information', async () => {
      const mockAppointments = [
        {
          id: 1,
          scheduledDate: new Date('2024-01-01T10:00:00Z'),
          status: 'scheduled',
          customer: { firstName: 'John', lastName: 'Doe' },
          vehicle: { year: 2020, make: 'Toyota', model: 'Camry' },
          service: null
        }
      ];

      prisma.appointment.findMany.mockResolvedValue(mockAppointments);

      const res = await request(app).get('/api/admin/appointments');

      expect(res.statusCode).toEqual(200);
      expect(res.body.data[0].serviceType).toBe('General Service');
    });

    it('should handle database errors when fetching appointments', async () => {
      prisma.appointment.findMany.mockRejectedValue(new Error('DB Error'));

      const res = await request(app).get('/api/admin/appointments');

      expect(res.statusCode).toEqual(500);
      expect(res.body.error).toBe('Failed to fetch appointments');
    });
  });

  //================================================================================
  // GET /modifications
  //================================================================================
  describe('GET /api/admin/modifications', () => {
    it('should return all modification requests', async () => {
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
          vehicle: { year: 2020, make: 'Toyota', model: 'Camry', licensePlate: 'ABC123' }
        }
      ];

      prisma.project.findMany.mockResolvedValue(mockProjects);

      const res = await request(app).get('/api/admin/modifications');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[0].customerName).toBe('John Doe');
      expect(res.body.data[0].vehicleName).toBe('2020 Toyota Camry');
      expect(res.body.data[0].title).toBe('Engine Tune-up');
      expect(res.body.data[0].status).toBe('pending');
      expect(res.body.data[0].estimatedCost).toBe(1500);
      expect(res.body.data[0].approvedCost).toBeNull();
    });

    it('should handle projects with approved costs', async () => {
      const mockProjects = [
        {
          id: 1,
          title: 'Engine Tune-up',
          description: 'Performance upgrade',
          projectType: 'performance',
          status: 'approved',
          priority: 'medium',
          estimatedCost: 1500.00,
          actualCost: 1400.00,
          createdAt: new Date(),
          startDate: new Date(),
          endDate: null,
          customer: { firstName: 'John', lastName: 'Doe', phone: '123-456-7890' },
          vehicle: { year: 2020, make: 'Toyota', model: 'Camry', licensePlate: 'ABC123' }
        }
      ];

      prisma.project.findMany.mockResolvedValue(mockProjects);

      const res = await request(app).get('/api/admin/modifications');

      expect(res.statusCode).toEqual(200);
      expect(res.body.data[0].approvedCost).toBe(1400);
      expect(res.body.data[0].status).toBe('approved');
    });

    it('should handle database errors when fetching modifications', async () => {
      prisma.project.findMany.mockRejectedValue(new Error('DB Error'));

      const res = await request(app).get('/api/admin/modifications');

      expect(res.statusCode).toEqual(500);
      expect(res.body.error).toBe('Failed to fetch modification requests');
    });
  });
});