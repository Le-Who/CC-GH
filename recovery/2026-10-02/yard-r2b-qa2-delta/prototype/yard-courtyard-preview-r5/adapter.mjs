/** Pure preview orchestration. No DOM, storage writes, network, rewards from art,
 * or production payload changes. Inject the frozen foundation's public functions. */
import { routeProgram, sampleRoute, ROUTE_CADENCE_REVISION } from './stride-routes.mjs';
import {WALK_PHASE_UNITS_96} from './walk-phase-lookup.mjs';
export const PREVIEW_FORMAT = 'yard-courtyard-preview/v3';
export const SAVE_KEY = 'cc-gh:yard:courtyard-preview:v3';
export const INITIAL_LAYOUT = Object.freeze([
  Object.freeze({ slotId: 'mouse', goodieId: 'yarn_mouse', x: 35, y: 45 }),
  Object.freeze({ slotId: 'cushion', goodieId: 'sun_cushion', x: 56, y: 66 }),
]);
export const PREVIEW_SCENE = Object.freeze({
  entry: Object.freeze({ x: 90, y: 68 }),
  bowlAnchor: Object.freeze({ x: 25, y: 83 }),
  walkReservationRadius: 3.44, // (.265 leg lane + .165 paw half-width) *8; excludes dragged props from real paw lanes.
  footprints: Object.freeze({ yarn_mouse: Object.freeze({ width: 8.8, height: 3.2 }),
    sun_cushion: Object.freeze({ width: 22.4, height: 19.2 }) }),
  exclusions: Object.freeze([Object.freeze({ x: 21.4, y: 79.4, width: 7.2, height: 7.2 })]),
});
export const PREVIEW_LAYOUT_ADJUSTMENTS = Object.freeze({
  revision:'calm-turns-r3',fixedBowlFrom:Object.freeze({x:25,y:80}),fixedBowlTo:Object.freeze({x:25,y:83}),
  scope:'New preview scene geometry only; saved player objects and prop placements are not relocated',
});
export const SCENARIOS = Object.freeze({
  mouse: { seed: 'courtyard-29', expectedGoodieId: 'yarn_mouse' },
  cushion: { seed: 'courtyard-210', expectedGoodieId: 'sun_cushion' },
});
const copy = value => structuredClone(value);
const own = (o, key) => Object.hasOwn(o || {}, key);
const atPoint = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const clamp = x => Math.max(0, Math.min(1, x));
const positiveInteger = n => Number.isSafeInteger(n) && n >= 0;
export function pointAlong(points, fraction) {
  if (!points?.length) return null;
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let left = lengths.reduce((a, b) => a + b, 0) * clamp(fraction);
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] && lengths[i] > 0) return atPoint(points[i], points[i + 1], left / lengths[i]);
    left -= lengths[i];
  }
  return copy(points.at(-1));
}
export function headingAlong(points, fraction) {
  if (!points?.length || points.length < 2) return 0;
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let left = lengths.reduce((a, b) => a + b, 0) * clamp(fraction), last = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (!lengths[i]) continue;
    last = Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x);
    if (left <= lengths[i]) return last;
    left -= lengths[i];
  }
  return last;
}
function interpolate(rows, at) {
  if (!rows.length) throw new Error('Empty clip motion samples');
  const right = rows.findIndex(row => row.atMs >= at);
  if (right <= 0) return copy(right === 0 ? rows[0] : rows.at(-1));
  const a = rows[right - 1], b = rows[right], q = clamp((at - a.atMs) / (b.atMs - a.atMs));
  return { atMs: at, root: a.root.map((v, i) => v + (b.root[i] - v) * q),
    prop: a.prop.map((v, i) => v + (b.prop[i] - v) * q),
    rotationZ: a.rotationZ + (b.rotationZ - a.rotationZ) * q,
    compression: a.compression + (b.compression - a.compression) * q };
}
export function createCourtyardAdapter(kernel, { clips, turns, scene = PREVIEW_SCENE, unitsPerWorld = 8 } = {}) {
  for (const name of ['createDefaultPlayer', 'migratePlayerSnapshot', 'advanceYard', 'applyPrototypeAction',
    'isReserved', 'validateLayout', 'buildNavigation', 'footprint', 'overlaps', 'splitForStorage', 'dispatchInput', 'digest']) {
    if (typeof kernel[name] !== 'function') throw new TypeError(`Missing foundation interface ${name}`);
  }
  if (!(unitsPerWorld > 0) || !Number.isFinite(unitsPerWorld)) throw new TypeError('Invalid world-to-yard scale');
  const manifest = copy(clips || {});
  const turnManifest = copy(turns || {});
  const sceneInput = copy(scene);
  const configHash = kernel.digest({ manifest, turns:turnManifest, scene: sceneInput, unitsPerWorld, clockPolicy: 'phase-aligned-steps-v3', routeCadence: ROUTE_CADENCE_REVISION, walkPhaseUnits96:WALK_PHASE_UNITS_96 });
  for (const c of Object.values(manifest)) {
    if (!['separate', 'composited'].includes(c.propMode) || !positiveInteger(c.durationMs)
      || !c.samples?.length || c.samples[0].atMs !== 0 || c.samples.at(-1).atMs !== c.durationMs) {
      throw new TypeError('Clip requires explicit prop owner, duration, and endpoint-inclusive samples');
    }
    if (!positiveInteger(c.finalTransformAtMs) || c.finalTransformAtMs > c.durationMs
      || !(c.contactAtMs === null || positiveInteger(c.contactAtMs) && c.contactAtMs <= c.durationMs)
      || c.samples.some((s, i) => !positiveInteger(s.atMs) || i > 0 && s.atMs <= c.samples[i - 1].atMs
        || ![s.rotationZ, s.compression, ...(s.root || []), ...(s.prop || [])].every(Number.isFinite)
        || s.root?.length !== 3 || s.prop?.length !== 3 || !(s.compression > 0))) throw new TypeError('Invalid clip samples or event time');
    if (!c.actorEnvelope || !['clip-world', 'root-relative-world'].includes(c.actorEnvelope.space)
      || c.actorEnvelope.min?.length !== 2 || c.actorEnvelope.max?.length !== 2
      || ![...c.actorEnvelope.min, ...c.actorEnvelope.max].every(Number.isFinite)
      || c.actorEnvelope.min.some((n, i) => n >= c.actorEnvelope.max[i])) throw new TypeError('Explicit actor interaction envelope required');
  }
  function validate(session) {
    if (session?.format !== PREVIEW_FORMAT || session.version !== 3 || session.configHash !== configHash)
      throw new Error('Unsupported preview version/config; preserve original save');
  }
  const transform = (plan, atMs) => {
    const c = manifest[plan.clipId], sample = interpolate(c.samples, atMs), origin = c.samples[0].prop;
    return { x: plan.placement.x + (sample.prop[0] - origin[0]) * unitsPerWorld,
      y: plan.placement.y + (sample.prop[1] - origin[1]) * unitsPerWorld,
      rotationZ: sample.rotationZ, compression: sample.compression };
  };
  const petPoint = (plan, atMs) => {
    const c = manifest[plan.clipId], sample = interpolate(c.samples, atMs), origin = c.samples[0].prop;
    return { x: plan.placement.x + (sample.root[0] - origin[0]) * unitsPerWorld,
      y: plan.placement.y + (sample.root[1] - origin[1]) * unitsPerWorld };
  };
  function actorBox(c, placement) {
    const e = c.actorEnvelope, origin = c.samples[0].prop;
    const min = e.min.map((v, i) => v + (e.space === 'root-relative-world' ? Math.min(...c.samples.map(s => s.root[i])) : 0));
    const max = e.max.map((v, i) => v + (e.space === 'root-relative-world' ? Math.max(...c.samples.map(s => s.root[i])) : 0));
    return { x: placement.x + (min[0] - origin[0]) * unitsPerWorld,
      y: placement.y + (min[1] - origin[1]) * unitsPerWorld,
      width: (max[0] - min[0]) * unitsPerWorld, height: (max[1] - min[1]) * unitsPerWorld };
  }
  function interactionLayoutErrors(yard) {
    const errors = [];
    for (const placement of yard.placedGoodies) {
      const c = Object.values(manifest).find(c => c.goodieId === placement.goodieId);
      if (!c) continue;
      const box = actorBox(c, placement);
      if (box.x < 0 || box.y < 0 || box.x + box.width > 100 || box.y + box.height > 100)
        errors.push({ code: 'INTERACTION_ENVELOPE_OUTSIDE_COURTYARD', slotId: placement.slotId });
      for (const other of yard.placedGoodies) if (other.slotId !== placement.slotId
        && kernel.overlaps(box, kernel.footprint(other, sceneInput))) errors.push({
          code: 'INTERACTION_ENVELOPE_COLLISION', actorSlotId: placement.slotId, propSlotId: other.slotId });
      if ((sceneInput.exclusions || []).some(r => kernel.overlaps(box, r))) errors.push({ code: 'INTERACTION_ENVELOPE_EXCLUSION', slotId: placement.slotId });
    }
    return errors;
  }
  function routeBoxes(points) {
    const radius = sceneInput.walkReservationRadius ?? sceneInput.actorRadius ?? 1.25;
    return points.slice(1).map((b, i) => { const a = points[i]; return {
      x: Math.min(a.x, b.x) - radius, y: Math.min(a.y, b.y) - radius,
      width: Math.abs(b.x - a.x) + radius * 2, height: Math.abs(b.y - a.y) + radius * 2,
    }; });
  }
  function turnBox(position,fromFacing,direction,angleSteps) {
    const e=turnManifest.variants?.[`${fromFacing}:${direction}:${angleSteps}`]?.actorEnvelope;
    if(!e)return null;
    return{x:position.x+e.min[0]*unitsPerWorld,y:position.y+e.min[1]*unitsPerWorld,
      width:(e.max[0]-e.min[0])*unitsPerWorld,height:(e.max[1]-e.min[1])*unitsPerWorld};
  }
  function planTurnRoute(nav,yard,anchor,incoming,initialPhase) {
    const obstacles=yard.placedGoodies.map(p=>kernel.footprint(p,sceneInput)).concat(sceneInput.exclusions||[]);
    return routeProgram({navigation:nav,anchor,entry:sceneInput.entry||{x:50,y:94},
      portalHalfSize:sceneInput.entryClearance??4,unitsPerWorld,incoming,initialPhase,turnDurations:turnManifest.durations,
      canTurn:(position,facing,direction,angleSteps)=>{
        const variant=turnManifest.variants?.[`${facing}:${direction}:${angleSteps}`],box=turnBox(position,facing,direction,angleSteps);
        return !!box&&variant.actorEnvelope.validated===true&&box.x>=0&&box.y>=0
          &&box.x+box.width<=100&&box.y+box.height<=100&&!obstacles.some(o=>kernel.overlaps(box,o));
      }});
  }
  function buildMotionRoutes(yard,placement,c) {
    const geometry={clipId:c.id,placement},final=transform(geometry,c.durationMs);
    const finalYard={...yard,placedGoodies:yard.placedGoodies.map(p=>p.slotId===placement.slotId?{...p,x:final.x,y:final.y}:p)};
    const walkingScene=y=>({...sceneInput,exclusions:[...(sceneInput.exclusions||[]),
      ...y.placedGoodies.map(p=>kernel.footprint(p,sceneInput)).filter(b=>!b.blocksMovement)]});
    return{
      incoming:planTurnRoute(kernel.buildNavigation(yard,walkingScene(yard)),yard,petPoint(geometry,0),true,0),
      outgoing:planTurnRoute(kernel.buildNavigation(finalYard,walkingScene(finalYard)),finalYard,petPoint(geometry,c.durationMs),false,c.terminalGaitPhase||0),
    };
  }
  function turnRouteErrors(yard) {
    if(turnManifest.playbackReady!==true)return[];
    const errors=[];
    for(const p of yard.placedGoodies){const c=Object.values(manifest).find(c=>c.goodieId===p.goodieId);if(!c)continue;
      const routes=buildMotionRoutes(yard,p,c);
      for(const side of['incoming','outgoing'])if(!routes[side].ok)errors.push({code:'PHASE_ALIGNED_ROUTE_UNAVAILABLE',slotId:p.slotId,side,reason:routes[side].reason});
    }
    return errors;
  }
  function effectiveYard(session) {
    return { ...session.kernel.player.yard, placedGoodies: session.kernel.player.yard.placedGoodies.map(p => {
      const overlay = session.render.propOverrides[p.slotId];
      return overlay ? { ...p, x: overlay.x, y: overlay.y } : p;
    }) };
  }
  function emit(session, type, at, plan, extra = {}) {
    const id = `${plan.visitId}:${type}`;
    if (!session.render.events.some(e => e.id === id)) session.render.events.push({ id, type, at,
      visitId: plan.visitId, slotId: plan.slotId, clipId: plan.clipId, ...extra });
  }
  function makePlan(session, record) {
    const c = Object.values(manifest).find(c => c.goodieId === record.original.goodieId
      && c.activityIds.includes(record.activityId));
    if (record.original.visitorId !== 'mika_cat' || !c) {
      session.blocker = { code: 'UNSUPPORTED_VISIT_MEDIA', visitId: record.visitId,
        visitorId: record.original.visitorId, goodieId: record.original.goodieId };
      return null;
    }
    if (c.playbackReady !== true || !c.requiredPhases?.every(p => c.validatedPhases?.includes(p))) {
      session.blocker = { code: 'INTERACTION_MEDIA_NOT_READY', visitId: record.visitId,
        goodieId: record.original.goodieId, missingPhases: (c.requiredPhases || []).filter(p => !c.validatedPhases?.includes(p)) };
      return null;
    }
    if(turnManifest.playbackReady!==true) {
      session.blocker={code:'TURN_MEDIA_NOT_READY',visitId:record.visitId};return null;
    }
    const plan = { visitId: record.visitId, slotId: record.slotId, clipId: c.id,
      placement: copy(record.placement), startAt: record.timeline.alignAt,
      endAt: record.timeline.alignAt + c.durationMs,
      finalAt: record.timeline.alignAt + c.finalTransformAtMs, releaseAt: record.releaseAt,
      contactAt: c.contactAtMs === null ? null : record.timeline.alignAt + c.contactAtMs,
      phase: 'reserved', placementCommitted: false, actorBox: actorBox(c, record.placement) };
    if (plan.endAt >= plan.releaseAt) { session.blocker = { code: 'CLIP_EXCEEDS_RESERVATION' }; return null; }
    const yard = effectiveYard(session), final = transform(plan, c.durationMs);
    const finalYard = { ...yard, placedGoodies: yard.placedGoodies.map(p => p.slotId === plan.slotId ? { ...p, x: final.x, y: final.y } : p) };
    const validation = kernel.validateLayout(finalYard, sceneInput);
    if (!validation.ok) { session.blocker = { code: 'CLIP_FINAL_PLACEMENT_INVALID', details: validation.errors }; return null; }
    const actorErrors = interactionLayoutErrors(yard).filter(e => e.actorSlotId === plan.slotId || e.slotId === plan.slotId);
    if (actorErrors.length) { session.blocker = { code: 'ACTOR_INTERACTION_ENVELOPE_COLLISION', details: actorErrors }; return null; }
    // Reserve the full sampled prop sweep as well as the catalog activity socket.
    const boxes = c.samples.map(row => kernel.footprint({ ...plan.placement, ...transform(plan, row.atMs) }, sceneInput));
    plan.sweptBox = { x: Math.min(...boxes.map(b => b.x)), y: Math.min(...boxes.map(b => b.y)) };
    plan.sweptBox.width = Math.max(...boxes.map(b => b.x + b.width)) - plan.sweptBox.x;
    plan.sweptBox.height = Math.max(...boxes.map(b => b.y + b.height)) - plan.sweptBox.y;
    if (yard.placedGoodies.some(p => p.slotId !== plan.slotId && kernel.overlaps(kernel.footprint(p, sceneInput), plan.sweptBox))) {
      session.blocker = { code: 'CLIP_SWEEP_COLLISION' }; return null;
    }
    // Free walking stays on floor: raised layable props are only crossed by their
    // authored interaction clip, not by a flat-ground locomotion atlas.
    const {incoming,outgoing}=buildMotionRoutes(yard,plan.placement,c);
    if(!incoming.ok||!outgoing.ok){session.blocker={code:'PHASE_ALIGNED_ROUTE_UNAVAILABLE',incoming:incoming.reason,outgoing:outgoing.reason};return null;}
    plan.entryMotion=incoming;plan.exitMotion=outgoing;
    plan.entryRoute = incoming.points; plan.exitRoute = outgoing.points;
    plan.turnReservations=[...incoming.legs,...outgoing.legs].filter(l=>l.kind==='turn').map(l=>turnBox(l.position,l.fromFacing,l.direction,l.angleSteps));
    const speed = unitsPerWorld * (c.strideWorld || .64) / (c.cycleSeconds || 1.2);
    plan.presentation = { walkingYardUnitsPerSecond:speed,entryLength:incoming.distance,exitLength:outgoing.distance,
      approachMs:incoming.durationMs,departureMs:outgoing.durationMs,entryTurns:incoming.turnCount,exitTurns:outgoing.turnCount };
    return plan;
  }
  function reconcile(session, at) {
    for (const record of Object.values(session.kernel.runtime.visits).sort((a, b) => a.arrivedAt - b.arrivedAt || a.visitId.localeCompare(b.visitId))) {
      let plan = session.render.plans[record.visitId];
      if (!plan && record.arrivedAt <= at && !session.blocker) {
        plan = makePlan(session, record);
        if (!plan) continue;
        session.render.plans[record.visitId] = plan;
        session.episodeVisitId ||= record.visitId;
        emit(session, 'prop-reserved', record.arrivedAt, plan);
      }
      if (!plan) continue;
      if (at >= plan.startAt) emit(session, 'clip-active', plan.startAt, plan, { owner: manifest[plan.clipId].propMode });
      if (plan.contactAt !== null && at >= plan.contactAt) emit(session, 'authored-contact', plan.contactAt, plan,
        { contactReference: 'authored paw anchor; actual skinned geometry validated separately' });
      if (at >= plan.finalAt) emit(session, 'prop-final-transform', plan.finalAt, plan,
        { transform: transform(plan, manifest[plan.clipId].durationMs) });
      if (at >= plan.endAt && !plan.placementCommitted) {
        session.render.propOverrides[plan.slotId] = transform(plan, manifest[plan.clipId].durationMs);
        emit(session, 'prop-handed-back', plan.endAt, plan, { transform: copy(session.render.propOverrides[plan.slotId]) });
      }
      if (at >= plan.releaseAt && !plan.placementCommitted) {
        const final = transform(plan, manifest[plan.clipId].durationMs);
        const result = kernel.applyPrototypeAction(session.kernel, 'yard.moveGoodie',
          { slotId: plan.slotId, x: final.x, y: final.y }, { now: at, scene: sceneInput });
        if (result.status !== 200) { session.blocker = { code: 'FINAL_PLACEMENT_COMMIT_FAILED', details: result.details }; continue; }
        session.kernel = result.state; plan.placementCommitted = true;
        session.render.staticTransforms[plan.slotId] = { rotationZ: final.rotationZ, compression: 1 };
        delete session.render.propOverrides[plan.slotId];
        emit(session, 'prop-released', plan.releaseAt, plan, { transform: final });
      }
      plan.phase = at < plan.startAt ? 'reserved' : at < plan.endAt ? 'active-clip' : at < plan.releaseAt ? 'held-final' : 'released';
    }
    const episode = session.kernel.runtime.visits[session.episodeVisitId];
    session.episodeComplete = !!episode && at >= episode.leavesAt;
  }
  function boundaries(session) {
    const now = session.kernel.runtime.cursorMs, values = [session.kernel.runtime.nextOpportunityAt];
    for (const r of Object.values(session.kernel.runtime.visits)) {
      if (r.status === 'active') values.push(r.arrivedAt, r.releaseAt, r.leavesAt, ...Object.values(r.timeline || {}));
    }
    for (const p of Object.values(session.render.plans)) values.push(p.startAt, p.endAt, p.finalAt, p.releaseAt, p.contactAt);
    return [...new Set(values.filter(t => positiveInteger(t) && t > now))].sort((a, b) => a - b);
  }
  function advanceModel(input, now) {
    validate(input);
    if (!positiveInteger(now) || now < input.kernel.runtime.cursorMs) throw new RangeError('Preview time must be monotonic integer milliseconds');
    const out = copy(input);
    while (out.kernel.runtime.cursorMs < now && !out.blocker && !out.episodeComplete) {
      const end = Math.min(now, boundaries(out)[0] ?? now);
      out.kernel = kernel.advanceYard(out.kernel, end, { scene: sceneInput });
      reconcile(out, end);
    }
    return out;
  }
  function create({ scenario = 'mouse' } = {}) {
    if (!own(SCENARIOS, scenario)) throw new Error('Unknown bounded preview scenario');
    const raw = kernel.createDefaultPlayer('courtyard-preview', 'Courtyard', 0);
    let state = kernel.migratePlayerSnapshot(raw, { now: 0, seed: SCENARIOS[scenario].seed });
    for (const placement of INITIAL_LAYOUT) {
      const result = kernel.applyPrototypeAction(state, 'yard.placeGoodie', placement, { now: 0, scene: sceneInput });
      if (result.status !== 200) throw new Error(`Preview layout is invalid: ${JSON.stringify(result.details)}`);
      state = result.state;
    }
    const stored = kernel.splitForStorage(state);
    const actorErrors = interactionLayoutErrors(state.player.yard);
    if (actorErrors.length) throw new Error(`Preview interaction layout is invalid: ${JSON.stringify(actorErrors)}`);
    return { session: { format: PREVIEW_FORMAT, version: 3, configHash, scenario, kernel: stored.record.state,
      clock: { screenMs: 0, segment: null }, render: { plans: {}, propOverrides: {}, staticTransforms: {}, events: [] },
      commandReceipts: {}, episodeVisitId: null, episodeComplete: false, blocker: null }, backup: stored.backup };
  }
  function placementCheck(session, action, payload) {
    const yard = effectiveYard(session), existing = yard.placedGoodies.find(p => p.slotId === payload.slotId);
    if (!['yard.placeGoodie', 'yard.moveGoodie'].includes(action)) return { ok: true, errors: [] };
    const proposed = { ...(existing || {}), ...payload, goodieId: existing?.goodieId || payload.goodieId };
    const layout = { ...yard, placedGoodies: existing ? yard.placedGoodies.map(p => p.slotId === proposed.slotId ? proposed : p) : [...yard.placedGoodies, proposed] };
    const result = kernel.validateLayout(layout, sceneInput), foundationLayoutOk = result.ok;
    result.errors.push(...interactionLayoutErrors(layout));
    const box = kernel.footprint(proposed, sceneInput);
    if (box) for (const plan of Object.values(session.render.plans)) if (!plan.placementCommitted
      && plan.slotId !== proposed.slotId && kernel.overlaps(box, plan.sweptBox)) result.errors.push({ code: 'RESERVED_CLIP_SWEEP', slotId: plan.slotId });
    if (box) for (const plan of Object.values(session.render.plans)) {
      const record = session.kernel.runtime.visits[plan.visitId], now = session.kernel.runtime.cursorMs;
      if (now >= record.leavesAt) continue;
      if(plan.turnReservations?.some(r=>kernel.overlaps(box,r)))result.errors.push({code:'RESERVED_STEP_TURN',visitId:plan.visitId});
      if (plan.slotId !== proposed.slotId && kernel.overlaps(box, plan.actorBox)) result.errors.push({ code: 'RESERVED_ACTOR_INTERACTION', visitId: plan.visitId });
      const paths = now < plan.startAt ? [plan.entryRoute, plan.exitRoute] : [plan.exitRoute];
      if (paths.flatMap(routeBoxes).some(r => kernel.overlaps(box, r))) result.errors.push({ code: 'RESERVED_PET_ROUTE', visitId: plan.visitId });
    }
    if (existing && Object.values(session.kernel.runtime.visits).some(r => r.slotId === existing.slotId && kernel.isReserved(r, session.kernel.runtime.cursorMs)))
      result.errors.push({ code: 'PROP_RESERVED', slotId: existing.slotId });
    result.ok = !result.errors.length;
    if(result.ok) {result.errors.push(...turnRouteErrors(layout));result.ok=!result.errors.length;}
    if (!result.ok && foundationLayoutOk && session.blocker?.code === 'REPOSITION_REQUIRED') {
      const before = [...kernel.validateLayout(yard, sceneInput).errors, ...interactionLayoutErrors(yard),...turnRouteErrors(yard)];
      const old = new Set(before.map(e => kernel.digest(e))), next = new Set(result.errors.map(e => kernel.digest(e)));
      if (next.size < old.size && [...next].every(e => old.has(e))) {
        result.ok = true; result.recoveryProgress = true; result.remainingIssues = copy(result.errors);
      }
    }
    return result;
  }
  function action(input, command) {
    validate(input);
    const allowed = ['yard.setFood', 'yard.placeGoodie', 'yard.moveGoodie', 'yard.pickupGoodie', 'yard.collectGifts'];
    if (!allowed.includes(command.action) || !/^preview:[A-Za-z0-9_.:-]{1,100}$/.test(command.actionId || ''))
      return { status: 400, error: 'UNSUPPORTED_ACTION_OR_MISSING_PREVIEW_NONCE', session: input };
    const hash = kernel.digest({ action: command.action, payload: command.payload || {} });
    const prior = own(input.commandReceipts, command.actionId) ? input.commandReceipts[command.actionId] : null;
    if (prior) return prior.requestHash === hash ? { ...copy(prior.result), replayed: true, session: input }
      : { status: 409, error: 'ACTION_ID_PAYLOAD_CONFLICT', session: input };
    const recoveringPlacement = input.blocker?.code === 'REPOSITION_REQUIRED'
      && ['yard.moveGoodie', 'yard.pickupGoodie'].includes(command.action);
    if (input.blocker && !recoveringPlacement) return { status: 409, error: input.blocker.code, session: input };
    if (input.episodeComplete && command.action === 'yard.setFood')
      return { status: 409, error: 'BOUNDED_EPISODE_COMPLETE', session: input };
    const validation = placementCheck(input, command.action, command.payload || {});
    let result;
    const out = copy(input);
    if(command.action==='yard.setFood') {
      const routeErrors=turnRouteErrors(effectiveYard(out));
      if(routeErrors.length){out.blocker={code:'REPOSITION_REQUIRED',details:routeErrors};
        const failure={status:400,error:'REPOSITION_REQUIRED',details:routeErrors};
        out.commandReceipts[command.actionId]={requestHash:hash,result:copy(failure)};
        return{...failure,session:out};}
    }
    if (!validation.ok) result = { status: 400, error: 'INVALID_PLACEMENT', details: validation.errors };
    else {
      const applied = kernel.applyPrototypeAction(out.kernel, command.action, command.payload || {},
        { now: out.kernel.runtime.cursorMs, scene: sceneInput, actionId: command.actionId });
      out.kernel = applied.state;
      result = { status: applied.status, ...(applied.extras ? { extras: applied.extras } : { error: applied.error, details: applied.details }) };
      if (applied.status === 200 && command.action === 'yard.pickupGoodie') delete out.render.staticTransforms[command.payload.slotId];
      if (applied.status === 200 && recoveringPlacement) {
        const yard = effectiveYard(out), errors = [...kernel.validateLayout(yard, sceneInput).errors, ...interactionLayoutErrors(yard),...turnRouteErrors(yard)];
        out.blocker = errors.length ? { code: 'REPOSITION_REQUIRED', details: errors } : null;
      }
    }
    out.commandReceipts[command.actionId] = { requestHash: hash, result: copy(result) };
    return { ...result, session: out };
  }
  function nextSegment(session) {
    const start = session.kernel.runtime.cursorMs;
    if (session.blocker || session.episodeComplete) return null;
    const r = session.kernel.runtime.visits[session.episodeVisitId];
    if (!r && !session.kernel.player.yard.bowls.some(b => b.foodId && b.servings > 0)) return null;
    let end = boundaries(session)[0];
    let duration = end - start;
    let routeClock = null;
    const plan = r && session.render.plans[r.visitId];
    if (!r) duration = Math.min(duration, 8000);
    else if (start < plan.startAt) {
      end = plan.startAt;
      duration = Math.ceil(plan.presentation.approachMs * (end-start)/(plan.startAt-r.arrivedAt));
      routeClock={visitId:plan.visitId,routeKind:'entry',elapsedStartMs:plan.entryMotion.durationMs*(start-r.arrivedAt)/(plan.startAt-r.arrivedAt)};
    }
    else if (start >= r.timeline.departAt) {
      end = r.leavesAt;
      duration = Math.ceil(plan.presentation.departureMs * (end-start)/(r.leavesAt-r.timeline.departAt));
      routeClock={visitId:plan.visitId,routeKind:'exit',elapsedStartMs:plan.exitMotion.durationMs*(start-r.timeline.departAt)/(r.leavesAt-r.timeline.departAt)};
    }
    else if (start >= plan.endAt && start < r.releaseAt) duration = 0;
    else if (start >= r.releaseAt && start < r.timeline.departAt) duration = 0;
    return { modelStart: start, modelEnd: end, screenStart: session.clock.screenMs, screenEnd: session.clock.screenMs + duration,
      ...(routeClock?{routeClock}:{}) };
  }
  function advancePresentation(input, screenMs) {
    validate(input);
    if (!positiveInteger(screenMs) || screenMs < input.clock.screenMs) throw new RangeError('Presentation clock must be monotonic');
    let out = copy(input);
    while (true) {
      const segment = out.clock.segment || nextSegment(out);
      if (!segment) { out.clock.screenMs = screenMs; break; }
      if (segment.screenEnd === segment.screenStart) {
        if (segment.modelEnd <= out.kernel.runtime.cursorMs) throw new Error('Zero-duration segment must advance model time');
        out = advanceModel(out, segment.modelEnd); out.clock.segment = null;
        continue;
      }
      if (out.clock.screenMs === screenMs) break;
      const end = Math.min(screenMs, segment.screenEnd);
      const now = end === segment.screenEnd ? segment.modelEnd : segment.modelStart
        + Math.floor((end - segment.screenStart) * (segment.modelEnd - segment.modelStart) / (segment.screenEnd - segment.screenStart));
      out = advanceModel(out, now);
      out.clock.screenMs = end;
      out.clock.segment = end === segment.screenEnd ? null : segment;
    }
    return out;
  }
  function view(session) {
    validate(session);
    const at = session.kernel.runtime.cursorMs;
    const props = effectiveYard(session).placedGoodies.map(p => {
      const plan = Object.values(session.render.plans).find(v => v.slotId === p.slotId && at >= v.startAt && at < v.endAt);
      const c = plan && manifest[plan.clipId];
      const pose = plan ? transform(plan, at - plan.startAt) : { x: p.x, y: p.y, rotationZ: 0, compression: 1,
        ...session.render.staticTransforms[p.slotId], ...session.render.propOverrides[p.slotId] };
      return { slotId: p.slotId, goodieId: p.goodieId, transform: pose,
        owner: plan && c.propMode === 'composited' ? `clip:${plan.visitId}` : 'scene',
        drawStandalone: !(plan && c.propMode === 'composited'),
        reserved: Object.values(session.kernel.runtime.visits).some(r => r.slotId === p.slotId && kernel.isReserved(r, at)) };
    });
    const pets = Object.values(session.render.plans).flatMap(plan => {
      const r = session.kernel.runtime.visits[plan.visitId], c = manifest[plan.clipId];
      if (r.status !== 'active' || at >= r.leavesAt) return [];
      let phase, position, clipAtMs = null, gaitPhase = c.terminalGaitPhase ?? 0, groundDistance = 0, headingRadians = 0,
        motion=null,continuousPosition=null,continuousGroundDistance=0;
      const routeSample=(kind)=>{
        const program=kind==='entry'?plan.entryMotion:plan.exitMotion;
        const start=kind==='entry'?r.arrivedAt:r.timeline.departAt,end=kind==='entry'?plan.startAt:r.leavesAt;
        let elapsed=clamp((at-start)/(end-start))*program.durationMs;
        const segment=session.clock.segment;
        if(segment?.routeClock?.visitId===plan.visitId&&segment.routeClock.routeKind===kind
          &&session.clock.screenMs>=segment.screenStart&&session.clock.screenMs<=segment.screenEnd) {
          const predicted=segment.modelStart+Math.floor((session.clock.screenMs-segment.screenStart)
            *(segment.modelEnd-segment.modelStart)/(segment.screenEnd-segment.screenStart));
          if(predicted===at)elapsed=segment.routeClock.elapsedStartMs+session.clock.screenMs-segment.screenStart;
        }
        return sampleRoute(program,elapsed,{unitsPerWorld,turnYaw:(f,d,n,t)=>{
          const variant=turnManifest.variants[`${f}:${d}:${n}`];
          return variant.yawByFrame[Math.min(variant.yawByFrame.length-1,Math.floor(t*variant.fps/1000))];
        }});
      };
      if (at < plan.startAt) {
        phase='approach';({position,gaitPhase,groundDistance,headingRadians,motion,continuousPosition,continuousGroundDistance}=routeSample('entry'));
      } else if (at < plan.endAt) { phase = 'active-clip'; clipAtMs = at - plan.startAt; position = petPoint(plan, clipAtMs); gaitPhase = null; }
      else if (at < r.timeline.departAt) { phase = 'idle'; position = petPoint(plan, c.durationMs); }
      else {phase='depart';({position,gaitPhase,groundDistance,headingRadians,motion,continuousPosition,continuousGroundDistance}=routeSample('exit'));}
      return [{ visitId: plan.visitId, visitorId: r.original.visitorId, assignedSlotId: plan.slotId,
        phase, position, clipId: plan.clipId, clipAtMs, clipOrigin: { x: plan.placement.x, y: plan.placement.y },
        unitsPerWorld,gaitPhase,groundDistance,headingRadians,motion,continuousPosition,continuousGroundDistance,
        activeClipIncludesProp: phase === 'active-clip' && c.propMode === 'composited' }];
    });
    return { coordinateSpace: 'yard-percent', props, pets, bowls: copy(session.kernel.player.yard.bowls),
      foodInventory: copy(session.kernel.player.yard.foodInventory), pendingGifts: copy(session.kernel.player.yard.pendingGifts),
      currencies: copy(session.kernel.player.yard.currencies), episodeComplete: session.episodeComplete,
      canFeed: !session.episodeComplete && !session.blocker,
      blocker: copy(session.blocker) };
  }
  function eventsBetween(session, t0, t1) {
    validate(session);
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) throw new RangeError('Invalid event interval');
    return copy(session.render.events.filter(e => e.at > t0 && e.at <= t1));
  }
  function encode(session) { validate(session); return { key: SAVE_KEY, value: JSON.stringify({
    format: 'yard-courtyard-save/v3', sha256: kernel.digest(session), payload: session }) }; }
  function restore(text, backup) {
    try {
      const record = JSON.parse(text);
      if (!['yard-courtyard-save/v1', 'yard-courtyard-save/v2','yard-courtyard-save/v3'].includes(record.format)
        || kernel.digest(record.payload) !== record.sha256) throw new Error('Unknown or corrupted local save envelope');
      const session = record.payload;
      const knownV1 = record.format === 'yard-courtyard-save/v1' && session?.format === 'yard-courtyard-preview/v1' && session.version === 1;
      const knownV2 = record.format === 'yard-courtyard-save/v2' && session?.format === 'yard-courtyard-preview/v2' && session.version === 2;
      const knownV3 = record.format === 'yard-courtyard-save/v3' && session?.format === PREVIEW_FORMAT && session.version === 3;
      if (!knownV1 && !knownV2 && !knownV3) throw new Error('Unsupported or inconsistent preview version');
      if (kernel.dispatchInput(session.kernel, { now: session.kernel.runtime.cursorMs }).status !== 200
        || !positiveInteger(session.clock?.screenMs) || !session.render?.plans || !Array.isArray(session.render.events)
        || !session.commandReceipts) throw new Error('Malformed local preview save');
      if (backup?.id !== session.kernel.migration.backupId || kernel.digest(backup.rawSnapshot) !== session.kernel.migration.inputSha256)
        throw new Error('Immutable origin backup missing or altered');
      const changedConfig = session.configHash !== configHash || session.format !== PREVIEW_FORMAT || session.version !== 3;
      if (changedConfig && Object.values(session.kernel.runtime.visits).some(r => r.status === 'active'))
        return { ok: false, reason: 'ACTIVE_VISIT_REQUIRES_COMPATIBLE_MEDIA', rawSnapshot: text, rawBackup: backup, mutationsAllowed: false };
      let recovery = null;
      if (changedConfig) {
        recovery = { reason: 'Preview geometry/media contract changed; placements and all kernel fields retained',
          originalSaveSha256: kernel.digest(text), fromConfigHash: session.configHash, fromVersion: session.version,
          sceneAdjustment:copy(PREVIEW_LAYOUT_ADJUSTMENTS) };
        session.format = PREVIEW_FORMAT; session.version = 3; session.configHash = configHash;
        session.clock.segment = null;
        session.recoveryReceipts ||= []; session.recoveryReceipts.push(copy(recovery));
      }
      const yard = effectiveYard(session), errors = [...kernel.validateLayout(yard, sceneInput).errors, ...interactionLayoutErrors(yard),...turnRouteErrors(yard)];
      if (errors.length) session.blocker = { code: 'REPOSITION_REQUIRED', details: errors };
      return { ok: true, session, ...(recovery ? { recovery, recoverySource: text } : {}) };
    } catch (error) { return { ok: false, reason: error.message, rawSnapshot: text, rawBackup: backup, mutationsAllowed: false }; }
  }
  return { create, action, advanceModel, advancePresentation, view, eventsBetween, placementCheck, encode, restore, configHash };
}
