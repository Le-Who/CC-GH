/** Exact reviewed room toolbar, retirement, saved-prop witness and rollback outbox transition. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const fingerprint=bytes=>({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
const APPROVED={
  "id": "room-toolbar-entry-art-20261004",
  "integrationBaseCommit": "e2310e966373830768fe19c6a3ed58ddc0a8745e",
  "rolloutEnabled": false,
  "sourceAcceptanceChanged": false,
  "canonicalSourceClosureChanged": false,
  "inputs": [
    {
      "kind": "small-phone-toolbar-max-balance",
      "patchSha256": "604e04ecfd2d2b572a3369fd691e38e4de4c9b6253649d6582a2734a47b4f4ea",
      "archive": "history/pre-room-hud/approved-toolbar.patch"
    },
    {
      "kind": "entry-hud-retirement",
      "approvedCommit": "ae4d7400c103a80559f143fcdb92ae03d8b7d454",
      "patchSha256": "2ec0d342f8508b5fc832cab438edeac1f972d97c70e39d89a8ba42e2fd2ca73d",
      "archive": "history/pre-room-hud/approved-retirement.patch"
    },
    {
      "kind": "post-reload-saved-prop-render-witness",
      "patchSha256": "25c2296851c4899859c81d59d3174cf26c582dc687b3d2df0a83a395ce2d1dee",
      "archive": "history/pre-room-hud/approved-saved-prop-witness.patch"
    },
    {
      "kind": "rollback-outbox-retention",
      "patchSha256": "4f9d12db90a5aead86c1ba9f514716177d753c35ca61bafe60a7755047d4ce49",
      "archive": "history/pre-room-hud/approved-outbox-retention.patch"
    }
  ],
  "transitions": [
    {
      "path": "src/app/hud-layout/defaultLayouts/room.json",
      "before": {
        "bytes": 3248,
        "sha256": "c1d704329625ee99c9bdaddd2805a2a11531eb3c481b8d0203addfea90e8a2e3",
        "archive": "history/pre-room-hud/production/src/app/hud-layout/defaultLayouts/room.json"
      },
      "after": {
        "bytes": 3265,
        "sha256": "c575ff84ed68316091df379c43760424a5513a16893b1904c4d67e7c1020411d"
      }
    },
    {
      "path": "tests/yard-eight-player-e2e/player.spec.js",
      "kind": "test-evidence",
      "before": {
        "bytes": 18835,
        "sha256": "0aa5803d455fd0edca6e6d59f7ae32d01db2328f73d19b6e83ebf4a13b8701ac",
        "archive": "history/pre-room-hud/production/tests/yard-eight-player-e2e/player.spec.js"
      },
      "after": {
        "bytes": 21209,
        "sha256": "81acce782d8ae756a7206a1c65763090f673a3c4265e7fc36940c0bd498a4d9d"
      }
    },
    {
      "path": "tests/helpers/yard-eight-canvas-witness.mjs",
      "kind": "test-evidence",
      "before": {
        "bytes": 2105,
        "sha256": "598442cd1fc0f600e212c4f57b23ffb16fa1cf34bddf66104559f69bd28bf169",
        "archive": "history/pre-room-hud/production/tests/helpers/yard-eight-canvas-witness.mjs"
      },
      "after": {
        "bytes": 2407,
        "sha256": "360fc1c9591efa4a771c01a7f57f58dedb25dfc522cadcba571baa76a690f852"
      }
    },
    {
      "path": "src/game-state/useGameHub.js",
      "kind": "production",
      "before": {
        "bytes": 28619,
        "sha256": "04591b270ab5eca3eea89730211e138342e14964e9e840c2816639c46eac5d33",
        "archive": "history/pre-room-hud/production/src/game-state/useGameHub.js"
      },
      "after": {
        "bytes": 31889,
        "sha256": "8c7e360eb0d3ced6b6ab3e2a5ebdbc04cea52fc9798b2d1369a36c727569e590"
      }
    },
    {
      "path": "tests/hub-account-boundaries.test.mjs",
      "kind": "test-evidence",
      "before": {
        "bytes": 27274,
        "sha256": "6df2ec23c405261ef2a19ac695c8b323264dc68cdee1808c9844d265ea646532",
        "archive": "history/pre-room-hud/production/tests/hub-account-boundaries.test.mjs"
      },
      "after": {
        "bytes": 44452,
        "sha256": "a4cabd983aa87794a7be14576e97e89fb03d92ec359f865f8f10868dd23c06d3"
      }
    }
  ],
  "files": [
    {
      "path": "assets-source/imagegen/hud-redesign/hud-redesign-manifest.json",
      "bytes": 68138,
      "sha256": "50b21d84bef4abbedaee422466763e672a40ac647768599a94e852b9955ccddb"
    },
    {
      "path": "assets-source/imagegen/hud-redesign/qa-exports/blox/metric-chip.webp",
      "bytes": 13466,
      "sha256": "cd3623a8e8c625e10aed7b0b325e83fff2571aab238c8dee030f6336f78526ae"
    },
    {
      "path": "assets-source/imagegen/hud-redesign/qa-exports/bubbo/metric-chip.webp",
      "bytes": 14996,
      "sha256": "9b81a3c03939847bd8a5127f3c281a866fdd4df91d90f76f011c6be45a801d2e"
    },
    {
      "path": "assets-source/imagegen/hud-redesign/qa-exports/match3/metric-chip.webp",
      "bytes": 15512,
      "sha256": "9ab3cb6c1fe533313e5581c9c8dc1c733243d531ff53474bfe70564ae13077a3"
    },
    {
      "path": "assets-source/imagegen/hud-redesign/qa-exports/merge/metric-chip.webp",
      "bytes": 16126,
      "sha256": "94ae4af74835e36c4e419f1a2e31b9780965dbf1e769b91e2b750b427d45d7af"
    },
    {
      "path": "assets-source/imagegen/hud-redesign/qa-exports/ui-surfaces/yard-panel.webp",
      "bytes": 311794,
      "sha256": "a8eef4f545962b71749e3123f54bc5b485acded6dec42609914a2dbc58633c83"
    },
    {
      "path": "assets-source/imagegen/hud-redesign/screen-surface-extract-manifest.json",
      "bytes": 3599,
      "sha256": "65c466d85a5121cdd8cbb404b4492107fae6e7f7a90b8682abcb2c47b6a22976"
    },
    {
      "path": "docs/entry-hud-retirement-inventory.json",
      "bytes": 2340,
      "sha256": "e0d6dda099c3f7347b8a6c9e1e11d39c4c6a847fdd79d89eda6d919ca3de2c4f"
    },
    {
      "path": "docs/unreachable-entry-hud-art.md",
      "bytes": 4184,
      "sha256": "b484f31c82da319aaec2c390b9b8e33cdcaf81500817ffbe4b27bb7715dde35f"
    },
    {
      "path": "scripts/asset-source-only-policy.mjs",
      "bytes": 6375,
      "sha256": "b24ba52bd8271585097d0032172aa6d4c168785b3a901879dbfcc34eb40d703d"
    },
    {
      "path": "src/app/hud-layout/defaultLayouts/room.json",
      "bytes": 3265,
      "sha256": "c575ff84ed68316091df379c43760424a5513a16893b1904c4d67e7c1020411d"
    },
    {
      "path": "src/app/hud-redesign.css",
      "bytes": 13338,
      "sha256": "01facd1a72514c8f28702063a06f27d6b5c79ce12b1aaf42a13a43a40f1993fe"
    },
    {
      "path": "src/game-state/useGameHub.js",
      "bytes": 31889,
      "sha256": "8c7e360eb0d3ced6b6ab3e2a5ebdbc04cea52fc9798b2d1369a36c727569e590"
    },
    {
      "path": "src/games/companion-yard/CompanionYardGame.jsx",
      "bytes": 57793,
      "sha256": "f44a9faa51a6259128eca38899047bbf017d96c423bfc4f48082f677d3566097"
    },
    {
      "path": "src/games/companion-yard/companion-yard.css",
      "bytes": 92326,
      "sha256": "ba9a7590024caccf3c148f1153a2898b75b0af5521ff13dbb43843833de38eed"
    },
    {
      "path": "src/games/companion-yard/currencyDisplay.js",
      "bytes": 800,
      "sha256": "65e651416be1dad137d9cd617b678bda5da89dc7e414a463d67bdd73a12ec802"
    },
    {
      "path": "tests/asset-retirement.test.js",
      "bytes": 14096,
      "sha256": "9f386dc14216f170d6a3a65535851865226bae37631f9f856d35f55cfd463feb"
    },
    {
      "path": "tests/assets-pipeline.test.js",
      "bytes": 23490,
      "sha256": "e9a7d6ae6b43741ada4b5cc6fe20d3179902ab796fa8097deaf2bf04db10ef48"
    },
    {
      "path": "tests/e2e/assets-runtime.spec.js",
      "bytes": 9794,
      "sha256": "3e872756ff3638d5e788b279263d2a96ec1b776a027b35c6bc7ca3e22aa6fb0c"
    },
    {
      "path": "tests/e2e/companion-yard.spec.js",
      "bytes": 52027,
      "sha256": "b429e6b8d216b7c9b725687f64d538be059c54035e946937927372178f848b78"
    },
    {
      "path": "tests/e2e/helpers/yard-hud.js",
      "bytes": 2072,
      "sha256": "ed3e9f83e58cafd93dbc11c18fbb344f9f1852ad482d7573a11dd63770b83061"
    },
    {
      "path": "tests/helpers/yard-eight-canvas-witness.mjs",
      "bytes": 2407,
      "sha256": "360fc1c9591efa4a771c01a7f57f58dedb25dfc522cadcba571baa76a690f852"
    },
    {
      "path": "tests/hub-account-boundaries.test.mjs",
      "bytes": 44452,
      "sha256": "a4cabd983aa87794a7be14576e97e89fb03d92ec359f865f8f10868dd23c06d3"
    },
    {
      "path": "tests/hud-layout.test.js",
      "bytes": 18900,
      "sha256": "bf82360ff437a405942f1270cabf328a204b49654f0686641a36cbaba39bc975"
    },
    {
      "path": "tests/yard-eight-player-e2e/player.spec.js",
      "bytes": 21209,
      "sha256": "81acce782d8ae756a7206a1c65763090f673a3c4265e7fc36940c0bd498a4d9d"
    },
    {
      "path": "tests/yard-player-integration-e2e/player.spec.js",
      "bytes": 15845,
      "sha256": "75ca5f7b822306d2e2f3493b57e336d90fe51dc06e9ca32393f30b67b468114b"
    }
  ],
  "retiredFiles": [
    {
      "path": "public/games/hud-redesign/blox/metric-chip.webp",
      "to": "assets-source/imagegen/hud-redesign/qa-exports/blox/metric-chip.webp",
      "bytes": 13466,
      "sha256": "cd3623a8e8c625e10aed7b0b325e83fff2571aab238c8dee030f6336f78526ae"
    },
    {
      "path": "public/games/hud-redesign/bubbo/metric-chip.webp",
      "to": "assets-source/imagegen/hud-redesign/qa-exports/bubbo/metric-chip.webp",
      "bytes": 14996,
      "sha256": "9b81a3c03939847bd8a5127f3c281a866fdd4df91d90f76f011c6be45a801d2e"
    },
    {
      "path": "public/games/hud-redesign/match3/metric-chip.webp",
      "to": "assets-source/imagegen/hud-redesign/qa-exports/match3/metric-chip.webp",
      "bytes": 15512,
      "sha256": "9ab3cb6c1fe533313e5581c9c8dc1c733243d531ff53474bfe70564ae13077a3"
    },
    {
      "path": "public/games/hud-redesign/merge/metric-chip.webp",
      "to": "assets-source/imagegen/hud-redesign/qa-exports/merge/metric-chip.webp",
      "bytes": 16126,
      "sha256": "94ae4af74835e36c4e419f1a2e31b9780965dbf1e769b91e2b750b427d45d7af"
    },
    {
      "path": "public/games/ui-surfaces/yard-panel.webp",
      "to": "assets-source/imagegen/hud-redesign/qa-exports/ui-surfaces/yard-panel.webp",
      "bytes": 311794,
      "sha256": "a8eef4f545962b71749e3123f54bc5b485acded6dec42609914a2dbc58633c83"
    }
  ],
  "archiveFiles": [
    {
      "path": "history/pre-room-hud/approved-outbox-retention.patch",
      "bytes": 26944,
      "sha256": "4f9d12db90a5aead86c1ba9f514716177d753c35ca61bafe60a7755047d4ce49"
    },
    {
      "path": "history/pre-room-hud/approved-retirement.patch",
      "bytes": 26474,
      "sha256": "2ec0d342f8508b5fc832cab438edeac1f972d97c70e39d89a8ba42e2fd2ca73d"
    },
    {
      "path": "history/pre-room-hud/approved-saved-prop-witness.patch",
      "bytes": 8080,
      "sha256": "25c2296851c4899859c81d59d3174cf26c582dc687b3d2df0a83a395ce2d1dee"
    },
    {
      "path": "history/pre-room-hud/approved-toolbar.patch",
      "bytes": 17422,
      "sha256": "604e04ecfd2d2b572a3369fd691e38e4de4c9b6253649d6582a2734a47b4f4ea"
    },
    {
      "path": "history/pre-room-hud/base-contract.json",
      "bytes": 56880,
      "sha256": "2daaf744bfa929b0c30eb566fd70ce44652a7c4c0576da90429b8059059aa057"
    },
    {
      "path": "history/pre-room-hud/checks/closed-rollout-guard.checks.mjs",
      "bytes": 11600,
      "sha256": "c49dcf64fc2741f2155c1979fb0797f72866be6ac0160c6519ae1d2417a69c9b"
    },
    {
      "path": "history/pre-room-hud/production/src/app/hud-layout/defaultLayouts/room.json",
      "bytes": 3248,
      "sha256": "c1d704329625ee99c9bdaddd2805a2a11531eb3c481b8d0203addfea90e8a2e3"
    },
    {
      "path": "history/pre-room-hud/production/src/game-state/useGameHub.js",
      "bytes": 28619,
      "sha256": "04591b270ab5eca3eea89730211e138342e14964e9e840c2816639c46eac5d33"
    },
    {
      "path": "history/pre-room-hud/production/tests/helpers/yard-eight-canvas-witness.mjs",
      "bytes": 2105,
      "sha256": "598442cd1fc0f600e212c4f57b23ffb16fa1cf34bddf66104559f69bd28bf169"
    },
    {
      "path": "history/pre-room-hud/production/tests/hub-account-boundaries.test.mjs",
      "bytes": 27274,
      "sha256": "6df2ec23c405261ef2a19ac695c8b323264dc68cdee1808c9844d265ea646532"
    },
    {
      "path": "history/pre-room-hud/production/tests/yard-eight-player-e2e/player.spec.js",
      "bytes": 18835,
      "sha256": "0aa5803d455fd0edca6e6d59f7ae32d01db2328f73d19b6e83ebf4a13b8701ac"
    },
    {
      "path": "history/pre-room-hud/verify-cold-escape-transfer.mjs",
      "bytes": 17984,
      "sha256": "783ee6e0b911ddba93da2e8b0edf35d449a81da8b16b305e5b0b27e23088347b"
    }
  ]
};
export function verifyRoomHudTransfer({rootDir,contract}) {
  const candidate=resolve(rootDir,'preview/yard-persistent-candidate');
  const read=path=>readFileSync(resolve(candidate,path));
  const reviewed=contract.reviewedRoomHudChangeSet;
  assert.deepEqual(reviewed,APPROVED,'Room/HUD transfer must retain independently reviewed identities');
  for(const row of APPROVED.archiveFiles)assert.deepEqual(fingerprint(read(row.path)),{bytes:row.bytes,sha256:row.sha256},row.path);
  for(const input of APPROVED.inputs)assert.equal(fingerprint(read(input.archive)).sha256,input.patchSha256);
  const priorContract=JSON.parse(read('history/pre-room-hud/base-contract.json'));
  const expected=structuredClone(priorContract),transition=APPROVED.transitions[0];
  assert.deepEqual(transition.before,{bytes:3248,sha256:'c1d704329625ee99c9bdaddd2805a2a11531eb3c481b8d0203addfea90e8a2e3',archive:'history/pre-room-hud/production/src/app/hud-layout/defaultLayouts/room.json'});
  assert.deepEqual(fingerprint(read(transition.before.archive)),{bytes:transition.before.bytes,sha256:transition.before.sha256});
  for(const row of APPROVED.transitions)assert.deepEqual(fingerprint(read(row.before.archive)),{bytes:row.before.bytes,sha256:row.before.sha256},`Prior room/HUD file: ${row.path}`);
  const witness=APPROVED.transitions.find(row=>row.path==='tests/yard-eight-player-e2e/player.spec.js');
  assert.deepEqual(priorContract.reviewedColdEscapeChangeSet.files.find(row=>row.path===witness.path),{path:witness.path,bytes:witness.before.bytes,sha256:witness.before.sha256},'Saved-prop witness must preserve the exact original cold/Escape spec');
  const store=APPROVED.transitions.find(row=>row.path==='src/game-state/useGameHub.js');
  assert.deepEqual(priorContract.productionFiles.find(row=>row.path===store.path),{path:store.path,bytes:store.before.bytes,sha256:store.before.sha256},'Outbox fix must start at the exact previously reviewed store');
  assert.deepEqual(priorContract.reviewedPlayerWiringChangeSet.transitions.find(row=>row.path===store.path).after,{bytes:store.before.bytes,sha256:store.before.sha256},'Original player-wiring store proof must remain unchanged');
  const productionTransitions=APPROVED.transitions.filter(row=>row.path===transition.path||row.kind==='production');
  assert.deepEqual(productionTransitions.map(row=>row.path),['src/app/hud-layout/defaultLayouts/room.json','src/game-state/useGameHub.js']);
  for(const row of productionTransitions)Object.assign(expected.productionFiles.find(pin=>pin.path===row.path),row.after);
  expected.reviewedRoomHudChangeSet=reviewed;
  assert.deepEqual(contract,expected,'Room/HUD transfer must preserve all prior histories, sourceInputs and unrelated pins');
  for(const row of APPROVED.files)assert.deepEqual(fingerprint(readFileSync(resolve(rootDir,row.path))),{bytes:row.bytes,sha256:row.sha256},`Reviewed room/HUD file: ${row.path}`);
  for(const row of APPROVED.retiredFiles){
    assert.equal(existsSync(resolve(rootDir,row.path)),false,`Retired public path returned: ${row.path}`);
    assert.deepEqual(fingerprint(readFileSync(resolve(rootDir,row.to))),{bytes:row.bytes,sha256:row.sha256},`Retirement archive changed: ${row.to}`);
  }
  const roomExpected=JSON.parse(read(transition.before.archive));
  const small=roomExpected.profiles['phone-small-portrait'];
  assert.deepEqual(small.match,{orientation:'portrait',maxWidth:360});
  assert.ok(small);assert.deepEqual(small.regions.yardCurrencyStack,{x:0,y:0});
  small.regions.yardCurrencyStack.maxWidth=120;
  assert.deepEqual(JSON.parse(readFileSync(resolve(rootDir,transition.path))),roomExpected,'Room profile may only add the reviewed small-phone currency width');
  return {priorContract,transitions:APPROVED.transitions,reviewedFiles:APPROVED.files.length,reviewedPinTransitions:productionTransitions.length,retiredFiles:5,canonicalSourceClosureChanged:false};
}
export function readBeforeRoomHud({rootDir,roomHud,path}) {
  const transition=roomHud.transitions.find(row=>row.path===path);
  return readFileSync(transition?resolve(rootDir,'preview/yard-persistent-candidate',transition.before.archive):resolve(rootDir,path));
}
