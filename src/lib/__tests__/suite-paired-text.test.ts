/** Exercise frozen-guide text trials through the actual CLI, with network access blocked. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const root = process.cwd();
const source = path.join(root, "llm/releases/2026-10-30-review-only-text");
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const rows = (file: string) => readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line));
const cli = (...args: string[]) => execFileSync(process.execPath, ["--import",
  "data:text/javascript,globalThis.fetch=()=>{throw new Error('Unexpected network call in paired test')}",
  "--import", "tsx", "scripts/evals/suite.mts", ...args], { cwd: root, timeout: 30_000, encoding: "utf8", stdio: "pipe" });

it("reuses only frozen guides, rejects stale guides and keeps the source snapshot for scoring", () => {
  const prefix = `paired-text-test-${randomUUID()}`;
  const names = [prefix, `${prefix}-ok`, `${prefix}-stale`, `${prefix}-mismatch`];
  const dirs = names.map((name) => path.join(root, "llm/releases", name));
  const temporary: string[] = [];
  mkdirSync(dirs[0], { recursive: true });
  try {
    for (const file of ["plan.json", "snapshot.json", "run-finished.json", "results.ndjson"]) copyFileSync(path.join(source, file), path.join(dirs[0], file));
    const sourceRows = rows(path.join(dirs[0], "results.ndjson"));
    for (const [index, stale] of [[1, false], [2, true]] as const) {
      if (stale) {
        const changed = structuredClone(sourceRows);
        for (const row of changed) row.records.look.inputs[0].version = "stale";
        writeFileSync(path.join(dirs[0], "results.ndjson"), changed.map((row) => JSON.stringify(row)).join("\n") + "\n");
      }
      cli("plan", "--run", names[index], "--tier", "text", "--from", prefix, "--cap", "0.30");
      expect(() => cli("snapshot", "--run", names[index])).toThrow(/Paired text runs reuse the source snapshot/);
      const output = cli("run", "--run", names[index], "--offline");
      const done = JSON.parse(output.trim().split("\n").at(-1)!);
      temporary.push(done.outDir);
      const result = rows(path.join(done.outDir, "results.ndjson"));
      expect(result).toHaveLength(113);
      expect(done.counts).toEqual({ text: stale ? 0 : 226, image: 0, check: 0 });
      if (stale) {
        expect(result.every((row) => row.outcome === "refused")).toBe(true);
      } else {
        expect(result.every((row) => row.outcome === "planned" && row.textCalls === 2)).toBe(true);
        for (const row of result) expect(row.records.look).toEqual(sourceRows.find((saved) => saved.caseId === row.caseId).records.look);
        copyFileSync(path.join(done.outDir, "results.ndjson"), path.join(dirs[index], "results.ndjson"));
        cli("blind", "--run", names[index]);
        expect(read(path.join(dirs[index], "scoring/items-1.json")).items).toHaveLength(113);
      }
    }
    const changed = read(path.join(dirs[0], "plan.json"));
    changed.works["bible-web"].workVersion = "changed-source";
    writeFileSync(path.join(dirs[0], "plan.json"), JSON.stringify(changed));
    expect(() => cli("plan", "--run", names[3], "--tier", "text", "--from", prefix)).toThrow(/source text changed/);
  } finally {
    for (const dir of [...dirs, ...temporary, ...names.map((name) => path.join(root, "evals/images/runs", name))]) rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
