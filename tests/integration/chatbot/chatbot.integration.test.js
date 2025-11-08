// tests/integration/chatbot/chatbot.integration.test.js
const request = require('supertest');
const app = require('../../../src/server'); // Import your testable server

describe('Chatbot API - /api/chatbot/message', () => {

  // Test case for an appointment query
  // We give this test a longer timeout because it's making a real network call to an AI service.
  it('should process an appointment query and return an intent and date', async () => {
    const response = await request(app)
      .post('/api/chatbot/message')
      .send({
        message: 'Can I book an appointment for December 25th 2025?',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    
    const { data } = response.body;
    expect(data.intent).toBe('appointment_query');
    expect(data.date).toBe('2025-12-25'); // Check if the AI correctly parsed the date
    expect(data.reply).toBeDefined(); // Check that a natural language reply was generated
    expect(Array.isArray(data.availableSlots)).toBe(true); // Check that it tried to find slots
  }, 20000); // 20-second timeout for this specific test

  // Test case for a simple greeting
  it('should process a greeting and return the correct intent', async () => {
    const response = await request(app)
      .post('/api/chatbot/message')
      .send({
        message: 'Hello there',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const { data } = response.body;
    expect(data.intent).toBe('greeting');
    expect(data.date).toBeNull();
    expect(data.reply).toBeDefined();
    // A simple greeting should not return any time slots
    expect(data.availableSlots).toBeNull();
  }, 10000); // 10-second timeout

  // Test case for invalid input
  it('should return a 400 Bad Request error if the message is empty', async () => {
    const response = await request(app)
      .post('/api/chatbot/message')
      .send({
        message: '', // Sending an empty message
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Message is required');
  });

  it('should return a 400 Bad Request error if the message key is missing', async () => {
    const response = await request(app)
      .post('/api/chatbot/message')
      .send({
        // No 'message' key at all
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Message is required');
  });
});