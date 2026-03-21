/**
 * Vercel Analytics utility with type-safe event tracking.
 * All events are designed to track user behavior without PII.
 */

import { track } from "@vercel/analytics";
import type {
  ChatErrorType,
  CreditsModalOpenedStep,
  CreditsModalState,
} from "@/lib/analytics-event-utils";

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

type ChatErrorShownProps = BaseProps & {
  variant: "sidebar" | "inline";
  chatModel: string;
  errorType: ChatErrorType;
  hasContext: boolean;
};

type ImageGeneratedProps = BaseProps & {
  imageModel: string;
  aspectRatio: string;
  resolution: string;
  generationNumber: number;
  durationMs?: number;
};

type ImageGenerationStartedProps = BaseProps & {
  imageModel: string;
  aspectRatio: string;
  resolution: string;
  generationNumber: number;
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
  step: CreditsModalOpenedStep;
};

type CreditsModalClosedProps = BaseProps & {
  step: CreditsModalOpenedStep;
  state: CreditsModalState;
  hadInvoice: boolean;
  timeOpenSeconds: number;
};

type InvoiceCreatedProps = BaseProps & {
  amountUsd: number;
};

type InvoiceCopiedProps = BaseProps & {
  amountUsd: number;
  credits: number;
};

type PaymentCompletedProps = BaseProps & {
  amountUsd: number;
  credits: number;
};

type PaymentExpiredProps = BaseProps & {
  invoiceAgeSeconds: number;
};

type InvoiceCancelledProps = BaseProps & {
  invoiceAgeSeconds: number;
};

type MenuOpenedProps = BaseProps;

type PreferenceChangedProps = BaseProps & {
  preference:
    | "translation"
    | "imageModel"
    | "chatModel"
    | "imageAspectRatio"
    | "imageResolution"
    | "chapterGallery";
  value: string;
};

type FeedbackSubmittedProps = BaseProps & {
  hasContext: boolean;
  hasImageContext: boolean;
  sidebarTab: "feedback";
};

type FeedbackPromptInteractionProps = BaseProps & {
  action: "shown" | "clicked" | "dismissed";
  visitCount: number;
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

// Track chat error surfaced to user
export function trackChatErrorShown(props: ChatErrorShownProps) {
  track("chat_error_shown", props);
}

// Track successful image generation
export function trackImageGenerated(props: ImageGeneratedProps) {
  track("image_generated", props);
}

// Track image generation attempts
export function trackImageGenerationStarted(props: ImageGenerationStartedProps) {
  track("image_generation_started", props);
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

// Track credits modal closed/dismissed
export function trackCreditsModalClosed(props: CreditsModalClosedProps) {
  track("credits_modal_closed", props);
}

// Track invoice created (purchase intent)
export function trackInvoiceCreated(props: InvoiceCreatedProps) {
  track("invoice_created", props);
}

// Track invoice copied to clipboard
export function trackInvoiceCopied(props: InvoiceCopiedProps) {
  track("invoice_copied", props);
}

// Track payment completed (conversion)
export function trackPaymentCompleted(props: PaymentCompletedProps) {
  track("payment_completed", props);
}

// Track payment/invoice expired
export function trackPaymentExpired(props: PaymentExpiredProps) {
  track("payment_expired", props);
}

// Track explicit invoice cancellation from UI
export function trackInvoiceCancelled(props: InvoiceCancelledProps) {
  track("invoice_cancelled", props);
}

// Track menu opened
export function trackMenuOpened(props: MenuOpenedProps) {
  track("menu_opened", props);
}

// Track preference changes
export function trackPreferenceChanged(props: PreferenceChangedProps) {
  track("preference_changed", props);
}

// Track feedback submissions
export function trackFeedbackSubmitted(props: FeedbackSubmittedProps) {
  track("feedback_submitted", props);
}

// Track feedback prompt interactions (shown/clicked/dismissed)
export function trackFeedbackPromptInteraction(props: FeedbackPromptInteractionProps) {
  track("feedback_prompt_interaction", props);
}
