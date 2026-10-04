/** Explicit CURRENT-FOUR policy, not full-eight release acceptance.
 * Mika/Mochi/Pebble/Pip rest cycles span at most seven distinct atlas pages
 * (1 + 1 + 3 + 2), 50.294 MiB with cushion Mika, 46 MiB with ground-rest Mika.
 * Four maximum visible pages total 34.25 MiB. The pixel/concurrency budgets
 * remain unchanged; slot count must accommodate the validated warm rest union.
 * See tests/yard-current-four-atlas.test.mjs for exact descriptor evidence. */
export const CURRENT_FOUR_ATLAS_POLICY=Object.freeze({
 id:'yard-current-four-atlas/r1',
 actorIds:Object.freeze(['mika','mochi','pebble','pip']),
 maxPages:7,maxDecodedBytes:64*1024*1024,maxConcurrentDecodes:1,
});

// Preserve the accepted canonical-scene budget until the caller registers all
// four exact ready actor profiles. Registering one candidate is not a request
// to retain the four-actor warm union.
export const CANONICAL_ATLAS_POLICY=Object.freeze({
 id:'yard-canonical-atlas/r1',maxPages:3,
 maxDecodedBytes:64*1024*1024,maxConcurrentDecodes:1,
});

// Closed family acceptance scenes reserve the shared still/background/canvas
// ledger inside the same unchanged byte budget. Eight demand pages plus at
// most one future page per actor is a slot ceiling, never a byte allowance.
export const FAMILY_ATLAS_POLICY=Object.freeze({
 id:'yard-family-atlas/candidate-r1',maxPages:16,
 maxDecodedBytes:64*1024*1024,maxConcurrentDecodes:1,
});
