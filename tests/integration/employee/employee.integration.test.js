// tests/integration/employee/employee.integration.test.js
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../../../src/server');
const { createTestUser, loginAndGetToken } = require('../../helpers/authHelper');

const prisma = new PrismaClient();

// Simple mocks to avoid the setup issues
jest.mock('../../../src/services/supabaseService', () => ({
  uploadVehicleImage: jest.fn().mockResolvedValue('http://fake-url.com/fake-image.jpg'),
  deleteMultipleVehicleImages: jest.fn().mockResolvedValue(true),
}));

describe('Employee API Integration Tests', () => {
  let employeeToken;
  let customerToken;
  let adminToken;
  let employee;
  let customer;
  let admin;
  let testService;
  let testAppointment;
  let testServiceLog;
  let testVehicle;

  beforeAll(async () => {
    // Clean the database
    await prisma.serviceLog.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.service.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.user.deleteMany();

    // Create employee user
    const employeeUser = await createTestUser({
      email: 'employee-test@test.com',
      password: 'password123',
      role: 'employee',
      firstName: 'John',
      lastName: 'Employee'
    });
    employeeToken = await loginAndGetToken(app, 'employee-test@test.com', 'password123');
    employee = employeeUser.employee;

    // Create customer user
    const customerUser = await createTestUser({
      email: 'customer-test@test.com',
      password: 'password123',
      role: 'customer',
      firstName: 'Jane',
      lastName: 'Customer'
    });
    customerToken = await loginAndGetToken(app, 'customer-test@test.com', 'password123');
    customer = customerUser.customer;

    // Create admin user (for authorization tests)
    const adminUser = await createTestUser({
      email: 'admin-test@test.com',
      password: 'password123',
      role: 'admin',
      firstName: 'Admin',
      lastName: 'User'
    });
    adminToken = await loginAndGetToken(app, 'admin-test@test.com', 'password123');
    admin = adminUser.employee;

    // Create test service
    testService = await prisma.service.create({
      data: {
        name: 'Oil Change',
        description: 'Standard oil change service',
        basePrice: 49.99,
        estimatedDuration: 30,
        category: 'Maintenance',
        isActive: true,
      },
    });

    // Create test vehicle for customer
    testVehicle = await prisma.vehicle.create({
      data: {
        customerId: customer.id,
        make: 'Toyota',
        model: 'Camry',
        year: 2022,
        licensePlate: 'TEST123',
      },
    });

    // Create test appointment
    testAppointment = await prisma.appointment.create({
      data: {
        customerId: customer.id,
        vehicleId: testVehicle.id,
        serviceId: testService.id,
        scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        status: 'scheduled',
      },
    });

    // Create test service log assigned to employee - FIXED: Added startTime
    testServiceLog = await prisma.serviceLog.create({
      data: {
        appointmentId: testAppointment.id,
        employeeId: employee.id,
        status: 'not_started',
        progressPercentage: 0,
        notes: 'Initial assignment',
        startTime: new Date(), // ADDED THIS REQUIRED FIELD
      },
    });

    // Create a completed service log for testing time logs - FIXED: Added startTime
    await prisma.serviceLog.create({
      data: {
        appointmentId: testAppointment.id,
        employeeId: employee.id,
        status: 'completed',
        progressPercentage: 100,
        hoursWorked: 5.5,
        notes: `[${new Date().toLocaleString()}] Logged 2.5 hrs: Oil change completed\n[${new Date().toLocaleString()}] Logged 3.0 hrs: Additional inspection`,
        startTime: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
        endTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      },
    });
  });

  afterAll(async () => {
    await prisma.serviceLog.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.service.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  // Test GET /api/employees/assigned-services
  describe('GET /api/employees/assigned-services', () => {
    it('should return assigned services for authenticated employee', async () => {
      const response = await request(app)
        .get('/api/employees/assigned-services')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      if (response.body.data.length > 0) {
        const service = response.body.data[0];
        expect(service).toHaveProperty('id');
        expect(service).toHaveProperty('vehicleName');
        expect(service).toHaveProperty('customerName');
        expect(service).toHaveProperty('serviceType');
        expect(service).toHaveProperty('status');
        expect(service).toHaveProperty('progress');
        expect(service).toHaveProperty('startDate');
        expect(service).toHaveProperty('estimatedCompletion');
        expect(service).toHaveProperty('totalHoursLogged');
      }
    });

    it('should return 403 for non-employee users', async () => {
      const response = await request(app)
        .get('/api/employees/assigned-services')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(403);
    });

    it('should return 401 without authentication token', async () => {
      const response = await request(app)
        .get('/api/employees/assigned-services');

      expect(response.status).toBe(401);
    });
  });

  // Test GET /api/employees/upcoming-appointments
  describe('GET /api/employees/upcoming-appointments', () => {
    it('should return upcoming appointments for authenticated employee', async () => {
      const response = await request(app)
        .get('/api/employees/upcoming-appointments')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return 403 for customer users', async () => {
      const response = await request(app)
        .get('/api/employees/upcoming-appointments')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(403);
    });

    it('should return 403 for admin users', async () => {
      const response = await request(app)
        .get('/api/employees/upcoming-appointments')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(403);
    });
  });

  // Test POST /api/employees/time-logs
  describe('POST /api/employees/time-logs', () => {
    it('should log time for a service and return 201', async () => {
      const timeLogData = {
        serviceId: testServiceLog.id,
        hours: 2.5,
        description: 'Completed oil change and filter replacement'
      };

      const response = await request(app)
        .post('/api/employees/time-logs')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send(timeLogData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Time logged successfully');
      expect(response.body.data).toHaveProperty('serviceId');
      expect(response.body.data).toHaveProperty('hoursAdded', 2.5);
      expect(response.body.data).toHaveProperty('totalHours');
      expect(response.body.data).toHaveProperty('description');
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/api/employees/time-logs')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ hours: 2.5 }); // Missing serviceId

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Service ID and hours are required');
    });

    it('should return 404 when service does not belong to employee', async () => {
      // Create another employee
      const anotherEmployee = await createTestUser({
        email: 'employee2-test@test.com',
        password: 'password123',
        role: 'employee',
        firstName: 'Another',
        lastName: 'Employee'
      });
      const anotherEmployeeToken = await loginAndGetToken(app, 'employee2-test@test.com', 'password123');

      const response = await request(app)
        .post('/api/employees/time-logs')
        .set('Authorization', `Bearer ${anotherEmployeeToken}`)
        .send({
          serviceId: testServiceLog.id,
          hours: 1.5
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not assigned to you');
    });
  });

  // Test GET /api/employees/time-logs
  describe('GET /api/employees/time-logs', () => {
    it('should return time logs for authenticated employee', async () => {
      const response = await request(app)
        .get('/api/employees/time-logs')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter time logs by serviceId', async () => {
      const response = await request(app)
        .get(`/api/employees/time-logs?serviceId=${testServiceLog.id}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  // Test PATCH /api/employees/services/:serviceId/status
  describe('PATCH /api/employees/services/:serviceId/status', () => {
    it('should update service status to in_progress and return 200', async () => {
      const updateData = {
        status: 'in_progress',
        progress: 50,
        notes: 'Started working on the service'
      };

      const response = await request(app)
        .patch(`/api/employees/services/${testServiceLog.id}/status`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Service status updated successfully');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('status', 'in_progress');
      expect(response.body.data).toHaveProperty('progress', 50);
    });

    it('should complete service and set end time automatically', async () => {
      const updateData = {
        status: 'completed',
        progress: 100,
        notes: 'Service completed successfully'
      };

      const response = await request(app)
        .patch(`/api/employees/services/${testServiceLog.id}/status`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status', 'completed');
      expect(response.body.data).toHaveProperty('progress', 100);
    });

    it('should return 400 when status is missing', async () => {
      const response = await request(app)
        .patch(`/api/employees/services/${testServiceLog.id}/status`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ progress: 75 }); // Missing status

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Status is required');
    });
  });

  // Test authorization and error scenarios
  describe('Authorization and Error Scenarios', () => {
    it('should not allow customer to access any employee endpoints', async () => {
      const endpoints = [
        { method: 'GET', path: '/api/employees/assigned-services' },
        { method: 'GET', path: '/api/employees/upcoming-appointments' },
        { method: 'POST', path: '/api/employees/time-logs' },
        { method: 'GET', path: '/api/employees/time-logs' },
        { method: 'PATCH', path: `/api/employees/services/${testServiceLog.id}/status` }
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method.toLowerCase()](endpoint.path)
          .set('Authorization', `Bearer ${customerToken}`);

        expect(response.status).toBe(403);
      }
    });

    it('should not allow unauthenticated access to any employee endpoints', async () => {
      const endpoints = [
        { method: 'GET', path: '/api/employees/assigned-services' },
        { method: 'GET', path: '/api/employees/upcoming-appointments' },
        { method: 'POST', path: '/api/employees/time-logs' },
        { method: 'GET', path: '/api/employees/time-logs' },
        { method: 'PATCH', path: `/api/employees/services/${testServiceLog.id}/status` }
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method.toLowerCase()](endpoint.path);

        expect(response.status).toBe(401);
      }
    });
  });
});