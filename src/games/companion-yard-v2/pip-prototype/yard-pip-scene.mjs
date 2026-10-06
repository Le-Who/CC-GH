import{assertWorldScale}from'./world-scale.mjs';
import{createOptionalPipRenderer}from'./prototype/optional-pip-renderer.mjs';
import{createFixtureClock}from'./fixture-clock.mjs';
import{createFixtureScheduler}from'./fixture-scheduler.mjs';
import{createCleanProjection,assertCleanComposition,supportsCleanViewport,CLEAN_STAGE_MIN}from'./projection.mjs';
import{makePlanterInspection,repeatPlanterInspection,samplePlanterInspection,PLANTER_INSPECTION_VERSION}from'./planter-interaction.mjs';
import{acquirePipLease,admitPipResources,rgbaAdmission,KNOWN_CPU_BUFFER_PEAK,BACKGROUND_ENCODED_BYTES,ENCODED_BACKGROUND_CPU_BYTES,COMBINED_KNOWN_CPU_PEAK,LIMITS}from'./resources.mjs';
import{uiImageLifetimeLedger}from'../ui-image-reserve.mjs';
import{courtyardPresentation}from'../presentation.mjs';
import{MIKA_CLIPS}from'../../../../game-logic/yard-v2/media/mika-clips.mjs';

