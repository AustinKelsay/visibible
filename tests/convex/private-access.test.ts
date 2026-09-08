import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";
const issuer = "https://guest.example";
beforeEach(() => { vi.stubEnv("GUEST_AUTH_ISSUER", issuer); vi.stubEnv("CONVEX_SERVER_SECRET", "server-only"); });
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    for (const sid of ["owner", "other"]) await ctx.db.insert("sessions", { sid, tier: "paid", credits: 123, createdAt: Date.now(), lastSeenAt: Date.now() });
    await ctx.db.insert("creditLedger", { sid: "owner", delta: 123, reason: "purchase", createdAt: Date.now() });
    await ctx.db.insert("invoices", { sid: "owner", invoiceId: "known-invoice", amountUsd: 1, amountSats: 1000, bolt11: "private-bolt", status: "pending", createdAt: Date.now(), expiresAt: Date.now()+10000 });
  });
  const identity = { subject: "owner", issuer, guestExpiresAt: Date.now()/1000+300 };
  const owner=t.withIdentity(identity), other=t.withIdentity({...identity,subject:"other"});
  const input={sid:"owner",scopeType:"verses" as const,scopeLabel:"Genesis",startVerseId:"genesis-1-1",estimatedTotalCredits:1,modelId:"test",aspectRatio:"16:9",resolution:"1K",translation:"web",verses:[{verseId:"genesis-1-1",reference:"Genesis 1:1",order:0}]};
  const {bulkId}=await owner.mutation(api.bulkGenerations.create,input);
  return {t,owner,other,identity,bulkId,input};
}
describe("private Convex ownership",()=>{
  it("reads only the authenticated owner's balances, invoices and history",async()=>{
    const {t,owner,other}=await setup();
    expect((await owner.query(api.sessions.getSession,{sid:"owner"}))?.credits).toBe(123);
    expect(await owner.query(api.sessions.getCreditHistory,{sid:"owner"})).toHaveLength(1);
    expect((await owner.query(api.invoices.getInvoice,{invoiceId:"known-invoice"}))?.bolt11).toBe("private-bolt");
    for(const client of [t,other]){
      expect(await client.query(api.sessions.getSession,{sid:"owner"})).toBeNull();
      expect(await client.query(api.sessions.getCreditHistory,{sid:"owner"})).toEqual([]);
      expect(await client.query(api.invoices.getSessionInvoices,{sid:"owner"})).toEqual([]);
      expect(await client.query(api.invoices.getInvoice,{invoiceId:"known-invoice"})).toBeNull();
    }
  });
  it("checks every bulk control even with known owner and job identifiers",async()=>{
    const {t,other,bulkId,input}=await setup();
    for(const client of [t,other]){
      expect(await client.query(api.bulkGenerations.getActive,{sid:"owner"})).toBeNull();
      expect(await client.query(api.bulkGenerations.get,{id:bulkId,sid:"owner"})).toBeNull();
      expect(await client.query(api.bulkGenerations.getVerses,{bulkGenerationId:bulkId,sid:"owner"})).toEqual([]);
      const calls=[
        ()=>client.mutation(api.bulkGenerations.create,input),
        ()=>client.mutation(api.bulkGenerations.pause,{id:bulkId,sid:"owner"}),
        ()=>client.mutation(api.bulkGenerations.resume,{id:bulkId,sid:"owner"}),
        ()=>client.mutation(api.bulkGenerations.cancel,{id:bulkId,sid:"owner"}),
        ()=>client.mutation(api.bulkGenerations.updateProgress,{id:bulkId,sid:"owner",completedCount:1,failedCount:0,skippedCount:0,totalCreditsUsed:1}),
        ()=>client.mutation(api.bulkGenerations.updateVerseStatus,{bulkGenerationId:bulkId,sid:"owner",verseId:"genesis-1-1",status:"completed"}),
      ];
      for(const call of calls) await expect(call()).rejects.toThrow("Unauthorized");
    }
  });
  it("rejects an authenticated guest selecting another guest's job with their own SID", async () => {
    const {other,bulkId}=await setup();
    expect(await other.query(api.bulkGenerations.get,{sid:"other",id:bulkId})).toBeNull();
    expect(await other.query(api.bulkGenerations.getVerses,{sid:"other",bulkGenerationId:bulkId})).toEqual([]);
    await expect(other.mutation(api.bulkGenerations.pause,{sid:"other",id:bulkId})).rejects.toThrow("Unauthorized");
  });
  it("keeps free library queries available without private identity",async()=>{
    const {t}=await setup();
    expect(await t.query(api.verseImages.getImageHistory,{verseId:"genesis-1-1"})).toEqual([]);
    expect(await t.query(api.verseImages.getLatestImage,{verseId:"genesis-1-1"})).toBeNull();
    expect(await t.query(api.modelStats.getModelStats,{modelId:"test"})).toMatchObject({count:0});
  });
});

