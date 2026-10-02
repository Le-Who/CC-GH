import { test, expect } from "@playwright/test";
import { exerciseMergePointerCleanup } from "./helpers/mergeV3.js";
import { expectBloxCanvas, expectBloxLayout, readBloxLayout, pauseBlox, exitBlox } from "./helpers/blox-v2.js";
import { attemptMatch3Move } from "../../src/game-core/match3/engine.js";

async function boot(page, prefix = "gesture") {
  await page.addInitScript((value) => {
    window.localStorage.setItem("gh_dev_user_id", `${value}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    window.localStorage.removeItem("terrarium_save");
    window.localStorage.removeItem("garden_shelf_language");
    window.localStorage.removeItem("garden_shelf_name");
  }, prefix);
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto("/");
  await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
  return pageErrors;
}

async function canvasIsNonBlank(page) {
  await expect.poll(() => page.locator(".active-game-frame canvas").evaluate((canvas) => canvas.toDataURL("image/png").length), { timeout: 15000 }).toBeGreaterThan(2000);
}

async function hostBox(page) {
  const box = await page.locator(".active-game-frame canvas").boundingBox();
  expect(box).not.toBeNull();
  return box;
}

async function match3BoardLayout(page) {
  const canvas = page.locator('[data-game-shell="match3"] canvas');
  await expect(canvas).toBeVisible();
  let layout = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    layout = await canvas.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const boardLeft = Number(node.dataset.match3BoardLeft);
      const boardTop = Number(node.dataset.match3BoardTop);
      const boardSize = Number(node.dataset.match3BoardSize);
      if (!Number.isFinite(boardLeft) || !Number.isFinite(boardTop) || !Number.isFinite(boardSize)) return null;
      const gridSize = boardSize;
      return {
        canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        left: rect.x + boardLeft,
        top: rect.y + boardTop,
        size: gridSize,
        cell: gridSize / 8,
      };
    });
    if (layout?.size > 140) return layout;
    await page.waitForTimeout(100);
  }
  expect(layout?.size || 0).toBeGreaterThan(140);
  return layout;
}

async function bloxBoardLayout(page) {
  return readBloxLayout(page);
}

async function match3HudBoardMetrics(page) {
  const hud = page.locator('[data-game-shell="match3"] .m3-hud');
  const eventSlot = page.locator('[data-game-shell="match3"] .game-play-event-log');
  await expect(hud).toBeVisible();
  const hudBox = await hud.boundingBox();
  const eventCount = await eventSlot.count();
  const eventBox = eventCount ? await eventSlot.boundingBox() : null;
  const board = await match3BoardLayout(page);
  expect(hudBox).not.toBeNull();
  return {
    hud: { y: hudBox.y, height: hudBox.height },
    eventSlot: eventBox ? { width: eventBox.width, height: eventBox.height } : null,
    eventLogCount: eventCount,
    board,
  };
}

function findValidMatch3Move(board) {
  if (!Array.isArray(board)) return null;
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[y].length; x += 1) {
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const tx = x + dx;
        const ty = y + dy;
        if (!board[ty]?.[tx]) continue;
        if (attemptMatch3Move(board, { x, y }, { x: tx, y: ty }).valid) {
          return { from: { x, y }, to: { x: tx, y: ty } };
        }
      }
    }
  }
  return null;
}

function parsePlayerActionRequest(request) {
  if (!request.url().includes("/api/player/mutate")) return null;
  try {
    return JSON.parse(request.postData() || "{}");
  } catch {
    return null;
  }
}

async function waitForMatch3Sync(page, timeout = 3000) {
  const request = await page.waitForRequest((candidate) => {
    const body = parsePlayerActionRequest(candidate);
    return body?.action === "match3.syncMode";
  }, { timeout });
  return parsePlayerActionRequest(request);
}

async function waitForBloxPlace(page, timeout = 3000) {
  const request = await page.waitForRequest((candidate) => {
    const body = parsePlayerActionRequest(candidate);
    return body?.action === "blox.place";
  }, { timeout });
  return parsePlayerActionRequest(request);
}

async function touchDrag(page, from, to, steps = 8) {
  const client = await page.context().newCDPSession(page);
  const point = (x, y) => ({ x, y, id: 1, radiusX: 7, radiusY: 7, force: 1 });
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(from.x, from.y)] });
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)],
    });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();
}

test.describe("Pixi touch and drag interactions", () => {
  test("Garden Shelf accepts shelf taps without viewport leakage", async ({ page }) => {
    const pageErrors = await boot(page, "garden_taps");

    await expect(page.getByText("My Garden")).toBeVisible();
    await expect(page.getByRole("button", { name: /Farm/ })).toHaveCount(0);
    await page.locator(".gs2-empty-target").first().click();
    const shop = page.locator('.gs2-dialog[data-garden-panel="seed-shop-inventory"]');
    await expect(shop).toContainText("Seed Shop");
    const purchase = page.waitForResponse(response => response.url().includes("/api/player/mutate") && response.request().postDataJSON()?.action === "garden.buyPlant");
    await shop.locator(".gs2-catalog-row").filter({ has: page.getByRole("heading", { name: "Daisy", exact: true }) }).getByRole("button").click();
    const bought = await (await purchase).json();
    expect(bought.receiptConfirmed).toBe(true);expect(bought.goldDelta).toBe(-25);
    await expect(page.locator('.gs2-dialog[data-garden-panel="plant-detail"]')).toBeVisible();
    await page.locator(".gs2-close").click();
    await expect(page.locator(".gs2-dialog")).toHaveCount(0);
    const readPlant = () => page.evaluate(id => {
      const key = Object.keys(localStorage).find(key => key.startsWith("game_hub_garden_state_v1:"));
      return JSON.parse(localStorage.getItem(key)).state.plants.find(plant => plant.id === id);
    }, bought.plantId);
    const before = await readPlant();
    const viewportBefore = await page.evaluate(() => ({ x:scrollX, y:scrollY }));
    const plantTarget = page.locator(`[data-plant-id="${bought.plantId}"] .gs2-plant-target`);
    await plantTarget.scrollIntoViewIfNeeded();
    const box = await plantTarget.boundingBox();expect(box).not.toBeNull();
    // Real Chromium touch events exercise the shelf's pointer session.
    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", {type:"touchStart",touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});
    await client.send("Input.dispatchTouchEvent", {type:"touchEnd",touchPoints:[]});
    await client.detach();
    await expect.poll(async () => (await readPlant()).lastTapped).toBeGreaterThan(before.lastTapped || 0);
    await expect.poll(async () => (await readPlant()).phaseProgress).toBeGreaterThan(before.phaseProgress);
    await expect(page.locator(".gs2-dialog")).toHaveCount(0);
    expect(await page.evaluate(() => ({ x:scrollX, y:scrollY }))).toEqual(viewportBefore);
    expect(await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    expect(pageErrors).toEqual([]);
  });

  test("Blox supports tray-to-board drag without viewport leakage", async ({ page }) => {
    const pageErrors = await boot(page, "blox_drag");

    await page.getByRole("button", { name: /Blox/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".bx-hud")).toContainText("Score");
    await expectBloxCanvas(page);

    const layout = await expectBloxLayout(page);
    const slot = layout.slots[0];
    const place = waitForBloxPlace(page, 8000);
    await page.mouse.move(slot.left + slot.width / 2, slot.top + slot.height / 2);
    await page.mouse.down();
    await page.mouse.move(layout.left + layout.cell * 5.5, layout.top + layout.cell * 5.5, { steps: 8 });
    await page.mouse.up();
    await expect(place).resolves.toMatchObject({ action: "blox.place" });
    await expect(page.locator(".bx-hud")).toContainText("Score");
    await expectBloxCanvas(page);
    expect(pageErrors).toEqual([]);
  });

  test("Blox accepts touch tray drags with a lifted placement anchor", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use?.hasTouch, "Lifted Blox drag is a touch-specific placement contract");
    const pageErrors = await boot(page, "blox_touch_drag_lift");

    await page.getByRole("button", { name: /Blox/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".bx-hud")).toContainText("Score");
    await expectBloxCanvas(page);

    const layout = await bloxBoardLayout(page);
    const start = {
      x: layout.slots[0].left + layout.slots[0].width / 2,
      y: layout.slots[0].top + layout.slots[0].height / 2,
    };
    const end = {
      x: layout.left + layout.cell * 5.5,
      y: layout.top + layout.cell * 5.5 + Math.max(52, Math.min(92, layout.cell * 2.15)),
    };

    const place = waitForBloxPlace(page, 8000);
    await touchDrag(page, start, end, 10);
    await expect(place).resolves.toMatchObject({ action: "blox.place" });
    await expectBloxCanvas(page);
    expect(pageErrors).toEqual([]);
  });

  test("Blox supports tray selection followed by a board-cell tap", async ({ page }) => {
    const pageErrors = await boot(page, "blox_tap_place");
    await page.getByRole("button", { name: /Blox/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    const layout = await expectBloxLayout(page);
    const slot = layout.slots[0];
    await page.mouse.click(slot.left + slot.width / 2, slot.top + slot.height / 2);
    await expect(page.locator(".bx-keyboard-slot").first()).toHaveAttribute("aria-pressed", "true");
    const place = waitForBloxPlace(page, 8000);
    await page.mouse.click(layout.left + layout.cell * 0.5, layout.top + layout.cell * 0.5);
    await expect(place).resolves.toMatchObject({ action: "blox.place", payload: { pieceIdx: 0, row: 0, col: 0 } });
    await expectBloxCanvas(page);
    expect(pageErrors).toEqual([]);
  });

  test("Blox keeps its saved run and textures usable after exit and re-entry", async ({ page }) => {
    const pageErrors = await boot(page, "blox_reentry");
    await page.getByRole("button", { name: /Blox/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".bx-stage")).toHaveAttribute("data-bx-phase", "playing");
    await expectBloxCanvas(page);
    const readRunLabels = () => page.locator('.bx-stage').evaluate(stage => ({
      board: Array.from(stage.querySelectorAll('.bx-keyboard-board [role="gridcell"]'), cell => cell.getAttribute('aria-label')),
      tray: Array.from(stage.querySelectorAll('.bx-keyboard-slot'), slot => slot.getAttribute('aria-label')),
    }));
    const savedRunLabels = await readRunLabels();
    await pauseBlox(page);
    await exitBlox(page);
    await page.getByRole("button", { name: /Blox/ }).click();
    await expect(page.locator(".bx-stage")).toHaveAttribute("data-bx-phase", "playing");
    await expect(page.locator('.bx-keyboard-board [role="gridcell"]')).toHaveCount(100);
    expect(await readRunLabels()).toEqual(savedRunLabels);
    const layout = await expectBloxLayout(page);
    const slot = layout.slots[0];
    await page.mouse.click(slot.left + slot.width / 2, slot.top + slot.height / 2);
    // Selection is a React/Pixi update; do not race the next canvas tap against it.
    await expect(page.locator('.bx-keyboard-slot').first()).toHaveAttribute('aria-pressed', 'true');
    const place = waitForBloxPlace(page, 8000);
    await page.mouse.click(layout.left + layout.cell * 0.5, layout.top + layout.cell * 0.5);
    await expect(place).resolves.toMatchObject({ action: "blox.place", payload: { pieceIdx: 0, row: 0, col: 0 } });
    await expectBloxCanvas(page);
    expect(pageErrors).toEqual([]);
  });

  test("Match-3 accepts a canvas swipe gesture", async ({ page }) => {
    const pageErrors = await boot(page, "match3_swipe");

    await page.getByRole("button", { name: /Gems/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".m3-hud")).toContainText("Score");
    await canvasIsNonBlank(page);

    const { left, top, cell } = await match3BoardLayout(page);

    await page.mouse.move(left + cell * 0.5, top + cell * 0.5);
    await page.mouse.down();
    await page.mouse.move(left + cell * 1.5, top + cell * 0.5, { steps: 6 });
    await page.mouse.up();
    await page.mouse.click(left + cell * 2.5, top + cell * 0.5);
    await page.mouse.click(left + cell * 2.5, top + cell * 1.5);

    await expect(page.locator(".m3-hud")).toContainText(/Combo/);
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });

  test("Match-3 treats a long touch swipe as an adjacent directional swap", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use?.hasTouch, "CDP touch dispatch is only meaningful on touch-capable browser projects");
    const pageErrors = await boot(page, "match3_long_touch_swipe");

    await page.getByRole("button", { name: /Gems/ }).click();
    const initialSync = waitForMatch3Sync(page, 8000);
    await page.getByRole("button", { name: /^Start$/ }).click();
    const startBody = await initialSync;
    await expect(page.locator(".m3-hud")).toContainText("Score");

    const board = startBody?.payload?.savedModes?.classic?.board;
    const move = findValidMatch3Move(board);
    expect(move).toBeTruthy();

    const { left, top, cell } = await match3BoardLayout(page);
    const start = {
      x: left + cell * (move.from.x + 0.5),
      y: top + cell * (move.from.y + 0.5),
    };
    const direction = {
      x: Math.sign(move.to.x - move.from.x),
      y: Math.sign(move.to.y - move.from.y),
    };
    const end = {
      x: start.x + direction.x * cell * 2.35,
      y: start.y + direction.y * cell * 2.35,
    };

    const swapSync = waitForMatch3Sync(page, 8000);
    await touchDrag(page, start, end);
    await expect(swapSync).resolves.toMatchObject({ action: "match3.syncMode" });
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });

  test("Match-3 keeps the event log absent and board stable after scoring", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use?.hasTouch, "HUD stability is verified through touch dispatch");
    const pageErrors = await boot(page, "match3_no_event_log");

    await page.getByRole("button", { name: /Gems/ }).click();
    const initialSync = waitForMatch3Sync(page, 8000);
    await page.getByRole("button", { name: /^Start$/ }).click();
    const startBody = await initialSync;
    await expect(page.locator(".m3-hud")).toContainText("Score");
    await page.waitForTimeout(260);
    const before = await match3HudBoardMetrics(page);
    expect(before.eventLogCount).toBe(0);

    const move = findValidMatch3Move(startBody?.payload?.savedModes?.classic?.board);
    expect(move).toBeTruthy();
    const start = {
      x: before.board.left + before.board.cell * (move.from.x + 0.5),
      y: before.board.top + before.board.cell * (move.from.y + 0.5),
    };
    const direction = {
      x: Math.sign(move.to.x - move.from.x),
      y: Math.sign(move.to.y - move.from.y),
    };
    const swapSync = waitForMatch3Sync(page, 8000);
    await touchDrag(page, start, {
      x: start.x + direction.x * before.board.cell * 2.35,
      y: start.y + direction.y * before.board.cell * 2.35,
    });
    await expect(swapSync).resolves.toMatchObject({ action: "match3.syncMode" });
    await expect(page.locator('[data-game-shell="match3"] .game-play-event-log')).toHaveCount(0);

    const after = await match3HudBoardMetrics(page);
    expect(after.eventLogCount).toBe(0);
    expect(Math.abs(after.hud.height - before.hud.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.board.size - before.board.size)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.board.top - before.board.top)).toBeLessThanOrEqual(1);
    expect(pageErrors).toEqual([]);
  });

  test("Match-3 accepts consecutive valid swaps after cascade animation", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use?.hasTouch, "Consecutive board-derived swaps are verified through touch dispatch");
    const pageErrors = await boot(page, "match3_consecutive_swaps");

    await page.getByRole("button", { name: /Gems/ }).click();
    const initialSync = waitForMatch3Sync(page, 8000);
    await page.getByRole("button", { name: /^Start$/ }).click();
    const startBody = await initialSync;
    await expect(page.locator(".m3-hud")).toContainText("Score");

    const { left, top, cell } = await match3BoardLayout(page);
    const dragMove = async (move) => {
      const start = {
        x: left + cell * (move.from.x + 0.5),
        y: top + cell * (move.from.y + 0.5),
      };
      const direction = {
        x: Math.sign(move.to.x - move.from.x),
        y: Math.sign(move.to.y - move.from.y),
      };
      await touchDrag(page, start, {
        x: start.x + direction.x * cell * 2.35,
        y: start.y + direction.y * cell * 2.35,
      });
    };

    const firstMove = findValidMatch3Move(startBody?.payload?.savedModes?.classic?.board);
    expect(firstMove).toBeTruthy();
    const firstSync = waitForMatch3Sync(page, 8000);
    await dragMove(firstMove);
    const firstBody = await firstSync;
    await expect(page.locator('.m3-hud').getByLabel(`Moves: ${firstBody.payload.game.movesLeft}`, { exact: true })).toBeVisible();
    await expect(page.locator('.m3-selection')).toHaveAttribute('aria-busy', 'false');

    const nextBoard = firstBody?.payload?.savedModes?.classic?.board;
    const secondMove = findValidMatch3Move(nextBoard);
    expect(secondMove).toBeTruthy();
    const secondSync = waitForMatch3Sync(page, 8000);
    await dragMove(secondMove);
    const secondBody = await secondSync;
    expect(secondBody).toMatchObject({ action: "match3.syncMode", payload: { game: { movesLeft: firstBody.payload.game.movesLeft - 1 } } });
    await expect(page.locator('.m3-hud').getByLabel(`Moves: ${secondBody.payload.game.movesLeft}`, { exact: true })).toBeVisible();
    await expect(page.locator('.m3-selection')).toHaveAttribute('aria-busy', 'false');
    await page.screenshot({
      path: testInfo.outputPath("match3-after-consecutive-swaps.png"),
      fullPage: false,
    });

    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });

  test("Merge V3 sample drags cancel cleanly before another real research action", async ({ page }) => {
    const pageErrors = await boot(page, "merge_v3_drag");
    await page.getByRole("button", { name: /Merge/ }).click();
    await exerciseMergePointerCleanup(page);
    expect(pageErrors).toEqual([]);
  });

  test("Bubbo accepts repeated aim drags and only locks during projectile flight", async ({ page }) => {
    const pageErrors = await boot(page, "bubbo_fire");

    await page.getByRole("button", { name: /Bubbo/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".bb-stage")).toHaveAttribute("data-bb-phase", "playing");
    await canvasIsNonBlank(page);

    const box = await hostBox(page);
    const fire = async (offset) => {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.9);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * offset, box.y + box.height * 0.45, { steps: 8 });
      await page.mouse.up();
      await expect(page.locator(".bb-field")).toHaveAttribute("data-flight", "true");
    };

    await fire(0.43);
    await expect(page.locator(".bb-field")).toHaveAttribute("data-flight", "false");
    await fire(0.57);
    await expect.poll(async () => Number(await page.locator(".bb-field").getAttribute("data-shots"))).toBe(2);

    await expect(page.locator(".bb-hud")).toContainText(/Pressure|Shots/);
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });

  test("Bubbo timed mode accepts repeated shots toward the pending top row", async ({ page }) => {
    const pageErrors = await boot(page, "bubbo_timed_pending");

    await page.getByRole("button", { name: /Bubbo/ }).click();
    await page.locator(".bb-modes").getByRole("button", { name: /Timed/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".bb-hud")).toContainText(/Time/);
    await canvasIsNonBlank(page);

    const box = await hostBox(page);
    const fireTop = async (offset) => {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.9);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * offset, box.y + box.height * 0.16, { steps: 10 });
      await page.mouse.up();
      await expect(page.locator(".bb-field")).toHaveAttribute("data-flight", "true");
      await expect(page.locator(".bb-field")).toHaveAttribute("data-flight", "false");
    };

    await fireTop(0.42);
    await fireTop(0.58);
    await fireTop(0.5);
    await expect.poll(async () => Number(await page.locator(".bb-field").getAttribute("data-shots"))).toBe(3);

    await expect(page.locator(".bb-hud")).toContainText(/Time/);
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });
});
