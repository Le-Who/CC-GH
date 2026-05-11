import { test, expect } from "@playwright/test";
import {
  GARDEN_ECONOMY_VERSION,
  buildGardenDailyQuests,
  createGardenEconomyState,
  createDefaultPlayer,
  getGardenLevelReward,
  getGardenXpRequired,
} from "../../game-logic.js";
import { formatGardenGoldAmount } from "../../game-logic/garden-shelf-plants.js";
import { applyAction, buildSnapshot } from "../../routes/player.js";

function parsePlayerActionRequest(request) {
  try {
    return JSON.parse(request.postData() || "{}");
  } catch {
    return null;
  }
}

test.describe("Garden Shelf flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `garden_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      window.localStorage.removeItem("terrarium_save");
      window.localStorage.removeItem("garden_shelf_language");
      window.localStorage.removeItem("garden_shelf_name");
    });
  });

  async function contrastRatioFor(page, textSelector, surfaceSelector) {
    return page.locator(textSelector).first().evaluate((el, selector) => {
      const parseRgb = (value) => {
        const match = String(value).match(/rgba?\(([^)]+)\)/);
        if (!match) return [0, 0, 0, 1];
        const parts = match[1].split(",").map((part) => Number(part.trim()));
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts[3] == null ? 1 : parts[3]];
      };
      const blend = (fg, bg) => {
        const alpha = fg[3] + bg[3] * (1 - fg[3]);
        return [
          (fg[0] * fg[3] + bg[0] * bg[3] * (1 - fg[3])) / alpha,
          (fg[1] * fg[3] + bg[1] * bg[3] * (1 - fg[3])) / alpha,
          (fg[2] * fg[3] + bg[2] * bg[3] * (1 - fg[3])) / alpha,
          alpha,
        ];
      };
      const luminance = (rgb) => {
        const channels = rgb.slice(0, 3).map((value) => {
          const c = value / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const ratio = (fg, bg) => {
        const a = luminance(fg);
        const b = luminance(bg);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      const surface = selector ? el.closest(selector) : el.parentElement;
      const base = document.documentElement.dataset.uiTheme === "dark" ? [0, 0, 0, 1] : [255, 255, 255, 1];
      const bg = blend(parseRgb(getComputedStyle(surface || el).backgroundColor), base);
      const fg = blend(parseRgb(getComputedStyle(el).color), bg);
      return ratio(fg, bg);
    }, surfaceSelector);
  }

  async function dragTouch(page, from, to, steps = 8) {
    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: from.x, y: from.y, id: 1 }],
    });
    for (let index = 1; index <= steps; index += 1) {
      const progress = index / steps;
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{
          x: Math.round(from.x + (to.x - from.x) * progress),
          y: Math.round(from.y + (to.y - from.y) * progress),
          id: 1,
        }],
      });
      await page.waitForTimeout(16);
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await client.detach();
  }

  test("scrolls shelves when a vertical drag starts on a plant", async ({ browser }) => {
    const now = Date.now();
    const player = createDefaultPlayer(`garden_plant_scroll_${now}`, "Garden Plant Scroll", now);
    player.garden = {
      economyVersion: GARDEN_ECONOMY_VERSION,
      totalGoldEarned: 500,
      level: 18,
      xp: 120,
      xpRequired: getGardenXpRequired(18),
      levelReady: false,
      shelvesUnlocked: 4,
      plants: Array.from({ length: 8 }, (_, index) => ({
        id: `scroll-daisy-${index}`,
        type: index % 2 ? "basil" : "daisy",
        level: 6 + index,
        shelfIndex: Math.floor(index / 2),
        spotIndex: index % 2,
        phase: 3,
        phaseProgress: 0,
        lastTapped: now,
        lastWatered: now,
      })),
      claimedQuests: [],
      dailyQuests: buildGardenDailyQuests(createGardenEconomyState(now)),
      passiveGoldBuffer: 0,
      passiveXpBuffer: 0,
      lastTick: now,
      offlineEarnings: null,
      offlineXp: null,
    };
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `garden_plant_scroll_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      window.localStorage.removeItem("terrarium_save");
      window.localStorage.removeItem("garden_shelf_language");
      window.localStorage.removeItem("garden_shelf_name");
    });
    await page.route("**/api/player/snapshot", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(buildSnapshot(player)),
      });
    });
    await page.route("**/api/player/mutate", async (route) => {
      const body = parsePlayerActionRequest(route.request()) || {};
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          action: body.action,
          snapshot: buildSnapshot(player),
          goldDelta: body.payload?.amount || 0,
        }),
      });
    });

    try {
      await page.goto("/");
      await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
      const scroller = page.locator(".no-scrollbar").first();
      await expect(scroller).toBeVisible();
      await expect.poll(() => scroller.evaluate((node) => node.scrollHeight > node.clientHeight + 80)).toBe(true);
      await scroller.evaluate((node) => { node.scrollTop = 0; });

      const plantBox = await page.locator('[data-garden-plant="true"]').first().boundingBox();
      expect(plantBox).not.toBeNull();
      const detailsButtonBox = await page.locator('[data-plant-details-button="true"]').first().boundingBox();
      expect(detailsButtonBox).not.toBeNull();
      expect(detailsButtonBox.width).toBeGreaterThanOrEqual(44);
      expect(detailsButtonBox.height).toBeGreaterThanOrEqual(44);
      await dragTouch(
        page,
        { x: Math.round(plantBox.x + plantBox.width / 2), y: Math.round(plantBox.y + plantBox.height / 2) },
        { x: Math.round(plantBox.x + plantBox.width / 2), y: Math.round(plantBox.y + plantBox.height / 2 - 180) },
      );

      await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(40);
      await expect(page.locator(".garden-glass-sheet")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("does not fetch legacy Garden Shelf PNG base art when the runtime manifest is available", async ({ page }) => {
    const legacyBasePngRequests = [];
    page.on("request", (request) => {
      const url = request.url();
      if (/\/games\/garden-shelf\/assets_[^/?]+\.png(?:\?|$)/.test(url)) {
        legacyBasePngRequests.push(url);
      }
    });

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.locator('img[src*="/assets-runtime/garden-shelf/sign."]')).toBeVisible();
    await expect(page.locator('img[src*="/assets-runtime/garden-shelf/bottomPlank."]')).toBeVisible();
    await expect(page.locator('img[src*="/assets-runtime/garden-shelf/shelf."]').first()).toBeVisible();
    await expect.poll(() => legacyBasePngRequests).toEqual([]);
  });

  test("loads the Garden Shelf port and plants from the shelf panel", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();
    await expect(page.locator('img[src*="/assets-runtime/garden-shelf/sign."]')).toBeVisible();
    await expect(page.locator('img[src*="/assets-runtime/garden-shelf/bottomPlank."]')).toBeVisible();
    await expect(page.locator('img[src*="/assets-runtime/garden-shelf/shelf."]').first()).toBeVisible();
    await expect(page.getByText("Gold Balance")).toHaveCount(0);
    await expect(page.getByText("Garden Lv 1")).toBeVisible();
    await expect(page.locator(".stats-row")).toContainText("Garden XP");
    await expect(page.locator(".stats-row")).toContainText("Garden quests");
    await expect(page.locator(".garden-level-panel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Farm/ })).toHaveCount(0);
    const goldStat = page.locator(".stats-row .stat-chip").filter({ hasText: "Gold" });
    await expect(goldStat).toContainText("10,000");

    await page.locator(".stats-row .stat-chip").filter({ hasText: "Garden quests" }).click();
    const questDialog = page.locator(".garden-glass-menu[role='dialog']").filter({ hasText: "Garden quests" });
    await expect(questDialog).toBeVisible();
    const questBox = await questDialog.boundingBox();
    const viewport = page.viewportSize();
    expect(questBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(questBox.x).toBeGreaterThanOrEqual(0);
    expect(questBox.x + questBox.width).toBeLessThanOrEqual(viewport.width + 1);
    await questDialog.getByRole("button", { name: "Close settings" }).click();

    await page.getByRole("button", { name: "+" }).first().click();
    const panel = page.locator(".fixed.bottom-0").last();
    await expect(panel).toHaveClass(/garden-glass-sheet/);
    await expect(panel).toContainText("Seed Shop");
    await expect(panel).toContainText("Daisy");
    await expect(panel).toContainText("Lavender");
    await expect(panel).toContainText("Unlocks at Lv 4");
    await panel.locator("button").filter({ hasText: "2,500" }).click();

    await expect(page.getByTestId("garden-growth-timer")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("garden-phase-badge")).toHaveCount(0);
    await expect(page.getByTestId("garden-water-ready")).toBeVisible();
    await expect(goldStat).toContainText("7,500");

    await page.getByRole("button", { name: "Garden settings" }).click();
    await expect(page.locator(".garden-glass-menu")).toBeVisible();
    await expect(page.getByText("Settings")).toBeVisible();
    await page.getByRole("button", { name: "Russian" }).click();
    await expect(page.getByText("Мой сад")).toBeVisible();
    await expect(page.getByText("Ур. сада 1")).toBeVisible();
    await expect(page.locator(".stats-row")).toContainText("Опыт сада");
    await expect(page.getByRole("button", { name: /Блоки/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Камни/ })).toBeVisible();
    await expect(page.getByText("Настройки")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("keeps mature plant detail fitted and dismissible on phone-sized high-DPI layouts", async ({ browser }) => {
    const viewports = [
      { width: 320, height: 568, deviceScaleFactor: 2 },
      { width: 390, height: 844, deviceScaleFactor: 2 },
      { width: 414, height: 896, deviceScaleFactor: 2 },
    ];
    const now = Date.now();
    const player = createDefaultPlayer(`garden_mature_feedback_${now}`, "Garden Feedback", now);
    player.garden = {
      economyVersion: GARDEN_ECONOMY_VERSION,
      totalGoldEarned: 100,
      level: 12,
      xp: 120,
      xpRequired: getGardenXpRequired(12),
      levelReady: false,
      shelvesUnlocked: 1,
      plants: [{
        id: "mature-feedback-basil",
        type: "basil",
        level: 12,
        shelfIndex: 0,
        spotIndex: 0,
        phase: 3,
        phaseProgress: 0,
        lastTapped: 0,
        lastWatered: 0,
      }],
      lastTick: now,
      offlineEarnings: null,
      offlineXp: null,
    };

    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      let snapshot = buildSnapshot(player);

      await page.addInitScript(() => {
        window.localStorage.setItem("gh_dev_user_id", `garden_sheet_${Date.now()}_${Math.random().toString(36).slice(2)}`);
        window.localStorage.removeItem("terrarium_save");
        window.localStorage.removeItem("garden_shelf_language");
        window.localStorage.removeItem("garden_shelf_name");
      });
      await page.route("**/api/player/snapshot", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(snapshot),
        });
      });
      await page.route("**/api/player/mutate", async (route) => {
        const body = parsePlayerActionRequest(route.request()) || {};
        if (body.action === "garden.goldDelta") {
          snapshot = {
            ...snapshot,
            resources: {
              ...snapshot.resources,
              gold: Math.max(0, Math.floor(Number(snapshot.resources?.gold) || 0) + Math.trunc(Number(body.payload?.amount) || 0)),
            },
          };
        }
        if (body.action === "garden.sync") {
          snapshot = {
            ...snapshot,
            garden: body.payload?.state || snapshot.garden,
          };
        }
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            action: body.action,
            snapshot,
            goldDelta: body.payload?.amount || 0,
          }),
        });
      });

      const openDetailSheet = async () => {
        await page.getByRole("button", { name: "Plant details" }).first().tap();
        const sheet = page.locator(".garden-glass-sheet").last();
        await expect(sheet).toBeVisible();
        await expect(sheet).toHaveAttribute("role", "dialog");
        await expect(sheet).toHaveAttribute("aria-modal", "true");
        await expect.poll(async () => sheet.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const visual = window.visualViewport;
          return rect.bottom <= ((visual?.offsetTop || 0) + (visual?.height || window.innerHeight)) + 1
            && rect.top >= (visual?.offsetTop || 0) - 1;
        })).toBe(true);
        return sheet;
      };

      const assertSheetContract = async (sheet) => {
        const layout = await sheet.evaluate((node) => {
          const visual = window.visualViewport;
          const viewport = {
            left: visual?.offsetLeft || 0,
            top: visual?.offsetTop || 0,
            width: visual?.width || window.innerWidth,
            height: visual?.height || window.innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          };
          const rect = node.getBoundingClientRect();
          const close = node.querySelector('[aria-label="Close plant detail"]')?.getBoundingClientRect();
          const content = node.querySelector(".garden-sheet-content");
          const visible = (el) => {
            const styles = getComputedStyle(el);
            const box = el.getBoundingClientRect();
            return styles.display !== "none" && styles.visibility !== "hidden" && box.width > 0 && box.height > 0;
          };
          const smallButtons = [...node.querySelectorAll("button")]
            .filter(visible)
            .filter((button) => {
              const box = button.getBoundingClientRect();
              return box.width < 44 || box.height < 44;
            })
            .map((button) => button.getAttribute("aria-label") || button.textContent.trim());
          if (content) content.scrollTop = content.scrollHeight;
          const closeAfterScroll = node.querySelector('[aria-label="Close plant detail"]')?.getBoundingClientRect();
          return {
            viewport,
            sheet: { top: rect.top, bottom: rect.bottom, right: rect.right, left: rect.left },
            close: close ? { x: close.x, y: close.y, right: close.right, bottom: close.bottom } : null,
            closeAfterScroll: closeAfterScroll ? { x: closeAfterScroll.x, y: closeAfterScroll.y, right: closeAfterScroll.right, bottom: closeAfterScroll.bottom } : null,
            activeLabel: document.activeElement?.getAttribute("aria-label"),
            smallButtons,
          };
        });
        expect(layout.viewport.scrollWidth).toBeLessThanOrEqual(layout.viewport.innerWidth + 1);
        expect(layout.sheet.left).toBeGreaterThanOrEqual(layout.viewport.left - 1);
        expect(layout.sheet.right).toBeLessThanOrEqual(layout.viewport.left + layout.viewport.width + 1);
        expect(layout.sheet.top).toBeGreaterThanOrEqual(layout.viewport.top - 1);
        expect(layout.sheet.bottom).toBeLessThanOrEqual(layout.viewport.top + layout.viewport.height + 1);
        for (const close of [layout.close, layout.closeAfterScroll]) {
          expect(close).not.toBeNull();
          expect(close.x).toBeGreaterThanOrEqual(layout.viewport.left - 1);
          expect(close.y).toBeGreaterThanOrEqual(layout.viewport.top - 1);
          expect(close.right).toBeLessThanOrEqual(layout.viewport.left + layout.viewport.width + 1);
          expect(close.bottom).toBeLessThanOrEqual(layout.viewport.top + layout.viewport.height + 1);
        }
        expect(layout.activeLabel).toBe("Close plant detail");
        expect(layout.smallButtons).toEqual([]);
      };

      try {
        await page.goto("/");
        await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });

        const plantBox = await page.locator('[data-garden-plant="true"]').first().boundingBox();
        expect(plantBox).not.toBeNull();
        await page.touchscreen.tap(plantBox.x + plantBox.width / 2, plantBox.y + plantBox.height / 2);
        const shelfNote = page.locator(".garden-floating-note.reward").first();
        await expect(shelfNote).toBeVisible();
        await expect(shelfNote).toContainText(/G .* XP/);
        const shelfNoteFontSize = await shelfNote.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
        expect(shelfNoteFontSize).toBeGreaterThanOrEqual(14);
        await expect(page.locator(".garden-glass-sheet")).toHaveCount(0);

        let sheet = await openDetailSheet();
        await assertSheetContract(sheet);
        await sheet.getByRole("button", { name: "Care water" }).click();
        const detailNote = page.locator(".garden-detail-floating-note.reward").first();
        await expect(detailNote).toBeVisible();
        await expect(detailNote).toContainText(/G .* XP/);
        const detailNoteFontSize = await detailNote.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
        expect(detailNoteFontSize).toBeGreaterThanOrEqual(14);
        await sheet.locator(".garden-sheet-close").click();
        await expect(page.locator(".garden-glass-sheet")).toHaveCount(0);

        sheet = await openDetailSheet();
        await assertSheetContract(sheet);
        await page.keyboard.press("Escape");
        await expect(page.locator(".garden-glass-sheet")).toHaveCount(0);

        sheet = await openDetailSheet();
        await assertSheetContract(sheet);
        await page.touchscreen.tap(8, 8);
        await expect(page.locator(".garden-glass-sheet")).toHaveCount(0);
      } finally {
        await context.close();
      }
    }
  });

  test("keeps post-30 Level Up reachable across Telegram-style viewports", async ({ browser }) => {
    const viewports = [
      { name: "small-mobile", width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      { name: "common-mobile", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      { name: "large-mobile", width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      { name: "tablet-portrait", width: 768, height: 1024, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
      { name: "tablet-landscape", width: 1024, height: 768, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
      { name: "desktop-smoke", width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    ];

    for (const viewport of viewports) {
      const now = Date.now();
      const player = createDefaultPlayer(`garden_uncapped_${viewport.name}_${now}`, "Garden Uncapped", now);
      const starterGarden = createGardenEconomyState(now);
      player.garden = {
        economyVersion: GARDEN_ECONOMY_VERSION,
        totalGoldEarned: 0,
        level: 31,
        xp: getGardenXpRequired(31),
        xpRequired: getGardenXpRequired(31),
        levelReady: true,
        shelvesUnlocked: 1,
        claimedQuests: [],
        dailyQuests: starterGarden.dailyQuests,
        plants: [{
          id: `fern-${viewport.name}`,
          type: "fern",
          level: 42,
          shelfIndex: 0,
          spotIndex: 0,
          phase: 3,
          phaseProgress: 0,
          lastTapped: 0,
        }],
        passiveGoldBuffer: 0,
        passiveXpBuffer: 0,
        lastTick: now,
        offlineEarnings: null,
        offlineXp: null,
      };

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await page.addInitScript(() => {
        window.localStorage.setItem("gh_dev_user_id", `garden_uncapped_${Date.now()}_${Math.random().toString(36).slice(2)}`);
        window.localStorage.removeItem("terrarium_save");
        window.localStorage.removeItem("garden_shelf_language");
        window.localStorage.removeItem("garden_shelf_name");
      });
      await page.route("**/api/player/snapshot", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(buildSnapshot(player)),
        });
      });
      await page.route("**/api/player/mutate", async (route) => {
        const body = parsePlayerActionRequest(route.request()) || {};
        const result = await applyAction(player, body.action, body.payload || {});
        await route.fulfill({
          status: result.status,
          contentType: "application/json",
          body: JSON.stringify(result.body),
        });
      });

      await page.goto("/");
      await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("Garden Lv 31")).toBeVisible();
      const levelButton = page.locator(".stats-row .stat-chip.clickable").filter({ hasText: "Level Up" });
      await expect(levelButton).toContainText(`+${formatGardenGoldAmount(getGardenLevelReward(31))}`);

      const fit = await page.evaluate(() => {
        const chip = [...document.querySelectorAll(".stats-row .stat-chip")]
          .find((node) => node.textContent?.includes("Level Up"));
        const stats = document.querySelector(".stats-row");
        const viewport = window.visualViewport || { width: window.innerWidth, height: window.innerHeight };
        const chipRect = chip?.getBoundingClientRect();
        const statsRect = stats?.getBoundingClientRect();
        return {
          canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          chip: chipRect && {
            x: chipRect.x,
            y: chipRect.y,
            width: chipRect.width,
            height: chipRect.height,
            right: chipRect.right,
            bottom: chipRect.bottom,
          },
          stats: statsRect && {
            x: statsRect.x,
            y: statsRect.y,
            width: statsRect.width,
            height: statsRect.height,
            right: statsRect.right,
            bottom: statsRect.bottom,
          },
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
        };
      });

      expect(fit.canScrollX, `${viewport.name} should not create horizontal scroll`).toBe(false);
      expect(fit.chip, `${viewport.name} Level Up chip should exist`).not.toBeNull();
      expect(fit.chip.width, `${viewport.name} Level Up chip width`).toBeGreaterThanOrEqual(44);
      expect(fit.chip.height, `${viewport.name} Level Up chip height`).toBeGreaterThanOrEqual(44);
      expect(fit.chip.x, `${viewport.name} Level Up chip left`).toBeGreaterThanOrEqual(0);
      expect(fit.chip.right, `${viewport.name} Level Up chip right`).toBeLessThanOrEqual(fit.viewportWidth + 1);
      expect(fit.stats.bottom, `${viewport.name} HUD stats bottom`).toBeLessThanOrEqual(fit.viewportHeight + 1);

      await levelButton.click();
      await expect(page.getByText("Garden Lv 32")).toBeVisible();
      await expect(page.locator(".stats-row .stat-chip").filter({ hasText: "Garden XP" })).toContainText(`0/${getGardenXpRequired(32)}`);
      expect(player.garden.level).toBe(32);
      expect(player.garden.plants[0].level).toBe(42);
      expect(pageErrors).toEqual([]);

      await context.close();
    }
  });

  test("uses compositor-light mobile overlays for Garden Shelf panels", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile overlay budget is calibrated for coarse-pointer webviews.");
    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect.poll(() => page.evaluate(() => typeof window.__openGardenQuests)).toBe("function");

    await page.locator(".stats-row .stat-chip").filter({ hasText: "Garden quests" }).click();
    const questDialog = page.getByRole("dialog", { name: "Garden quests" });
    await expect(questDialog).toBeVisible();
    const questOverlayStyles = await questDialog.evaluate((dialog) => {
      const scrim = document.querySelector(".glass-scrim");
      const read = (element) => {
        const styles = window.getComputedStyle(element);
        return {
          backdropFilter: styles.backdropFilter,
          webkitBackdropFilter: styles.webkitBackdropFilter,
        };
      };
      return { dialog: read(dialog), scrim: scrim ? read(scrim) : null };
    });
    expect(questOverlayStyles.dialog.backdropFilter).toBe("none");
    expect(questOverlayStyles.scrim?.backdropFilter).toBe("none");
    await questDialog.getByRole("button", { name: "Close settings" }).click();

    await page.getByRole("button", { name: "+" }).first().click();
    const sheet = page.locator(".garden-glass-sheet").last();
    await expect(sheet).toBeVisible();
    const sheetBackdrop = await sheet.evaluate((element) => window.getComputedStyle(element).backdropFilter);
    expect(sheetBackdrop).toBe("none");
  });

  test("opens shell Garden quests with daily priority and protects repeated quest claims", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const player = createDefaultPlayer(`garden_quest_${Date.now()}`, "Garden Quest");
    const today = new Date().toISOString().slice(0, 10);
    const gardenState = {
      economyVersion: GARDEN_ECONOMY_VERSION,
      totalGoldEarned: 120,
      level: 2,
      xp: 0,
      xpRequired: getGardenXpRequired(2),
      levelReady: false,
      shelvesUnlocked: 1,
      plants: [{
        id: "daily-daisy",
        type: "daisy",
        level: 2,
        shelfIndex: 0,
        spotIndex: 0,
        phase: 3,
        phaseProgress: 0,
        lastTapped: 0,
      }],
      claimedQuests: ["first_plant"],
      dailyQuests: {
        date: today,
        claimed: [],
        stats: {
          taps: 12,
          waters: 12,
          plantsBought: 4,
          upgrades: 3,
          goldEarned: 80,
          xpEarned: 80,
          levelUps: 2,
        },
      },
      lastTick: Date.now(),
      offlineEarnings: null,
      offlineXp: null,
    };
    const dailyQuests = buildGardenDailyQuests(gardenState);
    const unlockedDaily = dailyQuests.filter((quest) => quest.unlocked && quest.complete);
    const claimedDaily = unlockedDaily[0];
    const claimableDaily = unlockedDaily.find((quest) => quest.id !== claimedDaily.id);
    expect(claimedDaily).toBeTruthy();
    expect(claimableDaily).toBeTruthy();
    gardenState.dailyQuests.claimed = [claimedDaily.id];
    player.garden = gardenState;
    let snapshot = buildSnapshot(player);
    let dailyClaimRequests = 0;

    await page.addInitScript(() => {
      window.localStorage.setItem("game_hub_ui_theme", "dark");
      window.localStorage.setItem("garden_shelf_language", "ru");
    });

    await page.route("**/api/player/snapshot", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(snapshot),
      });
    });

    await page.route("**/api/player/mutate", async (route) => {
      const body = parsePlayerActionRequest(route.request()) || {};
      if (body.action === "garden.goldDelta" && body.payload?.reason === `quest:${claimableDaily.id}`) {
        dailyClaimRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (body.action === "garden.goldDelta") {
        snapshot = {
          ...snapshot,
          resources: {
            ...snapshot.resources,
            gold: Math.max(0, Math.floor(Number(snapshot.resources?.gold) || 0) + Math.trunc(Number(body.payload?.amount) || 0)),
          },
        };
      }
      if (body.action === "garden.sync") {
        snapshot = {
          ...snapshot,
          garden: body.payload?.state || snapshot.garden,
        };
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          action: body.action,
          snapshot,
          goldDelta: body.payload?.amount || 0,
        }),
      });
    });

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".garden-quest-trigger")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => typeof window.__openGardenQuests)).toBe("function");
    await page.locator(".stats-row .stat-chip").filter({ hasText: "Квесты сада" }).click();
    const questDialog = page.getByRole("dialog", { name: "Квесты сада" });
    await expect(questDialog).toBeVisible();
    await expect(questDialog).toContainText("Дневной");
    await expect(questDialog).toContainText("Сюжетный");
    expect(await contrastRatioFor(page, ".garden-quest-card h3", ".garden-quest-card")).toBeGreaterThanOrEqual(4.5);

    const order = await page.locator(".garden-quest-card").evaluateAll((cards) => cards.map((card) => ({
      kind: card.getAttribute("data-quest-kind"),
      claimed: card.getAttribute("data-quest-claimed") === "true",
      locked: card.getAttribute("data-quest-locked") === "true",
    })));
    const findIndex = (predicate) => order.findIndex(predicate);
    const activeDailyIndex = findIndex((quest) => quest.kind === "daily" && !quest.claimed && !quest.locked);
    const activeStoryIndex = findIndex((quest) => quest.kind === "story" && !quest.claimed);
    const claimedDailyIndex = findIndex((quest) => quest.kind === "daily" && quest.claimed);
    const claimedStoryIndex = findIndex((quest) => quest.kind === "story" && quest.claimed);
    expect(activeDailyIndex).toBeGreaterThanOrEqual(0);
    expect(activeStoryIndex).toBeGreaterThan(activeDailyIndex);
    expect(claimedDailyIndex).toBeGreaterThan(activeStoryIndex);
    expect(claimedStoryIndex).toBeGreaterThan(claimedDailyIndex);

    const dailyQuest = page.locator(`.garden-quest-card[data-quest-id="${claimableDaily.id}"]`);
    const claimButton = dailyQuest.getByRole("button", { name: "Забрать" });
    await claimButton.click();
    await claimButton.click({ force: true });
    await expect(dailyQuest.getByRole("button", { name: "Получено" })).toBeVisible({ timeout: 10000 });
    expect(dailyClaimRequests).toBe(1);
    expect(pageErrors).toEqual([]);
  });

  test("restores Garden Shelf level and plants from the shared player state on another device", async ({ browser }) => {
    const userId = `garden_sync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const openDevice = async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.addInitScript((value) => {
        window.localStorage.setItem("gh_dev_user_id", value);
        window.localStorage.removeItem("terrarium_save");
        window.localStorage.removeItem("garden_shelf_language");
        window.localStorage.removeItem("garden_shelf_name");
      }, userId);
      await page.goto("/");
      await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
      return { context, page };
    };

    const first = await openDevice();
    await first.page.getByRole("button", { name: "+" }).first().click();
    const panel = first.page.locator(".fixed.bottom-0").last();
    await expect(panel).toContainText("Seed Shop");
    const syncAfterPlant = first.page.waitForResponse((response) => {
      if (!response.url().includes("/api/player/mutate")) return false;
      const body = parsePlayerActionRequest(response.request());
      return body?.action === "garden.sync" && body?.payload?.state?.plants?.length > 0;
    }, { timeout: 10000 });
    await panel.locator("button").filter({ hasText: "2,500" }).click();
    await expect(first.page.getByTestId("garden-growth-timer")).toBeVisible({ timeout: 10000 });
    await syncAfterPlant;
    await first.context.close();

    const second = await openDevice();
    await expect(second.page.getByTestId("garden-growth-timer")).toBeVisible({ timeout: 15000 });
    await expect(second.page.locator(".stats-row .stat-chip").filter({ hasText: "Garden quests" })).toBeVisible();
    const goldStat = second.page.locator(".stats-row .stat-chip").filter({ hasText: "Gold" });
    await expect(goldStat).toContainText("7,500");
    await second.context.close();
  });

  test("does not replay collected offline earnings from the shared player state", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    const userId = await page.evaluate(() => window.localStorage.getItem("gh_dev_user_id"));
    await page.evaluate(async ({ value, economyVersion, xpRequired }) => {
      const response = await fetch("/api/player/mutate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `dev ${value}`,
        },
        body: JSON.stringify({
          action: "garden.sync",
          payload: {
            state: {
              economyVersion,
              totalGoldEarned: 80,
              level: 2,
              xp: 80,
              xpRequired,
              levelReady: false,
              shelvesUnlocked: 1,
              plants: [],
              lastTick: Date.now(),
              offlineEarnings: 50,
              offlineXp: 10,
            },
          },
        }),
      });
      if (!response.ok) throw new Error(`garden sync failed: ${response.status}`);
    }, { value: userId, economyVersion: GARDEN_ECONOMY_VERSION, xpRequired: getGardenXpRequired(2) });

    await page.reload();
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Welcome Back!")).toHaveCount(0);
    await expect(page.getByText("Collect Gold")).toHaveCount(0);
    await expect(page.locator(".stats-row")).toContainText("Garden XP");
  });

  test("keeps generated offline reward visible until the player collects it", async ({ page }) => {
    const stableUserId = `garden_offline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await page.addInitScript((value) => {
      window.localStorage.setItem("gh_dev_user_id", value);
    }, stableUserId);
    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await page.evaluate(async ({ value, economyVersion, xpRequired }) => {
      const response = await fetch("/api/player/mutate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `dev ${value}`,
        },
        body: JSON.stringify({
          action: "garden.sync",
          payload: {
            state: {
              economyVersion,
              totalGoldEarned: 100,
              level: 13,
              xp: 100,
              xpRequired,
              levelReady: false,
              shelvesUnlocked: 1,
              plants: [{
                id: "offline-daisy",
                type: "daisy",
                level: 13,
                shelfIndex: 0,
                spotIndex: 0,
                phase: 3,
                phaseProgress: 0,
                lastTapped: 0,
              }],
              lastTick: Date.now() - 31 * 60_000,
              offlineEarnings: null,
              offlineXp: null,
            },
          },
        }),
      });
      if (!response.ok) throw new Error(`garden sync failed: ${response.status}`);
    }, { value: stableUserId, economyVersion: GARDEN_ECONOMY_VERSION, xpRequired: getGardenXpRequired(13) });

    await page.reload();
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Welcome Back!")).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: "Collect Gold" })).toBeVisible();
    await page.waitForTimeout(4200);
    await expect(page.getByText("Welcome Back!")).toBeVisible();
    await page.getByRole("button", { name: "Collect Gold" }).click();
    await expect(page.getByText("Welcome Back!")).toHaveCount(0);
  });

  test("does not show generated offline reward after a short background pause", async ({ page }) => {
    const stableUserId = `garden_short_pause_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await page.addInitScript((value) => {
      window.localStorage.setItem("gh_dev_user_id", value);
    }, stableUserId);
    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await page.evaluate(async ({ value, economyVersion, xpRequired }) => {
      const response = await fetch("/api/player/mutate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `dev ${value}`,
        },
        body: JSON.stringify({
          action: "garden.sync",
          payload: {
            state: {
              economyVersion,
              totalGoldEarned: 100,
              level: 13,
              xp: 100,
              xpRequired,
              levelReady: false,
              shelvesUnlocked: 1,
              plants: [{
                id: "short-pause-daisy",
                type: "daisy",
                level: 13,
                shelfIndex: 0,
                spotIndex: 0,
                phase: 3,
                phaseProgress: 0,
                lastTapped: 0,
              }],
              lastTick: Date.now() - 2 * 60_000,
              offlineEarnings: null,
              offlineXp: null,
            },
          },
        }),
      });
      if (!response.ok) throw new Error(`garden sync failed: ${response.status}`);
    }, { value: stableUserId, economyVersion: GARDEN_ECONOMY_VERSION, xpRequired: getGardenXpRequired(13) });

    await page.reload();
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Welcome Back!")).toHaveCount(0);
    await expect(page.getByText("Collect Gold")).toHaveCount(0);
  });
});
