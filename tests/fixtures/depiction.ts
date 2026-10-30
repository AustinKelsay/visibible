/**
 * Depiction profiles for synthetic test works. Tests of engine mechanics give a synthetic work the Bible's wording
 * under its own id, so they exercise the same contracts the Bible uses; `withoutEffects` is a work with no subjects
 * without form, as Holmes is.
 */
import { readFileSync } from "node:fs";
import { loadDepictionProfile, type DepictionProfile } from "../../src/lib/engine/depiction";

export const bibleDepictionJson = JSON.parse(readFileSync(new URL("../../works/bible-web/depiction.json", import.meta.url), "utf8")) as Record<string, unknown> & { modes: Record<string, unknown> };

export function testDepiction(workId: string, options: { withoutEffects?: boolean } = {}): DepictionProfile {
  return loadDepictionProfile({ ...bibleDepictionJson, workId, ...(options.withoutEffects ? { modes: {} } : {}) }, workId);
}
