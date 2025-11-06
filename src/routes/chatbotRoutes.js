const express = require('express');
const { handleChatMessage } = require('../controllers/chatbotController');

const router = express.Router();

/**
 * POST /api/chatbot/message
 * Send a message to the chatbot
 */
router.post('/message', handleChatMessage);

module.exports = router;
