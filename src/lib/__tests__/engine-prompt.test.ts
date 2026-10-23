/**
 * The generic rendering packet and reference-aware quote (#173): every style, cast/stage and
 * reference assignment, zero to three references, never-trimmed content under adversarial sizes,
 * precedence, and quote counts from controlled catalog data.
 */
import { describe, it, expect } from "vitest";
import { buildRenderingPacket, selectReferences, GENERIC_PROMPT_MAX_CHARS, type RenderingInput, type SelectedCanon, type AvailableReference } from "../engine/prompt";
import { quoteGenericImage } from "../engine/quote";
import { SHARED_STYLES, type WorkBrief } from "../work-preparation";
import { normalizeImageBilling } from "../image-catalog";
import referencePricing from "../../../tests/fixtures/lite-reference-pricing.json";

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
const base = (styleId: string, extra: Partial<RenderingInput> = {}): RenderingInput => ({
  work: { id: "holmes-adventures", title: "The Adventures of Sherlock Holmes" },
  moment: { id: "a-scandal-in-bohemia-1-1", sectionId: "a-scandal-in-bohemia-1-1", reference: "A Scandal in Bohemia, Part 1 ¶1", text: "To Sherlock Holmes she is always the woman." },
  neighbors: { previous: null, next: "I had seen little of Holmes lately." },
  brief, briefVersion: "bv1", eraId: "victorian", style: SHARED_STYLES.get(styleId), styleVersion: `${styleId}-v1`,
  look: { version: "l1", place: "Baker Street sitting-room", timeOfDay: "night", weather: "fog outside", light: "gaslight and firelight", clothing: "dressing-gown and frock-coat" },
  plan: { version: "p1", primarySubject: "Holmes by the fire", action: "gazes at the fire, pipe in hand", setting: "the sitting-room", secondaryElements: "Watson in the doorway", mood: "pensive", timeOfDay: "night", composition: "medium shot" },
  canon, references, variationNumber: 2, aspectRatio: "16:9", ...extra,
});

