import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const verseContextValidator = v.object({
  number: v.number(),
  text: v.string(),
  reference: v.optional(v.string()),
});

const scenePlanValidator = v.object({
  primarySubject: v.string(),
  action: v.string(),
  setting: v.string(),
  secondaryElements: v.optional(v.string()),
  mood: v.optional(v.string()),
  timeOfDay: v.optional(v.string()),
  composition: v.optional(v.string()),
});

const promptInputsValidator = v.object({
  reference: v.optional(v.string()),
  aspectRatio: v.optional(v.string()),
  styleProfileId: v.optional(v.string()),
  scenePlan: v.optional(scenePlanValidator),
  generationNumber: v.optional(v.number()),
  prevVerse: v.optional(verseContextValidator),
  nextVerse: v.optional(verseContextValidator),
});

const continuityHintsValidator = v.object({
  previous: v.optional(v.string()),
  next: v.optional(v.string()),
});

const promptPacketValidator = v.object({
  verseId: v.string(),
  translationId: v.string(),
  reference: v.string(),
  currentVerse: v.string(),
  styleProfileId: v.string(),
  aspectRatio: v.string(),
  resolution: v.string(),
  chapterTheme: v.optional(
    v.object({
      setting: v.string(),
      palette: v.string(),
      elements: v.string(),
      style: v.string(),
    })
  ),
  continuity: v.optional(continuityHintsValidator),
  scenePlan: v.optional(scenePlanValidator),
  flags: v.object({
    scenePlannerUsed: v.boolean(),
    scenePlanFromCache: v.boolean(),
    narrativeContextIncluded: v.boolean(),
    generationNoteIncluded: v.boolean(),
  }),
  budget: v.object({
    maxChars: v.number(),
    finalChars: v.number(),
  }),
});

