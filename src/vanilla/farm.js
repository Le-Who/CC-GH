/* ═══════════════════════════════════════════════════
 *  Game Hub — Farm Module (Re-export Shim)
 *
 *  This file is a backward-compatibility layer.
 *  All farm logic has been atomized into 'src/vanilla/farm/'.
 *
 *  Consumer files (main.js, shared.js) should continue importing
 *  from this file so that no import paths break.
 * ═══════════════════════════════════════════════════ */
export { FarmGame } from "./farm/index.js";
export { FarmGame as FarmGameImpl } from "./farm/index.js";
