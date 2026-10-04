import {verifyArcadeRewardTransfer,readBeforeArcadeReward} from './verify-arcade-reward-transfer.mjs';
/** Reviewed optional CLOSED-receipt reuse and API lifecycle follow-up. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const fingerprint=bytes=>({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
const APPROVED={
  "id": "closed-receipt-api-lifecycle-20261004",
  "integrationBaseCommit": "8bbfd4d5f071c778c0b1e8920bd6c644ac664bbc",
  "rolloutEnabled": false,
  "sourceAcceptanceChanged": false,
  "canonicalSourceClosureChanged": false,
  "inputs": [
    {
      "kind": "optional-closed-ci-receipt-reuse",
      "approvedCommit": "751862cbaf08e9533d5e77b8aa74d2e58fe90e07",
      "patchSha256": "299d52f85e617b7855b1909db644ba8575a4096bec70ea682904ba51612f3cea",
      "archive": "history/pre-receipt-lifecycle/approved-receipt-reuse.patch"
    },
    {
      "kind": "account-safe-settings-home-return",
      "patchSha256": "f8e18d61f1314550700acfbf0113edf9b4f4fba4a620c646c1ed7958d2d9cd0a",
      "archive": "history/pre-receipt-lifecycle/approved-home-return.patch",
      "transitionInventory": "history/pre-receipt-lifecycle/approved-home-return-transitions.json",
      "transitionInventorySha256": "c19c9a6ed9703797c6957f35358dd90493c755cfd2cc7de57e9d4b5a40dcb039"
    }
  ],
  "transitions": [
    {
      "path": ".github/workflows/ci.yml",
      "before": {
        "bytes": 33507,
        "sha256": "6bac39e204205650b3c92f19564497ccceda6e9120eeebc1050cd7d7419a0f49",
        "archive": "history/pre-receipt-lifecycle/production/.github/workflows/ci.yml"
      },
      "after": {
        "bytes": 36237,
        "sha256": "4ab1e69c6b0839e5a746d4f9751c773c50bcea2a99a0b49f4d5c32949e7907d0"
      }
    },
    {
      "path": ".github/workflows/deploy.yml",
      "before": {
        "bytes": 15730,
        "sha256": "837e43ffdd0713fcf6a22b0ca006747a034bf6f2daae1f00c6b0ac64561c2ec9",
        "archive": "history/pre-receipt-lifecycle/production/.github/workflows/deploy.yml"
      },
      "after": {
        "bytes": 15750,
        "sha256": "4941b0915fb437475d0c272be4167121b01c8669b5a4ef1ec698acb4212d1ba6"
      }
    },
    {
      "path": "docs/yard-active-ci-dispatch.md",
      "before": {
        "bytes": 3407,
        "sha256": "275be997ee4394958f02b0a8f8a2d830e6a1a23fdf11b6391ca8ce383b8f03cb",
        "archive": "history/pre-receipt-lifecycle/production/docs/yard-active-ci-dispatch.md"
      },
      "after": {
        "bytes": 6585,
        "sha256": "5b904f769a01c8f13d4676a97c2e20c52b68ac555bc11cb80092bbf5c7d8f067"
      }
    },
    {
      "path": "scripts/yard-active-contract.mjs",
      "before": {
        "bytes": 12090,
        "sha256": "51e9f43d812763d0a2f7be4de348c933c20ac994845fb2d8c27826a47afb220f",
        "archive": "history/pre-receipt-lifecycle/production/scripts/yard-active-contract.mjs"
      },
      "after": {
        "bytes": 12772,
        "sha256": "8b39e812ecdcfca9a0f927886463dce88553bb69920c43ec8fdc8c2b13d08eea"
      }
    },
    {
      "path": "scripts/yard-active-promotion.mjs",
      "before": {
        "bytes": 10839,
        "sha256": "b43752b0e243cce42b0792c3ecee4170a93fe6c22c724f3a2b67f8849d94fe25",
        "archive": "history/pre-receipt-lifecycle/production/scripts/yard-active-promotion.mjs"
      },
      "after": {
        "bytes": 10917,
        "sha256": "17a23041de1fde6bfa2b9c9b2ed697179acb034dd98446368613843032a8de76"
      }
    },
    {
      "path": "scripts/yard-ci-dispatch.mjs",
      "before": {
        "bytes": 7072,
        "sha256": "38d767a31500f986d0f9cd4d969f071c147d2889d1a4ae28fcadce516c7917bd",
        "archive": "history/pre-receipt-lifecycle/production/scripts/yard-ci-dispatch.mjs"
      },
      "after": {
        "bytes": 7170,
        "sha256": "5f3145f3107842ae4ae6f69a1649fb70cd11543f57927261dbc641322faa4040"
      }
    },
    {
      "path": "src/games/companion-yard/CompanionYardGame.jsx",
      "before": {
        "bytes": 58020,
        "sha256": "50d7a2b37f9ff44fbb19781f8ff2a7125c3f92b854e4567351d2d33e11cb3d4c",
        "archive": "history/pre-receipt-lifecycle/production/src/games/companion-yard/CompanionYardGame.jsx"
      },
      "after": {
        "bytes": 58761,
        "sha256": "cf45a4215c288c0044446ad3588ee84359fe81e4c1036e3c6c983e08122f0083"
      }
    },
    {
      "path": "tests/e2e/companion-yard.spec.js",
      "before": {
        "bytes": 54271,
        "sha256": "263c1de3aeccc09d018702b7cbdfb620659a81bb484a93e2413ee12a13be015f",
        "archive": "history/pre-receipt-lifecycle/production/tests/e2e/companion-yard.spec.js"
      },
      "after": {
        "bytes": 56519,
        "sha256": "9afd53aa25216ac0fa62cfb27293614c83ef75966e3b48a8b9df11fb5d195ab1"
      }
    },
    {
      "path": "tests/home-navigation.test.js",
      "before": {
        "bytes": 8750,
        "sha256": "561f68a3a1bbc39887a14d3d6918f894c6f46aed271c60cda505d5ab264ff1c0",
        "archive": "history/pre-receipt-lifecycle/production/tests/home-navigation.test.js"
      },
      "after": {
        "bytes": 11839,
        "sha256": "bd6104383e89d7128a66979044672f3bbdb8b435ee3fb7593be10dcf800ef668"
      }
    },
    {
      "path": "tests/yard-active-dispatch.test.mjs",
      "before": {
        "bytes": 12772,
        "sha256": "871bb39820c93923f101b05611cd7e4fb062aa0554be86b9fc733860ea44027c",
        "archive": "history/pre-receipt-lifecycle/production/tests/yard-active-dispatch.test.mjs"
      },
      "after": {
        "bytes": 12934,
        "sha256": "bcbeee015e22bc3bc31ce9a93b9b5fd6178484efb46adb16423071bd52aad92d"
      }
    },
    {
      "path": "tests/yard-player-integration-e2e/player.spec.js",
      "before": {
        "bytes": 15845,
        "sha256": "75ca5f7b822306d2e2f3493b57e336d90fe51dc06e9ca32393f30b67b468114b",
        "archive": "history/pre-receipt-lifecycle/production/tests/yard-player-integration-e2e/player.spec.js"
      },
      "after": {
        "bytes": 15920,
        "sha256": "318632fdae58f8ad2c44af7dde62291f8858b0d063471f90c5b0da2b4cc0f21a"
      }
    }
  ],
  "files": [
    {
      "path": ".github/workflows/ci.yml",
      "bytes": 36237,
      "sha256": "4ab1e69c6b0839e5a746d4f9751c773c50bcea2a99a0b49f4d5c32949e7907d0"
    },
    {
      "path": ".github/workflows/deploy.yml",
      "bytes": 15750,
      "sha256": "4941b0915fb437475d0c272be4167121b01c8669b5a4ef1ec698acb4212d1ba6"
    },
    {
      "path": "docs/yard-active-ci-dispatch.md",
      "bytes": 6585,
      "sha256": "5b904f769a01c8f13d4676a97c2e20c52b68ac555bc11cb80092bbf5c7d8f067"
    },
    {
      "path": "scripts/yard-active-contract.mjs",
      "bytes": 12772,
      "sha256": "8b39e812ecdcfca9a0f927886463dce88553bb69920c43ec8fdc8c2b13d08eea"
    },
    {
      "path": "scripts/yard-active-promotion.mjs",
      "bytes": 10917,
      "sha256": "17a23041de1fde6bfa2b9c9b2ed697179acb034dd98446368613843032a8de76"
    },
    {
      "path": "scripts/yard-ci-dispatch.mjs",
      "bytes": 7170,
      "sha256": "5f3145f3107842ae4ae6f69a1649fb70cd11543f57927261dbc641322faa4040"
    },
    {
      "path": "scripts/yard-closed-ci-receipt.mjs",
      "bytes": 10152,
      "sha256": "ca58231dfa68eb3e7dfc1e3851c01b50bedd6c5f3ac9e255556470227ca57e99"
    },
    {
      "path": "src/games/companion-yard/CompanionYardGame.jsx",
      "bytes": 58761,
      "sha256": "cf45a4215c288c0044446ad3588ee84359fe81e4c1036e3c6c983e08122f0083"
    },
    {
      "path": "src/games/companion-yard/homeReturn.js",
      "bytes": 601,
      "sha256": "96f1b5b49dab27ce01a010ce99099b4ec674fa9860c4403be95f843b3a3bd8c1"
    },
    {
      "path": "tests/e2e/companion-yard.spec.js",
      "bytes": 56519,
      "sha256": "9afd53aa25216ac0fa62cfb27293614c83ef75966e3b48a8b9df11fb5d195ab1"
    },
    {
      "path": "tests/home-navigation.test.js",
      "bytes": 11839,
      "sha256": "bd6104383e89d7128a66979044672f3bbdb8b435ee3fb7593be10dcf800ef668"
    },
    {
      "path": "tests/yard-active-dispatch.test.mjs",
      "bytes": 12934,
      "sha256": "bcbeee015e22bc3bc31ce9a93b9b5fd6178484efb46adb16423071bd52aad92d"
    },
    {
      "path": "tests/yard-closed-ci-receipt.test.mjs",
      "bytes": 13334,
      "sha256": "6de08ca4981433d5042a212e2227d9f310f2b55ef11197a8c02150143e87aa43"
    },
    {
      "path": "tests/yard-player-integration-e2e/player.spec.js",
      "bytes": 15920,
      "sha256": "318632fdae58f8ad2c44af7dde62291f8858b0d063471f90c5b0da2b4cc0f21a"
    }
  ],
  "archiveFiles": [
    {
      "path": "history/pre-receipt-lifecycle/approved-home-return-transitions.json",
      "bytes": 1480,
      "sha256": "c19c9a6ed9703797c6957f35358dd90493c755cfd2cc7de57e9d4b5a40dcb039"
    },
    {
      "path": "history/pre-receipt-lifecycle/approved-home-return.patch",
      "bytes": 10828,
      "sha256": "f8e18d61f1314550700acfbf0113edf9b4f4fba4a620c646c1ed7958d2d9cd0a"
    },
    {
      "path": "history/pre-receipt-lifecycle/approved-receipt-reuse.patch",
      "bytes": 43638,
      "sha256": "299d52f85e617b7855b1909db644ba8575a4096bec70ea682904ba51612f3cea"
    },
    {
      "path": "history/pre-receipt-lifecycle/base-contract.json",
      "bytes": 90230,
      "sha256": "6ccd9bcf39726825245f466e975a713a2dd2d938f53ccd7f2f90727b0d812680"
    },
    {
      "path": "history/pre-receipt-lifecycle/checks/closed-rollout-guard.checks.mjs",
      "bytes": 17893,
      "sha256": "c961156963c012f92def17e9c6d2b5f2073075fa32c78fe7f7b0d771b913ca7d"
    },
    {
      "path": "history/pre-receipt-lifecycle/production/.github/workflows/ci.yml",
      "bytes": 33507,
      "sha256": "6bac39e204205650b3c92f19564497ccceda6e9120eeebc1050cd7d7419a0f49"
    },
    {
      "path": "history/pre-receipt-lifecycle/production/.github/workflows/deploy.yml",
      "bytes": 15730,
      "sha256": "837e43ffdd0713fcf6a22b0ca006747a034bf6f2daae1f00c6b0ac64561c2ec9"
    },
    {
      "path": "history/pre-receipt-lifecycle/production/docs/yard-active-ci-dispatch.md",
      "bytes": 3407,
      "sha256": "275be997ee4394958f02b0a8f8a2d830e6a1a23fdf11b6391ca8ce383b8f03cb"
    },
    {
      "path": "history/pre-receipt-lifecycle/production/scripts/yard-active-contract.mjs",
      "bytes": 12090,
      "sha256": "51e9f43d812763d0a2f7be4de348c933c20ac994845fb2d8c27826a47afb220f"
    },
    {
      "path": "history/pre-receipt-lifecycle/production/scripts/yard-active-promotion.mjs",
      "bytes": 10839,
      "sha256": "b43752b0e243cce42b0792c3ecee4170a93fe6c22c724f3a2b67f8849d94fe25"
    },
    {
      "path": "history/pre-receipt-lifecycle/production/scripts/yard-ci-dispatch.mjs",
      "bytes": 7072,
      "sha256": "38d767a31500f986d0f9cd4d969f071c147d2889d1a4ae28fcadce516c7917bd"
    },
    {
      "path": "history/pre-receipt-lifecycle/production/src/games/companion-yard/CompanionYardGame.jsx",
      "bytes": 58020,
      "sha256": "50d7a2b37f9ff44fbb19781f8ff2a7125c3f92b854e4567351d2d33e11cb3d4c"
    },
    {
      "path": "history/pre-receipt-lifecycle/production/tests/e2e/companion-yard.spec.js",
      "bytes": 54271,
      "sha256": "263c1de3aeccc09d018702b7cbdfb620659a81bb484a93e2413ee12a13be015f"
    },
    {
      "path": "history/pre-receipt-lifecycle/production/tests/home-navigation.test.js",
      "bytes": 8750,
      "sha256": "561f68a3a1bbc39887a14d3d6918f894c6f46aed271c60cda505d5ab264ff1c0"
    },
    {
      "path": "history/pre-receipt-lifecycle/production/tests/yard-active-dispatch.test.mjs",
      "bytes": 12772,
      "sha256": "871bb39820c93923f101b05611cd7e4fb062aa0554be86b9fc733860ea44027c"
    },
    {
      "path": "history/pre-receipt-lifecycle/production/tests/yard-player-integration-e2e/player.spec.js",
      "bytes": 15845,
      "sha256": "75ca5f7b822306d2e2f3493b57e336d90fe51dc06e9ca32393f30b67b468114b"
    },
    {
      "path": "history/pre-receipt-lifecycle/verify-boundary-transfer.mjs",
      "bytes": 7189,
      "sha256": "ac7e0cdcb19418c3d4bdb89c50877a26fd1506c8842afaead5fbc3707835e5b8"
    },
    {
      "path": "history/pre-receipt-lifecycle/verify-release-preparation-transfer.mjs",
      "bytes": 23534,
      "sha256": "05dd2fe6fbbad3d364fe15ce65673358f9b77e5ca638437083bd7261c02bd2f2"
    }
  ]
};
export function verifyReceiptLifecycleTransfer({rootDir,contract}) {
  const arcade=verifyArcadeRewardTransfer({rootDir,contract});contract=arcade.priorContract;
  const candidate=resolve(rootDir,'preview/yard-persistent-candidate');
  const read=path=>readFileSync(resolve(candidate,path));
  const reviewed=contract.reviewedReceiptLifecycleChangeSet;
  assert.deepEqual(reviewed,APPROVED,'Receipt/lifecycle transfer must retain independently reviewed identities');
  for(const row of APPROVED.archiveFiles)assert.deepEqual(fingerprint(read(row.path)),{bytes:row.bytes,sha256:row.sha256},row.path);
  for(const input of APPROVED.inputs)assert.equal(fingerprint(read(input.archive)).sha256,input.patchSha256);
  const lifecycle=APPROVED.inputs.find(input=>input.kind==='account-safe-settings-home-return');
  assert.equal(fingerprint(read(lifecycle.transitionInventory)).sha256,lifecycle.transitionInventorySha256);
  for(const row of JSON.parse(read(lifecycle.transitionInventory))){
    assert.deepEqual(APPROVED.files.find(file=>file.path===row.path),{path:row.path,...row.after});
    const transition=APPROVED.transitions.find(transition=>transition.path===row.path);
    if(row.before){assert.ok(transition);assert.deepEqual({bytes:transition.before.bytes,sha256:transition.before.sha256},row.before);assert.deepEqual(transition.after,row.after);}
    else assert.equal(transition,undefined,'New helper must not invent a prior source');
  }
  const priorContract=JSON.parse(read('history/pre-receipt-lifecycle/base-contract.json'));
  const expected=structuredClone(priorContract);expected.reviewedReceiptLifecycleChangeSet=reviewed;
  assert.deepEqual(contract,expected,'Receipt/lifecycle transfer must preserve every prior history, sourceInput and production/control pin');
  for(const row of APPROVED.transitions)assert.deepEqual(fingerprint(read(row.before.archive)),{bytes:row.before.bytes,sha256:row.before.sha256},row.path);
  for(const row of APPROVED.files)assert.deepEqual(fingerprint(readFileSync(resolve(rootDir,row.path))),{bytes:row.bytes,sha256:row.sha256},`Reviewed receipt/lifecycle file: ${row.path}`);
  const deploy=APPROVED.transitions.find(row=>row.path==='.github/workflows/deploy.yml');
  const before=read(deploy.before.archive).toString('utf8');
  const validate='  validate:\n    uses: ./.github/workflows/ci.yml\n    permissions:\n      contents: read\n      packages: read\n';
  assert.equal(before.split(validate).length,2,'Exact previous validation caller required');
  assert.equal(readFileSync(resolve(rootDir,deploy.path),'utf8'),before.replace(validate,validate+'      actions: read\n'),'Deploy may only add read-only Actions receipt access to validate');
  return {priorContract,transitions:APPROVED.transitions,reviewedFiles:APPROVED.files.length,reviewedPinTransitions:0,workflowTransitions:2,canonicalSourceClosureChanged:false,arcade};
}
export function readBeforeReceiptLifecycle({rootDir,receipt,path}) {
  const transition=receipt.transitions.find(row=>row.path===path);
  return transition?readFileSync(resolve(rootDir,'preview/yard-persistent-candidate',transition.before.archive)):readBeforeArcadeReward({rootDir,arcade:receipt.arcade,path});
}
