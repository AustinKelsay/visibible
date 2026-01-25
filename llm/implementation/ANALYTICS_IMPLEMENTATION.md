# Analytics Implementation Guide

This document describes the technical implementation of Vercel Analytics in Visibible.

---

## Architecture Overview

Analytics is implemented as:

1. **Analytics Root** (`src/app/layout.tsx`) — `<Analytics />` mounts Vercel Web Analytics
2. **Analytics Library** (`src/lib/analytics.ts`) — Type-safe tracking functions
3. **Verse Analytics Component** (`src/components/verse-analytics.tsx`) — Client component for page view tracking
4. **Inline Tracking** — Direct calls in components and contexts where events occur

---

## Entry Points

| File | Events Tracked |
|------|----------------|
| `src/app/layout.tsx` | Analytics root (`<Analytics />`) |
| `src/lib/analytics.ts` | Type definitions and track functions |
| `src/components/verse-analytics.tsx` | `verse_view` |
| `src/components/hero-image.tsx` | `verse_images_state`, `image_generated`, `credits_insufficient`, `generation_error` |
| `src/context/navigation-context.tsx` | `menu_opened`, `chat_opened` |
| `src/context/preferences-context.tsx` | `preference_changed` |
| `src/context/session-context.tsx` | `credits_modal_opened` |
| `src/components/chat.tsx` | `chat_message_sent`, `credits_insufficient` |
| `src/components/buy-credits-modal.tsx` | `invoice_created`, `payment_completed`, `payment_expired` |

---

## Dependencies

- `@vercel/analytics` — `track()` helper used in `src/lib/analytics.ts`
- `@vercel/analytics/next` — `<Analytics />` component mounted in `src/app/layout.tsx`

## Type System

### BaseProps

All events include these properties for segmentation:

```typescript
type BaseProps = {
  tier: "paid" | "admin";
  hasCredits: boolean;
};
```

### Event-Specific Types

```typescript
// Content consumption
type VerseViewProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  testament: "old" | "new";
  translation: string;
};

// Image inventory state (discriminated union)
type VerseImagesStateProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  testament: "old" | "new";
} & (
  | { imageState: "known"; imageCount: number; hasImages: boolean }
  | { imageState: "unknown" }
);

// Chat engagement
type ChatOpenedProps = BaseProps & {
  variant: "sidebar";
  hasContext: boolean;
};

type ChatMessageSentProps = BaseProps & {
  variant: "sidebar" | "inline";
  chatModel: string;
  messageCount: number;
  hasContext: boolean;
};

// Image generation
type ImageGeneratedProps = BaseProps & {
  imageModel: string;
  aspectRatio: string;
  resolution: string;
  generationNumber: number;
  durationMs?: number;
};

type GenerationErrorProps = BaseProps & {
  imageModel: string;
  errorType: string;
};

// Monetization
type CreditsInsufficientProps = BaseProps & {
  feature: "image" | "chat";
  requiredCredits?: number;
};

type CreditsModalOpenedProps = BaseProps & {
  step: "welcome" | "selection";
};

type InvoiceCreatedProps = BaseProps & {
  amountUsd: number;
};

type PaymentCompletedProps = BaseProps & {
  amountUsd: number;
  credits: number;
};

type PaymentExpiredProps = BaseProps & {
  invoiceAgeSeconds: number;
};

// UI interactions
type MenuOpenedProps = BaseProps;

type PreferenceChangedProps = BaseProps & {
  preference: "translation" | "imageModel" | "chatModel";
  value: string;
};
```

---

## Event Reference

### verse_view

**Location:** `src/components/verse-analytics.tsx`

**When:** Fires once per unique verse+translation after session loads

**Props:**
- `book` — Book name (e.g., "Genesis")
- `chapter` — Chapter number
- `verse` — Verse number
- `testament` — "old" or "new"
- `translation` — Current translation code (e.g., "web")
- `tier`, `hasCredits` — Base props

**Deduplication:** Uses a ref keyed by `book/chapter/verse/testament/translation` to avoid duplicates while still firing on client-side navigation

