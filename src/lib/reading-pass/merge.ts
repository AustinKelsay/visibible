/**
 * Merge the divisions' casts into one work-wide cast (#169, spec #165 §2). Code groups entries
 * that share a name form or a same_person_as link; the model rules on each group, splitting it
 * into one cluster per individual. Singletons pass through. Merged entries get stable slugs, and
 * every section's cast is rewritten to merged ids. For the Bible, a same-name hint from TIPNR
 * accompanies each group.
 */
import type { DivisionReading, DivisionSection } from "./division";
import { RULING_SYSTEM, rulingOutputSchema, type RulingOutput } from "./prompts";
import { parseModelJson, type TextModel } from "./model";

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

/** A division-local entry's key: pool-qualified, since a character and a location may share an id. */
export function memberKey(division: string, pool: "characters" | "locations", id: string) {
  return `${division}:${pool === "characters" ? "character" : "location"}:${id}`;
}

function groupByForms(items: Keyed[]) {
  const parent = new Map(items.map((i) => [i.key, i.key]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const byForm = new Map<string, string[]>();
  for (const item of items) {
    for (const form of nameForms(item.entry)) {
      const list = byForm.get(form) ?? [];
      list.push(item.key);
      byForm.set(form, list);
    }
  }
  for (const keys of byForm.values()) for (const key of keys.slice(1)) union(key, keys[0]);
  for (const item of items) {
    const target = item.entry.same_person_as ? memberKey(item.division, "characters", item.entry.same_person_as) : null;
    if (target && parent.has(target)) union(item.key, target);
  }
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const root = find(item.key);
    groups.set(root, [...(groups.get(root) ?? []), item.key]);
  }
  return [...groups.values()];
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
  const singles: string[] = [];
  for (const pool of ["characters", "locations"] as const) {
    for (const members of groupByForms(pools[pool])) {
      if (members.length > 1) groups.push({ pool, members });
      else singles.push(members[0]);
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

  const perCall = options.groupsPerCall ?? 25;
  const rulings = new Map<number, RulingOutput["groups"][number]["clusters"]>();
  let calls = 0;
  for (let start = 0; start < groups.length; start += perCall) {
    const batch = groups.slice(start, start + perCall);
    const lines = [`Work: ${options.workTitle} (${options.workAuthor})`, ""];
    batch.forEach((group, i) => {
      lines.push(`## Group ${start + i} (${group.pool === "locations" ? "places" : "characters"})`);
      const hint = hintLine(group.members);
      if (hint) lines.push(hint);
      lines.push(...group.members.map(line));
    });
    const user = lines.join("\n");
    const expectedCompletionTokens = 60 * batch.reduce((n, g) => n + g.members.length, 0) + 200;
    await options.beforeCall?.({ system: RULING_SYSTEM, user, expectedCompletionTokens });
    calls++;
    const result = await model.complete({ label: `merge:${start}`, system: RULING_SYSTEM, user, schemaName: "merge_groups", schema: rulingOutputSchema, maxTokens: 30000, expectedCompletionTokens });
    const parsed = parseModelJson(rulingOutputSchema, result.content);
    if ("error" in parsed) throw new Error(`Merge ruling failed: ${parsed.error}`);
    for (const g of parsed.value.groups) rulings.set(g.group, g.clusters);
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
  groups.forEach((group, index) => {
    const placed = new Set<string>();
    const clusters: Array<{ name: string; members: string[] }> = [];
    for (const cluster of rulings.get(index) ?? []) {
      const members = cluster.members.filter((m) => group.members.includes(m) && !placed.has(m));
      if (!members.length) continue;
      for (const m of members) placed.add(m);
      const readingKind = cluster.kind === "place" ? undefined : cluster.kind;
      addEntry(group.pool, cluster.name, group.pool === "characters" ? readingKind ?? lookup.get(members[0])!.entry.kind : undefined, cluster.note, members);
      clusters.push({ name: cluster.name, members });
    }
    for (const m of group.members) {
      if (placed.has(m)) continue;
      const e = lookup.get(m)!.entry;
      addEntry(group.pool, e.name, e.kind, e.note, [m]);
      clusters.push({ name: e.name, members: [m] });
      unplaced.push(m);
    }
    groupReport.push({ pool: group.pool, members: group.members, clusters });
  });
  for (const key of singles) {
    const item = lookup.get(key)!;
    addEntry(item.pool, item.entry.name, item.entry.kind, item.entry.note, [key]);
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
  return { entries, sections, groups: groupReport, unplaced, calls };
}
