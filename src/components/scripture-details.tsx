"use client";

import { useState } from "react";

interface ScriptureDetailsProps {
  book: string;
  chapter: number;
  verseRange?: string;
  version: {
    code: string;
    name: string;
    language: string;
    year: number;
  };
  wordCount?: number;
  readingTime?: number;
  imageAttribution?: {
    title?: string;
    artist?: string;
    source?: string;
  };
}

const defaultVersion = {
  code: "NIV",
  name: "New International Version",
  language: "English",
  year: 2011,
};

export function ScriptureDetails({
  book = "Genesis",
  chapter = 1,
  verseRange = "1-10",
  version = defaultVersion,
  wordCount = 284,
  readingTime = 1,
  imageAttribution,
}: Partial<ScriptureDetailsProps>) {
  const [isExpanded, setIsExpanded] = useState(false);

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
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--muted)]"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium">Passage Details</p>
            <p className="text-xs text-[var(--muted)]">
              {version?.code} · {book} {chapter}:{verseRange}
            </p>
          </div>
        </div>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-[var(--muted)] transition-transform duration-[var(--motion-fast)] ${
            isExpanded ? "rotate-180" : ""
          }`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
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
            <div className="px-4 py-2 border-b border-[var(--divider)]">
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                Translation
              </p>
            </div>
            <div className="divide-y divide-[var(--divider)]">
              <DetailRow label="Version" value={version?.code || "NIV"} />
              <DetailRow label="Full Name" value={version?.name || "New International Version"} />
              <DetailRow label="Language" value={version?.language || "English"} />
              <DetailRow label="Edition" value={String(version?.year || 2011)} />
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
            Scripture quotations marked (NIV) are taken from the Holy Bible, New International
            Version®, NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™
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
