import { openHome, selectHomeGame, expectHomeCardsReachable } from './helpers/home.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sourceOnlyAssetDestination } from '../../scripts/asset-source-only-policy.mjs';
import { MERGE_LAB_CATALOG as mergeCatalog } from "../../game-logic/merge-lab-catalog.js";
import { test, expect } from "@playwright/test";
import { mergePanel, closeMergePanel, exitMerge, expectMergeArt } from "./helpers/mergeV3.js";
import sharedHudWebpProof from "../fixtures/shared-hud-webp-proof.json" with { type: "json" };
import { isRetiredAssetPath } from '../../scripts/asset-retirement-policy.mjs';

function observeRuntimeAssetRequests(page) {
  const paths = new Set();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/assets-runtime/") || /^\/games\/(?:home-thumbnails|bubbo-v2|match3-v2|blox-v2|garden-v2|garden-living|hud-redesign|ui-surfaces)\//.test(url.pathname)) {
      paths.add(url.pathname);
    }
  });
  return paths;
}

function observeLegacyGamePngRequests(page) {
  const paths = new Set();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/^\/games\/.+\.png$/i.test(url.pathname)) {
      paths.add(url.pathname);
    }
  });
  return paths;
}

async function expectRuntimePath(paths, prefix) {
  await expect.poll(() => [...paths].some((path) => path.startsWith(prefix)), {
    message: `expected a runtime asset request starting with ${prefix}`,
    timeout: 10000,
  }).toBe(true);
}

async function exitActiveGame(page) {
  const overlay = page.locator(":is(.game-menu-overlay, .bb-dialog, .m3-dialog, .bx-dialog):visible").first();
  if (await overlay.count() === 0) {
    await page.getByRole("button", { name: /Pause/ }).click({ force: true });
  }
  await page.locator(":is(.game-menu-overlay, .bb-dialog, .m3-dialog, .bx-dialog):visible").first().getByRole("button", { name: /^(All games|Все игры)$/ }).click();
  await expect(page.getByTestId('home-catalogue')).toBeVisible();
}

