/**
 * Unit tests for src/services/chatbotService.js
 * These tests mock Gemini + Prisma to ensure no external calls.
 */

jest.mock("@langchain/google-genai", () => {
  return {
    ChatGoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      invoke: jest.fn().mockResolvedValue({
        content:
          '{"intent":"appointment_query","date":"2025-12-15","userFriendlyDate":"December 15th"}',
      }),
    })),
  };
});

jest.mock("@prisma/client", () => {
  const mFindMany = jest.fn();
  return {
    PrismaClient: jest.fn(() => ({
      appointment: { findMany: mFindMany },
      $disconnect: jest.fn(),
    })),
  };
});

const {
  extractDateAndIntent,
  getAvailableTimeSlots,
  processChatMessage,
} = require("../../../src/services/chatbotService");

describe("chatbotService (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("extractDateAndIntent", () => {
    test("returns parsed intent and date", async () => {
      const result = await extractDateAndIntent(
        "I need an appointment for Dec 15"
      );
      expect(result).toHaveProperty("intent", "appointment_query");
      expect(result).toHaveProperty("date", "2025-12-15");
      expect(result).toHaveProperty("userFriendlyDate");
    });

    test("returns fallback object when parsing fails", async () => {
      // mock invalid response
      const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
      ChatGoogleGenerativeAI.mockImplementation(() => ({
        invoke: jest.fn().mockResolvedValue({ content: "Not JSON" }),
      }));

      const result = await extractDateAndIntent("Random text");
      expect(result.intent).toBe("other");
      expect(result.date).toBeNull();
    });
  });

  describe("getAvailableTimeSlots", () => {
    test("filters out booked time slots", async () => {
      const { PrismaClient } = require("@prisma/client");
      const mockFindMany = jest
        .fn()
        .mockResolvedValue([
          { scheduledDate: new Date("2025-11-10T09:00:00Z") },
        ]);

      PrismaClient.mockImplementation(() => ({
        appointment: { findMany: mockFindMany },
      }));

      const result = await getAvailableTimeSlots("2025-11-10");
      expect(result).toContain("10:00");
      expect(result).not.toContain("09:00");
      expect(mockFindMany).toHaveBeenCalled();
    });
  });

  describe("processChatMessage", () => {
    test("handles appointment query with available slots", async () => {
      const result = await processChatMessage(
        "I need an appointment for tomorrow"
      );
      expect(result).toHaveProperty("intent");
      expect(result).toHaveProperty("availableSlots");
      expect(Array.isArray(result.availableSlots)).toBe(true);
    });

    test("handles non-appointment queries gracefully", async () => {
      const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
      ChatGoogleGenerativeAI.mockImplementation(() => ({
        invoke: jest.fn().mockResolvedValue({
          content: '{"intent":"greeting","date":null,"userFriendlyDate":null}',
        }),
      }));

      const result = await processChatMessage("Hello");
      expect(result.intent).toBe("greeting");
      expect(result.availableSlots).toBeNull();
    });
  });
});
