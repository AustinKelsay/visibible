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

// Generic engine (#175): the exact rendering snapshot a request was accepted with, persisted
// before the image-provider attempt, and the provenance saved with each new generic image.
const engineCanonRefValidator = v.object({ entryId: v.string(), stageId: v.string(), version: v.string() });
const engineReferenceRefValidator = v.object({
  kind: v.union(v.literal("styleReference"), v.literal("sheet")), id: v.string(), storageId: v.string(), version: v.string(), caption: v.string(),
});
export const renderingPacketValidator = v.object({
  promptVersion: v.string(),
  workId: v.string(),
  momentId: v.string(),
  sectionId: v.string(),
  eraId: v.string(),
  styleId: v.string(),
  styleVersion: v.string(),
  briefVersion: v.string(),
  lookVersion: v.optional(v.string()),
  planVersion: v.string(),
  // The work's depiction profile (ADR 0010); absent on packets accepted before profiles.
  depictionVersion: v.optional(v.string()),
  canon: v.array(engineCanonRefValidator),
  references: v.array(engineReferenceRefValidator),
  flags: v.object({ variationIncluded: v.boolean(), neighborsIncluded: v.boolean(), styleDetailIncluded: v.boolean(), lookDetailIncluded: v.boolean() }),
  budget: v.object({ maxChars: v.number(), finalChars: v.number() }),
});
export const imageProvenanceValidator = v.object({
  workId: v.string(),
  momentId: v.string(),
  sectionId: v.string(),
  eraId: v.string(),
  styleId: v.string(),
  styleVersion: v.string(),
  briefVersion: v.string(),
  lookVersion: v.optional(v.string()),
  planVersion: v.string(),
  promptVersion: v.string(),
  // The work's depiction profile (ADR 0010); absent on images saved before profiles.
  depictionVersion: v.optional(v.string()),
  analysisGeneration: v.number(),
  canon: v.array(engineCanonRefValidator),
  references: v.array(v.object({ kind: v.union(v.literal("styleReference"), v.literal("sheet")), id: v.string(), version: v.string() })),
  // The reader's selected translation at request time; the saved verse text is the work's reference text.
  requestTranslationId: v.string(),
});

const generationStatusValidator = v.union(
  v.literal("queued"),
  v.literal("planning"),
  v.literal("generating"),
  v.literal("succeeded"),
  v.literal("failed")
);

const bulkGenerationStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("completed"),
  v.literal("cancelled")
);

