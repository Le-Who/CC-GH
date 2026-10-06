/** Read-only compatibility projections. Derived anchors never enter saved state.
 * Visit economics belong to core; absent authored motion stays absent. */
import { YARD_SLOT_LAYOUTS, YARD_GOODIES, YARD_VISITORS } from './catalog.mjs';
import { digest } from './util.mjs';
import { validateLayout } from './geometry.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => object(value) && Object.hasOwn(value, key);
const lookup = (record, key) => own(record, key) ? record[key] : undefined;
const copy = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const issue = (code, extra = {}) => ({ code, ...extra });
const yardOf = value => value?.player?.yard ?? value?.yard ?? value;

export const legacyPlacementKey = raw => digest({slotId:raw?.slotId??null,goodieId:raw?.goodieId??null,placedAt:raw?.placedAt??null});
function anchorDescriptor(raw, yard, index, legacyAnchors) {
  const saved = copy(raw), goodieId = object(raw) ? raw.goodieId : undefined;
  const slotId = object(raw) ? raw.slotId : undefined;
  const goodie = lookup(YARD_GOODIES, goodieId);
  const level = yard?.expansion?.level >= 2 ? 2 : 1;
  const slot = YARD_SLOT_LAYOUTS[level].find(candidate => candidate.id === slotId);
  const problems = [];
  let anchor = null, anchorSource = null;
  if (!object(raw)) problems.push(issue('MALFORMED_PLACEMENT', { index }));
  else if (finite(raw.x) && finite(raw.y)) {
    anchor = { x: raw.x, y: raw.y }; anchorSource = 'saved-coordinates';
  } else if (!own(raw, 'x') && !own(raw, 'y')) {
    const frozen = lookup(legacyAnchors?.items, legacyPlacementKey(raw));
    if (own(legacyAnchors?.items, legacyPlacementKey(raw))) {
      const importedSlot = object(frozen) && [1,2].includes(frozen.sourceExpansionLevel)
        ? YARD_SLOT_LAYOUTS[frozen.sourceExpansionLevel].find(s => s.id === frozen.slotId) : null;
      if (legacyAnchors.format === 'yard-legacy-display-anchors/v1' && object(frozen) && importedSlot
        && frozen.slotId === slotId && frozen.goodieId === goodieId && frozen.source === 'baseline-slot-display-only'
        && finite(frozen.x) && finite(frozen.y) && frozen.x === importedSlot.x && frozen.y === importedSlot.y) {
        anchor = { x: frozen.x, y: frozen.y }; anchorSource = 'legacy-slot-frozen';
        if (goodie?.size === 'large' && importedSlot.size !== 'large') problems.push(issue('LEGACY_SLOT_SIZE_MISMATCH', { slotId }));
      } else problems.push(issue('INVALID_FROZEN_LEGACY_ANCHOR', { slotId }));
    } else if (slot) {
      anchor = { x: slot.x, y: slot.y }; anchorSource = 'legacy-slot';
      if (goodie?.size === 'large' && slot.size !== 'large') problems.push(issue('LEGACY_SLOT_SIZE_MISMATCH', { slotId }));
    } else problems.push(issue('LEGACY_SLOT_UNAVAILABLE', { slotId, expansionLevel: level }));
  } else problems.push(issue('INVALID_SAVED_COORDINATES', { slotId }));
  if (!goodie) problems.push(issue('UNKNOWN_GOODIE', { slotId, goodieId }));
  if (typeof slotId !== 'string' || !slotId) problems.push(issue('PLACEMENT_SLOT_ID_MISSING', { index }));
  const displayPlacement = anchorSource?.startsWith('legacy-slot') ? { ...saved, ...anchor } : copy(saved);
  return { index, raw: saved, slotId, goodieId, knownGoodie: Boolean(goodie), anchor,
    anchorSource, expansionLevel: level, displayOnly: true, displayPlacement, issues: problems };
}

