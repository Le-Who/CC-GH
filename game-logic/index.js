/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Core Game Logic (Barrel Re-export)
 *  All domain modules consolidated into a single import surface.
 *  
 *  Individual modules can also be imported directly:
 *    import { ECONOMY } from './economy.js';
 *    import { CROPS } from './crops.js';
 * ═══════════════════════════════════════════════════
 */

export * from "./helpers.js";
export * from "./economy.js";
export * from "./crops.js";
export * from "./merge-config.js";
export * from "./pet-assets.js";
export * from "./meta.js";
export * from "./player.js";
export * from "./farm.js";
export * from "./merge-board-utils.js";
