import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import calibration from '../src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json' with {type: 'json'};
import envelope from '../src/games/companion-yard-v2/mika-qa/mika-p2-skin-envelope.json' with {type: 'json'};
import mask from '../src/games/companion-yard-v2/mika-qa/meadow-mask.json' with {type: 'json'};
import {planMikaYardQaCruise, sampleMikaYardQaCruise} from '../src/games/companion-yard-v2/mika-qa/mika-yard-route.mjs';
import {prepareMikaNativeCruise, reconstructMikaNativeCruise} from '../game-logic/yard-v2/mika-native-cruise-replay.mjs';
import {MIKA_NATIVE_PROFILE} from '../game-logic/yard-v2/mika-native-profile.mjs';
import {evaluateMikaNativeAdmission} from '../game-logic/yard-v2/mika-native-admission-contract.mjs';

const layout = {remodel: 'meadow', maskRows: mask.rows,
  obstacles: [{id: 'bowl-1', x: 21.15, y: 79.15, width: 7.7, height: 7.7}]};
const layoutJson = JSON.stringify(layout);

test('a JSON recipe rebuilds the qualified four-second cruise through its existing public planner', () => {
  const original = planMikaYardQaCruise(layout, calibration, envelope);
  const prepared = prepareMikaNativeCruise(layoutJson);
  assert.equal(prepared.ok, true);
  assert.equal(typeof prepared.json, 'string');
  assert.deepEqual(prepared.plan, original);
  const replay = reconstructMikaNativeCruise(prepared.json, layoutJson);
  assert.equal(replay.ok, true);
  assert.deepEqual(replay.plan, original);
  for (const time of [0, .237, 1.123, 2.331, 3.987, 4, 1.123, 0]) {
    const expected = sampleMikaYardQaCruise(original, layout, time);
    assert.equal(expected.status, 'ready');
    assert.deepEqual(sampleMikaYardQaCruise(replay.plan, layout, time), expected);
  }
});

test('bounded candidate selection preserves different anchors, headings and both turn phases', () => {
  const starts = new Set(), headings = new Set(), turns = new Set();
  for (const index of [0, 1, 2, 3, 12, 16, 24]) {
    let clear = 0;
    const original = planMikaYardQaCruise(layout, calibration, envelope, {acceptSweep: () => clear++ === index});
    const prepared = prepareMikaNativeCruise(layoutJson, index);
    const replay = reconstructMikaNativeCruise(prepared.json, layoutJson);
    assert.equal(replay.ok, true);
    assert.deepEqual(replay.plan, original);
    starts.add(JSON.stringify(original.start)); headings.add(original.heading); turns.add(original.turnRadians);
    for (const time of [0, .001, .237, .55, 1.123, 2.331, 3.4, 3.987, 4, 1.123]) {
      const expected = sampleMikaYardQaCruise(original, layout, time);
      const actual = sampleMikaYardQaCruise(replay.plan, layout, time);
      assert.equal(expected.status, 'ready', `original candidate ${index} at ${time}`);
      assert.equal(actual.status, 'ready', `replayed candidate ${index} at ${time}`);
      assert.deepEqual(actual, expected);
    }
  }
  assert.equal(starts.size, 3); assert.equal(headings.size, 3); assert.equal(turns.size, 2);
});

test('wrong pins, stale geometry, time extensions and caller-supplied route data fail closed', () => {
  const valid = prepareMikaNativeCruise(layoutJson).json;
  const mutations = [
    r => { r.format = 'native-mika-finite-cruise-recipe/v2'; },
    r => { r.identity.profileId = 'native-mika-p2/r2'; },
    r => { r.identity.modelSha256 = '0'.repeat(64); },
    r => { r.identity.unitsPerSource = 16; },
    r => { r.geometry.id = 'stale-mask'; },
    r => { r.geometry.domain.max[0] = 200; },
    r => { r.geometry.unitsPerSource = 16; },
    ...Object.keys(JSON.parse(valid).sources).map(role => r => { r.sources[role] = '0'.repeat(64); }),
    r => { r.time.units = 'milliseconds'; },
    r => { r.time.activeEnd = 5; },
    r => { r.time.historyStart = -3; },
    r => { r.time.stepSeconds = .002; },
    r => { r.time.phaseOffset = .5; },
    r => { r.selection.start.x += 6; },
    r => { r.selection.heading = Math.PI; },
    r => { r.selection.turnRadians *= -1; },
    r => { r.selection.clearCandidateIndex = -1; },
    r => { r.selection.clearCandidateIndex = 1120; },
    r => { r.selection.clearCandidateIndex = .5; },
    r => { r.selection.clearCandidateIndex = '0'; },
    r => { r.sweep = [{x: 0, y: 0}]; },
    r => { r.roots = [[0, 0, 0]]; },
    r => { r.phaseAt = '() => 0'; },
    r => { r.admissionEnabled = true; },
    r => { r.savedVisitReady = true; },
  ];
  for (const mutate of mutations) {
    const recipe = JSON.parse(valid); mutate(recipe);
    assert.equal(reconstructMikaNativeCruise(JSON.stringify(recipe), layoutJson).ok, false);
  }
  const stale = structuredClone(layout); stale.maskRows[30] = [[0, 99]];
  const recipe = JSON.parse(valid); recipe.layout = stale;
  assert.equal(reconstructMikaNativeCruise(JSON.stringify(recipe), JSON.stringify(stale)).ok, false);
  const changed = structuredClone(layout); changed.obstacles[0].x++;
  assert.deepEqual(reconstructMikaNativeCruise(valid, JSON.stringify(changed)),
    {ok: false, reason: 'MIKA_CRUISE_LAYOUT_CHANGED'});
});

