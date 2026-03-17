/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Core Game Logic (Barrel Re-export)
 *  
 *  This file is a backward-compatibility layer.
 *  All domain logic has been atomized into the 'game-logic/' directory.
 *  Consumer files (routes, tests, vanilla client) should continue importing 
 *  from this file so that no import paths break.
 * ═══════════════════════════════════════════════════════
 */
export * from "./game-logic/index.js";
