/** Two distinct proofs: archived overlay provenance, and reviewed closed wiring.
 * Integrated files are never compared as if they were still the old overlay base. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyRollbackTransfer} from './verify-rollback-transfer.mjs';
import {verifyPresentationTransfer,readBeforePresentation} from './verify-presentation-transfer.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyBoundaryTransfer({rootDir=root}={}) {
  const candidate=resolve(rootDir,'preview/yard-persistent-candidate');
  const read=path=>readFileSync(resolve(candidate,path));
  const contract=JSON.parse(read('base-contract.json')),reviewed=contract.reviewedPlayerWiringChangeSet;
  const presentation=verifyPresentationTransfer({rootDir,contract});
  const proofContract=presentation.priorContract;
  const rollback=verifyRollbackTransfer({rootDir,contract,presentation});
  assert.equal(reviewed?.rolloutEnabled,false);assert.equal(reviewed.sourceAcceptanceChanged,false);
  assert.equal(reviewed.integrationBaseCommit,contract.baseCommit);
  const historical=JSON.parse(read('history/pre-player-rollout/base-contract.json'));
  for(const item of reviewed.archiveFiles){const bytes=read(item.path);assert.equal(bytes.length,item.bytes,item.path);assert.equal(hash(bytes),item.sha256,item.path);}
  const evidence=JSON.parse(readFileSync(resolve(rootDir,'evidence/yard-player-rollout-file-delta.json')));
  assert.equal(evidence.baselineTree,reviewed.sourceBaselineTree);
  const approved=evidence.files.filter(f=>f.protectedByInactiveGuard);
  assert.equal(approved.length,9);assert.equal(reviewed.transitions.length,9);
  assert.equal(new Set(reviewed.transitions.map(x=>x.path)).size,9);
  for(const transition of reviewed.transitions){
    const path=transition.path,previous=historical.productionFiles.find(p=>p.path===path),entry=proofContract.productionFiles.find(p=>p.path===path),signed=approved.find(p=>p.path===path);
    assert.ok(previous&&entry&&signed,path);
    assert.deepEqual({bytes:previous.bytes,sha256:previous.sha256},signed.before,path);
    assert.deepEqual({bytes:transition.before.bytes,sha256:transition.before.sha256},signed.before,path);
    assert.deepEqual(transition.after,signed.after,path);
    assert.equal(hash(read(transition.before.archive)),previous.sha256,path);
    const later=rollback.transitions.find(row=>row.path===path);
    if(later)assert.deepEqual({bytes:later.before.bytes,sha256:later.before.sha256},transition.after,path);
    const expected=later?.after||transition.after,current=readBeforePresentation({rootDir,presentation,path});
    assert.deepEqual({bytes:current.length,sha256:hash(current)},expected,path);
    assert.deepEqual({bytes:entry.bytes,sha256:entry.sha256},expected,path);
  }
  const changed=new Set(reviewed.transitions.map(x=>x.path));
  assert.equal(proofContract.productionFiles.length,historical.productionFiles.length);
  for(const item of historical.productionFiles.filter(x=>!changed.has(x.path)))assert.deepEqual(proofContract.productionFiles.find(x=>x.path===item.path),item,'Unrelated production pin changed');
  // Historical source-input attestations remain literal history, including the
  // inherited stale store pin. Do not silently replace them with current bytes.
  assert.deepEqual(contract.sourceInputs,historical.sourceInputs);
  const temporary=mkdtempSync(resolve(tmpdir(),'cc-gh-boundary-transfer-'));
  const left=resolve(temporary,'left'),right=resolve(temporary,'right');
  function delta(a,b){
    writeFileSync(left,a);writeFileSync(right,b);
    const result=spawnSync('git',['-c','core.autocrlf=false','diff','--no-index','--unified=0','--',left,right],{encoding:'utf8',windowsHide:true});
    assert.ok(result.status===0||result.status===1,result.stderr);
    return result.stdout.split('\n').filter(line=>/^[+-]/.test(line)&&!/^([+]{3}|[-]{3}) /.test(line)).join('\n');
  }
  try {
    const provenance=historical.reviewedBoundaryChangeSet.originalYardDeltaEvidence.map(item=>{
      const path=item.path,prefix='history/pre-player-rollout/';
      const input=historical.sourceInputs.find(row=>row.source===path);
      assert.equal(hash(read(prefix+'boundary-original/production/'+path)),input.reviewedProductionSha256);
      assert.equal(hash(read(prefix+'boundary-original/overlay/'+path)),input.candidateSha256);
      const original=hash(delta(read(prefix+'boundary-original/production/'+path),read(prefix+'boundary-original/overlay/'+path)));
      assert.equal(original,item.yardDeltaSha256,`${path}: archived original Yard delta`);
      const prior=hash(delta(read(prefix+'production/'+path),read(prefix+'boundary-pre-integration-overlay/'+path)));
      const expected=path==='src/game-state/useGameHub.js'?reviewed.historicalBoundaryStatus.preIntegrationStoreDeltaSha256:item.yardDeltaSha256;
      assert.equal(prior,expected,`${path}: captured pre-integration delta changed`);
      assert.equal(hash(read('overrides/'+path)),hash(read(prefix+'boundary-pre-integration-overlay/'+path)),`${path}: frozen overlay changed`);
      return {path,originalDeltaSha256:original,preIntegrationDeltaSha256:prior,preIntegrationMatchesOriginal:prior===original};
    });
    return {approvedWiringCommit:reviewed.approvedWiringCommit,integrationBaseCommit:reviewed.integrationBaseCommit,
      reviewedProductionTransitions:9,unchangedProductionPins:15,rollbackGuard:{approvedCommit:rollback.approvedCommit,reviewedFiles:rollback.reviewedFiles,reviewedPinTransitions:rollback.reviewedPinTransitions},presentationGuard:{approvedCommit:presentation.approvedCommit,approvedPatchSha256:presentation.approvedPatchSha256,reviewedFiles:presentation.reviewedFiles,reviewedPinTransitions:presentation.reviewedPinTransitions},historicalProvenance:provenance,
      historicalStoreMismatch:'preserved and disclosed; not a current integration test'};
  } finally {rmSync(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyBoundaryTransfer(),null,2));
