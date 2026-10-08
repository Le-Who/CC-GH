/** Native presentation checkpoints, separate from saved visits and economy.
 * Requests carry finite selections only. A checkpoint is made by validating
 * that selection against the server's current binding and previous checkpoint.
 * Stored descriptors are server-owned; their digest detects corruption, not
 * authorization. Never accept a request-supplied checkpoint as prior authority.
 */
import calibrationSource from '../../src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json' with {type: 'json'};
import envelopeSource from '../../src/games/companion-yard-v2/mika-qa/mika-p2-skin-envelope.json' with {type: 'json'};
import mask from '../../src/games/companion-yard-v2/mika-qa/meadow-mask.json' with {type: 'json'};
import {planMikaItemArrival, planMikaItemContinuation} from '../../src/games/companion-yard-v2/mika-qa/mika-item-approach.mjs';
import {sampleMikaYardQaCruise, sampleMikaYardQaSettledDescriptor} from '../../src/games/companion-yard-v2/mika-qa/mika-yard-route.mjs';
import {boundMikaPose} from '../../src/games/companion-yard-v2/mika-qa/mika-envelope.mjs';
import {MIKA_NATIVE_PROFILE} from './mika-native-profile.mjs';
import {canonical, deepFreeze, digest} from './util.mjs';

const calibration = deepFreeze(structuredClone(calibrationSource));
const envelope = deepFreeze(structuredClone(envelopeSource));
export const MIKA_NATIVE_RECIPE_MAX_CHARS = 16384;
export const MIKA_NATIVE_SETTLED_SOURCES = deepFreeze({
  ...MIKA_NATIVE_PROFILE.sources,
  cruise: '50b45538c20f797107cc75cf8b73e15135566ce8ff077c1c46545fc912f78f85',
  itemApproach: '546e43f514bb927c1a23811b22d16139571540faf04df21d0cd1d1d05a150f81',
});
export const MIKA_NATIVE_SETTLED_SOURCE_HASH = digest({
  format: 'native-mika-finite-action-sources/v1', sources: MIKA_NATIVE_SETTLED_SOURCES,
});
const ACTION_FORMAT = 'native-mika-finite-action-recipe/v1';
const CHECKPOINT_FORMAT = 'native-mika-settled-checkpoint/v1';
const fail = reason => ({ok: false, reason});
const same = (a, b) => canonical(a) === canonical(b);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, keys) => record(value) && keys.length === Object.keys(value).length
  && keys.every(key => Object.hasOwn(value, key));
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 128
  && !/[\u0000-\u001f]/u.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const point = value => fields(value, ['x', 'y'])
  && [value.x, value.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100);
const turns = [-Math.PI / 12, Math.PI / 12];
const headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2,
  Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4];

