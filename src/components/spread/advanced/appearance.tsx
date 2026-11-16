"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { AdvancedItem } from "@/components/spread/advanced/item";
import { useSession } from "@/context/session-context";
import { offerAdvancedSettings, setAdvancedSetting, useAdvancedSettings, type ReaderAppearance } from "@/lib/advanced-settings";
import { trackPreferenceChanged } from "@/lib/analytics";

// This item lets the reader choose it; without it the reader is dark.
offerAdvancedSettings("appearance");

const CHOICES: Array<{ value: ReaderAppearance; label: string }> = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "Follow the system" },
];

/** Appearance: dark (the default), light, or as the system is set. The whole-picture view stays dark. */
export function AppearanceItem() {
  const { appearance } = useAdvancedSettings();
  const { tier, credits } = useSession();
  const headingId = useId();

  return (
    <AdvancedItem title="Appearance" headingId={headingId}>
      <div role="radiogroup" aria-labelledby={headingId}>
        {CHOICES.map(({ value, label }) => {
          const isSelected = value === appearance;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => {
                if (isSelected) return;
                setAdvancedSetting("appearance", value);
                trackPreferenceChanged({ preference: "appearance", value, source: "advanced", tier, hasCredits: credits > 0 });
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-ink/90 transition-colors duration-[var(--motion-fast)] hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
            >
              <Check size={14} aria-hidden="true" className={`shrink-0 ${isSelected ? "" : "invisible"}`} />
              <span className="flex-1">{label}</span>
            </button>
          );
        })}
      </div>
    </AdvancedItem>
  );
}
