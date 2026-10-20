/**
 * Art styles for the reader (#177, spec #165 §3): the shared library's ids, labels and one-line
 * descriptions in the brief's order, the Classical default, and how a saved preference resolves
 * against what is offered and what the server currently admits. Only the six rendering parts of a
 * style enter prompts; this module carries the metadata the reader sees.
 */
import { SHARED_STYLES } from "./work-preparation";

export type ArtStyleOption = { id: string; label: string; description: string };
export type ArtStyleAvailability = ArtStyleOption & { available: boolean; reason: string | null };

export const DEFAULT_ART_STYLE = "classical";
export const ART_STYLES: readonly ArtStyleOption[] = Object.freeze(SHARED_STYLES.styles.map(({ id, label, description }) => ({ id, label, description })));
export const ART_STYLE_IDS: readonly string[] = ART_STYLES.map((style) => style.id);

export function isArtStyleId(value: unknown): value is string {
  return typeof value === "string" && ART_STYLE_IDS.includes(value);
}

export function artStyleLabel(id: string): string {
  return ART_STYLES.find((style) => style.id === id)?.label ?? id;
}

/**
 * The style to generate and browse in. A saved preference the work does not offer falls back to
 * the work's default without being overwritten; an offered style the server is not admitting
 * right now stays selected but is reported unavailable, never silently replaced by Classical.
 */
export function resolveArtStyle(saved: string | null | undefined, availability: readonly ArtStyleAvailability[] | null, offered: readonly string[] = ART_STYLE_IDS) {
  const selected = saved && offered.includes(saved) ? saved : offered[0] ?? DEFAULT_ART_STYLE;
  const entry = availability?.find((style) => style.id === selected) ?? null;
  return {
    styleId: selected,
    usedDefault: selected !== saved,
    /** Null until availability is known. */
    available: entry ? entry.available : null,
    reason: entry?.reason ?? null,
  };
}
