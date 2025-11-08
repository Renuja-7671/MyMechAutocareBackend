const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { PromptTemplate } = require("@langchain/core/prompts");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Initialize Gemini model through LangChain
const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-pro",
  apiKey: process.env.GEMINI_API_KEY,
  temperature: 0.7,
});

/**
 * Extract date information from user message
 * @param {string} userMessage - The user's natural language message
 * @returns {Promise<{date: string|null, intent: string}>}
 */
async function extractDateAndIntent(userMessage) {
  const extractionPrompt = PromptTemplate.fromTemplate(`
You are an AI assistant for an automobile service center. Your job is to understand customer messages about appointments.

Analyze the following message and extract:
1. The date they want an appointment (in YYYY-MM-DD format)
2. The intent (appointment_query, greeting, general_question, other)

Current date: {currentDate}

Customer message: "{message}"

Respond in JSON format:
{{
  "intent": "appointment_query" or "greeting" or "general_question" or "other",
  "date": "YYYY-MM-DD" or null,
  "userFriendlyDate": "the date in friendly format" or null
}}

Examples:
- "I need an appointment for tomorrow" -> {{"intent": "appointment_query", "date": "2025-11-07", "userFriendlyDate": "tomorrow"}}
- "Can I schedule for Dec 15?" -> {{"intent": "appointment_query", "date": "2025-12-15", "userFriendlyDate": "December 15th"}}
- "Hello" -> {{"intent": "greeting", "date": null, "userFriendlyDate": null}}
- "What services do you offer?" -> {{"intent": "general_question", "date": null, "userFriendlyDate": null}}

Return ONLY the JSON object, no other text.
`);

  const chain = extractionPrompt.pipe(model);

  const currentDate = new Date().toISOString().split("T")[0];
  const response = await chain.invoke({
    message: userMessage,
    currentDate: currentDate,
  });

  try {
    // Parse the JSON response from the model
    const content = response.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { intent: "other", date: null, userFriendlyDate: null };
  } catch (error) {
    console.error("Error parsing date extraction:", error);
    return { intent: "other", date: null, userFriendlyDate: null };
  }
}

/**
 * Get available time slots for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<string[]>} - Array of available time slots
 */
async function getAvailableTimeSlots(date) {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all appointments for the requested date
    const existingAppointments = await prisma.appointment.findMany({
      where: {
        scheduledDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          not: "cancelled",
        },
      },
      select: {
        scheduledDate: true,
      },
    });

    // Define business hours (9 AM to 5 PM with 1-hour slots)
    const businessHours = [
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
    ];

    // Get booked time slots
    const bookedSlots = existingAppointments.map((apt) => {
      const time = new Date(apt.scheduledDate);
      return `${time.getHours().toString().padStart(2, "0")}:${time
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
    });

    // Filter out booked slots
    const availableSlots = businessHours.filter(
      (slot) => !bookedSlots.includes(slot)
    );

    return availableSlots;
  } catch (error) {
    console.error("Error fetching time slots:", error);
    throw error;
  }
}

/**
 * Generate a natural language response with available time slots
 * @param {string[]} timeSlots - Available time slots
 * @param {string} date - The requested date
 * @param {string} userFriendlyDate - User-friendly date format
 * @returns {Promise<string>}
 */
async function generateTimeSlotResponse(timeSlots, date, userFriendlyDate) {
  const responsePrompt = PromptTemplate.fromTemplate(`
You are a friendly assistant at WheelsDoc Autocare automobile service center.

The customer asked about appointments for {userFriendlyDate} ({date}).

Available time slots: {slots}

Generate a friendly, natural response that:
1. Confirms the date they asked about
2. Lists the available time slots
3. Asks them to choose a time slot
4. Is warm and professional

Keep it concise and conversational.
`);

  const chain = responsePrompt.pipe(model);

  const slotsText =
    timeSlots.length > 0
      ? timeSlots.join(", ")
      : "Unfortunately, there are no available slots";

  const response = await chain.invoke({
    date: date,
    userFriendlyDate: userFriendlyDate || date,
    slots: slotsText,
  });

  return response.content;
}

/**
 * Generate a response for non-appointment queries
 * @param {string} userMessage - The user's message
 * @param {string} intent - The detected intent
 * @returns {Promise<string>}
 */
async function generateGeneralResponse(userMessage, intent) {
  const generalPrompt = PromptTemplate.fromTemplate(`
You are a helpful assistant at an automobile service center.

Customer message: "{message}"
Intent: {intent}

Generate a friendly, helpful response. Keep it concise.

If it's a greeting, greet them back and mention you can help with appointments.
If it's a general question about services, mention common services (oil change, brake repair, tire service, engine diagnostics) and ask if they'd like to schedule an appointment.
For other queries, be helpful and guide them toward booking an appointment.
`);

  const chain = generalPrompt.pipe(model);

  const response = await chain.invoke({
    message: userMessage,
    intent: intent,
  });

  return response.content;
}

/**
 * Main chatbot processing function
 * @param {string} userMessage - The customer's message
 * @returns {Promise<{reply: string, intent: string, availableSlots: string[]|null}>}
 */
async function processChatMessage(userMessage) {
  try {
    // Step 1: Extract intent and date from user message
    const { intent, date, userFriendlyDate } = await extractDateAndIntent(
      userMessage
    );

    // Step 2: Handle appointment queries
    if (intent === "appointment_query" && date) {
      const availableSlots = await getAvailableTimeSlots(date);
      const reply = await generateTimeSlotResponse(
        availableSlots,
        date,
        userFriendlyDate
      );

      return {
        reply,
        intent,
        availableSlots,
        date,
      };
    }

    // Step 3: Handle other queries
    const reply = await generateGeneralResponse(userMessage, intent);

    return {
      reply,
      intent,
      availableSlots: null,
      date: null,
    };
  } catch (error) {
    console.error("Error processing chat message:", error);
    throw error;
  }
}

module.exports = {
  processChatMessage,
  getAvailableTimeSlots,
};
