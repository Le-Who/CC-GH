/** Exact frozen r2 pixels, selected by the saved server plan. Does not open gates. */
import {createActorMediaEntry} from './actor-media.mjs';
import {atlasPageFor} from './atlas.mjs';
import {BASIS} from './projection.mjs';
import {createFamilyMedia} from '../../../game-logic/yard-v2/family-media.mjs';
import {FAMILY_ACTOR_PROFILES,FAMILY_ACTOR_REFERENCES} from '../../../game-logic/yard-v2/family-actor-profile.mjs';
import roots from '../../../game-logic/yard-v2/media/family-runtime-roots.json' with {type:'json'};
import {clone,digest} from '../../../game-logic/yard-v2/util.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createFamilyActorMediaEntry(actorId,manifest,{assetBaseURL,profiles}={}){
 const expected=FAMILY_ACTOR_PROFILES[actorId],reference=FAMILY_ACTOR_REFERENCES[actorId],profile=profiles?.[actorId],source=createFamilyMedia(actorId);
 if(!profile||profile.playbackReady!==true||!same({...profile,playbackReady:false},{...expected,playbackReady:false}))throw Error('Registered exact family source profile required');
 const unsealed=clone(manifest);delete unsealed.manifestRevision;
 if(manifest?.format!=='yard-family-runtime/v1'||manifest.runtimeActivated!==false||manifest.playbackReady!==false||manifest.manifestRevision!==digest(unsealed)||!same(manifest.actorProfile,reference)||!same(manifest.roots,roots.roots))throw Error('Frozen content-addressed family manifest required');
 for(const b of source.mediaRegistry.bindings){const local=manifest.renderBindings?.[b.id];if(!local||local.bindingRevision!==b.revision||local.bindingCalibrationHash!==b.calibrationHash||local.groundFootprintRevision!==profile.ground.revision||!same(local.conditionContract,b.conditionContract))throw Error('Exact server condition/binding calibration required');}
 const rootURL=new URL(assetBaseURL),assetRoots=Object.fromEntries(Object.entries(roots.roots).map(([id,r])=>[id,{assetBaseURL:new URL(r.path,rootURL.origin).href,assetRevision:r.assetRevision}]));
 const entry=createActorMediaEntry(manifest,{reference,assetBaseURL,clips:source.clips,profiles});
 // Family-only media roots preserve the published adapter bytes and all old
 // actor identities. Every physical page uses its frozen content root digest.
 const scoped=collection=>Object.fromEntries(Object.entries(collection||{}).map(([id,c])=>{
  const root=assetRoots[c.assetRoot];
  if(!root||!/^https?:$/.test(new URL(root.assetBaseURL).protocol)||!root.assetBaseURL.endsWith('/')||!/^https?:$/.test(rootURL.protocol)||!/^[a-f0-9]{64}$/.test(root.assetRevision))throw Error('Verified absolute content-digest media root required');
  return[id,{...c,assetBaseURL:root.assetBaseURL,assetRevision:root.assetRevision}];}));
 entry.manifest={...entry.manifest,clips:scoped(entry.manifest.clips),walk:{...entry.manifest.walk,facings:scoped(entry.manifest.walk.facings)},turns:scoped(entry.manifest.turns),extraSourceClips:scoped(manifest.extraSourceClips)};
 const all=[...Object.values(entry.manifest.clips),...Object.values(entry.manifest.walk.facings),...Object.values(entry.manifest.turns),...Object.values(manifest.extraSourceClips||{})];
 for(const c of all){
  if(c.sourceSampleMs!==40||c.fps!==25||c.runtimeSpriteRotationAllowed!==false)throw Error('Frozen 25Hz source without sprite flips required');
  let cursor=0;for(const p of c.pages){const capacity=p.cols*(p.height/p.tileHeight);if(!Number.isInteger(capacity)||p.first!==cursor||!Number.isInteger(p.count)||p.count<1||p.count>16||!Number.isInteger(p.offset||0)||(p.offset||0)<0||(p.offset||0)+p.count>capacity||p.width!==p.cols*p.tileWidth||p.width*p.height*4>8*1024*1024||!/^[a-f0-9]{64}$/.test(p.sha256))throw Error('Complete bounded offset-aware frozen atlas pages required');cursor+=p.count;}if(cursor!==c.frameCount)throw Error('Complete source frame coverage required');
 }
 for(const c of Object.values(entry.manifest.walk.facings))if(c.sourceRootNormalizedIn3D!==true)throw Error('Authored walking root normalization required');
 for(const [id,c]of Object.entries(source.clips)){
  const pixels=entry.manifest.clips[id];if(!pixels||pixels.condition!==c.conditions[0]||pixels.durationMs!==c.durationMs||pixels.sourceRigSha256!==c.sourceRigSha256||pixels.frameCount!==c.samples.length)throw Error('Exact source-condition pixels required');
  if(c.samples.some((r,i)=>pixels.sourceRootWorld&&r.root.some((n,k)=>Math.abs(n-pixels.sourceRootWorld[i][k])>1e-6)))throw Error('Frozen source root rows changed');
 }
 entry.stills=Object.fromEntries(Object.entries(manifest.stills).map(([id,s])=>{const root=assetRoots[s.assetRoot];if(!root||!s.providerIndependentPixels||!s.canvas?.every(n=>Number.isInteger(n)&&n>0)||s.decodedBytes!==s.canvas[0]*s.canvas[1]*4||!/^[a-f0-9]{64}$/.test(s.sha256))throw Error('Verified intrinsic condition still required');return[id,{...s,assetURL:new URL(s.src,root.assetBaseURL).href,assetRevision:root.assetRevision}];}));
 for(const c of Object.values(entry.manifest.clips)){
  const still=Object.values(entry.stills).find(s=>s.condition===c.condition),propRoot=source.clips[c.id].propRoot;
  const pivot=[c.pivotPx[0]+c.pixelsPerWorld*BASIS.right.reduce((s,n,i)=>s+n*propRoot[i],0),c.pivotPx[1]+c.pixelsPerWorld*BASIS.down.reduce((s,n,i)=>s+n*propRoot[i],0)];
  if(!still||still.goodieId!==source.clips[c.id].goodieId||still.worldPixelScale!==c.pixelsPerWorld||still.pivotPx.some((n,i)=>Math.abs(n-pivot[i])>1e-5))throw Error('Exact static/combined prop origin required');
 }
 const stillFor=condition=>Object.keys(entry.stills).find(id=>entry.stills[id].condition===condition);
 function select(plan,at){const owner=source.sources[plan.clipId];if(!owner)return null;const pose=owner.sample(plan,at);if(!pose)return null;const c=pose.phase==='active-clip'?entry.manifest.clips[plan.clipId]:pose.motion?.kind==='turn'?entry.manifest.turns[`${pose.motion.fromFacing}:${pose.motion.direction}:${pose.motion.angleSteps}`]:entry.manifest.walk.facings[pose.motion?.facing],index=pose.phase==='active-clip'?pose.frameIndex:pose.motion?.frameIndex;if(!c||!Number.isInteger(index)||index<0||index>=c.frameCount)throw Error('Exact family frame unavailable');return{pose,clip:c,index};}
 function requests(plan,at){const current=select(plan,at);if(!current)return{required:[],lookahead:[]};const key=v=>`${v.clip.assetBaseURL}:${v.clip.assetRevision}:${atlasPageFor(v.clip,v.index).page.src}`,first=key(current);let next=null;for(let n=1;n<=33;n++){const v=select(plan,at+n*40);if(!v)break;if(key(v)!==first){next=v;break;}}return{required:[{clip:current.clip,index:current.index}],lookahead:next?[{clip:next.clip,index:next.index}]:[]};}
 const goodieId=Object.values(source.clips)[0].goodieId,validPlacement=p=>p?.goodieId===goodieId&&!!stillFor(p.condition)&&(p.rotationZ??0)===0;
 entry.propBindings={[goodieId]:{stillId:stillFor('new'),stillFor:p=>stillFor(p.condition),conditionPixels:true,footprint:source.scene.footprints[goodieId],validPlacement}};
 entry.presentation={scheduleVersion:'source-owned-composite/v1',requests,
  targetStillId:(plan,p,at)=>stillFor(at<plan.propReleaseAt?plan.conditionReceipt.conditionAfter:p.condition),
  validTarget:(plan,p,at)=>validPlacement(p)&&p.x===plan.initialPlacement.x&&p.y===plan.initialPlacement.y&&(at>=plan.propReleaseAt||p.condition===plan.conditionReceipt.conditionAfter),
  propTransform:plan=>({...plan.initialPlacement,compression:1}),
  sample(plan,at,identity){const selected=select(plan,at);if(!selected)return null;const pose=selected.pose,seg=plan.schedule.segments.find(s=>at>=s.startAt&&at<s.endAt),route=seg?.route;let groundDistance=0;
   if(route){const elapsed=at-seg.startAt,leg=route.legs.find(l=>elapsed<l.endMs)||route.legs.at(-1);for(const l of route.legs){if(l===leg)break;if(l.kind!=='turn')groundDistance+=Math.hypot(l.to.x-l.from.x,l.to.y-l.from.y);}if(leg?.kind!=='turn'){const dx=leg.to.x-leg.from.x,dy=leg.to.y-leg.from.y,len=Math.hypot(dx,dy);if(len)groundDistance+=((pose.position.x-leg.from.x)*dx+(pose.position.y-leg.from.y)*dy)/len;}}
   return{...pose,visitId:identity.visitId,visitorId:profile.visitorId,slotId:plan.slotId,reserved:at<plan.propReleaseAt,...(route?{route,groundDistance}:{})};}};
 return entry;
}
