/**
 * Evaluation reports (#98, S10): per-arm completions, failures, latency, provider and planner
 * spend and missing usage; per-case comparison readiness (inconclusive below the sample floor,
 * incomplete when the run stopped); a human scoring template; and a side-by-side contact sheet
 * citing every output by its stable reference, failures included, so review never sees only the
 * successes.
 */
import type { EvalArm, EvalCase } from "./cases";
import { armsFor } from "./cases";
import { genericStyleOf, isGenericArm } from "./generic";
import type { EvalRunState } from "./runner";

/** Legacy arms are scored on three dimensions; generic arms (#181) add identity, continuity and style. */
export const SCORE_DIMENSIONS = ["relevance", "clarity", "artifacts_style"] as const;
export const GENERIC_SCORE_DIMENSIONS = ["relevance", "identity", "continuity", "style", "artifacts"] as const;
/** The inherited target: a generic image should stay around five credits on Lite. */
export const LITE_TARGET_CREDITS = 5;
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
  /** Generic arms only: samples whose look and plan already existed against those that had to prepare, and what preparation cost. */
  preparation?: { prepared: number; cold: number; calls: number; spendUsd: number; usageMissing: number; latencyMs: { prepared: Percentiles; cold: Percentiles } };
  /** Generic arms only: reported usage against the quote the route would have made. */
  quoteVariance?: { samples: number; meanUsd: number; maxUsd: number; meanQuotedCredits: number; meanActualCredits: number; withinLiteTarget: boolean | null; unpriced: number };
};
export type CaseReport = {
  id: string; reference: string; genre: string; expected: string;
  arms: Record<string, { completed: number; failed: number; outputs: string[]; samples: Array<{ n: number; status: string; output?: string; error?: string; stage?: string; costUsd: number; latencyMs: number; promptChars?: number; plannerOutcome?: string; prepared?: boolean; preparationCostUsd?: number; referencesSent?: number; quotedCredits?: number | null; varianceUsd?: number; packet?: unknown }> }>;
  comparison: "ready" | "inconclusive" | "incomplete";
  reason: string | null;
};
export type EvalReport = {
  run: string; createdAt: number; reportedAt: number;
  reproducibility: { promptVersion: string; imageModel: string; plannerModel: string | null; arms: string[]; repeats: number; sampleFloor: number; omitStyleReference?: boolean };
  stopped: EvalRunState["stopped"] | null;
  spentUsd: number;
  arms: Record<string, ArmSummary>;
  cases: CaseReport[];
  comparisons: { ready: number; inconclusive: number; incomplete: number };
  /** Generic arms by style: whether every case that allows the style ran in it. */
  styleMatrix: Record<string, { cases: number; completed: number; failed: number; notRun: number; complete: boolean }>;
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
    const generic = isGenericArm(arm);
    const expectedForArm = generic ? cases.filter((c) => armsFor(c, [arm]).length).length * options.repeats : expected;
    const prepared = own.filter((s) => s.prepared === true);
    const cold = own.filter((s) => s.prepared === false);
    const variance = own.filter((s) => typeof s.varianceUsd === "number");
    const quoted = own.filter((s) => s.quote);
    const actualCredits = own.filter((s) => s.status === "completed" && !s.usageMissing).map((s) => Math.max(1, Math.ceil((s.imageCostUsd * 1.25) / 0.01)));
    arms[arm] = {
      completed: completed.length, failed: failed.length, notRun: Math.max(0, expectedForArm - own.length),
      failureRate: own.length ? failed.length / own.length : 0,
      latencyMs: { image: percentiles(completed.map((s) => s.latencyMs.image)), planner: percentiles(own.filter((s) => s.latencyMs.planner > 0).map((s) => s.latencyMs.planner)), total: percentiles(completed.map((s) => s.latencyMs.total)) },
      spendUsd: { image: own.reduce((n, s) => n + s.imageCostUsd, 0), planner: own.reduce((n, s) => n + s.plannerCostUsd, 0), total: own.reduce((n, s) => n + sampleCost(s), 0) },
      usageMissing: own.filter((s) => s.usageMissing).length,
      plannerOutcomes, failuresByStage,
      ...(generic ? {
        preparation: {
          prepared: prepared.length, cold: cold.length, calls: own.reduce((n, s) => n + (s.preparationCalls ?? 0), 0), spendUsd: own.reduce((n, s) => n + (s.preparationCostUsd ?? 0) + (s.priorPreparationCostUsd ?? 0), 0),
          usageMissing: own.filter((s) => s.preparationUsageMissing).length,
          latencyMs: { prepared: percentiles(prepared.filter((s) => s.status === "completed").map((s) => s.latencyMs.total)), cold: percentiles(cold.filter((s) => s.status === "completed").map((s) => s.latencyMs.total)) },
        },
        quoteVariance: {
          samples: variance.length, meanUsd: variance.length ? variance.reduce((n, s) => n + s.varianceUsd!, 0) / variance.length : 0, maxUsd: variance.length ? Math.max(...variance.map((s) => Math.abs(s.varianceUsd!))) : 0,
          meanQuotedCredits: quoted.length ? quoted.reduce((n, s) => n + s.quote!.credits, 0) / quoted.length : 0,
          meanActualCredits: actualCredits.length ? actualCredits.reduce((n, c) => n + c, 0) / actualCredits.length : 0,
          withinLiteTarget: actualCredits.length ? actualCredits.reduce((n, c) => n + c, 0) / actualCredits.length <= LITE_TARGET_CREDITS : null,
          unpriced: own.filter((s) => s.status === "completed" && s.quote === null).length,
        },
      } : {}),
    };
  }
  const styleMatrix: EvalReport["styleMatrix"] = {};
  for (const arm of options.arms) {
    const style = genericStyleOf(arm);
    if (!style) continue;
    const eligible = cases.filter((c) => armsFor(c, [arm]).length);
    const own = samples.filter((s) => s.arm === arm);
    const completed = own.filter((s) => s.status === "completed").length;
    const failed = own.filter((s) => s.status === "failed").length;
    const notRun = Math.max(0, eligible.length * options.repeats - own.length);
    styleMatrix[style] = { cases: eligible.length, completed, failed, notRun, complete: notRun === 0 && failed === 0 };
  }
  const caseReports: CaseReport[] = cases.map((c) => {
    const perArm: CaseReport["arms"] = {};
    const caseArms = armsFor(c, options.arms);
    for (const arm of caseArms) {
      const own = samples.filter((s) => s.caseId === c.id && s.arm === arm).sort((a, b) => a.n - b.n);
      perArm[arm] = {
        completed: own.filter((s) => s.status === "completed").length, failed: own.filter((s) => s.status === "failed").length,
        outputs: own.filter((s) => s.output).map((s) => s.output!),
        samples: own.map((s) => ({ n: s.n, status: s.status, output: s.output, error: s.error, stage: s.stage, costUsd: sampleCost(s), latencyMs: s.latencyMs.total, promptChars: s.promptChars, plannerOutcome: s.plannerOutcome,
          ...(s.engine === "generic" ? { prepared: s.prepared, preparationCostUsd: s.preparationCostUsd, referencesSent: s.referencesSent, quotedCredits: s.quote?.credits ?? null, varianceUsd: s.varianceUsd, packet: s.packet } : {}) })),
      };
    }
    const attempted = caseArms.map((arm) => perArm[arm].completed + perArm[arm].failed);
    const incomplete = attempted.some((n) => n < options.repeats);
    const undersampled = caseArms.some((arm) => perArm[arm].completed < floor);
    const comparison = incomplete ? "incomplete" : undersampled ? "inconclusive" : "ready";
    const reason = comparison === "incomplete" ? "not every arm ran its repeats (stopped or interrupted run); retain the baseline"
      : comparison === "inconclusive" ? `fewer than ${floor} completed samples in an arm; retain the baseline` : null;
    return { id: c.id, reference: c.reference, genre: c.genre, expected: c.expected, arms: perArm, comparison, reason };
  });
  const comparisons = { ready: 0, inconclusive: 0, incomplete: 0 };
  for (const c of caseReports) comparisons[c.comparison]++;
  return {
    run: state.run, createdAt: state.createdAt, reportedAt: (options.now ?? Date.now)(),
    reproducibility: { promptVersion: state.promptVersion, imageModel: state.imageModel, plannerModel: state.plannerModel, arms: [...options.arms], repeats: options.repeats, sampleFloor: floor, omitStyleReference: state.omitStyleReference },
    stopped: state.stopped ?? null, spentUsd: state.spentUsd, arms, cases: caseReports, comparisons, styleMatrix,
  };
}

