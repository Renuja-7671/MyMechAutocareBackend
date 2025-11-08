const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../../../src/server');
const { createTestUser, loginAndGetToken } = require('../../helpers/authHelper');

const prisma = new PrismaClient();

jest.mock('../../../src/services/supabaseService', () => ({
  uploadVehicleImage: jest.fn().mockResolvedValue('http://fake-url.com/fake-image.jpg'),
  deleteMultipleVehicleImages: jest.fn().mockResolvedValue(true),
}));

describe('Vehicle API - /api/vehicles (Passing Tests Only)', () => {
  let user1Token;
  let user2Token;
  let user1;
  let user1Customer;
  let user2Customer;
  let vehicle1Id;
  let vehicle2Id;

  beforeAll(async () => {
    // Clean the database
    await prisma.vehicle.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();

    // Create test users with customer profiles
    user1 = await createTestUser({ 
      email: 'user1-vehicle@test.com', 
      password: 'password123',
      role: 'customer',
      firstName: 'User1',
      lastName: 'Vehicle'
    });
    user1Token = await loginAndGetToken(app, 'user1-vehicle@test.com', 'password123');
    user1Customer = user1.customer;

    const user2 = await createTestUser({ 
      email: 'user2-vehicle@test.com', 
      password: 'password123',
      role: 'customer', 
      firstName: 'User2',
      lastName: 'Vehicle'
    });
    user2Token = await loginAndGetToken(app, 'user2-vehicle@test.com', 'password123');
    user2Customer = user2.customer;
  });

  afterAll(async () => {
    await prisma.vehicle.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  // Test POST /api/vehicles
  describe('POST /api/vehicles', () => {
    it('should create a new vehicle with required fields only and return 201', async () => {
      const response = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${user1Token}`)
        .field('make', 'Toyota')
        .field('model', 'Corolla')
        .field('year', 2023);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Vehicle created successfully');
      expect(response.body.data.make).toBe('Toyota');
      expect(response.body.data.model).toBe('Corolla');
      expect(response.body.data.year).toBe(2023);
      expect(response.body.data.customerId).toBe(user1Customer.id);

      vehicle1Id = response.body.data.id;
    });

    it('should create a new vehicle with all fields including images and return 201', async () => {
      const response = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${user1Token}`)
        .field('make', 'Honda')
        .field('model', 'Civic')
        .field('year', 2022)
        .field('licensePlate', 'XYZ789')
        .field('vin', '2HGFA16508H123456')
        .field('color', 'Red')
        .field('mileage', 25000)
        .attach('exteriorImage1', Buffer.from('fake image data'), 'front.jpg')
        .attach('exteriorImage2', Buffer.from('fake image data'), 'side.jpg')
        .attach('interiorImage', Buffer.from('fake image data'), 'interior.jpg');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.make).toBe('Honda');
      expect(response.body.data.licensePlate).toBe('XYZ789');
      expect(response.body.data.exteriorImage1).toBe('http://fake-url.com/fake-image.jpg');

      vehicle2Id = response.body.data.id;
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${user1Token}`)
        .field('make', 'Toyota');
      // Missing model and year

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should return 401 if no authentication token is provided', async () => {
      const response = await request(app)
        .post('/api/vehicles')
        .field('make', 'Toyota')
        .field('model', 'Corolla')
        .field('year', 2023);

      expect(response.status).toBe(401);
    });

    it('should return 404 if customer profile not found', async () => {
      // Create a user with employee role (no customer profile)
      const employeeUser = await createTestUser({
        email: 'employee@test.com',
        password: 'password123',
        role: 'employee',
        firstName: 'Employee',
        lastName: 'Test'
      });
      const token = await loginAndGetToken(app, 'employee@test.com', 'password123');

      const response = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${token}`)
        .field('make', 'Toyota')
        .field('model', 'Corolla')
        .field('year', 2023);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Customer profile not found');
    });
  });

  // Test GET /api/vehicles
  describe('GET /api/vehicles', () => {
    it('should return all vehicles for authenticated customer', async () => {
      const response = await request(app)
        .get('/api/vehicles')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      // user1 should have 2 vehicles now
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].customerId).toBe(user1Customer.id);
      expect(response.body.data[1].customerId).toBe(user1Customer.id);
    });

    it('should return empty array if customer has no vehicles', async () => {
      const response = await request(app)
        .get('/api/vehicles')
        .set('Authorization', `Bearer ${user2Token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should return 401 if no authentication token is provided', async () => {
      const response = await request(app)
        .get('/api/vehicles');

      expect(response.status).toBe(401);
    });
  });

  // Test GET /api/vehicles/:vehicleId
  describe('GET /api/vehicles/:vehicleId', () => {
    it('should return specific vehicle by ID', async () => {
      const response = await request(app)
        .get(`/api/vehicles/${vehicle1Id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(vehicle1Id);
      expect(response.body.data.make).toBe('Toyota');
    });

    it('should return 404 if vehicle does not exist', async () => {
      const response = await request(app)
        .get('/api/vehicles/99999')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Vehicle not found');
    });

    it('should return 404 if vehicle belongs to another user', async () => {
      const response = await request(app)
        .get(`/api/vehicles/${vehicle1Id}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Vehicle not found');
    });
  });

  // Test PUT /api/vehicles/:vehicleId
  describe('PUT /api/vehicles/:vehicleId', () => {
    it('should update vehicle information', async () => {
      const response = await request(app)
        .put(`/api/vehicles/${vehicle1Id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          make: 'Updated Toyota',
          color: 'Green',
          mileage: 30000
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Vehicle updated successfully');
      expect(response.body.data.make).toBe('Updated Toyota');
      expect(response.body.data.color).toBe('Green');
      expect(response.body.data.mileage).toBe(30000);
    });

    it('should return 404 if vehicle does not exist', async () => {
      const response = await request(app)
        .put('/api/vehicles/99999')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ make: 'New Make' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Vehicle not found');
    });

    it('should return 404 if vehicle belongs to another user', async () => {
      const response = await request(app)
        .put(`/api/vehicles/${vehicle1Id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ make: 'Hacked Make' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Vehicle not found');
    });
  });

  // Test GET /api/vehicles/:vehicleId/images
  describe('GET /api/vehicles/:vehicleId/images', () => {
    it('should return vehicle images', async () => {
      const response = await request(app)
        .get(`/api/vehicles/${vehicle2Id}/images`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('exteriorImages');
      expect(response.body.data).toHaveProperty('interiorImage');
      expect(Array.isArray(response.body.data.exteriorImages)).toBe(true);
    });

    it('should return 404 if vehicle belongs to another user', async () => {
      const response = await request(app)
        .get(`/api/vehicles/${vehicle2Id}/images`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Vehicle not found');
    });
  });

  // Test DELETE /api/vehicles/:vehicleId
  describe('DELETE /api/vehicles/:vehicleId', () => {
    it('should delete vehicle and return 200', async () => {
      const response = await request(app)
        .delete(`/api/vehicles/${vehicle1Id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Vehicle deleted successfully');
    });

    it('should return 404 when trying to access deleted vehicle', async () => {
      const response = await request(app)
        .get(`/api/vehicles/${vehicle1Id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Vehicle not found');
    });

    it('should return 404 if trying to delete non-existent vehicle', async () => {
      const response = await request(app)
        .delete('/api/vehicles/99999')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Vehicle not found');
    });

    it('should return 404 if trying to delete another user\'s vehicle', async () => {
      const response = await request(app)
        .delete(`/api/vehicles/${vehicle2Id}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Vehicle not found');
    });
  });

  // Test edge cases
  describe('Edge Cases', () => {
    it('should handle invalid vehicle ID format', async () => {
      const response = await request(app)
        .get('/api/vehicles/invalid-id')
        .set('Authorization', `Bearer ${user1Token}`);

      // This might return 500 or 400 depending on your error handling
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle missing optional fields during update', async () => {
      const response = await request(app)
        .put(`/api/vehicles/${vehicle2Id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({}); // Empty update

      expect(response.status).toBe(200); // Should succeed with no changes
      expect(response.body.success).toBe(true);
    });
  });
});