import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { installRuntimePerfProbe, summarizeRuntimePerf } from "./e2e/helpers/runtimePerfProbe.js";
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

async function writeRuntimeAssets(root) {
  await writeFile(
    root,
    "assets-runtime/manifest.json",
    JSON.stringify({
      version: 1,
      assets: {
        "bubbo.balls.sheet": {
          type: "image",
          src: "/assets-runtime/bubbo/assets_bubbo_balls.1234abcd.webp",
          fallback: "/assets-runtime/bubbo/assets_bubbo_balls.5678abcd.png",
        },
      },
      bundles: {
        "pixi.bubbo": ["bubbo.balls.sheet"],
      },
    }),
  );
  await writeFile(root, "assets-runtime/bubbo/assets_bubbo_balls.1234abcd.webp", "webp");
  await writeFile(root, "assets-runtime/bubbo/assets_bubbo_balls.5678abcd.png", "png");
}

describe("build perf guard", () => {
  it("reports initial, async Pixi, game chunk, CSS, and runtime asset budget categories", async () => {
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
    await writeRuntimeAssets(root);

    const report = await analyzeDist({
      distDir: root,
      budgets: {
        initialScriptRawBytes: 20_000,
        initialScriptGzipBytes: 20_000,
        initialCssRawBytes: 20_000,
        initialCssGzipBytes: 20_000,
        asyncPixiRawBytes: 20_000,
        maxGameChunkRawBytes: 20_000,
        runtimeManifestRawBytes: 20_000,
        runtimeManifestGzipBytes: 20_000,
        runtimeAssetsTotalRawBytes: 20_000,
        runtimeAssetMaxRawBytes: 20_000,
      },
    });

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.passed, true);
    assert.equal(report.metrics.initialScripts.count, 2);
    assert.equal(report.metrics.asyncPixiChunks.count, 1);
    assert.equal(report.metrics.gameChunks.count, 1);
    assert.equal(report.metrics.initialCss.count, 1);
    assert.equal(report.metrics.runtimeAssetManifest.count, 1);
    assert.equal(report.metrics.runtimeAssetManifest.assetCount, 1);
    assert.equal(report.metrics.runtimeAssets.count, 2);
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
    await writeRuntimeAssets(root);

    const report = await runBuildPerfGuard({
      distDir: root,
      writeReport: false,
      quiet: true,
      budgets: DEFAULT_BUILD_BUDGETS,
    });

    assert.equal(report.passed, false);
    assert.ok(report.failures.some((failure) => failure.id === "startup.no-pixi-preload"));
  });

  it("fails when generated runtime assets are missing or not content-hashed", async () => {
    const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cc-gh-perf-build-"));
    await writeFile(missingRoot, "index.html", '<script type="module" src="/assets/index-app.js"></script>');
    await writeFile(missingRoot, "assets/index-app.js", "console.log('app');");

    const missing = await runBuildPerfGuard({
      distDir: missingRoot,
      writeReport: false,
      quiet: true,
      budgets: DEFAULT_BUILD_BUDGETS,
    });
    assert.ok(missing.failures.some((failure) => failure.id === "runtime-assets.manifest.present"));

    const unhashedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cc-gh-perf-build-"));
    await writeFile(unhashedRoot, "index.html", '<script type="module" src="/assets/index-app.js"></script>');
    await writeFile(unhashedRoot, "assets/index-app.js", "console.log('app');");
    await writeFile(
      unhashedRoot,
      "assets-runtime/manifest.json",
      JSON.stringify({
        version: 1,
        assets: {
          "bubbo.balls.sheet": {
            type: "image",
            src: "/assets-runtime/bubbo/assets_bubbo_balls.webp",
          },
        },
      }),
    );
    await writeFile(unhashedRoot, "assets-runtime/bubbo/assets_bubbo_balls.webp", "webp");

    const unhashed = await runBuildPerfGuard({
      distDir: unhashedRoot,
      writeReport: false,
      quiet: true,
      budgets: DEFAULT_BUILD_BUDGETS,
    });
    assert.ok(unhashed.failures.some((failure) => failure.id === "runtime-assets.hashed-names"));
  });
});


