import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Settlement asset runtime contract", () => {
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
