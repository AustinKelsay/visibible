/**
 * Vercel Analytics utility with type-safe event tracking.
 * All events are designed to track user behavior without PII.
 */

import { track } from "@vercel/analytics";

// Base properties included with most events
type BaseProps = {
  tier: "paid" | "admin";
  hasCredits: boolean;
};

// Event-specific property types
type VerseViewProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  testament: "old" | "new";
  translation: string;
};

type VerseImagesStateProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  testament: "old" | "new";
} & (
  | {
      imageState: "known";
      imageCount: number;
      hasImages: boolean;
    }
  | {
      imageState: "unknown";
    }
);

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

type ImageGeneratedProps = BaseProps & {
  imageModel: string;
  aspectRatio: string;
  resolution: string;
  generationNumber: number;
  durationMs?: number;
};

type CreditsInsufficientProps = BaseProps & {
  feature: "image" | "chat";
  requiredCredits?: number;
};

type GenerationErrorProps = BaseProps & {
  imageModel: string;
  errorType: string;
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

type MenuOpenedProps = BaseProps;

type PreferenceChangedProps = BaseProps & {
  preference: "translation" | "imageModel" | "chatModel";
  value: string;
};

// Track verse page view
export function trackVerseView(props: VerseViewProps) {
  track("verse_view", props);
}

// Track verse image inventory state (known vs unknown)
export function trackVerseImagesState(props: VerseImagesStateProps) {
  track("verse_images_state", props);
}

// Track chat sidebar opened
export function trackChatOpened(props: ChatOpenedProps) {
  track("chat_opened", props);
}

// Track chat message sent
export function trackChatMessageSent(props: ChatMessageSentProps) {
  track("chat_message_sent", props);
}

// Track successful image generation
export function trackImageGenerated(props: ImageGeneratedProps) {
  track("image_generated", props);
}

// Track insufficient credits friction point
export function trackCreditsInsufficient(props: CreditsInsufficientProps) {
  track("credits_insufficient", props);
}

// Track image generation error
export function trackGenerationError(props: GenerationErrorProps) {
  track("generation_error", props);
}

// Track credits modal opened
export function trackCreditsModalOpened(props: CreditsModalOpenedProps) {
  track("credits_modal_opened", props);
}

// Track invoice created (purchase intent)
export function trackInvoiceCreated(props: InvoiceCreatedProps) {
  track("invoice_created", props);
}

// Track payment completed (conversion)
export function trackPaymentCompleted(props: PaymentCompletedProps) {
  track("payment_completed", props);
}

// Track payment/invoice expired
export function trackPaymentExpired(props: PaymentExpiredProps) {
  track("payment_expired", props);
}

// Track menu opened
export function trackMenuOpened(props: MenuOpenedProps) {
  track("menu_opened", props);
}

// Track preference changes
export function trackPreferenceChanged(props: PreferenceChangedProps) {
  track("preference_changed", props);
}
