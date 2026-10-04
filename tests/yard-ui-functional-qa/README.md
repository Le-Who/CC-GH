# Ordinary C UI/API diagnostic

This package exercises the actual illustrated `CourtyardGame`, `useGameHub`, IndexedDB/local-storage outbox, signed Telegram API and disposable PostgreSQL behind one ordinary C image. It is diagnostic evidence only. It does not grant release, update, rollback, migration-completeness, art-calibration or eight-actor animation acceptance.

The separate runner owns the exact commit/image/run identity, empty disposable database, process/proxy lifecycle, explicit `YARD_UI_FUNCTIONAL_QA=1` opt-in, and evidence paths. The opt-in is never supplied as a server-policy override. The server starts through ordinary `server.js` and built `dist`. No readiness transformer, policy loader, fake successful HTTP response or private app-store hook is used.

The five required cases run once each on Chromium at 390×844/DPR2. The existing illustrated preview lane owns its separate 320/390/landscape visual coverage. The inherited proxy permits only one captured lost response per lifetime, so this diagnostic deliberately uses one browser project.

1. `catalogue-actions`: twelve available action types and two explicit unavailable contracts; real card/tab selection; food purchase/fill; paid Moon Lamp purchase, exact treats/shiny deltas, unchanged same-nonce replay and conflicting-payload rejection; repair/store; Moon Lamp and Sun Cushion placement; screen-left keyboard movement of eight CSS pixels; pointer cancellation; gifts/letter; portrait/album favorite; companion settings; exact accessible currency chips; Home/Garden/re-entry/reload preservation.
2. `unaffordable-shiny`: enough treats but no shiny; paid Moon Lamp disabled, free cushion enabled, no UI mutation; real server rejection preserves currencies and inventory.
3. `reserved-placement`: plain legacy input and a current-hour native seed produce a real Mika reservation. The remaining service window must exceed 25 minutes. Every saved occupied card is selected and checked, then actual pickup rejection preserves ownership and currencies. The initial fixture contains one occupied cushion; this is not eight-actor proof.
4. `lost-response-reload`: one real 17-treat gift commits once. The proxy drops its genuine response, the real outbox retains the nonce across reload, forwarding resumes to the same C, and a duplicate response clears the outbox without a second credit. Two existing photos and their unknown fields remain intact.
5. `storage-write-no-send`: only writes to this owned outbox key fail through native IndexedDB and local-storage APIs. No HTTP response is substituted. The visible storage failure must precede any mutation, ownership/currencies/receipts remain unchanged, and the evidence records whether placement stayed open. The page is closed in `finally`, disposing both injected storage faults and its unsaved in-memory intent.

Every case writes failure evidence in `afterEach`, including actual browser mutation requests/status/bodies/nonces, fixture-owned Yard state and ledgers, resources, page errors and console errors. No authorization headers are captured. The only expected console failure is the exact browser network error from the intentionally dropped collect request in its named case; other console/page errors fail. The runner retains failures, logs and browser traces.

All resource values and keys are compared strictly. At full energy, ordinary `buildSnapshot`/`calcRegen` can update `resources.energy.lastRegenTimestamp`; only that field may advance monotonically within the measured baseline-read to result-read interval. It may also remain equal. No economic value is omitted or relaxed.

## Existing acceptance scripts and the P/C distinction

P means the currently accepted B2 persistent Yard with its old UI. C means the later illustrated candidate. Both use writable persistent v2 policy. The historical A→B→A production lane includes a closed A; its pause/quarantine assertions must not be reinterpreted as P→C→P behavior.

The existing `tests/helpers/yard-eight-player-candidate.mjs` pins six CLOSED source modules and two closed manifests, then transforms readiness for that historical candidate lane. B2 is ACTIVE. Updating those pins or loosening the closed guard would invalidate its meaning. The existing `yard-ci-dispatch`/production acceptance boundary also proves an exact activation tree and cannot approve arbitrary UI files. Neither is changed by this diagnostic.

Minimal future test adaptations, when separately authorized:

| Existing test | Old assumption | Actual C flow |
| --- | --- | --- |
| `tests/yard-eight-player-e2e/player.spec.js:77` and `:108` | Food, items and actions all live in `.cy-row` | Food uses an `article` containing its visible title; bowls still have actual row controls; items use category button → card button → selected action |
| `tests/yard-eight-player-e2e/player.spec.js:90` | Looping visible Move buttons proves every reservation | Select every placed card, including repeated item names by occurrence, then check that selected card’s Move/Store/Repair controls |
| `tests/yard-eight-player-e2e/player.spec.js:110` | Repair/store/buy/place available in one panel | Explicit In the yard / Shop / Inventory transitions; reselect the intended card after each transition |
| `tests/yard-eight-player-e2e/player.spec.js:118` | Expand/remodel controls always rendered | Open Items → Shop before checking unavailable controls; require expected control counts to avoid an empty loop passing |
| `tests/yard-eight-player-e2e/player.spec.js:126` | Favorite and helper controls coexist with guest visits | Select Photo album before Favorite, then Helper before name/food/auto-feed |
| `tests/yard-eight-player-e2e/player.spec.js:131` and `:137` | ArrowLeft writes world `x=53` | Measure canvas after placement controls appear; project the saved-command delta and assert −8 CSS px horizontally / 0 vertically; compare persisted coordinates to the actual command |
| `tests/yard-eight-player-e2e/player.spec.js:135` and `tests/yard-player-integration-e2e/player.spec.js:110` | One `.cy-wallet` contains exact raw digits | Two chips; assert exact formatted `aria-label` and `title` independently for treats and shiny, since visible values compact above 9999 |
| `tests/yard-production-e2e/production.spec.js:239` | Inventory row title is `Moon Lamp × 1` with an inline Place | Items → Inventory → Moon Lamp card, stock count in detail, selected Place action |
| `tests/yard-production-e2e/production.spec.js:243` | Ten Right and ten Down keys reach an authored world anchor | Those keys now move screen-space pixels. Use an explicitly projected authored target through actual pointer input, or assert screen-space movement separately; never change server XY/save format |
| `tests/yard-production-e2e/production.spec.js:147` | Opening Guests always exposes Collect | Fresh mounts still do; when reusing a mounted C session, explicitly select Guests because the remembered subsection may be Album/Helper |

Existing real API nonce, ledger, exact economy, HTTP ownership/authentication, rollback and adjacent-game assertions remain obligations. A green fixed-fixture preview proves none of them. This package adds a bounded C diagnostic without editing historical acceptance scripts.

## Identified UI recovery gap

`CourtyardGame.confirm()` calls `cancel()` even when immediate enqueue returns a storage/account error. Local `error` is also retained after a later successful enqueue. Both behaviors already exist in B2; the new cards did not introduce them. The storage case observes no-send/no-spend and records the visible result. A controller recovery fix needs demonstrated evidence and a separate narrow patch.

Keyboard integration also requires the actual scene's `offsetPoint` API. Applying the new component alone over B2's old scene would make arrow movement a no-op. The combined candidate must include that scene API; this suite exercises it through real keyboard input.

No installed dependencies, service launch, browser run or CI run is implied by source checks. Execute only through the separately reviewed ordinary-C runner.
