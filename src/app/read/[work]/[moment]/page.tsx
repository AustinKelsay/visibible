import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Spread } from "@/components/spread/spread";
import { WorkScopeProvider, type WorkScope } from "@/context/work-scope-context";
import { bookForPage, readerPath } from "@/lib/works/reader-pages";
import { findProseWork } from "@/lib/works/catalog";

export const dynamic = "force-dynamic";

type MomentPageProps = { params: Promise<{ work: string; moment: string }> };

export async function generateMetadata({ params }: MomentPageProps): Promise<Metadata> {
  const work = findProseWork((await params).work);
  if (!work) return { title: "Visibible" };
  return {
    title: `${work.title} - Visibible`,
    ...(work.visibility === "public" ? {} : { robots: { index: false, follow: false } }),
  };
}

/**
 * One moment of a prose work on the spread, as a verse is: its picture, its paragraphs on the words page, Look without
 * translation, Contents of the work's divisions, and no Ask. A work the viewer may not open is not found.
 */
export default async function MomentPage({ params }: MomentPageProps) {
  const { work: workId, moment: momentId } = await params;
  const found = await bookForPage(workId);
  const moment = found?.book.moments.find((m) => m.id === momentId);
  if (!found || !moment) notFound();
  const { book } = found;
  const chapter = book.chapters[moment.chapterIndex];
  const prev = book.moments[moment.index - 1];
  const next = book.moments[moment.index + 1];
  const scope: WorkScope = {
    workId: book.work.id,
    title: book.work.title,
    unitId: moment.id,
    styleIds: [...book.work.styleIds],
    level: book.chapterLevel,
    divisions: book.chapters.map((division) => ({
      label: division.label,
      moments: division.moments.map((m) => ({ id: m.id, href: readerPath(book.work.id, m.id) })),
    })),
  };
  return (
    <WorkScopeProvider scope={scope}>
      <Spread
        verseId={moment.id}
        path={readerPath(book.work.id, moment.id)}
        bookName={book.work.title}
        chapter={moment.chapterIndex + 1}
        chapterLabel={chapter.label}
        verseNumber={chapter.moments.indexOf(moment) + 1}
        reference={moment.reference}
        verseText={moment.paragraphs[0]?.text ?? ""}
        paragraphs={moment.paragraphs.map((paragraph) => paragraph.text)}
        totalVerses={chapter.moments.length}
        prevUrl={prev ? readerPath(book.work.id, prev.id) : undefined}
        nextUrl={next ? readerPath(book.work.id, next.id) : undefined}
        nextVerseId={next?.id}
      />
    </WorkScopeProvider>
  );
}
