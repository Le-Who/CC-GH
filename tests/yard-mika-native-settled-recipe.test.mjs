import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import calibration from '../src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json' with {type: 'json'};
import envelope from '../src/games/companion-yard-v2/mika-qa/mika-p2-skin-envelope.json' with {type: 'json'};
import {mikaItemFixture} from './fixtures/mika-item-input.mjs';
import {bindMikaPersistedItems, planMikaItemArrival, planMikaItemContinuation, planMikaItemContinuationAsync} from '../src/games/companion-yard-v2/mika-qa/mika-item-approach.mjs';
import {sampleMikaYardQaCruise} from '../src/games/companion-yard-v2/mika-qa/mika-yard-route.mjs';
import {MIKA_NATIVE_PROFILE} from '../game-logic/yard-v2/mika-native-profile.mjs';
import {evaluateMikaNativeAdmission} from '../game-logic/yard-v2/mika-native-admission-contract.mjs';
import {canonical} from '../game-logic/yard-v2/util.mjs';
import {MIKA_NATIVE_RECIPE_MAX_CHARS, MIKA_NATIVE_SETTLED_SOURCES, MIKA_NATIVE_SETTLED_SOURCE_HASH,
  createMikaNativeActionRecipe, validateMikaNativeAction, reconstructMikaNativeSettled,
  mikaNativeLayoutHash} from '../game-logic/yard-v2/mika-native-settled-recipe.mjs';

let cached;
function fixture() {
  if (cached) return cached;
  const input = mikaItemFixture([
    {slotId: 'first', goodieId: 'yarn_mouse', x: 60, y: 45, condition: 'new'},
    {slotId: 'second', goodieId: 'yarn_mouse', x: 87, y: 54, condition: 'new'},
  ]);
  const bound = bindMikaPersistedItems(input.snapshot, input.view);
  const first = planMikaItemArrival(bound, calibration, envelope, {targetSlotId: 'first'});
  assert.equal(first.ok, true);
  const firstRecipe = createMikaNativeActionRecipe(first.plan, bound, 'first');
  const firstSaved = validateMikaNativeAction(firstRecipe.recipeJson, bound);
  assert.equal(firstSaved.ok, true, firstSaved.reason);
  const next = planMikaItemContinuation(bound, calibration, envelope, firstSaved.sample, 'second');
  assert.equal(next.ok, true, next.reason);
  const nextRecipe = createMikaNativeActionRecipe(next.plan, bound, 'second');
  const nextSaved = validateMikaNativeAction(nextRecipe.recipeJson, bound, firstSaved.checkpointJson);
  assert.equal(nextSaved.ok, true, nextSaved.reason);
  return cached = {bound, first, firstRecipe, firstSaved, next, nextRecipe, nextSaved};
}
const change = (json, mutate) => {
  const value = JSON.parse(json); mutate(value); return JSON.stringify(value);
};

test('both terminal generators exactly reconstruct the original root, body, all 22 bones and actual non-neutral paws', () => {
  const f = fixture();
  let nonNeutral = 0;
  for (const [plan, saved, target] of [[f.first.plan, f.firstSaved, 'first'], [f.next.plan, f.nextSaved, 'second']]) {
    const expected = sampleMikaYardQaCruise(plan, f.bound.binding.layout, plan.duration).sample;
    assert.deepEqual(saved.plan, plan);
    assert.deepEqual(saved.sample, expected);
    assert.equal(Object.keys(expected.boneMatrices).length, 22);
    const restored = reconstructMikaNativeSettled(saved.checkpointJson, f.bound);
    assert.equal(restored.ok, true, restored.reason);
    assert.deepEqual(restored.sample, expected);
    assert.equal(restored.targetSlotId, target);
    assert.equal(restored.body.length, 161);
    assert.deepEqual(restored.position, {x: expected.root.position[0] * 8, y: expected.root.position[1] * 8});
    assert(restored.vertical.max > restored.vertical.min);
    assert(saved.checkpointJson.length < 1024);
    assert.equal(Object.hasOwn(JSON.parse(saved.checkpointJson).descriptor, 'previous'), false);
    for (const id of calibration.phaseOrder) {
      const [x, y, z] = calibration.neutralPaws[id], yaw = expected.root.heading, p = expected.root.position;
      const neutral = [p[0] + Math.cos(yaw) * x - Math.sin(yaw) * y,
        p[1] + Math.sin(yaw) * x + Math.cos(yaw) * y, p[2] + z];
      if (Math.hypot(...neutral.map((n, i) => n - expected.contacts[id].paw[i])) > 1e-5) nonNeutral++;
    }
  }
  assert(nonNeutral > 0, 'The recipe preserves retained supports instead of replacing all paws with neutral anchors');
});

