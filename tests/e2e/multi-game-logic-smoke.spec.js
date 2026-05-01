import { test, expect } from "@playwright/test";
import {
  GARDEN_ECONOMY_VERSION,
  GARDEN_STARTER_GOLD,
  MERGE_EXCHANGE_OFFERS,
  MERGE_FREE_TAP_RECHARGE_MS,
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
  const dataUrlLength = await page.locator(".pixi-host canvas").evaluate((canvas) => canvas.toDataURL("image/png").length);
  expect(dataUrlLength).toBeGreaterThan(2000);
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
    await expect(page.locator(".game-play-hud")).toContainText("Gem Crush");
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });

  test("Merge resolves alchemy recipes and exposes the compact recipe book", async ({ page }) => {
    const player = createDefaultPlayer("merge-recipe-smoke", "Merge");
    player.merge.board[0][0] = { id: "sand", chainId: "earth", level: 2 };
    player.merge.board[0][1] = { id: "flame", chainId: "fire", level: 1 };

    const recipe = await applyAction(player, "merge.merge", { fromR: 0, fromC: 0, toR: 0, toC: 1 });

    expect(recipe.status).toBe(200);
    expect(recipe.body.recipeId).toBe("sand_flame_glass");
    expect(player.merge.board[0][1]).toEqual({ id: "glass", chainId: "alchemy", level: 2 });

    const pageErrors = await boot(page, "merge_recipe_book_smoke");
    await page.getByRole("button", { name: /Merge/ }).click();
    await page.locator(".merge-library-rail button").filter({ hasText: "Recipe Book" }).click();
    await expect(page.locator(".merge-recipe-book")).toContainText("Germination");
    await expect(page.locator(".merge-recipe-book")).toContainText("Undiscovered reaction");
    await expect(page.locator(".merge-recipe-book")).toContainText("??? + ??? -> ???");
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });

  test("Merge mobile dock keeps live controls readable and updates discovery drawers", async ({ page }, testInfo) => {
    const now = Date.now();
    const offer = MERGE_EXCHANGE_OFFERS.find((candidate) => candidate.id === "yard_treats_small");
    expect(offer).toBeTruthy();
    const player = createDefaultPlayer(`merge-mobile-live-${now}`, "Merge", now);
    player.merge.board[0][0] = { id: "sand", chainId: "earth", level: 2 };
    player.merge.board[0][1] = { id: "flame", chainId: "fire", level: 1 };
    player.merge.discoveredItems = (player.merge.discoveredItems || []).filter((id) => id !== "glass");
    player.merge.discoveredRecipes = (player.merge.discoveredRecipes || []).filter((id) => id !== "sand_flame_glass");
    player.merge.alchemyEssence = offer.cost;
    player.merge.freeTapCharges = 0;
    player.merge.lastFreeTaps = now - MERGE_FREE_TAP_RECHARGE_MS;

    await page.addInitScript((userId) => {
      window.localStorage.setItem("gh_dev_user_id", userId);
    }, player.id);
    await page.route("**/api/player/snapshot", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(buildSnapshot(player, { now })),
      });
    });
    await page.route("**/api/player/mutate", async (route) => {
      const body = parsePlayerActionRequest(route.request()) || {};
      const result = await applyAction(player, body.action, body.payload || {}, { now: Date.now() });
      await route.fulfill({
        status: result.status,
        contentType: "application/json",
        body: JSON.stringify(result.body),
      });
    });

    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /Merge/ }).click();
    await expect(page.locator(".merge-action-dock")).toBeVisible();
    await canvasIsNonBlank(page);

    const canvas = page.locator(".pixi-host canvas");
    await expect(canvas).toHaveAttribute("data-merge-board-size", /[0-9]/);
    const layout = await canvas.evaluate((node) => ({
      left: Number(node.dataset.mergeBoardLeft),
      top: Number(node.dataset.mergeBoardTop),
      size: Number(node.dataset.mergeBoardSize),
      cell: Number(node.dataset.mergeBoardCell),
    }));
    expect(layout.size).toBeGreaterThan(300);
    expect(layout.cell).toBeGreaterThan(30);

    const freeTapButton = page.locator(".merge-action-strip .merge-free-taps-button");
    await expect(freeTapButton).toContainText(/Claim \+/);
    await expect(freeTapButton.locator("span")).toBeVisible();
    await freeTapButton.click();
    await expect(page.locator(".merge-generator-hint")).toContainText(/free taps/i);
    await page.locator(".merge-action-dock").getByRole("button", { name: /^Generate$/ }).click();
    await expect(page.locator(".merge-action-dock")).toContainText(/Generate|Next tap|Claim free taps|free taps/i);

    await page.locator(".merge-library-rail button").filter({ hasText: "Exchange" }).click();
    const exchangeDrawer = page.locator(".merge-scene-drawer");
    await expect(exchangeDrawer).toContainText("50 Essence ready");
    const exchangeResponsePromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/player/mutate")) return false;
      return parsePlayerActionRequest(response.request())?.action === "merge.exchange";
    });
    await exchangeDrawer.getByRole("button", { name: /Treat bundle/ }).click();
    const exchangeBody = await (await exchangeResponsePromise).json();
    expect(exchangeBody.reward.treats).toBe(offer.reward.treats);
    await expect(exchangeDrawer).toContainText("0 Essence ready");
    await exchangeDrawer.getByRole("button", { name: /^Close$/ }).click();
    await expect(page.locator(".merge-action-dock")).toBeVisible();
    await page.locator(".merge-library-rail button").filter({ hasText: "Exchange" }).click();
    await expect(page.locator(".merge-scene-drawer .merge-exchange-list")).toBeVisible();
    await page.locator(".merge-scene-drawer").getByRole("button", { name: /^Close$/ }).click();

    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    const from = {
      x: box.x + layout.left + layout.cell * 0.5,
      y: box.y + layout.top + layout.cell * 0.5,
    };
    const to = {
      x: box.x + layout.left + layout.cell * 1.5,
      y: box.y + layout.top + layout.cell * 0.5,
    };
    const mergeResponsePromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/player/mutate")) return false;
      return parsePlayerActionRequest(response.request())?.action === "merge.merge";
    });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    const mergeBody = await (await mergeResponsePromise).json();
    expect(mergeBody.recipeId).toBe("sand_flame_glass");
    expect(mergeBody.recipeDiscovered).toBe(true);
    expect(mergeBody.itemDiscovered).toBe(true);

    await page.locator(".merge-library-rail button").filter({ hasText: "Items" }).click();
    await expect(page.locator(".merge-scene-drawer .merge-item-book")).toContainText("Glass");
    await page.locator(".merge-scene-drawer").getByRole("button", { name: /^Close$/ }).click();
    await page.locator(".merge-library-rail button").filter({ hasText: "Recipe" }).click();
    await expect(page.locator(".merge-scene-drawer .merge-recipe-book")).toContainText("Sand");
    await expect(page.locator(".merge-scene-drawer .merge-recipe-book")).toContainText("Glass");
    await page.screenshot({
      path: testInfo.outputPath("merge-mobile-recipe-book.png"),
      fullPage: false,
    });
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
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
    await expect(page.locator(".game-play-hud")).toContainText("Bubbo Bubbo");
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
    await expect(page.locator(".stats-row")).toContainText("1/3");
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
    await levelButton.click();
    await levelButton.click({ force: true });
    const levelBody = await (await levelResponsePromise).json();
    expect(levelBody.reward).toBe(getGardenLevelReward(1));
    expect(levelBody.garden.level).toBe(2);
    expect(levelUpRequests).toBe(1);
    await expect(page.locator(".garden-modal-card")).toContainText(formatGardenGoldAmount(getGardenLevelReward(1)));
    await expect(page.locator(".stats-row .stat-chip").filter({ hasText: "Garden XP" })).toContainText(`0/${getGardenXpRequired(2)}`);
    expect(pageErrors).toEqual([]);
  });
});
