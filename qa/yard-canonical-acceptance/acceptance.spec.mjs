/** Actual production UI, outbox, authenticated Express mutations and PostgreSQL.
 * Diagnostic observations are read-only. Network loss is after a real commit. */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {fixtureOwner,canonicalRows,economy,realMutation,ORIGIN} from './fixtures.mjs';
import {OUT,WORK,report,init,observe,boot,enter,scene,shot,placedPanel,closePanel,project,dragTo,place,move,pickup,inspect,refresh,capture,fonts,layout,checkLayout,outbox} from './browser-helpers.mjs';
let owner,fixture;
test.beforeAll(async()=>{await fs.mkdir(OUT,{recursive:true});await fs.mkdir(WORK,{recursive:true});owner=await fixtureOwner();fixture=await owner.seed();});
test.afterAll(async()=>{try{await owner?.close();}catch(error){report.errors.push({type:'fixture-cleanup',message:String(error)});report.status='FAILED_OR_INCOMPLETE';throw error;}finally{await fs.writeFile(path.join(OUT,'browser.json'),JSON.stringify(report,null,2)+'\n');}});
async function rows(n){await expect.poll(async()=>canonicalRows(await owner.saved(fixture)).length).toBe(n);return canonicalRows(await owner.saved(fixture));}
async function context(browser,options={}){const {language='en',...browserOptions}=options;const c=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block',...browserOptions});await init(c,fixture,language);await c.route(/^https?:\/\//,route=>{if(new URL(route.request().url()).origin===ORIGIN)return route.continue();report.errors.push({type:'external-request',url:route.request().url()});return route.abort('blockedbyclient');});const p=await c.newPage();observe(p);try{await boot(p);return{c,p};}catch(error){await capture(p,'startup-failure').catch(()=>{});await c.close();throw error;}}
async function visibleCount(page,n){await expect.poll(async()=>(await scene(page))?.canonicalRecords?.length).toBe(n);}
async function switchFresh(page){await page.locator('[data-pip-control="toggle"]').click();await expect.poll(async()=>(await shot(page))?.mode).toBe('legacy');await enter(page);}
async function settled(page){await expect.poll(async()=>(await scene(page))?.interaction?.phase,{timeout:24000}).toBe('settled');}
async function externalMove(page,index,x,y){const r=canonicalRows(await owner.saved(fixture))[index];await realMutation(page.request,fixture,'yard.moveGoodie',{slotId:r.slotId,goodieId:'leaf_pot',x,y});await refresh(page);return r.slotId;}
async function externalPickup(page,index){const r=canonicalRows(await owner.saved(fixture))[index];await realMutation(page.request,fixture,'yard.pickupGoodie',{slotId:r.slotId});await refresh(page);return r.slotId;}
async function recoveryWitness(page){
 await expect.poll(async()=>(await scene(page))?.interaction?.phase,{timeout:2000,intervals:[20]}).toBe('recovering');
 const before=await scene(page);await page.waitForTimeout(100);const after=await scene(page);
 assert.deepEqual(after.dynamicSample.world.root,before.dynamicSample.world.root);assert.equal(after.dynamicSample.world.heading,before.dynamicSample.world.heading);
 for(const side of before.dynamicSample.world.support){assert.deepEqual(after.dynamicSample.world.feet[side].position,before.dynamicSample.world.feet[side].position);assert.equal(after.dynamicSample.world.feet[side].heading,before.dynamicSample.world.feet[side].heading);}
 return{before,after};
}
function propSignature(s){return{props:s.renderer.propInstances.filter(p=>p.visible&&!p.ghost).map(p=>({slotId:p.slotId,position:p.position})),camera:s.renderer.lastFrame.cameraWorld,projection:s.renderer.lastFrame.cameraProjection,css:s.renderer.lastFrame.cssRect};}
async function jitter(page,slotId){
 const samples=[],pixels=[],r=(await scene(page)).canonicalRecords.find(r=>r.slotId===slotId),box=await page.locator('.cy-scene').boundingBox();
 for(let i=0;i<4;i++){
  await page.waitForTimeout(120);const s=await scene(page),points=[];for(const x of[-5.5,5.5])for(const y of[-5.5,5.5])for(const z of[0,11])points.push(project(s,r.x+x,r.y+y,z));
  const crop={x:Math.floor(box.x+Math.min(...points.map(p=>p.x))),y:Math.floor(box.y+Math.min(...points.map(p=>p.y))),width:Math.ceil(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))),height:Math.ceil(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)))};
  assert(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=390&&crop.y+crop.height<=844);
  const png=await page.screenshot({clip:crop}),raw=await sharp(png).removeAlpha().raw().toBuffer();pixels.push(raw);samples.push({at:Date.now(),root:s.lastFrame.root,signature:propSignature(s),crop});
  if(i===0||i===3)await fs.writeFile(path.join(OUT,`stationary-prop-${i}.png`),png);
 }
 for(const s of samples)assert.deepEqual(s.signature,samples[0].signature,'Committed prop/camera transform changed during actor movement');
 const differences=pixels.slice(1).map(p=>{assert.equal(p.length,pixels[0].length);let changed=0,squared=0;for(let i=0;i<p.length;i++){const d=p[i]-pixels[0][i];if(d)changed++;squared+=d*d;}return{changedChannels:changed,totalChannels:p.length,rms:Math.sqrt(squared/p.length)};});
 // Crop pixels are evidence, not assumed identical: moving shadows/occlusion require visual review.
 const w=samples[0].crop.width,h=samples[0].crop.height;const displacement=pixels.slice(1).map(p=>{let best={dx:0,dy:0,meanAbsoluteError:Infinity};for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){let error=0,n=0;for(let y=3;y<h-3;y++)for(let x=3;x<w-3;x++)for(let k=0;k<3;k++){error+=Math.abs(p[((y+dy)*w+x+dx)*3+k]-pixels[0][(y*w+x)*3+k]);n++;}const mean=error/n;if(mean<best.meanAbsoluteError-1e-9||Math.abs(mean-best.meanAbsoluteError)<1e-9&&dx*dx+dy*dy<best.dx*best.dx+best.dy*best.dy)best={dx,dy,meanAbsoluteError:mean};}return best;});
 for(const shift of displacement){assert.equal(shift.dx,0,'Stationary prop crop moved horizontally');assert.equal(shift.dy,0,'Stationary prop crop moved vertically');}
 return{samples,differences,displacement,qualification:'Native screenshots over 4 actual-time samples plus exact stationary prop/camera transforms; pixel changes require visual review, not a device FPS benchmark.'};
}

