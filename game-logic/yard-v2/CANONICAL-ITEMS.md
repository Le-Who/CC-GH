# Inactive canonical item loop

This capability is server-owned and disabled by default. It does not change the
Yard release policy or admit any visitor. Test calls may pass
`canonicalItemPlacementEnabled: true` to the existing service. HTTP payloads and
saved fields cannot enable it. The API fixture replaces only that constant in its
isolated test process; it never changes the production release policy.

## Wire contract

`canonical-item-protocol.json` owns the small wire descriptor. Startup transport
may import it alone; geometry, runtime utilities and action implementation stay
outside the initial game bundle. The lazy domain module derives its exports from
that same descriptor.

Keep the existing `/api/player/mutate` action envelope and owner binding. Only
`yard.placeGoodie`, `yard.moveGoodie`, and `yard.pickupGoodie` support this location.
Their payloads require:

- `locationId: "pip-garden"`
- `locationVersion: 1`
- `geometryRevision: "pip-garden-t2-r1"`
- `slotId: "canonical:"` followed by 1–80 ASCII letters/digits or `_.:-`
- Place: `goodieId: "leaf_pot"`, numeric finite `x` and `y`
- Move: numeric finite `x` and `y`; optional matching `goodieId`
- Pickup: optional matching `goodieId`; no coordinate lookup or goodie-ID fallback

The stable `clientActionId` must be `yard-v2:canonical-v1/` followed by 1–96 ASCII
letters/digits or `_.:-` (maximum 117 characters). Preserve the complete payload
and nonce on a lost response. Never retry through the legacy namespace. The
persistent Yard branch receives this ID before the generic action normalizer,
which accepts only 8–120 characters and excludes `/`.
The outer action-envelope route reserves the canonical prefix before every domain
dispatch: unsupported Yard and non-Yard actions reject with
`CANONICAL_ACTION_UNSUPPORTED`, including malformed tails, without executing or
creating a receipt. If the exact nonce was already committed, the existing
`ACTION_ID_PAYLOAD_CONFLICT` result takes precedence.

The 200 outcome uses existing extras plus the three location fields and, for
place/move, `placement`. The durable receipt has those location fields at its top
level and hashes the full original action/payload. Same nonce and payload replays
before enablement checks or simulation. A changed payload returns 409
`ACTION_ID_PAYLOAD_CONFLICT`.

## Server-owned storage and projection

`_yardV2.runtime.canonicalPlacements` is separate from `yard.placedGoodies`, legacy
anchors, and visits. Each row has the three location fields, `slotId`, `goodieId`,
`x`, `y`, `itemGeometryRevision: "yard-succulent-T2"`, `condition: "new"`, `uses: 0`,
and authoritative `placedAt`. There is one shared `yard.goodieInventory`.

First successful canonical placement changes `_yardV2.version` from 1 to 2 while
retaining `format: "yard-persistent/v1"`. New code reads versions 1 and 2. Version
2 remains after pickup; there is no automatic downgrade. The immutable migration
archive is unchanged. Canonical actions do not advance the old scene's clock or
change its placements, food, visits, wear, gifts, photographs, or other games.

Public `yardRuntime.version` remains 1. It adds `canonicalPlacements` and one
`itemPlacementCapabilities` object containing the location fields, `enabled`,
`readOnly`, `maxPlacements: 2`, `actions`, `slotPrefix`, `actionNoncePrefix`,
`coordinateSpace: "canonical-ground"`, the `[0,0]..[200,220]` domain, and
`items.leaf_pot`. That item includes exact T2 asset hash, radius 4.65, supported
`conditions: ["new"]`, original catalog cost/durability/capacity, and place/move/
pickup flags. `visitAdmission` is always false. Catalog capacity 1 concerns a
prop's visitors; the separate `maxPlacements: 2` permits one target and one blocker
using the same T2 geometry. `CANONICAL_MAX_PLACEMENTS` is exported directly from
the shared protocol field so server and UI use one capacity source. Both rows
must have distinct identities and non-overlapping full footprints.
Disabled new servers still expose valid saved canonical rows with `readOnly: true`.

Full-height circle clearance is checked against every ground polygon edge,
exclusion polygon, and other canonical footprint. The server-owned geometry is
the exact current T2 fixture ground and visible fixed shell exclusions. Unplaced
fixture bench, cushion and planter create no invisible obstacles. The separate
full-volume projected box (radius 5.5, height 11) must remain within the calibrated
artwork and clear every fixed-foreground box, matching the existing UI composition
guard under uniform viewport fitting. Coordinates are never clamped or converted
into historical coordinates.

## Failure and compatibility behavior

These 409 responses have no receipt, no debit, and no mutation; retain unresolved
same-nonce intent until a compatible server/capability returns:

- `CANONICAL_NONCE_REQUIRED`
- `CANONICAL_LOCATION_REQUIRED`
- `CANONICAL_LOCATION_UNKNOWN`
- `CANONICAL_LOCATION_VERSION_MISMATCH`
- `CANONICAL_GEOMETRY_REVISION_MISMATCH`
- `CANONICAL_ITEM_PLACEMENT_DISABLED`
- `CANONICAL_ACTION_UNSUPPORTED`
- Existing `UNSUPPORTED_YARD_STORAGE_VERSION` / `YARD_ROLLOUT_PAUSED`

The exact published v1 service rejects the slash nonce before its action policy,
simulation or debit with 409 `LEGACY_NONCE_REQUIRES_NEW_PROTOCOL_INTENT`. After the
first canonical placement it rejects version 2 before normalization with 409
`UNSUPPORTED_YARD_STORAGE_VERSION`. Its raw stored layout remains intact for a
return to the new server. New code rejects malformed or manually downgraded
canonical state with `MALFORMED_CANONICAL_YARD_STORAGE`.
Historical and queued legacy placements may already use an opaque `canonical:`
slot ID. Only explicit location fields or the reserved nonce identify canonical
intent. Ordinary legacy place/move/pickup/fix payloads retain their prior behavior;
an attempted slot match against a real canonical row instead rejects with
`CANONICAL_LOCATION_REQUIRED` before legacy simulation or goodie-ID fallback.

Validated command failures return 400 and a durable rejected receipt:
`CANONICAL_SLOT_ID_REQUIRED`, `CANONICAL_SLOT_ID_CONFLICT`,
`CANONICAL_SLOT_NOT_FOUND`, `CANONICAL_SLOT_GOODIE_MISMATCH`,
`CANONICAL_LOCATION_CAPACITY_REACHED`, `CANONICAL_GOODIE_UNSUPPORTED`,
`CANONICAL_GOODIE_NOT_OWNED`, `CANONICAL_CONDITION_UNSUPPORTED`,
`CANONICAL_TRANSFORM_UNSUPPORTED`, `CANONICAL_PLACEMENT_INVALID`, or
`CANONICAL_INVENTORY_REQUIRES_REVIEW`. They never debit inventory.

## Focused verification

Run `node --test --test-concurrency=1 tests/yard-canonical-items.test.mjs tests/yard-canonical-item-api.test.mjs`.
The latter uses actual route action/snapshot/migration functions and atomic
JSON-file persistence with reload per request, including a lost committed response
and an older client's unrelated game sync. It is not a PostgreSQL concurrency or
HTTP/browser test. The old-service compatibility test reads the exact published
`4660ba9d84a0abb40f7c77bed7a702caba18b67b` service/actions via Git and changes only
module import URLs to execute them locally.
