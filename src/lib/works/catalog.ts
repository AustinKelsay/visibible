/**
 * The prose works the reader can open beside the Bible, and who may open them. A work listed here is read from its
 * imported file (`works/<id>/work.json`) and drawn by the same engine as the Bible, against its own approved brief.
 * A work is the owner's preview (an admin session only) until it is listed in `PUBLIC_PROSE_WORK_IDS`
 * (convex/lib/proseWorks.ts), which Convex also enforces for saved images.
 * Safe for client and server: it holds no secrets and reads only the committed briefs.
 */
import aliceBrief from "../../../works/alice-in-wonderland/brief.json";
import holmesBrief from "../../../works/holmes-adventures/brief.json";
import { BIBLE_WORK_ID, PUBLIC_PROSE_WORK_IDS } from "../../../convex/lib/proseWorks";

export { BIBLE_WORK_ID };

export type ProseWorkVisibility = "owner" | "public";

export type ProseWork = Readonly<{
  id: string;
  title: string;
  author: string;
  /** One line for the library card. */
  blurb: string;
  visibility: ProseWorkVisibility;
  /** The brief's approved art styles, in its order; the first is the work's default. */
  styleIds: readonly string[];
}>;

function visibilityOf(workId: string): ProseWorkVisibility {
  return PUBLIC_PROSE_WORK_IDS.includes(workId) ? "public" : "owner";
}

export const PROSE_WORKS: readonly ProseWork[] = Object.freeze([
  {
    id: "holmes-adventures",
    title: "The Adventures of Sherlock Holmes",
    author: "Arthur Conan Doyle",
    blurb: "Twelve cases from Baker Street.",
    visibility: visibilityOf("holmes-adventures"),
    styleIds: Object.freeze([...holmesBrief.styleIds]),
  },
  {
    id: "alice-in-wonderland",
    title: "Alice’s Adventures in Wonderland",
    author: "Lewis Carroll",
    blurb: "Down the rabbit-hole to the Queen’s croquet-ground.",
    visibility: visibilityOf("alice-in-wonderland"),
    styleIds: Object.freeze([...aliceBrief.styleIds]),
  },
]);

export function findProseWork(workId: string): ProseWork | null {
  return PROSE_WORKS.find((work) => work.id === workId) ?? null;
}

/** Whether a viewer may open a work: public works to everyone, owner works to an admin session only. */
export function canViewProseWork(work: ProseWork, isOwner: boolean): boolean {
  return work.visibility === "public" || isOwner;
}

/** The owner, for prose previews: an admin session, as Convex checks for saved images. */
export function isProseOwner(session: { tier?: string } | null | undefined): boolean {
  return session?.tier === "admin";
}
