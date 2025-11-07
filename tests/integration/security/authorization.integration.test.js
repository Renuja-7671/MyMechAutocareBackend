// tests/integration/security/authorization.integration.test.js
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../../../src/server'); // Import your testable server
const { createTestUser, loginAndGetToken } = require('../../helpers/authHelper');

const prisma = new PrismaClient();

describe('Authorization and Role-Based Access', () => {
  let customerToken, employeeToken, adminToken;
  let customer, employee, admin;

  // Before all tests, create one of each type of user and get their tokens
  beforeAll(async () => {
    // Clean the database to ensure a fresh start
    await prisma.user.deleteMany();

    // Create a 'customer' user and get their token
    customer = await createTestUser({ email: 'customer@test.com', password: 'password123', role: 'customer' });
    customerToken = await loginAndGetToken(app, 'customer@test.com', 'password123');

    // Create an 'employee' user and get their token
    employee = await createTestUser({ email: 'employee@test.com', password: 'password123', role: 'employee' });
    employeeToken = await loginAndGetToken(app, 'employee@test.com', 'password123');
    
    // Create an 'admin' user and get their token
    admin = await createTestUser({ email: 'admin@test.com', password: 'password123', role: 'admin' });
    adminToken = await loginAndGetToken(app, 'admin@test.com', 'password123');
  });

  // After all tests, clean up the database
  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  // --- Test Suite for Employee-level Access ---
  describe('Employee Routes Access (/api/employees)', () => {
    const employeeRoute = '/api/employees/assigned-services'; // A sample employee route

    it('should ALLOW access for an employee', async () => {
      const response = await request(app)
        .get(employeeRoute)
        .set('Authorization', `Bearer ${employeeToken}`);

      // We expect a 200 OK, even if there's no data. We are only testing access.
      expect(response.status).toBe(200);
    });
    
    it('should ALLOW access for an admin (since admins are often super-users)', async () => {
      // NOTE: Your current `authorizeRole('employee')` does NOT allow this. 
      // This test WILL FAIL unless you change your middleware to `authorizeRole('employee', 'admin')`
      // For now, we will test the current behavior, which should be a 403.
      const response = await request(app)
        .get(employeeRoute)
        .set('Authorization', `Bearer ${adminToken}`);

      // Based on your current code `authorizeRole('employee')`, this SHOULD be a 403
      expect(response.status).toBe(403);
    });

    it('should DENY access for a customer with a 403 Forbidden error', async () => {
      const response = await request(app)
        .get(employeeRoute)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied. Insufficient permissions.');
    });

    it('should DENY access if no token is provided with a 401 Unauthorized error', async () => {
      const response = await request(app)
        .get(employeeRoute);

      expect(response.status).toBe(401);
    });
  });

  // --- Test Suite for Admin-only Access ---
  describe('Admin Routes Access (/api/admin)', () => {
    const adminRoute = '/api/admin/dashboard-stats'; // A sample admin-only route

    it('should ALLOW access for an admin', async () => {
      const response = await request(app)
        .get(adminRoute)
        .set('Authorization', `Bearer ${adminToken}`);

      // We expect 200 OK, confirming the admin has access.
      expect(response.status).toBe(200);
    });

    it('should DENY access for an employee with a 403 Forbidden error', async () => {
      const response = await request(app)
        .get(adminRoute)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied. Insufficient permissions.');
    });

    it('should DENY access for a customer with a 403 Forbidden error', async () => {
      const response = await request(app)
        .get(adminRoute)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(403);
    });
  });
});