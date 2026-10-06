/** Exact source/profile/pixel binding. Default profile resolution stays closed. */
import {createActorMediaEntry} from './actor-media.mjs';
import {YARD_ACTOR_PROFILES} from '../../../game-logic/yard-v2/released-actor-profiles.mjs';
import {createPipMedia} from '../../../game-logic/yard-v2/pip-media.mjs';
import {PIP_PROP_PROFILE} from '../../../game-logic/yard-v2/pip-prop-profile.mjs';
import {PIP_ACTOR_PROFILE,PIP_ACTOR_REFERENCE,PIP_MEDIA_REVISION} from '../../../game-logic/yard-v2/pip-actor-profile.mjs';
import {createPipCandidatePresenter} from './pip-candidate-presentation.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createPipActorMediaEntry(manifest,{source=createPipMedia().source,assetBaseURL,profiles=YARD_ACTOR_PROFILES}={}){
 const p=profiles.pip,b=source?.binding,local=manifest?.renderBindings?.[b?.id];
 if(!p||!same({...p,playbackReady:false},{...PIP_ACTOR_PROFILE,playbackReady:false})||p.playbackReady!==true)throw Error('Registered exact Pip source profile required');
 if(manifest?.manifestRevision!==PIP_MEDIA_REVISION||manifest?.format!=='yard-pip-snack-candidate-runtime/v1'||manifest.playbackReady!==false||manifest.runtimeActivated!==false||!same(manifest.actorProfile,PIP_ACTOR_REFERENCE)||local?.bindingRevision!==b.revision||local.bindingCalibrationHash!==b.calibrationHash||local.groundFootprintRevision!==PIP_ACTOR_PROFILE.ground.revision)throw Error('Pip source/local identity mismatch');
 const entry=createActorMediaEntry(manifest,{reference:PIP_ACTOR_REFERENCE,assetBaseURL,clips:{[source.clip.id]:source.clip},profiles});
 for(const clip of [...Object.values(entry.manifest.clips),...Object.values(entry.manifest.walk.facings),...Object.values(entry.manifest.turns)]){
  if(clip.sourceSampleMs!==40||clip.fps!==25||clip.pages.some(page=>page.count>16||page.width*page.height*4>7077888))throw Error('Pip cadence/page budget mismatch');
 }
 for(const clip of Object.values(entry.manifest.walk.facings))if(clip.sourceRootNormalizedIn3D!==true)throw Error('Pip route pixels must use the normalized source root');
 const still=manifest.stills?.['pip:target-snack-table'];
 if(still?.goodieId!=='snack_table'||still.condition!=='new'||still.labelsBaked!==false||still.worldPixelScale!==80||still.sourceRigSha256!==source.clip.sourceRigSha256)throw Error('Pip exact target still required');
 entry.stills={'pip:target-snack-table':{...still,assetURL:new URL(still.src,assetBaseURL).href}};
 entry.presenter=createPipCandidatePresenter({source,entry});
 entry.propBindings={snack_table:{...PIP_PROP_PROFILE,validPlacement:p=>p?.goodieId==='snack_table'&&p.condition==='new'&&(p.rotationZ??0)===0}};
 entry.groundShadow={radiusX:.09,radiusY:.04,opacity:.25};
 entry.presentation=Object.freeze({scheduleVersion:'pip-snack-persistent/v1',sample(plan,at,identity){const selected=entry.presenter.select(plan,at);if(!selected.pose)return null;
 const pose=selected.pose,seg=plan.schedule.segments.find(s=>at>=s.startAt&&at<s.endAt),route=seg?.route;let groundDistance=0;
 if(route){const elapsed=at-seg.startAt,leg=route.legs.find(l=>elapsed<l.endMs)||route.legs.at(-1);for(const l of route.legs){if(l===leg)break;if(l.kind!=='turn')groundDistance+=Math.hypot(l.to.x-l.from.x,l.to.y-l.from.y);}if(leg?.kind!=='turn'){const dx=leg.to.x-leg.from.x,dy=leg.to.y-leg.from.y,len=Math.hypot(dx,dy);if(len)groundDistance+=((pose.position.x-leg.from.x)*dx+(pose.position.y-leg.from.y)*dy)/len;}}
 return{...pose,visitId:identity.visitId,visitorId:'pip_hamster',slotId:plan.slotId,reserved:at<plan.propReleaseAt,...(route?{route,groundDistance}:{})};},validTarget:(plan,p)=>p?.goodieId==='snack_table'&&p.condition==='new'&&p.x===plan.initialPlacement.x&&p.y===plan.initialPlacement.y&&(p.rotationZ??0)===0,targetStillId:'pip:target-snack-table',propTransform:plan=>({...plan.initialPlacement,compression:1}),requests:entry.presenter.requests});
 return entry;
}
