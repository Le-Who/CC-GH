import{createOptionalPipRenderer}from'./prototype/optional-pip-renderer.mjs';
import{createFixtureClock}from'./fixture-clock.mjs';
import{createFixtureScheduler}from'./fixture-scheduler.mjs';
import{createCleanProjection,assertCleanComposition}from'./projection.mjs';
import{makeRoute,sampleRoute,assertPlacement}from'./routes.mjs';
import{acquirePipLease,admitPipResources,rgbaAdmission,KNOWN_CPU_BUFFER_PEAK,BACKGROUND_ENCODED_BYTES,ENCODED_BACKGROUND_CPU_BYTES,COMBINED_KNOWN_CPU_PEAK,LIMITS}from'./resources.mjs';
import{uiImageLifetimeLedger}from'../ui-image-reserve.mjs';
import{courtyardPresentation}from'../presentation.mjs';
import{MIKA_CLIPS}from'../../../../game-logic/yard-v2/media/mika-clips.mjs';

/** Real Yard scene interface, separate inactive location, no gameplay writes. */
export function createPipYardScene(canvas,{directHost,uiImageOwner,onView=()=>{},onPrototypeState=()=>{},onFailure=()=>{},now=()=>performance.now(),
 rendererFactory=createOptionalPipRenderer,fetchImpl=fetch,decodeImage=createImageBitmap,requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}={}){
 if(!directHost?.appendChild||!uiImageOwner)throw Error('Stage and UI resource owners required');
 const abort=new AbortController(),ctx=canvas.getContext('2d');
 let disposed=false,api=null,image=null,setup=null,descriptor=null,projection=null,run=null,snapshot=null,lastFrame=null,goalIndex=0,placementIndex=0;
 // Full current UI lifetime, including 1,516,600 B catalogue and new R1 portrait.
 let uiBytes=Math.max(uiImageLifetimeLedger().bytes,19138304,uiImageOwner.snapshot().bytes),backgroundBytes=0,lastResources=null,peakRgba=0,frameCount=0,lastPhase='loading',retirement=null;
 const release=acquirePipLease(),clock=createFixtureClock({now}),listeners=[];
 clock.setReason('ready',true);clock.setReason('hidden',document.hidden);clock.setReason('blur',!document.hasFocus());
 const state=()=>({enabled:!disposed,phase:lastPhase,goalIndex,placementIndex,settled:!!lastFrame&&lastFrame.elapsedMs>=run?.route.totalMs,pauseReasons:clock.reasons,ready:!!api,domain:'pip-clean-garden-prototype-v1',savedVisitor:false});
 const notify=phase=>{if(disposed)return;if(phase)lastPhase=phase;onPrototypeState(state());};
 function publish(){if(snapshot&&!disposed)onView({...courtyardPresentation(snapshot,snapshot.yardRuntime?.serverNow||snapshot.serverTime||0,MIKA_CLIPS),mutable:false,mediaReady:Boolean(api),visualPrototype:state()});}
 function reserve(pendingCanvasBytes=0,nextUiBytes=uiBytes){
  const row=rgbaAdmission({uiBytes:nextUiBytes,backgroundBytes,currentCanvasBytes:canvas.width*canvas.height*4,pendingCanvasBytes});
  if(!row.fits)throw Error('Optional Yard image/backing admission rejected');peakRgba=Math.max(peakRgba,row.totalBytes);return row;
 }
 uiImageOwner.setAdmissionCheck(next=>{try{reserve(0,Math.max(uiBytes,next.bytes));uiBytes=Math.max(uiBytes,next.bytes);return true;}catch{return false;}});
 const listen=(target,type,fn)=>{target.addEventListener(type,fn);listeners.push(()=>target.removeEventListener(type,fn));};
 function pause(reason,value){if(disposed)return;clock.setReason(reason,value);api?.setPaused(clock.paused);scheduler.setPaused(clock.paused);notify(clock.paused?'paused':lastFrame?.elapsedMs>=run?.route.totalMs?'settled':'moving');}
 function background(){if(!image||!projection)return;ctx.clearRect(0,0,projection.width,projection.height);ctx.fillStyle='#d8e3c1';ctx.fillRect(0,0,projection.width,projection.height);const a=projection.art;ctx.drawImage(image,a.x,a.y,a.width,a.height);}
 function resize(){
  if(disposed||!descriptor)return;const r=canvas.getBoundingClientRect();if(r.width<=0||r.height<=0)return;
  const dpr=Math.min(globalThis.devicePixelRatio||1,2),bw=Math.max(1,Math.round(r.width*dpr)),bh=Math.max(1,Math.round(r.height*dpr));
  const changed=canvas.width!==bw||canvas.height!==bh;reserve(changed?bw*bh*4:0);
  if(changed){canvas.width=0;canvas.height=bh;canvas.width=bw;}
  // Use the actual rounded backing scale so the DOM direct surface and plate agree.
  ctx.setTransform(bw/r.width,0,0,bh/r.height,0,0);projection=createCleanProjection(descriptor,r.width,r.height);
  api?.resize({widthCss:192,heightCss:192,dpr:1,sourcePixelsPerCss:projection.sourcePixelsPerCss});background();scheduler.invalidate('resize',{whilePaused:true});
 }
 function presentation(){const r=canvas.getBoundingClientRect(),h=directHost.getBoundingClientRect(),t=ctx.getTransform();return{a:t.a,d:t.d,b:t.b,c:t.c,e:t.e,f:t.f,backingWidth:canvas.width,backingHeight:canvas.height,contentWidth:r.width,contentHeight:r.height,offsetLeft:r.left-h.left,offsetTop:r.top-h.top};}
 function draw({paused=false,reason='motion'}={}){
  if(disposed||!api||!run||!projection)return false;
  try{const elapsedMs=paused&&lastFrame?lastFrame.elapsedMs:Math.min(clock.read(),run.route.totalMs),sample=sampleRoute(setup,run,elapsedMs);
   const composition=assertCleanComposition(projection,sample.world.root,setup.placements[placementIndex]);
   if(!api.renderDirect({sample,point:projection.project(sample.world.root),presentation:presentation(),forcePausedRedraw:paused||reason==='startup'}))return false;
   lastFrame={elapsedMs,root:sample.world.root,composition};frameCount++;const moving=elapsedMs<run.route.totalMs;
   if(!moving&&lastPhase!=='settled'){notify('settled');publish();}return moving&&!clock.paused;
  }catch(error){onFailure(error);return false;}
 }
 const scheduler=createFixtureScheduler({draw,requestFrame,cancelFrame});scheduler.setPaused(true);
 const observer=new ResizeObserver(()=>{try{resize();}catch(error){onFailure(error);}});observer.observe(canvas);
 listen(document,'visibilitychange',()=>pause('hidden',document.hidden));listen(window,'blur',()=>pause('blur',true));listen(window,'focus',()=>pause('blur',false));
 function cleanup(){api?.dispose();api=null;image?.close();image=null;backgroundBytes=0;release();}
 async function checked(path,kind='json',expectedHash=null){
  const paths={
   './data/fixture.json':new URL('./data/fixture.json',import.meta.url),
   './data/location.json':new URL('./data/location.json',import.meta.url),
   './data/calibration.json':new URL('./data/calibration.json',import.meta.url),
   './source/pip-rest-coat.glsl':new URL('./source/pip-rest-coat.glsl',import.meta.url),
   './assets/clean-garden.png':new URL('./assets/clean-garden.png',import.meta.url),
   './assets/pip.glb':new URL('./assets/pip.glb',import.meta.url)};
  if(!paths[path])throw Error('Unknown prototype resource');
  const response=await fetchImpl(paths[path],{signal:abort.signal});if(!response.ok)throw Error('Prototype asset request '+response.status);
  if(expectedHash){const bytes=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==expectedHash||bytes.byteLength!==BACKGROUND_ENCODED_BYTES)throw Error('Clean background identity mismatch');return new Blob([bytes],{type:'image/png'});}
  return response[kind]();
 }
 const ready=(async()=>{
  [setup,descriptor]=await Promise.all([checked('./data/fixture.json'),checked('./data/location.json')]);if(disposed)return;
  const initialRect=canvas.getBoundingClientRect();projection=createCleanProjection(descriptor,initialRect.width,initialRect.height);
  backgroundBytes=descriptor.background.width*descriptor.background.height*4;reserve();
  const blob=await checked('./assets/clean-garden.png','blob',descriptor.background.sha256);if(disposed)return;
  const decoded=await decodeImage(blob);if(disposed){decoded.close();return;}
  image=decoded;if(image.width!==973||image.height!==1616)throw Error('Clean background dimensions changed');
  resize();run=makeRoute(setup,0,0);
  const [calibration,fragmentHelper]=await Promise.all([checked('./data/calibration.json'),checked('./source/pip-rest-coat.glsl','text')]);if(disposed)return;
  const made=await rendererFactory({enabled:true,presentationMode:'direct',directHost,calibration,fragmentHelper,widthCss:192,heightCss:192,dpr:1,sourcePixelsPerCss:projection.sourcePixelsPerCss,
   planter:{descriptor:setup.planter,placement:setup.placements[0]},admitResources:row=>admitPipResources({...row,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES}),
   loadAssetBytes:()=>checked('./assets/pip.glb','arrayBuffer'),
   onResources:row=>{if(disposed)return;lastResources={...row,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES,combinedKnownCPUBufferPeakBytes:COMBINED_KNOWN_CPU_PEAK};if(row.event==='context-lost')pause('context-lost',true);else if(row.event==='context-restored'){pause('context-lost',false);scheduler.invalidate('context-restored',{whilePaused:true});}},
   setupLighting:({THREE,scene,renderer})=>{renderer.toneMapping=THREE.NoToneMapping;const target=new THREE.Vector3(setup.start.position.x/12,.5,-setup.start.position.y/12),lights=[];
    const ambient=new THREE.AmbientLight(new THREE.Color().setRGB(.78,.83,.93,THREE.LinearSRGBColorSpace),.55);scene.add(ambient);lights.push(ambient);
    for(const [position,intensity]of[[[-2.4,4,3],1.8],[[2.5,2.4,1.7],.76],[[0,2.8,-2],1.2]]){const l=new THREE.DirectionalLight(0xffffff,intensity);l.position.copy(target).add(new THREE.Vector3(...position));l.target.position.copy(target);scene.add(l,l.target);lights.push(l,l.target);}return()=>lights.forEach(l=>scene.remove(l));}});
  if(disposed){made.dispose();return;}api=made;api.setPaused(true);draw({reason:'startup',paused:true});
  if(disposed)return;clock.reset();clock.setReason('ready',false);api.setPaused(clock.paused);scheduler.setPaused(clock.paused);scheduler.invalidate('route');notify(clock.paused?'paused':'moving');publish();
 })().catch(error=>{if(!disposed)onFailure(error);}).finally(()=>{if(disposed)cleanup();});
 return{ready,update(value){snapshot=value;publish();},setGhost(){},point:()=>null,hit:()=>null,offsetPoint:()=>null,
  moveTo(index){if(disposed||!api||!lastFrame||lastFrame.elapsedMs<run.route.totalMs||index<=goalIndex)throw Error('Choose a later destination after Pip settles');const previous=sampleRoute(setup,run,run.route.totalMs).world;run=makeRoute(setup,index,placementIndex,previous);goalIndex=index;clock.reset();lastFrame=null;notify(clock.paused?'paused':'moving');publish();scheduler.invalidate('route',{whilePaused:true});},
  movePlanter(index){if(disposed||!api||!lastFrame||lastFrame.elapsedMs<run.route.totalMs)throw Error('Move the planter after Pip settles');const sample=sampleRoute(setup,run,run.route.totalMs);assertPlacement(setup,index,sample.world);assertCleanComposition(projection,sample.world.root,setup.placements[index]);api.setPlanterPlacement(setup.placements[index]);placementIndex=index;notify();scheduler.invalidate('placement',{whilePaused:true});},
  diagnostics(){return{...state(),frameCount,lastFrame,route:run?{goalIndex,durationMs:run.route.totalMs,displayedElapsedMs:lastFrame?.elapsedMs??0,activeElapsedMs:Math.min(clock.read(),run.route.totalMs)}:null,projection:projection?{width:projection.width,height:projection.height,scale:projection.scale,sourcePixelsPerCss:projection.sourcePixelsPerCss,art:projection.art,fit:"uniform width-fit capped at reference density; shared vertical camera crop around finite route"}:null,uiImageOwner:uiImageOwner.snapshot(),resources:lastResources,knownCPUBufferPeak:COMBINED_KNOWN_CPU_PEAK,knownModelCPUBufferPeak:KNOWN_CPU_BUFFER_PEAK,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES,limits:LIMITS,rgba:reserve(),peakRgba,scheduler:scheduler.state,renderer:api?.diagnostics,unknowns:['engine modules retained for browser session','JS objects and decoder scratch','programs, driver, swap buffers, physical GPU release timing'],savedStateUsedForGeometry:false};},
  dispose(){if(retirement)return retirement;disposed=true;abort.abort();scheduler.dispose();clock.dispose();observer.disconnect();listeners.forEach(remove=>remove());api?.dispose();api=null;image?.close();image=null;uiImageOwner.setAdmissionCheck(()=>false);retirement=ready.finally(cleanup);return retirement;}
 };
}
