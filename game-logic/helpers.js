/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Shared Helpers
 *  Pure utility functions used across game domains.
 * ═══════════════════════════════════════════════════
 */

/* ═══════════════════════════════════════════════════
 *  DEV-MODE TIME SCALER
 *  Divides all timers by 1000x when window.__DEV_MODE__ is set.
 *  Usage (browser console): window.__DEV_MODE__ = true;
 * ═══════════════════════════════════════════════════ */
export function getScaledTime(ms) {
  const scale =
    typeof globalThis !== "undefined" && globalThis.__DEV_MODE__ ? 1000 : 1;
  return Math.max(1, Math.floor(ms / scale));
}

/** Dev cheat: instantly mature all planted crops */
export function forceGrowAll(plots, now = Date.now()) {
  if (!plots) return;
  for (const plot of plots) {
    if (plot.crop && plot.plantedAt) {
      plot.plantedAt = now - 999_999_999; // Guarantee 100% growth
    }
  }
}

/** Random integer in [min, max] inclusive */
export function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Pick random element from array */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
