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

export function visibleStatus(view) {
  if (!view.mutable) return 'Сохранение требует проверки · данные сохранены';
  if (view.pendingGifts.length) return `Подарки ждут вас · ${view.pendingGifts.length}`;
  if (view.legacy.length) return 'Прежний визит сохранён и завершится по своему времени';
  if (view.pets.length) return ({ rest: 'Mika уютно спит', settle: 'Mika устраивается поудобнее',
    wake: 'Mika просыпается', play: 'Mika играет', roam: 'Mika ищет тихое место', approach: 'К нам заглянула Mika', depart: 'Mika отправляется дальше' })[view.pets[0].role] || 'Mika во дворе';
  if (view.issues.length) return 'Некоторые предметы нужно переставить · откройте «Предметы»';
  if (view.props.some(p=>p.readiness?.status==='reposition-needed')) return 'К предмету нет безопасного подхода · выберите другое место';
  if (view.yard.remodel && view.yard.remodel!=='meadow') return 'Оформление сохранено · для этой пробы выберите луг';
  if (view.props.some(p=>!p.supported)) return 'Сохранены предметы следующего набора · откройте «Предметы»';
  if (view.bowls.some(b => b.foodId && b.servings > 0)) return 'Корм ждёт гостей · визит может случиться со временем';
  return 'Положите корм и устройте уютное место';
}
