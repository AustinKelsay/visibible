# Welcome flow

[SessionProvider](../../src/context/session-context.tsx) opens the credits modal after creating a new session for non-admin visitors who lack `visibible_onboarding_seen=true` in localStorage. It schedules the open after 500 ms and marks that flag when opening.

[BuyCreditsModal](../../src/components/buy-credits-modal.tsx) separately reads `visibible_welcome_seen` to choose welcome versus bundle selection. Buy Credits and Browse for Free mark the welcome as seen; the former enters selection and the latter closes the modal.

The welcome includes a small animated verse-strip demo of image availability/counts. These localStorage flags describe UI history, not authentication or credit ownership. [Payments](PAYMENTS.md) and [Sessions and credits](SESSIONS_AND_CREDITS.md) cover purchasing and session limitations.
