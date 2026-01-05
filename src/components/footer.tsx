import { Github } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-[var(--divider)] mt-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 text-center">
          <p className="text-[var(--muted)] text-sm">
            Free &amp; open source. No personal data collected.
          </p>
          <a
            href="https://github.com/AustinKelsay/visibible"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
            aria-label="View source on GitHub"
          >
            <Github size={20} strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </footer>
  );
}
