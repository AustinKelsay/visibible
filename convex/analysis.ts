import { KNOWN_STYLE_IDS } from "./_helpers/styleIds";
import { lookPolicy } from "../src/lib/engine/situation";
/**
 * Analysis storage and lifecycle (#168, spec #165 §7 and §9).
 *
 * A work's analysis is everything the engine makes for it: story sections, moments, entries
 * (canon with stages), section looks and scene plans. Each record carries a content-hash
 * version, a generated-or-owner source and the generation it belongs to, and names the input
 * versions it was made from. Full rereads are staged as a separate candidate generation and
 * activated only when complete and compatible with the deployed work and brief; until then the
 * current active generation keeps serving. Owner versions are never overwritten by a reread.
 *
 * Writes are server-secret protected (the same boundary as saveImage); reads are public.
 */
import { v } from "convex/values";
import { action, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { validateServerSecret } from "./_helpers/auth";
import { contentVersion } from "./_helpers/contentVersion";
import { analysisValidators } from "./schema";
import { openAttention, READER_REPORT_DISPOSITIONS, READER_REPORT_REASON } from "./_helpers/attention";

type Ctx = QueryCtx | MutationCtx;
type AnalysisKind = Doc<"analysisRecords">["kind"];
type Payload = Doc<"analysisRecords">["payload"];
type InputRef = Doc<"analysisRecords">["inputs"][number];

const MAX_CHARACTER_STAGES = 3;

// ---------------------------------------------------------------- lookups

async function findWork(ctx: Ctx, workId: string) {
  return ctx.db.query("works").withIndex("by_workId", (q) => q.eq("workId", workId)).unique();
}

async function requireWork(ctx: Ctx, workId: string) {
  const work = await findWork(ctx, workId);
  if (!work) throw new Error(`Unknown work ${workId}; register it first`);
  return work;
}

async function findGeneration(ctx: Ctx, workId: string, generation: number) {
  return ctx.db
    .query("analysisGenerations")
    .withIndex("by_work_generation", (q) => q.eq("workId", workId).eq("generation", generation))
    .unique();
}

async function currentRecords(ctx: Ctx, workId: string, generation: number) {
  return ctx.db
    .query("analysisRecords")
    .withIndex("by_work_generation_status", (q) => q.eq("workId", workId).eq("generation", generation).eq("status", "current"))
    .collect();
}

async function currentKind(ctx: Ctx, workId: string, generation: number, kind: AnalysisKind) {
  return ctx.db.query("analysisRecords").withIndex("by_work_generation_kind_status", (q) =>
    q.eq("workId", workId).eq("generation", generation).eq("kind", kind).eq("status", "current"),
  ).collect();
}

/** Only the records needed to validate this payload, rather than every moment in the work. */
async function dependencies(ctx: Ctx, workId: string, generation: number, payload: Payload) {
  const refs: Array<[AnalysisKind, string]> = [];
  if (payload.kind === "moment" || payload.kind === "look") refs.push(["section", payload.sectionId]);
  if (payload.kind === "plan") {
    refs.push(["moment", payload.momentId]);
    refs.push(...payload.entries.map((e): [AnalysisKind, string] => ["entry", e.entryId]));
  }
  const records: Doc<"analysisRecords">[] = [];
  for (const [kind, recordId] of refs) {
    const record = await findCurrentRecord(ctx, workId, generation, kind, recordId);
    if (record) records.push(record);
  }
  return records;
}

async function findCurrentRecord(ctx: Ctx, workId: string, generation: number, kind: AnalysisKind, recordId: string) {
  const matches = await ctx.db
    .query("analysisRecords")
    .withIndex("by_work_generation_kind_recordId", (q) =>
      q.eq("workId", workId).eq("generation", generation).eq("kind", kind).eq("recordId", recordId),
    )
    .collect();
  return matches.find((r) => r.status === "current") ?? null;
}

/** Strip Convex's internal fields; the record id is exposed as `id` only where a caller needs it. */
function withoutInternals<T extends { _id: unknown; _creationTime: number }>(doc: T): Omit<T, "_id" | "_creationTime"> {
  const { _id, _creationTime, ...rest } = doc;
  void _id;
  void _creationTime;
  return rest;
}

function publicRecord(record: Doc<"analysisRecords">) {
  return withoutInternals(record);
}

function requirePayloadKind(kind: string, payload: Payload) {
  if (payload.kind !== kind) throw new Error(`Payload kind ${payload.kind} is not ${kind}`);
}

/** Supersede the current version of a record, if any, and insert the new one. */
async function writeVersion(
  ctx: MutationCtx,
  current: Doc<"analysisRecords"> | null,
  record: Omit<Doc<"analysisRecords">, "_id" | "_creationTime" | "status" | "createdAt">,
) {
  if (current) await ctx.db.patch(current._id, { status: "superseded" });
  await ctx.db.insert("analysisRecords", { ...record, status: "current", createdAt: Date.now() });
}

// ---------------------------------------------------------------- structural validity

type RecordMap = Map<string, Doc<"analysisRecords">>;

function key(kind: string, recordId: string) {
  return `${kind}/${recordId}`;
}

/**
 * The structural rules a generation must satisfy before it may serve: sections and entries
 * exist; sections and moments are anchored to their first unit; every moment names a section;
 * every cast member, look and plan names a record that exists; stage counts respect the kind, and an
 * entry a cast or plan uses has at least one stage (a mentioned-only entry may have none).
 * Optional references and attention notes are deliberately not checked here (#168).
 */
export function structuralProblems(records: ReadonlyArray<Pick<Doc<"analysisRecords">, "kind" | "recordId" | "payload">>): string[] {
  const problems: string[] = [];
  const byKey = new Map<string, Pick<Doc<"analysisRecords">, "kind" | "recordId" | "payload">>();
  for (const r of records) byKey.set(key(r.kind, r.recordId), r);
  const entryStages = new Map<string, Set<string>>();
  let sections = 0;
  let entries = 0;
  for (const r of records) {
    const p = r.payload;
    if (p.kind === "entry") {
      entries++;
      const cap = p.entryKind === "object" ? 1 : MAX_CHARACTER_STAGES;
      // An entry nothing draws (mentioned only) may have no stages; one a cast or plan uses must.
      if (p.stages.length > cap) problems.push(`entry ${r.recordId}: ${p.stages.length} stages (allowed 1–${cap})`);
      entryStages.set(r.recordId, new Set(p.stages.map((s) => s.id)));
    }
  }
  for (const r of records) {
    const p = r.payload;
    if (p.kind === "section") {
      sections++;
      if (r.recordId !== p.firstUnit) problems.push(`section ${r.recordId}: id must be its first unit ${p.firstUnit}`);
      for (const c of p.cast) {
        const stages = entryStages.get(c.entryId);
        if (!stages) problems.push(`section ${r.recordId}: cast names unknown entry ${c.entryId}`);
        else if (stages.size === 0) problems.push(`section ${r.recordId}: entry ${c.entryId} has no canon stages yet`);
        else if (!stages.has(c.stageId)) problems.push(`section ${r.recordId}: entry ${c.entryId} has no stage ${c.stageId}`);
      }
    } else if (p.kind === "moment") {
      if (r.recordId !== p.firstUnit) problems.push(`moment ${r.recordId}: id must be its first unit ${p.firstUnit}`);
      if (!byKey.has(key("section", p.sectionId))) problems.push(`moment ${r.recordId}: unknown section ${p.sectionId}`);
    } else if (p.kind === "look") {
      if (!byKey.has(key("section", p.sectionId))) problems.push(`look ${r.recordId}: unknown section ${p.sectionId}`);
    } else if (p.kind === "plan") {
      if (!byKey.has(key("moment", p.momentId))) problems.push(`plan ${r.recordId}: unknown moment ${p.momentId}`);
      for (const e of p.entries) {
        const stages = entryStages.get(e.entryId);
        if (!stages?.has(e.stageId)) problems.push(`plan ${r.recordId}: unknown entry stage ${e.entryId}/${e.stageId}`);
      }
    }
  }
  if (sections === 0) problems.push("no story sections");
  if (entries === 0) problems.push("no entries");
  return problems;
}

// ---------------------------------------------------------------- attention

// ---------------------------------------------------------------- preparation (server)

/** Register a work and the content versions of its deployed repo inputs (work file and brief). */
export const registerWork = mutation({
  args: {
    serverSecret: v.string(),
    workId: v.string(),
    workVersion: v.string(),
    briefVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const now = Date.now();
    const existing = await findWork(ctx, args.workId);
    if (existing) {
      await ctx.db.patch(existing._id, { workVersion: args.workVersion, briefVersion: args.briefVersion, updatedAt: now });
      return { workId: args.workId, created: false };
    }
    await ctx.db.insert("works", { workId: args.workId, workVersion: args.workVersion, briefVersion: args.briefVersion, nextGeneration: 1, updatedAt: now });
    return { workId: args.workId, created: true };
  },
});

const sha256Hex = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const withoutStyleIds = (text: string) => {
  const brief = JSON.parse(text) as Record<string, unknown>;
  delete brief.styleIds;
  return JSON.stringify(brief);
};

/**
 * Approve a brief change that only changes its approved art styles, without a reread (ADR 0006, amendment 4).
 * Nothing in the analysis reads the style list (readings, canon, looks and plans use the brief's rules and eras),
 * so the active generation stays valid. Both brief files are sent whole: the previous one must hash to the
 * registered and active versions, and the two may differ only in `styleIds`. Cached looks and plans name the
 * brief version, so they refresh lazily afterwards.
 */
export const amendBriefStyles = mutation({
  args: {
    serverSecret: v.string(),
    workId: v.string(),
    previousBrief: v.string(),
    nextBrief: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const work = await requireWork(ctx, args.workId);
    const [previousVersion, nextVersion] = await Promise.all([sha256Hex(args.previousBrief), sha256Hex(args.nextBrief)]);
    if (work.briefVersion !== previousVersion) throw new Error(`The registered brief is ${work.briefVersion}, not the previous brief ${previousVersion}`);
    const active = work.activeGeneration === undefined ? null : await findGeneration(ctx, args.workId, work.activeGeneration);
    if (!active || active.briefVersion !== previousVersion) throw new Error("The active generation was not read against the previous brief");
    if (withoutStyleIds(args.previousBrief) !== withoutStyleIds(args.nextBrief)) throw new Error("The briefs differ in more than their art styles");
    const styleIds = (JSON.parse(args.nextBrief) as { styleIds?: unknown }).styleIds;
    if (!Array.isArray(styleIds) || styleIds.length === 0 || !styleIds.every((id) => typeof id === "string" && id.length > 0)) throw new Error("The new brief must approve at least one art style");
    // The engine refuses a brief naming a style outside the library, so check before moving any version.
    const unknown = styleIds.filter((id) => !KNOWN_STYLE_IDS.includes(id));
    if (unknown.length) throw new Error(`The new brief names unknown art styles: ${unknown.join(", ")}`);
    if (new Set(styleIds).size !== styleIds.length) throw new Error("The new brief lists an art style twice");
    if (previousVersion === nextVersion) return { previousVersion, nextVersion, styleIds, changed: false };
    const now = Date.now();
    await ctx.db.patch(work._id, { briefVersion: nextVersion, updatedAt: now });
    await ctx.db.patch(active._id, { briefVersion: nextVersion });
    return { previousVersion, nextVersion, styleIds, changed: true };
  },
});

/**
 * Open a candidate generation for a full reread. Only one candidate is open per work: staging a
 * new one abandons the previous candidate, and nothing in it can ever activate.
 */
export const stageGeneration = mutation({
  args: {
    serverSecret: v.string(),
    workId: v.string(),
    workVersion: v.string(),
    briefVersion: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const work = await requireWork(ctx, args.workId);
    const now = Date.now();
    if (work.candidateGeneration !== undefined) {
      const previous = await findGeneration(ctx, args.workId, work.candidateGeneration);
      if (previous && previous.status === "candidate") await ctx.db.patch(previous._id, { status: "abandoned", endedAt: now });
    }
    const generation = work.nextGeneration;
    await ctx.db.insert("analysisGenerations", {
      workId: args.workId, generation, status: "candidate", workVersion: args.workVersion, briefVersion: args.briefVersion,
      note: args.note, createdAt: now,
      recordCounts: {},
    });
    await ctx.db.patch(work._id, { candidateGeneration: generation, nextGeneration: generation + 1, updatedAt: now });
    return { generation };
  },
});

/** Write generated records into an open candidate generation. Re-writing a record id replaces it. */
export const putRecords = mutation({
  args: {
    serverSecret: v.string(),
    workId: v.string(),
    generation: v.number(),
    records: v.array(v.object({
      kind: analysisValidators.kind,
      recordId: v.string(),
      payload: analysisValidators.payload,
      inputs: v.optional(v.array(analysisValidators.input)),
    })),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const generation = await findGeneration(ctx, args.workId, args.generation);
    if (!generation || generation.status !== "candidate") {
      throw new Error(`Generation ${args.generation} of ${args.workId} is not an open candidate`);
    }
    const versions: Array<{ kind: AnalysisKind; recordId: string; version: string }> = [];
    const counts = generation.recordCounts && { ...generation.recordCounts };
    const batchSections = new Set(args.records.filter((r) => r.kind === "section").map((r) => r.recordId));
    for (const record of args.records) {
      requirePayloadKind(record.kind, record.payload);
      // Sections are staged before their moments (or in the same atomic batch). There is no
      // candidate delete operation, so this proof survives later writes and activation.
      if (counts && record.payload.kind === "moment") {
        if (record.recordId !== record.payload.firstUnit) throw new Error(`moment ${record.recordId}: id must be its first unit ${record.payload.firstUnit}`);
        if (!batchSections.has(record.payload.sectionId) && !await findCurrentRecord(ctx, args.workId, args.generation, "section", record.payload.sectionId)) {
          throw new Error(`moment ${record.recordId}: unknown section ${record.payload.sectionId}; stage sections before moments`);
        }
      }
      const existing = await findCurrentRecord(ctx, args.workId, args.generation, record.kind, record.recordId);
      const version = contentVersion(record.payload);
      await writeVersion(ctx, existing, {
        workId: args.workId, generation: args.generation, kind: record.kind, recordId: record.recordId, version,
        source: "generated", inputs: record.inputs ?? [], payload: record.payload,
      });
      versions.push({ kind: record.kind, recordId: record.recordId, version });
      if (counts && !existing) counts[record.kind] = (counts[record.kind] ?? 0) + 1;
    }
    if (counts) await ctx.db.patch(generation._id, { recordCounts: counts });
    return { versions };
  },
});

/**
 * Activate a candidate generation. It must be the work's open candidate, match the deployed work
 * and brief versions, and pass the structural rules. Owner versions from the previously active
 * generation are carried forward where their record id still exists; the rest go on the attention
 * list. The previous generation is retired. On any failure nothing changes and the current active
 * generation keeps serving.
 */
export async function activateCandidate(ctx: MutationCtx, args: { serverSecret: string; workId: string; generation: number }) {
  validateServerSecret(args.serverSecret);
  const work = await requireWork(ctx, args.workId);
  const candidate = await findGeneration(ctx, args.workId, args.generation);
  if (!candidate || candidate.status !== "candidate" || work.candidateGeneration !== args.generation) {
    throw new Error(`Generation ${args.generation} of ${args.workId} is not the open candidate`);
  }
  if (candidate.workVersion !== work.workVersion || candidate.briefVersion !== work.briefVersion) {
    throw new Error(
      `Generation ${args.generation} was read against work ${candidate.workVersion} / brief ${candidate.briefVersion}, ` +
      `but the deployed versions are ${work.workVersion} / ${work.briefVersion}`,
    );
  }
  const records = candidate.recordCounts === undefined
    ? await currentRecords(ctx, args.workId, args.generation)
    : (await Promise.all((["entry", "section", "look", "plan"] as const).map((kind) => currentKind(ctx, args.workId, args.generation, kind)))).flat();
  const candidateByKey: RecordMap = new Map(records.map((r) => [key(r.kind, r.recordId), r]));
  // Decide first what would actually serve: candidate records, with owner versions carried in
  // wherever their record id survived the reread. Only that set is checked for structure.
  const ownerSource = work.activeGeneration ?? work.ownerVersionsFrom;
  const previous = ownerSource === undefined ? [] : await ctx.db.query("analysisRecords")
    .withIndex("by_work_generation_source_status", (q) => q.eq("workId", args.workId).eq("generation", ownerSource).eq("source", "owner").eq("status", "current")).collect();
  for (const owner of previous) {
    if (owner.kind !== "moment" || candidateByKey.has(key(owner.kind, owner.recordId))) continue;
    const moment = await findCurrentRecord(ctx, args.workId, args.generation, "moment", owner.recordId);
    if (moment) candidateByKey.set(key("moment", owner.recordId), moment);
  }
  const carriedOwners = previous.filter((r) => candidateByKey.has(key(r.kind, r.recordId)));
  const unmatchedOwners = previous.filter((r) => !candidateByKey.has(key(r.kind, r.recordId)));
  const effective = new Map(candidateByKey);
  for (const owner of carriedOwners) effective.set(key(owner.kind, owner.recordId), owner);
  // Plans may name moments omitted from the bulk scan. Validate their exact dependencies;
  // owner moment replacements themselves are also checked against the effective sections.
  for (const record of [...effective.values()]) {
    if (record.payload.kind !== "plan") continue;
    const id = key("moment", record.payload.momentId);
    if (!effective.has(id)) {
      const moment = await findCurrentRecord(ctx, args.workId, args.generation, "moment", record.payload.momentId);
      if (moment) effective.set(id, moment);
    }
  }
  const problems = structuralProblems([...effective.values()]);
  if (problems.length) throw new Error(`Generation ${args.generation} is not structurally valid: ${problems.join("; ")}`);

  const now = Date.now();
  const carried: string[] = [];
  const unmatched: string[] = [];
  for (const owner of carriedOwners) {
    await writeVersion(ctx, candidateByKey.get(key(owner.kind, owner.recordId)) ?? null, {
      workId: args.workId, generation: args.generation, kind: owner.kind, recordId: owner.recordId, version: owner.version,
      source: "owner", inputs: owner.inputs, payload: owner.payload,
    });
    carried.push(key(owner.kind, owner.recordId));
  }
  for (const owner of unmatchedOwners) {
    await openAttention(ctx, {
      workId: args.workId, reason: "unmatched_owner_edit", kind: owner.kind, recordId: owner.recordId, generation: work.activeGeneration,
      detail: `Owner version ${owner.version} of ${owner.kind} ${owner.recordId} has no record in generation ${args.generation}`,
    });
    unmatched.push(key(owner.kind, owner.recordId));
  }
  if (ownerSource !== undefined) {
    for (const r of previous) await ctx.db.patch(r._id, { status: "retired" });
    const previousGeneration = await findGeneration(ctx, args.workId, ownerSource);
    if (previousGeneration && previousGeneration.status !== "retired") await ctx.db.patch(previousGeneration._id, { status: "retired", endedAt: now });
    await retireBatch(ctx, args.workId, ownerSource);
  }
  await ctx.db.patch(candidate._id, { status: "active", activatedAt: now });
  await ctx.db.patch(work._id, { activeGeneration: args.generation, candidateGeneration: undefined, ownerVersionsFrom: undefined, updatedAt: now });
  return { generation: args.generation, carriedOwnerVersions: carried, unmatchedOwnerVersions: unmatched, retiredGeneration: work.activeGeneration ?? null };
}

export const activateGeneration = mutation({
  args: {
    serverSecret: v.string(),
    workId: v.string(),
    generation: v.number(),
  },
  handler: activateCandidate,
});

/** Retirement changes the serving pointer atomically; historical row statuses catch up in batches. */
async function retireBatch(ctx: MutationCtx, workId: string, generation: number) {
  const records = await ctx.db.query("analysisRecords").withIndex("by_work_generation_status", (q) =>
    q.eq("workId", workId).eq("generation", generation).eq("status", "current"),
  ).take(250);
  for (const record of records) await ctx.db.patch(record._id, { status: "retired" });
  if (records.length === 250) await ctx.scheduler.runAfter(0, internal.analysis.retireRecords, { workId, generation });
}

export const retireRecords = internalMutation({
  args: { workId: v.string(), generation: v.number() },
  handler: async (ctx, args) => {
    const generation = await findGeneration(ctx, args.workId, args.generation);
    if (generation?.status !== "retired") return;
    await retireBatch(ctx, args.workId, args.generation);
  },
});

/** Give up on the open candidate without touching the active generation. */
export const abandonGeneration = mutation({
  args: { serverSecret: v.string(), workId: v.string(), generation: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const work = await requireWork(ctx, args.workId);
    const candidate = await findGeneration(ctx, args.workId, args.generation);
    if (!candidate || candidate.status !== "candidate") throw new Error(`Generation ${args.generation} of ${args.workId} is not an open candidate`);
    await ctx.db.patch(candidate._id, { status: "abandoned", endedAt: Date.now(), note: args.note ?? candidate.note });
    if (work.candidateGeneration === args.generation) await ctx.db.patch(work._id, { candidateGeneration: undefined, updatedAt: Date.now() });
    return { generation: args.generation };
  },
});

// ---------------------------------------------------------------- owner corrections (server)

/** Add a missing canon entry and assign it to one existing section in the same transaction. */
export const addCastEntry = mutation({
  args: {
    serverSecret: v.string(), workId: v.string(), workVersion: v.string(), expectedGeneration: v.number(),
    sectionId: v.string(), expectedSectionVersion: v.string(), entryId: v.string(), stageId: v.string(),
    named: v.optional(v.boolean()), entry: analysisValidators.entry,
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const work = await requireWork(ctx, args.workId);
    if (work.activeGeneration !== args.expectedGeneration || work.workVersion !== args.workVersion) {
      throw new Error("Analysis generation or reference text changed; inspect the work again");
    }
    const generation = await findGeneration(ctx, args.workId, args.expectedGeneration);
    if (!generation || generation.status !== "active" || generation.workVersion !== args.workVersion) {
      throw new Error("An active analysis generation matching the reference text is required");
    }
    const section = await findCurrentRecord(ctx, args.workId, args.expectedGeneration, "section", args.sectionId);
    if (!section || section.payload.kind !== "section") throw new Error(`No current section ${args.sectionId}`);
    const { entry } = args;
    const cap = entry.entryKind === "object" ? 1 : MAX_CHARACTER_STAGES;
    if (!args.entryId.trim() || !entry.name.trim() || entry.stages.length < 1 || entry.stages.length > cap
      || new Set(entry.stages.map((s) => s.id)).size !== entry.stages.length
      || entry.stages.some((s) => !s.id.trim() || !s.text.trim() || s.text.length > 500 || !s.quotes?.length
        || s.quotes.some((q) => !q.unit.trim() || !q.quote.trim()))) {
      throw new Error("A new cast entry needs a name and complete, distinct canon stages with supporting quotes");
    }
    if (!entry.stages.some((s) => s.id === args.stageId)) throw new Error(`Entry has no stage ${args.stageId}`);
    const member = { entryId: args.entryId, stageId: args.stageId, named: args.named ?? false };
    const version = contentVersion(entry);
    const existing = await findCurrentRecord(ctx, args.workId, args.expectedGeneration, "entry", args.entryId);
    if (existing) {
      // A response can be lost after commit. Exact retries neither duplicate the entry nor overwrite later edits.
      if (existing.source === "owner" && existing.version === version && section.source === "owner"
        && section.payload.cast.some((c) => c.entryId === member.entryId && c.stageId === member.stageId && (c.named ?? false) === member.named)) {
        return { changed: false, entryVersion: version, sectionVersion: section.version };
      }
      throw new Error(`Entry ${args.entryId} already exists; inspect it instead of adding another identity`);
    }
    if (section.version !== args.expectedSectionVersion) throw new Error(`Stale edit: section ${args.sectionId} is at version ${section.version}`);
    if (section.payload.cast.some((c) => c.entryId === args.entryId)) throw new Error(`Section already assigns ${args.entryId}`);
    const payload = { ...section.payload, cast: [...section.payload.cast, member],
      ...(section.payload.mentionedOnly ? { mentionedOnly: section.payload.mentionedOnly.filter((id) => id !== args.entryId) } : {}) };
    const sectionVersion = contentVersion(payload);
    await writeVersion(ctx, null, { workId: args.workId, generation: args.expectedGeneration, kind: "entry", recordId: args.entryId,
      version, source: "owner", inputs: [], payload: entry });
    await writeVersion(ctx, section, { workId: args.workId, generation: args.expectedGeneration, kind: "section", recordId: args.sectionId,
      version: sectionVersion, source: "owner", inputs: section.inputs, payload });
    if (generation.recordCounts) await ctx.db.patch(generation._id, { recordCounts: { ...generation.recordCounts, entry: (generation.recordCounts.entry ?? 0) + 1 } });
    return { changed: true, entryVersion: version, sectionVersion };
  },
});

/**
 * Write an owner version of one record in the active generation. Later rereads never overwrite
 * it. Dependents that named the old version show up as stale (see listStaleDependents); nothing
 * is regenerated here and saved images are untouched.
 */
export const correctRecord = mutation({
  args: {
    serverSecret: v.string(),
    workId: v.string(),
    kind: analysisValidators.kind,
    recordId: v.string(),
    payload: analysisValidators.payload,
    /** The version the owner saw when editing; a newer current version makes the command stale and refused. */
    expectedVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const work = await requireWork(ctx, args.workId);
    if (work.activeGeneration === undefined) throw new Error(`Work ${args.workId} has no active generation to correct`);
    requirePayloadKind(args.kind, args.payload);
    const current = await findCurrentRecord(ctx, args.workId, work.activeGeneration, args.kind, args.recordId);
    if (!current) throw new Error(`No current ${args.kind} ${args.recordId} in generation ${work.activeGeneration}`);
    const version = contentVersion(args.payload);
    if (version === current.version && current.source === "owner") return { version, changed: false, previousVersion: current.version };
    if (args.expectedVersion !== undefined && args.expectedVersion !== current.version) {
      // A retry of the same edit is safe (its result already stands); any other stale command is refused.
      throw new Error(`Stale edit: ${args.kind} ${args.recordId} is at version ${current.version}, not ${args.expectedVersion}`);
    }
    await writeVersion(ctx, current, {
      workId: args.workId, generation: work.activeGeneration, kind: args.kind, recordId: args.recordId, version,
      source: "owner", inputs: current.inputs, payload: args.payload,
    });
    return { version, changed: true, previousVersion: current.version };
  },
});

/** Remove a derived record (a plan or look) from the active generation so it is remade lazily. */
export const clearRecord = mutation({
  args: { serverSecret: v.string(), workId: v.string(), kind: analysisValidators.derivedKind, recordId: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const work = await requireWork(ctx, args.workId);
    if (work.activeGeneration === undefined) return { cleared: false };
    const current = await findCurrentRecord(ctx, args.workId, work.activeGeneration, args.kind, args.recordId);
    if (!current) return { cleared: false };
    await ctx.db.patch(current._id, { status: "superseded" });
    const generation = await findGeneration(ctx, args.workId, work.activeGeneration);
    if (generation?.recordCounts) await ctx.db.patch(generation._id, { recordCounts: { ...generation.recordCounts, [args.kind]: (generation.recordCounts[args.kind] ?? 1) - 1 } });
    return { cleared: true };
  },
});

/** Add a derived record (look or plan) to the active generation at image time. */
export const putDerivedRecord = mutation({
  args: {
    serverSecret: v.string(),
    workId: v.string(),
    kind: analysisValidators.derivedKind,
    recordId: v.string(),
    payload: analysisValidators.payload,
    inputs: v.array(analysisValidators.input),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const work = await requireWork(ctx, args.workId);
    if (work.activeGeneration === undefined) throw new Error(`Work ${args.workId} has no active generation`);
    requirePayloadKind(args.kind, args.payload);
    const records = await dependencies(ctx, args.workId, work.activeGeneration, args.payload);
    const problems = structuralProblems([...records, { kind: args.kind, recordId: args.recordId, payload: args.payload }]);
    const own = problems.filter((p) => p.startsWith(`${args.kind} ${args.recordId}:`));
    if (own.length) throw new Error(own.join("; "));
    const existing = await findCurrentRecord(ctx, args.workId, work.activeGeneration, args.kind, args.recordId);
    if (args.kind === "look" && existing?.source === "owner") throw new Error("Owner look requires explicit correction");
    const policy = args.inputs.find((input) => input.kind === "prompt" && input.recordId === "scene_plan_look_ownership");
    if (args.kind === "plan" && policy) {
      const dependency = args.inputs.find((input) => input.kind === "look");
      const look = dependency ? await findCurrentRecord(ctx, args.workId, work.activeGeneration, "look", dependency.recordId) : null;
      if (!look || look.version !== dependency?.version || lookPolicy(look) !== policy.version) throw new Error("Section look changed during preparation");
    }
    const version = contentVersion(args.payload);
    await writeVersion(ctx, existing, {
      workId: args.workId, generation: work.activeGeneration, kind: args.kind, recordId: args.recordId, version,
      source: "generated", inputs: args.inputs, payload: args.payload,
    });
    const generation = await findGeneration(ctx, args.workId, work.activeGeneration);
    if (!existing && generation?.recordCounts) await ctx.db.patch(generation._id, { recordCounts: { ...generation.recordCounts, [args.kind]: (generation.recordCounts[args.kind] ?? 0) + 1 } });
    return { version, generation: work.activeGeneration };
  },
});

// ---------------------------------------------------------------- lazy preparation (server)

/**
 * Claim the right to make a look or plan. The first caller holds the claim until it releases it
 * or the claim expires; later callers learn who holds it and wait for the record instead of
 * funding a second call. A claim is not needed for correctness, only to avoid paying twice.
 */
export const claimPreparation = mutation({
  args: { serverSecret: v.string(), workId: v.string(), kind: analysisValidators.derivedKind, recordId: v.string(), holder: v.string(), ttlMs: v.number() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const now = Date.now();
    const existing = await ctx.db
      .query("preparationClaims")
      .withIndex("by_work_kind_recordId", (q) => q.eq("workId", args.workId).eq("kind", args.kind).eq("recordId", args.recordId))
      .collect();
    const live = existing.find((c) => c.expiresAt > now);
    for (const stale of existing.filter((c) => c.expiresAt <= now)) await ctx.db.delete(stale._id);
    if (live) return { held: live.holder === args.holder, holder: live.holder, expiresAt: live.expiresAt };
    await ctx.db.insert("preparationClaims", { workId: args.workId, kind: args.kind, recordId: args.recordId, holder: args.holder, expiresAt: now + args.ttlMs, createdAt: now });
    return { held: true, holder: args.holder, expiresAt: now + args.ttlMs };
  },
});

export const releasePreparation = mutation({
  args: { serverSecret: v.string(), workId: v.string(), kind: analysisValidators.derivedKind, recordId: v.string(), holder: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const claims = await ctx.db
      .query("preparationClaims")
      .withIndex("by_work_kind_recordId", (q) => q.eq("workId", args.workId).eq("kind", args.kind).eq("recordId", args.recordId))
      .collect();
    for (const claim of claims) if (claim.holder === args.holder) await ctx.db.delete(claim._id);
    return { released: true };
  },
});

/** Owner preparation spend, per call; never a guest charge. */
export const recordPreparationSpend = mutation({
  args: {
    serverSecret: v.string(), workId: v.string(), kind: v.string(), recordId: v.string(), model: v.string(), outcome: v.string(),
    costUsd: v.optional(v.number()), promptTokens: v.optional(v.number()), completionTokens: v.optional(v.number()), elapsedMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const { serverSecret, ...entry } = args;
    void serverSecret;
    await ctx.db.insert("preparationLedger", { ...entry, createdAt: Date.now() });
    return { recorded: true };
  },
});

export const getPreparationSpend = query({
  args: { workId: v.string() },
  handler: async (ctx, args) => {
    const entries = await ctx.db.query("preparationLedger").withIndex("by_work_createdAt", (q) => q.eq("workId", args.workId)).collect();
    return { calls: entries.length, costUsd: entries.reduce((n, e) => n + (e.costUsd ?? 0), 0), byKind: entries.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + (e.costUsd ?? 0) }), {}) };
  },
});

