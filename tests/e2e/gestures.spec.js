import { test, expect } from "@playwright/test";
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
  const dataUrlLength = await page.locator(".pixi-host canvas").evaluate((canvas) => canvas.toDataURL("image/png").length);
  expect(dataUrlLength).toBeGreaterThan(2000);
}

async function hostBox(page) {
  const box = await page.locator(".pixi-host").boundingBox();
  expect(box).not.toBeNull();
  return box;
}

function findValidMatch3Move(board) {
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
    await page.getByRole("button", { name: "+" }).first().click();
    const panel = page.locator(".fixed.bottom-0").last();
    await expect(panel).toContainText("Seed Shop");
    await panel.locator("button").filter({ hasText: "25" }).click();
    await expect(page.getByTestId("garden-growth-timer")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("garden-phase-badge")).toHaveCount(0);

    expect(pageErrors).toEqual([]);
  });

  test("Blox supports tray-to-board drag without viewport leakage", async ({ page }) => {
    const pageErrors = await boot(page, "blox_drag");

    await page.getByRole("button", { name: /Blox/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".game-play-hud")).toContainText("Building Blox");
    await canvasIsNonBlank(page);

    const box = await hostBox(page);
    const size = Math.max(140, Math.min(box.width - 28, box.height - 116 - 28));
    const left = box.x + (box.width - size) / 2;
    const top = box.y + 14 + Math.max(0, box.height - 116 - size - 28) * 0.62;
    const cell = size / 10;
    const trayTop = top + size + 16;
    const slotW = (box.width - 36) / 3;

    await page.mouse.move(box.x + 14 + slotW / 2, trayTop + 30);
    await page.mouse.down();
    await page.mouse.move(left + cell * 0.5, top + cell * 0.5, { steps: 8 });
    await page.mouse.up();
    await page.mouse.move(box.x + 14 + slotW * 1.5, trayTop + 30);
    await page.mouse.down();
    await page.mouse.move(left + cell * 1.5, top + cell * 0.5, { steps: 8 });
    await page.mouse.up();

    await expect(page.getByText(/Score/).first()).toBeVisible();
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });

  test("Match-3 accepts a canvas swipe gesture", async ({ page }) => {
    const pageErrors = await boot(page, "match3_swipe");

    await page.getByRole("button", { name: /Gems/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".game-play-hud")).toContainText("Gem Crush");
    await canvasIsNonBlank(page);

    const box = await hostBox(page);
    const size = Math.max(140, Math.min(box.width - 28, box.height - 28 - 44));
    const left = box.x + (box.width - size) / 2;
    const top = box.y + 14 + Math.max(0, box.height - 44 - size - 28) * 0.66;
    const cell = size / 8;

    await page.mouse.move(left + cell * 0.5, top + cell * 0.5);
    await page.mouse.down();
    await page.mouse.move(left + cell * 1.5, top + cell * 0.5, { steps: 6 });
    await page.mouse.up();
    await page.mouse.click(left + cell * 2.5, top + cell * 0.5);
    await page.mouse.click(left + cell * 2.5, top + cell * 1.5);

    await expect(page.locator(".game-play-hud")).toContainText(/Combo/);
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
    await expect(page.locator(".game-play-hud")).toContainText("Gem Crush");

    const board = startBody?.payload?.savedModes?.classic?.board;
    const move = findValidMatch3Move(board);
    expect(move).toBeTruthy();

    const box = await hostBox(page);
    const size = Math.max(140, Math.min(box.width - 28, box.height - 28 - 44));
    const left = box.x + (box.width - size) / 2;
    const top = box.y + 14 + Math.max(0, box.height - 44 - size - 28) * 0.66;
    const cell = size / 8;
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

  test("Merge item surface keeps gestures inside the game canvas", async ({ page }) => {
    const pageErrors = await boot(page, "merge_drag");

    await page.getByRole("button", { name: /Merge/ }).click();
    await expect(page.getByText("Gacha Merge")).toBeVisible();
    await canvasIsNonBlank(page);

    const host = page.locator(".pixi-host");
    await expect(host).toHaveAttribute("data-no-nav-swipe", "true");
    const touchAction = await host.evaluate((node) => getComputedStyle(node).touchAction);
    expect(touchAction).toBe("none");

    await page.getByRole("button", { name: "30 Taps" }).click();
    await page.getByRole("button", { name: "Tap" }).first().click();
    await page.getByRole("button", { name: /^Play$/ }).click();
    const box = await hostBox(page);
    await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.48, { steps: 8 });
    await page.mouse.up();
    await page.mouse.click(box.x + box.width * 0.44, box.y + box.height * 0.42);
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });

  test("Bubbo accepts repeated aim drags and only locks during projectile flight", async ({ page }) => {
    const pageErrors = await boot(page, "bubbo_fire");

    await page.getByRole("button", { name: /Bubbo/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".game-play-hud")).toContainText("Bubbo Bubbo");
    await canvasIsNonBlank(page);

    const box = await hostBox(page);
    const fire = async (offset) => {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.9);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * offset, box.y + box.height * 0.45, { steps: 8 });
      await page.mouse.up();
    };

    await fire(0.43);
    await page.waitForTimeout(750);
    await fire(0.57);

    await expect(page.locator(".game-play-hud")).toContainText(/Pressure|Shots/);
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });
});
