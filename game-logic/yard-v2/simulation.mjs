import { YARD_HOUR_MS, YARD_FOODS, YARD_GOODIES, YARD_VISITORS, getYardGoodieCapacity,
  getYardGoodieActivities, getYardConditionProfile, INVENTORY_ONLY_GOODS } from './catalog.mjs';
import { FOUNDATION_FORMAT } from './migration.mjs';
import { clone, digest, randomUnit, randomInt, hash32, integer, assertInteger, addCount, lookup, put, compareText, workingCopy } from './util.mjs';
import { validateLayout, footprint, overlaps } from './geometry.mjs';
const RELEASE_PROGRESS = .84; // retained from exact baseline yard.js
const APPROACH_SPEED = 20; // legacy nominal phase marker speed; authored full-stay presentation has its own actual route clock
const emit = (state, type, at, data = {}) => state.runtime.events.push({ type, at, ...data });
function validateEnvelope(state) {
  if (state?.format !== FOUNDATION_FORMAT || state.runtime?.version !== 1) throw new TypeError('Use the lossless migration envelope first');
  const blocked = state.runtime.migrationIssues.filter((i) => !['HISTORICAL_OUTCOME_UNKNOWN'].includes(i.code));
  if (blocked.length) throw new Error(`Snapshot requires review: ${blocked.map((i) => i.code).join(',')}`);
}
export function isReserved(record, at) { return ['active', 'unsupported-legacy'].includes(record.status) && at < record.releaseAt; }
export function visitPhase(record, at) {
  if (record.status !== 'active' || at >= record.leavesAt) return record.status === 'completed' ? 'completed' : record.status;
  if (!record.timeline) return at >= record.releaseAt ? 'released' : 'legacy-interaction';
  const t = record.timeline;
  if (at < t.approachAt) return 'enter';
  if (at < t.alignAt) return 'approach';
  if (at < t.settleAt) return 'align';
  if (at < t.interactAt) return 'settle';
  if (at < record.releaseAt) return 'interaction';
  if (at < t.departAt) return 'released';
  return 'depart';
}
export function matchingVisitorCandidates(goodie, bowl, condition) {
  const food = lookup(YARD_FOODS, bowl.foodId), profile = getYardConditionProfile(goodie, condition);
  if (!food) return [];
  const tags = new Set([...(goodie.tags || []), ...(food.tags || [])]);
  return Object.values(YARD_VISITORS).filter((v) => !v.requires
    || v.requires.goodieId === goodie.id && v.requires.foodId === bowl.foodId).map((visitor) => {
    const matches = visitor.tags.filter((t) => tags.has(t)).length;
    return { visitor, matches, strict: !!visitor.requires,
      weight: Math.max(1, visitor.baseWeight * (visitor.requires ? 18 : 1) + matches * 4) * food.attraction * profile.attraction };
  }).filter((x) => x.matches || x.strict);
}
function chooseVisitor(pool, key) {
  const strict = pool.filter((p) => p.strict);
  if (strict.length && randomUnit(`${key}:strict`) < .82) return strict[hash32(`${key}:strict-pick`) % strict.length].visitor;
  let roll = randomUnit(key) * pool.reduce((sum, p) => sum + p.weight, 0);
  for (const p of pool) { roll -= p.weight; if (roll <= 0) return p.visitor; }
  return pool.at(-1)?.visitor;
}
function clearBowl(bowl) { bowl.foodId = null; bowl.servings = 0; bowl.placedAt = null; bowl.expiresAt = null; }
function refill(yard, at) {
  if (!yard.helper?.unlocked || !yard.helper?.autoRefill) return;
  for (const bowl of yard.bowls) if (!bowl.foodId) {
    const preferred = yard.helper.preferredFoodId;
    const id = lookup(YARD_FOODS, preferred) && yard.foodInventory[preferred] > 0 ? preferred : Object.keys(YARD_FOODS).find((id) => yard.foodInventory[id] > 0);
    if (id) setFood(yard, bowl.id, id, at);
  }
}
function setFood(yard, bowlId, foodId, at) {
  const food = lookup(YARD_FOODS, foodId), bowl = yard.bowls.find((b) => b.id === bowlId);
  if (!food || !bowl || !(yard.foodInventory[foodId] > 0)) return false;
  addCount(yard.foodInventory, foodId, -1); Object.assign(bowl, { foodId, servings: food.servings, placedAt: at, expiresAt: at + food.durationMs }); return true;
}
function completeVisit(state, record) {
  const yard = state.player.yard, visitor = YARD_VISITORS[record.original.visitorId], at = record.leavesAt;
  if (record.status !== 'active' || !visitor) return;
  const giftId = record.giftId;
  if (!state.runtime.giftLedger[giftId] && !yard.pendingGifts.some((g) => g.id === giftId)) {
    const entry = yard.petbook[visitor.id]; let mementoId = null;
    if (entry && !entry.mementoReceived && !yard.mementos[visitor.id] && entry.visits >= visitor.memento.threshold) {
      mementoId = visitor.memento.id; entry.mementoReceived = true;
      yard.mementos[visitor.id] = { id: mementoId, visitorId: visitor.id, name: visitor.memento.name, receivedAt: at };
    }
    const gift = { id: giftId, visitorId: visitor.id,
      treats: randomInt(`${record.visitId}:treats`, ...visitor.gift.treats),
      shinyTreats: randomUnit(`${record.visitId}:shiny`) < visitor.gift.shinyChance ? 1 : 0,
      mementoId, createdAt: at };
    yard.pendingGifts.push(gift); state.runtime.giftLedger[giftId] = { status: 'earned', visitId: record.visitId, gift: clone(gift) };
    emit(state, 'gift-earned', at, { giftId, visitId: record.visitId });
  }
  record.status = 'completed';
  yard.activeVisitors = yard.activeVisitors.filter((v) => v.visitId !== record.visitId);
  emit(state, 'visit-completed', at, { visitId: record.visitId });
}
function opportunity(state, at, scene, { admissionPolicy, projectYard } = {}) {
  const yard = state.player.yard; refill(yard, at);
  if (!yard.bowls.some((b) => lookup(YARD_FOODS, b.foodId) && integer(b.servings) && b.servings > 0)) return;
  const projection = projectYard ? projectYard(clone(yard), { scene }) : { yard, ok: true };
  if (!projection.ok) { emit(state, 'admission-blocked-layout', at, { errors: clone(projection.issues) }); return; }
  const displayYard = projection.yard;
  const geometry = validateLayout(displayYard, scene);
  if (!geometry.ok) { emit(state, 'admission-blocked-layout', at, { errors: geometry.errors }); return; }
  const reserved = Object.values(state.runtime.visits).filter((r) => isReserved(r, at));
  const occupied = new Set(reserved.map((r) => `${r.slotId}:${r.activityId}`));
  const counts = new Map(); for (const r of reserved) counts.set(r.slotId, (counts.get(r.slotId) || 0) + 1);
  for (const placed of [...displayYard.placedGoodies].sort((a, b) => compareText(a.slotId, b.slotId))) {
    const goodie = YARD_GOODIES[placed.goodieId]; if (!goodie) continue;
    let available = getYardGoodieActivities(goodie, placed.condition).filter((a) => !occupied.has(`${placed.slotId}:${a.id}`)
      && geometry.routes[placed.slotId]?.[a.id]).sort((a, b) => compareText(a.id, b.id));
    const vacancies = Math.max(0, getYardGoodieCapacity(goodie) - (counts.get(placed.slotId) || 0));
    for (let n = 0; n < vacancies; n++) {
      // The preceding admission can wear this prop. Recompute allowed sockets and
      // navigation before selecting the next capacity slot or running media preflight.
      const currentGeometry = n === 0 ? geometry : validateLayout(displayYard, scene);
      if (!currentGeometry.ok) break;
      available = getYardGoodieActivities(goodie, placed.condition).filter(a => !occupied.has(`${placed.slotId}:${a.id}`)
        && currentGeometry.routes[placed.slotId]?.[a.id]).sort((a,b) => compareText(a.id,b.id));
      if (!available.length) break;
      const key = `${state.runtime.seed}:opportunity:${at}:${placed.slotId}:${n}`;
      const bowls = yard.bowls.filter((b) => lookup(YARD_FOODS, b.foodId) && integer(b.servings) && b.servings > 0).sort((a, b) => compareText(a.id, b.id));
      if (!bowls.length) break;
      const bowl = bowls[hash32(`${key}:bowl`) % bowls.length], pool = matchingVisitorCandidates(goodie, bowl, placed.condition);
      if (!pool.length) continue;
      const chance = Math.max(.08, Math.min(.96, (pool.some((p) => p.strict) ? .92 : .42)
        * getYardConditionProfile(goodie, placed.condition).attraction));
      // Every opportunity is probabilistic, including a first/rare encounter. Inventory/project hints cannot bypass it.
      if (randomUnit(`${key}:chance`) >= chance) continue;
      const visitor = chooseVisitor(pool, `${key}:visitor`);
      const poseMatches = available.filter((a) => visitor.poses.includes(a.pose));
      const poolActivities = poseMatches.length ? poseMatches : available;
      const activity = poolActivities[hash32(`${key}:activity`) % poolActivities.length];
      const route = currentGeometry.routes[placed.slotId][activity.id];
      const id = `visit_v2_${at.toString(36)}_${digest(`${key}:${visitor.id}:${activity.id}`).slice(0, 32)}`;
      const leavesAt = at + randomInt(`${key}:duration`, 45, 110) * 60000;
      if (state.runtime.visits[id]) continue;
      // A missing/unsupported media binding never consumes food, wear or petbook progress.
      // The callback receives copies so it cannot mutate the authoritative candidate.
      let admission;
      try { admission = admissionPolicy?.({ at, leavesAt, slotId: placed.slotId, visitId: id, visitor: clone(visitor), goodie: clone(goodie),
        activity: clone(activity), placement: clone(placed), bowl: clone(bowl), route: clone(route),
        yard: clone(displayYard), active: clone(Object.values(state.runtime.visits).filter(r => r.status === 'active' && r.leavesAt > at)),
        reserved: clone(Object.values(state.runtime.visits).filter(r => isReserved(r, at))) }); }
      catch (error) { admission = { ok: false, code: 'MEDIA_PREFLIGHT_ERROR', message: String(error.message) }; }
      if (!admission || admission.ok !== true || typeof admission.then === 'function') {
        emit(state, 'admission-blocked-media', at, { visitorId: visitor.id, goodieId: goodie.id,
          slotId: placed.slotId, activityId: activity.id, reason: admission?.code || 'MEDIA_POLICY_REQUIRED' });
        continue;
      }
      const plan = admission.binding?.plan;
      if (plan && !validPresentationPlan(plan, {at, leavesAt, slotId:placed.slotId})) {
        emit(state, 'admission-blocked-media', at, {visitorId:visitor.id, goodieId:goodie.id, slotId:placed.slotId, reason:'INVALID_SERVER_PRESENTATION_PLAN'});
        continue;
      }
      const walkMs = Math.max(300, Math.ceil(route.length / APPROACH_SPEED * 1000));
      const visit = { visitId: id, visitorId: visitor.id, goodieId: placed.goodieId, slotId: placed.slotId,
        bowlId: bowl.id, pose: activity.pose, activityId: activity.id, activityLayer: activity.layer,
        activityKind: activity.kind, stationary: activity.stationary, entryEdge: 'bottom',
        facing: activity.facing || 'right', motionSeed: digest(`${id}:motion`).slice(0, 16), arrivedAt: at, leavesAt };
      const record = { source: 'yard-v2', original: clone(visit), visitId: id, slotId: placed.slotId, activityId: activity.id,
        arrivedAt: at, leavesAt, releaseAt: plan?.propReleaseAt ?? at + Math.ceil((leavesAt - at) * RELEASE_PROGRESS),
        giftId: `gift_v2_${digest(id).slice(0, 32)}`, status: 'active', route: clone(route), placement: clone(placed),
        mediaAdmission: clone(admission.binding || null),
        timeline: { enterAt: at, approachAt: at + 500, alignAt: at + 500 + walkMs,
          settleAt: at + 900 + walkMs, interactAt: at + 1500 + walkMs, departAt: plan?.departureAt ?? leavesAt - walkMs } };
      state.runtime.visits[id] = record; yard.activeVisitors.push(visit);
      const entry = yard.petbook[visitor.id] || { visits: 0, firstSeenAt: at, lastSeenAt: at, favoriteGoodies: {}, mementoReceived: false };
      entry.visits = assertInteger(entry.visits + 1, 'petbook visits'); entry.firstSeenAt ??= at; entry.lastSeenAt = at; entry.favoriteGoodies ||= {};
      addCount(entry.favoriteGoodies, placed.goodieId, 1); yard.petbook[visitor.id] = entry;
      const savedPlacement = yard.placedGoodies.find(p => p.slotId === placed.slotId);
      savedPlacement.uses = assertInteger((savedPlacement.uses || 0) + 1, 'placement uses');
      savedPlacement.condition = savedPlacement.uses >= goodie.durability * 2 ? 'broken' : savedPlacement.uses >= goodie.durability ? 'worn' : 'new';
      // Preserve derived slot coordinates as display-only; update local condition for later capacity candidates.
      placed.uses = savedPlacement.uses; placed.condition = savedPlacement.condition;
      bowl.servings -= 1; if (bowl.servings <= 0) clearBowl(bowl);
      occupied.add(`${placed.slotId}:${activity.id}`); counts.set(placed.slotId, (counts.get(placed.slotId) || 0) + 1);
      available.splice(available.findIndex((a) => a.id === activity.id), 1);
      emit(state, 'visit-admitted', at, { visitId: id, visitorId: visitor.id, slotId: placed.slotId, activityId: activity.id });
    }
  }
}
/** All endpoint commands come from the server-authored preflight, never a client callback. */
export function validPresentationPlan(plan,{at,leavesAt,slotId}) {
  if (!plan || typeof plan!=='object' || Array.isArray(plan)) return false;
  for (const key of ['propReleaseAt','arrivalAt','departureAt'])
    if (!integer(plan[key]) || plan[key]<at || plan[key]>leavesAt) return false;
  if (plan.arrivalAt>plan.propReleaseAt || plan.propReleaseAt>plan.departureAt) return false;
  if (!Array.isArray(plan.propCommits)) return false;
  let previous=at;
  for (const commit of plan.propCommits) {
    if (!commit || commit.slotId!==slotId || !integer(commit.at) || commit.at<previous || commit.at>plan.propReleaseAt) return false;
    const t=commit.transform;
    if (!t || typeof t!=='object' || Array.isArray(t) || !['x','y','rotationZ','compression'].every(k=>Number.isFinite(t[k]))
      || Object.keys(t).some(k=>!['x','y','rotationZ','compression'].includes(k))
      || t.x<0 || t.x>100 || t.y<0 || t.y>100 || t.compression<=0 || t.compression>1) return false;
    previous=commit.at;
  }
  const segments=plan.segments||plan.schedule?.segments;
  if (!Array.isArray(segments)||!segments.length) return false;
  previous=at;
  for (const segment of segments) {
    if (!['hidden','route','clip','loop'].includes(segment.kind) || !integer(segment.startAt)||!integer(segment.endAt)
      ||segment.startAt!==previous||segment.endAt<segment.startAt||segment.endAt>leavesAt) return false;
    previous=segment.endAt;
  }
  return previous===leavesAt;
}
function pendingPropCommits(state) {
  const output=[];
  for (const record of Object.values(state.runtime.visits)) {
    if (record.status!=='active') continue;
    for (const [index,commit] of (record.mediaAdmission?.plan?.propCommits||[]).entries()) {
      const id=`${record.visitId}:${index}`;
      if (lookup(state.runtime.propCommitReceipts,id)===undefined) output.push({id,record,commit,index});
    }
  }
  return output.sort((a,b)=>a.commit.at-b.commit.at||compareText(a.id,b.id));
}
function applyDuePropCommits(state,commits,at) {
  for (const {id,record,commit,index} of commits.filter(c=>c.commit.at<=at)) {
    const rows=state.player.yard.placedGoodies.filter(p=>p.slotId===commit.slotId);
    if (rows.length!==1 || rows[0].goodieId!==record.original.goodieId)
      throw new Error('PRESERVE_AND_REVIEW:PROP_COMMIT_PLACEMENT_CHANGED');
    Object.assign(rows[0],clone(commit.transform));
    state.runtime.propCommitReceipts??={};
    put(state.runtime.propCommitReceipts,id,{visitId:record.visitId,index,at:commit.at,slotId:commit.slotId,transform:clone(commit.transform)});
    emit(state,'prop-transform-committed',commit.at,{visitId:record.visitId,index,slotId:commit.slotId});
  }
}
export function advanceYard(input, now, { scene, maxEvents = 100000, admissionPolicy, projectYard } = {}) {
  validateEnvelope(input); assertInteger(now, 'now');
  if (now < input.runtime.cursorMs) throw new RangeError('Cannot rewind authoritative time');
  const state = workingCopy(input), yard = state.player.yard; let steps = 0;
  while (true) {
    const departures = Object.values(state.runtime.visits).filter((r) => r.status === 'active').map((r) => r.leavesAt);
    const expiries = yard.bowls.filter((b) => b.foodId && integer(b.expiresAt)).map((b) => b.expiresAt);
    const propCommits = pendingPropCommits(state);
    const at = Math.min(state.runtime.nextOpportunityAt, ...departures, ...expiries, ...propCommits.map(c=>c.commit.at));
    if (at > now || !Number.isFinite(at)) break;
    if (++steps > maxEvents) throw new Error('Catch-up work budget exceeded; input remains unchanged; no elapsed interval silently skipped');
    applyDuePropCommits(state, propCommits, at);
    for (const r of Object.values(state.runtime.visits).filter((r) => r.status === 'active' && r.leavesAt <= at)
      .sort((a, b) => a.leavesAt - b.leavesAt || compareText(a.visitId, b.visitId))) completeVisit(state, r);
    for (const b of yard.bowls) if (b.foodId && b.expiresAt <= at) clearBowl(b);
    if (state.runtime.nextOpportunityAt === at) { opportunity(state, at, scene, { admissionPolicy, projectYard }); state.runtime.nextOpportunityAt += YARD_HOUR_MS; }
  }
  state.runtime.cursorMs = now; yard.lastSimulatedAt = now;
  return state;
}
export function applyPrototypeAction(input, action, payload = {}, { now, scene, actionId, admissionPolicy, projectYard } = {}) {
  const state = advanceYard(input, now, { scene, admissionPolicy, projectYard }), yard = state.player.yard;
  const fail = (error, details) => ({ status: 400, error, details, state });
  const ok = (extras = {}) => ({ status: 200, state, extras });
  if (action === 'yard.setFood') return setFood(yard, payload.bowlId || 'bowl-1', payload.foodId, now) ? ok() : fail('food unavailable');
  if (action === 'yard.collectGifts') {
    if (!actionId) return fail('stable actionId required for claims');
    const prior = lookup(state.runtime.actionReceipts, actionId); if (prior) return ok({ receipt: prior, replayed: true });
    const ids = new Set(), collected = { treats: 0, shinyTreats: 0, gifts: 0 };
    for (const g of yard.pendingGifts) {
      if (!g.id || ids.has(g.id) || !integer(g.treats) || !integer(g.shinyTreats)) return fail('ambiguous gift must be reviewed'); ids.add(g.id);
      if (state.runtime.giftLedger[g.id]?.status === 'claimed') continue;
      collected.treats += g.treats; collected.shinyTreats += g.shinyTreats; collected.gifts += 1;
    }
    for (const c of ['treats', 'shinyTreats']) assertInteger(yard.currencies[c] + collected[c], `currency ${c}`);
    for (const c of ['treats', 'shinyTreats']) yard.currencies[c] += collected[c];
    for (const g of yard.pendingGifts) if (lookup(state.runtime.giftLedger, g.id)?.status !== 'claimed') put(state.runtime.giftLedger, g.id, { ...lookup(state.runtime.giftLedger, g.id), status: 'claimed', claimedAt: now, gift: clone(g) });
    yard.pendingGifts = [];
    const receipt = { action, actionId, at: now, giftIds: [...ids], collected };
    put(state.runtime.actionReceipts, actionId, receipt); return ok({ receipt });
  }
  if (!['yard.placeGoodie', 'yard.moveGoodie', 'yard.pickupGoodie'].includes(action)) return fail('unsupported prototype action');
  const existing = yard.placedGoodies.find((p) => p.slotId === payload.slotId);
  if (action !== 'yard.placeGoodie' && !existing) return fail('placement not found');
  if (existing && Object.values(state.runtime.visits).some((r) => r.slotId === existing.slotId && isReserved(r, now))) return fail('prop is reserved');
  if (action === 'yard.pickupGoodie') {
    yard.placedGoodies = yard.placedGoodies.filter((p) => p !== existing); addCount(yard.goodieInventory, existing.goodieId, 1); return ok();
  }
  if (![payload.x, payload.y].every(Number.isFinite)) return fail('finite coordinates required');
  const goodieId = action === 'yard.placeGoodie' ? payload.goodieId : existing.goodieId;
  if (INVENTORY_ONLY_GOODS.includes(goodieId)) return fail('Merge output is owned-inventory-only pending authored Yard support');
  if (!lookup(YARD_GOODIES, goodieId)) return fail('unknown goodie');
  if (action === 'yard.placeGoodie' && (!(yard.goodieInventory[goodieId] > 0) || !payload.slotId || existing)) return fail('unowned goodie or duplicate/missing slotId');
  const candidate = existing ? { ...existing, x: payload.x, y: payload.y }
    : { goodieId, slotId: payload.slotId, x: payload.x, y: payload.y, uses: 0, condition: 'new', placedAt: now };
  const proposed = { ...yard, placedGoodies: existing ? yard.placedGoodies.map((p) => p === existing ? candidate : p) : [...yard.placedGoodies, candidate] };
  const projected = projectYard ? projectYard(clone(proposed), { scene }) : null;
  const validation = projected ? projected.geometry : validateLayout(proposed, scene); if (!validation.ok) return fail('invalid placement', validation.errors);
  const box=footprint(candidate,scene);
  const held=Object.values(state.runtime.visits).filter(r=>r.status==='active'&&now<r.leavesAt);
  if (held.some(r=>(r.mediaAdmission?.plan?.reservationBoxes||[]).some(reserved=>overlaps(box,reserved))))
    return fail('placement intersects reserved visit path', [{code:'VISIT_REGION_RESERVED',slotId:candidate.slotId}]);
  yard.placedGoodies = proposed.placedGoodies;
  if (action === 'yard.placeGoodie') addCount(yard.goodieInventory, goodieId, -1);
  return ok({ placement: candidate });
}