/** What a reader waiting on "Preparing scene" can be told: whether the look and plan exist or are being made. */
export const getPreparationStatus = query({
  args: { workId: v.string(), momentId: v.string() },
  handler: async (ctx, args) => {
    const work = await findWork(ctx, args.workId);
    if (!work || work.activeGeneration === undefined) return { ready: false, look: "missing" as const, plan: "missing" as const, sectionId: null };
    const moment = await findCurrentRecord(ctx, args.workId, work.activeGeneration, "moment", args.momentId);
    const sectionId = moment && moment.payload.kind === "moment" ? moment.payload.sectionId : null;
    const now = Date.now();
    const state = async (kind: "look" | "plan", recordId: string | null) => {
      if (!recordId) return "missing" as const;
      if (await findCurrentRecord(ctx, args.workId, work.activeGeneration!, kind, recordId)) return "ready" as const;
      const claims = await ctx.db.query("preparationClaims").withIndex("by_work_kind_recordId", (q) => q.eq("workId", args.workId).eq("kind", kind).eq("recordId", recordId)).collect();
      return claims.some((c) => c.expiresAt > now) ? ("preparing" as const) : ("missing" as const);
    };
    const look = await state("look", sectionId);
    const plan = await state("plan", moment ? args.momentId : null);
    return { ready: look === "ready" && plan === "ready", look, plan, sectionId };
  },
});

