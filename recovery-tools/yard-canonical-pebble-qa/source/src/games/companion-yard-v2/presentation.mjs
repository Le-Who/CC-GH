import { sampleStay, propTransformAt } from '../../../game-logic/yard-v2/media/stay-schedule.mjs';
import { footprint, overlaps, validateLayout } from '../../../game-logic/yard-v2/geometry.mjs';
import { MIKA_SCENE } from '../../../game-logic/yard-v2/mika-media.mjs';
import { YARD_VISITORS } from '../../../game-logic/yard-catalog.js';
import { contractOnlyMikaEntry,resolveVisitActorMedia } from './actor-media.mjs';
import { YARD_ACTOR_PROFILES } from '../../../game-logic/yard-v2/released-actor-profiles.mjs';
import {YARD_PROP_PROFILES,YARD_RELEASED_SCENE} from '../../../game-logic/yard-v2/released-prop-profiles.mjs';

export const SUPPORTED_PROPS = Object.freeze(Object.keys(YARD_PROP_PROFILES));
export function courtyardPresentation(snapshot, now, clips,{mediaRevisions,actorEntries=contractOnlyMikaEntry(clips),actorProfiles=YARD_ACTOR_PROFILES}={}) {
  const yard = snapshot?.yard || {}, runtime = snapshot?.yardRuntime;
  const pets = [], legacy = [], plans = {},actorsByVisit={};
  const recovered = runtime?.display?.placements || [];
  const resolvedPlacement=raw=>{
    const mapped=recovered.find(p=>p.slotId===raw?.slotId||p.placement?.slotId===raw?.slotId);
    return Number.isFinite(raw?.x)&&Number.isFinite(raw?.y)?raw:mapped?.displayPlacement;
  };
  for (const record of runtime?.visits || []) {
    const plan = record.mediaAdmission?.plan;
    const actor=resolveVisitActorMedia(record,actorEntries,actorProfiles);
    const revisions=actor?.manifest?.renderBindings||mediaRevisions;
    const local=revisions?.[record.mediaAdmission?.bindingId];
    const localCompatible=!revisions||(local&&local.bindingRevision===record.mediaAdmission?.bindingRevision
      &&local.bindingCalibrationHash===record.mediaAdmission?.bindingCalibrationHash
      &&local.groundFootprintRevision===plan?.groundFootprintRevision);
    const targets=(yard.placedGoodies||[]).filter(p=>p.slotId===record.slotId);
    const sourceCompatible=!actor?.presentation||(actor.presentation.scheduleVersion===plan?.schedule?.version
      &&targets.length===1&&actor.presentation.validTarget(plan,resolvedPlacement(targets[0])));
    if (!actor || !plan?.schedule || record.renderCompatible !== true || !localCompatible || !sourceCompatible) {
      legacy.push({ ...record, presentationStatus: record.presentationStatus || 'preserved-legacy-visit' });
      continue;
    }
    plans[record.visitId] = plan;
    actorsByVisit[record.visitId]=actor;
    const pet = actor.presentation?actor.presentation.sample(plan,now,record):sampleStay(plan, now, record,{actorProfile:actor.profile});
    if (pet) pets.push({...pet,actorProfile:{...actor.reference}});
  }
  const propBindings=Object.assign({},...Object.values(actorEntries).map(e=>e.propBindings||{}));
  const props = (yard.placedGoodies || []).flatMap(raw => {
    const placement = resolvedPlacement(raw);
    if (!placement || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)) return [];
    const active = (runtime?.visits || []).find(r => r.slotId === raw.slotId && now < r.releaseAt);
    const plan = active?.renderCompatible === true && plans[active.visitId] ? active.mediaAdmission?.plan : null;
    const owner = pets.find(p => p.propOwnerSlotId === raw.slotId);
    const actor=active&&actorsByVisit[active.visitId],contract=actor?.clips?.[plan?.clipId];
    const transform = plan && contract ? actor.presentation?actor.presentation.propTransform(plan,now):propTransformAt(plan, contract, now,{actorProfile:actor.profile})
      : { ...placement, rotationZ: placement.rotationZ || 0, compression: 1 };
    const sourceVisit=(runtime?.visits||[]).find(r=>r.slotId===raw.slotId&&now>=r.arrivedAt&&now<r.leavesAt&&plans[r.visitId]
      &&actorsByVisit[r.visitId]?.presentation?.targetStillId);
    const localProp=propBindings[raw.goodieId],ownPropReady=!!localProp&&localProp.validPlacement(placement);
    const stillId=sourceVisit?actorsByVisit[sourceVisit.visitId].presentation.targetStillId:ownPropReady?localProp.stillId:null;
    const readiness=runtime?.placementReadiness?.find(r=>r.slotId===raw.slotId)||null;
    return [{ ...raw, transform, supported: SUPPORTED_PROPS.includes(raw.goodieId)||ownPropReady,readiness,
      reserved: !!active, drawStandalone: !owner, visualOwner: owner?.visitId || 'standalone',...(stillId?{stillId}:{}) }];
  });
  return { pets, props, legacy, plans, runtime, yard, now,
    pendingGifts: yard.pendingGifts || [], bowls: yard.bowls || [],
    currencies: yard.currencies || {}, foodInventory: yard.foodInventory || {},
    issues: runtime?.display?.issues || [], mutable: runtime?.mutable === true };
}

