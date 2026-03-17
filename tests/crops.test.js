/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Crops Module Tests
 *  Tests for fetching and caching crops metadata.
 *  Run:  node --test tests/crops.test.js
 * ═══════════════════════════════════════════════════════
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("crops.js Module", () => {
  let originalFetch;
  let originalLocalStorage;
  let fetchMock;
  let storageData;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalLocalStorage = global.localStorage;

    fetchMock = null;
    global.fetch = async (...args) => {
      if (fetchMock) return fetchMock(...args);
      return { ok: true, json: async () => ({}) };
    };

    storageData = {};
    global.localStorage = {
      getItem: (key) => storageData[key] || null,
      setItem: (key, val) => { storageData[key] = String(val); },
      removeItem: (key) => { delete storageData[key]; },
      clear: () => { storageData = {}; },
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.localStorage = originalLocalStorage;
  });

  /**
   * Helper to load a fresh instance of the module.
   * Node's ES module cache prevents resetting module-level variables (like `_cache`)
   * between tests, so we append a cache-busting query string.
   */
  async function getFreshModule() {
    const version = Date.now() + Math.random();
    return await import(`../src/vanilla/crops.js?v=${version}`);
  }

  it("setCropsCache and getCropsCache work synchronously", async () => {
    const crops = await getFreshModule();
    assert.equal(crops.getCropsCache(), null, "Cache should be initially null");

    crops.setCropsCache({ myCrop: 1 });
    assert.deepEqual(crops.getCropsCache(), { myCrop: 1 }, "Cache should return the set data");
  });

  it("prefetchCrops fetches and caches data on success", async () => {
    const crops = await getFreshModule();
    const mockData = { strawberry: { name: "Strawberry" } };

    fetchMock = async (url) => {
      assert.equal(url, "/api/content/crops");
      return { ok: true, json: async () => mockData };
    };

    assert.equal(crops.getCropsCache(), null);

    crops.prefetchCrops();
    const data = await crops.getCropsData();

    assert.deepEqual(data, mockData, "Should return fetched data");
    assert.deepEqual(crops.getCropsCache(), mockData, "Cache should be updated");
  });

  it("prefetchCrops resolves to null if fetch response is not ok", async () => {
    const crops = await getFreshModule();

    fetchMock = async () => {
      return { ok: false }; // json() not called
    };

    crops.prefetchCrops();
    const data = await crops.getCropsData();

    assert.equal(data, null, "Should return null on non-ok response");
    assert.equal(crops.getCropsCache(), null, "Cache should remain null");
  });

  it("prefetchCrops falls back to localStorage on fetch network failure", async () => {
    const crops = await getFreshModule();
    const mockData = { fallback: { name: "Fallback" } };

    // Setup valid cached data in localStorage
    storageData["hub_crops_cache"] = JSON.stringify({
      cachedAt: Date.now(),
      data: mockData
    });

    fetchMock = async () => {
      throw new Error("Network error");
    };

    crops.prefetchCrops();
    const data = await crops.getCropsData();

    assert.deepEqual(data, mockData, "Should return fallback data");
    assert.deepEqual(crops.getCropsCache(), mockData, "Cache should be populated from fallback");
  });

  it("getCropsData returns immediately if cache exists", async () => {
    const crops = await getFreshModule();
    const mockData = { direct: 1 };

    crops.setCropsCache(mockData);

    let fetchCalled = false;
    fetchMock = async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({}) };
    };

    const data = await crops.getCropsData();
    assert.deepEqual(data, mockData, "Should return cached data");
    assert.equal(fetchCalled, false, "Fetch should not be called if cache exists");
  });

  it("getCropsData returns in-flight promise if already prefetching", async () => {
    const crops = await getFreshModule();

    let fetchCalls = 0;
    fetchMock = async () => {
      fetchCalls++;
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({ ok: true, json: async () => ({ delay: 1 }) });
        }, 10);
      });
    };

    crops.prefetchCrops();
    assert.equal(fetchCalls, 1);

    const p1 = crops.getCropsData();
    const p2 = crops.getCropsData();

    assert.equal(fetchCalls, 1, "fetch should not be called multiple times");
    // p1 and p2 should both be promises, and await to the same value

    const [res1, res2] = await Promise.all([p1, p2]);
    assert.deepEqual(res1, { delay: 1 });
    assert.deepEqual(res2, { delay: 1 });
  });

  it("getCropsData triggers prefetch if no cache and no promise", async () => {
    const crops = await getFreshModule();

    let fetchCalled = false;
    fetchMock = async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({ fetched: true }) };
    };

    // Before this, neither cache nor promise exists. getCropsData triggers prefetch.
    const data = await crops.getCropsData();
    assert.equal(fetchCalled, true, "Should trigger prefetch");
    assert.deepEqual(data, { fetched: true });
    assert.deepEqual(crops.getCropsCache(), { fetched: true });
  });

  describe("loadCropsFromStorage", () => {
    it("returns null if nothing in storage", async () => {
      const crops = await getFreshModule();
      assert.equal(crops.loadCropsFromStorage(), null);
    });

    it("returns null if invalid JSON", async () => {
      const crops = await getFreshModule();
      storageData["hub_crops_cache"] = "{ invalid json";
      assert.equal(crops.loadCropsFromStorage(), null);
    });

    it("loads legacy format (no cachedAt wrapper)", async () => {
      const crops = await getFreshModule();
      const legacyData = { strawberry: { emoji: "🍓" } };
      storageData["hub_crops_cache"] = JSON.stringify(legacyData);

      const loaded = crops.loadCropsFromStorage();
      assert.deepEqual(loaded, legacyData);
      assert.deepEqual(crops.getCropsCache(), legacyData);
    });

    it("loads valid cached data within TTL", async () => {
      const crops = await getFreshModule();
      const mockData = { tomato: { emoji: "🍅" } };
      storageData["hub_crops_cache"] = JSON.stringify({
        cachedAt: Date.now() - 3600000, // 1 hour ago
        data: mockData
      });

      const loaded = crops.loadCropsFromStorage();
      assert.deepEqual(loaded, mockData);
      assert.deepEqual(crops.getCropsCache(), mockData);
    });

    it("returns null if TTL expired", async () => {
      const crops = await getFreshModule();
      const mockData = { tomato: { emoji: "🍅" } };
      const TTL = 24 * 60 * 60 * 1000;
      storageData["hub_crops_cache"] = JSON.stringify({
        cachedAt: Date.now() - TTL - 1000, // > 24 hours ago
        data: mockData
      });

      const loaded = crops.loadCropsFromStorage();
      assert.equal(loaded, null, "Should return null if expired");
      assert.equal(crops.getCropsCache(), null, "Cache should not be set if expired");
    });
  });
});
