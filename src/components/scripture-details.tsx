"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { usePreferences } from "@/context/preferences-context";
import { TranslationSelector } from "./translation-selector";

interface ScriptureDetailsProps {
  book: string;
  chapter: number;
  verseRange?: string;
  wordCount?: number;
  readingTime?: number;
  imageAttribution?: {
    title?: string;
    artist?: string;
    source?: string;
  };
}

export function ScriptureDetails({
  book = "Genesis",
  chapter = 1,
  verseRange = "1-10",
  wordCount = 284,
  readingTime = 1,
  imageAttribution,
}: Partial<ScriptureDetailsProps>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { translationInfo } = usePreferences();

  return (
    <section className="border-t border-[var(--divider)]">
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--surface)]/50 transition-colors duration-[var(--motion-fast)]"
        aria-expanded={isExpanded}
        aria-controls="scripture-details-content"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--surface)] flex items-center justify-center">
            <Info size={16} strokeWidth={1.5} className="text-[var(--muted)]" />
          </div>
          <div>
            <p className="text-sm font-medium">Passage Details</p>
            <p className="text-xs text-[var(--muted)]">
              {translationInfo.code} · {book} {chapter}:{verseRange}
            </p>
          </div>
        </div>
        <ChevronDown
          size={20}
          strokeWidth={1.5}
          className={`text-[var(--muted)] transition-transform duration-[var(--motion-fast)] ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expandable Content */}
      <div
        id="scripture-details-content"
        className={`overflow-hidden transition-all duration-[var(--motion-base)] ease-out ${
          isExpanded ? "max-h-[500px]" : "max-h-0"
        }`}
      >
        <div className="px-4 pb-4 space-y-4">
          {/* Version Section */}
          <div className="bg-[var(--surface)] rounded-[var(--radius-md)] overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--divider)] flex items-center justify-between">
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                Translation
              </p>
              <TranslationSelector variant="full" />
            </div>
            <div className="divide-y divide-[var(--divider)]">
              <DetailRow label="Version" value={translationInfo.code} />
              <DetailRow label="Full Name" value={translationInfo.name} />
              <DetailRow label="Language" value="English" />
              <DetailRow label="Edition" value={String(translationInfo.year)} />
            </div>
          </div>

          {/* Reading Info Section */}
          <div className="bg-[var(--surface)] rounded-[var(--radius-md)] overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--divider)]">
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                Reading Info
              </p>
            </div>
            <div className="divide-y divide-[var(--divider)]">
              <DetailRow label="Location" value={`${book} ${chapter}:${verseRange}`} />
              <DetailRow label="Word Count" value={`${wordCount} words`} />
              <DetailRow label="Reading Time" value={`${readingTime} min`} />
            </div>
          </div>

          {/* Image Attribution (if available) */}
          {imageAttribution && (
            <div className="bg-[var(--surface)] rounded-[var(--radius-md)] overflow-hidden">
              <div className="px-4 py-2 border-b border-[var(--divider)]">
                <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                  Image
                </p>
              </div>
              <div className="divide-y divide-[var(--divider)]">
                {imageAttribution.title && (
                  <DetailRow label="Title" value={imageAttribution.title} />
                )}
                {imageAttribution.artist && (
                  <DetailRow label="Artist" value={imageAttribution.artist} />
                )}
                {imageAttribution.source && (
                  <DetailRow label="Source" value={imageAttribution.source} />
                )}
              </div>
            </div>
          )}

          {/* Copyright Notice */}
          <p className="text-xs text-[var(--muted)] text-center leading-relaxed px-4">
            Scripture quotations are from the {translationInfo.name} ({translationInfo.code}),
            which is in the public domain.
          </p>
        </div>
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 min-h-[44px]">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
