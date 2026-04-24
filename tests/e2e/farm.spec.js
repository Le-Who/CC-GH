import { test, expect } from "@playwright/test";

test.describe("Farm new-stack flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `farm_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });
  });

  test("loads farm panels and plants from the Pixi plot surface", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Cozy Farm")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();

    const strawberryCard = page.locator(".item-card", { hasText: "Strawberry" }).first();
    await expect(strawberryCard).toContainText(/Seeds 5/);

    const canvas = page.locator(".pixi-host canvas");
    const hostBox = await page.locator(".pixi-host").boundingBox();
    expect(hostBox).not.toBeNull();
    const size = Math.max(140, Math.min(hostBox.width - 32, hostBox.height - 32));
    const cell = size / 4;
    await canvas.click({
      position: {
        x: (hostBox.width - size) / 2 + cell / 2,
        y: 16 + cell / 2,
      },
    });
    await expect(strawberryCard).toContainText(/Seeds 4/, { timeout: 10000 });

    await page.getByRole("button", { name: "Bag" }).click();
    await expect(page.getByText("Harvest crops to fill the Bag.")).toBeVisible();

    await page.getByRole("button", { name: "Badges" }).click();
    await expect(page.locator(".badge-card").first()).toBeVisible();

    await page.getByRole("button", { name: "Journal" }).click();
    await expect(page.locator(".item-card").first()).toBeVisible();

    await page.getByRole("button", { name: "Season" }).click();
    await expect(page.getByText(/Season/).first()).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
