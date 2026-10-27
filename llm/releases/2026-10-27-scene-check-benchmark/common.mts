/** Shared paths, labels and the private environment for the scene-check benchmark. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";

export const dir = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(dir, "../../..");
export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const json = (name: string) => JSON.parse(fs.readFileSync(path.resolve(dir, name), "utf8"));
export function readEnvironment() {
  assert.ok(process.env.VISIBIBLE_EVAL_ENV_FILE);
  const env = parseEnv(fs.readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE, "utf8"));
  assert.equal(env.GENERIC_ENGINE_MODE, "disabled");
  assert.ok(env.OPENROUTER_API_KEY);
  return env;
}

export type Item = { key: string; run: string; id: string; file: string; sha256: string; people: string[]; description: string;
  label: { figure: boolean; edge: boolean; frame: boolean; lettering: boolean; acceptable: boolean } };

/** Every labelled image of a set, with the context the request path would give the checker. */
export function items(set: "dev" | "holdout"): Item[] {
  const runs: string[] = json("plan.json").sets[set];
  return runs.flatMap((run) => {
    const packet = json(`${run}/blind-images.json`).packet as Array<{ id: string; file: string; sha256: string; selected: string[]; availableCast: Array<{ entryId: string; name: string; kind: string; hasForm: boolean }>; scene: Record<string, string> }>;
    const scores = json(`${run}/operator-scores.json`).scores as Array<{ id: string; noFormFigure: string; edges: string; text: string; overall: string }>;
    return packet.map((p) => {
      const s = scores.find((x) => x.id === p.id);
      assert.ok(s, `${run}: no score for ${p.id}`);
      const people = p.availableCast.filter((c) => p.selected.includes(c.entryId) && c.hasForm && c.kind === "character").map((c) => c.name);
      return { key: `${path.basename(run)}/${p.id}`, run, id: p.id, file: p.file, sha256: p.sha256, people, description: `${p.scene.primarySubject}; ${p.scene.secondaryElements}`,
        label: { figure: s.noFormFigure === "yes", edge: s.edges === "margin", frame: s.edges === "frame", lettering: s.text === "yes", acceptable: s.overall === "acceptable" } };
    });
  });
}
