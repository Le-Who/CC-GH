import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { ALL_PIXI_ASSETS, MAP_ASSETS } from "../src/games/settlement/assetRegistry.js";

const OBSOLETE_FIELD_ASSETS = [
  "public/games/settlement/map-background-forest-valley.webp",
  "public/games/settlement/map-ground-settlement-base.webp",
  "public/games/settlement/map-field-settlement-playable.webp",
  "public/games/settlement/road-network-village.webp",
  "public/games/settlement/road-network-town.webp",
  "public/games/settlement/road-network-city.webp",
  "public/games/settlement/road-network-capital.webp",
  "public/games/settlement/road-main-isometric.webp",
  "public/games/settlement/road-cross-isometric.webp",
  "public/games/settlement/road-plaza-market.webp",
];

describe("Settlement asset runtime contract", () => {
  it("uses one mockup-aligned playable region instead of stitched background and road layers", () => {
    assert.equal(MAP_ASSETS.region, "/games/settlement/map-region-settlement-playable.webp");
    assert.equal(Object.hasOwn(MAP_ASSETS, "background"), false);
    assert.equal(Object.hasOwn(MAP_ASSETS, "field"), false);
    assert.equal(Object.hasOwn(MAP_ASSETS, "roads"), false);
    assert.ok(ALL_PIXI_ASSETS.includes(MAP_ASSETS.region));
    assert.doesNotMatch(JSON.stringify(ALL_PIXI_ASSETS), /map-background|map-field|road-/);

    for (const file of OBSOLETE_FIELD_ASSETS) {
      assert.equal(existsSync(path.join(process.cwd(), file)), false, `${file} should be removed`);
    }
  });

  it("loads preprocessed textures without client-side canvas chroma key work", () => {
    const source = readFileSync("src/games/settlement/SettlementGame.jsx", "utf8");
    assert.doesNotMatch(source, /loadProcessedTexture|loadProcessedAssetUrl|useProcessedAssetUrl/);
    assert.doesNotMatch(source, /getImageData|toDataURL|willReadFrequently|naturalWidth/);
    assert.match(source, /loadTexture/);
    assert.match(source, /trimmedAsset/);
  });

  it("keeps Settlement runtime assets WebP-only, chroma-clean, and tightly trimmed", () => {
    execFileSync(process.execPath, ["scripts/settlement-assets.mjs", "audit"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
  });
});
