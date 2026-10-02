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
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.title !== "can tune Settlement construction slot map coordinates" || testInfo.status === testInfo.expectedStatus) return;
    const geometry = await page.evaluate(() => {
      const slotRegionId = "settlementConstructionSlot.southwest-terrace";
      const selectors = [".hud-preview-frame", ".telegram-app", ".active-game-frame", ".settlement-game-root", ".scene-host", `[data-hud-region="${slotRegionId}"]`, `[data-hud-region-box="${slotRegionId}"]`];
      return {
        viewport: { width: innerWidth, height: innerHeight },
        regions: selectors.map((selector) => {
          const node = document.querySelector(selector);
          if (!node) return { selector, missing: true };
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          const hit = document.elementFromPoint(Math.max(0, Math.min(innerWidth - 1, rect.x + rect.width / 2)), Math.max(0, Math.min(innerHeight - 1, rect.y + rect.height / 2)));
          return {
            selector, rect: rect.toJSON(),
            position: style.position, overflow: style.overflow, transform: style.transform, translate: style.translate, scale: style.scale,
            hitAtClampedCenter: hit?.getAttribute("data-hud-region-box") || hit?.getAttribute("data-hud-region") || hit?.className || null,
          };
        }),
      };
    });
    console.log(`Settlement slot geometry: ${JSON.stringify(geometry)}`);
    await testInfo.attach("settlement-slot-geometry", { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
  });

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
    const canvas = page.locator('[data-game-shell="blox"] .bx-canvas canvas');
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.evaluate((node) => Object.keys(JSON.parse(node.dataset.hudAssetLayouts || "{}")))).toEqual(expect.arrayContaining(["bloxBoardFrameAsset", "bloxTrayPanelAsset"]));
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

  test("can tune Settlement construction slot map coordinates", async ({ page }) => {
    await boot(page, "/?hudEditor=1&hudPreview=1&hudPreset=568x320&panel=construction");
    await page.locator('[data-hud-region="bottomDock.settlement"]').evaluate((node) => node.click());
    await expect(page.locator(".telegram-app")).toHaveAttribute("data-active-tab", "settlement");
    const slotRegionId = "settlementConstructionSlot.southwest-terrace";
    const slotBox = page.locator(`[data-hud-region-box="${slotRegionId}"]`);
    await expect(slotBox).toBeVisible({ timeout: 30000 });
    await expect.poll(() => page.evaluate(() => {
      const frame = document.querySelector(".hud-preview-frame")?.getBoundingClientRect();
      const app = document.querySelector(".telegram-app")?.getBoundingClientRect();
      const canvas = document.querySelector(".scene-host")?.getBoundingClientRect();
      const inside = (rect) => !!frame && !!rect && rect.width > 0 && rect.height > 0
        && rect.left >= frame.left && rect.right <= frame.right
        && rect.top >= frame.top && rect.bottom <= frame.bottom;
      return { frameWidth: frame?.width, frameHeight: frame?.height, appInside: inside(app), canvasInside: inside(canvas) };
    }), { message: "Settlement must render inside the selected HUD preview dimensions" }).toEqual({
      frameWidth: 568, frameHeight: 320, appInside: true, canvasInside: true,
    });
    // Slot probes register before Pixi finishes loading and applies its camera.
    // A visible editor box can still be outside the viewport during that load.
    await expect(slotBox).toBeInViewport({ ratio: 1, timeout: 30000 });
    // The pointer must hit this map handle, not an overlapping DOM asset editor box.
    await expect.poll(() => slotBox.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit?.closest("[data-hud-region-box]")?.getAttribute("data-hud-region-box");
    })).toBe(slotRegionId);
    await slotBox.click();
    const inspector = page.locator('[data-testid="hud-editor-inspector"]');
    await expect(inspector).toContainText(slotRegionId);
    await inspector.getByRole("spinbutton", { name: "x", exact: true }).fill("784");
    await inspector.getByRole("spinbutton", { name: "y", exact: true }).fill("1412");
    await page.getByRole("button", { name: "Export game" }).click();
    const exportedText = await page.locator(".hud-editor-json-panel textarea").first().inputValue();
    const exported = JSON.parse(exportedText);
    const moved = exported.games.settlement.profiles["phone-landscape"].regions[slotRegionId];
    expect(moved.x).toBe(784);
    expect(moved.y).toBe(1412);
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
