# Welcome flow

A new visitor lands straight on the page: [GuestSessionProvider](../../src/context/guest-session-context.tsx) creates the session and opens nothing. The credits modal opens only when a control asks for it. A leftover `visibible_onboarding_seen` flag in localStorage is no longer read.

The welcome is a step of [BuyCreditsModal](../../src/components/buy-credits-modal.tsx) and never opens by itself: asking for credits opens the dialog at the packs (or a still-valid invoice), even on a first visit. Only Advanced's "Show the welcome" ([Advanced](ADVANCED.md)) opens it, through `showWelcome()` in [GuestSessionProvider](../../src/context/guest-session-context.tsx), which sets `welcomeRequested`. From the welcome, "Get Credits to Generate" goes on to the packs and "Browse for Free" closes the dialog. The old `visibible_welcome_seen` flag is no longer read or written.

Leftover localStorage flags describe UI history, not authentication or credit ownership. [Payments](PAYMENTS.md) and [Sessions and credits](SESSIONS_AND_CREDITS.md) cover purchasing and session limitations.
