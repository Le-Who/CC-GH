import test from 'node:test';
import assert from 'node:assert/strict';
import {MIKA_NATIVE_PROFILE} from '../game-logic/yard-v2/mika-native-profile.mjs';
import {validateMikaNativeIdentity, evaluateMikaNativeAdmission} from '../game-logic/yard-v2/mika-native-admission-contract.mjs';
import {mikaNativeContractInput} from './fixtures/mika-native-contract-input.mjs';

test('the native P2 descriptor is recognized without preparing or admitting any saved visit', () => {
  const input = mikaNativeContractInput(), before = structuredClone(input);
  assert.deepEqual(validateMikaNativeIdentity(input), {identityRecognized: true, code: 'MIKA_NATIVE_IDENTITY_RECOGNIZED'});
  assert.deepEqual(evaluateMikaNativeAdmission(input), {
    state: 'unqualified', identityRecognized: true, code: 'MIKA_NATIVE_SAVED_VISIT_UNQUALIFIED',
    prepared: false, ready: false, admission: false, savedVisitReady: false, admissionEnabled: false,
  });
  assert.deepEqual(input, before);
  assert.equal(MIKA_NATIVE_PROFILE.identity.profileId, 'native-mika-p2/r1');
  assert.equal(MIKA_NATIVE_PROFILE.savedVisitReady, false);
  assert.equal(MIKA_NATIVE_PROFILE.admissionEnabled, false);
  assert.deepEqual(MIKA_NATIVE_PROFILE.supportedSavedBindings, []);
});

test('identity validation is property-order independent and rejects non-JSON descriptors without executing getters', () => {
  const original = mikaNativeContractInput();
  const reorder = value => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(reorder) : Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;
  assert.equal(validateMikaNativeIdentity(reorder(original)).identityRecognized, true);
  let getters = 0;
  const accessor = mikaNativeContractInput();
  Object.defineProperty(accessor.identity, 'boneCount', {enumerable: true, get() { getters++; return 22; }});
  const hidden = mikaNativeContractInput(); Object.defineProperty(hidden, 'enable', {value: true});
  const symbol = mikaNativeContractInput(); symbol[Symbol('enable')] = true;
  const toJSON = {toJSON() { throw Error('must not execute user code'); }};
  const cycle = mikaNativeContractInput(); cycle.identity = cycle;
  const inherited = Object.create(original);
  for (const invalid of [null, undefined, true, 1, 'mika_cat', [], accessor, hidden, symbol, toJSON, cycle, inherited]) {
    const result = evaluateMikaNativeAdmission(invalid);
    assert.equal(result.identityRecognized, false);
    assert.equal(result.state, 'unqualified');
    assert.equal(result.admission, false);
  }
  assert.equal(getters, 0);
});

test('wrong model, profile, visitor, units, geometry, stale or mixed sources, and any saved binding remain closed', () => {
  const mutations = [
    input => { input.identity.profileId = 'native-mika-p2/r2'; },
    input => { input.identity.visitorId = 'pip_hamster'; },
    input => { input.identity.actorId = 'Pip-R1-A2'; },
    input => { input.identity.modelSha256 = '74edd9400bcb69266ce670c977f05bf3ae8c62b448877f4ee34967565815c45b'; },
    input => { input.identity.modelBytes++; },
    input => { input.identity.boneCount = 21; },
    input => { input.identity.rootOwner = 'animation'; },
    input => { input.identity.unitsPerSource = 16; },
    input => { input.geometry.id = 'pip-garden-t2-r1'; },
    input => { input.geometry.domain.max = [200, 220]; },
    input => { input.geometry.unitsPerSource = 16; },
    input => { input.binding = 'leaf_pot:peek'; },
    input => { input.binding = 'ball:pounce'; },
    input => { input.binding = 'cushion:nap'; },
    input => { input.binding = 'bench:sit'; },
    input => { input.binding = {}; },
    input => { input.admissionEnabled = true; },
    input => { input.savedVisitReady = true; },
    input => { input.sources.legacyPip = input.sources.locomotion; },
    ...Object.keys(mikaNativeContractInput().sources).flatMap(role => [
      input => { input.sources[role] = '0'.repeat(64); },
      input => { delete input.sources[role]; },
    ]),
  ];
  for (const mutate of mutations) {
    const input = mikaNativeContractInput(); mutate(input);
    const before = structuredClone(input), result = evaluateMikaNativeAdmission(input);
    assert.deepEqual(result, {state: 'unqualified', identityRecognized: false, code: 'MIKA_NATIVE_IDENTITY_MISMATCH',
      prepared: false, ready: false, admission: false, savedVisitReady: false, admissionEnabled: false});
    assert.deepEqual(input, before);
  }
});

