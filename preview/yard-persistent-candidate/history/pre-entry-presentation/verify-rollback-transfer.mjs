/** A second reviewed transition; the earlier 704 wiring proof remains intact. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const fingerprint=bytes=>({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
export function verifyRollbackTransfer({rootDir,contract}) {
  const candidate=resolve(rootDir,'preview/yard-persistent-candidate');
  const read=path=>readFileSync(resolve(candidate,path));
  const ops=contract.reviewedRollbackGuardChangeSet;
  assert.equal(ops?.approvedCommit,'6b01f6ce6aaf341e1345e4f244a3e871bd28784a');
  assert.equal(ops.approvedPatchSha256,'cbe0fb9eac2ea28f9991fca81608507a3ef41bb089dc35e5f81989eeec62f79c');
  assert.equal(ops.rolloutEnabled,false);assert.equal(ops.sourceAcceptanceChanged,false);
  assert.equal(ops.activePredecessorPinned,false);assert.equal(ops.historicalLegacyIdentityOnly,true);
  for(const row of ops.archiveFiles)assert.deepEqual(fingerprint(read(row.path)),{bytes:row.bytes,sha256:row.sha256},row.path);
  assert.equal(fingerprint(read('history/pre-rollback-guard/approved-ops.patch')).sha256,ops.approvedPatchSha256);
  const prior=JSON.parse(read('history/pre-rollback-guard/base-contract.json'));
  assert.deepEqual(contract.reviewedPlayerWiringChangeSet.transitions,prior.reviewedPlayerWiringChangeSet.transitions,'Original wiring transitions must remain historical');
  const expectedPaths=['.github/workflows/deploy.yml','docs/yard-two-phase-release.md','game-logic/yard-v2/release-policy.mjs','package.json','scripts/verify-yard-rollback-target.mjs','scripts/yard-pre-switch-guard.sh','scripts/yard-release-compatibility.mjs','tests/yard-rollback-guard.test.mjs'];
  assert.deepEqual(ops.files.map(row=>row.path).sort(),expectedPaths.sort(),'Exactly the reviewed eight ops files are required');
  for(const row of ops.files)assert.deepEqual(fingerprint(readFileSync(resolve(rootDir,row.path))),{bytes:row.bytes,sha256:row.sha256},`Reviewed rollback file: ${row.path}`);
  assert.deepEqual(ops.transitions.map(row=>row.path).sort(),['game-logic/yard-v2/release-policy.mjs','package.json']);
  for(const row of ops.transitions){
    const pins=row.path==='package.json'?'productionFiles':null;
    const before=(pins?prior[pins]:prior.reviewedPlayerWiringChangeSet.closedRolloutFiles).find(pin=>pin.path===row.path);
    const after=(pins?contract[pins]:contract.reviewedPlayerWiringChangeSet.closedRolloutFiles).find(pin=>pin.path===row.path);
    assert.deepEqual(fingerprint(read(row.before.archive)),{bytes:row.before.bytes,sha256:row.before.sha256},row.path);
    assert.deepEqual({bytes:before.bytes,sha256:before.sha256},{bytes:row.before.bytes,sha256:row.before.sha256},row.path);
    assert.deepEqual({bytes:after.bytes,sha256:after.sha256},row.after,row.path);
  }
  const before=JSON.parse(read('history/pre-rollback-guard/production/package.json'));
  const after=JSON.parse(readFileSync(resolve(rootDir,'package.json')));
  const expected=structuredClone(before);
  expected.scripts.test+=' tests/yard-rollback-guard.test.mjs';
  expected.scripts['test:yard-rollback-guard']='node --test tests/yard-rollback-guard.test.mjs tests/release-gate.test.js';
  assert.deepEqual(after,expected,'Rollback package transition must only append the reviewed test and dedicated command');
  return {approvedCommit:ops.approvedCommit,reviewedFiles:8,reviewedPinTransitions:2,transitions:ops.transitions};
}
