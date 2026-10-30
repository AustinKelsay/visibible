/**
 * The generic rendering packet and reference-aware quote (#173): every style, cast/stage and
 * reference assignment, zero to three references, never-trimmed content under adversarial sizes,
 * precedence, and quote counts from controlled catalog data.
 */
import { describe, it, expect } from "vitest";
import { buildRenderingPacket, rankSheetCandidates, selectReferences, engineRules, GENERIC_PROMPT_MAX_CHARS, GENERIC_PROMPT_VERSION, PRECEDENCE_LINE, type RenderingInput, type SelectedCanon, type AvailableReference } from "../engine/prompt";
import { quoteGenericImage } from "../engine/quote";
import { SHARED_STYLES, type WorkBrief } from "../work-preparation";
import { normalizeImageBilling } from "../image-catalog";
import referencePricing from "../../../tests/fixtures/lite-reference-pricing.json";
import { testDepiction } from "../../../tests/fixtures/depiction";

// A Holmes-like fixture with a subject without form: the Bible's wording exercises that contract.
const depiction = testDepiction("holmes-adventures");
const ENGINE_RULES = engineRules(depiction);

const brief: WorkBrief = {
  schemaVersion: 1, workId: "holmes-adventures", tone: "Brisk, foggy Victorian detective mood.",
  depictionRules: [{ text: "Violence is kept offstage or suggested by objects." }, { text: "In Byzantine Icon, the fog becomes a flat grey ground.", styleIds: ["icon"] }],
  eras: [{ id: "victorian", label: "Victorian England, 1880s", people: "Londoners of every class.", dress: "Frock-coats, bowlers, bustles.", buildingsAndObjects: "Gaslit brick streets, hansom cabs.", technology: "Railways and telegrams; no electric light or motor cars." }],
  styleIds: ["classical", "watercolor", "icon"],
};
const canon: SelectedCanon[] = [
  { entryId: "sherlock_holmes", stageId: "main", kind: "character", name: "Sherlock Holmes", text: "Sherlock Holmes: lean, hawk-nosed, in a grey dressing-gown.", hasForm: true, version: "h1" },
  { entryId: "221b_baker_street", stageId: "main", kind: "location", name: "221B Baker Street", text: "221B Baker Street: a first-floor sitting-room with a bow window.", hasForm: true, version: "b1" },
  { entryId: "dr_watson", stageId: "main", kind: "character", name: "Dr. Watson", text: "Dr. Watson: sturdy, moustached, in tweed.", hasForm: true, version: "w1" },
  { entryId: "the_voice", stageId: "main", kind: "character", name: "the voice", text: "The voice: never a face or body; light only.", hasForm: false, version: "v1" },
];
const references: AvailableReference[] = [
  { kind: "styleReference", styleId: "watercolor", storageId: "st-wc", version: "r1" },
  { kind: "styleReference", styleId: "icon", storageId: "st-icon", version: "r2" },
  { kind: "sheet", entryId: "sherlock_holmes", stageId: "main", storageId: "sh-holmes", version: "s1" },
  { kind: "sheet", entryId: "dr_watson", stageId: "main", storageId: "sh-watson", version: "s2" },
  { kind: "sheet", entryId: "221b_baker_street", stageId: "main", storageId: "sh-221b", version: "s3" },
  { kind: "sheet", entryId: "the_voice", stageId: "main", storageId: "sh-voice", version: "s4" },
];
const formedCanon = canon.filter((c) => c.hasForm);
const owner = { place: "Baker Street sitting-room", timeOfDay: "night", weather: "fog outside", light: "gaslight and firelight", clothing: "dressing-gown and frock-coat" };
const selectedRule = ENGINE_RULES.find((rule) => rule.startsWith("Show the SELECTED CHARACTERS"))!;
const formlessRule = ENGINE_RULES.find((rule) => rule.startsWith("A subject without form"))!;
const base = (styleId: string, extra: Partial<RenderingInput> = {}): RenderingInput => {
  const input = {
  work: { id: "holmes-adventures", title: "The Adventures of Sherlock Holmes" },
  moment: { id: "a-scandal-in-bohemia-1-1", sectionId: "a-scandal-in-bohemia-1-1", reference: "A Scandal in Bohemia, Part 1 ¶1", text: "To Sherlock Holmes she is always the woman." },
  neighbors: { previous: null, next: "I had seen little of Holmes lately." },
  brief, briefVersion: "bv1", eraId: "victorian", style: SHARED_STYLES.get(styleId), styleVersion: `${styleId}-v1`,
  look: { version: "l1", place: "Baker Street sitting-room", timeOfDay: "night", weather: "fog outside", light: "gaslight and firelight", clothing: "dressing-gown and frock-coat" },
  plan: { version: "p1", primarySubject: "Holmes by the fire", action: "gazes at the fire, pipe in hand", setting: "the sitting-room", secondaryElements: "Watson in the doorway", mood: "pensive", timeOfDay: "night", composition: "medium shot" },
  canon: formedCanon, references, variationNumber: 2, aspectRatio: "16:9" as const, depiction, ...extra,
  };
  // A generated look renders no conditions (since generic-v10); tests pass `situation` for owner constraints.
  return { ...input, situation: extra.situation ?? null };
};

