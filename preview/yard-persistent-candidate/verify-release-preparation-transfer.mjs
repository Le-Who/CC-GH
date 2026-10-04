/** Reviewed preparation workflows and UI follow-up, with CLOSED production unchanged. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyReceiptLifecycleTransfer,readBeforeReceiptLifecycle} from './verify-receipt-lifecycle-transfer.mjs';
const fingerprint=bytes=>({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
const APPROVED={
  "id": "release-preparation-workflows-toolbar-20261004",
  "integrationBaseCommit": "5e2bfacc4b8b683c8f93a6f791d6c4f75a4325cd",
  "rolloutEnabled": false,
  "sourceAcceptanceChanged": false,
  "canonicalSourceClosureChanged": false,
  "inputs": [
    {
      "kind": "active-promotion",
      "patchSha256": "465f6feef4f9a045a82f4ee094dd680baeae2ebbe23b07edfc5c9d0c82d16acb",
      "archive": "history/pre-release-preparation/approved-active-promotion.patch"
    },
    {
      "kind": "production-acceptance",
      "patchSha256": "5fca72f532e1d0f16fc677959bf89822bdccb805541bfb6ad26f4ec0f8d78eca",
      "archive": "history/pre-release-preparation/approved-production-acceptance.patch"
    },
    {
      "kind": "candidate-hub-lane",
      "patchSha256": "427a1df5ff527c6c9b46ab4906e4d804cc7bc7f96490dd6e353ad8b6571c60ed",
      "archive": "history/pre-release-preparation/approved-candidate-hub-lane.patch"
    },
    {
      "kind": "closed-active-dispatch",
      "patchSha256": "5641e4930115a784caae5b5eb02fab1e7bc7dd5fbdba4451a05c503b51e5b311",
      "archive": "history/pre-release-preparation/approved-closed-active-dispatch.patch"
    },
    {
      "kind": "safe-area-toolbar-dialog",
      "patchSha256": "fa93ee3e9a1e3f0c9df909b55deab418f9c0f15e6322c9197a255342abd21e29",
      "archive": "history/pre-release-preparation/approved-toolbar-dialog.patch",
      "transitionInventory": "history/pre-release-preparation/approved-toolbar-transitions.json",
      "transitionInventorySha256": "d1faf8195cc972746848a7e4e649e121d0c5bf2151cca6508692b252fcf0429d"
    }
  ],
  "transitions": [
    {
      "path": ".github/workflows/ci.yml",
      "kind": "reviewed-file",
      "before": {
        "bytes": 23276,
        "sha256": "5587acdf8cdb4f24d9c11051aae17d4c93cfbf538bb83d546a2eed2228c1b5da",
        "archive": "history/pre-release-preparation/production/.github/workflows/ci.yml"
      },
      "after": {
        "bytes": 33507,
        "sha256": "6bac39e204205650b3c92f19564497ccceda6e9120eeebc1050cd7d7419a0f49"
      }
    },
    {
      "path": ".github/workflows/deploy.yml",
      "kind": "reviewed-file",
      "before": {
        "bytes": 15709,
        "sha256": "ac6aebc4563cda47ff85af1085e543278ee1990f2536e630d7a327e7c9186972",
        "archive": "history/pre-release-preparation/production/.github/workflows/deploy.yml"
      },
      "after": {
        "bytes": 15730,
        "sha256": "837e43ffdd0713fcf6a22b0ca006747a034bf6f2daae1f00c6b0ac64561c2ec9"
      }
    },
    {
      "path": "preview/yard-persistent-candidate/checks/candidate-boundary.checks.mjs",
      "kind": "reviewed-file",
      "before": {
        "bytes": 2295,
        "sha256": "bde9b60f33335eed72cec7c32c6104dbd2c517f80fcfacfdf04ea5dc1247f19d",
        "archive": "history/pre-release-preparation/production/preview/yard-persistent-candidate/checks/candidate-boundary.checks.mjs"
      },
      "after": {
        "bytes": 4362,
        "sha256": "731191eecc458c318bb4d1cf2975c6c71b7153d3c9175cc884ec510c3f666b11"
      }
    },
    {
      "path": "preview/yard-persistent-candidate/overlay-map.json",
      "kind": "reviewed-file",
      "before": {
        "bytes": 2425,
        "sha256": "f0b8e86a1a0e204e48f51fbd7c3f592477780fa58aae9b4ad15937f4eefdc196",
        "archive": "history/pre-release-preparation/production/preview/yard-persistent-candidate/overlay-map.json"
      },
      "after": {
        "bytes": 2541,
        "sha256": "5c8713b41afb537548c9b23d24b7f70e5667ded194b472388f3a99a641851f86"
      }
    },
    {
      "path": "src/app/hud-layout/HudRegion.jsx",
      "kind": "reviewed-file",
      "before": {
        "bytes": 3255,
        "sha256": "7560318a43937c0a7a35939fccd2904894c0fa87a0db39259225dfdb22b86229",
        "archive": "history/pre-release-preparation/production/src/app/hud-layout/HudRegion.jsx"
      },
      "after": {
        "bytes": 3345,
        "sha256": "82123392b1ab12c6a2224b9bd1173c1ec682eddee0fb8d723b7632a1dde03013"
      }
    },
    {
      "path": "src/app/hud-layout/defaultLayouts/room.json",
      "kind": "production",
      "before": {
        "bytes": 3265,
        "sha256": "c575ff84ed68316091df379c43760424a5513a16893b1904c4d67e7c1020411d",
        "archive": "history/pre-release-preparation/production/src/app/hud-layout/defaultLayouts/room.json"
      },
      "after": {
        "bytes": 4069,
        "sha256": "90749a458f451ee961fb376debcdad074f2679a1e62a31058dbc8050a244445b"
      }
    },
    {
      "path": "src/app/hud-layout/registry.js",
      "kind": "production",
      "before": {
        "bytes": 18796,
        "sha256": "e0aa83af1048b99eedf1ffc2913cdd085c1749ff42024a8c62fa0972c37e3eca",
        "archive": "history/pre-release-preparation/production/src/app/hud-layout/registry.js"
      },
      "after": {
        "bytes": 19283,
        "sha256": "e4bf488c7e3cbccad25fcc1eb5e269ea20347849026cbbd61aaeba6230c95ae1"
      }
    },
    {
      "path": "src/games/companion-yard/CompanionYardGame.jsx",
      "kind": "reviewed-file",
      "before": {
        "bytes": 57793,
        "sha256": "f44a9faa51a6259128eca38899047bbf017d96c423bfc4f48082f677d3566097",
        "archive": "history/pre-release-preparation/production/src/games/companion-yard/CompanionYardGame.jsx"
      },
      "after": {
        "bytes": 58020,
        "sha256": "50d7a2b37f9ff44fbb19781f8ff2a7125c3f92b854e4567351d2d33e11cb3d4c"
      }
    },
    {
      "path": "src/games/companion-yard/companion-yard.css",
      "kind": "reviewed-file",
      "before": {
        "bytes": 92326,
        "sha256": "ba9a7590024caccf3c148f1153a2898b75b0af5521ff13dbb43843833de38eed",
        "archive": "history/pre-release-preparation/production/src/games/companion-yard/companion-yard.css"
      },
      "after": {
        "bytes": 92636,
        "sha256": "d768271ba5c8087118c5412bd1ccaf0f96181719d67d65cad72fd48b458bf4c7"
      }
    },
    {
      "path": "tests/e2e/companion-yard.spec.js",
      "kind": "reviewed-file",
      "before": {
        "bytes": 52027,
        "sha256": "b429e6b8d216b7c9b725687f64d538be059c54035e946937927372178f848b78",
        "archive": "history/pre-release-preparation/production/tests/e2e/companion-yard.spec.js"
      },
      "after": {
        "bytes": 54271,
        "sha256": "263c1de3aeccc09d018702b7cbdfb620659a81bb484a93e2413ee12a13be015f"
      }
    },
    {
      "path": "tests/e2e/helpers/yard-hud.js",
      "kind": "reviewed-file",
      "before": {
        "bytes": 2072,
        "sha256": "ed3e9f83e58cafd93dbc11c18fbb344f9f1852ad482d7573a11dd63770b83061",
        "archive": "history/pre-release-preparation/production/tests/e2e/helpers/yard-hud.js"
      },
      "after": {
        "bytes": 6983,
        "sha256": "8721ce12720cb07b3b766da2a9eddb60f581a07afb8eb7aba56ab340048b0178"
      }
    },
    {
      "path": "tests/e2e/hud-redesign-runtime-coverage.spec.js",
      "kind": "reviewed-file",
      "before": {
        "bytes": 14313,
        "sha256": "714f751d223ad58971f7c8ae53ad43108d9d0e01c65e8ade9bf2eee1d9bfe9f6",
        "archive": "history/pre-release-preparation/production/tests/e2e/hud-redesign-runtime-coverage.spec.js"
      },
      "after": {
        "bytes": 12571,
        "sha256": "5e14f6e01b212f37b62186ac0e76cde9f9a0dc8e40b133787b47835a4d9b2151"
      }
    },
    {
      "path": "tests/hud-layout.test.js",
      "kind": "reviewed-file",
      "before": {
        "bytes": 18900,
        "sha256": "bf82360ff437a405942f1270cabf328a204b49654f0686641a36cbaba39bc975",
        "archive": "history/pre-release-preparation/production/tests/hud-layout.test.js"
      },
      "after": {
        "bytes": 19915,
        "sha256": "14f92c09d2a032eca32f682571bbd2657565a08da422ea59a007c96e660111a5"
      }
    },
    {
      "path": "tests/ui-screen-surfaces.test.js",
      "kind": "reviewed-file",
      "before": {
        "bytes": 35730,
        "sha256": "554b7191f82adcebebc6e6f69256c9a2e22ee8f2f9192132462229c201a61ba1",
        "archive": "history/pre-release-preparation/production/tests/ui-screen-surfaces.test.js"
      },
      "after": {
        "bytes": 35991,
        "sha256": "f2af19f93ac42b6912421288eccf47cefc9b55b07f8eac616017dec49f38e5e8"
      }
    },
    {
      "path": "tests/yard-player-api-contract.test.mjs",
      "kind": "reviewed-file",
      "before": {
        "bytes": 5267,
        "sha256": "2bc4a57bb402684a3792f314168f2e78de4a24ad999cb9fc6010cf1bac79a072",
        "archive": "history/pre-release-preparation/production/tests/yard-player-api-contract.test.mjs"
      },
      "after": {
        "bytes": 5329,
        "sha256": "5c908facd99bc172c627c0591b3c00941b3c8f4ad4ae9407a2c83c35efee56c3"
      }
    }
  ],
  "files": [
    {
      "path": ".github/workflows/ci.yml",
      "bytes": 33507,
      "sha256": "6bac39e204205650b3c92f19564497ccceda6e9120eeebc1050cd7d7419a0f49"
    },
    {
      "path": ".github/workflows/deploy.yml",
      "bytes": 15730,
      "sha256": "837e43ffdd0713fcf6a22b0ca006747a034bf6f2daae1f00c6b0ac64561c2ec9"
    },
    {
      "path": ".github/workflows/yard-production-acceptance.yml",
      "bytes": 3197,
      "sha256": "02e6ecd1bcd62c05ba18d8ed6cb92e77cb499a2aee597823315620bc7939b7de"
    },
    {
      "path": "docs/yard-active-ci-dispatch.md",
      "bytes": 3407,
      "sha256": "275be997ee4394958f02b0a8f8a2d830e6a1a23fdf11b6391ca8ce383b8f03cb"
    },
    {
      "path": "docs/yard-active-promotion.md",
      "bytes": 4559,
      "sha256": "22bb4d7577ec023019d7844e0c10e5703626b93283fe8bb90faac0f828e43449"
    },
    {
      "path": "docs/yard-production-acceptance.md",
      "bytes": 5160,
      "sha256": "485b12605d747a5c6ad71f814d0bfb16829084352a008adeaf71c2d050365e3e"
    },
    {
      "path": "playwright.yard-production.config.js",
      "bytes": 1097,
      "sha256": "a2f99854ef5fc82561e0c4640d11351f51b86d4d85c5148682e72bb254216f36"
    },
    {
      "path": "preview/yard-persistent-candidate/checks/candidate-boundary.checks.mjs",
      "bytes": 4362,
      "sha256": "731191eecc458c318bb4d1cf2975c6c71b7153d3c9175cc884ec510c3f666b11"
    },
    {
      "path": "preview/yard-persistent-candidate/overlay-map.json",
      "bytes": 2541,
      "sha256": "5c8713b41afb537548c9b23d24b7f70e5667ded194b472388f3a99a641851f86"
    },
    {
      "path": "scripts/yard-active-contract.mjs",
      "bytes": 12090,
      "sha256": "51e9f43d812763d0a2f7be4de348c933c20ac994845fb2d8c27826a47afb220f"
    },
    {
      "path": "scripts/yard-active-promotion.mjs",
      "bytes": 10839,
      "sha256": "b43752b0e243cce42b0792c3ecee4170a93fe6c22c724f3a2b67f8849d94fe25"
    },
    {
      "path": "scripts/yard-active-runtime-checks.mjs",
      "bytes": 6449,
      "sha256": "3c1777a2ff8740a6967ac990b8304b44fb191a7e5320f347a592591b206fea2b"
    },
    {
      "path": "scripts/yard-ci-dispatch.mjs",
      "bytes": 7072,
      "sha256": "38d767a31500f986d0f9cd4d969f071c147d2889d1a4ae28fcadce516c7917bd"
    },
    {
      "path": "scripts/yard-production-acceptance.mjs",
      "bytes": 9328,
      "sha256": "6911b196a9efb4771eb52554e95eea4b4962520e8d471fb3e3a67a44ed023dfa"
    },
    {
      "path": "src/app/hud-layout/HudRegion.jsx",
      "bytes": 3345,
      "sha256": "82123392b1ab12c6a2224b9bd1173c1ec682eddee0fb8d723b7632a1dde03013"
    },
    {
      "path": "src/app/hud-layout/defaultLayouts/room.json",
      "bytes": 4069,
      "sha256": "90749a458f451ee961fb376debcdad074f2679a1e62a31058dbc8050a244445b"
    },
    {
      "path": "src/app/hud-layout/registry.js",
      "bytes": 19283,
      "sha256": "e4bf488c7e3cbccad25fcc1eb5e269ea20347849026cbbd61aaeba6230c95ae1"
    },
    {
      "path": "src/games/companion-yard/CompanionYardGame.jsx",
      "bytes": 58020,
      "sha256": "50d7a2b37f9ff44fbb19781f8ff2a7125c3f92b854e4567351d2d33e11cb3d4c"
    },
    {
      "path": "src/games/companion-yard/companion-yard.css",
      "bytes": 92636,
      "sha256": "d768271ba5c8087118c5412bd1ccaf0f96181719d67d65cad72fd48b458bf4c7"
    },
    {
      "path": "tests/e2e/companion-yard.spec.js",
      "bytes": 54271,
      "sha256": "263c1de3aeccc09d018702b7cbdfb620659a81bb484a93e2413ee12a13be015f"
    },
    {
      "path": "tests/e2e/helpers/yard-hud.js",
      "bytes": 6983,
      "sha256": "8721ce12720cb07b3b766da2a9eddb60f581a07afb8eb7aba56ab340048b0178"
    },
    {
      "path": "tests/e2e/hud-redesign-runtime-coverage.spec.js",
      "bytes": 12571,
      "sha256": "5e14f6e01b212f37b62186ac0e76cde9f9a0dc8e40b133787b47835a4d9b2151"
    },
    {
      "path": "tests/helpers/yard-production-fixtures.mjs",
      "bytes": 3938,
      "sha256": "0f789c67e658f51d96c39415aa74454a40986096caec90da04209949fc717ee5"
    },
    {
      "path": "tests/helpers/yard-production-guard.mjs",
      "bytes": 3220,
      "sha256": "d55d276337115b61eac327b0bc77b871c8b3455d99825f1516f1a341073900a0"
    },
    {
      "path": "tests/helpers/yard-production-process.mjs",
      "bytes": 2030,
      "sha256": "a677365f9d848a4cc61672a15508cf62343ffbffedecf331589f71f690110398"
    },
    {
      "path": "tests/helpers/yard-production-proxy.mjs",
      "bytes": 4268,
      "sha256": "680c4aed4ffe4249f97067783e750ec45c62757cdeb7a8745403f751b1f88699"
    },
    {
      "path": "tests/hud-layout.test.js",
      "bytes": 19915,
      "sha256": "14f92c09d2a032eca32f682571bbd2657565a08da422ea59a007c96e660111a5"
    },
    {
      "path": "tests/ui-screen-surfaces.test.js",
      "bytes": 35991,
      "sha256": "f2af19f93ac42b6912421288eccf47cefc9b55b07f8eac616017dec49f38e5e8"
    },
    {
      "path": "tests/yard-active-dispatch.test.mjs",
      "bytes": 12772,
      "sha256": "871bb39820c93923f101b05611cd7e4fb062aa0554be86b9fc733860ea44027c"
    },
    {
      "path": "tests/yard-active-promotion.test.mjs",
      "bytes": 9186,
      "sha256": "5ef7af71ad76a243e298f7086e42e538fe4c983114c7cec076aaf9b7068501cc"
    },
    {
      "path": "tests/yard-player-api-contract.test.mjs",
      "bytes": 5329,
      "sha256": "5c908facd99bc172c627c0591b3c00941b3c8f4ad4ae9407a2c83c35efee56c3"
    },
    {
      "path": "tests/yard-production-contract.test.mjs",
      "bytes": 15553,
      "sha256": "143ffd0ee53e4462297f0dd26466aa20f86b99a90f0aa148290fe32c20f71231"
    },
    {
      "path": "tests/yard-production-e2e/production.spec.js",
      "bytes": 18494,
      "sha256": "a906ac528e1e854b3ef0968acd3e904c6bedd8bdb5faccf8da9512d73c2ea4be"
    }
  ],
  "archiveFiles": [
    {
      "path": "history/pre-release-preparation/approved-active-promotion.patch",
      "bytes": 37833,
      "sha256": "465f6feef4f9a045a82f4ee094dd680baeae2ebbe23b07edfc5c9d0c82d16acb"
    },
    {
      "path": "history/pre-release-preparation/approved-candidate-hub-lane.patch",
      "bytes": 8037,
      "sha256": "427a1df5ff527c6c9b46ab4906e4d804cc7bc7f96490dd6e353ad8b6571c60ed"
    },
    {
      "path": "history/pre-release-preparation/approved-closed-active-dispatch.patch",
      "bytes": 48117,
      "sha256": "5641e4930115a784caae5b5eb02fab1e7bc7dd5fbdba4451a05c503b51e5b311"
    },
    {
      "path": "history/pre-release-preparation/approved-production-acceptance.patch",
      "bytes": 69191,
      "sha256": "5fca72f532e1d0f16fc677959bf89822bdccb805541bfb6ad26f4ec0f8d78eca"
    },
    {
      "path": "history/pre-release-preparation/approved-toolbar-dialog.patch",
      "bytes": 32605,
      "sha256": "fa93ee3e9a1e3f0c9df909b55deab418f9c0f15e6322c9197a255342abd21e29"
    },
    {
      "path": "history/pre-release-preparation/approved-toolbar-transitions.json",
      "bytes": 3145,
      "sha256": "d1faf8195cc972746848a7e4e649e121d0c5bf2151cca6508692b252fcf0429d"
    },
    {
      "path": "history/pre-release-preparation/base-contract.json",
      "bytes": 69463,
      "sha256": "dc34a6fee073d7498a593bd14d9f9a81b406c9c631910ece5d74d30f25811c4f"
    },
    {
      "path": "history/pre-release-preparation/checks/closed-rollout-guard.checks.mjs",
      "bytes": 15708,
      "sha256": "8d2ccf6622f9bbecb878ba80eacbcfe1271319216dd1266b62e86ceaa50be11c"
    },
    {
      "path": "history/pre-release-preparation/production/.github/workflows/ci.yml",
      "bytes": 23276,
      "sha256": "5587acdf8cdb4f24d9c11051aae17d4c93cfbf538bb83d546a2eed2228c1b5da"
    },
    {
      "path": "history/pre-release-preparation/production/.github/workflows/deploy.yml",
      "bytes": 15709,
      "sha256": "ac6aebc4563cda47ff85af1085e543278ee1990f2536e630d7a327e7c9186972"
    },
    {
      "path": "history/pre-release-preparation/production/preview/yard-persistent-candidate/checks/candidate-boundary.checks.mjs",
      "bytes": 2295,
      "sha256": "bde9b60f33335eed72cec7c32c6104dbd2c517f80fcfacfdf04ea5dc1247f19d"
    },
    {
      "path": "history/pre-release-preparation/production/preview/yard-persistent-candidate/overlay-map.json",
      "bytes": 2425,
      "sha256": "f0b8e86a1a0e204e48f51fbd7c3f592477780fa58aae9b4ad15937f4eefdc196"
    },
    {
      "path": "history/pre-release-preparation/production/src/app/hud-layout/HudRegion.jsx",
      "bytes": 3255,
      "sha256": "7560318a43937c0a7a35939fccd2904894c0fa87a0db39259225dfdb22b86229"
    },
    {
      "path": "history/pre-release-preparation/production/src/app/hud-layout/defaultLayouts/room.json",
      "bytes": 3265,
      "sha256": "c575ff84ed68316091df379c43760424a5513a16893b1904c4d67e7c1020411d"
    },
    {
      "path": "history/pre-release-preparation/production/src/app/hud-layout/registry.js",
      "bytes": 18796,
      "sha256": "e0aa83af1048b99eedf1ffc2913cdd085c1749ff42024a8c62fa0972c37e3eca"
    },
    {
      "path": "history/pre-release-preparation/production/src/games/companion-yard/CompanionYardGame.jsx",
      "bytes": 57793,
      "sha256": "f44a9faa51a6259128eca38899047bbf017d96c423bfc4f48082f677d3566097"
    },
    {
      "path": "history/pre-release-preparation/production/src/games/companion-yard/companion-yard.css",
      "bytes": 92326,
      "sha256": "ba9a7590024caccf3c148f1153a2898b75b0af5521ff13dbb43843833de38eed"
    },
    {
      "path": "history/pre-release-preparation/production/tests/e2e/companion-yard.spec.js",
      "bytes": 52027,
      "sha256": "b429e6b8d216b7c9b725687f64d538be059c54035e946937927372178f848b78"
    },
    {
      "path": "history/pre-release-preparation/production/tests/e2e/helpers/yard-hud.js",
      "bytes": 2072,
      "sha256": "ed3e9f83e58cafd93dbc11c18fbb344f9f1852ad482d7573a11dd63770b83061"
    },
    {
      "path": "history/pre-release-preparation/production/tests/e2e/hud-redesign-runtime-coverage.spec.js",
      "bytes": 14313,
      "sha256": "714f751d223ad58971f7c8ae53ad43108d9d0e01c65e8ade9bf2eee1d9bfe9f6"
    },
    {
      "path": "history/pre-release-preparation/production/tests/hud-layout.test.js",
      "bytes": 18900,
      "sha256": "bf82360ff437a405942f1270cabf328a204b49654f0686641a36cbaba39bc975"
    },
    {
      "path": "history/pre-release-preparation/production/tests/ui-screen-surfaces.test.js",
      "bytes": 35730,
      "sha256": "554b7191f82adcebebc6e6f69256c9a2e22ee8f2f9192132462229c201a61ba1"
    },
    {
      "path": "history/pre-release-preparation/production/tests/yard-player-api-contract.test.mjs",
      "bytes": 5267,
      "sha256": "2bc4a57bb402684a3792f314168f2e78de4a24ad999cb9fc6010cf1bac79a072"
    },
    {
      "path": "history/pre-release-preparation/verify-boundary-transfer.mjs",
      "bytes": 6948,
      "sha256": "7e8b76a64d6d88bbaca38649156ef9304f507967730cd665b58a72a0239af404"
    },
    {
      "path": "history/pre-release-preparation/verify-room-hud-transfer.mjs",
      "bytes": 16456,
      "sha256": "788d3b4d3d2eab4b41cd1cc7af28050bad5a646dae856060cbde717abd9040d6"
    }
  ]
};
export function verifyReleasePreparationTransfer({rootDir,contract,receipt=verifyReceiptLifecycleTransfer({rootDir,contract})}) {
  const proofContract=receipt.priorContract;
  const production=path=>readBeforeReceiptLifecycle({rootDir,receipt,path});
  const candidate=resolve(rootDir,'preview/yard-persistent-candidate');
  const read=path=>readFileSync(resolve(candidate,path));
  const reviewed=proofContract.reviewedReleasePreparationChangeSet;
  assert.deepEqual(reviewed,APPROVED,'Release preparation transfer must retain independently reviewed identities');
  for(const row of APPROVED.archiveFiles)assert.deepEqual(fingerprint(read(row.path)),{bytes:row.bytes,sha256:row.sha256},row.path);
  for(const input of APPROVED.inputs)assert.equal(fingerprint(read(input.archive)).sha256,input.patchSha256);
  const priorContract=JSON.parse(read('history/pre-release-preparation/base-contract.json'));
  const expected=structuredClone(priorContract);
  const productionTransitions=APPROVED.transitions.filter(row=>row.kind==='production');
  assert.deepEqual(productionTransitions.map(row=>row.path),['src/app/hud-layout/defaultLayouts/room.json','src/app/hud-layout/registry.js']);
  const toolbar=APPROVED.inputs.find(input=>input.kind==='safe-area-toolbar-dialog');
  assert.equal(fingerprint(read(toolbar.transitionInventory)).sha256,toolbar.transitionInventorySha256);
  for(const row of JSON.parse(read(toolbar.transitionInventory))){
    const transition=APPROVED.transitions.find(transition=>transition.path===row.path);assert.ok(transition,row.path);
    assert.deepEqual({bytes:transition.before.bytes,sha256:transition.before.sha256},row.before);assert.deepEqual(transition.after,row.after);
  }
  for(const row of APPROVED.transitions){
    assert.deepEqual(fingerprint(read(row.before.archive)),{bytes:row.before.bytes,sha256:row.before.sha256},row.path);
    if(row.kind==='production'){
      const pin=expected.productionFiles.find(pin=>pin.path===row.path);assert.ok(pin,row.path);
      assert.deepEqual({bytes:pin.bytes,sha256:pin.sha256},{bytes:row.before.bytes,sha256:row.before.sha256});
      Object.assign(pin,row.after);
    }
  }
  expected.reviewedReleasePreparationChangeSet=reviewed;
  assert.deepEqual(proofContract,expected,'Release preparation transfer must preserve all prior histories, sourceInputs and unrelated pins');
  for(const row of APPROVED.files)assert.deepEqual(fingerprint(production(row.path)),{bytes:row.bytes,sha256:row.sha256},`Reviewed release preparation file: ${row.path}`);
  // Re-prove the caller permission change separately from fixed file hashes.
  const deploy=APPROVED.transitions.find(row=>row.path==='.github/workflows/deploy.yml');
  const before=read(deploy.before.archive).toString('utf8');
  const validate='  validate:\n    uses: ./.github/workflows/ci.yml\n    permissions:\n      contents: read\n';
  assert.equal(before.split(validate).length,2,'Exact previous reusable caller required');
  assert.equal(production(deploy.path).toString('utf8'),before.replace(validate,validate+'      packages: read\n'),'Deploy may only add read-only GHCR access to validate; publishing permissions stay exact');
  return {priorContract,transitions:APPROVED.transitions,reviewedFiles:APPROVED.files.length,reviewedPinTransitions:productionTransitions.length,workflowTransitions:2,canonicalSourceClosureChanged:false,receipt};
}
export function readBeforeReleasePreparation({rootDir,preparation,path}) {
  const transition=preparation.transitions.find(row=>row.path===path);
  return transition?readFileSync(resolve(rootDir,'preview/yard-persistent-candidate',transition.before.archive)):readBeforeReceiptLifecycle({rootDir,receipt:preparation.receipt,path});
}
