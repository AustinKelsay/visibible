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
      "You choose the art style for images and the model for chat. Chat models differ in strengths and cost.",
      "There are no accounts. Everything runs through an anonymous browser session.",
      "Images and videos are saved when they are generated, and saved ones are public: anyone can browse them, and the images have simple API docs for reuse. Chat answers are not saved. An image that could not be saved stays on your screen only until you leave the page.",
    ],
  },
  {
    title: "Credits",
    body: [
      "Visibible uses credits, not subscriptions. $1 for 100 credits or $3 for 300, paid over Lightning. Purchases are non-refundable during alpha.",
      "When you ask for an image, a video or a chat answer, you see the price first. Images and chat show an estimate and a maximum, such as “About 6 credits · at most 12”; a video shows one price, which is its maximum. The maximum is set aside from your balance while the request runs. You are then charged what the provider reports the request cost, or the estimate when it reports nothing, never more than the maximum, and the rest goes back to your balance. A request that fails or returns nothing is not charged.",
      "If you hold credits and open a verse that has no image in your chosen style, an image is generated for it automatically, without a price confirmation, and charged the same way.",
      "A new image usually costs about 6 credits. A video costs more, depending on its length and resolution. Chat is priced by the model you pick and the length of the conversation. If the price of something you asked for rises above the maximum you saw, you are shown the new price and asked to confirm.",
      "Credits belong to one browser session and cannot be moved to another browser or device. A session ends after 7 days without use and, at the latest, 30 days after it began. Clearing your cookies ends it too. When a session ends you lose access to the credits left in it, and you should not count on getting them back, so buy what you expect to use within that time.",
    ],
  },
  {
    title: "Privacy",
    body: [
      "No accounts, no profiles, no email address. A cookie identifies your browser session. Your translation, model and style preferences are kept in your browser.",
      "Our database holds your session and its credit balance, a salted hash of your IP address rather than the address itself (for rate limits and abuse checks), your purchases and charges, and a record of each image or video request. The prompt is kept with each saved image and each video request. A purchase is stored as its Lightning invoice and whether it was paid, with nothing about your wallet.",
      "Chat conversations are not kept on our servers. To answer, each message is sent with its passage to the AI provider, OpenRouter. Image and video prompts go to the same provider.",
      "Images and videos you generate are public once saved. The library does not show who generated them.",
      "Feedback you send is stored with the verse or image it concerns, your session and your browser’s user agent.",
      "Vercel Analytics counts page views and events such as a verse viewed or an image generated. Those events carry no session ID and no message text.",
    ],
  },
  {
    title: "Sources",
    body: [
      "The reader uses your selected translation. Illustrations generated with shared character and scene preparation use the World English Bible (public domain), imported from eBible.org. Saved images keep their original text and translation when available. Some older images lack this information.",
      "Story sections for the Bible draw on the pericope data published by Clear.Bible, licensed CC BY 4.0.",
      "Same-name hints for the Bible draw on STEPBible's TIPNR (Translators Individualised Proper Names with all References), by Tyndale House, Cambridge, licensed CC BY 4.0.",
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
          <div className="max-w-4xl mx-auto px-4 py-8 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-medium tracking-[0.14em] uppercase text-[var(--accent)]">
                About Visibible
              </p>
              <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-[var(--foreground)]">
                Visualize the Bible, verse by verse.
              </h1>
              <p className="mt-6 text-base sm:text-lg leading-8 text-[var(--foreground)]/80">
                How Visibible works, what it costs, and why it exists.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 py-8 sm:py-14">
          <div className="grid gap-4 sm:gap-5">
            {sections.map((section) => (
              <article
                key={section.title}
                className="rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--surface)] p-5 sm:p-7"
              >
                <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
                  {section.title}
                </h2>
                <div className="mt-3 max-w-[65ch] space-y-3 text-sm sm:text-base leading-7 text-[var(--foreground)]/80">
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
            <p className="mt-3 text-sm sm:text-base leading-7 text-[var(--foreground)]/80">
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
