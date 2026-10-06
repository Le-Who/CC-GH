/** Persistent catalog clock foundation. No wall-clock acceleration, DOM or render callbacks.
 * This is not the browser animation adapter: descriptors declare exact media capabilities and gaps. */
import { advanceYard, visitPhase, isReserved } from './simulation.mjs';
import { dispatchInput } from './dispatch.mjs';
import { clone, digest, lookup, put, workingCopy } from './util.mjs';
import { resolveYardDisplay, resolveLegacyPresentation, legacyPlacementKey } from './legacy-presentation.mjs';
import { YARD_SLOT_LAYOUTS } from './catalog.mjs';
import { foodRefillPolicy } from './availability.mjs';
import { ACTOR_PROFILES,actorProfileReference,resolveBindingActorProfile,getBindingCalibrationHash } from './actor-profiles.mjs';
import { presentationCompatibility } from './presentation-compatibility.mjs';
export {getBindingCalibrationHash} from './actor-profiles.mjs';
export const ORCHESTRATION_REVISION = 'catalog-persistent/r1';
/** A binding may pin its own geometry/scene calibration independently of unrelated
 * registry entries. Absent metadata retains the strict legacy registry fallback. */
export function createAdmissionPolicy({mediaRegistry={revision:'none',bindings:[]},preflight,actorProfiles=ACTOR_PROFILES,
  allowUnprofiledTestBindings=false}={}) {
  return candidate => {
    if(typeof mediaRegistry.revision!=='string'||!mediaRegistry.revision||!Array.isArray(mediaRegistry.bindings))
      return{ok:false,code:'MEDIA_REGISTRY_VERSION_REQUIRED'};
    const food=foodRefillPolicy({foodId:candidate.bowl?.foodId,bowl:candidate.bowl,mediaRegistry});
    if(!food.ok)return{ok:false,code:food.reason};
    const matches=(mediaRegistry.bindings||[]).filter(b=>b.visitorId===candidate.visitor.id
      &&b.goodieId===candidate.goodie.id&&Array.isArray(b.activityIds)&&b.activityIds.includes(candidate.activity.id)
      &&(!b.conditions||b.conditions.includes(candidate.placement.condition||'new')));
    if(matches.length!==1)return{ok:false,code:matches.length?'AMBIGUOUS_MEDIA_BINDING':'UNSUPPORTED_VISIT_MEDIA'};
    const b=matches[0];
    const calibrationHash=getBindingCalibrationHash(b,mediaRegistry);
    if((Object.hasOwn(b,'calibrationHash')||Object.hasOwn(mediaRegistry,'calibrationHash'))&&!calibrationHash)
      return{ok:false,code:'MEDIA_CALIBRATION_HASH_REQUIRED'};
    if(b.playbackReady!==true||!b.requiredPhases?.length||!b.requiredPhases.every(p=>b.validatedPhases?.includes(p)))
      return{ok:false,code:'INTERACTION_MEDIA_NOT_READY'};
    const actor=resolveBindingActorProfile(b,actorProfiles);
    // Trusted source-economy fixtures may explicitly omit media profiles. This
    // option is never constructed from an action payload or HTTP request.
    if(!actor&&!allowUnprofiledTestBindings)return{ok:false,code:'ACTOR_PROFILE_UNAVAILABLE'};
    if(!['composited','separate'].includes(b.propMode)||typeof b.id!=='string'||!b.id||typeof b.revision!=='string'||!b.revision)return{ok:false,code:'MEDIA_OWNERSHIP_CONTRACT_REQUIRED'};
    // One visual owner of a composited prop. Capacity-two needs authored layering or joint choreography.
    if(candidate.reserved.some(r=>r.slotId===candidate.placement.slotId
      &&(b.propMode==='composited'||r.mediaAdmission?.propMode==='composited')))
      return{ok:false,code:'COMPOSITE_PROP_ALREADY_OWNED'};
    if(typeof preflight!=='function')return{ok:false,code:'CALIBRATED_PRESENTATION_PREFLIGHT_REQUIRED'};
    const result=preflight(clone(candidate),clone(b));
    if(result?.ok!==true||typeof result.then==='function')return{ok:false,code:result?.code||'PRESENTATION_PREFLIGHT_REJECTED'};
    return{ok:true,binding:{registryRevision:mediaRegistry.revision,registryHash:digest(mediaRegistry),
      bindingId:b.id,bindingRevision:b.revision,...(calibrationHash?{bindingCalibrationHash:calibrationHash}:{}),
      ...(actor?{actorProfile:actorProfileReference(actor)}:{}),
      visitorId:b.visitorId,goodieId:b.goodieId,activityId:candidate.activity.id,
      propMode:b.propMode,coverage:b.coverage||'authored-clip-only',plan:clone(result.plan??null)}};
  };
}
function captureLegacyAnchors(input) {
  const state=workingCopy(input),runtime=state.runtime;
  if(Object.hasOwn(runtime,'legacyPlacementAnchors') && (!runtime.legacyPlacementAnchors || runtime.legacyPlacementAnchors.format!=='yard-legacy-display-anchors/v1'
    || !runtime.legacyPlacementAnchors.items || typeof runtime.legacyPlacementAnchors.items!=='object' || Array.isArray(runtime.legacyPlacementAnchors.items)))
    throw new Error('PRESERVE_AND_REVIEW:UNSUPPORTED_LEGACY_ANCHOR_RECORD');
  runtime.legacyPlacementAnchors??={format:'yard-legacy-display-anchors/v1',items:{}};
  const level=state.player.yard.expansion?.level>=2?2:1;
  for(const row of state.player.yard.placedGoodies) {
    if(!row||Object.hasOwn(row,'x')||Object.hasOwn(row,'y'))continue;
    const key=legacyPlacementKey(row),slot=YARD_SLOT_LAYOUTS[level].find(s=>s.id===row.slotId);
    if(slot&&!Object.hasOwn(runtime.legacyPlacementAnchors.items,key))put(runtime.legacyPlacementAnchors.items,key,{
      x:slot.x,y:slot.y,slotId:slot.id,goodieId:row.goodieId,sourceExpansionLevel:level,source:'baseline-slot-display-only'});
  }
  return state;
}
export function resolvePersistentDisplay(state,{scene,yardOverride}={}) {
  return resolveYardDisplay(yardOverride||state.player.yard,{scene,legacyAnchors:state.runtime.legacyPlacementAnchors});
}
export function persistentOptions(options={}, state) {
  return {...options,projectYard:(yard,{scene}={})=>resolveYardDisplay(yard,{scene,legacyAnchors:state?.runtime.legacyPlacementAnchors}),
    admissionPolicy:createAdmissionPolicy(options),
    // Rebuild from the effective registry, including trusted server test overrides.
    autoRefillPolicy:candidate=>foodRefillPolicy({...candidate,mediaRegistry:options.mediaRegistry})};
}
export function advancePersistentYard(input, now, options={}) {
  const dispatched=dispatchInput(input,{now,seed:options.seed});
  if(dispatched.status!==200)throw new Error(`PRESERVE_AND_REVIEW:${dispatched.reason}`);
  const prepared=captureLegacyAnchors(dispatched.state);
  // No single episode sentinel. Every hour remains eligible, with the same deterministic cursor after reload.
  return advanceYard(prepared,now,persistentOptions(options,prepared));
}
export function inspectPersistentYard(state,{now=state.runtime.cursorMs,scene,mediaRegistry,actorProfiles=ACTOR_PROFILES}={}) {
  const display=resolvePersistentDisplay(state,{scene});
  const visits=Object.values(state.runtime.visits).map(record=>{
    if(record.source==='legacy'||!record.timeline)return resolveLegacyPresentation(record,state,{now,scene,legacyAnchors:state.runtime.legacyPlacementAnchors});
    const media=record.mediaAdmission;
    const compatibility=presentationCompatibility(record,mediaRegistry,digest(mediaRegistry||null),actorProfiles);
    const compatible=compatibility.renderCompatible;
    return{visitId:record.visitId,visitorId:record.original.visitorId,status:record.status,
      phase:visitPhase(record,now),reserved:isReserved(record,now),root:null,
      ...compatibility,presentationStatus:record.status!=='active'?'history':compatibility.presentationStatus,
      animation:null,media:clone(media),timeline:clone(record.timeline),
      gap:compatible?'Browser adapter must schedule full economic stay and endpoint handoff; this foundation does not claim it is rendered':null};
  });
  return{revision:ORCHESTRATION_REVISION,at:now,display,visits,
    blockedAdmissions:state.runtime.events.filter(e=>e.type==='admission-blocked-media').map(clone)};
}
/** Continue large catch-up in exact chronological chunks. No elapsed time is silently dropped. */
export function advancePersistentChunk(input,targetNow,{maxHours=24,...options}={}) {
  if(!Number.isSafeInteger(maxHours)||maxHours<1||maxHours>720)throw new RangeError('maxHours must be 1..720');
  if(!Number.isSafeInteger(targetNow)||targetNow<input.runtime.cursorMs)throw new RangeError('targetNow cannot rewind');
  const through=Math.min(targetNow,input.runtime.cursorMs+maxHours*3600000);
  const state=advancePersistentYard(input,through,options);
  return{state,through,targetNow,done:through===targetNow};
}