// ---------------------------------------------------------------- references (server)

/** Record a reference image blob (sheet or style reference) with the exact inputs it was made from. */
export const putReference = mutation({
  args: {
    serverSecret: v.string(),
    workId: v.string(),
    kind: analysisValidators.referenceKind,
    recordId: v.string(),
    storageId: v.id("_storage"),
    inputs: v.array(analysisValidators.input),
    verdict: v.optional(v.string()),
    notes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    await requireWork(ctx, args.workId);
    const existing = await findReference(ctx, args.workId, args.kind, args.recordId);
    if (existing?.pinned) throw new Error(`${args.kind} ${args.recordId} is pinned; unpin it before replacing`);
    if (existing) await ctx.db.patch(existing._id, { status: "superseded" });
    const fingerprint = referenceFingerprint(args.inputs);
    const id = await ctx.db.insert("referenceImages", {
      workId: args.workId, kind: args.kind, recordId: args.recordId, storageId: args.storageId, inputs: args.inputs, fingerprint,
      verdict: args.verdict, notes: args.notes, pinned: false, status: "current", createdAt: Date.now(),
    });
    return { id, fingerprint };
  },
});

/** Pin or unpin the current reference; a pinned reference ignores staleness until unpinned. */
export const pinReference = mutation({
  args: { serverSecret: v.string(), workId: v.string(), kind: analysisValidators.referenceKind, recordId: v.string(), pinned: v.boolean() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const existing = await findReference(ctx, args.workId, args.kind, args.recordId);
    if (!existing) throw new Error(`No current ${args.kind} ${args.recordId} for ${args.workId}`);
    await ctx.db.patch(existing._id, { pinned: args.pinned });
    return { pinned: args.pinned };
  },
});

