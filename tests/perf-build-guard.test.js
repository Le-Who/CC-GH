import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_BUILD_BUDGETS,
  analyzeDist,
  runBuildPerfGuard,
} from "../scripts/perf-build-guard.mjs";

async function writeFile(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

describe("build perf guard", () => {
  it("reports initial, async Pixi, game chunk, and CSS budget categories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cc-gh-perf-build-"));
    await writeFile(
      root,
      "index.html",
      [
        '<script type="module" src="/assets/index-app.js"></script>',
        '<link rel="modulepreload" href="/assets/react-vendor.js">',
        '<link rel="stylesheet" href="/assets/index.css">',
      ].join("\n"),
    );
    await writeFile(root, "assets/index-app.js", "console.log('app');");
    await writeFile(root, "assets/react-vendor.js", "console.log('react');");
    await writeFile(root, "assets/LazyPixiSceneHost-test.js", "console.log('pixi');");
    await writeFile(root, "assets/MergeGame-test.js", "console.log('merge');");
    await writeFile(root, "assets/index.css", "body{margin:0}");

    const report = await analyzeDist({
      distDir: root,
      budgets: {
        initialScriptRawBytes: 20_000,
        initialScriptGzipBytes: 20_000,
        initialCssRawBytes: 20_000,
        initialCssGzipBytes: 20_000,
        asyncPixiRawBytes: 20_000,
        maxGameChunkRawBytes: 20_000,
      },
    });

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.passed, true);
    assert.equal(report.metrics.initialScripts.count, 2);
    assert.equal(report.metrics.asyncPixiChunks.count, 1);
    assert.equal(report.metrics.gameChunks.count, 1);
    assert.equal(report.metrics.initialCss.count, 1);
  });

  it("fails when Pixi chunks are preloaded into startup HTML", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cc-gh-perf-build-"));
    await writeFile(
      root,
      "index.html",
      [
        '<script type="module" src="/assets/index-app.js"></script>',
        '<link rel="modulepreload" href="/assets/LazyPixiSceneHost-test.js">',
      ].join("\n"),
    );
    await writeFile(root, "assets/index-app.js", "console.log('app');");
    await writeFile(root, "assets/LazyPixiSceneHost-test.js", "console.log('pixi');");

    const report = await runBuildPerfGuard({
      distDir: root,
      writeReport: false,
      quiet: true,
      budgets: DEFAULT_BUILD_BUDGETS,
    });

    assert.equal(report.passed, false);
    assert.ok(report.failures.some((failure) => failure.id === "startup.no-pixi-preload"));
  });
});
