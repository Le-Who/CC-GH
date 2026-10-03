/** Economic time stays authoritative. Repetition repeats a validated posed cycle,
 * never scales clip time, freezes a walking paw, or decides a reward. */
import { sampleRoute } from './stride-routes.mjs';
import { MIKA_ACTOR_PROFILE } from '../actor-profiles.mjs';

const clone = value => structuredClone(value);
const finite = n => Number.isFinite(n);
export const STAY_SCHEDULE_VERSION = 'mika-persistent-stay/v1';
export const CUSHION_REST_LOOP = MIKA_ACTOR_PROFILE.interactions['mika-cushion-r1'].loop;

function clipSegment(startAt, endAt, clipId, sourceStartMs, clipOrigin, role, propOwnerSlotId = null) {
  return { kind: 'clip', startAt, endAt, clipId, sourceStartMs, clipOrigin: clone(clipOrigin), role, propOwnerSlotId };
}

export function buildStaySchedule({ at, leavesAt, slotId }, plan, clip, groundRest = null,{actorProfile=MIKA_ACTOR_PROFILE}={}) {
  if (![at, leavesAt].every(Number.isSafeInteger) || leavesAt <= at) throw Error('Invalid visit time');
  if (!plan.incoming?.ok || !plan.outgoing?.ok) throw Error('Validated routes required');
  const interaction=actorProfile.interactions[clip.id];
  if(!interaction||interaction.goodieId!==clip.goodieId||!['on-prop','separate-ground'].includes(interaction.restMode))return{ok:false,code:'ACTOR_INTERACTION_PROFILE_UNAVAILABLE'};
  const isCushion = interaction.restMode === 'on-prop';
  if (!isCushion && (!groundRest?.playbackReady || !groundRest.loop?.validated)) {
    return { ok: false, code: 'LONG_STAY_GROUND_REST_UNAVAILABLE' };
  }
  const restingClip = isCushion ? clip : groundRest;
  if(restingClip.id!==interaction.restClipId)return{ok:false,code:'ACTOR_REST_PROFILE_MISMATCH'};
  const loop = isCushion ? interaction.loop : groundRest.loop;
  const period = loop.endMs - loop.startMs;
  if (!Number.isSafeInteger(period) || period <= 0 || loop.startMs < 0 || loop.endMs > restingClip.durationMs) throw Error('Invalid posed rest loop');
  const prefix = isCushion ? 0 : clip.durationMs;
  const fixedMs = plan.incoming.durationMs + prefix + (plan.restApproach?.durationMs || 0) + loop.startMs
    + restingClip.durationMs - loop.endMs + plan.outgoing.durationMs;
  const loops = Math.floor((leavesAt - at - fixedMs) / period);
  if (loops < 1) return { ok: false, code: 'STAY_TOO_SHORT_FOR_AUTHORED_MOTION' };
  // Any fractional period is spent outside the gate, before the pet becomes visible.
  const entryDelayMs = leavesAt - at - fixedMs - loops * period;
  let cursor = at + entryDelayMs;
  const segments = [...(entryDelayMs ? [{ kind: 'hidden', startAt: at, endAt: cursor, role: 'entry-wait' }] : []),
    { kind: 'route', startAt: cursor, endAt: cursor + plan.incoming.durationMs,
    route: clone(plan.incoming), role: 'approach' }];
  cursor += plan.incoming.durationMs;
  const propCommits = [];
  const origin = clone(plan.initialPlacement);
  if (!isCushion) {
    segments.push(clipSegment(cursor, cursor + clip.durationMs, clip.id, 0, origin, 'play', slotId));
    cursor += clip.durationMs;
    propCommits.push({ at: cursor, slotId, transform: clone(plan.finalTransform) });
    if(!plan.restApproach?.ok || !plan.restOrigin) return {ok:false,code:'SEPARATE_GROUND_REST_SITE_REQUIRED'};
    segments.push({kind:'route',startAt:cursor,endAt:cursor+plan.restApproach.durationMs,
      route:clone(plan.restApproach),role:'roam'});
    cursor += plan.restApproach.durationMs;
  }
  const restOrigin = isCushion ? origin : clone(plan.restOrigin);
  const owner = isCushion ? slotId : null;
  segments.push(clipSegment(cursor, cursor + loop.startMs, restingClip.id, 0, restOrigin, 'settle', owner));
  cursor += loop.startMs;
  segments.push({ kind: 'loop', startAt: cursor, endAt: cursor + loops * period,
    clipId: restingClip.id, sourceStartMs: loop.startMs, sourceEndMs: loop.endMs,
    clipOrigin: restOrigin, role: 'rest', cycles: loops, propOwnerSlotId: owner });
  cursor += loops * period;
  const wakeMs = restingClip.durationMs - loop.endMs;
  segments.push(clipSegment(cursor, cursor + wakeMs, restingClip.id, loop.endMs, restOrigin, 'wake', owner));
  cursor += wakeMs;
  const departureAt = cursor;
  if (isCushion) propCommits.push({ at: cursor, slotId, transform: clone(plan.finalTransform) });
  segments.push({ kind: 'route', startAt: cursor, endAt: leavesAt, route: clone(plan.outgoing), role: 'depart' });
  return { ok: true, version: STAY_SCHEDULE_VERSION, arrivalAt: at, leavesAt,
    entryDelayMs, enterAt: at + entryDelayMs, departureAt, propReleaseAt: departureAt,
    segments, propCommits, loop: { ...loop, cycles: loops },
    clock: 'server-ms-real-time', longStayPresentation: 'posed-curl-rest-loop',
    giftAuthority: 'server-economic-visit-completion' };
}

