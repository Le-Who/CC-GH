import { test, expect } from "@playwright/test";

async function boot(page, prefix = "gesture") {
  await page.addInitScript((value) => {
    window.localStorage.setItem("gh_dev_user_id", `${value}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
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

test.describe("Pixi touch and drag interactions", () => {
  test("Blox supports tray-to-board drag without viewport leakage", async ({ page }) => {
    const pageErrors = await boot(page, "blox_drag");

    await page.getByRole("button", { name: /Blox/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".game-play-hud")).toContainText("Building Blox");
    await canvasIsNonBlank(page);

    const box = await hostBox(page);
    const size = Math.max(140, Math.min(box.width - 28, box.height - 102));
    const left = box.x + (box.width - size) / 2;
    const top = box.y + 14;
    const cell = size / 10;
    const trayTop = top + size + 16;
    const slotW = (box.width - 36) / 3;

    await page.mouse.move(box.x + 14 + slotW / 2, trayTop + 30);
    await page.mouse.down();
    await page.mouse.move(left + cell * 0.5, top + cell * 0.5, { steps: 8 });
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
    const size = Math.max(140, Math.min(box.width - 28, box.height - 28));
    const left = box.x + (box.width - size) / 2;
    const top = box.y + 14;
    const cell = size / 8;

    await page.mouse.move(left + cell * 0.5, top + cell * 0.5);
    await page.mouse.down();
    await page.mouse.move(left + cell * 1.5, top + cell * 0.5, { steps: 6 });
    await page.mouse.up();

    await expect(page.locator(".game-play-hud")).toContainText(/Combo/);
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
    await canvasIsNonBlank(page);
    expect(pageErrors).toEqual([]);
  });
});
