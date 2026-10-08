/** QA-only finite P2 cruise in the actual normal Courtyard app.
 * Source-backed ephemeral fixture seeding precedes navigation. No browser Yard
 * command is allowed. Runtime camera, props, gait, clock and actor state are
 * never patched. Async loading races are covered by source tests, not this spec.
 */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startSwFixture} from './helpers/swFixture.mjs';
import {selectHomeGame} from './helpers/home.js';
import {readBloxLayout} from './helpers/blox-v2.js';
import {applyActionWithReceipt} from '../../routes/player.js';

const SHA='2249774f8ced124451d3c46a8a69bc06a9889c7d9cc31c836a6dd868fd96f084';
const ASSET='/assets/yard-mika-p2-qa/p2.glb',ENCODED=3671320;
const expected=process.env.MIKA_QA_EXPECT_ENABLED;
if(!['true','false'].includes(expected))throw Error('Set MIKA_QA_EXPECT_ENABLED=true or false for the separately built app');
const off=expected==='false';
test.use({serviceWorkers:'block'}); // viewport/DPR come exclusively from projects.
const read=page=>page.evaluate(()=>window.__yardMikaQa?.snapshot());
const qa=async page=>(await read(page))?.scene?.qaMika;

// Instrumentation only: observe actual WebGL->normal Canvas2D copies. Capture
// the full actor alpha raster at three frames, then the finished normal canvas
// after that same RAF call stack. No getContext/pixel/render behavior is changed.
function installPixelProbe({capturePixels=true}={}){
 const webgl=new WeakSet(),get=HTMLCanvasElement.prototype.getContext,draw=CanvasRenderingContext2D.prototype.drawImage;
 const proof={instrumentedPixels:capturePixels,captures:[],errors:[],first:null,last:null,copies:0,recording:null,recordingDone:false,states:[]};
 let recorder,stream,chunks=[],pending=false;const targets=[.2,2,3.6];
 const png=canvas=>canvas.toDataURL('image/png').split(',')[1];
 HTMLCanvasElement.prototype.getContext=function(type,...args){const value=get.call(this,type,...args);if(value&&/^(webgl|webgl2|experimental-webgl)$/.test(type))webgl.add(this);return value;};
 CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
  const result=draw.call(this,image,...args);
  if(!this.canvas.matches?.('.cy-scene canvas')||!webgl.has(image))return result;
  try{
   const state=window.__yardMikaQa?.snapshot()?.scene?.qaMika;if(state?.phase!=='running')return result;
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
   const target=targets[proof.captures.length];
   if(capturePixels&&!pending&&target!==undefined&&state.time>=target){
    pending=true;const probeStarted=performance.now(),canvas=this.canvas,scratch=document.createElement('canvas');scratch.width=image.width;scratch.height=image.height;
    const ctx=get.call(scratch,'2d',{willReadFrequently:true});draw.call(ctx,image,0,0);
    const pixels=ctx.getImageData(0,0,scratch.width,scratch.height).data;let minX=scratch.width,minY=scratch.height,maxX=-1,maxY=-1,count=0,sumX=0,sumY=0;
    for(let y=0;y<scratch.height;y++)for(let x=0;x<scratch.width;x++)if(pixels[(y*scratch.width+x)*4+3]>2){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;sumX+=x;sumY+=y;}
    const capture={target,time:state.time,wall:performance.now(),state:structuredClone(state),actorPNG:png(scratch),actorAlpha:{minX,minY,maxX,maxY,count,centroid:count?{x:sumX/count,y:sumY/count}:null,width:scratch.width,height:scratch.height}};
    queueMicrotask(()=>{try{capture.normalPNG=png(canvas);capture.canvas={width:canvas.width,height:canvas.height};capture.probeCostMs=performance.now()-probeStarted;proof.captures.push(capture);}catch(e){proof.errors.push(String(e));}finally{pending=false;}});
   }
  }catch(e){proof.errors.push(String(e));}return result;
 };
 function observe(){const state=window.__yardMikaQa?.snapshot()?.scene?.qaMika;if(state&&proof.states.at(-1)?.phase!==state.phase)proof.states.push({phase:state.phase,time:state.time,reason:state.reason});if(recorder?.state==='recording'&&state?.phase!=='running'){proof.stopWall=performance.now();recorder.stop();}requestAnimationFrame(observe);}
 requestAnimationFrame(observe);window.__mikaPixelProof=proof;
}
async function setup(page){
 const fixture=await startSwFixture({gameActions:true,gardenMode:'r2'}),receipts=[],errors=[],commands=[],assetResponses=[],assetRequests=[];
 try{
  // Existing source actions, ephemeral account only. Do not edit placement arrays.
  for(const [goodieId,slotId,x,y]of [['yarn_mouse','qa-mouse',45,45],['sun_cushion','qa-cushion',54,66]]){
   const payload={goodieId,slotId,x,y},result=await applyActionWithReceipt(fixture.player('account-a'),'yard.placeGoodie',payload,{clientActionId:'yard-v2:mika-fixture-'+slotId,gardenR2Enabled:true});
   receipts.push({action:'yard.placeGoodie',payload,status:result.status,body:result.body});assert.equal(result.status,200);assert.equal(result.body.error,undefined);
  }
  const initial=structuredClone(fixture.player('account-a').yard);assert.equal(initial.placedGoodies.length,2);
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',request=>{if(new URL(request.url()).pathname===ASSET)assetRequests.push(request.url());});page.on('response',response=>{if(new URL(response.url()).pathname===ASSET)assetResponses.push(response);});
  await page.route('**/api/player/mutate',async route=>{const body=route.request().postDataJSON();if(body?.action?.startsWith('yard.')){commands.push(body);return route.abort('blockedbyclient');}return route.continue();});
  await page.addInitScript(()=>{window.__mikaNormalCanvasDraws=0;const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){const result=original.apply(this,args);if(this.canvas.matches?.('.cy-scene canvas'))window.__mikaNormalCanvasDraws++;return result;};});
  await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','fixture-a');localStorage.setItem('garden_shelf_language','en');});
  return{fixture,receipts,initial,errors,commands,assetResponses,assetRequests};
 }catch(e){try{await fixture.close();}catch(cleanup){e.fixtureCleanupError=String(cleanup.stack||cleanup);}e.seedReceipts=receipts;throw e;}
}
async function readyRunning(page){
 await expect(page.locator('.cy-app')).toBeVisible({timeout:30000});
 await expect.poll(async()=>{const d=await qa(page);if(d&&['blocked','unavailable','aborted','complete'].includes(d.phase))throw Error('Cruise never observed running: '+JSON.stringify(d));return d?.phase==='running'&&d.frames>0;},{timeout:30000,intervals:[25,50,100]}).toBe(true);
 const d=await qa(page);assert.equal(d.normalCamera,true);assert.equal(d.diagnosticCameraFit,false);assert.equal(d.rootOwner,'navigation');assert.equal(d.assetSha256,SHA);assert.equal(d.bones,22);
 const view=(await read(page)).scene.view;assert.equal(view.props.length,2);return d;
}
function unchanged(context){assert.deepEqual(context.commands,[],'No browser Yard commands');assert.deepEqual(context.fixture.player('account-a').yard,context.initial,'No Yard mutation after source-backed fixture setup');assert.deepEqual(context.errors,[]);}
function retired(d){assert.equal(d.resources.graphicsRetired,true);assert.equal(d.resources.rgbaBytes,0);assert.equal(d.resources.retainedModelCPUUpperBound,0);assert.equal(d.resources.retainedModelGPUBytes,0);}
async function evidence(page,info,context,error){
 const proof=await page.evaluate(()=>window.__mikaPixelProof??null).catch(()=>null);
 for(const [i,c]of (proof?.captures??[]).entries()){if(c.normalPNG)await info.attach(`normal-yard-${i}-${c.time.toFixed(3)}s.png`,{body:Buffer.from(c.normalPNG,'base64'),contentType:'image/png'});if(c.actorPNG)await info.attach(`actual-actor-alpha-${i}.png`,{body:Buffer.from(c.actorPNG,'base64'),contentType:'image/png'});delete c.normalPNG;delete c.actorPNG;}
 if(proof?.recording){await info.attach(proof.instrumentedPixels?'normal-yard-instrumented-pixel-proof.webm':'normal-yard-clean-1x-canvas.webm',{body:Buffer.from(proof.recording,'base64'),contentType:'video/webm'});delete proof.recording;}
 await info.attach('mika-normal-yard-evidence.json',{contentType:'application/json',body:Buffer.from(JSON.stringify({base:'1a66a9df3d177d1b8308bab223ad6f647a76f98a',ciRevision:process.env.GITHUB_SHA??null,project:info.project.name,scope:'Seeded source-action fixture admission, actual normal Yard camera/props and finite cruise. Clean case uses MediaRecorder/lightweight draw observation, no in-flight raster scan or PNG. Pixel case is timing-instrumented. No performance, artistic, general navigation, entry/replan, or async browser-race acceptance.',publicAssetBuildDeltaBytes:ENCODED,flagOffOnlyPreventsRuntimeLoad:true,error:error?String(error.stack||error):null,errors:context.errors,commands:context.commands,assetRequests:context.assetRequests,seedReceipts:context.receipts,initialYard:context.initial,diagnostics:await read(page).catch(()=>null),proof},null,2))});
}

