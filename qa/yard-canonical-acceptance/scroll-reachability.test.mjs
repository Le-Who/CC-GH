import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {assertBeforeScroll,assertReached,reachableControl} from './scroll-reachability.mjs';
const control=()=>({label:'Select',rect:{x:20,y:520,w:100,h:44,right:120,bottom:564},clipped:false,declaredScrollContent:true,panel:{node:'div.cy-panel',overflowY:'auto',overflowX:'hidden',scrollHeight:700,clientHeight:200,scrollWidth:280,clientWidth:280,scrollTop:0,clientBounds:{x:10,y:100,right:290,bottom:300}},fullyVisible:false,hit:false,hitElement:null,viewport:{scrollX:0,scrollY:0}});
const reached=b=>({...structuredClone(b),rect:{x:20,y:240,w:100,h:44,right:120,bottom:284},fullyVisible:true,hit:true,panel:{...b.panel,scrollTop:280}});
test('intentional offscreen content passes only after its actual scroll panel exposes the whole action and hit',()=>{const before=control();assert.doesNotThrow(()=>assertBeforeScroll(before));assert.doesNotThrow(()=>assertReached(before,reached(before)));});
test('a real overlay still fails after scrolling',()=>{const before=control(),after=reached(before);after.hit=false;after.hitElement='footer.cy-selected-actions';assert.throws(()=>assertReached(before,after),/occluded/);});
test('missing, hidden or non-overflowing scroll is rejected rather than waived',()=>{for(const mutate of[b=>b.declaredScrollContent=false,b=>b.panel=null,b=>b.panel.overflowY='hidden',b=>b.panel.scrollHeight=b.panel.clientHeight]){const before=control();mutate(before);assert.throws(()=>assertBeforeScroll(before));}});
test('an action remaining clipped by an ancestor or rescued by page scroll still fails',()=>{const before=control();for(const mutate of[a=>a.fullyVisible=false,a=>a.clipped=true,a=>a.viewport.scrollY=4]){const after=reached(before);mutate(after);assert.throws(()=>assertReached(before,after));}});
test('fixed footer visibility and text clipping are not deferred into a scroll exception',()=>{const before=control();before.declaredScrollContent=false;before.panel=null;assert.throws(()=>assertBeforeScroll(before),/no declared scroll panel/);before.fullyVisible=true;before.clipped=true;assert.throws(()=>assertBeforeScroll(before),/Clipped/);});

test('scrollIntoView cannot rescue content by moving an undeclared hidden ancestor',()=>{const before=control();before.ancestors=[{node:'div.hidden',declaredPanel:false,scrollTop:0,scrollLeft:0}];const after=reached(before);after.ancestors=[{...before.ancestors[0],scrollTop:40}];assert.throws(()=>assertReached(before,after),/undeclared/);});

test('native audit walks every real dialog control and never scroll-rescues fixed footer controls',async()=>{
 const module=await fs.readFile(new URL('./scroll-reachability.mjs',import.meta.url),'utf8'),spec=await fs.readFile(new URL('./hud.spec.mjs',import.meta.url),'utf8');
 assert.match(module,/for\(let i=0;i<count;i\+\+\)/);assert.doesNotMatch(module,/isVisible\(\)\)continue/);assert.match(module,/if\(before.declaredScrollContent\)await control.scrollIntoViewIfNeeded/);assert.match(module,/document.elementFromPoint/);assert.match(module,/click\(\{trial:true,timeout:3000\}\)/);assert.match(module,/checkLayout\(\{\.\.\.screen,controls:fixed\}\)/);
 for(const section of ['inventory','placed','shop','guests-album','guests-helper'])assert(spec.includes("name+'-"+section));
 assert.doesNotMatch(spec,/native genuine purchase|recordVideo/);assert.match(spec,/test.setTimeout\(200000\)/);
});

test('pre-audit helper rejects an initially offscreen fixed footer before the scroll API can rescue it',async()=>{
 const before=control();before.declaredScrollContent=false;before.panel=null;let scrollCalls=0,current=before;
 const locator={evaluate:async()=>structuredClone(current),scrollIntoViewIfNeeded:async()=>{scrollCalls++;current=reached(before);}};
 const evidence={};await assert.rejects(reachableControl(locator,evidence),/no declared scroll panel/);assert.equal(scrollCalls,0);assert.deepEqual(evidence.before,before);assert.equal(evidence.after,undefined);
 // Demonstrate the exact old false pass: unconditional scroll would expose it.
 await locator.scrollIntoViewIfNeeded();assert.equal(current.fullyVisible,true);assert.equal(current.hit,true);
});
test('pre-audit helper scrolls admitted content and records before/after without changing its own state',async()=>{
 const before=control();let calls=0,current=before;const locator={evaluate:async()=>structuredClone(current),scrollIntoViewIfNeeded:async()=>{calls++;current=reached(before);}};
 const record=await reachableControl(locator);assert.equal(calls,1);assert.equal(record.before.fullyVisible,false);assert.equal(record.after.fullyVisible,true);assert.equal(record.after.panel.scrollTop,280);
});

test('fresh exhaustive matrix covers all nine required sizes, compact EN/RU, extended portrait and actual desktop input flags',async()=>{
 const spec=await fs.readFile(new URL('./hud.spec.mjs',import.meta.url),'utf8');
 for(const pair of ['320,568','360,800','390,844','414,896','568,320','844,390','768,1024','1024,768','1280,720','375,812'])assert(spec.includes('['+pair+','),pair);
 assert.match(spec,/\[568,320,1,'en','phone'\]/);assert.match(spec,/\[568,320,1,'ru','phone'\]/);assert.match(spec,/\[390,844,2,'ru','phone'\]/);assert.match(spec,/\[1280,720,1,'en','desktop'\]/);assert.match(spec,/isMobile:deviceClass!=='desktop',hasTouch:deviceClass!=='desktop'/);assert.match(spec,/report.controlAudits.push\(record\);await reachableControl\(locator,record\)/);
 assert.match(spec,/elapsedMs:Date.now\(\)-startedAt/);assert.match(spec,/test.setTimeout\(200000\)/);
});