const generationStatusValidator = v.union(
  v.literal("queued"),
  v.literal("planning"),
  v.literal("generating"),
  v.literal("succeeded"),
  v.literal("failed")
);

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
    // Nostr publishing metadata
    nostrEventId: v.optional(v.string()),
    nostrPublishedAt: v.optional(v.number()),
    nostrRelays: v.optional(v.array(v.string())),
    // Local impression data used for scheduled Nostr ranking
    impressionCount: v.optional(v.number()),
    lastImpressionAt: v.optional(v.number()),
  })
    // Index for querying all images for a verse sorted by creation time
    .index("by_verse", ["verseId", "createdAt"])
    .index("by_generationId", ["generationId"])
    .index("by_createdAt", ["createdAt"]),

  // Singleton scheduler state for recurring Nostr publishing windows.
  nostrPublishingState: defineTable({
    key: v.string(),
    lastProcessedWindowStart: v.optional(v.number()),
    processingWindowStart: v.optional(v.number()),
    processingStartedAt: v.optional(v.number()),
    processingImageId: v.optional(v.id("verseImages")),
    lastOutcome: v.optional(v.string()),
    lastPublishedImageId: v.optional(v.id("verseImages")),
    lastPublishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // Request lifecycle for image generation to support progress sync and observability
  imageGenerationRequests: defineTable({
    requestId: v.string(),
    sid: v.string(),
    verseId: v.string(),
    translationId: v.optional(v.string()),
    reference: v.optional(v.string()),
    modelId: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    status: generationStatusValidator,
    error: v.optional(v.string()),
    promptVersion: v.optional(v.string()),
    promptPacket: v.optional(promptPacketValidator),
    scenePlannerModel: v.optional(v.string()),
    scenePlannerUsed: v.optional(v.boolean()),
    scenePlanFromCache: v.optional(v.boolean()),
    usedFallbackEstimate: v.optional(v.boolean()),
    generationId: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    estimatedCreditsCost: v.optional(v.number()),
    actualCreditsCost: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
    actualCostUsd: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_requestId", ["requestId"])
    .index("by_verse_createdAt", ["verseId", "createdAt"])
    .index("by_sid_createdAt", ["sid", "createdAt"])
    .index("by_status_updatedAt", ["status", "updatedAt"]),

  // Cached scene planner outputs keyed by verse/translation/style profile.
  scenePlanCache: defineTable({
    verseId: v.string(),
    translationId: v.string(),
    styleProfileId: v.string(),
    scenePlan: scenePlanValidator,
    plannerModel: v.optional(v.string()),
    promptVersion: v.optional(v.string()),
    hitCount: v.number(),
    lastUsedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["verseId", "translationId", "styleProfileId"])
    .index("by_lastUsedAt", ["lastUsedAt"]),

  // Durable outbox for image cost events that failed to persist in real-time.
  costEventOutbox: defineTable({
    eventType: v.string(), // "image_generation_cost"
    payload: v.any(),
    status: v.string(), // "pending" | "processing" | "processed" | "failed"
    attemptCount: v.number(),
    nextRetryAt: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_status_nextRetryAt", ["status", "nextRetryAt"])
    .index("by_createdAt", ["createdAt"]),

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
    .index("by_generationId", ["generationId", "sid"])
    .index("by_reason_createdAt", ["reason", "createdAt"]),

  // Model generation statistics for ETA estimation
  modelStats: defineTable({
    modelId: v.string(),
    count: v.number(),
    avgMs: v.number(), // Exponential moving average
    p50Ms: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_modelId", ["modelId"]),

  // Learned image-credit estimates based on recent actual generation costs.
  modelCostStats: defineTable({
    scopeType: v.string(), // "model" | "provider" | "global"
    scopeValue: v.string(), // modelId, provider ID, or "global"
    resolution: v.string(),
    sampleCredits: v.array(v.number()),
    sampleCount: v.number(),
    estimateCredits: v.number(),
    lastActualCredits: v.number(),
    updatedAt: v.number(),
  }).index("by_scope_resolution", ["scopeType", "scopeValue", "resolution"]),

  // Rate limiting for API endpoints
  rateLimits: defineTable({
    identifier: v.string(), // Session ID or IP hash
    endpoint: v.string(), // API endpoint name (e.g., "chat", "generate-image")
    count: v.number(), // Number of requests in current window
    windowStart: v.number(), // Start of current time window (ms timestamp)
  })
    .index("by_identifier_endpoint", ["identifier", "endpoint"])
    .index("by_windowStart", ["windowStart"]),

  // Admin login attempt tracking for brute force protection
  adminLoginAttempts: defineTable({
    ipHash: v.string(),
    attemptCount: v.number(),
    lastAttempt: v.number(),
    lockedUntil: v.optional(v.number()), // If set, account is locked until this timestamp
    lockoutCount: v.optional(v.number()), // Number of times locked out (for exponential backoff)
  })
    .index("by_ipHash", ["ipHash"])
    .index("by_lastAttempt", ["lastAttempt"]),

  // User feedback submissions
  feedback: defineTable({
    sid: v.optional(v.string()), // Session ID (for rate limiting context)
    message: v.string(), // Feedback text content
    verseContext: v.optional(
      v.object({
        book: v.optional(v.string()),
        chapter: v.optional(v.number()),
        verseRange: v.optional(v.string()),
      })
    ),
    imageContext: v.optional(
      v.object({
        imageId: v.optional(v.string()), // Convex image ID
        model: v.optional(v.string()), // AI model used (e.g., "google/gemini-2.5-flash-image")
        provider: v.optional(v.string()), // Provider name (e.g., "Google")
        aspectRatio: v.optional(v.string()), // e.g., "16:9"
        dimensions: v.optional(v.string()), // e.g., "1248 × 832"
        creditsCost: v.optional(v.number()), // Credits charged for generation
        costUsd: v.optional(v.number()), // USD cost
        durationMs: v.optional(v.number()), // Generation time in ms
        createdAt: v.optional(v.number()), // Image creation timestamp
      })
    ),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  // SECURITY: Admin usage audit log for tracking admin API usage
  // Admin bypasses credit checks, so we log separately for visibility
  adminAuditLog: defineTable({
    sid: v.string(), // Admin session ID
    endpoint: v.string(), // "chat" | "generate-image"
    modelId: v.string(), // Model used
    estimatedCredits: v.number(), // What it would have cost
    estimatedCostUsd: v.number(), // USD equivalent
    createdAt: v.number(),
  })
    .index("by_sid", ["sid", "createdAt"])
    .index("by_createdAt", ["createdAt"]),
});
