/** Source-only finite cruise replay. No saved-visit admission or runtime wiring. */
import calibrationSource from '../../src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json' with {type: 'json'};
import envelopeSource from '../../src/games/companion-yard-v2/mika-qa/mika-p2-skin-envelope.json' with {type: 'json'};
import maskSource from '../../src/games/companion-yard-v2/mika-qa/meadow-mask.json' with {type: 'json'};
import {planMikaYardQaCruise} from '../../src/games/companion-yard-v2/mika-qa/mika-yard-route.mjs';
import {MIKA_NATIVE_PROFILE} from './mika-native-profile.mjs';
import {canonical, deepFreeze} from './util.mjs';

const calibration = deepFreeze(structuredClone(calibrationSource));
const envelope = deepFreeze(structuredClone(envelopeSource));
const maskRows = deepFreeze(structuredClone(maskSource.rows));
const MAX_JSON_CHARS = 16384, MAX_CLEAR_CANDIDATES = 70 * 8 * 2;
const fail = reason => ({ok: false, reason});
const same = (a, b) => canonical(a) === canonical(b);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, required, optional = []) => record(value)
  && required.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 128
  && !/[\u0000-\u001f]/u.test(value);
const validIndex = value => Number.isSafeInteger(value) && value >= 0 && value < MAX_CLEAR_CANDIDATES;

// Accept wire JSON only: no caller objects, getters, functions, or toJSON hooks.
function parseJson(json) {
  if (typeof json !== 'string' || json.length > MAX_JSON_CHARS) return null;
  try {
    const value = JSON.parse(json), pending = [[value, 0]];
    let nodes = 0;
    while (pending.length) {
      const [part, depth] = pending.pop();
      if (++nodes > 2048 || depth > 8) return null;
      if (typeof part === 'number' && !Number.isFinite(part)) return null;
      if (typeof part === 'string' && part.length > 128) return null;
      if (part !== null && typeof part === 'object') {
        const keys = Object.keys(part);
        if (keys.length > (Array.isArray(part) ? 64 : 16) || keys.some(key => key.length > 128)) return null;
        for (const key of keys) pending.push([part[key], depth + 1]);
      }
    }
    return value;
  } catch { return null; }
}
function validLayout(layout) {
  if (!fields(layout, ['remodel', 'maskRows', 'obstacles']) || layout.remodel !== 'meadow'
    || !same(layout.maskRows, maskRows) || !Array.isArray(layout.obstacles) || layout.obstacles.length > 32) return false;
  const ids = new Set();
  return layout.obstacles.every(box => {
    if (!fields(box, ['id', 'x', 'y', 'width', 'height'], ['goodieId', 'condition'])
      || !text(box.id) || ids.has(box.id)
      || ![box.x, box.y].every(value => Number.isFinite(value) && value >= -100 && value <= 100)
      || ![box.width, box.height].every(value => Number.isFinite(value) && value > 0 && value <= 200)
      || (Object.hasOwn(box, 'goodieId') && !text(box.goodieId))
      || (Object.hasOwn(box, 'condition') && box.condition !== null && !text(box.condition))) return false;
    ids.add(box.id); return true;
  });
}
const header = deepFreeze({
  format: 'native-mika-finite-cruise-recipe/v1',
  identity: MIKA_NATIVE_PROFILE.identity,
  sources: MIKA_NATIVE_PROFILE.sources,
  geometry: MIKA_NATIVE_PROFILE.geometry,
  time: {units: 'seconds', activeStart: 0, activeEnd: 4, historyStart: -2,
    historyEnd: 6, stepSeconds: .001, phaseOriginTime: 0, phaseOffset: 0},
});

function build(layout, clearCandidateIndex) {
  let clear = 0;
  const plan = planMikaYardQaCruise(layout, calibration, envelope,
    {acceptSweep: () => clear++ === clearCandidateIndex});
  if (!plan.ok) return plan;
  const selection = {clearCandidateIndex, start: plan.start, heading: plan.heading, turnRadians: plan.turnRadians};
  const json = JSON.stringify({...header, layout, selection});
  if (json.length > MAX_JSON_CHARS) return fail('MIKA_CRUISE_RECIPE_BUDGET');
  return {ok: true, plan, json};
}

/** Prepare the exact pinned planner and its bounded replay inputs together.
 * The ordinal counts only candidates that already passed mask/obstacle checks.
 * It cannot bypass those checks or encode an arbitrary root/phase function.
 * This does not serialize foreign plans, acceptSweep code, or viewport approval.
 */
export function prepareMikaNativeCruise(layoutJson, clearCandidateIndex = 0) {
  const layout = parseJson(layoutJson);
  if (!validLayout(layout)) return fail('INVALID_MIKA_CRUISE_LAYOUT');
  if (!validIndex(clearCandidateIndex)) return fail('INVALID_MIKA_CRUISE_SELECTION');
  return build(layout, clearCandidateIndex);
}

/** Rebuild in a new process using the same shipped sources and current layout.
 * The returned plan must be sampled with sampleMikaYardQaCruise: its original
 * changed-layout and per-frame pose-envelope abort guards remain authoritative.
 */
export function reconstructMikaNativeCruise(recipeJson, layoutJson) {
  const recipe = parseJson(recipeJson), layout = parseJson(layoutJson);
  if (!fields(recipe, [...Object.keys(header), 'layout', 'selection'])
    || !Object.entries(header).every(([key, expected]) => same(recipe[key], expected))
    || !fields(recipe.selection, ['clearCandidateIndex', 'start', 'heading', 'turnRadians'])
    || !validIndex(recipe.selection.clearCandidateIndex)
    || !fields(recipe.selection.start, ['x', 'y'])
    || ![recipe.selection.start.x, recipe.selection.start.y, recipe.selection.heading,
      recipe.selection.turnRadians].every(Number.isFinite)
    || !validLayout(recipe.layout)) return fail('INVALID_MIKA_CRUISE_RECIPE');
  if (!validLayout(layout)) return fail('INVALID_MIKA_CRUISE_LAYOUT');
  if (!same(recipe.layout, layout)) return fail('MIKA_CRUISE_LAYOUT_CHANGED');
  const rebuilt = build(layout, recipe.selection.clearCandidateIndex);
  if (!rebuilt.ok) return rebuilt;
  if (!same(recipe.selection, JSON.parse(rebuilt.json).selection)) return fail('MIKA_CRUISE_SELECTION_MISMATCH');
  return rebuilt;
}
