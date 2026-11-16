"use client";

import { useRef } from "react";
import Link from "next/link";
import { Shield, X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { TrackedApiDocsLink } from "@/components/api-docs-analytics";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { Feedback, imageContextOf } from "@/components/feedback";
import { SocialLinks } from "@/components/site-links";
import { LayerPanel, useLayer, useLayers } from "@/components/spread/layers";
import { useSession } from "@/context/session-context";
import { useEffectiveArtStyle } from "@/context/work-scope-context";

export interface CornerMenuProps {
  /** Where the verse's pictures are kept ("genesis-1-1"); feedback attaches the one on screen. */
  verseId: string;
  bookName: string;
  chapter: number;
  verseNumber: number;
}

const ROW =
  "flex min-h-11 w-full items-center rounded-xl px-3 text-left text-[15px] text-white/90 transition-colors duration-[var(--motion-fast)] hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white";

/**
 * The Visibible name in the spread's top-left corner and the one menu it opens: the credit balance and
 * Get credits, Recover credits, Send feedback, About, API documentation and social links. Send feedback
 * replaces the menu with the feedback form. Both are layers, so Escape closes them and focus returns to
 * the name.
 */
export function CornerMenu({ verseId, bookName, chapter, verseNumber }: CornerMenuProps) {
  const name = useRef<HTMLButtonElement>(null);
  const menu = useLayer("corner");
  const feedback = useLayer("feedback");
  const { openLayerById } = useLayers();

  return (
    <>
      <button
        ref={name}
        type="button"
        aria-label="Visibible menu"
        aria-haspopup="dialog"
        aria-expanded={menu.isOpen}
        onClick={(event) => menu.toggle(event.currentTarget)}
        className="absolute left-3 top-3 z-30 rounded-full px-3 py-1.5 text-[15px] font-semibold tracking-tight text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)] transition-colors duration-[var(--motion-fast)] hover:bg-black/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:left-5 md:top-6"
      >
        Visibible
      </button>

      {menu.isOpen || feedback.isOpen ? (
        <div aria-hidden="true" className="fixed inset-0 z-30" onClick={() => (menu.isOpen ? menu.close() : feedback.close())} />
      ) : null}

      <LayerPanel
        id="corner"
        label="Visibible menu"
        className="liquid-glass spread-dock absolute left-3 top-14 z-40 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl p-2 text-white outline-none md:left-5 md:top-[4.25rem]"
      >
        <Balance onGetCredits={menu.close} />
        <Divider />
        <Link href="/recover" className={ROW}>Recover credits</Link>
        <button type="button" className={ROW} onClick={() => openLayerById("feedback", name.current)}>
          Send feedback
        </button>
        <Divider />
        <Link href="/about" className={ROW}>About</Link>
        <TrackedApiDocsLink href="/api-docs" source="corner_menu" className={ROW}>API documentation</TrackedApiDocsLink>
        <div className="flex items-center gap-1 px-1 pt-1">
          <SocialLinks
            iconSize={18}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 transition-colors duration-[var(--motion-fast)] hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
          />
        </div>
      </LayerPanel>

      <LayerPanel
        id="feedback"
        label="Send feedback"
        className="reader-dark fixed inset-x-0 bottom-0 z-40 flex max-h-[85svh] flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0e0e10] shadow-2xl outline-none md:absolute md:inset-x-auto md:bottom-auto md:left-5 md:top-[4.25rem] md:max-h-[calc(100svh-6rem)] md:w-[26rem] md:rounded-2xl"
      >
        <FeedbackForm verseId={verseId} bookName={bookName} chapter={chapter} verseNumber={verseNumber} onClose={feedback.close} />
      </LayerPanel>
    </>
  );
}

function Divider() {
  return <hr className="mx-3 my-1.5 border-white/10" />;
}

/** The balance row: credits and Get credits, or the admin state, which is never charged. */
function Balance({ onGetCredits }: { onGetCredits: () => void }) {
  const { tier, credits, pendingCredits, accessStatus, buyCredits } = useSession();
  // Owner sign-in stays behind the existing address parameter; the credits dialog holds it.
  const showAdminEntry = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("admin");

  if (accessStatus === "loading") {
    return <p className="px-3 py-2.5 text-sm text-white/60">Loading balance…</p>;
  }
  if (accessStatus === "unavailable") {
    return (
      <button type="button" className={ROW} onClick={() => window.location.reload()}>
        Reconnect to see your balance
      </button>
    );
  }
  if (tier === "admin") {
    return (
      <p className="flex items-center gap-2 px-3 py-2.5 text-sm text-white/90">
        <Shield size={16} strokeWidth={2} aria-hidden="true" />
        <span>Admin · not charged</span>
      </p>
    );
  }

  const getCredits = () => {
    onGetCredits();
    buyCredits();
  };
  return (
    <>
      <div className="flex items-center gap-3 px-3 py-1.5">
        <p className="min-w-0 flex-1 text-sm text-white/90">
          <span className="font-semibold tabular-nums">{credits}</span> credits
          {pendingCredits > 0 ? <span className="text-white/55"> · {pendingCredits} held</span> : null}
        </p>
        <button
          type="button"
          onClick={getCredits}
          className="min-h-9 shrink-0 rounded-full bg-white px-3.5 text-sm font-medium text-black transition-colors duration-[var(--motion-fast)] hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Get credits
        </button>
      </div>
      {showAdminEntry ? (
        <button type="button" className={ROW} onClick={getCredits}>Admin sign-in</button>
      ) : null}
    </>
  );
}

/** The feedback form with the verse and the picture on screen attached. Mounted only while open. */
function FeedbackForm({ verseId, bookName, chapter, verseNumber, onClose }: CornerMenuProps & { onClose: () => void }) {
  const isConvexEnabled = useConvexEnabled();
  const { artStyle } = useEffectiveArtStyle();
  // The spread's picture query, so the form attaches the picture the spread shows.
  const pictures = useQuery(api.verseImages.getImageHistory, isConvexEnabled ? { verseId, artStyle } : "skip");

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 py-1.5 pr-1.5 pl-4">
        <h2 className="text-sm font-medium text-white/90">Send feedback</h2>
        <button
          type="button"
          aria-label="Close feedback"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Feedback
          context={{ book: bookName, chapter, verseRange: String(verseNumber) }}
          imageContext={imageContextOf(pictures?.[0])}
        />
      </div>
    </>
  );
}
