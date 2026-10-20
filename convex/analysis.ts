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
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { validateServerSecret } from "./_helpers/auth";
import { contentVersion } from "./_helpers/contentVersion";
import { analysisValidators } from "./schema";

type Ctx = QueryCtx | MutationCtx;
type AnalysisKind = Doc<"analysisRecords">["kind"];
type Payload = Doc<"analysisRecords">["payload"];
type InputRef = Doc<"analysisRecords">["inputs"][number];

const MAX_CHARACTER_STAGES = 3;
export const SHEET_RECORD_SEPARATOR = ":";

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

async function findCurrentRecord(ctx: Ctx, workId: string, generation: number, kind: AnalysisKind, recordId: string) {
  const matches = await ctx.db
    .query("analysisRecords")
    .withIndex("by_work_generation_kind_recordId", (q) =>
      q.eq("workId", workId).eq("generation", generation).eq("kind", kind).eq("recordId", recordId),
    )
    .collect();
  return matches.find((r) => r.status === "current") ?? null;
}

function publicRecord(record: Doc<"analysisRecords">) {
  const { _id, _creationTime, ...rest } = record;
  void _id;
  void _creationTime;
  return rest;
}

// ---------------------------------------------------------------- structural validity

type RecordMap = Map<string, Doc<"analysisRecords">>;

function key(kind: string, recordId: string) {
  return `${kind}/${recordId}`;
}

/**
 * The structural rules a generation must satisfy before it may serve: sections and entries
 * exist; sections and moments are anchored to their first unit; every moment names a section;
 * every cast member, look and plan names a record that exists; stage counts respect the kind.
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
      if (p.stages.length < 1 || p.stages.length > cap) problems.push(`entry ${r.recordId}: ${p.stages.length} stages (allowed 1–${cap})`);
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

async function openAttention(
  ctx: MutationCtx,
  item: { workId: string; reason: string; kind?: string; recordId?: string; generation?: number; detail?: string },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("attentionItems")
    .withIndex("by_work_reason_kind_recordId", (q) =>
      q.eq("workId", item.workId).eq("reason", item.reason).eq("kind", item.kind).eq("recordId", item.recordId),
    )
    .collect();
  const open = existing.find((a) => a.status === "open");
  if (open) {
    await ctx.db.patch(open._id, { count: open.count + 1, lastActivityAt: now, detail: item.detail ?? open.detail, generation: item.generation ?? open.generation });
    return open._id;
  }
  return ctx.db.insert("attentionItems", { ...item, status: "open", count: 1, createdAt: now, lastActivityAt: now });
}

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
    const now = Date.now();
    const versions: Array<{ kind: AnalysisKind; recordId: string; version: string }> = [];
    for (const record of args.records) {
      if (record.payload.kind !== record.kind) throw new Error(`Record ${record.recordId}: payload kind ${record.payload.kind} is not ${record.kind}`);
      const existing = await findCurrentRecord(ctx, args.workId, args.generation, record.kind, record.recordId);
      if (existing) await ctx.db.patch(existing._id, { status: "superseded" });
      const version = contentVersion(record.payload);
      await ctx.db.insert("analysisRecords", {
        workId: args.workId, generation: args.generation, kind: record.kind, recordId: record.recordId, version,
        source: "generated", inputs: record.inputs ?? [], payload: record.payload, status: "current", createdAt: now,
      });
      versions.push({ kind: record.kind, recordId: record.recordId, version });
    }
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
export const activateGeneration = mutation({
  args: {
    serverSecret: v.string(),
    workId: v.string(),
    generation: v.number(),
  },
  handler: async (ctx, args) => {
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
    const records = await currentRecords(ctx, args.workId, args.generation);
    const candidateByKey: RecordMap = new Map(records.map((r) => [key(r.kind, r.recordId), r]));
    // Decide first what would actually serve: candidate records, with owner versions carried in
    // wherever their record id survived the reread. Only that set is checked for structure.
    const previous = work.activeGeneration === undefined ? [] : await currentRecords(ctx, args.workId, work.activeGeneration);
    const carriedOwners = previous.filter((r) => r.source === "owner" && candidateByKey.has(key(r.kind, r.recordId)));
    const unmatchedOwners = previous.filter((r) => r.source === "owner" && !candidateByKey.has(key(r.kind, r.recordId)));
    const effective = new Map(candidateByKey);
    for (const owner of carriedOwners) effective.set(key(owner.kind, owner.recordId), owner);
    const problems = structuralProblems([...effective.values()]);
    if (problems.length) throw new Error(`Generation ${args.generation} is not structurally valid: ${problems.join("; ")}`);

    const now = Date.now();
    const carried: string[] = [];
    const unmatched: string[] = [];
    for (const owner of carriedOwners) {
      await ctx.db.patch(candidateByKey.get(key(owner.kind, owner.recordId))!._id, { status: "superseded" });
      await ctx.db.insert("analysisRecords", {
        workId: args.workId, generation: args.generation, kind: owner.kind, recordId: owner.recordId, version: owner.version,
        source: "owner", inputs: owner.inputs, payload: owner.payload, status: "current", createdAt: now,
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
    if (work.activeGeneration !== undefined) {
      for (const r of previous) await ctx.db.patch(r._id, { status: "retired" });
      const previousGeneration = await findGeneration(ctx, args.workId, work.activeGeneration);
      if (previousGeneration) await ctx.db.patch(previousGeneration._id, { status: "retired", endedAt: now });
    }
    await ctx.db.patch(candidate._id, { status: "active", activatedAt: now });
    await ctx.db.patch(work._id, { activeGeneration: args.generation, candidateGeneration: undefined, updatedAt: now });
    return { generation: args.generation, carriedOwnerVersions: carried, unmatchedOwnerVersions: unmatched, retiredGeneration: work.activeGeneration ?? null };
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
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const work = await requireWork(ctx, args.workId);
    if (work.activeGeneration === undefined) throw new Error(`Work ${args.workId} has no active generation to correct`);
    if (args.payload.kind !== args.kind) throw new Error(`Payload kind ${args.payload.kind} is not ${args.kind}`);
    const current = await findCurrentRecord(ctx, args.workId, work.activeGeneration, args.kind, args.recordId);
    if (!current) throw new Error(`No current ${args.kind} ${args.recordId} in generation ${work.activeGeneration}`);
    const version = contentVersion(args.payload);
    if (version === current.version && current.source === "owner") return { version, changed: false };
    await ctx.db.patch(current._id, { status: "superseded" });
    await ctx.db.insert("analysisRecords", {
      workId: args.workId, generation: work.activeGeneration, kind: args.kind, recordId: args.recordId, version,
      source: "owner", inputs: current.inputs, payload: args.payload, status: "current", createdAt: Date.now(),
    });
    return { version, changed: true, previousVersion: current.version };
  },
});

/** Remove a derived record (a plan or look) from the active generation so it is remade lazily. */
export const clearRecord = mutation({
  args: { serverSecret: v.string(), workId: v.string(), kind: v.union(v.literal("look"), v.literal("plan")), recordId: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const work = await requireWork(ctx, args.workId);
    if (work.activeGeneration === undefined) return { cleared: false };
    const current = await findCurrentRecord(ctx, args.workId, work.activeGeneration, args.kind, args.recordId);
    if (!current) return { cleared: false };
    await ctx.db.patch(current._id, { status: "superseded" });
    return { cleared: true };
  },
});