function appliesTo(error, descriptor) {
  return own(error, 'slotId') && error.slotId === descriptor.slotId
    || Array.isArray(error.slots) && error.slots.includes(descriptor.slotId)
    || own(error, 'index') && error.index === descriptor.index;
}

/** Project every row together before layout validation. Unresolved rows remain
 * unchanged in the returned copy and block admission; nothing is persisted. */
export function resolveYardDisplay(yard, { scene, legacyAnchors } = {}) {
  if (!object(yard)) return { yard: copy(yard), placements: [], ok: false,
    displayOnly: true, issues: [issue('MALFORMED_YARD')] };
  const displayYard = copy(yard);
  if (!Array.isArray(yard.placedGoodies)) return { yard: displayYard, placements: [], ok: false,
    displayOnly: true, issues: [issue('PLACEMENTS_ARRAY_REQUIRED')] };
  const placements = yard.placedGoodies.map((raw, index) => anchorDescriptor(raw, yard, index, legacyAnchors));
  displayYard.placedGoodies = placements.map(p => copy(p.displayPlacement));
  let validation;
  if (displayYard.placedGoodies.some(row => !object(row))) {
    validation = { ok: false, errors: [issue('MALFORMED_LAYOUT_ROWS')], routes: {} };
  } else {
    try { validation = validateLayout(displayYard, scene); }
    catch (error) { validation = { ok: false, errors: [issue('LAYOUT_VALIDATION_FAILED', { detail: String(error.message) })], routes: {} }; }
  }
  const issues = [...placements.flatMap(p => p.issues), ...validation.errors];
  const ok = validation.ok && issues.length === 0;
  for (const descriptor of placements) {
    descriptor.issues.push(...validation.errors.filter(error => appliesTo(error, descriptor)));
    descriptor.geometry = { ok: Boolean(descriptor.anchor) && descriptor.knownGoodie && descriptor.issues.length === 0,
      layoutOk: ok, issues: copy(descriptor.issues) };
    descriptor.status = !descriptor.knownGoodie ? 'unsupported-goodie'
      : descriptor.geometry.ok ? 'displayable' : 'reposition-needed';
    descriptor.repositionNeeded = descriptor.status === 'reposition-needed';
    descriptor.recoverable = descriptor.knownGoodie;
    descriptor.recovery = descriptor.repositionNeeded ? 'explicit-placement-action-required'
      : !descriptor.knownGoodie ? 'catalog-support-or-review-required' : null;
  }
  return { yard: displayYard, placements, ok, issues: copy(issues), displayOnly: true,
    geometry: { ...validation, ok, errors: copy(issues) } };
}

/** Standalone row lookup uses the full projected yard when possible. */
export function resolvePlacementDisplay(placement, yard, options = {}) {
  const rows = Array.isArray(yard?.placedGoodies) ? yard.placedGoodies : [];
  let index = rows.indexOf(placement);
  if (index < 0 && object(placement)) {
    const matches = rows.map((row, i) => ({ row, i })).filter(({ row }) => object(row)
      && row.slotId === placement.slotId && row.goodieId === placement.goodieId);
    if (matches.length === 1) index = matches[0].i;
  }
  if (index >= 0) {
    const contextualYard = { ...yard, placedGoodies: rows.map((row, i) => i === index ? copy(placement) : row) };
    return resolveYardDisplay(contextualYard, options).placements[index];
  }
  const result = resolveYardDisplay({ ...(object(yard) ? yard : {}), placedGoodies: [...rows, copy(placement)] }, options);
  return result.placements.at(-1);
}

