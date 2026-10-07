# Inactive R1 saved-visit bridge

This is an additive source candidate, not an enabled save format or admitted
guest. No production module imports these files. Every result has
`admission:false` and `ready:false`, and never has an `ok` admission property.
The binding arrays are empty. Do not insert a proposal into legacy
`runtime.visits`, or convert it to the historical callback's `ok:true` shape.

## Concrete delta

`canonical-saved-stay.mjs` adds the separate baseline profile
`r1-peek-release84-neutral-rest/v1`. It reuses the exact unchanged R1 actor,
source pose driver, incoming inspection and geometry; it does not modify the
sealed previous stay presenter. The actor approaches the actual placed T2,
performs the existing seeded leaf/rest behavior, finishes a supported retreat
by the historical 84% release, waits at a reachable neutral anchor and exits
at the original absolute `leavesAt`. There is no speed increase or duration
retiming. A gesture crossing the retreat boundary finishes before walking.

The neutral anchor is selected from current committed placements and the
food-aware navigation geometry. Its full body/support envelope must clear the
same target's complete entrance/approach and interaction envelopes. Its final
exit treats a newly arrived R1's target occupancy as an additional obstacle;
each exit stage's conservative envelope must also clear it. A missing safe
anchor/path fails closed. The search has a 4-unit grid and at most 24 route
attempts. This conservative, bounded search may reject otherwise usable yards.
It is not an authored fixed scene or a promise that every placement admits Pip.
The supplied `(98,118)` target and moved `(98,116)` target both prepare, with
different neutral anchors. `(108,126)` is a valid item placement that this
conservative readmission-safe search rejects; it cannot be silently admitted
using the older, less restrictive exit. Reachability filtering happens before
the 24 full route attempts, so disconnected candidates cannot exhaust that
budget and hide reachable candidates.

The navigation profile `pip-food-r2-front-portal-curved-hulls/v1` explicitly
names the actor-only front-edge portal, fixed R2 food exclusion and conservative
Bezier control hull / gait endpoint envelope semantics. It does not enlarge the
item-placement lawn, change the item storage revision, or reinterpret legacy
0..100 rectangles. The old canonical visit-v1 linear/lawn-only validator remains
unchanged; it must not be used to relabel this new format.

`canonical-saved-visit-bridge.mjs` accepts only an already-selected, source-owned
server candidate. It does not run, filter or retry a lottery. It accepts R1/Pip,
T2 leaf pot and `peek`; other visitors or activities remain unsupported. Brisk
mode and worn art are not enabled. The existing 45–110 whole-minute duration,
motion seed derivation, one serving, one use and deterministic gift identifier
are retained. The exact one-use and one-serving outcome is projected in private
copies, with `committed:false`. No stock, petbook, gift, wallet or clock is written.

The complete presentation is planned against projected post-use rows. Therefore
a future atomic one-use commit would not make the first rendered frame stale.
This separate new-version validator permits new-condition uses 0..7; a visit
from 6 to 7 can prepare, while 7 to 8 is blocked because worn T2 presentation
does not exist. The existing item-v1 uses:0 validator remains unchanged.

## Record, replay and reservations

The `yard-canonical-saved-visit/v2` proposal stores its selected candidate,
source/profile identities, before/after rows and bowl, immutable timestamps,
economic intent, conservative half-open reservation intervals and a full
presentation digest. It is marked `prepared-inactive`, `authoritative:false`,
and requires a future outer container version 3. These fields are not proof of
an admission or transaction. Hashes are integrity checks, never authorization.

Reload recompiles from the pinned sources and compares the entire proposal,
including reservations and post-use state. Rehashing a modified reservation,
clock, condition, serving count or presentation hash does not bypass replay.
Unknown versions/profiles fail without normalization or deletion. A nonterminal
restore/sample requires fresh current rows; saved rows alone never draw a live
actor. Current rows
must match the post-use snapshot, with one explicit exception: at or after this
visit's release, the same target may gain uses while still `new`, with every
geometry, identity, condition and placement-lifetime field unchanged. This lets
the first actor continue neutral rest/exit when the next same-target visitor
commits its use. It never rewrites the record or allows backward wear. Other
layout changes require a separate authoritative replan. At terminal time there is no actor sample,
even if current layout data is missing. Sampling never completes a visit or
issues a gift.

Target occupancy is half-open `[arrivedAt, releaseAt)`. Body/support occupancy
continues through neutral rest and the final exit to `leavesAt`. Target physical
geometry is included separately. Interval conflict checks reject unrecognized
records and navigation profiles; they never silently discard malformed old
reservations or relabel old coordinates. Immediate same-target readmission is
tested by independently comparing every overlapping interval of both complete
plans, including the first actor's later exit against the next actor's stay.

## Remaining finite integration gates

1. Independent source review of the new retreat, neutral anchor and exit;
   full-stay GPU/compositor, mobile/landscape and motion/art acceptance for this
   new profile. CPU poses and conservative source bounds do not supply that.
2. An additive container-v3 reader/writer and explicit capability/nonce protocol.
   Keep legacy `runtime.visits`, receipts, raw migration archive and all unknown
   fields intact. Older code already refuses container v3 read-only, demonstrated
   against the actual existing service. No v3 writer or migration is supplied
   here, and the unchanged v2 reader must not be taught to accept nonzero uses.
3. Wire the existing authoritative opportunity/transaction path under its player
   lock: process due events first; make the current location/old-yard coexistence
   policy explicit; select once using the unchanged lottery/duration rules;
   validate the selected candidate and all saved reservations; atomically commit
   the same stock/use/petbook effects and record. Completion and reward receipts
   remain owned by the existing server event path. Placement/move/pickup must
   respect target and body/path reservations independently after target release.
4. Rehydrate/replan and bind the renderer to fresh server snapshots. Preserve
   original arrival/release/departure times across layout changes, reconnects,
   hidden tabs and rollback. Use the existing visibility invalidation and quiet
   wake contract. Measure/cache reviewed source replay appropriately before it
   runs inside a production transaction; this source planner is synchronous.

Only after these gates have real source-owned evidence may a separate change
register an admitted binding. Opening a flag alone is insufficient.

## Verification

The packet harness resolves the new files, then the unchanged sealed stay
packet, then the coordinator's exact current integration checkout. It does not
copy the repository, install dependencies, run a browser/server or publish.

Run:

    node --import ./register-overlay.mjs --test ./overlay/tests/yard-canonical-saved-visit-bridge.test.mjs

Focused checks cover both duration endpoints, actual loaded R1 skeleton/sole
targets, full source retreat/exit support, release/readmission reservations,
post-use replay, tamper rejection, old-service rollback refusal, last-serving
behavior and the real historical lottery callback's inability to consume the
prepared result as an admission. Samples are explicitly inactive source records.
