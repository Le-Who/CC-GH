/** Reusable source-owned entry; no source controls its own cache or release gate. */
import {createActorMediaEntry} from './actor-media.mjs';
import {atlasPageFor} from './atlas.mjs';
import {BASIS} from './projection.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createCompositeVisitorMediaEntry(manifest,{sourceServer,expectedProfile,reference,assetBaseURL,profiles,mediaRevision,stillId}={}){
 const source=sourceServer?.source,profile=profiles?.[reference?.id],binding=sourceServer?.mediaRegistry?.bindings?.[0],local=manifest?.renderBindings?.[binding?.id],clip=source?.clip;
 if(!profile||profile.playbackReady!==true||!same({...profile,playbackReady:false},{...expectedProfile,playbackReady:false}))throw Error('Registered exact source-owned visitor profile required');
 if(manifest?.format!=='yard-composite-visitor-runtime/v1'||manifest.manifestRevision!==mediaRevision||manifest.playbackReady!==binding?.playbackReady
  ||!same(manifest.actorProfile,reference)||manifest.sourceRigSha256!==clip?.sourceRigSha256||manifest.sourceMotionSha256!==clip?.sourceMotionSha256
  ||local?.bindingRevision!==binding?.revision||local?.bindingCalibrationHash!==binding?.calibrationHash||local?.groundFootprintRevision!==profile.ground.revision)throw Error('Visitor source, local media and server binding mismatch');
 const entry=createActorMediaEntry(manifest,{reference,assetBaseURL,clips:{[clip.id]:clip},profiles});
 const all=[...Object.values(entry.manifest.clips),...Object.values(entry.manifest.walk.facings),...Object.values(entry.manifest.turns)];
 for(const c of all){
  if(c.sourceSampleMs!==profile.sourceSampleMs||c.fps!==1000/profile.sourceSampleMs||c.pages.some(p=>p.count>16||p.width*p.height*4>8*1024*1024))throw Error('Visitor cadence or bounded page size mismatch');
  let cursor=0;for(const p of c.pages){if(p.first!==cursor||p.count<1||p.count>p.cols*Math.floor(p.height/p.tileHeight)||(p.offset||0)+p.count>p.cols*Math.floor(p.height/p.tileHeight))throw Error('Complete atlas page coverage required');cursor+=p.count;}if(cursor!==c.frameCount)throw Error('Incomplete source clip');
 }
 for(const c of Object.values(entry.manifest.walk.facings))if(c.sourceRootNormalizedIn3D!==true)throw Error('Walking pixels must normalize authored root in 3D');
 const active=entry.manifest.clips[clip.id],still=manifest.stills?.[stillId],pivot=[active.pivotPx[0]+active.pixelsPerWorld*BASIS.right.reduce((s,n,i)=>s+n*clip.propRoot[i],0),active.pivotPx[1]+active.pixelsPerWorld*BASIS.down.reduce((s,n,i)=>s+n*clip.propRoot[i],0)];
 if(still?.goodieId!==clip.goodieId||still.condition!=='new'||still.rotationZ!==0||still.labelsBaked!==false||still.worldPixelScale!==active.pixelsPerWorld||still.sourceRigSha256!==clip.sourceRigSha256||still.pivotPx?.length!==2||still.pivotPx.some((n,i)=>!Number.isFinite(n)||Math.abs(n-pivot[i])>1e-5))throw Error('Exact static target calibration required');
 entry.stills={[stillId]:{...still,assetURL:new URL(still.src,assetBaseURL).href}};
 function select(plan,at){
  const pose=source.sample(plan,at);if(!pose)return null;
  const media=entry.manifest,c=pose.phase==='active-clip'?media.clips[pose.clipId]:pose.motion?.kind==='turn'?media.turns[`${pose.motion.fromFacing}:${pose.motion.direction}:${pose.motion.angleSteps}`]:media.walk.facings[pose.motion?.facing];
  const index=pose.phase==='active-clip'?pose.frameIndex:pose.motion?.frameIndex;
  if(!c||!Number.isInteger(index)||index<0||index>=c.frameCount)throw Error('Exact visitor source frame unavailable');return{pose,clip:c,index};
 }
 function requests(plan,at){
  const current=select(plan,at);if(!current)return{required:[],lookahead:[]};
  const key=v=>`${v.clip.assetRevision}:${atlasPageFor(v.clip,v.index).page.src}`,currentKey=key(current);let next=null;
  // Page-aware lookahead is bounded by the declared page size and own cadence.
  // No assumed 50 ms or fixed 1100 ms step, and no independent cache owner.
  for(let i=1;i<=33;i++){const v=select(plan,at+i*profile.sourceSampleMs);if(!v)break;if(key(v)!==currentKey){next=v;break;}}
  return{required:[{clip:current.clip,index:current.index}],lookahead:next?[{clip:next.clip,index:next.index}]:[]};
 }
 const validPlacement=p=>p?.goodieId===clip.goodieId&&p.condition==='new'&&(p.rotationZ??0)===0;
 entry.propBindings={[clip.goodieId]:{stillId,footprint:source.scene.footprints[clip.goodieId],validPlacement}};
 entry.presentation={scheduleVersion:'source-owned-composite/v1',requests,targetStillId:stillId,
  validTarget:(plan,p)=>validPlacement(p)&&p.x===plan.initialPlacement.x&&p.y===plan.initialPlacement.y,
  propTransform:plan=>({...plan.initialPlacement,compression:1}),
  sample(plan,at,identity){const selected=select(plan,at);if(!selected)return null;const pose=selected.pose,seg=plan.schedule.segments.find(s=>at>=s.startAt&&at<s.endAt),route=seg?.route;let groundDistance=0;
   if(route){const elapsed=at-seg.startAt,leg=route.legs.find(l=>elapsed<l.endMs)||route.legs.at(-1);for(const l of route.legs){if(l===leg)break;if(l.kind!=='turn')groundDistance+=Math.hypot(l.to.x-l.from.x,l.to.y-l.from.y);}if(leg?.kind!=='turn'){const dx=leg.to.x-leg.from.x,dy=leg.to.y-leg.from.y,len=Math.hypot(dx,dy);if(len)groundDistance+=((pose.position.x-leg.from.x)*dx+(pose.position.y-leg.from.y)*dy)/len;}}
   return{...pose,visitId:identity.visitId,visitorId:profile.visitorId,slotId:plan.slotId,reserved:at<plan.propReleaseAt,...(route?{route,groundDistance}:{})};}};
 return entry;
}
