import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";
import { VISIBLE_GAME_IDS } from "../src/app/gameRegistry.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "assets-source", "imagegen", "hud-redesign", "hud-redesign-manifest.json");

async function loadManifest() {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

function workspacePath(relativePath) {
  return path.join(root, relativePath);
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function colorDistance(pixel, key) {
  return Math.sqrt(
    ((pixel[0] - key[0]) ** 2) +
    ((pixel[1] - key[1]) ** 2) +
    ((pixel[2] - key[2]) ** 2),
  );
}

async function assertRuntimeHasNoChromaSpill(relativePath, chromaKey, label) {
  const key = hexToRgb(chromaKey);
  const assetPath = workspacePath(relativePath);
  assert.ok(existsSync(assetPath), `${label} runtime asset is missing`);
  const { data, info } = await sharp(assetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offenders = [];
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha <= 2) continue;
    const distance = colorDistance([data[index], data[index + 1], data[index + 2]], key);
    if (distance <= 80) {
      offenders.push({
        x: (index / 4) % info.width,
        y: Math.floor((index / 4) / info.width),
        rgba: [data[index], data[index + 1], data[index + 2], alpha],
        distance: Math.round(distance),
      });
      if (offenders.length >= 6) break;
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `${label} runtime asset must not retain semi-transparent chromakey spill: ${JSON.stringify(offenders)}`,
  );
}

test("HUD redesign reference pack covers every visible game", async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.version, 1);
  assert.equal(manifest.generatedBy, "scripts/generate-hud-redesign-pack.mjs");
  assert.equal(manifest.assetProduction?.source, "imagegen-source-art-data-free");
  assert.match(
    manifest.assetProduction?.rule || "",
    /not crops from screenshot references/,
    "asset production policy must forbid screenshot-crop assets",
  );
  assert.match(
    manifest.assetProduction?.rule || "",
    /one source file per asset/,
    "asset production policy must require individual source files",
  );
  assert.match(
    manifest.assetProduction?.rule || "",
    /not programmatic SVG\/vector\/placeholder drawings/,
    "asset production policy must forbid SVG-like placeholder production art",
  );

  for (const gameId of VISIBLE_GAME_IDS) {
    const game = manifest.games[gameId];
    assert.ok(game, `${gameId} is missing from the HUD redesign manifest`);
    assert.ok(game.metrics.length >= 4, `${gameId} must list gameplay-aware HUD metrics`);
    assert.ok(game.layout.regions.length >= 4, `${gameId} must define a complete HUD layout`);

    const referencePath = workspacePath(game.reference.path);
    assert.ok(existsSync(referencePath), `${gameId} reference image is missing`);
    const referenceMeta = await sharp(referencePath).metadata();
    assert.ok(referenceMeta.width >= 800, `${gameId} reference must be a production-resolution mobile screenshot`);
    assert.ok(referenceMeta.height > referenceMeta.width, `${gameId} reference must be portrait`);
  }

  assert.ok(manifest.references.aiReferenceBoard, "AI-generated reference board must be kept");
  assert.equal(manifest.references.layoutReferenceBoard, undefined, "SVG layout wireframes must not be treated as production references");
});

test("HUD redesign chromakey assets are separate files with clean removable keys", async () => {
  const manifest = await loadManifest();

  for (const gameId of VISIBLE_GAME_IDS) {
    const game = manifest.games[gameId];
    assert.ok(game.assets.length >= 5, `${gameId} must have separate chromakey UI assets`);

    for (const asset of game.assets) {
      assert.equal(asset.source, "imagegen-source-art-data-free", `${gameId}.${asset.id} must come from imagegen source art`);
      assert.equal(asset.dataFree, true, `${gameId}.${asset.id} must be marked data-free`);
      assert.ok(asset.sourcePath, `${gameId}.${asset.id} must retain its standalone imagegen source path`);
      assert.ok(!asset.sourceSheet, `${gameId}.${asset.id} must not use an atlas/sheet source`);
      assert.ok(existsSync(workspacePath(asset.sourcePath)), `${gameId}.${asset.id} source asset is missing`);
      const assetPath = workspacePath(asset.path);
      assert.ok(existsSync(assetPath), `${gameId}.${asset.id} chromakey asset is missing`);
      const key = hexToRgb(asset.chromaKey);
      const { data, info } = await sharp(assetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.channels, 4, `${gameId}.${asset.id} must be RGBA`);

      const cornerIndexes = [
        0,
        (info.width - 1) * 4,
        (info.width * (info.height - 1)) * 4,
        ((info.width * info.height) - 1) * 4,
      ];
      for (const index of cornerIndexes) {
        assert.deepEqual(
          [data[index], data[index + 1], data[index + 2]],
          key,
          `${gameId}.${asset.id} must keep a flat chromakey background in every corner`,
        );
      }

      let nonKeyPixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        const isKey = data[index] === key[0] && data[index + 1] === key[1] && data[index + 2] === key[2];
        if (!isKey && data[index + 3] > 0) nonKeyPixels += 1;
      }
      assert.ok(nonKeyPixels > 128, `${gameId}.${asset.id} must contain visible asset pixels apart from the key`);

      const runtimePath = workspacePath(asset.runtimePath);
      assert.ok(existsSync(runtimePath), `${gameId}.${asset.id} runtime asset is missing`);
      const { data: runtimeData } = await sharp(runtimePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let index = 0; index < runtimeData.length; index += 4) {
        const isLeakedKey = runtimeData[index] === key[0] && runtimeData[index + 1] === key[1] && runtimeData[index + 2] === key[2] && runtimeData[index + 3] > 16;
        assert.equal(isLeakedKey, false, `${gameId}.${asset.id} runtime asset must not contain opaque chromakey pixels`);
      }
      await assertRuntimeHasNoChromaSpill(asset.runtimePath, asset.chromaKey, `${gameId}.${asset.id}`);
    }
  }
});

