/** QA-only finite P2 cruise or item arrival in the actual normal Courtyard app.
 * Source-backed ephemeral fixture seeding precedes navigation. No browser Yard
 * command is allowed. Runtime camera, props, gait, clock and actor state are
 * never patched. Async loading races are covered by source tests, not this spec.
 */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startSwFixture} from './helpers/swFixture.mjs';
import {selectHomeGame} from './helpers/home.js';
import {applyActionWithReceipt} from '../../routes/player.js';
import {createProjection} from '../../src/games/companion-yard-v2/projection.mjs';

const SHA='2249774f8ced124451d3c46a8a69bc06a9889c7d9cc31c836a6dd868fd96f084';
const ASSET='/assets/yard-mika-p2-qa/p2.glb',ENCODED=3671320;
const expected=process.env.MIKA_QA_EXPECT_ENABLED;
if(!['true','false'].includes(expected))throw Error('Set MIKA_QA_EXPECT_ENABLED=true or false for the separately built app');
const off=expected==='false';
const itemApproach=process.env.MIKA_QA_EXPECT_ITEM_APPROACH==='true';
const arrival=process.env.MIKA_QA_EXPECT_ARRIVAL==='true',expectedDuration=arrival?6:4;
const selectedUi=process.env.MIKA_QA_EXPECT_SELECTED_UI==='true';
const continuation=process.env.MIKA_QA_EXPECT_CONTINUATION==='true',continuationClean=process.env.MIKA_QA_CLEAN_CONTINUATION==='true';
const captureTargets=arrival?[.2,3.9,4.25,4.9,5.8]:[.2,2,3.6];
const completedReason=arrival?'FINITE_ITEM_ARRIVAL_ENDED_NO_INTERACTION':itemApproach?'FINITE_ITEM_APPROACH_ENDED_NO_INTERACTION':'FINITE_CRUISE_ENDED_NO_TRANSITION';
test.use({serviceWorkers:'block'}); // viewport/DPR come exclusively from projects.
const read=page=>page.evaluate(()=>window.__yardMikaQa?.snapshot());
const qa=async page=>(await read(page))?.scene?.qaMika;
const requestNativeAction=(page,slot)=>page.evaluate(async slot=>{const start=performance.now(),result=await window.__yardMikaQa.requestItemArrival(slot),end=performance.now();return{...result,requestTiming:{start,end,wallMs:end-start}};},slot);