function referenceFingerprint(inputs: ReadonlyArray<InputRef>) {
  return contentVersion(inputs.map((i) => [i.kind, i.recordId, i.version]));
}

async function findReference(ctx: Ctx, workId: string, kind: "sheet" | "styleReference", recordId: string) {
  const matches = await ctx.db
    .query("referenceImages")
    .withIndex("by_work_kind_recordId", (q) => q.eq("workId", workId).eq("kind", kind).eq("recordId", recordId))
    .collect();
  return matches.find((r) => r.status === "current") ?? null;
}

/** Store a reference image's bytes (base64 JPEG) in Convex file storage; the record is written with putReference. */
export const storeReferenceBlob = action({
  args: { serverSecret: v.string(), base64: v.string(), mimeType: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    if (!/^image\/(jpeg|png|webp)$/.test(args.mimeType)) throw new Error(`Unsupported reference image type ${args.mimeType}`);
    const bytes = Uint8Array.from(atob(args.base64), (c) => c.charCodeAt(0));
    if (bytes.length === 0 || bytes.length > 4 * 1024 * 1024) throw new Error(`Reference image is ${bytes.length} bytes; the limit is 4 MiB`);
    const storageId = await ctx.storage.store(new Blob([bytes], { type: args.mimeType }));
    return { storageId, bytes: bytes.length };
  },
});

