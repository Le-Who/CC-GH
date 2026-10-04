/** Reviewed first-frame presentation only, chained after closed wiring and rollback.
 * Fixed source identities prevent a new pin from inventing its own approval. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyColdEscapeTransfer,readBeforeColdEscape} from './verify-cold-escape-transfer.mjs';
const fingerprint=bytes=>({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
const APPROVED_COMMIT='9e856bda5c5a36325d7cae90c2c3c32ac0ee8243';
const APPROVED_PATCH='77212fc088f4ec2120cbc46d0e576bf8f82c9f0268c981dcd73c8f3a77f1ee01';
const PRIOR_CONTRACT='507a21409eecd13358464b7503db96e3d56c323d4413cf17edd36fbf6f6fe1b1';
const APPROVED_FILES=[
  {
    "path": "docs/game-entry-flash-fix.md",
    "bytes": 5903,
    "sha256": "6becac87be4ac4494fabfebc7b219df13019231f10a5ef2033dca6f6ba5ef12e"
  },
  {
    "path": "package.json",
    "bytes": 8833,
    "sha256": "a8eba1c765ea830445bd1ec918865501ba8133f8965ba7c35dc28ad7da55c1fd"
  },
  {
    "path": "scripts/browser-ci-groups.mjs",
    "bytes": 6244,
    "sha256": "b2c953ab8d20792b7048210896092efdf9f1f9ef2413f3b637c0a99425b3a720"
  },
  {
    "path": "src/App.jsx",
    "bytes": 21301,
    "sha256": "8fa7e95a2b0135201aa39aae61182c9a6124cb140a4a3a8d1653f6830609883a"
  },
  {
    "path": "src/app/gameChunks.jsx",
    "bytes": 2108,
    "sha256": "50d85d75c7db865dd3a4cdeffe68d5efd952a5850f9db150a0e8539f503b0187"
  },
  {
    "path": "src/index.css",
    "bytes": 48988,
    "sha256": "39b941da50773d12dabbbb3e94136c0846ca926ea314280ed6929924a2b5b8e9"
  },
  {
    "path": "tests/e2e/game-entry-flash.spec.js",
    "bytes": 8909,
    "sha256": "53e0689aa9d3e05cf9459f51d80281dce3395c57ba22e99fe21758605a6a8e48"
  },
  {
    "path": "tests/e2e/helpers/entryFrames.js",
    "bytes": 3159,
    "sha256": "51f252b6fadb73ce4bfc91d873df2194ffb41b7151ca4fedb0c5c482e3c85149"
  },
  {
    "path": "tests/e2e/helpers/resourceGate.mjs",
    "bytes": 894,
    "sha256": "3cd8c36a598e7baffa13ba01e68617fbdad1bf01916b14ee328a6caed67b8894"
  },
  {
    "path": "tests/e2e/helpers/swFixture.mjs",
    "bytes": 10550,
    "sha256": "8cce432e0d393ee631bb7b34a6ad2eb78349f4939284386905489824b048f47a"
  },
  {
    "path": "tests/game-entry-presentation.test.mjs",
    "bytes": 3401,
    "sha256": "4495e89d0c7040ea0360c1bc245caa8401044c8e22ec14940d552415facd0ad2"
  }
];
const APPROVED_ARCHIVES=[
  {
    "path": "history/pre-entry-presentation/approved-flash.patch",
    "bytes": 43939,
    "sha256": "77212fc088f4ec2120cbc46d0e576bf8f82c9f0268c981dcd73c8f3a77f1ee01"
  },
  {
    "path": "history/pre-entry-presentation/base-contract.json",
    "bytes": 35466,
    "sha256": "507a21409eecd13358464b7503db96e3d56c323d4413cf17edd36fbf6f6fe1b1"
  },
  {
    "path": "history/pre-entry-presentation/checks/closed-rollout-guard.checks.mjs",
    "bytes": 7110,
    "sha256": "aef6b4f56f6125f5af7dfee32a7707585f75fec1ee47fb2c2ab6aaa50e7be959"
  },
  {
    "path": "history/pre-entry-presentation/production/package.json",
    "bytes": 8794,
    "sha256": "efaaba8f4842511d35de9cab54f875821418a25920ac5cdd21b49169f238ebe1"
  },
  {
    "path": "history/pre-entry-presentation/production/src/App.jsx",
    "bytes": 20935,
    "sha256": "66acf7d411133bc973a0c7b598be00fe271f252413fdb1ff7a4dd1e0f1560aba"
  },
  {
    "path": "history/pre-entry-presentation/production/src/app/gameChunks.jsx",
    "bytes": 1487,
    "sha256": "d4fece2454792e4787f6206e6c5a9487e489a3ebb0d594afcfad7c280ad804f2"
  },
  {
    "path": "history/pre-entry-presentation/production/src/index.css",
    "bytes": 47044,
    "sha256": "ab8267dd47af2184610263248d526e79e5e5f5d0247566306e76f1a4b8f94b70"
  },
  {
    "path": "history/pre-entry-presentation/verify-boundary-transfer.mjs",
    "bytes": 5962,
    "sha256": "933e96a3b7a9186117bba5e637939515f7c5df25d6f4db7d88284b09384d8786"
  },
  {
    "path": "history/pre-entry-presentation/verify-production.mjs",
    "bytes": 2130,
    "sha256": "6430238dffdcd9eabb633a6b627e0aaf12381a9af95fc10f6bfa1d45edec8fb9"
  },
  {
    "path": "history/pre-entry-presentation/verify-rollback-transfer.mjs",
    "bytes": 3500,
    "sha256": "6cf61255f159db05a612568cc65bd726aacda1d66b77f2a05c1959f606410c12"
  }
];
const TRANSITION_PATHS=['package.json','src/App.jsx','src/app/gameChunks.jsx','src/index.css'];
export function verifyPresentationTransfer({rootDir,contract,cold=verifyColdEscapeTransfer({rootDir,contract})}) {
  const proofContract=cold.priorContract;
  const production=path=>readBeforeColdEscape({rootDir,cold,path});
  const candidate=resolve(rootDir,'preview/yard-persistent-candidate');
  const read=path=>readFileSync(resolve(candidate,path));
  const reviewed=proofContract.reviewedPresentationChangeSet;
  assert.equal(reviewed?.id,'game-entry-presentation-20261004');
  assert.equal(reviewed.approvedCommit,APPROVED_COMMIT);
  assert.equal(reviewed.approvedPatchSha256,APPROVED_PATCH);
  assert.equal(reviewed.integrationBaseCommit,'a8b3a937bfcda7f88157899204809fc4934cba0c');
  assert.equal(reviewed.rolloutEnabled,false);assert.equal(reviewed.sourceAcceptanceChanged,false);
  assert.deepEqual(reviewed.files,APPROVED_FILES,'Presentation files must retain independently reviewed identities');
  assert.deepEqual(reviewed.archiveFiles,APPROVED_ARCHIVES,'Presentation archives must retain the exact prior evidence');
  for(const row of APPROVED_ARCHIVES)assert.deepEqual(fingerprint(read(row.path)),{bytes:row.bytes,sha256:row.sha256},row.path);
  assert.equal(fingerprint(read('history/pre-entry-presentation/approved-flash.patch')).sha256,APPROVED_PATCH);
  assert.equal(fingerprint(read('history/pre-entry-presentation/base-contract.json')).sha256,PRIOR_CONTRACT);
  const priorContract=JSON.parse(read('history/pre-entry-presentation/base-contract.json'));
  assert.deepEqual(reviewed.transitions.map(row=>row.path).sort(),TRANSITION_PATHS,'Exactly four reviewed presentation pins may change');
  for(const row of reviewed.transitions){
    const before=priorContract.productionFiles.find(pin=>pin.path===row.path);
    const after=proofContract.productionFiles.find(pin=>pin.path===row.path);
    const approved=APPROVED_FILES.find(file=>file.path===row.path);
    assert.ok(before&&after&&approved,row.path);
    assert.deepEqual(row.before,{bytes:before.bytes,sha256:before.sha256,archive:'history/pre-entry-presentation/production/'+row.path},row.path);
    assert.deepEqual(fingerprint(read(row.before.archive)),{bytes:before.bytes,sha256:before.sha256},row.path);
    assert.deepEqual(row.after,{bytes:approved.bytes,sha256:approved.sha256},row.path);
    assert.deepEqual(after,{path:row.path,...row.after},row.path);
  }
  const expected=structuredClone(priorContract);
  for(const row of reviewed.transitions)Object.assign(expected.productionFiles.find(pin=>pin.path===row.path),row.after);
  expected.reviewedPresentationChangeSet=reviewed;
  assert.deepEqual(proofContract,expected,'Presentation transfer must preserve all prior histories, sourceInputs and unrelated pins');
  for(const row of APPROVED_FILES)assert.deepEqual(fingerprint(production(row.path)),{bytes:row.bytes,sha256:row.sha256},`Reviewed presentation file: ${row.path}`);
  // Re-prove the package edit semantically instead of just trusting its hash.
  const before=JSON.parse(read('history/pre-entry-presentation/production/package.json'));
  const after=JSON.parse(production('package.json'));
  const packageExpected=structuredClone(before);
  assert.equal(before.scripts.test.split('tests/home-navigation.test.js').length,2);
  packageExpected.scripts.test=before.scripts.test.replace('tests/home-navigation.test.js','tests/home-navigation.test.js tests/game-entry-presentation.test.mjs');
  assert.deepEqual(after,packageExpected,'Presentation package change may only register its reviewed test');
  return {approvedCommit:APPROVED_COMMIT,approvedPatchSha256:APPROVED_PATCH,reviewedFiles:APPROVED_FILES.length,reviewedPinTransitions:4,transitions:reviewed.transitions,priorContract,cold};
}
/** Bytes at the prior proof boundary, validated by verifyPresentationTransfer. */
export function readBeforePresentation({rootDir,presentation,path}) {
  const transition=presentation.transitions.find(row=>row.path===path);
  return transition?readFileSync(resolve(rootDir,'preview/yard-persistent-candidate',transition.before.archive)):readBeforeColdEscape({rootDir,cold:presentation.cold,path});
}
