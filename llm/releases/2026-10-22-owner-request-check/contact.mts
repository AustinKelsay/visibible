/** Read-only image download/contact sheets; no provider generation. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import sharp, { type OverlayOptions } from "sharp";
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,"../../..");
const json=(f:string)=>JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
const native=path.join(root,"evals/images/runs/release-2026-10-22-owner-smoke/outputs");fs.mkdirSync(native,{recursive:true});
const data=json("after-prepared.json"),browser=json("browser-prepared.json"),unexpected=json("unexpected-navigation.json");
const cold=json("plan.json").cold as Array<{unitId:string;styleId:string}>;
const all=[{saved:unexpected.saved,cohort:"untimed auto"},...data.images.map((i:{requestId:string;saved:{id:string;verseId:string;imageUrl:string;artStyle:string}})=>({saved:i.saved,cohort:browser.rows.find((r:{request:{requestId:string}})=>r.request.requestId===i.requestId).cohort.startsWith("cold")?"cold":"prepared"}))];
const records=[];
for(const style of ["classical","watercolor","icon"]){
 const composites:OverlayOptions[]=[];const group=all.filter(i=>i.saved.artStyle===style).sort((a,b)=>Number(a.cohort==="prepared")-Number(b.cohort==="prepared")||cold.findIndex(c=>c.unitId===a.saved.verseId)-cold.findIndex(c=>c.unitId===b.saved.verseId));assert.equal(group.length,6);
 for(let i=0;i<group.length;i++){
  const row=group[i],file=path.join(native,`${row.saved.id}.image`);let bytes:Buffer;
  if(fs.existsSync(file))bytes=fs.readFileSync(file);else{const r=await fetch(row.saved.imageUrl);assert.ok(r.ok);bytes=Buffer.from(await r.arrayBuffer());fs.writeFileSync(file,bytes,{flag:"wx"});}
  records.push({imageId:row.saved.id,unitId:row.saved.verseId,style,cohort:row.cohort,nativePath:path.relative(root,file),sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length});
  const left=(i%3)*480,top=Math.floor(i/3)*300;
  composites.push({input:await sharp(bytes).resize(480,270,{fit:"contain",background:"#303030"}).jpeg({quality:90}).toBuffer(),left,top});
  const label=`${row.saved.reference} · ${row.cohort}`;const svg=Buffer.from(`<svg width="480" height="30"><rect width="480" height="30" fill="#202020"/><text x="10" y="21" fill="white" font-size="16" font-family="sans-serif">${label}</text></svg>`);composites.push({input:svg,left,top:top+270});
 }
 await sharp({create:{width:1440,height:600,channels:3,background:"#303030"}}).composite(composites).jpeg({quality:91}).toFile(path.join(dir,`contact-${style}.jpg`));
}
fs.writeFileSync(path.join(dir,"image-hashes.json"),JSON.stringify({at:new Date().toISOString(),records,paidCalls:0,productionMutations:0},null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({images:records.length,contactSheets:3,paidCalls:0}));