```typescript
const lastTrackedKeyRef = useRef<string | null>(null);

useEffect(() => {
  if (isLoading) return;
  const trackKey = `${book}-${chapter}-${verse}-${testament}-${translation}`;
  if (lastTrackedKeyRef.current === trackKey) return;
  lastTrackedKeyRef.current = trackKey;

  trackVerseView({
    book, chapter, verse, testament, translation,
    tier,
    hasCredits: credits > 0,
  });
}, [book, chapter, verse, testament, translation, tier, credits, isLoading]);
```

---

### verse_images_state

**Location:** `src/components/hero-image.tsx` (after image history query resolves)

**When:** Fires once per verse after session loads and the Convex image history query completes

**Props (known state — Convex enabled):**
- `book`, `chapter`, `verse`, `testament` — Verse identity
- `imageState` — "known"
- `imageCount` — Number of images for this verse
- `hasImages` — Whether any images exist
- `tier`, `hasCredits` — Base props

**Props (unknown state — Convex disabled):**
- `book`, `chapter`, `verse`, `testament` — Verse identity
- `imageState` — "unknown"
- `tier`, `hasCredits` — Base props

**Why separate from verse_view:**
- `verse_view` fires on page load (server-side data only)
- `verse_images_state` fires after client-side Convex query resolves
- Keeps `verse_view` lightweight and truthful
- Avoids false negatives when Convex is disabled

**Deduplication:** Uses ref keyed by verse to fire once per verse per view

---

### chat_opened

**Location:** `src/context/navigation-context.tsx` (effect on `isChatOpen`)

**When:** `isChatOpen` transitions from `false` → `true`

**Props:**
- `variant` — Always "sidebar" (inline chat has no open action)
- `hasContext` — Whether verse context is available
- `tier`, `hasCredits` — Base props

```typescript
useEffect(() => {
  if (isChatOpen && !prevChatOpenRef.current) {
    trackChatOpened({
      variant: "sidebar",
      hasContext: chatContext !== null,
      tier,
      hasCredits: credits > 0,
    });
  }
  prevChatOpenRef.current = isChatOpen;
}, [isChatOpen, chatContext, tier, credits]);
```

---

### chat_message_sent

**Location:** `src/components/chat.tsx`

**When:** User submits a chat message (fires immediately after `sendMessage`)

**Note:** This is an optimistic event and does not wait for a server response.

**Props:**
- `variant` — "inline" (default) or "sidebar"
- `chatModel` — Selected model ID
- `messageCount` — Number of messages in conversation
- `hasContext` — Whether verse context was included
- `tier`, `hasCredits` — Base props

```typescript
trackChatMessageSent({
  variant,
  chatModel,
  messageCount: messages.length + 1,
  hasContext: Boolean(context),
  tier,
  hasCredits: credits > 0,
});
```

---

### image_generated

**Location:** `src/components/hero-image.tsx`

**When:** Image generation completes successfully
**Note:** Fires regardless of Convex persistence (`onSaveImage` is optional).

**Props:**
- `imageModel` — Model used for generation
- `aspectRatio` — Image aspect ratio (e.g., "16:9")
- `resolution` — Image resolution (e.g., "1280x720")
- `generationNumber` — How many images generated for this verse (1-based)
- `durationMs` — Generation time in milliseconds (optional)
- `tier`, `hasCredits` — Base props

```typescript
trackImageGenerated({
  imageModel: modelUsed,
  aspectRatio: data.aspectRatio || imageAspectRatio,
  resolution: imageResolution,
  generationNumber: data.generationNumber || (existingImageCount + 1),
  durationMs: data.durationMs,
  tier,
  hasCredits: credits > 0,
});
```

---

### credits_insufficient

**Location:** `src/components/hero-image.tsx`, `src/components/chat.tsx`

**When:** User attempts action but lacks credits

**Props:**
- `feature` — "image" or "chat"
- `requiredCredits` — Credits needed (optional)
- `tier`, `hasCredits` — Base props

```typescript
// In hero-image.tsx
trackCreditsInsufficient({
  feature: "image",
  requiredCredits: effectiveCost,
  tier,
  hasCredits: credits > 0,
});

// In chat.tsx
trackCreditsInsufficient({
  feature: "chat",
  requiredCredits: 1,
  tier,
  hasCredits: credits > 0,
});
```

---

### generation_error

**Location:** `src/components/hero-image.tsx`

**When:** Image generation fails