describe("rendering packet", () => {
  it("combines rules, brief, canon, look, plan, style and captions for every style with the agreed reference order", () => {
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const result = buildRenderingPacket(base(styleId));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.prompt.startsWith("PRIORITY RULES:")).toBe(true);
      expect(result.prompt).toContain("No likeness of any real actor");
      expect(result.prompt).toContain(PRECEDENCE_LINE);
      expect(result.prompt).toContain("follow these rules, then the work brief, then canon, then the art style, then the scene plan.");
      expect(result.prompt).toContain('SCENE: one moment of The Adventures of Sherlock Holmes, A Scandal in Bohemia, Part 1 ¶1: "To Sherlock Holmes she is always the woman."');
      expect(result.prompt).toContain("Tone: Brisk, foggy Victorian detective mood.");
      expect(result.prompt).toContain("Depiction: Violence is kept offstage");
      expect(result.prompt.includes("fog becomes a flat grey ground")).toBe(styleId === "icon");
      expect(result.prompt).toContain("- Sherlock Holmes: lean, hawk-nosed");
      expect(result.prompt).toContain("Only Sherlock Holmes, 221B Baker Street, Dr. Watson have this canon look");
      expect(result.prompt).toContain("Primary subject: Holmes by the fire");
      expect(result.prompt).toContain(`ART STYLE: ${SHARED_STYLES.get(styleId).label}\nRendering: ${SHARED_STYLES.get(styleId).rendering}`);
      // A generated look renders no separate conditions; the plan carries setting and time.
      expect(result.prompt).not.toContain("MOMENT CONDITIONS");
      expect(result.prompt).not.toContain("OWNER LOOK CONSTRAINTS");
      expect(result.prompt).toContain("Setting: the sitting-room");
      expect(result.prompt).toContain("Variation note: this is image 2");
      expect(result.prompt).toContain("- After: I had seen little of Holmes lately.");
      expect(result.prompt).not.toMatch(/\b(biblical|bible|genesis|verse)\b/i);
      // Classical: Holmes, 221B, Watson. Non-Classical: style reference first, then Holmes and 221B; Watson drops. The voice never.
      const ids = result.packet.references.map((r) => r.id);
      expect(ids).toEqual(styleId === "classical" ? ["sherlock_holmes:main", "221b_baker_street:main", "dr_watson:main"] : [styleId, "sherlock_holmes:main", "221b_baker_street:main"]);
      expect(ids).not.toContain("the_voice:main");
      expect(result.references.map((r) => r.caption)).toEqual(result.packet.references.map((r) => r.caption));
      expect(result.references[result.references.length - 1].caption).toMatch(/^Image 3: /);
      expect(result.prompt).toContain(result.references[0].caption);
      expect(result.packet).toMatchObject({ promptVersion: GENERIC_PROMPT_VERSION, styleId, briefVersion: "bv1", lookVersion: "l1", planVersion: "p1",
        canon: [{ entryId: "sherlock_holmes", stageId: "main", version: "h1" }, expect.anything(), expect.anything()],
        flags: { variationIncluded: true, neighborsIncluded: true, styleDetailIncluded: true, lookDetailIncluded: true } });
      expect(result.packet.budget.finalChars).toBe(result.prompt.length);
    }
  });

  it.each([
    ["formed character", [canon[0]], "Sherlock Holmes"],
    ["no-form subject", [canon[3]], "(none with fixed canon; show only figures the scene plan describes, or none)"],
    ["location only", [canon[1]], "(none with fixed canon; show only figures the scene plan describes, or none)"],
    ["empty cast", [], "(none with fixed canon; show only figures the scene plan describes, or none)"],
    ["group", [{ ...canon[0], name: "Court attendants" }], "Court attendants"],
  ] as const)("names only selected characters for %s without rewriting shared context", (_label, selected, expected) => {
    const input = base("classical", { canon: [...selected], situation: { ...owner } });
    const result = buildRenderingPacket(input);
    if (!result.ok) throw new Error(result.error);
    expect(result.prompt).toContain(`SELECTED CHARACTERS: ${expected}\n`);
    expect(result.prompt).not.toMatch(/SELECTED CHARACTERS:[^\n]*the voice/i);
    expect(result.prompt).toContain(`Clothing: ${owner.clothing}`);
    expect(result.prompt).toContain(selectedRule);
    expect(result.packet.canon.map((entry) => entry.entryId)).toEqual(selected.map((entry) => entry.entryId));
  });

  it("keeps no-form rules above owner constraints and rejects oversized required owner constraints", () => {
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const input = base(styleId, { canon: [canon[0]], references: [], neighbors: undefined, variationNumber: null, situation: { ...owner, light: "veiled radiance representing the voice" } });
      const full = buildRenderingPacket(input);
      if (!full.ok) throw new Error(full.error);
      expect(full.prompt).toContain(`Light: ${input.situation!.light}`);
      expect(formlessRule).toContain("Only when it is selected");
      expect(full.prompt.indexOf(formlessRule)).toBeLessThan(full.prompt.indexOf("OWNER LOOK CONSTRAINTS (binding, verbatim):"));
      expect(full.prompt).not.toContain("UNSEEN PRESENCE");
      input.situation!.light = "radiance ".repeat(1800);
      expect(buildRenderingPacket(input)).toMatchObject({ ok: false, error: expect.stringContaining("after every allowed trim") });
    }
  });

  it("renders owner constraints verbatim, and nothing for a generated look", () => {
    const withOwner = buildRenderingPacket(base("classical", { situation: { ...owner } }));
    if (!withOwner.ok) throw new Error(withOwner.error);
    expect(withOwner.prompt).toContain(`OWNER LOOK CONSTRAINTS (binding, verbatim):\nPlace: ${owner.place}\nTime of day: ${owner.timeOfDay}\nWeather: ${owner.weather}\nLight: ${owner.light}\nClothing: ${owner.clothing}`);
    expect(withOwner.prompt.indexOf("OWNER LOOK CONSTRAINTS")).toBeLessThan(withOwner.prompt.indexOf("SCENE PLAN ("));
    for (const generated of [undefined, null]) {
      const result = buildRenderingPacket({ ...base("classical"), situation: generated });
      if (!result.ok) throw new Error(result.error);
      expect(result.prompt).not.toContain("OWNER LOOK CONSTRAINTS");
      expect(result.prompt).not.toContain("MOMENT CONDITIONS");
      expect(result.prompt).not.toContain(owner.clothing);
      expect(result.prompt).toContain("Time of day: night");
    }
    expect(buildRenderingPacket(base("classical", { situation: { ...owner, light: undefined as unknown as string } }))).toMatchObject({ ok: false, error: "Owner look constraints are malformed." });
  });

  it("describes a no-form subject by its effects without naming it or quoting the source, keeping other characters' forms", () => {
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const input = base(styleId, { canon, neighbors: { previous: "The voice spoke from the light.", next: "I had seen little of Holmes lately." },
        plan: { ...base(styleId).plan, primarySubject: "The voice glows above Holmes", secondaryElements: "Watson shields his eyes from the voice" } });
      input.moment.text = "The voice sat beside Holmes, clothed in light.";
      const result = buildRenderingPacket(input);
      if (!result.ok) throw new Error(result.error);
      // No source quote, reference or neighbours, and the subject is never named, even where the plan named it.
      expect(result.prompt).not.toContain(input.moment.text);
      expect(result.prompt).not.toContain(input.moment.reference);
      expect(result.prompt).not.toContain("NARRATIVE CONTINUITY");
      expect(result.prompt).not.toMatch(/the voice/i);
      expect(result.prompt).toContain("SCENE: one moment of The Adventures of Sherlock Holmes, described by the scene plan below.");
      expect(result.prompt).toContain("Primary subject: the presence glows above Holmes");
      expect(result.prompt).toContain("Secondary elements: Watson shields his eyes from the presence");
      // Its canon is not sent either (since generic-v11): describing a veiled glow drew a figure in theophany scenes.
      expect(result.prompt).toContain("UNSEEN PRESENCE (binding): the light, cloud, smoke, fire and wind in the scene plan are light and weather spread through the place, not one glowing shape. Nobody stands, sits or hovers in them.\n");
      expect(result.prompt).not.toContain("never a face or body; light only.");
      expect(result.prompt).not.toContain("PRESENCE SHOWN ONLY AS EFFECTS");
      expect(result.prompt).toContain("SELECTED CHARACTERS: Sherlock Holmes; Dr. Watson\n");
      // Formed canon is still rendered in full, after the presence block.
      expect(result.prompt).toContain("- Sherlock Holmes: lean, hawk-nosed, in a grey dressing-gown.");
      expect(result.prompt).toContain("- Dr. Watson: sturdy, moustached, in tweed.");
      expect(result.prompt.indexOf("UNSEEN PRESENCE")).toBeLessThan(result.prompt.indexOf("CANON ("));
      expect(result.prompt).not.toContain("FORMLESS SUBJECTS");
      expect(result.packet.canon.map((c) => c.entryId)).toContain("the_voice");
      expect(result.packet.flags.neighborsIncluded).toBe(false);
      expect(result.references.some((r) => r.kind === "sheet" && r.entryId === "the_voice")).toBe(false);
    }
    const formed = buildRenderingPacket(base("classical"));
    if (!formed.ok) throw new Error(formed.error);
    expect(formed.prompt).not.toContain("UNSEEN PRESENCE");
    expect(formed.prompt).toContain('A Scandal in Bohemia, Part 1 ¶1: "To Sherlock Holmes she is always the woman."');
    expect(formed.prompt).toContain("- After: I had seen little of Holmes lately.");
    // A stored payload passed whole keeps its non-text keys untouched (regression: the v10 harness passed `present`).
    const withPresent = buildRenderingPacket(base("classical", { canon, plan: { ...base("classical").plan, present: ["the_voice"] } as never }));
    if (!withPresent.ok) throw new Error(withPresent.error);
    expect(withPresent.prompt).not.toMatch(/the voice/i);
    // Whole words only: a name inside a longer word is left alone.
    const boundary = buildRenderingPacket(base("classical", { canon, plan: { ...base("classical").plan, mood: "The voiceless crowd waits; the Voice speaks" } }));
    if (!boundary.ok) throw new Error(boundary.error);
    expect(boundary.prompt).toContain("Mood: The voiceless crowd waits; the presence speaks");
    // A slash-separated name is matched by its parts too (regression: "God's presence stands" leaked with "God / Yahweh, …").
    const slashed = { ...canon[3], name: "Echo / the Voice, Speaker of the Hills", text: "The Speaker: light only." };
    const parts = buildRenderingPacket(base("classical", { canon: [canon[0], slashed], plan: { ...base("classical").plan, action: "Echo's light fills the room as the Voice speaks; the Speaker waits", mood: "echoing halls" } }));
    if (!parts.ok) throw new Error(parts.error);
    expect(parts.prompt).toContain("Action: the presence's light fills the room as the presence speaks; the presence waits");
    expect(parts.prompt).toContain("Mood: echoing halls");
    const onlyFormless = buildRenderingPacket(base("classical", { canon: [canon[3]] }));
    if (!onlyFormless.ok) throw new Error(onlyFormless.error);
    expect(onlyFormless.prompt).toContain("UNSEEN PRESENCE (binding)");
    expect(onlyFormless.prompt).not.toContain("never a face or body; light only.");
    expect(onlyFormless.prompt).not.toContain("CANON (");
    expect(onlyFormless.prompt).not.toContain("this canon look");
    expect(onlyFormless.prompt).not.toMatch(/the voice/i);
  });

  it("selects a Classical style reference first when one is available, keeping at most three references", () => {
    const withClassical: AvailableReference[] = [{ kind: "styleReference", styleId: "classical", storageId: "st-classical", version: "r0" }, ...references];
    const result = buildRenderingPacket(base("classical", { references: withClassical }));
    if (!result.ok) throw new Error(result.error);
    // Style reference first, then Holmes and 221B; Watson drops at the three-image limit. The voice never.
    expect(result.packet.references.map((r) => r.id)).toEqual(["classical", "sherlock_holmes:main", "221b_baker_street:main"]);
    expect(result.references[0]).toMatchObject({ kind: "styleReference", storageId: "st-classical", index: 0 });
    expect(result.references[0].caption).toMatch(/^Image 1: art-style reference/);
    // Another style's reference never stands in for Classical's.
    const otherStylesOnly = buildRenderingPacket(base("classical"));
    expect(otherStylesOnly.ok && otherStylesOnly.packet.references.map((r) => r.id)).toEqual(["sherlock_holmes:main", "221b_baker_street:main", "dr_watson:main"]);
    const control = buildRenderingPacket(base("classical", { references: withClassical, omitStyleReference: true }));
    expect(control.ok && control.packet.references.map((r) => r.id)).toEqual(["sherlock_holmes:main", "221b_baker_street:main"]);
  });

  it("caps the prompt at 12,000 characters and accepts prompts above the old 8,000 cap", () => {
    expect(GENERIC_PROMPT_MAX_CHARS).toBe(12000);
    const fitting = buildRenderingPacket(base("watercolor"));
    if (!fitting.ok) throw new Error(fitting.error);
    const pad = 9500 - fitting.prompt.length;
    const longer = buildRenderingPacket(base("watercolor", { canon: formedCanon.map((c, i) => (i === 0 ? { ...c, text: c.text + " x".repeat(Math.ceil(pad / 2)) } : c)) }));
    if (!longer.ok) throw new Error(longer.error);
    expect(longer.prompt.length).toBeGreaterThan(8000);
    expect(longer.packet.budget).toEqual({ maxChars: 12000, finalChars: longer.prompt.length });
    // Nothing was trimmed to fit it.
    expect(longer.packet.flags).toMatchObject({ variationIncluded: true, neighborsIncluded: true, styleDetailIncluded: true });
  });

  it("ranks sheet slots by who the plan's primary subject and action name, then plan order, and passes a slot on when a candidate has no sheet", () => {
    const watcher = { primarySubject: "Watson at the window", action: "watches the street" };
    // Watson's sheet goes first because the primary subject names him; the place keeps the second slot.
    expect(rankSheetCandidates(formedCanon, watcher).map((c) => c.entryId)).toEqual(["dr_watson", "221b_baker_street", "sherlock_holmes"]);
    const withClassical: AvailableReference[] = [{ kind: "styleReference", styleId: "classical", storageId: "st-classical", version: "r0" }, ...references];
    const ranked = buildRenderingPacket(base("classical", { references: withClassical, plan: { ...base("classical").plan, ...watcher } }));
    expect(ranked.ok && ranked.packet.references.map((r) => r.id)).toEqual(["classical", "dr_watson:main", "221b_baker_street:main"]);
    // An action mention outranks plain plan order.
    expect(rankSheetCandidates(formedCanon, { primarySubject: "a quiet room", action: "Watson hands over a letter" }).map((c) => c.entryId))
      .toEqual(["dr_watson", "221b_baker_street", "sherlock_holmes"]);
    // Holmes has no sheet: his slot passes to Watson instead of going unused.
    const noHolmes = withClassical.filter((r) => !(r.kind === "sheet" && r.entryId === "sherlock_holmes"));
    const passed = buildRenderingPacket(base("classical", { references: noHolmes }));
    expect(passed.ok && passed.packet.references.map((r) => r.id)).toEqual(["classical", "221b_baker_street:main", "dr_watson:main"]);
    // No place sheet either: the third slot goes to the next character rather than staying empty.
    const charactersOnly = selectReferences(formedCanon, noHolmes.filter((r) => r.kind !== "sheet" || r.entryId !== "221b_baker_street"), "classical", null);
    expect(charactersOnly.map((r) => r.kind === "sheet" ? r.entryId : r.styleId)).toEqual(["classical", "dr_watson"]);
    // A relational name answers only to its own leading words: "The men with Saul" never takes Saul's place.
    const companions: SelectedCanon = { entryId: "the_men_with_saul", stageId: "main", kind: "character", name: "The men with Saul", text: "The men with Saul: travel-worn guards.", hasForm: true, version: "m1" };
    const saul: SelectedCanon = { entryId: "saul_of_tarsus", stageId: "main", kind: "character", name: "Saul of Tarsus (Paul)", text: "Saul of Tarsus: a lean young Pharisee.", hasForm: true, version: "s1" };
    const damascus: SelectedCanon = { entryId: "damascus", stageId: "main", kind: "location", name: "Damascus", text: "Damascus: a walled oasis city.", hasForm: true, version: "d1" };
    const road = { primarySubject: "Saul, a traveling man, thrown to the ground", action: "light flashes around him" };
    expect(rankSheetCandidates([companions, saul, damascus], road).map((c) => c.entryId)).toEqual(["saul_of_tarsus", "damascus", "the_men_with_saul"]);
    const roadSheets: AvailableReference[] = [{ kind: "styleReference", styleId: "classical", storageId: "st", version: "r" },
      ...[companions, saul, damascus].map((c) => ({ kind: "sheet" as const, entryId: c.entryId, stageId: "main", storageId: `sh-${c.entryId}`, version: "v" }))];
    expect(selectReferences([companions, saul, damascus], roadSheets, "classical", road).map((r) => r.kind === "sheet" ? r.entryId : r.styleId)).toEqual(["classical", "saul_of_tarsus", "damascus"]);
    // Both parts of a plain two-word name still answer: "Peter" finds "Simon Peter".
    const peter: SelectedCanon = { entryId: "simon_peter", stageId: "main", kind: "character", name: "Simon Peter", text: "Simon Peter: a broad fisherman.", hasForm: true, version: "p1" };
    expect(rankSheetCandidates([companions, peter], { primarySubject: "Peter leaps into the water", action: "" }).map((c) => c.entryId)).toEqual(["simon_peter", "the_men_with_saul"]);
    // A no-form entry never competes for a slot, and objects come after every character and place.
    const ark: SelectedCanon = { entryId: "the_ark", stageId: "main", kind: "object", name: "The ark", text: "The ark: a gilded chest.", hasForm: true, version: "a1" };
    expect(rankSheetCandidates([ark, ...canon], { primarySubject: "the ark", action: "" }).map((c) => c.entryId)).toEqual(["sherlock_holmes", "221b_baker_street", "dr_watson", "the_ark"]);
  });

  it("works with zero references and keeps full canon, and a stage-specific sheet only matches its stage", () => {
    const none = buildRenderingPacket(base("watercolor", { references: [] }));
    expect(none.ok && none.references).toEqual([]);
    expect(none.ok && none.prompt).toContain("- Dr. Watson: sturdy, moustached");
    expect(none.ok && none.prompt).not.toContain("REFERENCE IMAGES");
    const otherStage = selectReferences([{ ...canon[0], stageId: "young" }], references, "classical");
    expect(otherStage).toEqual([]);
    const one = buildRenderingPacket(base("classical", { references: [references[2]] }));
    expect(one.ok && one.references.map((r) => r.caption)).toEqual([expect.stringMatching(/^Image 1: Sherlock Holmes's reference sheet \(one figure shown in three views\)/)]);
  });

  it("removes a style reference only after selection and trimming, without backfilling sheets or restoring context", () => {
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const normal = buildRenderingPacket(base(styleId));
      expect(normal.ok).toBe(true);
      if (!normal.ok) throw new Error("Control packet must fit");
      // Push just over the cap so the control trims the variation note. Removing the reference
      // would free enough room for it, but the trial must keep the same non-reference text.
      const room = GENERIC_PROMPT_MAX_CHARS - normal.prompt.length;
      const input = base(styleId, { canon: formedCanon.map((c, i) => i === 0 ? { ...c, text: c.text + "x".repeat(room + 1) } : c) });
      const control = buildRenderingPacket(input);
      const trial = buildRenderingPacket({ ...input, omitStyleReference: true });
      expect(control.ok && trial.ok).toBe(true);
      if (!control.ok || !trial.ok) throw new Error("Trimmed packets must fit");
      expect(control.packet.flags.variationIncluded).toBe(false);
      expect(trial.packet.flags).toEqual({ ...control.packet.flags, omitStyleReference: true });
      expect(trial.references.map((r) => r.storageId)).toEqual(control.references.filter((r) => r.kind !== "styleReference").map((r) => r.storageId));
      expect(trial.references.map((r) => r.index)).toEqual(trial.references.map((_, i) => i));
      expect(trial.references.every((r, i) => r.caption.startsWith(`Image ${i + 1}:`))).toBe(true);
      expect(trial.packet.references.map((r) => r.caption)).toEqual(trial.references.map((r) => r.caption));
      expect(trial.prompt).not.toContain("Variation note:");
      if (styleId === "classical") expect(trial.prompt).toBe(control.prompt);
      else expect(trial.references).toHaveLength(2); // Watson never fills the removed style slot.
    }
    const onlyStyle = buildRenderingPacket(base("watercolor", { references: references.filter((r) => r.kind === "styleReference"), omitStyleReference: true }));
    expect(onlyStyle.ok && onlyStyle.references).toEqual([]);
    expect(onlyStyle.ok && onlyStyle.prompt).not.toContain("REFERENCE IMAGES");
    const noStyle = buildRenderingPacket(base("watercolor", { references: references.filter((r) => r.kind !== "styleReference") }));
    const noStyleTrial = buildRenderingPacket(base("watercolor", { references: references.filter((r) => r.kind !== "styleReference"), omitStyleReference: true }));
    expect(noStyle.ok && noStyleTrial.ok && noStyleTrial.prompt).toBe(noStyle.ok && noStyle.prompt);
  });

  it("trims variation, neighbors and style detail while preserving owner constraints and rejecting remaining overrun", () => {
    const big = (n: number) => "lorem ".repeat(n);
    const oversized = base("classical", {
      neighbors: { previous: big(400), next: big(400) },
      situation: { place: "Baker Street", timeOfDay: "night", weather: big(80), light: big(80), clothing: big(80) },
      style: { ...SHARED_STYLES.get("classical"), palette: big(300), lighting: big(300), materials: big(300), composition: big(300) },
    });
    const trimmed = buildRenderingPacket(oversized);
    expect(trimmed.ok).toBe(true);
    if (!trimmed.ok) return;
    expect(trimmed.packet.flags).toEqual({ variationIncluded: false, neighborsIncluded: false, styleDetailIncluded: false, lookDetailIncluded: true });
    expect(trimmed.prompt).toContain(`Weather: ${oversized.situation!.weather}`);
    // An overrun smaller than the variation note stops after the first cut.
    const fitting = buildRenderingPacket(base("classical"));
    const room = fitting.ok ? GENERIC_PROMPT_MAX_CHARS - fitting.prompt.length : 0;
    const slight = buildRenderingPacket(base("classical", { canon: formedCanon.map((c, i) => (i === 0 ? { ...c, text: `${c.name}: ${"x".repeat(c.text.length + room + 40)}` } : c)) }));
    expect(slight.ok && slight.packet.flags).toEqual({ variationIncluded: false, neighborsIncluded: true, styleDetailIncluded: true, lookDetailIncluded: true });
    expect(trimmed.prompt.length).toBeLessThanOrEqual(GENERIC_PROMPT_MAX_CHARS);
    // Never-trimmed content survives every cut.
    for (const must of ["PRIORITY RULES:", "SELECTED CHARACTERS: Sherlock Holmes; Dr. Watson\n", selectedRule, "Tone: Brisk", "Depiction: Violence", "Technology: Railways", "OWNER LOOK CONSTRAINTS (binding, verbatim):", "- Sherlock Holmes: lean", "Primary subject: Holmes by the fire",
      `Rendering: ${SHARED_STYLES.get("classical").rendering}`, "Image 1: Sherlock Holmes's reference sheet", "Image 3: Dr. Watson's reference sheet", "Place: Baker Street"]) {
      expect(trimmed.prompt).toContain(must);
    }
    expect(trimmed.prompt).not.toContain("Variation note");
    expect(trimmed.prompt).not.toContain("NARRATIVE CONTINUITY");
    expect(trimmed.prompt).not.toContain("Palette:");

    const impossible = buildRenderingPacket(base("classical", { canon: formedCanon.map((c) => ({ ...c, text: `${c.name}: ${big(600)}` })) }));
    expect(impossible.ok).toBe(false);
    if (impossible.ok) return;
    expect(impossible.error).toMatch(/after every allowed trim/);
    expect(impossible.finalChars).toBeGreaterThan(GENERIC_PROMPT_MAX_CHARS);
  });
});

