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

    await page.getByRole("button", { name: /Bubbo/ }).click();
    await expect(page.getByText("Bubbo Bubbo")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.getByText(/bubbles/i)).toBeVisible();

    await page.getByRole("button", { name: /Trivia/ }).click();
    await expect(page.getByText("Brain Blitz")).toBeVisible();
    await page.getByRole("button", { name: "Solo" }).click();
    await expect(page.locator(".question-panel")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /Room/ }).click();
    await expect(page.getByText("Room Inventory")).toBeVisible();
    const roomNameInput = page.locator(".room-layout .join-row input");
    await expect(roomNameInput).toBeVisible();
    await page.waitForTimeout(300);
    await roomNameInput.fill("Pixel");
    await expect(roomNameInput).toHaveValue("Pixel");
    await page.getByRole("button", { name: "Rename" }).click();
    await expect(page.locator(".panel-header").filter({ hasText: "Pixel" })).toBeVisible({ timeout: 10000 });

    expect(pageErrors).toEqual([]);
  });

  test("play-mode canvases stay large and inside a compact webview", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 680 });
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `compact_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });

    for (const tab of [/Blox/, /Gems/, /Merge/, /Bubbo/]) {
      await page.getByRole("button", { name: tab }).click();
      const host = page.locator(".active-game-frame .pixi-host").last();
      await expect(host).toBeVisible();
      const hostBox = await page.locator(".pixi-host").evaluateAll((nodes) => {
        const rects = nodes
          .map((node) => node.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }));
        return rects.at(-1) || null;
      });
      const navBox = await page.locator(".bottom-tabs").evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      const frameBox = await page.locator(".active-game-frame").evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      expect(hostBox).not.toBeNull();
      expect(hostBox.height).toBeGreaterThanOrEqual(318);
      expect(hostBox.width).toBeGreaterThanOrEqual(360);
      expect(frameBox.y + frameBox.height).toBeLessThanOrEqual(navBox.y - 2);
    }
  });
});