test('a fresh process reconstructs both JSON checkpoints without closures, WeakMaps or prior history', () => {
  const f = fixture(), checkpoints = [f.firstSaved.checkpointJson, f.nextSaved.checkpointJson];
  const module = new URL('../game-logic/yard-v2/mika-native-settled-recipe.mjs', import.meta.url).href;
  const started = performance.now();
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import {readFileSync} from 'node:fs';
    import {reconstructMikaNativeSettled} from ${JSON.stringify(module)};
    const {checkpoints,bound}=JSON.parse(readFileSync(0,'utf8'));
    const results=checkpoints.map(json=>reconstructMikaNativeSettled(json,bound));
    if(results.some(result=>!result.ok))throw Error(JSON.stringify(results));
    process.stdout.write(JSON.stringify(results.map(result=>result.sample)));
  `], {input: JSON.stringify({checkpoints, bound: f.bound}), encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024});
  assert.deepEqual(JSON.parse(output), JSON.parse(JSON.stringify([f.firstSaved.sample, f.nextSaved.sample])));
  console.log(JSON.stringify({freshProcessRestoreMs: performance.now() - started,
    checkpointChars: checkpoints.map(json => json.length)}));
});

test('selected-candidate reconstruction retains every sampled pose and builds only one continuation candidate', async () => {
  const f = fixture(), selection = JSON.parse(f.nextRecipe.recipeJson).selection;
  let candidates = 0, sweeps = 0;
  const selected = await planMikaItemContinuationAsync(f.bound, calibration, envelope, f.firstSaved.sample, 'second', {
    selectedCandidate: selection, yieldTask: async () => {}, onSlice(ms, stage) {
      if (stage === 'candidate-start') candidates++;
      if (stage === 'skin-envelope') sweeps++;
    },
  });
  assert.equal(selected.ok, true);
  assert.equal(candidates, 1);
  assert(sweeps > 0 && sweeps <= Math.floor(535 / 4));
  assert.deepEqual(selected.plan, f.next.plan);
  for (const time of [0, .5, 2.5, 5.35, 6.2, 7.35, 8, 9.35, 10, 11.35, 7.35, 0]) {
    assert.deepEqual(sampleMikaYardQaCruise(selected.plan, f.bound.binding.layout, time),
      sampleMikaYardQaCruise(f.next.plan, f.bound.binding.layout, time));
  }
});

test('tampered versions, sources, selection, terminal pose hashes and extra client pose/function inputs fail closed', () => {
  const f = fixture();
  const mutations = [
    r => { r.format = 'native-mika-finite-action-recipe/v2'; },
    r => { r.sourceHash = '0'.repeat(64); },
    r => { r.bindingHash = '0'.repeat(64); },
    r => { r.targetSlotId = 'missing'; },
    r => { r.selection.start.x += .001; },
    r => { r.selection.heading += .01; },
    r => { r.selection.turnRadians *= -1; },
    r => { r.terminalHash = '0'.repeat(64); },
    r => { r.root = {position: [4, 5, 0], heading: 0}; },
    r => { r.boneMatrices = {}; },
    r => { r.contacts = {}; },
    r => { r.sampleAt = '() => pose'; },
    r => { r.selection.pose = []; },
  ];
  for (const mutate of mutations) assert.equal(validateMikaNativeAction(change(f.firstRecipe.recipeJson, mutate), f.bound).ok, false);
  for (const mutate of [
    r => { r.selection.turnAwayRadians = Math.PI; },
    r => { r.selection.cruiseSeconds = 5; },
    r => { r.selection.origin = {position: [1, 2, 0], heading: 0}; },
    r => { r.selection.kind = 'arrival'; },
  ]) assert.equal(validateMikaNativeAction(change(f.nextRecipe.recipeJson, mutate), f.bound, f.firstSaved.checkpointJson).ok, false);
  assert.equal(validateMikaNativeAction(f.nextRecipe.recipeJson, f.bound).reason, 'MIKA_NATIVE_CHECKPOINT_REQUIRED');
  assert.equal(validateMikaNativeAction(f.firstRecipe.recipeJson, f.bound, f.firstSaved.checkpointJson).reason, 'MIKA_NATIVE_BOOTSTRAP_ALREADY_SETTLED');
  assert.equal(validateMikaNativeAction(f.nextRecipe.recipeJson, f.bound, '{}').ok, false);
  const copy = JSON.parse(JSON.stringify(f.first.plan));
  assert.equal(createMikaNativeActionRecipe(copy, f.bound, 'first').reason, 'UNPREPARED_MIKA_NATIVE_ACTION');
});

test('corrupt or stale stored checkpoints never reset to an initial arrival', () => {
  const f = fixture();
  for (const mutate of [
    r => { r.format = 'native-mika-settled-checkpoint/v2'; },
    r => { r.sourceHash = '0'.repeat(64); },
    r => { r.bindingHash = '0'.repeat(64); },
    r => { r.descriptor.origin.position[0] += .001; },
    r => { r.descriptor.origin.boneMatrices = {}; },
    r => { r.descriptor.selection.cruiseSeconds = 3; },
    r => { r.descriptor.previous = {}; },
    r => { r.terminalHash = '0'.repeat(64); },
    r => { r.integrityHash = '0'.repeat(64); },
  ]) assert.equal(reconstructMikaNativeSettled(change(f.nextSaved.checkpointJson, mutate), f.bound).ok, false);
  const changed = structuredClone(f.bound);
  changed.binding.items[1].x++;
  changed.binding.layout.obstacles.find(box => box.id === 'second').x++;
  changed.key = canonical(changed.binding);
  assert.equal(reconstructMikaNativeSettled(f.nextSaved.checkpointJson, changed).reason, 'MIKA_NATIVE_LAYOUT_CHANGED');
  assert.equal(validateMikaNativeAction(f.firstRecipe.recipeJson, changed).reason, 'MIKA_NATIVE_LAYOUT_CHANGED');
  const otherAccount = structuredClone(f.bound);
  otherAccount.binding.accountId = 'different-account'; otherAccount.key = canonical(otherAccount.binding);
  assert.notEqual(mikaNativeLayoutHash(otherAccount), mikaNativeLayoutHash(f.bound));
  assert.equal(reconstructMikaNativeSettled(f.firstSaved.checkpointJson, otherAccount).reason, 'MIKA_NATIVE_LAYOUT_CHANGED');
});

test('the selected initial start must belong to the target set and its full current obstacle sweep is checked', () => {
  const f = fixture();
  const arbitraryStart = change(f.firstRecipe.recipeJson, recipe => {
    recipe.selection.start = {x: 50, y: 60};
  });
  assert.equal(validateMikaNativeAction(arbitraryStart, f.bound).reason, 'NO_CLEAR_NATIVE_ITEM_APPROACH');
  const blocked = structuredClone(f.bound);
  blocked.binding.layout.obstacles.push({id: 'authoritative-obstruction', x: 0, y: 0, width: 100, height: 100});
  blocked.key = canonical(blocked.binding);
  const recipe = change(f.firstRecipe.recipeJson, value => { value.bindingHash = mikaNativeLayoutHash(blocked); });
  assert.equal(validateMikaNativeAction(recipe, blocked).reason, 'NO_CLEAR_NATIVE_ITEM_APPROACH');
});

test('JSON budgets reject executable objects, malformed values and history expansion before sampling', () => {
  const f = fixture(); let invoked = false;
  const executable = {toJSON() { invoked = true; throw Error('must not execute'); }};
  for (const value of [null, undefined, executable, {}, [], 1, true, '', '{', 'null', '[]', '1e999',
    ' '.repeat(MIKA_NATIVE_RECIPE_MAX_CHARS + 1), '['.repeat(7000) + '0' + ']'.repeat(7000)]) {
    assert.equal(validateMikaNativeAction(value, f.bound).ok, false);
    assert.equal(reconstructMikaNativeSettled(value, f.bound).ok, false);
  }
  assert.equal(invoked, false);
});

test('current finite-action pins cover shipped samplers and no saved visitor admission is granted', () => {
  const files = {calibration: 'mika-p2-calibration.json', skinEnvelope: 'mika-p2-skin-envelope.json',
    geometry: 'meadow-mask.json', envelope: 'mika-envelope.mjs', locomotion: 'mika-locomotion.mjs',
    cruise: 'mika-yard-route.mjs', arrival: 'mika-arrival.mjs', departure: 'mika-departure.mjs',
    turnAway: 'mika-turn-away.mjs', itemApproach: 'mika-item-approach.mjs'};
  for (const [role, filename] of Object.entries(files)) {
    const bytes = readFileSync(new URL('../src/games/companion-yard-v2/mika-qa/' + filename, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), MIKA_NATIVE_SETTLED_SOURCES[role], role);
  }
  assert.match(MIKA_NATIVE_SETTLED_SOURCE_HASH, /^[a-f0-9]{64}$/u);
  assert.equal(MIKA_NATIVE_PROFILE.savedVisitReady, false);
  assert.equal(MIKA_NATIVE_PROFILE.admissionEnabled, false);
  assert.deepEqual(MIKA_NATIVE_PROFILE.supportedSavedBindings, []);
  assert.equal(evaluateMikaNativeAdmission(JSON.parse(fixture().nextSaved.checkpointJson)).admission, false);
});
