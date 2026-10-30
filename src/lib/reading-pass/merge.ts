/**
 * Merge the divisions' casts into one work-wide cast (#169, spec #165 §2). Code groups entries
 * that share one name form or a same_person_as link; the model rules on each group, splitting it
 * into one cluster per individual. Only ruled identities connect overlapping groups. Singletons pass through. Merged entries get stable slugs, and
 * every section's cast is rewritten to merged ids. For the Bible, a same-name hint from TIPNR
 * accompanies each group.
 */
import type { DivisionReading, DivisionSection } from "./division";
import { RULING_SYSTEM, rulingOutputSchema, rulingSchemaForGroups, type RulingOutput } from "./prompts";
import { parseModelJson, type TextModel, type TextModelRequest, type TextModelResult } from "./model";

export type EntryKind = "character" | "location" | "object";

export type MergedEntry = {
  id: string;
  kind: EntryKind;
  readingKind: string;
  name: string;
  aliases: string[];
  note: string;
  /** Division-local entries this one came from, as "division:character:id" or "division:location:id". */
  members: string[];
};

export type MergedSection = Omit<DivisionSection, "setting" | "onStage" | "mentionedOnly"> & {
  divisionId: string;
  setting: string[];
  onStage: Array<{ id: string; named: boolean }>;
  mentionedOnly: string[];
};

export type SameNameHints = Record<string, { individuals: number; kind: string; byBook: Record<string, number> }>;

export type MergeResult = {
  entries: MergedEntry[];
  sections: MergedSection[];
  groups: Array<{ pool: "characters" | "locations"; members: string[]; clusters: Array<{ name: string; members: string[] }> }>;
  /** Complete model partitions that supersede contradictory partial rulings inside a component. */
  reconciliations?: Array<{ members: string[]; clusters: RulingOutput["groups"][number]["clusters"] }>;
  unplaced: string[];
  calls: number;
};

const TITLE = /^(the |king |queen |prophet |priest |mr\.? |mrs\.? |miss |dr\.? |lord |lady |sir )+/i;