/** Add a derived record (look or plan) to the active generation at image time. */
export const putDerivedRecord = mutation({
  args: {
    serverSecret: v.string(),
    workId: v.string(),
    kind: v.union(v.literal("look"), v.literal("plan")),
    recordId: v.string(),
    payload: analysisValidators.payload,
    inputs: v.array(analysisValidators.input),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const work = await requireWork(ctx, args.workId);
    if (work.activeGeneration === undefined) throw new Error(`Work ${args.workId} has no active generation`);
    if (args.payload.kind !== args.kind) throw new Error(`Payload kind ${args.payload.kind} is not ${args.kind}`);
    const records = await currentRecords(ctx, args.workId, work.activeGeneration);
    const problems = structuralProblems([...records.filter((r) => !(r.kind === args.kind && r.recordId === args.recordId)), { kind: args.kind, recordId: args.recordId, payload: args.payload }]);
    const own = problems.filter((p) => p.startsWith(`${args.kind} ${args.recordId}:`));
    if (own.length) throw new Error(own.join("; "));
    const existing = await findCurrentRecord(ctx, args.workId, work.activeGeneration, args.kind, args.recordId);
    if (existing) await ctx.db.patch(existing._id, { status: "superseded" });
    const version = contentVersion(args.payload);
    await ctx.db.insert("analysisRecords", {
      workId: args.workId, generation: work.activeGeneration, kind: args.kind, recordId: args.recordId, version,
      source: "generated", inputs: args.inputs, payload: args.payload, status: "current", createdAt: Date.now(),
    });
    return { version, generation: work.activeGeneration };
  },
});

// ---------------------------------------------------------------- references (server)