test('malformed, non-JSON and over-budget inputs are rejected before route work', () => {
  const valid = prepareMikaNativeCruise(layoutJson).json;
  let invoked = false;
  const executable = {toJSON() { invoked = true; throw Error('must not execute'); }};
  for (const value of [null, undefined, executable, {}, [], 0, true, '', '{', 'null', '[]', '1e999', ' '.repeat(16385)]) {
    assert.equal(prepareMikaNativeCruise(value).ok, false);
    assert.equal(reconstructMikaNativeCruise(value, layoutJson).ok, false);
    assert.equal(reconstructMikaNativeCruise(valid, value).ok, false);
  }
  assert.equal(invoked, false);
  const deep = '['.repeat(6000) + '0' + ']'.repeat(6000);
  const recursiveRecipe = valid.replace(/"identity":\{[^}]*\}/u, '"identity":' + deep);
  assert.equal(reconstructMikaNativeCruise(recursiveRecipe, layoutJson).ok, false);
  const mutations = [
    l => { l.maskRows[30] = [[0, 99]]; },
    l => { l.obstacles = Array.from({length: 33}, (_, i) => ({...l.obstacles[0], id: String(i)})); },
    l => { l.obstacles.push({...l.obstacles[0]}); },
    l => { l.obstacles[0].width = 0; },
    l => { l.obstacles[0].height = -1; },
    l => { l.obstacles[0].x = 101; },
    l => { l.obstacles[0].width = 201; },
    l => { l.obstacles[0].id = 'a'.repeat(129); },
    l => { l.obstacles[0].condition = {}; },
    l => { l.obstacles[0].goodieId = null; },
    l => { l.obstacles[0].sweep = []; },
    l => { l.unitsPerSource = 16; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(layout); mutate(invalid);
    assert.equal(prepareMikaNativeCruise(JSON.stringify(invalid)).ok, false);
  }
  for (const index of [-1, .5, 1120, Infinity, '0', {}, () => 0]) {
    assert.deepEqual(prepareMikaNativeCruise(layoutJson, index), {ok: false, reason: 'INVALID_MIKA_CRUISE_SELECTION'});
  }
});

