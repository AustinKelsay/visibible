import { z } from "zod";

const key = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().refine((value) => value.trim().length > 0, "Text must not be empty");
const sourceNoteSchema = z.object({
  kind: z.literal("footnote"),
  reference: text,
  source: z.url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  note: text,
}).strict();
const unitSchema = z.object({
  number: z.number().int().positive(),
  text,
  sourceNote: sourceNoteSchema.optional(),
}).strict();

export type WorkUnit = z.infer<typeof unitSchema>;
export type WorkDivision = {
  key: string;
  label: string;
  level: string;
} & (
  | { divisions: WorkDivision[]; units?: never }
  | { units: WorkUnit[]; divisions?: never }
);

const divisionSchema: z.ZodType<WorkDivision> = z.lazy(() => z.union([
  z.object({ key, label: text, level: text, divisions: z.array(divisionSchema).min(1) }).strict(),
  z.object({ key, label: text, level: text, units: z.array(unitSchema).min(1) }).strict(),
]));

const workSchema = z.object({
  schemaVersion: z.literal(1),
  id: key,
  title: text,
  author: text,
  language: text,
  referenceText: z.object({
    name: text,
    source: z.url(),
    credit: text,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  levels: z.array(text).min(2),
  // A template per leaf-division level supports works with optional intermediate levels.
  referenceFormats: z.record(z.string(), text),
  momentMode: z.enum(["unit", "reading-pass"]),
  divisions: z.array(divisionSchema).min(1),
}).strict();

export type WorkFile = z.infer<typeof workSchema>;
export type ReferenceUnit = Readonly<{
  id: string;
  number: number;
  text: string;
  reference: string;
  divisionId: string;
  rootDivisionId: string;
  position: number;
  sourceNote?: Readonly<z.infer<typeof sourceNoteSchema>>;
}>;

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

/** Parse an imported file once. Traversal order is the work's single reading order. */
export function createWorkReader(input: unknown) {
  const work = workSchema.parse(input);
  if (new Set(work.levels).size !== work.levels.length) {
    throw new Error("Work level names must be unique");
  }
  const unitLevel = work.levels[work.levels.length - 1];
  const units: ReferenceUnit[] = [];
  const byId = new Map<string, ReferenceUnit>();
  const byReference = new Map<string, ReferenceUnit>();
  const identities = new Set<string>();

  function reserve(id: string) {
    if (identities.has(id)) throw new Error(`Duplicate positional identity: ${id}`);
    identities.add(id);
  }

  function visit(division: WorkDivision, path: string[], labels: Record<string, string>, parentLevel: number) {
    const level = work.levels.indexOf(division.level);
    if (level <= parentLevel || level >= work.levels.length - 1 || (path.length === 0 && level !== 0)) {
      throw new Error(`Invalid division level: ${division.level}`);
    }
    const segments = [...path, division.key];
    const divisionId = segments.join("-");
    reserve(divisionId);
    const context = { ...labels, [division.level]: division.label };
    if (division.divisions) {
      for (const child of division.divisions) visit(child, segments, context, level);
      return;
    }
    const template = requireValue(Object.hasOwn(work.referenceFormats, division.level) ? work.referenceFormats[division.level] : undefined, `Missing reference format: ${division.level}`);
    if (!template.includes(`{${unitLevel}}`)) throw new Error("Reference format must include the unit level");
    for (const [index, unit] of division.units.entries()) {
      if (unit.number !== index + 1) throw new Error(`Units must be numbered consecutively in ${divisionId}`);
      const id = `${divisionId}-${unit.number}`;
      reserve(id);
      const values: Record<string, string> = { ...context, [unitLevel]: String(unit.number) };
      const reference = template.replace(/\{([^{}]+)\}/g, (_, name: string) =>
        requireValue(Object.hasOwn(values, name) ? values[name] : undefined, `Unknown reference level: ${name}`));
      if (/[{}]/.test(reference)) throw new Error("Malformed reference format");
      if (byReference.has(reference)) throw new Error(`Duplicate reference: ${reference}`);
      const result = Object.freeze({
        id, number: unit.number, text: unit.text, reference,
        divisionId, rootDivisionId: segments[0], position: units.length,
        ...(unit.sourceNote ? { sourceNote: Object.freeze(unit.sourceNote) } : {}),
      });
      units.push(result);
      byId.set(id, result);
      byReference.set(reference, result);
    }
  }

  for (const division of work.divisions) visit(division, [], {}, -1);
  // Do not expose mutable configuration to later moment validation.
  const momentMode = work.momentMode;
  return {
    work,
    momentMode,
    units: Object.freeze(units),
    getUnit(id: string): ReferenceUnit {
      return requireValue(byId.get(id), `Unknown unit: ${id}`);
    },
    getUnitByReference(reference: string): ReferenceUnit {
      return requireValue(byReference.get(reference), `Unknown reference: ${reference}`);
    },
  };
}

export type WorkReader = ReturnType<typeof createWorkReader>;

const rangeSchema = z.object({ firstUnitId: key, lastUnitId: key }).strict();
const sectionSchema = rangeSchema.extend({ moments: z.array(rangeSchema).min(1).optional() });
export type UnitRange = z.infer<typeof rangeSchema>;
export type SectionInput = z.infer<typeof sectionSchema>;
export type Moment = Readonly<UnitRange & {
  id: string;
  sectionId: string;
  reference: string;
  text: string;
  sourceNotes: ReadonlyArray<Readonly<{ unitId: string; note: NonNullable<ReferenceUnit["sourceNote"]> }>>;
}>;

/**
 * Bind a complete, ordered section/moment partition to a reference work.
 * Only registered moment IDs can be requested; callers cannot supply arbitrary spans.
 * Sections/moments are analysis inputs, not invented by the source importer.
 */
export function createMomentReader(work: WorkReader, input: unknown) {
  const sections = z.array(sectionSchema).min(1).parse(input);
  const moments: Moment[] = [];
  const byId = new Map<string, number>();
  let nextSectionPosition = 0;

  function rangeBounds(range: UnitRange) {
    const first = work.getUnit(range.firstUnitId);
    const last = work.getUnit(range.lastUnitId);
    if (first.position > last.position) throw new Error("Inverted unit range");
    return { first, last };
  }

  for (const section of sections) {
    const bounds = rangeBounds(section);
    if (bounds.first.position !== nextSectionPosition) throw new Error("Sections must cover the work in order without gaps or overlaps");
    const sectionUnits = work.units.slice(bounds.first.position, bounds.last.position + 1);
    let ranges: UnitRange[];
    if (work.momentMode === "unit") {
      if (section.moments !== undefined) throw new Error("Unit-mode moments are derived from units");
      ranges = sectionUnits.map((unit) => ({ firstUnitId: unit.id, lastUnitId: unit.id }));
    } else {
      ranges = requireValue(section.moments, "Reading-pass sections require fixed moments");
    }
    let nextMomentPosition = bounds.first.position;
    for (const range of ranges) {
      const { first, last } = rangeBounds(range);
      if (first.position < bounds.first.position || last.position > bounds.last.position) {
        throw new Error("Moment crosses its section boundary");
      }
      if (first.position !== nextMomentPosition) throw new Error("Moments must cover their section in order without gaps or overlaps");
      const selectedUnits = work.units.slice(first.position, last.position + 1);
      const moment = Object.freeze({
        ...range, id: first.id, sectionId: bounds.first.id,
        reference: first.id === last.id ? first.reference : `${first.reference}–${last.reference}`,
        text: selectedUnits.map((unit) => unit.text).join("\n\n"),
        sourceNotes: Object.freeze(selectedUnits.flatMap((unit) => unit.sourceNote
          ? [Object.freeze({ unitId: unit.id, note: unit.sourceNote })] : [])),
      });
      byId.set(moment.id, moments.length);
      moments.push(moment);
      nextMomentPosition = last.position + 1;
    }
    if (nextMomentPosition !== bounds.last.position + 1) throw new Error("Moment coverage is incomplete");
    nextSectionPosition = bounds.last.position + 1;
  }
  if (nextSectionPosition !== work.units.length) throw new Error("Section coverage is incomplete");

  function indexFor(id: string) {
    return requireValue(byId.get(id), `Unknown moment: ${id}`);
  }
  return {
    moments: Object.freeze(moments),
    getMoment(id: string): Moment {
      return moments[indexFor(id)];
    },
    getContext(id: string) {
      const index = indexFor(id);
      const moment = moments[index];
      const previous = moments[index - 1];
      const next = moments[index + 1];
      return {
        moment,
        previous: previous?.sectionId === moment.sectionId ? previous : null,
        next: next?.sectionId === moment.sectionId ? next : null,
      };
    },
  };
}
