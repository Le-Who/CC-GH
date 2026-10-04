/** Reviewed arcade-only baseline evolution. Earlier Yard history stays byte-exact. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const fingerprint=bytes=>({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
const APPROVED={
  "id": "arcade-terminal-session-reward-fence-20261004",
  "integrationBaseCommit": "962323817b77eff1a4a20be71b38f8d462b9054f",
  "reviewedCommit": "3c7854300c823b058c5ef1cff7b50560b7720679",
  "approvedPatchSha256": "55848d4c34781262d4d56961dceb5faf17e1a7f38176ef305f761c1734724640",
  "rolloutEnabled": false,
  "sourceAcceptanceChanged": false,
  "canonicalSourceClosureChanged": false,
  "transitions": [
    {
      "path": "routes/player.js",
      "before": {
        "bytes": 61600,
        "sha256": "b9b26e84a95c05202c049100b682480edf76638fbdbd22a07f47d4adb061a1fa",
        "archive": "history/pre-arcade-reward/production/routes/player.js"
      },
      "after": {
        "bytes": 62070,
        "sha256": "81f1853fdeb714fdea94beb2d53781ad032ab92a9074c0a175931cc155efe054"
      }
    },
    {
      "path": "package.json",
      "before": {
        "bytes": 8917,
        "sha256": "e7364b734888d6185723c73917ae81f99c19ae9026b46009c61e1edb56f0d906",
        "archive": "history/pre-arcade-reward/production/package.json"
      },
      "after": {
        "bytes": 8951,
        "sha256": "5752f6409107717636302c5bfae7f31a25b3ac64e63504e762e9fe4061cf406d"
      }
    }
  ],
  "files": [
    {
      "path": "routes/player.js",
      "bytes": 62070,
      "sha256": "81f1853fdeb714fdea94beb2d53781ad032ab92a9074c0a175931cc155efe054"
    },
    {
      "path": "routes/match3.js",
      "bytes": 5782,
      "sha256": "fe6399122587e2c5ed53783f6431d71653a8e4cd69965ac91372a553601baa0e"
    },
    {
      "path": "routes/blox.js",
      "bytes": 4346,
      "sha256": "d6568ac325ba1116d401662ad75e7d1af7403abcbed8d983c0d505ce383d0c22"
    },
    {
      "path": "package.json",
      "bytes": 8951,
      "sha256": "5752f6409107717636302c5bfae7f31a25b3ac64e63504e762e9fe4061cf406d"
    },
    {
      "path": "tests/arcade-reward-once.test.mjs",
      "bytes": 8308,
      "sha256": "f6d93adf0447f95d70b12b64b063fab63c5b0b71948c3c0bc30498aed3527def"
    }
  ],
  "archiveFiles": [
    {
      "path": "history/pre-arcade-reward/approved-reward-fix.patch",
      "bytes": 21540,
      "sha256": "55848d4c34781262d4d56961dceb5faf17e1a7f38176ef305f761c1734724640"
    },
    {
      "path": "history/pre-arcade-reward/base-contract.json",
      "bytes": 102749,
      "sha256": "dcbbe9fd517724b156ee70c6c4db8a348169750354b36335265b08409b72bd07"
    },
    {
      "path": "history/pre-arcade-reward/production/package.json",
      "bytes": 8917,
      "sha256": "e7364b734888d6185723c73917ae81f99c19ae9026b46009c61e1edb56f0d906"
    },
    {
      "path": "history/pre-arcade-reward/production/routes/player.js",
      "bytes": 61600,
      "sha256": "b9b26e84a95c05202c049100b682480edf76638fbdbd22a07f47d4adb061a1fa"
    }
  ]
};
export function verifyArcadeRewardTransfer({rootDir,contract}) {
 const candidate=resolve(rootDir,'preview/yard-persistent-candidate');
 const read=path=>readFileSync(resolve(candidate,path));
 assert.deepEqual(contract.reviewedArcadeRewardChangeSet,APPROVED,'Arcade reward transfer must retain independently reviewed identities');
 for(const row of APPROVED.archiveFiles)assert.deepEqual(fingerprint(read(row.path)),{bytes:row.bytes,sha256:row.sha256},row.path);
 assert.equal(fingerprint(read('history/pre-arcade-reward/approved-reward-fix.patch')).sha256,APPROVED.approvedPatchSha256);
 const priorContract=JSON.parse(read('history/pre-arcade-reward/base-contract.json')),expected=structuredClone(priorContract);
 assert.deepEqual(APPROVED.transitions.map(row=>row.path),['routes/player.js','package.json']);
 for(const row of APPROVED.transitions){
  const pin=expected.productionFiles.find(pin=>pin.path===row.path);assert.ok(pin);
  assert.deepEqual({bytes:pin.bytes,sha256:pin.sha256},{bytes:row.before.bytes,sha256:row.before.sha256});
  assert.deepEqual(fingerprint(read(row.before.archive)),{bytes:row.before.bytes,sha256:row.before.sha256});Object.assign(pin,row.after);
 }
 expected.reviewedArcadeRewardChangeSet=APPROVED;
 assert.deepEqual(contract,expected,'Arcade reward transfer must preserve all unrelated pins, history, source inputs and closed gates');
 for(const row of APPROVED.files)assert.deepEqual(fingerprint(readFileSync(resolve(rootDir,row.path))),{bytes:row.bytes,sha256:row.sha256},`Reviewed arcade reward file: ${row.path}`);
 // Independently constrain the package edit to this one regression registration.
 const previous=JSON.parse(read('history/pre-arcade-reward/production/package.json'));
 assert.equal(previous.scripts.test.split('tests/unit.test.js tests/auth.test.js').length,2);
 previous.scripts.test=previous.scripts.test.replace('tests/unit.test.js tests/auth.test.js','tests/unit.test.js tests/arcade-reward-once.test.mjs tests/auth.test.js');
 assert.deepEqual(JSON.parse(readFileSync(resolve(rootDir,'package.json'))),previous,'Arcade package change must only register the reviewed regression');
 return {priorContract,reviewedCommit:APPROVED.reviewedCommit,integrationBaseCommit:APPROVED.integrationBaseCommit,transitions:APPROVED.transitions,reviewedFiles:APPROVED.files.length,reviewedPinTransitions:2,approvedPatchSha256:APPROVED.approvedPatchSha256};
}
export function readBeforeArcadeReward({rootDir,arcade,path}) {
 const transition=arcade.transitions.find(row=>row.path===path);
 return readFileSync(transition?resolve(rootDir,'preview/yard-persistent-candidate',transition.before.archive):resolve(rootDir,path));
}