// Instrumentation only: observe actual WebGL->normal Canvas2D copies. Capture
// the full actor alpha raster at the requested phase landmarks, then the finished normal canvas
// after that same RAF call stack. No getContext/pixel/render behavior is changed.
function installPixelProbe({capturePixels=true,captureTargets=[.2,2,3.6],captureSteps=null,completeActions=0}={}){
 const webgl=new WeakSet(),get=HTMLCanvasElement.prototype.getContext,draw=CanvasRenderingContext2D.prototype.drawImage;
 const proof={instrumentedPixels:capturePixels,captures:[],errors:[],first:null,last:null,copies:0,recording:null,recordingDone:false,states:[],raf:{samples:0,maxGapMs:0,worst:null,gapsOver100ms:[],byPhase:{}}};
 let recorder,stream,chunks=[],pending=false,lastRaf=null,lastPhase=null;const targets=captureTargets;
 const png=canvas=>canvas.toDataURL('image/png').split(',')[1];
 HTMLCanvasElement.prototype.getContext=function(type,...args){const value=get.call(this,type,...args);if(value&&/^(webgl|webgl2|experimental-webgl)$/.test(type))webgl.add(this);return value;};
 CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
  const result=draw.call(this,image,...args);
  if(!this.canvas.matches?.('.cy-scene canvas')||!webgl.has(image))return result;
  try{
   const state=window.__yardMikaQa?.snapshot()?.scene?.qaMika;if(state?.phase!=='running'&&!(completeActions&&['parked','planning'].includes(state?.phase)))return result;
   proof.copies++;proof.last={wall:performance.now(),time:state.time};
   if(!proof.first){
    proof.first={wall:performance.now(),time:state.time};
    const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw Error('MEDIARECORDER_WEBM_UNAVAILABLE');
    stream=this.canvas.captureStream(25);recorder=new MediaRecorder(stream,{mimeType:mime});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onerror=e=>proof.errors.push(String(e.error||e));
    recorder.onstop=async()=>{try{const reader=new FileReader();reader.onload=()=>{proof.recording=String(reader.result).split(',')[1];proof.recordingDone=true;};reader.onerror=()=>proof.errors.push('RECORDING_READ_FAILED');reader.readAsDataURL(new Blob(chunks,{type:mime}));}catch(e){proof.errors.push(String(e));}finally{stream.getTracks().forEach(t=>t.stop());}};
    recorder.start();
   }
   const step=captureSteps?.[proof.captures.length],target=captureSteps?step?.time:targets[proof.captures.length];
   if(capturePixels&&!pending&&target!==undefined&&(!step||state.actionsStarted===step.action)&&state.time>=target){
    pending=true;const probeStarted=performance.now(),canvas=this.canvas,scratch=document.createElement('canvas');scratch.width=image.width;scratch.height=image.height;
    const ctx=get.call(scratch,'2d',{willReadFrequently:true});draw.call(ctx,image,0,0);
    const pixels=ctx.getImageData(0,0,scratch.width,scratch.height).data;let minX=scratch.width,minY=scratch.height,maxX=-1,maxY=-1,count=0,sumX=0,sumY=0;
    for(let y=0;y<scratch.height;y++)for(let x=0;x<scratch.width;x++)if(pixels[(y*scratch.width+x)*4+3]>2){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;sumX+=x;sumY+=y;}
    const capture={target,action:state.actionsStarted,time:state.time,wall:performance.now(),state:structuredClone(state),actorPNG:png(scratch),actorAlpha:{minX,minY,maxX,maxY,count,centroid:count?{x:sumX/count,y:sumY/count}:null,width:scratch.width,height:scratch.height}};
    queueMicrotask(()=>{try{capture.normalPNG=png(canvas);capture.canvas={width:canvas.width,height:canvas.height};capture.probeCostMs=performance.now()-probeStarted;proof.captures.push(capture);}catch(e){proof.errors.push(String(e));}finally{pending=false;}});
   }
  }catch(e){proof.errors.push(String(e));}return result;
 };
 function observe(stamp){const state=window.__yardMikaQa?.snapshot()?.scene?.qaMika;if(proof.first&&!proof.stopWall&&lastRaf!==null&&lastRaf>=proof.first.wall){const gap=stamp-lastRaf,row={start:lastRaf,end:stamp,gapMs:gap,phase:state?.phase,action:state?.actionsStarted};proof.raf.samples++;const key=lastPhase===state?.phase?state?.phase:lastPhase+'->'+state?.phase,aggregate=proof.raf.byPhase[key]??={samples:0,maxGapMs:0,worst:null};aggregate.samples++;if(gap>aggregate.maxGapMs){aggregate.maxGapMs=gap;aggregate.worst=row;}if(gap>proof.raf.maxGapMs){proof.raf.maxGapMs=gap;proof.raf.worst=row;}if(gap>100&&proof.raf.gapsOver100ms.length<40)proof.raf.gapsOver100ms.push(row);}lastRaf=stamp;lastPhase=state?.phase??null;if(state&&proof.states.at(-1)?.phase!==state.phase)proof.states.push({phase:state.phase,time:state.time,reason:state.reason});if(recorder?.state==='recording'&&(completeActions?(!['running','parked','planning'].includes(state?.phase)||state.actionsCompleted>=completeActions):state?.phase!=='running')){proof.stopWall=performance.now();recorder.stop();}requestAnimationFrame(observe);}
 requestAnimationFrame(observe);window.__mikaPixelProof=proof;
}
async function setup(page,{itemPosition=[64,54],language='en',additionalItems=[],info=null}={}){
 const fixture=await startSwFixture({gameActions:true,gardenMode:'r2'}),receipts=[],errors=[],commands=[],assetResponses=[],assetRequests=[],loadErrors=[],failedResources=[];
 try{
  // Existing source actions, ephemeral account only. Do not edit placement arrays.
  for(const [goodieId,slotId,x,y]of [...(itemApproach?[['yarn_mouse','qa-mouse',...itemPosition]]:[['yarn_mouse','qa-mouse',45,45],['sun_cushion','qa-cushion',54,66]]),...additionalItems]){
   if(!(fixture.player('account-a').yard.goodieInventory[goodieId]>0)){
    const purchase=await applyActionWithReceipt(fixture.player('account-a'),'yard.buyGoodie',{goodieId},{clientActionId:'yard-v2:mika-fixture-buy-'+slotId,gardenR2Enabled:true});
    receipts.push({action:'yard.buyGoodie',payload:{goodieId},status:purchase.status,body:purchase.body});assert.equal(purchase.status,200);assert.equal(purchase.body.error,undefined);
   }
   const payload={goodieId,slotId,x,y},result=await applyActionWithReceipt(fixture.player('account-a'),'yard.placeGoodie',payload,{clientActionId:'yard-v2:mika-fixture-'+slotId,gardenR2Enabled:true});
   receipts.push({action:'yard.placeGoodie',payload,status:result.status,body:result.body});assert.equal(result.status,200);assert.equal(result.body.error,undefined);
  }
  const initial=structuredClone(fixture.player('account-a').yard);assert.equal(initial.placedGoodies.length,(itemApproach?1:2)+additionalItems.length);
  page.on('console',message=>{if(message.type()==='error'&&loadErrors.length<20){const entry={text:message.text(),location:message.location()};loadErrors.push(entry);Promise.all(message.args().map(arg=>arg.evaluate(value=>value instanceof Error?{name:value.name,message:value.message,stack:value.stack}:String(value)))).then(args=>{entry.args=args;}).catch(error=>{entry.captureError=String(error);});}});
  page.on('requestfailed',request=>{if(failedResources.length<40)failedResources.push({url:request.url(),failure:request.failure()});});
  page.on('response',response=>{if(response.status()>=400&&failedResources.length<40)failedResources.push({url:response.url(),status:response.status()});});
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',request=>{if(new URL(request.url()).pathname===ASSET)assetRequests.push(request.url());});page.on('response',response=>{if(new URL(response.url()).pathname===ASSET)assetResponses.push(response);});
  await page.route('**/api/player/mutate',async route=>{const body=route.request().postDataJSON();if(body?.action?.startsWith('yard.')){commands.push(body);return route.abort('blockedbyclient');}return route.continue();});
  await page.addInitScript(()=>{window.__mikaNormalCanvasDraws=0;const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){const result=original.apply(this,args);if(this.canvas.matches?.('.cy-scene canvas'))window.__mikaNormalCanvasDraws++;return result;};});
  await page.addInitScript(language=>{localStorage.setItem('gh_dev_user_id','fixture-a');localStorage.setItem('garden_shelf_language',language);},language);
  return{fixture,receipts,initial,errors,commands,assetResponses,assetRequests,loadErrors,failedResources};
 }catch(e){if(info)await info.attach('source-setup-receipts.json',{body:Buffer.from(JSON.stringify(receipts,null,2)),contentType:'application/json'}).catch(()=>{});try{await fixture.close();}catch(cleanup){e.fixtureCleanupError=String(cleanup.stack||cleanup);}e.seedReceipts=receipts;throw e;}
}
async function readyRunning(page,{itemPosition=[64,54],propCount=itemApproach?1:2}={}){
 await expect(page.locator('.cy-app')).toBeVisible({timeout:30000});
 await expect.poll(async()=>{const d=await qa(page);if(d&&['blocked','unavailable','aborted','complete'].includes(d.phase))throw Error('Cruise never observed running: '+JSON.stringify(d));return d?.phase==='running'&&d.frames>0;},{timeout:30000,intervals:[25,50,100]}).toBe(true);
 const d=await qa(page);assert.equal(d.normalCamera,true);assert.equal(d.diagnosticCameraFit,false);assert.equal(d.rootOwner,'navigation');assert.equal(d.assetSha256,SHA);assert.equal(d.bones,22);
 const view=(await read(page)).scene.view;assert.equal(view.props.length,propCount);
 if(itemApproach){assert.equal(d.itemApproach.action,arrival?'finite-item-arrival':'finite-item-approach');assert.equal(d.itemApproach.target.slotId,'qa-mouse');assert.equal(d.itemApproach.target.x,itemPosition[0]);assert.equal(d.itemApproach.target.y,itemPosition[1]);assert.equal(d.itemApproach.interactionReady,false);assert.equal(d.itemApproach.savedVisitReady,false);}
 return d;
}
function arrivalEvidence(proof){
 if(!arrival)return;
 const settling=proof.captures.find(c=>c.time>=4.25&&c.time<4.9),idle=proof.captures.at(-1);
 assert(settling,'A real deceleration frame is required');
 assert.equal(settling.state.itemApproach.motionPhase,'arrival');
 assert(settling.state.itemApproach.rootSpeed>0&&settling.state.itemApproach.rootSpeed<.74);
 assert.equal(idle.state.itemApproach.motionPhase,'standing-idle');assert.equal(idle.state.itemApproach.rootSpeed,0);
 const stopped=proof.captures.find(c=>c.time>=4.9);
 assert(Math.hypot(stopped.state.position.x-idle.state.position.x,stopped.state.position.y-idle.state.position.y)<1e-8);
}
function unchanged(context){assert.deepEqual(context.commands,[],'No browser Yard commands');assert.deepEqual(context.fixture.player('account-a').yard,context.initial,'No Yard mutation after source-backed fixture setup');assert.deepEqual(context.errors,[]);}
function retired(d){assert.equal(d.resources.graphicsRetired,true);assert.equal(d.resources.rgbaBytes,0);assert.equal(d.resources.retainedModelCPUUpperBound,0);assert.equal(d.resources.retainedModelGPUBytes,0);}
async function evidence(page,info,context,error){
 const proof=await page.evaluate(()=>window.__mikaPixelProof??null).catch(()=>null);
 for(const [i,c]of (proof?.captures??[]).entries()){if(c.normalPNG)await info.attach(`normal-yard-${i}-${c.time.toFixed(3)}s.png`,{body:Buffer.from(c.normalPNG,'base64'),contentType:'image/png'});if(c.actorPNG)await info.attach(`actual-actor-alpha-${i}.png`,{body:Buffer.from(c.actorPNG,'base64'),contentType:'image/png'});delete c.normalPNG;delete c.actorPNG;}
 if(proof?.recording){await info.attach(proof.instrumentedPixels?'normal-yard-instrumented-pixel-proof.webm':'normal-yard-clean-1x-canvas.webm',{body:Buffer.from(proof.recording,'base64'),contentType:'video/webm'});delete proof.recording;}
 await info.attach('mika-normal-yard-evidence.json',{contentType:'application/json',body:Buffer.from(JSON.stringify({base:selectedUi?'7601d901e7248d6019ecd185c3e30c1b191c5a1b':continuation?'a4f00e639e1482c659c69ba11111916639609eb1':arrival?'8aab52a32e6eb6bf3bdd8083dd9ec3d4691823db':'1a66a9df3d177d1b8308bab223ad6f647a76f98a',durationSeconds:continuation?null:expectedDuration,initialDurationSeconds:expectedDuration,continuation,mode:selectedUi?'selected-persisted-item-command':continuation?'finite-current-pose-actions':arrival?'finite-item-arrival':itemApproach?'finite-item-approach':'finite-qa-cruise',ciRevision:process.env.GITHUB_SHA??null,project:info.project.name,itemApproach,scope:selectedUi?'Actual normal placed-item footer drives the existing current-pose native owner. RU/EN feedback, busy/refusal/cancellation, no saved-native admission or reward. UI clicks invoke the internal scene API; no global action surrogate.':continuation?'Two finite same-actor actions in the normal Yard scene. Source-bought second item; exact current stopped-pose handoff, stepped turn-away, constant-speed distance selection, arrival and explicit cleanup. No UI/saved admission, interaction, reward or general navigation.':arrival?'Source-action current-item placement, actual normal camera and six-second approach/contact-aware arrival/standing idle. Clean recording uses lightweight draw observation; pixel probes are instrumented. No saved visit, interaction, general navigation or performance acceptance.':'Seeded source-action fixture admission, actual normal Yard camera/props and finite cruise. Clean case uses MediaRecorder/lightweight draw observation, no in-flight raster scan or PNG. Pixel case is timing-instrumented. No performance, artistic, general navigation, entry/replan, or async browser-race acceptance.',publicAssetBuildDeltaBytes:ENCODED,flagOffOnlyPreventsRuntimeLoad:true,error:error?String(error.stack||error):null,errors:context.errors,loadErrors:context.loadErrors,failedResources:context.failedResources,pageURL:page.url(),commands:context.commands,nativeActions:context.nativeActions??null,selectedItemUi:context.uiCommandEvidence??null,arrivalDelivery:context.arrivalDelivery??null,sceneDeliveries:await page.evaluate(()=>window.__mikaArrivalDeliveries??null).catch(()=>null),assetRequests:context.assetRequests,seedReceipts:context.receipts,initialYard:context.initial,diagnostics:await read(page).catch(()=>null),proof},null,2))});
}

