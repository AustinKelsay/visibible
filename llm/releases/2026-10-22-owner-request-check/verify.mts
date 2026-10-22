/** Offline audit: retained HTTP replies, snapshots, ledger, cache dependencies and caps. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,"../../..");
const json=(name:string)=>JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"));
const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
// No fetch, credentials, providers or live mutations may escape this audit.
let networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw Error("Offline audit forbids network");};
const manifest=json("sha256.json");for(const [file,digest] of Object.entries(manifest))assert.equal(hash(fs.readFileSync(path.join(root,file))),digest,file);
const plan=json("plan.json"),continuation=json("continuation-plan.json"),before=json("preflight.json"),cold=json("after-cold.json"),after=json("after-prepared.json"),replayed=json("after-replay.json");
const browser=json("browser-prepared.json"),coldBrowser=json("browser-cold.json"),automatic=json("unexpected-navigation.json"),metrics=json("measurements.json");
const inputs=await readWorkInputs("bible-web",root);
for(const snapshot of [before,cold,after,replayed]){
 assert.ok(snapshot.status.ready&&snapshot.status.activeGeneration===1);
 assert.equal(snapshot.status.workVersion,inputs.workVersion);assert.equal(snapshot.status.briefVersion,inputs.briefVersion);
 assert.notEqual(snapshot.session.tier,"admin");assert.equal(snapshot.session.sidSha256,plan.production.sessionDigest);
}
assert.equal(before.session.credits,90);assert.equal(after.session.credits,0);assert.equal(after.history.length-before.history.length,54);
assert.deepEqual(after.history,replayed.history);assert.deepEqual(after.spend,replayed.spend);assert.equal(replayed.session.credits,0);
assert.equal(browser.rows.length,17);assert.equal(browser.running,false);assert.equal(browser.blocked,null);
assert.deepEqual(coldBrowser.rows,browser.rows.slice(0,8));
// The historical guard was not concurrency-safe; independently prove this recorded batch was sequential.
for(let i=1;i<browser.rows.length;i++)assert.ok(Date.parse(browser.rows[i].at)>=Date.parse(browser.rows[i-1].at)+browser.rows[i-1].elapsedMs,"Measured requests overlapped");
assert.equal(continuation.continuation.newColdRequests,8);assert.equal(continuation.continuation.newPreparedRequests,9);
assert.equal(automatic.fullRequestElapsedMs,null);assert.equal(automatic.latencySampleEligible,false);assert.equal(automatic.providerQuery.status,200);
assert.equal(automatic.saved.requestTranslationId,"web");assert.equal(automatic.saved.translationId,"web");assert.equal(automatic.saved.promptVersion,"2026-10-22-generic-v4");
assert.equal(automatic.providerQuery.data.id,automatic.latest.providerRequestId);assert.equal(automatic.providerQuery.data.total_cost,.034319);
assert.equal(after.spend.calls-before.spend.calls,18);assert.equal(cold.spend.calls,after.spend.calls);close(cold.spend.costUsd,after.spend.costUsd);
assert.equal(before.rows.length,9);assert.equal(cold.rows.length,9);
let modelCalls=0;const forbidden=async():Promise<never>=>{throw Error("Offline audit forbids preparation writes");};
for(const initial of before.rows){
 const unit=initial.unitId;const later=cold.rows.find((r:{unitId:string})=>r.unitId===unit),final=after.rows.find((r:{unitId:string})=>r.unitId===unit);
 assert.deepEqual(later.records,final.records);assert.deepEqual(later.prepared,final.prepared);assert.equal(later.prepared.calls,0);
 for(const row of initial.records){if(row.kind==="look"||row.kind==="plan")assert.equal(row.record,null);else assert.deepEqual(final.records.find((r:{kind:string;recordId:string})=>r.kind===row.kind&&r.recordId===row.recordId)?.record,row.record);}
 const records=final.records as Array<{kind:string;recordId:string;record:AnalysisRecord|null}>;
 for(const row of records.filter(r=>r.record&&(r.kind==="look"||r.kind==="plan")))assert.equal(row.record!.version,contentVersion(row.record!.payload));
 const store:PreparationStore={getActiveRecord:async(kind,id)=>structuredClone(records.find(r=>r.kind===kind&&r.recordId===id)?.record??null),claim:forbidden,release:forbidden,putDerivedRecord:forbidden,recordSpend:forbidden};
 const result=await prepareMoment({workId:"bible-web",momentId:unit,store,brief:inputs.brief,briefVersion:inputs.briefVersion,context:final.context,model:{id:"forbidden",complete:async()=>{modelCalls++;throw Error("Cached sample called a model");}}});
 assert.deepEqual(result,final.prepared);
}
const ids=new Set<string>();let imageUsd=automatic.providerQuery.data.total_cost;
const newHistory=after.history.slice(0,54);
for(const row of browser.rows){
 assert.equal(row.status,200);assert.equal(row.replay,false);assert.ok(row.elapsedMs>0);assert.equal(row.request.translation,"kjv");assert.equal(row.request.resolution,"1K");
 assert.equal(row.response.engine,"generic");assert.equal(row.response.translationId,"web");assert.equal(row.response.requestTranslationId,"kjv");assert.equal(row.response.creditsCost,5);assert.equal(row.response.estimatedCreditsCost,5);assert.equal(row.response.promptVersion,"2026-10-22-generic-v4");
 assert.equal(row.response.usedActualCost,true);assert.ok(row.response.openRouterUsageUsd>0);imageUsd+=row.response.openRouterUsageUsd;assert.ok(!ids.has(row.response.savedImageId));ids.add(row.response.savedImageId);
 const saved=after.images.find((r:{requestId:string})=>r.requestId===row.request.requestId)?.saved;assert.ok(saved);assert.equal(saved.id,row.response.savedImageId);
 const prep=after.rows.find((r:{context:{moment:{reference:string}}})=>r.context.moment.reference===row.request.reference);assert.ok(prep);
 assert.equal(saved.verseText,prep.context.moment.text);assert.equal(saved.translationId,"web");assert.equal(saved.requestTranslationId,"kjv");assert.equal(saved.artStyle,row.request.style);assert.equal(saved.engine,"generic");
 assert.equal(saved.provenance.lookVersion,prep.prepared.look.version);assert.equal(saved.provenance.planVersion,prep.prepared.plan.version);assert.equal(saved.provenance.analysisGeneration,1);
 const entries=newHistory.filter((e:{generationId?:string})=>e.generationId===row.response.generationId);assert.equal(entries.length,3);assert.equal(entries.filter((e:{reason:string})=>e.reason==="generation").length,1);assert.equal(entries.reduce((s:number,e:{delta:number})=>s+e.delta,0),-5);
 const reserve=entries.find((e:{reason:string})=>e.reason==="reservation");assert.ok(reserve.delta===-10||reserve.delta===-5);
}
assert.equal(ids.size,17);assert.ok(!ids.has(automatic.saved.id));
for(const entry of automatic.history.slice(0,3))assert.ok(newHistory.some((e:{generationId:string;reason:string;delta:number})=>e.generationId===entry.generationId&&e.reason===entry.reason&&e.delta===entry.delta));
assert.equal(newHistory.filter((e:{reason:string})=>e.reason==="generation").length,18);assert.equal(newHistory.reduce((s:number,e:{delta:number})=>s+e.delta,0),-90);
assert.equal(newHistory.filter((e:{reason:string;delta:number})=>e.reason==="reservation"&&e.delta===-5).length,1);
const replay=json("replay-disabled.json");assert.equal(replay.status,200);assert.equal(replay.replay,true);assert.equal(replay.response.reused,true);assert.equal(replay.response.engine,"generic");assert.equal(replay.response.savedImageId,browser.rows[0].response.savedImageId);assert.deepEqual(replay.request,browser.rows[0].request);
for(const [cohort,target] of [["cold-browser-http",20000],["prepared-browser-http",10000]] as const){const rows=browser.rows.filter((r:{cohort:string})=>r.cohort===cohort),ms=rows.map((r:{elapsedMs:number})=>r.elapsedMs).sort((a:number,b:number)=>a-b);const actual=metrics.latency[cohort];assert.equal(rows.length,cohort.startsWith("cold")?8:9);close(actual.meanMs,ms.reduce((s:number,n:number)=>s+n,0)/ms.length);assert.equal(actual.p90Ms,ms[Math.ceil(.9*ms.length)-1]);assert.ok(actual.p90Ms<=target);}
close(metrics.operationImageUsageUsd,imageUsd);close(metrics.operationPreparationUsageUsd,after.spend.costUsd-before.spend.costUsd);
assert.ok(imageUsd<=plan.smoke.operationCapUsd);assert.ok(imageUsd+plan.smoke.measuredBeforeUsd<=plan.smoke.authorizedUsd);
close(metrics.smoke.measuredUsd,imageUsd+plan.smoke.measuredBeforeUsd);close(metrics.preparation.measuredUsd,plan.preparation.measuredBeforeUsd+metrics.operationPreparationUsageUsd);
assert.equal(metrics.evaluation.measuredUsd,16.2980069);assert.equal(metrics.evaluation.remainingAfterReserveUsd,.1569931);
const balance=json("balance-final.json");close(balance.beforeUsd-balance.afterUsd,imageUsd+metrics.operationPreparationUsageUsd);
const final=json("disabled-final.json");assert.equal(final.mode,"disabled");assert.equal(final.ownerSessionConfigured,false);assert.equal(final.deployment.id,"dpl_4FE7JeXKq853nCxsrN2NYZYFdYjj");assert.ok(final.publicCatalog.artStyles.every((s:{id:string;available:boolean})=>s.id==="classical"||!s.available));
const publicProof=json("public-saved-after-rollback.json");assert.equal(publicProof.rows.length,3);for(const r of publicProof.rows){assert.equal(r.status,200);assert.ok(ids.has(r.data.image.id));assert.equal(r.data.image.translationId,"web");}
const ui=json("reader-kjv.json");assert.ok(ui.translationButton.includes("King James Version"));assert.ok(ui.body.includes("It is manna: for they wist not what it was."));assert.ok(ui.body.includes("2 / 2"));assert.ok(json("reader-disabled-styles.json").list.includes("Temporarily unavailable for generation"));
const images=json("image-hashes.json");assert.equal(images.records.length,18);assert.equal(images.paidCalls,0);
let nativeImagesVerified=0;for(const image of images.records){const file=path.join(root,image.nativePath);if(fs.existsSync(file)){assert.equal(hash(fs.readFileSync(file)),image.sha256);nativeImagesVerified++;}}
const dry=json("current-matrix-dry-run.json");assert.equal(dry.entries.length,324);assert.ok(dry.entries.every((e:{status:string})=>e.status==="planned"));
const sources=json("application-sources.json");for(const [file,digest] of Object.entries(sources)){assert.equal(hash(fs.readFileSync(path.join(root,file))),digest);assert.equal(hash(execFileSync("git",["show",`${plan.baseCommit}:${file}`],{cwd:root,maxBuffer:16*1024*1024})),digest);}
assert.equal(metrics.humanAccepted,false);assert.equal(metrics.publicActivation,false);assert.equal(networkCalls,0);assert.equal(modelCalls,0);
console.log(JSON.stringify({images:18,timedCold:8,timedPrepared:9,cachedMomentsReplayed:9,ledgerEntries:54,replayChargedAgain:false,imageUsd,preparationUsd:metrics.operationPreparationUsageUsd,publicActivation:false,nativeImagesVerified,networkCalls,modelCalls}));
