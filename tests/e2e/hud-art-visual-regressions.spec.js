import { test, expect } from "@playwright/test";

async function bootPage(context, label) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript((testLabel) => {
    window.localStorage.setItem("garden_shelf_language", "en");
    window.localStorage.setItem("gh_dev_user_id", `hud_art_guard_${testLabel}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    window.localStorage.removeItem("terrarium_save");
  }, label);
  await page.goto("/");
  await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
  return { page, pageErrors };
}

async function startGame(page, tabName) {
  await page.getByRole("button", { name: tabName }).click();
  await page.getByRole("button", { name: "Start" }).click();
}

function visibleHudButtonMetrics(buttons) {
  return buttons.map((button) => {
    const styles = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    const span = button.querySelector("span");
    const spanStyles = span ? getComputedStyle(span) : null;
    const spanRect = span?.getBoundingClientRect();
    const spanVisible = !!span
      && spanStyles?.display !== "none"
      && spanStyles?.visibility !== "hidden"
      && (spanRect?.width || 0) > 0
      && (spanRect?.height || 0) > 0;
    return {
      text: button.textContent.trim(),
      width: rect.width,
      height: rect.height,
      ratio: rect.width / Math.max(1, rect.height),
      backgroundColor: styles.backgroundColor,
      backgroundImage: styles.backgroundImage,
      imageLayerCount: (styles.backgroundImage.match(/url\(/g) || []).length,
      spanVisible,
      spanOverflows: spanVisible ? span.scrollWidth > span.clientWidth + 1 : false,
    };
  });
}

function visibleHudStatMetrics(stats) {
  return stats.map((stat) => {
    const rect = stat.getBoundingClientRect();
    const label = stat.querySelector(".game-play-stat-label");
    const labelStyles = label ? getComputedStyle(label) : null;
    const labelRect = label?.getBoundingClientRect();
    const icon = stat.querySelector(".game-play-stat-icon")?.getBoundingClientRect();
    const value = stat.querySelector("strong")?.getBoundingClientRect();
    return {
      id: stat.getAttribute("data-stat-id"),
      labelVisible: !!label
        && labelStyles?.display !== "none"
        && labelStyles?.visibility !== "hidden"
        && (labelRect?.width || 0) > 2
        && (labelRect?.height || 0) > 2,
      hasTooltipLabel: !!stat.getAttribute("data-tooltip"),
      iconInside:
        !!icon
        && icon.width >= 22
        && icon.height >= 22
        && icon.left >= rect.left + 3
        && icon.right <= rect.right - 3
        && icon.top >= rect.top + 3
        && icon.bottom <= rect.bottom - 3,
      valueInside:
        !!value
        && value.left >= rect.left + 24
        && value.right <= rect.right - 3
        && value.top >= rect.top + 3
        && value.bottom <= rect.bottom - 3,
      overflows: stat.scrollWidth > stat.clientWidth + 1 || stat.scrollHeight > stat.clientHeight + 1,
    };
  });
}

test.describe("HUD art visual regression guards", () => {
  test("Blox live HUD uses generated stat icons and tooltip-only compact labels", async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1280, height: 720 },
      isMobile: false,
      hasTouch: false,
    });
    const { page, pageErrors } = await bootPage(context, "blox_desktop");
    try {
      await startGame(page, "Blox");
      await expect(page.locator('[data-game-shell="blox"] canvas')).toBeVisible();
      await expect(page.locator(".blox-play-hud .game-play-stat")).toHaveCount(3);

      const stats = await page.locator(".blox-play-hud .game-play-stat").evaluateAll(visibleHudStatMetrics);
      expect(stats.map((item) => item.id)).toEqual(["score", "lines", "reward"]);
      for (const item of stats) {
        expect(item.labelVisible, `${item.id} label must not push the compact stat icon`).toBe(false);
        expect(item.hasTooltipLabel, `${item.id} should retain a tooltip/accessibility label`).toBe(true);
        expect(item.iconInside, `${item.id} icon should sit inside the generated chip`).toBe(true);
        expect(item.valueInside, `${item.id} value should sit inside the generated chip`).toBe(true);
        expect(item.overflows, `${item.id} compact stat should not overflow its art`).toBe(false);
      }

      const scoreStat = page.locator('.blox-play-hud .game-play-stat[data-stat-id="score"]');
      await scoreStat.dispatchEvent("pointerdown");
      await expect(page.locator(".blox-play-hud .press-tooltip", { hasText: "Score" })).toBeVisible();
      await scoreStat.dispatchEvent("pointerup");
      await expect(page.locator(".blox-play-hud .press-tooltip")).toHaveCount(0);

      const metrics = await page.locator(".blox-play-hud .game-play-actions .panel-button").evaluateAll(visibleHudButtonMetrics);
      expect(metrics.length).toBeGreaterThanOrEqual(1);
      for (const item of metrics) {
        expect(item.backgroundColor, `${item.text} must not expose a CSS fallback color behind transparent art`).toBe("rgba(0, 0, 0, 0)");
        expect(item.imageLayerCount, `${item.text} should use exactly one art image layer`).toBe(1);
        expect(item.ratio, `${item.text} compact action should stay square`).toBeGreaterThanOrEqual(0.9);
        expect(item.ratio, `${item.text} compact action should stay square`).toBeLessThanOrEqual(1.1);
        expect(item.spanVisible, `${item.text} compact action should not reserve hidden label space`).toBe(false);
      }

      await expect(page.locator('.blox-play-hud .game-play-stats [data-stat-id="reward"] .game-play-stat-progress')).toHaveCount(1);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("Gem Crush mobile HUD uses square icon art for icon-only actions and keeps reward progress visible", async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const { page, pageErrors } = await bootPage(context, "match3_mobile");
    try {
      await startGame(page, "Gems");
      await expect(page.locator('[data-game-shell="match3"] canvas')).toBeVisible();

      const stats = await page.locator(".match3-scene-hud .game-play-stat").evaluateAll(visibleHudStatMetrics);
      expect(stats.map((item) => item.id)).toEqual(["score", "moves", "combo", "reward"]);
      for (const item of stats) {
        expect(item.labelVisible, `${item.id} label must not be visible in compact mobile HUD`).toBe(false);
        expect(item.iconInside, `${item.id} icon should stay centered in the stat chip`).toBe(true);
        expect(item.overflows, `${item.id} compact stat should not overflow its art`).toBe(false);
      }

      const metrics = await page.locator(".match3-scene-hud .game-play-actions .panel-button").evaluateAll(visibleHudButtonMetrics);
      expect(metrics.length).toBeGreaterThanOrEqual(2);
      for (const item of metrics) {
        expect(item.backgroundColor, `${item.text} must not expose a CSS fallback color behind transparent icon art`).toBe("rgba(0, 0, 0, 0)");
        expect(item.backgroundImage, `${item.text} must use square icon badge art on compact HUD`).toContain("/icon-badge.png");
        expect(item.ratio, `${item.text} compact action should stay square`).toBeGreaterThanOrEqual(0.9);
        expect(item.ratio, `${item.text} compact action should stay square`).toBeLessThanOrEqual(1.1);
        expect(item.spanVisible, `${item.text} compact action should not reserve hidden label space`).toBe(false);
      }

      await expect(page.locator('.match3-scene-hud .game-play-stats [data-stat-id="reward"] .game-play-stat-progress')).toHaveCount(1);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
