import { Chat } from "@/components/chat";
import { HeroImage } from "@/components/hero-image";
import { ScriptureDetails } from "@/components/scripture-details";
import { ScriptureReader } from "@/components/scripture-reader";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[var(--background)]/80 border-b border-[var(--divider)]">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Vibible</h1>
          <nav className="flex items-center gap-1">
            <button
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
              aria-label="Search"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
            <button
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
              aria-label="Menu"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Hero Image */}
        <HeroImage caption="In the beginning" />

        {/* Scripture Reader */}
        <div className="flex-1 py-8">
          <ScriptureReader book="Genesis" chapter={1} />
        </div>

        {/* Scripture Details */}
        <div className="max-w-2xl mx-auto w-full">
          <ScriptureDetails
            book="Genesis"
            chapter={1}
            verseRange="1-10"
            imageAttribution={{
              title: "The Creation",
              artist: "AI Generated",
              source: "Vibible",
            }}
          />
        </div>
      </main>

      {/* Chat - Fixed at Bottom */}
      <div className="sticky bottom-0 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <Chat />
      </div>
    </div>
  );
}
