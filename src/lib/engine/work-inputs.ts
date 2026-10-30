/**
 * The owner-authored repo inputs the generic engine renders from (#175, spec #165 §7): the
 * imported work, its approved brief, its depiction profile and the shared style files, read once per
 * server instance. The work and brief are versioned exactly as the owner scripts version them (a SHA-256
 * of each file's text), so the deployed inputs can be checked against the versions the active analysis
 * was registered with; the depiction profile is versioned by content and never registered (ADR 0009).
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createWorkReader, type ReferenceUnit, type WorkReader } from "../work-input";
import { SHARED_STYLES, validateWorkBrief, type ArtStyle, type WorkBrief } from "../work-preparation";
import { loadDepictionProfile, type DepictionProfile } from "./depiction";
import type { MomentContext } from "./preparation";

export type WorkInputs = {
  work: WorkReader;
  workVersion: string;
  brief: WorkBrief;
  briefVersion: string;
  /** The work's own wording for the engine's prompts and checks, and its depiction modes. */
  depiction: DepictionProfile;
  /** The styles the brief approves, with the version of each style file. */
  styles: Record<string, { style: ArtStyle; version: string }>;
};

export const fileVersion = (text: string) => createHash("sha256").update(text).digest("hex");

const WORK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Read and validate a work's inputs from the repo checkout the server runs from. */
export async function readWorkInputs(workId: string, root = process.cwd()): Promise<WorkInputs> {
  if (!WORK_ID.test(workId)) throw new Error(`Invalid work id: ${workId}`);
  const workDir = path.join(root, "works", workId);
  const [workJson, briefJson, depictionJson] = await Promise.all([
    readFile(path.join(workDir, "work.json"), "utf8"),
    readFile(path.join(workDir, "brief.json"), "utf8"),
    readFile(path.join(workDir, "depiction.json"), "utf8"),
  ]);
  const work = createWorkReader(JSON.parse(workJson));
  if (work.work.id !== workId) throw new Error(`works/${workId}/work.json describes ${work.work.id}`);
  const brief = validateWorkBrief(JSON.parse(briefJson));
  if (brief.workId !== workId) throw new Error(`works/${workId}/brief.json is the brief of ${brief.workId}`);
  const depiction = loadDepictionProfile(JSON.parse(depictionJson), workId);
  const styles: WorkInputs["styles"] = {};
  for (const id of brief.styleIds) {
    const style = SHARED_STYLES.styles.find((s) => s.id === id);
    if (!style) throw new Error(`Brief style ${id} is not in the shared library`);
    styles[id] = { style, version: fileVersion(await readFile(path.join(root, "styles", `${id}.json`), "utf8")) };
  }
  return { work, workVersion: fileVersion(workJson), brief, briefVersion: fileVersion(briefJson), depiction, styles };
}

const cache = new Map<string, Promise<WorkInputs>>();

/** Per-instance cache: the files are deployed with the server and only change with it. A failed read is not cached. */
export function loadWorkInputs(workId: string, root?: string): Promise<WorkInputs> {
  const key = `${root ?? ""}|${workId}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const task = readWorkInputs(workId, root).catch((error) => { cache.delete(key); throw error; });
  cache.set(key, task);
  return task;
}

export function clearWorkInputsCache() { cache.clear(); }

export type MomentRange = { id: string; firstUnit: string; lastUnit: string };
export type SectionRange = { firstUnit: string; lastUnit: string };

/**
 * The moment's reference text and its in-section neighbours, from the imported work and never
 * from the reader's translation. A neighbour is the unit before or after the moment when it is
 * still inside the section; for one-moment-per-unit works that is exactly the neighbouring moment.
 */
export function momentContext(work: WorkReader, moment: MomentRange, section: SectionRange): MomentContext {
  const first = work.getUnit(moment.firstUnit);
  const last = work.getUnit(moment.lastUnit);
  const sectionFirst = work.getUnit(section.firstUnit);
  const sectionLast = work.getUnit(section.lastUnit);
  if (first.position > last.position || first.position < sectionFirst.position || last.position > sectionLast.position) {
    throw new Error(`Moment ${moment.id} does not lie inside its section`);
  }
  const units = work.units.slice(first.position, last.position + 1);
  const text = units.map((u) => u.text).join(" ");
  const reference = first.id === last.id ? first.reference : `${first.reference} to ${last.reference}`;
  const previous: ReferenceUnit | null = first.position > sectionFirst.position ? work.units[first.position - 1] : null;
  const next: ReferenceUnit | null = last.position < sectionLast.position ? work.units[last.position + 1] : null;
  return { moment: { id: moment.id, reference, text }, previous: previous ? { text: previous.text } : null, next: next ? { text: next.text } : null };
}

/** The moment holding a unit, for works whose moments span several units. */
export function momentForUnit(work: WorkReader, unitId: string, moments: ReadonlyArray<MomentRange>): MomentRange | null {
  const unit = work.getUnit(unitId);
  for (const moment of moments) {
    const first = work.getUnit(moment.firstUnit).position;
    const last = work.getUnit(moment.lastUnit).position;
    if (first <= unit.position && unit.position <= last) return moment;
  }
  return null;
}
