# Inactive canonical food/location contract

This change registers a candidate command/presentation scope only. The source
flag `CANONICAL_FOOD_LOCATION_ENABLED` is false. It does not enable a canonical
visitor, qualify art, register media admission, add a bowl, create food stock,
start a clock, or change catalog prices, servings, lifetime, attraction or
rewards. Existing legacy food bindings and saved visit/media records stay as-is.
The root active-to-active production rollout is a separate approval gate.

## Exact candidate identity

- Location `pip-garden`, version 1, command geometry `pip-garden-t2-food-r2`.
- New commands use `yard-v2:canonical-v2/`; v1 keeps its existing identity.
- Descriptor `canonical-food-r2/20261006`; asset geometry
  `yard-food-source-r2/20261006`; source GLB SHA-256
  `ed618ed41d65e5770eefc241e7b85db9b78a1502de2ad15aa53e3b74bd824c66`.
- One economic row `bowl-1`; presentation socket `pip-garden:food:bowl-1` at
  canonical `(80,82,0)`, zero rotation, 12 canonical units per source unit.
- Reserve every alternative state with outward-rounded radius 3.843 and height
  2.090, from measured union radius 3.842501 and height 2.0889554.

This fixed socket is a deliberate gameplay-geometry exception to draggable HUD
anchors. Moving it requires a new command geometry revision, collision review
and saved-overlap checks. The legacy `yardBowls` drag transform is inapplicable.
The immutable protocol module stays safe for eager client import; full storage
and ground validation load only with `canonical-food-contract.mjs`/Yard geometry.

## Derived state and compatibility

Storage version 2 remains unchanged. Its T2 rows keep the immutable item-v1
storage scope `pip-garden-t2-r1`, including newly placed rows. The capability
explicitly distinguishes this storage scope from its stricter v2 command scope.
No existing row is relabeled, moved, removed or normalized by enabling food.
The v1 geometry and storage validator are not made food-aware.

The stronger rule applies to destinations of new v2 place/move commands, even
when the bowl is empty. Existing overlapping rows remain readable and editable.
Food becomes unavailable with `CANONICAL_FOOD_SOCKET_OCCUPIED` plus exact slot
IDs; the user can move those pots to valid destinations or pick them up. Pickup
requires no vacant food socket. No food command changes the fixed obstacle.

The selector reads one unique `snapshot.yard.bowls` row with ID `bowl-1` and
validates the actual canonical layout with the full storage geometry guard.
Missing/duplicate bowl-1, unknown food, malformed food state or layout all fail
closed. Bowl-2 is never borrowed. It does not inspect client wall time, refill,
consume or synthesize empty state from an expired/unknown filled state. Server
state owns expiration and refill. `available` means data can be bound; descriptor
and capabilities still declare presentationReady/runtimeActivated/visitAdmission
false. These values must never be converted into visual or visit acceptance.

## Durable command reconciliation

Exact receipt lookup still precedes geometry, protocol and feature gates. A
committed v1 intent replays its old outcome while the ordinary API response
returns the current snapshot/capability. Changed action/payload at the same nonce
fails conflict. The client preserves a queued intent's exact nonce and payload.

Only a matching v1 intent with no receipt, received under the actually enabled
v2 item command contract, gets a durable 400 `CANONICAL_COMMAND_SUPERSEDED`.
It has a receipt-bound action ID/request hash and explicit replacement scope.
The outbox validates that evidence, retains the original record as failed with
`requiresUserDecision`, releases its entity lock (including after reload), and
shows the retained attempt in Decor. A new user action gets a separate v2 nonce;
no intent is silently rewritten or resent as a different request. Rejections
without matching evidence and temporary rollout/unknown-server failures retain
the existing quarantine/resume fences. All canonical nonce families are reserved
before generic route dispatch so their slash-bearing IDs cannot bypass receipts.

## Actual rollback semantics

This is deliberately a derived mapping, not a durable migration. Disabling the
candidate returns the v1 capability and hides food; it does not alter inventory,
wallet, rows, visits, media or receipts. The exact prior item-v1 binary can read
the storage and can replay an already committed v2 receipt because receipt lookup
is first. It rejects an uncommitted v2 nonce; the client quarantines that intent
until the v2 capability is observed again.

An old binary may accept its own new v1 move into the now-inactive food region.
The region is therefore NOT guaranteed to remain vacant during rollback. When
v2 is enabled again, availability is derived afresh and the occupied socket
fails closed without discarding or relocating that row. A mixed deployment
cannot promise universal new-region enforcement; homogeneous serving policy,
release tests and active-to-active production approval remain required.

## Remaining qualification

The corrected private canonical visit preflight uses its own immutable geometry
identity. It is not silently rebound to this new candidate revision. Future
admission must pin and qualify this food geometry plus its measured art, routes,
full-stay actor media, reservations and timing. Current manual inspection routes
are not proof that they avoid the food obstacle. No canonical admission callback
or renderer activation is added here. The retained-attempt UI has component event
coverage; phone/landscape browser layout and integrated rendered food still need
separate visual QA before activation.