test('a fresh process rebuilds roots, cadence, contact times, bones and envelopes from JSON alone', () => {
  const indices = [0, 1, 12, 24], times = [0, .237, 1.123, 2.331, 3.987, 4, 1.123, 0];
  const inputs = indices.map(index => prepareMikaNativeCruise(layoutJson, index));
  const expected = indices.map(index => {
    let clear = 0;
    const plan = planMikaYardQaCruise(layout, calibration, envelope, {acceptSweep: () => clear++ === index});
    return {plan, samples: times.map(time => {
      const sample = sampleMikaYardQaCruise(plan, layout, time);
      assert.equal(sample.status, 'ready', `original candidate ${index} at ${time}`);
      return sample;
    })};
  });
  const root = new URL('../', import.meta.url);
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import {readFileSync} from 'node:fs';
    import {reconstructMikaNativeCruise} from ${JSON.stringify(new URL('game-logic/yard-v2/mika-native-cruise-replay.mjs', root).href)};
    import {sampleMikaYardQaCruise} from ${JSON.stringify(new URL('src/games/companion-yard-v2/mika-qa/mika-yard-route.mjs', root).href)};
    const {recipes, layoutJson, times} = JSON.parse(readFileSync(0, 'utf8'));
    process.stdout.write(JSON.stringify(recipes.map(json => {
      const replay = reconstructMikaNativeCruise(json, layoutJson);
      if (!replay.ok) throw Error(replay.reason);
      return {plan: replay.plan, samples: times.map(t => {
        const sample = sampleMikaYardQaCruise(replay.plan, JSON.parse(layoutJson), t);
        if (sample.status !== 'ready') throw Error('Unexpected replay status: ' + sample.status);
        return sample;
      })};
    })));
  `], {input: JSON.stringify({recipes: inputs.map(input => input.json), layoutJson, times}),
    encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024});
  assert.deepEqual(JSON.parse(output), JSON.parse(JSON.stringify(expected)));
  assert.deepEqual(expected[0].samples[0].sample.root, {position: [6.25, 7.5, 0], heading: 0});
  assert.equal(expected[0].samples[0].sample.phase, 0);
  assert.deepEqual(sampleMikaYardQaCruise(JSON.parse(JSON.stringify(inputs[0].plan)), layout, 0),
    {status: 'aborted', reason: 'UNPREPARED_QA_CRUISE'}, 'serialized output arrays are not a replay route');
});

test('replay reruns collision selection and keeps finite-time and sticky layout-abort guards', () => {
  const valid = prepareMikaNativeCruise(layoutJson);
  const blocked = {...layout, obstacles: [{id: 'blocked', x: 0, y: 0, width: 100, height: 100}]};
  const forged = JSON.parse(valid.json); forged.layout = blocked;
  for (const result of [prepareMikaNativeCruise(JSON.stringify(blocked)),
    reconstructMikaNativeCruise(JSON.stringify(forged), JSON.stringify(blocked)),
    prepareMikaNativeCruise(layoutJson, 1119)]) {
    assert.deepEqual(result, {ok: false, reason: 'NO_CLEAR_QA_CRUISE', candidates: 1120});
  }
  const replay = reconstructMikaNativeCruise(valid.json, layoutJson);
  for (let i = 0; i <= 240; i++) assert.equal(sampleMikaYardQaCruise(replay.plan, layout, i / 60).status, 'ready');
  for (const time of [-1, 4.0001, Infinity, NaN]) assert.deepEqual(sampleMikaYardQaCruise(replay.plan, layout, time), {status: 'complete'});
  const moved = structuredClone(layout); moved.obstacles[0].y++;
  assert.deepEqual(sampleMikaYardQaCruise(replay.plan, moved, 1), {status: 'aborted', reason: 'LAYOUT_CHANGED'});
  assert.deepEqual(sampleMikaYardQaCruise(replay.plan, layout, 1), {status: 'aborted', reason: 'LAYOUT_CHANGED'});
});

test('normal layout metadata roundtrips, property order is irrelevant, and saved admission stays closed', () => {
  const withProps = {...layout, obstacles: [...layout.obstacles,
    {id: 'mouse', goodieId: 'toy_mouse', condition: 'new', x: 40.6, y: 43.4, width: 8.8, height: 3.2},
    {id: 'cushion', goodieId: 'cushion', condition: null, x: 42.8, y: 56.4, width: 22.4, height: 19.2}]};
  const reorder = value => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(reorder) : Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;
  const prepared = prepareMikaNativeCruise(JSON.stringify(withProps));
  const recipe = JSON.parse(prepared.json);
  const replay = reconstructMikaNativeCruise(JSON.stringify(reorder(recipe)), JSON.stringify(reorder(withProps)));
  assert.equal(replay.ok, true);
  const original = planMikaYardQaCruise(withProps, calibration, envelope);
  assert.deepEqual(replay.plan, original);
  for (const t of [0, .237, 1.123, 2.331, 3.987, 4]) {
    const expected = sampleMikaYardQaCruise(original, withProps, t);
    const actual = sampleMikaYardQaCruise(replay.plan, withProps, t);
    assert.equal(expected.status, 'ready'); assert.equal(actual.status, 'ready');
    assert.deepEqual(actual, expected);
  }
  assert.equal(MIKA_NATIVE_PROFILE.savedVisitReady, false);
  assert.equal(MIKA_NATIVE_PROFILE.admissionEnabled, false);
  assert.equal(MIKA_NATIVE_PROFILE.qualification.savedPlanSerializable, false);
  assert.deepEqual(MIKA_NATIVE_PROFILE.supportedSavedBindings, []);
  assert.equal(evaluateMikaNativeAdmission(recipe).admission, false);
  assert.deepEqual(Object.keys(recipe).sort(), ['format', 'geometry', 'identity', 'layout', 'selection', 'sources', 'time']);
});
