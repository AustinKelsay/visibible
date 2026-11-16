/**
 * The picture rule (spec #434, "Which picture a spread shows"), as the spread, the unpainted glow and Look's style
 * examples read it: the newest picture in the chosen style, otherwise in the next style the reader may see, otherwise
 * nothing. Owner-only styles count only for an admin session, whatever the client asks for.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";

const issuer = "https://guest.example";
beforeEach(() => {
  vi.stubEnv("GUEST_AUTH_ISSUER", issuer);
  vi.stubEnv("CONVEX_SITE_URL", "https://actions.example.com");
});
afterEach(() => vi.unstubAllEnvs());

function setup() {
  const t = convexTest(schema, modules);
  let at = 1_000;
  let n = 0;
  /** Save a picture; "legacy" has no stored style and reads as Classical. */
  const save = async (verseId: string, style: string) => {
    n += 1;
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([n % 256, 2, 3])], { type: "image/png" })));
    const id = await t.mutation(internal.verseImages.saveImageWithStorage, {
      verseId, storageId, model: "m", generationId: `g${n}`,
      ...(style === "legacy" ? {} : { artStyleId: style }),
    });
    const createdAt = at++;
    await t.run(async (ctx) => { await ctx.db.patch(id, { createdAt }); });
    return id;
  };
  const as = async (tier: "admin" | "paid") => {
    const sid = `${tier}-sid`;
    await t.run((ctx) => ctx.db.insert("sessions", { sid, tier, credits: 0, createdAt: Date.now(), lastSeenAt: Date.now() }));
    return t.withIdentity({ subject: sid, issuer, guestExpiresAt: Date.now() / 1000 + 300 });
  };
  return { t, save, as };
}

const PUBLIC_ORDER = ["classical", "watercolor", "fresco", "storybook"];

describe("the spread's picture", () => {
  it("is the newest picture in the chosen style", async () => {
    const { t, save } = setup();
    await save("john-1-1", "watercolor");
    await save("john-1-1", "classical");
    const newest = await save("john-1-1", "watercolor");
    const picture = await t.query(api.verseImages.getSpreadPicture, { verseId: "john-1-1", styles: ["watercolor", "classical"] });
    expect(picture).toMatchObject({ id: newest, artStyle: "watercolor", imageUrl: expect.any(String), thumbnailUrl: null });
  });

  it("falls back to the newest picture in the first other style that has one, in the given order", async () => {
    const { t, save } = setup();
    const storybook = await save("john-1-1", "storybook");
    await save("john-1-1", "fresco");
    const legacy = await save("john-1-1", "legacy");
    expect(await t.query(api.verseImages.getSpreadPicture, { verseId: "john-1-1", styles: ["watercolor", "storybook", "classical", "fresco"] }))
      .toMatchObject({ id: storybook, artStyle: "storybook" });
    // A picture saved before styles existed is Classical.
    expect(await t.query(api.verseImages.getSpreadPicture, { verseId: "john-1-1", styles: ["watercolor", "classical", "fresco"] }))
      .toMatchObject({ id: legacy, artStyle: "classical" });
  });

  it("is nothing when the verse has no picture in any of the styles", async () => {
    const { t, save } = setup();
    await save("john-1-2", "classical");
    await save("john-1-1", "fresco");
    expect(await t.query(api.verseImages.getSpreadPicture, { verseId: "john-1-1", styles: ["classical", "watercolor"] })).toBeNull();
  });

  it("never shows a public reader a picture in an owner-only style, even when asked for one", async () => {
    const { t, save, as } = setup();
    const icon = await save("john-1-1", "icon");
    const classical = await save("john-1-2", "classical");
    await save("john-1-2", "icon");
    const reader = await as("paid");
    expect(await reader.query(api.verseImages.getSpreadPicture, { verseId: "john-1-1", styles: ["icon", ...PUBLIC_ORDER] })).toBeNull();
    expect(await t.query(api.verseImages.getSpreadPicture, { verseId: "john-1-1", styles: ["icon"] })).toBeNull();
    expect(await reader.query(api.verseImages.getSpreadPicture, { verseId: "john-1-2", styles: ["icon", "classical"] }))
      .toMatchObject({ id: classical });

    const admin = await as("admin");
    expect(await admin.query(api.verseImages.getSpreadPicture, { verseId: "john-1-1", styles: ["classical", "icon"] }))
      .toMatchObject({ id: icon, artStyle: "icon" });
  });

  it("refuses styles it cannot read", async () => {
    const { t } = setup();
    await expect(t.query(api.verseImages.getSpreadPicture, { verseId: "john-1-1", styles: [] })).rejects.toThrow(/style/);
    await expect(t.query(api.verseImages.getSpreadPicture, { verseId: "john-1-1", styles: ["Water Colour"] })).rejects.toThrow(/Invalid art style/);
  });
});

