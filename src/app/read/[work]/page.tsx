import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { BookMenu } from "@/components/book-menu";
import { bookForPage, readerPath } from "@/lib/works/reader-pages";
import { findProseWork } from "@/lib/works/catalog";

export const dynamic = "force-dynamic";

type ContentsPageProps = { params: Promise<{ work: string }> };

export async function generateMetadata({ params }: ContentsPageProps): Promise<Metadata> {
  const work = findProseWork((await params).work);
  if (!work) return { title: "Visibible" };
  return {
    title: `${work.title} - Visibible`,
    description: `${work.title} by ${work.author}, illustrated as you read.`,
    ...(work.visibility === "public" ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function ContentsPage({ params }: ContentsPageProps) {
  const found = await bookForPage((await params).work);
  if (!found) notFound();
  const { book, ownerPreview } = found;
  const first = book.moments[0];
  return (
    <LayoutWrapper>
      <Header />
      <main className="flex-1 px-4 md:px-6 py-8 sm:py-12 max-w-2xl w-full mx-auto">
        <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
          <Link href="/read" className="hover:text-[var(--foreground)]">Library</Link>
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-light tracking-tight text-balance">{book.work.title}</h1>
        <p className="mt-1 text-[var(--muted)]">{book.work.author}</p>
        {ownerPreview ? <p className="mt-3 text-xs text-[var(--muted)]">Owner preview: readers cannot open this book yet.</p> : null}
        {first ? (
          <Link
            href={readerPath(book.work.id, first.id)}
            className="mt-6 inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)] hover:bg-[var(--accent-hover)]"
          >
            Start reading
          </Link>
        ) : null}
        <ol className="mt-8 divide-y divide-[var(--divider)] border-y border-[var(--divider)]">
          {book.chapters.map((chapter, index) => chapter.moments.length ? (
            <li key={chapter.key}>
              <Link href={readerPath(book.work.id, chapter.moments[0].id)} className="flex items-baseline gap-3 py-3 hover:text-[var(--accent)]">
                <span className="w-6 shrink-0 text-right text-sm tabular-nums text-[var(--muted)]">{index + 1}</span>
                <span className="flex-1">{chapter.label}</span>
                <span className="text-xs text-[var(--muted)]">{chapter.moments.length} passages</span>
              </Link>
            </li>
          ) : null)}
        </ol>
        <p className="mt-8 text-xs text-[var(--muted)]">{book.credit}</p>
      </main>
      <Footer />
      {/* The header's book button opens the Bible's book menu here, as on every page without a prose passage. */}
      <BookMenu />
    </LayoutWrapper>
  );
}
