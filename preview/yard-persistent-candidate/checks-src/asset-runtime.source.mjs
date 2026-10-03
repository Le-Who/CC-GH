import {readCandidateSource} from '../preview/yard-persistent-candidate/source.mjs';
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  assetUrl,
  resolveAssetUrl,
  runtimeAssetSrc,
  LEGACY_ASSET_PATHS,
  GAME_ASSET_BUNDLES,
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
    assert.equal(assetUrl("/games/puzzling-potions/images/special-row.png"), "/games/puzzling-potions/images/special-row.png?v=build-a");
    assert.equal(assetUrl("/assets-runtime/puzzling-potions/row.1234abcd.webp"), "/assets-runtime/puzzling-potions/row.1234abcd.webp");
  });

  it("uses generated content-hashed assets before legacy fallbacks", () => {
    const runtimeManifest = {
      assets: {
        "match3.special.row": {
          type: "image",
          src: "/assets-runtime/puzzling-potions/row.1234abcd.webp",
          fallback: "/assets-runtime/puzzling-potions/row.5678abcd.png",
        },
      },
    };

    assert.equal(
      runtimeAssetSrc(runtimeManifest, "match3.special.row"),
      "/assets-runtime/puzzling-potions/row.1234abcd.webp",
    );
    assert.equal(
      resolveAssetUrl("match3.special.row", {
        runtimeManifest,
        legacyPath: "/games/puzzling-potions/images/special-row.png",
      }),
      "/assets-runtime/puzzling-potions/row.1234abcd.webp",
    );
    assert.equal(
      resolveAssetUrl("match3.asset.missing", {
        runtimeManifest,
        legacyPath: "/games/puzzling-potions/images/special-row.png",
      }),
      "/games/puzzling-potions/images/special-row.png?v=build-a",
    );
    assert.equal(
      resolveAssetUrl("gachaMerge.items.thread", {
        runtimeManifest,
        legacyPath: "",
      }),
      "",
    );
  });

  it("keeps every active Match3 semantic overlay and Garden plant fallback mapped without retired Blox/Farm keys", () => {
    const overlays = {
      "match3.special.blast": ["blast", "special-blast.png"],
      "match3.special.column": ["column", "special-column.png"],
      "match3.special.colour": ["colour", "special-colour.png"],
      "match3.special.row": ["row", "special-row.png"],
      "match3.fx.clearBurst": ["clearBurst", "fx-clear-burst.png"],
      "match3.drop.gold": ["gold", "drop-gold.png"],
      "match3.drop.seeds": ["seeds", "drop-seeds.png"],
      "match3.drop.energy": ["energy", "drop-energy.png"],
    };
    const runtimeManifest = {
      dirs: ["puzzling-potions", "garden-shelf"],
      assets: {
        ...Object.fromEntries(Object.keys(overlays).map(key => [key, [0, "1234abcd"]])),
        "gardenShelf.sheet.transparent": [1, "1234abcd"],
      },
    };
    assert.deepEqual([...GAME_ASSET_BUNDLES.match3].sort(), Object.keys(overlays).sort());
    for (const [key, [generated, fallback]] of Object.entries(overlays)) {
      assert.equal(resolveAssetUrl(key, { runtimeManifest }), `/assets-runtime/puzzling-potions/${generated}.1234abcd.webp`);
      assert.equal(resolveAssetUrl(key, { runtimeManifest: null }), `/games/puzzling-potions/images/${fallback}?v=build-a`);
      assert.equal(LEGACY_ASSET_PATHS[key], `/games/puzzling-potions/images/${fallback}`);
    }
    assert.equal(resolveAssetUrl("gardenShelf.sheet.transparent", { runtimeManifest }), "/assets-runtime/garden-shelf/transparent.1234abcd.webp");
    assert.equal(resolveAssetUrl("gardenShelf.sheet.transparent", { runtimeManifest: null }), "/games/garden-shelf/assets_transparent.png?v=build-a");
    assert.equal(GAME_ASSET_BUNDLES.blox, undefined);
    assert.equal(GAME_ASSET_BUNDLES.farm, undefined);
    assert.equal(Object.keys(LEGACY_ASSET_PATHS).some(key => /^(?:blox|farm|bubbo)\./.test(key)), false);
  });

  it("resolves compact generated runtime manifest entries", () => {
    const manifest = { dirs: ["puzzling-potions"], assets: { "match3.special.row": [0, "1234abcd"] } };
    assert.equal(runtimeAssetSrc(manifest, "match3.special.row"), "/assets-runtime/puzzling-potions/row.1234abcd.webp");
    assert.equal(resolveAssetUrl("match3.drop.gold", { runtimeManifest: manifest }), "/games/puzzling-potions/images/drop-gold.png?v=build-a");
  });

  it("applies the optional asset base URL to generated runtime assets", () => {
    globalThis.__ASSET_BASE_URL__ = "https://assets.example.test";

    assert.equal(
      assetUrl("/assets-runtime/puzzling-potions/row.1234abcd.webp"),
      "https://assets.example.test/assets-runtime/puzzling-potions/row.1234abcd.webp",
    );
    assert.equal(
      assetUrl("/games/puzzling-potions/images/special-row.png"),
      "/games/puzzling-potions/images/special-row.png?v=build-a",
    );
  });
});


describe("dock runtime preload policy", () => {
  it("warms Pixi only for current Pixi presentations", async () => {
    const chunks = await readCandidateSource(new URL("../src/app/gameChunks.jsx", import.meta.url), "utf8");
    const declaration = chunks.match(/export const PIXI_TABS = new Set\((\[[^;]+\])\);/);
    assert.ok(declaration, "the dock preload set must be explicit");
    assert.deepEqual(JSON.parse(declaration[1]), ["blox", "match3"]);
    assert.match(chunks, /gameLoaders\[tabId\]\?\.\(\)/, "all games retain their own chunk preload");
    assert.match(chunks, /if \(PIXI_TABS.has\(tabId\)\) preloadPixiSceneHost\(tabId\)/);
  });

  it("keeps the legacy Merge renderer available on demand", async () => {
    const legacy = await readCandidateSource(new URL("../src/games/merge/LegacyMergeGame.jsx", import.meta.url), "utf8");
    const hosts = await readCandidateSource(new URL("../src/game-runtime/LazyPixiSceneHost.jsx", import.meta.url), "utf8");
    assert.match(legacy, /<PixiScene sceneKey="merge"/);
    assert.match(hosts, /merge: \(\) => Promise.all/);
    assert.match(hosts, /import\(".\/scenes\/mergeScene.js"\)/);
  });
});
