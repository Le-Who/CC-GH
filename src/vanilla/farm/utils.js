/* ═══════════════════════════════════════════════════
 *  Farm Module — Shared Utilities
 *  Pure helpers consumed by all farm sub-modules.
 *  Source of truth for growth calculations, time formatting,
 *  clock delta management, and DOM selectors.
 * ═══════════════════════════════════════════════════ */

// ── Clock Desync Fix (v4.9) ──
// Delta between server clock and client clock (ms). Positive = client is ahead.
let clockDelta = 0;

export function getServerNow() {
  return Date.now() + clockDelta;
}

export function updateClockDelta(serverTime) {
  if (typeof serverTime === "number" && serverTime > 0) {
    clockDelta = serverTime - Date.now();
  }
}

export function getClockDelta() {
  return clockDelta;
}

/** Compute local growth percentage for a plot (clock-corrected) */
export function getLocalGrowth(plot) {
  if (!plot.crop || !plot.plantedAt) return 0;
  const elapsed = getServerNow() - plot.plantedAt;
  const mult = plot.watered ? plot.wateringMultiplier || 0.7 : 1;
  const gt = plot.growthTime || 15000;
  return Math.min(1, elapsed / (gt * mult));
}

/** Format remaining growth time as human-readable string */
export function formatTimeLeft(plot, pct) {
  if (pct >= 1) return "Ready!";
  const mult = plot.watered ? plot.wateringMultiplier || 0.7 : 1;
  const totalMs = (plot.growthTime || 15000) * mult;
  const remainMs = totalMs * (1 - pct);
  const secs = Math.ceil(remainMs / 1000);
  if (secs <= 0) return "Ready!";
  if (secs < 60) return `~${secs}s left`;
  const mins = Math.ceil(secs / 60);
  return `~${mins}m left`;
}

/** Format growth duration (ms) as compact string (e.g. "5m 30s") */
export function formatGrowthTime(ms) {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    let s = `${hours}h`;
    if (mins > 0) s += ` ${mins}m`;
    if (secs > 0) s += ` ${secs}s`;
    return s;
  }
  if (secs > 0) return `${mins}m ${secs}s`;
  return `${mins}m`;
}

/** Shorthand DOM selector by id */
export const $ = (id) => document.getElementById(id);

/* ─── localStorage helpers for seed buy quantities ─── */
const QTY_STORAGE_KEY = "hub_buyQtys";

export function loadBuyQtys() {
  try {
    return JSON.parse(localStorage.getItem(QTY_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveBuyQty(seedId, qty) {
  const qtys = loadBuyQtys();
  qtys[seedId] = qty;
  localStorage.setItem(QTY_STORAGE_KEY, JSON.stringify(qtys));
}

/* ─── Purchase history for Quick Buy recommendations ─── */
const PURCHASE_HISTORY_KEY = "farm_purchase_history";
const PURCHASE_HISTORY_MAX = 50;

export function getPurchaseHistory() {
  try {
    return JSON.parse(localStorage.getItem(PURCHASE_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export function trackPurchase(seedId) {
  const history = getPurchaseHistory();
  history.push({ seedId, ts: Date.now() });
  while (history.length > PURCHASE_HISTORY_MAX) history.shift();
  localStorage.setItem(PURCHASE_HISTORY_KEY, JSON.stringify(history));
}

/** Get top N most-purchased seed IDs. Fallback: cheapest N. */
export function getTopSeeds(crops, unlocked, n = 3) {
  const history = getPurchaseHistory();
  const counts = {};
  for (const { seedId } of history) {
    counts[seedId] = (counts[seedId] || 0) + 1;
  }
  const ranked = Object.entries(counts)
    .filter(
      ([id]) => crops[id] && !id.startsWith("__") && unlocked.includes(id),
    )
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id);

  if (ranked.length >= n) return ranked.slice(0, n);

  const allSeeds = Object.entries(crops)
    .filter(
      ([id, cfg]) =>
        typeof cfg === "object" &&
        cfg !== null &&
        !id.startsWith("__") &&
        unlocked.includes(id),
    )
    .sort(([, a], [, b]) => (a.seedPrice || 0) - (b.seedPrice || 0))
    .map(([id]) => id);
  const merged = [...ranked];
  for (const id of allSeeds) {
    if (merged.length >= n) break;
    if (!merged.includes(id)) merged.push(id);
  }
  return merged.slice(0, n);
}
