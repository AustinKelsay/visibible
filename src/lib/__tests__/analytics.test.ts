import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

import { track } from "@vercel/analytics";
import {
  trackApiDocsLinkClicked,
  trackApiDocsViewed,
  trackAskOpened,
  trackAskQuestionSent,
  trackContentsOpened,
  trackPictureMenuOpened,
  trackChatErrorShown,
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
  trackPaymentCompleted,
  trackPaymentExpired,
  trackPreferenceChanged,
  trackVerseNavigation,
  trackVerseView,
  trackWholePictureOpened,
} from "@/lib/analytics";

// Each wrapper forwards its props unchanged; what can drift is the event name a dashboard filters on.
describe("analytics event wrappers", () => {
  const trackMock = vi.mocked(track);
  beforeEach(() => trackMock.mockClear());

  it.each([
    [trackApiDocsLinkClicked, "api_docs_link_clicked"],
    [trackApiDocsViewed, "api_docs_viewed"],
    [trackAskOpened, "ask_opened"],
    [trackAskQuestionSent, "ask_question_sent"],
    [trackContentsOpened, "contents_opened"],
    [trackPictureMenuOpened, "picture_menu_opened"],
    [trackChatErrorShown, "chat_error_shown"],
    [trackCreditsInsufficient, "credits_insufficient"],
    [trackCreditsModalClosed, "credits_modal_closed"],
    [trackCreditsModalOpened, "credits_modal_opened"],
    [trackFeedbackPromptInteraction, "feedback_prompt_interaction"],
    [trackFeedbackSubmitted, "feedback_submitted"],
    [trackGenerationError, "generation_error"],
    [trackImageGenerated, "image_generated"],
    [trackImageGenerationStarted, "image_generation_started"],
    [trackInvoiceCancelled, "invoice_cancelled"],
    [trackInvoiceCopied, "invoice_copied"],
    [trackInvoiceCreated, "invoice_created"],
    [trackPaymentCompleted, "payment_completed"],
    [trackPaymentExpired, "payment_expired"],
    [trackPreferenceChanged, "preference_changed"],
    [trackVerseNavigation, "verse_navigation"],
    [trackVerseView, "verse_view"],
    [trackWholePictureOpened, "whole_picture_opened"],
  ] as [(props: never) => void, string][])("%#: sends %s with its props", (wrapper, eventName) => {
    const props = { tier: "paid", hasCredits: true, marker: eventName };
    wrapper(props as never);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(eventName, props);
  });

});