test('the source-only profile is deeply immutable and records only the finite four-second QA boundary', () => {
  assert.deepEqual(MIKA_NATIVE_PROFILE.qualification, {
    scope: 'finite-qa-cruise-only', format: 'mika-normal-yard-qa-cruise/v1', durationSeconds: 4,
    savedPlanSerializable: false, arbitraryNavigation: false, actionTransitions: false,
  });
  for (const mutate of [
    () => { MIKA_NATIVE_PROFILE.admissionEnabled = true; },
    () => { MIKA_NATIVE_PROFILE.identity.unitsPerSource = 16; },
    () => { MIKA_NATIVE_PROFILE.geometry.domain.max[0] = 200; },
    () => { MIKA_NATIVE_PROFILE.sources.calibration = 'forged'; },
    () => { MIKA_NATIVE_PROFILE.supportedSavedBindings.push('ball:pounce'); },
    () => { evaluateMikaNativeAdmission(mikaNativeContractInput()).admission = true; },
  ]) assert.throws(mutate, TypeError);
  assert.equal(evaluateMikaNativeAdmission(mikaNativeContractInput()).admission, false);
});

test('independent native source pins match exact repository bytes and the actual GLB skin identity', async () => {
  const {readFile} = await import('node:fs/promises');
  const {createHash} = await import('node:crypto');
  const {MIKA_NATIVE_SOURCES, MIKA_NATIVE_SOURCE_HASH} = await import('../game-logic/yard-v2/mika-native-profile.mjs');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const root = new URL('../', import.meta.url), input = mikaNativeContractInput();
  assert.equal(MIKA_NATIVE_SOURCES.format, 'native-mika-sources/v1');
  assert.equal(MIKA_NATIVE_SOURCES.baseCommit, '0acaf4e522629e762cf8b399504740406bde0a38');
  assert.deepEqual(MIKA_NATIVE_SOURCES.sources.map(row => row.role), ['model', 'calibration', 'skinEnvelope', 'envelope', 'locomotion', 'nativePose', 'geometry', 'cruise', 'arrival']);
  for (const row of MIKA_NATIVE_SOURCES.sources) {
    const bytes = await readFile(new URL(row.path, root));
    assert.equal(bytes.length, row.bytes, row.role);
    assert.equal(hash(bytes), input.sources[row.role], row.role);
    assert.equal(row.sha256, input.sources[row.role], row.role);
    assert.equal(Object.isFrozen(row), true);
  }
  assert.match(MIKA_NATIVE_SOURCE_HASH, /^[a-f0-9]{64}$/);
  const glb = await readFile(new URL('public/assets/yard-mika-p2-qa/p2.glb', root));
  assert.equal(glb.toString('ascii', 0, 4), 'glTF');
  const json = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
  const calibration = JSON.parse(await readFile(new URL('src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json', root)));
  assert.equal(json.skins.length, 1);
  assert.equal(json.skins[0].joints.length, 22);
  assert.deepEqual(json.skins[0].joints.map(index => json.nodes[index].name).sort(), Object.keys(calibration.bones).sort());
  assert.equal(calibration.rootOwnership, 'navigation frame exclusively; all pose matrices root-relative');
  const mask = JSON.parse(await readFile(new URL('src/games/companion-yard-v2/mika-qa/meadow-mask.json', root)));
  assert.equal(mask.format, 'released-meadow-mask/v1');
  assert.equal(mask.rows.length, 51);
  assert.equal(mask.step, 2);
});
