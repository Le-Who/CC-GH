import { test, expect } from "@playwright/test";
import { mergePanel, closeMergePanel, pauseMerge, exitMerge, expectMergeControlsReachable, expectMergeArt } from "./helpers/mergeV3.js";
import { startTriviaSolo, pauseTrivia, exitTriviaToHub, expectTriviaGeneratedSurface } from "./helpers/triviaR3.js";
import { expectBloxArtSurface, expectBloxDialog, expectBloxLayout, pauseBlox, exitBlox } from "./helpers/blox-v2.js";

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

  async function expectMatch3Surface(page, locator, label, testInfo) {
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
    expect(
      surface.backgroundImage.includes("/games/ui-surfaces/") ||
        surface.backgroundImage.includes("/assets-runtime/puzzling-potions/"),
      `${label} uses generated screen or runtime HUD art`,
    ).toBe(true);
    expect(surface.backdrop, `${label} should not use the shared glass blur`).toMatch(/^$|none/);
    await page.screenshot({
      path: testInfo.outputPath(`${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`),
      fullPage: false,
    });
  }

  async function expectGeneratedChrome(page, locator, label, testInfo) {
    await expect(locator).toBeVisible();
    await page.waitForTimeout(80);
    const surface = await locator.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const computed = window.getComputedStyle(node);
      return {
        x: rect.x,
        width: rect.width,
        height: rect.height,
        backgroundImage: computed.borderImageSource !== "none" ? computed.borderImageSource : computed.backgroundImage,
        backgroundColor: computed.backgroundColor,
        color: computed.color,
      };
    });
    const viewport = page.viewportSize();
    expect(viewport, `${label} has a viewport`).not.toBeNull();
    expect(surface.x, `${label} left edge stays inside viewport`).toBeGreaterThanOrEqual(0);
    expect(surface.x + surface.width, `${label} right edge stays inside viewport`).toBeLessThanOrEqual(viewport.width + 1);
    expect(surface.height, `${label} keeps readable height`).toBeGreaterThan(42);
    expect(surface.backgroundImage, `${label} uses generated runtime art`).toMatch(/\/games\/(?:ui-surfaces|hud-redesign|trivia|companion-yard|garden-shelf|bubbo-v2|match3-v2|blox-v2)\//);
    expect(surface.backgroundImage, `${label} does not keep a CSS gradient panel`).not.toContain("linear-gradient");
    expect(surface.backgroundColor, `${label} should not paint a CSS fallback color behind transparent art`).toBe("rgba(0, 0, 0, 0)");
    expect(surface.color, `${label} keeps readable runtime text`).not.toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({
      path: testInfo.outputPath(`${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`),
      fullPage: false,
    });
  }

  async function expectPauseContentChromeFree(overlay, label) {
    const offenders = await overlay.evaluate((root) => {
      const scaler = root.querySelector(".game-menu-scaler") || root;
      const isVisible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };

      return [...scaler.querySelectorAll("*")]
        .filter((node) => isVisible(node) && !node.closest(".panel-button"))
        .map((node) => {
          const style = window.getComputedStyle(node);
          return {
            selector: `${node.tagName.toLowerCase()}${node.className ? `.${String(node.className).trim().replace(/\s+/g, ".")}` : ""}`,
            backgroundImage: style.backgroundImage,
          };
        })
        .filter((entry) => entry.backgroundImage.includes("metric-chip") || entry.backgroundImage.includes("linear-gradient"));
    });

    expect(offenders, `${label} should not paint nested metric/gradient panels inside the generated menu frame`).toEqual([]);
  }

  async function pauseAndCheck(page, label, testInfo, shellId = null) {
    await page.getByRole("button", { name: /Pause/ }).click({ force: true });
    const overlay = shellId
      ? page.locator(`[data-game-shell="${shellId}"] :is(.game-menu-overlay,.bb-dialog,.m3-dialog,.bx-dialog)`)
      : page.locator(":is(.game-menu-overlay,.bb-dialog,.m3-dialog,.bx-dialog):visible").last();
    const skin = await overlay.locator(".game-menu-scaler").count() ? overlay.locator(".game-menu-scaler") : overlay;
    await expectGeneratedChrome(page, skin, `${label} pause menu`, testInfo);
    await expectPauseContentChromeFree(overlay, `${label} pause menu`);
  }

  async function exitToHub(page) {
    await page.locator(":is(.game-menu-overlay,.bb-dialog,.m3-dialog,.bx-dialog):visible").last().getByRole("button", { name: /^Exit$/ }).click();
    await expect(page.locator(".bottom-tabs")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeHidden();
  }

  test("mobile menus and live HUDs keep their expected visual surfaces", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      window.localStorage.setItem("game_hub_ui_theme", "light");
    });
    await page.setViewportSize({ width: 420, height: 680 });
    await boot(page);

    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "light");
    await expectReadableGlass(page, page.locator(".stats-row"), "Light hub stats row", testInfo);
    await page.evaluate(() => {
      window.localStorage.setItem("game_hub_ui_theme", "dark");
      document.documentElement.dataset.uiTheme = "dark";
      document.documentElement.style.colorScheme = "dark";
    });
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
      if (game.id === "blox") {
        await expectBloxDialog(page);
        await expectBloxArtSurface(page, page.locator(".bx-dialog"), "Blox start menu", testInfo);
        await page.getByRole("button", { name: /^Start$/ }).click();
        await expectBloxLayout(page);
        await expectBloxArtSurface(page, page.locator(".bx-hud"), "Blox live HUD", testInfo);
        const dialog = await pauseBlox(page);
        await expectBloxArtSurface(page, dialog, "Blox pause menu", testInfo);
        await exitBlox(page);
        continue;
      }
      if (game.menuText) {
        await expect(page.getByText(game.menuText)).toBeVisible();
      } else {
        await expectMergeArt(page, testInfo, "merge-v3-live-art");
      }
      await page.waitForTimeout(260);
      if (game.start) {
        await expectGeneratedChrome(page, page.locator(`[data-game-shell="${game.id}"] :is(.game-menu-overlay .game-menu-scaler,.bb-dialog,.m3-dialog,.bx-dialog)`), `${game.label} start menu`, testInfo);
        await page.getByRole("button", { name: game.start }).click();
      } else {
        await expect(page.locator(`[data-game-shell="${game.id}"] .game-menu-overlay:visible`)).toHaveCount(0);
      }
      if (game.id === "merge") {
        await mergePanel(page, 'supplies');
        await expectReadableGlass(page, page.locator('.ml-dialog-scroll'), "Merge V3 supplies", testInfo);
        await expectDarkUiSurface(page.locator('.ml-dialog-scroll'), "Merge V3 readable backing");
        await expect(page.getByTestId('ml-drawer')).toHaveCSS('border-image-source', /\/games\/merge-lab-v3\/lab-panel\.webp/);
        await expectMergeControlsReachable(page, page.getByTestId('ml-drawer').locator('.ml-dialog-heading button'));
        await closeMergePanel(page);
        const mergeDialog = await pauseMerge(page);
        await expectReadableGlass(page, mergeDialog.locator('.ml-dialog-scroll'), "Merge V3 pause", testInfo);
        await expectMergeControlsReachable(page, mergeDialog.getByRole('button'));
        await exitMerge(page);
        continue;
      } else if (game.id === "match3") {
        await expectGeneratedChrome(page, page.locator(".m3-hud"), `${game.label} live HUD`, testInfo);
      } else if (game.id === "bubbo") {
        await expectGeneratedChrome(page, page.locator(".bb-hud"), `${game.label} live HUD`, testInfo);
      } else {
        await expectGeneratedChrome(page, page.locator(".game-play-hud").last(), `${game.label} live HUD`, testInfo);
      }
      await pauseAndCheck(page, game.label, testInfo, game.id);
      await exitToHub(page);
    }

    await page.getByRole("button", { name: /Trivia/ }).click();
    await expectTriviaGeneratedSurface(page, page.locator(".trv2-paper"), "question-panel", "Trivia setup panel", testInfo);
    await startTriviaSolo(page);
    await expectTriviaGeneratedSurface(page, page.locator(".trv2-question-surface"), "question-panel", "Trivia question panel", testInfo);
    const triviaDialog = await pauseTrivia(page);
    await expectTriviaGeneratedSurface(page, triviaDialog, "answer-panel", "Trivia pause dialog", testInfo);
    await expect(triviaDialog.locator(".trv2-pause-metrics")).toHaveCSS("background-image", "none");
    await exitTriviaToHub(page);

    await page.getByRole("button", { name: /Yard/ }).click();
    await page.waitForTimeout(260);
    await expectGeneratedChrome(page, page.locator(".yard-currency-chip").first(), "Yard currency chip", testInfo);
    await expectGeneratedChrome(page, page.locator(".yard-bottom-dock"), "Yard action dock", testInfo);
    await page.getByRole("button", { name: "Settings" }).click();
    await expectGeneratedChrome(page, page.locator(".yard-game-screen"), "Yard settings screen", testInfo);
  });
});
