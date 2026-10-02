import { sampleStay, propTransformAt } from '../../../game-logic/yard-v2/media/stay-schedule.mjs';
import { footprint, overlaps, validateLayout } from '../../../game-logic/yard-v2/geometry.mjs';
import { MIKA_SCENE } from '../../../game-logic/yard-v2/mika-media.mjs';

export const SUPPORTED_PROPS = Object.freeze(['yarn_mouse', 'sun_cushion']);
export function courtyardPresentation(snapshot, now, clips,{mediaRevisions}={}) {
  const yard = snapshot?.yard || {}, runtime = snapshot?.yardRuntime;
  const pets = [], legacy = [], plans = {};
  for (const record of runtime?.visits || []) {
    const plan = record.mediaAdmission?.plan;
    const local=mediaRevisions?.[record.mediaAdmission?.bindingId];
    const localCompatible=!mediaRevisions||(local&&local.bindingRevision===record.mediaAdmission?.bindingRevision
      &&local.bindingCalibrationHash===record.mediaAdmission?.bindingCalibrationHash
      &&local.groundFootprintRevision===plan?.groundFootprintRevision);
    if (record.visitorId !== 'mika_cat' || !plan?.schedule || record.renderCompatible !== true || !localCompatible) {
      legacy.push({ ...record, presentationStatus: record.presentationStatus || 'preserved-legacy-visit' });
      continue;
    }
    plans[record.visitId] = plan;
    const pet = sampleStay(plan, now, record);
    if (pet) pets.push(pet);
  }
  const recovered = runtime?.display?.placements || [];
  const props = (yard.placedGoodies || []).flatMap(raw => {
    const mapped = recovered.find(p => p.slotId === raw.slotId || p.placement?.slotId === raw.slotId);
    const placement = Number.isFinite(raw.x) && Number.isFinite(raw.y) ? raw : mapped?.displayPlacement;
    if (!placement || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)) return [];
    const active = (runtime?.visits || []).find(r => r.slotId === raw.slotId && now < r.releaseAt);
    const plan = active?.renderCompatible === true && plans[active.visitId] ? active.mediaAdmission?.plan : null;
    const owner = pets.find(p => p.propOwnerSlotId === raw.slotId);
    const transform = plan && clips[plan.clipId] ? propTransformAt(plan, clips[plan.clipId], now)
      : { ...placement, rotationZ: placement.rotationZ || 0, compression: 1 };
    const readiness=runtime?.placementReadiness?.find(r=>r.slotId===raw.slotId)||null;
    return [{ ...raw, transform, supported: SUPPORTED_PROPS.includes(raw.goodieId),readiness,
      reserved: !!active, drawStandalone: !owner, visualOwner: owner?.visitId || 'standalone' }];
  });
  return { pets, props, legacy, plans, runtime, yard, now,
    pendingGifts: yard.pendingGifts || [], bowls: yard.bowls || [],
    currencies: yard.currencies || {}, foodInventory: yard.foodInventory || {},
    issues: runtime?.display?.issues || [], mutable: runtime?.mutable === true };
}

/** Browser hint only. The server independently checks the same geometry before spending. */
export function checkPlacement(snapshot, candidate, { placing = false, now = snapshot?.yardRuntime?.serverNow || 0 } = {}) {
  if (!snapshot?.yardRuntime?.mutable) return { ok: false, errors: [{ code: 'YARD_READ_ONLY' }] };
  if (!SUPPORTED_PROPS.includes(candidate.goodieId)) return { ok: false, errors: [{ code: 'MEDIA_UNAVAILABLE' }] };
  const rows = snapshot.yard.placedGoodies || [];
  const existing = rows.find(p => p.slotId === candidate.slotId);
  if (!placing && !existing) return { ok: false, errors: [{ code: 'PLACEMENT_NOT_FOUND' }] };
  const visits = snapshot.yardRuntime.visits || [];
  if (visits.some(v => v.slotId === candidate.slotId && now < v.releaseAt)) return { ok: false, errors: [{ code: 'PROP_RESERVED' }] };
  const placements = placing ? [...rows, candidate] : rows.map(p => p.slotId === candidate.slotId ? { ...p, ...candidate } : p);
  const box = footprint(candidate, MIKA_SCENE);
  for (const visit of visits) if (now < visit.leavesAt && (visit.mediaAdmission?.plan?.reservationBoxes || []).some(r => overlaps(r, box))) {
    return { ok: false, errors: [{ code: 'VISITOR_PATH_RESERVED' }] };
  }
  return validateLayout({ ...snapshot.yard, placedGoodies: placements }, MIKA_SCENE);
}

export function visibleStatus(view,t=key=>key) {
  if (!view.mutable) return t('yard.persistent.status.readOnly');
  if (view.pendingGifts.length) return t('yard.persistent.status.gifts',{count:view.pendingGifts.length});
  if (view.legacy.length) return t('yard.persistent.status.legacy');
  if (view.pets.length) {
    const role=view.pets[0].role;
    return t(`yard.persistent.status.${['rest','settle','wake','play','roam','approach','depart'].includes(role)?role:'visiting'}`);
  }
  if (view.issues.length) return t('yard.persistent.status.items');
  if (view.props.some(p=>p.readiness?.status==='reposition-needed')) return t('yard.persistent.status.path');
  if (view.yard.remodel && view.yard.remodel!=='meadow') return t('yard.persistent.status.remodel');
  if (view.props.some(p=>!p.supported)) return t('yard.persistent.status.unsupported');
  if (view.bowls.some(b => b.foodId && b.servings > 0)) return t('yard.persistent.status.food');
  return t('yard.persistent.status.empty');
}