async function finish(page,info,context,failure,screenshot){
 // Preserve the first failure even if evidence collection or cleanup also fails.
 let first=failure;
 try{await evidence(page,info,context,failure);if(screenshot)await page.screenshot({path:info.outputPath(screenshot)});}
 catch(error){first??=error;await info.attach('evidence-collection-error.txt',{body:Buffer.from(String(error.stack||error)),contentType:'text/plain'}).catch(()=>{});}
 // Retire the browser's owned HTTP/WebSocket clients before Socket.IO waits
 // for the fixture HTTP server to close. Evidence above is already persisted.
 try{await page.close();}
 catch(error){first??=error;await info.attach('page-cleanup-error.txt',{body:Buffer.from(String(error.stack||error)),contentType:'text/plain'}).catch(()=>{});}
 try{await context.fixture.close();}
 catch(error){first??=error;await info.attach('fixture-cleanup-error.txt',{body:Buffer.from(String(error.stack||error)),contentType:'text/plain'}).catch(()=>{});}
 if(!failure&&first)throw first;
}

test(`Mika normal Yard: ${arrival?'six-second item arrival':'four-second seeded cruise'}, real pixels and retirement`,async({page},info)=>{
 test.skip(off,'Enabled QA build case');test.setTimeout(60000);const c=await setup(page);let failure;
 try{
  await page.addInitScript(installPixelProbe,{captureTargets});await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page);
  await expect.poll(async()=>(await qa(page))?.phase,{timeout:20000,intervals:[50,100]}).toBe('complete');
  await expect.poll(()=>page.evaluate(()=>window.__mikaPixelProof.recordingDone),{timeout:10000}).toBe(true);
  const d=await qa(page),p=await page.evaluate(()=>window.__mikaPixelProof);assert.equal(d.reason,completedReason);assert(d.time>=expectedDuration&&d.time<expectedDuration+1);assert(d.frames>=12);retired(d);assert.deepEqual(p.errors,[]);assert.equal(p.captures.length,captureTargets.length);arrivalEvidence(p);assert(p.copies>=12);assert(p.stopWall-p.first.wall>=expectedDuration*1000-500);assert(p.recording.length>1000);
  for(const capture of p.captures){assert(capture.time>=capture.target&&capture.time<capture.target+.35,'Capture must correspond to its named real-time interval');const b=capture.actorAlpha;assert(b.count>100,'Actual rendered actor pixels required');assert(b.minX>0&&b.minY>0&&b.maxX<b.width-1&&b.maxY<b.height-1,'Complete visible alpha bounds stay within frame');}
  const first=p.captures[0].actorAlpha.centroid,last=p.captures.at(-1).actorAlpha.centroid;assert(Math.hypot(last.x-first.x,last.y-first.y)>5,'Actual actor raster centroid must travel more than five CSS pixels on DPR1 QA surface');assert.notDeepEqual(p.captures[0].state.position,p.captures.at(-1).state.position);assert.equal(c.assetRequests.length,1);assert.equal(c.assetResponses.length,1);const bytes=await c.assetResponses[0].body();assert.equal(bytes.length,ENCODED);assert.equal(createHash('sha256').update(bytes).digest('hex'),SHA);
  assert.equal(d.resources.encodedGLBBytes,ENCODED);assert.equal(d.resources.modelCPUUpperBound,11013960);assert.equal(d.resources.modelGPUBytes,3538220);unchanged(c);
 }catch(e){failure=e;throw e;}finally{await finish(page,info,c,failure,failure?'normal-yard-failure.png':'normal-yard-complete.png');}
});

test(`Mika normal Yard: ${arrival?'six-second item arrival':'four-second seeded cruise'} clean 1x recording`,async({page},info)=>{
 test.skip(off,'Enabled QA build case');test.setTimeout(60000);const c=await setup(page);let failure;
 try{
  await page.addInitScript(installPixelProbe,{capturePixels:false});await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page);
  await expect.poll(async()=>(await qa(page))?.phase,{timeout:20000,intervals:[50,100]}).toBe('complete');
  await expect.poll(()=>page.evaluate(()=>window.__mikaPixelProof.recordingDone),{timeout:10000}).toBe(true);
  const d=await qa(page),p=await page.evaluate(()=>window.__mikaPixelProof);assert.equal(d.reason,completedReason);assert(d.time>=expectedDuration&&d.time<expectedDuration+1);assert(d.frames>=12);retired(d);assert.deepEqual(p.errors,[]);assert.equal(p.captures.length,0);assert.equal(p.instrumentedPixels,false);assert(p.stopWall-p.first.wall>=expectedDuration*1000-500);assert(p.recording.length>1000);unchanged(c);
 }catch(e){failure=e;throw e;}finally{await finish(page,info,c,failure);}
});

