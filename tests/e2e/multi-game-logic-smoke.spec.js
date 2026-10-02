import { test, expect } from "@playwright/test";
import { expectMergeV3, mergePanel, closeMergePanel, expectMergeControlsReachable, researchMergePair, mergeSnapshot, confirmMergeQuote, confirmedMergeClick } from "./helpers/mergeV3.js";
import {
  GARDEN_ECONOMY_VERSION,
  GARDEN_STARTER_GOLD,
  createDefaultPlayer,
  getGardenLevelReward,
  getGardenXpRequired,
} from "../../game-logic.js";
import { formatGardenGoldAmount } from "../../game-logic/garden-shelf-plants.js";
import { applyAction, buildSnapshot } from "../../routes/player.js";
import { BUBBO_COLS, BUBBO_ROWS, advanceBubboPressure, generateBubboWave, settleFloatingBubbo } from "../../src/game-core/bubbo/engine.js";
import { BOARD_SIZE, attemptMatch3Move } from "../../src/game-core/match3/engine.js";

function stableMatch3Board() {
  const types = ["fire", "water", "earth", "air", "light", "dark"];
  return Array.from({ length: BOARD_SIZE }, (_, y) =>
    Array.from({ length: BOARD_SIZE }, (_, x) => types[(x * 2 + y * 3 + (y % 2)) % types.length]),
  );
}

function parsePlayerActionRequest(request) {
  try {
    return JSON.parse(request.postData() || "{}");
  } catch {
    return null;
  }
}

async function boot(page, prefix) {
  const userId = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await page.addInitScript((value) => {
    window.localStorage.setItem("gh_dev_user_id", value);
    window.localStorage.removeItem("terrarium_save");
    window.localStorage.removeItem("garden_shelf_language");
    window.localStorage.removeItem("garden_shelf_name");
  }, userId);
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto("/");
  await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
  return pageErrors;
}

async function mutate(page, action, payload = {}) {
  const result = await page.evaluate(async ({ action, payload }) => {
    const userId = window.localStorage.getItem("gh_dev_user_id");
    const response = await fetch("/api/player/mutate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `dev ${userId}`,
      },
      body: JSON.stringify({ action, payload }),
    });
    return { ok: response.ok, status: response.status, body: await response.json() };
  }, { action, payload });
  expect(result.ok, `${action} should succeed: ${JSON.stringify(result.body)}`).toBe(true);
  return result.body;
}

async function snapshot(page) {
  const result = await page.evaluate(async () => {
    const userId = window.localStorage.getItem("gh_dev_user_id");
    const response = await fetch("/api/player/snapshot", {
      headers: { Authorization: `dev ${userId}` },
    });
    return { ok: response.ok, status: response.status, body: await response.json() };
  });
  expect(result.ok, `snapshot should succeed: ${JSON.stringify(result.body)}`).toBe(true);
  return result.body;
}

async function canvasIsNonBlank(page) {
  await expect.poll(() => page.locator(".active-game-frame canvas").evaluate((canvas) => canvas.toDataURL("image/png").length), { timeout: 15000 }).toBeGreaterThan(2000);
}

async function expectAbove(first, second, label, gap = 4) {
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox, `${label} first surface should be measurable`).toBeTruthy();
  expect(secondBox, `${label} second surface should be measurable`).toBeTruthy();
  expect(firstBox.y + firstBox.height, `${label} should not overlap`).toBeLessThanOrEqual(secondBox.y - gap);
}

