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
 * Helper function to format hour for display
 */
function formatHourDisplay(hour) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:00 ${period}`;
}

/**
 * Get available time slots for a specific date
 * Uses the same business hours logic as the appointment booking system:
 * - Weekdays (Mon-Fri): 9:00 AM - 6:00 PM
 * - Saturday: 8:00 AM - 7:00 PM
 * - Sunday: CLOSED
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<string[]>} - Array of available time slots in 12-hour format
 */
async function getAvailableTimeSlots(date) {
  try {
    const selectedDate = new Date(date);
    const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Check if Sunday (closed)
    if (dayOfWeek === 0) {
      return [];
    }

    // Define business hours based on day
    let startHour, endHour;
    if (dayOfWeek === 6) {
      // Saturday
      startHour = 8;
      endHour = 19; // 7 PM (19:00)
    } else {
      // Weekdays (Monday-Friday)
      startHour = 9;
      endHour = 18; // 6 PM (18:00)
    }

    // Generate all possible time slots
    const allSlots = [];
    for (let hour = startHour; hour < endHour; hour++) {
      allSlots.push({
        hour,
        time: `${hour.toString().padStart(2, '0')}:00`,
        display: formatHourDisplay(hour),
      });
    }

    // Get existing appointments for the selected date
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        scheduledDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          in: ['scheduled', 'confirmed', 'in_progress'],
        },
      },
      select: {
        scheduledDate: true,
      },
    });

    // Extract booked hours
    const bookedHours = existingAppointments.map((apt) => {
      return new Date(apt.scheduledDate).getHours();
    });

    // Filter out booked slots and return display format
    const availableSlots = allSlots
      .filter((slot) => !bookedHours.includes(slot.hour))
      .map((slot) => slot.display);

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
  const selectedDate = new Date(date);
  const dayOfWeek = selectedDate.getDay();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];

  // Check if Sunday
  if (dayOfWeek === 0) {
    const responsePrompt = PromptTemplate.fromTemplate(`
You are a friendly assistant at an automobile service center.

The customer asked about appointments for {userFriendlyDate} ({dayName}).

Generate a friendly response explaining that:
1. The service station is closed on Sundays
2. Ask them to choose a weekday (Monday-Friday, 9 AM - 6 PM) or Saturday (8 AM - 7 PM)
3. Offer to help them find available slots for another day

IMPORTANT RULES:
- Respond with PLAIN TEXT ONLY, NO markdown formatting
- Do NOT use asterisks (*), bullet points, headers, or any markdown syntax
- Give ONE single conversational response only
- Keep it warm, helpful, and natural

Example: "I apologize, but our service center is closed on Sundays. We're open Monday through Friday from 9 AM to 6 PM, and Saturdays from 8 AM to 7 PM. Would you like me to check available time slots for another day?"
`);

    const chain = responsePrompt.pipe(model);
    const response = await chain.invoke({
      userFriendlyDate: userFriendlyDate || date,
      dayName: dayName,
    });

    return response.content;
  }

  // Determine business hours
  let businessHours;
  if (dayOfWeek === 6) {
    businessHours = '8:00 AM - 7:00 PM';
  } else {
    businessHours = '9:00 AM - 6:00 PM';
  }

  const responsePrompt = PromptTemplate.fromTemplate(`
You are a friendly assistant at an automobile service center.

The customer asked about appointments for {userFriendlyDate} ({dayName}).
Business hours for this day: {businessHours}

Available time slots: {slots}

Generate a SINGLE friendly, natural response that:
1. Confirms the date they asked about
2. Lists the available time slots (these are hourly slots)
3. If no slots available, mention all slots are booked and suggest another day
4. Asks them to choose a time slot if slots are available
5. Is warm and professional

IMPORTANT RULES:
- Respond with PLAIN TEXT ONLY, NO markdown formatting
- Do NOT use asterisks (*), bullet points, headers, or any markdown syntax
- Do NOT include "Scenario 1", "Scenario 2", or any alternative versions
- Give ONE single conversational response only
- Keep it concise and natural

Example format (when slots are available):
"Great! I found several available time slots for {userFriendlyDate}. We have openings at [list times]. Which time works best for you?"

Example format (when no slots available):
"Unfortunately, all our time slots are booked for {userFriendlyDate}. Would you like to check availability for another day?"
`);

  const chain = responsePrompt.pipe(model);

  const slotsText = timeSlots.length > 0
    ? timeSlots.join(', ')
    : 'Unfortunately, all slots are fully booked';

  const response = await chain.invoke({
    date: date,
    userFriendlyDate: userFriendlyDate || date,
    dayName: dayName,
    businessHours: businessHours,
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

IMPORTANT RULES:
- Respond with PLAIN TEXT ONLY, NO markdown formatting
- Do NOT use asterisks (*), bullet points, headers, or any markdown syntax
- Give ONE single conversational response only
- Keep it natural and friendly
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
    // Extract intent and date from user message
    const { intent, date, userFriendlyDate } = await extractDateAndIntent(userMessage);

    // Handle appointment queries
    if (intent === 'appointment_query' && date) {
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

    // Handle other queries
    const reply = await generateGeneralResponse(userMessage, intent);

    return {
      reply,
      intent,
      availableSlots: null,
      date: null,
    };
  } catch (error) {
    console.error("Chatbot service error:", error.message);
    throw error;
  }
}

module.exports = {
  processChatMessage,
  getAvailableTimeSlots,
};