describe("rendering packet", () => {
  it("combines rules, brief, canon, look, plan, style and captions for every style with the agreed reference order", () => {
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const result = buildRenderingPacket(base(styleId));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.prompt.startsWith("PRIORITY RULES:")).toBe(true);
      expect(result.prompt).toContain("No likeness of any real actor");
      expect(result.prompt).toContain("follow them in this order: these rules, then the work brief, then the art style's rendering, then the section look, then the scene plan");
      expect(result.prompt).toContain("Tone: Brisk, foggy Victorian detective mood.");
      expect(result.prompt).toContain("Depiction: Violence is kept offstage");
      expect(result.prompt.includes("fog becomes a flat grey ground")).toBe(styleId === "icon");
      expect(result.prompt).toContain("- Sherlock Holmes: lean, hawk-nosed");
      expect(result.prompt).toContain("- The voice: never a face or body");
      expect(result.prompt).toContain("Only Sherlock Holmes, 221B Baker Street, Dr. Watson have this canon look");
      expect(result.prompt).toContain("Primary subject: Holmes by the fire");
      expect(result.prompt).toContain(`ART STYLE: ${SHARED_STYLES.get(styleId).label}\nRendering: ${SHARED_STYLES.get(styleId).rendering}`);
      expect(result.prompt).toContain("Place: Baker Street sitting-room");
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
      expect(result.packet).toMatchObject({ promptVersion: "2026-10-23-generic-v6", styleId, briefVersion: "bv1", lookVersion: "l1", planVersion: "p1",
        canon: [{ entryId: "sherlock_holmes", stageId: "main", version: "h1" }, expect.anything(), expect.anything(), expect.anything()],
        flags: { variationIncluded: true, neighborsIncluded: true, styleDetailIncluded: true, lookDetailIncluded: true } });
      expect(result.packet.budget.finalChars).toBe(result.prompt.length);
    }
  });

  it.each([
    ["formed character", [canon[0]], "Sherlock Holmes"],
    ["no-form subject", [canon[3]], "the voice"],
    ["location only", [canon[1]], "(none with fixed canon; show only figures the scene plan describes, or none)"],
    ["empty cast", [], "(none with fixed canon; show only figures the scene plan describes, or none)"],
    ["group", [{ ...canon[0], name: "Court attendants" }], "Court attendants"],
  ] as const)("names only selected characters for %s without rewriting shared context", (_label, selected, expected) => {
    const input = base("classical", { canon: [...selected] });
    const result = buildRenderingPacket(input);
    if (!result.ok) throw new Error(result.error);
    expect(result.prompt).toContain(`SELECTED CHARACTERS: ${expected}\n`);
    expect(result.prompt).toContain(input.look.clothing);
    expect(result.prompt).toContain("The shared look, source narrators and neighbors do not add figures");
    expect(result.packet.canon.map((entry) => entry.entryId)).toEqual(selected.map((entry) => entry.entryId));
  });

  it("keeps the no-form selection rule above shared-look effects, even when look details are trimmed", () => {
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const input = base(styleId, { canon: [canon[0]], references: [], neighbors: undefined, variationNumber: null });
      input.look.light = "veiled radiance representing the voice";
      const full = buildRenderingPacket(input);
      if (!full.ok) throw new Error(full.error);
      expect(full.prompt).toContain(input.look.light);
      const rule = "Omit such effects from the shared look when that subject is unselected or absent from the plan";
      expect(full.prompt).toContain(rule);
      expect(full.prompt).toContain("Ordinary sunlight, lamplight, embers and weather remain setting details.");
      expect(full.prompt.indexOf(rule)).toBeLessThan(full.prompt.indexOf("SECTION LOOK"));
      expect(full.prompt).not.toContain("FORMLESS SUBJECTS");
      input.look.light = "radiance ".repeat(1800);
      const trimmed = buildRenderingPacket(input);
      if (!trimmed.ok) throw new Error(trimmed.error);
      expect(trimmed.packet.flags.lookDetailIncluded).toBe(false);
      expect(trimmed.prompt).toContain(rule);
    }
  });

  it("makes no-form constraints explicit across styles without erasing source text or other characters' forms", () => {
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const input = base(styleId);
      input.moment.text = "The voice sat beside Holmes, clothed in light.";
      const result = buildRenderingPacket(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.prompt).toContain(input.moment.text);
      expect(result.prompt).toContain("- The voice: never a face or body; light only.");
      expect(result.prompt).toContain("FORMLESS SUBJECTS (binding depiction constraints, including when the source uses bodily metaphors)");
      expect(result.prompt).toContain("- the voice: represent only through the non-figurative presence");
      expect(result.prompt).toContain("No head, face, torso, limbs, hands, human silhouette or garment-shaped body, even faceless or made of light");
      expect(result.prompt).toContain("Do not represent this subject as a figure occupying a seat.");
      expect(result.prompt).toContain("other characters retain their own canon forms");
      expect(result.prompt).not.toContain("- Sherlock Holmes: represent only through");
      expect(result.prompt.indexOf("FORMLESS SUBJECTS")).toBeLessThan(result.prompt.indexOf("CANON ("));
      expect(result.references.some((r) => r.kind === "sheet" && r.entryId === "the_voice")).toBe(false);
    }
    const formed = buildRenderingPacket(base("classical", { canon: canon.filter((c) => c.hasForm) }));
    expect(formed.ok && formed.prompt).not.toContain("FORMLESS SUBJECTS");
    const onlyFormless = buildRenderingPacket(base("classical", { canon: canon.filter((c) => !c.hasForm) }));
    expect(onlyFormless.ok && onlyFormless.prompt).toContain("- the voice: represent only through");
    expect(onlyFormless.ok && onlyFormless.prompt).not.toContain("this canon look");
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
      const input = base(styleId, { canon: canon.map((c, i) => i === 0 ? { ...c, text: c.text + "x".repeat(room + 1) } : c) });
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

  it("trims only the variation note, neighbour hints, style detail and look detail, in that order, and rejects what still does not fit", () => {
    const big = (n: number) => "lorem ".repeat(n);
    const oversized = base("classical", {
      neighbors: { previous: big(400), next: big(400) },
      look: { version: "l1", place: "Baker Street", timeOfDay: "night", weather: big(300), light: big(300), clothing: big(300) },
      style: { ...SHARED_STYLES.get("classical"), palette: big(300), lighting: big(300), materials: big(300), composition: big(300) },
    });
    const trimmed = buildRenderingPacket(oversized);
    expect(trimmed.ok).toBe(true);
    if (!trimmed.ok) return;
    expect(trimmed.packet.flags).toEqual({ variationIncluded: false, neighborsIncluded: false, styleDetailIncluded: false, lookDetailIncluded: false });
    expect(trimmed.prompt).not.toContain("Weather:");
    // An overrun smaller than the variation note stops after the first cut.
    const fitting = buildRenderingPacket(base("classical"));
    const room = fitting.ok ? GENERIC_PROMPT_MAX_CHARS - fitting.prompt.length : 0;
    const slight = buildRenderingPacket(base("classical", { canon: canon.map((c, i) => (i === 0 ? { ...c, text: `${c.name}: ${"x".repeat(c.text.length + room + 40)}` } : c)) }));
    expect(slight.ok && slight.packet.flags).toEqual({ variationIncluded: false, neighborsIncluded: true, styleDetailIncluded: true, lookDetailIncluded: true });
    expect(trimmed.prompt.length).toBeLessThanOrEqual(GENERIC_PROMPT_MAX_CHARS);
    // Never-trimmed content survives every cut.
    for (const must of ["PRIORITY RULES:", "SELECTED CHARACTERS: Sherlock Holmes; Dr. Watson; the voice", "apply shared clothing only to selected characters", "Tone: Brisk", "Depiction: Violence", "Technology: Railways", "FORMLESS SUBJECTS", "- the voice: represent only through", "even faceless or made of light", "- Sherlock Holmes: lean", "Primary subject: Holmes by the fire",
      `Rendering: ${SHARED_STYLES.get("classical").rendering}`, "Image 1: Sherlock Holmes's reference sheet", "Image 3: Dr. Watson's reference sheet", "Place: Baker Street"]) {
      expect(trimmed.prompt).toContain(must);
    }
    expect(trimmed.prompt).not.toContain("Variation note");
    expect(trimmed.prompt).not.toContain("NARRATIVE CONTINUITY");
    expect(trimmed.prompt).not.toContain("Palette:");

    const impossible = buildRenderingPacket(base("classical", { canon: canon.map((c) => ({ ...c, text: `${c.name}: ${big(400)}` })) }));
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
