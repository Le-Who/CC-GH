import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  assetUrl,
  resolveAssetUrl,
  runtimeAssetSrc,
} from "../src/game-runtime/assetBundles.js";

describe("runtime asset URL resolution", () => {
  const previousBuildId = globalThis.__APP_BUILD_ID__;
  const previousAssetBaseUrl = globalThis.__ASSET_BASE_URL__;

  beforeEach(() => {
    globalThis.__APP_BUILD_ID__ = "build-a";
    globalThis.__ASSET_BASE_URL__ = "";
  });

  afterEach(() => {
    globalThis.__APP_BUILD_ID__ = previousBuildId;
    globalThis.__ASSET_BASE_URL__ = previousAssetBaseUrl;
  });

  it("keeps build id cache busting on legacy /games assets only", () => {
    assert.equal(assetUrl("/games/bubbo-bubbo/assets_bubbo_balls.png"), "/games/bubbo-bubbo/assets_bubbo_balls.png?v=build-a");
    assert.equal(assetUrl("/assets-runtime/bubbo/assets_bubbo_balls.1234abcd.webp"), "/assets-runtime/bubbo/assets_bubbo_balls.1234abcd.webp");
  });

  it("uses generated content-hashed assets before legacy fallbacks", () => {
    const runtimeManifest = {
      assets: {
        "bubbo.balls.sheet": {
          type: "image",
          src: "/assets-runtime/bubbo/assets_bubbo_balls.1234abcd.webp",
          fallback: "/assets-runtime/bubbo/assets_bubbo_balls.5678abcd.png",
        },
      },
    };

    assert.equal(
      runtimeAssetSrc(runtimeManifest, "bubbo.balls.sheet"),
      "/assets-runtime/bubbo/assets_bubbo_balls.1234abcd.webp",
    );
    assert.equal(
      resolveAssetUrl("bubbo.balls.sheet", {
        runtimeManifest,
        legacyPath: "/games/bubbo-bubbo/assets_bubbo_balls.png",
      }),
      "/assets-runtime/bubbo/assets_bubbo_balls.1234abcd.webp",
    );
    assert.equal(
      resolveAssetUrl("bubbo.asset.missing", {
        runtimeManifest,
        legacyPath: "/games/bubbo-bubbo/assets_bubbo_balls.png",
      }),
      "/games/bubbo-bubbo/assets_bubbo_balls.png?v=build-a",
    );
    assert.equal(
      resolveAssetUrl("gachaMerge.items.thread", {
        runtimeManifest,
        legacyPath: "",
      }),
      "",
    );
  });

  it("keeps final-state Blox and Farm asset keys on generated runtime paths with legacy fallbacks", () => {
    const runtimeManifest = {
      assets: {
        "blox.cell_empty": {
          type: "image",
          src: "/assets-runtime/blox/cell_empty.1234abcd.webp",
          fallback: "/assets-runtime/blox/cell_empty.5678abcd.png",
        },
        "farm.crops.strawberry_ready": {
          type: "image",
          src: "/assets-runtime/farm/crops/strawberry_ready.1234abcd.webp",
          fallback: "/assets-runtime/farm/crops/strawberry_ready.5678abcd.png",
        },
      },
    };

    assert.equal(
      resolveAssetUrl("blox.cell_empty", { runtimeManifest }),
      "/assets-runtime/blox/cell_empty.1234abcd.webp",
    );
    assert.equal(
      resolveAssetUrl("farm.crops.strawberry_ready", { runtimeManifest }),
      "/assets-runtime/farm/crops/strawberry_ready.1234abcd.webp",
    );
    assert.equal(
      resolveAssetUrl("blox.fx.row_wipe", { runtimeManifest }),
      "/games/blox/fx/row_wipe.png?v=build-a",
    );
    assert.equal(
      resolveAssetUrl("farm.plot-empty", { runtimeManifest }),
      "/games/farm/plot-empty.png?v=build-a",
    );
  });

  it("resolves compact generated runtime manifest entries", () => {
    const runtimeManifest = {
      dirs: ["blox", "farm/crops"],
      assets: {
        "blox.cell_empty": [0, "1234abcd"],
        "farm.crops.strawberry_ready": [1, "1234abcd"],
      },
    };

    assert.equal(
      runtimeAssetSrc(runtimeManifest, "blox.cell_empty"),
      "/assets-runtime/blox/cell_empty.1234abcd.webp",
    );
    assert.equal(
      resolveAssetUrl("farm.crops.strawberry_ready", { runtimeManifest }),
      "/assets-runtime/farm/crops/strawberry_ready.1234abcd.webp",
    );
    assert.equal(
      resolveAssetUrl("farm.plot-empty", { runtimeManifest }),
      "/games/farm/plot-empty.png?v=build-a",
    );
  });

  it("applies the optional asset base URL to generated runtime assets", () => {
    globalThis.__ASSET_BASE_URL__ = "https://assets.example.test";

    assert.equal(
      assetUrl("/assets-runtime/bubbo/assets_bubbo_balls.1234abcd.webp"),
      "https://assets.example.test/assets-runtime/bubbo/assets_bubbo_balls.1234abcd.webp",
    );
    assert.equal(
      assetUrl("/games/bubbo-bubbo/assets_bubbo_balls.png"),
      "/games/bubbo-bubbo/assets_bubbo_balls.png?v=build-a",
    );
  });
});


describe("dock runtime preload policy", () => {
  it("warms Pixi only for current Pixi presentations", async () => {
    const chunks = await fs.readFile(new URL("../src/app/gameChunks.jsx", import.meta.url), "utf8");
    const declaration = chunks.match(/export const PIXI_TABS = new Set\((\[[^;]+\])\);/);
    assert.ok(declaration, "the dock preload set must be explicit");
    assert.deepEqual(JSON.parse(declaration[1]), ["blox", "match3"]);
    assert.match(chunks, /gameLoaders\[tabId\]\?\.\(\)/, "all games retain their own chunk preload");
    assert.match(chunks, /if \(PIXI_TABS.has\(tabId\)\) preloadPixiSceneHost\(tabId\)/);
  });

  it("keeps the legacy Merge renderer available on demand", async () => {
    const legacy = await fs.readFile(new URL("../src/games/merge/LegacyMergeGame.jsx", import.meta.url), "utf8");
    const hosts = await fs.readFile(new URL("../src/game-runtime/LazyPixiSceneHost.jsx", import.meta.url), "utf8");
    assert.match(legacy, /<PixiScene sceneKey="merge"/);
    assert.match(hosts, /merge: \(\) => Promise.all/);
    assert.match(hosts, /import\(".\/scenes\/mergeScene.js"\)/);
  });
});
