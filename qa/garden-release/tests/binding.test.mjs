import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PREDECESSOR, PREDECESSOR_TREE, PREDECESSOR_IMAGE_DIGEST, PREDECESSOR_IMAGE_ID, CHECKS, parseDevelopmentRecord, verifyDevelopmentReceipts } from '../controller/scripts/yard-development-contract.mjs';
const encode = value => Buffer.from(JSON.stringify(value) + '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const historical = JSON.parse(readFileSync(new URL('../historical-record.json', import.meta.url)));
function recordFixture() {
  const record = structuredClone(historical);
  record.predecessor = { ...historical.candidate };
  record.candidate = { commit: 'a'.repeat(40), tree: 'b'.repeat(40), imageDigest: 'sha256:' + 'c'.repeat(64), imageId: 'sha256:' + 'd'.repeat(64), receiptSha256: 'e'.repeat(64) };
  return record;
}

test('the app-only controller binds exactly the currently deployed d09e729 predecessor', () => {
  assert.equal(PREDECESSOR, 'd09e7296af6e9499a0cd19322c6fda73dfcabef7');
  assert.equal(PREDECESSOR_TREE, '70e8b19ec59d718daac4e813a77975b4324f1965');
  assert.equal(PREDECESSOR_IMAGE_DIGEST, 'sha256:491a7a7fcf3caa64af667827a0d5a3c045f818f909571da47c0e1a7fed209757');
  assert.equal(PREDECESSOR_IMAGE_ID, 'sha256:f901f9976808ebd8ed74e73717d1b84dd72e56319c677acc7b0b47f7084fdb3c');
  assert.equal(CHECKS.length, 16);
  assert.ok(CHECKS.includes('bentoku-launch'));
  const oldChecks = JSON.parse(readFileSync(new URL('../historical-candidate-receipt.json', import.meta.url))).checks.map(check => check.name);
  assert.deepEqual(CHECKS.slice().sort(), [...oldChecks, 'garden-terrarium-menu'].sort());
});

test('a valid record for d09e729 cannot select the historical 56b906 predecessor or a different image', () => {
  const record = recordFixture();
  let bytes = encode(record);
  assert.equal(parseDevelopmentRecord(bytes, hash(bytes)).predecessor.commit, 'd09e7296af6e9499a0cd19322c6fda73dfcabef7');
  record.predecessor = historical.predecessor;
  bytes = encode(record);
  assert.throws(() => parseDevelopmentRecord(bytes, hash(bytes)), /different predecessor/);
  record.predecessor = { ...historical.candidate, imageId: 'sha256:' + 'f'.repeat(64) };
  bytes = encode(record);
  assert.throws(() => parseDevelopmentRecord(bytes, hash(bytes)));
});

test('the accepted image receipt must include fresh Garden evidence as well as every original check', () => {
  const record = recordFixture();
  const predecessorBytes = readFileSync(new URL('../predecessor-receipt.json', import.meta.url));
  record.predecessor.receiptSha256 = hash(predecessorBytes);
  const identity = value => { const { receiptSha256, ...release } = value; return release; };
  const oldChecks = JSON.parse(readFileSync(new URL('../historical-candidate-receipt.json', import.meta.url))).checks.map(check => check.name);
  const candidate = {
    format: 'cc-gh-yard-accepted-development/v1', repository: 'le-who/cc-gh', repositoryId: 1162268629, status: 'accepted',
    release: identity(record.candidate), predecessor: identity(record.predecessor), mode: record.mode, storage: record.storage, capabilities: record.capabilities,
    acceptance: { runId: 1, runAttempt: 1, status: 'completed', conclusion: 'success', headCommit: record.candidate.commit, artifactSha256: '1'.repeat(64) },
    checks: [...oldChecks, 'garden-terrarium-menu'].map(name => ({ name, attempts: 1, status: 'completed', conclusion: 'success', release: identity(record.candidate), predecessor: identity(record.predecessor), artifactSha256: '2'.repeat(64) })),
  };
  let candidateBytes = encode(candidate);
  record.candidate.receiptSha256 = hash(candidateBytes);
  assert.equal(verifyDevelopmentReceipts(record, predecessorBytes, candidateBytes), true);
  candidate.checks = candidate.checks.filter(check => check.name !== 'garden-terrarium-menu');
  candidateBytes = encode(candidate);
  record.candidate.receiptSha256 = hash(candidateBytes);
  assert.throws(() => verifyDevelopmentReceipts(record, predecessorBytes, candidateBytes), /Complete exact-image/);
});
