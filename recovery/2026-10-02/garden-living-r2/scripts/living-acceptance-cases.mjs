// Authored QA only. Uses real preview inputs; never writes game state or calls game actions.
import {delay,until} from './core.mjs';
const JSONQ=JSON.stringify;
const view=(width,height,rest={})=>({width,height,dpr:1,touch:true,language:'en',...rest});
const saved="JSON.parse(w.localStorage.getItem('terrarium_save'))";
const stats="w.__GARDEN_LIVING_QA__.snapshot()";
const water='.gs2-dialog button:has(img[src$="/water.webp"])';

export function assertResult(a,label,actual,passed){
 a.record.assertions.push({label,passed:Boolean(passed),actual});
 if(!passed)throw Error(label+': '+JSON.stringify(actual));
 return actual;
}
export function phaseEvidence(samples,id,from,to){
 const rows=samples.flatMap(s=>s.surfaces.filter(v=>v.rootKind==='shelf').flatMap(v=>v.plants.filter(p=>p.id===id).map(p=>({...p,at:s.at}))));
 return {id,from,to,initial:rows.some(p=>p.phase===from&&p.drawCount>0),
  intermediate:rows.some(p=>p.phase===to&&p.previousKey&&p.growthMix>0&&p.growthMix<1)||rows.some(p=>(p.growthSamples||[]).some(g=>g.phase===to&&g.previousKey&&g.mix>0&&g.mix<1)),
  final:rows.some(p=>p.phase===to&&!p.previousKey&&p.growthMix===1&&p.drawnKey===p.requestedKey&&p.drawCount>0)};
}
export function schemaProblems(s){
 const errors=[];
 if(!s||!Array.isArray(s.surfaces))return ['surfaces missing'];
 for(const v of s.surfaces){
  if(!(typeof v.id==='string'||Number.isFinite(v.id))||!['shelf','care'].includes(v.rootKind))errors.push('surface identity missing');
  if(!Array.isArray(v.plants)){errors.push('plants missing');continue;}
  for(const p of v.plants){if(typeof p.id!=='string'||typeof p.type!=='string'||!Number.isInteger(p.phase)||!Number.isFinite(p.drawCount)||!('drawnKey'in p)||!('requestedKey'in p)||!('previousKey'in p)||!Number.isFinite(p.growthMix))errors.push('entry evidence missing');}
 }
 return errors;
}
async function snapshot(a,label){
 const value=await a.evaluate(`return {at:w.performance.now(),state:${saved},living:${stats}};`);
 (a.record.livingEvidence??=[]).push({label,...value});return value;
}
async function ready(a){
 await a.waitFor(`return Boolean(w.__GARDEN_LIVING_QA__)&&${stats}.surfaces.some(s=>s.frames>0&&s.textures>0);`,'Living renderer has not drawn');
 const s=await a.evaluate(`return ${stats};`),errors=schemaProblems(s);
 assertResult(a,'Read-only living diagnostics contain actual draw evidence',errors,errors.length===0);
}
async function waitFor(a,body,message,timeout=15000){
 return until(()=>a.evaluate(body),{timeout,interval:60,message,signal:a.signal});
}
async function drawn(a,id,rootKind='shelf'){
 await waitFor(a,`return ${stats}.surfaces.some(s=>s.rootKind===${JSONQ(rootKind)}&&s.plants.some(p=>p.id===${JSONQ(id)}&&p.drawCount>0&&p.drawnKey===p.requestedKey&&p.growthMix===1&&!p.previousKey)&&s.pending.length===0&&s.failed.length===0);`,'Current plant art was not drawn: '+id);
}
async function startSamples(a){
 await a.evaluate(`if(w.__livingAcceptanceProbe)throw Error('Probe already active');const probe={samples:[],dropped:0};probe.sample=()=>{const s=${stats};if(probe.samples.length<900)probe.samples.push({at:w.performance.now(),surfaces:s.surfaces.map(v=>({id:v.id,rootKind:v.rootKind,reducedMotion:v.reducedMotion,frames:v.frames,plants:v.plants}))});else probe.dropped++;};probe.sample();probe.timer=w.setInterval(probe.sample,50);w.__livingAcceptanceProbe=probe;return true;`);
}
async function stopSamples(a){
 const result=await a.evaluate("const p=w.__livingAcceptanceProbe;if(!p)return null;w.clearInterval(p.timer);p.sample();delete w.__livingAcceptanceProbe;return {samples:p.samples,dropped:p.dropped};");
 if(result){(a.record.livingSamples??=[]).push(result);assertResult(a,'Bounded transition recording retained every sampled observation',{count:result.samples.length,dropped:result.dropped},result.dropped===0);}
 return result?.samples||[];
}
async function clickHere(a,selector){
 const point=await a.evaluate(`const e=d.querySelector(${JSONQ(selector)});if(!e||e.disabled||e.closest('[inert]'))throw Error('Unavailable current-position target');const r=e.getBoundingClientRect(),fr=f?.getBoundingClientRect()||{x:0,y:0},x=r.x+r.width/2,y=r.y+r.height/2,hit=d.elementFromPoint(x,y);if(r.width<1||r.height<1||r.x<0||r.y<0||r.right>w.innerWidth+1||r.bottom>w.innerHeight+1||!(hit===e||e.contains(hit)))throw Error('Current-position target is clipped or obscured');return {x:fr.x+x,y:fr.y+y,scrollTop:d.querySelector('.gs2-dialog-scroll')?.scrollTop??null};`);
 await a.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:1,radiusX:1,radiusY:1}]});
 await a.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 a.record.actions.push({type:'realTouchWithoutScrollIntoView',selector,point});await delay(80,a.signal);
}
async function swipeBody(a){
 const p=await a.evaluate("const e=d.querySelector('.gs2-dialog-scroll'),r=e.getBoundingClientRect(),fr=f?.getBoundingClientRect()||{x:0,y:0};if(e.scrollHeight<=e.clientHeight+2)return {noOverflow:true,before:e.scrollTop};if(r.height<44)throw Error('Dialog body is unusable');return {x:fr.x+r.right-10,y:fr.y+r.bottom-10,dy:-Math.min(100,r.height-24),before:e.scrollTop};");
 if(p.noOverflow){a.record.actions.push({type:'dialogAlreadyFits',scrollTop:p.before});return p.before;}
 await a.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1,radiusX:1,radiusY:1}]});
 for(let i=1;i<=8;i++){await a.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y+p.dy*i/8,id:1,radiusX:1,radiusY:1}]});await delay(20,a.signal);}
 await a.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(140,a.signal);
 const after=await a.evaluate("return d.querySelector('.gs2-dialog-scroll').scrollTop;");
 a.record.actions.push({type:'realTouchDialogScroll',...p,after});return after;
}
async function bottom(a){
 for(let i=0;i<20;i++){
  if(await a.evaluate("const e=d.querySelector('.gs2-dialog-scroll');return Math.abs(e.scrollTop-Math.max(0,e.scrollHeight-e.clientHeight))<=2;"))return;
  await swipeBody(a);
 }
 throw Error('Real touch scrolling did not reach the dialog bottom');
}
async function closeHere(a,opener){
 const before=await a.evaluate("const e=d.querySelector('.gs2-dialog-scroll');return {scrollTop:e.scrollTop,header:d.querySelector('.gs2-dialog-heading').getBoundingClientRect().toJSON(),close:d.querySelector('[role=dialog] .gs2-close').getBoundingClientRect().toJSON()};");
 (a.record.scrollCloseEvidence??=[]).push(before);
 await clickHere(a,'[role=dialog] .gs2-close');
 await a.waitFor("return !d.querySelector('[role=dialog]');",'Pointer close failed');
 await a.check('Pointer close releases the modal surface and restores the opener',`return !d.querySelector('.gs2-modal-layer .gs2-live-surface')&&${stats}.surfaces.length===1&&d.activeElement===d.querySelector(${JSONQ(opener)});`);
}
async function newCase(a,label,run){
 a.record.livingAcceptance={version:1,label,browserAcceptance:'actual results belong only to this run',unrun:['missing-art fault','WebGL unavailable','WebGL context loss','delayed-decode disposal race','all 56 authored species/phase compositions']};
 await ready(a);return run();
}

