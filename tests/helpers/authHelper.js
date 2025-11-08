// tests/helpers/authHelper.js
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/**
 * Creates a user with the correct role-specific profile (customer or employee).
 * @param {object} userData - The user data to create.
 * @param {boolean} createProfile - Whether to create the role-specific profile (default: true)
 * @returns {Promise<object>} The created user object with profiles included.
 */
async function createTestUser(userData, createProfile = true) {
  const { email, password, role = 'customer', firstName = 'Test', lastName = 'User' } = userData;

  const passwordHash = await bcrypt.hash(password, 12);

  const data = {
    email,
    passwordHash,
    role,
  };

  // Only create profile if requested
  if (createProfile) {
    if (role === 'employee' || role === 'admin') {
      data.employee = {
        create: {
          firstName,
          lastName,
          hireDate: new Date(),
        },
      };
    } else { // Default to creating a customer profile
      data.customer = {
        create: {
          firstName,
          lastName,
        },
      };
    }
  }

  // Create the user and their associated profile in a single transaction
  const user = await prisma.user.create({
    data,
    include: {
      customer: true,
      employee: true,
    },
  });

  return user;
}

/**
 * Logs in a user by making a request to the login endpoint and returns the auth token.
 * @param {object} app - The Express app instance.
 * @param {string} email - The user's email.
 * @param {string} password - The user's plain text password.
 * @returns {Promise<string>} The JWT authentication token.
 */
async function loginAndGetToken(app, email, password) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  if (response.status !== 200) {
    throw new Error(`Failed to log in. Status: ${response.status}, Body: ${JSON.stringify(response.body)}`);
  }

  const token = response.body.data.token;
  if (!token) {
    throw new Error('Login was successful but no token was returned.');
  }

  return token;
}

module.exports = {
  createTestUser,
  loginAndGetToken,
};