const bulkGenerationVerseStatusValidator = v.union(
  v.literal("queued"),
  v.literal("generating"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("skipped")
);

const bulkGenerationScopeTypeValidator = v.union(
  v.literal("verses"),
  v.literal("chapters"),
  v.literal("book")
);

const modelCostScopeTypeValidator = v.union(
  v.literal("model"),
  v.literal("provider"),
  v.literal("global")
);

// Analysis storage (#168): everything the engine makes for a work, per deployment.
const analysisSourceValidator = v.union(v.literal("generated"), v.literal("owner"));
const analysisKindValidator = v.union(
  v.literal("section"), v.literal("moment"), v.literal("entry"), v.literal("look"), v.literal("plan"),
);
const analysisInputValidator = v.object({
  kind: v.string(),
  recordId: v.string(),
  version: v.string(),
});
const sectionPayloadValidator = v.object({
  kind: v.literal("section"),
  title: v.string(),
  firstUnit: v.string(),
  lastUnit: v.string(),
  era: v.optional(v.string()),
  cast: v.array(v.object({ entryId: v.string(), stageId: v.string(), named: v.optional(v.boolean()) })),
  // Entries the section names but that are not present; evidence for canon, never drawn.
  mentionedOnly: v.optional(v.array(v.string())),
});
const momentPayloadValidator = v.object({
  kind: v.literal("moment"),
  sectionId: v.string(),
  firstUnit: v.string(),
  lastUnit: v.string(),
});
const canonShowingValidator = v.union(
  v.object({
    effect: v.union(v.literal("light"), v.literal("radiance"), v.literal("cloud"), v.literal("mist"), v.literal("fire")),
    colour: v.union(v.literal("unspecified"), v.literal("white"), v.literal("gold"), v.literal("silver"), v.literal("red"), v.literal("orange"), v.literal("yellow"), v.literal("green"), v.literal("blue"), v.literal("violet"), v.literal("black"), v.literal("multicoloured")),
    brightness: v.union(v.literal("unspecified"), v.literal("faint"), v.literal("soft"), v.literal("bright"), v.literal("brilliant")),
  }),
  v.object({ effect: v.union(v.literal("wind"), v.literal("voice"), v.literal("unseen presence")) }),
);
const entryPayloadValidator = v.object({
  kind: v.literal("entry"),
  name: v.string(),
  entryKind: v.union(v.literal("character"), v.literal("location"), v.literal("object")),
  hasForm: v.optional(v.boolean()),
  // Depiction mode `symbol` (ADR 0010): drawn only as the non-human form its canon describes. Kept with hasForm false,
  // so a deployment from before symbols treats it as a subject without form.
  depiction: v.optional(v.literal("symbol")),
  // Reading-pass evidence carried for canon drafting: other name forms, a one-line note, and the
  // division-local entries ("division:character:id" or "division:location:id") this merged entry came from.
  aliases: v.optional(v.array(v.string())),
  note: v.optional(v.string()),
  members: v.optional(v.array(v.string())),
  // Empty until canon is drafted; a generation with stage-less entries is not structurally valid.
  stages: v.array(v.object({
    id: v.string(),
    text: v.string(),
    label: v.optional(v.string()),
    quotes: v.optional(v.array(v.object({ unit: v.string(), quote: v.string() }))),
    // Optional on historical/owner prose stages; full text remains the rendering canon.
    showing: v.optional(v.array(canonShowingValidator)),
  })),
});
const lookPayloadValidator = v.object({
  kind: v.literal("look"),
  sectionId: v.string(),
  place: v.string(),
  timeOfDay: v.string(),
  weather: v.string(),
  light: v.string(),
  clothing: v.string(),
});
const planPayloadValidator = v.object({
  kind: v.literal("plan"),
  momentId: v.string(),
  entries: v.array(v.object({ entryId: v.string(), stageId: v.string() })),
  plan: scenePlanValidator,
  // Optional for historical plans; new preparation requires reviewed moment conditions.
  situation: v.optional(v.object({ place: v.string(), timeOfDay: v.string(), weather: v.string(), light: v.string(), clothing: v.string() })),
  // Audit-only source choice; historical plans remain readable and saved prompts are unchanged.
  grounding: v.optional(v.object({
    focusQuote: v.string(),
    cast: v.array(v.object({
      entryId: v.string(), momentQuote: v.string(),
      contextSource: v.union(v.literal("none"), v.literal("previous"), v.literal("next")),
      contextQuote: v.string(),
      participation: v.union(v.literal("in_scene"), v.literal("framing"), v.literal("mentioned"), v.literal("separate_event"), v.literal("uncertain")),
    })),
    // Stated chosen instant (moment-cast v4); stored v3 plans have none.
    instant: v.optional(v.string()),
    singleInstant: v.boolean(),
  })),
  // Audit-only plan review (plan-review v2): 1 or 2 rounds, why a first plan was re-planned, and notes.
  review: v.optional(v.object({
    rounds: v.number(),
    evidence: v.optional(v.string()),
    problems: v.optional(v.array(v.object({
      kind: v.union(v.literal("unselected_figure"), v.literal("outside_instant"), v.literal("not_one_instant"), v.literal("embodied_formless"), v.literal("look_conflict"), v.literal("canon_conflict"), v.literal("missing_canon")),
      entryId: v.string(), planQuote: v.string(), reason: v.string(),
    }))),
    // Forgiving preparation (moment-cast v11): automatic selections and problems kept after the re-plan.
    notes: v.optional(v.array(v.string())),
  })),
});
export const analysisPayloadValidator = v.union(
  sectionPayloadValidator, momentPayloadValidator, entryPayloadValidator, lookPayloadValidator, planPayloadValidator,
);
const referenceKindValidator = v.union(v.literal("sheet"), v.literal("styleReference"));
const derivedKindValidator = v.union(v.literal("look"), v.literal("plan"));
export const analysisValidators = {
  source: analysisSourceValidator,
  kind: analysisKindValidator,
  derivedKind: derivedKindValidator,
  referenceKind: referenceKindValidator,
  input: analysisInputValidator,
  payload: analysisPayloadValidator,
  entry: entryPayloadValidator,
};

export default defineSchema({
  maintenanceState: defineTable({
    key: v.string(),
    cursor: v.union(v.string(), v.null()),
    cutoff: v.number(),
    epoch: v.number(),
  }).index("by_key", ["key"]),
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
    // Engine and provenance (#175); absent on historical images, whose source stays unknown.
    engine: v.optional(v.union(v.literal("legacy"), v.literal("generic"))),
    // The art style the image was rendered in (#176); absent on historical images, which read as Classical.
    artStyleId: v.optional(v.string()),
    provenance: v.optional(imageProvenanceValidator),
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
    // Style-leading discovery (#176): does a book or chapter have any image in one style?
    .index("by_artStyle_verse", ["artStyleId", "verseId"])
    .index("by_storageId", ["storageId"])
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
    inputFingerprint: v.optional(v.string()),
    executorVersion: v.optional(v.string()),
    billingPolicyVersion: v.optional(v.string()),
    // Engine binding (#174): decided at admission, immutable for the request's life. Absent on
    // historical requests, which are legacy.
    engine: v.optional(v.union(v.literal("legacy"), v.literal("generic"))),
    artStyleId: v.optional(v.string()),
    engineCommitments: v.optional(v.object({
      workId: v.string(),
      momentId: v.string(),
      briefVersion: v.string(),
      analysisGeneration: v.number(),
      promptVersion: v.string(),
      billingVersion: v.string(),
    })),
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
    renderingPacket: v.optional(renderingPacketValidator),
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
    revokedAt: v.optional(v.number()),
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
    pendingReservation: v.optional(v.boolean()), // Indexed read projection; amounts remain immutable.
    sid: v.string(),
    delta: v.number(), // positive (purchase/refund) or negative (generation)
    reason: v.string(), // "purchase" | "generation" | "refund"
    invoiceId: v.optional(v.string()), // Purchase identity; legacy entries remain unchanged.
    modelId: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    generationId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_sid", ["sid", "createdAt"])
    .index("by_sid_pending", ["sid", "pendingReservation"])
    .index("by_generationId", ["generationId", "sid"])
    .index("by_reason_createdAt", ["reason", "createdAt"])
    .index("by_invoiceId", ["invoiceId"]),

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
    scopeType: modelCostScopeTypeValidator,
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
    // Image reports (#180): the exact saved image, resolved server-side, and the attention item grouping its reports.
    kind: v.optional(v.union(v.literal("general"), v.literal("image"))),
    imageId: v.optional(v.id("verseImages")),
    resolvedImage: v.optional(v.object({
      verseId: v.string(),
      artStyle: v.string(),
      engine: v.optional(v.string()),
      translationId: v.optional(v.string()),
      workId: v.optional(v.string()),
      momentId: v.optional(v.string()),
      provenanceKnown: v.boolean(),
    })),
    attentionId: v.optional(v.id("attentionItems")),
  }).index("by_createdAt", ["createdAt"]).index("by_imageId", ["imageId"]),

  // Bulk image generation jobs
  bulkGenerations: defineTable({
    sid: v.string(),
    status: bulkGenerationStatusValidator,
    scopeType: bulkGenerationScopeTypeValidator,
    scopeLabel: v.string(), // human-readable, e.g. "Next 10 verses"
    startVerseId: v.string(),
    totalVerses: v.number(),
    completedCount: v.number(),
    failedCount: v.number(),
    skippedCount: v.number(),
    totalCreditsUsed: v.number(),
    estimatedTotalCredits: v.number(),
    modelId: v.string(),
    aspectRatio: v.string(),
    resolution: v.string(),
    translation: v.string(),
    // Engine and style binding (#178): the art style chosen at creation and the engine the first
    // admitted item was bound to; neither changes on resume. Jobs without them are legacy Classical.
    engine: v.optional(v.union(v.literal("legacy"), v.literal("generic"))),
    artStyleId: v.optional(v.string()),
    // Why the job is paused when the coordinator did it (engine or style unavailable, limits).
    pausedReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_sid_status", ["sid", "status"])
    .index("by_status", ["status"])
    .index("by_sid_createdAt", ["sid", "createdAt"]),

  // Individual verse entries within a bulk generation job
  bulkGenerationVerses: defineTable({
    bulkGenerationId: v.id("bulkGenerations"),
    verseId: v.string(),
    reference: v.string(),
    order: v.number(),
    status: bulkGenerationVerseStatusValidator,
    creditsCost: v.optional(v.number()),
    error: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_bulk_order", ["bulkGenerationId", "order"])
    .index("by_bulk_verse", ["bulkGenerationId", "verseId"])
    .index("by_bulk_status", ["bulkGenerationId", "status"]),

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

  // Analysis storage (#168). Owner-authored inputs (work file, brief, styles) are repo files; these
  // tables hold what the engine makes for a work in this deployment, versioned by content hash.
  works: defineTable({
    workId: v.string(),
    // Content versions of the deployed repo inputs, registered by the server.
    workVersion: v.optional(v.string()),
    briefVersion: v.optional(v.string()),
    activeGeneration: v.optional(v.number()),
    candidateGeneration: v.optional(v.number()),
    // After a wipe that kept owner versions: the generation whose owner versions the next activation carries forward.
    ownerVersionsFrom: v.optional(v.number()),
    nextGeneration: v.number(),
    updatedAt: v.number(),
  }).index("by_workId", ["workId"]),

  analysisGenerations: defineTable({
    workId: v.string(),
    generation: v.number(),
    status: v.union(v.literal("candidate"), v.literal("active"), v.literal("retired"), v.literal("abandoned")),
    workVersion: v.string(),
    briefVersion: v.string(),
    note: v.optional(v.string()),
    createdAt: v.number(),
    activatedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    // New generations validate moment anchors/section links while staging, and maintain counts
    // without rescanning every fixed unit. Absence preserves validation of older candidates.
    recordCounts: v.optional(v.record(v.string(), v.number())),
  })
    .index("by_work_generation", ["workId", "generation"])
    .index("by_work_status", ["workId", "status"]),

  analysisRecords: defineTable({
    workId: v.string(),
    generation: v.number(),
    kind: analysisKindValidator,
    // Stable id: entries by slug, sections and moments by their first unit, looks by section, plans by moment.
    recordId: v.string(),
    version: v.string(),
    source: analysisSourceValidator,
    // The exact input versions this record was made from.
    inputs: v.array(analysisInputValidator),
    payload: analysisPayloadValidator,
    status: v.union(v.literal("current"), v.literal("superseded"), v.literal("retired")),
    createdAt: v.number(),
  })
    .index("by_work_generation_kind_recordId", ["workId", "generation", "kind", "recordId"])
    .index("by_work_generation_status", ["workId", "generation", "status"])
    .index("by_work_generation_kind_status", ["workId", "generation", "kind", "status"])
    .index("by_work_generation_source_status", ["workId", "generation", "source", "status"])
    .index("by_work_kind_recordId", ["workId", "kind", "recordId"]),

  referenceImages: defineTable({
    workId: v.string(),
    kind: referenceKindValidator,
    // Sheets: "<entryId>:<stageId>"; style references: the style id.
    recordId: v.string(),
    storageId: v.id("_storage"),
    inputs: v.array(analysisInputValidator),
    fingerprint: v.string(),
    verdict: v.optional(v.string()),
    notes: v.optional(v.array(v.string())),
    pinned: v.boolean(),
    status: v.union(v.literal("current"), v.literal("superseded")),
    createdAt: v.number(),
  })
    .index("by_work_kind_recordId", ["workId", "kind", "recordId"])
    .index("by_work_status", ["workId", "status"]),

  // Lazy preparation (#171): who is making a look or plan right now, so concurrent misses across
  // server instances do not each fund the same call, and what owner preparation has cost.
  preparationClaims: defineTable({
    workId: v.string(),
    kind: analysisKindValidator,
    recordId: v.string(),
    holder: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_work_kind_recordId", ["workId", "kind", "recordId"]),

  preparationLedger: defineTable({
    workId: v.string(),
    kind: v.string(),
    recordId: v.string(),
    model: v.string(),
    costUsd: v.optional(v.number()),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    elapsedMs: v.optional(v.number()),
    outcome: v.string(),
    createdAt: v.number(),
  }).index("by_work_createdAt", ["workId", "createdAt"]),

  attentionItems: defineTable({
    workId: v.string(),
    reason: v.string(),
    kind: v.optional(v.string()),
    recordId: v.optional(v.string()),
    generation: v.optional(v.number()),
    detail: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("closed")),
    disposition: v.optional(v.string()),
    count: v.number(),
    createdAt: v.number(),
    lastActivityAt: v.number(),
    closedAt: v.optional(v.number()),
    // Reader image reports (#180): the saved image, every message with its time, the lifecycle, and how it was last closed.
    imageId: v.optional(v.id("verseImages")),
    reports: v.optional(v.array(v.object({ at: v.number(), message: v.string() }))),
    history: v.optional(v.array(v.object({ at: v.number(), event: v.string(), disposition: v.optional(v.string()), detail: v.optional(v.string()) }))),
    closure: v.optional(v.object({
      at: v.number(),
      disposition: v.string(),
      correction: v.optional(v.object({ kind: v.string(), recordId: v.string(), version: v.string() })),
      check: v.optional(v.string()),
    })),
  })
    .index("by_work_status", ["workId", "status"])
    .index("by_work_reason_kind_recordId", ["workId", "reason", "kind", "recordId"]),
});