test.describe("CC-GH multi-game logic smoke", () => {
  test("Match-3 activates chained specials and still renders the browser game", async ({ page }) => {
    const board = stableMatch3Board();
    board[0][0] = "special_row";
    board[0][3] = "special_column";

    const result = attemptMatch3Move(board, { x: 0, y: 0 }, { x: 1, y: 0 });

    expect(result.valid).toBe(true);
    expect(result.steps[0].triggeredSpecials.map((cell) => `${cell.x}:${cell.y}:${cell.type}`).sort()).toEqual([
      "1:0:special_row",
      "3:0:special_column",
    ]);
    expect(result.steps[0].cleared.some((cell) => cell.x === 3 && cell.y === BOARD_SIZE - 1)).toBe(true);

    const pageErrors = await boot(page, "match3_chain_smoke");
    await page.getByRole("button", { name: /Gems/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".m3-hud")).toContainText("Score");
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });

  test("Merge V3 research records knowledge without consuming physical stock", async ({ page }) => {
    const pageErrors = await boot(page, 'merge_v3_research');
    await page.getByRole('button', { name: /Merge/ }).click();
    const before = await mergeSnapshot(page);
    const { body } = await researchMergePair(page, 'cloud', 'ember');
    expect(body.mergeLab.result.itemId).toBe('spark');
    const after = await mergeSnapshot(page);
    expect(after.merge.knowledge.recipeIds).toContain('cloud_ember_spark');
    expect(after.merge.alchemyEssence).toBe(before.merge.alchemyEssence + 4);
    expect(after.merge.stock).toEqual(before.merge.stock);
    await mergePanel(page, 'journal');
    await page.getByTestId('ml-journal').locator('select').selectOption('spark');
    await expect(page.getByTestId('ml-journal')).toContainText('Spark');
    expect(pageErrors).toEqual([]);
  });

  test("Merge V3 mobile supply quote uses real stock and exact free-charge debit", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const pageErrors = await boot(page, 'merge_v3_supply');
    await page.getByRole('button', { name: /Merge/ }).click();
    await mergePanel(page, 'supplies');
    await confirmedMergeClick(page, page.getByTestId('ml-claim-charges'), 'claimFreeCharges');
    const before = await mergeSnapshot(page);
    await page.getByTestId('ml-supply-material').selectOption('glass');
    await page.getByTestId('ml-claim-material').click();
    await confirmMergeQuote(page, 'claimSupply');
    const after = await mergeSnapshot(page);
    expect(after.merge.freeTapCharges).toBe(before.merge.freeTapCharges - 1);
    expect(after.merge.stock.glass).toBe((before.merge.stock.glass || 0) + 1);
    expect(after.resources.gachaTokens).toBe(before.resources.gachaTokens);
    await expectMergeControlsReachable(page, page.getByTestId('ml-drawer').locator('.ml-dialog-heading button'));
    await page.screenshot({ path: testInfo.outputPath('merge-v3-mobile-supply.png'), fullPage: false });
    expect(pageErrors).toEqual([]);
  });

  test("Merge V3 Russian dialogs stay readable and return focus to the opener", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem('gh_dev_user_id', `merge_v3_ru_${Date.now()}`);
      localStorage.setItem('garden_shelf_language', 'ru');
    });
    await page.goto('/?tab=merge');
    await expect(page.locator('.status-dot.ready')).toBeVisible({ timeout: 15000 });
    await expectMergeV3(page);
    await expect(page.locator('.ml-root')).toHaveAttribute('lang', 'ru');
    for (const panel of ['samples', 'journal', 'projects', 'supplies']) {
      const dialog = await mergePanel(page, panel);
      await expectMergeControlsReachable(page, dialog.locator('.ml-dialog-heading button'));
      await page.screenshot({ path: testInfo.outputPath(`merge-v3-ru-${panel}.png`), fullPage: false });
      await closeMergePanel(page, 'escape');
      await expect(page.getByTestId(`ml-open-${panel}`)).toBeFocused();
    }
  });

  test("Bubbo pressure settlement drops unsupported islands and the scene remains visible", async ({ page }) => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    board[6][2] = "amber";

    const advanced = advanceBubboPressure({
      board,
      seed: "playwright-orphan",
      waveIndex: 5,
      pendingRow: generateBubboWave("playwright-orphan", 5),
      pressure: 9500,
    }, 100);

    expect(advanced.dropped.some((cell) => cell.row === 6 && cell.col === 2 && cell.color === "amber")).toBe(true);
    expect(settleFloatingBubbo(advanced.board, advanced.rowOffset)).toEqual([]);

    const pageErrors = await boot(page, "bubbo_drop_smoke");
    await page.getByRole("button", { name: /Bubbo/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".bb-stage")).toHaveAttribute("data-bb-phase", "playing");
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });

  test("Garden v2 reset migration and Level Up action are visible in the app", async ({ page }) => {
    const pageErrors = await boot(page, "garden_v2_smoke");
    await expect(page.getByText("My Garden")).toBeVisible();

    await mutate(page, "garden.sync", {
      state: {
        totalGoldEarned: 600,
        level: 18,
        xp: 1200,
        shelvesUnlocked: 4,
        plants: [{ id: "legacy", type: "lavender", level: 12, shelfIndex: 0, spotIndex: 0, phase: 3, phaseProgress: 0 }],
        lastTick: Date.now(),
      },
    });

    await page.reload();
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".stats-row .stat-chip").filter({ hasText: "Gold" })).toContainText("12,000");
    const resetSnapshot = await snapshot(page);
    expect(resetSnapshot.resources.gold).toBe(GARDEN_STARTER_GOLD);
    expect(resetSnapshot.garden.economyVersion).toBe(GARDEN_ECONOMY_VERSION);
    expect(resetSnapshot.garden.plants).toHaveLength(1);
    await expect(page.locator(".stats-row .stat-chip").filter({ hasText: "Garden quests" })).toBeVisible();
    await expect(page.locator(".stats-row .stat-chip").filter({ hasText: "Garden XP" })).toContainText(`0/${getGardenXpRequired(1)}`);

    await mutate(page, "garden.sync", {
      state: {
        economyVersion: GARDEN_ECONOMY_VERSION,
        totalGoldEarned: 0,
        level: 1,
        xp: getGardenXpRequired(1),
        xpRequired: getGardenXpRequired(1),
        levelReady: true,
        shelvesUnlocked: 1,
        plants: [],
        passiveGoldBuffer: 0,
        passiveXpBuffer: 0,
        lastTick: Date.now(),
        offlineEarnings: null,
        offlineXp: null,
      },
    });

    await page.reload();
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Garden quests/ })).toBeVisible();
    const levelButton = page.locator(".stats-row .stat-chip.clickable").filter({ hasText: "Level Up" });
    await expect(levelButton).toContainText(`+${formatGardenGoldAmount(getGardenLevelReward(1))}`);
    let levelUpRequests = 0;
    await page.route("**/api/player/mutate", async (route) => {
      const body = parsePlayerActionRequest(route.request());
      if (body?.action === "garden.levelUp") {
        levelUpRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await route.continue();
    });
    const levelResponsePromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/player/mutate")) return false;
      return parsePlayerActionRequest(response.request())?.action === "garden.levelUp";
    }, { timeout: 10000 });
    await levelButton.dblclick({ force: true });
    const levelBody = await (await levelResponsePromise).json();
    expect(levelBody.reward).toBe(getGardenLevelReward(1));
    expect(levelBody.garden.level).toBe(2);
    expect(levelUpRequests).toBe(1);
    await expect(page.locator(".garden-modal-card")).toContainText(formatGardenGoldAmount(getGardenLevelReward(1)));
    await expect(page.locator(".stats-row .stat-chip").filter({ hasText: "Garden XP" })).toContainText(`0/${getGardenXpRequired(2)}`);
    expect(pageErrors).toEqual([]);
  });
});
