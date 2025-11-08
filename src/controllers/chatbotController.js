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
    console.error('Chatbot error:', error.message);

    // Provide specific error messages based on error type
    let errorMessage = 'Failed to process message. Please try again.';

    if (error.message && error.message.includes('API key expired')) {
      errorMessage = 'The AI service API key has expired. Please contact the administrator.';
    } else if (error.message && error.message.includes('quota')) {
      errorMessage = 'The AI service quota has been exceeded. Please try again later.';
    } else if (error.message && error.message.includes('overloaded')) {
      errorMessage = 'The AI service is currently overloaded. Please try again in a moment.';
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
}

module.exports = {
  handleChatMessage,
};