// Parse wire strings before inspecting fields: caller objects cannot execute
// getters/toJSON/functions. Work is capped before any route/contact generation.
function parseJson(json) {
  if (typeof json !== 'string' || json.length > MIKA_NATIVE_RECIPE_MAX_CHARS) return null;
  try {
    const value = JSON.parse(json), pending = [[value, 0]];
    let count = 0;
    while (pending.length) {
      const [part, depth] = pending.pop();
      if (++count > 256 || depth > 6) return null;
      if (typeof part === 'number' && !Number.isFinite(part)) return null;
      if (typeof part === 'string' && part.length > 128) return null;
      if (part !== null && typeof part === 'object') {
        const keys = Object.keys(part);
        if (keys.length > 16 || keys.some(key => key.length > 128)) return null;
        for (const key of keys) pending.push([part[key], depth + 1]);
      }
    }
    return value;
  } catch { return null; }
}
function validSelection(selection) {
  return selection?.kind === 'arrival'
    ? fields(selection, ['kind', 'start', 'heading', 'turnRadians']) && point(selection.start)
      && headings.includes(selection.heading) && turns.includes(selection.turnRadians)
    : fields(selection, ['kind', 'turnAwayRadians', 'cruiseSeconds', 'turnRadians'])
      && selection.kind === 'continuation' && [0, -Math.PI / 2, Math.PI / 2].includes(selection.turnAwayRadians)
      && [2, 3, 4].includes(selection.cruiseSeconds) && turns.includes(selection.turnRadians);
}
function validOrigin(origin) {
  return fields(origin, ['position', 'heading']) && Array.isArray(origin.position)
    && origin.position.length === 3 && origin.position[2] === 0
    && origin.position.every(n => Number.isFinite(n) && n >= 0 && n <= 12.5)
    && Number.isFinite(origin.heading) && Math.abs(origin.heading) <= 1e6;
}
function validBound(bound) {
  const binding = bound?.binding, layout = binding?.layout;
  return bound?.ok === true && text(binding?.accountId) && typeof bound.key === 'string'
    && bound.key.length <= 16384 && canonical(binding) === bound.key
    && Array.isArray(binding.items) && binding.items.length <= 14
    && binding.items.every(item => text(item.slotId) && point({x: item.x, y: item.y}))
    && layout?.remodel === 'meadow' && same(layout.maskRows, mask.rows)
    && Array.isArray(layout.obstacles) && layout.obstacles.length <= 15;
}
/** Same binding hash used by the server wrapper, including account and items. */
export function mikaNativeLayoutHash(bound) {
  return validBound(bound) ? digest(bound.key) : null;
}
function targetFor(bound, targetSlotId) {
  return bound.binding.items.find(item => item.slotId === targetSlotId && item.goodieId === 'yarn_mouse');
}
function terminal(plan, bound) {
  const result = sampleMikaYardQaCruise(plan, bound.binding.layout, plan.duration);
  return result.status === 'ready' && result.sample.motionPhase === 'standing-idle'
    && result.sample.rootSpeed === 0 && result.sample.reachFailures.length === 0 ? result.sample : null;
}
function selectionFor(plan) {
  if (plan?.format === 'mika-normal-yard-qa-arrival/v1') return {
    kind: 'arrival', start: {...plan.start}, heading: plan.heading, turnRadians: plan.turnRadians,
  };
  if (plan?.format === 'mika-normal-yard-current-pose/v1') return {
    kind: 'continuation', turnAwayRadians: plan.turnAwayRadians,
    cruiseSeconds: plan.cruiseSeconds, turnRadians: plan.turnRadians,
  };
  return null;
}
/** Export only a prepared admitted plan. Call after its terminal draw succeeds.
 * The server independently checks the chosen target, origin and swept body.
 */
export function createMikaNativeActionRecipe(plan, bound, targetSlotId) {
  const bindingHash = mikaNativeLayoutHash(bound), selection = selectionFor(plan);
  if (!bindingHash || !text(targetSlotId) || !targetFor(bound, targetSlotId)
    || !validSelection(selection)) return fail('INVALID_MIKA_NATIVE_ACTION');
  const sample = terminal(plan, bound);
  if (!sample) return fail('UNPREPARED_MIKA_NATIVE_ACTION');
  const recipeJson = JSON.stringify({format: ACTION_FORMAT, sourceHash: MIKA_NATIVE_SETTLED_SOURCE_HASH,
    bindingHash, targetSlotId, selection, terminalHash: digest(sample)});
  return {ok: true, recipeJson};
}
function checkpointFor(recipe, descriptor, sample) {
  const body = {format: CHECKPOINT_FORMAT, sourceHash: MIKA_NATIVE_SETTLED_SOURCE_HASH,
    bindingHash: recipe.bindingHash, targetSlotId: recipe.targetSlotId, descriptor, terminalHash: digest(sample)};
  return JSON.stringify({...body, integrityHash: digest(body)});
}
function settledPresentation(sample) {
  const bounds = boundMikaPose(sample, envelope, {includeCorners: true});
  const position = {x: sample.root.position[0] * 8, y: sample.root.position[1] * 8};
  const yaw = sample.root.heading;
  const body = bounds.points.map(([x, y]) => ({
    x: position.x + 8 * (Math.cos(yaw) * x - Math.sin(yaw) * y),
    y: position.y + 8 * (Math.sin(yaw) * x + Math.cos(yaw) * y),
  }));
  const {points, ...poseEnvelope} = bounds;
  return {position, envelope: poseEnvelope, body, vertical: {min: bounds.min[2], max: bounds.max[2]}};
}
/** Fast restore of server-owned storage: one fixed cruise table and the final
 * arrival pose, no selection search, pivot/departure preparation or sweep.
 * Missing state is handled by the caller; invalid state is never bootstrap.
 */