/** Pure random access: resume/reload and offline catch-up need no frame history. */
export function sampleStay(plan, at, identity = {},{actorProfile=MIKA_ACTOR_PROFILE}={}) {
  const {visitId,visitorId=actorProfile.visitorId}=identity;
  const schedule = plan?.schedule;
  if (schedule?.version !== STAY_SCHEDULE_VERSION || !finite(at)) return null;
  if (at < schedule.enterAt || at >= schedule.leavesAt) return null;
  const segment = schedule.segments.find(s => at >= s.startAt && at < s.endAt);
  if (!segment) throw Error('Gap in persisted stay schedule');
  const base = { visitId, visitorId, slotId: plan.initialPlacement.slotId, role: segment.role,
    reserved: at < schedule.propReleaseAt, propOwnerSlotId: segment.propOwnerSlotId || null };
  if (segment.kind === 'route') return { ...base, ...sampleRoute(segment.route, at - segment.startAt,{actorProfile}),
    phase: segment.role, route: segment.route };
  const period = segment.sourceEndMs - segment.sourceStartMs;
  const clipAtMs = segment.sourceStartMs + (segment.kind === 'loop'
    ? (at - segment.startAt) % period : at - segment.startAt);
  return { ...base, phase: 'active-clip', clipId: segment.clipId, clipAtMs,
    clipOrigin: clone(segment.clipOrigin), sourcePeriodMs: segment.kind === 'loop' ? period : null };
}

export function propTransformAt(plan, clip, at,{actorProfile=MIKA_ACTOR_PROFILE}={}) {
  const active = plan.schedule?.segments.find(s => s.propOwnerSlotId === plan.initialPlacement.slotId
    && at >= s.startAt && at < s.endAt);
  if (!active) return at >= (plan.schedule?.propCommits[0]?.at ?? Infinity)
    ? clone(plan.finalTransform) : { ...clone(plan.initialPlacement), rotationZ: plan.initialPlacement.rotationZ || 0, compression: 1 };
  const sample = sampleStay(plan, at,{}, {actorProfile});
  const row = clip.samples[Math.min(clip.samples.length - 1, Math.floor(sample.clipAtMs / actorProfile.sourceSampleMs))];
  const first = clip.samples[0].prop;
  return { x: plan.initialPlacement.x + (row.prop[0] - first[0]) * actorProfile.unitsPerWorld,
    y: plan.initialPlacement.y + (row.prop[1] - first[1]) * actorProfile.unitsPerWorld,
    rotationZ: row.rotationZ, compression: row.compression };
}
