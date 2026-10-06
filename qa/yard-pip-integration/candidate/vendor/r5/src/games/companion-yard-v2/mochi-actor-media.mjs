/** Canonical shared-scene entry. Unregistered/default profiles cannot load it.
 * Acceptance fixtures explicitly supply their own trusted profile registry. */
import {resolveActorProfile,actorProfileReference} from '../../../game-logic/yard-v2/actor-profiles.mjs';
import {YARD_ACTOR_PROFILES} from '../../../game-logic/yard-v2/released-actor-profiles.mjs';
import {MOCHI_ACTOR_REFERENCE,MOCHI_ACTOR_PROFILE} from '../../../game-logic/yard-v2/mochi-actor-profile.mjs';
import {MOCHI_ACTOR_ASSETS} from '../../../game-logic/yard-v2/media/mochi-actor-assets.mjs';
import {createMochiMedia,MOCHI_MEDIA_REVISION} from '../../../game-logic/yard-v2/mochi-media.mjs';
import {clone,deepFreeze} from '../../../game-logic/yard-v2/util.mjs';
import {createMochiCandidatePresenter} from './mochi-candidate-presentation.mjs';
import {BASIS} from './projection.mjs';

export function createMochiActorMediaEntry(manifest,{assetBaseURL,profiles=YARD_ACTOR_PROFILES}={}){
 const profile=resolveActorProfile(MOCHI_ACTOR_REFERENCE,profiles),sourceServer=createMochiMedia(),binding=sourceServer.mediaRegistry.bindings[0];
 if(!profile||profile.visitorId!==MOCHI_ACTOR_PROFILE.visitorId||JSON.stringify({...profile,playbackReady:false})!==JSON.stringify({...MOCHI_ACTOR_PROFILE,playbackReady:false}))
  throw Error('Registered exact Mochi source profile required');
 const local=manifest?.renderBindings?.[binding.id];
 if(manifest?.format!=='yard-mochi-canonical-runtime/v1'||manifest.manifestRevision!==MOCHI_MEDIA_REVISION||manifest.playbackReady!==binding.playbackReady
  ||manifest.actorProfile?.id!==profile.id||manifest.actorProfile?.revision!==profile.revision
  ||local?.bindingRevision!==binding.revision||local?.bindingCalibrationHash!==binding.calibrationHash
  ||local?.groundFootprintRevision!==profile.ground.revision)throw Error('Mochi local/server source mismatch');
 const base=new URL(assetBaseURL).href,{combined:clip,stride:strideContract,ground:motionContract}=MOCHI_ACTOR_ASSETS;
 const presenter=createMochiCandidatePresenter({binding:sourceServer.source,combinedMedia:manifest.sourceMedia.combined,
  cardinalMedia:manifest.sourceMedia.cardinal,strideContract,motionContract,
  combinedBaseURL:new URL('combined/',base).href,cardinalBaseURL:new URL('cardinal/',base).href});
 function sample(plan,at,identity){
  const s=presenter.select(plan,at);if(!s.pose)return null;
  const pose=s.pose,segment=plan.schedule.segments.find(s=>at>=s.startAt&&at<s.endAt),route=segment?.route;
  let groundDistance=0;
  if(route){const t=at-segment.startAt,leg=route.legs.find(l=>t<l.endMs)||route.legs.at(-1);
   for(const l of route.legs){if(l===leg)break;if(l.kind!=='turn')groundDistance+=Math.hypot(l.to.x-l.from.x,l.to.y-l.from.y);}
   if(leg?.kind!=='turn'){const dx=leg.to.x-leg.from.x,dy=leg.to.y-leg.from.y,length=Math.hypot(dx,dy);if(length)groundDistance+=((pose.position.x-leg.from.x)*dx+(pose.position.y-leg.from.y)*dy)/length;}
  }
  return{...pose,visitId:identity.visitId,visitorId:profile.visitorId,slotId:plan.slotId,
   reserved:at<plan.propReleaseAt,...(route?{route,groundDistance}:{})};
 }
 function validTarget(plan,placement){return placement?.goodieId==='yarn_mouse'&&placement.condition==='new'
  &&placement.x===plan.initialPlacement.x&&placement.y===plan.initialPlacement.y
  &&(placement.rotationZ??0)===(plan.initialPlacement.rotationZ??0);}
 const still=manifest.stills?.['mochi:target-yarn-mouse'];
 const expectedPivot=[presenter.active.pivotPx[0]+50*BASIS.right.reduce((s,n,i)=>s+n*clip.propRoot[i],0),presenter.active.pivotPx[1]+50*BASIS.down.reduce((s,n,i)=>s+n*clip.propRoot[i],0)];
 if(still?.goodieId!=='yarn_mouse'||still.condition!=='new'||still.rotationZ!==0||still.worldPixelScale!==50||still.labelsBaked!==false
  ||still.src!=='target-prop-still.webp'||still.pivotPx?.length!==2||!still.pivotPx.every((n,i)=>Number.isFinite(n)&&Math.abs(n-expectedPivot[i])<1e-8))throw Error('Mochi target still calibration required');
 return {reference:actorProfileReference(profile),profile,assetBaseURL:base,clips:{[clip.id]:clip},
  manifest:deepFreeze({manifestRevision:manifest.manifestRevision,renderBindings:clone(manifest.renderBindings),clips:{[clip.id]:presenter.active},
   walk:{stride:profile.locomotion.strideWorld,cycleSeconds:profile.locomotion.cycleMs/1000,facings:presenter.walk},turns:presenter.turns}),
  stills:deepFreeze({'mochi:target-yarn-mouse':{...clone(still),assetURL:new URL(still.src,base).href}}),
  presentation:Object.freeze({scheduleVersion:'mochi-anchored-composite/v1',sample,validTarget,
   targetStillId:'mochi:target-yarn-mouse',propTransform:plan=>({x:plan.initialPlacement.x,y:plan.initialPlacement.y,rotationZ:0,compression:1})})};
}
