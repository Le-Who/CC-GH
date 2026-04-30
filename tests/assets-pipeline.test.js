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
