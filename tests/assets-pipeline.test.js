import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { buildAssetRuntimeManifest } from "../scripts/assets-pipeline.mjs";
import { loadAssetPipelineEntries } from "../scripts/assets-pipeline.config.mjs";
import {
  GARDEN_PHASE_COUNT,
  GARDEN_PLANT_COUNT,
  getGardenSpriteFrame,
} from "../src/games/garden-shelf/lib/sprites.ts";

async function writePixelPng(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    }).png().toBuffer(),
  );
}

async function makeTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ccgh-assets-"));
  await fs.mkdir(path.join(root, "source", "icons"), { recursive: true });
  await writePixelPng(path.join(root, "source", "pixel.png"));
  await fs.writeFile(
    path.join(root, "source", "icons", "badge.svg"),
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Badge</title><path id="mark" d="M2 2h20v20H2z"/></svg>',
  );
  return root;
}

async function alphaBbox(imagePath) {
  const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width: 0, height: 0, right: info.width, bottom: info.height, canvasWidth: info.width, canvasHeight: info.height };
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    right: info.width - maxX - 1,
    bottom: info.height - maxY - 1,
    canvasWidth: info.width,
    canvasHeight: info.height,
  };
}

async function alphaComponents(imagePath, threshold = 16) {
  const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const seen = new Uint8Array(info.width * info.height);
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  const components = [];

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const startIndex = y * info.width + x;
      if (seen[startIndex]) continue;
      seen[startIndex] = 1;
      if (alphaAt(x, y) <= threshold) continue;

      const stack = [[x, y]];
      let count = 0;
      let minX = x;
      let maxX = x;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        count += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
          const index = ny * info.width + nx;
          if (seen[index]) continue;
          seen[index] = 1;
          if (alphaAt(nx, ny) > threshold) stack.push([nx, ny]);
        }
      }
      components.push({ count, minX, maxX });
    }
  }

  return components.sort((a, b) => b.count - a.count);
}

async function chromakeySpillSamples(imagePath) {
  const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const samples = [];

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      if (a <= 2) continue;

      const magentaLike = r >= 120 && b >= 120 && g <= 95 && Math.abs(r - b) <= 105 && r - g >= 72 && b - g >= 72;
      const fragileEdge = a < 220 || x < 3 || y < 3 || x >= info.width - 3 || y >= info.height - 3;
      if (magentaLike && fragileEdge) {
        samples.push({ x, y, rgba: [r, g, b, a] });
        if (samples.length >= 8) return samples;
      }
    }
  }

  return samples;
}

