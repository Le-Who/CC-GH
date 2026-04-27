import { test, expect } from "@playwright/test";

function parsePlayerActionRequest(request) {
  try {
    return JSON.parse(request.postData() || "{}");
  } catch {
    return null;
  }
}

test.describe("Garden Shelf flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `garden_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      window.localStorage.removeItem("terrarium_save");
      window.localStorage.removeItem("garden_shelf_language");
      window.localStorage.removeItem("garden_shelf_name");
    });
  });

  test("loads the Garden Shelf port and plants from the shelf panel", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();
    await expect(page.locator('img[src="/games/garden-shelf/assets_garden_sign.png"]')).toBeVisible();
    await expect(page.locator('img[src="/games/garden-shelf/assets_garden_bottom_plank.png"]')).toBeVisible();
    await expect(page.locator('img[src="/games/garden-shelf/assets_shelf.png"]').first()).toBeVisible();
    await expect(page.getByText("Gold Balance")).toHaveCount(0);
    await expect(page.locator(".stats-row")).toContainText("Garden Lv");
    await expect(page.locator(".stats-row")).toContainText("Plants");
    await expect(page.getByRole("button", { name: /Farm/ })).toHaveCount(0);
    const goldStat = page.locator(".stats-row .stat-chip").filter({ hasText: "Gold" });
    await expect(goldStat).toContainText("100");

    await page.getByRole("button", { name: "+" }).first().click();
    const panel = page.locator(".fixed.bottom-0").last();
    await expect(panel).toHaveClass(/garden-glass-sheet/);
    await expect(panel).toContainText("Seed Shop");
    await expect(panel).toContainText("Daisy");
    await expect(panel).toContainText("Lavender");
    await expect(panel).toContainText("Unlocks at Lv 4");
    await panel.locator("button").filter({ hasText: "25" }).click();

    await expect(page.getByTestId("garden-growth-timer")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("garden-phase-badge")).toHaveCount(0);
    await expect(page.getByTestId("garden-water-ready")).toBeVisible();
    await expect(goldStat).toContainText("75");

    await page.getByRole("button", { name: "Garden settings" }).click();
    await expect(page.locator(".garden-glass-menu")).toBeVisible();
    await expect(page.getByText("Settings")).toBeVisible();
    await page.getByRole("button", { name: "Russian" }).click();
    await expect(page.getByText("Мой сад")).toBeVisible();
    await expect(page.locator(".stats-row")).toContainText("Ур. сада");
    await expect(page.getByRole("button", { name: /Блоки/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Камни/ })).toBeVisible();
    await expect(page.getByText("Настройки")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("restores Garden Shelf level and plants from the shared player state on another device", async ({ browser }) => {
    const userId = `garden_sync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const openDevice = async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.addInitScript((value) => {
        window.localStorage.setItem("gh_dev_user_id", value);
        window.localStorage.removeItem("terrarium_save");
        window.localStorage.removeItem("garden_shelf_language");
        window.localStorage.removeItem("garden_shelf_name");
      }, userId);
      await page.goto("/");
      await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
      return { context, page };
    };

    const first = await openDevice();
    await first.page.getByRole("button", { name: "+" }).first().click();
    const panel = first.page.locator(".fixed.bottom-0").last();
    await expect(panel).toContainText("Seed Shop");
    const syncAfterPlant = first.page.waitForResponse((response) => {
      if (!response.url().includes("/api/player/mutate")) return false;
      const body = parsePlayerActionRequest(response.request());
      return body?.action === "garden.sync" && body?.payload?.state?.plants?.length > 0;
    }, { timeout: 10000 });
    await panel.locator("button").filter({ hasText: "25" }).click();
    await expect(first.page.getByTestId("garden-growth-timer")).toBeVisible({ timeout: 10000 });
    await syncAfterPlant;
    await first.context.close();

    const second = await openDevice();
    await expect(second.page.getByTestId("garden-growth-timer")).toBeVisible({ timeout: 15000 });
    await expect(second.page.locator(".stats-row")).toContainText("1/3");
    const goldStat = second.page.locator(".stats-row .stat-chip").filter({ hasText: "Gold" });
    await expect(goldStat).toContainText("75");
    await second.context.close();
  });

  test("does not replay collected offline earnings from the shared player state", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    const userId = await page.evaluate(() => window.localStorage.getItem("gh_dev_user_id"));
    await page.evaluate(async (value) => {
      const response = await fetch("/api/player/mutate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `dev ${value}`,
        },
        body: JSON.stringify({
          action: "garden.sync",
          payload: {
            state: {
              totalGoldEarned: 80,
              level: 2,
              xp: 80,
              shelvesUnlocked: 1,
              plants: [],
              lastTick: Date.now(),
              offlineEarnings: 50,
            },
          },
        }),
      });
      if (!response.ok) throw new Error(`garden sync failed: ${response.status}`);
    }, userId);

    await page.reload();
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Welcome Back!")).toHaveCount(0);
    await expect(page.getByText("Collect Gold")).toHaveCount(0);
    await expect(page.locator(".stats-row")).toContainText("Garden Lv");
  });
});