async function finish(page,info,context,failure,screenshot){
 // Preserve the first failure even if evidence collection or cleanup also fails.
 let first=failure;
 try{await evidence(page,info,context,failure);if(screenshot)await page.screenshot({path:info.outputPath(screenshot)});}
 catch(error){first??=error;await info.attach('evidence-collection-error.txt',{body:Buffer.from(String(error.stack||error)),contentType:'text/plain'}).catch(()=>{});}
 try{await context.fixture.close();}
 catch(error){first??=error;await info.attach('fixture-cleanup-error.txt',{body:Buffer.from(String(error.stack||error)),contentType:'text/plain'}).catch(()=>{});}
 if(!failure&&first)throw first;
}

test('Mika normal Yard: four-second seeded cruise, real pixels and retirement',async({page},info)=>{
 test.skip(off,'Enabled QA build case');test.setTimeout(60000);const c=await setup(page);let failure;
 try{
  await page.addInitScript(installPixelProbe);await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page);
  await expect.poll(async()=>(await qa(page))?.phase,{timeout:20000,intervals:[50,100]}).toBe('complete');
  await expect.poll(()=>page.evaluate(()=>window.__mikaPixelProof.recordingDone),{timeout:10000}).toBe(true);
  const d=await qa(page),p=await page.evaluate(()=>window.__mikaPixelProof);assert.equal(d.reason,'FINITE_CRUISE_ENDED_NO_TRANSITION');assert(d.time>=4&&d.time<5);assert(d.frames>=12);retired(d);assert.deepEqual(p.errors,[]);assert.equal(p.captures.length,3);assert(p.copies>=12);assert(p.stopWall-p.first.wall>=3500);assert(p.recording.length>1000);
  for(const capture of p.captures){assert(capture.time>=capture.target&&capture.time<capture.target+.35,'Capture must correspond to its named real-time interval');const b=capture.actorAlpha;assert(b.count>100,'Actual rendered actor pixels required');assert(b.minX>0&&b.minY>0&&b.maxX<b.width-1&&b.maxY<b.height-1,'Complete visible alpha bounds stay within frame');}
  const first=p.captures[0].actorAlpha.centroid,last=p.captures[2].actorAlpha.centroid;assert(Math.hypot(last.x-first.x,last.y-first.y)>5,'Actual actor raster centroid must travel more than five CSS pixels on DPR1 QA surface');assert.notDeepEqual(p.captures[0].state.position,p.captures[2].state.position);assert.equal(c.assetRequests.length,1);assert.equal(c.assetResponses.length,1);const bytes=await c.assetResponses[0].body();assert.equal(bytes.length,ENCODED);assert.equal(createHash('sha256').update(bytes).digest('hex'),SHA);
  assert.equal(d.resources.encodedGLBBytes,ENCODED);assert.equal(d.resources.modelCPUUpperBound,11013960);assert.equal(d.resources.modelGPUBytes,3538220);unchanged(c);
 }catch(e){failure=e;throw e;}finally{await finish(page,info,c,failure,failure?'normal-yard-failure.png':'normal-yard-complete.png');}
});

