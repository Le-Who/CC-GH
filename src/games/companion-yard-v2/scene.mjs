import { AtlasCache, atlasPageFor } from './atlas.mjs';
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

const ROOT = '/assets/yard-mika/';
const stillIds = ['sun-cushion-clean','yarn-mouse-clean','yarn-mouse-settled-clean','kibble-bowl-clean','kibble-bowl-empty'];
const image = src => new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error(`Image missing: ${src}`));im.src=src;});
async function json(path,signal){const r=await fetch(path,{signal});if(!r.ok)throw Error(`Media ${r.status}: ${path}`);return r.json();}

/** One disposable canvas owner. Server snapshots are read-only; RAF never writes a save or reward. */
export function createCourtyardScene(canvas,{onView=()=>{},onError=()=>{},now=()=>performance.now()}={}) {
  const ctx=canvas.getContext('2d'),abort=new AbortController(),timing=new FrameTelemetry();
  const atlas=new AtlasCache(new URL(ROOT,location.origin),3,{onEvent:e=>timing.atlas(e)});
  const clock=new PresentationClock(now);
  let snapshot=null,view=null,projection=null,media=null,stills=null;
  let ghost=null,disposed=false,raf=0,lastNow=now(),lastStatusAt=0,ready=false;
  const images=new Map();
  function time(){return clock.read();}
  function update(value){if(!value)return;snapshot=value;clock.update(value?.yardRuntime?.serverNow||value?.serverTime||Date.now());}
  function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);projection=createProjection(r.width,r.height);}
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  function shadow(p,rx,ry,opacity=.2){ctx.save();ctx.translate(p.x,p.y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(39,54,27,${opacity})`);g.addColorStop(1,'rgba(39,54,27,0)');ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();}
  function sprite(id,p,alpha=1){const im=images.get(id),meta=stills[id];if(!im||!meta)return;const scale=projection.ppu/meta.worldPixelScale;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(im,p.x-meta.pivotPx[0]*scale,p.y-meta.pivotPx[1]*scale,im.width*scale,im.height*scale);ctx.restore();}
  const fade=pet=>pet.phase==='approach'||pet.phase==='depart'?edgeOpacity(pet.route.points,pet.phase,pet.groundDistance):1;
  function draw(v){
    const {width,height,ppu}=projection;ctx.clearRect(0,0,width,height);
    const bowl=projection.project(MIKA_SCENE.bowlAnchor);shadow(bowl,ppu*.43,ppu*.16,.25);
    sprite(v.bowls.some(b=>b.foodId&&b.servings>0)?'kibble-bowl-clean':'kibble-bowl-empty',bowl);
    const layers=[];
    for(const pet of v.pets){const pose=selectPetPose(media,pet),base=pet.phase==='active-clip'?pet.clipOrigin:pet.position;
      const origin=pet.phase==='active-clip'?(pose.clip.originWorld||[0,0,0]):[0,0,0];
      for(const p of pose.clip.groundContacts?.[pose.index]||[]){const point=projection.project({x:base.x+(p[0]-origin[0])*8,y:base.y+(p[1]-origin[1])*8});shadow(point,ppu*.19,ppu*.065,.22*fade(pet));}
    }
    for(const prop of v.props){if(!prop.supported||ghost?.slotId===prop.slotId)continue;const p=projection.project(prop.transform);
      shadow(p,ppu*(prop.goodieId==='sun_cushion'?1.1:.32),ppu*(prop.goodieId==='sun_cushion'?.35:.1),.14);
      if(prop.drawStandalone)layers.push({y:p.y,draw:()=>sprite(prop.goodieId==='sun_cushion'?'sun-cushion-clean':Math.abs(prop.transform.rotationZ)>.05?'yarn-mouse-settled-clean':'yarn-mouse-clean',p,prop.condition==='new'?1:.7)});
    }
    for(const pet of v.pets){const pose=selectPetPose(media,pet),p=projection.project(pet.phase==='active-clip'?pet.clipOrigin:pet.position);
      layers.push({y:p.y,draw:()=>{ctx.save();ctx.globalAlpha=fade(pet);atlas.draw(ctx,pose.clip,pose.index,p,ppu);ctx.restore();}});
    }
    layers.sort((a,b)=>a.y-b.y).forEach(l=>l.draw());
    if(ghost){const poly=footprintPolygon(footprint(ghost,MIKA_SCENE),projection);ctx.beginPath();poly.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=ghost.valid?'#86ae7190':'#c3696590';ctx.fill();ctx.strokeStyle=ghost.valid?'#416c35':'#9d3c36';ctx.stroke();sprite(ghost.goodieId==='sun_cushion'?'sun-cushion-clean':'yarn-mouse-clean',projection.project(ghost),.65);}
  }
  function tick(stamp){if(disposed)return;try{
    const delta=stamp-lastNow;lastNow=stamp;timing.raf(delta,!document.hidden);
    if(snapshot&&media&&projection&&!document.hidden){const at=time(),next=courtyardPresentation(snapshot,at,clips,{mediaRevisions:media.renderBindings});
      const later=courtyardPresentation(snapshot,at+1100,clips,{mediaRevisions:media.renderBindings});
      for(const pet of later.pets){const p=selectPetPose(media,pet);atlas.prefetch(p.clip,p.index,'stay-lookahead');}
      let missing=null;for(const pet of next.pets){const p=selectPetPose(media,pet);if(!atlas.frame(p.clip,p.index))missing={mediaId:p.mediaId,index:p.index,page:atlasPageFor(p.clip,p.index).page.src};}
      if(missing){timing.mediaWait(at,missing);}else{timing.mediaReady(at);view=next;}
      // While a page decodes keep the last coherent frame. The authoritative
      // clock does not stop; telemetry reports that wait and restoration samples current server time.
      if(view){draw(view);timing.presented(view.pets.map(p=>{const q=selectPetPose(media,p);return{visitId:p.visitId,mediaId:q.mediaId,index:q.index,position:p.position||p.clipOrigin};}),at);}
      if(stamp-lastStatusAt>250){onView(next);lastStatusAt=stamp;}
      if(atlas.error)throw atlas.error;
    }
  }catch(e){onError(e);return;}raf=requestAnimationFrame(tick);}
  const readyPromise=Promise.all([json(`${ROOT}runtime-media.json?v=${encodeURIComponent(MIKA_RUNTIME_MEDIA_REVISION)}`,abort.signal),json(`${ROOT}still-layer-contract.json`,abort.signal),...stillIds.map(async id=>images.set(id,await image(`${ROOT}${id}.webp`)))]).then(([a,b])=>{
    if(disposed)return;if(a.manifestRevision!==MIKA_RUNTIME_MEDIA_REVISION||!a.renderBindings)throw Error('Mismatched Yard runtime media revision');media=a;stills=b;resize();ready=true;lastNow=now();raf=requestAnimationFrame(tick);
  }).catch(e=>{if(!disposed)onError(e);});
  return {ready:readyPromise,update,setGhost(value){ghost=value;},point(event){const r=canvas.getBoundingClientRect();return projection?.unproject({x:event.clientX-r.left,y:event.clientY-r.top});},
    hit(event){if(!view||!projection)return null;const r=canvas.getBoundingClientRect(),point={x:event.clientX-r.left,y:event.clientY-r.top};return view.props.filter(p=>p.supported).map(prop=>({prop,p:projection.project(prop.transform)})).filter(v=>Math.hypot(v.p.x-point.x,v.p.y-point.y)<28).sort((a,b)=>Math.hypot(a.p.x-point.x,a.p.y-point.y)-Math.hypot(b.p.x-point.x,b.p.y-point.y))[0]?.prop;},
    diagnostics(){return{ready,presentationTime:clock.read(),serverTime:snapshot?.yardRuntime?.serverNow,timing:timing.snapshot(),retainedPages:atlas.entries.size,pendingPages:atlas.pending.size,view,projection:projection?{width:projection.width,height:projection.height,ppu:projection.ppu}:null};},
    dispose(){disposed=true;abort.abort();cancelAnimationFrame(raf);observer.disconnect();atlas.dispose();images.clear();}
  };
}