/** What a reviewer fills in: one row per case and arm, scores 0–2 per dimension, one verdict, notes. */
export function buildScoreTemplate(report: EvalReport) {
  return {
    run: report.run, dimensions: { legacy: [...SCORE_DIMENSIONS], generic: [...GENERIC_SCORE_DIMENSIONS] }, scale: "0 materially fails, 1 incomplete or mildly off, 2 meets", verdicts: [...SCORE_VERDICTS],
    rules: "An observed depiction-rule or prohibited-likeness violation is a fail whatever the scores. A known Icon border may be recorded as an accepted limitation, never averaged away.",
    rows: report.cases.flatMap((c) => report.reproducibility.arms.filter((arm) => c.arms[arm]).map((arm) => ({
      caseId: c.id, arm, outputs: c.arms[arm].outputs,
      ...Object.fromEntries((isGenericArm(arm) ? GENERIC_SCORE_DIMENSIONS : SCORE_DIMENSIONS).map((d) => [d, null])),
      verdict: null, notes: "",
    }))),
  };
}

export type ScoreRow = { caseId: string; arm: string; verdict: string | null; notes?: string } & Record<string, unknown>;
export type ScoreFile = { rows: ScoreRow[] };

/**
 * Baseline against candidate on the same cases: outputs side by side per arm, each side's verdict
 * when scored, and a review flag for every candidate fail or worsening; inconclusive or incomplete
 * candidate cases retain the baseline.
 */
