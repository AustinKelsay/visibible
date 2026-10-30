/**
 * Prompts and output schemas for the reading pass (#169, spec #165 §2).
 *
 * Every instruction is generic: none names a character, place, era or episode of any work, so
 * nothing here can nudge a draft brief toward one work. Output schemas are zod objects; their
 * JSON-schema form is sent to the provider as the response format. Model-output schemas use no
 * optional fields, because strict providers require every property.
 */
import { z } from "zod";

const text = z.string();
const ids = z.array(z.string());

export const ENTITY_KINDS = ["person", "group", "divine", "animal", "other"] as const;

export const divisionOutputSchema = z.object({
  characters: z.array(z.object({
    id: text, name: text, aliases: ids, kind: z.enum(ENTITY_KINDS), note: text, same_person_as: text,
  }).strict()),
  locations: z.array(z.object({ id: text, name: text, aliases: ids, note: text }).strict()),
  sections: z.array(z.object({
    start: text, end: text, title: text, setting: ids, on_stage: ids, mentioned_only: ids,
  }).strict()),
  brief: z.object({
    tone: text,
    depiction_rules: ids,
    era: z.object({ name: text, people: text, dress: text, buildings_and_objects: text, technology: text }).strict(),
  }).strict(),
}).strict();
export type DivisionOutput = z.infer<typeof divisionOutputSchema>;

export const DIVISION_SYSTEM = `You are the reading pass of an illustration engine. You read one large division of a work (a whole text such as a scripture, a novel or a story collection) and return its skeleton as JSON. The engine later draws pictures of the text's moments, so for every stretch of text it needs to know who is on stage and where, and it needs a draft brief for illustrators.

The text comes as numbered units. Each unit line starts with its id in square brackets, for example \`[3-14]\` or \`[12]\`. Lines starting with \`##\` are headings, not units.

Return:

1. characters: one entry per individual (a person, a being, or an animal that acts) who appears in or is named in the text.
   - One individual is one entry, even when the text uses different names, titles or descriptions for them. List every form in \`aliases\`: other names, nicknames, titles, descriptions, and disguises or assumed names.
   - Different individuals who share a name or a title get separate entries, one each. Never fold two people into one entry because they share a name. When a title passes from one holder to another, the new holder is a new entry. The \`note\` must say in one line who this is and how to tell them apart from anyone else with the same name: whose child, spouse or servant they are, their role, and where in the text they appear.
   - A disguised, renamed or unnamed person who the text later identifies is the same entry as their named self, with the disguise or description in \`aliases\`. If you suspect two entries are one individual but the text does not settle it, keep both and set \`same_person_as\` on the less certain one to the other's id; otherwise set it to "".
   - Skip people who occur only inside a list of names (a genealogy or roster) and never act.
   - Add a group (an army, a crowd, a household) only when it acts as one on stage, with kind "group".
   - Include named and unnamed actors inside narrated stories, parables, dreams, visions and recollections. They act within the scene being illustrated even when another character tells or sees it. Keep their identities distinct from framing speakers, listeners and observers unless the text identifies them as the same individual. Describe the narrative role in the note.
2. locations: one entry per place where action happens, with aliases and a one-line note. Include places the text refers to only by description when the context shows which place it is, under the place's proper name if the work gives one anywhere.
3. sections: split the text into story sections, runs of consecutive units that tell one episode, the way a study edition's headings or a novel's scenes do. Start a new section when the time, the place or the main action changes. Every unit belongs to exactly one section; sections are in order, with no gaps and no overlaps. {granularity} Give the ids of each section's first and last unit and a short title. For each section:
   - setting: ids of the locations where its action happens.
   - on_stage: ids of every character present in the section's action, whether the section names them or only refers to them by a pronoun, a title or a description, or does not mention them but they are clearly there.
   - mentioned_only: ids of characters the section names or refers to who are not present. Never put a location id in on_stage or mentioned_only. A place that is only mentioned belongs in neither character list nor setting.
   - Actors who participate inside an embedded story or vision belong in on_stage, not mentioned_only. The framing participants may also belong to this section, but its cast is the union across its scenes, not a roster to draw together. Include the embedded action's setting and identify its role in the location note. Keep on_stage and mentioned_only disjoint.
4. brief: a draft brief for illustrators, for this division only. It holds only what is true across the whole division or a whole stretch of its world: one person or place is described in the cast, not here, and one episode's look belongs to its section, not here.
   - tone: one line on the mood the pictures should carry.
   - depiction_rules: a short list of how certain things in this text may or may not be shown, drawn from the text and from what you know about the work.
   - era: the stretch of the world this division is set in: a name, its people (who lives there and what they look like), dress, buildings and objects, and technology (what exists and what does not yet exist).
   Keep the brief under 200 words.

Use short, stable snake_case ids (for example \`david\`, \`the_queen\`, \`main_street\`). Section entries may only use ids from your own characters and locations lists. Define every referenced cast id; never use undefined placeholder ids. Return the complete division, including on retries, never just corrections. Do not quote the text.`;

export function granularityInstruction(unitCount: number, unitsPerSection: number): string {
  const n = Math.max(1, Math.round(unitCount / unitsPerSection));
  const lo = Math.max(1, Math.round(n * 0.8));
  const hi = Math.max(lo, Math.round(n * 1.2));
  return `This division has ${unitCount} units. Aim for roughly ${n} sections (${lo} to ${hi}), averaging about ${unitsPerSection} units each; ` +
    "some sections will be much shorter and some longer. Never split one continuous scene, conversation or battle, " +
    "but do split long speeches, lists, sets of instructions and law codes wherever the topic changes.";
}

