import { Github, Mail, Twitter } from "lucide-react";

export function Footer() {
  return (
    <footer
      className="border-t border-[var(--divider)] mt-auto"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <p className="text-[var(--muted)] text-xs sm:text-sm">
            Free &amp; open source software.
          </p>
          <div className="flex items-center justify-center gap-2">
            <a
              href="https://github.com/AustinKelsay/visibible"
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
              aria-label="View source on GitHub"
              title="GitHub"
            >
              <Github size={20} strokeWidth={1.5} />
            </a>
            <a
              href="https://x.com/bitcoinplebdev"
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
              aria-label="Follow on X"
              title="X (Twitter)"
            >
              <Twitter size={20} strokeWidth={1.5} />
            </a>
            <a
              href="https://primal.net/p/nprofile1qqsgzu4eypfy0h07nxmcxvs8stgrztarqksen7etaz37v437yz60pcsmz2txt"
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
              aria-label="Follow on Nostr"
              title="Nostr"
            >
              <svg
                aria-hidden="true"
                className="h-[26px] w-[26px]"
                viewBox="0 0 256 256"
                fill="currentColor"
              >
                <path d="M210.8 199.4c0 3.1-2.5 5.7-5.7 5.7h-68c-3.1 0-5.7-2.5-5.7-5.7v-15.5c.3-19 2.3-37.2 6.5-45.5 2.5-5 6.7-7.7 11.5-9.1 9.1-2.7 24.9-.9 31.7-1.2 0 0 20.4.8 20.4-10.7s-9.1-8.6-9.1-8.6c-10 .3-17.7-.4-22.6-2.4-8.3-3.3-8.6-9.2-8.6-11.2-.4-23.1-34.5-25.9-64.5-20.1-32.8 6.2.4 53.3.4 116.1v8.4c0 3.1-2.6 5.6-5.7 5.6H57.7c-3.1 0-5.7-2.5-5.7-5.7v-144c0-3.1 2.5-5.7 5.7-5.7h31.7c3.1 0 5.7 2.5 5.7 5.7 0 4.7 5.2 7.2 9 4.5 11.4-8.2 26-12.5 42.4-12.5 36.6 0 64.4 21.4 64.4 68.7v83.2ZM150 99.3c0-6.7-5.4-12.1-12.1-12.1s-12.1 5.4-12.1 12.1 5.4 12.1 12.1 12.1S150 106 150 99.3Z" />
              </svg>
            </a>
            <a
              href="mailto:bitcoinplebdev@protonmail.com"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
              aria-label="Email"
              title="Email"
            >
              <Mail size={20} strokeWidth={1.5} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
