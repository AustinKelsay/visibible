/** One moment's resolved conditions; the original section look remains a dependency. */
export const SITUATION_FIELDS = ["place", "timeOfDay", "weather", "light", "clothing"] as const;
export type Situation = Record<(typeof SITUATION_FIELDS)[number], string>;

/** Unknown historical provenance is a constraint, never permission to reinterpret owner prose. */
export function lookPolicy(record: { source?: string }) {
  return record.source === "generated" ? "generated-guide-v1" as const : "literal-constraint-v1" as const;
}

/** Generated guides no longer affect preparation; unknown provenance remains an owner constraint. */
export function ownerLookVersion(record: { source?: string; version: string } | null | undefined): string | null {
  return record && record.source !== "generated" ? record.version : null;
}