describe("private access expiry and trusted reads", () => {
  it("rejects expired and revoked credentials for existing records and controls", async () => {
    const {t, owner, identity, bulkId}=await setup();
    const expired=t.withIdentity({...identity,guestExpiresAt:1});
    expect(await expired.query(api.sessions.getSession,{sid:"owner"})).toBeNull();
    await expect(expired.mutation(api.bulkGenerations.pause,{id:bulkId,sid:"owner"})).rejects.toThrow("Unauthorized");
    await t.run(async ctx=>{
      const session=await ctx.db.query("sessions").withIndex("by_sid",q=>q.eq("sid","owner")).unique();
      await ctx.db.patch(session!._id,{revokedAt:Date.now()});
    });
    expect(await owner.query(api.invoices.getInvoice,{invoiceId:"known-invoice"})).toBeNull();
    expect(await owner.query(api.bulkGenerations.getActive,{sid:"owner"})).toBeNull();
    await expect(owner.mutation(api.bulkGenerations.cancel,{id:bulkId,sid:"owner"})).rejects.toThrow("Unauthorized");
    expect(await t.query(api.invoices.getInvoice,{invoiceId:"known-invoice",ownerSid:"owner",serverSecret:"server-only"})).toBeNull();
  });
  it("keeps authenticated server reads separate from guest credentials", async () => {
    const {t}=await setup();
    expect((await t.query(api.sessions.getSession,{sid:"owner",serverSecret:"server-only"}))?.credits).toBe(123);
    expect((await t.query(api.invoices.getInvoice,{invoiceId:"known-invoice",ownerSid:"owner",serverSecret:"server-only"}))?.invoiceId).toBe("known-invoice");
    for(const call of [
      ()=>t.query(api.sessions.getSession,{sid:"owner",serverSecret:"wrong"}),
      ()=>t.query(api.invoices.getInvoice,{invoiceId:"known-invoice",serverSecret:"wrong"}),
      ()=>t.query(api.rateLimit.getRateLimitStatus,{identifier:"owner",endpoint:"chat",serverSecret:"wrong"}),
      ()=>t.query(api.rateLimit.checkAdminLoginAllowed,{ipHash:"known-ip",serverSecret:"wrong"}),
    ]) await expect(call()).rejects.toThrow("Unauthorized");
  });
  it("keeps generation progress private to its authenticated owner",async()=>{
    const {t,owner,other}=await setup();
    await t.mutation(api.verseImages.createGenerationRequest,{
      requestId:"known-request",sid:"owner",verseId:"genesis-1-1",generationId:"generation",inputFingerprint:"input",
      executorVersion:"next-image-v1",billingPolicyVersion:"legacy-image-v1",serverSecret:"server-only",
    });
    expect(await owner.query(api.verseImages.getGenerationRequestStatus,{requestId:"known-request"})).toMatchObject({status:"queued"});
    for(const client of [t,other]) expect(await client.query(api.verseImages.getGenerationRequestStatus,{requestId:"known-request"})).toBeNull();
  });
});
