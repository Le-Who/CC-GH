// Exact legacy catalog is an immutable imported input, not a rewritten fixture.
export * from '../../design/yard-v2/baseline-47519/game-logic/yard-catalog.js';
export * from '../../design/yard-v2/baseline-47519/game-logic/yard-playzones.js';
export const INVENTORY_ONLY_GOODS = Object.freeze(['alchemy_living_arbor', 'alchemy_echo_chimes']);
export const PLACEMENT_LIMITS = Object.freeze({ 1: 8, 2: 14 }); // baseline yard.js MAX_PLACEMENTS_BY_EXPANSION
export const BASELINE_SHA = '47519ad79796f4b3dfefd2a5f1bfb73cb08a6e86';
