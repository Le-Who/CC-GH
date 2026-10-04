/** Approved cold-ground, Escape and bounded-test transition after prior proofs. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyRoomHudTransfer,readBeforeRoomHud} from './verify-room-hud-transfer.mjs';
const fingerprint=bytes=>({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
const APPROVED={
  "id": "cold-ground-escape-entry-harness-20261004",
  "integrationBaseCommit": "53e5fbf6b7b774ccf35ade0244dc6690519ea15f",
  "rolloutEnabled": false,
  "sourceAcceptanceChanged": false,
  "sourceRevisionChanged": true,
  "newNativeDurationEvidenceRequired": true,
  "inputs": [
    {
      "kind": "cold-ground",
      "patchSha256": "3d83482e952d61c7e7a5af1669e96673ba4ea0632e699a76d89ac7b59aed2e54",
      "sourceSha256": "28758a6fd7a29fd2e97dd7d8c12ec0dcfdaf3ea182dd04bef0d983e3f961921e",
      "independentReviewSha256": "7c4aa91959f91f32014d7d643b84c940ff1a8ada1111a201052794011017e804",
      "archive": "history/pre-cold-escape/approved-cold.patch"
    },
    {
      "kind": "eight-matrix-and-escape",
      "approvedCommit": "4f3af7f917536ed3f6ba835a37a67d6fc51df9c4",
      "patchSha256": "5fecbef7d9d7678e5491dee58e6dfb29b33474e54d28eca033fb9917ce4950f8",
      "archive": "history/pre-cold-escape/approved-eight-escape.patch"
    },
    {
      "kind": "bounded-entry-harness",
      "approvedCommit": "0af49fd37e3ed713636f4228c13d4879999a2ae3",
      "patchSha256": "0f41111e87a5a9582d746043ae0282da1431abbbaf2bb652f3d025510f5e934d",
      "archive": "history/pre-cold-escape/approved-entry-harness.patch"
    }
  ],
  "files": [
    {
      "path": ".github/workflows/ci.yml",
      "bytes": 23276,
      "sha256": "5587acdf8cdb4f24d9c11051aae17d4c93cfbf538bb83d546a2eed2228c1b5da"
    },
    {
      "path": "docs/game-entry-http-gate-fix.md",
      "bytes": 3293,
      "sha256": "9b90c763f528ead95334f230e10382fcc7c091877a88427bb48c966d61887e18"
    },
    {
      "path": "docs/yard-eight-player-acceptance-tests.md",
      "bytes": 11271,
      "sha256": "47df22df88dd953a96db1c0c545cb594f079b5fde1ea432b613756b899134898"
    },
    {
      "path": "game-logic/yard-v2/ground-coverage.mjs",
      "bytes": 7254,
      "sha256": "28758a6fd7a29fd2e97dd7d8c12ec0dcfdaf3ea182dd04bef0d983e3f961921e"
    },
    {
      "path": "package.json",
      "bytes": 8917,
      "sha256": "e7364b734888d6185723c73917ae81f99c19ae9026b46009c61e1edb56f0d906"
    },
    {
      "path": "playwright.yard-eight-player.config.js",
      "bytes": 1057,
      "sha256": "9a13d1a04892cbfe09fa25676d6a4be73068b6fc527ac29f4b89b67a32399b1b"
    },
    {
      "path": "src/games/companion-yard-v2/CourtyardGame.jsx",
      "bytes": 16110,
      "sha256": "e085833b22505f9ab58822fc129d1bec12f8bffb18a0f6af5cc5b33f48ec78a2"
    },
    {
      "path": "tests/browser-ci-contract.test.mjs",
      "bytes": 13836,
      "sha256": "07f5d9313abc443c95402f69b3b3bfeb939847ad10bc8c649d624815a039e950"
    },
    {
      "path": "tests/e2e/game-entry-flash.spec.js",
      "bytes": 10155,
      "sha256": "aed59d4fa4faf8ce82c4b180e4f21c18603ac6fcb73bd814d952884edfa81c36"
    },
    {
      "path": "tests/e2e/helpers/resourceGate.mjs",
      "bytes": 1542,
      "sha256": "9f115a637f04f5df03d84fe5377401b1234b73ccd3a2b758e354c7c693db581c"
    },
    {
      "path": "tests/e2e/helpers/swFixture.mjs",
      "bytes": 10588,
      "sha256": "73dde75cce076b88bbdfc5365b28e5a935448bcdfb5e800c9d339423ee3228f0"
    },
    {
      "path": "tests/helpers/yard-eight-player-fixtures.mjs",
      "bytes": 6966,
      "sha256": "7718a578287a59cae9a39ca45a3ce36555f3dff4758f879d59dc158ff3d8b2a6"
    },
    {
      "path": "tests/helpers/yard-eight-player-groups.mjs",
      "bytes": 3249,
      "sha256": "dc50c992afaa9baa36b3ada69b91e7828263ff45861f3833ab28b9c7463dbb2f"
    },
    {
      "path": "tests/yard-eight-player-contract.test.mjs",
      "bytes": 9845,
      "sha256": "fdb2c885534f1e4f513f0279eb3e4d8ad49fc7aa7f0661e0c3103837ae8bed13"
    },
    {
      "path": "tests/yard-eight-player-e2e/player.spec.js",
      "bytes": 18835,
      "sha256": "0aa5803d455fd0edca6e6d59f7ae32d01db2328f73d19b6e83ebf4a13b8701ac"
    },
    {
      "path": "tests/yard-ground-coverage-index.test.mjs",
      "bytes": 5555,
      "sha256": "672cfd75295b595e825bcf9b1febff52e6229c0b0d916fac9fc43464cf5e998d"
    },
    {
      "path": "tests/yard-panel-escape.test.mjs",
      "bytes": 2262,
      "sha256": "72f5b715e17537f7087ff5fc735d88df4c46160c76c594c1690d8bb20e092c8d"
    }
  ],
  "generatedFiles": [
    {
      "path": "recovery-tools/yard-canonical-eight-qa/SOURCE-CLOSURE.json",
      "bytes": 15214,
      "sha256": "c97798fe2374ae454c159f46d1106d5278fe50c2a50da61d13944bc30a50b472"
    },
    {
      "path": "recovery-tools/yard-canonical-mochi-qa/SOURCE-CLOSURE.json",
      "bytes": 15214,
      "sha256": "c97798fe2374ae454c159f46d1106d5278fe50c2a50da61d13944bc30a50b472"
    },
    {
      "path": "recovery-tools/yard-canonical-pebble-qa/SOURCE-CLOSURE.json",
      "bytes": 15214,
      "sha256": "c97798fe2374ae454c159f46d1106d5278fe50c2a50da61d13944bc30a50b472"
    },
    {
      "path": "recovery-tools/yard-canonical-pip-qa/SOURCE-CLOSURE.json",
      "bytes": 15214,
      "sha256": "c97798fe2374ae454c159f46d1106d5278fe50c2a50da61d13944bc30a50b472"
    },
    {
      "path": "recovery-tools/yard-mochi-combined-qa/SOURCE-CLOSURE.json",
      "bytes": 2685,
      "sha256": "0331d436d68c153b0e6a53e026d3e0975f9ec0157a7ffa8004c61ad39c443028"
    },
    {
      "path": "recovery-tools/yard-mochi-combined-qa/source/game-logic/yard-v2/ground-coverage.mjs",
      "bytes": 7254,
      "sha256": "28758a6fd7a29fd2e97dd7d8c12ec0dcfdaf3ea182dd04bef0d983e3f961921e"
    }
  ],
  "transitions": [
    {
      "path": "game-logic/yard-v2/ground-coverage.mjs",
      "before": {
        "bytes": 3472,
        "sha256": "5c8235c748e99c3481a3c9a08518dd4ba9821ecbe233f1fb66ba85573a51bda9",
        "archive": "history/pre-cold-escape/production/game-logic/yard-v2/ground-coverage.mjs"
      },
      "after": {
        "bytes": 7254,
        "sha256": "28758a6fd7a29fd2e97dd7d8c12ec0dcfdaf3ea182dd04bef0d983e3f961921e"
      }
    },
    {
      "path": "package.json",
      "before": {
        "bytes": 8833,
        "sha256": "a8eba1c765ea830445bd1ec918865501ba8133f8965ba7c35dc28ad7da55c1fd",
        "archive": "history/pre-cold-escape/production/package.json"
      },
      "after": {
        "bytes": 8917,
        "sha256": "e7364b734888d6185723c73917ae81f99c19ae9026b46009c61e1edb56f0d906"
      }
    },
    {
      "path": "recovery-tools/yard-canonical-eight-qa/SOURCE-CLOSURE.json",
      "before": {
        "bytes": 15214,
        "sha256": "b85dde5ae047add2f2c1fd8dc58b452c3405a50bd41988fc76b0f0a188094760",
        "archive": "history/pre-cold-escape/production/recovery-tools/yard-canonical-eight-qa/SOURCE-CLOSURE.json"
      },
      "after": {
        "bytes": 15214,
        "sha256": "c97798fe2374ae454c159f46d1106d5278fe50c2a50da61d13944bc30a50b472"
      }
    },
    {
      "path": "recovery-tools/yard-canonical-mochi-qa/SOURCE-CLOSURE.json",
      "before": {
        "bytes": 15214,
        "sha256": "b85dde5ae047add2f2c1fd8dc58b452c3405a50bd41988fc76b0f0a188094760",
        "archive": "history/pre-cold-escape/production/recovery-tools/yard-canonical-mochi-qa/SOURCE-CLOSURE.json"
      },
      "after": {
        "bytes": 15214,
        "sha256": "c97798fe2374ae454c159f46d1106d5278fe50c2a50da61d13944bc30a50b472"
      }
    },
    {
      "path": "recovery-tools/yard-canonical-pebble-qa/SOURCE-CLOSURE.json",
      "before": {
        "bytes": 15214,
        "sha256": "b85dde5ae047add2f2c1fd8dc58b452c3405a50bd41988fc76b0f0a188094760",
        "archive": "history/pre-cold-escape/production/recovery-tools/yard-canonical-pebble-qa/SOURCE-CLOSURE.json"
      },
      "after": {
        "bytes": 15214,
        "sha256": "c97798fe2374ae454c159f46d1106d5278fe50c2a50da61d13944bc30a50b472"
      }
    },
    {
      "path": "recovery-tools/yard-canonical-pip-qa/SOURCE-CLOSURE.json",
      "before": {
        "bytes": 15214,
        "sha256": "b85dde5ae047add2f2c1fd8dc58b452c3405a50bd41988fc76b0f0a188094760",
        "archive": "history/pre-cold-escape/production/recovery-tools/yard-canonical-pip-qa/SOURCE-CLOSURE.json"
      },
      "after": {
        "bytes": 15214,
        "sha256": "c97798fe2374ae454c159f46d1106d5278fe50c2a50da61d13944bc30a50b472"
      }
    },
    {
      "path": "recovery-tools/yard-mochi-combined-qa/SOURCE-CLOSURE.json",
      "before": {
        "bytes": 2685,
        "sha256": "499bcda9b711c12ed5f0a9aad77364365a8bf4c58df519659d581592f1303798",
        "archive": "history/pre-cold-escape/production/recovery-tools/yard-mochi-combined-qa/SOURCE-CLOSURE.json"
      },
      "after": {
        "bytes": 2685,
        "sha256": "0331d436d68c153b0e6a53e026d3e0975f9ec0157a7ffa8004c61ad39c443028"
      }
    },
    {
      "path": "recovery-tools/yard-mochi-combined-qa/source/game-logic/yard-v2/ground-coverage.mjs",
      "before": {
        "bytes": 3472,
        "sha256": "5c8235c748e99c3481a3c9a08518dd4ba9821ecbe233f1fb66ba85573a51bda9",
        "archive": "history/pre-cold-escape/production/recovery-tools/yard-mochi-combined-qa/source/game-logic/yard-v2/ground-coverage.mjs"
      },
      "after": {
        "bytes": 7254,
        "sha256": "28758a6fd7a29fd2e97dd7d8c12ec0dcfdaf3ea182dd04bef0d983e3f961921e"
      }
    },
    {
      "path": "src/games/companion-yard-v2/CourtyardGame.jsx",
      "before": {
        "bytes": 16003,
        "sha256": "8b56e225ff7e548923d6ebaa537a0cb5ed1a63eea3f2f647cb4cd9367d115476",
        "archive": "history/pre-cold-escape/production/src/games/companion-yard-v2/CourtyardGame.jsx"
      },
      "after": {
        "bytes": 16110,
        "sha256": "e085833b22505f9ab58822fc129d1bec12f8bffb18a0f6af5cc5b33f48ec78a2"
      }
    },
    {
      "path": "tests/e2e/game-entry-flash.spec.js",
      "before": {
        "bytes": 8909,
        "sha256": "53e0689aa9d3e05cf9459f51d80281dce3395c57ba22e99fe21758605a6a8e48",
        "archive": "history/pre-cold-escape/production/tests/e2e/game-entry-flash.spec.js"
      },
      "after": {
        "bytes": 10155,
        "sha256": "aed59d4fa4faf8ce82c4b180e4f21c18603ac6fcb73bd814d952884edfa81c36"
      }
    },
    {
      "path": "tests/e2e/helpers/resourceGate.mjs",
      "before": {
        "bytes": 894,
        "sha256": "3cd8c36a598e7baffa13ba01e68617fbdad1bf01916b14ee328a6caed67b8894",
        "archive": "history/pre-cold-escape/production/tests/e2e/helpers/resourceGate.mjs"
      },
      "after": {
        "bytes": 1542,
        "sha256": "9f115a637f04f5df03d84fe5377401b1234b73ccd3a2b758e354c7c693db581c"
      }
    },
    {
      "path": "tests/e2e/helpers/swFixture.mjs",
      "before": {
        "bytes": 10550,
        "sha256": "8cce432e0d393ee631bb7b34a6ad2eb78349f4939284386905489824b048f47a",
        "archive": "history/pre-cold-escape/production/tests/e2e/helpers/swFixture.mjs"
      },
      "after": {
        "bytes": 10588,
        "sha256": "73dde75cce076b88bbdfc5365b28e5a935448bcdfb5e800c9d339423ee3228f0"
      }
    }
  ],
  "archiveFiles": [
    {
      "path": "history/pre-cold-escape/approved-cold.patch",
      "bytes": 20588,
      "sha256": "3d83482e952d61c7e7a5af1669e96673ba4ea0632e699a76d89ac7b59aed2e54"
    },
    {
      "path": "history/pre-cold-escape/approved-eight-escape.patch",
      "bytes": 30467,
      "sha256": "5fecbef7d9d7678e5491dee58e6dfb29b33474e54d28eca033fb9917ce4950f8"
    },
    {
      "path": "history/pre-cold-escape/approved-entry-harness.patch",
      "bytes": 14791,
      "sha256": "0f41111e87a5a9582d746043ae0282da1431abbbaf2bb652f3d025510f5e934d"
    },
    {
      "path": "history/pre-cold-escape/base-contract.json",
      "bytes": 41502,
      "sha256": "1a83879afd0dd543b486a7502bcd00210a2cbc54df9c8822eb434d329755bca1"
    },
    {
      "path": "history/pre-cold-escape/checks/closed-rollout-guard.checks.mjs",
      "bytes": 10045,
      "sha256": "3677deb9efc77d7829fdde6f124a1172426df5a79b7d4e4fe2634e426bf96a87"
    },
    {
      "path": "history/pre-cold-escape/production/game-logic/yard-v2/ground-coverage.mjs",
      "bytes": 3472,
      "sha256": "5c8235c748e99c3481a3c9a08518dd4ba9821ecbe233f1fb66ba85573a51bda9"
    },
    {
      "path": "history/pre-cold-escape/production/package.json",
      "bytes": 8833,
      "sha256": "a8eba1c765ea830445bd1ec918865501ba8133f8965ba7c35dc28ad7da55c1fd"
    },
    {
      "path": "history/pre-cold-escape/production/recovery-tools/yard-canonical-eight-qa/SOURCE-CLOSURE.json",
      "bytes": 15214,
      "sha256": "b85dde5ae047add2f2c1fd8dc58b452c3405a50bd41988fc76b0f0a188094760"
    },
    {
      "path": "history/pre-cold-escape/production/recovery-tools/yard-canonical-mochi-qa/SOURCE-CLOSURE.json",
      "bytes": 15214,
      "sha256": "b85dde5ae047add2f2c1fd8dc58b452c3405a50bd41988fc76b0f0a188094760"
    },
    {
      "path": "history/pre-cold-escape/production/recovery-tools/yard-canonical-pebble-qa/SOURCE-CLOSURE.json",
      "bytes": 15214,
      "sha256": "b85dde5ae047add2f2c1fd8dc58b452c3405a50bd41988fc76b0f0a188094760"
    },
    {
      "path": "history/pre-cold-escape/production/recovery-tools/yard-canonical-pip-qa/SOURCE-CLOSURE.json",
      "bytes": 15214,
      "sha256": "b85dde5ae047add2f2c1fd8dc58b452c3405a50bd41988fc76b0f0a188094760"
    },
    {
      "path": "history/pre-cold-escape/production/recovery-tools/yard-mochi-combined-qa/SOURCE-CLOSURE.json",
      "bytes": 2685,
      "sha256": "499bcda9b711c12ed5f0a9aad77364365a8bf4c58df519659d581592f1303798"
    },
    {
      "path": "history/pre-cold-escape/production/recovery-tools/yard-mochi-combined-qa/source/game-logic/yard-v2/ground-coverage.mjs",
      "bytes": 3472,
      "sha256": "5c8235c748e99c3481a3c9a08518dd4ba9821ecbe233f1fb66ba85573a51bda9"
    },
    {
      "path": "history/pre-cold-escape/production/src/games/companion-yard-v2/CourtyardGame.jsx",
      "bytes": 16003,
      "sha256": "8b56e225ff7e548923d6ebaa537a0cb5ed1a63eea3f2f647cb4cd9367d115476"
    },
    {
      "path": "history/pre-cold-escape/production/tests/e2e/game-entry-flash.spec.js",
      "bytes": 8909,
      "sha256": "53e0689aa9d3e05cf9459f51d80281dce3395c57ba22e99fe21758605a6a8e48"
    },
    {
      "path": "history/pre-cold-escape/production/tests/e2e/helpers/resourceGate.mjs",
      "bytes": 894,
      "sha256": "3cd8c36a598e7baffa13ba01e68617fbdad1bf01916b14ee328a6caed67b8894"
    },
    {
      "path": "history/pre-cold-escape/production/tests/e2e/helpers/swFixture.mjs",
      "bytes": 10550,
      "sha256": "8cce432e0d393ee631bb7b34a6ad2eb78349f4939284386905489824b048f47a"
    },
    {
      "path": "history/pre-cold-escape/verify-presentation-transfer.mjs",
      "bytes": 8213,
      "sha256": "ac775470aac052163e4e930ccde48f15b5843a525745fd3434f0cc9d40b87fe2"
    }
  ]
};
export function verifyColdEscapeTransfer({rootDir,contract,roomHud=verifyRoomHudTransfer({rootDir,contract})}) {
  const proofContract=roomHud.priorContract;
  const candidate=resolve(rootDir,'preview/yard-persistent-candidate');
  const read=path=>readFileSync(resolve(candidate,path));
  const reviewed=proofContract.reviewedColdEscapeChangeSet;
  assert.deepEqual(reviewed,APPROVED,'Cold/Escape transfer must retain independently reviewed identities');
  for(const row of APPROVED.archiveFiles)assert.deepEqual(fingerprint(read(row.path)),{bytes:row.bytes,sha256:row.sha256},row.path);
  for(const input of APPROVED.inputs)assert.equal(fingerprint(read(input.archive)).sha256,input.patchSha256);
  const priorContract=JSON.parse(read('history/pre-cold-escape/base-contract.json'));
  const expected=structuredClone(priorContract);
  const packageTransition=APPROVED.transitions.find(row=>row.path==='package.json');
  Object.assign(expected.productionFiles.find(row=>row.path==='package.json'),packageTransition.after);
  expected.reviewedColdEscapeChangeSet=reviewed;
  assert.deepEqual(proofContract,expected,'Cold/Escape transfer must preserve all prior histories, sourceInputs and unrelated pins');
  for(const row of [...APPROVED.files,...APPROVED.generatedFiles])assert.deepEqual(fingerprint(readBeforeRoomHud({rootDir,roomHud,path:row.path})),{bytes:row.bytes,sha256:row.sha256},`Reviewed cold/Escape file: ${row.path}`);
  for(const row of APPROVED.transitions)assert.deepEqual(fingerprint(read(row.before.archive)),{bytes:row.before.bytes,sha256:row.before.sha256},row.path);
  const before=JSON.parse(read(packageTransition.before.archive));
  const packageExpected=structuredClone(before);
  assert.equal(before.scripts.test.split('tests/yard-native-duration.test.mjs').length,2);
  packageExpected.scripts.test=before.scripts.test.replace('tests/yard-native-duration.test.mjs','tests/yard-native-duration.test.mjs tests/yard-ground-coverage-index.test.mjs');
  packageExpected.scripts['test:yard-family']+=' tests/yard-ground-coverage-index.test.mjs';
  assert.deepEqual(JSON.parse(readFileSync(resolve(rootDir,'package.json'))),packageExpected,'Cold package edit must preserve every existing test and dependency');
  for(const row of APPROVED.transitions.filter(row=>row.path.endsWith('/SOURCE-CLOSURE.json'))){
    const expected=JSON.parse(read(row.before.archive));
    const ground=expected.files.find(file=>file.path==='game-logic/yard-v2/ground-coverage.mjs');assert.ok(ground);
    ground.sha256=APPROVED.inputs[0].sourceSha256;
    assert.deepEqual(JSON.parse(readFileSync(resolve(rootDir,row.path))),expected,'Source closure may change only the reviewed ground hash');
  }
  return {priorContract,transitions:APPROVED.transitions,reviewedFiles:APPROVED.files.length,generatedFiles:APPROVED.generatedFiles.length,reviewedPinTransitions:1,newNativeDurationEvidenceRequired:true,roomHud};
}
export function readBeforeColdEscape({rootDir,cold,path}) {
  const transition=cold.transitions.find(row=>row.path===path);
  return transition?readFileSync(resolve(rootDir,'preview/yard-persistent-candidate',transition.before.archive)):readBeforeRoomHud({rootDir,roomHud:cold.roomHud,path});
}
