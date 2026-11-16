"use client";

import { AdvancedItem } from "@/components/spread/advanced/item";
import { useLayers } from "@/components/spread/layers";
import { useSession } from "@/context/session-context";

/** Reopens the welcome on demand. It never opens by itself. */
export function WelcomeItem() {
  const { showWelcome } = useSession();
  const { closeLayer } = useLayers();

  return (
    <AdvancedItem title="Welcome">
      <button
        type="button"
        onClick={() => {
          closeLayer();
          showWelcome();
        }}
        className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm text-white/90 transition-colors duration-[var(--motion-fast)] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
      >
        Show the welcome
      </button>
    </AdvancedItem>
  );
}
