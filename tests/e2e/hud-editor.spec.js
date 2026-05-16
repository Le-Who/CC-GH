import { test, expect } from "@playwright/test";

async function boot(page, path = "/?hudEditor=1&hudPreview=1&hudPreset=390x844") {
  await page.addInitScript(() => {
    window.localStorage.setItem("garden_shelf_language", "en");
    window.localStorage.setItem("gh_dev_user_id", `hud_editor_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    window.localStorage.removeItem("ccgh:hud-layout-overrides:v1");
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(path);
  await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
  return errors;
}

test.describe("HUD layout editor", () => {
  test("is disabled by default and opens only through explicit editor mode", async ({ page }) => {
    await boot(page, "/");
    await expect(page.locator('[data-testid="hud-editor-root"]')).toHaveCount(0);
    await page.goto("/?hudEditor=1");
    await expect(page.locator('[data-testid="hud-editor-root"]')).toBeVisible();
    await expect(page.locator('[data-testid="hud-editor-toolbar"]')).toContainText("garden");
  });

  test("selects, moves, exports, and imports a registered region", async ({ page }) => {
    const errors = await boot(page);
    await expect(page.locator('[data-testid="hud-editor-toolbar"]')).toContainText("phone-default-portrait");
    const bottomDockBox = page.locator('[data-hud-region-box="bottomDock"]');
    await expect(bottomDockBox).toBeVisible();
    const box = await bottomDockBox.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 24);
    await page.mouse.up();
    await expect(page.locator('[data-testid="hud-editor-inspector"]')).toContainText("bottomDock");
    await page.getByRole("button", { name: "Export game" }).click();
    const exportedText = await page.locator(".hud-editor-json-panel textarea").first().inputValue();
    const exported = JSON.parse(exportedText);
    expect(exported.games.garden.profiles["phone-default-portrait"].regions.bottomDock.offset).not.toBe(0);
    await page.locator(".hud-editor-json-panel textarea").nth(1).fill(exportedText);
    await page.getByRole("button", { name: "Validate and import pasted JSON" }).click();
    await expect(page.locator(".hud-editor-message")).toContainText("Imported layout JSON");
    expect(errors).toEqual([]);
  });

  test("can hide editor chrome and edit individual buttons and assets", async ({ page }) => {
    await boot(page);
    await page.getByRole("button", { name: "Hide panels" }).click();
    await expect(page.locator('[data-testid="hud-editor-toolbar"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="hud-editor-inspector"]')).toHaveCount(0);
    await expect(page.locator('[data-hud-region-box="bottomDock"]')).toBeVisible();
    await page.getByRole("button", { name: "Show editor" }).click();
    await expect(page.locator('[data-testid="hud-editor-toolbar"]')).toBeVisible();

    const buttonRegion = page.locator('[data-hud-region="bottomDock.blox"]');
    const beforeButton = await buttonRegion.boundingBox();
    const buttonBox = page.locator('[data-hud-region-box="bottomDock.blox"]');
    await expect(buttonBox).toBeVisible();
    const box = await buttonBox.boundingBox();
    expect(beforeButton).not.toBeNull();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2);
    await page.mouse.up();
    await expect(page.locator('[data-testid="hud-editor-inspector"]')).toContainText("bottomDock.blox");
    const afterButton = await buttonRegion.boundingBox();
    expect(afterButton.x).toBeGreaterThan(beforeButton.x + 12);

    const assetBox = page.locator('[data-hud-region-box="gardenSignAsset"]');
    await expect(assetBox).toBeVisible();
    await page.getByRole("button", { name: "Hide panels" }).click();
    await assetBox.click();
    await page.getByRole("button", { name: "Show editor" }).click();
    await expect(page.locator('[data-testid="hud-editor-inspector"]')).toContainText("Garden sign image asset");
    await page.getByLabel("scale").fill("1.2");
    await expect.poll(() => page.locator('[data-hud-region="gardenSignAsset"]').evaluate((node) => getComputedStyle(node).scale)).toBe("1.2");
  });

  test("exposes non-Garden asset regions through DOM and Pixi adapters", async ({ page }) => {
    await boot(page, "/?hudEditor=1&hudPreview=1&hudPreset=568x320");
    await page.locator('[data-hud-region="bottomDock.blox"]').evaluate((node) => node.click());
    await expect(page.locator(".telegram-app")).toHaveAttribute("data-active-tab", "blox");
    const assetBox = page.locator('[data-hud-region-box="bloxBoardFrameAsset"]');
    await expect(assetBox).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "Hide panels" }).click();
    const box = await assetBox.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 16, box.y + box.height / 2);
    await page.mouse.up();
    await page.getByRole("button", { name: "Show editor" }).click();
    await expect(page.locator('[data-testid="hud-editor-inspector"]')).toContainText("bloxBoardFrameAsset");
    await page.getByRole("button", { name: "Export game" }).click();
    const exportedText = await page.locator(".hud-editor-json-panel textarea").first().inputValue();
    const exported = JSON.parse(exportedText);
    expect(exported.games.blox.profiles["phone-landscape"].regions.bloxBoardFrameAsset.x).toBe(16);
  });

  test("switches semantic profile with orientation and keeps 320px layout inside viewport", async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await boot(page, "/?hudEditor=1");
    await expect(page.locator('[data-testid="hud-editor-toolbar"]')).toContainText("phone-landscape");

    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/?hudEditor=1");
    await expect(page.locator('[data-testid="hud-editor-toolbar"]')).toContainText("phone-small-portrait");
    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      docWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
      dock: document.querySelector(".bottom-tabs")?.getBoundingClientRect().toJSON(),
    }));
    expect(metrics.docWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.dock.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.dock.right).toBeLessThanOrEqual(metrics.innerWidth + 1);
  });
});