export function nameForms(entry: { id: string; name: string; aliases: string[] }): Set<string> {
  const forms = new Set<string>();
  for (const raw of [entry.name, entry.id.replace(/_/g, " "), ...entry.aliases]) {
    const s = raw.trim().toLowerCase();
    if (!s) continue;
    forms.add(s);
    forms.add(s.replace(TITLE, ""));
    forms.add(s.split(/[,(]| son of | daughter of | wife of | of /)[0].trim());
  }
  const first = entry.name.split(/\s+/)[0];
  if (entry.name.includes(" ") && /^[A-Z][a-z]+$/.test(first)) forms.add(first.toLowerCase());
  forms.delete("");
  return forms;
}

export function slugify(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "entry";
}

type Keyed = { key: string; division: string; entry: { id: string; name: string; aliases: string[]; note: string; kind?: string; same_person_as?: string } };

export const MAX_MERGE_MEMBERS_PER_CALL = 150;
const MAX_RULING_ATTEMPTS = 3;
// Identity decisions need reasoning; reserve its full output allowance, not only the final JSON.
const RULING_OPTIONS = { reasoningEffort: "high", maxTokens: 30000, expectedCompletionTokens: 30000 } as const;

/** A division-local entry's key: pool-qualified, since a character and a location may share an id. */
export function memberKey(division: string, pool: "characters" | "locations", id: string) {
  return `${division}:${pool === "characters" ? "character" : "location"}:${id}`;
}

function groupByForms(items: Keyed[]) {
  const byForm = new Map<string, string[]>();
  for (const item of items) {
    for (const form of nameForms(item.entry)) {
      if (/^(a|an|the)$/.test(form)) continue;
      const list = byForm.get(form) ?? [];
      list.push(item.key);
      byForm.set(form, list);
    }
  }
  const groups = [...byForm.values()].filter((members) => members.length > 1);
  const keys = new Set(items.map((item) => item.key));
  for (const item of items) {
    const target = item.entry.same_person_as ? memberKey(item.division, "characters", item.entry.same_person_as) : null;
    if (target && keys.has(target) && target !== item.key) groups.push([item.key, target]);
  }
  // Aliases may overlap. Do not turn an alias chain into one unbounded candidate group.
  const unique = new Map(groups.map((members) => [JSON.stringify([...members].sort()), members]));
  return [...unique.values()];
}

function toEntryKind(readingKind: string | undefined, pool: "characters" | "locations"): EntryKind {
  if (pool === "locations") return "location";
  return readingKind === "other" ? "object" : "character";
}

export async function mergeCasts(options: {
  workTitle: string;
  workAuthor: string;
  readings: DivisionReading[];
  model: TextModel;
  sameNameHints?: SameNameHints;
  groupsPerCall?: number;
  beforeCall?: (request: { system: string; user: string; expectedCompletionTokens: number }) => Promise<void>;
  /** Cache accepted initial and reconciliation batches by their exact initial request. */
  onRuling?: (request: TextModelRequest, result: TextModelResult | null) => Promise<void>;
}): Promise<MergeResult> {
  const { readings, model } = options;
  const lookup = new Map<string, Keyed & { pool: "characters" | "locations"; sections: string[] }>();
  for (const reading of readings) {
    for (const pool of ["characters", "locations"] as const) {
      for (const entry of reading[pool]) {
        const key = memberKey(reading.divisionId, pool, entry.id);
        const sections = reading.sections.filter((s) => pool === "characters" ? s.onStage.some((o) => o.id === entry.id) : s.setting.includes(entry.id)).map((s) => s.title);
        lookup.set(key, { key, division: reading.divisionId, entry, pool, sections });
      }
    }
  }
  const pools = { characters: [] as Keyed[], locations: [] as Keyed[] };
  for (const item of lookup.values()) pools[item.pool].push(item);
  const groups: Array<{ pool: "characters" | "locations"; members: string[] }> = [];
  for (const pool of ["characters", "locations"] as const) {
    for (const members of groupByForms(pools[pool])) {
      if (members.length > MAX_MERGE_MEMBERS_PER_CALL) throw new Error(`Cast alias group has ${members.length} members, above the ${MAX_MERGE_MEMBERS_PER_CALL}-member limit; refine ambiguous cast aliases before merging`);
      groups.push({ pool, members });
    }
  }

  const line = (key: string) => {
    const item = lookup.get(key)!;
    const e = item.entry;
    return `- ${key} | ${e.name}${e.kind ? ` (${e.kind})` : ""} | aliases: ${e.aliases.join(", ") || "none"} | ${e.note} | sections: ${item.sections.slice(0, 6).join("; ") || "none"}`;
  };
  const hintLine = (members: string[]) => {
    if (!options.sameNameHints) return null;
    const forms = new Set(members.flatMap((k) => [...nameForms(lookup.get(k)!.entry)]));
    const books = new Set(members.map((k) => lookup.get(k)!.division));
    const hints: string[] = [];
    for (const form of forms) {
      const hint = options.sameNameHints[form];
      if (!hint) continue;
      const inBooks = [...books].map((b) => hint.byBook[b]).filter((n): n is number => typeof n === "number");
      if (inBooks.length) hints.push(`the reference index lists ${hint.individuals} distinct ${hint.kind === "place" ? "places" : "individuals"} named "${form}" in the work, up to ${Math.max(...inBooks)} within one of these divisions`);
    }
    return hints.length ? `  hint: ${hints.join("; ")}` : null;
  };

  // One group avoids a large union of per-group member enums in the provider grammar.
  const perCall = options.groupsPerCall ?? 1;
  if (!Number.isSafeInteger(perCall) || perCall < 1) throw new Error("groupsPerCall must be a positive integer");
  const rulings = new Map<number, RulingOutput["groups"][number]["clusters"]>();
  let calls = 0;
  const askRuling = async (initialRequest: TextModelRequest, expectedGroups: Array<{ group: number; members: string[] }>): Promise<RulingOutput> => {
    let feedback = "";
    for (let attempt = 1; attempt <= MAX_RULING_ATTEMPTS; attempt++) {
      const request = { ...initialRequest, label: attempt === 1 ? initialRequest.label : `${initialRequest.label}:${attempt}`, user: initialRequest.user + feedback };
      await options.beforeCall?.(request);
      calls++;
      const result = await model.complete(request);
      const parsed = parseModelJson(rulingOutputSchema, result.content);
      const problems: string[] = [];
      const expectedByGroup = new Map(expectedGroups.map((g) => [g.group, g.members]));
      const seenGroups = new Set<number>();
      if ("error" in parsed) problems.push(parsed.error);
      else for (const group of parsed.value.groups) {
        const members = expectedByGroup.get(group.group);
        if (!members || seenGroups.has(group.group)) { problems.push(`unknown or repeated group ${group.group}`); continue; }
        seenGroups.add(group.group);
        const expected = new Set(members);
        const seen = new Set<string>();
        for (const cluster of group.clusters) {
          if (!cluster.members.length) problems.push(`group ${group.group}: empty cluster`);
          for (const member of cluster.members) {
            if (!expected.has(member) || seen.has(member)) problems.push(`group ${group.group}: unknown or repeated member ${member}`);
            seen.add(member);
          }
        }
        for (const member of expected) if (!seen.has(member)) problems.push(`group ${group.group}: missing member ${member}`);
      }
      for (const group of expectedGroups) if (!seenGroups.has(group.group)) problems.push(`missing group ${group.group}`);
      if (!problems.length && "value" in parsed) {
        await options.onRuling?.(initialRequest, result);
        return parsed.value;
      }
      if (attempt === MAX_RULING_ATTEMPTS) throw new Error(`Merge ruling failed after ${attempt} attempts: ${problems.join("; ")}`);
      feedback = `\n\nPrevious answer:\n${result.content}\n\nThe previous answer was rejected: ${problems.join("; ")}\nReturn the FULL ruling for every numbered group above, using each exact member key once within its group. Do not add keys from any other group.`;
    }
    throw new Error("No complete merge ruling");
  };

  for (let start = 0; start < groups.length;) {
    let end = start;
    let members = 0;
    while (end < groups.length && end - start < perCall && members + groups[end].members.length <= MAX_MERGE_MEMBERS_PER_CALL) members += groups[end++].members.length;
    const batch = groups.slice(start, end);
    const lines = [`Work: ${options.workTitle} (${options.workAuthor})`, ""];
    batch.forEach((group, i) => {
      lines.push(`## Group ${start + i} (${group.pool === "locations" ? "places" : "characters"})`);
      const hint = hintLine(group.members);
      if (hint) lines.push(hint);
      lines.push(...group.members.map(line));
    });
    const user = lines.join("\n");
    const schema = rulingSchemaForGroups(batch.map((group, i) => ({ group: start + i, members: group.members })));
    const initialRequest = { label: `merge:${start}`, system: RULING_SYSTEM, user, schemaName: "merge_groups", schema, ...RULING_OPTIONS };
    const answer = await askRuling(initialRequest, batch.map((group, i) => ({ group: start + i, members: group.members })));
    for (const group of answer.groups) rulings.set(group.group, group.clusters);
    start = end;
  }

  const entries: MergedEntry[] = [];
  const memberToEntry = new Map<string, string>();
  const usedIds = new Set<string>();
  const unplaced: string[] = [];
  const uniqueId = (name: string) => {
    const base = slugify(name);
    let id = base;
    for (let n = 2; usedIds.has(id); n++) id = `${base}_${n}`;
    usedIds.add(id);
    return id;
  };
  const addEntry = (pool: "characters" | "locations", name: string, readingKind: string | undefined, note: string, members: string[]) => {
    const aliases = new Set<string>();
    for (const key of members) {
      const e = lookup.get(key)!.entry;
      if (e.name !== name) aliases.add(e.name);
      for (const a of e.aliases) aliases.add(a);
    }
    aliases.delete(name);
    const entry: MergedEntry = { id: uniqueId(name), kind: toEntryKind(readingKind, pool), readingKind: readingKind ?? "place", name, aliases: [...aliases], note, members };
    entries.push(entry);
    for (const key of members) memberToEntry.set(key, entry.id);
    return entry;
  };
  const groupReport: MergeResult["groups"] = [];
  const parent = new Map([...lookup.keys()].map((key) => [key, key]));
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(key, root);
    return root;
  };
  const descriptions = new Map<string, RulingOutput["groups"][number]["clusters"][number]>();
  groups.forEach((group, index) => {
    const clusters: Array<{ name: string; members: string[] }> = [];
    for (const cluster of rulings.get(index)!) {
      for (const member of cluster.members) {
        parent.set(find(member), find(cluster.members[0]));
        if (!descriptions.has(member)) descriptions.set(member, cluster);
      }
      clusters.push({ name: cluster.name, members: cluster.members });
    }
    groupReport.push({ pool: group.pool, members: group.members, clusters });
  });
  const conflictingRoots = new Set<string>();
  for (const clusters of rulings.values()) {
    const separated = new Set<string>();
    for (const cluster of clusters) {
      const root = find(cluster.members[0]);
      if (separated.has(root)) conflictingRoots.add(root);
      separated.add(root);
    }
  }
  const components = new Map<string, string[]>();
  for (const key of lookup.keys()) {
    const root = find(key);
    if (conflictingRoots.has(root)) components.set(root, [...(components.get(root) ?? []), key]);
  }
  // Validate all component bounds before paying for any reconciliation.
  for (const members of components.values()) {
    if (members.length > MAX_MERGE_MEMBERS_PER_CALL) throw new Error(`Conflicting identity component has ${members.length} members, above the ${MAX_MERGE_MEMBERS_PER_CALL}-member reconciliation limit; refine cast aliases before retrying`);
  }
  const reconciliations: NonNullable<MergeResult["reconciliations"]> = [];
  for (const members of components.values()) {
    const pool = lookup.get(members[0])!.pool;
    const user = [
      `Work: ${options.workTitle} (${options.workAuthor})`,
      "Earlier partial alias rulings both joined and separated entries in this linked component. Reconsider the full component from its entry evidence and return one final identity partition that supersedes those partial rulings. A shared name alone is not identity. A different source division, genre, narrator, age, title, remembered appearance or resurrection does not create a new individual; appearance stages are drafted later. Split only genuinely different individuals or places. Do not preserve a previous split merely because the entries come from different divisions.",
      `## Group 0 (${pool === "locations" ? "places" : "characters"})`,
      ...(hintLine(members) ? [hintLine(members)!] : []),
      ...members.map(line),
    ].join("\n");
    const answer = await askRuling({ label: `merge:reconcile:${members[0]}`, system: RULING_SYSTEM, user, schemaName: "merge_reconciliation", schema: rulingSchemaForGroups([{ group: 0, members }]), ...RULING_OPTIONS }, [{ group: 0, members }]);
    const clusters = answer.groups[0].clusters;
    reconciliations.push({ members, clusters });
    // The complete partition is authoritative only inside this component. It cannot join
    // another component, and the complete-key check prevents omitted or repeated members.
    for (const member of members) parent.set(member, member);
    for (const cluster of clusters) for (const member of cluster.members) {
      parent.set(find(member), find(cluster.members[0]));
      descriptions.set(member, cluster);
    }
  }
  const identities = new Map<string, string[]>();
  for (const key of lookup.keys()) {
    const root = find(key);
    identities.set(root, [...(identities.get(root) ?? []), key]);
  }
  for (const members of identities.values()) {
    const item = lookup.get(members[0])!;
    const description = descriptions.get(members[0]);
    addEntry(item.pool, description?.name ?? item.entry.name, description?.kind ?? item.entry.kind, description?.note ?? item.entry.note, members);
  }

  const sections: MergedSection[] = [];
  for (const reading of readings) {
    for (const section of reading.sections) {
      const character = (id: string) => memberToEntry.get(memberKey(reading.divisionId, "characters", id));
      const location = (id: string) => memberToEntry.get(memberKey(reading.divisionId, "locations", id));
      const dedupe = <T extends { id: string }>(items: T[]) => {
        const seen = new Set<string>();
        return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
      };
      sections.push({
        ...section, divisionId: reading.divisionId,
        setting: [...new Set(section.setting.map(location).filter((x): x is string => !!x))],
        onStage: dedupe(section.onStage.flatMap((o) => { const id = character(o.id); return id ? [{ id, named: o.named }] : []; })),
        mentionedOnly: [...new Set(section.mentionedOnly.map(character).filter((x): x is string => !!x))],
      });
    }
  }
  return { entries, sections, groups: groupReport, reconciliations, unplaced, calls };
}
