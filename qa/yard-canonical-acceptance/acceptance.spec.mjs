/** Actual production UI, outbox, authenticated Express mutations and PostgreSQL.
 * Diagnostic observations are read-only. Network loss is after a real commit. */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import setup from '../../src/games/companion-yard-v2/pip-prototype/data/fixture.json' with {type:'json'};
import {fixtureOwner,canonicalRows,economy,realMutation,ORIGIN} from './fixtures.mjs';
import {OUT,WORK,report,restoreEvidence,evidenceStatus,init,observe,boot,waitForYardReady,enter,scene,shot,placedPanel,closePanel,project,dragTo,place,move,pickup,inspect,refresh,capture,captureFailureDiagnostics,fonts,layout,checkLayout,outbox} from './browser-helpers.mjs';
let owner,fixture;
test.beforeAll(async()=>{await fs.mkdir(OUT,{recursive:true});await fs.mkdir(WORK,{recursive:true});const prior=await fs.readFile(path.join(OUT,'browser.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});restoreEvidence(report,prior,process.env.GITHUB_SHA);owner=await fixtureOwner();fixture=await owner.seed();});
test.afterEach(async({},info)=>{if(info.status!=='passed'){const section=info.title.startsWith('independent full HUD')?'hud':'actions';report.sections[section]='failed';report.errors.push({type:'test-status',section,status:info.status,message:info.error?.message??'Test did not complete'});}report.status=evidenceStatus(report);await fs.writeFile(path.join(OUT,'browser.json'),JSON.stringify(report,null,2)+'\n');});
test.afterAll(async()=>{try{await owner?.close();}catch(error){report.errors.push({type:'fixture-cleanup',message:String(error)});report.status='FAILED_OR_INCOMPLETE';throw error;}finally{report.status=evidenceStatus(report);await fs.writeFile(path.join(OUT,'browser.json'),JSON.stringify(report,null,2)+'\n');}});
async function rows(n){await expect.poll(async()=>canonicalRows(await owner.saved(fixture)).length).toBe(n);return canonicalRows(await owner.saved(fixture));}
async function context(browser,options={}){const {language='ru',evidenceLabel='startup-failure',...browserOptions}=options;const c=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block',...browserOptions});await init(c,fixture,language);await c.route(/^https?:\/\//,route=>{if(new URL(route.request().url()).origin===ORIGIN)return route.continue();report.errors.push({type:'external-request',url:route.request().url()});return route.abort('blockedbyclient');});const p=await c.newPage();observe(p,evidenceLabel);try{await boot(p,fixture);return{c,p,recording:!!options.recordVideo,recordingLabel:evidenceLabel};}catch(error){await captureFailureDiagnostics(p,evidenceLabel).catch(e=>report.errors.push({type:'failure-diagnostics',message:String(e)}));if(!options.recordVideo)await capture(p,evidenceLabel).catch(()=>{});const video=options.recordVideo?p.video():null;await c.close();if(video){const file=evidenceLabel+'-interrupted.webm';await fs.copyFile(await video.path(),path.join(OUT,file)).then(()=>{report.interruptedClips??=[];report.interruptedClips.push({file,processing:'Raw interrupted recording; no screenshot or retiming.'});}).catch(e=>report.errors.push({type:'failed-video-preservation',message:String(e)}));}throw error;}}
async function visibleCount(page,n){await expect.poll(async()=>{const s=await scene(page);return s?.canonicalRecords?.length===n&&s.lastFrame?.records?.length===n&&JSON.stringify(s.lastFrame.records)===JSON.stringify(s.canonicalRecords);}).toBe(true);}
async function switchFresh(page){await page.locator('[data-pip-control="toggle"]').click();await expect.poll(async()=>(await shot(page))?.mode).toBe('legacy');await enter(page);}
async function settled(page){await expect.poll(async()=>(await scene(page))?.interaction?.phase,{timeout:24000}).toBe('settled');}
async function externalMove(page,index,x,y){const r=canonicalRows(await owner.saved(fixture))[index];await realMutation(page.request,fixture,'yard.moveGoodie',{slotId:r.slotId,goodieId:'leaf_pot',x,y});await refresh(page);return r.slotId;}
async function externalPickup(page,index){const r=canonicalRows(await owner.saved(fixture))[index];await realMutation(page.request,fixture,'yard.pickupGoodie',{slotId:r.slotId});await refresh(page);return r.slotId;}
async function recoveryWitness(page){
 await expect.poll(async()=>{const s=await scene(page);return s?.interaction?.phase==='recovering'&&s.lastFrame?.intention==='support-preserving-recovery'&&s.dynamicSample?.poseRecovery&&JSON.stringify(s.lastFrame.root)===JSON.stringify(s.dynamicSample.world.root);},{timeout:2000,intervals:[20]}).toBeTruthy();
 const before=await scene(page);await page.waitForTimeout(100);const after=await scene(page);
 assert.deepEqual(after.dynamicSample.world.root,before.dynamicSample.world.root);assert.equal(after.dynamicSample.world.heading,before.dynamicSample.world.heading);
 for(const side of before.dynamicSample.world.support){assert.deepEqual(after.dynamicSample.world.feet[side].position,before.dynamicSample.world.feet[side].position);assert.equal(after.dynamicSample.world.feet[side].heading,before.dynamicSample.world.feet[side].heading);}
 return{before,after};
}
const rootDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
async function departed(page,entry,label){
 let observed;
 await expect.poll(async()=>{
  const s=await scene(page),world=s?.dynamicSample?.world;if(!world||s.interaction.phase!=='approaching'||s.lastFrame?.visibility!=='both')return false;
  const a=project(s,entry.dynamicSample.world.root.x,entry.dynamicSample.world.root.y),b=project(s,world.root.x,world.root.y);
  const moved=rootDistance(world.root,entry.dynamicSample.world.root)>1&&Math.hypot(a.x-b.x,a.y-b.y)>2;
  const sameFrame=JSON.stringify(s.lastFrame.root)===JSON.stringify(world.root)&&s.frameCount>entry.frameCount;
  if(moved&&sameFrame){observed=s;return true;}return false;
 },{timeout:12000,intervals:[20,50]}).toBe(true);
 report.cases.push({name:label+'-pre-mutation',entry,observed});return observed;
}
function mutationBoundary(before,recovery){
 const after=recovery.before,a=before.dynamicSample.world,b=after.dynamicSample.world;
 const elapsedMs=after.lastFrame.elapsedMs-before.lastFrame.elapsedMs;assert(elapsedMs>=0);
 const limit=setup.actor.maxSpeedSourcePerSecond*setup.actor.unitsPerSource*elapsedMs/1000;
 assert(rootDistance(a.root,b.root)<=limit+1e-5,'Root cannot jump between the final pre-request draw and first recovery draw');
 const sharedPlants=[];for(const side of a.support){if(a.feet[side].plantId!==b.feet[side].plantId)continue;assert.deepEqual(a.feet[side].position,b.feet[side].position);assert.equal(a.feet[side].heading,b.feet[side].heading);sharedPlants.push(side);}
 return{elapsedMs,frameCountBefore:before.frameCount,frameCountAfter:after.frameCount,rootDisplacement:rootDistance(a.root,b.root),maxRootDisplacement:limit,sharedPlantedSupports:sharedPlants,
  qualification:'Requests may span real animation frames; legal movement is bounded by measured actor speed. Recovery itself preserves root/heading/planted supports exactly.'};
}
async function captureHeldContact(page){
 await page.evaluate(()=>document.fonts.ready);
 const before=await scene(page);assert.equal(before.interaction.active,false);assert.equal(before.renderer.paused,true);assert.equal(before.renderer.contactShadow?.version,'pip-flat-ground-contact-v1');
 assert(before.pauseReasons.includes('canonical-idle'),'Use the existing idle pause; do not alter pose or clock');
 const box=await page.locator('.cy-scene').boundingBox(),anchor=project(before,before.dynamicSample.world.root.x,before.dynamicSample.world.root.y);
 const viewport=page.viewportSize(),clip={x:Math.max(0,Math.min(viewport.width-144,Math.floor(box.x+anchor.x-72))),y:Math.max(0,Math.min(viewport.height-96,Math.floor(box.y+anchor.y-60))),width:144,height:96};
 await page.screenshot({path:path.join(OUT,'new-hud-dpr2-native.png')});
 await page.screenshot({path:path.join(OUT,'contact-shadow-dpr2-native.png'),clip});
 const after=await scene(page);assert.deepEqual(after.dynamicSample.world,before.dynamicSample.world);assert.deepEqual(after.renderer.contactShadow,before.renderer.contactShadow);assert.equal(after.lastFrame.elapsedMs,before.lastFrame.elapsedMs);assert.deepEqual(after.renderer.lastFrame.cameraWorld,before.renderer.lastFrame.cameraWorld);
 const dpr=await page.evaluate(()=>devicePixelRatio);assert.equal(dpr,2);
 report.captures.push('new-hud-dpr2-native.png','contact-shadow-dpr2-native.png');
 report.contactEvidence={dpr,clip,sourceRaster:{width:390,height:648,dpr:1},world:before.dynamicSample.world,contactAnchors:before.renderer.contactShadow,rendererFrame:before.renderer.lastFrame,
  pausedReasons:before.pauseReasons,samePoseAndClockVerified:true,qualification:'Native DPR2 screenshot of the existing paused scene. World raster remains DPR1. No on/off toggle exists; this crop and anchor record do not establish grounding or shadow appearance quality.'};
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

test('real persistence, dynamic inspection and native recordings',async({browser})=>{
 test.setTimeout(125000);report.sections.actions='running';
 let active;
 try{
  report.browserVersion=browser.version();
  active=await context(browser,{deviceScaleFactor:2});await enter(active.p);await visibleCount(active.p,0);await captureHeldContact(active.p);await active.c.close();active=null;
  active=await context(browser);let{p,c}=active;await enter(p);await visibleCount(p,0);
  report.renderingBackend=await p.locator('.cy-pip-direct-layer canvas').evaluate(canvas=>{
   // Three has already initialized this visible direct canvas as WebGL2. This
   // retrieves that existing context; no new canvas or context is allocated.
   const gl=canvas.getContext('webgl2');if(!gl)return{classification:'unavailable',reason:'Existing WebGL2 context unavailable'};
   const debug=gl.getExtension('WEBGL_debug_renderer_info');const vendor=gl.getParameter(debug?debug.UNMASKED_VENDOR_WEBGL:gl.VENDOR),renderer=gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER);
   return{vendor,renderer,version:gl.getParameter(gl.VERSION),shadingLanguageVersion:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),debugRendererInfoAvailable:!!debug,
    classification:/swiftshader|llvmpipe|softpipe|software/i.test(`${vendor} ${renderer}`)?'software-renderer-reported':'backend-not-classified'};
  });
  await capture(p,'new-hud-initial');report.initialOwner=await shot(p);
  const baseline=economy(await owner.saved(fixture));
  const commands=[];let firstReply,release,committed;const didCommit=new Promise(r=>committed=r),gate=new Promise(r=>release=r);
  await p.route('**/api/player/mutate',async route=>{
   const command=route.request().postDataJSON();if(command?.action!=='yard.placeGoodie')return route.continue();assert.equal(command.accountId,fixture.id);assert.equal(route.request().headers().authorization,`dev ${fixture.externalId}`);commands.push(command);
   if(commands.length===1){const reply=await route.fetch();firstReply={status:reply.status(),body:await reply.json()};committed();await gate;return route.abort('failed');}return route.continue();
  });
  const duplicate=p.waitForResponse(async r=>r.url()===ORIGIN+'/api/player/mutate'&&r.request().postDataJSON()?.action==='yard.placeGoodie'&&r.status()===200&&(await r.json()).duplicate===true);
  // Observe early rejection without replacing this promise: the main await below
  // still rejects. A placement failure remains the primary reported assertion.
  duplicate.catch(()=>{});
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
  await waitForYardReady(p,fixture,()=>p.reload());await expect(p.locator('[data-pip-control="canonical-items"]')).toBeEnabled();await enter(p);await visibleCount(p,2);
  await move(p,1,88,172);await expect.poll(async()=>Math.abs(canonicalRows(await owner.saved(fixture))[1]?.x-88)<0.25).toBe(true);assert.deepEqual(canonicalRows(await owner.saved(fixture))[0],first);
  await pickup(p,1);await rows(1);await closePanel(p);await pickup(p,0);await rows(0);await closePanel(p);assert.equal((await owner.saved(fixture)).yard.goodieInventory.leaf_pot,2);
  assert.deepEqual(economy(await owner.saved(fixture)),baseline);report.cases.push({name:'actual-ui-outbox-place-reload-move-pickup',sameNonce:commands[0].clientActionId,firstStatus:firstReply.status,replayDuplicate:replay.duplicate,inventoryRefunded:2});
  await place(p,98,118);await rows(1);await visibleCount(p,1);await place(p,88,172);await rows(2);await visibleCount(p,2);
  await c.close();active=null;

  // One untouched native Playwright recording, with wall-clock duration evidence.
  const recordingStart=Date.now();active=await context(browser,{evidenceLabel:'normal-recording',recordVideo:{dir:path.join(WORK,'video'),size:{width:390,height:844}}});({p,c}=active);await enter(p);await visibleCount(p,2);
  const inspectionStart=Date.now();await inspect(p);const inspectionAdmittedAt=Date.now(),initial=await scene(p);assert.equal(initial.interaction.selectedAnchor,'leaf-7');assert.equal(initial.savedVisitor,false);assert.equal(initial.interaction.savedVisitor,false);
  // Keep this entire native recording free of screenshots and viewport changes.
  await settled(p);const end=await scene(p);assert.equal(end.lastFrame.visibility,'both');
  report.cases.push({name:'normal-two-committed-props',initial,end});const video=p.video();await c.close();active=null;
  const raw=await video.path(),target=path.join(OUT,'actual-time-inspection.webm');await fs.copyFile(raw,target);
  const media=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','format=duration:stream=width,height,r_frame_rate','-of','json',target],{encoding:'utf8',timeout:10000}));
  report.clip={file:'actual-time-inspection.webm',recordingWallMs:Date.now()-recordingStart,inspectionStartWallOffsetMs:inspectionStart-recordingStart,inspectionAdmittedWallOffsetMs:inspectionAdmittedAt-recordingStart,inspectionAdmittedAt,media,processing:'Untrimmed, unretimed native browser recording. No screenshot concatenation or interpolated frames.',qualification:'Actual Chromium/WebGL backend is recorded in renderingBackend; native video cadence is not device FPS.'};

  // Separate unrecorded context: raster crops cannot disturb the native clip.
  active=await context(browser);({p,c}=active);await enter(p);await visibleCount(p,2);await inspect(p);
  const stable=await jitter(p,canonicalRows(await owner.saved(fixture))[1].slotId);await settled(p);await capture(p,'normal-two-prop-inspection');report.cases.push({name:'separate-unrecorded-stationary-prop-check',stationaryProp:stable});await c.close();active=null;
  // Compact visual adaptation: actual UI moves the blocker while Pip is idle.
  const adaptationRecordingStart=Date.now();active=await context(browser,{evidenceLabel:'adaptation-recording',recordVideo:{dir:path.join(WORK,'adaptation-video'),size:{width:390,height:844}}});({p,c}=active);await enter(p);await visibleCount(p,2);
  const idleBefore=await scene(p);assert.equal(idleBefore.interaction.active,false);assert.deepEqual(idleBefore.dynamicSample.world.root,{x:79,y:129.5,z:0});
  const blockerMoveStartedAt=Date.now();await move(p,1,94,135);await expect.poll(async()=>{const r=canonicalRows(await owner.saved(fixture))[1];return Math.abs(r.x-94)<.25&&Math.abs(r.y-135)<.25;}).toBe(true);await visibleCount(p,2);
  const blockerCommittedAt=Date.now(),idleAfter=await scene(p);assert.deepEqual(idleAfter.dynamicSample.world.root,idleBefore.dynamicSample.world.root);
  const adaptationInspectStartedAt=Date.now();await inspect(p,0);const adaptationAdmittedAt=Date.now(),adaptationStart=await scene(p);assert.notEqual(adaptationStart.interaction.selectedAnchor,'leaf-7');await settled(p);const adaptationEnd=await scene(p);
  const adaptationVideo=p.video();await c.close();active=null;const adaptationFile='actual-time-alternate-route.webm';await fs.copyFile(await adaptationVideo.path(),path.join(OUT,adaptationFile));
  const adaptationMedia=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','format=duration:stream=width,height,r_frame_rate','-of','json',path.join(OUT,adaptationFile)],{encoding:'utf8',timeout:10000}));
  report.adaptationClip={file:adaptationFile,recordingWallMs:Date.now()-adaptationRecordingStart,blockerMoveStartedAt,blockerCommittedAt,adaptationInspectStartedAt,adaptationAdmittedAt,media:adaptationMedia,processing:'Raw untrimmed/unretimed native recording; actual UI blocker move then complete alternate route; no screenshots or viewport changes.',qualification:'Same saved target and real changed blocker; browser/software-renderer evidence, not device FPS.'};
  report.cases.push({name:'actual-ui-blocker-move-complete-alternate-route',idleBefore,idleAfter,initial:adaptationStart,end:adaptationEnd});
  active=await context(browser);({p,c}=active);await enter(p);await visibleCount(p,2);
  await switchFresh(p);const moveEntry=await scene(p);await inspect(p);await expect.poll(async()=>(await scene(p))?.interaction?.phase).toBe('approaching');const alternative=await scene(p);assert.notEqual(alternative.interaction.selectedAnchor,'leaf-7');assert.equal(alternative.interaction.savedVisitor,false);report.cases.push({name:'front-blocked-reachable-alternative',scene:alternative});
  // Mutate through actual authenticated HTTP, then a labelled synthetic visibility
  // notification invokes the app's real snapshot fetch without touching its store.
  const beforeMove=await departed(p,moveEntry,'target-move'),oldLayout=beforeMove.interaction.layoutKey;await externalMove(p,0,108,122);const moveRecovery=await recoveryWitness(p),moveBoundary=mutationBoundary(beforeMove,moveRecovery);
  await expect.poll(async()=>(await scene(p))?.interaction?.invalidations).toBeGreaterThan(alternative.interaction.invalidations);
  await expect.poll(async()=>{const s=await scene(p);return s.interaction.phase!=='recovering'&&s.interaction.phase!=='planning';}).toBe(true);
  const moved=await scene(p);assert.notEqual(moved.interaction.layoutKey,oldLayout);assert(['approaching','inspecting','settled','no-path','cancelled'].includes(moved.interaction.phase));if(moved.interaction.planLayoutKey)assert.equal(moved.interaction.planLayoutKey,moved.interaction.layoutKey);report.cases.push({name:'target-moved-during-approach',scene:moved,recovery:moveRecovery,boundary:moveBoundary,refreshEventTrusted:false});
  await switchFresh(p);const deleteEntry=await scene(p);await inspect(p);const beforeDelete=await departed(p,deleteEntry,'target-delete');await externalPickup(p,0);const deleteRecovery=await recoveryWitness(p),deleteBoundary=mutationBoundary(beforeDelete,deleteRecovery);
  await expect.poll(async()=>(await scene(p))?.interaction?.phase).toBe('cancelled');const cancelled=await scene(p);assert.equal(cancelled.interaction.active,false);assert.deepEqual(cancelled.dynamicSample.world.root,deleteRecovery.before.dynamicSample.world.root);assert.equal(cancelled.dynamicSample.world.heading,deleteRecovery.before.dynamicSample.world.heading);for(const side of deleteRecovery.before.dynamicSample.world.support){assert.deepEqual(cancelled.dynamicSample.world.feet[side].position,deleteRecovery.before.dynamicSample.world.feet[side].position);assert.equal(cancelled.dynamicSample.world.feet[side].heading,deleteRecovery.before.dynamicSample.world.feet[side].heading);}assert(cancelled.lastFrame.root.x!==79||cancelled.lastFrame.root.y!==129.5,'Cancellation must not teleport to entry');report.cases.push({name:'target-deleted-during-approach',before:beforeDelete,after:cancelled,recovery:deleteRecovery,boundary:deleteBoundary,refreshEventTrusted:false});
  await externalMove(p,0,35,115);await switchFresh(p);await inspect(p);await expect.poll(async()=>(await scene(p))?.interaction?.phase).toBe('no-path');const noPath=await scene(p);assert.equal(noPath.interaction.error,'NO_REACHABLE_INTERACTION_ANCHOR');await capture(p,'valid-item-no-reachable-anchor');report.cases.push({name:'valid-35-115-all-anchors-blocked',scene:noPath});
  await externalMove(p,0,98,118);await switchFresh(p);await placedPanel(p);await p.locator('[data-yard-action="move"]').click();await dragTo(p,100,120);const frozen=await scene(p);assert.equal(frozen.lastFrame.visibility,'planter');
  await p.locator('.cy-scene > canvas').dispatchEvent('pointercancel',{pointerId:1});await expect.poll(async()=>(await scene(p))?.lastFrame?.ghost===null).toBe(true);assert.equal(canonicalRows(await owner.saved(fixture))[0].x,98);
  await placedPanel(p);await p.locator('[data-yard-action="move"]').click();const cb=await p.locator('.cy-scene > canvas').boundingBox();await p.mouse.move(cb.x+cb.width/2,cb.y+cb.height/2);await p.mouse.down();await p.setViewportSize({width:844,height:390});await p.mouse.up();await expect.poll(async()=>(await scene(p))?.lastFrame?.ghost===null).toBe(true);await p.setViewportSize({width:390,height:844});await expect.poll(async()=>(await scene(p))?.viewportBlocked===false).toBe(true);
  const recovery=await scene(p);assert.equal(recovery.rgba.fits,true);assert(recovery.peakRgba<=64*1024*1024);assert(recovery.knownCPUBufferPeak<=16*1024*1024);assert.equal(recovery.resources.backingWidth,390);assert.equal(recovery.resources.backingHeight,648);assert.equal(recovery.resources.committedPropCapacity,2);assert.equal(recovery.resources.propBuffersShared,true);const resources=recovery.resources;assert(resources.geometryGPUBufferBytes+resources.boneDataTextureGPUBytesEstimate+resources.resizeDrawingBufferPeakEstimatedBytes+resources.compositorResizePeakBytesEstimate<=12*1024*1024);assert(resources.combinedKnownCPUBufferPeakBytes+resources.boneDataTextureCPUBytesEstimate<=16*1024*1024);
  await p.locator('[data-pip-control="toggle"]').click();await expect.poll(async()=>(await shot(p))?.mode).toBe('legacy');const worker=await p.evaluate(()=>window.__canonicalWorkerObserver);assert.equal(worker.created.filter(s=>s.includes('dynamic-prop-worker')).length,worker.terminated.filter(s=>s.includes('dynamic-prop-worker')).length);assert.equal(await p.locator('.cy-pip-direct-layer canvas').count(),0);
  report.cases.push({name:'pointercancel-resize-mode-off-worker-retirement',recovery,worker,syntheticPointerCancel:true});await c.close();active=null;

  const ordinary=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await init(ordinary,fixture);const ordinaryPage=await ordinary.newPage();await ordinaryPage.goto(ORIGIN+'/?tab=room');await expect(ordinaryPage.locator('.cy-app')).toBeVisible();await expect(ordinaryPage.locator('[data-pip-control]')).toHaveCount(0);assert.equal(await ordinaryPage.evaluate(()=>window.__canonicalWorkerObserver.created.filter(s=>s.includes('dynamic-prop-worker')).length),0);await ordinary.close();report.cases.push({name:'on-build-without-page-opt-in-remains-ordinary'});
  assert(!report.console.entries.some(e=>e.type==='error'&&/THREE\.WebGLProgram|VALIDATE_STATUS|shader.*error|shader.*compile|WebGL.*INVALID_OPERATION/i.test(e.text)),'WebGL/shader error captured in bounded console evidence');
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));assert(!report.requests.some(r=>r.status>=400),'Runtime resource request failed');
  assert.deepEqual(economy(await owner.saved(fixture)),baseline);report.sections.actions='passed';report.status=evidenceStatus(report);
 }catch(error){report.sections.actions='failed';report.status='FAILED_OR_INCOMPLETE';report.errors.push({type:'assertion',message:String(error),stack:error.stack});if(active){await captureFailureDiagnostics(active.p,'failure').catch(e=>report.errors.push({type:'failure-diagnostics',message:String(e)}));if(!active.recording)await capture(active.p,'failure').catch(()=>{});else{const interrupted=active.p.video(),failedVideo='failed-'+active.recordingLabel+'.webm';await active.c.close();active=null;try{await fs.copyFile(await interrupted.path(),path.join(OUT,failedVideo));report.interruptedClip={file:failedVideo,processing:'Untrimmed, unretimed failed native recording, preserved without screenshot calls.'};}catch(videoError){report.errors.push({type:'failed-video-preservation',message:String(videoError)});}}}throw error;}
 finally{await active?.c.close();}
});


// A failed action test restarts the worker; beforeAll reloads its saved report.
// A separate account and real API placement make this matrix independent of UI edits.
test('independent full HUD and typography matrix',async({browser,request})=>{
 test.setTimeout(75000);report.sections.hud='running';const errorStart=report.errors.length;let active;
 try{
  fixture=await owner.seed();await realMutation(request,fixture,'yard.placeGoodie',{slotId:'canonical:hud-one',goodieId:'leaf_pot',x:98,y:118});
  const matrix=[[320,568,1,'en'],[360,800,1,'ru'],[390,844,2,'en'],[414,896,1,'ru'],[568,320,1,'en'],[844,390,1,'ru'],[768,1024,1,'en'],[1024,768,1,'ru'],[1280,720,1,'en'],[375,812,1,'ru'],[390,844,3,'ru']];
  for(const[width,height,dpr,language]of matrix){
   const name=`hud-${width}x${height}-dpr${dpr}-${language}`;
   try{
    active=await context(browser,{evidenceLabel:name,viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<1024||height>width,hasTouch:width<1280,language});const{p}=active;await enter(p);
    const font=await fonts(p,language),screen=await layout(p);checkLayout(screen);await capture(p,name);if(dpr>=2)await p.locator('.cy-header').screenshot({path:path.join(OUT,`${name}-header-native.png`)});
    await p.locator('[data-pip-control="inventory"]').click();await expect(p.locator('.cy-dialog[open]')).toBeVisible();const dialog=await layout(p);checkLayout(dialog);await expect.poll(()=>p.locator('.cy-dialog').evaluate(e=>e.contains(document.activeElement))).toBe(true);
    if(dpr>=2)await p.locator('.cy-dialog').screenshot({path:path.join(OUT,`${name}-dialog-native.png`)});
    await closePanel(p);const snapshot=await scene(p);assert(!report.console.entries.some(e=>e.scope===name&&e.type==='error'&&/THREE\.WebGLProgram|VALIDATE_STATUS|shader.*error|shader.*compile|WebGL.*INVALID_OPERATION/i.test(e.text)),'HUD viewport shader error');
    report.matrix.push({name,status:'passed',viewport:screen,font,dialog,scene:{ready:snapshot.ready,viewportBlocked:snapshot.viewportBlocked,projection:snapshot.projection,rgba:snapshot.rgba},file:name+'.webp'});
   }catch(error){report.errors.push({type:'hud-viewport',name,message:String(error),stack:error.stack});report.matrix.push({name,status:'failed'});if(active){await captureFailureDiagnostics(active.p,name+'-failure').catch(()=>{});await capture(active.p,name+'-failure').catch(()=>{});}}
   finally{await active?.c.close();active=null;}
  }
  const errors=report.errors.slice(errorStart);report.sections.hud=errors.length?'failed':'passed';assert.equal(errors.length,0,JSON.stringify(errors));
 }catch(error){report.sections.hud='failed';if(report.errors.length===errorStart)report.errors.push({type:'hud-setup',message:String(error),stack:error.stack});throw error;}
 finally{await active?.c.close();report.status=evidenceStatus(report);}
});
