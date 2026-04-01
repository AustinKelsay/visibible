import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { BookMenu } from "@/components/book-menu";

export const metadata: Metadata = {
  title: "About - Visibible",
  description:
    "How Visibible works, what it costs, and why it exists.",
};

const sections = [
  {
    title: "What This Is",
    body: [
      "Visibible brings Scripture to life visually. Navigate the Bible verse by verse, generate images from what you're reading, and ask questions along the way.",
      "Verse pages open in the reader by default, and you can switch into a chapter gallery to scan saved artwork and unillustrated verses side by side.",
      "The text comes first. The imagery is there to help you see it fresh.",
    ],
  },
  {
    title: "How It Works",
    body: [
      "Pick a translation, navigate to any verse, and generate an image from it. You can also chat about the passage if you want to dig into the meaning.",
      "You choose which models power the chat and image generation. Different models have different strengths and costs.",
      "There are no accounts. Everything runs through an anonymous browser session.",
      "Saved verse images also become part of a public read-only library, with simple API docs for browsing and reusing what has already been generated.",
    ],
  },
  {
    title: "Credits",
    body: [
      "Visibible uses credits, not subscriptions. $1 for 100 credits or $3 for 300, paid over Lightning.",
      "Chat and image generation both cost credits. The amount depends on the model you pick.",
      "Credits are tied to your browser session. If you clear site data or switch devices, they won't carry over yet.",
    ],
  },
  {
    title: "Privacy",
    body: [
      "No accounts, no profiles. The app stores your session, preferences, and generated images — nothing more.",
      "Basic analytics help us understand what's working. They don't track who you are.",
    ],
  },
  {
    title: "Why",
    body: [
      "Scripture is worth spending time with. Visibible is a simple tool to help people do that — see the stories, sit with the text, and understand it better.",
    ],
  },
] as const;

export default function AboutPage() {
  return (
    <LayoutWrapper>
      <Header />

      <main className="flex-1">
        <section className="border-b border-[var(--divider)]">
          <div className="max-w-4xl mx-auto px-4 py-16 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-medium tracking-[0.14em] uppercase text-[var(--accent)]">
                About Visibible
              </p>
              <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-[var(--foreground)]">
                Visualize the Bible, verse by verse.
              </h1>
              <p className="mt-6 text-base sm:text-lg leading-8 text-[var(--muted)]">
                How Visibible works, what it costs, and why it exists.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 py-10 sm:py-14">
          <div className="grid gap-4 sm:gap-5">
            {sections.map((section) => (
              <article
                key={section.title}
                className="rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--surface)] p-5 sm:p-7"
              >
                <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
                  {section.title}
                </h2>
                <div className="mt-3 space-y-3 text-sm sm:text-base leading-7 text-[var(--muted)]">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="mt-10 rounded-[var(--radius-lg)] border border-[var(--divider)] p-5 sm:p-7">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
              Open Source
            </h2>
            <p className="mt-3 text-sm sm:text-base leading-7 text-[var(--muted)]">
              Visibible is open source. The code is on{" "}
              <Link
                href="https://github.com/AustinKelsay/visibible"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--foreground)] underline underline-offset-4"
              >
                GitHub
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <Footer />
      <BookMenu />
    </LayoutWrapper>
  );
}
