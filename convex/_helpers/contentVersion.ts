/**
 * Content-hash versions for analysis records (#168).
 *
 * A version identifies a record's payload, not the time it was written: two writes of the same
 * payload get the same version, so dependents can name exactly which input they used. The hash
 * is FNV-1a over canonical JSON (object keys sorted), computed with four seeds for a 128-bit
 * identity. It is an identity, not a security primitive.
 */

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function fnv1a32(text: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const SEEDS = [0x811c9dc5, 0x9dc5811c, 0xc5811c9d, 0x1c9dc581];

export function contentVersion(payload: unknown): string {
  const text = canonical(payload);
  return SEEDS.map((seed) => fnv1a32(text, seed)).join("");
}