// ---------------------------------------------------------------- attention (server)

export const noteAttention = mutation({
  args: {
    serverSecret: v.string(), workId: v.string(), reason: v.string(), kind: v.optional(v.string()), recordId: v.optional(v.string()),
    generation: v.optional(v.number()), detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const { serverSecret, ...item } = args;
    void serverSecret;
    return { id: await openAttention(ctx, item) };
  },
});

/**
 * Close one item. A reader report takes exactly one of the four dispositions; "source corrected"
 * must link the input version that fixed it (which must exist in the analysis) and a targeted check.
 * An input edit alone never closes a report, regenerates the saved image or alters its provenance.
 */
export const closeAttention = mutation({
  args: {
    serverSecret: v.string(), id: v.id("attentionItems"), disposition: v.string(),
    correction: v.optional(v.object({ kind: analysisValidators.kind, recordId: v.string(), version: v.string() })),
    check: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Unknown attention item");
    const now = Date.now();
    if (item.reason === READER_REPORT_REASON) {
      if (!READER_REPORT_DISPOSITIONS.includes(args.disposition)) throw new Error(`A reader report closes with one of: ${READER_REPORT_DISPOSITIONS.join(", ")}`);
      if (args.disposition === "source corrected") {
        if (!args.correction || !args.check?.trim()) throw new Error("\"source corrected\" must link the corrected input version (--correction kind:recordId:version) and a targeted check result (--check)");
        const versions = await ctx.db.query("analysisRecords")
          .withIndex("by_work_kind_recordId", (q) => q.eq("workId", item.workId).eq("kind", args.correction!.kind).eq("recordId", args.correction!.recordId)).collect();
        if (!versions.some((r) => r.version === args.correction!.version)) throw new Error(`No ${args.correction.kind} ${args.correction.recordId} with version ${args.correction.version} in ${item.workId}`);
      }
    }
    const closure = { at: now, disposition: args.disposition, ...(args.correction ? { correction: args.correction } : {}), ...(args.check?.trim() ? { check: args.check.trim() } : {}) };
    const history = [...(item.history ?? []), { at: now, event: "closed", disposition: args.disposition, ...(args.check?.trim() ? { detail: args.check.trim() } : {}) }];
    await ctx.db.patch(args.id, { status: "closed", disposition: args.disposition, closedAt: now, lastActivityAt: now, closure, history });
    return { closed: true };
  },
});

