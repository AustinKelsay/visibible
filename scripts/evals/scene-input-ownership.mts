/** Offline ownership-only prompt comparison. No provider, runtime option or new preparation state. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GENERIC_PROMPT_MAX_CHARS, PRECEDENCE_LINE } from "../../src/lib/engine/prompt";
import { captureBibleEngineRequests } from "../../tests/fixtures/bible-engine-golden";
import { captureWorkEngineRequests, GOLDEN_WORKS } from "../../tests/fixtures/work-engine-golden";

const root = path.resolve(import.meta.dirname, "../..");
const baselineCommit = "29b9c7815c2b3234b341e5aed98c16b4ebc8c1ef";
const out = path.join(root, "evals/images/runs/2026-10-31-scene-input-ownership");
const oldHeading = "SCENE PLAN (this moment's place, time and action; obey the rules, brief, canon and style):";
const ownership = "Follow the rendering rules and work brief; owner look constraints remain binding. Within those constraints, explicit source facts and changes govern the depicted moment. The plan selects one instant and its changing state. Canon supplies recurring appearance. Art style supplies visual treatment.";
const newHeading = "SCENE PLAN (one instant and its changing state):";
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const inputHashes: Record<string, string> = {};
function read<T>(file: string): T {
  const bytes = readFileSync(path.join(root, file));
  assert.equal(hash(bytes), hash(execFileSync("git", ["show", `${baselineCommit}:${file}`], { cwd: root })), file);
  inputHashes[file] = hash(bytes);
  return JSON.parse(bytes.toString());
}

// Reuse the already-reviewed reconstruction, including its source and reference-byte checks.
// Its older full-source candidate is discarded: this trial transforms only its original baselines.
globalThis.fetch = async () => { throw new Error("Ownership replay forbids network access"); };
execFileSync("git", ["diff", "--quiet", baselineCommit, "--", "src", "styles", "works", "convex", "tests/fixtures", "package.json", "package-lock.json", "scripts/evals/render-source-context.mts"], { cwd: root });
await import(new URL("./render-source-context.mts", import.meta.url).href);
const priorDir = path.join(root, "evals/images/runs/2026-10-31-render-source-context-offline");
assert.deepEqual(JSON.parse(readFileSync(path.join(priorDir, "report.json"), "utf8")), read("llm/releases/2026-10-31-render-source-context-offline/report.json"));
type Packet = { caseId: string; work: string; baseline: string; references: unknown; sentReferences: unknown };
const prior = JSON.parse(readFileSync(path.join(priorDir, "packets.json"), "utf8")) as Packet[];
const packets = prior.map(p => ({ caseId: p.caseId, work: p.work, baseline: p.baseline, originalReferences: p.references, sentReferences: p.sentReferences }));
assert.equal(packets.length, 36);

// Existing golden cases add owner constraints, multiple themes, empty character selection,
// suppressed source and a near-budget packet. Their fake adapters never contact a provider.
const goldenPackets = [];
for (const work of ["bible-web", ...GOLDEN_WORKS]) {
  const file = `tests/fixtures/${work === "bible-web" ? "bible" : work}-engine-golden.json`;
  const expected = read<Record<string, string>>(file);
  const captured = work === "bible-web" ? await captureBibleEngineRequests() : await captureWorkEngineRequests(work);
  assert.deepEqual(captured, expected, `Current ${work} requests must match their golden baseline`);
  for (const [key, baseline] of Object.entries(captured).filter(([key]) => key.endsWith(":prompt"))) {
    goldenPackets.push({ caseId: `${work}/${key}`, work, baseline, originalPacket: JSON.parse(captured[key.replace(/:prompt$/, ":packet")]) });
  }
}
assert.equal(goldenPackets.length, 12);

function candidate(prompt: string) {
  const before = prompt.split("\n");
  assert.equal(before.filter(line => line === PRECEDENCE_LINE).length, 1);
  assert.equal(before.filter(line => line === oldHeading).length, 1);
  const after = before.map(line => line === PRECEDENCE_LINE ? ownership : line === oldHeading ? newHeading : line);
  assert.deepEqual(after.filter((_, i) => before[i] !== PRECEDENCE_LINE && before[i] !== oldHeading), before.filter(line => line !== PRECEDENCE_LINE && line !== oldHeading));
  const result = after.join("\n");
  assert.ok(result.length <= GENERIC_PROMPT_MAX_CHARS, "Reject overflow; never truncate the diagnostic packet");
  return result;
}
const compared = [...packets, ...goldenPackets].map(p => ({ ...p, candidate: candidate(p.baseline) }));
assert.equal(new Set(compared.map(p => p.caseId)).size, 48);
assert.throws(() => candidate("unrecognized packet"));
assert.throws(() => candidate(`${packets[0].baseline}\n${"x".repeat(GENERIC_PROMPT_MAX_CHARS)}`));
const cases = compared.map(p => ({ caseId: p.caseId, work: p.work, baselineChars: p.baseline.length, candidateChars: p.candidate.length,
  baselineHash: hash(p.baseline), candidateHash: hash(p.candidate), ownerConstraints: p.baseline.includes("OWNER LOOK CONSTRAINTS (binding, verbatim):"),
  sourceSuppressed: p.baseline.includes("described by the scene plan below.") }));
assert.ok(cases.some(p => p.ownerConstraints));
assert.ok(cases.some(p => p.sourceSuppressed));
assert.ok(cases.some(p => p.baselineChars > 11900));
const report = { baselineCommit, inputHashes, scriptHash: hash(readFileSync(import.meta.filename)), liveProviderCalls: 0, spendUsd: 0,
  replacements: [{ before: PRECEDENCE_LINE, after: ownership }, { before: oldHeading, after: newHeading }],
  frozenPackets: packets.length, goldenPackets: goldenPackets.length, allOtherPromptLinesExact: true, overflowRejected: true,
  provenance: "Original preparation, packet and reference metadata remain baseline evidence, not admission or versions for the diagnostic candidate.", cases };
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "packets.json"), JSON.stringify(compared, null, 2) + "\n");
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ compared: compared.length, changedLinesPerPrompt: 2, liveProviderCalls: 0, output: out }, null, 2));
