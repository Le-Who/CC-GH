import { test, expect } from "@playwright/test";

test.describe("Garden Shelf flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `garden_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      window.localStorage.removeItem("terrarium_save");
    });
  });

  test("loads the Garden Shelf port and plants from the shelf panel", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();
    await expect(page.getByText("Gold Balance")).toHaveCount(0);
    await expect(page.locator(".stats-row")).toContainText("Garden Lv");
    await expect(page.locator(".stats-row")).toContainText("Plants");
    await expect(page.getByRole("button", { name: /Farm/ })).toHaveCount(0);
    const goldStat = page.locator(".stats-row .stat-chip").filter({ hasText: "Gold" });
    await expect(goldStat).toContainText("100");

    await page.getByRole("button", { name: "+" }).first().click();
    const panel = page.locator(".fixed.bottom-0").last();
    await expect(panel).toContainText("Seed Shop");
    await expect(panel).toContainText("Daisy");
    await panel.locator("button").filter({ hasText: "10" }).click();

    await expect(page.getByText(/PH 0|LV 1/).first()).toBeVisible({ timeout: 10000 });
    await expect(goldStat).toContainText("90");
    expect(pageErrors).toEqual([]);
  });
});