**Props:**
- `imageModel` — Model that failed
- `errorType` — Error category or message (e.g., `"disabled"`, `"unauthorized"`, or the thrown error message)
- `tier`, `hasCredits` — Base props

```typescript
trackGenerationError({
  imageModel,
  errorType: "unauthorized",
  tier,
  hasCredits: credits > 0,
});
```

---

### credits_modal_opened

**Location:** `src/context/session-context.tsx` (effect on `isBuyModalOpen`)

**When:** Buy credits modal opens (including onboarding-triggered opens)

**Props:**
- `step` — "welcome" (first time) or "selection" (returning)
- `tier`, `hasCredits` — Base props

```typescript
useEffect(() => {
  if (isBuyModalOpen && !prevModalOpenRef.current) {
    const hasSeenWelcome =
      typeof window !== "undefined" &&
      localStorage.getItem("visibible_welcome_seen") === "true";
    trackCreditsModalOpened({
      step: hasSeenWelcome ? "selection" : "welcome",
      tier,
      hasCredits: credits > 0,
    });
  }
  prevModalOpenRef.current = isBuyModalOpen;
}, [isBuyModalOpen, tier, credits]);
```

---

### invoice_created

**Location:** `src/components/buy-credits-modal.tsx`

**When:** Lightning invoice successfully created

**Props:**
- `amountUsd` — Invoice amount in USD (e.g., 3)
- `tier`, `hasCredits` — Base props

```typescript
trackInvoiceCreated({
  amountUsd: CREDIT_BUNDLE.priceUsd,
  tier,
  hasCredits: credits > 0,
});
```

---

### payment_completed

**Location:** `src/components/buy-credits-modal.tsx`

**When:** Payment confirmed by LND

**Props:**
- `amountUsd` — Payment amount in USD
- `credits` — Credits granted
- `tier`, `hasCredits` — Base props

```typescript
trackPaymentCompleted({
  amountUsd: CREDIT_BUNDLE.priceUsd,
  credits: CREDIT_BUNDLE.credits,
  tier,
  hasCredits: true, // They now have credits
});
```

---

### payment_expired

**Location:** `src/components/buy-credits-modal.tsx`

**When:** Invoice expires before payment

**Props:**
- `invoiceAgeSeconds` — How long the invoice was open
- `tier`, `hasCredits` — Base props

**Deduplication:** Uses `hasTrackedExpiredRef` to fire only once per invoice

```typescript
const [invoiceCreatedAt, setInvoiceCreatedAt] = useState<number>(0);
const hasTrackedExpiredRef = useRef(false);

// Set when invoice received
setInvoiceCreatedAt(Date.now());

// On timer expiry
if (!hasTrackedExpiredRef.current) {
  hasTrackedExpiredRef.current = true;
  trackPaymentExpired({
    invoiceAgeSeconds: Math.floor((Date.now() - invoiceCreatedAt) / 1000),
    tier,
    hasCredits: credits > 0,
  });
}

// On polling response showing expired
if (data.status === "expired" && !hasTrackedExpiredRef.current) {
  hasTrackedExpiredRef.current = true;
  trackPaymentExpired({
    invoiceAgeSeconds: Math.floor((Date.now() - invoiceCreatedAt) / 1000),
    tier,
    hasCredits: credits > 0,
  });
}
```

---

### menu_opened

**Location:** `src/context/navigation-context.tsx` (effect on `isMenuOpen`)

**When:** `isMenuOpen` transitions from `false` → `true`

**Props:**
- `tier`, `hasCredits` — Base props only

```typescript
useEffect(() => {
  if (isMenuOpen && !prevMenuOpenRef.current) {
    trackMenuOpened({ tier, hasCredits: credits > 0 });
  }
  prevMenuOpenRef.current = isMenuOpen;
}, [isMenuOpen, tier, credits]);
```

---

### preference_changed

**Location:** `src/context/preferences-context.tsx`

**When:** User changes translation, image model, or chat model

**Props:**
- `preference` — "translation", "imageModel", or "chatModel"
- `value` — New setting value
- `tier`, `hasCredits` — Base props

```typescript
// Translation change
trackPreferenceChanged({
  preference: "translation",
  value: newTranslation,
  tier,
  hasCredits: credits > 0,
});

// Image model change
trackPreferenceChanged({
  preference: "imageModel",
  value: newModel,
  tier,
  hasCredits: credits > 0,
});

// Chat model change
trackPreferenceChanged({
  preference: "chatModel",
  value: newModel,
  tier,
  hasCredits: credits > 0,
});
```

