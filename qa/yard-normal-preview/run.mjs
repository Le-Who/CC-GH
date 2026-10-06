/** Bounded native QA. Never runs outside the reviewed GitHub first attempt. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {inventory,inventoryDigest,sha} from './closure.mjs';
import {fixtureSnapshot} from './preview-fixture.mjs';
const exec=promisify(execFile),here=import.meta.dirname,OUT=path.join(here,'results'),work=path.join(here,'work'),CAP=8*1024*1024;
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/qa/yard-coherent-scene-20261006');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH));assert(event.created===true&&!event.forced&&!event.deleted&&event.after===process.env.GITHUB_SHA);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={format:'coherent-vite-yard-native-qa/v2',commit:process.env.GITHUB_SHA,status:'RUNNING',retries:0,browserFlagsAdded:[],cases:[],errors:[],networkFailures:[],requests:[],captures:[],limits:{jobMinutes:10,browserSeconds:230,artifactBytes:CAP,retentionDays:3},visualAcceptance:'PENDING_PIXEL_REVIEW',hardwarePerformance:'NOT_TESTED',nativeContextRecovery:'NOT_TESTED',normalPwaRuntime:'NOT_TESTED_SERVICE_WORKERS_BLOCKED',backendAuthSaveAcceptance:'NOT_TESTED',assetBudgetAcceptance:false};
const normalFixture=structuredClone(fixtureSnapshot);normalFixture.yardRuntime={...normalFixture.yardRuntime,version:1,status:'ready',mutable:true,actionProtocol:'yard-v2:'};
// This finite transport fixture admits the real normal release consumer. It has
// no real identity, auth header, database, backend, or mutation response.
const closures={},servers={},origins={};let browser,timer;
const EXPECTED={actorUnitsPerSource:16,actorModelScale:4/3,knownCPU:15111712,modelCPU:12223676,geometryGPU:4028272,initialDurationMs:4885,repeatDurationsMs:[1965,2025],propBytes:120776,propSha256:'c2f7c317511cfd84605bde3f6e32ffd24d35ee66a3d8bc365ae8d0742557f3fd'};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.glsl':'text/plain','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.txt':'text/plain','.jpg':'image/jpeg','.jpeg':'image/jpeg','.avif':'image/avif','.gif':'image/gif','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
await fs.mkdir(OUT,{recursive:true});
async function serve(mode){
 const closureBytes=await fs.readFile(path.join(work,mode+'-closure.json')),c=JSON.parse(closureBytes);assert(c.complete&&c.mode===mode);assert.deepEqual(inventoryDigest(c.files),c.fileInventory,'Compiled file inventory digest mismatch');if(mode==='phone'){const phone=JSON.parse(await fs.readFile(path.join(OUT,'phone-files-manifest.json')));assert.deepEqual(inventoryDigest(phone.files),c.fileInventory,'Phone hosting manifest differs from tested bytes');}report.assetClosures??=[];report.assetClosures.push({mode,fileInventory:c.fileInventory,fullEmittedInventory:c.fullEmittedInventory,compiledModules:c.compiledModules,manifestSha256:sha(closureBytes),files:c.totalFiles,bytes:c.totalBytes,uiAndNativeUrls:c.uiUrls.length,nativeEnumeration:c.nativeEnumeration,canonicalFiles:c.canonicalFiles,optional:c.optional,complete:true});
 const prop=c.optional.find(a=>a.source==='assets/planter-t2.glb');assert.equal(Boolean(prop),mode!=='default');if(prop){assert.equal(prop.bytes,EXPECTED.propBytes);assert.equal(prop.sha256,EXPECTED.propSha256);}
 const by=new Map(c.files.map(r=>[r.path,r]));for(const r of c.files){const b=await fs.readFile(path.join(c.dist,r.path));assert.equal(b.length,r.bytes);assert.equal(sha(b),r.sha256);}
 c.by=by;c.exact=new Set(c.files.map(r=>'/'+r.path));for(const u of c.uiUrls)c.exact.add(u);closures[mode]=c;
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://static.invalid');let rel=u.pathname.slice(1)||'index.html';
  if(req.method!=='GET'||!by.has(rel)||(rel!=='index.html'&&!c.exact.has(u.pathname+u.search))){res.writeHead(404);res.end('Outside static closure');return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(rel)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await fs.readFile(path.join(c.dist,rel)));
 }catch{res.writeHead(500);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers[mode]=server;origins[mode]=`http://127.0.0.1:${server.address().port}`;
}
function observe(){
 const d=window.__nativeYardQA={contexts:[],events:[],recording:null,storageWrites:[],idbWrites:[],shaderErrors:[],programErrors:[]};
 const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){const c=Reflect.apply(get,this,[t,...a]);if(/^webgl/.test(t)&&c&&!d.contexts.includes(c))d.contexts.push(c);return c;};
 for(const C of[window.WebGLRenderingContext,window.WebGL2RenderingContext].filter(Boolean)){const p=C.prototype,compile=p.compileShader,link=p.linkProgram;p.compileShader=function(s){const r=Reflect.apply(compile,this,[s]);if(!this.getShaderParameter(s,this.COMPILE_STATUS))d.shaderErrors.push(this.getShaderInfoLog(s));return r;};p.linkProgram=function(s){const r=Reflect.apply(link,this,[s]);if(!this.getProgramParameter(s,this.LINK_STATUS))d.programErrors.push(this.getProgramInfoLog(s));return r;};}
 for(const name of ['setItem','removeItem','clear']){const original=Storage.prototype[name];Storage.prototype[name]=function(...a){d.storageWrites.push({operation:name,key:String(a[0]||''),at:performance.now()});return Reflect.apply(original,this,a);};}
 for(const name of ['put','add','delete','clear']){const original=IDBObjectStore.prototype[name];IDBObjectStore.prototype[name]=function(...a){d.idbWrites.push({operation:name,store:this.name,at:performance.now()});return Reflect.apply(original,this,a);};}
 const event=e=>{d.events.push({type:e.type,trusted:e.isTrusted,at:performance.now(),hidden:document.hidden,focus:document.hasFocus()});if(e.type==='pagehide')queueMicrotask(()=>console.log('__YARD_PAGEHIDE__'+JSON.stringify({events:d.events,owner:window.__yardPipIntegration?.snapshot()??null,canvases:document.querySelectorAll('.cy-pip-direct-layer canvas').length})));};
 for(const t of['blur','focus','pagehide','pageshow'])window.addEventListener(t,event);document.addEventListener('visibilitychange',event);
 // A recording marker follows actual first canvas attachment. It never drives
 // the owner, clock, pose or route; the marker sits outside the cropped stage.
 new MutationObserver(()=>{
  const recording=d.recording,marker=document.getElementById('qa-marker');
  if(recording?.state!=='armed'||!marker||!document.querySelector('.cy-pip-direct-layer canvas'))return;
  recording.state='started';recording.startedAt=performance.now();recording.initial=window.__yardPipIntegration?.snapshot();const r=document.querySelector('.cy-scene').getBoundingClientRect();recording.stage={x:r.x,y:r.y,width:r.width,height:r.height};marker.style.background='#ff00ff';
  const sample=()=>{if(recording.state!=='started')return;const scene=window.__yardPipIntegration?.snapshot()?.scene;
   if(scene&&scene.attention!==recording.phases.at(-1)?.attention){const r=document.querySelector('.cy-scene').getBoundingClientRect();recording.phases.push({at:performance.now(),elapsedMs:scene.lastFrame?.elapsedMs,attention:scene.attention,stage:{x:r.x,y:r.y,width:r.width,height:r.height}});}
   requestAnimationFrame(sample);};requestAnimationFrame(sample);
 }).observe(document,{childList:true,subtree:true});
}
function snapshot(){const d=window.__nativeYardQA;return{at:performance.now(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,touchPoints:navigator.maxTouchPoints},owner:window.__yardPipIntegration?.snapshot()??null,readOnlyState:window.__yardQAState?.snapshot()??null,observer:{events:d.events,storageWrites:d.storageWrites,idbWrites:d.idbWrites,shaderErrors:d.shaderErrors,programErrors:d.programErrors,contexts:d.contexts.map(gl=>{if(gl.isContextLost())return{lost:true};const x=gl.getExtension('WEBGL_debug_renderer_info');return{lost:false,vendor:gl.getParameter(x?x.UNMASKED_VENDOR_WEBGL:gl.VENDOR),renderer:gl.getParameter(x?x.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};})},directCanvases:document.querySelectorAll('.cy-pip-direct-layer canvas').length};}
function unchanged(s,mode){assert(!s.observer.shaderErrors.length&&!s.observer.programErrors.length,'Native GL error');assert(!s.observer.storageWrites.some(w=>/yard|outbox/i.test(w.key)),'Yard/outbox local storage mutation');assert.equal(s.observer.idbWrites.length,0,'IndexedDB write');if(mode==='phone'){assert(s.readOnlyState?.unchanged,'Read-only fixture changed');assert.equal(s.readOnlyState.mutationAttempts.length,0);assert.equal(s.readOnlyState.pendingActions.length,0);}}
function resources(s,mode){
 const a=s.owner.scene;assert.equal(s.owner.mode,'pip-prototype');assert(a.ready&&a.settled);
 assert.equal(a.savedStateUsedForGeometry,false);assert.equal(a.savedVisitor,false);assert.equal(a.domain,'pip-clean-garden-prototype-v1');
 assert.equal(a.intention,'pip-planter-inspection/experimental-v1');assert.equal(a.attention,'inspection-complete');assert.equal(a.placementIndex,0);
 assert.equal(a.actorUnitsPerSource,EXPECTED.actorUnitsPerSource);assert.equal(a.renderer.actorUnitsPerSource,EXPECTED.actorUnitsPerSource);assert.equal(a.renderer.actorModelScale,EXPECTED.actorModelScale);
 assert.equal(a.renderer.mode,'direct');assert.equal(a.renderer.copies,0);assert.equal(s.directCanvases,1);
 assert.equal(a.knownCPUBufferPeak,EXPECTED.knownCPU);assert.equal(a.knownModelCPUBufferPeak,EXPECTED.modelCPU);assert.equal(a.resources.combinedKnownCPUBufferPeakBytes,EXPECTED.knownCPU);assert.equal(a.resources.geometryGPUBufferBytes,EXPECTED.geometryGPU);
 assert(a.knownCPUBufferPeak<=a.limits.knownCPU&&a.rgba.fits);assert.equal(a.rgba.legacyAtlasBytes,0);assert.equal(a.rgba.legacySceneStaticBytes,0);assert.equal(s.owner.lastRetired.globalDecodedBudget.bitmapOwners,0);
 assert.equal(a.route.kind,'pip-planter-inspection/experimental-v1');assert.equal(a.route.displayedElapsedMs,a.route.durationMs);
 if(a.route.holdOnly)assert(EXPECTED.repeatDurationsMs.includes(a.route.durationMs));else assert.equal(a.route.durationMs,EXPECTED.initialDurationMs);
 unchanged(s,mode);
}
const control=(page,name)=>page.locator(`[data-pip-control="${name}"]`);
const settled=page=>page.waitForFunction(()=>{const s=window.__yardPipIntegration?.snapshot();return s?.mode==='pip-prototype'&&s.scene?.settled&&s.scene.renderer?.mounted&&!s.scene.scheduler.pending&&!s.scene.viewportBlocked;},null,{timeout:18000});
async function coherent(page){await page.waitForFunction(()=>{const s=window.__yardPipIntegration?.snapshot()?.scene,c=document.querySelector('.cy-scene > canvas'),r=c?.getBoundingClientRect();return s?.settled&&!s.viewportBlocked&&!s.scheduler.pending&&r&&Math.abs(s.projection.width-r.width)<.5&&Math.abs(s.projection.height-r.height)<.5&&c.width===Math.round(r.width*Math.min(devicePixelRatio,2))&&c.height===Math.round(r.height*Math.min(devicePixelRatio,2));},null,{timeout:8000});}
async function layout(page){return page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};const labels=[...document.querySelectorAll('.cy-actions strong:not(.cy-visually-hidden)')].map(e=>{const range=document.createRange();range.selectNodeContents(e);const r=range.getBoundingClientRect();return{text:e.textContent,textRect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},container:box(e.closest('button')),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};});return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,stage:box(document.querySelector('.cy-scene')),controls:[...document.querySelectorAll('.cy-header button,.cy-actions button,.cy-pip-controls button')].filter(e=>e.getClientRects().length).map(e=>({...box(e),label:e.textContent.trim()||e.getAttribute('aria-label')})),labels};});}
function checkLayout(l){assert(l.scrollWidth<=l.width,'Horizontal overflow');assert(l.stage.x>=0&&l.stage.y>=0&&l.stage.right<=l.width+1&&l.stage.bottom<=l.height+1,'Stage clipped');for(const c of l.controls){assert(c.width>=44&&c.height>=44,'Tap target: '+c.label);assert(c.x>=-1&&c.y>=-1&&c.right<=l.width+1&&c.bottom<=l.height+1,'Control clipped: '+c.label);assert(c.bottom<=l.stage.y+1||c.y>=l.stage.bottom-1||c.right<=l.stage.x||c.x>=l.stage.right,'Control over stage: '+c.label);}for(const t of l.labels){assert(t.scrollWidth<=t.clientWidth+1,'Dock label clipped: '+t.text);const r=t.textRect,b=t.container;assert(r.x>=b.x-1&&r.y>=b.y-1&&r.right<=b.right+1&&r.bottom<=b.bottom+1,'Dock text escapes button');}}
// Failure-only evidence is taken before cleanup; never replaces the original error.
const failedCaseIds=new Set(),capturedFailures=new WeakSet();
async function captureFailure(x,error){
 x.failure=error;const objectError=error!==null&&(typeof error==='object'||typeof error==='function');
 if(failedCaseIds.has(x.id)||(objectError&&capturedFailures.has(error)))return;
 failedCaseIds.add(x.id);if(objectError)capturedFailures.add(error);
 const entry={case:x.id,mode:x.mode,originalError:String(error),stack:error?.stack??null,status:'CAPTURING',captureErrors:[]};
 report.failureCaptures??=[];report.failureCaptures.push(entry);
 const bounded=async(promise,ms)=>{let t;try{return await Promise.race([promise,new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('Failure diagnostic timeout')),ms);})]);}finally{clearTimeout(t);}};
 try{
  if(!x.page||x.page.isClosed()){entry.status='NO_OPEN_PAGE';return;}
  entry.viewport=x.page.viewportSize();
  try{entry.dom=await bounded(x.page.evaluate(()=>{
   const box=e=>{if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,display:c.display,visibility:c.visibility,overflow:c.overflow};};
   return{readyState:document.readyState,url:location.pathname+location.search,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},document:{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},app:box(document.querySelector('.cy-app')),stage:box(document.querySelector('.cy-scene')),dock:box(document.querySelector('.cy-actions')),status:document.querySelector('.cy-status')?.textContent??null,controls:[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).slice(0,80).map(e=>({text:(e.textContent||e.getAttribute('aria-label')||'').slice(0,240),disabled:e.disabled,...box(e)})),canvases:[...document.querySelectorAll('canvas')].map(c=>({backing:[c.width,c.height],rect:box(c)})),html:(document.querySelector('#root')?.outerHTML||document.body?.outerHTML||'').slice(0,24000)};
  }),3000);}catch(e){entry.captureErrors.push('DOM: '+String(e));}
  try{entry.snapshot=await bounded(x.page.evaluate(snapshot),3000);}catch(e){entry.captureErrors.push('State: '+String(e));}
  // Persist error/DOM metrics first, including if the screenshot capability fails.
  await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n').catch(e=>entry.captureErrors.push('Pre-capture report: '+String(e)));
  try{
   const bytes=await x.page.screenshot({type:'jpeg',quality:60,scale:'css',fullPage:false,timeout:5000}),file=`failure-${x.mode}-${x.id}.jpg`;
   const used=(await inventory(OUT)).reduce((n,r)=>n+r.bytes,0);
   if(used+bytes.length+64*1024<=CAP){await fs.writeFile(path.join(OUT,file),bytes);entry.screenshot={file,bytes:bytes.length,sha256:sha(bytes),status:'CAPTURED'};report.captures.push({file,bytes:bytes.length,viewport:entry.viewport,failureOnly:true});}
   else{await fs.writeFile(path.join(work,file),bytes);entry.screenshot={file,bytes:bytes.length,sha256:sha(bytes),status:'PRESERVED_IN_JOB_WORK_ONLY',reason:'Insufficient artifact headroom; eight MiB cap remains enforced'};}
  }catch(e){entry.captureErrors.push('Screenshot: '+String(e));}
  entry.status=entry.screenshot?.status==='CAPTURED'?'FAILURE_EVIDENCE_CAPTURED':'FAILURE_METRICS_CAPTURED_SCREENSHOT_UNAVAILABLE';
 }catch(e){entry.status='FAILURE_CAPTURE_INCOMPLETE';entry.captureErrors.push(String(e));}
 finally{await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n').catch(e=>entry.captureErrors.push('Failure report: '+String(e)));}
}
async function closeCase(x){
 if(!x.failure){const observed=[...report.errors,...report.networkFailures].find(e=>e.case===x.id);if(observed)await captureFailure(x,Error('Recorded native case error: '+JSON.stringify(observed)));}
 try{await x.context.close();}catch(error){report.cleanupErrors??=[];report.cleanupErrors.push({case:x.id,error:String(error)});if(!x.failure){await captureFailure(x,error);throw error;}}
}
async function still(page,name,png=false){const file=name+(png?'.png':'.jpg');await page.screenshot({path:path.join(OUT,file),type:png?'png':'jpeg',...(png?{}:{quality:80}),scale:'css',timeout:10000});report.captures.push({file,bytes:(await fs.stat(path.join(OUT,file))).size,viewport:page.viewportSize()});return file;}
let caseId=0;
async function open(mode,{optIn=false,viewport={width:390,height:844},mobile=true,holdAsset=null,record=false}={}){
 const c=closures[mode],origin=origins[mode],id=++caseId;
 const heldSource=holdAsset==='actor'?'assets/pip.glb':holdAsset==='prop'?'assets/planter-t2.glb':null;
 const heldAsset=heldSource?c.optional.find(a=>a.source===heldSource):null;assert(!holdAsset||heldAsset,'Delayed asset absent from exact closure');
 const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',...(record?{recordVideo:{dir:path.join(work,'raw'),size:{width:390,height:844}}}:{})});let page;const opening={context,id,mode};try{await context.addInitScript(observe);
 let release,requested;const held=new Promise(r=>release=r),assetRequested=new Promise(r=>requested=r);const receipts=[];
 await context.route('**/*',async route=>{const q=route.request(),u=new URL(q.url()),rel=u.pathname.slice(1)||'index.html';report.requests.push({case:id,mode,method:q.method(),url:u.pathname+u.search});
  const reject=()=>{report.networkFailures.push({case:id,kind:'OUTSIDE_CLOSURE',method:q.method(),url:q.url()});return route.abort();};
  if(u.origin!==origin||q.method()!=='GET'||q.headers().authorization)return reject();
  if(mode!=='phone'&&u.pathname==='/api/config')return route.fulfill({json:{devAuthEnabled:false,buildId:'yard-coherent-scene-qa-20261006'}});
  if(mode!=='phone'&&u.pathname==='/api/player/snapshot')return route.fulfill({json:normalFixture});
  if(!c.by.has(rel)||(rel!=='index.html'&&!c.exact.has(u.pathname+u.search)))return reject();
  if(heldAsset&&rel===heldAsset.path){requested({asset:heldAsset,requestedAt:Date.now()});await held;}
  try{return await route.continue();}catch(e){if(!(heldAsset&&rel===heldAsset.path))throw e;}
 });
 page=await context.newPage();opening.page=page;page.setDefaultTimeout(8000);page.on('pageerror',e=>report.errors.push({case:id,type:'pageerror',message:String(e)}));page.on('console',m=>{if(m.text().startsWith('__YARD_PAGEHIDE__'))receipts.push(JSON.parse(m.text().slice('__YARD_PAGEHIDE__'.length)));else if(m.type()==='error')report.errors.push({case:id,type:'console',message:m.text()});});page.on('response',r=>{if(r.status()>=400)report.networkFailures.push({case:id,status:r.status(),url:r.url()});});page.on('requestfailed',r=>{if(!/ERR_ABORTED/.test(r.failure()?.errorText||''))report.networkFailures.push({case:id,type:'requestfailed',url:r.url(),error:r.failure()});});
 const query=mode==='phone'?(optIn?'?yardPipPreview=1':''):'?tab=room'+(optIn?'&yardPipPreview=1':'');
 await page.goto(origin+'/'+query,{waitUntil:'networkidle'});await page.bringToFront();await page.locator('.cy-app').waitFor();
 if(mode!=='default'&&optIn)await page.waitForFunction(()=>window.__yardPipIntegration?.snapshot()?.scene?.ready===true,null,{timeout:16000});
 return{page,context,id,mode,release,assetRequested,heldAsset,receipts};
 }catch(error){await captureFailure(opening,error);await closeCase(opening);throw error;}
}
function assertOptionalOff(x){const c=closures[x.mode],urls=report.requests.filter(r=>r.case===x.id).map(r=>new URL(r.url,'http://x').pathname.slice(1));assert(!urls.some(u=>c.optionalChunks.includes(u)||c.optional.some(a=>a.path===u)),'Off consumer fetched optional resources');}
async function matrix(x){const result={name:x.mode+'-full-hud-matrix',rows:[]};report.cases.push(result);const baseline=await x.page.evaluate(snapshot);for(const[width,height]of[[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[393,873]]){await x.page.setViewportSize({width,height});await coherent(x.page);const l=await layout(x.page),s=await x.page.evaluate(snapshot);checkLayout(l);resources(s,x.mode);assert.equal(s.owner.transitions,baseline.owner.transitions);assert.deepEqual(s.owner.scene.lastFrame.root,baseline.owner.scene.lastFrame.root);result.rows.push({width,height,layout:l,ownerMode:s.owner.mode,inspectionCount:s.owner.scene.inspectionCount,frameCount:s.owner.scene.frameCount,still:await still(x.page,x.mode+'-'+width+'x'+height,width===390&&x.mode==='phone')});}
 const desktop=await open(x.mode,{optIn:true,viewport:{width:1280,height:720},mobile:false});try{await control(desktop.page,'toggle').click();await settled(desktop.page);const l=await layout(desktop.page);checkLayout(l);resources(await desktop.page.evaluate(snapshot),x.mode);result.rows.push({width:1280,height:720,layout:l,desktopContext:true,still:await still(desktop.page,x.mode+'-1280x720')});}catch(error){await captureFailure(desktop,error);throw error;}finally{await closeCase(desktop);}await x.page.setViewportSize({width:390,height:844});await coherent(x.page);}
async function inactiveMatrix(x){
 const result={name:x.mode+'-default-off-hud-matrix',rows:[]};report.cases.push(result);
 for(const[width,height]of[[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[393,873]]){
  await x.page.setViewportSize({width,height});await x.page.waitForFunction(()=>{const c=document.querySelector('.cy-scene > canvas'),r=c?.getBoundingClientRect();return r&&c.width===Math.round(r.width*Math.min(devicePixelRatio,2))&&c.height===Math.round(r.height*Math.min(devicePixelRatio,2));});
  const l=await layout(x.page);checkLayout(l);result.rows.push({width,height,layout:l,...([320,390,568,844].includes(width)?{still:await still(x.page,x.mode+'-off-'+width+'x'+height)}:{})});
 }
 assertOptionalOff(x);await x.page.setViewportSize({width:390,height:844});
 const desktop=await open(x.mode,{viewport:{width:1280,height:720},mobile:false});
 try{const l=await layout(desktop.page),s=await desktop.page.evaluate(snapshot);checkLayout(l);unchanged(s,x.mode);assertOptionalOff(desktop);assert.equal(s.observer.contexts.length,0);assert.equal(await control(desktop.page,'toggle').count(),0);result.rows.push({width:1280,height:720,layout:l,desktopContext:true,still:await still(desktop.page,x.mode+'-off-1280x720')});}
 catch(error){await captureFailure(desktop,error);throw error;}finally{await closeCase(desktop);}await x.page.bringToFront();
}
async function lifecycle(x){
 const original=await x.page.evaluate(snapshot);await control(x.page,'inspect-again').tap();await sleep(100);
 assert(await control(x.page,'inspect-again').isDisabled(),'Mid-inspection replacement enabled');
 const moving=await x.page.evaluate(snapshot);assert(moving.owner.scene.route.holdOnly);assert.equal(moving.owner.scene.inspectionCount,original.owner.scene.inspectionCount+1);
 await x.page.setViewportSize({width:568,height:240});await x.page.waitForFunction(()=>window.__yardPipIntegration.snapshot().scene.viewportBlocked);
 const blockedStart=await x.page.evaluate(snapshot);await sleep(200);const blockedEnd=await x.page.evaluate(snapshot);
 assert.equal(blockedStart.owner.scene.route.displayedElapsedMs,blockedEnd.owner.scene.route.displayedElapsedMs);assert.equal(blockedStart.owner.scene.frameCount,blockedEnd.owner.scene.frameCount);assert(!blockedEnd.owner.scene.scheduler.pending);
 await x.page.setViewportSize({width:390,height:844});await x.page.waitForFunction(t=>{const s=window.__yardPipIntegration.snapshot().scene;return !s.viewportBlocked&&s.route.displayedElapsedMs>t;},blockedEnd.owner.scene.route.displayedElapsedMs);
 const viewportResumed=await x.page.evaluate(snapshot);assert.equal(viewportResumed.owner.transitions,moving.owner.transitions);
 report.cases.push({name:x.mode+'-inspection-viewport-pause-resume',moving,blockedStart,blockedEnd,viewportResumed});
 const before=await x.page.evaluate(snapshot),other=await x.context.newPage();await other.goto('about:blank');await other.bringToFront();await sleep(150);
 const pausedStart=await x.page.evaluate(snapshot);await sleep(200);const pausedEnd=await x.page.evaluate(snapshot);
 await x.page.bringToFront();await other.close();await sleep(150);
 const resumed=await x.page.evaluate(snapshot),events=resumed.observer.events.filter(e=>e.trusted&&e.at>=before.at),hidden=events.some(e=>e.type==='visibilitychange'&&e.hidden),shown=events.some(e=>e.type==='visibilitychange'&&!e.hidden),blur=events.some(e=>e.type==='blur'),focus=events.some(e=>e.type==='focus');
 if(hidden||blur)assert.equal(pausedStart.owner.scene.route.displayedElapsedMs,pausedEnd.owner.scene.route.displayedElapsedMs,'Native pause failed');
 if(shown&&focus&&!pausedEnd.owner.scene.settled)assert(resumed.owner.scene.route.activeElapsedMs>pausedEnd.owner.scene.route.activeElapsedMs,'Native resume failed');
 report.cases.push({name:x.mode+'-native-hide-resume',before,pausedStart,pausedEnd,resumed,qualification:hidden&&shown&&blur&&focus?'TRUSTED_EVENTS_OBSERVED':'UNQUALIFIED_MISSING_NATIVE_EVENTS'});
 await settled(x.page);const completed=await x.page.evaluate(snapshot);resources(completed,x.mode);assert.deepEqual(completed.owner.scene.lastFrame.root,original.owner.scene.lastFrame.root,'Supported repeat relocated Pip');
 const count=completed.owner.scene.inspectionCount;await sleep(160);const idle=await x.page.evaluate(snapshot);assert.equal(idle.owner.scene.inspectionCount,count);assert.equal(idle.owner.scene.frameCount,completed.owner.scene.frameCount);assert(!idle.owner.scene.scheduler.pending);
 report.cases.push({name:x.mode+'-supported-repeat-and-finite-idle',before:original,completed,idle,qualification:'Actual supported inspect-again UI; no arbitrary route or prop relocation'});
}
async function rollback(x){
 await control(x.page,'toggle').click();await x.page.waitForFunction(()=>{const o=window.__yardPipIntegration.snapshot();return o.mode==='legacy'&&!o.enabled&&o.scene.ready;},null,{timeout:16000});
 const s=await x.page.evaluate(snapshot);assert.equal(s.directCanvases,0);unchanged(s,x.mode);return s;
}
async function delayedCancellation(mode,asset){
 const late=await open(mode,{optIn:true,holdAsset:asset});let timer;
 try{
  await control(late.page,'toggle').click();
  const requested=await Promise.race([late.assetRequested,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No delayed '+asset+' GLB request')),9000);})]);clearTimeout(timer);
  const loading=await late.page.evaluate(snapshot);assert.equal(loading.directCanvases,0,'Pending asset mounted a canvas');
  if(asset==='prop')assert(report.requests.some(r=>r.case===late.id&&new URL(r.url,'http://qa').pathname.slice(1)===closures[mode].optional.find(a=>a.source==='assets/pip.glb').path),'Prop cancellation did not follow actual actor load');
  await control(late.page,'toggle').click();late.release();
  await late.page.waitForFunction(()=>{const o=window.__yardPipIntegration.snapshot();return o.mode==='legacy'&&!o.enabled&&o.scene.ready;},null,{timeout:16000});
  const cancelled=await late.page.evaluate(snapshot);assert.equal(cancelled.directCanvases,0);unchanged(cancelled,mode);
  await sleep(160);const after=await late.page.evaluate(snapshot);assert.equal(after.directCanvases,0);assert.equal(after.owner.transitions,cancelled.owner.transitions);assert.equal(after.owner.mode,'legacy');unchanged(after,mode);
  report.cases.push({name:mode+'-delayed-'+asset+'-init-cancel',requested,loading,cancelled,after,qualification:'Native request held at exact pinned asset; cancellation then releases late response without mounting stale scene'});
 }catch(error){await captureFailure(late,error);throw error;}finally{clearTimeout(timer);late.release();await closeCase(late);}
}
async function exercise(mode){
 const x=await open(mode,{optIn:true});try{
  assertOptionalOff(x);assert.equal((await x.page.evaluate(snapshot)).observer.contexts.length,0);
  await control(x.page,'toggle').click();await settled(x.page);resources(await x.page.evaluate(snapshot),mode);
  assert.equal(await x.page.locator('[data-pip-control^="goal-"],[data-pip-control="planter"]').count(),0,'Obsolete diagnostic controls visible');
  await matrix(x);
  const before=await x.page.evaluate(snapshot),stage=await x.page.locator('.cy-scene').boundingBox();
  await x.page.touchscreen.tap(stage.x+stage.width*.22,stage.y+stage.height*.15);const tapped=await x.page.evaluate(snapshot);
  assert.deepEqual(tapped.owner.scene.lastFrame.root,before.owner.scene.lastFrame.root,'Foreground tap moved inspection');
  report.cases.push({name:mode+'-actual-game-scale-depth-contact',before,tapped,still:await still(x.page,mode+'-game-scale-depth-contact',true),qualification:'Native unscaled game viewport with actual T2 prop and uniform Pip scale. Depth, sole contact and art require separate pixel review; no diagnostic mesh relocation.'});
  await control(x.page,'inspect-again').tap();
  await x.page.waitForFunction(()=>window.__yardPipIntegration.snapshot().scene.attention==='sniff-leaf',null,{timeout:5000});
  const sniff=await x.page.evaluate(snapshot);assert.equal(sniff.owner.scene.placementIndex,0);assert(sniff.owner.scene.route.holdOnly);assert.equal(sniff.owner.scene.route.durationMs,2025);assert(await control(x.page,'inspect-again').isDisabled());
  report.cases.push({name:mode+'-native-leaf-inspection-pixels',snapshot:sniff,still:await still(x.page,mode+'-leaf-inspection-contact',true),qualification:'Native repeated inspection near measured leaf. Still is for depth/contact review, not proof of motion quality.'});
  await settled(x.page);const afterSniff=await x.page.evaluate(snapshot);resources(afterSniff,mode);assert.deepEqual(afterSniff.owner.scene.lastFrame.root,before.owner.scene.lastFrame.root);
  await x.page.locator('.cy-actions button').nth(2).click();await x.page.locator('dialog[open]').waitFor();const portrait=x.page.locator('img[src*="/r1-pip/"]');await portrait.first().scrollIntoViewIfNeeded();await x.page.waitForFunction(()=>[...document.querySelectorAll('img[src*="/r1-pip/"]')].some(i=>i.complete&&i.naturalWidth>0));
  const dialog=await x.page.locator('dialog[open]').evaluate(d=>{const r=d.getBoundingClientRect(),b=d.querySelector('header button').getBoundingClientRect();return{focusWithin:d.contains(document.activeElement),width:r.width,height:r.height,close:{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom},viewport:{width:innerWidth,height:innerHeight}};});
  assert(dialog.focusWithin);assert(dialog.close.width>=44&&dialog.close.height>=44&&dialog.close.x>=0&&dialog.close.y>=0&&dialog.close.right<=dialog.viewport.width+1&&dialog.close.bottom<=dialog.viewport.height+1,'Dialog dismiss button clipped or undersized');
  report.cases.push({name:mode+'-guests-portrait-and-dismiss',dialog,still:await still(x.page,mode+'-guests')});await x.page.locator('dialog header button').click();assert.equal(await x.page.locator('dialog[open]').count(),0);
  await lifecycle(x);const terminal=await x.page.evaluate(snapshot);resources(terminal,mode);
  await x.page.setViewportSize({width:568,height:240});await x.page.waitForFunction(()=>window.__yardPipIntegration.snapshot().scene.viewportBlocked);const a=await x.page.evaluate(snapshot);await sleep(180);const b=await x.page.evaluate(snapshot);
  assert.equal(a.owner.scene.frameCount,b.owner.scene.frameCount);assert(!b.owner.scene.scheduler.pending);await x.page.setViewportSize({width:844,height:390});await coherent(x.page);const recovered=await x.page.evaluate(snapshot);
  assert.equal(recovered.owner.transitions,terminal.owner.transitions);assert.deepEqual(recovered.owner.scene.lastFrame.root,terminal.owner.scene.lastFrame.root);report.cases.push({name:mode+'-undersize-recovery',blocked:a,recovered});
  report.cases.push({name:mode+'-rollback',snapshot:await rollback(x),still:await still(x.page,mode+'-rollback')});
  await control(x.page,'toggle').click();await settled(x.page);await x.page.goto('about:blank');await sleep(100);
  report.cases.push({name:mode+'-pagehide-disposal',receipts:x.receipts,qualification:x.receipts.some(r=>r.canvases===0&&r.events.some(e=>e.type==='pagehide'&&e.trusted))?'TRUSTED_PAGEHIDE_CANVAS_REMOVAL':'UNQUALIFIED_MISSING_DISPOSAL_RECEIPT'});
 }catch(error){await captureFailure(x,error);throw error;}finally{await closeCase(x);}
 for(const asset of['actor','prop'])await delayedCancellation(mode,asset);
}
async function videoEvidence(raw,rect){
 const frames=JSON.parse((await exec('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',raw],{maxBuffer:2*CAP,timeout:20000})).stdout).frames;
 const times=frames.map(f=>Number(f.best_effort_timestamp_time)),rgb=(await exec('ffmpeg',['-v','error','-i',raw,'-vf','crop=16:16:366:4,scale=1:1:flags=neighbor,format=rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer',maxBuffer:CAP,timeout:20000})).stdout;assert.equal(rgb.length/3,times.length);
 const find=(predicate,from=0)=>{for(let i=from;i<times.length;i++)if(predicate(...rgb.subarray(i*3,i*3+3)))return i;return-1;};
 const begin=find((r,g,b)=>r>150&&g<115&&b>150),end=find((r,g,b)=>r<115&&g>150&&b>150,Math.max(0,begin+1));assert(begin>=0&&end>begin,'Native route recording markers missing');
 const start=times[begin],duration=times[end]-start;assert(duration>=5&&duration<=9,'Native recording outside 5–9 seconds');const file='actual-yard-approach-sniff-settle.webm';
 await exec('ffmpeg',['-v','error','-i',raw,'-ss',String(start),'-t',String(duration),'-vf',`crop=${rect.width}:${rect.height}:${rect.x}:${rect.y}`,'-an','-c:v','libvpx-vp9','-lossless','1','-row-mt','1','-y',path.join(OUT,file)],{maxBuffer:CAP,timeout:30000});
 return{file,nativeDurationSeconds:duration,nativeFrameTimestamps:times.slice(begin,end),processing:'Native screen recording cropped and trimmed with lossless encode. No speed change, interpolation, fabricated frames, pose injection or screenshots during the approach and inspection.',qualification:'Actual software-rendered scene clip; not hardware-phone FPS'};
}
async function clip(){
 const x=await open('phone',{optIn:true,record:true});let raw,rect;
 try{
  // Warm the real assets, then retire through the actual toggle. inspect-again
  // intentionally repeats only the supported gesture, so fresh activation is
  // the sole admitted way to record the full approach again.
  await control(x.page,'toggle').click();await settled(x.page);await rollback(x);
  await x.page.evaluate(()=>{const m=document.createElement('div');m.id='qa-marker';Object.assign(m.style,{position:'fixed',left:'366px',top:'4px',width:'16px',height:'16px',background:'#fff',zIndex:'2147483647',pointerEvents:'none'});document.body.append(m);window.__nativeYardQA.recording={state:'armed',phases:[]};});
  await sleep(160);await control(x.page,'toggle').click();await settled(x.page);await sleep(900);
  const recording=await x.page.evaluate(()=>{const d=window.__nativeYardQA;d.recording.state='complete';d.recording.completedAt=performance.now();d.recording.terminal=window.__yardPipIntegration.snapshot();const r=document.querySelector('.cy-scene').getBoundingClientRect();d.recording.terminalStage={x:r.x,y:r.y,width:r.width,height:r.height};document.querySelector('#qa-marker').style.background='#00ffff';return d.recording;});
  const r=recording.stage;assert(r,'Native recording stage missing');rect={x:Math.floor(r.x),y:Math.floor(r.y),width:Math.floor(r.width/2)*2,height:Math.floor(r.height/2)*2};
  await sleep(160);assert(recording.initial,'Native mount did not mark recording');assert.equal(recording.initial.scene.lastFrame.elapsedMs,0,'Recording missed initial supported approach pose');
  assert.equal(recording.initial.scene.route.durationMs,EXPECTED.initialDurationMs);assert.equal(recording.initial.scene.route.holdOnly,false);assert.equal(recording.initial.scene.inspectionCount,0);
  assert(recording.terminal.scene.settled&&!recording.terminal.scene.scheduler.pending);assert.equal(recording.terminal.scene.route.durationMs,EXPECTED.initialDurationMs);assert.equal(recording.terminal.scene.route.holdOnly,false);assert.equal(recording.terminal.scene.inspectionCount,0);
  for(const stage of [...recording.phases.map(p=>p.stage),recording.terminalStage])for(const k of ['x','y','width','height'])assert(Math.abs(stage[k]-recording.stage[k])<.5,'Native stage reframed during inspection: '+k);
  for(const attention of['approach-leaf','sniff-leaf','inspection-complete'])assert(recording.phases.some(p=>p.attention===attention),'Native clip did not observe '+attention);
  resources(await x.page.evaluate(snapshot),'phone');report.recordedInspection=recording;
 }catch(error){await captureFailure(x,error);throw error;}
 finally{const v=x.page.video();await closeCase(x);try{raw=await v.path();}catch(error){if(!x.failure)throw error;report.cleanupErrors??=[];report.cleanupErrors.push({case:x.id,error:String(error)});}}
 try{report.clip={...await videoEvidence(raw,rect),sourceDurationMs:EXPECTED.initialDurationMs,restart:'Actual toggle retirement and fresh activation; supported inspect-again does not replay approach',recordingCase:x.id};}
 catch(error){report.recordingFailure={error:String(error),rawBytes:(await fs.stat(raw)).size,originalPreservedInJob:true};if(!(await fs.stat(path.join(OUT,'actual-yard-approach-sniff-settle.webm')).catch(()=>null)))await fs.copyFile(raw,path.join(OUT,'recording-failure-raw.webm'));throw error;}
}
try{
 const sourceBuilds=JSON.parse(await fs.readFile(path.join(OUT,'source-builds-and-guards.json')));report.assetBudgetAcceptance=sourceBuilds.assetGuards.every(g=>g.passed);
 for(const mode of['default','preview','phone'])await serve(mode);
 const {chromium}=await import('@playwright/test');browser=await chromium.launch({headless:false});report.browserVersion=browser.version();timer=setTimeout(()=>{report.errors.push({type:'deadline',message:'230-second bounded browser deadline'});void browser.close();},230000);
 for(const[mode,optIn]of[['default',false],['default',true],['preview',false],['phone',false]]){const x=await open(mode,{optIn});try{assertOptionalOff(x);const s=await x.page.evaluate(snapshot);assert.equal(s.observer.contexts.length,0);assert.equal(await control(x.page,'toggle').count(),0);unchanged(s,mode);if(!optIn&&(mode==='default'||mode==='phone'))await inactiveMatrix(x);const l=await layout(x.page);checkLayout(l);report.cases.push({name:mode+(optIn?'-url-cannot-enable-compiled-off':'-default-off'),snapshot:s,layout:l,still:await still(x.page,mode+(optIn?'-flag-off-query':'-default-off'))});}catch(error){await captureFailure(x,error);throw error;}finally{await closeCase(x);}}
 for(const mode of['preview','phone'])await exercise(mode);
 await clip();
 report.mutationEvidence={nonGetRequests:report.requests.filter(r=>r.method!=='GET'),qualification:'GET-only closed transport plus per-case zero Yard/outbox storage and IndexedDB writes; immutable phone store unchanged. No backend/economy acceptance inferred.'};assert.equal(report.mutationEvidence.nonGetRequests.length,0);
 assert.equal(report.errors.length,0,'Browser console/page errors');assert.equal(report.networkFailures.length,0,'Request closure or HTTP errors');
 report.status='NATIVE_EVIDENCE_READY_VISUAL_REVIEW_PENDING';
}catch(error){report.status='FAILURE_OR_MISSING_EVIDENCE';report.errors.push({type:'assertion-or-runtime',message:String(error),stack:error.stack});process.exitCode=1;}
finally{
 clearTimeout(timer);await browser?.close().catch(error=>{report.cleanupErrors??=[];report.cleanupErrors.push({scope:'browser',error:String(error)});report.errors.push({type:'browser-cleanup',message:String(error)});report.status='FAILURE_OR_MISSING_EVIDENCE';process.exitCode=1;});for(const server of Object.values(servers))await new Promise(r=>server.close(r));
 report.requestsByMode=Object.fromEntries(['default','preview','phone'].map(mode=>[mode,[...new Set(report.requests.filter(r=>r.mode===mode).map(r=>r.url))].sort()]));
 report.boundaries=['Normal builds use the actual index/App/YardReleaseGame and finite GET-only synthetic config/snapshot transport. No real authentication/backend/save acceptance is claimed.','The phone entry imports the same root CourtyardGame with its public read-only store fixture and no API/auth/outbox/PWA.','Source builds/closures, current asset-guard outcomes and mechanical browser checks are separate gates; historical media-budget failures are not erased.','Real mobile GPU performance, native context recovery and missing trusted lifecycle events remain unqualified.'];
 const escape=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 await fs.writeFile(path.join(OUT,'index.html'),'<!doctype html><meta charset="utf-8"><title>Normal Yard native evidence</title><h1>'+report.status+'</h1><p>Visual review pending. See report.json for mechanical results, native lifecycle qualification and limits. Source/asset guard outcomes are separate.</p>'+report.captures.map(r=>'<figure><img style="max-width:100%" src="'+r.file+'"><figcaption>'+escape(r.file)+'</figcaption></figure>').join('')+(report.clip?'<video controls src="'+report.clip.file+'"></video>':''));
 await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');
 const files=await inventory(OUT);const bytes=files.reduce((n,r)=>n+r.bytes,0);assert(bytes<=CAP,'Eight MiB cap exceeded; original evidence retained, upload forbidden');console.log(JSON.stringify({status:report.status,artifactBytes:bytes,captures:report.captures.length,clip:report.clip?.nativeDurationSeconds}));
}
