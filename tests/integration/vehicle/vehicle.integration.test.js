// tests/integration/vehicle/vehicle.integration.test.js
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../../../src/server'); // Import your newly testable server.js
const { createTestUser, loginAndGetToken } = require('../../helpers/authHelper');

const prisma = new PrismaClient();

// Mock the external Supabase service. We don't want to upload real images during tests.
// This tells Jest to replace the functions from this module with fake ones.
jest.mock('../../../src/services/supabaseService', () => ({
  uploadVehicleImage: jest.fn().mockResolvedValue('http://fake-url.com/fake-image.jpg'),
  deleteMultipleVehicleImages: jest.fn().mockResolvedValue(true),
}));

describe('Vehicle API - /api/vehicles', () => {
  let user1Token;
  let user2Token;
  let user1;
  let vehicle1Id;

  // Before any tests run, set up our test environment
  beforeAll(async () => {
    // Clean the database to ensure a fresh start
    await prisma.user.deleteMany();

    // Create and log in the first user
    user1 = await createTestUser({ email: 'user1-vehicle@test.com', password: 'password123' });
    user1Token = await loginAndGetToken(app, 'user1-vehicle@test.com', 'password123');

    // Create and log in a second user for authorization tests
    await createTestUser({ email: 'user2-vehicle@test.com', password: 'password123' });
    user2Token = await loginAndGetToken(app, 'user2-vehicle@test.com', 'password123');
  });

  // After all tests are finished, clean up the database and close the connection
  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  // --- Test Suite for Creating a Vehicle ---
  describe('POST /api/vehicles', () => {
    it('should create a new vehicle for the authenticated user and return 201', async () => {
      const response = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${user1Token}`) // Authenticate as user1
        .field('make', 'Toyota')
        .field('model', 'Corolla')
        .field('year', 2023);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.make).toBe('Toyota');
      expect(response.body.data.customerId).toBe(user1.customer.id); // Verify it's linked to the correct user

      // Save the new vehicle's ID so we can use it in other tests
      vehicle1Id = response.body.data.id;
    });

    it('should return 401 Unauthorized if no authentication token is provided', async () => {
      const response = await request(app)
        .post('/api/vehicles')
        .field('make', 'Honda', 'Civic', 2021);

      expect(response.status).toBe(401);
    });
  });

  // --- Test Suite for Retrieving Vehicles ---
  describe('GET /api/vehicles', () => {
    it('should return a list of vehicles that ONLY belong to the authenticated user', async () => {
      const response = await request(app)
        .get('/api/vehicles')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      // We know user1 has created one vehicle
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].id).toBe(vehicle1Id);
    });
  });

  // --- Test Suite for Authorization - The most important tests! ---
  describe('Authorization Checks', () => {
    it('should NOT allow a user to get another user\'s vehicle by its ID (should return 404)', async () => {
      const response = await request(app)
        .get(`/api/vehicles/${vehicle1Id}`)
        .set('Authorization', `Bearer ${user2Token}`); // User 2 is trying to access User 1's vehicle

      // Your controller correctly hides that the vehicle exists from other users
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Vehicle not found');
    });

    it('should NOT allow a user to delete another user\'s vehicle (should return 404)', async () => {
      const response = await request(app)
        .delete(`/api/vehicles/${vehicle1Id}`)
        .set('Authorization', `Bearer ${user2Token}`); // User 2 is trying to delete User 1's vehicle

      expect(response.status).toBe(404);
    });
  });
  
  // --- Test Suite for Deleting a Vehicle ---
  describe('DELETE /api/vehicles/:vehicleId', () => {
    it('should allow an authenticated user to delete their OWN vehicle', async () => {
      const response = await request(app)
        .delete(`/api/vehicles/${vehicle1Id}`)
        .set('Authorization', `Bearer ${user1Token}`); // User 1 deletes their own vehicle

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Vehicle deleted successfully');
    });

    it('should confirm the vehicle is gone by trying to get it again (should return 404)', async () => {
      const response = await request(app)
        .get(`/api/vehicles/${vehicle1Id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(404);
    });
  });
});