describe("generic image quote", () => {
  const lite = "google/gemini-3.1-flash-lite-image";
  const billing = normalizeImageBilling(lite, { prompt: "0.00000025", completion: "0.0000015", image_output: "0.00003", image: "0.0003" }, 1);

  it("counts the assembled prompt and each reference image, staying near five credits on Lite", () => {
    const text = quoteGenericImage({ modelId: lite, billing, resolution: "1K", promptChars: 7800, referenceImages: 0 })!;
    const withRefs = quoteGenericImage({ modelId: lite, billing, resolution: "1K", promptChars: 7800, referenceImages: 3 })!;
    expect(text.promptTokens).toBe(1950);
    expect(text.outputTokens).toBe(1120);
    // 1950 × 0.25e-6 + 100 × 1.5e-6 + 1120 × 30e-6 = 0.0342375 USD → 4.28 → 5 credits with the markup.
    expect(text.providerUsd).toBeCloseTo(0.0342375, 7);
    expect(text.credits).toBe(5);
    expect(withRefs.providerUsd).toBeCloseTo(0.0342375 + 3 * 0.0003, 7);
    expect(withRefs.credits).toBe(5);
    expect(withRefs.withinEnvelope).toBe(true);
    expect(quoteGenericImage({ modelId: lite, billing, resolution: "1K", promptChars: 2000, referenceImages: 0 })!.credits).toBeLessThanOrEqual(text.credits);
  });

  it("quotes the live Lite catalog's unified input-token rate when the per-image field is absent", () => {
    const noImagePrice = normalizeImageBilling(lite, { prompt: "0.00000025", completion: "0.0000015", image_output: "0.00003" }, 1);
    const quote = quoteGenericImage({ modelId: lite, billing: noImagePrice, resolution: "1K", promptChars: 7800, referenceImages: 3 });
    // 3 × 1,120 input image tokens at $0.25/M, plus the text and output image.
    expect(quote?.providerUsd).toBeCloseTo(0.0350775, 8);
    expect(quote?.credits).toBe(5);
    expect(noImagePrice?.imageInputTokens).toEqual({ usdPerToken: "0.00000025", perImage: 1120 });
    const oldFamily = "google/gemini-2.5-flash-image";
    const unverifiedInput = normalizeImageBilling(oldFamily, { prompt: "0.0000003", completion: "0.0000025", image_output: "0.00003" }, 1);
    expect(quoteGenericImage({ modelId: oldFamily, billing: unverifiedInput, resolution: "1K", promptChars: 1000, referenceImages: 1 })).toBeNull();
    expect(quoteGenericImage({ modelId: "unknown/model", billing, resolution: "1K", promptChars: 1000, referenceImages: 0 })).toBeNull();
    expect(billing?.imageInputUsd).toBe("0.0003");
  });

  it("refuses invalid reference counts and malformed explicit input-image prices", () => {
    for (const referenceImages of [-1, 1.5, NaN, Infinity]) {
      expect(quoteGenericImage({ modelId: lite, billing, resolution: "1K", promptChars: 1000, referenceImages })).toBeNull();
    }
    const invalid = normalizeImageBilling(lite, { prompt: "0.00000025", completion: "0.0000015", image_output: "0.00003", image: "invalid" }, 1);
    expect(quoteGenericImage({ modelId: lite, billing: invalid, resolution: "1K", promptChars: 1000, referenceImages: 1 })).toBeNull();
  });

  it("quotes recorded two- and three-reference requests at five credits against retained provider usage", () => {
    const captured = normalizeImageBilling(referencePricing.model.id, referencePricing.model.pricing, Date.parse(referencePricing.observedAt));
    for (const sample of referencePricing.samples) {
      const quote = quoteGenericImage({ modelId: referencePricing.model.id, billing: captured, resolution: "1K", promptChars: sample.promptChars, referenceImages: sample.references });
      expect(quote, `${sample.caseId}/${sample.arm}`).toMatchObject({ credits: 5, referenceImages: sample.references, withinEnvelope: true });
      expect(quote!.providerUsd).toBeGreaterThan(sample.actualCostUsd);
      expect(quote!.providerUsd - sample.actualCostUsd).toBeLessThan(0.001);
      // Provider native usage independently reconciles to the captured input/output rates.
      expect(sample.promptTokens * Number(referencePricing.model.pricing.prompt) + sample.outputImageTokens * Number(referencePricing.model.pricing.image_output)).toBeCloseTo(sample.actualCostUsd, 10);
    }
  });
});
