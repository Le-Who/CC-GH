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
    await expect(page.locator(".settlement-game-root .right-panel")).toBeVisible();
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
      const panelButtons = [...root.querySelectorAll(".right-panel button")].filter(isVisible);
      const resourcePills = [...root.querySelectorAll(".top-resources-core .resource-pill")].filter(isVisible);
      const bottomNav = root.querySelector(".bottom-nav")?.getBoundingClientRect();
      const rightPanel = root.querySelector(".right-panel")?.getBoundingClientRect();
      return {
        bodyOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        clippedPanelButtons: panelButtons.filter(viewportClipped).map(labelFor),
        clippedResourcePills: resourcePills.filter(viewportClipped).map(labelFor),
        visibleResourcePills: resourcePills.length,
        panelClearsBottomDock: rightPanel && bottomNav ? rightPanel.bottom <= bottomNav.top - 4 : false,
      };
    });

    expect(metrics.bodyOverflowX).toBeLessThanOrEqual(1);
    expect(metrics.clippedPanelButtons).toEqual([]);
    expect(metrics.clippedResourcePills).toEqual([]);
    expect(metrics.visibleResourcePills).toBeLessThanOrEqual(2);
    expect(metrics.panelClearsBottomDock).toBe(true);
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
