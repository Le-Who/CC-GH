# Garden accounting checkpoint

Status: separate source candidate after the frozen Garden Living R3 presentation and quest-credit patches. No deployment or production data change has been made. Full build, actual routes, browser, and PostgreSQL gates must pass before transactional release claims.

## Contract and files

- `game-logic/garden-transactions.js` implements pure server transactions for buy, upgrade, sell, quest claim, shelf unlock, the existing level-up reward, and earned-credit batches
- `routes/player.js` runs those transactions inside the existing receipt/`withPlayerLock` path; resources, Garden state, and accounting metadata persist in one existing player JSONB update
- `src/games/garden-shelf/lib/gardenTransactions.js` persists immutable, account-bound client intents before sending, uses the existing `performReliableAction` receipt mode, and acknowledges only a confirmed matching receipt
- `GardenShelfGame.tsx` coordinates recovery, server-clock-based intent timestamps, and economic callbacks; `GameContext.tsx` waits for acknowledgment, protects state sync, and reconciles server-owned economic state with surviving local growth
- `GardenPresentation.tsx` and i18n expose pending/storage/capability errors and a user-confirmed reconciliation path; economic buttons are disabled while unresolved, while normal growth, Care, and viewing remain available
- `types.ts` and `garden-economy.js` add optional/zero-default accounting metadata without changing numeric cost, growth, XP, or reward tables

Commands carry the current economic revision and an intent `{accountId, streamId, sequence, createdAt}`. The stable ID is `garden:<streamId>:<sequence>`. The server verifies the authenticated account and payload hash. Retries never change an unresolved ID or payload. Pending/queued transport results are not success.

Buy/upgrade/sell/claim/shelf/level commands derive amounts on the server and update the corresponding entity or marker with gold. After atomic accounting activates, legacy `garden.goldDelta` is rejected for that account. Initial legacy save import remains compatible; this is a reliability change for the new client, not a complete anti-cheat redesign.

Economic revisions reject stale snapshots. Active-account snapshots cannot add/remove/upgrade plants, alter the Garden level or shelf count, or add/erase quest claims. Non-economic growth, phase progress, watering, names, and placement remain client-authored. A monotonic time check prevents older growth checkpoints rewinding a newer accepted checkpoint.

Earned credit has an independent server watermark and stores the growth checkpoint atomically with credit. A failed request cannot advance the acknowledged watermark. Cumulative earned totals now persist up to `Number.MAX_SAFE_INTEGER` rather than the prior 1e9 persistence ceiling; each credit batch remains bounded to 1e9. This avoids halting acknowledgment at the old ceiling without changing growth math or issuing retroactive guessed credits. Existing level rewards keep their original derived amounts.

## Stream lifecycle and recovery

A stream is persisted per browser/account and reused across actions and reloads. Web Locks serializes same-account tabs. Completed streams rotate before another action after more than 72 hours of inactivity. Active streams are retained. At the 128-stream bound, server records inactive beyond 72 hours plus a five-minute clock-skew margin can retire; the bound is therefore not a lifetime device limit. If all 128 are recent, new streams fail closed temporarily. Existing recent devices can continue, or a new device can retry after the inactivity window.

Unknown retired intents are never guessed safe to replay. Client timestamps use the observed server clock, and the server rejects timestamps over two minutes in its future. This prevents a future timestamp making a retired intent appear fresh.

After 72 hours the client explicitly reconciles before replay. A retained matching record confirms application; the next sequence of a retained stream can confirm non-application. Unknown, conflicting, or superseded intents stop economic submissions. The visible Review action loads fresh server state, asks for explicit confirmation including the current balance, archives the pending request locally, and uses server state without resending a charge/refund. Unsynced local progress may be replaced, as stated in the confirmation. The archived request remains available for investigation. This path does not require an administrator to unlock the browser.

When Web Locks or writable localStorage is unavailable, charged/reward submissions fail closed with explanatory UI. Ordinary growth, viewing, Care, and uncharged state sync remain available. Actual Telegram WebView capability coverage is still required; no physical Telegram device pass is claimed.

## Data migration and trust boundaries

There is no SQL schema migration and no new balance-reset trigger or grant. Metadata lazily initializes in the existing player JSONB with revision zero, the existing cumulative earned total as its starting acknowledged watermark, and empty streams. Historical missing credits are not guessed. The baseline's existing legacy-economy reset criterion remains; its metadata now stays consistent with that existing outcome. Current version2 saves do not get reset.