/** One attention item with its full report and lifecycle history. */
export const getAttentionItem = query({
  args: { serverSecret: v.string(), id: v.id("attentionItems") },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const item = await ctx.db.get(args.id);
    return item ? { id: item._id, ...withoutInternals(item) } : null;
  },
});

/**
 * Close the checker-made attention items for one record after the owner corrected or redid it.
 * Reader image reports (reason "reader_report") are never closed by an input change.
 */
export const closeAttentionFor = mutation({
  args: { serverSecret: v.string(), workId: v.string(), kind: v.string(), recordId: v.string(), disposition: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const open = await ctx.db.query("attentionItems").withIndex("by_work_status", (q) => q.eq("workId", args.workId).eq("status", "open")).collect();
    const now = Date.now();
    let closed = 0;
    for (const item of open) {
      if (item.kind !== args.kind || item.recordId !== args.recordId || item.reason === READER_REPORT_REASON) continue;
      await ctx.db.patch(item._id, { status: "closed", disposition: args.disposition, closedAt: now, lastActivityAt: now });
      closed++;
    }
    return { closed };
  },
});

/**
 * Remove a work's generated analysis: records, generations, references and their blobs, claims
 * and open checker attention. Owner versions stay unless `includingOwner`, and the next activation
 * carries them forward. Saved images, requests and the spend ledger are never touched. The
 * confirmation must repeat the work id, and the command enforces the production flag.
 */
