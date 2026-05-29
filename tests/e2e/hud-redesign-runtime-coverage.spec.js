import { test, expect } from "@playwright/test";

test.describe("HUD redesign runtime asset coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `hud_runtime_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });
  });

  async function boot(page) {
    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();
  }

  async function expectBackgroundAsset(locator, expectedPath, pseudo = null) {
    await expect(locator).toBeVisible();
    const style = await locator.evaluate((node, pseudoSelector) => {
      const computed = window.getComputedStyle(node, pseudoSelector);
      return {
        backgroundImage: computed.backgroundImage,
        backgroundColor: computed.backgroundColor,
      };
    }, pseudo);
    const className = await locator.evaluate((node) => node.className);
    const targetLabel = `${expectedPath} should be used by ${className}`;
    const urlLayers = style.backgroundImage.match(/url\(/g) || [];
    expect(style.backgroundImage, targetLabel).toContain(expectedPath);
    expect(style.backgroundImage, `${className} should not use gradient/color fallback layers`).not.toContain("linear-gradient");
    expect(urlLayers.length, `${className} should use one generated art layer`).toBe(1);
    expect(style.backgroundColor, `${className} should not paint a CSS fallback color behind transparent art`).toBe("rgba(0, 0, 0, 0)");
  }

  async function expectVisibleControlsHealthy(page, scopeSelector) {
    const metrics = await page.evaluate((scopeSelector) => {
      const root = document.querySelector(scopeSelector) || document.body;
      const isVisible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const labelFor = (node) => node.getAttribute("aria-label") || node.textContent.trim().replace(/\s+/g, " ");
      const controls = [...root.querySelectorAll("button, [role='button'], input, select, textarea")].filter(isVisible);
      return {
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tinyControls: controls
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width < 44 || rect.height < 44;
          })
          .map(labelFor),
        clippedControls: controls
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.left < -1 || rect.right > window.innerWidth + 1 || rect.top < -1 || rect.bottom > window.innerHeight + 1;
          })
          .map(labelFor),
        overflowingButtons: [...root.querySelectorAll("button")]
          .filter(isVisible)
          .filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
          .map(labelFor),
      };
    }, scopeSelector);
    expect(metrics.overflowX).toBeLessThanOrEqual(1);
    expect(metrics.tinyControls).toEqual([]);
    expect(metrics.clippedControls).toEqual([]);
    expect(metrics.overflowingButtons).toEqual([]);
  }

  async function expectYardMetricChipsAligned(page) {
    const chips = await page.locator(".yard-currency-chip").evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const icon = node.querySelector(".yard-hud-icon")?.getBoundingClientRect();
      const value = node.querySelector("strong")?.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        text: node.textContent.trim(),
        ratio: rect.width / Math.max(1, rect.height),
        backgroundImage: style.backgroundImage,
        backgroundColor: style.backgroundColor,
        imageLayerCount: (style.backgroundImage.match(/url\(/g) || []).length,
        iconVisible: !!icon && icon.width >= 24 && icon.height >= 24,
        valueInside:
          !!value
          && value.left >= rect.left + 34
          && value.right <= rect.right - 6
          && value.top >= rect.top + 6
          && value.bottom <= rect.bottom - 6,
      };
    }));

    expect(chips.length).toBeGreaterThanOrEqual(2);
    for (const chip of chips) {
      expect(chip.backgroundImage, `${chip.text} must use generated metric-chip art`).toContain("/games/hud-redesign/room/metric-chip.png");
      expect(chip.backgroundColor, `${chip.text} must not paint a CSS fallback color behind transparent metric art`).toBe("rgba(0, 0, 0, 0)");
      expect(chip.imageLayerCount, `${chip.text} should use one generated metric art layer`).toBe(1);
      expect(chip.ratio, `${chip.text} metric chip art is visually squeezed`).toBeGreaterThanOrEqual(1.75);
      expect(chip.iconVisible, `${chip.text} metric icon should remain visible on small mobile`).toBe(true);
      expect(chip.valueInside, `${chip.text} metric value should sit inside the generated frame content area`).toBe(true);
    }
  }

  async function expectYardDockIconsCentered(page) {
    const items = await page.locator(".yard-bottom-dock .yard-icon-button").evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const icon = node.querySelector(".yard-hud-icon")?.getBoundingClientRect();
      const label = node.querySelector(".yard-icon-label");
      const labelRect = label?.getBoundingClientRect();
      const labelStyle = label ? getComputedStyle(label) : null;
      return {
        label: node.getAttribute("aria-label"),
        tooltip: node.getAttribute("data-tooltip"),
        labelVisible: !!label
          && labelStyle?.display !== "none"
          && labelStyle?.visibility !== "hidden"
          && (labelRect?.width || 0) > 2
          && (labelRect?.height || 0) > 2,
        centered:
          !!icon
          && Math.abs(((icon.left + icon.right) / 2) - ((rect.left + rect.right) / 2)) <= 3
          && Math.abs(((icon.top + icon.bottom) / 2) - ((rect.top + rect.bottom) / 2)) <= 3,
      };
    }));
    expect(items).toHaveLength(6);
    for (const item of items) {
      expect(item.tooltip, `${item.label} must keep text as tooltip metadata`).toBe(item.label);
      expect(item.labelVisible, `${item.label} label must not push dock icon`).toBe(false);
      expect(item.centered, `${item.label} icon must stay centered in generated button art`).toBe(true);
    }
  }

  async function expectYardScreenContentInsideFrame(page) {
    const layout = await page.evaluate(() => {
      const screen = document.querySelector(".yard-game-screen")?.getBoundingClientRect();
      const header = document.querySelector(".yard-screen-header")?.getBoundingClientRect();
      const content = document.querySelector(".yard-screen-content")?.getBoundingClientRect();
      const card = document.querySelector(".yard-screen-content .yard-card")?.getBoundingClientRect();
      const close = document.querySelector(".yard-screen-header .yard-icon-button")?.getBoundingClientRect();
      const inside = (rect, inset = 0) => !!screen && !!rect
        && rect.left >= screen.left + inset
        && rect.right <= screen.right - inset
        && rect.top >= screen.top + inset
        && rect.bottom <= screen.bottom - inset;
      return {
        headerInside: inside(header, 10),
        contentInside: inside(content, 10),
        cardInside: inside(card, 14),
        closeInside: inside(close, 8),
      };
    });
    expect(layout.headerInside).toBe(true);
    expect(layout.contentInside).toBe(true);
    expect(layout.cardInside).toBe(true);
    expect(layout.closeInside).toBe(true);
  }

  test("Merge HUD uses the generated hud-redesign runtime kit", async ({ page }) => {
    await boot(page);
    await page.getByRole("button", { name: /Merge/ }).click();
    await expectBackgroundAsset(page.locator(".merge-scene-hud"), "/games/hud-redesign/merge/hud-panel.png", "::before");
    await expectBackgroundAsset(page.locator(".merge-action-dock"), "/games/hud-redesign/merge/dock-panel.png", "::before");
    await expectBackgroundAsset(page.locator(".merge-top-tool").first(), "/games/hud-redesign/merge/icon-badge.png");
  });

  test("Garden dialogs use generated per-menu panel assets", async ({ page }) => {
    await boot(page);
    await page.getByRole("button", { name: /settings/i }).click();
    await expect(page.locator(".garden-settings-dialog")).toHaveAttribute("data-garden-panel", "settings");
    await expectBackgroundAsset(page.locator(".garden-settings-dialog"), "/games/garden-shelf/menu-panels/settings.png");
    await expectBackgroundAsset(page.locator(".garden-settings-dialog .garden-choice-button").first(), "/games/hud-redesign/garden/primary-button.png");
    await expectVisibleControlsHealthy(page, ".garden-settings-dialog");
  });

  test("Cozy Yard HUD uses the generated hud-redesign runtime kit", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await page.getByRole("button", { name: /Yard/ }).click();
    await expectBackgroundAsset(page.locator(".yard-bottom-dock"), "/games/hud-redesign/room/dock-panel.png");
    await expectYardMetricChipsAligned(page);
    await expectYardDockIconsCentered(page);
    await expectBackgroundAsset(page.locator(".yard-icon-button.compact").first(), "/games/hud-redesign/room/icon-badge.png");
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "Daily letter" }).click();
    await expect(page.locator(".yard-game-screen")).toHaveAttribute("data-yard-screen", "daily");
    await expectBackgroundAsset(page.locator(".yard-game-screen"), "/games/companion-yard/menu-panels/daily.png");
    await expectYardScreenContentInsideFrame(page);
    await expectVisibleControlsHealthy(page, ".companion-yard-layout");
  });

  test("Trivia question surface stays below the live HUD on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await page.getByRole("button", { name: /Trivia/ }).click();
    await page.getByRole("button", { name: "Solo" }).click();
    await expect(page.locator(".question-panel")).toBeVisible({ timeout: 10000 });
    const layout = await page.evaluate(() => {
      const hud = document.querySelector(".trivia-shell .game-play-hud")?.getBoundingClientRect();
      const question = document.querySelector(".trivia-shell .question-panel")?.getBoundingClientRect();
      return {
        hudBottom: hud?.bottom ?? 0,
        questionTop: question?.top ?? 0,
      };
    });
    expect(layout.questionTop).toBeGreaterThanOrEqual(layout.hudBottom + 6);
    await expectVisibleControlsHealthy(page, ".trivia-shell");
  });

  test("Settlement HUD uses the generated hud-redesign runtime kit", async ({ page }) => {
    await boot(page);
    await page.getByRole("button", { name: /Town/ }).click();
    await expectBackgroundAsset(page.locator(".settlement-game-root .top-hud-final"), "/games/hud-redesign/settlement/hud-panel.png");
    await expectBackgroundAsset(page.locator(".settlement-game-root .bottom-nav"), "/games/hud-redesign/settlement/dock-panel.png");
    await expect(page.locator(".settlement-game-root .settlement-compact-detail")).toBeVisible();
    await page.locator(".settlement-game-root .settlement-compact-detail-open").click();
    await expectBackgroundAsset(page.locator(".settlement-game-root .right-panel").first(), "/games/hud-redesign/settlement/dialog-panel.png");
  });

  test("Settlement compact landscape keeps redesigned HUD controls inside the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await boot(page);
    await page.getByRole("button", { name: /Town/ }).click();
    await expect(page.locator(".settlement-game-root .settlement-canvas")).toBeVisible({ timeout: 30000 });
    await expectVisibleControlsHealthy(page, ".settlement-game-root");
  });
});
