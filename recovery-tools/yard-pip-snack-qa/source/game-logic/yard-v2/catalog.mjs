// Catalog and playzones bind to this release, never a copied historical baseline.
export * from '../yard-catalog.js';
export * from '../yard-playzones.js';
export const INVENTORY_ONLY_GOODS = Object.freeze(['alchemy_living_arbor', 'alchemy_echo_chimes']);
export const PLACEMENT_LIMITS = Object.freeze({ 1: 8, 2: 14 }); // baseline yard.js MAX_PLACEMENTS_BY_EXPANSION
export const BASELINE_SHA = '6fc20cf7f76d6087ca192d8a0d6189639d456c5f';
