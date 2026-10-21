/** Offline audit and packet replay only: no credentials, network, models or analysis mutations. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
import { buildRenderingPacket, type AvailableReference, type SelectedCanon } from "../../../src/lib/engine/prompt";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";

const dir = fileURLToPath(new URL("./", import.meta.url));
const root = path.resolve(dir, "../../..");
const pilot = path.join(dir, "../2026-10-21-daniel-schema-pilot");
const edge = path.join(dir, "../2026-10-20-watercolor-edge-check/fixtures");
const trial = path.join(dir, "../2026-10-20-engine-funded-evaluation/watercolor-trial");
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const preflight = await json(path.join(pilot, "preflight.json"));
const trace = gunzipSync(await readFile(path.join(pilot, "provider.ndjson.gz"))).toString().trim().split("\n").map((line) => JSON.parse(line));
const inputs = await readWorkInputs("bible-web", root);
const replays = [];
const references = [];
for (const saved of preflight.packets) {
  const style = inputs.styles[saved.styleId];
  assert.equal(style.version, saved.packet.styleVersion);
  assert.equal(inputs.briefVersion, saved.packet.briefVersion);
  const available: AvailableReference[] = saved.packet.references.map((r: { kind: string; id: string; storageId: string; version: string }) => {
    assert.equal(r.kind, "styleReference"); // This exact pilot attached no character sheets.
    return { kind: "styleReference", styleId: r.id, storageId: r.storageId, version: r.version };
  });
  const replayInput = {
    work: { id: inputs.work.work.id, title: inputs.work.work.title },
    moment: { ...saved.context.moment, sectionId: saved.packet.sectionId },
    neighbors: { previous: saved.context.previous?.text, next: saved.context.next?.text },
    brief: inputs.brief, briefVersion: inputs.briefVersion, eraId: saved.packet.eraId,
    style: style.style, styleVersion: style.version,
    look: { version: saved.prepared.look.version, ...saved.prepared.look.payload },
    plan: { version: saved.prepared.plan.version, ...saved.prepared.plan.payload },
    canon: saved.canon as SelectedCanon[], references: available, aspectRatio: "16:9" as const,
  };
  const control = buildRenderingPacket(replayInput);
  assert.ok(control.ok);
  assert.equal(control.prompt, saved.prompt);
  assert.deepEqual(control.packet, saved.packet);
  const omitted = buildRenderingPacket({ ...replayInput, omitStyleReference: true });
  assert.ok(omitted.ok);
  assert.deepEqual(omitted.references, []);
  const withoutReferenceBlock = (text: string) => text.replace(/\n\nREFERENCE IMAGES[\s\S]*?(?=\n\n)/, "");
  assert.equal(omitted.prompt, withoutReferenceBlock(control.prompt));
  assert.deepEqual(omitted.packet.flags, { ...control.packet.flags, omitStyleReference: true });
  const imageRow = trace.find((r) => {
    const content = r.request.messages[0].content;
    return r.kind === "image" && (typeof content === "string" ? content : content[0].text) === control.prompt;
  });
  assert.ok(imageRow);
  const sent = imageRow.request.messages[0].content;
  const attachments = typeof sent === "string" ? [] : sent.slice(1);
  assert.equal(attachments.length, saved.references.length);
  for (const [i, reference] of saved.references.entries()) {
    const source = path.join(edge, saved.styleId === "icon" ? "bible-icon-control.jpg" : "bible-watercolor-3.jpg");
    const bytes = await readFile(source);
    assert.equal(hash(bytes), reference.sha256);
    assert.equal(bytes.length, reference.bytes);
    const attached = attachments[i].image_url.url;
    assert.equal(attached.sha256, reference.sha256);
    assert.equal(attached.bytes, reference.bytes);
    const metadata = await sharp(bytes).metadata();
    references.push({ styleId: saved.styleId, storageId: reference.storageId, version: saved.packet.references[i].version, file: path.relative(root, source), sha256: reference.sha256, bytes: reference.bytes, width: metadata.width, height: metadata.height });
  }
  replays.push({ styleId: saved.styleId, defaultPromptSha256: hash(control.prompt), exactDefaultPacket: true, controlPromptSha256: hash(omitted.prompt), controlPromptChars: omitted.prompt.length, originalReferenceCount: control.references.length, controlReferenceCount: 0 });
}
const trialState = JSON.parse(gunzipSync(await readFile(path.join(trial, "state.json.gz"))).toString());
const trialSamples = Object.values(trialState.samples) as Array<{ packet: { styleVersion: string; references: Array<{ kind: string }> } }>;
const trialStyleVersion = hash(await readFile(path.join(trial, "style.json")));
assert.equal(trialSamples.length, 9);
assert.ok(trialSamples.every((s) => s.packet.styleVersion === trialStyleVersion && !s.packet.references.some((r) => r.kind === "styleReference")));
assert.notEqual(trialStyleVersion, inputs.styles.watercolor.version);
const trialReviews = (await json(path.join(trial, "image-reviews.json"))).images;
const normalManifest = await json(path.join(dir, "manifest.normal.json"));
const omittedManifest = await json(path.join(dir, "manifest.omitted.json"));
assert.deepEqual({ ...omittedManifest, omitStyleReference: false }, normalManifest);
assert.equal(normalManifest.omitStyleReference, false);
assert.equal(omittedManifest.omitStyleReference, true);
assert.equal(normalManifest.plannedCalls, 6);
assert.equal(normalManifest.doneCalls, 0);
assert.equal(normalManifest.withinBudget, false);
assert.equal(normalManifest.budgetUsd, 0.06641160);
const report = {
  schemaVersion: 1, paidCalls: 0, mutations: 0, newImages: 0,
  evidenceBaseCommit: "df49eef3299d70f32956e742875eee044538fbaa",
  references, replays,
  unchangedSemanticInputs: {
    source: preflight.packets[0].context.moment.text,
    canon: preflight.packets[0].canon.find((c: SelectedCanon) => !c.hasForm).text,
    secondaryElements: preflight.packets[0].prepared.plan.payload.secondaryElements,
  },
  earlierWatercolorTrial: { samples: trialSamples.length, styleVersion: trialStyleVersion, styleAlsoChanged: true, styleReferencesOmitted: true, clearMarginFailures: trialReviews.filter((r: { marginVerdict: string }) => r.marginVerdict === "fail").length, ambiguousMargins: trialReviews.filter((r: { marginVerdict: string }) => r.marginVerdict === "review").length },
  unexecutedComparison: { plannedImages: normalManifest.plannedCalls + omittedManifest.plannedCalls, estimatedUsd: normalManifest.estimatedUsd + omittedManifest.estimatedUsd, evaluationRemainingUsd: normalManifest.budgetUsd, fitsRemainingAllowance: false },
};
const result = path.join(dir, "audit.json");
if (process.argv.includes("--write")) await writeFile(result, JSON.stringify(report, null, 2) + "\n");
else assert.deepEqual(await json(result), report);
console.log("Verified exact attached reference bytes, three unchanged default packets and three unsent omission packets; 0 paid calls.");
