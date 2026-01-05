import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const verseContextValidator = v.object({
  number: v.number(),
  text: v.string(),
  reference: v.optional(v.string()),
});

const promptInputsValidator = v.object({
  reference: v.optional(v.string()),
  aspectRatio: v.optional(v.string()),
  generationNumber: v.optional(v.number()),
  prevVerse: v.optional(verseContextValidator),
  nextVerse: v.optional(verseContextValidator),
});

export default defineSchema({
  verseImages: defineTable({
    // Verse identifier (lowercase, e.g., "genesis-1-1")
    verseId: v.string(),
    // External image URL (for small URLs from OpenRouter)
    imageUrl: v.optional(v.string()),
    // Convex storage ID (for uploaded images, including base64 data)
    storageId: v.optional(v.id("_storage")),
    // Prompt used for generating the image
    prompt: v.optional(v.string()),
    // Reference and inputs used for generation
    reference: v.optional(v.string()),
    verseText: v.optional(v.string()),
    chapterTheme: v.optional(
      v.object({
        setting: v.string(),
        palette: v.string(),
        elements: v.string(),
        style: v.string(),
      })
    ),
    generationNumber: v.optional(v.number()),
    promptVersion: v.optional(v.string()),
    promptInputs: v.optional(promptInputsValidator),
    translationId: v.optional(v.string()),
    provider: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    // Cost and performance metadata
    creditsCost: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    aspectRatio: v.optional(v.string()),
    // Image metadata
    sourceImageUrl: v.optional(v.string()),
    imageMimeType: v.optional(v.string()),
    imageSizeBytes: v.optional(v.number()),
    imageWidth: v.optional(v.number()),
    imageHeight: v.optional(v.number()),
    // The model that generated this image
    model: v.string(),
    // Timestamp for ordering (most recent first)
    createdAt: v.number(),
    // Generation ID for idempotency
    generationId: v.optional(v.string()),
  })
    // Index for querying all images for a verse sorted by creation time
    .index("by_verse", ["verseId", "createdAt"])
    .index("by_generationId", ["generationId"]),

  // Anonymous sessions with credit balances
  sessions: defineTable({
    sid: v.string(),
    tier: v.string(), // "paid" | "admin"
    credits: v.number(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    lastIpHash: v.optional(v.string()),
    flags: v.optional(v.array(v.string())),
    // Daily spending cap (security feature to prevent API cost abuse)
    dailySpendUsd: v.optional(v.number()), // USD spent in current day
    dailySpendLimitUsd: v.optional(v.number()), // Max USD per day (default $5)
    lastDayReset: v.optional(v.number()), // Timestamp of last daily reset (UTC midnight)
    // Session expiration (90 days from last activity)
    expiresAt: v.optional(v.number()),
  })
    .index("by_sid", ["sid"])
    .index("by_expiresAt", ["expiresAt"]),

  // Lightning invoices for credit purchases
  invoices: defineTable({
    invoiceId: v.string(),
    sid: v.string(),
    amountUsd: v.number(),
    amountSats: v.number(),
    bolt11: v.string(),
    status: v.string(), // "pending" | "paid" | "expired" | "failed"
    createdAt: v.number(),
    paidAt: v.optional(v.number()),
    expiresAt: v.number(),
    paymentHash: v.optional(v.string()),
  })
    .index("by_sid", ["sid"])
    .index("by_invoiceId", ["invoiceId"])
    .index("by_paymentHash", ["paymentHash"]),

  // Credit transaction ledger for auditing
  creditLedger: defineTable({
    sid: v.string(),
    delta: v.number(), // positive (purchase/refund) or negative (generation)
    reason: v.string(), // "purchase" | "generation" | "refund"
    modelId: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    generationId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_sid", ["sid", "createdAt"])
    .index("by_generationId", ["generationId", "sid"]),

  // Model generation statistics for ETA estimation
  modelStats: defineTable({
    modelId: v.string(),
    count: v.number(),
    avgMs: v.number(), // Exponential moving average
    p50Ms: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_modelId", ["modelId"]),

  // Rate limiting for API endpoints
  rateLimits: defineTable({
    identifier: v.string(), // Session ID or IP hash
    endpoint: v.string(), // API endpoint name (e.g., "chat", "generate-image")
    count: v.number(), // Number of requests in current window
    windowStart: v.number(), // Start of current time window (ms timestamp)
  }).index("by_identifier_endpoint", ["identifier", "endpoint"]),

  // Admin login attempt tracking for brute force protection
  adminLoginAttempts: defineTable({
    ipHash: v.string(),
    attemptCount: v.number(),
    lastAttempt: v.number(),
    lockedUntil: v.optional(v.number()), // If set, account is locked until this timestamp
  }).index("by_ipHash", ["ipHash"]),
});
