/** One explicitly admitted native job only. No dependency installation or listener. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {qualityFixture} from './fixture.mjs';
import {sha,listFiles} from './overlay.mjs';
import {W,H,BYTES,assemble,exact,sameOpaqueCoverage,separatedPropMask,composite,summarizeCost,stableGardenBackground} from './pixels.mjs';
import {installBoundedDiagnostics,serializeBoundedReport,REPORT_RESERVE_BYTES} from './diagnostics.mjs';
export const LIMITS={jobMinutes:10,browserSeconds:240,artifactBytes:8388608,retentionDays:3,retries:0};
const RECIPE='pip-garden-grounding-v1';
const ORIGIN='https://yard-quality.invalid';
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.glsl':'text/plain','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.txt':'text/plain','.jpg':'image/jpeg','.avif':'image/avif','.webmanifest':'application/manifest+json'};
export function assertLaunch(env) {
  assert.equal(env.GITHUB_ACTIONS,'true','This executable launches only the explicitly admitted finite GitHub lane');
  assert.equal(env.GITHUB_RUN_ATTEMPT,'1','Zero retries');
  assert.equal(env.YARD_PIP_GROUNDING_NATIVE,'1','Explicit quality lane admission required');
  assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/,'Exact source commit required');
}
export function motionReceipt(motion,file){
  assert(Array.isArray(motion.trace)&&motion.trace.length<=32);assert(/^(baseline|grounded)-motion-trace\.json$/.test(file));
  const {trace,...receipt}=motion;return {...receipt,traceSamples:trace.length,traceFile:file,traceStoredLosslessly:true};
}
export async function runGroundingPage({root,work,context,write,report,purpose,mode='baseline'}) {
  if(!report.diagnosticLimits)installBoundedDiagnostics(report);
  const require=createRequire(path.join(root,'package.json')),sharp=require('sharp');
  const closure=JSON.parse(await fs.readFile(path.join(work,'closure.json'))),source=JSON.parse(await fs.readFile(path.join(work,'source.json')));
  assert(closure.complete&&closure.mode==='preview');report.source={head:source.head,baseSourceFiles:source.baseSources.length,
    baseSourcesSha256:sha(Buffer.from(JSON.stringify(source.baseSources))),overlaySources:source.overlaySources,compiledOverlay:source.compiledOverlay,
    completeSourceManifest:'source.json in same bounded job work directory',privateOnly:source.privateOnly};report.assetFiles=closure.files.filter(row=>/pip\.glb|planter-t2\.glb|clean-garden|pip-rest-coat/.test(row.path));
  const files=new Map(closure.files.map(row=>[row.path,row]));
  for(const row of closure.files){const b=await fs.readFile(path.join(work,'dist',row.path));assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256);}
  const fixture=await qualityFixture(root),fixtureBefore=JSON.stringify(fixture);
  report.fixture={kind:'Existing real-app static transport fixture extended with two validated current canonical T2 records',authBackendAcquisitionAcceptance:false,records:fixture.yardRuntime.canonicalPlacements};
  await context.route('**/*',async route=>{
    const request=route.request(),u=new URL(request.url()),rel=u.pathname.slice(1)||'index.html';
    if(u.origin!==ORIGIN||request.method()!=='GET'||request.headers().authorization){report.errors.push({type:'forbidden-request',url:u.pathname,method:request.method()});return route.abort();}
    if(u.pathname==='/api/config')return route.fulfill({json:{devAuthEnabled:false,buildId:source.head}});
    if(u.pathname==='/api/player/snapshot')return route.fulfill({json:fixture});
    const row=files.get(rel);
    if(!row){report.errors.push({type:'outside-static-closure',url:u.pathname});return route.abort();}
    return route.fulfill({status:200,contentType:mime[path.extname(rel)]||'application/octet-stream',body:await fs.readFile(path.join(work,'dist',rel)),headers:{'Cache-Control':'no-store'}});
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',e=>report.errors.push({type:'pageerror',message:String(e).slice(0,2048)}));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))report.console.push({type:m.type(),text:m.text().slice(0,2048)});});
  page.on('requestfailed',r=>{if(!/ERR_ABORTED/.test(r.failure()?.errorText||''))report.errors.push({type:'requestfailed',url:new URL(r.url()).pathname,error:r.failure()});});
  await context.addInitScript(()=>{
    const d=window.__qualityGL={errors:[],contexts:[],writes:[],errorsSeen:0,errorsOmitted:0,writesSeen:0,writesOmitted:0};
    const record=(kind,value)=>{d[kind+'Seen']++;if(d[kind].length>=16){d[kind+'Omitted']++;return;}let text='',bytes=0;for(const c of JSON.stringify(value)){const n=new TextEncoder().encode(c).length;if(bytes+n>2048)break;text+=c;bytes+=n;}d[kind].push(text);};
    const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){const gl=Reflect.apply(get,this,[type,...args]);if(/^webgl/.test(type)&&gl&&!d.contexts.includes(gl))d.contexts.push(gl);return gl;};
    for(const C of[window.WebGLRenderingContext,window.WebGL2RenderingContext].filter(Boolean))for(const[name,flag,log]of[['compileShader','COMPILE_STATUS','getShaderInfoLog'],['linkProgram','LINK_STATUS','getProgramInfoLog']]){
      const p=C.prototype,old=p[name];p[name]=function(value){const result=Reflect.apply(old,this,[value]);if(!this[name==='compileShader'?'getShaderParameter':'getProgramParameter'](value,this[flag]))record('errors',this[log](value));return result;};
    }
    for(const name of['setItem','removeItem','clear']){const old=Storage.prototype[name];Storage.prototype[name]=function(...args){if(/yard|outbox/i.test(String(args[0]||'')))record('writes',{kind:'storage',name,key:String(args[0])});return Reflect.apply(old,this,args);};}
    for(const name of['put','add','delete','clear']){const old=IDBObjectStore.prototype[name];IDBObjectStore.prototype[name]=function(...args){record('writes',{kind:'idb',name,store:this.name});return Reflect.apply(old,this,args);};}
  });
  const snapshot=()=>page.evaluate(()=>window.__yardGroundingNative?.snapshot());
  const clean=async()=>{
    const d=await page.evaluate(()=>({errors:window.__qualityGL.errors,writes:window.__qualityGL.writes,errorsSeen:window.__qualityGL.errorsSeen,errorsOmitted:window.__qualityGL.errorsOmitted,writesSeen:window.__qualityGL.writesSeen,writesOmitted:window.__qualityGL.writesOmitted,contexts:window.__qualityGL.contexts.map(gl=>{
      const ext=gl.getExtension('WEBGL_debug_renderer_info');return{lost:gl.isContextLost(),error:gl.getError(),backing:[gl.drawingBufferWidth,gl.drawingBufferHeight],attributes:gl.getContextAttributes(),vendor:gl.getParameter(ext?ext.UNMASKED_VENDOR_WEBGL:gl.VENDOR),renderer:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};})}));
    report.gl=d;assert.equal(d.errorsSeen,0);assert.equal(d.writesSeen,0);assert.deepEqual(d.errors,[]);assert.deepEqual(d.writes,[]);assert.equal(d.contexts.length,1);assert(d.contexts.every(c=>!c.lost&&c.error===0));assert.deepEqual(d.contexts[0].backing,[W,H]);assert.equal(d.contexts[0].attributes.antialias,false);assert.equal(d.contexts[0].attributes.alpha,true);assert.deepEqual(report.errors,[]);assert.equal(report.diagnosticLimits.console.errorEventsSeen,0);
  };
  async function raw(recipe,isolation=null){
    const chunks=[];for(let y=0;y<H;y+=16)chunks.push(await page.evaluate(({recipe,y,rows,isolation})=>window.__yardGroundingNative.readRows(recipe,y,rows,isolation),{recipe,y,rows:Math.min(16,H-y),isolation}));return assemble(chunks);
  }
  try{
    await page.goto(ORIGIN+'/?tab=room&yardPipPreview=1',{waitUntil:'networkidle'});await page.bringToFront();
    await page.waitForFunction(()=>window.__yardPipIntegration?.snapshot()?.mode==='legacy'&&window.__yardPipIntegration.snapshot().scene?.ready);
    assert.equal(await page.evaluate(()=>window.__yardGroundingNative??null),null);
    await page.locator('[data-pip-control="canonical-items"]').click();
    await page.waitForFunction(()=>{const s=window.__yardPipIntegration?.snapshot()?.scene;return s?.ready&&s.canonicalItems&&!s.viewportBlocked&&s.canonicalRecords?.length===2;});
    await page.evaluate(mode=>window.__yardGroundingNative.choose(mode),mode);
    await page.locator('.cy-actions button').nth(1).click();await page.locator('[data-decor-tab="placed"]').click();
    await page.locator('.cy-catalog-choice').first().click();
    report.routeStartWallMs=await page.evaluate(()=>{window.__yardGroundingNative.beginTrace();return performance.now();});
    await page.locator('[data-pip-control="inspect-selected"]').click();
    await page.waitForFunction(()=>{const s=window.__yardPipIntegration?.snapshot()?.scene;return s?.settled&&!s.scheduler.pending&&s.lastFrame?.visibility==='both';},null,{timeout:25000});
    report.routeSettledWallMs=await page.evaluate(()=>performance.now());
    const before=await snapshot(),r=before.probe.resources;
    report.recipe=before.probe.recipe;report.appliedLights=before.probe.appliedLights;report.canonicalRecords=before.scene.canonicalRecords;
    report.admission={knownCPUBytes:r.knownCPUBufferPeakBytes+2888036+r.boneDataTextureCPUBytesEstimate+(purpose==='still'?24960:0),
      estimatedGPUBytes:r.geometryGPUBufferBytes+r.boneDataTextureGPUBytesEstimate+r.resizeDrawingBufferPeakEstimatedBytes+r.compositorResizePeakBytesEstimate,
      rgba:before.scene.rgba,peakRGBA:before.scene.peakRgba,resources:r,copyTextureBytes:0,additionalDraws:0,driverResidencyMeasured:false,unknowns:before.scene.unknowns};
    assert.equal(r.knownCPUBufferPeakBytes,12223736);assert.equal(r.geometryGPUBufferBytes,4028332);
    assert.equal(report.admission.estimatedGPUBytes,10094636);assert(report.admission.knownCPUBytes<=16*1024*1024);
    assert(report.admission.estimatedGPUBytes<=12*1024*1024&&before.scene.rgba.fits&&before.scene.peakRgba<=64*1024*1024);
    assert.deepEqual([r.contactShadowGeometryCPUBytes,r.contactShadowGeometryGPUBytes,r.contactShadowImageTextureBytes,r.contactShadowDrawPrimitives],[60,60,0,1]);
    assert.equal(r.assetImageTextureBytes,0);assert.equal(Object.keys(r).some(k=>k.startsWith('quality')),false);assert.equal(before.probe.renderer.copies,0);
    report.geometry=await page.evaluate(()=>{const c=document.querySelector('[data-pip-surface="direct"]'),s=document.querySelector('.cy-scene'),b=c.getBoundingClientRect(),t=s.getBoundingClientRect();return{viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,backing:[c.width,c.height],canvasCSS:{x:b.x,y:b.y,width:b.width,height:b.height},stageCSS:{x:t.x,y:t.y,width:t.width,height:t.height}};});
    assert.deepEqual(report.geometry.backing,[W,H]);assert.equal(report.geometry.dpr,2);assert.deepEqual(report.geometry.viewport,[390,844]);await clean();
    if(purpose==='motion'){
      // Clean owner never holds, isolates, reads pixels, changes background, or screenshots.
      await page.waitForTimeout(700);
      report.motion=await page.evaluate(()=>window.__yardGroundingNative.motion());
      assert.equal(report.motion.timeScale,1);assert.equal(report.motion.syntheticPoseInjection,false);
      assert(report.motion.trace.some(r=>r.world.moving));assert(report.motion.trace.some(r=>r.world.feet.L.planted!==r.world.feet.R.planted));
      assert(report.motion.trace.some(r=>r.world.feet.L.position.z>0||r.world.feet.R.position.z>0));
      for(const row of report.motion.trace)for(const [side,lobe]of [['L','left'],['R','right']]){
        const foot=row.world.feet[side];assert(Math.abs(row.shadow[lobe][0]-foot.position.x/12)<1e-9);assert(Math.abs(row.shadow[lobe][1]+foot.position.y/12)<1e-9);
        const expected=(mode==='baseline'?.29:.37)*Math.exp(-(Math.max(0,foot.position.z/12))/(.025*16/12));
        assert(Math.abs(row.shadow.strength[side==='L'?1:2]-expected)<1e-9);
      }
      assert.equal(report.motion.sample.world.moving,false);assert.equal((await snapshot()).probe.held,false);
      const traceFile=(mode==='baseline'?'baseline':'grounded')+'-motion-trace.json';
      await write(traceFile,Buffer.from(JSON.stringify(report.motion)+'\n'),{kind:'complete bounded real-motion telemetry original',mode,timeScale:1});
      report.motion=motionReceipt(report.motion,traceFile);
      report.cleanVideo={readbackCalls:0,screenshots:0,diagnosticBackgroundChanges:0,holdCalls:0,raw:true,timeScale:1,trimmed:false,retimed:false};
      report.status='TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING';await clean();return;
    }
    report.held=await page.evaluate(()=>window.__yardGroundingNative.hold());
    const base=await raw('baseline'),actor=await raw('baseline','pet'),props=await raw('baseline','planter'),separated=separatedPropMask(props,actor);
    let opaqueActor=0;for(let i=3;i<BYTES;i+=4)if(actor[i]>=230)opaqueActor++;
    assert(opaqueActor>=64);report.actorCoverage={passed:true,opaquePixels:opaqueActor,minimumAlphaByte:230};
    const candidate=await raw(RECIPE),repeat=await raw(RECIPE),restored=await raw('baseline');
    report.opaqueCoverage=sameOpaqueCoverage(base,candidate);assert(report.opaqueCoverage.passed);
    report.stability={candidate:exact(candidate,repeat),baselineRestoration:exact(base,restored)};
    assert(report.stability.candidate.passed&&report.stability.baselineRestoration.passed);
    const union=Buffer.from(base);for(let i=3;i<BYTES;i+=4)union[i]=Math.max(base[i],candidate[i]);
    report.change={changedPixels:0,maximumByteDelta:0,opaqueActorAlphaChanges:0,whitePixels:0,whiteBaselineLuma:0,whiteCandidateLuma:0};
    for(let i=0;i<BYTES;i+=4){let changed=false;for(let c=0;c<4;c++){const d=Math.abs(base[i+c]-candidate[i+c]);if(d)changed=true;report.change.maximumByteDelta=Math.max(report.change.maximumByteDelta,d);}if(changed)report.change.changedPixels++;
      if(actor[i+3]>=230&&base[i+3]!==candidate[i+3])report.change.opaqueActorAlphaChanges++;
      if(actor[i+3]>=250&&Math.min(base[i],base[i+1],base[i+2])>=190&&Math.max(base[i],base[i+1],base[i+2])-Math.min(base[i],base[i+1],base[i+2])<=35){report.change.whitePixels++;report.change.whiteBaselineLuma+=(base[i]+base[i+1]+base[i+2])/3;report.change.whiteCandidateLuma+=(candidate[i]+candidate[i+1]+candidate[i+2])/3;}
    }
    assert.equal(report.change.opaqueActorAlphaChanges,0);report.change.exceedsPriorNearNoOp=report.change.changedPixels>130;
    if(report.change.whitePixels){report.change.whiteMeanLumaRatio=report.change.whiteCandidateLuma/report.change.whiteBaselineLuma;report.change.whiteBrightnessPreserved=report.change.whiteMeanLumaRatio>=.75;}
    report.change.visualAcceptance='UNACCEPTED: numbers do not establish artistic improvement; review actual native garden and clean motion';
    const g=JSON.parse(await fs.readFile(path.join(root,'game-logic/yard-v2/canonical-location-geometry.json'))).composition;
    report.fixedProps={separatedOpaquePixels:separated.pixels,maskSha256:sha(separated.mask),individual:before.scene.canonicalRecords.map(row=>{
      const points=[];for(const dx of[-g.itemEnvelope.radius,g.itemEnvelope.radius])for(const dy of[-g.itemEnvelope.radius,g.itemEnvelope.radius])for(const z of[0,g.itemEnvelope.height]){const q=[row.x+dx-g.camera.projectionOriginCanonical[0],row.y+dy-g.camera.projectionOriginCanonical[1],z].map(v=>v/g.canonicalPerSceneUnit);points.push([g.camera.projectionOriginCss[0]+q.reduce((n,v,i)=>n+v*g.camera.right[i],0)*g.camera.pixelsPerSceneUnitCss,g.camera.projectionOriginCss[1]+q.reduce((n,v,i)=>n+v*g.camera.down[i],0)*g.camera.pixelsPerSceneUnitCss]);}
      const box={left:Math.floor(Math.min(...points.map(p=>p[0]))),right:Math.ceil(Math.max(...points.map(p=>p[0]))),top:Math.floor(Math.min(...points.map(p=>p[1]))),bottom:Math.ceil(Math.max(...points.map(p=>p[1])))};let pixels=0;for(let y=Math.max(0,box.top);y<Math.min(H,box.bottom);y++)for(let x=Math.max(0,box.left);x<Math.min(W,box.right);x++)if(separated.mask[(H-1-y)*W+x])pixels++;assert(pixels>=64);return{slotId:row.slotId,box,pixels};})};
    const gardenShots={};
    for(const [name,recipe,data]of [['baseline','baseline',base],['grounded',RECIPE,candidate]]){
      await write(name+'.rgba.gz',gzipSync(data),{kind:'lossless native RGBA',rawBytes:BYTES,rawSha256:sha(data),rowOrder:'bottom-up'});
      for(const [bg,value]of [['light',255],['dark',0]])await write(name+'-'+bg+'-native-raster.png',await sharp(composite(data,value),{raw:{width:W,height:H,channels:3}}).png().toBuffer(),{kind:'native 390x648 raster composite',scaled:false,notScreenshot:true});
      const result=await page.evaluate(recipe=>window.__yardGroundingNative.render(recipe),recipe);report[name]={shadow:result.diagnostics.contactShadow,rendererInfo:result.rendererInfo,lights:(await snapshot()).probe.appliedLights};
      const png=await page.locator('.cy-scene').screenshot({type:'png',scale:'device',timeout:8000});gardenShots[name]=await sharp(png).raw().toBuffer({resolveWithObject:true});await write(name+'-garden-device-stage.png',png,{kind:'actual DPR2 browser composition',mode:recipe});
    }
    report.backgroundStability=stableGardenBackground(gardenShots.baseline,gardenShots.grounded,union,report.geometry);assert(report.backgroundStability.passed);
    report.cost=summarizeCost(await page.evaluate(()=>window.__yardGroundingNative.cost()));const first=report.cost.rows[0].samples[0];
    for(const row of report.cost.rows)for(const sample of row.samples){assert.equal(sample.copies,0);assert.equal(sample.calls,first.calls);assert.equal(sample.triangles,first.triangles);assert.equal(sample.metrics.GPUCompletionMeasured,false);}
    report.captureMemory={pageReadbackScratchBytes:24960,pageFullFrameArrays:0,externalNodeFullFramesPeak:7,externalNodeFullFrameBytes:7*BYTES,qualification:'App buffer ledger only; Node/process RSS, driver, compositor and transient serialization unknown'};
    const final=await snapshot();assert.deepEqual(final.scene.canonicalRecords,before.scene.canonicalRecords);assert.deepEqual(final.probe.renderer.propInstances,before.probe.renderer.propInstances);assert.deepEqual(final.probe.resources,r);
    assert.equal(JSON.stringify(fixture),fixtureBefore);report.status='TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING';await clean();
  }catch(error){report.status='FAILED_OR_INCOMPLETE';report.errors.push({type:'fatal',message:String(error),stack:String(error.stack).slice(0,4096)});throw error;}
  finally{
    try{report.disposal=await page.evaluate(()=>window.__yardGroundingNative?.dispose());if(report.disposal){assert.equal(report.disposal.directCanvases,0);assert.equal(report.disposal.probe.renderer.disposed,true);assert.equal(report.disposal.probe.diagnosticScratchCPUBytes,0);}}
    catch(error){report.errors.push({type:'disposal',message:String(error)});report.status='FAILED_OR_INCOMPLETE';}
    // Page/context ownership belongs to main, so recorded originals are finalized even on failure.
  }
}
export async function main(){
  assertLaunch(process.env);const [rootArg,workArg]=process.argv.slice(2);assert(rootArg&&workArg);const root=path.resolve(rootArg),work=path.resolve(workArg),out=path.join(work,'evidence');await fs.mkdir(out);
  const source=JSON.parse(await fs.readFile(path.join(work,'source.json')));assert.equal(source.head,process.env.GITHUB_SHA);
  const require=createRequire(path.join(root,'package.json')),{chromium}=require('@playwright/test');
  const report=installBoundedDiagnostics({format:'pip-grounding-native/v1',status:'RUNNING',limits:LIMITS,owners:[],visualAcceptance:'PENDING_NATIVE_IMAGE_REVIEW',releaseAcceptance:false,productionActivation:false,errors:[],console:[],captures:[]});
  let bytes=0,browser,deadline;
  const write=async(name,data,metadata={})=>{assert(/^[a-z0-9-]+\.(png|rgba\.gz|webm|json)$/.test(name));await fs.writeFile(path.join(out,name),data,{flag:'wx'});bytes+=data.length;report.captures.push({file:name,bytes:data.length,sha256:sha(data),...metadata});};
  try{
    deadline=setTimeout(()=>{report.errors.push({type:'deadline',seconds:225});browser?.close().catch(()=>{});},225000);browser=await chromium.launch({headless:false,timeout:15000});
    // No overlapping pages, contexts, renderers or recording/measurement owners.
    for(const [purpose,mode]of [['still','baseline'],['motion','baseline'],['motion',RECIPE]]){
      const owner=installBoundedDiagnostics({purpose,mode,status:'RUNNING',errors:[],console:[]});report.owners.push(owner);
      const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block',...(purpose==='motion'?{recordVideo:{dir:out,size:{width:390,height:844}}}:{})});
      let thrown=null;
      try{await runGroundingPage({root,work,context,write,report:owner,purpose,mode});}
      catch(error){thrown=error;}
      finally{
        const videos=context.pages().map(p=>p.video()).filter(Boolean);await context.close();assert.equal(videos.length,purpose==='motion'?1:0,'Every clean owner must finalize exactly one raw clip');
        for(const video of videos){const file=await video.path(),name=(mode==='baseline'?'baseline':'grounded')+'-motion-raw.webm';const destination=path.join(out,name);await fs.rename(file,destination);const data=await fs.readFile(destination);bytes+=data.length;report.captures.push({file:name,bytes:data.length,sha256:sha(data),kind:'untouched real-time browser video original',mode,timeScale:1,trimmed:false,retimed:false,diagnosticFrames:false});}
      }
      assert.equal(browser.contexts().length,0,'Sequential owners must dispose before next owner');
      if(thrown)throw thrown;assert.equal(owner.status,'TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING');assert.equal(owner.diagnosticLimits.errors.seen,0);
    }
    const [still,baseline,candidate]=report.owners;
    assert.deepEqual(baseline.motion.sample,candidate.motion.sample,'Real UI/planner must settle into the same exact pose');assert.deepEqual(still.held.sample,baseline.motion.sample);
    assert.deepEqual(baseline.canonicalRecords,candidate.canonicalRecords);report.samePosePassed=true;report.status='TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING';
  }catch(error){process.exitCode=1;report.status='FAILED_OR_INCOMPLETE';report.errors.push({type:'fatal',message:String(error)});}
  finally{
    clearTimeout(deadline);await browser?.close();if(report.diagnosticLimits.errors.seen){process.exitCode=1;report.status='FAILED_OR_INCOMPLETE';}
    const serialized=serializeBoundedReport(report);if(serialized.reduced){process.exitCode=1;report.status='FAILED_OR_INCOMPLETE';}
    // Preserve every original before the audited final lossless upload-cap check.
    await fs.writeFile(path.join(out,'report.json'),serialized.bytes,{flag:'wx'});
    const files=await listFiles(out),total=files.reduce((n,r)=>n+r.bytes,0);console.log(JSON.stringify({status:report.status,artifactBytes:total,evidence:out,retentionDays:3}));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