test('finite real persistence, dynamic inspection and full HUD matrix',async({browser})=>{
 let active;
 try{
  active=await context(browser);let{p,c}=active;await enter(p);await visibleCount(p,0);await capture(p,'new-hud-initial');
  const baseline=economy(await owner.saved(fixture));
  const commands=[];let firstReply,release,committed;const didCommit=new Promise(r=>committed=r),gate=new Promise(r=>release=r);
  await p.route('**/api/player/mutate',async route=>{
   const command=route.request().postDataJSON();if(command?.action!=='yard.placeGoodie')return route.continue();assert.equal(command.accountId,fixture.id);assert.equal(route.request().headers().authorization,`dev ${fixture.externalId}`);commands.push(command);
   if(commands.length===1){const reply=await route.fetch();firstReply={status:reply.status(),body:await reply.json()};committed();await gate;return route.abort('failed');}return route.continue();
  });
  const duplicate=p.waitForResponse(async r=>r.url()===ORIGIN+'/api/player/mutate'&&r.request().postDataJSON()?.action==='yard.placeGoodie'&&r.status()===200&&(await r.json()).duplicate===true);
  try{await place(p,98,118);await didCommit;assert.equal(firstReply.status,200);const durable=await outbox(p,fixture.id);assert.equal(durable.version,2);assert.equal(durable.accountId,fixture.id);assert.equal(durable.items.length,1);assert.equal(durable.items[0].clientActionId,commands[0].clientActionId);assert.equal(durable.items[0].status,'sending');
   // The HTTP commit can precede the next rAF. Observe the actual pending draw,
   // including retired ghost and paused renderer, before measuring its clock.
   await expect.poll(async()=>{const s=await scene(p);return s?.itemActionPending===true&&s.itemEditing===false
    &&s.pauseReasons.includes('item-editor')&&s.lastFrame?.ghost===null
    &&['planter','empty'].includes(s.lastFrame.visibility)&&s.renderer?.paused===true
    &&s.renderer.lastFrame?.visibility===s.lastFrame.visibility;},{intervals:[20,50,100]}).toBe(true);
   const before=await scene(p);assert.equal(before.itemActionPending,true);assert(['planter','empty'].includes(before.lastFrame.visibility));await p.waitForTimeout(180);const after=await scene(p);assert.equal(after.itemActionPending,true);assert.equal(after.renderer.paused,true);assert.equal(after.lastFrame.visibility,before.lastFrame.visibility);assert.deepEqual(after.lastFrame.root,before.lastFrame.root);assert.equal(after.lastFrame.elapsedMs,before.lastFrame.elapsedMs);report.cases.push({name:'committed-response-held',before,after,durableOutbox:durable});}finally{release();}
  const replay=await(await duplicate).json();assert.equal(firstReply.body.duplicate,false);assert(commands.length>=2);assert.equal(new Set(commands.map(c=>c.clientActionId)).size,1);assert.equal(replay.clientActionId,commands[0].clientActionId);await p.unroute('**/api/player/mutate');
  await expect.poll(async()=>{const b=await outbox(p,fixture.id);return b?.accountId===fixture.id&&b.items.length===0;}).toBe(true);await rows(1);await visibleCount(p,1);
  assert.equal((await owner.saved(fixture)).yard.goodieInventory.leaf_pot,1);const first=canonicalRows(await owner.saved(fixture))[0];
  const receipts=(await owner.saved(fixture))._yardV2.runtime.commandReceipts;assert.equal(Object.keys(receipts).filter(k=>k===commands[0].clientActionId).length,1);
  await place(p,72,145);await rows(2);await visibleCount(p,2);assert.equal((await owner.saved(fixture)).yard.goodieInventory.leaf_pot??0,0);
  await p.reload();await expect(p.locator('.status-dot.ready')).toBeVisible();await expect(p.locator('[data-pip-control="canonical-items"]')).toBeEnabled();await enter(p);await visibleCount(p,2);
  await move(p,1,88,172);await expect.poll(async()=>Math.abs(canonicalRows(await owner.saved(fixture))[1]?.x-88)<0.25).toBe(true);assert.deepEqual(canonicalRows(await owner.saved(fixture))[0],first);
  await pickup(p,1);await rows(1);await closePanel(p);await pickup(p,0);await rows(0);await closePanel(p);assert.equal((await owner.saved(fixture)).yard.goodieInventory.leaf_pot,2);
  assert.deepEqual(economy(await owner.saved(fixture)),baseline);report.cases.push({name:'actual-ui-outbox-place-reload-move-pickup',sameNonce:commands[0].clientActionId,firstStatus:firstReply.status,replayDuplicate:replay.duplicate,inventoryRefunded:2});
  await place(p,98,118);await rows(1);await visibleCount(p,1);await place(p,88,172);await rows(2);await visibleCount(p,2);
  await c.close();active=null;

  // One untouched native Playwright recording, with wall-clock duration evidence.
  const recordingStart=Date.now();active=await context(browser,{recordVideo:{dir:path.join(WORK,'video'),size:{width:390,height:844}}});({p,c}=active);await enter(p);await visibleCount(p,2);
  const inspectionStart=Date.now();await inspect(p);const initial=await scene(p);assert.equal(initial.interaction.selectedAnchor,'leaf-7');assert.equal(initial.savedVisitor,false);assert.equal(initial.interaction.savedVisitor,false);
  const stable=await jitter(p,canonicalRows(await owner.saved(fixture))[1].slotId);await settled(p);const end=await scene(p);assert.equal(end.lastFrame.visibility,'both');await capture(p,'normal-two-prop-inspection');
  report.cases.push({name:'normal-two-committed-props',initial,end,stationaryProp:stable});const video=p.video();await c.close();active=null;
  const raw=await video.path(),target=path.join(OUT,'actual-time-inspection.webm');await fs.copyFile(raw,target);
  const media=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','format=duration:stream=width,height,r_frame_rate','-of','json',target],{encoding:'utf8',timeout:10000}));
  report.clip={file:'actual-time-inspection.webm',recordingWallMs:Date.now()-recordingStart,inspectionStartWallOffsetMs:inspectionStart-recordingStart,media,processing:'Untrimmed, unretimed native browser recording. No screenshot concatenation or interpolated frames.',qualification:'Software-rendered desktop Chromium; native video cadence is not device FPS.'};

  active=await context(browser);({p,c}=active);await enter(p);await visibleCount(p,2);
  await externalMove(p,1,94,135);await switchFresh(p);await inspect(p);await expect.poll(async()=>(await scene(p))?.interaction?.phase).toBe('approaching');const alternative=await scene(p);assert.notEqual(alternative.interaction.selectedAnchor,'leaf-7');assert.equal(alternative.interaction.savedVisitor,false);report.cases.push({name:'front-blocked-reachable-alternative',scene:alternative});
  // Mutate through actual authenticated HTTP, then a labelled synthetic visibility
  // notification invokes the app's real snapshot fetch without touching its store.
  const oldLayout=alternative.interaction.layoutKey;await externalMove(p,0,108,122);const moveRecovery=await recoveryWitness(p);
  await expect.poll(async()=>(await scene(p))?.interaction?.invalidations).toBeGreaterThan(alternative.interaction.invalidations);
  await expect.poll(async()=>{const s=await scene(p);return s.interaction.phase!=='recovering'&&s.interaction.phase!=='planning';}).toBe(true);
  const moved=await scene(p);assert.notEqual(moved.interaction.layoutKey,oldLayout);assert(['approaching','inspecting','settled','no-path','cancelled'].includes(moved.interaction.phase));if(moved.interaction.planLayoutKey)assert.equal(moved.interaction.planLayoutKey,moved.interaction.layoutKey);report.cases.push({name:'target-moved-during-approach',scene:moved,recovery:moveRecovery,refreshEventTrusted:false});
  await switchFresh(p);await inspect(p);await expect.poll(async()=>(await scene(p))?.interaction?.phase).toBe('approaching');const beforeDelete=await scene(p);await externalPickup(p,0);const deleteRecovery=await recoveryWitness(p);
  await expect.poll(async()=>(await scene(p))?.interaction?.phase).toBe('cancelled');const cancelled=await scene(p);assert.equal(cancelled.interaction.active,false);assert(cancelled.lastFrame.root.x!==79||cancelled.lastFrame.root.y!==129.5,'Cancellation must not teleport to entry');report.cases.push({name:'target-deleted-during-approach',before:beforeDelete,after:cancelled,recovery:deleteRecovery,refreshEventTrusted:false});
  await externalMove(p,0,35,115);await switchFresh(p);await inspect(p);await expect.poll(async()=>(await scene(p))?.interaction?.phase).toBe('no-path');const noPath=await scene(p);assert.equal(noPath.interaction.error,'NO_REACHABLE_INTERACTION_ANCHOR');await capture(p,'valid-item-no-reachable-anchor');report.cases.push({name:'valid-35-115-all-anchors-blocked',scene:noPath});
  await externalMove(p,0,98,118);await switchFresh(p);await placedPanel(p);await p.locator('[data-yard-action="move"]').click();await dragTo(p,100,120);const frozen=await scene(p);assert.equal(frozen.lastFrame.visibility,'planter');
  await p.locator('.cy-scene > canvas').dispatchEvent('pointercancel',{pointerId:1});await expect.poll(async()=>(await scene(p))?.lastFrame?.ghost===null).toBe(true);assert.equal(canonicalRows(await owner.saved(fixture))[0].x,98);
  await placedPanel(p);await p.locator('[data-yard-action="move"]').click();const cb=await p.locator('.cy-scene > canvas').boundingBox();await p.mouse.move(cb.x+cb.width/2,cb.y+cb.height/2);await p.mouse.down();await p.setViewportSize({width:844,height:390});await p.mouse.up();await expect.poll(async()=>(await scene(p))?.lastFrame?.ghost===null).toBe(true);await p.setViewportSize({width:390,height:844});await expect.poll(async()=>(await scene(p))?.viewportBlocked===false).toBe(true);
  const recovery=await scene(p);assert.equal(recovery.rgba.fits,true);assert(recovery.peakRgba<=64*1024*1024);assert(recovery.knownCPUBufferPeak<=16*1024*1024);assert.equal(recovery.resources.backingWidth,390);assert.equal(recovery.resources.backingHeight,648);assert.equal(recovery.resources.committedPropCapacity,2);assert.equal(recovery.resources.propBuffersShared,true);const resources=recovery.resources;assert(resources.geometryGPUBufferBytes+resources.boneDataTextureGPUBytesEstimate+resources.resizeDrawingBufferPeakEstimatedBytes+resources.compositorResizePeakBytesEstimate<=12*1024*1024);assert(resources.combinedKnownCPUBufferPeakBytes+resources.boneDataTextureCPUBytesEstimate<=16*1024*1024);
  await p.locator('[data-pip-control="toggle"]').click();await expect.poll(async()=>(await shot(p))?.mode).toBe('legacy');const worker=await p.evaluate(()=>window.__canonicalWorkerObserver);assert.equal(worker.created.filter(s=>s.includes('dynamic-prop-worker')).length,worker.terminated.filter(s=>s.includes('dynamic-prop-worker')).length);assert.equal(await p.locator('.cy-pip-direct-layer canvas').count(),0);
  report.cases.push({name:'pointercancel-resize-mode-off-worker-retirement',recovery,worker,syntheticPointerCancel:true});await c.close();active=null;

  // Full AGENTS HUD matrix plus one extended phone and native DPR3 typography pass.
  const matrix=[[320,568,1,'en'],[360,800,1,'ru'],[390,844,2,'en'],[414,896,1,'ru'],[568,320,1,'en'],[844,390,1,'ru'],[768,1024,1,'en'],[1024,768,1,'ru'],[1280,720,1,'en'],[375,812,1,'ru'],[390,844,3,'ru']];
  for(const[width,height,dpr,language]of matrix){
   active=await context(browser,{viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<1024||height>width,hasTouch:width<1280,language});({p,c}=active);await enter(p);
   const name=`hud-${width}x${height}-dpr${dpr}-${language}`,font=await fonts(p,language),screen=await layout(p);checkLayout(screen);await capture(p,name);if(dpr>=2)await p.locator('.cy-header').screenshot({path:path.join(OUT,`${name}-header-native.png`)});
   await p.locator('[data-pip-control="inventory"]').click();const dialog=await layout(p);checkLayout(dialog);await expect.poll(()=>p.locator('.cy-dialog').evaluate(e=>e.contains(document.activeElement))).toBe(true);
   if(dpr>=2)await p.locator('.cy-dialog').screenshot({path:path.join(OUT,`${name}-dialog-native.png`)});
   await closePanel(p);const s=await scene(p);report.matrix.push({viewport:screen,font,dialog,scene:{ready:s.ready,viewportBlocked:s.viewportBlocked,projection:s.projection,rgba:s.rgba},file:name+'.webp'});await c.close();active=null;
  }
  const ordinary=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await init(ordinary,fixture);const ordinaryPage=await ordinary.newPage();await ordinaryPage.goto(ORIGIN+'/?tab=room');await expect(ordinaryPage.locator('.cy-app')).toBeVisible();await expect(ordinaryPage.locator('[data-pip-control]')).toHaveCount(0);assert.equal(await ordinaryPage.evaluate(()=>window.__canonicalWorkerObserver.created.filter(s=>s.includes('dynamic-prop-worker')).length),0);await ordinary.close();report.cases.push({name:'on-build-without-page-opt-in-remains-ordinary'});
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));assert(!report.requests.some(r=>r.status>=400),'Runtime resource request failed');
  assert.deepEqual(economy(await owner.saved(fixture)),baseline);report.status='MECHANICAL_ACCEPTANCE_PASSED_VISUAL_REVIEW_PENDING';
 }catch(error){report.status='FAILED_OR_INCOMPLETE';report.errors.push({type:'assertion',message:String(error),stack:error.stack});if(active)await capture(active.p,'failure').catch(()=>{});throw error;}
 finally{await active?.c.close();}
});
