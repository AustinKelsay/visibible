import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

import { track } from "@vercel/analytics";
import {
  trackApiDocsLinkClicked,
  trackApiDocsViewed,
  trackChapterGalleryItemOpened,
  trackChapterGalleryLayoutChanged,
  trackChapterGalleryViewed,
  trackChatErrorShown,
  trackChatMessageSent,
  trackChatOpened,
  trackCreditsInsufficient,
  trackCreditsModalClosed,
  trackCreditsModalOpened,
  trackFeedbackPromptInteraction,
  trackFeedbackSubmitted,
  trackGenerationError,
  trackImageBrowsed,
  trackImageFullscreenOpened,
  trackImageGenerated,
  trackImageGenerationStarted,
  trackInvoiceCancelled,
  trackInvoiceCopied,
  trackInvoiceCreated,
  trackMenuOpened,
  trackPaymentCompleted,
  trackPaymentExpired,
  trackPreferenceChanged,
  trackSavedImageLoadFailed,
  trackSettingsMenuOpened,
  trackVerseImagesState,
  trackVerseNavigation,
  trackVerseView,
} from "@/lib/analytics";

// Each wrapper forwards its props unchanged; what can drift is the event name a dashboard filters on.
describe("analytics event wrappers", () => {
  const trackMock = vi.mocked(track);
  beforeEach(() => trackMock.mockClear());

  it.each([
    [trackApiDocsLinkClicked, "api_docs_link_clicked"],
    [trackApiDocsViewed, "api_docs_viewed"],
    [trackChapterGalleryItemOpened, "chapter_gallery_item_opened"],
    [trackChapterGalleryLayoutChanged, "chapter_gallery_layout_changed"],
    [trackChapterGalleryViewed, "chapter_gallery_viewed"],
    [trackChatErrorShown, "chat_error_shown"],
    [trackChatMessageSent, "chat_message_sent"],
    [trackChatOpened, "chat_opened"],
    [trackCreditsInsufficient, "credits_insufficient"],
    [trackCreditsModalClosed, "credits_modal_closed"],
    [trackCreditsModalOpened, "credits_modal_opened"],
    [trackFeedbackPromptInteraction, "feedback_prompt_interaction"],
    [trackFeedbackSubmitted, "feedback_submitted"],
    [trackGenerationError, "generation_error"],
    [trackImageBrowsed, "image_browsed"],
    [trackImageFullscreenOpened, "image_fullscreen_opened"],
    [trackImageGenerated, "image_generated"],
    [trackImageGenerationStarted, "image_generation_started"],
    [trackInvoiceCancelled, "invoice_cancelled"],
    [trackInvoiceCopied, "invoice_copied"],
    [trackInvoiceCreated, "invoice_created"],
    [trackMenuOpened, "menu_opened"],
    [trackPaymentCompleted, "payment_completed"],
    [trackPaymentExpired, "payment_expired"],
    [trackPreferenceChanged, "preference_changed"],
    [trackSettingsMenuOpened, "settings_menu_opened"],
    [trackVerseImagesState, "verse_images_state"],
    [trackVerseNavigation, "verse_navigation"],
    [trackVerseView, "verse_view"],
  ] as [(props: never) => void, string][])("%#: sends %s with its props", (wrapper, eventName) => {
    const props = { tier: "paid", hasCredits: true, marker: eventName };
    wrapper(props as never);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(eventName, props);
  });

  it("strips the query, fragment and host from a failed saved image's URL", () => {
    trackSavedImageLoadFailed({
      tier: "paid", hasCredits: true, book: "Genesis", chapter: 1, verse: 1, surface: "hero",
      imageId: "image-1", imageUrl: "https://example.com/storage/image.png?token=secret#frag", attempt: 3,
    });
    expect(trackMock).toHaveBeenCalledWith("saved_image_load_failed", expect.objectContaining({ imageUrl: "/storage/image.png", attempt: 3 }));
  });
});
