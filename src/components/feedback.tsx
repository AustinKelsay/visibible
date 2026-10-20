"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, CheckCircle, ImageIcon } from "lucide-react";
import type { PageContext } from "@/context/navigation-context";
import { useSession } from "@/context/session-context";
import { trackFeedbackSubmitted } from "@/lib/analytics";

// Image context for feedback - which image the user was viewing
export type ImageContext = {
  imageId?: string;
  artStyle?: string;
  model?: string;
  provider?: string;
  aspectRatio?: string;
  dimensions?: string;
  creditsCost?: number;
  costUsd?: number;
  durationMs?: number;
  createdAt?: number;
};

type FeedbackProps = {
  context?: PageContext;
  imageContext?: ImageContext;
};

export function Feedback({ context, imageContext }: FeedbackProps) {
  const { tier, credits } = useSession();
  const [message, setMessage] = useState("");
  // "This image" reports the saved image on screen; the server resolves its style and source itself.
  const [kind, setKind] = useState<"general" | "image">("general");
  const canReportImage = Boolean(imageContext?.imageId);
  const effectiveKind = canReportImage ? kind : "general";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const successTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current !== null) {
        window.clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedMessage = message.trim();

    if (trimmedMessage.length === 0 || isSubmitting) return;
    if (trimmedMessage.length > 5000) {
      setError("Feedback must be 5000 characters or fewer.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: effectiveKind,
          message: trimmedMessage,
          verseContext: context
            ? {
                book: context.book,
                chapter: context.chapter,
                verseRange: context.verseRange,
              }
            : undefined,
          imageContext: effectiveKind === "image" ? { imageId: imageContext!.imageId } : imageContext?.imageId ? imageContext : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit feedback");
      }

      // Success!
      trackFeedbackSubmitted({
        hasContext: Boolean(context),
        hasImageContext: Boolean(imageContext?.imageId),
        sidebarTab: "feedback",
        kind: effectiveKind,
        ...(effectiveKind === "image" && imageContext?.artStyle ? { artStyle: imageContext.artStyle } : {}),
        tier,
        hasCredits: credits > 0,
      });
      setMessage("");
      setIsSuccess(true);

      // Reset success state after 3 seconds
      if (successTimeoutRef.current !== null) {
        window.clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = window.setTimeout(() => {
        setIsSuccess(false);
        successTimeoutRef.current = null;
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Info area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="text-center mb-6">
          <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">
            Share Your Thoughts
          </h3>
          <p className="text-sm text-[var(--muted)]">
            We&apos;d love to hear your feedback, suggestions, or report any
            issues.
          </p>
        </div>

        {/* Verse context indicator */}
        {context?.book && (
          <div className="mb-4 p-3 bg-[var(--surface)] rounded-[var(--radius-md)] text-sm">
            <span className="text-[var(--muted)]">Context: </span>
            <span className="text-[var(--foreground)]">
              {context.book} {context.chapter}
              {context.verseRange && `:${context.verseRange}`}
            </span>
          </div>
        )}

        {/* What the feedback is about */}
        {canReportImage && (
          <div role="radiogroup" aria-label="What is this feedback about?" className="mb-4 grid grid-cols-2 gap-2">
            {([["general", "General feedback"], ["image", "This image"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                disabled={isSubmitting}
                className={`min-h-[44px] px-3 rounded-[var(--radius-md)] border text-sm transition-colors duration-[var(--motion-fast)] ${
                  kind === value
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)]"
                    : "border-[var(--divider)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--accent)]"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Image context indicator */}
        {imageContext?.imageId && (
          <div className="mb-4 p-3 bg-[var(--surface)] rounded-[var(--radius-md)] text-sm flex items-start gap-2">
            <ImageIcon size={16} className="text-[var(--muted)] mt-0.5 shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[var(--foreground)]">
                {imageContext.model?.split("/").pop()?.replace(/-image$/i, "") || "Image"}
                {imageContext.artStyle ? ` · ${imageContext.artStyle}` : ""}
              </span>
              {imageContext.dimensions && (
                <span className="text-xs text-[var(--muted)]">
                  {imageContext.dimensions} • {imageContext.aspectRatio || "unknown ratio"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Success message */}
        {isSuccess && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-[var(--radius-md)] flex items-center gap-2">
            <CheckCircle
              size={16}
              className="text-green-600 dark:text-green-400 shrink-0"
            />
            <span className="text-sm text-green-700 dark:text-green-400">
              Thank you! Your feedback has been submitted.
            </span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-[var(--radius-md)]">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {error}
            </p>
          </div>
        )}
      </div>

      {/* Form area */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 p-4 border-t border-[var(--divider)]"
      >
        <div className="flex gap-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isSubmitting}
            placeholder={effectiveKind === "image" ? "What is wrong with this image?" : "Your feedback..."}
            aria-label="Feedback message"
            rows={3}
            maxLength={5000}
            className="flex-1 min-h-[88px] px-4 py-3 bg-[var(--surface)] border border-[var(--divider)] rounded-[var(--radius-md)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-shadow duration-[var(--motion-fast)] resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={isSubmitting || !message.trim()}
            className="self-end min-h-[44px] min-w-[44px] px-5 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-[var(--motion-fast)] active:scale-[0.98]"
            aria-label="Submit feedback"
          >
            {isSubmitting ? (
              <Loader2
                size={20}
                strokeWidth={2}
                className="animate-spin mx-auto"
              />
            ) : (
              <Send size={20} strokeWidth={2} className="mx-auto" />
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {message.length}/5000 characters
        </p>
      </form>
    </div>
  );
}
