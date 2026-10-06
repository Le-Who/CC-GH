# Finite acquisition and compact HUD acceptance

One first-attempt push on `qa/yard-canonical-acquisition-hud-20261006`, one
ordinary Ubuntu 24.04 job, ten minutes maximum, PostgreSQL 15 on fixed guarded
localhost credentials. No deploy, secrets, cache or retries. Artifact cap 8 MiB,
retention three days. The existing local-only API bridge expires after 240 seconds.
No fixture endpoint or extra listener is added. Native browser global cap is
220 seconds: acquisition 115 seconds, independent focused HUD 85 seconds.

The real locked application is built twice with `pnpm run build`,
`NODE_ENV=production`, current `VITE_BUILD_ID`, first
`VITE_YARD_PIP_PREVIEW=false`, then `true`. Both run complete startup/asset closure
and all existing budgets. The real Express/auth/socket application serves the final
preview build. The closed production canonical flag remains false; the existing
SHA-pinned test loader changes only that flag inside this guarded test process.

The funded synthetic account starts with 280 treats and zero pots. The actual
shop purchases at the unchanged 140 price through ordinary `yard.buyGoodie` and
the yard-v2 outbox, never the canonical three-action namespace. A real committed
reply is held, the actual native IndexedDB envelope and DB debit/receipt are read,
then the reply is lost. The same nonce must recover exactly once. The acquired
pot goes through actual inventory, place, reload, move and pickup controls. A
separate 80-treat account must keep zero pots and emit no purchase request.

After storage has genuinely reached v2, a second real purchase commits and loses
its reply. Only this compatibility interval uses a pinned old-domain/HTTP fixture:
exact 4660 service/actions, plus byte checks on all 79 required current dependencies.
Playwright returns the old service's real unsupported-storage result from a copy
of the identity-checked PostgreSQL row. It preserves that copy and the authenticated
snapshot envelope, changing only yardRuntime through old.publicPersistentYard.
There is no old Express deployment. The old response must select the real release
quarantine with a hittable Home control and no interactive Courtyard. No Courtyard
pending copy is claimed inside quarantine. The native IDB intent must remain
unchanged through reload; removing the interception and reloading through a fresh
real authenticated HTTP snapshot must remount persistent Courtyard before checking
the current Express API's same-nonce duplicate recovery. Uncommitted
loss and account A-B-A fencing are fresh source-test coverage, not native claims.

The HUD test runs independently even after acquisition failure, retaining the
original failure report. Fresh sizes: 320x568 EN, 390x844 DPR2 RU, 568x320 EN and
RU, and 844x390 RU. Each requires scene.ready and !viewportBlocked with the
unchanged 280x192 minimum; actual card/control centers must hit through
`elementFromPoint`, followed by real selection/Place/Cancel or Playwright actionability
checks. Inventory, placed Move/Pickup/Inspect, Shop/Buy, font fetches, focus,
44px controls, clipping, layering and horizontal overflow are checked. At 568x320
EN/RU, a bounded Food/Guests smoke scrolls actual controls into view, checks
read-only economy actions and helper input, and closes each panel. Offscreen
catalog cards need not fit simultaneously. The 480x194 stage observation assumes
zero additional safe-area insets; it does not prove arbitrary Telegram insets. Images are
native current screenshots; the garden raster remains 390x648 DPR1.

`acquisition-reused-proof.json` retains nine passed PostgreSQL domain cases from
17fc/run37498940977 only after complete backend/dependency identity checks. It
also records db044/run37507167039: actions passed, HUD ten of eleven passed, and
the 568x320 HUD failure remains explicitly failed. Core dynamic-renderer source is
unchanged; its normal/alternate routes, actual-travel cancellation, rotation and
two original raw clips are referenced by exact hashes. They are not rerun,
re-recorded, or promoted to fresh acceptance of this changed UI. The other seven
historical viewport tuples are listed in the proof, including DPR3 RU. Current
fresh scope is the five tuples above. Subjective visual acceptance and real-device
performance remain separate from mechanical checks.

Checkout depth 10 reaches exact 4660 from one child of db044, needed by the old
service source test. `path-audit.mjs` uses installed Playwright 1.58.2 internals to
resolve all server, selected spec, output and build paths without any launch.
`seal.mjs --reviewed-final-source` must run only after review of the complete
integrated delta; it is not a publication or browser command.
