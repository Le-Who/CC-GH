import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { buildAssetRuntimeManifest } from "../scripts/assets-pipeline.mjs";
import { loadAssetPipelineEntries } from "../scripts/assets-pipeline.config.mjs";

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

describe("asset runtime pipeline", () => {
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
    assert.match(item.src, /^\/assets-runtime\/test\/pixel\.[a-f0-9]{8}\.webp$/);
    assert.equal(item.fallback, undefined);
  });

  it("keeps non-Pixi runtime images WebP-only while Pixi assets retain PNG fallback", async () => {
    const root = await makeTempRoot();
    await writePixelPng(path.join(root, "public/games/bubbo-bubbo/images/bubble-blue.png"));
    await writePixelPng(path.join(root, "public/games/garden-shelf/assets_shelf.png"));
    await writePixelPng(path.join(root, "public/icons/icon-192.png"));

    const formatsByKey = new Map((await loadAssetPipelineEntries(root)).map((entry) => [entry.key, entry.formats]));

    assert.deepEqual(formatsByKey.get("bubbo.bubble.blue"), ["webp", "png"]);
    assert.deepEqual(formatsByKey.get("gardenShelf.shelf"), ["webp"]);
    assert.deepEqual(formatsByKey.get("icons.icon192"), ["webp"]);
  });

  it("maps Alchemy Table runtime art into the Merge Pixi bundle", async () => {
    const root = await makeTempRoot();
    await writePixelPng(path.join(root, "public/games/gacha-merge/backgrounds/table.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/libraryRail.png"));
    await writePixelPng(path.join(root, "public/games/gacha-merge/ui/actionDock.png"));
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
    assert.equal(entriesByKey.get("gachaMerge.ui.actionDock")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.boardFrame")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.cellEmpty")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.cellOccupied")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.cellSelected")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.ui.cellTarget")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.fx.essenceOrb")?.bundle, "pixi.merge");
    assert.equal(entriesByKey.get("gachaMerge.items.seed")?.bundle, "pixi.merge");
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
