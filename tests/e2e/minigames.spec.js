import { test, expect } from "@playwright/test";

test.describe("New-stack minigame smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });
  });

  test("tabs render rich game surfaces and survive real actions", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Game Hub" })).toBeVisible();
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".pixi-host canvas")).toBeVisible();

    await page.getByRole("button", { name: /Blox/ }).click();
    await expect(page.getByText("Building Blox")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.getByText(/Score/).first()).toBeVisible();

    await page.getByRole("button", { name: /Gems/ }).click();
    await expect(page.getByText("Gem Crush")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.getByText(/Combo/)).toBeVisible();

    await page.getByRole("button", { name: /Merge/ }).click();
    await expect(page.getByText("Gacha Merge")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await page.getByRole("button", { name: "30 Taps" }).click();
    await page.getByRole("button", { name: "Tap" }).first().click();
    await expect(page.getByText(/free taps/i)).toBeVisible();

    await page.getByRole("button", { name: /Trivia/ }).click();
    await expect(page.getByText("Brain Blitz")).toBeVisible();
    await page.getByRole("button", { name: "Solo" }).click();
    await expect(page.locator(".question-panel")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /Room/ }).click();
    await expect(page.getByText("Room Inventory")).toBeVisible();
    await page.locator(".join-row input").fill("Pixel");
    await page.getByRole("button", { name: "Rename" }).click();
    await expect(page.getByText("Pixel")).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
