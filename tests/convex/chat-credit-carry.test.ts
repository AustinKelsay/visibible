import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { modules } from "./modules";

/** Chat turns are charged their fraction of a credit (#493): the session carries it and only whole credits are taken. */
async function setup(credits = 10) {
  const t = convexTest(schema, modules);
  const now = Date.now();
  await t.run((ctx) => ctx.db.insert("sessions", { sid: "guest", tier: "paid", credits, createdAt: now, lastSeenAt: now }));
  let next = 0;
  const turn = async (actualMicroCredits: number | undefined, hold = 1) => {
    const generationId = `chat-${++next}`;
    await t.mutation(internal.sessions.reserveCreditsInternal, { sid: "guest", amount: hold, modelId: "m", generationId, costUsd: hold * 0.01 });
    return t.mutation(internal.sessions.deductCreditsInternal, {
      sid: "guest", amount: hold, modelId: "m", generationId, costUsd: hold * 0.01, actualAmount: hold,
      ...(actualMicroCredits === undefined ? {} : { actualMicroCredits }), actualCostUsd: 0.001,
    });
  };
  const session = () => t.run((ctx) => ctx.db.query("sessions").unique());
  return { t, turn, session };
}

describe("chat's carried fraction of a credit", () => {
  it("takes a whole credit only when the turns' fractions add up to one, and carries the rest", async () => {
    const { turn, session } = await setup();
    for (let i = 0; i < 2; i++) expect(await turn(375_000)).toMatchObject({ success: true, chargedCredits: 0 });
    expect(await session()).toMatchObject({ credits: 10, chatCreditCarryMicro: 750_000 });
    expect(await turn(375_000)).toMatchObject({ success: true, chargedCredits: 1 });
    expect(await session()).toMatchObject({ credits: 9, chatCreditCarryMicro: 125_000 });
  });

  it("never takes more than the hold, even with a carried fraction and a turn capped at it", async () => {
    const { turn, session } = await setup();
    await turn(900_000);
    expect(await turn(5_000_000)).toMatchObject({ chargedCredits: 1 });
    expect(await session()).toMatchObject({ credits: 9, chatCreditCarryMicro: 900_000 });
  });

  it("charges a two-credit hold's fraction the same way", async () => {
    const { turn, session } = await setup();
    expect(await turn(1_500_000, 2)).toMatchObject({ chargedCredits: 1 });
    expect(await session()).toMatchObject({ credits: 9, chatCreditCarryMicro: 500_000 });
  });

  it("leaves whole-credit charges (images) as they were", async () => {
    const { turn, session } = await setup();
    expect(await turn(undefined)).toMatchObject({ chargedCredits: 1 });
    const after = await session();
    expect(after?.credits).toBe(9);
    expect(after?.chatCreditCarryMicro).toBeUndefined();
  });

  it("changes nothing when a settled turn is settled again", async () => {
    const { t, turn, session } = await setup();
    await turn(600_000);
    const again = await t.mutation(internal.sessions.deductCreditsInternal, {
      sid: "guest", amount: 1, modelId: "m", generationId: "chat-1", actualMicroCredits: 600_000,
    });
    expect(again).toMatchObject({ success: true, alreadyCharged: true });
    expect(await session()).toMatchObject({ credits: 10, chatCreditCarryMicro: 600_000 });
  });
});
