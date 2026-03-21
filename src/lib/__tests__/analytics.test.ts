import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

import { track } from "@vercel/analytics";
import {
  trackChatErrorShown,
  trackChatMessageSent,
  trackChatOpened,
  trackCreditsInsufficient,
  trackCreditsModalClosed,
  trackCreditsModalOpened,
  trackFeedbackPromptInteraction,
  trackFeedbackSubmitted,
  trackGenerationError,
  trackImageGenerated,
  trackImageGenerationStarted,
  trackInvoiceCancelled,
  trackInvoiceCopied,
  trackInvoiceCreated,
  trackMenuOpened,
  trackPaymentCompleted,
  trackPaymentExpired,
  trackPreferenceChanged,
  trackVerseImagesState,
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
          }),
        eventName: "image_generation_started",
      },
      {
        call: () =>
          trackCreditsInsufficient({
            ...baseProps,
            feature: "chat",
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
          }),
        eventName: "preference_changed",
      },
      {
        call: () =>
          trackPreferenceChanged({
            ...baseProps,
            preference: "imageAspectRatio",
            value: "16:9",
          }),
        eventName: "preference_changed",
      },
      {
        call: () =>
          trackPreferenceChanged({
            ...baseProps,
            preference: "chapterGallery",
            value: "enabled",
          }),
        eventName: "preference_changed",
      },
      {
        call: () =>
          trackPreferenceChanged({
            ...baseProps,
            preference: "chapterGallery",
            value: "disabled",
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
    ];

    for (const testCase of cases) {
      trackMock.mockClear();
      testCase.call();

      expect(trackMock).toHaveBeenCalledTimes(1);
      const [eventName, payload] = trackMock.mock.calls[0];
      expect(eventName).toBe(testCase.eventName);
      expect(payload).toEqual(expect.objectContaining(baseProps));
    }
  });
});
