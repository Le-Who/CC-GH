import { AtlasCache, atlasPageFor } from './atlas.mjs';
import { CANONICAL_ATLAS_POLICY,CURRENT_FOUR_ATLAS_POLICY,FAMILY_ATLAS_POLICY } from './atlas-policy.mjs';
import { createProjection, footprintPolygon } from './projection.mjs';
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
const image = src => new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error(`Image missing: ${src}`));im.src=src;});
async function json(path,signal){const r=await fetch(path,{signal});if(!r.ok)throw Error(`Media ${r.status}: ${path}`);return r.json();}

/** One disposable canvas owner. Server snapshots are read-only; RAF never writes a save or reward. */
export function createCourtyardScene(canvas,{onView=()=>{},onError=()=>{},now=()=>performance.now(),actorProfiles=YARD_ACTOR_PROFILES,backgroundImage}={}) {
  const ctx=canvas.getContext('2d'),abort=new AbortController(),timing=new FrameTelemetry();
  const familyMode=Object.values(FAMILY_ACTOR_REFERENCES).some(ref=>resolveActorProfile(ref,actorProfiles));
  const atlasPolicy=familyMode?FAMILY_ATLAS_POLICY:[MIKA_ACTOR_REFERENCE,MOCHI_ACTOR_REFERENCE,PEBBLE_ACTOR_REFERENCE,PIP_ACTOR_REFERENCE]
    .every(ref=>resolveActorProfile(ref,actorProfiles))?CURRENT_FOUR_ATLAS_POLICY:CANONICAL_ATLAS_POLICY;
  const bitmapOwners=new Map(),globalTrace=[];
  let staticDecodedBytes=0,staticPendingBytes=0,backgroundDecodedBytes=0,globalPeakBytes=0,staticDecodes=0,maxGlobalDecodes=0;
  const outside=()=>familyMode?staticDecodedBytes+staticPendingBytes+backgroundDecodedBytes+canvas.width*canvas.height*4:0;
  function budgetSample(reason){if(!familyMode)return;const row={reason,atlasRetainedBytes:atlas.decodedBytes,atlasPendingBytes:atlas.reservedBytes,stillRetainedBytes:staticDecodedBytes,stillPendingBytes:staticPendingBytes,backgroundBytes:backgroundDecodedBytes,canvasBackingBytes:canvas.width*canvas.height*4,heldFrameAdditionalBytes:0,activeDecodes:atlas.active+staticDecodes};row.totalBytes=atlas.decodedBytes+atlas.reservedBytes+outside();globalPeakBytes=Math.max(globalPeakBytes,row.totalBytes);maxGlobalDecodes=Math.max(maxGlobalDecodes,row.activeDecodes);if(row.totalBytes>atlasPolicy.maxDecodedBytes||row.activeDecodes>1)throw Error('Global decoded-image budget exceeded');globalTrace.push(row);if(globalTrace.length>240)globalTrace.shift();}
  const atlas=new AtlasCache(new URL(ROOT,location.origin),atlasPolicy.maxPages,
    {...atlasPolicy,externalBytes:outside,onEvent:e=>{timing.atlas(e);budgetSample(e.type);}});
  const clock=new PresentationClock(now);
  let snapshot=null,view=null,projection=null,media=null,stills=null,actorEntries={},propBindings={},sceneGeometry=MIKA_SCENE;
  let ghost=null,disposed=false,raf=0,lastNow=now(),lastStatusAt=0,ready=false,pendingSize=null,resizeFailure=null;
  const images=new Map();
  const poseFor=pet=>{const actor=actorEntryForPet(pet,actorEntries);return selectPetPose(actor.manifest,pet,{actorProfile:actor.profile});};
  function time(){return clock.read();}
  function update(value){if(!value)return;snapshot=value;clock.update(value?.yardRuntime?.serverNow||value?.serverTime||Date.now());}
  function applyResize(){if(!pendingSize)return true;const {width,height,dpr}=pendingSize;
    const w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));
    if(familyMode){const external=staticDecodedBytes+staticPendingBytes+backgroundDecodedBytes+Math.max(canvas.width*canvas.height*4,w*h*4);
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
    canvas.width=w;canvas.height=h;ctx.setTransform(dpr,0,0,dpr,0,0);projection=createProjection(width,height);budgetSample('canvas-resize');return true;}
  function resize(){const r=canvas.getBoundingClientRect();pendingSize={width:r.width,height:r.height,dpr:Math.min(devicePixelRatio||1,2)};
    // Changing backing dimensions clears a canvas. While decoding, leave its
    // coherent pixels intact and let CSS fit them until the current frame can
    // be redrawn. This needs no extra canvas copy or retained atlas pages.
    if(!ready||!view)applyResize();}
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  function shadow(p,rx,ry,opacity=.2){ctx.save();ctx.translate(p.x,p.y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(39,54,27,${opacity})`);g.addColorStop(1,'rgba(39,54,27,0)');ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();}
  function sprite(id,p,alpha=1){const im=images.get(id),meta=stills[id];if(!im||!meta)return;const scale=projection.ppu/meta.worldPixelScale;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(im,p.x-meta.pivotPx[0]*scale,p.y-meta.pivotPx[1]*scale,im.width*scale,im.height*scale);ctx.restore();}
  const fade=pet=>pet.phase==='approach'||pet.phase==='depart'?edgeOpacity(pet.route.points,pet.phase,pet.groundDistance):1;
  function draw(v){
    const {width,height,ppu}=projection;ctx.clearRect(0,0,width,height);
    for(const food of foodBowlPresentation(v.bowls)){
      const bowl=projection.project(food.anchor);shadow(bowl,ppu*.43,ppu*.16,.25);sprite(food.stillId,bowl);
    }
    const layers=[];
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
    const delta=stamp-lastNow;lastNow=stamp;timing.raf(delta,!document.hidden);
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
      if(view&&!missing&&applyResize()){draw(view);timing.presented(view.pets.map(p=>{const q=poseFor(p);return{visitId:p.visitId,mediaId:q.mediaId,actorProfile:p.actorProfile,index:q.index,position:p.position||p.clipOrigin};}),at);budgetSample('presented');}
      if(stamp-lastStatusAt>250){onView(next);lastStatusAt=stamp;}
      if(atlas.error)throw atlas.error;
    }
  }catch(e){onError(e);return;}raf=requestAnimationFrame(tick);}
  async function loadStill(id,meta,url){
    if(!familyMode){const im=await image(url);if(!disposed){images.set(id,im);stills[id]=meta;}return;}
    const absolute=new URL(url,location.origin);if(meta.assetRevision)absolute.searchParams.set('yard-media',meta.assetRevision);const key=absolute.href;
    if(bitmapOwners.has(key)){const old=bitmapOwners.get(key);if(meta.canvas&&(old.width!==meta.canvas[0]||old.height!==meta.canvas[1]))throw Error('Shared still dimensions disagree');images.set(id,old);stills[id]=meta;return;}
    const response=await fetch(key,{signal:abort.signal});if(!response.ok)throw Error(`Media ${response.status}: ${key}`);const blob=await response.blob();
    const declared=meta.canvas?meta.canvas[0]*meta.canvas[1]*4:1024*1024; // reserve a finite upper bound for older verified still descriptors
    if(!atlas.reserveExternal(outside()+declared))throw Error('Static decoded-image allocation exceeds global budget');
    staticPendingBytes=declared;staticDecodes=1;budgetSample('still-decode-start');let bitmap;
    try{bitmap=await createImageBitmap(blob);if(disposed){bitmap.close();return;}const bytes=bitmap.width*bitmap.height*4;if(bytes>declared||meta.canvas&&(bitmap.width!==meta.canvas[0]||bitmap.height!==meta.canvas[1]))throw Error('Still dimensions differ from the verified descriptor');staticPendingBytes=0;staticDecodes=0;staticDecodedBytes+=bytes;bitmapOwners.set(key,bitmap);images.set(id,bitmap);stills[id]=meta;bitmap=null;budgetSample('still-ready');}
    finally{bitmap?.close();staticPendingBytes=0;staticDecodes=0;}
  }
  const readyPromise=(async()=>{
    if(familyMode){const bg=backgroundImage||canvas.parentElement?.querySelector('.cy-background');if(!bg||new URL(bg.src,location.origin).pathname!==ROOT+'background.webp')throw Error('Actual canonical background required for global budget');await bg.decode();if(disposed)return;if(!bg.naturalWidth||!bg.naturalHeight)throw Error('Decoded background dimensions unavailable');backgroundDecodedBytes=bg.naturalWidth*bg.naturalHeight*4;budgetSample('background-ready');}
    const [a,b]=await Promise.all([json(`${ROOT}runtime-media.json?v=${encodeURIComponent(MIKA_RUNTIME_MEDIA_REVISION)}`,abort.signal),json(`${ROOT}still-layer-contract.json?v=${encodeURIComponent(MIKA_RUNTIME_MEDIA_REVISION)}`,abort.signal)]);
    if(disposed)return;if(a.manifestRevision!==MIKA_RUNTIME_MEDIA_REVISION||!a.renderBindings)throw Error('Mismatched Yard runtime media revision');
    actorEntries={mika:createActorMediaEntry(a,{reference:MIKA_ACTOR_REFERENCE,assetBaseURL:new URL(ROOT,location.origin).href,clips,profiles:actorProfiles})};
    media=a;stills=b;
    if(familyMode){for(const id of stillIds)await loadStill(id,b[id],`${ROOT}${id}.webp`);}else await Promise.all(stillIds.map(async id=>images.set(id,await image(`${ROOT}${id}.webp`))));
    // No Mochi network/decode work in a released/default scene. The registry
    // must explicitly contain its accepted exact profile before this loads.
    if(resolveActorProfile(MOCHI_ACTOR_REFERENCE,actorProfiles)){
      const base=new URL('/assets/yard-mochi/',location.origin).href;
      const [{createMochiActorMediaEntry},manifest]=await Promise.all([import('./mochi-actor-media.mjs'),json(`${base}runtime-media.json?v=${encodeURIComponent(MOCHI_RUNTIME_MEDIA_REVISION)}`,abort.signal)]);
      const entry=createMochiActorMediaEntry(manifest,{assetBaseURL:base,profiles:actorProfiles});
      for(const[id,meta]of Object.entries(entry.stills))await loadStill(id,meta,meta.assetURL);
      if(disposed)return;actorEntries.mochi=entry;
    }
    if(resolveActorProfile(PEBBLE_ACTOR_REFERENCE,actorProfiles)){
      const base=new URL('/assets/yard-pebble/',location.origin).href;
      const [{createPebbleActorMediaEntry},manifest]=await Promise.all([import('./pebble-actor-media.mjs'),json(`${base}runtime-media.json?v=${encodeURIComponent(PEBBLE_MEDIA_REVISION)}`,abort.signal)]);
      const entry=createPebbleActorMediaEntry(manifest,{assetBaseURL:base,profiles:actorProfiles});
      for(const[id,meta]of Object.entries(entry.stills))await loadStill(id,meta,meta.assetURL);
      if(disposed)return;actorEntries.pebble=entry;
    }
    if(resolveActorProfile(PIP_ACTOR_REFERENCE,actorProfiles)){
      const base=new URL('/assets/yard-pip/',location.origin).href;
      const [{createPipActorMediaEntry},manifest]=await Promise.all([import('./pip-actor-media.mjs'),json(`${base}runtime-media.json?v=${encodeURIComponent(PIP_MEDIA_REVISION)}`,abort.signal)]);
      const entry=createPipActorMediaEntry(manifest,{assetBaseURL:base,profiles:actorProfiles});
      for(const[id,meta]of Object.entries(entry.stills))await loadStill(id,meta,meta.assetURL);
      if(disposed)return;actorEntries.pip=entry;
    }
    for(const[id,reference]of Object.entries(FAMILY_ACTOR_REFERENCES))if(resolveActorProfile(reference,actorProfiles)){
      const base=new URL(`/assets/yard-family/${id}/`,location.origin).href;
      const [{createFamilyActorMediaEntry},manifest]=await Promise.all([import('./family-actor-media.mjs'),json(`${base}runtime-media.json`,abort.signal)]);
      const entry=createFamilyActorMediaEntry(id,manifest,{assetBaseURL:base,profiles:actorProfiles});
      for(const[stillId,meta]of Object.entries(entry.stills))await loadStill(stillId,meta,meta.assetURL);
      if(disposed)return;actorEntries[id]=entry;
    }
    propBindings=Object.assign({},...Object.values(actorEntries).map(e=>e.propBindings||{}));
    sceneGeometry={...MIKA_SCENE,footprints:{...MIKA_SCENE.footprints,...Object.fromEntries(Object.entries(propBindings).map(([id,p])=>[id,p.footprint]))}};
    if(disposed)return;resize();ready=true;lastNow=now();raf=requestAnimationFrame(tick);
  })().catch(e=>{if(!disposed)onError(e);});
  return {ready:readyPromise,update,setGhost(value){ghost=value;},point(event){const r=canvas.getBoundingClientRect();return projection?.unproject({x:(event.clientX-r.left)*projection.width/r.width,y:(event.clientY-r.top)*projection.height/r.height});},
    hit(event){if(!view||!projection)return null;const r=canvas.getBoundingClientRect(),point={x:event.clientX-r.left,y:event.clientY-r.top};return view.props.filter(p=>p.supported).map(prop=>{const q=projection.project(prop.transform);return{prop,p:{x:q.x*r.width/projection.width,y:q.y*r.height/projection.height}};}).filter(v=>Math.hypot(v.p.x-point.x,v.p.y-point.y)<28).sort((a,b)=>Math.hypot(a.p.x-point.x,a.p.y-point.y)-Math.hypot(b.p.x-point.x,b.p.y-point.y))[0]?.prop;},
    diagnostics(){return{ready,presentationTime:clock.read(),serverTime:snapshot?.yardRuntime?.serverNow,timing:timing.snapshot(),atlasPolicy,retainedPages:atlas.entries.size,pendingPages:atlas.pending.size,pendingDecodes:atlas.active,decodedBytesEstimate:atlas.decodedBytes,pendingBytesEstimate:atlas.reservedBytes,...(familyMode?{globalDecodedBudget:{limitBytes:atlasPolicy.maxDecodedBytes,totalBytes:atlas.decodedBytes+atlas.reservedBytes+outside(),peakBytes:globalPeakBytes,maxConcurrentDecodes:maxGlobalDecodes,stillBytes:staticDecodedBytes,stillPendingBytes:staticPendingBytes,backgroundBytes:backgroundDecodedBytes,canvasBackingBytes:canvas.width*canvas.height*4,heldFrameAdditionalBytes:0,bitmapOwners:bitmapOwners.size,trace:globalTrace.map(r=>({...r}))}}:{}),view,pendingResize:!!pendingSize,resizeFailure:resizeFailure?{...resizeFailure}:null,projection:projection?{width:projection.width,height:projection.height,ppu:projection.ppu}:null};},
    dispose(){disposed=true;abort.abort();cancelAnimationFrame(raf);observer.disconnect();atlas.dispose();for(const b of bitmapOwners.values())b.close();bitmapOwners.clear();staticDecodedBytes=0;images.clear();}
  };
}
