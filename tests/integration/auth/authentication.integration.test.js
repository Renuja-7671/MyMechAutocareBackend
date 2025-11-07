// tests/integration/auth/authentication.integration.test.js
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../../../src/server'); // Import your testable server

const prisma = new PrismaClient();

describe('Authentication API - /api/auth', () => {
  // Before each test in this suite, clean the database to ensure isolation
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  // After all tests, disconnect from the database
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // --- Test Suite for User Registration ---
  describe('POST /api/auth/register', () => {
    it('should register a new user successfully and return 201', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@test.com',
          password: 'password123',
          name: 'Test User',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User registered successfully');
    });

    it('should fail to register a user with an email that is already taken and return 400', async () => {
      // First, create a user
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'duplicate@test.com', password: 'password123', name: 'First User' });

      // Then, attempt to register with the same email
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'duplicate@test.com', password: 'password456', name: 'Second User' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User already exists with this email');
    });

    it('should fail to register if required validation fails (e.g., invalid email) and return 400', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email', // Invalid email
          password: '123', // Password is too short based on your validation rules
          name: 'Test',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(Array.isArray(response.body.errors)).toBe(true);
      // Check that it caught both validation errors
      expect(response.body.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --- Test Suite for User Login ---
  describe('POST /api/auth/login', () => {
    // Before this suite, we need a user to log in with
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'loginuser@test.com', password: 'password123', name: 'Login User' });
    });

    it('should log in a user with correct credentials and return a token', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'loginuser@test.com',
          password: 'password123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Check that a JWT token is present in the response
      expect(response.body.data.token).toBeDefined();
      expect(typeof response.body.data.token).toBe('string');
    });

    it('should fail to log in with an incorrect password and return 401', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'loginuser@test.com',
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should fail to log in with a non-existent email and return 401', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'no-one@test.com',
          password: 'password123',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  // --- Test Suite for Getting User Profile ---
  describe('GET /api/auth/profile', () => {
    let authToken;
    // Before this suite, register and log in a user to get a valid token
    beforeEach(async () => {
        await request(app)
            .post('/api/auth/register')
            .send({ email: 'profileuser@test.com', password: 'password123', name: 'Profile User' });

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'profileuser@test.com', password: 'password123' });
        
        authToken = loginRes.body.data.token;
    });

    it('should get the user profile with a valid token and return 200', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe('profileuser@test.com');
      expect(response.body.user.name).toBe('Profile User');
    });

    it('should fail to get the profile if no token is provided and return 401', async () => {
      const response = await request(app)
        .get('/api/auth/profile'); // No token sent

      expect(response.status).toBe(401);
    });

    it('should fail to get the profile if the token is invalid or malformed and return 403', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer this-is-not-a-real-token');

      expect(response.status).toBe(403);
    });
  });
});