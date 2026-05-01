import { test, expect } from "@playwright/test";

function observeRuntimeAssetRequests(page) {
  const paths = new Set();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/assets-runtime/")) {
      paths.add(url.pathname);
    }
  });
  return paths;
}

async function expectRuntimePath(paths, prefix) {
  await expect.poll(() => [...paths].some((path) => path.startsWith(prefix))).toBe(true);
}

async function exitActiveGame(page) {
  await page.locator(".game-menu-overlay:visible").first().getByRole("button", { name: /^Exit$/ }).click();
  await expect(page.locator(".bottom-tabs")).toBeVisible();
}

test.describe("generated runtime asset manifest", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `runtime_assets_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });
  });

  test("serves Garden Shelf, Bubbo, Gem Crush, and Cozy Yard art from assets-runtime", async ({ page }) => {
    test.setTimeout(60_000);
    const runtimePaths = observeRuntimeAssetRequests(page);

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();
    await expectRuntimePath(runtimePaths, "/assets-runtime/garden-shelf/");

    await page.getByRole("button", { name: /Bubbo/ }).click();
    await expect(page.getByText("Bubbo Bubbo")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await expectRuntimePath(runtimePaths, "/assets-runtime/bubbo/");
    await exitActiveGame(page);

    await page.getByRole("button", { name: /Gems/ }).click();
    await expect(page.getByText("Gem Crush")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await expectRuntimePath(runtimePaths, "/assets-runtime/puzzling-potions/");
    await exitActiveGame(page);

    await page.getByRole("button", { name: /Yard/ }).click();
    await expect(page.locator(".companion-yard-layout")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".yard-background-art")).toHaveAttribute("src", /\/assets-runtime\/companion-yard\/backgrounds\//);
    await expectRuntimePath(runtimePaths, "/assets-runtime/companion-yard/");
  });
});