test('Mika normal Yard: four-second seeded cruise clean 1x recording',async({page},info)=>{
 test.skip(off,'Enabled QA build case');test.setTimeout(60000);const c=await setup(page);let failure;
 try{
  await page.addInitScript(installPixelProbe,{capturePixels:false});await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page);
  await expect.poll(async()=>(await qa(page))?.phase,{timeout:20000,intervals:[50,100]}).toBe('complete');
  await expect.poll(()=>page.evaluate(()=>window.__mikaPixelProof.recordingDone),{timeout:10000}).toBe(true);
  const d=await qa(page),p=await page.evaluate(()=>window.__mikaPixelProof);assert.equal(d.reason,'FINITE_CRUISE_ENDED_NO_TRANSITION');assert(d.time>=4&&d.time<5);assert(d.frames>=12);retired(d);assert.deepEqual(p.errors,[]);assert.equal(p.captures.length,0);assert.equal(p.instrumentedPixels,false);assert(p.stopWall-p.first.wall>=3500);assert(p.recording.length>1000);unchanged(c);
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
 const destination={events:[],ready:null,fixtureAlive:true};
 const failed=request=>destination.events.push({kind:'requestfailed',path:new URL(request.url()).pathname,error:request.failure()?.errorText});
 const consoleError=message=>{if(message.type()==='error')destination.events.push({kind:'console',text:message.text()});};
 page.on('requestfailed',failed);page.on('console',consoleError);
 try{
  await page.goto(c.fixture.origin+'/?tab=room');await readyRunning(page);await page.evaluate(()=>{window.__mikaRetiredReader=window.__yardMikaQa.snapshot;});
  await page.locator('.cy-home').click();await expect(page.getByTestId('home-catalogue')).toBeVisible();
  await selectHomeGame(page,'blox');await expect.poll(()=>page.evaluate(()=>window.__yardMikaQa===undefined)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__mikaRetiredReader().lastRetired?.qaMika?.phase)).toBe('disposed');const old=await page.evaluate(()=>window.__mikaRetiredReader().lastRetired);retired(old.qaMika);assert.equal(old.disposed,true);unchanged(c);
  await info.attach('normal-yard-retired-owner.json',{body:Buffer.from(JSON.stringify(old,null,2)),contentType:'application/json'});
  // Keep the real fixture server alive until the destination has rendered its
  // board and actual pieces. An immersive shell alone is not game readiness.
  const layout=await readBloxLayout(page);
  const shell=page.locator('[data-game-shell="blox"]');
  if(await shell.getAttribute('data-bx-phase')==='menu')await shell.locator('.bx-dialog').getByRole('button',{name:'Start',exact:true}).click();
  await expect(shell).toHaveAttribute('data-bx-phase','playing');
  await expect(shell.locator('.bx-keyboard-slot:not(:disabled)')).toHaveCount(3);
  await expect(shell.locator('.bx-runtime-status[role="alert"]')).toHaveCount(0);
  destination.ready={layout,phase:await shell.getAttribute('data-bx-phase'),usableTrayPieces:await shell.locator('.bx-keyboard-slot:not(:disabled)').count(),runtimeErrors:await shell.locator('.bx-runtime-status[role="alert"]').count(),fixtureAlive:true};
  unchanged(c);await page.screenshot({path:info.outputPath('blox-ready-before-fixture-close.png')});
 }catch(e){failure=e;throw e;}finally{
  let attachmentFailure;
  try{await info.attach('blox-destination-before-teardown.json',{body:Buffer.from(JSON.stringify(destination,null,2)),contentType:'application/json'});}
  catch(error){attachmentFailure=error;}
  await finish(page,info,c,failure||attachmentFailure,failure?'blox-destination-failure-before-fixture-close.png':undefined);
  if(!failure&&attachmentFailure)throw attachmentFailure;
 }
});

test('Mika normal Yard: off-build never requests the QA actor',async({page},info)=>{
 test.skip(!off,'Separate build with VITE_YARD_MIKA_QA=false and MIKA_QA_EXPECT_ENABLED=false');test.setTimeout(60000);const c=await setup(page);let failure;
 try{await page.goto(c.fixture.origin+'/?tab=room');await expect(page.locator('.cy-scene canvas')).toBeVisible({timeout:30000});await expect.poll(()=>page.evaluate(()=>window.__yardPipIntegration?.snapshot()?.scene?.ready),{timeout:30000}).toBe(true);await expect.poll(()=>page.evaluate(()=>window.__mikaNormalCanvasDraws)).toBeGreaterThan(0);const before=await page.evaluate(()=>window.__mikaNormalCanvasDraws);await page.waitForTimeout(5000);assert((await page.evaluate(()=>window.__mikaNormalCanvasDraws))>before,'Normal scene keeps drawing during bounded five-second no-request observation');assert.equal(await read(page),undefined);assert.equal(c.assetRequests.length,0);assert.equal(c.assetResponses.length,0);unchanged(c);}
 catch(e){failure=e;throw e;}finally{await finish(page,info,c,failure);}
});
