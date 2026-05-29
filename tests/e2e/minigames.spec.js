import { test, expect } from "@playwright/test";

test.describe("New-stack minigame smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });
  });

  async function pauseActiveGame(page) {
    const pauseButton = page.getByRole("button", { name: /Pause/ });
    await expect(pauseButton).toBeVisible();
    await pauseButton.click({ force: true });
    const overlay = page.locator(".game-menu-overlay:visible").first();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await expect(page.locator(".bottom-tabs")).toBeHidden();
    await expect(overlay).toBeVisible();
    const overlayBox = await page.waitForFunction(() => {
      const visibleOverlay = [...document.querySelectorAll(".game-menu-overlay")].find((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });
      if (!visibleOverlay) return null;
      const rect = visibleOverlay.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }).then((handle) => handle.jsonValue());
    const viewport = page.viewportSize();
    expect(overlayBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(overlayBox.x).toBeGreaterThanOrEqual(0);
    expect(overlayBox.x + overlayBox.width).toBeLessThanOrEqual(viewport.width);
    expect(overlayBox.y).toBeGreaterThanOrEqual(0);
    expect(overlayBox.y + overlayBox.height).toBeLessThanOrEqual(viewport.height + 1);
    return overlay;
  }

  async function expectCompactPauseMenu(overlay, buttonCount) {
    await expect(overlay.locator(".metric-grid")).toHaveCount(0);
    await expect(overlay.locator(".generator-list")).toHaveCount(0);
    await expect(overlay.locator(".leaderboard")).toHaveCount(0);
    await expect(overlay.getByRole("button")).toHaveCount(buttonCount);
  }

  async function exitToHub(page) {
    await page.locator(".game-menu-overlay:visible").first().getByRole("button", { name: /^Exit$/ }).click();
    await expect(page.locator(".bottom-tabs")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeHidden();
    await page.waitForTimeout(260);
  }

  async function boot(page) {
    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();
  }

  async function match3CanvasBounds(page) {
    const shell = page.locator('[data-game-shell="match3"]');
    const hud = shell.locator(".game-play-hud");
    const canvas = shell.locator(".pixi-host canvas");
    await expect(hud).toBeVisible();
    await expect(canvas).toBeVisible();

    const hudBox = await hud.boundingBox();
    let board = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      board = await canvas.evaluate(async (node) => {
        const rect = node.getBoundingClientRect();
        const layoutTop = Number(node.dataset.match3BoardTop);
        const layoutLeft = Number(node.dataset.match3BoardLeft);
        const layoutSize = Number(node.dataset.match3BoardSize);
        if (Number.isFinite(layoutTop) && Number.isFinite(layoutLeft) && Number.isFinite(layoutSize)) {
          return {
            canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            x: rect.x + layoutLeft,
            y: rect.y + layoutTop,
            width: layoutSize,
            height: layoutSize,
          };
        }
        const image = new Image();
        image.src = node.toDataURL("image/png");
        await image.decode();
        const probe = document.createElement("canvas");
        probe.width = image.naturalWidth;
        probe.height = image.naturalHeight;
        const context = probe.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const { data, width, height } = context.getImageData(0, 0, probe.width, probe.height);
        const minRowPixels = Math.max(24, Math.floor(width * 0.08));
        const minColPixels = Math.max(24, Math.floor(height * 0.08));
        const isVisiblePixel = (offset) => data[offset + 3] > 24 || data[offset] + data[offset + 1] + data[offset + 2] > 30;
        const rowHasBoard = (y) => {
          let opaque = 0;
          for (let x = 0; x < width; x += 1) {
            if (isVisiblePixel((y * width + x) * 4)) opaque += 1;
          }
          return opaque >= minRowPixels;
        };
        const colHasBoard = (x) => {
          let opaque = 0;
          for (let y = 0; y < height; y += 1) {
            if (isVisiblePixel((y * width + x) * 4)) opaque += 1;
          }
          return opaque >= minColPixels;
        };
        let top = 0;
        let bottom = height - 1;
        let left = 0;
        let right = width - 1;
        while (top < height && !rowHasBoard(top)) top += 1;
        while (bottom > top && !rowHasBoard(bottom)) bottom -= 1;
        while (left < width && !colHasBoard(left)) left += 1;
        while (right > left && !colHasBoard(right)) right -= 1;
        return {
          canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          x: rect.x + (left / width) * rect.width,
          y: rect.y + (top / height) * rect.height,
          width: ((right - left + 1) / width) * rect.width,
          height: ((bottom - top + 1) / height) * rect.height,
        };
      });
      if (board.width > 160 && board.height > 160) break;
      await page.waitForTimeout(100);
    }

    expect(hudBox).not.toBeNull();
    expect(board.width).toBeGreaterThan(160);
    expect(board.height).toBeGreaterThan(160);
    return { hud: hudBox, board };
  }

  async function expectMatch3BoardClearOfHud(page) {
    const { hud, board } = await match3CanvasBounds(page);
    expect(board.y).toBeGreaterThanOrEqual(hud.y + hud.height + 6);
    expect(board.x + board.width / 2).toBeGreaterThanOrEqual(board.canvas.x + board.canvas.width * 0.42);
    expect(board.x + board.width / 2).toBeLessThanOrEqual(board.canvas.x + board.canvas.width * 0.58);
    return { hud, board };
  }

  test("tabs render rich game surfaces and survive real actions", async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Game Hub" })).toBeVisible();
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();
    await expect(page.getByRole("button", { name: /Farm/ })).toHaveCount(0);

    await page.getByRole("button", { name: /Blox/ }).click();
    await expect(page.getByText("Building Blox")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator('[data-game-shell="blox"] .game-play-hud')).toContainText("Score");
    await pauseActiveGame(page);
    await exitToHub(page);

    await page.getByRole("button", { name: /Gems/ }).click();
    await expect(page.getByText("Gem Crush")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".game-play-hud")).toContainText(/Combo/);
    await pauseActiveGame(page);
    await exitToHub(page);

    await page.getByRole("button", { name: /Merge/ }).click();
    await expect(page.locator(".merge-scene-hud")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await expect(page.locator(".game-menu-overlay:visible")).toHaveCount(0);
    await expect(page.locator(".merge-action-dock")).toBeVisible();
    await page.locator('[data-merge-panel="items"]').click();
    await expect(page.locator(".merge-scene-drawer .merge-item-book")).toBeVisible();
    await expect(page.locator(".game-menu-overlay:visible [data-pause-menu='merge']")).toHaveCount(0);
    await page.locator(".merge-scene-drawer").getByRole("button", { name: /^Close$/ }).click();
    await expect(page.locator(".merge-action-dock")).toBeVisible();
    await page.locator('[data-merge-panel="recipes"]').click();
    await expect(page.locator(".merge-scene-drawer .merge-recipe-book")).toBeVisible();
    await expect(page.locator(".game-menu-overlay:visible [data-pause-menu='merge']")).toHaveCount(0);
    await page.locator(".merge-scene-drawer").getByRole("button", { name: /^Close$/ }).click();
    await page.locator('[data-merge-panel="exchange"]').click();
    await expect(page.locator(".merge-scene-drawer .merge-exchange-list")).toBeVisible();
    await page.locator(".merge-scene-drawer").getByRole("button", { name: /^Close$/ }).click();
    await expect(page.locator(".merge-action-dock")).toBeVisible();
    await page.locator('[data-merge-action="daily"]').click();
    await page.locator('[data-merge-action="generate"]').click();
    await expect(page.locator(".merge-action-area")).toBeVisible();
    await pauseActiveGame(page);
    await exitToHub(page);

    await page.getByRole("button", { name: /Bubbo/ }).click();
    await expect(page.getByText("Bubbo Bubbo")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await expect(page.locator(".pixi-host canvas")).toBeVisible();
    await expect(page.locator('[data-mode-selector="bubbo"]')).toContainText("Classic");
    await expect(page.locator('[data-mode-selector="bubbo"]')).toContainText("Timed");
    await page.getByRole("button", { name: /^Start$/ }).click();
    const bubboHud = page.locator(".bubbo-play-hud");
    await expect(bubboHud.locator(".game-play-title")).toContainText("Bubbo Bubbo");
    await expect(bubboHud).not.toContainText(/best|bubbles/i);
    await expect(bubboHud).toContainText(/Shots/);
    const bubboHostBox = await page.locator(".active-game-frame .pixi-host").boundingBox();
    const bubboHudBox = await bubboHud.boundingBox();
    expect(bubboHostBox).not.toBeNull();
    expect(bubboHudBox).not.toBeNull();
    expect(bubboHudBox.y).toBeGreaterThan(bubboHostBox.y + bubboHostBox.height * 0.72);
    const bubboPauseOverlay = await pauseActiveGame(page);
    await bubboPauseOverlay.getByRole("button", { name: /^End Run$/ }).click();
    const bubboResult = page.locator('[data-bubbo-result="true"]');
    await expect(bubboResult).toBeVisible();
    await expect(bubboResult.locator(".metric-grid")).toHaveCount(0);
    await expect(bubboResult.locator(".mode-grid")).toHaveCount(0);
    await expect(bubboResult.locator(".leaderboard")).toHaveCount(0);
    await expect(bubboResult.getByRole("button")).toHaveCount(2);
    await bubboResult.getByRole("button", { name: /^Exit$/ }).click();
    await expect(page.locator(".bottom-tabs")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeHidden();
    await page.waitForTimeout(260);

    await page.getByRole("button", { name: /Bubbo/ }).click();
    await page.locator('[data-mode-selector="bubbo"]').getByRole("button", { name: /Timed/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".bubbo-play-hud")).toContainText(/Time/);
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await pauseActiveGame(page);
    await exitToHub(page);

    await page.getByRole("button", { name: /Trivia/ }).click();
    await expect(page.getByText("Brain Blitz")).toBeVisible();
    await page.getByRole("button", { name: "Solo" }).click();
    await expect(page.locator(".question-panel")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await pauseActiveGame(page);
    await exitToHub(page);

    await page.getByRole("button", { name: /Yard/ }).click();
    await expect(page.locator(".companion-yard-stage, .companion-yard-layout").first()).toBeVisible();
    await expect(page.getByText("Room Inventory")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Petbook" })).toBeVisible();
    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "Daily letter" }).click();
    await expect(page.locator(".yard-game-screen")).toContainText("Daily letter");
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("play-mode canvases stay large and inside a compact webview", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 680 });
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `compact_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();

    const pixiGames = [
      { tab: /Blox/, start: /^Start$/ },
      { tab: /Gems/, start: /^Start$/ },
      { tab: /Merge/, id: "merge" },
      { tab: /Bubbo/, start: /^Start$/, id: "bubbo", minHostHeight: 620 },
    ];

    for (const game of pixiGames) {
      await page.getByRole("button", { name: game.tab }).click();
      if (game.start) await page.getByRole("button", { name: game.start }).click();
      const host = page.locator(".active-game-frame .pixi-host").last();
      await expect(host).toBeVisible();
      await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
      await expect(page.locator(".bottom-tabs")).toBeHidden();
      const hostBox = await host.boundingBox();
      expect(hostBox).not.toBeNull();
      expect(hostBox.height).toBeGreaterThanOrEqual(game.minHostHeight || 620);
      expect(hostBox.width).toBeGreaterThanOrEqual(360);
      if (game.id === "bubbo") {
        const shellBox = await page.locator('[data-game-shell="bubbo"]').boundingBox();
        const hudBox = await page.locator(".bubbo-play-hud").boundingBox();
        expect(shellBox).not.toBeNull();
        expect(hudBox).not.toBeNull();
        expect(shellBox.height).toBeGreaterThanOrEqual(620);
        expect(hudBox.y).toBeGreaterThan(hostBox.y + hostBox.height * 0.72);
      }
      await pauseActiveGame(page);
      await exitToHub(page);
    }

    await page.getByRole("button", { name: /Yard/ }).click();
    const roomStage = page.locator(".active-game-frame .room-stage");
    await expect(roomStage).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await expect(page.locator(".bottom-tabs")).toBeHidden();
    const roomBox = await roomStage.boundingBox();
    expect(roomBox).not.toBeNull();
    expect(roomBox.height).toBeGreaterThanOrEqual(620);
    expect(roomBox.width).toBeGreaterThanOrEqual(360);
  });

  test("Settlement mounts as an isolated immersive game tab", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `settlement_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /Town/ }).click();

    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await expect(page.locator(".bottom-tabs")).toBeHidden();
    await expect(page.locator(".settlement-game-root .settlement-canvas")).toBeVisible({ timeout: 30000 });
    await expect(page.locator(".settlement-game-root")).toHaveAttribute("data-right-panel-open", "false");
    await expect(page.locator(".settlement-game-root .right-panel")).toHaveCount(0);
    await expect(page.locator(".settlement-game-root .settlement-compact-detail")).toBeVisible();
    await expect(page.locator(".settlement-game-root .bottom-nav")).toBeVisible();

    const metrics = await page.evaluate(() => {
      const root = document.querySelector(".settlement-game-root");
      const buttons = [...root.querySelectorAll(".left-dock button, .bottom-nav button")].filter((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });
      return {
        bodyOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        canvas: root.querySelector(".settlement-canvas")?.getBoundingClientRect().toJSON(),
        compact: root.querySelector(".settlement-compact-detail")?.getBoundingClientRect().toJSON(),
        bottomNav: root.querySelector(".bottom-nav")?.getBoundingClientRect().toJSON(),
        tinyButtons: buttons
          .filter((button) => {
            const rect = button.getBoundingClientRect();
            return rect.width < 44 || rect.height < 44;
          })
          .map((button) => button.getAttribute("aria-label") || button.textContent.trim()),
      };
    });
    expect(metrics.bodyOverflowX).toBeLessThanOrEqual(1);
    expect(metrics.canvas.width).toBeGreaterThanOrEqual(370);
    expect(metrics.canvas.height).toBeGreaterThanOrEqual(820);
    expect(metrics.compact.bottom).toBeLessThanOrEqual(metrics.bottomNav.top + 1);
    expect(metrics.tinyButtons).toEqual([]);

    await page.locator(".settlement-game-root .bottom-nav .collect-button").click();
    await expect(page.locator(".settlement-game-root .notices-v2")).toContainText("ресурсы");
  });

  test("Settlement small mobile chrome keeps overview controls reachable", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `settlement_mobile_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /Town/ }).click();
    await expect(page.locator(".settlement-game-root .settlement-canvas")).toBeVisible({ timeout: 30000 });

    const metrics = await page.evaluate(() => {
      const root = document.querySelector(".settlement-game-root");
      const isVisible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const labelFor = (node) => node.getAttribute("aria-label") || node.textContent.trim().replace(/\s+/g, " ");
      const viewportClipped = (node) => {
        const rect = node.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1 || rect.top < -1 || rect.bottom > window.innerHeight + 1;
      };
      const compactButtons = [...root.querySelectorAll(".settlement-compact-detail button")].filter(isVisible);
      const resourcePills = [...root.querySelectorAll(".top-resources-core .resource-pill")].filter(isVisible);
      const bottomNav = root.querySelector(".bottom-nav")?.getBoundingClientRect();
      const compact = root.querySelector(".settlement-compact-detail")?.getBoundingClientRect();
      return {
        bodyOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        clippedCompactButtons: compactButtons.filter(viewportClipped).map(labelFor),
        clippedResourcePills: resourcePills.filter(viewportClipped).map(labelFor),
        visibleResourcePills: resourcePills.length,
        compactClearsBottomDock: compact && bottomNav ? compact.bottom <= bottomNav.top + 1 : false,
      };
    });

    expect(metrics.bodyOverflowX).toBeLessThanOrEqual(1);
    expect(metrics.clippedCompactButtons).toEqual([]);
    expect(metrics.clippedResourcePills).toEqual([]);
    expect(metrics.visibleResourcePills).toBe(6);
    expect(metrics.compactClearsBottomDock).toBe(true);
  });

  test("Settlement recovery panels stay reachable at 320px mobile", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `settlement_recovery_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /Town/ }).click();
    await expect(page.locator(".settlement-game-root .settlement-canvas")).toBeVisible({ timeout: 30000 });

    async function expectPanelReachable({ panel, trigger, requiredSelectors }) {
      await page.locator(trigger).click();
      await expect(page.locator(".settlement-game-root")).toHaveAttribute("data-active-panel", panel);

      const metrics = await page.evaluate(({ requiredSelectors }) => {
        const root = document.querySelector(".settlement-game-root");
        const panelNode = root?.querySelector(".right-panel");
        const bottomNav = root?.querySelector(".bottom-nav");
        const isVisible = (node) => {
          if (!node) return false;
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const intersectsViewport = (node) => {
          const rect = node.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
        };
        const labelFor = (node) => node.getAttribute("aria-label") || node.textContent.trim().replace(/\s+/g, " ");
        const viewportClipped = (node) => {
          if (node.closest(".construction-card-grid-v2, .inventory-resource-list-v2, .world-expedition-list-v2")) {
            return false;
          }
          const rect = node.getBoundingClientRect();
          if (!intersectsViewport(node)) return false;
          return rect.left < -1 || rect.right > window.innerWidth + 1 || rect.top < -1 || rect.bottom > window.innerHeight + 1;
        };
        const panelRect = panelNode?.getBoundingClientRect();
        const navRect = bottomNav?.getBoundingClientRect();
        const panelButtons = [...(panelNode?.querySelectorAll("button") ?? [])].filter(isVisible);
        return {
          bodyOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          panelVisible: isVisible(panelNode),
          panelInsideViewport: Boolean(panelRect)
            && panelRect.left >= -1
            && panelRect.right <= window.innerWidth + 1
            && panelRect.top >= -1
            && panelRect.bottom <= window.innerHeight + 1,
          panelClearsBottomDock: Boolean(panelRect && navRect) ? panelRect.bottom <= navRect.top + 1 : false,
          clippedPanelButtons: panelButtons.filter(viewportClipped).map(labelFor),
          required: requiredSelectors.map((selector) => ({
            selector,
            visibleCount: [...(root?.querySelectorAll(selector) ?? [])].filter((node) => isVisible(node) && intersectsViewport(node)).length,
          })),
        };
      }, { requiredSelectors });

      expect(metrics.bodyOverflowX).toBeLessThanOrEqual(1);
      expect(metrics.panelVisible).toBe(true);
      expect(metrics.panelInsideViewport).toBe(true);
      expect(metrics.panelClearsBottomDock).toBe(true);
      expect(metrics.clippedPanelButtons).toEqual([]);
      for (const item of metrics.required) {
        expect(item.visibleCount, `${panel} missing ${item.selector}`).toBeGreaterThan(0);
      }
    }

    await expectPanelReachable({
      panel: "construction",
      trigger: ".settlement-game-root .primary-build",
      requiredSelectors: [".construction-category-chip-v2", ".construction-card-v2", ".construction-placement-hint-v2"],
    });

    await expectPanelReachable({
      panel: "inventory",
      trigger: ".settlement-game-root .bottom-nav button[aria-label='Инвентарь']",
      requiredSelectors: [".inventory-selected-summary-v2", ".inventory-resource-row-v2"],
    });

    await expectPanelReachable({
      panel: "world",
      trigger: ".settlement-game-root .bottom-nav button[aria-label='Карта мира']",
      requiredSelectors: [".world-map-base-v2", ".world-map-marker", ".world-expedition-card-v2", ".world-expedition-action-v2"],
    });
  });

  test("Settlement mobile inventory keeps warehouse controls inside the panel", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `settlement_inventory_mobile_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /Town/ }).click();
    await expect(page.locator(".settlement-game-root .settlement-canvas")).toBeVisible({ timeout: 30000 });
    await page.locator(".settlement-game-root .bottom-nav button[aria-label='Инвентарь']").click();
    await expect(page.locator(".settlement-game-root")).toHaveAttribute("data-active-panel", "inventory");

    const metrics = await page.evaluate(() => {
      const root = document.querySelector(".settlement-game-root");
      const panel = root?.querySelector(".right-panel")?.getBoundingClientRect();
      const bottomNav = root?.querySelector(".bottom-nav")?.getBoundingClientRect();
      const action = root?.querySelector(".inventory-action-button-v2")?.getBoundingClientRect();
      const list = root?.querySelector(".inventory-resource-list-v2")?.getBoundingClientRect();
      const style = root?.querySelector(".inventory-resource-list-v2")
        ? getComputedStyle(root.querySelector(".inventory-resource-list-v2"))
        : null;
      return {
        panel: panel?.toJSON(),
        bottomNav: bottomNav?.toJSON(),
        action: action?.toJSON(),
        list: list?.toJSON(),
        listOverflowY: style?.overflowY,
        actionInsidePanel: Boolean(panel && action)
          && action.left >= panel.left - 1
          && action.right <= panel.right + 1
          && action.top >= panel.top - 1
          && action.bottom <= panel.bottom + 1,
        actionClearsBottomDock: Boolean(action && bottomNav) ? action.bottom <= bottomNav.top + 1 : false,
        actionInsideViewport: Boolean(action)
          && action.left >= -1
          && action.right <= window.innerWidth + 1
          && action.top >= -1
          && action.bottom <= window.innerHeight + 1,
      };
    });

    expect(metrics.action.width).toBeGreaterThanOrEqual(44);
    expect(metrics.action.height).toBeGreaterThanOrEqual(44);
    expect(metrics.actionInsidePanel).toBe(true);
    expect(metrics.actionClearsBottomDock).toBe(true);
    expect(metrics.actionInsideViewport).toBe(true);
    expect(metrics.list.height).toBeGreaterThan(120);
    expect(metrics.listOverflowY).toBe("auto");
  });

  test("Settlement tablet landscape keeps the bottom dock tappable beside the right panel", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `settlement_tablet_landscape_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /Town/ }).click();
    await expect(page.locator(".settlement-game-root .settlement-canvas")).toBeVisible({ timeout: 30000 });

    const dockMetrics = await page.evaluate(() => {
      const root = document.querySelector(".settlement-game-root");
      const nav = root?.querySelector(".bottom-nav");
      const primaryBuild = root?.querySelector(".primary-build");
      const visibleButtons = [...(root?.querySelectorAll(".bottom-nav button") ?? [])].filter((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });
      return {
        nav: nav?.getBoundingClientRect().toJSON(),
        primaryBuild: primaryBuild?.getBoundingClientRect().toJSON(),
        tinyButtons: visibleButtons
          .filter((button) => {
            const rect = button.getBoundingClientRect();
            return rect.width < 44 || rect.height < 44;
          })
          .map((button) => button.getAttribute("aria-label") || button.textContent.trim().replace(/\s+/g, " ")),
      };
    });

    expect(dockMetrics.primaryBuild.width).toBeGreaterThanOrEqual(44);
    expect(dockMetrics.primaryBuild.height).toBeGreaterThanOrEqual(44);
    expect(dockMetrics.tinyButtons).toEqual([]);

    await page.locator(".settlement-game-root .primary-build").click();
    await expect(page.locator(".settlement-game-root")).toHaveAttribute("data-active-panel", "construction");
    await expect(page.locator(".settlement-game-root .construction-placement-hint-v2")).toBeVisible();
  });

  test("pause menus preserve per-game mechanics and expose game-specific recovery state", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 420, height: 680 });
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `pause_menu_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });

    await boot(page);

    await page.getByRole("button", { name: /Blox/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    let overlay = await pauseActiveGame(page);
    await expect(overlay.locator('[data-pause-menu="blox"]')).toContainText("Place blocks from the tray");
    await expectCompactPauseMenu(overlay, 4);
    await overlay.getByRole("button", { name: /^Resume$/ }).click();
    await expect(page.locator(".game-menu-overlay:visible")).toHaveCount(0);
    overlay = await pauseActiveGame(page);
    await overlay.getByRole("button", { name: /^Exit$/ }).click();
    await expect(page.locator(".bottom-tabs")).toBeVisible();

    await page.getByRole("button", { name: /Gems/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    overlay = await pauseActiveGame(page);
    await expect(overlay.locator('[data-compact-pause="match3"]')).toContainText("Gem Crush");
    await expect(overlay.locator('[data-compact-pause="match3"]')).toContainText("Paused");
    await expect(overlay.locator('[data-mode-selector="match3"]')).toHaveCount(0);
    await expect(overlay.locator(".leaderboard")).toHaveCount(0);
    const match3PauseLayout = await overlay.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const smallButtons = [...node.querySelectorAll("button")]
        .filter((button) => {
          const styles = getComputedStyle(button);
          const box = button.getBoundingClientRect();
          return styles.display !== "none" && styles.visibility !== "hidden" && box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
        })
        .map((button) => button.textContent.trim());
      return {
        width: rect.width,
        height: rect.height,
        smallButtons,
      };
    });
    expect(match3PauseLayout.width).toBeGreaterThanOrEqual(350);
    expect(match3PauseLayout.height).toBeGreaterThanOrEqual(280);
    expect(match3PauseLayout.height).toBeLessThanOrEqual(361);
    expect(match3PauseLayout.width).toBeGreaterThanOrEqual(match3PauseLayout.height - 1);
    expect(match3PauseLayout.smallButtons).toEqual([]);
    await expectCompactPauseMenu(overlay, 4);
    await page.keyboard.press("Escape");
    await expect(page.locator(".game-menu-overlay:visible")).toHaveCount(0);
    overlay = await pauseActiveGame(page);
    await page.mouse.click(12, 12);
    await expect(page.locator(".game-menu-overlay:visible")).toHaveCount(0);
    overlay = await pauseActiveGame(page);
    await overlay.getByRole("button", { name: /^Exit$/ }).click();
    await expect(page.locator(".bottom-tabs")).toBeVisible();

    await page.getByRole("button", { name: /Merge/ }).click();
    overlay = await pauseActiveGame(page);
    await expect(overlay.locator('[data-pause-menu="merge"]')).toContainText("Merge matching items");
    await expectCompactPauseMenu(overlay, 3);
    await expect(overlay.getByRole("button", { name: /^Resume$/ }).first()).toBeVisible();
    await overlay.getByRole("button", { name: /^Resume$/ }).first().click();
    await expect(page.locator(".game-menu-overlay:visible")).toHaveCount(0);
    overlay = await pauseActiveGame(page);
    await overlay.getByRole("button", { name: /^Exit$/ }).click();
    await expect(page.locator(".bottom-tabs")).toBeVisible();

    await page.getByRole("button", { name: /Bubbo/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    overlay = await pauseActiveGame(page);
    await expect(overlay.locator('[data-pause-menu="bubbo"]')).toContainText("Aim a bubble");
    await expectCompactPauseMenu(overlay, 4);
    await overlay.getByRole("button", { name: /^Resume$/ }).click();
    await expect(page.locator(".game-menu-overlay:visible")).toHaveCount(0);
    overlay = await pauseActiveGame(page);
    await overlay.getByRole("button", { name: /^Exit$/ }).click();
    await expect(page.locator(".bottom-tabs")).toBeVisible();

    await page.getByRole("button", { name: /Trivia/ }).click();
    await page.getByRole("button", { name: "Solo" }).click();
    await expect(page.locator(".question-panel")).toBeVisible({ timeout: 10000 });
    overlay = await pauseActiveGame(page);
    await expect(overlay.locator('[data-pause-menu="trivia"]')).toContainText("Choose one answer");
    await expectCompactPauseMenu(overlay, 3);
    await expect(page.locator(".answer-grid")).toBeVisible();
    await overlay.getByRole("button", { name: /^Resume$/ }).click();
    await expect(page.locator(".game-menu-overlay:visible")).toHaveCount(0);
    overlay = await pauseActiveGame(page);
    await overlay.getByRole("button", { name: /^Exit$/ }).click();
    await expect(page.locator(".bottom-tabs")).toBeVisible();

    await page.getByRole("button", { name: /Yard/ }).click();
    await expect(page.locator(".companion-yard-stage")).toBeVisible();
    await expect(page.locator(".telegram-app.immersive-mode")).toBeVisible();
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.locator(".yard-game-screen")).toContainText("Back to garden");
  });

  test("Gem Crush live HUD stays clear and canvas redraws on viewport resize", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 980, height: 620 });
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `match3_resize_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });

    await page.goto("/");
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /Gems/ }).click();
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.locator(".game-play-hud")).toContainText("Gem Crush");
    await expect(page.locator('[data-game-shell="match3"] .game-play-event-log')).toHaveCount(0);

    const before = await expectMatch3BoardClearOfHud(page);
    await page.setViewportSize({ width: 420, height: 700 });
    await expect(page.locator('[data-game-shell="match3"] .pixi-host canvas')).toBeVisible();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[data-game-shell="match3"] .pixi-host canvas');
      return canvas && canvas.getBoundingClientRect().width < 520;
    });
    const after = await expectMatch3BoardClearOfHud(page);

    expect(after.board.width).toBeLessThan(before.board.width);
    expect(after.board.width).toBeGreaterThan(after.board.canvas.width * 0.72);
  });
});
