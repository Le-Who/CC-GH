import{canonicalFoodSceneState,canonicalFoodNavigationGeometry}from'./canonical-food-scene.mjs';
import canonicalGeometry from '../../../../game-logic/yard-v2/canonical-location-geometry.json' with {type:'json'};
import{createCanonicalInspectionController}from'./dynamic-prop-controller.mjs';
import{createCanonicalPlannerWorker}from'./dynamic-prop-worker-client.mjs';
import{CANONICAL_LOCATION,CANONICAL_ITEM,canonicalCapability,canonicalCommandScope,canonicalPlacements,canonicalItemState,checkCanonicalPlacement}from'../../../game-state/canonicalYardItems.mjs';
import{canonicalItemCatalog}from'./item-catalog.mjs';
import{assertWorldScale}from'./world-scale.mjs';
import{pipGroundingRecipe,createPipGardenLighting}from'./grounding-recipe.mjs';
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
export function createPipYardScene(canvas,{directHost,uiImageOwner,onView=()=>{},onPrototypeState=()=>{},onFailure=()=>{},onPointerInterrupt=()=>{},onRestartRequired=()=>{},now=()=>performance.now(),
 groundingRecipe='baseline',canonicalFoodPreview=false,ownerKey={},canonicalItems=false,canonicalActionPending=false,plannerWorkerFactory=createCanonicalPlannerWorker,rendererFactory=createOptionalPipRenderer,fetchImpl=fetch,decodeImage=createImageBitmap,requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}={}){
 const grounding=pipGroundingRecipe(groundingRecipe);
 if(!directHost?.appendChild||!uiImageOwner)throw Error('Stage and UI resource owners required');
 if(canonicalItems)uiImageOwner.registerCatalog(canonicalItemCatalog);
 const abort=new AbortController(),ctx=canvas.getContext('2d');
 let restartPending=false,foodReentryRequired=false,admittedFoodReservation=null,foodSelection=null,foodLoad=null,foodLoading=false,foodOwnerKey=ownerKey,lastRendererDiagnostics=null,rendererRetirement=Promise.resolve();
 let disposed=false,api=null,image=null,setup=null,descriptor=null,projection=null,run=null,snapshot=null,lastFrame=null,inspectionCount=0,placementIndex=0,ghost=null,itemPointerActive=false,selectedSlotId=null,interaction=null,plannerWorker=null,interactionError=null;
 // Full current UI lifetime, including 1,516,600 B catalogue and new R1 portrait.
 let uiBytes=Math.max(uiImageLifetimeLedger(canonicalItems?canonicalItemCatalog:null).bytes,19138304,uiImageOwner.snapshot().bytes),backgroundBytes=0,directSurfaceBytes=0,lastResources=null,peakRgba=0,frameCount=0,lastPhase='loading',retirement=null;
 const release=acquirePipLease(),clock=createFixtureClock({now}),listeners=[];
 let viewportBlocked=false,rejectedViewport=null,viewportRefusals=0,viewportRecoveries=0,frozenResizePending=false,resolveViewport;
 const viewportReady=new Promise(resolve=>{resolveViewport=resolve;});
 const initialVisibility={canvas:canvas.style?.visibility??'',direct:directHost.style?.visibility??''};
 function hideSurface(hidden){if(canvas.style)canvas.style.visibility=hidden?'hidden':initialVisibility.canvas;if(directHost.style)directHost.style.visibility=hidden?'hidden':initialVisibility.direct;}
 const phase=()=>foodReentryRequired?'reentry-required':restartPending?'loading':viewportBlocked?'viewport-blocked':!api?'loading':canonicalItems?(!canonicalItemState(snapshot).available?'unavailable':ghost||canonicalActionPending?'editing':interaction?.state.phase||'items'):clock.paused?'paused':lastFrame?.elapsedMs>=run?.route.totalMs?'settled':'moving';
 clock.setReason('ready',true);clock.setReason('hidden',document.hidden);clock.setReason('blur',!document.hasFocus());
 const foodState=()=>canonicalFoodSceneState(snapshot,{enabled:canonicalItems&&canonicalFoodPreview});
 const navigationGeometry=()=>canonicalFoodNavigationGeometry(canonicalGeometry,foodState());
 const state=()=>({canonicalFood:canonicalItems&&canonicalFoodPreview?{...foodState(),render:foodSelection,loading:foodLoading,reentryRequired:foodReentryRequired}:null,enabled:!disposed,restartPending,groundingRecipe:grounding.id,canonicalItems,itemEditing:!!ghost,itemActionPending:canonicalActionPending,plannerWorkerActive:!!plannerWorker,selectedCanonicalSlotId:selectedCommitted()?.slotId??null,interaction:interaction?.state??(interactionError?{phase:"unavailable",error:interactionError,savedVisitor:false}:null),phase:lastPhase,viewportBlocked,rejectedViewport,viewportRefusals,viewportRecoveries,minimumStage:CLEAN_STAGE_MIN,intention:canonicalItems?'canonical-item-inspection':run?.kind??null,attention:lastFrame?.intention??null,inspectionCount,placementIndex,settled:canonicalItems?interaction?.state.phase==='settled':!!lastFrame&&lastFrame.elapsedMs>=run?.route.totalMs,pauseReasons:clock.reasons,ready:!!api,domain:'pip-clean-garden-prototype-v1',actorUnitsPerSource:setup?.actor.unitsPerSource??null,scaleApproval:descriptor?.scaleApproval??null,savedVisitor:false});
 const notify=phase=>{if(disposed)return;if(phase)lastPhase=phase;onPrototypeState(state());};
 const reportFailure=(error,operation)=>{let renderer=null;try{renderer=api?.diagnostics??null;}catch(secondary){renderer={diagnosticsError:String(secondary?.message||secondary)};}
  onFailure(error,{operation,phase:phase(),canonicalItems,ghost:ghost?{slotId:ghost.slotId,x:ghost.x,y:ghost.y,placing:ghost.placing,valid:ghost.valid}:null,viewport:projection?{width:projection.width,height:projection.height,art:{...projection.art}}:null,backing:{width:canvas.width,height:canvas.height},lastVisibility:lastFrame?.visibility??null,renderer});};
 function publish(){if(snapshot&&!disposed)onView({...courtyardPresentation(snapshot,snapshot.yardRuntime?.serverNow||snapshot.serverTime||0,MIKA_CLIPS),mutable:false,
  ...(canonicalItems?{canonicalFood:canonicalFoodPreview?{...foodState(),render:foodSelection,loading:foodLoading,reentryRequired:foodReentryRequired}:null,props:canonicalPlacements(snapshot),renderCatalog:canonicalItemCatalog,canonicalItems:true,canonicalState:canonicalItemState(snapshot),itemMutable:!!canonicalCapability(snapshot)&&Boolean(api)&&!viewportBlocked&&!restartPending&&!foodReentryRequired}:{}),
  mediaReady:Boolean(api)&&!viewportBlocked&&!restartPending&&!foodReentryRequired,visualPrototype:state()});}
 function reserve(pendingCanvasBytes=0,nextUiBytes=uiBytes){
  const row=rgbaAdmission({uiBytes:nextUiBytes,backgroundBytes,currentCanvasBytes:canvas.width*canvas.height*4,pendingCanvasBytes,directSurfaceBytes});
  if(!row.fits)throw Error('Optional Yard image/backing admission rejected');peakRgba=Math.max(peakRgba,row.totalBytes);return row;
 }
 uiImageOwner.setAdmissionCheck(next=>{try{reserve(0,Math.max(uiBytes,next.bytes));uiBytes=Math.max(uiBytes,next.bytes);return true;}catch{return false;}});
 const listen=(target,type,fn)=>{target.addEventListener(type,fn);listeners.push(()=>target.removeEventListener(type,fn));};
 function pause(reason,value){if(disposed)return;clock.setReason(reason,value);api?.setPaused(clock.paused);scheduler.setPaused(clock.paused);notify(phase());}
 function background(){if(viewportBlocked||!image||!projection)return;ctx.clearRect(0,0,projection.width,projection.height);ctx.fillStyle='#d8e3c1';ctx.fillRect(0,0,projection.width,projection.height);const a=projection.art;ctx.drawImage(image,a.x,a.y,a.width,a.height);}
 function resize(){
  if(disposed||restartPending||foodReentryRequired||!descriptor)return;const r=canvas.getBoundingClientRect();
  if(canonicalItems&&itemPointerActive&&(projection?.width!==r.width||projection?.height!==r.height)){
   // End the pointer session before changing its coordinate transform.
   itemPointerActive=false;ghost=null;onPointerInterrupt();
  }
  if(!supportsCleanViewport(r.width,r.height)){
   if(!viewportBlocked||rejectedViewport?.width!==r.width||rejectedViewport?.height!==r.height)viewportRefusals++;
   rejectedViewport={width:r.width,height:r.height};viewportBlocked=true;hideSurface(true);pause('viewport',true);scheduler.cancelPending();publish();return;
  }
  const wasBlocked=viewportBlocked;
  // ResizeObserver runs before paint. Keep both layers private until this
  // admitted projection has a fresh background and direct render together.
  hideSurface(true);
  const dpr=Math.min(globalThis.devicePixelRatio||1,2),bw=Math.max(1,Math.round(r.width*dpr)),bh=Math.max(1,Math.round(r.height*dpr));
  const changed=canvas.width!==bw||canvas.height!==bh;reserve(changed?bw*bh*4:0);
  const nextProjection=createCleanProjection(descriptor,r.width,r.height,{focus:canonicalItems?(displayedItem()||{x:setup.placements[0][0],y:setup.placements[0][1]}):null});
  if(changed){canvas.width=0;canvas.height=bh;canvas.width=bw;}
  // One shared transform. A recoverable size refusal never destroys this owner.
  ctx.setTransform(bw/r.width,0,0,bh/r.height,0,0);projection=nextProjection;viewportBlocked=false;
  api?.resize({viewport:projection.renderViewport});
  if(wasBlocked){viewportRecoveries++;frozenResizePending=Boolean(lastFrame);}
  background();resolveViewport?.();resolveViewport=null;
  clock.setReason('viewport',false);api?.setPaused(clock.paused);scheduler.setPaused(clock.paused);
  // Do not expose a cleared canvas for one paint while waiting for the RAF.
  // draw owns success-only exposure; its return value is motion continuation.
  if(image&&api&&run&&!document.hidden&&(!canonicalItems||canonicalItemState(snapshot).available))draw({reason:'resize',paused:clock.paused});
  scheduler.invalidate('resize',{whilePaused:true});notify(phase());publish();
 }

 function presentation(){const r=canvas.getBoundingClientRect(),h=directHost.getBoundingClientRect(),t=ctx.getTransform();return{a:t.a,d:t.d,b:t.b,c:t.c,e:t.e,f:t.f,backingWidth:canvas.width,backingHeight:canvas.height,contentWidth:r.width,contentHeight:r.height,offsetLeft:r.left-h.left,offsetTop:r.top-h.top};}
 function draw({paused=false,reason='motion'}={}){
  if(disposed||restartPending||foodReentryRequired||viewportBlocked||!api||!run||!projection)return false;
  if(canonicalItems)return drawItems({paused,reason});
  try{const elapsedMs=(paused||frozenResizePending)&&lastFrame?lastFrame.elapsedMs:Math.min(clock.read(),run.route.totalMs),sample=samplePlanterInspection(setup,run,elapsedMs);
   const composition=assertCleanComposition(projection,sample.world.root,setup.placements[placementIndex]);
   if(!api.renderDirect({sample,point:projection.project(sample.world.root),presentation:presentation(),forcePausedRedraw:paused||frozenResizePending||reason==='startup'}))return false;
   lastFrame={elapsedMs,root:sample.world.root,intention:sample.intention,composition};frozenResizePending=false;hideSurface(document.hidden);frameCount++;const moving=elapsedMs<run.route.totalMs;
   if(!moving&&lastPhase!==phase()){notify(phase());publish();}return moving&&!clock.paused;
  }catch(error){reportFailure(error,'finite-render');return false;}
 }
 // The item editor never samples a new route or changes the finite Pip's root.
 // An uncommitted ghost is separate from the authoritative record and is never saved locally.
 function selectedCommitted(){const rows=canonicalPlacements(snapshot);return rows.find(row=>row.slotId===selectedSlotId)||rows[0]||null;}
 function displayedItem(){return ghost||selectedCommitted();}
 function retireInteraction(){interaction?.dispose();plannerWorker?.dispose();interaction=null;plannerWorker=null;interactionError=null;}
 function syncInteractionClock(){
  if(!canonicalItems)return;
  const flags={'item-editor':!!ghost||canonicalActionPending,'canonical-unavailable':!canonicalItemState(snapshot).available,
   'canonical-idle':!interaction?.state.active,'planning':interaction?.state.phase==='planning','canonical-stalled':interaction?.state.phase==='blocked-occupancy'};
  for(const [reason,value]of Object.entries(flags))clock.setReason(reason,value);
  api?.setPaused(clock.paused);scheduler.setPaused(clock.paused);
 }
 function interactionChanged(){if(disposed)return;syncInteractionClock();scheduler.invalidate('inspection-ready',{whilePaused:true});notify(phase());publish();}
 function syncFood(){
  if(!canonicalItems||!canonicalFoodPreview||!api?.setCanonicalFoodSnapshot)return;
  const pending=api.setCanonicalFoodSnapshot(snapshot,{ownerKey:foodOwnerKey});foodLoad=pending;foodLoading=true;
  return Promise.resolve(pending).then(selection=>{if(disposed||foodReentryRequired||foodLoad!==pending)return;foodLoading=false;foodSelection=selection;scheduler.invalidate('food-state',{whilePaused:true});notify(phase());publish();},error=>{if(!disposed&&foodLoad===pending)reportFailure(error,'canonical-food');});
 }
 function syncCanonicalInteraction(){
  if(!canonicalItems||!setup||!api||foodReentryRequired||restartPending)return;
  if(canonicalItemState(snapshot).available){
   if(!interaction&&!interactionError)try{
    plannerWorker=plannerWorkerFactory();
    interaction=createCanonicalInspectionController({geometry:navigationGeometry(),actor:setup.actor,rows:canonicalPlacements(snapshot),planner:plannerWorker.plan,onChange:interactionChanged});
   }catch(error){plannerWorker?.dispose();plannerWorker=null;interactionError=String(error.message);}
   interaction?.updateLayout(canonicalPlacements(snapshot),clock.read(),{geometry:navigationGeometry()});if(interaction)admittedFoodReservation=foodState().reserved;
  }
  syncInteractionClock();
 }
 function drawItems(){
  let operation='canonical-sample';
  try{
   const rows=canonicalPlacements(snapshot),item=displayedItem(),available=canonicalItemState(snapshot).available;
   const dynamicSample=available?interaction?.tick(clock.read()):interaction?.sample;
   const sample=dynamicSample||samplePlanterInspection(setup,run,0),actorVisible=available&&!!dynamicSample&&!ghost&&!canonicalActionPending;
   const visible=rows.length>0||!!ghost,visibility=actorVisible?(visible?'both':'pet'):(visible?'planter':'empty');
   const anchor=actorVisible?sample.world.root:item?{x:item.x,y:item.y}:sample.world.root;
   operation='canonical-placements';api.setCanonicalPlacements(rows,{ghost,selectedSlotId:selectedCommitted()?.slotId??null});
   operation='canonical-render';
   if(!api.renderDirect({sample,point:projection.project(anchor),presentation:presentation(),forcePausedRedraw:true,visibility}))return false;
   lastFrame={elapsedMs:clock.read(),root:sample.world.root,intention:dynamicSample?.intention||'item-placement',item:item?{...item}:null,records:rows.map(row=>({...row})),ghost:ghost?{...ghost}:null,committed:rows.length>0&&!ghost,canonicalState:canonicalItemState(snapshot).status,visibility};
   operation='canonical-publish';frozenResizePending=false;hideSurface(document.hidden);frameCount++;syncInteractionClock();const nextPhase=phase();if(nextPhase!==lastPhase){notify(nextPhase);publish();}return !!interaction?.state.active&&!clock.paused;
  }catch(error){reportFailure(error,operation);return false;}
 }
 function point(event){if(!canonicalItems||!projection||viewportBlocked)return null;const r=canvas.getBoundingClientRect();return projection.unprojectGround({x:event.clientX-r.left,y:event.clientY-r.top});}
 const scheduler=createFixtureScheduler({draw,requestFrame,cancelFrame});scheduler.setPaused(true);
 const observer=new ResizeObserver(()=>{try{resize();}catch(error){reportFailure(error,'resize');}});observer.observe(canvas);
 listen(document,'visibilitychange',()=>{pause('hidden',document.hidden);if(!document.hidden&&!viewportBlocked)scheduler.invalidate('visible',{whilePaused:true});});listen(window,'blur',()=>pause('blur',true));listen(window,'focus',()=>pause('blur',false));
 async function cleanup(){retireInteraction();hideSurface(false);if(api){const old=api;api=null;rendererRetirement=Promise.all([rendererRetirement,old.dispose()]).then(()=>{lastRendererDiagnostics=old.diagnostics??null;});}await rendererRetirement;image?.close();image=null;backgroundBytes=0;directSurfaceBytes=0;release();}
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
  const made=await rendererFactory({enabled:true,canonicalFoodEnabled:canonicalItems&&canonicalFoodPreview,getBaseResourceUsage:()=>{const row=api?.resources||lastResources;if(!row?.geometryGPUBufferBytes)throw Error('Renderer allocation is not ready');return{rgba:Math.max(reserve().totalBytes,peakRgba),knownCPU:COMBINED_KNOWN_CPU_PEAK+row.boneDataTextureCPUBytesEstimate,estimatedGPU:row.geometryGPUBufferBytes+row.boneDataTextureGPUBytesEstimate+row.resizeDrawingBufferPeakEstimatedBytes+row.compositorResizePeakBytesEstimate};},groundingRecipe:grounding.id,signal:abort.signal,actorUnitsPerSource:setup.actor.unitsPerSource,presentationMode:'direct',directHost,calibration,fragmentHelper,viewport:projection.renderViewport,
   planter:{descriptor:setup.planter,placement:setup.placements[0]},admitResources:row=>{if(!admitPipResources({...row,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES}))return false;
    if(row.stage==='before-drawing-buffer-allocation'){const previous=directSurfaceBytes;directSurfaceBytes=row.ownedRGBASurfacePeakBytes;try{reserve();}catch{directSurfaceBytes=previous;return false;}}return true;},
   loadCanonicalFoodAssetBytes:async(url,signal)=>{const response=await fetchImpl(url,{signal});if(!response.ok)throw Error('Canonical food asset request '+response.status);return response.arrayBuffer();},
   loadAssetBytes:()=>checked('./assets/pip.glb','arrayBuffer'),loadPlanterAssetBytes:()=>checked('./assets/planter-t2.glb','arrayBuffer'),
   onResources:row=>{if(disposed)return;if(row.stage==='before-drawing-buffer-allocation')lastResources={...row,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES,combinedKnownCPUBufferPeakBytes:COMBINED_KNOWN_CPU_PEAK};if(row.event==='canonical-food-context-restart-required'){restartPending=true;pause('context-lost',true);hideSurface(true);onRestartRequired();return;}if(row.event==='canonical-food-changed'){foodLoading=row.selection?.reason==='CANONICAL_FOOD_LOADING';foodSelection=row.selection;scheduler.invalidate('food-state',{whilePaused:true});notify(phase());publish();}if(row.event==='context-lost')pause('context-lost',true);else if(row.event==='context-restored'){pause('context-lost',false);if(!viewportBlocked)scheduler.invalidate('context-restored',{whilePaused:true});}},
   setupLighting:({THREE,scene,renderer})=>{
    const target=new THREE.Vector3(run.approach.start.position.x/12,.5,-run.approach.start.position.y/12);
    const lighting=createPipGardenLighting({THREE,scene,renderer,target,recipe:grounding.id});return()=>lighting.dispose();}});
  if(disposed){await made.dispose();return;}api=made;api.setPaused(true);
  // A canonical controller owns one monotonic active-time epoch. Establish it
  // before updateLayout/tick, never after the controller's first displayed pose.
  if(canonicalItems)clock.reset();syncCanonicalInteraction();await syncFood();if(disposed)return;draw({reason:'startup',paused:true});
  if(disposed)return;if(!canonicalItems)clock.reset();clock.setReason('ready',false);syncInteractionClock();api.setPaused(clock.paused);scheduler.setPaused(clock.paused);scheduler.invalidate('route');notify(phase());publish();
 })().catch(error=>{if(!disposed)reportFailure(error,'startup');}).finally(()=>{if(disposed)return cleanup();});
 return{ready,get foodReady(){return foodLoad??Promise.resolve(null);},update(value){const old=selectedCommitted();if(snapshot?.player?.id&&snapshot.player.id!==value?.player?.id){retireInteraction();ghost=null;selectedSlotId=null;foodOwnerKey={};}snapshot=value;if(api&&canonicalItems&&canonicalFoodPreview&&admittedFoodReservation===false&&foodState().reserved){foodReentryRequired=true;api.setCanonicalFoodSnapshot?.(null,{ownerKey:foodOwnerKey});foodSelection={available:false,state:null,reason:'CANONICAL_FOOD_REENTRY_REQUIRED'};foodLoading=false;pause('food-version-change',true);scheduler.cancelPending();publish();return;}if(restartPending||foodReentryRequired)return;syncCanonicalInteraction();syncFood();const next=selectedCommitted();if(canonicalItems&&!itemPointerActive&&descriptor&&(old?.slotId!==next?.slotId||old?.x!==next?.x||old?.y!==next?.y))resize();publish();if(canonicalItems)scheduler.invalidate('snapshot',{whilePaused:true});},
  setCanonicalActionPending(value){canonicalActionPending=!!value;syncInteractionClock();scheduler.invalidate("item-intent",{whilePaused:true});},
  inspectCanonicalSlot(slotId){if(!canonicalItems||foodReentryRequired||restartPending||ghost||canonicalActionPending||!canonicalCapability(snapshot)||!interaction||!canonicalPlacements(snapshot).some(row=>row.slotId===slotId))return false;selectedSlotId=slotId;const accepted=interaction.request(slotId,clock.read());syncInteractionClock();scheduler.invalidate("inspect-selected",{whilePaused:true});notify(phase());publish();return accepted;},
  beginPointer(){if(canonicalItems)itemPointerActive=true;},endPointer(){
   // Layout may change before ResizeObserver is delivered. Reconcile while
   // the pointer still owns its old transform, so pointer-up cannot hide an
   // orientation interruption from the observer that follows it.
   if(canonicalItems&&itemPointerActive&&!disposed)try{const r=canvas.getBoundingClientRect();if(projection?.width!==r.width||projection?.height!==r.height)resize();}catch(error){reportFailure(error,'pointer-end-resize');}
   itemPointerActive=false;
  },
  selectCanonicalSlot(slotId){if(!canonicalItems||ghost||itemPointerActive||!canonicalPlacements(snapshot).some(row=>row.slotId===slotId))return false;selectedSlotId=slotId;if(descriptor)resize();publish();return true;},
  setGhost(value){if(!canonicalItems)return;if(value)selectedSlotId=value.slotId;ghost=value;syncInteractionClock(); scheduler.invalidate('ghost',{whilePaused:true});},point,
  hit(event){if(!canonicalItems||!canonicalCapability(snapshot)||viewportBlocked||!projection)return null;const r=canvas.getBoundingClientRect();return canonicalPlacements(snapshot).map(item=>{const p=projection.project({x:item.x,y:item.y,z:5.5});return{item,distance:Math.hypot(event.clientX-r.left-p.x,event.clientY-r.top-p.y)};}).filter(row=>row.distance<=Math.max(22,22*projection.scale)).sort((a,b)=>a.distance-b.distance)[0]?.item??null;},
  offsetPoint(p,d){if(!canonicalItems||!projection||viewportBlocked)return null;const q=projection.project(p);return projection.unprojectGround({x:q.x+d.x,y:q.y+d.y});},
  checkPlacement(value){if(!canonicalItems)return null;const result=checkCanonicalPlacement(snapshot,value);if(result.ok&&interaction&&!interaction.placementIsSafe({...value,itemGeometryRevision:CANONICAL_ITEM.itemGeometryRevision}))return{ok:false,errors:[{code:'CANONICAL_ACTOR_OCCUPIED'}]};return result;},
  defaultItemAnchor(){if(!canonicalItems||!setup)return null;const p=setup.placements.find(p=>checkCanonicalPlacement(snapshot,{...canonicalCommandScope(snapshot),slotId:'canonical:preview-anchor',goodieId:'leaf_pot',placing:true,x:p[0],y:p[1]}).ok)||setup.placements[0];return{x:p[0],y:p[1]};},
  inspectAgain(){
   if(canonicalItems||disposed||viewportBlocked||!api||!lastFrame||lastFrame.elapsedMs<run.route.totalMs)throw Error('Wait until Pip finishes inspecting the leaf');
   const previous=samplePlanterInspection(setup,run,run.route.totalMs).world;
   run=repeatPlanterInspection(setup,run,{previous,attentionVariant:(inspectionCount+1)%2});inspectionCount++;
   clock.reset();lastFrame=null;notify(phase());publish();scheduler.invalidate('inspection',{whilePaused:true});
  },
  // Legacy diagnostic calls must never relocate or turn this supported actor.
  moveTo(){throw Error('The leaf inspection admits no arbitrary destinations');},
  movePlanter(){throw Error('The leaf inspection keeps its admitted planter anchor');},
  diagnostics(){return{...state(),frameCount,lastFrame,route:canonicalItems?(interaction?{kind:'canonical-item-inspection',...interaction.state}:null):run?{kind:PLANTER_INSPECTION_VERSION,holdOnly:run.holdOnly,focus:run.focus,approach:run.approach.start,durationMs:run.route.totalMs,displayedElapsedMs:lastFrame?.elapsedMs??0,activeElapsedMs:Math.min(clock.read(),run.route.totalMs)}:null,projection:projection?{width:projection.width,height:projection.height,scale:projection.scale,sourcePixelsPerCss:projection.sourcePixelsPerCss,art:projection.art,fit:canonicalItems?"uniform width-fit; vertical crop follows committed item without changing canonical coordinates":"uniform width-fit capped at reference density; shared vertical camera crop around finite route"}:null,uiImageOwner:uiImageOwner.snapshot(),resources:lastResources,foodResources:(api?.diagnostics??lastRendererDiagnostics)?.canonicalFood?.ledger??null,knownCPUBufferPeak:COMBINED_KNOWN_CPU_PEAK,knownModelCPUBufferPeak:KNOWN_CPU_BUFFER_PEAK,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES,limits:LIMITS,rgba:reserve(),peakRgba,scheduler:scheduler.state,renderer:api?.diagnostics??lastRendererDiagnostics,unknowns:['engine modules retained for browser session','JS objects and decoder scratch','programs, driver, swap buffers, physical GPU release timing'],savedStateUsedForGeometry:canonicalItems,canonicalRecords:canonicalItems?canonicalPlacements(snapshot):undefined,dynamicSample:interaction?.sample?structuredClone(interaction.sample):null};},
  dispose(){if(retirement)return retirement;disposed=true;retireInteraction();resolveViewport?.();resolveViewport=null;abort.abort();scheduler.dispose();clock.dispose();observer.disconnect();listeners.forEach(remove=>remove());if(api){const old=api;api=null;rendererRetirement=Promise.resolve(old.dispose()).then(()=>{lastRendererDiagnostics=old.diagnostics??null;});}image?.close();image=null;uiImageOwner.setAdmissionCheck(()=>false);retirement=ready.finally(cleanup);return retirement;}
 };
}
