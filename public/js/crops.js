/* ═══════════════════════════════════════════════════
 *  Game Hub — Crops Data Module (v6.1.1)
 *  Centralizes crop metadata fetching and caching.
 *  Replaces window.__cropsPromise / window.__cropsCache globals.
 * ═══════════════════════════════════════════════════ */

let _cache = null;
let _promise = null;

const STORAGE_KEY = "hub_crops_cache";
const TTL = 24 * 60 * 60 * 1000; // 24h

/** Start fetching crops data (call early, in parallel with auth) */
export function prefetchCrops() {
  _promise = fetch("/api/content/crops")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data) _cache = data;
      return data;
    })
    .catch(() => {
      // Fallback: try localStorage cache with TTL
      return _loadFromStorage();
    });
}

/** Get crops data (sync if already cached, async otherwise) */
export async function getCropsData() {
  if (_cache) return _cache;
  if (_promise) return _promise;
  // Neither cached nor prefetched — fetch now
  prefetchCrops();
  return _promise;
}

/** Get cached crops data synchronously (may be null) */
export function getCropsCache() {
  return _cache;
}

/** Update the crops cache (called by farm.js after fetch) */
export function setCropsCache(data) {
  _cache = data;
}

/** Load from localStorage with TTL check */
function _loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.cachedAt) {
      if (Date.now() - parsed.cachedAt > TTL) return null;
      _cache = parsed.data;
      return parsed.data;
    }
    // Legacy format
    _cache = parsed;
    return parsed;
  } catch (_) {
    return null;
  }
}

/** Pre-populate cache from localStorage (sync, for preventing fallback emojis) */
export function loadCropsFromStorage() {
  return _loadFromStorage();
}