test('Mika normal Yard: editor entry retires cruise without committing placement',async({page},info)=>{
 test.skip(off,'Enabled QA build case');test.setTimeout(60000);const c=await setup(page);let failure;
 try{
  await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page);
  await page.locator('[data-nav-item="decor"]').click();await page.locator('[data-decor-tab="placed"]').click();await page.locator('.cy-catalog-choice[data-slot-id="qa-mouse"]').click();await page.locator('[data-yard-action="move"]').click();
  await expect.poll(async()=>(await qa(page))?.reason).toBe('ITEM_EDITING');const d=await qa(page);assert.equal(d.phase,'aborted');retired(d);await page.locator('.cy-scene canvas').press('Escape');unchanged(c);
 }catch(e){failure=e;throw e;}finally{await finish(page,info,c,failure,'normal-yard-editor.png');}
});

test('Mika normal Yard: actual game navigation disposes the QA owner',async({page},info)=>{
 test.skip(off,'Enabled QA build case');test.setTimeout(60000);const c=await setup(page);let failure;
 try{
  await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page);await page.evaluate(()=>{window.__mikaRetiredReader=window.__yardMikaQa.snapshot;});
  await page.locator('.cy-home').click();await expect(page.getByTestId('home-catalogue')).toBeVisible();
  await selectHomeGame(page,'blox');await expect.poll(()=>page.evaluate(()=>window.__yardMikaQa===undefined)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__mikaRetiredReader().lastRetired?.qaMika?.phase)).toBe('disposed');const old=await page.evaluate(()=>window.__mikaRetiredReader().lastRetired);retired(old.qaMika);assert.equal(old.disposed,true);unchanged(c);
  await info.attach('normal-yard-retired-owner.json',{body:Buffer.from(JSON.stringify(old,null,2)),contentType:'application/json'});
 }catch(e){failure=e;throw e;}finally{await finish(page,info,c,failure);}
});

test('Mika normal Yard: off-build never requests the QA actor',async({page},info)=>{
 test.skip(!off,'Separate build with VITE_YARD_MIKA_QA=false and MIKA_QA_EXPECT_ENABLED=false');test.setTimeout(60000);const c=await setup(page);let failure;
 try{await page.goto(c.fixture.origin+'/?tab=room');await expect(page.locator('.cy-scene canvas')).toBeVisible({timeout:30000});await expect.poll(()=>page.evaluate(()=>window.__yardPipIntegration?.snapshot()?.scene?.ready),{timeout:30000}).toBe(true);await expect.poll(()=>page.evaluate(()=>window.__mikaNormalCanvasDraws)).toBeGreaterThan(0);const before=await page.evaluate(()=>window.__mikaNormalCanvasDraws);await page.waitForTimeout(5000);assert((await page.evaluate(()=>window.__mikaNormalCanvasDraws))>before,'Normal scene keeps drawing during bounded five-second no-request observation');assert.equal(await read(page),undefined);assert.equal(c.assetRequests.length,0);assert.equal(c.assetResponses.length,0);unchanged(c);}
 catch(e){failure=e;throw e;}finally{await finish(page,info,c,failure);}
});



for(const itemPosition of [[70,70],[60,45]])test(`Mika normal Yard: current persisted item at ${itemPosition.join(',')} drives native ${arrival?'arrival':'approach'}`, async({page},info)=>{
 test.skip(off||!itemApproach,'Explicit finite-item candidate only');test.setTimeout(60000);
 const c=await setup(page,{itemPosition});let failure;
 try{
  await page.addInitScript(installPixelProbe,{captureTargets});await page.goto(c.fixture.origin+'/?tab=room');
  await readyRunning(page,{itemPosition});
  await expect.poll(async()=>(await qa(page))?.phase,{timeout:20000,intervals:[50,100]}).toBe('complete');
  await expect.poll(()=>page.evaluate(()=>window.__mikaPixelProof.recordingDone),{timeout:10000}).toBe(true);
  const d=await qa(page),p=await page.evaluate(()=>window.__mikaPixelProof);
  assert.equal(d.reason,completedReason);assert.equal(d.itemApproach.target.x,itemPosition[0]);assert.equal(d.itemApproach.target.y,itemPosition[1]);
  assert.equal(d.itemApproach.interactionReady,false);assert.equal(p.captures.length,captureTargets.length);arrivalEvidence(p);assert.deepEqual(p.errors,[]);
  for(const capture of p.captures){const b=capture.actorAlpha;assert(b.count>100);assert(b.minX>0&&b.minY>0&&b.maxX<b.width-1&&b.maxY<b.height-1);}
  assert.notDeepEqual(p.captures[0].state.position,p.captures.at(-1).state.position);retired(d);unchanged(c);
 }catch(e){failure=e;throw e;}finally{await finish(page,info,c,failure,failure?'item-approach-failure.png':undefined);}
});

