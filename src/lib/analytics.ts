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
import type {
  VerseViewEngagementTrigger,
  VerseViewValue,
} from "@/lib/verse-view";

// Base properties included with most events
type BaseProps = {
  tier: "paid" | "admin";
  hasCredits: boolean;
};

export type PreferenceChangeSource =
  | "translation_selector"
  | "image_model_selector"
  | "chat_model_selector"
  | "header_generate_modal"
  | "header_settings_popover"
  | "mobile_header_menu"
  | "header_gallery_toggle"
  | "chapter_gallery_card"
  | "unknown";

export type GenerationTriggerSource =
  | "auto_generate"
  | "hero_generate"
  | "header_generate"
  | "hero_retry"
  | "fullscreen_retry";

export type CreditsFrictionSource =
  | GenerationTriggerSource
  | "chat_submit"
  | "header_get_credits";

// Event-specific property types
type VerseViewProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  testament: "old" | "new";
  translation: string;
};

type DefaultViewExposedProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  testament: "old" | "new";
  assignedView: VerseViewValue;
};

type ContentEngagedProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  testament: "old" | "new";
  trigger: VerseViewEngagementTrigger;
  activeView: VerseViewValue;
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
  source: GenerationTriggerSource;
  durationMs?: number;
};

type ImageGenerationStartedProps = BaseProps & {
  imageModel: string;
  aspectRatio: string;
  resolution: string;
  generationNumber: number;
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
  source: PreferenceChangeSource;
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

type ChapterGalleryViewedProps = BaseProps & {
  book: string;
  chapter: number;
  currentVerse: number;
  layoutMode: "all" | "byVerse";
  savedImageCount: number;
  placeholderCount: number;
};

type ChapterGalleryLayoutChangedProps = BaseProps & {
  book: string;
  chapter: number;
  currentVerse: number;
  layoutMode: "all" | "byVerse";
};

type ChapterGalleryItemOpenedProps = BaseProps & {
  book: string;
  chapter: number;
  currentVerse: number;
  verse: number;
  layoutMode: "all" | "byVerse";
  hasImage: boolean;
  imageCount: number;
  imageId?: string;
};

type ImageFullscreenOpenedProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  source: "hero_mobile" | "verse_strip" | "chapter_gallery_card";
  imageId?: string;
  totalImages?: number;
};

type ImageBrowsedProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  direction: "older" | "newer";
  surface: "desktop_dock" | "mobile_overlay" | "fullscreen";
  currentIndex: number;
  totalImages: number;
  imageId?: string;
};

type SavedImageLoadFailedProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  surface: "hero" | "fullscreen" | "chapter_gallery_card" | "chapter_gallery_lightbox";
  imageId?: string;
  imageUrl?: string;
  attempt?: number;
};

type ApiDocsViewedProps = BaseProps & {
  page: "api-docs";
};

type ApiDocsLinkClickedProps = BaseProps & {
  source: "hero_cta" | "quick_link" | "footer";
  href: string;
  target: "internal" | "external" | "api";
};

type VerseNavigationProps = BaseProps & {
  book: string;
  chapter: number;
  verse: number;
  direction: "prev" | "next";
  source: "keyboard" | "mobile_nav" | "desktop_nav";
  targetUrl: string;
};

type SettingsMenuOpenedProps = BaseProps;

function sanitizeImageUrl(imageUrl?: string): string | undefined {
  if (!imageUrl) return undefined;

  try {
    const url = new URL(imageUrl);
    return url.pathname || undefined;
  } catch {
    const sanitized = imageUrl.split("#", 1)[0]?.split("?", 1)[0]?.trim();
    return sanitized || undefined;
  }
}

// Track verse page view
export function trackVerseView(props: VerseViewProps) {
  track("verse_view", props);
}

// Track eligible experiment exposures for the default verse view.
export function trackDefaultViewExposed(props: DefaultViewExposedProps) {
  track("default_view_exposed", props);
}

// Track the first meaningful action taken after the verse page is exposed.
export function trackContentEngaged(props: ContentEngagedProps) {
  track("content_engaged", props);
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

// Track chapter gallery view
export function trackChapterGalleryViewed(props: ChapterGalleryViewedProps) {
  track("chapter_gallery_viewed", props);
}

// Track gallery layout changes
export function trackChapterGalleryLayoutChanged(props: ChapterGalleryLayoutChangedProps) {
  track("chapter_gallery_layout_changed", props);
}

// Track navigation from gallery cards into the reader
export function trackChapterGalleryItemOpened(props: ChapterGalleryItemOpenedProps) {
  track("chapter_gallery_item_opened", props);
}

// Track fullscreen image opens across the new image surfaces
export function trackImageFullscreenOpened(props: ImageFullscreenOpenedProps) {
  track("image_fullscreen_opened", props);
}

// Track older/newer image browsing
export function trackImageBrowsed(props: ImageBrowsedProps) {
  track("image_browsed", props);
}

// Track saved-image load failures that surface in the UI
export function trackSavedImageLoadFailed(props: SavedImageLoadFailedProps) {
  track("saved_image_load_failed", {
    ...props,
    imageUrl: sanitizeImageUrl(props.imageUrl),
  });
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

// Track the mobile settings menu
export function trackSettingsMenuOpened(props: SettingsMenuOpenedProps) {
  track("settings_menu_opened", props);
}