test.describe("generated runtime asset manifest", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `runtime_assets_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });
  });

  test("serves Garden Shelf, Blox, Bubbo, Gem Crush, Merge, and Cozy Yard runtime art", async ({ page }) => {
    test.setTimeout(60_000);
    const runtimePaths = observeRuntimeAssetRequests(page);
    const legacyGamePngPaths = observeLegacyGamePngRequests(page);
    const retiredRequests = [];
    const missingActiveAssets = [];
    page.on('request', request => {
      if (isRetiredAssetPath(new URL(request.url()).pathname)) retiredRequests.push(request.url());
    });
    page.on('response', response => {
      if (response.status() === 404 && /^\/(?:games|assets-runtime|assets)\//.test(new URL(response.url()).pathname)) missingActiveAssets.push(response.url());
    });

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();
    await expectRuntimePath(runtimePaths, "/games/garden-v2/");
    await expect(page.locator('.gs2-stage .gs2-art').first()).toBeVisible();
    await expect.poll(() => page.locator('.gs2-stage img').evaluateAll(images => images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    await openHome(page);await expectHomeCardsReachable(page);
    await expect.poll(() => page.locator('.home-thumbnail img').evaluateAll(images => images.length === 8 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    for (const id of ['garden','blox','match3','merge','bubbo','trivia','room','settlement']) await expectRuntimePath(runtimePaths, `/games/home-thumbnails/${id}.webp`);
    expect(runtimePaths.has('/games/ui-surfaces/yard-panel.webp')).toBe(false);

    await selectHomeGame(page, 'blox');
    await expect(page.getByText("Building Blox")).toBeVisible();
    await expect(page.locator(".bx-canvas canvas")).toBeVisible();
    await expectRuntimePath(runtimePaths, "/games/blox-v2/");
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".bx-stage")).toHaveAttribute("data-bx-phase", "playing");
    await exitActiveGame(page);

    await selectHomeGame(page, 'bubbo');
    await expect(page.getByText("Bubbo Bubbo")).toBeVisible();
    await expect(page.locator(".active-game-frame canvas")).toBeVisible();
    await expectRuntimePath(runtimePaths, "/games/bubbo-v2/");
    await exitActiveGame(page);

    await selectHomeGame(page, 'match3');
    await expect(page.getByText("Gem Crush")).toBeVisible();
    await expect(page.locator(".active-game-frame canvas")).toBeVisible();
    await expectRuntimePath(runtimePaths, "/games/match3-v2/");
    await expectRuntimePath(runtimePaths, "/assets-runtime/puzzling-potions/");
    await exitActiveGame(page);

    await selectHomeGame(page, 'merge');
    await expectMergeArt(page);
    await mergePanel(page, 'samples');
    const sampleArt = page.locator('[data-testid="ml-sample-list"] img');
    await expect.poll(() => sampleArt.evaluateAll(images => images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    await closeMergePanel(page);
    await exitMerge(page);

    await selectHomeGame(page, 'room');
    await expect(page.locator(".companion-yard-layout")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".yard-background-art")).toHaveAttribute("src", /\/assets-runtime\/companion-yard\/backgrounds\//);
    await expectRuntimePath(runtimePaths, "/assets-runtime/companion-yard/");
    for (const asset of sharedHudWebpProof.files) {
      const runtimePath = asset.runtimePath.replace(/^public/, '');
      const sourceOnly = sourceOnlyAssetDestination(asset.runtimePath);
      if (sourceOnly) {
        // Preserve the historical export proof outside published public assets.
        expect(runtimePaths.has(runtimePath), `${runtimePath} is retired from current rendering`).toBe(false);
        const response = await page.request.get(runtimePath);expect(response.status()).toBe(404);
        expect(response.headers()['content-type'] || '').not.toContain('text/html');
        const bytes = await readFile(new URL(`../../${sourceOnly}`, import.meta.url));expect(bytes.length).toBe(asset.runtimeBytes);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.runtimeSha256);
        const decoded = await page.evaluate(async data => {
          const url = URL.createObjectURL(new Blob([new Uint8Array(data)], {type:'image/webp'}));
          try {const image = new Image();image.src = url;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};}
          finally {URL.revokeObjectURL(url);}
        }, [...bytes]);
        expect(decoded).toEqual({width:asset.width,height:asset.height});
      } else await expectRuntimePath(runtimePaths, runtimePath);
    }
    expect([...runtimePaths].filter(path => /^\/games\/(?:bubbo-v2|blox-v2|match3-v2)\//.test(path)).every(path => path.endsWith(".webp"))).toBe(true);
    const approvedRetained = /^\/games\/puzzling-potions\/images\/(?:special-(?:blast|column|colour|row)|drop-(?:gold|seeds|energy)|fx-clear-burst)\.png$/;
    // V3 reuses exactly the owned source-art paths declared in its recovered catalog.
    const ownedMergeArt = new Set([...mergeCatalog.items, ...mergeCatalog.projects].map(entry => entry.asset));
    expect([...legacyGamePngPaths].filter(path => !approvedRetained.test(path) && !ownedMergeArt.has(path)).sort()).toEqual([]);
    expect([...legacyGamePngPaths].some(path => ownedMergeArt.has(path))).toBe(true);
    expect(retiredRequests).toEqual([]);
    expect(missingActiveAssets).toEqual([]);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    for (const url of ['/games/trivia/panel-menu.png', '/games/blox/cell_empty.png', '/games/farm/plot-empty.png', '/games/bubbo-bubbo/assets_bubbo_balls.png', '/games/garden-shelf/assets_shelf.png', '/games/puzzling-potions/images/piece-dragon.png']) {
      const response = await page.request.get(url);
      expect(response.status(), url).toBe(404);
      expect(response.headers()['content-type'], url).not.toContain('text/html');
    }
  });
});


// Block the service worker in this targeted test so its legacy eager precache
// cannot hide which runtime the dock itself imports. Cache behavior is separate.
test.describe("dock renderer loading", () => {
  test.use({ serviceWorkers: "block" });
  for (const game of ["Bubbo", "Merge"]) {
    test(`does not load the obsolete Pixi renderer when opening ${game}`, async ({ page }) => {
      const runtimeRequests = [];
      page.on("request", request => {
        const path = new URL(request.url()).pathname;
        if (/LazyPixiSceneHost|PixiGameHost|(?:bubbo|merge)Scene|WebGLRenderer|WebGPURenderer/.test(path)) runtimeRequests.push(path);
      });
      await page.goto("/");
      await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
      await openHome(page);
      const tab = page.locator(".home-games").getByRole("button", { name: new RegExp(game) });
      await tab.focus();
      await tab.click();
      if (game === "Bubbo") await expect(page.getByTestId("bb-field")).toBeVisible();
      else await expectMergeArt(page);
      await page.waitForLoadState("networkidle");
      expect(runtimeRequests).toEqual([]);
    });
  }
});