export const wipeWork = mutation({
  args: { serverSecret: v.string(), workId: v.string(), confirmation: v.string(), includingOwner: v.boolean() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    if (args.confirmation !== args.workId) throw new Error(`Confirmation must be the work id ${args.workId}`);
    const work = await requireWork(ctx, args.workId);
    const counts = { records: 0, ownerKept: 0, generations: 0, references: 0, attention: 0, claims: 0 };
    const generations = await ctx.db.query("analysisGenerations").withIndex("by_work_generation", (q) => q.eq("workId", args.workId)).collect();
    for (const generation of generations) {
      const records = await ctx.db.query("analysisRecords").withIndex("by_work_generation_status", (q) => q.eq("workId", args.workId).eq("generation", generation.generation)).collect();
      for (const record of records) {
        if (record.source === "owner" && !args.includingOwner) { counts.ownerKept++; continue; }
        await ctx.db.delete(record._id);
        counts.records++;
      }
      await ctx.db.patch(generation._id, { status: "retired", endedAt: Date.now() });
      counts.generations++;
    }
    const references = await ctx.db.query("referenceImages").withIndex("by_work_status", (q) => q.eq("workId", args.workId)).collect();
    for (const reference of references) {
      await ctx.storage.delete(reference.storageId).catch(() => undefined);
      await ctx.db.delete(reference._id);
      counts.references++;
    }
    for (const claim of await ctx.db.query("preparationClaims").withIndex("by_work_kind_recordId", (q) => q.eq("workId", args.workId)).collect()) {
      await ctx.db.delete(claim._id);
      counts.claims++;
    }
    for (const item of await ctx.db.query("attentionItems").withIndex("by_work_status", (q) => q.eq("workId", args.workId).eq("status", "open")).collect()) {
      if (item.reason === "reader_report") continue;
      await ctx.db.delete(item._id);
      counts.attention++;
    }
    await ctx.db.patch(work._id, {
      activeGeneration: undefined, candidateGeneration: undefined,
      ownerVersionsFrom: args.includingOwner ? undefined : (work.activeGeneration ?? work.ownerVersionsFrom), updatedAt: Date.now(),
    });
    return counts;
  },
});

// ---------------------------------------------------------------- reads

/**
 * Readiness and generation lookup for routing. A work is ready when an active generation exists
 * and was read against the deployed work and brief versions. The brief alone is not enough;
 * missing references and open attention items do not block.
 */
export const getWorkStatus = query({
  args: { workId: v.string() },
  handler: async (ctx, args) => {
    const work = await findWork(ctx, args.workId);
    if (!work) return { exists: false, ready: false, reasons: ["work is not registered"], workVersion: null, briefVersion: null, activeGeneration: null, candidateGeneration: null, activeVersions: null };
    const reasons: string[] = [];
    const active = work.activeGeneration === undefined ? null : await findGeneration(ctx, args.workId, work.activeGeneration);
    if (!work.briefVersion) reasons.push("no approved brief registered");
    if (!active) reasons.push("no active analysis generation");
    else {
      if (active.workVersion !== work.workVersion) reasons.push(`active generation was read against work ${active.workVersion}, deployed is ${work.workVersion}`);
      if (active.briefVersion !== work.briefVersion) reasons.push(`active generation was read against brief ${active.briefVersion}, deployed is ${work.briefVersion}`);
    }
    return {
      exists: true,
      ready: reasons.length === 0,
      reasons,
      workVersion: work.workVersion ?? null,
      briefVersion: work.briefVersion ?? null,
      activeGeneration: work.activeGeneration ?? null,
      candidateGeneration: work.candidateGeneration ?? null,
      activeVersions: active ? { workVersion: active.workVersion, briefVersion: active.briefVersion, activatedAt: active.activatedAt ?? null } : null,
    };
  },
});

