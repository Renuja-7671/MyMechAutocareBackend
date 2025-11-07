// tests/integration/project/project.integration.test.js
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../../../src/server'); // Import your testable server
const { createTestUser, loginAndGetToken } = require('../../helpers/authHelper');

const prisma = new PrismaClient();

describe('Project (Modification) API - /api/projects', () => {
  let user1Token, user2Token;
  let user1;
  let testVehicle;
  let testProjectId;

  // Before all tests, set up the necessary data: users and a vehicle
  beforeAll(async () => {
    // Clean the database to ensure a fresh start
    await prisma.user.deleteMany();
    
    // Create and log in User 1
    user1 = await createTestUser({ email: 'user1-project@test.com', password: 'password123' });
    user1Token = await loginAndGetToken(app, 'user1-project@test.com', 'password123');

    // Create and log in User 2 for authorization tests
    await createTestUser({ email: 'user2-project@test.com', password: 'password123' });
    user2Token = await loginAndGetToken(app, 'user2-project@test.com', 'password123');

    // Create a vehicle that belongs to User 1
    testVehicle = await prisma.vehicle.create({
      data: {
        customerId: user1.customer.id,
        make: 'Subaru',
        model: 'WRX',
        year: 2021,
      },
    });
  });

  // After all tests, clean up the database
  afterAll(async () => {
    await prisma.user.deleteMany(); // Cascade delete will handle projects and vehicles
    await prisma.$disconnect();
  });

  // --- Test Suite for Creating a Project ---
  describe('POST /api/projects', () => {
    it('should create a new project for the authenticated user and their vehicle', async () => {
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          vehicleId: testVehicle.id,
          title: 'Turbo Upgrade',
          modificationDetails: 'Install a new turbocharger and tune the ECU.',
          estimatedBudget: 2500.00,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Modification request created successfully');
      expect(response.body.data.title).toBe('Turbo Upgrade');
      
      // Save the ID of the created project for use in other tests
      testProjectId = parseInt(response.body.data.id); 
    });

    it('should return a 400 error if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          // Missing vehicleId and modificationDetails
        });
  
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Vehicle and modification details are required');
    });
  });

  // --- Test Suite for Getting Projects ---
  describe('GET /api/projects', () => {
    it('should retrieve a list of projects for the authenticated user', async () => {
      // This test depends on the project created in the POST test above
      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(parseInt(response.body.data[0].id)).toBe(testProjectId);
    });
  });

  // --- Test Suite for Security and Authorization ---
  describe('Authorization Checks', () => {
    it('should NOT allow a user to get a project belonging to another user', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${user2Token}`); // User 2 trying to get User 1's project

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Modification request not found');
    });

    it('should NOT allow a user to delete a project belonging to another user', async () => {
        const response = await request(app)
          .delete(`/api/projects/${testProjectId}`)
          .set('Authorization', `Bearer ${user2Token}`);
  
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Modification request not found or cannot be deleted');
    });
  });
  
  // --- Test Suite for Deleting a Project ---
  describe('DELETE /api/projects/:projectId', () => {
    it('should allow a user to delete their own PENDING project', async () => {
      const response = await request(app)
        .delete(`/api/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Modification request deleted successfully');
    });

    it('should return a 404 error when trying to get the deleted project', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(404);
    });
  });
});