for(const language of ['en','ru'])test(`Mika normal Yard: navigation labels and selection ${language}`,async({page},info)=>{
 test.skip(off,'Enabled QA build case');test.setTimeout(60000);
 const c=await setup(page,{language});let failure;
 const labels=language==='ru'?['Еда','Декор','Гости']:['Food','Items','Guests'];
 const ids=['food','decor','guests'];
 try{
  await page.goto(c.fixture.origin+'/?tab=room');await expect(page.locator('.cy-app')).toBeVisible();
  await expect.poll(async()=>(await read(page))?.scene?.ready,{timeout:30000}).toBe(true);
  const nav=page.locator('.cy-actions'),buttons=nav.locator('button[data-nav-item]');
  await expect(buttons).toHaveCount(3);
  await expect(nav.locator('strong')).toHaveText(labels);
  await expect.poll(()=>buttons.locator('img').evaluateAll(images=>images.length===3&&images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true);
  await page.evaluate(()=>document.fonts.ready);
  const measurements=await buttons.evaluateAll(nodes=>nodes.map(node=>{
   const r=node.getBoundingClientRect(),label=node.querySelector('strong'),l=label.getBoundingClientRect();
   const style=getComputedStyle(node),textStyle=getComputedStyle(label),skin=getComputedStyle(node,'::before');
   return {id:node.dataset.navItem,name:node.getAttribute('aria-label'),text:label.textContent,
    width:r.width,height:r.height,fontSize:Number.parseFloat(textStyle.fontSize),labelDisplay:textStyle.display,
    labelInside:l.left>=r.left&&l.right<=r.right&&l.top>=r.top&&l.bottom<=r.bottom,
    overflow:node.scrollWidth>node.clientWidth+1||node.scrollHeight>node.clientHeight+1,
    transform:style.transform,textTransform:textStyle.transform,textFilter:textStyle.filter,
    skinDisplay:skin.display,skinSource:skin.borderImageSource};
  }));
  for(const [i,m]of measurements.entries()){
   assert.equal(m.text,labels[i]);assert(m.name.startsWith(labels[i]+'.'),'Accessible name starts with visible label');
   assert(m.width>=44&&m.height>=44,'Minimum practical touch target');assert(m.fontSize>=12);
   assert.equal(m.labelDisplay,'block');assert.equal(m.labelInside,true);assert.equal(m.overflow,false);
   assert.equal(m.transform,'none');assert.equal(m.textTransform,'none');assert.equal(m.textFilter,'none');
   assert.notEqual(m.skinDisplay,'none');assert(m.skinSource.includes('yard-ui-button-sage-be06b62e0b3e.webp'));
  }
  if(language==='ru')assert(measurements[1].name.includes('Предметы.'),'Retain original full accessible title');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  assert.equal(overflow,false,'No horizontal page overflow');
  await info.attach('navigation-measurements.json',{body:Buffer.from(JSON.stringify({language,project:info.project.name,viewport:page.viewportSize(),dpr:await page.evaluate(()=>devicePixelRatio),measurements},null,2)),contentType:'application/json'});
  await page.screenshot({path:info.outputPath(`nav-${language}-initial.png`)});
  const dialog=page.locator('.cy-dialog');
  for(const [i,id]of ids.entries()){
   const button=nav.locator(`[data-nav-item="${id}"]`);
   if(info.project.use.hasTouch)await button.tap();else await button.click();
   await expect(dialog).toBeVisible();await expect(button).toHaveAttribute('aria-expanded','true');
   await expect(button).toHaveAttribute('aria-pressed','true');
   await expect(nav.locator('button[aria-pressed="true"]')).toHaveCount(1);
   await expect(nav.locator('button[aria-expanded="true"]')).toHaveCount(1);
   await expect(button).toHaveAccessibleName(new RegExp('^'+labels[i]+'\\.'));
   await dialog.locator(':scope > header > button').click();
   await expect(dialog).not.toBeVisible();await expect(button).toHaveAttribute('aria-expanded','false');
   await expect(button).toHaveAttribute('aria-pressed','true');await expect(button).toBeFocused();
   const selected=await button.evaluate(node=>({outlineWidth:getComputedStyle(node).outlineWidth,underline:getComputedStyle(node.querySelector('strong')).textDecorationLine}));
   assert(Number.parseFloat(selected.outlineWidth)>=2);assert(selected.underline.includes('underline'));
   await page.screenshot({path:info.outputPath(`nav-${language}-${id}-selected.png`)});
   // Reopen the same current item using the keyboard, then dismiss with Escape.
   await page.keyboard.press('Tab');await button.focus();
   await expect(button).toBeFocused();
   assert.equal(await button.evaluate(node=>node.matches(':focus-visible')),true);
   await button.press('Enter');await expect(dialog).toBeVisible();
   await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
   await expect(button).toHaveAttribute('aria-expanded','false');await expect(button).toBeFocused();
   await expect(page.locator('[data-testid="home-catalogue"]')).toHaveCount(0);
  }
  await page.screenshot({path:info.outputPath(`nav-${language}-keyboard-focus.png`)});
  unchanged(c);
 }catch(e){failure=e;throw e;}finally{await finish(page,info,c,failure,failure?`nav-${language}-failure.png`:undefined);}
});


test('Mika normal Yard: current target relocation during arrival retires the native owner',async({page},info)=>{
 test.skip(off||!arrival,'Explicit arrival candidate only');test.setTimeout(60000);const c=await setup(page);let failure;
 try{
  await page.addInitScript(installPixelProbe,{capturePixels:false});
  await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page);
  await expect.poll(()=>c.fixture.realtimeConnections()).toBeGreaterThan(0);
  // Observe actual scene delivery, separately from the source HTTP receipt.
  await page.evaluate(()=>{
   const deliveries=window.__mikaArrivalDeliveries=[];let previous='',frames=0;
   function observe(){
    const scene=window.__yardMikaQa?.snapshot()?.scene,d=scene?.qaMika,item=scene?.view?.yard?.placedGoodies?.find(row=>row.slotId==='qa-mouse');
    const signature=JSON.stringify([d?.phase,d?.reason,item?.x,item?.y]);
    if(signature!==previous){previous=signature;deliveries.push({wall:performance.now(),epoch:Date.now(),time:d?.time,phase:d?.phase,reason:d?.reason,item:item?{x:item.x,y:item.y}:null,serverNow:scene?.view?.runtime?.serverNow});}
    if(++frames<1200&&deliveries.length<20)requestAnimationFrame(observe);
   }observe();
  });
  await expect.poll(async()=>{const d=await qa(page);return d?.phase==='running'&&d.time>=4.05;},{timeout:15000,intervals:[20,30]}).toBe(true);
  c.arrivalDelivery={trigger:{epoch:Date.now(),qa:await qa(page)},previousSeq:c.fixture.player('account-a')._syncSeq||0};
  assert(c.arrivalDelivery.trigger.qa.time<4.9,'Move must start during arrival, before idle');
  const payload={slotId:'qa-mouse',x:70,y:70};
  const response=await fetch(c.fixture.origin+'/api/player/mutate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'tma fixture-a'},body:JSON.stringify({action:'yard.moveGoodie',payload,clientActionId:'yard-v2:mika-arrival-relocate'})});
  const body=await response.json();c.receipts.push({action:'yard.moveGoodie',payload,status:response.status,body});
  c.arrivalDelivery.receipt={epoch:Date.now(),qa:await qa(page)};
  assert.equal(response.status,200);assert.equal(body.error,undefined);assert(body.snapshot);
  const current=c.fixture.player('account-a'),snapshot=body.snapshot;
  assert.equal(snapshot.player.id,current.id);assert.equal(snapshot.player.syncSeq,c.arrivalDelivery.previousSeq+1);assert.equal(current._syncSeq,snapshot.player.syncSeq);
  // playerManager emits an account-scoped realtime projection, not an HTTP
  // snapshot. realtimeClient intentionally drops payloads without accountId.
  const realtimePayload={accountId:current.id,serverTime:snapshot.serverTime,syncSeq:current._syncSeq,
   gardenR2:snapshot.gardenR2,resources:current.resources,harvested:current.farm.harvested,plots:current.farm.plots,
   merge:current.merge,garden:current.garden,yard:snapshot.yard,yardRuntime:snapshot.yardRuntime,pet:current.pet,achievements:current.achievements};
  c.arrivalDelivery.emission={epoch:Date.now(),accountId:realtimePayload.accountId,syncSeq:realtimePayload.syncSeq,serverTime:realtimePayload.serverTime};
  c.fixture.emitPlayerSync(realtimePayload);
  await expect.poll(async()=>(await qa(page))?.reason,{timeout:5000}).toBe('LAYOUT_CHANGED');
  const d=await qa(page);assert.equal(d.phase,'aborted');assert(d.time>=4.05&&d.time<6,'Changed layout must retire the active arrival before completion');retired(d);
  await expect.poll(()=>page.evaluate(()=>window.__mikaArrivalDeliveries.some(row=>row.item?.x===70&&row.item?.y===70&&row.phase==='aborted'&&row.reason==='LAYOUT_CHANGED'&&row.time<6))).toBe(true);
  c.arrivalDelivery.retired={epoch:Date.now(),qa:d};
  assert.equal(current.yard.placedGoodies[0].x,70);assert.equal(current.yard.placedGoodies[0].y,70);
  assert.deepEqual(current.yard.goodieInventory,c.initial.goodieInventory);assert.deepEqual(current.yard.currencies,c.initial.currencies);
  assert.deepEqual(c.commands,[]);assert.deepEqual(c.errors,[]);
  await expect.poll(()=>page.evaluate(()=>window.__mikaPixelProof.recordingDone),{timeout:10000}).toBe(true);
 }catch(error){failure=error;throw error;}finally{await finish(page,info,c,failure,failure?'arrival-relocation-failure.png':undefined);}
});


const continuationCaptureSteps=[{action:1,time:.2},{action:1,time:5.8},{action:1,time:6},{action:2,time:2},{action:2,time:5.35},{action:2,time:6.4},{action:2,time:7.4},{action:2,time:9.4},{action:2,time:11.2}];
for(const nextPosition of [[88,62],[87,57],[87,54]])test(`Mika current-pose continuation: ${continuationClean?'clean two-item recording':'actual two-item arrival'} to ${nextPosition.join(',')}`,async({page},info)=>{
 test.skip(off||!continuation,'Explicit current-pose candidate only');test.setTimeout(90000);
 const c=await setup(page,{itemPosition:[60,45],additionalItems:[['yarn_mouse','qa-mouse-next',...nextPosition]],info});let failure;
 try{
  await page.addInitScript(installPixelProbe,{capturePixels:!continuationClean,captureSteps:continuationCaptureSteps,completeActions:2});
  await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page,{itemPosition:[60,45],propCount:2});
  const invoke=slot=>requestNativeAction(page,slot);
  c.nativeActions=[];c.nativeActions.push(await invoke('qa-mouse-next'));assert.equal(c.nativeActions.at(-1).reason,'NATIVE_ACTOR_NOT_SETTLED');
  await expect.poll(async()=>(await qa(page))?.phase,{timeout:15000,intervals:[30,50]}).toBe('parked');
  const parked=await qa(page);assert.equal(parked.actionsCompleted,1);assert.equal(parked.resources.graphicsRetired,false);
  await expect.poll(async()=>(await qa(page))?.resources?.parkedRasterCopies).toBeGreaterThan(1);
  if(!continuationClean){await expect.poll(()=>page.evaluate(()=>window.__mikaPixelProof.captures.some(row=>row.action===1&&row.target===6))).toBe(true);const equal=await page.evaluate(()=>window.__mikaPixelProof.captures.find(row=>row.action===1&&row.target===6).normalPNG===document.querySelector('.cy-scene canvas').toDataURL('image/png').split(',')[1]);assert.equal(equal,true,'Cached parked composite must equal its original native-render pixels');}
  c.nativeActions.push(await invoke('missing'));assert.equal(c.nativeActions.at(-1).reason,'NATIVE_ITEM_TARGET_UNAVAILABLE');
  c.nativeActions.push(await invoke('qa-mouse'));assert.equal(c.nativeActions.at(-1).reason,'ALREADY_ARRIVED');
  const unchangedPose=await qa(page);assert.deepEqual(unchangedPose.position,parked.position);assert.equal(unchangedPose.heading,parked.heading);assert.equal(unchangedPose.time,parked.time);assert.equal(unchangedPose.actorInstance,parked.actorInstance);
  c.nativeActions.push(await invoke('qa-mouse-next'));assert.equal(c.nativeActions.at(-1).ok,true);
  const started=await qa(page);assert.equal(started.actionsStarted,2);assert.equal(started.actorInstance,parked.actorInstance);assert.deepEqual(started.plan.start,parked.position);assert.equal(started.plan.heading,parked.heading);assert.equal(started.itemApproach.target.x,nextPosition[0]);assert.equal(started.itemApproach.target.y,nextPosition[1]);
  const normalProjection=(await read(page)).scene.projection,p=createProjection(normalProjection.width,normalProjection.height),box=started.itemApproach.target.box,corners=[{x:box.x,y:box.y},{x:box.x+box.width,y:box.y},{x:box.x,y:box.y+box.height},{x:box.x+box.width,y:box.y+box.height}].map(point=>p.project(point));const framing={target:nextPosition,viewport:normalProjection,corners,fullFootprintInside:corners.every(q=>q.x>=3&&q.x<=p.width-3&&q.y>=3&&q.y<=p.height-3)};await info.attach('target-framing.json',{body:Buffer.from(JSON.stringify(framing,null,2)),contentType:'application/json'});if(nextPosition[0]===87&&nextPosition[1]===54)assert.equal(framing.fullFootprintInside,true,'The demonstrated target footprint must fit the actual normal camera');
  c.nativeActions.push(await invoke('qa-mouse-next'));assert.equal(c.nativeActions.at(-1).reason,'NATIVE_ACTOR_NOT_SETTLED');
  await expect.poll(async()=>(await qa(page))?.actionsCompleted,{timeout:25000,intervals:[40,80]}).toBe(2);
  await expect.poll(()=>page.evaluate(()=>window.__mikaPixelProof.recordingDone),{timeout:10000}).toBe(true);
  const d=await qa(page),proof=await page.evaluate(()=>window.__mikaPixelProof);assert.equal(d.phase,'parked');assert.equal(d.actorInstance,parked.actorInstance);assert.equal(d.actionsStarted,2);assert.equal(d.itemApproach.motionPhase,'standing-idle');assert.equal(d.itemApproach.rootSpeed,0);assert.equal(c.assetRequests.length,1);assert.equal(c.assetResponses.length,1);assert.deepEqual(proof.errors,[]);assert.equal(proof.captures.length,continuationClean?0:continuationCaptureSteps.length);assert(proof.stopWall-proof.first.wall>=17000);
  for(const capture of proof.captures){const b=capture.actorAlpha;assert(b.count>100);assert(b.minX>0&&b.minY>0&&b.maxX<b.width-1&&b.maxY<b.height-1);assert(capture.time>=capture.target&&capture.time<capture.target+.35);}
  if(!continuationClean){assert.equal(proof.captures.find(row=>row.action===2&&row.target===2).state.itemApproach.motionPhase,'turning-away');assert.equal(proof.captures.find(row=>row.action===2&&row.target===6.4).state.itemApproach.motionPhase,'departing');}
  unchanged(c);await info.attach('two-leg-terminal-owner.json',{body:Buffer.from(JSON.stringify({parked,d},null,2)),contentType:'application/json'});
  // The ordinary scene owner, not a test-only dispose command, retires the
  // retained actor when the player navigates to another actual game.
  await page.evaluate(()=>{window.__mikaRetiredReader=window.__yardMikaQa.snapshot;});await page.locator('.cy-home').click();await expect(page.getByTestId('home-catalogue')).toBeVisible();await selectHomeGame(page,'blox');
  await expect.poll(()=>page.evaluate(()=>window.__mikaRetiredReader().lastRetired?.qaMika?.phase)).toBe('disposed');const old=await page.evaluate(()=>window.__mikaRetiredReader().lastRetired.qaMika);retired(old);assert.equal(old.actorInstance,parked.actorInstance);await info.attach('two-leg-retired-owner.json',{body:Buffer.from(JSON.stringify(old,null,2)),contentType:'application/json'});unchanged(c);
 }catch(error){failure=error;throw error;}finally{await finish(page,info,c,failure,failure?'current-pose-failure.png':undefined);}
});

