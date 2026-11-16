import { Github, Mail, Twitter, type LucideProps } from "lucide-react";

function NostrIcon({ size = 20, className }: LucideProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} className={className} viewBox="0 0 256 256" fill="currentColor">
      <path d="M210.8 199.4c0 3.1-2.5 5.7-5.7 5.7h-68c-3.1 0-5.7-2.5-5.7-5.7v-15.5c.3-19 2.3-37.2 6.5-45.5 2.5-5 6.7-7.7 11.5-9.1 9.1-2.7 24.9-.9 31.7-1.2 0 0 20.4.8 20.4-10.7s-9.1-8.6-9.1-8.6c-10 .3-17.7-.4-22.6-2.4-8.3-3.3-8.6-9.2-8.6-11.2-.4-23.1-34.5-25.9-64.5-20.1-32.8 6.2.4 53.3.4 116.1v8.4c0 3.1-2.6 5.6-5.7 5.6H57.7c-3.1 0-5.7-2.5-5.7-5.7v-144c0-3.1 2.5-5.7 5.7-5.7h31.7c3.1 0 5.7 2.5 5.7 5.7 0 4.7 5.2 7.2 9 4.5 11.4-8.2 26-12.5 42.4-12.5 36.6 0 64.4 21.4 64.4 68.7v83.2ZM150 99.3c0-6.7-5.4-12.1-12.1-12.1s-12.1 5.4-12.1 12.1 5.4 12.1 12.1 12.1S150 106 150 99.3Z" />
    </svg>
  );
}

/** The project's social links, shown in the corner menu and the old footer. */
export const SOCIAL_LINKS = [
  { href: "https://github.com/AustinKelsay/visibible", label: "View source on GitHub", title: "GitHub", Icon: Github, external: true },
  { href: "https://x.com/bitcoinplebdev", label: "Follow on X", title: "X (Twitter)", Icon: Twitter, external: true },
  {
    href: "https://primal.net/p/nprofile1qqsgzu4eypfy0h07nxmcxvs8stgrztarqksen7etaz37v437yz60pcsmz2txt",
    label: "Follow on Nostr",
    title: "Nostr",
    Icon: NostrIcon,
    external: true,
  },
  { href: "mailto:bitcoinplebdev@protonmail.com", label: "Email", title: "Email", Icon: Mail, external: false },
] as const;

/** One icon link per social link; position and colour come from `className`. */
export function SocialLinks({ className, iconSize = 20 }: { className: string; iconSize?: number }) {
  return SOCIAL_LINKS.map(({ href, label, title, Icon, external }) => (
    <a
      key={href}
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={className}
      aria-label={label}
      title={title}
    >
      <Icon size={label === "Follow on Nostr" ? iconSize + 6 : iconSize} strokeWidth={1.5} />
    </a>
  ));
}
