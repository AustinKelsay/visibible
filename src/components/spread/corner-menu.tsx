"use client";

import { useRef } from "react";
import Link from "next/link";
import { Shield, X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { TrackedApiDocsLink } from "@/components/api-docs-analytics";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { Feedback, imageContextOf } from "@/components/feedback";
import { useChosenPicture } from "@/components/spread/chosen-picture";
import { SocialLinks } from "@/components/site-links";
import { Advanced } from "@/components/spread/advanced";
import { LayerPanel, useLayer, useLayers } from "@/components/spread/layers";
import { useSession } from "@/context/session-context";
import { usePictureStyles } from "@/context/work-scope-context";

export interface CornerMenuProps {
  /** Where the verse's pictures are kept ("genesis-1-1"); feedback attaches the one on screen. */
  verseId: string;
  bookName: string;
  chapter: number;
  verseNumber: number;
  verseText: string;
  totalVerses: number;
}

const ROW =
  "flex min-h-11 w-full items-center rounded-xl px-3 text-left text-[15px] text-ink/90 transition-colors duration-[var(--motion-fast)] hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink";

/**
 * The Visibible name in the spread's top-left corner and the one menu it opens: the credit balance and
 * Get credits, Recover credits, Send feedback, About, API documentation, social links and Advanced. Send feedback
 * replaces the menu with the feedback form. Both are layers, so Escape closes them and focus returns to
 * the name.
 */
export function CornerMenu({ verseId, bookName, chapter, verseNumber, verseText, totalVerses }: CornerMenuProps) {
  const name = useRef<HTMLButtonElement>(null);
  const menu = useLayer("corner");
  const feedback = useLayer("feedback");
  // The picture menu's "Report this picture" opens the same form, about the picture, with focus returning to its chip.
  const report = useLayer("report-picture");
  const { openLayerById } = useLayers();

  return (
    <>
      <button
        ref={name}
        type="button"
        aria-label="Visibible menu"
        aria-haspopup="dialog"
        aria-expanded={menu.isOpen}
        data-fades
        onClick={(event) => menu.toggle(event.currentTarget)}
        className="absolute left-3 top-6 z-30 rounded-full px-3 py-1.5 text-[15px] font-semibold tracking-tight text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)] transition-colors duration-[var(--motion-fast)] hover:bg-black/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:left-5 md:top-8"
      >
        Visibible
      </button>

      {menu.isOpen || feedback.isOpen || report.isOpen ? (
        <div aria-hidden="true" className="fixed inset-0 z-30" onClick={() => (menu.isOpen ? menu.close() : feedback.isOpen ? feedback.close() : report.close())} />
      ) : null}

      <LayerPanel
        id="corner"
        label="Visibible menu"
        className="absolute left-3 top-[4.25rem] z-40 max-h-[calc(100svh-5rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-2xl border border-ink/10 bg-reader-glass p-2 text-ink shadow-2xl outline-none backdrop-blur-2xl backdrop-saturate-150 md:left-5 md:top-[4.75rem]"
      >
        {/* On a phone the menu also closes by a tap outside; this is the visible way. */}
        <div className="flex justify-end md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={menu.close}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink/70 hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
          >
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
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
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink/70 transition-colors duration-[var(--motion-fast)] hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
          />
        </div>
        <Divider />
        <Advanced
          verseId={verseId}
          bookName={bookName}
          chapter={chapter}
          verseNumber={verseNumber}
          verseText={verseText}
          totalVerses={totalVerses}
        />
      </LayerPanel>

      <LayerPanel id={report.isOpen ? "report-picture" : "feedback"} label={report.isOpen ? "Report this picture" : "Send feedback"} className={`${FEEDBACK_PANEL} ${report.isOpen ? REPORT_PLACE : FEEDBACK_PLACE}`}>
        <FeedbackForm
          verseId={verseId}
          bookName={bookName}
          chapter={chapter}
          verseNumber={verseNumber}
          reportPicture={report.isOpen}
          onClose={report.isOpen ? report.close : feedback.close}
        />
      </LayerPanel>
    </>
  );
}

const FEEDBACK_PANEL =
  "fixed inset-x-0 bottom-0 z-40 flex max-h-[85svh] flex-col overflow-hidden rounded-t-2xl border border-ink/10 bg-reader-sheet shadow-2xl outline-none md:absolute md:inset-x-auto md:left-5 md:max-h-[calc(100svh-6rem)] md:w-[26rem] md:rounded-2xl";
/** Feedback opens under the name; a picture report opens over the picture menu's chip. */
const FEEDBACK_PLACE = "md:bottom-auto md:top-[4.75rem]";
const REPORT_PLACE = "md:bottom-[5.5rem] md:top-auto";

function Divider() {
  return <hr className="mx-3 my-1.5 border-ink/10" />;
}

/** The balance row: credits and Get credits, or the admin state, which is never charged. */
function Balance({ onGetCredits }: { onGetCredits: () => void }) {
  const { tier, credits, pendingCredits, accessStatus, buyCredits } = useSession();
  // Owner sign-in stays behind the existing address parameter; the credits dialog holds it.
  const showAdminEntry = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("admin");

  if (accessStatus === "loading") {
    return <p className="px-3 py-2.5 text-sm text-ink/(--quiet-60)">Loading balance…</p>;
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
      <p className="flex items-center gap-2 px-3 py-2.5 text-sm text-ink/90">
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
        <p className="min-w-0 flex-1 text-sm text-ink/90">
          <span className="font-semibold tabular-nums">{credits}</span> credits
          {pendingCredits > 0 ? <span className="text-ink/(--quiet-55)"> · {pendingCredits} held</span> : null}
        </p>
        <button
          type="button"
          onClick={getCredits}
          className="min-h-9 shrink-0 rounded-full bg-ink px-3.5 text-sm font-medium text-paper transition-colors duration-[var(--motion-fast)] hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
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

/**
 * The feedback form with the verse and the picture on screen attached: the version chosen in the picture menu, or the
 * newest. Reporting a picture starts it out about that picture. Mounted only while open.
 */
function FeedbackForm({ verseId, bookName, chapter, verseNumber, reportPicture, onClose }: Pick<CornerMenuProps, "verseId" | "bookName" | "chapter" | "verseNumber"> & { reportPicture: boolean; onClose: () => void }) {
  const isConvexEnabled = useConvexEnabled();
  const { chosen: chosenStyle, order } = usePictureStyles();
  const { chosen } = useChosenPicture();
  // The picture rule's choice (the spread's own query), then that style's pictures: its newest is the one on screen.
  const rulePicture = useQuery(api.verseImages.getSpreadPicture, isConvexEnabled ? { verseId, styles: order } : "skip");
  const shownStyle = rulePicture?.artStyle ?? chosenStyle;
  const pictures = useQuery(api.verseImages.getImageHistory, isConvexEnabled ? { verseId, artStyle: shownStyle } : "skip");
  const title = reportPicture ? "Report this picture" : "Send feedback";

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-ink/10 py-1.5 pr-1.5 pl-4">
        <h2 className="text-sm font-medium text-ink/90">{title}</h2>
        <button
          type="button"
          aria-label="Close feedback"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink/70 hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Feedback
          context={{ book: bookName, chapter, verseRange: String(verseNumber) }}
          imageContext={imageContextOf(chosen ?? pictures?.[0])}
          defaultKind={reportPicture ? "image" : "general"}
        />
      </div>
    </>
  );
}