/** Browser hint only. The server independently checks the same geometry before spending. */
export function checkPlacement(snapshot, candidate, { placing = false, now = snapshot?.yardRuntime?.serverNow || 0, propBindings=YARD_PROP_PROFILES, scene=YARD_RELEASED_SCENE } = {}) {
  if (!snapshot?.yardRuntime?.mutable) return { ok: false, errors: [{ code: 'YARD_READ_ONLY' }] };
  if (!Object.hasOwn(propBindings,candidate.goodieId)) return { ok: false, errors: [{ code: 'MEDIA_UNAVAILABLE' }] };
  const rows = snapshot.yard.placedGoodies || [];
  const existing = rows.find(p => p.slotId === candidate.slotId);
  if (!placing && !existing) return { ok: false, errors: [{ code: 'PLACEMENT_NOT_FOUND' }] };
  const visits = snapshot.yardRuntime.visits || [];
  if (visits.some(v => v.slotId === candidate.slotId && now < v.releaseAt)) return { ok: false, errors: [{ code: 'PROP_RESERVED' }] };
  const placements = placing ? [...rows, candidate] : rows.map(p => p.slotId === candidate.slotId ? { ...p, ...candidate } : p);
  const box = footprint(candidate, scene);
  for (const visit of visits) if (now < visit.leavesAt && (visit.mediaAdmission?.plan?.reservationBoxes || []).some(r => overlaps(r, box))) {
    return { ok: false, errors: [{ code: 'VISITOR_PATH_RESERVED' }] };
  }
  return validateLayout({ ...snapshot.yard, placedGoodies: placements }, scene);
}

export function visibleStatus(view,t=key=>key) {
  if (!view.mutable) return t('yard.persistent.status.readOnly');
  if (view.pendingGifts.length) return t('yard.persistent.status.gifts',{count:view.pendingGifts.length});
  if (view.legacy.length) return t('yard.persistent.status.legacy');
  if (view.pets.length) {
    const role=view.pets[0].role;
    const id=view.pets[0].visitorId,name=Object.hasOwn(YARD_VISITORS,id)?YARD_VISITORS[id].name:t('yard.visitor');
    return t(`yard.persistent.status.${['rest','settle','wake','play','roam','approach','depart'].includes(role)?role:'visiting'}`,{name});
  }
  if (view.issues.length) return t('yard.persistent.status.items');
  if (view.props.some(p=>p.readiness?.status==='reposition-needed')) return t('yard.persistent.status.path');
  if (view.yard.remodel && view.yard.remodel!=='meadow') return t('yard.persistent.status.remodel');
  if (view.props.some(p=>!p.supported)) return t('yard.persistent.status.unsupported');
  if (view.bowls.some(b => b.foodId && b.servings > 0)) return t('yard.persistent.status.food');
  return t('yard.persistent.status.empty');
}