---

## Deduplication Patterns

Two patterns prevent duplicate events:

### 1. Ref-based (one-time events)

Used when an event should fire once per component lifecycle:

```typescript
const hasFiredRef = useRef(false);

useEffect(() => {
  if (hasFiredRef.current) return;
  hasFiredRef.current = true;
  trackEvent(props);
}, [deps]);
```

**Used in:**
- `verse-analytics.tsx` — `hasFiredRef` for `verse_view`
- `hero-image.tsx` — keyed ref for `verse_images_state`
- `buy-credits-modal.tsx` — `hasTrackedExpiredRef` for `payment_expired`

### 2. Action-based (user actions)

Events fired on explicit user actions don't need deduplication — each action is a valid event:

```typescript
const handleSubmit = () => {
  trackChatMessageSent(props); // Each submit is a new event
  sendMessage(text);
};
```

---

## Integration Patterns

### Pattern 1: Context-based tracking

When tracking in context providers, access session data via hooks:

```typescript
// navigation-context.tsx
const { tier, credits } = useSession();

useEffect(() => {
  if (isChatOpen && !prevChatOpenRef.current) {
    trackChatOpened({
      variant: "sidebar",
      hasContext: chatContext !== null,
      tier,
      hasCredits: credits > 0,
    });
  }
  prevChatOpenRef.current = isChatOpen;
}, [isChatOpen, chatContext, tier, credits]);
```

### Pattern 2: Component-based tracking

When tracking in components, derive props at call site:

```typescript
// hero-image.tsx
const { tier, credits } = useSession();

trackImageGenerated({
  imageModel: modelUsed,
  aspectRatio: data.aspectRatio || imageAspectRatio,
  resolution: imageResolution,
  generationNumber: data.generationNumber || (existingImageCount + 1),
  tier,
  hasCredits: credits > 0,
});
```

### Pattern 3: Dedicated tracking component

For page views, use a dedicated client component:

```typescript
// verse-analytics.tsx
export function VerseAnalytics(props: VerseAnalyticsProps) {
  const { tier, credits, isLoading } = useSession();
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (isLoading || hasFiredRef.current) return;
    hasFiredRef.current = true;
    trackVerseView({ ...props, tier, hasCredits: credits > 0 });
  }, [props, tier, credits, isLoading]);

  return null; // Renders nothing
}
```

---

## Example Analytics Queries

### Coverage Analysis
```
count(verse_images_state where imageState="known" and hasImages=true)
  / count(verse_images_state where imageState="known")
```

### Discovery vs Creation
Compare `verse_view` counts to `verse_images_state` with `hasImages=true` to see if users discover existing images or generate new ones.

### Inventory Gaps
Filter `verse_images_state` with `imageState="known" and hasImages=false` to find verses without images.

---

## Testing & Verification

### Browser DevTools

1. Open browser DevTools → Network tab
2. Filter by `/_vercel/insights/event`
3. Perform action that triggers event
4. Check request payload for event name and properties

### Vercel Dashboard

1. Go to Vercel Analytics dashboard
2. Navigate to Custom Events
3. View event counts and property breakdowns
4. Note: ~5-minute delay for events to appear

### Local Development

Events fire in development but may not appear in Vercel dashboard. Use Network tab to verify payloads.

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Mounts `<Analytics />` |
| `src/lib/analytics.ts` | Type-safe tracking functions |
| `src/components/verse-analytics.tsx` | Page view tracking component |
| `src/components/hero-image.tsx` | Image state and generation tracking |
| `src/context/navigation-context.tsx` | Menu and chat open tracking |
| `src/context/preferences-context.tsx` | Preference change tracking |
| `src/context/session-context.tsx` | Credits modal tracking |
| `src/components/chat.tsx` | Chat engagement tracking |
| `src/components/buy-credits-modal.tsx` | Payment funnel tracking |

---

## Related Docs

- Analytics overview: `llm/context/ANALYTICS.md`
- Session context: `llm/implementation/SESSIONS_AND_CREDITS.md`
- Payment flow: `llm/implementation/LIGHTNING_PAYMENTS_IMPLEMENTATION.md`
