/**
 * Evaluation reports (#98, S10): per-arm completions, failures, latency, provider and planner
 * spend and missing usage; per-case comparison readiness (inconclusive below the sample floor,
 * incomplete when the run stopped); a human scoring template; and a side-by-side contact sheet
 * citing every output by its stable reference, failures included, so review never sees only the
 * successes.
 */
import type { EvalArm, EvalCase } from "./cases";
import { EVAL_ARMS } from "./cases";
import type { EvalRunState } from "./runner";

export const SCORE_DIMENSIONS = ["relevance", "clarity", "artifacts_style"] as const;
export const SCORE_VERDICTS = ["pass", "accepted limitation", "fail"] as const;
/** Below this many completed samples per arm a comparison is reported inconclusive. */
export const DEFAULT_SAMPLE_FLOOR = 3;

type Percentiles = { p50: number; p90: number; max: number; n: number };
function percentiles(values: number[]): Percentiles {
  if (values.length === 0) return { p50: 0, p90: 0, max: 0, n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
  return { p50: at(0.5), p90: at(0.9), max: sorted[sorted.length - 1], n: sorted.length };
}

export type ArmSummary = {
  completed: number; failed: number; notRun: number;
  failureRate: number;
  latencyMs: { image: Percentiles; planner: Percentiles; total: Percentiles };
  spendUsd: { image: number; planner: number; total: number };
  usageMissing: number;
  plannerOutcomes: Record<string, number>;
  failuresByStage: Record<string, number>;
};
export type CaseReport = {
  id: string; reference: string; genre: string; expected: string;
  arms: Record<string, { completed: number; failed: number; outputs: string[]; samples: Array<{ n: number; status: string; output?: string; error?: string; stage?: string; costUsd: number; latencyMs: number; promptChars?: number; plannerOutcome?: string }> }>;
  comparison: "ready" | "inconclusive" | "incomplete";
  reason: string | null;
};
export type EvalReport = {
  run: string; createdAt: number; reportedAt: number;
  reproducibility: { promptVersion: string; imageModel: string; plannerModel: string | null; arms: string[]; repeats: number; sampleFloor: number };
  stopped: EvalRunState["stopped"] | null;
  spentUsd: number;
  arms: Record<string, ArmSummary>;
  cases: CaseReport[];
  comparisons: { ready: number; inconclusive: number; incomplete: number };
};

export function buildReport(state: EvalRunState, cases: readonly EvalCase[], options: { arms: readonly EvalArm[]; repeats: number; sampleFloor?: number; now?: () => number }): EvalReport {
  const floor = options.sampleFloor ?? DEFAULT_SAMPLE_FLOOR;
  // Only the reported cases and repeats: a resumed subset or a lower repeat count must not pull in other samples.
  const caseIds = new Set(cases.map((c) => c.id));
  const samples = Object.values(state.samples).filter((s) => caseIds.has(s.caseId) && s.n <= options.repeats);
  const sampleCost = (s: { imageCostUsd: number; plannerCostUsd: number; priorCostUsd?: number }) => s.imageCostUsd + s.plannerCostUsd + (s.priorCostUsd ?? 0);
  const arms: Record<string, ArmSummary> = {};
  for (const arm of options.arms) {
    const own = samples.filter((s) => s.arm === arm);
    const completed = own.filter((s) => s.status === "completed");
    const failed = own.filter((s) => s.status === "failed");
    const expected = cases.length * options.repeats;
    const plannerOutcomes: Record<string, number> = {};
    const failuresByStage: Record<string, number> = {};
    for (const s of own) if (s.plannerOutcome) plannerOutcomes[s.plannerOutcome] = (plannerOutcomes[s.plannerOutcome] ?? 0) + 1;
    for (const s of failed) failuresByStage[s.stage ?? "unknown"] = (failuresByStage[s.stage ?? "unknown"] ?? 0) + 1;
    arms[arm] = {
      completed: completed.length, failed: failed.length, notRun: Math.max(0, expected - own.length),
      failureRate: own.length ? failed.length / own.length : 0,
      latencyMs: { image: percentiles(completed.map((s) => s.latencyMs.image)), planner: percentiles(own.filter((s) => s.latencyMs.planner > 0).map((s) => s.latencyMs.planner)), total: percentiles(completed.map((s) => s.latencyMs.total)) },
      spendUsd: { image: own.reduce((n, s) => n + s.imageCostUsd, 0), planner: own.reduce((n, s) => n + s.plannerCostUsd, 0), total: own.reduce((n, s) => n + sampleCost(s), 0) },
      usageMissing: own.filter((s) => s.usageMissing).length,
      plannerOutcomes, failuresByStage,
    };
  }
  const caseReports: CaseReport[] = cases.map((c) => {
    const perArm: CaseReport["arms"] = {};
    for (const arm of options.arms) {
      const own = samples.filter((s) => s.caseId === c.id && s.arm === arm).sort((a, b) => a.n - b.n);
      perArm[arm] = {
        completed: own.filter((s) => s.status === "completed").length, failed: own.filter((s) => s.status === "failed").length,
        outputs: own.filter((s) => s.output).map((s) => s.output!),
        samples: own.map((s) => ({ n: s.n, status: s.status, output: s.output, error: s.error, stage: s.stage, costUsd: sampleCost(s), latencyMs: s.latencyMs.total, promptChars: s.promptChars, plannerOutcome: s.plannerOutcome })),
      };
    }
    const attempted = options.arms.map((arm) => perArm[arm].completed + perArm[arm].failed);
    const incomplete = attempted.some((n) => n < options.repeats);
    const undersampled = options.arms.some((arm) => perArm[arm].completed < floor);
    const comparison = incomplete ? "incomplete" : undersampled ? "inconclusive" : "ready";
    const reason = comparison === "incomplete" ? "not every arm ran its repeats (budget stop or interrupted run); retain the baseline"
      : comparison === "inconclusive" ? `fewer than ${floor} completed samples in an arm; retain the baseline` : null;
    return { id: c.id, reference: c.reference, genre: c.genre, expected: c.expected, arms: perArm, comparison, reason };
  });
  const comparisons = { ready: 0, inconclusive: 0, incomplete: 0 };
  for (const c of caseReports) comparisons[c.comparison]++;
  return {
    run: state.run, createdAt: state.createdAt, reportedAt: (options.now ?? Date.now)(),
    reproducibility: { promptVersion: state.promptVersion, imageModel: state.imageModel, plannerModel: state.plannerModel, arms: [...options.arms], repeats: options.repeats, sampleFloor: floor },
    stopped: state.stopped ?? null, spentUsd: state.spentUsd, arms, cases: caseReports, comparisons,
  };
}

/** What a reviewer fills in: one row per case and arm, scores 0–2 per dimension, one verdict, notes. */
export function buildScoreTemplate(report: EvalReport) {
  return {
    run: report.run, dimensions: [...SCORE_DIMENSIONS], scale: "0 materially fails, 1 incomplete or mildly off, 2 meets", verdicts: [...SCORE_VERDICTS],
    rows: report.cases.flatMap((c) => report.reproducibility.arms.map((arm) => ({ caseId: c.id, arm, outputs: c.arms[arm].outputs, relevance: null, clarity: null, artifacts_style: null, verdict: null, notes: "" }))),
  };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

/** A static side-by-side sheet: every sample of every case, successes and failures alike. */
export function renderContactSheet(report: EvalReport, options: { title?: string; outputUrl?: (ref: string) => string } = {}): string {
  const url = options.outputUrl ?? ((ref) => ref);
  const arms = report.reproducibility.arms.length ? report.reproducibility.arms : [...EVAL_ARMS];
  const rows = report.cases.map((c) => {
    const cells = arms.map((arm) => {
      const samples = c.arms[arm]?.samples ?? [];
      const items = samples.map((s) => s.status === "completed" && s.output
        ? `<figure><img src="${escape(url(s.output))}" alt="${escape(c.reference)} ${escape(arm)} ${s.n}" loading="lazy"><figcaption>#${s.n} · ${(s.latencyMs / 1000).toFixed(1)}s · $${s.costUsd.toFixed(4)}${s.plannerOutcome && s.plannerOutcome !== "not_used" ? ` · planner ${escape(s.plannerOutcome)}` : ""}</figcaption></figure>`
        : `<figure class="failed"><div class="box">failed${s.stage ? ` at ${escape(s.stage)}` : ""}</div><figcaption>#${s.n} · ${escape(s.error ?? "")}</figcaption></figure>`).join("");
      return `<td><div class="arm">${escape(arm)} · ${c.arms[arm]?.completed ?? 0}/${samples.length}</div>${items || "<em>not run</em>"}</td>`;
    }).join("");
    return `<tr id="${escape(c.id)}"><th><div>${escape(c.reference)}</div><div class="genre">${escape(c.genre)}</div><p>${escape(c.expected)}</p><div class="verdict ${c.comparison}">${c.comparison}${c.reason ? `: ${escape(c.reason)}` : ""}</div></th>${cells}</tr>`;
  }).join("\n");
  const armSummary = arms.map((arm) => { const a = report.arms[arm]; return a ? `<li><strong>${escape(arm)}</strong>: ${a.completed} completed, ${a.failed} failed, ${a.notRun} not run · image p50 ${(a.latencyMs.image.p50 / 1000).toFixed(1)}s p90 ${(a.latencyMs.image.p90 / 1000).toFixed(1)}s · spend $${a.spendUsd.total.toFixed(4)} (planner $${a.spendUsd.planner.toFixed(4)}) · usage missing ${a.usageMissing}</li>` : ""; }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(options.title ?? `Image evaluation ${report.run}`)}</title>
<style>body{font:14px/1.4 system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;vertical-align:top;padding:8px}th{text-align:left;width:22%;background:#fafafa}img{width:100%;max-width:360px;display:block;border-radius:4px}figure{margin:0 0 10px}figcaption{font-size:12px;color:#555}.genre{font-size:12px;color:#777;text-transform:uppercase}.arm{font-weight:600;margin-bottom:6px}.box{width:100%;max-width:360px;aspect-ratio:16/9;background:#fee;border:1px dashed #c66;display:flex;align-items:center;justify-content:center;color:#a00}.verdict{font-size:12px;margin-top:6px}.ready{color:#060}.inconclusive{color:#a60}.incomplete{color:#a00}</style></head><body>
<h1>${escape(options.title ?? `Image evaluation ${report.run}`)}</h1>
<p>Prompt ${escape(report.reproducibility.promptVersion)} · image model ${escape(report.reproducibility.imageModel)} · planner ${escape(report.reproducibility.plannerModel ?? "none")} · ${report.reproducibility.repeats} repeat(s) per arm · sample floor ${report.reproducibility.sampleFloor} · spent $${report.spentUsd.toFixed(4)}${report.stopped ? ` · <strong>stopped: ${escape(report.stopped.reason)}</strong> (${escape(report.stopped.detail)})` : ""}</p>
<ul>${armSummary}</ul>
<p>Comparisons: ${report.comparisons.ready} ready, ${report.comparisons.inconclusive} inconclusive, ${report.comparisons.incomplete} incomplete. Score every row in scores.json; an observed depiction-rule or likeness violation fails the release regardless of averages.</p>
<table><thead><tr><th>Case</th>${arms.map((a) => `<th>${escape(a)}</th>`).join("")}</tr></thead><tbody>
${rows}
</tbody></table></body></html>`;
}