describe("the nearest earlier picture (the unpainted glow)", () => {
  it("is the spread picture of the closest earlier verse that has one, by the same rule", async () => {
    const { t, save } = setup();
    await save("john-1-2", "classical");
    const watercolor = await save("john-1-3", "watercolor");
    await save("john-1-4", "icon");
    const glow = await t.query(api.verseImages.getNearestEarlierPicture, { verseId: "john-1-5", styles: ["classical", "watercolor"] });
    expect(glow).toMatchObject({ verseId: "john-1-3", id: watercolor, imageUrl: expect.any(String), thumbnailUrl: null });
    expect(await t.query(api.verseImages.getNearestEarlierPicture, { verseId: "john-1-5", styles: ["classical"] }))
      .toMatchObject({ verseId: "john-1-2" });
  });

  it("follows the moments it is given, nearest first, for a prose work whose ids say nothing of their order", async () => {
    const { t, save } = setup();
    await save("down-the-rabbit-hole-1", "watercolor");
    const nearer = await save("down-the-rabbit-hole-4", "watercolor");
    await save("down-the-rabbit-hole-9", "watercolor");
    const glow = await t.query(api.verseImages.getNearestEarlierPicture, {
      verseId: "down-the-rabbit-hole-9", styles: ["watercolor"], earlier: ["down-the-rabbit-hole-6", "down-the-rabbit-hole-4", "down-the-rabbit-hole-1"],
    });
    expect(glow).toMatchObject({ verseId: "down-the-rabbit-hole-4", id: nearer });
    expect(await t.query(api.verseImages.getNearestEarlierPicture, { verseId: "down-the-rabbit-hole-1", styles: ["watercolor"], earlier: [] })).toBeNull();
    await expect(t.query(api.verseImages.getNearestEarlierPicture, {
      verseId: "x-1", styles: ["watercolor"], earlier: Array.from({ length: 201 }, (_, index) => `x-${index}`),
    })).rejects.toThrow(/200/);
  });

  it("is nothing when only later verses, other chapters or unseen styles are painted", async () => {
    const { t, save } = setup();
    await save("john-1-10", "classical");
    await save("john-11-1", "classical");
    await save("john-1-1", "icon");
    expect(await t.query(api.verseImages.getNearestEarlierPicture, { verseId: "john-1-2", styles: ["icon", "classical"] })).toBeNull();
    expect(await t.query(api.verseImages.getNearestEarlierPicture, { verseId: "not a verse", styles: ["classical"] })).toBeNull();
  });
});

describe("Look's style examples", () => {
  it("shows each style by this verse's picture in it, else the example verse's, else nothing", async () => {
    const { t, save } = setup();
    const here = await save("john-1-1", "watercolor");
    const example = await save("genesis-1-1", "classical");
    await save("genesis-1-1", "watercolor");
    const examples = await t.query(api.verseImages.getStyleExamples, { verseId: "john-1-1", styles: ["classical", "watercolor", "fresco"] });
    expect(examples.map((entry) => entry.style)).toEqual(["classical", "watercolor", "fresco"]);
    expect(examples[0].picture).toMatchObject({ id: example });
    expect(examples[1].picture).toMatchObject({ id: here });
    expect(examples[2].picture).toBeNull();
  });

  it("leaves out owner-only styles for a public reader", async () => {
    const { t, save, as } = setup();
    await save("john-1-1", "icon");
    const reader = await t.query(api.verseImages.getStyleExamples, { verseId: "john-1-1", styles: ["icon", "classical"] });
    expect(reader.map((entry) => entry.style)).toEqual(["classical"]);
    const admin = await (await as("admin")).query(api.verseImages.getStyleExamples, { verseId: "john-1-1", styles: ["icon", "classical"] });
    expect(admin.map((entry) => entry.style)).toEqual(["icon", "classical"]);
  });
});
