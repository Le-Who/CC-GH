# Persistent Yard server slice (staging)

This code binds to the current release catalog/playzones and `yard.js` default factory. It does not copy the historical player, Garden, Merge, or catalog modules. The port came from the tested 2026-10-02 catalog foundation, with current-route integration and a full-stay presentation contract added here. It is not a production deployment or a browser/art acceptance.

## Storage and ownership

`player.yard` remains the authoritative legacy-shaped Yard payload. `player._yardV2` has format `yard-persistent/v1`, version `1`, a deterministic runtime, one migration archive/receipt, and retained legacy Yard action receipts. There is no second current player snapshot or shared wallet inside this record. The one immutable original input archive contains only identity, Yard, legacy pet/room inputs, and Yard receipts; it retains all original photos, pending gifts, owned counts and unknown fields.

Every service operation rehydrates a kernel envelope from the fresh locked player. A successful mutation writes only `yard` and `_yardV2`. The existing route retains its `_onboarded` behavior. Garden accounting, shared gold/tokens, Merge essence/epoch/fence, and unrelated account data are not copied back from the kernel. `withPlayerLock` remains the actual persistence owner: its fresh SELECT and `_version` conditional UPDATE commit state and receipts together. A losing attempt reruns against fresh account state. The modeled OCC tests exercise this real retry code; no live PostgreSQL connection was made.

History and receipts are not silently truncated. That intentionally grows the JSON record with commands, visits and events. A later archive/index design must preserve nonce and gift-claim lookups before reducing stored history. It must not reintroduce the old 72-hour/200-receipt or 100-gift truncation.

## Entry points

- `ensurePersistentPlayerYard(player,{now,simulate})` initializes safely. Load and snapshot projection use a zero-interval advance. The authenticated snapshot route requests authoritative catch-up.
- `executePersistentYardAction(player,action,payload,{now,actionId})` handles all 14 actions. The route supplies the real server clock and client intent ID; payload time is never a clock.
- `publicPersistentYard(player,{now})` produces `snapshot.yardRuntime`: revision, server clock/cursor, active visit originals and exact media plans, display/reposition issues, reservations and supported bindings. It excludes receipts, raw backup and completed history.
- `inspectYardGrantTarget` keeps existing additive Merge grants compatible with partial legacy Yard objects, while existing future/malformed v2 targets are refused before another debit. The Merge domain still validates its own counts/currencies. Alchemy projects remain gated by the unchanged Merge release policy.

The actual callsites changed are `playerManager.applyMigrations` and realtime projection; `routes/player` load/snapshot, all Yard intents, and legacy Merge grant helpers; `routes/mergeRoutes` legacy exchange target; and the V3 `merge-lab-service` grant guard. These paths no longer call the destructive legacy Yard normalizer. The old pure legacy functions remain exported solely for compatible reference callers/tests.

## Durable intents

New Yard command IDs use `yard-v2:`. The digest covers both action name and payload. Exact replay runs before simulation and cannot debit or claim twice. Conflicting reuse returns 409. Original production Yard receipts are retained outside the generic receipt pruner. Unknown old nonces require explicit new-protocol intent instead of becoming a new purchase. Known rejected commands are also receipted; a later capability change needs a new intent. HTTP cannot supply a policy or simulation override.

Unsupported/future player/Yard/runtime/receipt versions remain read-only. Existing malformed inputs are retained in place; they are never replaced with a starter grant. Valid legacy slot-only rows keep a one-time external display anchor with source-slot/expansion provenance. Expansion in the pure source contract does not rewrite those raw rows or move their displayed anchors.

## Bounded content availability

The current release binding permits kibble and meadow. New buy/place/fix operations require both the two-prop allowlist and a fully ready media binding. Mouse remains unavailable while its floor-rest and settled-orientation variants are incomplete; the validated cushion binding can operate. Other props/premium foods/remodels and new expansion are gated before cost. Existing ownership, legacy rows, helper configuration, photos, daily letters and safe pickup/reposition recovery survive. Alchemy inventory is preserved without auto-placement or guaranteed visitors.

`yardRuntime.supportedBindings` is the UI contract. A blocked intent returns `YARD_BINDING_REQUIRED` and `details.reason`. Pure action tests explicitly exercise full source semantics, separate from the bounded real-route policy. The media preflight additionally rejects unsupported filled food, unsupported saved props (`PLACED_PROP_PRESENTATION_UNAVAILABLE`), unfamiliar orientation, concurrent named Mika, and unsafe route/actor envelopes. Raw saves are not moved to satisfy those checks.

## Full-stay server timeline

The economic visit draw remains 45–110 minutes with the same seed and absolute hourly opportunities. The candidate includes `leavesAt` before media admission. A trusted plan must cover the whole stay with contiguous integer-ms hidden/route/clip/loop segments. Small invisible entry slack allows whole 1200ms breathing cycles. Rendered motion runs at its authored speed.

`propReleaseAt` comes from actual media step-off, replacing the old 84% fraction for new full-stay visits. A 59-minute real cushion regression remains reserved until 600ms before leaving. Original legacy visits retain their imported release semantics and are not assigned invented animation.

`plan.propCommits` uses absolute time and an exact same-slot transform `{x,y,rotationZ,compression}`. The simulation applies each commit chronologically before departure or the next opportunity, with durable `visitId:index` receipts. Composited/static ownership and visual sampling are client concerns; a render callback never moves the authoritative prop or creates a gift. Held interaction and exit envelopes reject conflicting placements until departure.

## Verification at the server milestone

249 tests passed in the selected combined run, including all 14 source actions, actual route policy/replay, lossless 105-gift/110-photo history, retained old receipts, stable slot anchors, unsupported/future shapes, hourly partition/reload equivalence, actual cushion full-stay endpoint/gift timing, current Garden and Merge regressions, and modeled actual OCC retries preserving concurrent Garden progress.

Command: `node --import ./tests/yard-inventory-only-loader.mjs --test tests/unit.test.js tests/yard-v2-actions.test.mjs tests/yard-v2-service.test.mjs tests/yard-v2-occ.test.mjs tests/yard-inventory-only.test.mjs tests/yard-merge-v3-preservation.test.mjs tests/merge-lab-routes.test.mjs tests/merge-lab-service.test.mjs tests/merge-lab-enabled-transition.test.mjs tests/garden-transactions.test.js tests/garden-transaction-ledger.test.js tests/garden-accounting-routes.test.js`

The existing loader supplies bounded Express/DB/Redis test doubles. Full frontend tests/build cannot run without the release dependencies (an attempted `merge.test.js` load reported missing `zustand`). No packages were installed. Browser, real database, deployment and production-userdata validation are not claimed.
