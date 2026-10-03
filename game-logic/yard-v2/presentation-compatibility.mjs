/** Read-only compatibility. Stored routes/times and economic outcomes are never repaired here. */
import {propObstacleReceiptCompatible} from './prop-obstacles.mjs';
import { ACTOR_PROFILES,actorProfileReference,resolveVisitActorProfile,getBindingCalibrationHash } from './actor-profiles.mjs';
export function presentationCompatibility(record,registry,registryHash,actorProfiles=ACTOR_PROFILES) {
  const media=record.mediaAdmission,plan=media?.plan,issues=[];
  if(record.source==='legacy'||!plan?.schedule)return{renderCompatible:false,
    presentationStatus:'preserved-legacy-visit',presentationIssues:['AUTHORED_PRESENTATION_UNAVAILABLE']};
  if(!propObstacleReceiptCompatible(plan,registry))issues.push('PROP_OBSTACLE_SOURCE_MISMATCH');
  const matches=(registry?.bindings||[]).filter(b=>b.id===media.bindingId);
  const binding=matches.length===1?matches[0]:null;
  const actor=resolveVisitActorProfile(record,binding,actorProfiles);
  if(!actor)issues.push('ACTOR_PROFILE_UNAVAILABLE');
  if(!actor||plan.groundFootprintRevision!==actor.ground.revision)issues.push('GROUND_FOOTPRINT_REVISION_MISMATCH');
  if(Object.hasOwn(media,'bindingCalibrationHash')) {
    const expected=getBindingCalibrationHash(binding,registry);
    if(!expected||typeof media.bindingCalibrationHash!=='string'||!media.bindingCalibrationHash
      ||media.bindingCalibrationHash!==expected)issues.push('MEDIA_CALIBRATION_MISMATCH');
  } else if(media.registryRevision!==registry?.revision||media.registryHash!==registryHash) {
    issues.push('MEDIA_CALIBRATION_MISMATCH');
  }
  if(!binding||binding.revision!==media.bindingRevision||binding.visitorId!==record.original?.visitorId
    ||binding.goodieId!==record.placement?.goodieId||!binding.activityIds?.includes(record.activityId))
    issues.push('MEDIA_BINDING_REVISION_MISMATCH');
  if(!binding||binding.playbackReady!==true||!binding.requiredPhases?.length
    ||!binding.requiredPhases.every(phase=>binding.validatedPhases?.includes(phase)))issues.push('INTERACTION_MEDIA_NOT_READY');
  return{renderCompatible:issues.length===0,
    ...(issues.length===0?{resolvedActorProfile:actorProfileReference(actor)}:{}),
    presentationStatus:issues.length?'preserved-presentation-unavailable':'calibrated-plan-available',presentationIssues:issues};
}