The existing PostgreSQL OCC retries and per-player lock remain unchanged. Authentication, database connectivity, and global outbox implementation are unchanged. Garden explicitly uses receipt mode, not the generic outbox's early `{pending:true}` result or non-Garden entity-key coalescing.

Remaining limits:

- Growth/XP totals remain client-authored; server-derived economic commands do not constitute anti-cheat validation of all gameplay
- Initial pre-activation legacy APIs/save import remain compatible; active accounts reject split gold deltas
- Destruction/rollback of both server state and client storage is outside the receipt guarantee; no automatic monetary compensation is attempted
- Garden startup uses the verified account’s server snapshot even when it is empty. Recovery copies use an account-bound key and envelope; the old unscoped `terrarium_save` bytes remain untouched and are never automatically adopted. The intent ledger remains account-scoped and server account-bound.
- The source changes require real React/build/browser verification, including StrictMode, tab switches, recovery UI, and short-view layout

## Validation and CI additions

Locally passed: 211 Node tests, including 41 new transaction/ledger/guard tests and 170 existing Garden/HUD/asset/core tests. HUD validation passes 8 layouts and 15 presets. These are not browser or database-persistence results.

Required normal Node/route suites (existing dependencies must be installed by CI):

```sh
node --test tests/garden-transactions.test.js tests/garden-transaction-ledger.test.js tests/garden-accounting-pg-guard.test.mjs tests/garden-accounting-routes.test.js tests/unit.test.js
```

Actual route tests could not load locally because `express` is absent. No packages were installed. The five route cases are authored and syntax-checked only.

Browser gate:

```sh
playwright test tests/e2e/garden-shelf.spec.js tests/e2e/garden-accounting.spec.js --project=chromium --workers=1
```

The migrated Garden suite keeps the full viewport and save-path coverage. Seven additional actual-server cases forward real requests and, where needed, abort delivery only: purchase/earned/quest lost-response restart, pre-application failure/retry, two-client spending, unsupported Web Locks with usable growth/Care, and user-confirmed expired-intent recovery. They do not fabricate successful mutation responses. Browser cases are authored/syntax-checked, not locally executed.

PostgreSQL gate reuses the release's disposable PostgreSQL15 `ccgh_merge_ci` service:

```sh
GARDEN_ACCOUNTING_PG_TEST=1 CI=true NODE_ENV=test node --test --test-concurrency=1 tests/garden-accounting-postgres.test.mjs
```

`DATABASE_URL` must target local port5432 with user/database `ccgh_merge_ci`; Redis must be disabled. The guard runs before database imports. The selected suite fails if the DB is unavailable; the unselected local skip is explicitly not evidence. Five real persistence cases use actual db.js/playerManager.js/routes and separate OS processes synchronized after reading the same OCC version, requiring a genuine retry. Cleanup deletes only generated `garden_accounting_pg_*` fixture rows. No local PostgreSQL install or connection was attempted.

## Integration caution

Apply the patch rather than copying `routes/player.js` wholesale over a combined release: Merge owns neighboring route changes. An integrated-context patch is supplied separately. `tests/unit.test.js` changes only the stale Garden sync expectation from permissive success to explicit409, retaining balance/level assertions. No test has been marked passing merely to make the gate green.

## Account-cache amendment

`game_hub_garden_state_v1:<encoded server player id>` stores a versioned envelope with the same account id and Garden state, excluding the shared gold balance. It is a recovery copy, not an automatic authority over a verified server snapshot. A provider is remounted by account id; retired-provider requests are rejected when the live snapshot account differs.

The legacy `terrarium_save` entry cannot prove who owns it. This amendment neither deletes nor overwrites it and does not add a one-click importer. If legacy-only recovery is needed, first export the original bytes unchanged, establish the owning account explicitly, and review them against that account’s server state before authorizing any migration. Merely opening Garden must never import historical earned totals or grant gold to a fresh account. Existing server saves and balances are unchanged.

The account-cache regression executes the production startup selector and transaction domain in Node with shared A/B browser storage, reproducing the old 10001-credit failure and asserting the corrected one-credit result, empty B ownership and preserved A/legacy bytes. A separate real-server Playwright case switches A → B → A in one browser context, tests the first B tap and validates A recovery. Browser execution remains required in CI; it was not available locally.
