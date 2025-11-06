const { processChatMessage } = require('../services/chatbotService');

/**
 * Handle chat message from customer
 */
async function handleChatMessage(req, res) {
  try {
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    // Process the message through the chatbot service
    const result = await processChatMessage(message);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error in chatbot controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process message. Please try again.',
    });
  }
}

module.exports = {
  handleChatMessage,
};