/** Real Yard scene interface, separate inactive location, no gameplay writes. */
export function createPipYardScene(canvas,{directHost,uiImageOwner,onView=()=>{},onPrototypeState=()=>{},onFailure=()=>{},now=()=>performance.now(),
 rendererFactory=createOptionalPipRenderer,fetchImpl=fetch,decodeImage=createImageBitmap,requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}={}){
 if(!directHost?.appendChild||!uiImageOwner)throw Error('Stage and UI resource owners required');
 const abort=new AbortController(),ctx=canvas.getContext('2d');
 let disposed=false,api=null,image=null,setup=null,descriptor=null,projection=null,run=null,snapshot=null,lastFrame=null,inspectionCount=0,placementIndex=0;
 // Full current UI lifetime, including 1,516,600 B catalogue and new R1 portrait.
 let uiBytes=Math.max(uiImageLifetimeLedger().bytes,19138304,uiImageOwner.snapshot().bytes),backgroundBytes=0,lastResources=null,peakRgba=0,frameCount=0,lastPhase='loading',retirement=null;
 const release=acquirePipLease(),clock=createFixtureClock({now}),listeners=[];
 let viewportBlocked=false,rejectedViewport=null,viewportRefusals=0,viewportRecoveries=0,frozenResizePending=false,resolveViewport;
 const viewportReady=new Promise(resolve=>{resolveViewport=resolve;});
 const initialVisibility={canvas:canvas.style?.visibility??'',direct:directHost.style?.visibility??''};
 function hideSurface(hidden){if(canvas.style)canvas.style.visibility=hidden?'hidden':initialVisibility.canvas;if(directHost.style)directHost.style.visibility=hidden?'hidden':initialVisibility.direct;}
 const phase=()=>viewportBlocked?'viewport-blocked':!api?'loading':clock.paused?'paused':lastFrame?.elapsedMs>=run?.route.totalMs?'settled':'moving';
 clock.setReason('ready',true);clock.setReason('hidden',document.hidden);clock.setReason('blur',!document.hasFocus());
 const state=()=>({enabled:!disposed,phase:lastPhase,viewportBlocked,rejectedViewport,viewportRefusals,viewportRecoveries,minimumStage:CLEAN_STAGE_MIN,intention:run?.kind??null,attention:lastFrame?.intention??null,inspectionCount,placementIndex,settled:!!lastFrame&&lastFrame.elapsedMs>=run?.route.totalMs,pauseReasons:clock.reasons,ready:!!api,domain:'pip-clean-garden-prototype-v1',actorUnitsPerSource:setup?.actor.unitsPerSource??null,scaleApproval:descriptor?.scaleApproval??null,savedVisitor:false});
 const notify=phase=>{if(disposed)return;if(phase)lastPhase=phase;onPrototypeState(state());};
 function publish(){if(snapshot&&!disposed)onView({...courtyardPresentation(snapshot,snapshot.yardRuntime?.serverNow||snapshot.serverTime||0,MIKA_CLIPS),mutable:false,mediaReady:Boolean(api)&&!viewportBlocked,visualPrototype:state()});}
 function reserve(pendingCanvasBytes=0,nextUiBytes=uiBytes){
  const row=rgbaAdmission({uiBytes:nextUiBytes,backgroundBytes,currentCanvasBytes:canvas.width*canvas.height*4,pendingCanvasBytes});
  if(!row.fits)throw Error('Optional Yard image/backing admission rejected');peakRgba=Math.max(peakRgba,row.totalBytes);return row;
 }
 uiImageOwner.setAdmissionCheck(next=>{try{reserve(0,Math.max(uiBytes,next.bytes));uiBytes=Math.max(uiBytes,next.bytes);return true;}catch{return false;}});
 const listen=(target,type,fn)=>{target.addEventListener(type,fn);listeners.push(()=>target.removeEventListener(type,fn));};
 function pause(reason,value){if(disposed)return;clock.setReason(reason,value);api?.setPaused(clock.paused);scheduler.setPaused(clock.paused);notify(phase());}
 function background(){if(viewportBlocked||!image||!projection)return;ctx.clearRect(0,0,projection.width,projection.height);ctx.fillStyle='#d8e3c1';ctx.fillRect(0,0,projection.width,projection.height);const a=projection.art;ctx.drawImage(image,a.x,a.y,a.width,a.height);}
 function resize(){
  if(disposed||!descriptor)return;const r=canvas.getBoundingClientRect();
  if(!supportsCleanViewport(r.width,r.height)){
   if(!viewportBlocked||rejectedViewport?.width!==r.width||rejectedViewport?.height!==r.height)viewportRefusals++;
   rejectedViewport={width:r.width,height:r.height};viewportBlocked=true;hideSurface(true);pause('viewport',true);scheduler.cancelPending();publish();return;
  }
  const wasBlocked=viewportBlocked;
  const dpr=Math.min(globalThis.devicePixelRatio||1,2),bw=Math.max(1,Math.round(r.width*dpr)),bh=Math.max(1,Math.round(r.height*dpr));
  const changed=canvas.width!==bw||canvas.height!==bh;reserve(changed?bw*bh*4:0);
  const nextProjection=createCleanProjection(descriptor,r.width,r.height);
  if(api&&(changed||projection?.width!==r.width||projection?.height!==r.height))hideSurface(true);
  if(changed){canvas.width=0;canvas.height=bh;canvas.width=bw;}
  // One shared transform. A recoverable size refusal never destroys this owner.
  ctx.setTransform(bw/r.width,0,0,bh/r.height,0,0);projection=nextProjection;viewportBlocked=false;
  api?.resize({widthCss:192,heightCss:192,dpr:1,sourcePixelsPerCss:projection.sourcePixelsPerCss});
  if(wasBlocked){viewportRecoveries++;frozenResizePending=Boolean(lastFrame);}
  background();resolveViewport?.();resolveViewport=null;
  clock.setReason('viewport',false);api?.setPaused(clock.paused);scheduler.setPaused(clock.paused);
  scheduler.invalidate('resize',{whilePaused:true});notify(phase());publish();
 }

 function presentation(){const r=canvas.getBoundingClientRect(),h=directHost.getBoundingClientRect(),t=ctx.getTransform();return{a:t.a,d:t.d,b:t.b,c:t.c,e:t.e,f:t.f,backingWidth:canvas.width,backingHeight:canvas.height,contentWidth:r.width,contentHeight:r.height,offsetLeft:r.left-h.left,offsetTop:r.top-h.top};}
 function draw({paused=false,reason='motion'}={}){
  if(disposed||viewportBlocked||!api||!run||!projection)return false;
  try{const elapsedMs=(paused||frozenResizePending)&&lastFrame?lastFrame.elapsedMs:Math.min(clock.read(),run.route.totalMs),sample=samplePlanterInspection(setup,run,elapsedMs);
   const composition=assertCleanComposition(projection,sample.world.root,setup.placements[placementIndex]);
   if(!api.renderDirect({sample,point:projection.project(sample.world.root),presentation:presentation(),forcePausedRedraw:paused||frozenResizePending||reason==='startup'}))return false;
   lastFrame={elapsedMs,root:sample.world.root,intention:sample.intention,composition};frozenResizePending=false;hideSurface(false);frameCount++;const moving=elapsedMs<run.route.totalMs;
   if(!moving&&lastPhase!==phase()){notify(phase());publish();}return moving&&!clock.paused;
  }catch(error){onFailure(error);return false;}
 }
 const scheduler=createFixtureScheduler({draw,requestFrame,cancelFrame});scheduler.setPaused(true);
 const observer=new ResizeObserver(()=>{try{resize();}catch(error){onFailure(error);}});observer.observe(canvas);
 listen(document,'visibilitychange',()=>pause('hidden',document.hidden));listen(window,'blur',()=>pause('blur',true));listen(window,'focus',()=>pause('blur',false));
 function cleanup(){hideSurface(false);api?.dispose();api=null;image?.close();image=null;backgroundBytes=0;release();}
 async function checked(path,kind='json',expectedHash=null){
  const paths={
   './data/fixture.json':new URL('./data/fixture.json',import.meta.url),
   './data/location.json':new URL('./data/location.json',import.meta.url),
   './data/calibration.json':new URL('./data/calibration.json',import.meta.url),
   './source/pip-rest-coat.glsl':new URL('./source/pip-rest-coat.glsl',import.meta.url),
   './assets/clean-garden.png':new URL('./assets/clean-garden.png',import.meta.url),
   './assets/pip.glb':new URL('./assets/pip.glb',import.meta.url),
   './assets/planter-t2.glb':new URL('./assets/planter-t2.glb',import.meta.url)};
  if(!paths[path])throw Error('Unknown prototype resource');
  const response=await fetchImpl(paths[path],{signal:abort.signal});if(!response.ok)throw Error('Prototype asset request '+response.status);
  if(expectedHash){const bytes=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==expectedHash||bytes.byteLength!==BACKGROUND_ENCODED_BYTES)throw Error('Clean background identity mismatch');return new Blob([bytes],{type:'image/png'});}
  return response[kind]();
 }
 const ready=(async()=>{
  [setup,descriptor]=await Promise.all([checked('./data/fixture.json'),checked('./data/location.json')]);if(disposed)return;assertWorldScale(setup,descriptor);
  resize();await viewportReady;if(disposed)return;
  backgroundBytes=descriptor.background.width*descriptor.background.height*4;reserve();
  const blob=await checked('./assets/clean-garden.png','blob',descriptor.background.sha256);if(disposed)return;
  const decoded=await decodeImage(blob);if(disposed){decoded.close();return;}
  image=decoded;if(image.width!==973||image.height!==1616)throw Error('Clean background dimensions changed');
  resize();run=makePlanterInspection(setup,placementIndex);
  const [calibration,fragmentHelper]=await Promise.all([checked('./data/calibration.json'),checked('./source/pip-rest-coat.glsl','text')]);if(disposed)return;
  const made=await rendererFactory({enabled:true,signal:abort.signal,actorUnitsPerSource:setup.actor.unitsPerSource,presentationMode:'direct',directHost,calibration,fragmentHelper,widthCss:192,heightCss:192,dpr:1,sourcePixelsPerCss:projection.sourcePixelsPerCss,
   planter:{descriptor:setup.planter,placement:setup.placements[0]},admitResources:row=>admitPipResources({...row,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES}),
   loadAssetBytes:()=>checked('./assets/pip.glb','arrayBuffer'),loadPlanterAssetBytes:()=>checked('./assets/planter-t2.glb','arrayBuffer'),
   onResources:row=>{if(disposed)return;lastResources={...row,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES,combinedKnownCPUBufferPeakBytes:COMBINED_KNOWN_CPU_PEAK};if(row.event==='context-lost')pause('context-lost',true);else if(row.event==='context-restored'){pause('context-lost',false);if(!viewportBlocked)scheduler.invalidate('context-restored',{whilePaused:true});}},
   setupLighting:({THREE,scene,renderer})=>{renderer.toneMapping=THREE.NoToneMapping;const target=new THREE.Vector3(run.approach.start.position.x/12,.5,-run.approach.start.position.y/12),lights=[];
    const ambient=new THREE.AmbientLight(new THREE.Color().setRGB(.78,.83,.93,THREE.LinearSRGBColorSpace),.55);scene.add(ambient);lights.push(ambient);
    for(const [position,intensity]of[[[-2.4,4,3],1.8],[[2.5,2.4,1.7],.76],[[0,2.8,-2],1.2]]){const l=new THREE.DirectionalLight(0xffffff,intensity);l.position.copy(target).add(new THREE.Vector3(...position));l.target.position.copy(target);scene.add(l,l.target);lights.push(l,l.target);}return()=>lights.forEach(l=>scene.remove(l));}});
  if(disposed){made.dispose();return;}api=made;api.setPaused(true);draw({reason:'startup',paused:true});
  if(disposed)return;clock.reset();clock.setReason('ready',false);api.setPaused(clock.paused);scheduler.setPaused(clock.paused);scheduler.invalidate('route');notify(phase());publish();
 })().catch(error=>{if(!disposed)onFailure(error);}).finally(()=>{if(disposed)cleanup();});
 return{ready,update(value){snapshot=value;publish();},setGhost(){},point:()=>null,hit:()=>null,offsetPoint:()=>null,
  inspectAgain(){
   if(disposed||viewportBlocked||!api||!lastFrame||lastFrame.elapsedMs<run.route.totalMs)throw Error('Wait until Pip finishes inspecting the leaf');
   const previous=samplePlanterInspection(setup,run,run.route.totalMs).world;
   run=repeatPlanterInspection(setup,run,{previous,attentionVariant:(inspectionCount+1)%2});inspectionCount++;
   clock.reset();lastFrame=null;notify(phase());publish();scheduler.invalidate('inspection',{whilePaused:true});
  },
  // Legacy diagnostic calls must never relocate or turn this supported actor.
  moveTo(){throw Error('The leaf inspection admits no arbitrary destinations');},
  movePlanter(){throw Error('The leaf inspection keeps its admitted planter anchor');},
  diagnostics(){return{...state(),frameCount,lastFrame,route:run?{kind:PLANTER_INSPECTION_VERSION,holdOnly:run.holdOnly,focus:run.focus,approach:run.approach.start,durationMs:run.route.totalMs,displayedElapsedMs:lastFrame?.elapsedMs??0,activeElapsedMs:Math.min(clock.read(),run.route.totalMs)}:null,projection:projection?{width:projection.width,height:projection.height,scale:projection.scale,sourcePixelsPerCss:projection.sourcePixelsPerCss,art:projection.art,fit:"uniform width-fit capped at reference density; shared vertical camera crop around finite route"}:null,uiImageOwner:uiImageOwner.snapshot(),resources:lastResources,knownCPUBufferPeak:COMBINED_KNOWN_CPU_PEAK,knownModelCPUBufferPeak:KNOWN_CPU_BUFFER_PEAK,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES,limits:LIMITS,rgba:reserve(),peakRgba,scheduler:scheduler.state,renderer:api?.diagnostics,unknowns:['engine modules retained for browser session','JS objects and decoder scratch','programs, driver, swap buffers, physical GPU release timing'],savedStateUsedForGeometry:false};},
  dispose(){if(retirement)return retirement;disposed=true;resolveViewport?.();resolveViewport=null;abort.abort();scheduler.dispose();clock.dispose();observer.disconnect();listeners.forEach(remove=>remove());api?.dispose();api=null;image?.close();image=null;uiImageOwner.setAdmissionCheck(()=>false);retirement=ready.finally(cleanup);return retirement;}
 };
}