/** Record a reference image blob (sheet or style reference) with the exact inputs it was made from. */
export const putReference = mutation({
  args: {
    serverSecret: v.string(),
    workId: v.string(),
    kind: v.union(v.literal("sheet"), v.literal("styleReference")),
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
    const fingerprint = contentVersion(args.inputs.map((i) => [i.kind, i.recordId, i.version]));
    const id = await ctx.db.insert("referenceImages", {
      workId: args.workId, kind: args.kind, recordId: args.recordId, storageId: args.storageId, inputs: args.inputs, fingerprint,
      verdict: args.verdict, notes: args.notes, pinned: false, status: "current", createdAt: Date.now(),
    });
    return { id, fingerprint };
  },
});

/** Pin or unpin the current reference; a pinned reference ignores staleness until unpinned. */
export const pinReference = mutation({
  args: { serverSecret: v.string(), workId: v.string(), kind: v.union(v.literal("sheet"), v.literal("styleReference")), recordId: v.string(), pinned: v.boolean() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const existing = await findReference(ctx, args.workId, args.kind, args.recordId);
    if (!existing) throw new Error(`No current ${args.kind} ${args.recordId} for ${args.workId}`);
    await ctx.db.patch(existing._id, { pinned: args.pinned });
    return { pinned: args.pinned };
  },
});

async function findReference(ctx: Ctx, workId: string, kind: "sheet" | "styleReference", recordId: string) {
  const matches = await ctx.db
    .query("referenceImages")
    .withIndex("by_work_kind_recordId", (q) => q.eq("workId", workId).eq("kind", kind).eq("recordId", recordId))
    .collect();
  return matches.find((r) => r.status === "current") ?? null;
}

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

export const closeAttention = mutation({
  args: { serverSecret: v.string(), id: v.id("attentionItems"), disposition: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Unknown attention item");
    await ctx.db.patch(args.id, { status: "closed", disposition: args.disposition, closedAt: Date.now(), lastActivityAt: Date.now() });
    return { closed: true };
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
    const { _id, _creationTime, ...rest } = generation;
    void _id;
    void _creationTime;
    const records = await currentRecords(ctx, args.workId, args.generation);
    const counts: Record<string, number> = {};
    for (const r of records) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    return { ...rest, counts };
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
    const records = await currentRecords(ctx, args.workId, work.activeGeneration);
    return records.filter((r) => r.kind === args.kind).map(publicRecord);
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

/**
 * Current records of the active generation whose inputs name an older version of the given
 * record. Detection only: nothing is remade and saved images are never touched.
 */
export const listStaleDependents = query({
  args: { workId: v.string(), kind: analysisValidators.kind, recordId: v.string() },
  handler: async (ctx, args) => {
    const work = await findWork(ctx, args.workId);
    if (!work || work.activeGeneration === undefined) return [];
    const current = await findCurrentRecord(ctx, args.workId, work.activeGeneration, args.kind, args.recordId);
    const records = await currentRecords(ctx, args.workId, work.activeGeneration);
    const stale: Array<{ kind: AnalysisKind; recordId: string; version: string; usedVersion: string }> = [];
    for (const r of records) {
      const used = r.inputs.find((i: InputRef) => i.kind === args.kind && i.recordId === args.recordId);
      if (used && (!current || used.version !== current.version)) stale.push({ kind: r.kind, recordId: r.recordId, version: r.version, usedVersion: used.version });
    }
    return stale;
  },
});

/** The current reference and whether it is stale against the inputs it should have been made from. */
export const getReference = query({
  args: {
    workId: v.string(), kind: v.union(v.literal("sheet"), v.literal("styleReference")), recordId: v.string(),
    expectedInputs: v.optional(v.array(analysisValidators.input)),
  },
  handler: async (ctx, args) => {
    const reference = await findReference(ctx, args.workId, args.kind, args.recordId);
    if (!reference) return null;
    const { _id, _creationTime, ...rest } = reference;
    void _creationTime;
    const expected = args.expectedInputs ? contentVersion(args.expectedInputs.map((i) => [i.kind, i.recordId, i.version])) : null;
    const stale = !reference.pinned && expected !== null && expected !== reference.fingerprint;
    return { id: _id, ...rest, stale };
  },
});

export const listAttention = query({
  args: { workId: v.string(), status: v.optional(v.union(v.literal("open"), v.literal("closed"))) },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("attentionItems")
      .withIndex("by_work_status", (q) => q.eq("workId", args.workId).eq("status", args.status ?? "open"))
      .collect();
    return items.map(({ _id, _creationTime, ...rest }) => {
      void _creationTime;
      return { id: _id, ...rest };
    });
  },
});

export type { Payload as AnalysisPayload };
