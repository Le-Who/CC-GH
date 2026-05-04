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

  async function expectDarkUiSurface(locator, label) {
    const samples = await locator.evaluate((node) => {
      const style = window.getComputedStyle(node);
      const raw = `${style.backgroundImage}, ${style.backgroundColor}`;
      return [...raw.matchAll(/rgba?\(([^)]+)\)/g)]
        .map((match) => {
          const parts = match[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
          const [r, g, b] = parts;
          const alpha = parts.length > 3 ? parts[3] : 1;
          return { r, g, b, alpha };
        })
        .filter((color) => Number.isFinite(color.r) && Number.isFinite(color.g) && Number.isFinite(color.b) && color.alpha >= 0.5)
        .map((color) => (color.r + color.g + color.b) / 3);
    });
    expect(samples.length, `${label} has high-alpha background colors`).toBeGreaterThan(0);
    expect(Math.max(...samples), `${label} should not keep a light panel background in dark mode`).toBeLessThan(150);
  }

  async function expectPotionSurface(page, locator, label, testInfo) {
    await expect(locator).toBeVisible();
    await page.waitForTimeout(80);
    const surface = await locator.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const computed = window.getComputedStyle(node);
      const before = window.getComputedStyle(node, "::before");
      return {
        x: rect.x,
        width: rect.width,
        height: rect.height,
        backgroundImage: before.backgroundImage,
        backdrop: computed.backdropFilter || computed.webkitBackdropFilter || "",
      };
    });
    const viewport = page.viewportSize();
    expect(viewport, `${label} has a viewport`).not.toBeNull();
    expect(surface.x, `${label} left edge stays inside viewport`).toBeGreaterThanOrEqual(0);
    expect(surface.x + surface.width, `${label} right edge stays inside viewport`).toBeLessThanOrEqual(viewport.width + 1);
    expect(surface.height, `${label} keeps readable height`).toBeGreaterThan(42);
    expect(surface.backgroundImage, `${label} uses themed potion art`).toContain("/games/puzzling-potions/images/");
    expect(surface.backdrop, `${label} should not use the shared glass blur`).toMatch(/^$|none/);
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
    if (shellId === "match3") {
      await expectPotionSurface(page, overlay, `${label} pause menu`, testInfo);
    } else {
      await expectReadableGlass(page, overlay, `${label} pause menu`, testInfo);
    }
  }

  async function exitToHub(page) {
    await page.locator(".game-menu-overlay").last().getByRole("button", { name: /^Exit$/ }).click();
    await expect(page.locator(".bottom-tabs")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeHidden();
  }

  test("mobile menus and live HUDs keep their expected visual surfaces", async ({ page }, testInfo) => {
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
    await page.getByRole("button", { name: "Close seed shop" }).click();

    const gameCases = [
      { id: "blox", tab: /Blox/, menuText: "Building Blox", start: /^Start$/, label: "Blox" },
      { id: "match3", tab: /Gems/, menuText: "Gem Crush", start: /^Start$/, label: "Match-3" },
      { id: "merge", tab: /Merge/, label: "Merge" },
      { id: "bubbo", tab: /Bubbo/, menuText: "Bubbo Bubbo", start: /^Start$/, label: "Bubbo" },
    ];

    for (const game of gameCases) {
      await page.getByRole("button", { name: game.tab }).click();
      if (game.menuText) {
        await expect(page.getByText(game.menuText)).toBeVisible();
      } else {
        await expect(page.locator(".merge-scene-hud")).toBeVisible();
      }
      await page.waitForTimeout(260);
      if (game.start) {
        if (game.id === "match3") {
          await expectPotionSurface(page, page.locator(`[data-game-shell="${game.id}"] .game-menu-overlay`), `${game.label} start menu`, testInfo);
        } else {
          await expectReadableGlass(page, page.locator(`[data-game-shell="${game.id}"] .game-menu-overlay`), `${game.label} start menu`, testInfo);
        }
        await page.getByRole("button", { name: game.start }).click();
      } else {
        await expect(page.locator(`[data-game-shell="${game.id}"] .game-menu-overlay:visible`)).toHaveCount(0);
      }
      if (game.id === "merge") {
        await expect(page.locator(".merge-action-area")).toBeVisible();
        await page.locator('[data-merge-panel="exchange"]').click();
        await expectReadableGlass(page, page.locator(".merge-scene-drawer"), "Merge exchange drawer", testInfo);
        await expectDarkUiSurface(page.locator(".merge-scene-drawer"), "Merge scene drawer");
        await expectDarkUiSurface(page.locator(".merge-exchange-offer").first(), "Merge exchange offer");
        await page.locator(".merge-scene-drawer").getByRole("button", { name: /^Close$/ }).click();
      } else if (game.id === "match3") {
        await expectPotionSurface(page, page.locator(`[data-game-shell="${game.id}"] .match3-scene-hud`), `${game.label} live HUD`, testInfo);
      } else {
        await expectReadableGlass(page, page.locator(".game-play-hud").last(), `${game.label} live HUD`, testInfo);
      }
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
    await expectReadableGlass(page, page.locator(".yard-currency-chip").first(), "Yard currency chip", testInfo);
    await expectReadableGlass(page, page.locator(".yard-bottom-dock"), "Yard action dock", testInfo);
    await page.getByRole("button", { name: "Settings" }).click();
    await expectReadableGlass(page, page.locator(".yard-game-screen"), "Yard settings screen", testInfo);
  });
});