test('Mika current-pose continuation: moving the selected item during turn cancels without pose reset',async({page},info)=>{
 test.skip(off||!continuation,'Explicit current-pose candidate only');test.setTimeout(90000);
 const c=await setup(page,{itemPosition:[60,45],additionalItems:[['yarn_mouse','qa-mouse-next',88,62]],info});let failure;
 try{
  await page.addInitScript(installPixelProbe,{capturePixels:false,completeActions:2});await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page,{itemPosition:[60,45],propCount:2});
  await expect.poll(()=>c.fixture.realtimeConnections()).toBeGreaterThan(0);
  await expect.poll(async()=>(await qa(page))?.phase,{timeout:15000}).toBe('parked');const parked=await qa(page);
  c.nativeActions=[await requestNativeAction(page,'qa-mouse-next')];assert.equal(c.nativeActions[0].ok,true);
  await expect.poll(async()=>{const d=await qa(page);return d?.phase==='running'&&d.actionsStarted===2&&d.time>=2;},{timeout:10000,intervals:[30,50]}).toBe(true);
  const before=await qa(page),payload={slotId:'qa-mouse-next',x:87,y:57},previousSeq=c.fixture.player('account-a')._syncSeq||0;
  assert.equal(before.itemApproach.motionPhase,'turning-away');assert.deepEqual(before.position,parked.position);
  const response=await fetch(c.fixture.origin+'/api/player/mutate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'tma fixture-a'},body:JSON.stringify({action:'yard.moveGoodie',payload,clientActionId:'yard-v2:mika-turn-relocate'})}),body=await response.json();c.receipts.push({action:'yard.moveGoodie',payload,status:response.status,body});assert.equal(response.status,200);assert.equal(body.error,undefined);
  const current=c.fixture.player('account-a'),s=body.snapshot;assert.equal(s.player.id,current.id);assert.equal(s.player.syncSeq,previousSeq+1);assert.equal(current._syncSeq,s.player.syncSeq);
  c.fixture.emitPlayerSync({accountId:current.id,serverTime:s.serverTime,syncSeq:current._syncSeq,gardenR2:s.gardenR2,resources:current.resources,harvested:current.farm.harvested,plots:current.farm.plots,merge:current.merge,garden:current.garden,yard:s.yard,yardRuntime:s.yardRuntime,pet:current.pet,achievements:current.achievements});
  await expect.poll(async()=>(await qa(page))?.reason,{timeout:5000}).toBe('LAYOUT_CHANGED');const d=await qa(page);assert.equal(d.phase,'aborted');assert(d.time>=2&&d.time<5.35);assert.equal(d.actorInstance,parked.actorInstance);assert.deepEqual(d.position,parked.position);retired(d);
  await expect.poll(async()=>(await read(page))?.scene?.view?.yard?.placedGoodies?.find(row=>row.slotId==='qa-mouse-next')?.x).toBe(87);
  c.nativeActions.push(await requestNativeAction(page,'qa-mouse-next'));assert.equal(c.nativeActions.at(-1).reason,'NATIVE_ACTION_UNAVAILABLE');assert.equal(c.assetRequests.length,1);assert.deepEqual(current.yard.goodieInventory,c.initial.goodieInventory);assert.deepEqual(current.yard.currencies,c.initial.currencies);assert.deepEqual(c.commands,[]);assert.deepEqual(c.errors,[]);
  await expect.poll(()=>page.evaluate(()=>window.__mikaPixelProof.recordingDone),{timeout:10000}).toBe(true);
 }catch(error){failure=error;throw error;}finally{await finish(page,info,c,failure,failure?'current-pose-cancel-failure.png':undefined);}
});


