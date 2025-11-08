// tests/integration/appointment/appointment.integration.test.js
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../../../src/server'); // Import your testable server
const { createTestUser, loginAndGetToken } = require('../../helpers/authHelper');

const prisma = new PrismaClient();

describe('Appointment API - /api/appointments', () => {
  let userToken;
  let testUser;
  let testVehicle;
  let testAppointmentId;

  // Before all tests, we need to set up a complete scenario:
  // 1. A user must exist.
  // 2. That user must have a vehicle.
  beforeAll(async () => {
    // Clean up from any previous test runs
    await prisma.user.deleteMany();
    
    // Create a user for our tests
    testUser = await createTestUser({ email: 'appointment-user@test.com', password: 'password123' });
    
    // Log that user in to get their authentication token
    userToken = await loginAndGetToken(app, 'appointment-user@test.com', 'password123');

    // Create a vehicle that belongs to this user directly in the database,
    // as it's a prerequisite for creating an appointment.
    testVehicle = await prisma.vehicle.create({
      data: {
        customerId: testUser.customer.id,
        make: 'Honda',
        model: 'Accord',
        year: 2020,
      },
    });
  });

  // After all tests are finished, clean up the database
  afterAll(async () => {
    await prisma.user.deleteMany(); // Cascade delete will handle related data
    await prisma.$disconnect();
  });

  // --- Test Suite for Creating an Appointment ---
  describe('POST /api/appointments', () => {
    it('should create a new appointment for an authenticated user and their vehicle', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          vehicleId: testVehicle.id,
          serviceType: 'Tire Rotation',
          preferredDate: '2025-11-20', // Use a future date for clarity
          preferredTime: '14:00',
          description: 'Please check tire pressure as well.',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Appointment created successfully');
      expect(response.body.data.serviceType).toBe('Tire Rotation');
      
      // Save the ID of the created appointment for use in later tests
      testAppointmentId = parseInt(response.body.data.id); 
    });

    it('should return a 400 error if required fields are missing', async () => {
        const response = await request(app)
          .post('/api/appointments')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            vehicleId: testVehicle.id,
            // Missing serviceType, preferredDate, and preferredTime
          });
  
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Vehicle, service type, date, and time are required');
    });

    it('should return a 401 error if no authentication token is provided', async () => {
        const response = await request(app)
          .post('/api/appointments')
          .send({
            vehicleId: testVehicle.id,
            serviceType: 'Tire Rotation',
            preferredDate: '2025-11-21',
            preferredTime: '15:00',
          });
  
        expect(response.status).toBe(401);
    });
  });

  // --- Test Suite for Getting a User's Appointments ---
  describe('GET /api/appointments', () => {
    it('should retrieve a list of appointments for the authenticated user', async () => {
      // This test relies on the appointment created in the POST test above
      const response = await request(app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(parseInt(response.body.data[0].id)).toBe(testAppointmentId);
      expect(response.body.data[0].vehicleName).toBe('2020 Honda Accord');
    });
  });

  // --- Test Suite for Cancelling an Appointment ---
  describe('DELETE /api/appointments/:appointmentId/cancel', () => {
    it('should allow a user to cancel their own appointment', async () => {
      const response = await request(app)
        .delete(`/api/appointments/${testAppointmentId}/cancel`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Appointment cancelled successfully');
      
      // Verify the status in the returned data is 'cancelled'
      expect(response.body.data.status).toBe('cancelled');
    });

    it('should return a 404 error if a user tries to cancel an appointment that does not exist', async () => {
        const nonExistentAppointmentId = 999999;
        const response = await request(app)
          .delete(`/api/appointments/${nonExistentAppointmentId}/cancel`)
          .set('Authorization', `Bearer ${userToken}`);
  
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Appointment not found');
    });
  });
});