export const getGeneration = query({
  args: { workId: v.string(), generation: v.number() },
  handler: async (ctx, args) => {
    const generation = await findGeneration(ctx, args.workId, args.generation);
    if (!generation) return null;
    const counts: Record<string, number> = { ...generation.recordCounts };
    if (generation.recordCounts === undefined) {
      for (const r of await currentRecords(ctx, args.workId, args.generation)) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    }
    return { ...withoutInternals(generation), counts };
  },
});

/** The current record of the active generation, or null. Candidate records are never served. */
export const getActiveRecord = query({
  args: { workId: v.string(), kind: analysisValidators.kind, recordId: v.string() },
  handler: async (ctx, args) => {
    const work = await findWork(ctx, args.workId);
    if (!work || work.activeGeneration === undefined) return null;
    const record = await findCurrentRecord(ctx, args.workId, work.activeGeneration, args.kind, args.recordId);
    return record ? publicRecord(record) : null;
  },
});

export const listActiveRecords = query({
  args: { workId: v.string(), kind: analysisValidators.kind },
  handler: async (ctx, args) => {
    const work = await findWork(ctx, args.workId);
    if (!work || work.activeGeneration === undefined) return [];
    return (await currentKind(ctx, args.workId, work.activeGeneration, args.kind)).map(publicRecord);
  },
});

/** Bounded enumeration, pinned to the generation the caller admitted. */
export const listActiveRecordsPage = query({
  args: { workId: v.string(), generation: v.number(), kind: analysisValidators.kind, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const work = await requireWork(ctx, args.workId);
    if (work.activeGeneration !== args.generation) throw new Error("Analysis generation changed during enumeration; retry admission");
    const page = await ctx.db.query("analysisRecords").withIndex("by_work_generation_kind_status", (q) =>
      q.eq("workId", args.workId).eq("generation", args.generation).eq("kind", args.kind).eq("status", "current"),
    ).paginate({ cursor: args.cursor, numItems: 500 });
    return { records: page.page.map(publicRecord), nextCursor: page.isDone ? null : page.continueCursor };
  },
});

/** A historical record by generation, readable after retirement for provenance. */
export const getRecordVersion = query({
  args: { workId: v.string(), generation: v.number(), kind: analysisValidators.kind, recordId: v.string(), version: v.string() },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("analysisRecords")
      .withIndex("by_work_generation_kind_recordId", (q) =>
        q.eq("workId", args.workId).eq("generation", args.generation).eq("kind", args.kind).eq("recordId", args.recordId),
      )
      .collect();
    const record = matches.find((r) => r.version === args.version);
    return record ? publicRecord(record) : null;
  },
});

/** Every stored version of a record across generations, newest first: retired ids stay readable by id alone. */
export const listRecordHistory = query({
  args: { workId: v.string(), kind: analysisValidators.kind, recordId: v.string() },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("analysisRecords")
      .withIndex("by_work_kind_recordId", (q) => q.eq("workId", args.workId).eq("kind", args.kind).eq("recordId", args.recordId))
      .collect();
    return matches
      .sort((a, b) => b.generation - a.generation || b._creationTime - a._creationTime)
      .map((r) => ({ generation: r.generation, version: r.version, source: r.source, status: r.status, createdAt: r.createdAt }));
  },
});

/**
 * Current records of the active generation, and current reference images, whose inputs name an
 * older version of the given record. Detection only: nothing is remade and saved images are
 * never touched. A pinned reference is listed with its pin so callers can leave it alone.
 */
export const listStaleDependents = query({
  args: { workId: v.string(), kind: analysisValidators.kind, recordId: v.string() },
  handler: async (ctx, args) => {
    const work = await findWork(ctx, args.workId);
    if (!work || work.activeGeneration === undefined) return [];
    const current = await findCurrentRecord(ctx, args.workId, work.activeGeneration, args.kind, args.recordId);
    const records = await currentRecords(ctx, args.workId, work.activeGeneration);
    // Only current references can be stale; superseded ones are history.
    const references = await ctx.db
      .query("referenceImages")
      .withIndex("by_work_status", (q) => q.eq("workId", args.workId).eq("status", "current"))
      .collect();
    const stale: Array<{ kind: AnalysisKind | "sheet" | "styleReference"; recordId: string; version: string; usedVersion: string; pinned?: boolean }> = [];
    const olderThanCurrent = (used: InputRef | undefined) => used !== undefined && (!current || used.version !== current.version);
    for (const r of records) {
      const used = r.inputs.find((i: InputRef) => i.kind === args.kind && i.recordId === args.recordId);
      if (olderThanCurrent(used)) stale.push({ kind: r.kind, recordId: r.recordId, version: r.version, usedVersion: used!.version });
    }
    for (const r of references) {
      const used = r.inputs.find((i: InputRef) => i.kind === args.kind && i.recordId === args.recordId);
      if (olderThanCurrent(used)) stale.push({ kind: r.kind, recordId: r.recordId, version: r.fingerprint, usedVersion: used!.version, pinned: r.pinned });
    }
    return stale;
  },
});

/** The current reference and whether it is stale against the inputs it should have been made from. */
export const getReference = query({
  args: {
    workId: v.string(), kind: analysisValidators.referenceKind, recordId: v.string(),
    expectedInputs: v.optional(v.array(analysisValidators.input)),
  },
  handler: async (ctx, args) => {
    const reference = await findReference(ctx, args.workId, args.kind, args.recordId);
    if (!reference) return null;
    const expected = args.expectedInputs ? referenceFingerprint(args.expectedInputs) : null;
    const stale = !reference.pinned && expected !== null && expected !== reference.fingerprint;
    return { id: reference._id, ...withoutInternals(reference), stale };
  },
});

/** A short-lived URL for a stored reference blob, so the request path can send it inline (#175). Server-only. */
export const getReferenceBlobUrl = query({
  args: { serverSecret: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const blob = await ctx.db.system.get(args.storageId);
    if (!blob) return null;
    return { url: await ctx.storage.getUrl(args.storageId), contentType: blob.contentType ?? null, size: blob.size };
  },
});

export const listAttention = query({
  args: { workId: v.string(), status: v.optional(v.union(v.literal("open"), v.literal("closed"))) },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("attentionItems")
      .withIndex("by_work_status", (q) => q.eq("workId", args.workId).eq("status", args.status ?? "open"))
      .collect();
    return items.map((item) => ({ id: item._id, ...withoutInternals(item) }));
  },
});