export function livingAcceptanceCases(){return [
 {id:'garden-living-real-growth',options:view(390,844,{fixture:'living-growth'}),run:async a=>newCase(a,'real timer, water and touch phase transitions',async()=>{
  const ids=['preview-qa-grow-0','preview-qa-grow-1','preview-qa-grow-2'];
  const initial=await snapshot(a,'growth-before-input');
  assertResult(a,'Growth fixture is still in its authored starting phases',initial.state.plants.map(p=>({id:p.id,phase:p.phase,phaseProgress:p.phaseProgress})),ids.every((id,i)=>initial.state.plants.some(p=>p.id===id&&p.phase===i)));
  for(const id of ids)await drawn(a,id);
  await startSamples(a);let samples=[];
  try{
   await a.screenshot('real-growth-before');
   await a.click(`[data-plant-id="${ids[1]}"] [data-plant-details-button]`);await a.checkDialog();await drawn(a,ids[1],'care');
   const before=await snapshot(a,'growth-water-before');
   await a.click(water);
   await waitFor(a,`return ${saved}.plants.find(p=>p.id===${JSONQ(ids[1])})?.phase===2;`,'Real water did not advance phase 1 to 2');
   await a.check('One real watering advances stored phase and daily count once',`const s=${saved},p=s.plants.find(p=>p.id===${JSONQ(ids[1])});return p.phase===2&&p.lastWatered>0&&s.dailyQuests.stats.waters===${Number(before.state.dailyQuests.stats.waters||0)+1};`);
   await a.screenshot('real-water-growth-detail');await closeHere(a,`[data-plant-id="${ids[1]}"] [data-plant-details-button]`);
   for(let i=0;i<15;i++){
    if(await a.evaluate(`return ${saved}.plants.find(p=>p.id===${JSONQ(ids[2])})?.phase===3;`))break;
    await a.click(`[data-plant-id="${ids[2]}"] .gs2-plant-target`);await delay(550,a.signal);
   }
   await waitFor(a,`return ${saved}.plants.find(p=>p.id===${JSONQ(ids[2])})?.phase===3;`,'Real taps did not advance phase 2 to 3');
   await waitFor(a,`return ${saved}.plants.find(p=>p.id===${JSONQ(ids[0])})?.phase===1;`,'Normal game timer did not advance phase 0 to 1',30000);
   for(const id of ids)await drawn(a,id);
   await a.screenshot('real-growth-all-three-final');await snapshot(a,'growth-final');
  }finally{samples=await stopSamples(a);}
  for(let i=0;i<ids.length;i++){const e=phaseEvidence(samples,ids[i],i,i+1);assertResult(a,'Real rendered phase transition '+ids[i],e,e.initial&&e.intermediate&&e.final);}
  await a.check('Shelf records exactly three growth events and settles textures',`const s=${stats}.surfaces.find(s=>s.rootKind==='shelf');return s.growths===3&&s.pending.length===0&&s.failed.length===0;`);
  await a.click(`[data-plant-id="${ids[1]}"] [data-plant-details-button]`);await drawn(a,ids[1],'care');
  await a.check('Reopened care does not replay historical water or growth',`const s=${stats}.surfaces.find(s=>s.rootKind==='care');return s.waterings===0&&s.growths===0;`);
  await closeHere(a,`[data-plant-id="${ids[1]}"] [data-plant-details-button]`);
 })},
 {id:'garden-living-fern-scroll-close',options:view(568,320,{fixture:'full',chrome:'telegram-safe'}),run:async a=>newCase(a,'real fern care scroll and pointer close',async()=>{
  const id=await a.evaluate(`return ${saved}.plants.find(p=>p.type==='fern'&&p.shelfIndex>=0)?.id;`);if(!id)throw Error('Full fixture has no fern');
  const opener=`[data-plant-id="${id}"] [data-plant-details-button]`;
  for(const [width,height]of [[568,320],[390,844]]){
   if(width===390)await a.resize(width,height);
   await a.click(opener);await a.checkDialog();await a.screenshot(`fern-care-top-${width}`);
   await swipeBody(a);await drawn(a,id,'care');await snapshot(a,`fern-middle-scroll-${width}`);
   await a.check('Shared care canvas clips fern inside the actual scroll body',`const s=${stats}.surfaces.find(s=>s.rootKind==='care'),p=s?.plants.find(p=>p.id===${JSONQ(id)}),r=d.querySelector('.gs2-dialog-scroll').getBoundingClientRect();return Boolean(p)&&(!p.clip||(p.clip.left>=r.left-1&&p.clip.right<=r.right+1&&p.clip.top>=r.top-1&&p.clip.bottom<=r.bottom+1));`);
   await a.screenshot(`fern-care-middle-${width}`);
   await bottom(a);
   await a.check('Bottom care controls are inside the scroll body',"const e=d.querySelector('.gs2-dialog-scroll'),r=e.getBoundingClientRect(),last=d.querySelector('.gs2-action-row').getBoundingClientRect();return Math.abs(e.scrollTop-Math.max(0,e.scrollHeight-e.clientHeight))<=2&&last.top>=r.top-1&&last.bottom<=r.bottom+1;");
   if(width===568){const before=await snapshot(a,'fern-water-before');await a.click(water);await waitFor(a,`return ${saved}.plants.find(p=>p.id===${JSONQ(id)})?.lastWatered>${Number(before.state.plants.find(p=>p.id===id).lastWatered||0)};`,'Fern water button did not work after scrolling');await bottom(a);}
   await a.screenshot(`fern-care-bottom-${width}`);await closeHere(a,opener);
  }
 })},
 {id:'garden-living-all14-lifecycle',options:view(390,844,{fixture:'full'}),run:async a=>newCase(a,'all fourteen current-phase drawings and repeated disposal',async()=>{
  const inventory=await a.evaluate(`const s=${saved};return {plants:s.plants.filter(p=>p.shelfIndex>=0).sort((a,b)=>a.shelfIndex-b.shelfIndex||a.spotIndex-b.spotIndex),species:(await import('/games/garden-living/living-plant-art.mjs')).livingPlantSpecies};`);
  const types=[...new Set(inventory.plants.map(p=>p.type))];
  assertResult(a,'All fourteen placed species are supported by the living registry',{types,registry:inventory.species},types.length===14&&inventory.species.length===14&&types.every(t=>inventory.species.includes(t)));
  const first=inventory.plants[0],opener=`[data-plant-id="${first.id}"] [data-plant-details-button]`;
  await a.click(opener);
  const viewed=new Set();
  for(let i=0;i<inventory.plants.length;i++){
   const p=inventory.plants[i];await drawn(a,p.id,'care');
   await a.check('Care art agrees with current plant '+p.id,`const e=d.querySelector('[role=dialog] [data-living-species]'),p=${saved}.plants.find(p=>p.id===${JSONQ(p.id)});return e?.dataset.livingSpecies===${JSONQ(p.type)}&&Number(e.dataset.livingPhase)===p.phase&&e.querySelector('img')?.naturalWidth>0&&${stats}.surfaces.length===2;`);
   if(!viewed.has(p.type)){await a.screenshot('species-'+p.type);viewed.add(p.type);}
   if(i+1<inventory.plants.length)await a.click({role:'button',name:'Next plant'});
  }
  await a.dismiss();await a.waitFor(`return ${stats}.surfaces.length===1;`);
  const baseline=await snapshot(a,'lifecycle-baseline');const stage=baseline.living.surfaces.find(s=>s.rootKind==='shelf');
  for(let cycle=0;cycle<5;cycle++){
   const p=inventory.plants[cycle%inventory.plants.length],target=`[data-plant-id="${p.id}"] [data-plant-details-button]`;
   await a.click(target);await drawn(a,p.id,'care');const before=await snapshot(a,'care-touch-before-'+cycle);
   await a.click('.gs2-detail-tap');
   await a.check('One care touch reaches each mounted matching view once',`const before=${JSONQ(before.living.surfaces)},current=${stats}.surfaces;return before.length===2&&current.length===2&&current.every(s=>s.touches===before.find(b=>b.id===s.id)?.touches+1);`);
   await closeHere(a,target);
   await a.check('Cycle retains one original shelf manager and no detached modal',`const s=${stats}.surfaces;return s.length===1&&s[0].id===${JSONQ(stage.id)}&&s[0].entries===${stage.entries}&&d.querySelectorAll('.gs2-live-surface').length===1;`);
   const careId=before.living.surfaces.find(s=>s.rootKind==='care').id;
   await a.check('Closed care has one disposal and no later texture upload',`const events=${stats}.lifecycle.filter(e=>e.surfaceId===${JSONQ(careId)}),gone=events.filter(e=>e.event==='dispose');return gone.length===1&&!events.some(e=>e.event==='texture-upload'&&e.time>gone[0].time);`);
  }
  const last=await snapshot(a,'lifecycle-final');
  assertResult(a,'All fourteen original care captures were retained',{types:[...viewed]},viewed.size===14);
  await waitFor(a,`return ${stats}.surfaces.every(s=>s.pending.length===0);`,'Lifecycle textures did not settle');
  await a.check('Settled texture ledger is bounded and healthy',`return ${stats}.surfaces.every(s=>s.pending.length===0&&s.failed.length===0&&s.textures<=16);`);
  a.record.livingAcceptance.completedSpecies=[...viewed];a.record.livingAcceptance.finalSurfaceIds=last.living.surfaces.map(s=>s.id);
 })},
 {id:'garden-living-reduced-motion',options:view(390,844,{fixture:'living-growth'}),setup:async a=>{
  await a.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});a.record.actions.push({type:'browserMediaPreference',value:'reduce',beforeNavigation:true});
 },run:async a=>newCase(a,'reduced still drawing, real state update and live preference change',async()=>{
  await a.check('Reduced preference reaches the game and all surfaces',`return w.matchMedia('(prefers-reduced-motion: reduce)').matches&&${stats}.surfaces.every(s=>s.reducedMotion);`);
  const id='preview-qa-grow-1',opener=`[data-plant-id="${id}"] [data-plant-details-button]`;
  await a.click(opener);await drawn(a,id,'care');await startSamples(a);let samples=[];
  try{await a.click(water);await waitFor(a,`return ${saved}.plants.find(p=>p.id===${JSONQ(id)})?.phase===2;`,'Reduced-motion watering did not update game phase');await drawn(a,id,'care');await a.screenshot('reduced-grown-still');}
  finally{samples=await stopSamples(a);}
  const plants=samples.flatMap(s=>s.surfaces.flatMap(v=>v.plants.filter(p=>p.id===id&&p.phase===2&&p.drawnKey===p.requestedKey)));assertResult(a,'Reduced growth has no interpolated blend once the new image is drawn',{observations:plants.length,mixes:plants.map(p=>p.growthMix)},plants.length>0&&plants.every(p=>p.growthMix===1&&!p.previousKey));
  await closeHere(a,opener);
  await waitFor(a,`return ${stats}.surfaces.every(s=>s.pending.length===0);`,'Reduced textures did not settle');await delay(400,a.signal);
  const before=await a.evaluate(`return ${stats}.surfaces.map(s=>({id:s.id,frames:s.frames}));`);await delay(700,a.signal);
  await a.check('Reduced-motion idle surface does not run continuously',`const before=${JSONQ(before)},current=${stats}.surfaces;return before.length>0&&current.length===before.length&&current.every(s=>s.frames===before.find(b=>b.id===s.id)?.frames);`);
  await a.screenshot('reduced-idle-still');
  await a.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});a.record.actions.push({type:'browserMediaPreference',value:'no-preference'});
  await waitFor(a,`const before=${JSONQ(before)},current=${stats}.surfaces;return current.length===before.length&&current.every(s=>!s.reducedMotion&&s.frames>before.find(b=>b.id===s.id).frames+2);`,'Live preference change did not resume rendering');
  await a.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});a.record.actions.push({type:'browserMediaPreference',value:'reduce'});
  const preResize=await a.evaluate(`return ${stats}.surfaces.map(s=>({id:s.id,frames:s.frames}));`);
  await a.resize(568,320);
  await waitFor(a,`const before=${JSONQ(preResize)},current=${stats}.surfaces;return current.length===before.length&&current.every(s=>s.reducedMotion&&s.frames>before.find(b=>b.id===s.id).frames);`,'Reduced surface did not redraw after resize');
  await a.check('Reduced layout stays inside the resized frame',"return d.documentElement.scrollWidth<=w.innerWidth+1;");
  await delay(400,a.signal);const stopped=await a.evaluate(`return ${stats}.surfaces.map(s=>({id:s.id,frames:s.frames}));`);await delay(700,a.signal);
  await a.check('Returning to reduced motion stops the draw loop again',`const before=${JSONQ(stopped)},current=${stats}.surfaces;return before.length>0&&current.length===before.length&&current.every(s=>s.frames===before.find(b=>b.id===s.id)?.frames);`);
  await a.screenshot('reduced-resized-still');await snapshot(a,'reduced-final');
 })}
];}
