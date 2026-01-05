# Feedback Implementation Guide

This document describes how the Visibible feedback system is implemented.

---

## Architecture Overview

The feedback system consists of five parts:

1. **Convex Schema** (`schema.ts`) — Defines the `feedback` table structure.
2. **Convex Mutation** (`feedback.ts`) — Validates and stores feedback.
3. **API Route** (`/api/feedback`) — Handles HTTP requests with rate limiting.
4. **Feedback Component** (`feedback.tsx`) — Form UI in the sidebar.
5. **FeedbackPrompt Component** (`feedback-prompt.tsx`) — Popout CTA that triggers occasionally.

---

## Convex Schema

### File: `convex/schema.ts`

```typescript
feedback: defineTable({
  sid: v.optional(v.string()),           // Session ID
  message: v.string(),                   // Feedback text
  verseContext: v.optional(
    v.object({
      book: v.optional(v.string()),
      chapter: v.optional(v.number()),
      verseRange: v.optional(v.string()),
    })
  ),
  userAgent: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_createdAt", ["createdAt"]),
```

---

## Convex Mutation

### File: `convex/feedback.ts`

```typescript
export const submitFeedback = mutation({
  args: {
    message: v.string(),
    sid: v.optional(v.string()),
    verseContext: v.optional(
      v.object({
        book: v.optional(v.string()),
        chapter: v.optional(v.number()),
        verseRange: v.optional(v.string()),
      })
    ),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trimmedMessage = args.message.trim();

    // Validation
    if (!trimmedMessage) {
      throw new Error("Feedback message cannot be empty");
    }
    if (trimmedMessage.length > 5000) {
      throw new Error("Feedback message too long (max 5000 characters)");
    }

    await ctx.db.insert("feedback", {
      message: trimmedMessage,
      sid: args.sid,
      verseContext: args.verseContext,
      userAgent: args.userAgent,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});
```

---

## API Route

### File: `src/app/api/feedback/route.ts`

```typescript
import {
  readJsonBodyWithLimit,
  PayloadTooLargeError,
  InvalidJsonError,
} from "@/lib/request-body";

// SECURITY: Zod schema with strict length limits
const feedbackSchema = z.object({
  message: z
    .string()
    .min(1, "Message is required")
    .max(5000, "Message too long (max 5000 characters)"),
  verseContext: z
    .object({
      book: z.string().max(100).optional(),
      chapter: z.number().int().positive().optional(),
      verseRange: z.string().max(50).optional(),
    })
    .optional(),
});

// SECURITY: Limit feedback body size
const MAX_FEEDBACK_BODY_SIZE = 10 * 1024; // 10KB

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Validate origin
  if (!validateOrigin(request)) {
    return invalidOriginResponse();
  }

  // 2. Rate limit by IP (5 per minute)
  const clientIp = getClientIp(request);
  const ipHash = await hashIp(clientIp);
  const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
    identifier: ipHash,
    endpoint: "feedback",
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: "Too many feedback submissions. Please try again later.",
        retryAfter: rateLimitResult.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitResult.retryAfter || 60),
        },
      }
    );
  }

  // 3. SECURITY: Read body with enforced size limit
  let rawBody: unknown;
  try {
    rawBody = await readJsonBodyWithLimit(request, MAX_FEEDBACK_BODY_SIZE);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json(
        { error: "Payload too large" },
        { status: 413 }
      );
    }
    if (error instanceof InvalidJsonError) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to read request body" },
      { status: 400 }
    );
  }

  // 4. SECURITY: Validate with Zod schema
  const parseResult = feedbackSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0];
    return NextResponse.json(
      {
        error: "Validation failed",
        message: firstError?.message || "Invalid feedback data",
      },
      { status: 400 }
    );
  }
  const body = parseResult.data;

  // 5. Submit to Convex
  const sid = await getSessionFromCookies();
  const userAgent = request.headers.get("user-agent") ?? undefined;

  await convex.mutation(api.feedback.submitFeedback, {
    message: body.message,
    sid: sid ?? undefined,
    verseContext: body.verseContext,
    userAgent,
  });

  return NextResponse.json({ success: true });
}
```

---

## Rate Limiting

### File: `convex/rateLimit.ts`

Added to `RATE_LIMITS` config:

```typescript
export const RATE_LIMITS = {
  // ... existing limits ...
  feedback: { windowMs: 60_000, maxRequests: 5 }, // 5 per minute
} as const;
```

---

## Feedback Component

### File: `src/components/feedback.tsx`

Form component displayed in the sidebar Feedback tab.

### Props

```typescript
type FeedbackProps = {
  context?: PageContext;  // Verse context from NavigationContext
};
```

### State

```typescript
const [message, setMessage] = useState("");
const [isSubmitting, setIsSubmitting] = useState(false);
const [isSuccess, setIsSuccess] = useState(false);
const [error, setError] = useState<string | null>(null);
```

### Features

- Textarea with 5000 character limit and counter
- Auto-captures verse context if available
- Shows context indicator (e.g., "Context: Genesis 1:1")
- Success message with auto-dismiss after 3 seconds
- Error message with amber styling
- Loading spinner on submit button

