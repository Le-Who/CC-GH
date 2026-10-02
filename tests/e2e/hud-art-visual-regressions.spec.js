import { test, expect } from "@playwright/test";
import { expectBloxCanvas, expectBloxLayout } from "./helpers/blox-v2.js";

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
  const start = page.getByRole("button", { name: "Start" });
  await expect(start).toBeVisible({ timeout: 10000 });
  await start.click();
  await expect(page.locator('.game-shell.shell-playing, [data-bb-phase="playing"], [data-m3-phase="playing"], [data-bx-phase="playing"]')).toBeVisible({ timeout: 10000 });
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
  test("Blox v2 HUD keeps labels readable and generated actions intact", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 720 }, isMobile: false, hasTouch: false });
    const { page, pageErrors } = await bootPage(context, "blox_desktop");
    try {
      await page.getByRole("button", { name: "Blox" }).click();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await expectBloxCanvas(page);
      await expectBloxLayout(page);
      const stats = page.locator(".bx-hud .bx-metric");
      await expect(stats).toHaveCount(3);
      await expect(stats.locator("span")).toHaveText(["Score", "Lines", "Reward"]);
      await expect(page.locator(".bx-hud .bx-progress")).toHaveCount(1);
      await expect.poll(() => page.locator(".bx-actions img").evaluateAll((images) => images.length === 2 && images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
      const actions = await page.locator(".bx-actions button").evaluateAll((buttons) => buttons.map((button) => {
        const style = getComputedStyle(button), rect = button.getBoundingClientRect(), image = button.querySelector("img");
        return { width: rect.width, height: rect.height, skin: style.borderImageSource, label: button.getAttribute("aria-label"), imageLoaded: !!image?.complete && image.naturalWidth > 0 };
      }));
      expect(actions).toHaveLength(2);
      for (const action of actions) {
        expect(action.width).toBeGreaterThanOrEqual(44);
        expect(action.height).toBeGreaterThanOrEqual(44);
        expect(action.skin).toContain("/games/blox-v2/button.webp");
        expect(action.label).toBeTruthy();
        expect(action.imageLoaded).toBe(true);
      }
      await expect(page.locator(".bx-rotate-count")).toHaveText("3");
      const rotate = page.waitForRequest((request) => request.url().includes("/api/player/mutate") && request.postDataJSON()?.action === "blox.rotate");
      await page.locator('[data-blox-rotate="true"]').click();
      await rotate;
      await expect(page.locator(".bx-rotate-count")).toHaveText("2");
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("Gem Crush mobile HUD keeps boosters in a thumb-reachable bottom dock", async ({ browser, baseURL }) => {
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
      await expect(page.locator(".m3-tools")).toBeVisible();
      await expect(page.locator(".m3-tools [data-match3-booster]")).toHaveCount(4);
      await expect(page.locator(".m3-tools [data-match3-shuffle]")).toHaveCount(1);
      await expect(page.locator(".m3-hud")).toContainText("Score");
      await expect(page.locator(".m3-hud")).toContainText("Moves");
      await expect(page.locator(".m3-hud")).toContainText("Combo");
      await expect(page.locator(".m3-hud")).toContainText("Reward");
      await page.evaluate(() => document.fonts.ready);
      const stats = await page.locator(".m3-score, .m3-turns, .m3-combo, .m3-combo-reward > span").evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        const value = node.querySelector("strong, b")?.getBoundingClientRect();
        return {text: node.textContent, width: rect.width, height: rect.height,
          clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight,
          lines: [...node.children].map(child => ({ text: child.textContent, font: getComputedStyle(child).font, lineHeight: getComputedStyle(child).lineHeight, height: child.getBoundingClientRect().height })),
          overflows: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1,
          valueInside: !!value && value.left >= rect.left - 1 && value.right <= rect.right + 1 && value.top >= rect.top - 1 && value.bottom <= rect.bottom + 1};
      }));
      expect(stats).toHaveLength(4);
      for (const item of stats) {
        expect(item.width, `${item.text} remains visible`).toBeGreaterThan(0);
        expect(item.valueInside, `${item.text} value stays within its metric`).toBe(true);
        expect(item.overflows, `${item.text} remains readable: ${JSON.stringify(item)}`).toBe(false);
      }
      const metrics = await page.locator(".m3-tools .m3-tool").evaluateAll(buttons => buttons.map(button => {
        const box = button.getBoundingClientRect();
        const icon = button.querySelector("img");
        const label = button.querySelector(".m3-tool-label");
        const count = button.querySelector(".m3-count");
        const iconBox = icon?.getBoundingClientRect(), countBox = count?.getBoundingClientRect();
        return {label: button.getAttribute("aria-label"), width: box.width, height: box.height,
          skin: getComputedStyle(button).borderImageSource, iconReady: icon?.complete && icon.naturalWidth > 0,
          labelClipped: label && label.scrollWidth > label.clientWidth + 1,
          countReadable: !!countBox && countBox.width > 0 && countBox.height > 0 && countBox.right <= box.right + 1,
          iconInside: !!iconBox && iconBox.left >= box.left && iconBox.right <= box.right};
      }));
      expect(metrics).toHaveLength(5);
      for (const item of metrics) {
        expect(item.width, item.label).toBeGreaterThanOrEqual(44);
        expect(item.height, item.label).toBeGreaterThanOrEqual(44);
        expect(item.skin).toContain("/games/match3-v2/tool-card-base.webp");
        expect(item.iconReady && item.iconInside && item.countReadable).toBe(true);
        expect(item.labelClipped).toBe(false);
      }
      const layout = await page.locator('[data-game-shell="match3"]').evaluate(shell => {
        const canvas = shell.querySelector("canvas"), dock = shell.querySelector(".m3-tools");
        const canvasRect = canvas.getBoundingClientRect(), dockRect = dock.getBoundingClientRect();
        return {boardBottom: canvasRect.top + Number(canvas.dataset.match3BoardTop) + Number(canvas.dataset.match3BoardSize),
          dockTop: dockRect.top, dockBottom: dockRect.bottom, viewportHeight: innerHeight};
      });
      expect(layout.dockBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
      expect(layout.boardBottom).toBeLessThanOrEqual(layout.dockTop - 4);
      await expect(page.locator(".m3-hud .m3-reward-progress")).toHaveCount(1);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("Bubbo mobile dock keeps controls and stats separated inside the tray art", async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const { page, pageErrors } = await bootPage(context, "bubbo_mobile");
    try {
      await startGame(page, "Bubbo");
      await expect(page.locator('[data-game-shell="bubbo"] canvas')).toBeVisible();
      await expect(page.locator(".bb-powers [data-bubbo-powerup]")).toHaveCount(3);
      await expect(page.locator(".bb-powers .bb-power")).toHaveCount(4);
      const metrics = await page.locator(".bb-stage").evaluate(stage => {
        const hud = stage.querySelector(".bb-hud"), actions = stage.querySelector(".bb-powers"), field = stage.querySelector(".bb-field");
        const hudBox = hud.getBoundingClientRect(), actionsBox = actions.getBoundingClientRect(), fieldBox = field.getBoundingClientRect();
        return {hud: hudBox.toJSON(), actions: actionsBox.toJSON(), field: fieldBox.toJSON(),
          hudOverflow: hud.scrollWidth > hud.clientWidth + 1 || hud.scrollHeight > hud.clientHeight + 1,
          buttons: [...actions.querySelectorAll("button")].map(button => {
            const box = button.getBoundingClientRect(), icon = button.querySelector("img");
            const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return {label: button.getAttribute("aria-label"), width: box.width, height: box.height,
              hit: !!hit && (hit === button || button.contains(hit)), art: icon?.complete && icon.naturalWidth > 0};
          })};
      });
      expect(metrics.hudOverflow).toBe(false);
      expect(metrics.hud.bottom).toBeLessThanOrEqual(metrics.field.top + 1);
      expect(metrics.field.bottom).toBeLessThanOrEqual(metrics.actions.top + 1);
      for (const button of metrics.buttons) {
        expect(button.width, button.label).toBeGreaterThanOrEqual(44);
        expect(button.height, button.label).toBeGreaterThanOrEqual(44);
        expect(button.hit && button.art, button.label).toBe(true);
      }
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
