/** Read-only compatibility. Stored routes/times and economic outcomes are never repaired here. */
import {propObstacleReceiptCompatible} from './prop-obstacles.mjs';
import { ACTOR_PROFILES,actorProfileReference,resolveVisitActorProfile,getBindingCalibrationHash } from './actor-profiles.mjs';
import {YARD_GOODIES} from './catalog.mjs';
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
  if(binding?.conditionContract){
    const r=plan.conditionReceipt,d=YARD_GOODIES[binding.goodieId]?.durability,condition=n=>n>=d*2?'broken':n>=d?'worn':'new',source=binding.conditionContract[r?.conditionAfter];
    if(r?.version!=='saved-admission-use/v1'||!Number.isSafeInteger(r.usesBefore)||r.usesBefore<0||!Number.isSafeInteger(r.usesAfter)||r.usesAfter!==r.usesBefore+1
      ||r.usesBefore!==(record.placement?.uses??0)||r.conditionBefore!==record.placement?.condition||r.conditionBefore!==condition(r.usesBefore)||r.conditionAfter!==condition(r.usesAfter)
      ||!binding.conditions.includes(r.conditionBefore)||!source||r.sourceClipId!==source.clipId||plan.clipId!==source.clipId||plan.calibrationHash!==source.sourceCalibrationHash
      ||plan.bindingCalibrationHash!==binding.calibrationHash||plan.initialPlacement?.condition!==r.conditionAfter||plan.initialPlacement?.uses!==r.usesAfter)issues.push('SAVED_SOURCE_CONDITION_MISMATCH');
  }
  return{renderCompatible:issues.length===0,
    ...(issues.length===0?{resolvedActorProfile:actorProfileReference(actor)}:{}),
    presentationStatus:issues.length?'preserved-presentation-unavailable':'calibrated-plan-available',presentationIssues:issues};
}
