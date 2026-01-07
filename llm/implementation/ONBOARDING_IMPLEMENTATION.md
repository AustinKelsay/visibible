# Onboarding Implementation Guide

This document describes how the Visibible onboarding experience is implemented.

---

## Architecture Overview

Onboarding is integrated into `BuyCreditsModal` as a "welcome" state rather than a separate component. This keeps the user flow cohesive and reduces component complexity.

### Modal States

```typescript
type ModalState = "welcome" | "selection" | "loading" | "invoice" | "success" | "error";
```

- **welcome** — Onboarding screen for first-time users
- **selection** — Credit purchase options
- **loading** — Creating invoice
- **invoice** — Payment QR code display
- **success** — Payment confirmation
- **error** — Error handling

---

## Auto-Open Trigger

**File:** `src/context/session-context.tsx`

The modal auto-opens for new users after session initialization:

```typescript
const hasSeenOnboarding = localStorage.getItem("visibible_onboarding_seen") === "true";
if (!hasSeenOnboarding && newData.tier !== "admin" && !hasShownOnboardingRef.current) {
  setTimeout(() => {
    setIsBuyModalOpen(true);
    localStorage.setItem("visibible_onboarding_seen", "true");
    hasShownOnboardingRef.current = true;
  }, 500);
}
```

Key behaviors:
- 500ms delay prevents flash during page load
- Admin users bypass onboarding entirely
- `hasShownOnboardingRef` prevents double-showing in React strict mode

---

## LocalStorage Flags

| Key | Set When | Purpose |
|-----|----------|---------|
| `visibible_onboarding_seen` | Session initializes for new user | Prevents auto-open on subsequent visits |
| `visibible_welcome_seen` | User clicks CTA in welcome screen | Tracks completion of welcome specifically |

The modal checks `visibible_welcome_seen` when reopened to decide whether to show welcome or skip to selection.

---

## Welcome Screen Structure

**File:** `src/components/buy-credits-modal.tsx`

```
Welcome State
├── Stepper indicator (2 dots)
├── Header
│   ├── Sparkles icon (gradient circle)
│   ├── Title: "Welcome to Visibible Alpha"
│   └── Subtitle: "Bringing the Bible to life in real time"
├── Feature Cards
│   ├── Card 1: Generate visuals (BookOpen icon)
│   └── Card 2: Participate (Zap icon)
│       └── MiniVerseStrip (animated preview)
│       └── Label: "Dots show verses with images"
└── CTA Buttons
    ├── Primary: "Buy Credits to Generate"
    └── Secondary: "Browse for Free"
```

---

## MiniVerseStrip Component

**File:** `src/components/buy-credits-modal.tsx` (internal component)

An animated demo that teaches the blue dot indicator system.

### Sample Data

```typescript
const verses = [
  { verse: 1, dots: 2 },  // 2 images
  { verse: 2, dots: 0 },  // no images
  { verse: 3, dots: 1 },  // 1 image
  { verse: 4, dots: 3 },  // 3+ images (capped at 3 dots)
  { verse: 5, dots: 0 },  // no images
];
```

### Animation Behavior

1. **Selection cycles** every 2.5 seconds (1→2→3→4→5→1...)
2. **Selected verse**:
   - Blue background (`bg-[var(--accent)]`)
   - Scale up (`scale-110`)
   - Shadow glow (`shadow-lg shadow-[var(--accent)]/25`)
3. **Unselected verses**: Faded (`opacity-70`)
4. **Dots pulse** when verse is selected (`animate-dot-pulse`)
5. **500ms transitions** with `ease-in-out` for smooth fades

### Implementation

```typescript
function MiniVerseStrip() {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSelectedIndex((prev) => (prev + 1) % 5);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // ... render logic
}
```

### Styling

| Element | Classes |
|---------|---------|
| Container | `flex justify-center items-center gap-1.5 py-4 mt-4 mb-2` |
| Verse box | `min-h-[36px] min-w-[36px] rounded-[var(--radius-sm)]` |
| Selected | `bg-[var(--accent)] scale-110 shadow-lg shadow-[var(--accent)]/25` |
| Unselected | `bg-[var(--divider)] opacity-70` |
| Transitions | `transition-all duration-500 ease-in-out` |
| Centering offset | `-ml-8` (accounts for Zap icon in parent card) |

### Dot Styling

Matches the main verse-strip component exactly:

| Property | Value |
|----------|-------|
| Size | `w-2 h-2` (8px) |
| Border | `border border-[var(--background)]/30` |
| Spacing | `6px` between stacked dots |
| Max dots | 3 (visual cap) |
| Active color | `bg-[var(--accent-text)]` |
| Inactive color | `bg-[var(--accent)]` |
| Empty verse | `bg-[var(--muted)]/40` |

---

## CSS Animation

**File:** `src/app/globals.css`

```css
/* Mini verse strip dot animation */
@keyframes dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.2); }
}

.animate-dot-pulse {
  animation: dot-pulse 1.5s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .animate-dot-pulse { animation: none; }
}
```

The `prefers-reduced-motion` query disables animation for users who prefer reduced motion.

---

## CTA Handlers

```typescript
const handleWelcomeNext = () => {
  localStorage.setItem("visibible_welcome_seen", "true");
  setState("selection");
};

const handleBrowseFree = () => {
  localStorage.setItem("visibible_welcome_seen", "true");
  closeBuyModal();
};
```

Both handlers set `visibible_welcome_seen` to prevent re-showing the welcome screen.

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/components/buy-credits-modal.tsx` | Welcome state, MiniVerseStrip component |
| `src/context/session-context.tsx` | Auto-open trigger for new users |
| `src/app/globals.css` | `dot-pulse` keyframe animation |

---

## Accessibility

- Modal uses `animate-in slide-in-from-bottom` with CSS transitions
- `prefers-reduced-motion` disables dot pulse animation
- All buttons have clear text labels
- Stepper dots provide visual progress indication
- Close button has `aria-label="Close"`

---

## Related Docs

- Context overview: `llm/context/ONBOARDING.md`
- Credits UI: `llm/implementation/CREDITS_UI_IMPLEMENTATION.md`
- Session system: `llm/implementation/SESSIONS_AND_CREDITS.md`
- Navigation dots: `llm/implementation/NAVIGATION_IMPLEMENTATION.md`