const rulingClusterSchema = z.object({
  name: text, kind: z.enum([...ENTITY_KINDS, "place"]), note: text, members: ids,
}).strict();

export const rulingOutputSchema = z.object({
  groups: z.array(z.object({
    group: z.number().int(),
    clusters: z.array(rulingClusterSchema),
  }).strict()),
}).strict();
export type RulingOutput = z.infer<typeof rulingOutputSchema>;

/** Constrain provider output to each numbered group's own keys, including overlapping groups. */
export function rulingSchemaForGroups(groups: Array<{ group: number; members: string[] }>) {
  const options = groups.map(({ group, members }) => {
    if (!members.length) throw new Error("A ruling group must have members");
    return z.object({
      group: z.literal(group),
      clusters: z.array(rulingClusterSchema.extend({ members: z.array(z.enum(members)) })),
    }).strict();
  });
  if (!options.length) throw new Error("A ruling request must have groups");
  // Plain unions emit anyOf; Zod's discriminated unions emit oneOf, unsupported by this provider.
  return z.object({ groups: z.array(options.length === 1 ? options[0] : z.union(options)) }).strict();
}

export const RULING_SYSTEM = `You rule on candidate groups of cast entries from the reading pass of one work. Code has grouped entries from the work's divisions that share a name, a title or an alias. For each group you get its entries: a member key ("division:character:id" or "division:location:id"), name, kind, aliases, note, and the sections where each appears. A group may also carry a hint line from a reference index of the work saying how many distinct individuals bear that name in these divisions; use it as evidence, not as an order.

For each numbered group, split its entries into clusters, one cluster per individual (or per place). Groups may overlap because one entry has several names; rule on every group separately using the exact group number shown, not a new local index. Never copy a member key into a group where it is not listed. The divisions are parts of one work, so the same individual or place appearing in several divisions is one cluster: join entries from different divisions whenever their notes, roles, relations and places agree. A different narrator, title, age or portrayal does not make the same individual a different person. Keep entries apart only when they are different individuals: never join entries on a shared name alone when their notes describe different people, and two holders of the same title in different times are different individuals. A disguise, an assumed name or a description that the notes say belongs to a named individual joins that individual's cluster. Give each cluster a name, a kind, and a one-line note saying who this is and how to tell them apart from the others in the group. Every member key of each group must appear in exactly one of that group's clusters.`;

export const briefOutputSchema = z.object({
  tone: text,
  depiction_rules: ids,
  eras: z.array(z.object({ name: text, people: text, dress: text, buildings_and_objects: text, technology: text }).strict()),
  assignments: z.array(z.object({ first_section: text, last_section: text, era: text }).strict()),
  style_set: z.array(z.object({ style_id: text, reason: text }).strict()),
}).strict();
export type BriefOutput = z.infer<typeof briefOutputSchema>;

export const BRIEF_SYSTEM = `You draft the work brief for an illustration engine: one page that tells every illustrator how this whole work looks and feels. You get the work's title and author, the draft briefs the reading pass wrote for each of its divisions, the ordered list of the work's story sections (id, division, title), and the library of art styles the engine already offers (id and a one-line description each).

Return:
1. tone: one line on the mood every picture of this work should carry.
2. depiction_rules: a short list of how certain things in the work may or may not be shown, drawn from the divisions' drafts, the text and what you know about the work. Each rule is one line.
3. eras: one or more stretches of the work's world. Each has a short name and four lines: people (who lives in it and what they look like), dress, buildings and objects, and technology (what exists and what does not yet exist). Use as few eras as the work needs: one when the whole work shares a setting, several when its people, dress or technology change from one stretch of the story to the next.
4. assignments: every story section belongs to exactly one era. Give runs of consecutive sections in the order listed: each run names its first and last section id and its era. The runs must cover every section in order, with no gaps and no overlaps.
5. style_set: an ordered list of the library's style ids that suit this work, best first, each with one line of reasoning. Use only ids from the library given; never invent a style.

The brief holds only what is true for the whole work or a whole era. One person or place is described in the cast, not here. One episode's look belongs to its section, not here. Do not write rules or era lines about a single character, place or episode.

Keep the tone, rules and eras under 300 words in total, and keep each era's four lines short: the tone, the rules and one era together must fit in about 1,000 characters.`;

export const momentsOutputSchema = z.object({
  moments: z.array(z.object({ section_start: text, start: text, end: text, summary: text }).strict()),
}).strict();
export type MomentsOutput = z.infer<typeof momentsOutputSchema>;

export const MOMENTS_SYSTEM = `You split the story sections of one division of a prose work into moments for an illustration engine, which draws one picture per moment.

The text comes as numbered paragraphs: each line starts with its id in square brackets and its word count in parentheses, for example \`[12] (34w)\`. After the text you get the division's story sections, each with its first and last paragraph id.

Return moments, in order. A moment is a run of consecutive paragraphs that is one beat you can picture: one place, one continuous action or exchange, seen at one instant. Aim for roughly 100 to 400 words per moment, using the word counts given; a moment may be shorter when the beat is a single striking paragraph, and may run past 400 only when one unbroken exchange cannot be cut. Very short paragraphs (lines of dialogue) join their neighbours. Moments tile every section: each paragraph belongs to exactly one moment, moments never cross a section boundary, and together they cover every paragraph of every section with no gaps and no overlaps. Give each moment its first and last paragraph id, the section it lies in (by its first paragraph id), and a one-line summary of what you would see in the picture: who is there, where, doing what. Do not quote the text.`;

/** The provider's strict response format for a zod output schema. */
export function responseSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
