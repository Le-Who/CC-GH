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

test('the app-only controller binds exactly the currently deployed 01fb01b predecessor', () => {
  assert.equal(PREDECESSOR, '01fb01b3ca92f239682a5c63021e002d41a1f685');
  assert.equal(PREDECESSOR_TREE, 'd9ff3cdb016f9958900b0c71b80ff4f8679e2d93');
  assert.equal(PREDECESSOR_IMAGE_DIGEST, 'sha256:d476a5e808761496b90609f4923f9d87038263db1a69631afca4977a20476195');
  assert.equal(PREDECESSOR_IMAGE_ID, 'sha256:82c880dc2ec4a5aa0fceeeea595446d33c30e2f0acea2984e4b981dda261b806');
  assert.equal(CHECKS.length, 15);
  assert.ok(CHECKS.includes('bentoku-launch'));
  const oldChecks = JSON.parse(readFileSync(new URL('../historical-candidate-receipt.json', import.meta.url))).checks.map(check => check.name);
  assert.deepEqual(CHECKS.slice().sort(), oldChecks.sort());
});

test('a valid record for 01fb01b cannot select the historical 56b906 predecessor or a different image', () => {
  const record = recordFixture();
  let bytes = encode(record);
  assert.equal(parseDevelopmentRecord(bytes, hash(bytes)).predecessor.commit, '01fb01b3ca92f239682a5c63021e002d41a1f685');
  record.predecessor = historical.predecessor;
  bytes = encode(record);
  assert.throws(() => parseDevelopmentRecord(bytes, hash(bytes)), /different predecessor/);
  record.predecessor = { ...historical.candidate, imageId: 'sha256:' + 'f'.repeat(64) };
  bytes = encode(record);
  assert.throws(() => parseDevelopmentRecord(bytes, hash(bytes)));
});

test('the accepted image receipt must include fresh Bentoku evidence as well as every original check', () => {
  const record = recordFixture();
  const predecessorBytes = readFileSync(new URL('../predecessor-receipt.json', import.meta.url));
  record.predecessor.receiptSha256 = hash(predecessorBytes);
  const identity = value => { const { receiptSha256, ...release } = value; return release; };
  const oldChecks = JSON.parse(readFileSync(new URL('../historical-candidate-receipt.json', import.meta.url))).checks.map(check => check.name);
  const candidate = {
    format: 'cc-gh-yard-accepted-development/v1', repository: 'le-who/cc-gh', repositoryId: 1162268629, status: 'accepted',
    release: identity(record.candidate), predecessor: identity(record.predecessor), mode: record.mode, storage: record.storage, capabilities: record.capabilities,
    acceptance: { runId: 1, runAttempt: 1, status: 'completed', conclusion: 'success', headCommit: record.candidate.commit, artifactSha256: '1'.repeat(64) },
    checks: oldChecks.map(name => ({ name, attempts: 1, status: 'completed', conclusion: 'success', release: identity(record.candidate), predecessor: identity(record.predecessor), artifactSha256: '2'.repeat(64) })),
  };
  let candidateBytes = encode(candidate);
  record.candidate.receiptSha256 = hash(candidateBytes);
  assert.equal(verifyDevelopmentReceipts(record, predecessorBytes, candidateBytes), true);
  candidate.checks = candidate.checks.filter(check => check.name !== 'bentoku-launch');
  candidateBytes = encode(candidate);
  record.candidate.receiptSha256 = hash(candidateBytes);
  assert.throws(() => verifyDevelopmentReceipts(record, predecessorBytes, candidateBytes), /Complete exact-image/);
});
