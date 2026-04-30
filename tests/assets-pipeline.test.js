import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { buildAssetRuntimeManifest } from "../scripts/assets-pipeline.mjs";

async function makeTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ccgh-assets-"));
  await fs.mkdir(path.join(root, "source", "icons"), { recursive: true });
  await fs.writeFile(
    path.join(root, "source", "pixel.png"),
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    }).png().toBuffer(),
  );
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
});
