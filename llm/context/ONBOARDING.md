# Onboarding Context

High-level overview of the Visibible onboarding experience for new users. This describes product intent and user-facing behavior.

## Summary

New users are greeted with a welcome modal that:
1. Introduces the app's purpose (AI-generated Bible imagery)
2. Demonstrates the image indicator system with an animated preview
3. Offers two paths: buy credits to generate, or browse for free

## Trigger

The onboarding modal automatically appears for:
- First-time visitors (no `visibible_onboarding_seen` in localStorage)
- Non-admin users only (admins skip onboarding)

The modal appears ~500ms after session initialization to avoid flash.

## User Flow

```
New User Arrives
       ↓
  Welcome Modal (auto-opens)
       ↓
  ┌─────────────────────────────────┐
  │  Welcome to Visibible Alpha     │
  │  Bringing the Bible to life     │
  │                                 │
  │  [Feature 1: Generate visuals]  │
  │  [Feature 2: Browse/participate]│
  │     [Animated verse preview]    │
  │                                 │
  │  [Buy Credits] [Browse Free]    │
  └─────────────────────────────────┘
       ↓                    ↓
  Credit Purchase      Close & Browse
  Flow (Lightning)     (free browsing)
```

## Key Features Explained

### Feature Cards

1. **Generate visuals verse by verse** — AI transforms scripture into imagery
2. **Participate in the experience** — Browse free or buy credits to generate

### MiniVerseStrip Demo

An animated preview inside the second feature card teaches the blue dot system:
- Shows 5 mini verse boxes (numbered 1-5)
- Some verses have dots (indicating existing images), some don't
- Selection cycles through verses every 2.5 seconds
- Dots pulse when their verse is selected
- Label: "Dots show verses with images"

This teaches users what to expect when browsing — they'll see these same dot indicators throughout the app on verse strips, book menus, and chapter grids.

## Two Paths

### Buy Credits (Primary CTA)
- Transitions to credit selection screen
- $3 = 300 credits via Lightning payment
- Sets `visibible_welcome_seen` flag

### Browse for Free (Secondary CTA)
- Closes modal immediately
- User can explore existing images at no cost
- Sets `visibible_welcome_seen` flag
- Can buy credits later via header badge

## Alpha Constraints Communicated

The onboarding and subsequent purchase flow communicate these alpha limitations:
- Credits are session-only (no accounts yet)
- Lightning payments only (CashApp or Lightning wallet)
- No refunds during alpha
- Clearing browser data loses credits

## Integration Points

- **SessionProvider** — Triggers modal for new users
- **BuyCreditsModal** — Contains onboarding as "welcome" state
- **LocalStorage** — Tracks `visibible_onboarding_seen` and `visibible_welcome_seen`

## Related Docs

- Credits & sessions: `llm/context/SESSIONS_AND_CREDITS.md`
- Navigation & dots: `llm/context/NAVIGATION.md`
- Implementation details: `llm/implementation/ONBOARDING_IMPLEMENTATION.md`

## Entry Points

- `src/components/buy-credits-modal.tsx` — Welcome state + MiniVerseStrip
- `src/context/session-context.tsx` — Auto-open trigger
