/** Unblinds and reports pipeline and without-review rates with 95% Wilson intervals. No network or model calls. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { dir, json, save } from "./common.mjs";

type Flags = Record<"U" | "X" | "I" | "F" | "R" | "M" | "N", boolean>;
const blockers = ["U", "X", "I", "F", "R", "M"] as const;
const plan = json("plan.json"), blind = json("blind-replies.json"), key: Array<{ blindId: string; uses: Array<{ sample: string; role: string }> }> = json("blind-key.json").key;
const a = json("scores-a.json"), b = json("scores-b.json"), adjudication = json("adjudication.json");
assert.ok(Date.parse(adjudication.at) >= Math.max(Date.parse(a.at), Date.parse(b.at)));
const byId = (s: { scores: Array<{ blindId: string; flags: Flags }> }) => new Map(s.scores.map((x) => [x.blindId, x.flags]));
const fa = byId(a), fb = byId(b), decided = new Map<string, Flags>(adjudication.decisions.map((d: { blindId: string; flags: Flags }) => [d.blindId, d.flags]));
let agreed = 0, blockerAgreed = 0;
const final = new Map<string, Flags>();
for (const { blindId } of blind.replies) {
  const x = fa.get(blindId)!, y = fb.get(blindId)!; assert.ok(x && y, `missing score ${blindId}`);
  const sameBlockers = blockers.every((f) => x[f] === y[f]), same = sameBlockers && x.N === y.N;
  if (sameBlockers) blockerAgreed++; if (same) agreed++;
  final.set(blindId, same ? x : decided.get(blindId)!); assert.ok(final.get(blindId), `disagreement ${blindId} needs a decision`);
}
// A reply with blank scene fields (a missing-cast report) is not a plan, so it is never "clean".
const blank = new Set<string>(blind.replies.filter((r: { scene: Record<string, string> }) => Object.values(r.scene).every((v) => !String(v ?? "").trim())).map((r: { blindId: string }) => r.blindId));
const flagsFor = new Map<string, Flags | undefined>();
for (const k of key) for (const u of k.uses) flagsFor.set(`${u.sample}:${u.role}`, blank.has(k.blindId) ? undefined : final.get(k.blindId)!);
const samples = fs.readFileSync(path.join(dir, "samples.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const traces = fs.readFileSync(path.join(dir, "provider.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const firstRound = (s: { spendOutcomes: string[] }) => { const at = s.spendOutcomes.filter((o) => o.startsWith("plan:") && !o.startsWith("plan:review")); const end = at.findIndex((o) => o === "plan:ok" || o === "plan:unavailable"); return end >= 0 && at[end] === "plan:ok"; };
const clean = (f: Flags | undefined) => !!f && blockers.every((x) => !f[x]);
const group = (book: string) => Object.entries(plan.bookGroups as Record<string, string[]>).find(([, books]) => books.includes(book))![0];
const rows = samples.map((s) => {
  const fFinal = flagsFor.get(`${s.id}:final`), fFirst = flagsFor.get(`${s.id}:first`);
  const stored = s.outcome === "stored", storedWithout = firstRound(s);
  const prefix = "Error: Preparing scene: plan unavailable: ", reason = stored ? null : String(s.error).replace(prefix, "");
  const cause = stored ? null : reason!.startsWith("required canon unavailable") ? "missingCast" : reason!.startsWith("plan review") ? "review" : "evidence";
  return { id: s.id, book: s.book, group: group(s.book), stored, cause, accepted: stored && clean(fFinal), flawedStored: stored && !clean(fFinal), falseRefusal: !stored && clean(fFinal),
    replanned: s.spendOutcomes.filter((o: string) => o === "plan:ok" || o === "plan:unavailable").length > 1, lookPrepared: s.lookPrepared, elapsedMs: s.elapsedMs,
    costUsd: traces.filter((t) => t.phase === s.id).reduce((n, t) => n + t.measuredUsageUsd, 0),
    withoutReview: { stored: storedWithout, accepted: storedWithout && clean(fFirst), flawedStored: storedWithout && !clean(fFirst) },
    flags: Object.fromEntries(blockers.map((f) => [f, !!fFinal?.[f]])) };
});
const wilson = (k: number, n: number) => { if (!n) return null; const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d; return { k, n, rate: p, low: Math.max(0, c - h), high: Math.min(1, c + h) }; };
const rates = (rs: typeof rows) => ({ n: rs.length, accepted: wilson(rs.filter((r) => r.accepted).length, rs.length), flawedStored: wilson(rs.filter((r) => r.flawedStored).length, rs.length),
  refused: wilson(rs.filter((r) => !r.stored).length, rs.length),
  refusedBy: { missingCast: rs.filter((r) => r.cause === "missingCast").length, evidence: rs.filter((r) => r.cause === "evidence").length, review: rs.filter((r) => r.cause === "review").length },
  falseRefusal: wilson(rs.filter((r) => r.falseRefusal).length, rs.length), replanned: wilson(rs.filter((r) => r.replanned).length, rs.length),
  withoutReview: { accepted: wilson(rs.filter((r) => r.withoutReview.accepted).length, rs.length), flawedStored: wilson(rs.filter((r) => r.withoutReview.flawedStored).length, rs.length), refused: wilson(rs.filter((r) => !r.withoutReview.stored).length, rs.length) } });
const pct = (v: number[], q: number) => { const s = [...v].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };
const ms = rows.map((r) => r.elapsedMs);
const result = { at: new Date().toISOString(), samplesTaken: rows.length, target: plan.sampling.target,
  scorerAgreement: { replies: blind.replies.length, agreedAllFlags: agreed, agreedBlockers: blockerAgreed, decisions: adjudication.decisions.length },
  overall: rates(rows), byGroup: Object.fromEntries(Object.keys(plan.bookGroups).map((g) => [g, rates(rows.filter((r) => r.group === g))])),
  flagCounts: Object.fromEntries(blockers.map((f) => [f, rows.filter((r) => r.flags[f]).length])),
  latencyMs: { median: pct(ms, 0.5), p90: pct(ms, 0.9), max: Math.max(...ms), withLook: rows.filter((r) => r.lookPrepared).length },
  costUsd: { total: rows.reduce((n, r) => n + r.costUsd, 0), medianPerSample: pct(rows.map((r) => r.costUsd), 0.5), maxPerSample: Math.max(...rows.map((r) => r.costUsd)) }, rows };
save("tally.json", result);
const o = result.overall;
const fmt = (w: ReturnType<typeof wilson>) => w ? `${w.k}/${w.n} (${(w.rate * 100).toFixed(0)}%, ${(w.low * 100).toFixed(0)}-${(w.high * 100).toFixed(0)}%)` : "-";
console.log(`accepted ${fmt(o.accepted)} | flawed stored ${fmt(o.flawedStored)} | refused ${fmt(o.refused)} | false refusals ${fmt(o.falseRefusal)} | re-planned ${fmt(o.replanned)}`);
console.log(`without review: accepted ${fmt(o.withoutReview.accepted)} | flawed stored ${fmt(o.withoutReview.flawedStored)} | refused ${fmt(o.withoutReview.refused)}`);
for (const [g, r] of Object.entries(result.byGroup)) console.log(`${g}: n=${r.n} accepted ${fmt(r.accepted)} flawed ${fmt(r.flawedStored)} | without review accepted ${fmt(r.withoutReview.accepted)} flawed ${fmt(r.withoutReview.flawedStored)}`);
console.log(JSON.stringify({ flags: result.flagCounts, latencyMs: result.latencyMs, costUsd: result.costUsd, agreement: result.scorerAgreement }));
