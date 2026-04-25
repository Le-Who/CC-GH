import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUILD_RELOAD_GUARD_KEY,
  buildCacheBustingUrl,
  markReloadForBuild,
  normalizeBuildId,
  shouldRefreshForBuild,
} from "../src/services/updateManagerCore.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

describe("update manager core", () => {
  it("normalizes and compares build ids before refresh", () => {
    assert.equal(normalizeBuildId("  build-a  "), "build-a");
    assert.equal(shouldRefreshForBuild("build-a", "build-a"), false);
    assert.equal(shouldRefreshForBuild("build-a", "build-b"), true);
    assert.equal(shouldRefreshForBuild("", "build-b"), false);
    assert.equal(shouldRefreshForBuild("build-a", ""), false);
  });

  it("guards repeated reloads for the same latest build", () => {
    const storage = memoryStorage();

    assert.equal(markReloadForBuild(storage, "build-b", 1_000, 60_000), true);
    assert.equal(markReloadForBuild(storage, "build-b", 30_000, 60_000), false);
    assert.equal(markReloadForBuild(storage, "build-b", 62_000, 60_000), true);
  });

  it("recovers when reload guard storage is corrupt", () => {
    const storage = memoryStorage({ [BUILD_RELOAD_GUARD_KEY]: "not json" });

    assert.equal(markReloadForBuild(storage, "build-b", 1_000, 60_000), true);
  });

  it("adds a build cache-busting query without losing hash fragments", () => {
    assert.equal(
      buildCacheBustingUrl("https://example.test/play?tab=bubbo#hud", "sha123"),
      "/play?tab=bubbo&build=sha123#hud",
    );
  });
});