test('Mika current-pose continuation: source entry rejection at88,65 remains unplaced and unavailable',async({page},info)=>{
 test.skip(off||!continuation,'Explicit current-pose candidate only');test.setTimeout(60000);const c=await setup(page,{itemPosition:[60,45],info});let failure;
 try{
  const player=c.fixture.player('account-a'),purchase=await applyActionWithReceipt(player,'yard.buyGoodie',{goodieId:'yarn_mouse'},{clientActionId:'yard-v2:mika-entry-buy',gardenR2Enabled:true});
  c.receipts.push({action:'yard.buyGoodie',status:purchase.status,body:purchase.body});assert.equal(purchase.status,200);assert.equal(purchase.body.error,undefined);c.initial=structuredClone(player.yard);
  const rejectedAt=Math.max(Date.now(),c.initial.lastSimulatedAt+1),payload={goodieId:'yarn_mouse',slotId:'qa-mouse-next',x:88,y:65},result=await applyActionWithReceipt(player,'yard.placeGoodie',payload,{clientActionId:'yard-v2:mika-entry-invalid',gardenR2Enabled:true,serverNow:rejectedAt});
  c.receipts.push({action:'yard.placeGoodie',payload,status:result.status,body:result.body});await info.attach('source-entry-rejection.json',{body:Buffer.from(JSON.stringify(c.receipts,null,2)),contentType:'application/json'});
  assert.equal(result.status,400);assert(JSON.stringify(result.body).includes('EXCLUSION_COLLISION'));assert.equal(player.yard.lastSimulatedAt,rejectedAt);assert.deepEqual(player.yard,{...c.initial,lastSimulatedAt:rejectedAt},'Rejected placement may advance simulation time only; all inventory, currency, placement and reward data stay unchanged');c.initial=structuredClone(player.yard);
  await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page,{itemPosition:[60,45]});await expect.poll(async()=>(await qa(page))?.phase,{timeout:15000}).toBe('parked');const parked=await qa(page);
  c.nativeActions=[await requestNativeAction(page,'qa-mouse-next')];assert.equal(c.nativeActions[0].ok,false);assert.equal(c.nativeActions[0].reason,'NATIVE_ITEM_TARGET_UNAVAILABLE');const after=await qa(page);assert.deepEqual(after.position,parked.position);assert.equal(after.actorInstance,parked.actorInstance);assert.equal(after.actionsStarted,1);unchanged(c);
  await page.screenshot({path:info.outputPath('source-entry-declined.png')});
 }catch(error){failure=error;throw error;}finally{await finish(page,info,c,failure,failure?'source-entry-negative-failure.png':undefined);}
});


