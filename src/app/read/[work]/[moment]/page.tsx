import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { ProseReader } from "@/components/prose-reader";
import { WorkScopeProvider } from "@/context/work-scope-context";
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

export default async function MomentPage({ params }: MomentPageProps) {
  const { work: workId, moment: momentId } = await params;
  const found = await bookForPage(workId);
  const moment = found?.book.moments.find((m) => m.id === momentId);
  if (!found || !moment) notFound();
  const { book, ownerPreview } = found;
  const chapter = book.chapters[moment.chapterIndex];
  const prev = book.moments[moment.index - 1];
  const next = book.moments[moment.index + 1];
  const scope = {
    workId: book.work.id,
    unitId: moment.id,
    styleIds: [...book.work.styleIds],
    passage: { full: moment.reference, short: moment.shortReference },
    contentsHref: readerPath(book.work.id),
  };
  return (
    <LayoutWrapper>
      <WorkScopeProvider scope={scope}>
      <Header />
      <ProseReader
        scope={scope}
        workTitle={book.work.title}
        chapterLabel={chapter.label}
        chapterNumber={moment.chapterIndex + 1}
        position={{ index: chapter.moments.indexOf(moment), total: chapter.moments.length }}
        paragraphs={moment.paragraphs}
        prevUrl={prev ? readerPath(book.work.id, prev.id) : undefined}
        nextUrl={next ? readerPath(book.work.id, next.id) : undefined}
        ownerPreview={ownerPreview}
      />
      </WorkScopeProvider>
      <Footer />
    </LayoutWrapper>
  );
}