export function reconstructMikaNativeSettled(checkpointJson, bound) {
  const checkpoint = parseJson(checkpointJson), bindingHash = mikaNativeLayoutHash(bound);
  if (!bindingHash) return fail('INVALID_MIKA_NATIVE_BINDING');
  if (!fields(checkpoint, ['format', 'sourceHash', 'bindingHash', 'targetSlotId', 'descriptor', 'terminalHash', 'integrityHash'])
    || checkpoint.format !== CHECKPOINT_FORMAT || !text(checkpoint.targetSlotId)
    || !hash(checkpoint.bindingHash) || !hash(checkpoint.terminalHash) || !hash(checkpoint.integrityHash)
    || !validSelection(checkpoint.descriptor?.selection)) return fail('INVALID_MIKA_NATIVE_CHECKPOINT');
  if (checkpoint.sourceHash !== MIKA_NATIVE_SETTLED_SOURCE_HASH) return fail('MIKA_NATIVE_SOURCE_MISMATCH');
  const descriptor = checkpoint.descriptor, isArrival = descriptor.selection.kind === 'arrival';
  if (!fields(descriptor, isArrival ? ['selection'] : ['selection', 'origin'])
    || (!isArrival && !validOrigin(descriptor.origin))) return fail('INVALID_MIKA_NATIVE_CHECKPOINT');
  const {integrityHash, ...body} = checkpoint;
  if (digest(body) !== integrityHash) return fail('MIKA_NATIVE_CHECKPOINT_INTEGRITY');
  if (checkpoint.bindingHash !== bindingHash) return fail('MIKA_NATIVE_LAYOUT_CHANGED');
  if (!targetFor(bound, checkpoint.targetSlotId)) return fail('NATIVE_ITEM_TARGET_UNAVAILABLE');
  try {
    const sample = sampleMikaYardQaSettledDescriptor(calibration, descriptor);
    if (digest(sample) !== checkpoint.terminalHash) return fail('MIKA_NATIVE_TERMINAL_MISMATCH');
    return {ok: true, sample, ...settledPresentation(sample), targetSlotId: checkpoint.targetSlotId};
  } catch { return fail('INVALID_MIKA_NATIVE_CHECKPOINT'); }
}
/** One selected finite candidate, with exactly the existing target/collision
 * checks. Only the server's previous checkpoint may supply a continuation root.
 * Maximum sampled sweep is 535 poses (13.35s * 40Hz, inclusive), never 18 routes.
 */
export function validateMikaNativeAction(recipeJson, bound, previousCheckpointJson = null) {
  const recipe = parseJson(recipeJson), bindingHash = mikaNativeLayoutHash(bound);
  if (!bindingHash) return fail('INVALID_MIKA_NATIVE_BINDING');
  if (!fields(recipe, ['format', 'sourceHash', 'bindingHash', 'targetSlotId', 'selection', 'terminalHash'])
    || recipe.format !== ACTION_FORMAT || !text(recipe.targetSlotId) || !validSelection(recipe.selection)
    || !hash(recipe.bindingHash) || !hash(recipe.terminalHash)) return fail('INVALID_MIKA_NATIVE_RECIPE');
  if (recipe.sourceHash !== MIKA_NATIVE_SETTLED_SOURCE_HASH) return fail('MIKA_NATIVE_SOURCE_MISMATCH');
  if (recipe.bindingHash !== bindingHash) return fail('MIKA_NATIVE_LAYOUT_CHANGED');
  if (!targetFor(bound, recipe.targetSlotId)) return fail('NATIVE_ITEM_TARGET_UNAVAILABLE');
  const previous = previousCheckpointJson === null ? null : reconstructMikaNativeSettled(previousCheckpointJson, bound);
  if (previous && !previous.ok) return previous;
  if (recipe.selection.kind === 'arrival' && previous) return fail('MIKA_NATIVE_BOOTSTRAP_ALREADY_SETTLED');
  if (recipe.selection.kind === 'continuation' && !previous) return fail('MIKA_NATIVE_CHECKPOINT_REQUIRED');
  try {
    const options = {targetSlotId: recipe.targetSlotId, selectedCandidate: recipe.selection};
    const selected = previous
      ? planMikaItemContinuation(bound, calibration, envelope, previous.sample, recipe.targetSlotId, options)
      : planMikaItemArrival(bound, calibration, envelope, options);
    if (!selected.ok) return selected;
    if (!same(selectionFor(selected.plan), recipe.selection)) return fail('MIKA_NATIVE_SELECTION_MISMATCH');
    const sample = terminal(selected.plan, bound);
    if (!sample || digest(sample) !== recipe.terminalHash) return fail('MIKA_NATIVE_TERMINAL_MISMATCH');
    const descriptor = {selection: recipe.selection,
      ...(previous ? {origin: structuredClone(previous.sample.root)} : {})};
    const checkpointJson = checkpointFor(recipe, descriptor, sample);
    return {ok: true, checkpointJson, sample, plan: selected.plan, targetSlotId: recipe.targetSlotId};
  } catch { return fail('INVALID_MIKA_NATIVE_ACTION'); }
}
