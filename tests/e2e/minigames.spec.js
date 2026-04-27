import { test, expect } from "@playwright/test";

test.describe("New-stack minigame smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });
  });

  async function pauseActiveGame(page) {
    const pauseButton = page.getByRole("button", { name: /Pause/ });
    await expect(pauseButton).toBeVisible();
    await pauseButton.click({ force: true });
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await expect(page.locator(".bottom-tabs")).toBeHidden();
    await expect(page.locator(".game-menu-overlay")).toBeVisible();
  }

  async function exitToHub(page) {
    await page.locator(".game-menu-overlay").getByRole("button", { name: /^Exit$/ }).click();
    await expect(page.locator(".bottom-tabs")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeHidden();
    await page.waitForTimeout(260);
  }

  test("tabs render rich game surfaces and survive real actions", async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Game Hub" })).toBeVisible();
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();
    await expect(page.getByRole("button", { name: /Farm/ })).toHaveCount(0);

    await page.getByRole("button", { name: /Blox/ }).click();
    await expect(page.getByText("Building Blox")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.getByText(/Score/).first()).toBeVisible();
    await pauseActiveGame(page);
    await exitToHub(page);

    await page.getByRole("button", { name: /Gems/ }).click();
    await expect(page.getByText("Gem Crush")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".game-play-hud")).toContainText(/Combo/);
    await pauseActiveGame(page);
    await exitToHub(page);

    await page.getByRole("button", { name: /Merge/ }).click();
    await expect(page.getByText("Gacha Merge")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await page.getByRole("button", { name: "30 Taps" }).click();
    await page.getByRole("button", { name: "Tap" }).first().click();
    await expect(page.getByText(/free taps/i)).toBeVisible();
    await page.getByRole("button", { name: /^Play$/ }).click();
    await pauseActiveGame(page);
    await exitToHub(page);

    await page.getByRole("button", { name: /Bubbo/ }).click();
    await expect(page.getByText("Bubbo Bubbo")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await page.getByRole("button", { name: /^Start$/ }).click();
    const bubboHud = page.locator(".bubbo-play-hud");
    await expect(bubboHud).toContainText(/bubbles/i);
    const bubboHostBox = await page.locator(".active-game-frame .pixi-host").boundingBox();
    const bubboHudBox = await bubboHud.boundingBox();
    expect(bubboHostBox).not.toBeNull();
    expect(bubboHudBox).not.toBeNull();
    expect(bubboHudBox.y).toBeGreaterThan(bubboHostBox.y + bubboHostBox.height * 0.66);
    await pauseActiveGame(page);
    await exitToHub(page);

    await page.getByRole("button", { name: /Trivia/ }).click();
    await expect(page.getByText("Brain Blitz")).toBeVisible();
    await page.getByRole("button", { name: "Solo" }).click();
    await expect(page.locator(".question-panel")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await pauseActiveGame(page);
    await exitToHub(page);

    await page.getByRole("button", { name: /Room/ }).click();
    await expect(page.getByText("Room Inventory")).toBeVisible();
    const roomNameInput = page.locator(".room-layout .join-row input");
    await expect(roomNameInput).toBeVisible();
    await page.waitForTimeout(300);
    await roomNameInput.fill("Pixel");
    await expect(roomNameInput).toHaveValue("Pixel");
    await page.getByRole("button", { name: "Rename" }).click();
    await expect(page.locator(".panel-header").filter({ hasText: "Pixel" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /^Play$/ }).click();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await pauseActiveGame(page);
    await exitToHub(page);

    expect(pageErrors).toEqual([]);
  });

  test("play-mode canvases stay large and inside a compact webview", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 680 });
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `compact_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();

    const pixiGames = [
      { tab: /Blox/, start: /^Start$/ },
      { tab: /Gems/, start: /^Start$/ },
      { tab: /Merge/, start: /^Play$/ },
      { tab: /Bubbo/, start: /^Start$/, id: "bubbo", minHostHeight: 500 },
    ];

    for (const game of pixiGames) {
      await page.getByRole("button", { name: game.tab }).click();
      await page.getByRole("button", { name: game.start }).click();
      const host = page.locator(".active-game-frame .pixi-host").last();
      await expect(host).toBeVisible();
      await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
      await expect(page.locator(".bottom-tabs")).toBeHidden();
      const hostBox = await host.boundingBox();
      expect(hostBox).not.toBeNull();
      expect(hostBox.height).toBeGreaterThanOrEqual(game.minHostHeight || 620);
      expect(hostBox.width).toBeGreaterThanOrEqual(360);
      if (game.id === "bubbo") {
        const shellBox = await page.locator('[data-game-shell="bubbo"]').boundingBox();
        const hudBox = await page.locator(".bubbo-play-hud").boundingBox();
        expect(shellBox).not.toBeNull();
        expect(hudBox).not.toBeNull();
        expect(shellBox.height).toBeGreaterThanOrEqual(620);
        expect(hudBox.y).toBeGreaterThanOrEqual(hostBox.y + hostBox.height);
      }
      await pauseActiveGame(page);
      await exitToHub(page);
    }

    await page.getByRole("button", { name: /Room/ }).click();
    await page.getByRole("button", { name: /^Play$/ }).click();
    const roomStage = page.locator(".active-game-frame .room-stage");
    await expect(roomStage).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    const roomBox = await roomStage.boundingBox();
    expect(roomBox).not.toBeNull();
    expect(roomBox.height).toBeGreaterThanOrEqual(620);
    expect(roomBox.width).toBeGreaterThanOrEqual(360);
    await pauseActiveGame(page);
    await exitToHub(page);
  });
});
