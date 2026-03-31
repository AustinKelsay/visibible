"use client";

import { useMemo } from "react";
import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useNavigation } from "@/context/navigation-context";
import { MOBILE_VERSE_NAV_OFFSET } from "@/lib/mobile-verse-nav";
import { parseVerseUrl } from "@/lib/navigation";

/**
 * Floating action button for opening the chat sidebar.
 * Hidden when chat is already open.
 * Shifts upward when the mobile verse nav bar is visible.
 */
export function ChatFAB() {
  const { isChatOpen, openChat } = useNavigation();
  const pathname = usePathname();
  const hasMobileVerseNav = useMemo(() => {
    const pathnameParts = pathname?.split("/").filter(Boolean) ?? [];
    if (pathnameParts.length < 3) return false;

    return Boolean(parseVerseUrl(
      pathnameParts[0],
      pathnameParts[1],
      pathnameParts[2]
    ));
  }, [pathname]);

  // Hide FAB when chat is open
  if (isChatOpen) return null;

  // Shift FAB above the sticky verse nav bar when on a verse page
  return (
    <button
      onClick={openChat}
      style={{
        bottom: hasMobileVerseNav
          ? MOBILE_VERSE_NAV_OFFSET
          : "calc(env(safe-area-inset-bottom) + 1.5rem)",
      }}
      className={`
        fixed right-4 z-30
        sm:hidden
        min-h-[48px] min-w-[48px]
        flex items-center justify-center
        rounded-full shadow-md
        bg-[var(--accent)] text-[var(--accent-text)]
        hover:bg-[var(--accent-hover)]
        transition-all duration-[var(--motion-fast)]
        active:scale-95
        cursor-pointer
      `}
      aria-label="Open chat"
    >
      <MessageCircle size={20} strokeWidth={1.5} />
    </button>
  );
}
