// Derived from released 6b80c9a2; compatibility changes are recorded in M2-COMPATIBILITY.md.
import{createUiImageReserve,uiImageLifetimeLedger}from'./ui-image-reserve.mjs';
import{offsetWorldPoint}from'./scene-layout.mjs';
import{LEGACY_M2_BACKGROUND,drawLegacyBackground}from'./legacy-m2-background.mjs';
import { AtlasCache, atlasPageFor } from './atlas.mjs';
import { CANONICAL_ATLAS_POLICY,CURRENT_FOUR_ATLAS_POLICY,FAMILY_ATLAS_POLICY } from './atlas-policy.mjs';
import { createProjection, footprintPolygon, CAMERA_DIRECTION } from './projection.mjs';
import { selectPetPose } from './pose-selection.mjs';
import { FrameTelemetry } from './telemetry.mjs';
import { PresentationClock } from './presentation-clock.mjs';
import { edgeOpacity } from './edge-opacity.mjs';
import { courtyardPresentation } from './presentation.mjs';
import { footprint } from '../../../game-logic/yard-v2/geometry.mjs';
import { MIKA_SCENE } from '../../../game-logic/yard-v2/mika-media.mjs';
import { MIKA_CLIPS as clips } from '../../../game-logic/yard-v2/media/mika-clips.mjs';
import { MIKA_RUNTIME_MEDIA_REVISION } from '../../../game-logic/yard-v2/media/runtime-version.mjs';
import { FOOD_BINDINGS,foodBowlPresentation } from '../../../game-logic/yard-v2/food-media.mjs';
import { MIKA_ACTOR_REFERENCE,resolveActorProfile } from '../../../game-logic/yard-v2/actor-profiles.mjs';
import { YARD_ACTOR_PROFILES } from '../../../game-logic/yard-v2/released-actor-profiles.mjs';
import { MOCHI_ACTOR_REFERENCE,MOCHI_RUNTIME_MEDIA_REVISION } from '../../../game-logic/yard-v2/mochi-actor-profile.mjs';
import { createActorMediaEntry,actorEntryForPet } from './actor-media.mjs';
import {PEBBLE_ACTOR_REFERENCE,PEBBLE_MEDIA_REVISION} from '../../../game-logic/yard-v2/pebble-actor-profile.mjs';

import {PIP_ACTOR_REFERENCE,PIP_MEDIA_REVISION} from '../../../game-logic/yard-v2/pip-actor-profile.mjs';
import {FAMILY_ACTOR_REFERENCES} from '../../../game-logic/yard-v2/family-actor-profile.mjs';

const ROOT = '/assets/yard-mika/';
const stillIds = [...new Set(['sun-cushion-clean','yarn-mouse-clean','yarn-mouse-settled-clean',
  ...Object.values(FOOD_BINDINGS).flatMap(food=>[food.filledStillId,food.emptyStillId])])];
async function json(path,signal){const r=await fetch(path,{signal});if(!r.ok)throw Error(`Media ${r.status}: ${path}`);return r.json();}