function visitDescriptor(record, context, options, display) {
  const validRecord = object(record), original = validRecord && object(record.original) ? record.original : record;
  const visitorId = object(original) ? original.visitorId : undefined;
  const goodieId = object(original) ? original.goodieId : undefined;
  const visitor = lookup(YARD_VISITORS, visitorId), goodie = lookup(YARD_GOODIES, goodieId);
  const status = validRecord && typeof record.status === 'string' ? record.status : 'unindexed-legacy';
  const now = finite(options.now) ? options.now : finite(context?.runtime?.cursorMs) ? context.runtime.cursorMs : null;
  const slotId = validRecord ? record.slotId ?? original?.slotId : undefined;
  const matches = display.placements.filter(p => typeof slotId === 'string' && p.slotId === slotId);
  const placementDisplay = matches.length === 1 ? matches[0] : null;
  const issues = [];
  if (!validRecord) issues.push(issue('MALFORMED_VISIT_RECORD'));
  if (!visitor) issues.push(issue('UNKNOWN_VISITOR', { visitorId }));
  if (!goodie) issues.push(issue('UNKNOWN_VISIT_GOODIE', { goodieId }));
  if (!matches.length) issues.push(issue('VISIT_PLACEMENT_MISSING', { slotId }));
  else if (matches.length > 1) issues.push(issue('VISIT_PLACEMENT_AMBIGUOUS', { slotId }));
  else if (placementDisplay.goodieId !== goodieId) issues.push(issue('VISIT_PLACEMENT_GOODIE_CHANGED', { slotId }));
  const hasTimeline = validRecord && object(record.timeline);
  const legacy = validRecord && record.source === 'legacy';
  const coreOwned = legacy && status === 'active' && Boolean(visitor && goodie);
  const completionDue = coreOwned && now !== null && finite(record.leavesAt) && now >= record.leavesAt;
  let phase = status;
  if (status === 'active' && !hasTimeline) phase = completionDue ? 'awaiting-core-completion'
    : now !== null && finite(record.releaseAt) && now >= record.releaseAt ? 'legacy-released' : 'legacy-interaction';
  return { kind: hasTimeline && !legacy ? 'timeline-presentation-required' : 'legacy-visit-status',
    visitId: validRecord ? record.visitId ?? original?.visitId : undefined, visitorId, goodieId, slotId,
    source: validRecord ? record.source ?? 'legacy-unindexed' : 'malformed', status, phase,
    raw: copy(record), original: copy(original), displayOnly: true, now,
    placementDisplay, placementStatus: matches.length > 1 ? 'ambiguous' : placementDisplay?.status ?? 'missing',
    root: null, position: null, animation: null, canAnimate: false,
    motionStatus: hasTimeline && !legacy ? 'requires-authored-adapter' : 'legacy-motion-unavailable',
    visitorKnown: Boolean(visitor), goodieKnown: Boolean(goodie),
    completionPolicy: coreOwned ? 'core-owned' : 'preserve-outcome', completionDue,
    reservation: { slotId, reserved: validRecord && ['active', 'unsupported-legacy'].includes(status)
      && now !== null && finite(record.releaseAt) && now < record.releaseAt },
    issues, economics: { owner: 'core', presentationMutatesState: false, presentationCreatesGifts: false } };
}

/** Safe even for timeline:null, missing props, unknown visitors and history. It
 * never places a pet at the recovered prop anchor or predicts a reward. */
export function resolveLegacyPresentation(record, stateOrYard, options = {}) {
  return visitDescriptor(record, stateOrYard, options, resolveYardDisplay(yardOf(stateOrYard), options));
}

export function resolveLegacyPresentations(state, options = {}) {
  const display = resolveYardDisplay(yardOf(state), options);
  return Object.values(object(state?.runtime?.visits) ? state.runtime.visits : {})
    .filter(record => !object(record) || record.source === 'legacy' || record.timeline == null)
    .map(record => visitDescriptor(record, state, options, display));
}

/** Exact ID lookup only; a missing runtime record is not synthesized. */
export function findLegacyPresentation(state, visitId, options = {}) {
  const record = lookup(state?.runtime?.visits, visitId);
  return record === undefined ? null : resolveLegacyPresentation(record, state, options);
}
