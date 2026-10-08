/** Explicit development storage evolution. This is NOT a maintenance exception.
 * The caller supplies an independently approved hash and authoritative receipts.
 * This offline verifier checks their binding; it does not authenticate GitHub.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const REPOSITORY = 'le-who/cc-gh';
export const PREDECESSOR = 'ec815065f6adb7c36d81f97b41d47ad16e614b07';
export const PREDECESSOR_TREE = 'b0b85f712645f772bfc138cddabc86a49d01ac07';
export const PREDECESSOR_IMAGE_DIGEST = 'sha256:349b9d206cc1b5c22c3460760d4ea9a96255288942a6e536f910b1222721cdaa';
export const PREDECESSOR_IMAGE_ID = 'sha256:f1b49cf23885afcf3ca7aab3303d39014f744343a90ad0ddd81e89a5da3be43d';
export const PREDECESSOR_ACCEPTANCE = Object.freeze({"runId":37623618587,"runAttempt":1,"status":"completed","conclusion":"success","headCommit":"ec815065f6adb7c36d81f97b41d47ad16e614b07","artifactSha256":"fd80d573e642efacd2dc807d6712ed95061449de214649244f49daa204655579"});
export const PREDECESSOR_DEPLOYMENT = Object.freeze({"runId":37626026418,"runAttempt":1,"status":"completed","conclusion":"success","controllerHeadCommit":"bd016553563eaa2d6659f0c25b366473b9a5090a","targetCommit":"ec815065f6adb7c36d81f97b41d47ad16e614b07","jobId":112807870594,"workflowSha256":"8d21d727fc4bb22ecc34bdc123915a81c23a51fe32b95fe479a55f43a73383d7","recordSha256":"f8d7419d39faa02ec033f978359cca53cd5e6a7d21884d36736df02ee6875853","verifiedAt":"2026-10-07T13:08:51Z","evidence":{"activationResultSha256":"a36b0f565eb9c45f4cc05379bbd70f93b17c969760ca5634ddd20cae602258a6","decodedJobLogSha256":"3e86d232d73046e2f23bda75434665d69c7e29f73fee9dfe9dd45a027aabac2b"}});
export const CHECKS = Object.freeze([
  'reviewed-source-inventory', 'normal-production-image', 'authenticated-capability-policy',
  'canonical-placement-storage-v2', 'economy-inventory', 'lost-response-exactly-once',
  'pending-intent-account-fences', 'receipt-security', 'occupied-food-socket',
  'warm-client-update', 'mobile-functional', 'mobile-visual', 'app-only-failure-rollback',
  'prior-image-v2-compatible-replay-preserves-state',
]);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const digest = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const keys = (value, names) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...names].sort(), 'Unexpected contract fields');
};
function release(value) {
  keys(value, ['commit', 'tree', 'imageDigest', 'imageId', 'receiptSha256']);
  assert.ok(commit(value.commit) && commit(value.tree) && digest(value.imageDigest) && digest(value.imageId) && hash(value.receiptSha256));
}
export function parseDevelopmentRecord(bytes, approvedHash) {
  assert.ok(hash(approvedHash), 'Independently approved record hash required');
  assert.equal(sha256(bytes), approvedHash, 'Record differs from independently approved bytes');
  const record = JSON.parse(bytes);
  keys(record, ['format', 'repository', 'mode', 'predecessor', 'candidate', 'storage', 'capabilities', 'runtime']);
  assert.equal(record.format, 'cc-gh-yard-development-release/v1');
  assert.equal(record.repository, REPOSITORY);
  assert.equal(record.mode, 'development-protocol-evolution');
  release(record.predecessor); release(record.candidate);
  assert.equal(record.predecessor.commit, PREDECESSOR, 'A different predecessor needs a new reviewed development contract');
  assert.equal(record.predecessor.tree, PREDECESSOR_TREE);
  assert.equal(record.predecessor.imageDigest, PREDECESSOR_IMAGE_DIGEST);
  assert.equal(record.predecessor.imageId, PREDECESSOR_IMAGE_ID);
  assert.notEqual(record.candidate.commit, record.predecessor.commit);
  assert.notEqual(record.candidate.imageId, record.predecessor.imageId);
  assert.notEqual(record.candidate.imageDigest, record.predecessor.imageDigest);
  assert.deepEqual(record.storage, {
    format: 'yard-persistent/v1', readVersions: [1, 2], writeVersions: [1, 2],
    transition: 'first-successful-canonical-placement-writes-v2',
    rollback: 'prior-image-compatible-replay-preserves-v2',
    compatibilityRequired: true, reset: 'none',
  }, 'The development storage transition and rollback limitation must be explicit');
  assert.deepEqual(record.capabilities, {
    authority: 'source-owned-authenticated-policy', clientGraph: true,
    itemKinds: ['leaf_pot'], placementLimit: 2, foodSocket: 'bowl-1',
    canonicalVisitorAdmission: false, fixtureLoader: false, devAuth: false,
  }, 'Unexpected capability scope');
  keys(record.runtime, ['composeSha256', 'localUrl', 'publicUrl', 'dbUser', 'dbName', 'protectedServices', 'neighborPublicHealth']);
  assert.ok(hash(record.runtime.composeSha256));
  const local = new URL(record.runtime.localUrl);
  assert.equal(local.protocol, 'http:'); assert.equal(local.hostname, '127.0.0.1');
  assert.ok(/^\d+$/.test(local.port) && Number(local.port) > 1024 && Number(local.port) < 65536);
  assert.equal(local.href, `http://127.0.0.1:${local.port}/`);
  assert.equal(record.runtime.publicUrl, 'https://games.tri.mom/');
  for (const value of [record.runtime.dbUser, record.runtime.dbName]) assert.match(value, /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/);
  assert.ok(Array.isArray(record.runtime.protectedServices) && record.runtime.protectedServices.includes('caddy.service'));
  assert.equal(new Set(record.runtime.protectedServices).size, record.runtime.protectedServices.length);
  for (const name of record.runtime.protectedServices) assert.match(name, /^[a-zA-Z0-9_.@-]+\.service$/);
  // Unknown neighbor URLs are not guessed or promoted to an application-health claim.
  assert.equal(record.runtime.neighborPublicHealth, 'not-proven');
  return record;
}
function proof(proof, expectedCommit) {
  assert.ok(Number.isSafeInteger(proof?.runId) && proof.runId > 0);
  assert.ok(Number.isSafeInteger(proof.runAttempt) && proof.runAttempt > 0);
  assert.equal(proof.status, 'completed'); assert.equal(proof.conclusion, 'success');
  assert.equal(proof.headCommit, expectedCommit); assert.ok(hash(proof.artifactSha256));
}
const identity = value => ({commit:value.commit, tree:value.tree, imageDigest:value.imageDigest, imageId:value.imageId});
export function verifyDevelopmentReceipts(record, predecessorBytes, candidateBytes) {
  assert.equal(sha256(predecessorBytes), record.predecessor.receiptSha256);
  assert.equal(sha256(candidateBytes), record.candidate.receiptSha256);
  const previous = JSON.parse(predecessorBytes), candidate = JSON.parse(candidateBytes);
  assert.equal(previous.format, 'cc-gh-yard-accepted-active-controller/v1');
  for (const [receipt, expected] of [[previous, record.predecessor], [candidate, record.candidate]]) {
    assert.equal(receipt.repository, REPOSITORY); assert.equal(receipt.repositoryId, 1162268629);
    assert.equal(receipt.status, 'accepted'); assert.deepEqual(receipt.release, identity(expected));
    proof(receipt.acceptance, expected.commit);
  }
  // Exact ec815 live predecessor, bound to recovered successful activation bytes.
  assert.deepEqual(previous.acceptance, PREDECESSOR_ACCEPTANCE);
  assert.deepEqual(previous.deployment, PREDECESSOR_DEPLOYMENT);
  assert.equal(candidate.format, 'cc-gh-yard-accepted-development/v1');
  assert.deepEqual(candidate.predecessor, identity(record.predecessor));
  assert.equal(candidate.mode, record.mode);
  assert.deepEqual(candidate.storage, record.storage);
  assert.deepEqual(candidate.capabilities, record.capabilities);
  assert.ok(Array.isArray(candidate.checks));
  assert.deepEqual(candidate.checks.map(check => check.name).sort(), [...CHECKS].sort(), 'Complete exact-image development acceptance required');
  for (const check of candidate.checks) {
    assert.equal(check.status, 'completed'); assert.equal(check.conclusion, 'success');
    assert.equal(check.attempts, 1, 'Retries must not conceal a failing acceptance case');
    assert.deepEqual(check.release, identity(record.candidate));
    assert.deepEqual(check.predecessor, identity(record.predecessor));
    assert.ok(hash(check.artifactSha256));
  }
  return true;
}
export function verifyImage(image, expected) {
  assert.equal(image.id, expected.imageId);
  assert.ok(Array.isArray(image.repoDigests) && image.repoDigests.includes(`ghcr.io/${REPOSITORY}@${expected.imageDigest}`));
  assert.equal(image.revision, expected.commit);
  assert.deepEqual(image.command, ['node', 'server.js']);
  // Normal-image acceptance proves only the environment exercised in CI. This
  // helper does not establish the VPS's inherited effective environment: a
  // separate trusted host preflight must emit only booleans for production mode,
  // disabled dev auth, and absent Node preload influence. Never print env values.
}
export function verifyApp(app, expected) {
  assert.equal(app.image, expected.imageId); assert.equal(app.name, '/ccgh-app');
  assert.equal(app.project, 'ccgh'); assert.equal(app.service, 'app');
  assert.equal(app.running, true); assert.equal(app.status, 'running');
}
export function verifyAppBoundary(before, after) {
  keys(before.boundary, ['ports', 'mounts', 'networkNames', 'networkMode', 'restartPolicy']);
  keys(after.boundary, ['ports', 'mounts', 'networkNames', 'networkMode', 'restartPolicy']);
  assert.deepEqual(after.boundary, before.boundary, 'App ports, mounts, networks or restart policy changed');
}
export function verifyHealth(value, expected) {
  assert.equal(value.status, 'ok'); assert.equal(value.buildId, expected.commit);
  assert.equal(value.postgres, true); assert.equal(value.redis, true);
}
export function verifyConfig(value, expected) {
  assert.equal(value.buildId, expected.commit);
  assert.equal(value.telegramAuthRequired, true); assert.equal(value.devAuthEnabled, false);
}
export function verifyHtml(bytes, expected) {
  assert.ok(new RegExp(`__APP_BUILD_ID__\\s*=\\s*["']${expected.commit}["']`).test(bytes), 'Served HTML has another build ID');
}
export function verifyProtected(before, after) {
  const normalize = snapshot => ({
    bootId: snapshot.bootId,
    services: [...snapshot.services].sort((a,b)=>a.name.localeCompare(b.name)),
    containers: [...snapshot.containers].sort((a,b)=>a.id.localeCompare(b.id)),
  });
  assert.match(before.bootId, /^[a-f0-9-]{36}$/);
  assert.ok(before.services.some(service => service.name === 'caddy.service' && service.LoadState === 'loaded' && service.ActiveState === 'active' && Number(service.MainPID) > 0));
  assert.deepEqual(normalize(after), normalize(before), 'A protected container/service or host/Caddy start identity changed');
}
function loadRecord(packet, approvedHash) { return parseDevelopmentRecord(readFileSync(resolve(packet, 'development-record.json')), approvedHash); }
export function preparePacket(packet, approvedHash, composePath, output) {
  const record = loadRecord(packet, approvedHash);
  verifyDevelopmentReceipts(record, readFileSync(resolve(packet, 'predecessor-receipt.json')), readFileSync(resolve(packet, 'candidate-receipt.json')));
  assert.equal(sha256(readFileSync(composePath)), record.runtime.composeSha256, 'Existing compose differs from reviewed effective definition');
  assert.ok(statSync(composePath).isFile());
  for (const which of ['predecessor', 'candidate']) {
    const r = record[which];
    // Only these two fields differ. Existing settings, ports, volumes and networks
    // are resolved from the unchanged live compose and its unchanged .env.
    writeFileSync(resolve(output, `${which}.json`), JSON.stringify({services:{app:{image:`ghcr.io/${REPOSITORY}@${r.imageDigest}`, environment:{APP_BUILD_ID:r.commit}}}})+'\n', {flag:'wx', mode:0o600});
  }
  writeFileSync(resolve(output, 'verified-record.json'), JSON.stringify(record)+'\n', {flag:'wx', mode:0o600});
  return record;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'prepare') preparePacket(...args);
    else if (command === 'get') {
      const [file, field] = args; let value = JSON.parse(readFileSync(file));
      for (const part of field.split('.')) { assert.ok(Object.hasOwn(value, part)); value = value[part]; }
      assert.ok(['string','number'].includes(typeof value)); process.stdout.write(String(value));
    } else if (command === 'services') {
      process.stdout.write(JSON.parse(readFileSync(args[0])).runtime.protectedServices.join('\n')+'\n');
    } else if (command === 'snapshot') {
      const [directory] = args;
      const containers = readFileSync(resolve(directory,'containers.ndjson'),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
      const services = readFileSync(resolve(directory,'services.txt'),'utf8').split('\n@@SERVICE@@\n').filter(Boolean).map(block=>{
        const [name,...lines] = block.trim().split('\n');
        return {name,...Object.fromEntries(lines.filter(Boolean).map(line=>{const index=line.indexOf('=');assert.ok(index>0);return [line.slice(0,index),line.slice(index+1)];}))};
      });
      process.stdout.write(JSON.stringify({bootId:readFileSync(resolve(directory,'boot-id'),'utf8').trim(), containers, services})+'\n');
    } else if (command === 'check-compose') {
      const [recordFile, compose] = args;
      assert.equal(sha256(readFileSync(compose)), JSON.parse(readFileSync(recordFile)).runtime.composeSha256, 'Live compose changed');
    } else if (command === 'image' || command === 'app' || command === 'health' || command === 'config' || command === 'html') {
      const [recordFile, which, input] = args; assert.ok(['candidate','predecessor'].includes(which));
      const expected = JSON.parse(readFileSync(recordFile))[which], bytes = readFileSync(input, 'utf8');
      if (command === 'html') verifyHtml(bytes, expected);
      else ({image:verifyImage, app:verifyApp, health:verifyHealth, config:verifyConfig}[command])(JSON.parse(bytes), expected);
    } else if (command === 'app-boundary') verifyAppBoundary(...args.map(path=>JSON.parse(readFileSync(path))));
    else if (command === 'protected') verifyProtected(...args.map(path=>JSON.parse(readFileSync(path))));
    else throw Error('Unknown development verifier command');
  } catch (error) {
    // Assertion diffs can contain private neighbor inventories. Keep the full
    // evidence local; public CI receives only the fixed reason, never values.
    const reason = error?.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : 'Input or tool output could not be verified';
    console.error(`Development release blocked: ${reason}`); process.exitCode = 1;
  }
}