test("published HUD menu surfaces are free of chromakey spill", async () => {
  const manifest = await loadManifest();
  const keyBySource = new Map();
  for (const [gameId, game] of Object.entries(manifest.games)) {
    const key = game.assets?.[0]?.chromaKey;
    if (key) keyBySource.set(gameId, key);
  }
  keyBySource.set("hub", "#ff00ff");
  keyBySource.set("farmLegacy", "#ff00ff");

  const surfaceManifests = [
    "public/games/ui-surfaces/screen-surface-extract-manifest.json",
    "public/games/ui-surfaces/portrait-panel-extract-manifest.json",
  ];
  for (const manifestFile of surfaceManifests) {
    const surfaceManifest = JSON.parse(await readFile(workspacePath(manifestFile), "utf8"));
    for (const output of surfaceManifest.outputs || []) {
      const sourceId = output.sourcePath.match(/asset-sources\/([^/]+)\//)?.[1];
      const key = keyBySource.get(sourceId);
      assert.ok(key, `${output.file} must map to a known chromakey source`);
      await assertRuntimeHasNoChromaSpill(`public/games/ui-surfaces/${output.file}`, key, output.file);
    }
  }
});

test("HUD redesign pack exposes semantic compact HUD icons for visible games", async () => {
  const manifest = await loadManifest();
  const requiredIcons = {
    garden: ["stat-gold", "stat-level-xp", "stat-quest"],
    blox: ["stat-score", "stat-lines", "stat-reward", "action-pause"],
    match3: ["stat-score", "stat-moves", "stat-combo", "stat-reward", "action-mix", "action-pause"],
    merge: ["stat-essence", "stat-free-taps", "stat-fuel"],
    bubbo: ["stat-score", "stat-shots", "stat-pressure", "stat-reward", "action-swap", "action-pause"],
    trivia: ["stat-score", "stat-streak", "stat-time", "action-fifty", "action-reveal"],
    room: ["dock-food", "dock-goodies", "dock-shop", "dock-petbook", "dock-album", "dock-gifts", "action-daily", "action-close"],
    settlement: ["stat-gold", "stat-food", "stat-wood", "stat-stone"],
  };

  for (const [gameId, iconIds] of Object.entries(requiredIcons)) {
    const icons = manifest.games[gameId]?.semanticIcons || [];
    const byId = new Map(icons.map((icon) => [icon.id, icon]));
    for (const iconId of iconIds) {
      const icon = byId.get(iconId);
      assert.ok(icon, `${gameId}.${iconId} semantic icon is missing`);
      assert.equal(icon.source, "production-source-art-data-free", `${gameId}.${iconId} must use production source art`);
      assert.equal(icon.dataFree, true, `${gameId}.${iconId} must be data-free`);
      assert.ok(icon.runtimePath, `${gameId}.${iconId} must expose a runtime path`);
      assert.ok(existsSync(workspacePath(icon.runtimePath)), `${gameId}.${iconId} runtime asset is missing`);
    }
  }
});

test("HUD redesign generator does not crop runtime assets from reference screenshots", async () => {
  const generatorSource = await readFile(path.join(root, "scripts", "generate-hud-redesign-pack.mjs"), "utf8");
  assert.equal(generatorSource.includes("writeReferenceCutout"), false);
  assert.equal(generatorSource.includes("REFERENCE_CUTS"), false);
  assert.equal(generatorSource.includes("GAME_REFERENCE_CUT_OVERRIDES"), false);
  assert.equal(generatorSource.includes("ASSET_SHEET_COLUMNS"), false);
  assert.equal(generatorSource.includes("groupVisibleComponents"), false);
  assert.equal(generatorSource.includes("assetSheetPathFor"), false);
  assert.equal(generatorSource.includes("assetBody("), false);
  assert.equal(generatorSource.includes("renderCleanAsset"), false);
  assert.equal(generatorSource.includes("svgRoot("), false);
});