describe("asset runtime pipeline", () => {
  it("keeps Garden Shelf plant sprite frames wide enough for overhanging art", async () => {
    const sheetPath = path.resolve("public/games/garden-shelf/assets_transparent.png");
    const { data, info } = await sharp(sheetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x, y) => {
      if (x < 0 || y < 0 || x >= info.width || y >= info.height) return 0;
      return data[(y * info.width + x) * 4 + 3];
    };
    const countOutsideAlpha = (sprite, side) => {
      let count = 0;
      if (side === "left" || side === "right") {
        const x = side === "left" ? sprite.x - 1 : sprite.x + sprite.width;
        for (let y = sprite.y; y < sprite.y + sprite.height; y += 1) {
          if (alphaAt(x, y) > 16) count += 1;
        }
        return count;
      }
      const y = sprite.y - 1;
      for (let x = sprite.x; x < sprite.x + sprite.width; x += 1) {
        if (alphaAt(x, y) > 16) count += 1;
      }
      return count;
    };

    for (let spriteIndex = 0; spriteIndex < GARDEN_PLANT_COUNT; spriteIndex += 1) {
      for (let phase = 0; phase < GARDEN_PHASE_COUNT; phase += 1) {
        const sprite = getGardenSpriteFrame(spriteIndex, phase);
        assert.equal(countOutsideAlpha(sprite, "left"), 0, `plant ${spriteIndex} phase ${phase} clips on the left edge`);
        assert.equal(countOutsideAlpha(sprite, "right"), 0, `plant ${spriteIndex} phase ${phase} clips on the right edge`);
        assert.equal(countOutsideAlpha(sprite, "top"), 0, `plant ${spriteIndex} phase ${phase} clips on the top edge`);
      }
    }
  });

  it("keeps the Cozy Yard HUD atlas alpha-cropped without edge fragments", async () => {
    const atlasPath = path.resolve("public/games/companion-yard/HUD.png");
    const { data, info } = await sharp(atlasPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cols = 5;
    const rows = 5;

    assert.equal(info.width % cols, 0, "HUD atlas width should divide evenly into the declared grid");
    assert.equal(info.height % rows, 0, "HUD atlas height should divide evenly into the declared grid");

    const cellW = info.width / cols;
    const cellH = info.height / rows;
    const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x0 = col * cellW;
        const y0 = row * cellH;
        const seen = new Uint8Array(cellW * cellH);
        const components = [];

        for (let y = 0; y < cellH; y += 1) {
          for (let x = 0; x < cellW; x += 1) {
            const startIndex = y * cellW + x;
            if (seen[startIndex]) continue;
            seen[startIndex] = 1;
            if (alphaAt(x0 + x, y0 + y) <= 16) continue;

            const stack = [[x, y]];
            let count = 0;
            while (stack.length) {
              const [cx, cy] = stack.pop();
              count += 1;
              for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= cellW || ny >= cellH) continue;
                const index = ny * cellW + nx;
                if (seen[index]) continue;
                seen[index] = 1;
                if (alphaAt(x0 + nx, y0 + ny) > 16) stack.push([nx, ny]);
              }
            }
            components.push(count);
          }
        }

        assert.equal(
          components.filter((count) => count > 32).length,
          1,
          `HUD cell ${row}:${col} should contain one alpha component after mask-based slicing`,
        );
      }
    }
  });

  it("keeps Garden Shelf button art free of semi-transparent chromakey fringe", async () => {
    for (const fileName of ["button_primary.png", "button_secondary.png", "button_danger.png"]) {
      const imagePath = path.resolve("public/games/garden-shelf", fileName);
      const samples = await chromakeySpillSamples(imagePath);
      const components = await alphaComponents(imagePath);
      assert.deepEqual(
        samples,
        [],
        `${fileName} should not retain semi-transparent magenta/chromakey edge pixels`,
      );
      assert.equal(
        components.filter((component) => component.count > 32).length,
        1,
        `${fileName} should export one button object without neighboring sheet fragments`,
      );
    }
  });

  it("keeps Gem Crush tokens centered and menu/board panels expanded inside their canvases", async () => {
    for (const token of ["dragon", "frog", "newt", "snake", "spider", "yeti"]) {
      const piecePath = path.resolve(`public/games/puzzling-potions/images/piece-${token}.png`);
      const box = await alphaBbox(piecePath);
      const components = await alphaComponents(piecePath);
      assert.ok(box.x >= 8, `${token} should have left transparent padding`);
      assert.ok(box.right >= 8, `${token} should have right transparent padding`);
      assert.ok(box.y >= 8, `${token} should have top transparent padding`);
      assert.ok(box.bottom >= 8, `${token} should have bottom transparent padding`);
      assert.ok(Math.abs(box.x - box.right) <= 8, `${token} alpha should be horizontally centered`);
      assert.equal(components.filter(({ count }) => count > 32).length, 1, `${token} should not include a neighboring token fragment`);
    }

    const board = await alphaBbox(path.resolve("public/games/puzzling-potions/images/board-frame.png"));
    assert.ok(board.x <= 24, "board frame should be wider than the old cropped source");
    assert.ok(board.y <= 24, "board frame should be taller than the old cropped source");
    assert.ok(board.right <= 24, "board frame should fill the right side of the canvas");
    assert.ok(board.bottom <= 24, "board frame should fill the bottom of the canvas");

    const menu = await alphaBbox(path.resolve("public/games/puzzling-potions/images/menu-panel.png"));
    assert.ok(menu.x <= 32, "pause/menu panel should be wider than the old cropped source");
    assert.ok(menu.y <= 32, "pause/menu panel should be taller than the old cropped source");
    assert.ok(menu.right <= 32, "pause/menu panel should fill the right side of the canvas");
    assert.ok(menu.bottom <= 32, "pause/menu panel should fill the bottom of the canvas");
  });

  it("generates deterministic content-hashed raster assets and bundles", async () => {
    const root = await makeTempRoot();
    const entries = [
      {
        key: "test.pixel",
        source: "source/pixel.png",
        outputDir: "test",
        bundle: "pixi.test",
        formats: ["webp", "png"],
      },
    ];

    const first = await buildAssetRuntimeManifest({
      rootDir: root,
      outputRoot: "public/assets-runtime",
      entries,
      clean: true,
    });
    const second = await buildAssetRuntimeManifest({
      rootDir: root,
      outputRoot: "public/assets-runtime",
      entries,
      clean: true,
    });

    assert.deepEqual(second.manifest, first.manifest);
    assert.match(first.manifest.assets["test.pixel"].src, /^\/assets-runtime\/test\/pixel\.[a-f0-9]{8}\.webp$/);
    assert.match(first.manifest.assets["test.pixel"].fallback, /^\/assets-runtime\/test\/pixel\.[a-f0-9]{8}\.png$/);
    assert.equal(first.manifest.assets["test.pixel"].width, 1);
    assert.equal(first.manifest.assets["test.pixel"].height, 1);
    assert.deepEqual(first.manifest.bundles["pixi.test"], ["test.pixel"]);

    const runtimeManifest = JSON.parse(await fs.readFile(first.manifestPath, "utf-8"));
    assert.deepEqual(runtimeManifest.dirs, ["test"]);
    assert.deepEqual(runtimeManifest.assets["test.pixel"].map((source) => [runtimeManifest.dirs[source[0]], source[2] || "webp"]), [
      ["test", "webp"],
      ["test", "png"],
    ]);
    assert.deepEqual(runtimeManifest.bundles, {});
  });

  it("optimizes SVG assets without removing viewBox", async () => {
    const root = await makeTempRoot();
    const result = await buildAssetRuntimeManifest({
      rootDir: root,
      outputRoot: "public/assets-runtime",
      entries: [
        {
          key: "test.badge",
          source: "source/icons/badge.svg",
          outputDir: "icons",
          formats: ["svg"],
        },
      ],
      clean: true,
    });

    const svgUrl = result.manifest.assets["test.badge"].src;
    const svgPath = path.join(root, "public", svgUrl.replace(/^\//, ""));
    const svg = await fs.readFile(svgPath, "utf-8");

    assert.match(svgUrl, /^\/assets-runtime\/icons\/badge\.[a-f0-9]{8}\.svg$/);
    assert.match(svg, /viewBox="0 0 24 24"/);
  });

  it("supports WebP-only raster entries without a PNG fallback", async () => {
    const root = await makeTempRoot();
    const result = await buildAssetRuntimeManifest({
      rootDir: root,
      outputRoot: "public/assets-runtime",
      entries: [
        {
          key: "test.pixel.compact",
          source: "source/pixel.png",
          outputDir: "test",
          formats: ["webp"],
          raster: {
            webp: { quality: 90, effort: 6 },
          },
        },
      ],
      clean: true,
    });

    const item = result.manifest.assets["test.pixel.compact"];
    assert.match(item.src, /^\/assets-runtime\/test\/compact\.[a-f0-9]{8}\.webp$/);
    assert.equal(item.fallback, undefined);
  });

  it("keeps a compact Merge Pixi bundle prefix for dynamic runtime art", async () => {
    const root = await makeTempRoot();
    const result = await buildAssetRuntimeManifest({
      rootDir: root,
      outputRoot: "public/assets-runtime",
      entries: [
        {
          key: "gachaMerge.background.table",
          source: "source/pixel.png",
          outputDir: "gacha-merge/backgrounds",
          bundle: "pixi.merge",
          formats: ["webp"],
        },
      ],
      clean: true,
    });

    const runtimeManifest = JSON.parse(await fs.readFile(result.manifestPath, "utf-8"));
    assert.equal(runtimeManifest.bundles["pixi.merge"], "gachaMerge.");
  });

  it("keeps generated runtime images WebP-only and skips unreferenced public art", async () => {
    const root = await makeTempRoot();
    await writePixelPng(path.join(root, "public/games/bubbo-bubbo/assets_bubbo_balls.png"));
    await writePixelPng(path.join(root, "public/games/garden-shelf/assets_shelf.png"));
    await writePixelPng(path.join(root, "public/games/garden-shelf/fx/coin-glint.png"));
    await writePixelPng(path.join(root, "public/games/garden-shelf/fx/gold-sparkle.png"));
    await writePixelPng(path.join(root, "public/games/blox/block_tile_blue.png"));
    await writePixelPng(path.join(root, "public/games/farm/crops/strawberry_ready.png"));
    await writePixelPng(path.join(root, "public/games/trivia/panel-menu.png"));
    await writePixelPng(path.join(root, "public/games/companion-yard/foods/kibble.png"));
    await writePixelPng(path.join(root, "public/games/companion-yard/expressions/happy.png"));
    await writePixelPng(path.join(root, "public/games/companion-yard/HUD.png"));
    await writePixelPng(path.join(root, "public/games/companion-yard/ui/cozy-price-chip.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/actionIconBack.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/hudBar.png"));
    await writePixelPng(path.join(root, "public/icons/icon-192.png"));

    const entriesByKey = new Map((await loadAssetPipelineEntries(root)).map((entry) => [entry.key, entry]));
    const formatsByKey = new Map([...entriesByKey].map(([key, entry]) => [key, entry.formats]));

    assert.deepEqual(formatsByKey.get("bubbo.balls.sheet"), ["webp"]);
    assert.deepEqual(formatsByKey.get("gardenShelf.shelf"), ["webp"]);
    assert.deepEqual(formatsByKey.get("gardenShelf.fx.coin-glint"), ["webp"]);
    assert.equal(formatsByKey.has("gardenShelf.fx.gold-sparkle"), false);
    assert.deepEqual(formatsByKey.get("blox.block_tile_blue"), ["webp"]);
    assert.equal(entriesByKey.get("blox.block_tile_blue")?.bundle, "pixi.blox");
    assert.deepEqual(formatsByKey.get("farm.crops.strawberry_ready"), ["webp"]);
    assert.equal(entriesByKey.get("farm.crops.strawberry_ready")?.bundle, "pixi.farm");
    assert.equal(formatsByKey.has("trivia.panel-menu"), false);
    assert.deepEqual(formatsByKey.get("companionYard.foods.kibble"), ["webp"]);
    assert.deepEqual(formatsByKey.get("companionYard.expressions.happy"), ["webp"]);
    assert.deepEqual(formatsByKey.get("companionYard.ui.hudSheet"), ["webp"]);
    assert.deepEqual(formatsByKey.get("companionYard.ui.cozy-price-chip"), ["webp"]);
    assert.equal(formatsByKey.has("gachaMerge.ui.actionIconBack"), false);
    assert.deepEqual(formatsByKey.get("gachaMerge.ui.hudBar"), ["webp"]);
    assert.equal(formatsByKey.has("icons.icon192"), false);
  });

  it("maps Alchemy Table runtime art into the Merge Pixi bundle", async () => {
    const root = await makeTempRoot();
    await writePixelPng(path.join(root, "public/games/gacha-merge/backgrounds/table.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/libraryRail.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/libraryPanel.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/actionDock.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/hudBar.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/hudIconItems.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/hudIconRecipes.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/hudIconExchange.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/hudIconEssence.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/hudIconMode.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/hudIconPause.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/actionIconGenerate.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/actionIconDaily.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/actionIconTokens.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/actionIconTrash.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/boardFrame.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/cellEmpty.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/cellOccupied.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/cellSelected.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/cellTarget.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/fx/essenceOrb.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/items/seed.png"));

    const entriesByKey = new Map((await loadAssetPipelineEntries(root)).map((assetEntry) => [assetEntry.key, assetEntry]));

    assert.equal(entriesByKey.get("gachaMerge.background.table")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.libraryRail")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.libraryPanel")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.actionDock")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.hudBar")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.hudIconItems")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.hudIconRecipes")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.hudIconExchange")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.hudIconEssence")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.hudIconMode")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.hudIconPause")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.actionIconGenerate")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.actionIconDaily")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.actionIconTokens")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.actionIconTrash")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.boardFrame")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.cellEmpty")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.cellOccupied")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.cellSelected")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.cellTarget")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.fx.essenceOrb")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.items.seed")?.bundle, "pixi.merge");
  });

  it("maps standalone Match-3 board, HUD, drop, and FX art into the Match-3 Pixi bundle", async () => {
    const root = await makeTempRoot();
    const match3Files = [
      "background-table.png",
      "board-frame.png",
      "cell-empty.png",
      "cell-selected.png",
      "hud-bar.png",
      "menu-panel.png",
      "fx-clear-burst.png",
      "drop-gold.png",
      "drop-seeds.png",
      "drop-energy.png",
    ];

    for (const fileName of match3Files) {
      await writePixelPng(path.join(root, "public/games/puzzling-potions/images", fileName));
    }

    const entriesByKey = new Map((await loadAssetPipelineEntries(root)).map((assetEntry) => [assetEntry.key, assetEntry]));

    assert.equal(entriesByKey.get("match3.background.table")?.bundle, "pixi.match3");
    assert.equal(entriesByKey.get("match3.board.frame")?.bundle, "pixi.match3");
    assert.equal(entriesByKey.get("match3.board.cell")?.bundle, "pixi.match3");
    assert.equal(entriesByKey.get("match3.board.cellSelected")?.bundle, "pixi.match3");
    assert.equal(entriesByKey.get("match3.ui.hudBar")?.bundle, "pixi.match3");
    assert.equal(entriesByKey.get("match3.ui.menuPanel")?.bundle, "pixi.match3");
    assert.equal(entriesByKey.get("match3.fx.clearBurst")?.bundle, "pixi.match3");
    assert.equal(entriesByKey.get("match3.drop.gold")?.bundle, "pixi.match3");
    assert.equal(entriesByKey.get("match3.drop.seeds")?.bundle, "pixi.match3");
    assert.equal(entriesByKey.get("match3.drop.energy")?.bundle, "pixi.match3");
  });

  it("reuses unchanged generated raster assets across clean builds", async () => {
    const root = await makeTempRoot();
    const entries = [
      {
        key: "test.pixel.cached",
        source: "source/pixel.png",
        outputDir: "test",
        formats: ["webp"],
        raster: {
          webp: { quality: 90, effort: 1 },
        },
      },
    ];

    const first = await buildAssetRuntimeManifest({
      rootDir: root,
      outputRoot: "public/assets-runtime",
      entries,
      clean: true,
    });
    const outputPath = path.join(root, "public", first.manifest.assets["test.pixel.cached"].src.replace(/^\//, ""));
    const cachedMtime = new Date("2001-01-01T00:00:00.000Z");
    await fs.utimes(outputPath, cachedMtime, cachedMtime);
    const cachedStat = await fs.stat(outputPath);

    const second = await buildAssetRuntimeManifest({
      rootDir: root,
      outputRoot: "public/assets-runtime",
      entries,
      clean: true,
    });
    const secondStat = await fs.stat(outputPath);

    assert.deepEqual(second.manifest, first.manifest);
    assert.equal(secondStat.mtimeMs, cachedStat.mtimeMs);
  });
});
