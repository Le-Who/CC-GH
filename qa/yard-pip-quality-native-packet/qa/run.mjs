/** One explicitly admitted native job only. No dependency installation or listener. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {qualityFixture} from './fixture.mjs';
import {sha,listFiles} from './overlay.mjs';
import {W,H,BYTES,assemble,exact,separatedPropMask,exteriorDiff,composite,summarizeCost,stableGardenBackground} from './pixels.mjs';
import {installBoundedDiagnostics,serializeBoundedReport,REPORT_RESERVE_BYTES} from './diagnostics.mjs';
export const LIMITS={jobMinutes:10,browserSeconds:240,artifactBytes:8388608,retentionDays:3,retries:0};
const ORIGIN='https://yard-quality.invalid';
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.glsl':'text/plain','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.txt':'text/plain','.jpg':'image/jpeg','.avif':'image/avif','.webmanifest':'application/manifest+json'};
export function assertLaunch(env) {
  assert.equal(env.GITHUB_ACTIONS,'true','This executable launches only the explicitly admitted finite GitHub lane');
  assert.equal(env.GITHUB_RUN_ATTEMPT,'1','Zero retries');
  assert.equal(env.YARD_PIP_QUALITY_NATIVE,'1','Explicit quality lane admission required');
  assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/,'Exact source commit required');
}
export async function runQualityPage({root,work,context,write,report}) {
  if(!report.diagnosticLimits)installBoundedDiagnostics(report);
  const require=createRequire(path.join(root,'package.json')),sharp=require('sharp');
  const closure=JSON.parse(await fs.readFile(path.join(work,'closure.json'))),source=JSON.parse(await fs.readFile(path.join(work,'source.json')));
  assert(closure.complete&&closure.mode==='preview');report.source={head:source.head,baseSourceFiles:source.baseSources.length,
    baseSourcesSha256:sha(Buffer.from(JSON.stringify(source.baseSources))),overlaySources:source.overlaySources,compiledOverlay:source.compiledOverlay,
    completeSourceManifest:'source.json in same bounded job work directory',privateOnly:source.privateOnly};report.fileInventory=closure.fileInventory;
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
  const snapshot=()=>page.evaluate(()=>window.__yardQualityNative?.snapshot());
  const clean=async()=>{
    const d=await page.evaluate(()=>({errors:window.__qualityGL.errors,writes:window.__qualityGL.writes,errorsSeen:window.__qualityGL.errorsSeen,errorsOmitted:window.__qualityGL.errorsOmitted,writesSeen:window.__qualityGL.writesSeen,writesOmitted:window.__qualityGL.writesOmitted,contexts:window.__qualityGL.contexts.map(gl=>{
      const ext=gl.getExtension('WEBGL_debug_renderer_info');return{lost:gl.isContextLost(),error:gl.getError(),backing:[gl.drawingBufferWidth,gl.drawingBufferHeight],attributes:gl.getContextAttributes(),vendor:gl.getParameter(ext?ext.UNMASKED_VENDOR_WEBGL:gl.VENDOR),renderer:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};})}));
    report.gl=d;assert.equal(d.errorsSeen,0);assert.equal(d.writesSeen,0);assert.deepEqual(d.errors,[]);assert.deepEqual(d.writes,[]);assert.equal(d.contexts.length,1);assert(d.contexts.every(c=>!c.lost&&c.error===0));assert.deepEqual(d.contexts[0].backing,[W,H]);assert.equal(d.contexts[0].attributes.antialias,false);assert.equal(d.contexts[0].attributes.alpha,true);assert.deepEqual(report.errors,[]);assert.equal(report.diagnosticLimits.console.errorEventsSeen,0);
  };
  async function raw(mode,isolation=null){
    const chunks=[];
    for(let y=0;y<H;y+=16)chunks.push(await page.evaluate(({mode,y,rows,isolation})=>window.__yardQualityNative.readRows(mode,y,rows,isolation),{mode,y,rows:Math.min(16,H-y),isolation}));
    return assemble(chunks);
  }
  try{
    await page.goto(ORIGIN+'/?tab=room&yardPipPreview=1',{waitUntil:'networkidle'});await page.bringToFront();
    await page.waitForFunction(()=>window.__yardPipIntegration?.snapshot()?.mode==='legacy'&&window.__yardPipIntegration.snapshot().scene?.ready);
    assert.equal(await page.evaluate(()=>window.__yardQualityNative??null),null,'Quality owner starts absent');
    await page.locator('[data-pip-control="canonical-items"]').click();
    await page.waitForFunction(()=>{const s=window.__yardPipIntegration?.snapshot()?.scene;return s?.ready&&s.canonicalItems&&!s.viewportBlocked&&s.canonicalRecords?.length===2;});
    await page.locator('.cy-actions button').nth(1).click();await page.locator('[data-decor-tab="placed"]').click();
    await page.locator('.cy-catalog-choice').first().click();await page.locator('[data-pip-control="inspect-selected"]').click();
    await page.waitForFunction(()=>{const s=window.__yardPipIntegration?.snapshot()?.scene;return s?.settled&&!s.scheduler.pending&&s.lastFrame?.visibility==='both';},null,{timeout:25000});
    report.held=await page.evaluate(()=>window.__yardQualityNative.hold());
    const before=await snapshot(),r=before.probe.resources;
    report.admission={knownCPUBytes:r.knownCPUBufferPeakBytes+2888036+r.boneDataTextureCPUBytesEstimate+49920,
      estimatedGPUBytes:r.geometryGPUBufferBytes+r.boneDataTextureGPUBytesEstimate+r.resizeDrawingBufferPeakEstimatedBytes+r.compositorResizePeakBytesEstimate+r.qualityCopyColorPeakBytes,
      rgba:before.scene.rgba,peakRGBA:before.scene.peakRgba,liveCopyBytes:r.qualityCopyColorBytes,oldNewCopyBytes:r.qualityCopyColorPeakBytes,
      copyOwnerRetainedInOffAndContact:true,driverResidencyMeasured:false,unknowns:before.scene.unknowns};
    assert.equal(report.admission.knownCPUBytes,15162752);assert.equal(report.admission.estimatedGPUBytes,12116432);
    assert(report.admission.knownCPUBytes<=16*1024*1024&&report.admission.estimatedGPUBytes<=12*1024*1024);
    assert(before.scene.rgba.fits&&before.scene.peakRgba<=64*1024*1024);assert.equal(r.qualityCopyColorBytes,BYTES);assert.equal(r.qualityCopyColorPeakBytes,BYTES*2);
    report.geometry=await page.evaluate(()=>{const c=document.querySelector('[data-pip-surface="direct"]'),s=document.querySelector('.cy-scene'),b=c.getBoundingClientRect(),t=s.getBoundingClientRect();return{viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,backing:[c.width,c.height],canvasCSS:{x:b.x,y:b.y,width:b.width,height:b.height},stageCSS:{x:t.x,y:t.y,width:t.width,height:t.height}};});
    assert.deepEqual(report.geometry.backing,[W,H]);assert.equal(report.geometry.dpr,2);assert.deepEqual(report.geometry.viewport,[390,844]);await clean();
    report.identity=await page.evaluate(()=>window.__yardQualityNative.compareIdentity());
    assert(report.identity.passed&&report.identity.actorCoverage.passed);assert.equal(report.identity.comparedBytes,BYTES);assert.equal(report.identity.mismatches,0);
    assert(report.identity.actorCoverage.opaquePixels>=64&&report.identity.actorCoverage.minimumAlphaByte===230);await clean();
    report.phases.identity='passed';
    report.captureMemory={browserTypedArrays:{buffers:2,bytesPerBuffer:24960,totalBytes:49920,fullFrameArrays:0,release:'Both nulled by probe owner dispose'},
      externalNode:{fullFrameRGBABytes:BYTES,retainedFrames:6,retainedRGBABytes:6*BYTES,repeatCapturePeakFrames:7,
        chunkTransport:'At most 41 base64 chunks plus the assembled frame per capture, outside page JS',
        screenshotDecode:'Three device-scale garden captures for exact fixed-background comparison, outside app/browser ledger'},
      unknowns:['Transient string/base64/DevTools serialization allocations','Browser compositor/readback internals','Driver residency and deferred physical GPU release'],
      qualification:'16 MiB known CPU is the app buffer ledger, not browser/Node process RSS. Encoded files, screenshots and raw gzip artifacts all count toward 8 MiB evidence cap.'};
    const base=await raw('off'),identity=await raw('identity');report.externalIdentity=exact(base,identity);assert(report.externalIdentity.passed);
    const actor=await raw('off','pet'),props=await raw('off','planter'),separated=separatedPropMask(props,actor);
    report.fixedProps={separatedOpaquePixels:separated.pixels,records:before.scene.canonicalRecords,maskSha256:sha(separated.mask)};
    // Each current T2 gets an independent raster box derived from current scene geometry.
    const geometry=JSON.parse(await fs.readFile(path.join(root,'game-logic/yard-v2/canonical-location-geometry.json'))),g=geometry.composition;
    report.fixedProps.individual=before.scene.canonicalRecords.map(row=>{
      const points=[];for(const dx of[-g.itemEnvelope.radius,g.itemEnvelope.radius])for(const dy of[-g.itemEnvelope.radius,g.itemEnvelope.radius])for(const z of[0,g.itemEnvelope.height]){
        const q=[row.x+dx-g.camera.projectionOriginCanonical[0],row.y+dy-g.camera.projectionOriginCanonical[1],z].map(v=>v/g.canonicalPerSceneUnit);
        points.push([g.camera.projectionOriginCss[0]+q.reduce((n,v,i)=>n+v*g.camera.right[i],0)*g.camera.pixelsPerSceneUnitCss,g.camera.projectionOriginCss[1]+q.reduce((n,v,i)=>n+v*g.camera.down[i],0)*g.camera.pixelsPerSceneUnitCss]);
      }
      const box={left:Math.floor(Math.min(...points.map(p=>p[0]))),right:Math.ceil(Math.max(...points.map(p=>p[0]))),top:Math.floor(Math.min(...points.map(p=>p[1]))),bottom:Math.ceil(Math.max(...points.map(p=>p[1])))};
      let pixels=0;for(let y=Math.max(0,box.top);y<Math.min(H,box.bottom);y++)for(let x=Math.max(0,box.left);x<Math.min(W,box.right);x++)if(separated.mask[(H-1-y)*W+x])pixels++;
      assert(pixels>=64,'Each actual T2 needs separated opaque coverage');return{slotId:row.slotId,box,pixels};
    });
    const contact=await raw('contact'),exterior=await raw('exterior');
    report.exterior=exteriorDiff(base,exterior);assert(report.exterior.passed,'Exterior changes support or interior texels');
    report.fixedProps.contact=exact(base,contact,separated.mask);assert(report.fixedProps.contact.passed,'Contact variant changed separated fixed prop pixels');
    report.stability={};
    for(const[mode,data]of[['off',base],['contact',contact],['exterior',exterior]]){
      const repeat=await raw(mode);report.stability[mode]={wholeFrame:exact(data,repeat),fixedProps:exact(data,repeat,separated.mask)};
      assert(report.stability[mode].wholeFrame.passed&&report.stability[mode].fixedProps.passed,'Held frames must be byte stable');
    }
    for(const[mode,data]of[['off',base],['identity',identity],['contact',contact],['exterior',exterior]]){
      await write(mode+'.rgba.gz',gzipSync(data),{kind:'lossless native RGBA',rawBytes:BYTES,rawSha256:sha(data),rowOrder:'bottom-up',encoding:'output-encoded premultiplied RGBA8'});
      if(mode!=='identity')for(const[bg,value]of[['light',255],['dark',0]])await write(mode+'-'+bg+'-native-raster.png',await sharp(composite(data,value),{raw:{width:W,height:H,channels:3}}).png().toBuffer(),{kind:'native 390x648 raster composite',scaled:false,notScreenshot:true});
    }
    const gardenShots={};
    for(const bg of['garden','light','dark']){
      await page.evaluate(bg=>window.__yardQualityNative.background(bg),bg);
      for(const mode of['off','contact','exterior']){
        await page.evaluate(mode=>window.__yardQualityNative.render(mode),mode);
        const png=await page.locator('.cy-scene').screenshot({type:'png',scale:'device',timeout:8000});
        if(bg==='garden')gardenShots[mode]=await sharp(png).raw().toBuffer({resolveWithObject:true});
        await write(mode+'-'+bg+'-device-stage.png',png,{kind:'actual DPR2 browser composition',background:bg,mode});
      }
    }
    report.backgroundStability={};
    for(const mode of['contact','exterior']){report.backgroundStability[mode]=stableGardenBackground(gardenShots.off,gardenShots[mode],base,report.geometry);assert(report.backgroundStability[mode].passed,'Fixed garden pixels changed');}
    await page.evaluate(()=>window.__yardQualityNative.background('garden'));await clean();
    report.phases.candidates='captured-visual-review-pending';
    report.cost=summarizeCost(await page.evaluate(()=>window.__yardQualityNative.cost()));
    const baseCost=report.cost.rows[0].samples[0];
    for(const row of report.cost.rows){assert.equal(row.samples.length,20);for(const sample of row.samples){assert.equal(sample.copies,['identity','exterior'].includes(row.mode)?1:0);assert.equal(sample.extraDraws,sample.copies);assert.equal(sample.calls,baseCost.calls+sample.copies);assert.equal(sample.triangles,baseCost.triangles+sample.copies);assert.equal(sample.metrics.GPUCompletionMeasured,false);assert(Number.isFinite(sample.metrics.renderSubmitMs)&&Number.isFinite(sample.metrics.totalCallMs));}}
    report.phases.cost='measured-cpu-submission-only';await clean();
    const final=await snapshot();assert.deepEqual(final.scene.canonicalRecords,before.scene.canonicalRecords);assert.deepEqual(final.probe.renderer.propInstances,before.probe.renderer.propInstances);assert.equal(final.probe.renderer.qualityProbe.copy.textureAllocations,1);
    assert.equal(JSON.stringify(fixture),fixtureBefore);report.status='TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING';
  }catch(error){report.status='FAILED_OR_INCOMPLETE';report.errors.push({type:'fatal',message:String(error),stack:String(error.stack).slice(0,4096)});try{report.failureSnapshot=await snapshot();await write('failure-device.png',await page.screenshot({type:'png',scale:'device',timeout:5000}),{kind:'failure-only'});}catch(e){report.failureCaptureError=String(e);}throw error;
  }finally{
    try{report.disposal=await page.evaluate(()=>window.__yardQualityNative?.dispose());if(report.disposal){assert.equal(report.disposal.directCanvases,0);assert.equal(report.disposal.probe.renderer.qualityProbe.copy.disposed,true);assert(report.disposal.backgroundRestored);}}
    catch(error){report.errors.push({type:'disposal',message:String(error)});report.status='FAILED_OR_INCOMPLETE';}
    await page.close();
  }
}
export async function main(){
  assertLaunch(process.env);const[rootArg,workArg]=process.argv.slice(2);assert(rootArg&&workArg);
  const root=path.resolve(rootArg),work=path.resolve(workArg),out=path.join(work,'evidence');await fs.mkdir(out);
  const source=JSON.parse(await fs.readFile(path.join(work,'source.json')));assert.equal(source.head,process.env.GITHUB_SHA);
  const require=createRequire(path.join(root,'package.json')),{chromium}=require('@playwright/test');
  const report=installBoundedDiagnostics({format:'pip-held-native-quality/v1.1',status:'RUNNING',limits:LIMITS,phases:{identity:'not-run',candidates:'not-run',cost:'not-run'},visualAcceptance:'PENDING_NATIVE_IMAGE_REVIEW',releaseAcceptance:false,productionActivation:false,errors:[],console:[],captures:[]});
  let bytes=0,browser,deadline;
  const write=async(name,data,metadata={})=>{assert(/^[a-z0-9-]+\.(png|rgba\.gz)$/.test(name));assert(bytes+data.length<=LIMITS.artifactBytes-REPORT_RESERVE_BYTES,'Evidence cap: upload must not proceed');await fs.writeFile(path.join(out,name),data,{flag:'wx'});bytes+=data.length;report.captures.push({file:name,bytes:data.length,sha256:sha(data),...metadata});};
  try{
    browser=await chromium.launch({headless:false});
    deadline=setTimeout(()=>{report.errors.push({type:'deadline',seconds:LIMITS.browserSeconds});browser.close().catch(()=>{});},LIMITS.browserSeconds*1000);
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
    await runQualityPage({root,work,context,write,report});
  }catch(error){process.exitCode=1;report.status='FAILED_OR_INCOMPLETE';if(!report.errors.some(e=>e.type==='fatal'))report.errors.push({type:'fatal',message:String(error)});}
  finally{
    clearTimeout(deadline);await browser?.close();
    if(report.errors.length){process.exitCode=1;report.status='FAILED_OR_INCOMPLETE';}
    const serialized=serializeBoundedReport(report);if(serialized.reduced){process.exitCode=1;report.status='FAILED_OR_INCOMPLETE';}
    assert(bytes+serialized.bytes.length<=LIMITS.artifactBytes,'Metadata cannot exceed reserved artifact bytes');
    await fs.writeFile(path.join(out,'report.json'),serialized.bytes,{flag:'wx'});
    const files=await listFiles(out),total=files.reduce((n,r)=>n+r.bytes,0);assert(total<=LIMITS.artifactBytes,'Evidence exceeds 8 MiB: no upload');
    console.log(JSON.stringify({status:report.status,artifactBytes:total,evidence:out,retentionDays:3}));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
