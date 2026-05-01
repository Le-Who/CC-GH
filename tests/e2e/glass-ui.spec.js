import { test, expect } from "@playwright/test";

test.describe("Glass UI rollout smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `glass_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      window.localStorage.removeItem("garden_shelf_language");
      window.localStorage.removeItem("garden_shelf_name");
      window.localStorage.removeItem("terrarium_save");
    });
  });

  async function boot(page) {
    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();
  }

  async function expectReadableGlass(page, locator, label, testInfo) {
    await expect(locator).toBeVisible();
    await page.waitForTimeout(80);
    const box = await locator.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    });
    const viewport = page.viewportSize();
    expect(box, `${label} has a measurable box`).not.toBeNull();
    expect(viewport, `${label} has a viewport`).not.toBeNull();
    expect(box.x, `${label} left edge stays inside viewport`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${label} right edge stays inside viewport`).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.height, `${label} keeps readable height`).toBeGreaterThan(42);

    const style = await locator.evaluate((node) => {
      const computed = window.getComputedStyle(node);
      return {
        background: computed.backgroundImage + computed.backgroundColor,
        borderTopColor: computed.borderTopColor,
        backdrop: computed.backdropFilter || computed.webkitBackdropFilter || "",
      };
    });
    expect(style.background, `${label} uses a visible glass background`).not.toBe("none rgba(0, 0, 0, 0)");
    expect(style.borderTopColor, `${label} has a visible edge`).not.toBe("rgba(0, 0, 0, 0)");

    await page.screenshot({
      path: testInfo.outputPath(`${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`),
      fullPage: false,
    });
  }

  async function pauseAndCheck(page, label, testInfo, shellId = null) {
    await page.getByRole("button", { name: /Pause/ }).click({ force: true });
    const overlay = shellId
      ? page.locator(`[data-game-shell="${shellId}"] .game-menu-overlay`)
      : page.locator(".game-menu-overlay").last();
    await expectReadableGlass(page, overlay, `${label} pause menu`, testInfo);
  }

  async function exitToHub(page) {
    await page.locator(".game-menu-overlay").last().getByRole("button", { name: /^Exit$/ }).click();
    await expect(page.locator(".bottom-tabs")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeHidden();
  }

  test("mobile menus and live HUDs share the glass surface", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 420, height: 680 });
    await boot(page);

    await expectReadableGlass(page, page.locator(".stats-row"), "Light hub stats row", testInfo);
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");
    await expectReadableGlass(page, page.locator(".stats-row"), "Dark hub stats row", testInfo);

    await page.getByRole("button", { name: "Garden settings" }).click();
    await expectReadableGlass(page, page.locator(".garden-glass-menu"), "Garden settings menu", testInfo);
    await page.locator(".garden-glass-menu").getByRole("button", { name: "Close settings" }).click();

    await page.getByRole("button", { name: "+" }).first().click();
    await expectReadableGlass(page, page.locator(".garden-glass-sheet"), "Garden seed shop sheet", testInfo);
    await page.locator(".garden-glass-sheet").getByRole("button").first().click();

    const gameCases = [
      { id: "blox", tab: /Blox/, menuText: "Building Blox", start: /^Start$/, label: "Blox" },
      { id: "match3", tab: /Gems/, menuText: "Gem Crush", start: /^Start$/, label: "Match-3" },
      { id: "merge", tab: /Merge/, menuText: "Alchemy Table", label: "Merge" },
      { id: "bubbo", tab: /Bubbo/, menuText: "Bubbo Bubbo", start: /^Start$/, label: "Bubbo" },
    ];

    for (const game of gameCases) {
      await page.getByRole("button", { name: game.tab }).click();
      await expect(page.getByText(game.menuText)).toBeVisible();
      await page.waitForTimeout(260);
      if (game.start) {
        await expectReadableGlass(page, page.locator(`[data-game-shell="${game.id}"] .game-menu-overlay`), `${game.label} start menu`, testInfo);
        await page.getByRole("button", { name: game.start }).click();
      } else {
        await expect(page.locator(`[data-game-shell="${game.id}"] .game-menu-overlay:visible`)).toHaveCount(0);
      }
      await expectReadableGlass(page, page.locator(".game-play-hud").last(), `${game.label} live HUD`, testInfo);
      await pauseAndCheck(page, game.label, testInfo, game.id);
      await exitToHub(page);
    }

    await page.getByRole("button", { name: /Trivia/ }).click();
    await page.waitForTimeout(260);
    await expectReadableGlass(page, page.locator(".trivia-card"), "Trivia setup panel", testInfo);
    await page.getByRole("button", { name: "Solo" }).click();
    await expectReadableGlass(page, page.locator(".question-panel"), "Trivia question panel", testInfo);
    await pauseAndCheck(page, "Trivia", testInfo);
    await exitToHub(page);

    await page.getByRole("button", { name: /Yard/ }).click();
    await page.waitForTimeout(260);
    await expectReadableGlass(page, page.locator(".companion-yard-panel"), "Cozy Yard menu", testInfo);
    await page.getByRole("button", { name: /^Play$/ }).click();
    await expectReadableGlass(page, page.locator(".game-play-hud").last(), "Yard live HUD", testInfo);
    await pauseAndCheck(page, "Yard", testInfo);
    await exitToHub(page);
  });
});