describe("browser performance failure diagnostics", () => {
  function createProbe(supported = ["longtask", "long-animation-frame"]) {
    const observers = new Map();
    let now = 0;
    class Observer {
      static supportedEntryTypes = supported;
      constructor(callback) { this.callback = callback; this.queued = []; }
      observe({ entryTypes }) { observers.set(entryTypes[0], this); }
      takeRecords() { return this.queued.splice(0); }
    }
    const context = { window: {}, PerformanceObserver: Observer, performance: { now: () => now } };
    // page.addInitScript serializes the function without its module closure.
    vm.runInNewContext(`(${installRuntimePerfProbe.toString()})()`, context);
    return { probe: context.window.__perfGuard, observers, setTime: value => { now = value; } };
  }

  it("captures queued entries once with phase and script attribution", () => {
    const { probe, observers, setTime } = createProbe();
    observers.get("longtask").callback({ getEntries: () => [{ name: "self", startTime: 50, duration: 70 }] });
    setTime(100); probe.mark("garden-to-merge");
    setTime(200); probe.mark("merge-live-sample");
    observers.get("long-animation-frame").queued.push({ startTime: 220, duration: 65, blockingDuration: 15,
      renderStart: 230, styleAndLayoutStart: 240,
      scripts: [{ sourceURL: "https://example.test/assets/game.js?build=test#frame", sourceFunctionName: "draw", invoker: "requestAnimationFrame", duration: 60, forcedStyleAndLayoutDuration: 8 }] });
    const result = probe.snapshot();
    assert.equal(result.longTasks.length, 1);
    assert.equal(result.longAnimationFrames.length, 1);
    assert.equal(result.longAnimationFrames[0].blockingDuration, 15);
    assert.equal(result.longAnimationFrames[0].scripts[0].sourceURL, "https://example.test/assets/game.js");
    assert.equal(result.longAnimationFrames[0].scripts[0].forcedStyleAndLayoutDuration, 8);
    assert.equal(probe.snapshot().longAnimationFrames.length, 1, "queued entries must not be duplicated");
    assert.deepEqual(summarizeRuntimePerf(result), { longTasks: 1, longAnimationFrames: 1, phases: {
      navigation: { longTasks: 1, longAnimationFrames: 0 },
      "merge-live-sample": { longTasks: 0, longAnimationFrames: 1 },
    } });
  });

  it("records unsupported entry types explicitly without manufacturing measurements", () => {
    const { probe, observers } = createProbe([]);
    const result = probe.snapshot();
    assert.equal(observers.size, 0);
    assert.equal(result.supportedEntryTypes.length, 0);
    assert.equal(result.longTasks.length, 0);
    assert.equal(result.longAnimationFrames.length, 0);
  });

  it("retains every existing lifetime/frame budget and always saves compact diagnostics", async () => {
    const source = await fs.readFile(new URL("./e2e/perf-guard.spec.js", import.meta.url), "utf8");
    assert.match(source, /expect\(liveFrames.frames\).toBeGreaterThanOrEqual\(20\)/);
    assert.match(source, /expect\(Math.round\(liveFrames.p95\)\).toBeLessThanOrEqual\(50\)/);
    assert.match(source, /expect\(liveFrames.max\).toBeLessThanOrEqual\(120\)/);
    assert.match(source, /expect\(runtime.longTasks.length\).toBeLessThanOrEqual\(3\)/);
    assert.match(source, /expect\(runtime.longAnimationFrames.length\).toBeLessThanOrEqual\(3\)/);
    assert.match(source, /finally \{/);
    assert.match(source, /testInfo.outputPath\("runtime-perf-diagnostics.json"\)/);
  });
});