export function renderComparisonSheet(baseline: EvalReport, candidate: EvalReport, scores: { baseline?: ScoreFile | null; candidate?: ScoreFile | null } = {}, urls: { baseline?: (ref: string) => string; candidate?: (ref: string) => string } = {}): string {
  // Outputs are stored relative to their own run; the sheet lives elsewhere, so each side resolves its paths itself.
  const baselineUrl = urls.baseline ?? ((ref) => ref);
  const candidateUrl = urls.candidate ?? ((ref) => ref);
  const rank: Record<string, number> = { pass: 0, "accepted limitation": 1, fail: 2 };
  const verdictOf = (file: ScoreFile | null | undefined, caseId: string, arm: string) => file?.rows.find((r) => r.caseId === caseId && r.arm === arm)?.verdict ?? null;
  const arms = [...new Set([...baseline.reproducibility.arms, ...candidate.reproducibility.arms])];
  const caseIds = [...new Set([...baseline.cases.map((c) => c.id), ...candidate.cases.map((c) => c.id)])];
  let review = 0;
  const rows = caseIds.map((id) => {
    const b = baseline.cases.find((c) => c.id === id);
    const cnd = candidate.cases.find((c) => c.id === id);
    const cells = arms.map((arm) => {
      const bv = verdictOf(scores.baseline, id, arm);
      const cv = verdictOf(scores.candidate, id, arm);
      const worse = cv !== null && (cv === "fail" || (bv !== null && rank[cv] > rank[bv]));
      const retained = !cnd || cnd.comparison !== "ready";
      if (worse) review++;
      const imgs = (report: CaseReport | undefined, url: (ref: string) => string) => (report?.arms[arm]?.samples ?? []).map((s) => s.output ? `<img src="${escape(url(s.output))}" alt="${escape(id)} ${escape(arm)} ${s.n}" loading="lazy">` : `<div class="box">failed</div>`).join("");
      return `<td class="${worse ? "review" : ""}"><div class="side"><div><div class="label">baseline${bv ? ` · ${escape(bv)}` : ""}</div>${imgs(b, baselineUrl)}</div><div><div class="label">candidate${cv ? ` · ${escape(cv)}` : ""}${retained ? " · retains baseline" : ""}</div>${imgs(cnd, candidateUrl)}</div></div>${worse ? "<div class=\"flag\">review required</div>" : ""}</td>`;
    }).join("");
    return `<tr id="${escape(id)}"><th>${escape(b?.reference ?? cnd?.reference ?? id)}<div class="genre">${escape(b?.genre ?? cnd?.genre ?? "")}</div><div class="verdict ${cnd?.comparison ?? "incomplete"}">candidate ${escape(cnd?.comparison ?? "not run")}</div></th>${cells}</tr>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(baseline.run)} vs ${escape(candidate.run)}</title>
<style>body{font:14px/1.4 system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;vertical-align:top;padding:8px}th{text-align:left;width:16%;background:#fafafa}img{width:100%;max-width:240px;display:block;margin-bottom:6px;border-radius:4px}.side{display:grid;grid-template-columns:1fr 1fr;gap:8px}.label{font-size:12px;color:#555;margin-bottom:4px}.box{max-width:240px;aspect-ratio:16/9;background:#fee;border:1px dashed #c66;color:#a00;display:flex;align-items:center;justify-content:center;margin-bottom:6px}.review{background:#fff4f4}.flag{color:#a00;font-weight:600;font-size:12px}.genre{font-size:12px;color:#777;text-transform:uppercase}.verdict{font-size:12px}.ready{color:#060}.inconclusive,.incomplete{color:#a60}</style></head><body>
<h1>${escape(baseline.run)} (baseline) vs ${escape(candidate.run)} (candidate)</h1>
<p>Baseline: prompt ${escape(baseline.reproducibility.promptVersion)}, image ${escape(baseline.reproducibility.imageModel)}, planner ${escape(baseline.reproducibility.plannerModel ?? "none")}, style reference ${baseline.reproducibility.omitStyleReference ? "omitted by evaluation control" : "normal selection"}. Candidate: prompt ${escape(candidate.reproducibility.promptVersion)}, image ${escape(candidate.reproducibility.imageModel)}, planner ${escape(candidate.reproducibility.plannerModel ?? "none")}, style reference ${candidate.reproducibility.omitStyleReference ? "omitted by evaluation control" : "normal selection"}. ${review} cell(s) need review; inconclusive or incomplete candidate cases retain the baseline.</p>
<table><thead><tr><th>Case</th>${arms.map((a) => `<th>${escape(a)}</th>`).join("")}</tr></thead><tbody>
${rows}
</tbody></table></body></html>`;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

/** A static side-by-side sheet: every sample of every case, successes and failures alike. */
export function renderContactSheet(report: EvalReport, options: { title?: string; outputUrl?: (ref: string) => string } = {}): string {
  const url = options.outputUrl ?? ((ref) => ref);
  const arms = report.reproducibility.arms;
  const rows = report.cases.map((c) => {
    const cells = arms.map((arm) => {
      const samples = c.arms[arm]?.samples ?? [];
      const items = samples.map((s) => s.status === "completed" && s.output
        ? `<figure><img src="${escape(url(s.output))}" alt="${escape(c.reference)} ${escape(arm)} ${s.n}" loading="lazy"><figcaption>#${s.n} · ${(s.latencyMs / 1000).toFixed(1)}s · $${s.costUsd.toFixed(4)}${s.plannerOutcome && s.plannerOutcome !== "not_used" ? ` · planner ${escape(s.plannerOutcome)}` : ""}${s.prepared !== undefined ? ` · ${s.prepared ? "prepared" : "cold"}` : ""}${typeof s.referencesSent === "number" ? ` · ${s.referencesSent} ref(s)` : ""}${typeof s.quotedCredits === "number" ? ` · quoted ${s.quotedCredits} cr` : ""}${typeof s.varianceUsd === "number" ? ` · variance ${s.varianceUsd >= 0 ? "+" : ""}$${s.varianceUsd.toFixed(4)}` : ""}</figcaption></figure>`
        : `<figure class="failed"><div class="box">failed${s.stage ? ` at ${escape(s.stage)}` : ""}</div><figcaption>#${s.n} · ${escape(s.error ?? "")}</figcaption></figure>`).join("");
      return `<td><div class="arm">${escape(arm)} · ${c.arms[arm]?.completed ?? 0}/${samples.length}</div>${items || "<em>not run</em>"}</td>`;
    }).join("");
    return `<tr id="${escape(c.id)}"><th><div>${escape(c.reference)}</div><div class="genre">${escape(c.genre)}</div><p>${escape(c.expected)}</p><div class="verdict ${c.comparison}">${c.comparison}${c.reason ? `: ${escape(c.reason)}` : ""}</div></th>${cells}</tr>`;
  }).join("\n");
  const armSummary = arms.map((arm) => { const a = report.arms[arm]; return a ? `<li><strong>${escape(arm)}</strong>: ${a.completed} completed, ${a.failed} failed, ${a.notRun} not run · image p50 ${(a.latencyMs.image.p50 / 1000).toFixed(1)}s p90 ${(a.latencyMs.image.p90 / 1000).toFixed(1)}s · spend $${a.spendUsd.total.toFixed(4)} (planner $${a.spendUsd.planner.toFixed(4)}) · usage missing ${a.usageMissing}${a.preparation ? ` · prepared ${a.preparation.prepared} / cold ${a.preparation.cold} (prepared p90 ${(a.preparation.latencyMs.prepared.p90 / 1000).toFixed(1)}s, cold p90 ${(a.preparation.latencyMs.cold.p90 / 1000).toFixed(1)}s) · preparation $${a.preparation.spendUsd.toFixed(4)} over ${a.preparation.calls} call(s)` : ""}${a.quoteVariance ? ` · quote mean ${a.quoteVariance.meanQuotedCredits.toFixed(1)} cr vs actual ${a.quoteVariance.meanActualCredits.toFixed(1)} cr (${a.quoteVariance.withinLiteTarget === null ? "no usage" : a.quoteVariance.withinLiteTarget ? "within the five-credit target" : "ABOVE the five-credit target"}), variance mean ${a.quoteVariance.meanUsd >= 0 ? "+" : ""}$${a.quoteVariance.meanUsd.toFixed(4)}` : ""}</li>` : ""; }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(options.title ?? `Image evaluation ${report.run}`)}</title>
<style>body{font:14px/1.4 system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;vertical-align:top;padding:8px}th{text-align:left;width:22%;background:#fafafa}img{width:100%;max-width:360px;display:block;border-radius:4px}figure{margin:0 0 10px}figcaption{font-size:12px;color:#555}.genre{font-size:12px;color:#777;text-transform:uppercase}.arm{font-weight:600;margin-bottom:6px}.box{width:100%;max-width:360px;aspect-ratio:16/9;background:#fee;border:1px dashed #c66;display:flex;align-items:center;justify-content:center;color:#a00}.verdict{font-size:12px;margin-top:6px}.ready{color:#060}.inconclusive{color:#a60}.incomplete{color:#a00}</style></head><body>
<h1>${escape(options.title ?? `Image evaluation ${report.run}`)}</h1>
<p>Prompt ${escape(report.reproducibility.promptVersion)} · image model ${escape(report.reproducibility.imageModel)} · planner ${escape(report.reproducibility.plannerModel ?? "none")} · style reference ${report.reproducibility.omitStyleReference ? "omitted by evaluation control" : "normal selection"} · ${report.reproducibility.repeats} repeat(s) per arm · sample floor ${report.reproducibility.sampleFloor} · spent $${report.spentUsd.toFixed(4)}${report.stopped ? ` · <strong>stopped: ${escape(report.stopped.reason)}</strong> (${escape(report.stopped.detail)})` : ""}</p>
<ul>${armSummary}</ul>
<p>Comparisons: ${report.comparisons.ready} ready, ${report.comparisons.inconclusive} inconclusive, ${report.comparisons.incomplete} incomplete. Score every row in scores.json; an observed depiction-rule or likeness violation fails the release regardless of averages.</p>
<table><thead><tr><th>Case</th>${arms.map((a) => `<th>${escape(a)}</th>`).join("")}</tr></thead><tbody>
${rows}
</tbody></table></body></html>`;
}
