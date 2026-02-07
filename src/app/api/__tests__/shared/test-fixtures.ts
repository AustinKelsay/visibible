/**
 * Test fixtures for API route integration tests.
 * Provides reusable session, model, and message data.
 */

export const fixtures = {
  sessions: {
    paidWithCredits: {
      sid: "paid-test-session",
      tier: "paid" as const,
      credits: 100,
      createdAt: Date.now() - 1000,
      lastSeenAt: Date.now(),
      dailySpendUsd: 0,
      dailySpendLimitUsd: 5.0,
    },
    paidLowCredits: {
      sid: "paid-low-credits",
      tier: "paid" as const,
      credits: 5,
      createdAt: Date.now() - 1000,
      lastSeenAt: Date.now(),
      dailySpendUsd: 0,
      dailySpendLimitUsd: 5.0,
    },
    paidAtDailyLimit: {
      sid: "paid-daily-limit",
      tier: "paid" as const,
      credits: 100,
      createdAt: Date.now() - 1000,
      lastSeenAt: Date.now(),
      dailySpendUsd: 4.99,
      dailySpendLimitUsd: 5.0,
    },
    admin: {
      sid: "admin-test-session",
      tier: "admin" as const,
      credits: 0,
      createdAt: Date.now() - 1000,
      lastSeenAt: Date.now(),
      dailySpendUsd: 0,
      dailySpendLimitUsd: Infinity,
    },
    insufficientCredits: {
      sid: "insufficient-credits",
      tier: "paid" as const,
      credits: 0,
      createdAt: Date.now() - 1000,
      lastSeenAt: Date.now(),
      dailySpendUsd: 0,
      dailySpendLimitUsd: 5.0,
    },
  },

  models: {
    chat: {
      cheap: {
        id: "test/cheap-model",
        pricing: { prompt: "0.001", completion: "0.002" },
      },
      expensive: {
        id: "test/expensive-model",
        pricing: { prompt: "100", completion: "200" },
      },
      free: {
        id: "test/free-model:free",
        pricing: { prompt: "0", completion: "0" },
      },
    },
    image: {
      standard: {
        id: "google/gemini-2.0-flash-exp:free",
        pricing: { imageOutput: "0.01" }, // ~13 credits, ~455 with 35x
      },
      gemini: {
        id: "google/gemini-2.5-flash-image",
        pricing: { imageOutput: "0.02" },
      },
      nonGemini: {
        id: "openai/dall-e-3",
        pricing: { imageOutput: "0.04" },
      },
    },
  },

  messages: {
    valid: [
      {
        id: "msg-1",
        role: "user" as const,
        parts: [{ type: "text", text: "Hello, how are you?" }],
      },
    ],
    withAssistant: [
      {
        id: "msg-1",
        role: "user" as const,
        parts: [{ type: "text", text: "Hello" }],
      },
      {
        id: "msg-2",
        role: "assistant" as const,
        parts: [{ type: "text", text: "Hi there!" }],
      },
      {
        id: "msg-3",
        role: "user" as const,
        parts: [{ type: "text", text: "Tell me about Genesis 1:1" }],
      },
    ],
    empty: [
      {
        id: "msg-empty",
        role: "user" as const,
        parts: [{ type: "text", text: "" }],
      },
    ],
  },

  context: {
    verse: {
      book: "Genesis",
      chapter: 1,
      verseRange: "1",
      verses: [{ number: 1, text: "In the beginning God created the heaven and the earth." }],
    },
    withNavigation: {
      book: "Genesis",
      chapter: 1,
      verseRange: "2",
      verses: [{ number: 2, text: "And the earth was without form, and void." }],
      prevVerse: {
        number: 1,
        text: "In the beginning God created the heaven and the earth.",
      },
      nextVerse: {
        number: 3,
        text: "And God said, Let there be light: and there was light.",
      },
    },
  },

  imageGeneration: {
    validParams: {
      text: "In the beginning God created the heaven and the earth.",
      reference: "Genesis 1:1",
      model: "google/gemini-2.0-flash-exp:free",
    },
    withContext: {
      text: "And the earth was without form, and void.",
      reference: "Genesis 1:2",
      model: "google/gemini-2.5-flash-image",
      prevVerse: JSON.stringify({
        number: 1,
        text: "In the beginning God created the heaven and the earth.",
      }),
      nextVerse: JSON.stringify({
        number: 3,
        text: "And God said, Let there be light: and there was light.",
      }),
    },
  },
};

export type Session = typeof fixtures.sessions.paidWithCredits | typeof fixtures.sessions.admin;
export type ChatModel = typeof fixtures.models.chat.cheap;
export type ImageModel = typeof fixtures.models.image.standard;
