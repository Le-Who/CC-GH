/** One uninterrupted recorded visit to the actual app and disposable real backend. */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fixtureOwner,canonicalRows,ORIGIN} from '../yard-canonical-acceptance/fixtures.mjs';
import {OUT,WORK,report,restoreEvidence,init,observe,waitForYardReady,enter,scene,shot,placedPanel,closePanel,project,place,captureFailureDiagnostics} from '../yard-canonical-acceptance/browser-helpers.mjs';
import {DEFAULT_ROI} from './encoded-frames.mjs';
const RECIPE='pip-garden-grounding-v1';
let owner;
// Preserve the shared inspect assertions; keep each modal encoded before closing.
async function inspect(page,index=0){
 await placedPanel(page,index);await page.waitForTimeout(200);
 const targetSlotId=await page.locator('.cy-catalog-choice[aria-pressed="true"]').getAttribute('data-slot-id');
 assert(targetSlotId,'Inspect must address one real selected committed slot');
 const before=(await scene(page)).interaction;assert(before&&Number.isInteger(before.planCount));
 await page.locator('[data-pip-control="inspect-selected"]').click();await expect(page.locator('.cy-dialog')).not.toBeVisible();
 await expect.poll(async()=>{
  const current=(await scene(page))?.interaction;
  return current?.targetSlotId===targetSlotId&&current.planCount>before.planCount
   &&['approaching','inspecting','settled','no-path'].includes(current.phase)
   &&(current.phase==='no-path'||current.phase==='settled'||current.planLayoutKey===current.layoutKey);
 },{intervals:[20,50,100]}).toBe(true);
 return scene(page);
}
async function ready(p){await expect.poll(async()=>{const s=await scene(p);return s?.ready===true&&s.viewportBlocked===false&&s.lastFrame?.canonicalState==='ready';}).toBe(true);}
async function visible(p,n){await expect.poll(async()=>{const s=await scene(p);return s?.canonicalRecords.length===n&&JSON.stringify(s.canonicalRecords)===JSON.stringify(s.lastFrame?.records);}).toBe(true);}
async function savedRows(f,n){await expect.poll(async()=>canonicalRows(await owner.saved(f)).length).toBe(n);return canonicalRows(await owner.saved(f));}
async function buy(p,f,count){
 await p.locator('[data-nav-item="decor"]').click();await p.locator('[data-decor-tab="shop"]').click();await p.locator('.cy-catalog-choice[data-goodie-id="leaf_pot"]').click();
 const b=p.locator('[data-yard-action="buy-goodie"]');await expect(b).toBeEnabled();await b.click();
 await expect.poll(async()=>{const s=await owner.saved(f);return s.yard.goodieInventory.leaf_pot===count&&s.yard.currencies.treats===280-140*count;}).toBe(true);
 await expect(p.locator('.cy-wallet').first()).toHaveAttribute('title',String(280-140*count));await closePanel(p);
}
function state(s){return{ready:s.ready,itemEditing:s.itemEditing,itemActionPending:s.itemActionPending,lastFrame:s.lastFrame,interaction:s.interaction,dynamicSample:s.dynamicSample,groundingRecipe:s.groundingRecipe,renderer:{groundingRecipe:s.renderer?.groundingRecipe,contactShadow:s.renderer?.contactShadow,paused:s.renderer?.paused,lastFrame:s.renderer?.lastFrame},pauseReasons:s.pauseReasons,canonicalRecords:s.canonicalRecords,resources:s.resources,peakRgba:s.peakRgba,knownCPUBufferPeak:s.knownCPUBufferPeak};}
async function checkpoint(p,label){const s=await scene(p),box=await p.locator('.cy-scene').boundingBox();assert(box&&DEFAULT_ROI.x>=box.x&&DEFAULT_ROI.y>=box.y&&DEFAULT_ROI.x+DEFAULT_ROI.width<=box.x+box.width&&DEFAULT_ROI.y+DEFAULT_ROI.height<=box.y+box.height,'Encoded ROI must stay inside the true stage');assert.equal(s.groundingRecipe,RECIPE);assert.equal(s.renderer.contactShadow.recipe,RECIPE);assert.equal(s.renderer.groundingRecipe,RECIPE);report.redraw.checkpoints.push({label,wallMs:Date.now(),stage:box,scene:state(s)});return s;}
async function pointerDrag(p,x,y){
 await expect(p.locator('.cy-dialog')).not.toBeVisible();await expect.poll(async()=>Boolean((await scene(p))?.lastFrame?.ghost)).toBe(true);
 const s=await scene(p),g=s.lastFrame.ghost,box=await p.locator('.cy-scene > canvas').boundingBox(),from=project(s,g.x,g.y),to=project(s,x,y);
 for(const point of[from,to])assert(point.x>=0&&point.y>=0&&point.x<=box.width&&point.y<=box.height,'Drag must stay in actual crop');assert(Math.hypot(to.x-from.x,to.y-from.y)>2);
 await p.mouse.move(box.x+from.x,box.y+from.y);await p.mouse.down();try{await p.mouse.move(box.x+to.x,box.y+to.y,{steps:6});await expect.poll(async()=>{const ghost=(await scene(p))?.lastFrame?.ghost;return ghost&&Math.abs(ghost.x-x)<.25&&Math.abs(ghost.y-y)<.25;}).toBe(true);}finally{await p.mouse.up();}
 (report.redraw.pointerDrags??=[]).push({from:{x:g.x,y:g.y},to:{x,y},heldMoveSteps:6});
}
async function write(){report.status=report.errors.length||report.sections.redraw==='failed'?'FAILED_OR_INCOMPLETE':'ENCODED_VIDEO_GATE_PENDING';await fs.writeFile(path.join(OUT,'browser.json'),JSON.stringify(report,null,2)+'\n');}
test.beforeAll(async()=>{await fs.mkdir(OUT,{recursive:true});await fs.mkdir(WORK,{recursive:true});const prior=await fs.readFile(path.join(OUT,'browser.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});restoreEvidence(report,prior,process.env.GITHUB_SHA);owner=await fixtureOwner();});
test.afterAll(async()=>{try{await owner?.close();}finally{await write();}});
test('continuous genuine acquisition, placement cancel and commit, alternate inspection route',async({browser})=>{
 test.setTimeout(90000);let c,p,video;const errorsBefore=report.errors.length;
 report.sections.redraw='running';report.redraw={status:'running',checkpoints:[],recipe:RECIPE,video:'redraw-transitions-native.webm',recording:{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,encodedSize:{width:390,height:844}},noScreenshotOrReadPixels:true,readinessMarker:{position:'fixed top-left sixteen CSS pixels, outside stage',purpose:'After two initial placements, magenta means unobscured stage and cyan, composited through the existing native dialog backdrop, means the crop is occluded. Every post-arm encoded frame must identify its state. First dialog-close frame is measured.'}};
 try{
  const f=await owner.seed({treats:280,pots:0});
  // Unrecorded ordinary selector smoke complements the unchanged baseline HUD.
  const baseline=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  try{await init(baseline,f,'ru');await baseline.route(/^https?:\/\//,route=>new URL(route.request().url()).origin===ORIGIN?route.continue():route.abort('blockedbyclient'));const bp=await baseline.newPage();await waitForYardReady(bp,f,()=>bp.goto(ORIGIN+'/?tab=room&yardPipPreview=1'));await enter(bp);await ready(bp);const bs=await scene(bp);assert.equal(bs.groundingRecipe,'baseline');assert.equal(bs.renderer.contactShadow.recipe,'baseline');assert.equal(bs.renderer.groundingRecipe,'baseline');report.redraw.baselineDefault={recipe:bs.groundingRecipe,contactRecipe:bs.renderer.contactShadow.recipe,ready:bs.ready};}finally{await baseline.close();}
  c=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block',recordVideo:{dir:path.join(WORK,'redraw-video'),size:{width:390,height:844}}});
  await init(c,f,'ru');await c.route(/^https?:\/\//,route=>{if(new URL(route.request().url()).origin===ORIGIN)return route.continue();report.errors.push({type:'external-request',url:route.request().url()});return route.abort('blockedbyclient');});
  p=await c.newPage();video=p.video();observe(p,'continuous-redraw',['yard.buyGoodie']);report.redraw.recordingStartedWallMs=Date.now();
  await waitForYardReady(p,f,()=>p.goto(ORIGIN+'/?tab=room&yardPipPreview=1&yardPipGrounding='+RECIPE));await enter(p);await ready(p);await visible(p,0);await checkpoint(p,'canonical-ready');
  report.redraw.browserVersion=browser.version();
  report.redraw.backend=await p.locator('.cy-pip-direct-layer canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2');if(!gl)return{classification:'unavailable'};const d=gl.getExtension('WEBGL_debug_renderer_info'),vendor=gl.getParameter(d?d.UNMASKED_VENDOR_WEBGL:gl.VENDOR),renderer=gl.getParameter(d?d.UNMASKED_RENDERER_WEBGL:gl.RENDERER);return{vendor,renderer,version:gl.getParameter(gl.VERSION),classification:/swiftshader|llvmpipe|softpipe|software/i.test(vendor+' '+renderer)?'software-renderer-reported':'backend-not-classified'};});
  await buy(p,f,1);await buy(p,f,2);await checkpoint(p,'two-authentic-purchases');
  await place(p,98,118);await savedRows(f,1);await visible(p,1);await checkpoint(p,'first-placement-committed');
  await place(p,88,172);const before=await savedRows(f,2);await visible(p,2);await checkpoint(p,'second-placement-committed');
  const idle=await scene(p);assert.deepEqual(idle.dynamicSample.world.root,{x:79,y:129.5,z:0});assert.equal(idle.interaction.active,false);
  // Initial purchase/placement dialogs stay in the untouched raw clip but are
  // outside the measured interval. Later dialogs are explicitly encoded as
  // occlusions, including their very first and very last composited frame.
  await p.evaluate(()=>{const dialog=document.querySelector('.cy-dialog');if(!dialog||dialog.open)throw Error('Arm only on an unobscured stage');const mark=document.createElement('div');mark.setAttribute('aria-hidden','true');mark.dataset.qaEncodedReadiness='true';Object.assign(mark.style,{position:'fixed',left:'0',top:'0',width:'16px',height:'16px',zIndex:'2147483647',pointerEvents:'none',contain:'strict'});const transitions=[];window.__yardEncodedIntervals=transitions;const update=()=>{const open=dialog.open;mark.style.background=open?'rgb(0,255,255)':'rgb(255,0,255)';transitions.push({performanceMs:performance.now(),wallMs:Date.now(),dialogOpen:open});};update();new MutationObserver(update).observe(dialog,{attributes:true,attributeFilter:['open']});document.body.append(mark);});
  report.redraw.analysisArmedAfter='second-placement-committed';await p.waitForTimeout(200);
  await placedPanel(p,1);await p.waitForTimeout(200);await p.locator('[data-yard-action="move"]').click();await pointerDrag(p,94,135);const editing=await checkpoint(p,'move-entry-and-drag');assert.equal(editing.itemEditing,true);assert.equal(editing.lastFrame.visibility,'planter');assert(editing.lastFrame.ghost);
  await p.waitForTimeout(200);await p.locator('[data-yard-action="cancel-placement"]').click();await expect.poll(async()=>(await scene(p))?.itemEditing).toBe(false);await visible(p,2);assert.deepEqual(canonicalRows(await owner.saved(f)),before);const cancelled=await checkpoint(p,'move-cancelled');assert.equal(cancelled.lastFrame.ghost,null);assert.deepEqual(cancelled.dynamicSample.world.root,idle.dynamicSample.world.root);
  await placedPanel(p,1);await p.waitForTimeout(200);await p.locator('[data-yard-action="move"]').click();await pointerDrag(p,94,135);await checkpoint(p,'reposition-before-commit');await p.waitForTimeout(200);await p.locator('[data-yard-action="commit-placement"]').click();
  await expect.poll(async()=>{const rows=canonicalRows(await owner.saved(f));return rows.length===2&&Math.abs(rows[1].x-94)<.25&&Math.abs(rows[1].y-135)<.25;}).toBe(true);await visible(p,2);const committed=await checkpoint(p,'reposition-committed');assert.equal(committed.lastFrame.ghost,null);assert.deepEqual(committed.dynamicSample.world.root,idle.dynamicSample.world.root);assert.deepEqual(canonicalRows(await owner.saved(f))[0],before[0]);
  await inspect(p,0);const started=await checkpoint(p,'alternate-route-admitted');assert.notEqual(started.interaction.selectedAnchor,'leaf-7');assert.equal(started.interaction.savedVisitor,false);assert.equal(started.savedVisitor??false,false);
  await expect.poll(async()=>(await scene(p))?.interaction?.phase,{timeout:24000}).toBe('settled');const end=await checkpoint(p,'alternate-route-settled');assert.equal(end.lastFrame.visibility,'both');assert.equal(end.itemActionPending,false);assert.equal(end.lastFrame.ghost,null);assert(end.peakRgba<=64*1024*1024);assert(end.knownCPUBufferPeak<=16*1024*1024);const resources=end.resources;assert.equal(resources.committedPropCapacity,2);assert.equal(resources.propBuffersShared,true);assert(resources.geometryGPUBufferBytes+resources.boneDataTextureGPUBytesEstimate+resources.resizeDrawingBufferPeakEstimatedBytes+resources.compositorResizePeakBytesEstimate<=12*1024*1024);assert(resources.combinedKnownCPUBufferPeakBytes+resources.boneDataTextureCPUBytesEstimate<=16*1024*1024);
  const saved=await owner.saved(f);assert.equal(saved.yard.currencies.treats,0);assert.equal(saved.yard.goodieInventory.leaf_pot??0,0);assert.equal(canonicalRows(saved).length,2);
  report.redraw.dialogMarkerTransitions=await p.evaluate(()=>window.__yardEncodedIntervals);assert.deepEqual(report.redraw.dialogMarkerTransitions.map(r=>r.dialogOpen),[false,true,false,true,false,true,false]);await p.waitForTimeout(250);assert.equal(report.errors.length,errorsBefore,JSON.stringify(report.errors.slice(errorsBefore)));assert(!report.console.entries.some(e=>e.scope==='continuous-redraw'&&e.type==='error'&&/THREE\.WebGLProgram|VALIDATE_STATUS|shader.*error|shader.*compile|WebGL.*INVALID_OPERATION/i.test(e.text)));assert(report.requests.every(r=>r.status<400));
  report.sections.redraw='passed';report.redraw.status='FUNCTIONAL_TRANSITIONS_PASSED_ENCODED_GATE_PENDING';
 }catch(error){report.sections.redraw='failed';report.redraw.status='FAILED_OR_INCOMPLETE';report.errors.push({type:'continuous-redraw',message:String(error),stack:error.stack});if(p)await captureFailureDiagnostics(p,'continuous-redraw-failure').catch(e=>report.errors.push({type:'diagnostic-failure',message:String(e)}));throw error;
 }finally{
  try{await c?.close();}finally{if(video){try{await fs.copyFile(await video.path(),path.join(OUT,report.redraw.video));report.redraw.recordingClosedWallMs=Date.now();report.redraw.originalPreserved=true;}catch(error){report.sections.redraw='failed';report.errors.push({type:'native-video-preservation',message:String(error)});}}await write();}
 }
});
