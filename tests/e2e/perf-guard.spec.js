import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { installRuntimePerfProbe, summarizeRuntimePerf } from "./helpers/runtimePerfProbe.js";
import { expectMergeV3, researchMergePair } from "./helpers/mergeV3.js";

async function markRuntimePhase(page, phase) {
  await page.evaluate(name => window.__perfGuard.mark(name), phase);
}

function observeGameAssetRequests(page) {
  const paths = new Set();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/assets-runtime/") || url.pathname.startsWith("/games/")) paths.add(url.pathname);
  });
  return paths;
}

async function sampleFrames(page, durationMs = 900) {
  return page.evaluate((duration) => new Promise((resolve) => {
    const deltas = [];
    let started = 0;
    let previous = 0;
    function tick(now) {
      if (!started) {
        started = now;
        previous = now;
        requestAnimationFrame(tick);
        return;
      }
      deltas.push(now - previous);
      previous = now;
      if (now - started >= duration) {
        deltas.sort((a, b) => a - b);
        resolve({
          frames: deltas.length,
          p95: deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.95))] || 0,
          max: deltas[deltas.length - 1] || 0,
        });
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }), durationMs);
}

test.describe("runtime perf guard", () => {
  test.skip(({ isMobile }) => isMobile, "Browser perf budgets are calibrated for desktop Chromium.");

  test("keeps startup lazy and Merge live play within frame/long-task smoke budgets", async ({ page }, testInfo) => {
    await page.addInitScript(installRuntimePerfProbe);
    const diagnostics = { liveFrames: null, runtime: null };
    try {
      const assetPaths = observeGameAssetRequests(page);
      await page.goto("/");
      await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });

      // Garden Living owns source-art URLs and no longer loads the Pixi asset manifest.
      // Wait for the real startup scene to decode before checking what was loaded lazily.
      const gardenBackdrop = page.locator('.gs2-backdrop img');
      await expect(gardenBackdrop).toBeVisible();
      await expect(gardenBackdrop).toHaveAttribute('src', '/games/garden-v2/background.webp');
      await expect.poll(() => gardenBackdrop.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      await expect.poll(() => assetPaths.has('/games/garden-v2/background.webp')).toBe(true);

      const startupResources = await page.evaluate(() =>
        performance.getEntriesByType("resource").map((entry) => entry.name),
      );
      expect(startupResources.some((name) => /LazyPixiSceneHost|pixi/i.test(name))).toBe(false);
      expect(
        [...assetPaths].some((path) => /^\/assets-runtime\/(?:bubbo|puzzling-potions)\/|^\/games\/(?:bubbo-v2|match3-v2|blox-v2|merge-lab-v3)\//.test(path)),
      ).toBe(false);

      await markRuntimePhase(page, "garden-to-merge");
      await page.getByRole("button", { name: /Merge/ }).click();
      await expectMergeV3(page);
      await markRuntimePhase(page, "merge-research");
      await researchMergePair(page, 'cloud', 'ember');
      await page.bringToFront();

      await markRuntimePhase(page, "merge-live-sample");
      const liveFrames = await sampleFrames(page);
      diagnostics.liveFrames = liveFrames;
      await markRuntimePhase(page, "assertions");
      expect(liveFrames.frames).toBeGreaterThanOrEqual(20);
      expect(Math.round(liveFrames.p95)).toBeLessThanOrEqual(50);
      expect(liveFrames.max).toBeLessThanOrEqual(120);

      const runtime = await page.evaluate(() => window.__perfGuard.snapshot());
      diagnostics.runtime = runtime;

      expect(runtime.longTasks.length).toBeLessThanOrEqual(3);
      expect(runtime.longAnimationFrames.length).toBeLessThanOrEqual(3);
    } finally {
      diagnostics.runtime ||= await page.evaluate(() => window.__perfGuard?.snapshot()).catch(() => null);
      diagnostics.summary = summarizeRuntimePerf(diagnostics.runtime);
      diagnostics.budgets = { minFrames: 20, p95FrameMs: 50, maxFrameMs: 120, maxLongTasks: 3, maxLongAnimationFrames: 3 };
      const output = testInfo.outputPath("runtime-perf-diagnostics.json");
      await fs.writeFile(output, JSON.stringify(diagnostics, null, 2));
      await testInfo.attach("runtime-perf-diagnostics", { path: output, contentType: "application/json" });
      console.log("runtime-perf", JSON.stringify(diagnostics.summary));
    }
  });
});
