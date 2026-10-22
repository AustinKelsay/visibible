/** Read-only production evidence collector. Never calls a model or mutates production. Retained phases already exist; writes use wx. */
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {parseEnv} from 'node:util';import {createHash} from 'node:crypto';
import {ConvexHttpClient} from 'convex/browser';
import {api} from '../../../convex/_generated/api.js';
import {readWorkInputs,momentContext} from '../../../src/lib/engine/work-inputs';
import {prepareMoment,PreparationUnavailableError,type PreparedMoment,type AnalysisRecord,type PreparationStore} from '../../../src/lib/engine/preparation';
import {responseSchema} from '../../../src/lib/reading-pass/prompts';
import {estimateRequestCostUsd} from '../../../src/lib/reading-pass/model';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..');
const phase=process.argv[2];assert.ok(['preflight','continuation-preflight','after-cold','after-cold-saved','after-prepared','after-replay','final'].includes(phase));
const plan=JSON.parse(fs.readFileSync(path.join(dir,'plan.json'),'utf8'));
const e=parseEnv(fs.readFileSync(process.env.VISIBIBLE_OWNER_ENV_FILE!,'utf8'));assert.equal(e.NEXT_PUBLIC_CONVEX_URL,'https://api.visibible.com');
const c=new ConvexHttpClient(e.NEXT_PUBLIC_CONVEX_URL!),o=JSON.parse(fs.readFileSync(process.env.VISIBIBLE_OWNER_SESSION_FILE!,'utf8'));assert.equal(createHash('sha256').update(o.sid).digest('hex'),plan.production.sessionDigest);
const s=await c.query(api.sessions.getSession,{sid:o.sid,serverSecret:e.CONVEX_SERVER_SECRET!});assert.ok(s&&s.tier!=='admin');
const rows=[],inputs=await readWorkInputs('bible-web',root);let forbiddenCalls=0;
for(const item of plan.cold){
 const coldAudit=phase==='preflight'||(phase==='continuation-preflight'&&item.unitId!=='exodus-16-15');
 const records:Array<{kind:Parameters<PreparationStore["getActiveRecord"]>[0];recordId:string;record:AnalysisRecord|null}>=[];const get:PreparationStore["getActiveRecord"]=async(kind,id)=>{const r=records.find(r=>r.kind===kind&&r.recordId===id);if(r)return r.record;const record=await c.query(api.analysis.getActiveRecord,{workId:'bible-web',kind,recordId:id});records.push({kind,recordId:id,record});return record;};
 const moment=await get('moment',item.unitId);assert.ok(moment);const section=await get('section',String(moment.payload.sectionId));assert.ok(section);
 const context=momentContext(inputs.work,{id:moment.recordId,firstUnit:String(moment.payload.firstUnit),lastUnit:String(moment.payload.lastUnit)},{firstUnit:String(section.payload.firstUnit),lastUnit:String(section.payload.lastUnit)});
 const look=await get('look',section.recordId),scene=await get('plan',moment.recordId);if(coldAudit){assert.equal(look,null);assert.equal(scene,null);}
 let request:Parameters<typeof estimateRequestCostUsd>[0]|null=null;const forbidden=async()=>{throw Error('Read-only audit forbids mutations');};
 const store:PreparationStore={getActiveRecord:get,putDerivedRecord:forbidden,claim:async()=>{if(!coldAudit)throw Error('Prepared sample attempted a claim');return {held:true};},release:async()=>{},recordSpend:async()=>{}};
 let prepared:PreparedMoment|null=null,captures=0;
 try{prepared=await prepareMoment({workId:'bible-web',momentId:moment.recordId,store,brief:inputs.brief,briefVersion:inputs.briefVersion,context,model:{id:'read-only-audit',complete:async(r)=>{forbiddenCalls++;captures++;const p={system:r.system,user:r.user,schemaName:r.schemaName,schema:responseSchema(r.schema),maxTokens:r.maxTokens,expectedCompletionTokens:r.expectedCompletionTokens};if(request)assert.deepEqual(request,p);else request=p;throw Error('dry-capture');}}});assert.equal(coldAudit,false);assert.equal(prepared.calls,0);}catch(err){if(!coldAudit)throw err;assert.ok(err instanceof PreparationUnavailableError&&err.message.endsWith('dry-capture'));assert.equal(captures,2);}
 rows.push({...item,context,records,prepared,request,estimatedPreparationRequestUsd:request?estimateRequestCostUsd(request):null,paidCalls:0,productionMutations:0});
}
const status=await c.query(api.analysis.getWorkStatus,{workId:'bible-web'});assert.ok(status.ready&&status.workVersion===inputs.workVersion&&status.briefVersion===inputs.briefVersion);
const history=await c.query(api.sessions.getCreditHistory,{sid:o.sid,serverSecret:e.CONVEX_SERVER_SECRET!,limit:200});
const spend=await c.query(api.analysis.getPreparationSpend,{workId:'bible-web'});
const imageRowsFile=process.env.VISIBIBLE_OWNER_BROWSER_STATE_FILE??path.join(dir,'browser-prepared.json');const images=[];
if(fs.existsSync(imageRowsFile)){const browser: {rows:Array<{replay?:boolean;request:{requestId:string;reference:string;style:string};response?:{savedImageId?:string}}>}=JSON.parse(fs.readFileSync(imageRowsFile,'utf8'));for(const r of browser.rows.filter((r)=>!r.replay&&r.response?.savedImageId)){const saved=await c.query(api.verseImages.getImageProvenance,{serverSecret:e.CONVEX_SERVER_SECRET!,imageId:r.response!.savedImageId!});assert.ok(saved&&saved.engine==='generic'&&saved.translationId==='web');const matching: {context:{moment:{reference:string;text:string}}}|undefined=rows.find(x=>x.context.moment.reference===r.request.reference);assert.ok(matching);assert.equal(saved.verseText,matching.context.moment.text);assert.equal(saved.requestTranslationId,'kjv');assert.equal(saved.artStyle,r.request.style);images.push({requestId:r.request.requestId,saved});}}
const result={at:new Date().toISOString(),phase,commit:plan.baseCommit,status,session:{sidSha256:plan.production.sessionDigest,tier:s.tier,credits:s.credits},history,spend,rows,images,paidCalls:0,productionMutations:0,forbiddenModelInvocations:forbiddenCalls};
fs.writeFileSync(path.join(dir,`${phase}.json`),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({phase,rows:rows.length,images:images.length,credits:s.credits,history:history.length,spend,cacheOnly:phase!=='preflight'}));
