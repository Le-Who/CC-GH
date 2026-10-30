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

test('the app-only controller binds exactly the currently deployed 56b906 predecessor', () => {
  assert.equal(PREDECESSOR, '56b9062955d60c76bf9430c898d3cec1231ca524');
  assert.equal(PREDECESSOR_TREE, '1f8dfdd199602099f7bf6716194e1ff67725885d');
  assert.equal(PREDECESSOR_IMAGE_DIGEST, 'sha256:9442e853d8bf767363475d819a4d3988135de2190f071d9d0bbfefb84558180d');
  assert.equal(PREDECESSOR_IMAGE_ID, 'sha256:6c86fb9183e03a75910ae854199ae79bfeaa7a76dbd9e4338f2ae01a6430bc26');
  assert.equal(CHECKS.length, 15);
  assert.ok(CHECKS.includes('bentoku-launch'));
  const oldChecks = JSON.parse(readFileSync(new URL('../historical-candidate-receipt.json', import.meta.url))).checks.map(check => check.name);
  assert.deepEqual(CHECKS.slice().sort(), [...oldChecks, 'bentoku-launch'].sort());
});

test('a valid record for 56b906 cannot select the historical ec815 predecessor or a different image', () => {
  const record = recordFixture();
  let bytes = encode(record);
  assert.equal(parseDevelopmentRecord(bytes, hash(bytes)).predecessor.commit, '56b9062955d60c76bf9430c898d3cec1231ca524');
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
    checks: [...oldChecks, 'bentoku-launch'].map(name => ({ name, attempts: 1, status: 'completed', conclusion: 'success', release: identity(record.candidate), predecessor: identity(record.predecessor), artifactSha256: '2'.repeat(64) })),
  };
  let candidateBytes = encode(candidate);
  record.candidate.receiptSha256 = hash(candidateBytes);
  assert.equal(verifyDevelopmentReceipts(record, predecessorBytes, candidateBytes), true);
  candidate.checks = candidate.checks.filter(check => check.name !== 'bentoku-launch');
  candidateBytes = encode(candidate);
  record.candidate.receiptSha256 = hash(candidateBytes);
  assert.throws(() => verifyDevelopmentReceipts(record, predecessorBytes, candidateBytes), /Complete exact-image/);
});
