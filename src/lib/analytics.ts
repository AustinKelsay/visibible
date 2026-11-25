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

export type PreferenceChangeSource =
  | "translation_selector"
  | "spread_paint_switch"
  | "look"
  | "advanced"
  | "unknown";

export type GenerationTriggerSource =
  | "auto_generate"
  | "spread_paint"
  | "spread_retry"
  | "picture_menu_paint"
  | "picture_menu_retry";

export type CreditsFrictionSource =
  | GenerationTriggerSource
  | "ask_submit"
  | "contents_paint";

// Event-specific property types
type VerseViewProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  testament: "old" | "new";
  translation: string;
};

/** Where Ask was opened: by sending from the words page's foot, or from the phone dock. */
export type AskOpenSource = "words_page" | "dock";

type AskOpenedProps = BaseProps & {
  source: AskOpenSource;
};

type AskQuestionSentProps = BaseProps & {
  source: "suggestion" | "field";
  /** Turns in the conversation including this question: 1 for the first, 3 for the first follow-up. */
  messageCount: number;
};

type ChatErrorShownProps = BaseProps & {
  variant: "ask";
  chatModel: string;
  errorType: ChatErrorType;
  hasContext: boolean;
};

type ImageGeneratedProps = BaseProps & {
  imageModel: string;
  aspectRatio: string;
  resolution: string;
  generationNumber: number;
  artStyle?: string;
  source: GenerationTriggerSource;
  durationMs?: number;
};

type ImageGenerationStartedProps = BaseProps & {
  imageModel: string;
  aspectRatio: string;
  resolution: string;
  generationNumber: number;
  artStyle?: string;
  source: GenerationTriggerSource;
};

type CreditsInsufficientProps = BaseProps & {
  feature: "image" | "chat";
  source: CreditsFrictionSource;
  requiredCredits?: number;
};

type GenerationErrorProps = BaseProps & {
  imageModel: string;
  errorType: string;
  source: GenerationTriggerSource;
  artStyle?: string;
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

type PreferenceChangedProps = BaseProps & {
  preference:
    | "translation"
    | "imageModel"
    | "chatModel"
    | "imageAspectRatio"
    | "imageResolution"
    | "artStyle"
    | "textSize"
    | "autoGenerate"
    | "feedbackPrompts"
    | "appearance";
  value: string;
  source: PreferenceChangeSource;
};

type FeedbackSubmittedProps = BaseProps & {
  hasContext: boolean;
  hasImageContext: boolean;
  /** "image" reports one saved image; "general" is everything else. */
  kind?: "general" | "image";
  /** The reported image's art style as the library reports it (historical images are Classical). */
  artStyle?: string;
};

type FeedbackPromptInteractionProps = BaseProps & {
  action: "shown" | "clicked" | "dismissed";
  visitCount: number;
};

type LookOpenedProps = BaseProps & {
  /** The control that opened Look: the dock's "Aa" (computer or phone) or the translation name on the words page. */
  source: "dock" | "translation_name";
};

type PictureMenuOpenedProps = BaseProps & {
  /** The verse's pictures in the chosen art style. */
  pictureCount: number;
};

type ContentsOpenedProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
};

type ApiDocsViewedProps = BaseProps & {
  page: "api-docs";
};

type ApiDocsLinkClickedProps = BaseProps & {
  source: "hero_cta" | "quick_link" | "footer" | "corner_menu";
  href: string;
  target: "internal" | "external" | "api";
};

/** How the reader turned the page. */
export type VerseNavigationSource = "keyboard" | "dock" | "swipe" | "mark" | "contents" | "play_on";

type VerseNavigationProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  /** "jump" is a move to any verse, such as a Contents tile. */
  direction: "prev" | "next" | "jump";
  source: VerseNavigationSource;
  targetUrl: string;
};

/** The map experiment (#532): which verse, and what kind of setting its map shows. */
type MapLinkProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  /** The setting was carried from an earlier verse of the chapter. */
  inherited: boolean;
  /** A place in the setting has more than one proposed site. */
  debated: boolean;
};

/** Exploring the open map (#556): the verse, and what the reader did. */
type MapExploredProps = BaseProps & {
  /** The verse being read, "Genesis 28:19". */
  reference: string;
} & (
  | { action: "zoom"; step: "here" | "land" | "world" }
  | { action: "chapter"; direction: "before" | "after" | "current" | "list" }
  | { action: "view"; view: "then" | "today" }
  | { action: "all_chapters" }
);

type WholePictureOpenedProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  imageId?: string;
};

// Track verse page view
export function trackVerseView(props: VerseViewProps) {
  track("verse_view", props);
}

// Track the turned-over words page opening for Ask
export function trackAskOpened(props: AskOpenedProps) {
  track("ask_opened", props);
}

// Track a question sent from the spread's Ask
export function trackAskQuestionSent(props: AskQuestionSentProps) {
  track("ask_question_sent", props);
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

// Track Contents, the chapter wall opened from the passage name
export function trackContentsOpened(props: ContentsOpenedProps) {
  track("contents_opened", props);
}

// Track Look, the panel for art style, translation and text size
export function trackLookOpened(props: LookOpenedProps) {
  track("look_opened", props);
}

// Track an opening of the picture menu on the spread (#441)
export function trackPictureMenuOpened(props: PictureMenuOpenedProps) {
  track("picture_menu_opened", props);
}

// Track API docs page views
export function trackApiDocsViewed(props: ApiDocsViewedProps) {
  track("api_docs_viewed", props);
}

// Track API docs link clicks
export function trackApiDocsLinkClicked(props: ApiDocsLinkClickedProps) {
  track("api_docs_link_clicked", props);
}

// Track explicit verse navigation interactions
export function trackVerseNavigation(props: VerseNavigationProps) {
  track("verse_navigation", props);
}

// Track the spread's whole-picture view being opened from its picture
export function trackWholePictureOpened(props: WholePictureOpenedProps) {
  track("whole_picture_opened", props);
}

// Track the words page's map link being shown on a spread (once per spread)
export function trackMapLinkShown(props: MapLinkProps) {
  track("map_link_shown", props);
}

// Track the reader opening the map from the words page's link
export function trackMapOpened(props: MapLinkProps) {
  track("map_opened", props);
}

// Track the reader exploring the open map: a zoom step, a chapter link at a place, or a place's full list of chapters
export function trackMapExplored(props: MapExploredProps) {
  track("map_explored", props);
}
