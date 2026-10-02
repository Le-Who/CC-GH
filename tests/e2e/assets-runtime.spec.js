import { MERGE_LAB_CATALOG as mergeCatalog } from "../../game-logic/merge-lab-catalog.js";
import { test, expect } from "@playwright/test";
import { mergePanel, closeMergePanel, exitMerge, expectMergeArt } from "./helpers/mergeV3.js";
import sharedHudWebpProof from "../fixtures/shared-hud-webp-proof.json" with { type: "json" };

function observeRuntimeAssetRequests(page) {
  const paths = new Set();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/assets-runtime/") || /^\/games\/(?:bubbo-v2|match3-v2|blox-v2|garden-v2|garden-living|hud-redesign|ui-surfaces)\//.test(url.pathname)) {
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
  await page.locator(":is(.game-menu-overlay, .bb-dialog, .m3-dialog, .bx-dialog):visible").first().getByRole("button", { name: /^Exit$/ }).click();
  await expect(page.locator(".bottom-tabs")).toBeVisible();
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

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();
    await expectRuntimePath(runtimePaths, "/games/garden-v2/");
    await expect(page.locator('.gs2-stage .gs2-art').first()).toBeVisible();
    await expect.poll(() => page.locator('.gs2-stage img').evaluateAll(images => images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);

    await page.getByRole("button", { name: /Blox/ }).click();
    await expect(page.getByText("Building Blox")).toBeVisible();
    await expect(page.locator(".bx-canvas canvas")).toBeVisible();
    await expectRuntimePath(runtimePaths, "/games/blox-v2/");
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".bx-stage")).toHaveAttribute("data-bx-phase", "playing");
    await exitActiveGame(page);

    await page.getByRole("button", { name: /Bubbo/ }).click();
    await expect(page.getByText("Bubbo Bubbo")).toBeVisible();
    await expect(page.locator(".active-game-frame canvas")).toBeVisible();
    await expectRuntimePath(runtimePaths, "/games/bubbo-v2/");
    await exitActiveGame(page);

    await page.getByRole("button", { name: /Gems/ }).click();
    await expect(page.getByText("Gem Crush")).toBeVisible();
    await expect(page.locator(".active-game-frame canvas")).toBeVisible();
    await expectRuntimePath(runtimePaths, "/games/match3-v2/");
    await expectRuntimePath(runtimePaths, "/assets-runtime/puzzling-potions/");
    await exitActiveGame(page);

    await page.getByRole("button", { name: /Merge/ }).click();
    await expectMergeArt(page);
    await mergePanel(page, 'samples');
    const sampleArt = page.locator('[data-testid="ml-sample-list"] img');
    await expect.poll(() => sampleArt.evaluateAll(images => images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    await closeMergePanel(page);
    await exitMerge(page);

    await page.getByRole("button", { name: /Yard/ }).click();
    await expect(page.locator(".companion-yard-layout")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".yard-background-art")).toHaveAttribute("src", /\/assets-runtime\/companion-yard\/backgrounds\//);
    await expectRuntimePath(runtimePaths, "/assets-runtime/companion-yard/");
    for (const asset of sharedHudWebpProof.files) {
      await expectRuntimePath(runtimePaths, asset.runtimePath.replace(/^public/, ""));
    }
    expect([...runtimePaths].filter(path => /^\/games\/(?:bubbo-v2|blox-v2|match3-v2)\//.test(path)).every(path => path.endsWith(".webp"))).toBe(true);
    const approvedRetained = /^\/games\/puzzling-potions\/images\/(?:special-(?:blast|column|colour|row)|drop-(?:gold|seeds|energy)|fx-clear-burst)\.png$/;
    // V3 reuses exactly the owned source-art paths declared in its recovered catalog.
    const ownedMergeArt = new Set([...mergeCatalog.items, ...mergeCatalog.projects].map(entry => entry.asset));
    expect([...legacyGamePngPaths].filter(path => !approvedRetained.test(path) && !ownedMergeArt.has(path)).sort()).toEqual([]);
    expect([...legacyGamePngPaths].some(path => ownedMergeArt.has(path))).toBe(true);
  });
});
