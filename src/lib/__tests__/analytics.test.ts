import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

import { track } from "@vercel/analytics";
import {
  trackApiDocsLinkClicked,
  trackApiDocsViewed,
  trackChatErrorShown,
  trackChatMessageSent,
  trackChatOpened,
  trackChapterGalleryItemOpened,
  trackChapterGalleryLayoutChanged,
  trackChapterGalleryViewed,
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

describe("analytics event wrappers", () => {
  const trackMock = vi.mocked(track);

  beforeEach(() => {
    trackMock.mockClear();
  });

  it("sends expected event names and payloads", () => {
    const baseProps = { tier: "paid" as const, hasCredits: true };

    const cases = [
      {
        call: () =>
          trackVerseView({
            ...baseProps,
            book: "Genesis",
            chapter: 1,
            verse: 1,
            testament: "old",
            translation: "kjv",
          }),
        eventName: "verse_view",
      },
      {
        call: () =>
          trackVerseImagesState({
            ...baseProps,
            book: "Genesis",
            chapter: 1,
            verse: 1,
            testament: "old",
            imageState: "known",
            imageCount: 2,
            hasImages: true,
          }),
        eventName: "verse_images_state",
      },
      {
        call: () =>
          trackChatOpened({
            ...baseProps,
            variant: "sidebar",
            hasContext: true,
          }),
        eventName: "chat_opened",
      },
      {
        call: () =>
          trackChatMessageSent({
            ...baseProps,
            variant: "sidebar",
            chatModel: "openai/gpt-4o-mini",
            messageCount: 3,
            hasContext: true,
          }),
        eventName: "chat_message_sent",
      },
      {
        call: () =>
          trackChatErrorShown({
            ...baseProps,
            variant: "sidebar",
            chatModel: "openai/gpt-4o-mini",
            errorType: "rate_limit",
            hasContext: true,
          }),
        eventName: "chat_error_shown",
      },
      {
        call: () =>
          trackImageGenerated({
            ...baseProps,
            imageModel: "google/gemini-2.5-flash-image",
            aspectRatio: "16:9",
            resolution: "2K",
            generationNumber: 4,
            source: "hero_generate",
            durationMs: 1234,
          }),
        eventName: "image_generated",
      },
      {
        call: () =>
          trackImageGenerationStarted({
            ...baseProps,
            imageModel: "google/gemini-2.5-flash-image",
            aspectRatio: "16:9",
            resolution: "2K",
            generationNumber: 5,
            source: "auto_generate",
          }),
        eventName: "image_generation_started",
      },
      {
        call: () =>
          trackCreditsInsufficient({
            ...baseProps,
            feature: "chat",
            source: "chat_submit",
            requiredCredits: 1,
          }),
        eventName: "credits_insufficient",
      },
      {
        call: () =>
          trackGenerationError({
            ...baseProps,
            imageModel: "google/gemini-2.5-flash-image",
            errorType: "generation_failed",
            source: "hero_retry",
          }),
        eventName: "generation_error",
      },
      {
        call: () =>
          trackCreditsModalOpened({
            ...baseProps,
            step: "invoice",
          }),
        eventName: "credits_modal_opened",
      },
      {
        call: () =>
          trackCreditsModalClosed({
            ...baseProps,
            step: "invoice",
            state: "success",
            hadInvoice: true,
            timeOpenSeconds: 42,
          }),
        eventName: "credits_modal_closed",
      },
      {
        call: () =>
          trackInvoiceCreated({
            ...baseProps,
            amountUsd: 5,
          }),
        eventName: "invoice_created",
      },
      {
        call: () =>
          trackInvoiceCopied({
            ...baseProps,
            amountUsd: 5,
            credits: 300,
          }),
        eventName: "invoice_copied",
      },
      {
        call: () =>
          trackPaymentCompleted({
            ...baseProps,
            amountUsd: 5,
            credits: 100,
          }),
        eventName: "payment_completed",
      },
      {
        call: () =>
          trackPaymentExpired({
            ...baseProps,
            invoiceAgeSeconds: 1800,
          }),
        eventName: "payment_expired",
      },
      {
        call: () =>
          trackInvoiceCancelled({
            ...baseProps,
            invoiceAgeSeconds: 25,
          }),
        eventName: "invoice_cancelled",
      },
      {
        call: () =>
          trackMenuOpened({
            ...baseProps,
          }),
        eventName: "menu_opened",
      },
      {
        call: () =>
          trackPreferenceChanged({
            ...baseProps,
            preference: "chatModel",
            value: "openai/gpt-4o-mini",
            source: "chat_model_selector",
          }),
        eventName: "preference_changed",
      },
      {
        call: () =>
          trackPreferenceChanged({
            ...baseProps,
            preference: "imageAspectRatio",
            value: "16:9",
            source: "header_settings_popover",
          }),
        eventName: "preference_changed",
      },
      {
        call: () =>
          trackPreferenceChanged({
            ...baseProps,
            preference: "chapterGallery",
            value: "enabled",
            source: "header_gallery_toggle",
          }),
        eventName: "preference_changed",
      },
      {
        call: () =>
          trackPreferenceChanged({
            ...baseProps,
            preference: "chapterGallery",
            value: "disabled",
            source: "chapter_gallery_card",
          }),
        eventName: "preference_changed",
      },
      {
        call: () =>
          trackFeedbackSubmitted({
            ...baseProps,
            hasContext: true,
            hasImageContext: false,
            sidebarTab: "feedback",
          }),
        eventName: "feedback_submitted",
      },
      {
        call: () =>
          trackFeedbackPromptInteraction({
            ...baseProps,
            action: "shown",
            visitCount: 7,
          }),
        eventName: "feedback_prompt_interaction",
      },
      {
        call: () =>
          trackChapterGalleryViewed({
            ...baseProps,
            book: "Genesis",
            chapter: 1,
            currentVerse: 1,
            layoutMode: "all",
            savedImageCount: 3,
            placeholderCount: 2,
          }),
        eventName: "chapter_gallery_viewed",
      },
      {
        call: () =>
          trackChapterGalleryLayoutChanged({
            ...baseProps,
            book: "Genesis",
            chapter: 1,
            currentVerse: 1,
            layoutMode: "byVerse",
          }),
        eventName: "chapter_gallery_layout_changed",
      },
      {
        call: () =>
          trackChapterGalleryItemOpened({
            ...baseProps,
            book: "Genesis",
            chapter: 1,
            currentVerse: 1,
            verse: 3,
            layoutMode: "all",
            hasImage: true,
            imageCount: 2,
            imageId: "image-3",
          }),
        eventName: "chapter_gallery_item_opened",
      },
      {
        call: () =>
          trackImageFullscreenOpened({
            ...baseProps,
            book: "Genesis",
            chapter: 1,
            verse: 1,
            source: "hero_mobile",
            imageId: "image-1",
            totalImages: 4,
          }),
        eventName: "image_fullscreen_opened",
      },
      {
        call: () =>
          trackImageBrowsed({
            ...baseProps,
            book: "Genesis",
            chapter: 1,
            verse: 1,
            direction: "older",
            surface: "desktop_dock",
            currentIndex: 2,
            totalImages: 4,
            imageId: "image-2",
          }),
        eventName: "image_browsed",
      },
      {
        call: () =>
          trackSavedImageLoadFailed({
            ...baseProps,
            book: "Genesis",
            chapter: 1,
            verse: 1,
            surface: "hero",
            imageId: "image-1",
            imageUrl: "https://example.com/storage/image.png?token=secret#frag",
            attempt: 3,
          }),
        eventName: "saved_image_load_failed",
        expectedPayload: {
          imageUrl: "/storage/image.png",
        },
      },
      {
        call: () =>
          trackApiDocsViewed({
            ...baseProps,
            page: "api-docs",
          }),
        eventName: "api_docs_viewed",
      },
      {
        call: () =>
          trackApiDocsLinkClicked({
            ...baseProps,
            source: "quick_link",
            href: "/api/public/images",
            target: "api",
          }),
        eventName: "api_docs_link_clicked",
      },
      {
        call: () =>
          trackVerseNavigation({
            ...baseProps,
            book: "Genesis",
            chapter: 1,
            verse: 1,
            direction: "next",
            source: "keyboard",
            targetUrl: "/genesis/1/2",
          }),
        eventName: "verse_navigation",
      },
      {
        call: () =>
          trackSettingsMenuOpened({
            ...baseProps,
          }),
        eventName: "settings_menu_opened",
      },
    ];

    for (const testCase of cases) {
      trackMock.mockClear();
      testCase.call();

      expect(trackMock).toHaveBeenCalledTimes(1);
      const [eventName, payload] = trackMock.mock.calls[0];
      expect(eventName).toBe(testCase.eventName);
      expect(payload).toEqual(expect.objectContaining(baseProps));
      if ("expectedPayload" in testCase) {
        expect(payload).toEqual(expect.objectContaining(testCase.expectedPayload));
      }
    }
  });
});