### Submit Handler

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!message.trim() || isSubmitting) return;

  setIsSubmitting(true);
  setError(null);

  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: message.trim(),
      verseContext: context ? {
        book: context.book,
        chapter: context.chapter,
        verseRange: context.verseRange,
      } : undefined,
    }),
  });

  if (response.ok) {
    setMessage("");
    setIsSuccess(true);
    setTimeout(() => setIsSuccess(false), 3000);
  } else {
    const data = await response.json();
    setError(data.error || "Failed to submit feedback");
  }

  setIsSubmitting(false);
};
```

---

## FeedbackPrompt Component

### File: `src/components/feedback-prompt.tsx`

Popout CTA that appears after users visit several verses.

### Trigger Logic

Uses localStorage to track:

```typescript
interface FeedbackPromptState {
  lastDismissed: number | null;  // Timestamp of last dismissal
  visitCount: number;            // Verses visited since last prompt
  showAtVisit: number;           // Random threshold (5-15)
}
```

### Visibility Rules

1. **Visit counting**: Each new verse increments `visitCount`
2. **Threshold check**: Show when `visitCount >= showAtVisit`
3. **Cooldown**: Don't show if `lastDismissed` is within 24 hours
4. **Session dismiss**: Don't show again in same session after dismiss

### State Management

```typescript
const [isVisible, setIsVisible] = useState(false);
const [isDismissed, setIsDismissed] = useState(false);
const [hasReachedThreshold, setHasReachedThreshold] = useState(false);
```

Key insight: `hasReachedThreshold` is a state variable (not just a ref check) so that changes trigger the visibility effect.

### Timing

- **Show delay**: 2 seconds after threshold reached (ChatPrompt shows at 500ms)
- **Auto-dismiss**: 8 seconds after appearing
- **Position**: `bottom-[160px]` on mobile (above ChatPrompt), `bottom-6 right-[88px]` on desktop

### Click Handler

```typescript
const handleClick = () => {
  openFeedback();  // Opens sidebar to Feedback tab
  setIsVisible(false);
  setIsDismissed(true);
  setHasReachedThreshold(false);

  // Reset localStorage state
  const state = stateRef.current;
  state.lastDismissed = Date.now();
  state.visitCount = 0;
  state.showAtVisit = getRandomVisitThreshold();
  saveState(state);
};
```

---

## NavigationContext Integration

### File: `src/context/navigation-context.tsx`

Added sidebar tab control:

```typescript
export type SidebarTab = "chat" | "feedback";

interface NavigationContextType {
  // ... existing properties ...

  // Sidebar tab control
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
  openFeedback: () => void;
}
```

### Implementation

```typescript
const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");

const openChat = useCallback(() => {
  setSidebarTab("chat");
  setIsChatOpen(true);
}, []);

const openFeedback = useCallback(() => {
  setSidebarTab("feedback");
  setIsChatOpen(true);
}, []);
```

---

## ChatSidebar Tabs

### File: `src/components/chat-sidebar.tsx`

Uses `sidebarTab` from context instead of local state:

```typescript
const { isChatOpen, closeChat, chatContext, sidebarTab, setSidebarTab } =
  useNavigation();
```

### Tab Bar UI

```typescript
<div className="flex border-t border-[var(--divider)]" role="tablist">
  <button
    onClick={() => setSidebarTab("chat")}
    className={sidebarTab === "chat" ? "active-styles" : "inactive-styles"}
    aria-selected={sidebarTab === "chat"}
    role="tab"
  >
    <MessageSquare size={16} /> Chat
  </button>
  <button
    onClick={() => setSidebarTab("feedback")}
    className={sidebarTab === "feedback" ? "active-styles" : "inactive-styles"}
    aria-selected={sidebarTab === "feedback"}
    role="tab"
  >
    <MessageCircleHeart size={16} /> Feedback
  </button>
</div>
```

---

## Layout Integration

### File: `src/app/layout.tsx`

FeedbackPrompt added to root layout:

```typescript
<NavigationProvider>
  {children}
  <ChatSidebar />
  <ChatFAB />
  <ChatPrompt />
  <FeedbackPrompt />  {/* Added */}
  <BuyCreditsModal />
</NavigationProvider>
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `convex/schema.ts` | Feedback table definition |
| `convex/feedback.ts` | submitFeedback mutation |
| `convex/rateLimit.ts` | Rate limit config (feedback: 5/min) |
| `src/app/api/feedback/route.ts` | API route with rate limiting |
| `src/components/feedback.tsx` | Feedback form component |
| `src/components/feedback-prompt.tsx` | Popout CTA component |
| `src/components/chat-sidebar.tsx` | Sidebar with tabs |
| `src/context/navigation-context.tsx` | Tab state management |
| `src/app/layout.tsx` | FeedbackPrompt mounting |

---

## Accessibility

- Tab buttons have `role="tab"` and `aria-selected`
- Form textarea has `aria-label="Feedback message"`
- Submit button has `aria-label="Submit feedback"`
- FeedbackPrompt popout has `aria-label="Share your feedback"`
- All interactive elements meet 44x44px touch target minimum

---

## Related Docs

- Navigation context: `llm/implementation/NAVIGATION_IMPLEMENTATION.md`
- Rate limiting: `llm/implementation/RATE_LIMIT_IMPLEMENTATION.md`
- Theme/styling: `llm/implementation/THEME_IMPLEMENTATION.md`
