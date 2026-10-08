import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareCanonicalSavedVisit, restoreCanonicalSavedVisit, CANONICAL_SAVED_VISIT_PROFILE} from '../game-logic/yard-v2/canonical-saved-visit-bridge.mjs';
import {VISIT_JOB_SOURCE_HASH, VISIT_WORKER_SOURCES} from '../game-logic/yard-v2/canonical-visit-job-contract.mjs';
import {evaluateMikaNativeAdmission} from '../game-logic/yard-v2/mika-native-admission-contract.mjs';
import {request} from './fixtures/canonical-visit-worker-input.mjs';
import {mikaNativeContractInput} from './fixtures/mika-native-contract-input.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('the existing Pip job source hash, manifest, transport and complete pinned graph remain byte-exact', async () => {
  assert.equal(VISIT_JOB_SOURCE_HASH, '83f269eb44ec3639c36b8ed9e00b1002f30e1436decea1aa5b37ae7448d95bb1');
  const root = new URL('../game-logic/yard-v2/', import.meta.url);
  assert.equal(hash(await readFile(new URL('canonical-visit-worker-sources.json', root))), '7c72303deef6d58afc2a2e29a71a69e16ade8f3f94c527567c4f8726b3191662');
  assert.equal(hash(await readFile(new URL('canonical-visit-job-contract.mjs', root))), '5432462ed45c4a1dabe21558f33736afe09ed9b93f30cf96402ad57d970da776');
  assert.equal(VISIT_WORKER_SOURCES.length, 26);
  for (const row of VISIT_WORKER_SOURCES) {
    assert.equal(hash(await readFile(new URL(row.specifier, root))), row.sha256, row.specifier);
    assert.doesNotMatch(row.specifier, /mika-native|mika-qa/);
  }
});

test('the unchanged positive Pip proposal still prepares exactly, while native Mika and relabels never become visits', async () => {
  const input = request().input, before = structuredClone(input);
  const pip = prepareCanonicalSavedVisit(input);
  assert.equal(pip.prepared, true, pip.code);
  const expected = JSON.parse(await readFile(new URL('./fixtures/canonical-visit-record-45m.json', import.meta.url)));
  assert.deepEqual(pip.record, expected);
  assert.equal(pip.record.recordHash, 'e8d6cb3c0d92b32f95d359ac1a730c8b621311a048f8f429983d41a217c2db61');
  assert.equal(CANONICAL_SAVED_VISIT_PROFILE.visitorId, 'pip_hamster');
  assert.equal(CANONICAL_SAVED_VISIT_PROFILE.unitsPerSource, 16);
  assert.equal(pip.record.requiredContainerVersion, 3);
  assert.equal(pip.admission, false);
  assert.deepEqual(input, before);

  for (const activityId of ['peek', 'sniff', 'pounce', 'sit', 'nap']) {
    const mika = structuredClone(input);
    Object.assign(mika.candidate, {visitorId: 'mika_cat', activityId});
    const bytes = JSON.stringify(mika);
    assert.equal(prepareCanonicalSavedVisit(mika).code, 'CANONICAL_SELECTED_CANDIDATE_UNSUPPORTED');
    assert.equal(evaluateMikaNativeAdmission(mika).identityRecognized, false);
    assert.equal(JSON.stringify(mika), bytes);
  }
  const relabeled = structuredClone(pip.record);
  relabeled.candidate.visitorId = 'mika_cat';
  relabeled.profile.visitorId = 'mika_cat';
  relabeled.profile.id = 'native-mika-p2/r1';
  const bytes = JSON.stringify(relabeled);
  assert.equal(restoreCanonicalSavedVisit(relabeled).code, 'CANONICAL_SAVED_VISIT_PROFILE_UNSUPPORTED');
  for (const record of [pip.record, relabeled, {visitorId: 'mika_cat', pose: 'pounce'},
    {...mikaNativeContractInput(), record: relabeled}]) {
    const result = evaluateMikaNativeAdmission(record);
    assert.equal(result.identityRecognized, false);
    assert.equal(result.prepared, false);
    assert.equal(result.admission, false);
  }
  assert.equal(JSON.stringify(relabeled), bytes);
  assert.deepEqual(input, before);
});