/** One disposable canvas owner. Server snapshots are read-only; RAF never writes a save or reward. */
export function createCourtyardScene(canvas,{onView=()=>{},onError=()=>{},now=()=>performance.now(),actorProfiles=YARD_ACTOR_PROFILES,uiImageOwner,loadQaLayer=null,qaItemApproach=false,qaContinuation=false,qaSessionEpoch=()=>0}={}) {
  const ctx=canvas.getContext('2d'),abort=new AbortController(),timing=new FrameTelemetry();
  const familyMode=Object.values(FAMILY_ACTOR_REFERENCES).some(ref=>resolveActorProfile(ref,actorProfiles));
  const atlasPolicy=familyMode?FAMILY_ATLAS_POLICY:[MIKA_ACTOR_REFERENCE,MOCHI_ACTOR_REFERENCE,PEBBLE_ACTOR_REFERENCE,PIP_ACTOR_REFERENCE]
    .every(ref=>resolveActorProfile(ref,actorProfiles))?CURRENT_FOUR_ATLAS_POLICY:CANONICAL_ATLAS_POLICY;
  const bitmapOwners=new Map(),globalTrace=[];
  const uiImages=uiImageOwner||createUiImageReserve();let uiReserve=uiImages.snapshot(),canvasPendingBytes=0;
  const uiLifetimeFloor=Math.max(19138304,uiImageLifetimeLedger().bytes);
  const uiBytes=()=>Math.max(uiLifetimeFloor,uiReserve.bytes);
  const renderCatalog=Object.freeze({kind:'legacy-m2',sourceCommit:'6b80c9a2cca146e20afcaced6a34a035c30c13aa'});
  let qaLayer=null,qaRgbaBytes=0,qaFailure=null,qaInterruption=loadQaLayer&&document.hidden?'VISIBILITY_INTERRUPTED':null;
  const qaStartEpoch=loadQaLayer?qaSessionEpoch():0;
  const interruptQa=reason=>{if(loadQaLayer){qaInterruption??=reason;qaLayer?.abort(qaInterruption);}};
  const checkQaSession=()=>{if(loadQaLayer&&qaSessionEpoch()!==qaStartEpoch)qaInterruption??='SESSION_CHANGED';};
  const onQaVisibility=()=>{if(document.hidden)interruptQa('VISIBILITY_INTERRUPTED');};
  if(loadQaLayer)document.addEventListener('visibilitychange',onQaVisibility);
  let staticDecodedBytes=0,staticPendingBytes=0,backgroundDecodedBytes=0,globalPeakBytes=0,staticDecodes=0,maxGlobalDecodes=0;
  const outside=()=>staticDecodedBytes+staticPendingBytes+backgroundDecodedBytes+uiBytes()+canvas.width*canvas.height*4+canvasPendingBytes+qaRgbaBytes;
  function budgetSample(reason){const row={reason,atlasRetainedBytes:atlas.decodedBytes,atlasPendingBytes:atlas.reservedBytes,stillRetainedBytes:staticDecodedBytes,stillPendingBytes:staticPendingBytes,backgroundBytes:backgroundDecodedBytes,uiImageReserveBytes:uiBytes(),canvasPendingBytes,canvasBackingBytes:canvas.width*canvas.height*4,heldFrameAdditionalBytes:0,qaRgbaBytes,activeDecodes:atlas.active+staticDecodes};row.totalBytes=atlas.decodedBytes+atlas.reservedBytes+outside();globalPeakBytes=Math.max(globalPeakBytes,row.totalBytes);maxGlobalDecodes=Math.max(maxGlobalDecodes,row.activeDecodes);if(row.totalBytes>atlasPolicy.maxDecodedBytes||row.activeDecodes>1)throw Error('Global decoded-image budget exceeded');globalTrace.push(row);if(globalTrace.length>240)globalTrace.shift();}
  const atlas=new AtlasCache(new URL(ROOT,location.origin),atlasPolicy.maxPages,
    {...atlasPolicy,externalBytes:outside,onEvent:e=>{timing.atlas(e);budgetSample(e.type);}});
  const clock=new PresentationClock(now);
  let snapshot=null,view=null,projection=null,media=null,stills=null,actorEntries={},propBindings={},sceneGeometry=MIKA_SCENE;
  let retirement=null,ghost=null,disposed=false,raf=0,lastRafStamp=null,lastStatusAt=0,ready=false,pendingSize=null,resizeFailure=null;
  const images=new Map();
  const poseFor=pet=>{const actor=actorEntryForPet(pet,actorEntries);return selectPetPose(actor.manifest,pet,{actorProfile:actor.profile});};
  function time(){return clock.read();}
  function update(value){if(!value)return;snapshot=value;checkQaSession();if(qaInterruption)qaLayer?.abort(qaInterruption);qaLayer?.noteSnapshot(value);clock.update(value?.yardRuntime?.serverNow||value?.serverTime||Date.now());if(!ready)onView({...courtyardPresentation(snapshot,time(),clips,{actorProfiles}),mutable:false,mediaReady:false,renderCatalog});}
  function applyResize(){if(!pendingSize)return true;const {width,height,dpr}=pendingSize;
    const w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));
    {const external=staticDecodedBytes+staticPendingBytes+backgroundDecodedBytes+uiBytes()+qaRgbaBytes+canvas.width*canvas.height*4+(canvas.width!==w||canvas.height!==h?w*h*4:0);
      const demand=[...atlas.pinned].reduce((n,key)=>n+(atlas.entries.get(key)?.bytes??atlas.jobs.get(key)?.expectedBytes??0),0);
      if(external+demand>atlasPolicy.maxDecodedBytes){
        // Keep the existing coherent backing and projection, explicitly reject
        // this size, and allow a later smaller ResizeObserver request to recover.
        pendingSize=null;resizeFailure={code:'CANVAS_GLOBAL_BUDGET_UNAVAILABLE',width,height,dpr,requestedBackingBytes:w*h*4,demandBytes:demand,limitBytes:atlasPolicy.maxDecodedBytes};
        const error=Error('Canvas resize cannot fit the required images within the global decoded-image budget');error.code=resizeFailure.code;onError(error);return false;
      }
      if(!atlas.reserveExternal(external))return false; // only an in-flight reservation can still delay a feasible resize
    }
    resizeFailure=null;
    pendingSize=null;if(canvas.width===w&&canvas.height===h&&projection?.width===width&&projection?.height===height)return true;
    const changed=canvas.width!==w||canvas.height!==h;canvasPendingBytes=changed?w*h*4:0;budgetSample('canvas-resize-start');
    if(changed){canvas.width=0;canvas.height=h;canvas.width=w;}canvasPendingBytes=0;ctx.setTransform(dpr,0,0,dpr,0,0);projection=createProjection(width,height);budgetSample('canvas-resize');return true;}
  function resize(){const r=canvas.getBoundingClientRect();pendingSize={width:r.width,height:r.height,dpr:Math.min(devicePixelRatio||1,2)};
    // Changing backing dimensions clears a canvas. While decoding, leave its
    // coherent pixels intact and let CSS fit them until the current frame can
    // be redrawn. This needs no extra canvas copy or retained atlas pages.
    if(!ready||!view)applyResize();}
  uiImages.setAdmissionCheck(next=>{if(disposed)return false;const proposed=Math.max(uiLifetimeFloor,next.bytes);if(!atlas.reserveExternal(outside()-uiBytes()+proposed))return false;uiReserve=next;budgetSample('ui-admission');return true;});
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  function shadow(p,rx,ry,opacity=.2){ctx.save();ctx.translate(p.x,p.y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(39,54,27,${opacity})`);g.addColorStop(1,'rgba(39,54,27,0)');ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();}
  function sprite(id,p,alpha=1){const im=images.get(id),meta=stills[id];if(!im||!meta)return;const scale=projection.ppu/meta.worldPixelScale;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(im,p.x-meta.pivotPx[0]*scale,p.y-meta.pivotPx[1]*scale,im.width*scale,im.height*scale);ctx.restore();}
  const fade=pet=>pet.phase==='approach'||pet.phase==='depart'?edgeOpacity(pet.route.points,pet.phase,pet.groundDistance):1;
  function draw(v,stamp){
    const {width,height,ppu}=projection;ctx.clearRect(0,0,width,height);drawLegacyBackground(ctx,images.get('legacy-background'),width,height);
    for(const food of foodBowlPresentation(v.bowls)){
      const bowl=projection.project(food.anchor);shadow(bowl,ppu*.43,ppu*.16,.25);sprite(food.stillId,bowl);
    }
    const layers=[];
    const qa=qaLayer?.frame({view:v,snapshot,projection,sceneGeometry,stamp,shadow});if(qa)layers.push({y:qa.y,draw:()=>qa.draw(ctx)});
    for(const pet of v.pets){const pose=poseFor(pet),base=pet.phase==='active-clip'?pet.clipOrigin:pet.position,units=actorEntryForPet(pet,actorEntries).profile.unitsPerWorld;
      const contact=actorEntryForPet(pet,actorEntries).groundShadow||{radiusX:.19,radiusY:.065,opacity:.22};
      const origin=pet.phase==='active-clip'?(pose.clip.originWorld||[0,0,0]):[0,0,0];
      for(const p of pose.clip.groundContacts?.[pose.index]||[]){const point=projection.project({x:base.x+(p[0]-origin[0])*units,y:base.y+(p[1]-origin[1])*units});shadow(point,ppu*contact.radiusX,ppu*contact.radiusY,contact.opacity*fade(pet));}
    }
    for(const prop of v.props){if(!prop.supported||ghost?.slotId===prop.slotId)continue;const p=projection.project(prop.transform);
      shadow(p,ppu*(prop.goodieId==='sun_cushion'?1.1:.32),ppu*(prop.goodieId==='sun_cushion'?.35:.1),.14);
      if(prop.drawStandalone)layers.push({y:p.y,draw:()=>sprite(prop.stillId||(prop.goodieId==='sun_cushion'?'sun-cushion-clean':Math.abs(prop.transform.rotationZ)>.05?'yarn-mouse-settled-clean':'yarn-mouse-clean'),p,prop.conditionPixels||prop.condition==='new'?1:.7)});
    }
    for(const pet of v.pets){const pose=poseFor(pet),p=projection.project(pet.phase==='active-clip'?pet.clipOrigin:pet.position);
      layers.push({y:p.y,draw:()=>{ctx.save();ctx.globalAlpha=fade(pet);atlas.draw(ctx,pose.clip,pose.index,p,ppu);ctx.restore();}});
    }
    layers.sort((a,b)=>a.y-b.y).forEach(l=>l.draw());
    if(ghost){const poly=footprintPolygon(footprint(ghost,sceneGeometry),projection);ctx.beginPath();poly.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=ghost.valid?'#86ae7190':'#c3696590';ctx.fill();ctx.strokeStyle=ghost.valid?'#416c35':'#9d3c36';ctx.stroke();sprite(propBindings[ghost.goodieId]?.stillId||(ghost.goodieId==='sun_cushion'?'sun-cushion-clean':'yarn-mouse-clean'),projection.project(ghost),.65);}
  }
  function tick(stamp){if(disposed)return;try{
    // RAF owns a browser monotonic origin; the injected presentation clock may
    // be virtual. Bootstrap from the first RAF instead of mixing those origins.
    const delta=lastRafStamp===null?0:stamp-lastRafStamp;lastRafStamp=stamp;timing.raf(delta,!document.hidden);
    if(snapshot&&media&&projection&&!document.hidden){const at=time(),next=courtyardPresentation(snapshot,at,clips,{actorEntries,actorProfiles});
      const later=courtyardPresentation(snapshot,at+1100,clips,{actorEntries,actorProfiles});
      const lookahead=[];
      for(const pet of next.pets){const entry=actorEntryForPet(pet,actorEntries),plan=next.plans[pet.visitId];
        if(entry.presentation?.requests)lookahead.push(...entry.presentation.requests(plan,at).lookahead);
        else{const future=later.pets.find(p=>p.visitId===pet.visitId);if(future)lookahead.push(poseFor(future));}}
      atlas.prepare(next.pets.map(pet=>poseFor(pet)),lookahead);
      let missing=null;for(const pet of next.pets){const p=poseFor(pet);if(!atlas.frame(p.clip,p.index))missing={mediaId:p.mediaId,index:p.index,page:atlas.sourceFor(p.clip,atlasPageFor(p.clip,p.index).page)};}
      if(missing){timing.mediaWait(at,missing);}else{timing.mediaReady(at);view=next;}
      // While a page decodes keep the last coherent frame. The authoritative
      // clock does not stop; telemetry reports that wait and restoration samples current server time.
      // The canvas already contains the last coherent image. Re-drawing its old
      // pages while waiting would re-request images that the new working set is
      // deliberately replacing, causing eviction/decode churn with two actors.
      if(view&&!missing&&applyResize()){draw(view,stamp);timing.presented(view.pets.map(p=>{const q=poseFor(p);return{visitId:p.visitId,mediaId:q.mediaId,actorProfile:p.actorProfile,index:q.index,position:p.position||p.clipOrigin};}),at);budgetSample('presented');}
      if(stamp-lastStatusAt>250){onView({...next,mediaReady:true,renderCatalog,renderRevision:'legacy-m2/6b80c9a2'});lastStatusAt=stamp;}
      if(atlas.error)throw atlas.error;
    }
  }catch(e){ready=false;if(snapshot)onView({...courtyardPresentation(snapshot,time(),clips,{actorProfiles}),mutable:false,mediaReady:false,renderCatalog});onError(e);return;}raf=requestAnimationFrame(tick);}
  async function loadStill(id,meta,url){
    if(disposed)return;
    const absolute=new URL(url,location.origin);if(meta.assetRevision)absolute.searchParams.set('yard-media',meta.assetRevision);const key=absolute.href;
    if(bitmapOwners.has(key)){const old=bitmapOwners.get(key);if(meta.canvas&&(old.width!==meta.canvas[0]||old.height!==meta.canvas[1]))throw Error('Shared still dimensions disagree');images.set(id,old);stills[id]=meta;return;}
    const response=await fetch(key,{signal:abort.signal});if(!response.ok)throw Error(`Media ${response.status}: ${key}`);const blob=await response.blob();if(disposed)return;
    if(meta.verifySourceBytes){const bytes=await blob.arrayBuffer();if(disposed)return;const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(disposed)return;if(hash!==meta.sha256||bytes.byteLength!==meta.encodedBytes)throw Error('Legacy source image identity mismatch');}
    const declared=meta.canvas?meta.canvas[0]*meta.canvas[1]*4:1024*1024; // reserve a finite upper bound for older verified still descriptors
    if(!atlas.reserveExternal(outside()+declared))throw Error('Static decoded-image allocation exceeds global budget');
    staticPendingBytes=declared;staticDecodes=1;budgetSample('still-decode-start');let bitmap;
    try{bitmap=await createImageBitmap(blob);if(disposed){bitmap.close();bitmap=null;return;}const bytes=bitmap.width*bitmap.height*4;if(bytes>declared||meta.canvas&&(bitmap.width!==meta.canvas[0]||bitmap.height!==meta.canvas[1]))throw Error('Still dimensions differ from the verified descriptor');staticPendingBytes=0;staticDecodes=0;staticDecodedBytes+=bytes;bitmapOwners.set(key,bitmap);images.set(id,bitmap);stills[id]=meta;bitmap=null;budgetSample('still-ready');}
    finally{bitmap?.close();staticPendingBytes=0;staticDecodes=0;}
  }
  const readyPromise=(async()=>{
    stills={};await loadStill('legacy-background',LEGACY_M2_BACKGROUND,LEGACY_M2_BACKGROUND.url);if(disposed)return;
    staticDecodedBytes-=LEGACY_M2_BACKGROUND.decodedBytes;backgroundDecodedBytes=LEGACY_M2_BACKGROUND.decodedBytes;budgetSample('background-ready');
    const [a,b]=await Promise.all([json(`${ROOT}runtime-media.json?v=${encodeURIComponent(MIKA_RUNTIME_MEDIA_REVISION)}`,abort.signal),json(`${ROOT}still-layer-contract.json?v=${encodeURIComponent(MIKA_RUNTIME_MEDIA_REVISION)}`,abort.signal)]);
    if(disposed)return;if(a.manifestRevision!==MIKA_RUNTIME_MEDIA_REVISION||!a.renderBindings)throw Error('Mismatched Yard runtime media revision');
    actorEntries={mika:createActorMediaEntry(a,{reference:MIKA_ACTOR_REFERENCE,assetBaseURL:new URL(ROOT,location.origin).href,clips,profiles:actorProfiles})};
    media=a;stills=b;
    for(const id of stillIds){await loadStill(id,b[id],`${ROOT}${id}.webp`);if(disposed)return;}
    // No Mochi network/decode work in a released/default scene. The registry
    // must explicitly contain its accepted exact profile before this loads.
    if(resolveActorProfile(MOCHI_ACTOR_REFERENCE,actorProfiles)){
      const base=new URL('/assets/yard-mochi/',location.origin).href;
      const [{createMochiActorMediaEntry},manifest]=await Promise.all([import('./mochi-actor-media.mjs'),json(`${base}runtime-media.json?v=${encodeURIComponent(MOCHI_RUNTIME_MEDIA_REVISION)}`,abort.signal)]);
      if(disposed)return;const entry=createMochiActorMediaEntry(manifest,{assetBaseURL:base,profiles:actorProfiles});
      for(const[id,meta]of Object.entries(entry.stills)){await loadStill(id,meta,meta.assetURL);if(disposed)return;}
      if(disposed)return;actorEntries.mochi=entry;
    }
    if(resolveActorProfile(PEBBLE_ACTOR_REFERENCE,actorProfiles)){
      const base=new URL('/assets/yard-pebble/',location.origin).href;
      const [{createPebbleActorMediaEntry},manifest]=await Promise.all([import('./pebble-actor-media.mjs'),json(`${base}runtime-media.json?v=${encodeURIComponent(PEBBLE_MEDIA_REVISION)}`,abort.signal)]);
      if(disposed)return;const entry=createPebbleActorMediaEntry(manifest,{assetBaseURL:base,profiles:actorProfiles});
      for(const[id,meta]of Object.entries(entry.stills)){await loadStill(id,meta,meta.assetURL);if(disposed)return;}
      if(disposed)return;actorEntries.pebble=entry;
    }
    if(resolveActorProfile(PIP_ACTOR_REFERENCE,actorProfiles)){
      const base=new URL('/assets/yard-pip/',location.origin).href;
      const [{createPipActorMediaEntry},manifest]=await Promise.all([import('./pip-actor-media.mjs'),json(`${base}runtime-media.json?v=${encodeURIComponent(PIP_MEDIA_REVISION)}`,abort.signal)]);
      if(disposed)return;const entry=createPipActorMediaEntry(manifest,{assetBaseURL:base,profiles:actorProfiles});
      for(const[id,meta]of Object.entries(entry.stills)){await loadStill(id,meta,meta.assetURL);if(disposed)return;}
      if(disposed)return;actorEntries.pip=entry;
    }
    for(const[id,reference]of Object.entries(FAMILY_ACTOR_REFERENCES))if(resolveActorProfile(reference,actorProfiles)){
      const base=new URL(`/assets/yard-family/${id}/`,location.origin).href;
      const [{createFamilyActorMediaEntry},manifest]=await Promise.all([import('./family-actor-media.mjs'),json(`${base}runtime-media.json`,abort.signal)]);
      if(disposed)return;const entry=createFamilyActorMediaEntry(id,manifest,{assetBaseURL:base,profiles:actorProfiles});
      for(const[stillId,meta]of Object.entries(entry.stills)){await loadStill(stillId,meta,meta.assetURL);if(disposed)return;}
      if(disposed)return;actorEntries[id]=entry;
    }
    propBindings=Object.assign({},...Object.values(actorEntries).map(e=>e.propBindings||{}));
    sceneGeometry={...MIKA_SCENE,footprints:{...MIKA_SCENE.footprints,...Object.fromEntries(Object.entries(propBindings).map(([id,p])=>[id,p.footprint]))}};
    if(disposed)return;
    if(loadQaLayer&&!qaInterruption){
      try{
        const module=await loadQaLayer();checkQaSession();
        if(disposed)return;
        if(!qaInterruption){
          qaLayer=await module.createMikaYardQaLayer({itemApproach:qaItemApproach,continuation:qaContinuation,signal:abort.signal,cameraDirection:CAMERA_DIRECTION,
            reserveRGBA:bytes=>{if(bytes===0){qaRgbaBytes=0;return true;}if(disposed||!Number.isFinite(bytes)||bytes<0||!atlas.reserveExternal(outside()-qaRgbaBytes+bytes))return false;qaRgbaBytes=bytes;budgetSample('qa-surface');return true;}});
          checkQaSession();if(qaInterruption)qaLayer.abort(qaInterruption);
          if(disposed){qaLayer.dispose();return;}
        }
      }catch(error){qaFailure=String(error.message);}
    }
    if(disposed)return;resize();ready=true;raf=requestAnimationFrame(tick);
  })().catch(e=>{ready=false;if(!disposed){if(snapshot)onView({...courtyardPresentation(snapshot,time(),clips,{actorProfiles}),mutable:false,mediaReady:false,renderCatalog});onError(e);}});
  return {ready:readyPromise,update,requestMikaItemArrival(slotId){checkQaSession();if(disposed||!ready||qaInterruption)return{ok:false,reason:qaInterruption||'NATIVE_ACTION_UNAVAILABLE'};return qaLayer?.requestItemArrival?.(slotId)??{ok:false,reason:'NATIVE_ACTION_UNAVAILABLE'};},setGhost(value){ghost=value;if(value)interruptQa('ITEM_EDITING');},point(event){const r=canvas.getBoundingClientRect();return projection?.unproject({x:(event.clientX-r.left)*projection.width/r.width,y:(event.clientY-r.top)*projection.height/r.height});},
    offsetPoint(position,delta){return projection?offsetWorldPoint(projection,position,delta):null;},
    hit(event){if(!view||!projection)return null;const r=canvas.getBoundingClientRect(),point={x:event.clientX-r.left,y:event.clientY-r.top};return view.props.filter(p=>p.supported).map(prop=>{const q=projection.project(prop.transform);return{prop,p:{x:q.x*r.width/projection.width,y:q.y*r.height/projection.height}};}).filter(v=>Math.hypot(v.p.x-point.x,v.p.y-point.y)<28).sort((a,b)=>Math.hypot(a.p.x-point.x,a.p.y-point.y)-Math.hypot(b.p.x-point.x,b.p.y-point.y))[0]?.prop;},
    diagnostics(){return{disposed,ready,qaMika:qaLayer?.diagnostics()??(qaInterruption?{phase:'aborted',reason:qaInterruption}:qaFailure?{phase:'unavailable',reason:qaFailure}:null),qaRgbaBytes,legacySourceCommit:'6b80c9a2cca146e20afcaced6a34a035c30c13aa',renderRevision:'legacy-m2/6b80c9a2',mediaBlocked:!ready,uiReserve,uiLifetimeFloor,backgroundComposition:'original cover52%50% in owned Canvas2D',presentationTime:clock.read(),serverTime:snapshot?.yardRuntime?.serverNow,timing:timing.snapshot(),atlasPolicy,retainedPages:atlas.entries.size,pendingPages:atlas.pending.size,pendingDecodes:atlas.active,decodedBytesEstimate:atlas.decodedBytes,pendingBytesEstimate:atlas.reservedBytes,...(familyMode?{globalDecodedBudget:{limitBytes:atlasPolicy.maxDecodedBytes,totalBytes:atlas.decodedBytes+atlas.reservedBytes+outside(),peakBytes:globalPeakBytes,maxConcurrentDecodes:maxGlobalDecodes,stillBytes:staticDecodedBytes,stillPendingBytes:staticPendingBytes,backgroundBytes:backgroundDecodedBytes,uiImageReserveBytes:uiBytes(),canvasPendingBytes,canvasBackingBytes:canvas.width*canvas.height*4,heldFrameAdditionalBytes:0,bitmapOwners:bitmapOwners.size,trace:globalTrace.map(r=>({...r}))}}:{}),view,pendingResize:!!pendingSize,resizeFailure:resizeFailure?{...resizeFailure}:null,projection:projection?{width:projection.width,height:projection.height,ppu:projection.ppu}:null};},
    dispose(){if(retirement)return retirement;const pending=[readyPromise,...atlas.pending.values()];disposed=true;ready=false;abort.abort();cancelAnimationFrame(raf);observer.disconnect();if(loadQaLayer)document.removeEventListener('visibilitychange',onQaVisibility);pending.push(Promise.resolve(qaLayer?.dispose()));atlas.dispose();for(const b of bitmapOwners.values())b.close();bitmapOwners.clear();staticDecodedBytes=0;backgroundDecodedBytes=0;images.clear();uiImages.setAdmissionCheck(()=>false);retirement=Promise.allSettled(pending);return retirement;}
  };
}
