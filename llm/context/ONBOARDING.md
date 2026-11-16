# Welcome flow

A new visitor lands straight on the page: [GuestSessionProvider](../../src/context/guest-session-context.tsx) creates the session and opens nothing. The credits modal opens only when a control asks for it. A leftover `visibible_onboarding_seen` flag in localStorage is no longer read.

[BuyCreditsModal](../../src/components/buy-credits-modal.tsx) separately reads `visibible_welcome_seen` to choose welcome versus bundle selection. Buy Credits and Browse for Free mark the welcome as seen; the former enters selection and the latter closes the modal.

The welcome includes a small animated verse-strip demo of image availability/counts. These localStorage flags describe UI history, not authentication or credit ownership. [Payments](PAYMENTS.md) and [Sessions and credits](SESSIONS_AND_CREDITS.md) cover purchasing and session limitations.
