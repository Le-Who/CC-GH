# Fix Merge Tap Bug & Implement Rarity-Based Rewards

This plan addresses the critical issue where "Tap" in the Merge minigame wiped out the player's harvested crop inventory and reworks the Tap mechanics to exclusively consume berries while rewarding players with multiple drops corresponding to the crop's rarity.

## Root Cause Analysis
1. **Frontend Inventory Wipe**: The `tapGenerator` API call optimistically deducts one crop from `harvested`, but the server's `POST /api/merge/tap` route currently omits `p.farm.harvested` in its response payload. When the frontend deep-merges the response, it overwrites the local `harvested` dictionary with `undefined` (defaulting to `{}`), clearing the player's inventory entirely.
2. **Asymmetric Costs**: The frontend expects a crop deduction, while the backend blindly zeroes out `-1` Energy and ignores the passed `cropId`.
3. **Missing Rarity System**: The `CROP_TIERS` and `TIER_YIELD` objects exist in `game-logic/crops.js` but the backend tap route completely ignores them, hardcoding a single item drop instead of the expected 2-5 items.

## Proposed Changes

### Backend (`routes/mergeRoutes.js`)
- **[MODIFY] `/api/merge/tap`**
  - **Remove** the energy cost check and deduction.
  - **Add** a validation step for `req.body.cropId`. Ensure the player has at least 1 `p.farm.harvested[cropId]`.
  - **Deduct** 1 unit of `p.farm.harvested[cropId]`.
  - **Implement Rarity Drops**: Look up the crop within `CROP_TIERS` and fetch the min/max yield range from `TIER_YIELD`.
  - **Spawn Loop**: Loop for the randomized yield count. During each iteration, check `getEmptyCells(p.merge.board)`. Stop spawning early only if the board runs out of spaces.
  - **Collect Spawn Data**: Store all spawned coordinates into a `spawnedItems` array.
  - **Update Payload**: Return `harvested: p.farm.harvested` and an array `spawned: spawnedItems` in the JSON response.

### Frontend (`src/vanilla/merge/api.js`)
- **[MODIFY] `tapGenerator`**
  - **Remove** local optimistic deduction of Energy (`res.energy.current - 1`), keeping only the `newHarvested` deduction.
  - **Remove** Energy requirements (`res.energy.current < 1`).
  - **Update Toast UI**: Change the hardcoded success toast from `"✨ Spawned X items! (-1⚡)"` to dynamically reflect the crop spent: `"✨ Spawned X items! (-1 🍓)"` (using the appropriate `ITEM_LOOKUP` emoji if available).

## User Review Required
> [!WARNING]
> By shifting from Energy to Berries exclusively, players will burn their farm inventory to play the Merge game. Conversely, this will give Energy less utility. Make sure this is the intended economic balance. 

## Verification Plan
1. Send a `/api/merge/tap` request using a `tomato` (mid-tier).
2. Validate that exactly 1 `tomato` is deducted via database inspection.
3. Validate that 3 to 4 items are spawned on the board simultaneously.
4. Verify the client-side `GameStore.resources.harvested` correctly persists and syncs non-used crops, solving the deletion bug.