const nativeUiLabels={en:{go:'Go to item',inYard:'In the yard',moving:'Moving to the item',ready:'Ready to walk',already:'Already by this item',arrived:'By the item',refused:'Cannot reach this item',cancelled:'Walk cancelled'},ru:{go:'К предмету',inYard:'Во дворе',moving:'Идёт к предмету',ready:'Готов к подходу',already:'Уже рядом с предметом',arrived:'Рядом с предметом',refused:'Не добраться до предмета',cancelled:'Подход отменён'}};
async function openNativeItems(page,slot){
 await page.locator('[data-nav-item="decor"]').click();await expect(page.locator('.cy-dialog')).toBeVisible();
 if(slot)await page.locator(`.cy-catalog-choice[data-slot-id="${slot}"]`).click();
 return page.locator('[data-yard-action="native-go-to-item"]');
}
for(const language of ['en','ru'])test(`Mika selected item UI: ${language} actual footer, arrival and current-pose refusal`,async({page},info)=>{
 test.skip(!selectedUi||!continuation,'Explicit selected-item candidate only');test.setTimeout(90000);
 const c=await setup(page,{language,itemPosition:[60,45],additionalItems:[['yarn_mouse','qa-mouse-next',87,54]],info});let failure;
 try{
  await page.addInitScript(installPixelProbe,{capturePixels:false,completeActions:2});
  await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page,{itemPosition:[60,45],propCount:2});
  await expect.poll(async()=>(await qa(page))?.phase,{timeout:15000}).toBe('parked');const first=await qa(page),surface=await page.locator('.cy-scene').boundingBox(),label=nativeUiLabels[language];
  let go=await openNativeItems(page);await expect(go).toHaveAttribute('data-slot-id','qa-mouse');await expect(go).toHaveText(label.go);await expect(go).toBeEnabled();
  assert((await go.getAttribute('aria-label')).includes(label.go));if(language==='ru'){await go.focus();await expect(go).toBeFocused();await page.screenshot({path:info.outputPath('native-selected-ru-keyboard-focus.png')});await go.press('Enter');}else await go.click();await expect(page.locator('.cy-dialog')).not.toBeVisible();await expect(page.locator('[data-native-status="already"] .cy-native-status-text')).toHaveText(label.already);await expect(page.locator('[data-nav-item="decor"]')).toBeFocused();
  assert.equal((await qa(page)).actionsStarted,1);assert.deepEqual((await qa(page)).position,first.position);
  go=await openNativeItems(page,'qa-mouse-next');await expect(go).toBeEnabled();await expect(go).toHaveAttribute('data-slot-id','qa-mouse-next');
  const itemName=await page.locator('.cy-selected-actions strong').innerText();assert((await go.getAttribute('aria-label')).includes(itemName));await expect(page.locator('.cy-selected-actions small')).toHaveText(label.inYard);
  const feedbackHeight=(await page.locator('.cy-native-command-feedback').boundingBox()).height;
  const button=await go.boundingBox();assert(button.width>=44&&button.height>=44);await page.screenshot({path:info.outputPath(`native-selected-${language}-footer.png`)});
  const requestedAt=Date.now();await go.click();await expect(page.locator('.cy-dialog')).not.toBeVisible();
  await expect.poll(async()=>(await qa(page))?.actionsStarted,{timeout:10000}).toBe(2);const admitted=await qa(page);assert.equal(admitted.actorInstance,first.actorInstance);assert.deepEqual(admitted.plan.start,first.position);assert.equal(admitted.itemApproach.target.slotId,'qa-mouse-next');
  go=await openNativeItems(page);await expect(go).toBeDisabled();await expect(go).toHaveAttribute('aria-busy','true');await expect(page.locator('[data-yard-action="native-cancel"]')).toBeVisible();await expect(page.locator('.cy-native-command-feedback')).toBeVisible();await expect(page.locator('.cy-native-command-feedback .cy-native-status-text')).toHaveText(label.moving);assert.equal((await page.locator('.cy-native-command-feedback').boundingBox()).height,feedbackHeight);await expect(page.locator('.cy-status')).toHaveAttribute('aria-live','off');
  await page.screenshot({path:info.outputPath(`native-selected-${language}-busy.png`)});await page.locator('.cy-dialog header button').click();
  await expect.poll(async()=>(await qa(page))?.actionsCompleted,{timeout:25000}).toBe(2);await expect(page.locator('[data-native-status="arrived"] .cy-native-status-text')).toHaveText(label.arrived);const terminal=await qa(page);assert.equal(terminal.actorInstance,first.actorInstance);assert.equal(terminal.itemApproach.rootSpeed,0);assert.notDeepEqual(terminal.position,first.position);
  const afterSurface=await page.locator('.cy-scene').boundingBox();assert.equal(afterSurface.width,surface.width);assert.equal(afterSurface.height,surface.height,'Native feedback must keep the admitted canvas size stable');
  await page.screenshot({path:info.outputPath(`native-selected-${language}-arrived.png`)});
  go=await openNativeItems(page,'qa-mouse');await expect(go).toBeEnabled();await go.click();await expect(page.locator('[data-native-status="refused"] .cy-native-status-text')).toHaveText(label.refused);
  const refused=await qa(page);assert.equal(refused.phase,'parked');assert.equal(refused.actionsStarted,2);assert.equal(refused.actorInstance,first.actorInstance);assert.deepEqual(refused.position,terminal.position);assert.equal(refused.heading,terminal.heading);
  await openNativeItems(page);await expect(page.locator('.cy-native-command-feedback')).toBeVisible();await expect(page.locator('.cy-native-command-feedback .cy-native-status-text')).toHaveText(label.refused);assert.equal((await page.locator('.cy-native-command-feedback').boundingBox()).height,feedbackHeight);await page.screenshot({path:info.outputPath(`native-selected-${language}-refused.png`)});await page.locator('.cy-dialog header button').click();
  c.uiCommandEvidence={feedbackHeight,language,entry:'normal placed-item footer',defaultSlot:'qa-mouse',selectedSlot:'qa-mouse-next',requestedAt,first,admitted,terminal,refused,surface,afterSurface};unchanged(c);assert.deepEqual(c.commands,[]);assert.deepEqual(c.errors,[]);
  await expect.poll(()=>page.evaluate(()=>window.__mikaPixelProof.recordingDone),{timeout:10000}).toBe(true);
  await page.evaluate(()=>{window.__mikaRetiredReader=window.__yardMikaQa.snapshot;});await page.locator('.cy-home').click();await expect(page.getByTestId('home-catalogue')).toBeVisible();await selectHomeGame(page,'blox');
  await expect.poll(()=>page.evaluate(()=>window.__mikaRetiredReader().lastRetired?.qaMika?.phase)).toBe('disposed');retired(await page.evaluate(()=>window.__mikaRetiredReader().lastRetired.qaMika));unchanged(c);
 }catch(error){failure=error;throw error;}finally{await finish(page,info,c,failure,failure?'native-selected-ui-failure.png':undefined);}
});
for(const interruption of ['selection','cancel','editing'])test(`Mika selected item UI: ${interruption} cancels the current command`,async({page},info)=>{
 test.skip(!selectedUi||!continuation,'Explicit selected-item candidate only');test.setTimeout(60000);
 const c=await setup(page,{language:'ru',itemPosition:[60,45],additionalItems:[['yarn_mouse','qa-mouse-next',87,54]],info});let failure;
 try{
  await page.addInitScript(installPixelProbe,{capturePixels:false,completeActions:2});await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page,{itemPosition:[60,45],propCount:2});await expect.poll(async()=>(await qa(page))?.phase,{timeout:15000}).toBe('parked');const parked=await qa(page);
  await(await openNativeItems(page,'qa-mouse-next')).click();await expect.poll(async()=>{const d=await qa(page);return d?.actionsStarted===2&&d.phase==='running'&&d.time>=1;},{timeout:10000}).toBe(true);
  await openNativeItems(page);const before=await qa(page),feedbackHeight=(await page.locator('.cy-native-command-feedback').boundingBox()).height;
  if(interruption==='selection')await page.locator('.cy-catalog-choice[data-slot-id="qa-mouse"]').click();
  if(interruption==='cancel')await page.locator('[data-yard-action="native-cancel"]').click();
  if(interruption==='editing')await page.locator('[data-yard-action="move"]').click();
  await expect.poll(async()=>(await qa(page))?.phase).toBe('aborted');const cancelled=await qa(page);assert.equal(cancelled.actorInstance,parked.actorInstance);assert.equal(cancelled.actionsStarted,2);assert.deepEqual(cancelled.position,parked.position);assert(cancelled.time<5.35);retired(cancelled);
  if(interruption==='editing'){await expect(page.locator('.cy-placement')).toBeVisible();assert.equal(cancelled.reason,'ITEM_EDITING');}else{await expect(page.locator('.cy-native-command-feedback')).toBeVisible();await expect(page.locator('.cy-native-command-feedback .cy-native-status-text')).toHaveText(nativeUiLabels.ru.cancelled);assert.equal((await page.locator('.cy-native-command-feedback').boundingBox()).height,feedbackHeight);await expect(page.locator('.cy-status')).toHaveAttribute('aria-live','off');}await page.screenshot({path:info.outputPath(`native-selected-${interruption}-cancelled.png`)});
  c.uiCommandEvidence={feedbackHeight,interruption,parked,before,cancelled};unchanged(c);assert.deepEqual(c.commands,[]);assert.deepEqual(c.errors,[]);await expect.poll(()=>page.evaluate(()=>window.__mikaPixelProof.recordingDone),{timeout:10000}).toBe(true);
 }catch(error){failure=error;throw error;}finally{await finish(page,info,c,failure,failure?'native-selected-cancel-failure.png':undefined);}
});
