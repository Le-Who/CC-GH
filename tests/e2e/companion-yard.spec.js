import { test, expect } from "@playwright/test";
import { createDefaultPlayer, isYardPointInPlayzone } from "../../game-logic.js";
import { buildSnapshot } from "../../routes/player.js";
import { isPointInsideObstacle } from "../../src/games/companion-yard/movement.js";

function buildYardMovementSnapshot(now = Date.now()) {
  const player = createDefaultPlayer("yard-motion-user", "Yard Motion", now);
  player.yard.lastSimulatedAt = now;
  player.yard.placedGoodies = [{
    slotId: "large-1",
    goodieId: "cardboard_cottage",
    condition: "worn",
    uses: 12,
    placedAt: now - 60_000,
  }];
  player.yard.activeVisitors = [
    {
      visitId: "visit-mika",
      visitorId: "mika_cat",
      goodieId: "cardboard_cottage",
      slotId: "large-1",
      bowlId: "bowl-1",
      pose: "peek",
      activityId: "window-peek",
      activityLayer: "back",
      entryEdge: "left",
      facing: "right",
      motionSeed: "mika-motion",
      arrivedAt: now - 8 * 60_000,
      leavesAt: now + 40 * 60_000,
    },
    {
      visitId: "visit-mochi",
      visitorId: "mochi_bunny",
      goodieId: "cardboard_cottage",
      slotId: "large-1",
      bowlId: "bowl-1",
      pose: "rest",
      activityId: "door-lounge",
      activityLayer: "front",
      entryEdge: "right",
      facing: "left",
      motionSeed: "mochi-motion",
      arrivedAt: now - 6 * 60_000,
      leavesAt: now + 42 * 60_000,
    },
  ];
  return buildSnapshot(player);
}

function buildFreePlacementSnapshot(now = Date.now()) {
  const player = createDefaultPlayer("yard-placement-user", "Yard Placement", now);
  player.yard.lastSimulatedAt = now;
  player.yard.goodieInventory = {
    yarn_mouse: 1,
    sun_cushion: 1,
  };
  player.yard.placedGoodies = [];
  player.yard.activeVisitors = [];
  return buildSnapshot(player);
}

function buildOccupiedPlacementSnapshot(now = Date.now()) {
  const player = createDefaultPlayer("yard-occupied-placement-user", "Yard Occupied Placement", now);
  player.yard.lastSimulatedAt = now;
  player.yard.goodieInventory = {
    yarn_mouse: 1,
  };
  player.yard.placedGoodies = [{
    slotId: "occupied-sun-cushion",
    goodieId: "sun_cushion",
    condition: "new",
    uses: 0,
    x: 68,
    y: 58,
    placedAt: now - 60_000,
  }];
  player.yard.activeVisitors = [];
  return buildSnapshot(player);
}

function buildPlayzoneAuditSnapshot(remodel = "meadow", now = Date.now()) {
  const player = createDefaultPlayer(`yard-playzone-${remodel}`, "Yard Playzone", now);
  player.yard.lastSimulatedAt = now;
  player.yard.remodel = remodel;
  player.yard.ownedRemodels = ["meadow", "moon_garden", "tea_house"];
  player.yard.goodieInventory = { yarn_mouse: 1 };
  player.yard.placedGoodies = [
    {
      slotId: "nap-cushion",
      goodieId: "sun_cushion",
      condition: "new",
      uses: 0,
      x: remodel === "tea_house" ? 50 : 52,
      y: remodel === "tea_house" ? 70 : 66,
      placedAt: now - 240000,
    },
    {
      slotId: "path-blocker",
      goodieId: "yarn_mouse",
      condition: "new",
      uses: 0,
      x: remodel === "moon_garden" ? 45 : 50,
      y: remodel === "moon_garden" ? 64 : 62,
      placedAt: now - 180000,
    },
    {
      slotId: "runner-toy",
      goodieId: "yarn_mouse",
      condition: "new",
      uses: 0,
      x: remodel === "tea_house" ? 64 : 70,
      y: remodel === "tea_house" ? 66 : 64,
      placedAt: now - 120000,
    },
  ];
  player.yard.activeVisitors = [
    {
      visitId: `visit-mochi-${remodel}`,
      visitorId: "mochi_bunny",
      goodieId: "sun_cushion",
      slotId: "nap-cushion",
      bowlId: "bowl-1",
      pose: "nap",
      activityId: "nap",
      activityLayer: "front",
      entryEdge: "left",
      facing: "right",
      motionSeed: `mochi-${remodel}`,
      arrivedAt: now - 30 * 60_000,
      leavesAt: now + 30 * 60_000,
    },
    {
      visitId: `visit-mika-${remodel}`,
      visitorId: "mika_cat",
      goodieId: "yarn_mouse",
      slotId: "runner-toy",
      bowlId: "bowl-1",
      pose: "pounce",
      activityId: "chase",
      activityLayer: "front",
      entryEdge: "left",
      facing: "right",
      motionSeed: `mika-${remodel}`,
      arrivedAt: now - 30 * 60_000,
      leavesAt: now + 30 * 60_000,
    },
  ];
  return buildSnapshot(player);
}

function buildHudAuditSnapshot(now = Date.now()) {
  const player = createDefaultPlayer("yard-hud-user", "Yard HUD", now);
  player.yard.lastSimulatedAt = now;
  player.yard.currencies = { treats: 704, shinyTreats: 4 };
  player.yard.foodInventory = { kibble: 3, berry_plate: 2, bonito_bowl: 1 };
  player.yard.goodieInventory = {
    yarn_mouse: 2,
    sun_cushion: 1,
    leaf_pot: 1,
  };
  player.yard.placedGoodies = [
    {
      slotId: "slot-yarn",
      goodieId: "yarn_mouse",
      condition: "new",
      uses: 0,
      x: 31,
      y: 58,
      placedAt: now - 120000,
    },
    {
      slotId: "slot-cottage",
      goodieId: "cardboard_cottage",
      condition: "worn",
      uses: 12,
      x: 49,
      y: 43,
      placedAt: now - 240000,
    },
  ];
  player.yard.activeVisitors = [{
    visitId: "visit-mika",
    visitorId: "mika_cat",
    goodieId: "cardboard_cottage",
    slotId: "slot-cottage",
    bowlId: "bowl-1",
    pose: "peek",
    activityId: "window-peek",
    activityLayer: "back",
    entryEdge: "left",
    facing: "right",
    motionSeed: "mika-motion",
    arrivedAt: now - 8 * 60_000,
    leavesAt: now + 40 * 60_000,
  }];
  player.yard.pendingGifts = [{
    id: "gift-mika",
    visitorId: "mika_cat",
    treats: 42,
    shinyTreats: 1,
    createdAt: now - 60000,
  }];
  player.yard.petbook = {
    mika_cat: { visits: 3, lastVisitedAt: now - 60000 },
  };
  player.yard.album = {
    favoritePhotoId: null,
    photos: [{
      id: "photo-mika",
      visitorId: "mika_cat",
      pose: "peek",
      caption: "Mika by the window",
      takenAt: now - 50000,
    }],
  };
  player.yard.expansion = { level: 1 };
  player.yard.ownedRemodels = ["meadow", "moon_garden"];
  player.yard.helper = { unlocked: true, autoRefill: false, preferredFoodId: "kibble" };
  player.yard.dailyLetter = { lastClaimedDate: "2026-04-30", stamps: 4 };
  return buildSnapshot(player);
}

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

async function expectAppReady(page) {
  await expect(page.locator(".status-dot.ready")).toHaveCount(1, { timeout: 15000 });
}

test.describe("Cozy Yard movement and assets", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `yard_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });
  });

  test("renders manifest-backed backgrounds, layered visitors, and selected visitor capture", async ({ page }) => {
    const snapshot = buildYardMovementSnapshot();
    const mutateBodies = [];

    await page.route("**/assets/manifest.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          graphics: {
            games: {
              companionYard: {
                backgrounds: {
                  meadow: "/custom-yard/backgrounds/meadow-test.webp",
                },
              },
            },
          },
        }),
      });
    });

    await page.route("**/api/player/snapshot", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(snapshot),
      });
    });

    await page.route("**/api/player/mutate", async (route) => {
      mutateBodies.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ snapshot }),
      });
    });

    await page.goto("/");
    await expectAppReady(page);

    await page.getByRole("button", { name: /Yard/ }).click();
    await expect(page.locator(".companion-yard-stage")).toBeVisible();
    await expect(page.locator(".yard-background-art")).toHaveAttribute("src", "/custom-yard/backgrounds/meadow-test.webp");
    await expect(page.locator(".yard-visitor")).toHaveCount(2);
    expect(await page.locator(".yard-pet-layer-back .yard-visitor").count()).toBeGreaterThan(0);
    expect(await page.locator(".yard-pet-layer-front .yard-visitor").count()).toBeGreaterThan(0);
    const cottageBox = await page.getByRole("button", { name: /Cardboard Cottage placed goodie/ }).boundingBox();
    expect(cottageBox).not.toBeNull();
    const cottageVisitorCenters = {};
    for (const visitorName of ["Mika visitor", "Mochi visitor"]) {
      const visitor = page.getByRole("button", { name: visitorName });
      const visitorBox = await visitor.boundingBox();
      expect(visitorBox, `${visitorName} should render near the cottage`).not.toBeNull();
      const visitorCenter = {
        x: visitorBox.x + visitorBox.width / 2,
        y: visitorBox.y + visitorBox.height / 2,
      };
      cottageVisitorCenters[visitorName] = visitorCenter;
      const cottageCenter = {
        x: cottageBox.x + cottageBox.width / 2,
        y: cottageBox.y + cottageBox.height / 2,
      };
      expect(Math.abs(visitorCenter.x - cottageCenter.x), `${visitorName} should stay horizontally attached to the decor`).toBeLessThan(cottageBox.width * 0.7);
      expect(Math.abs(visitorCenter.y - cottageCenter.y), `${visitorName} should stay vertically attached to the decor`).toBeLessThan(cottageBox.height * 0.9);
    }
    await expect(page.getByRole("button", { name: "Mika visitor" })).toHaveAttribute("data-visual-anchor-x", /^(6[4-9]|[78]\d)\./);
    await expect(page.getByRole("button", { name: "Mochi visitor" })).toHaveAttribute("data-visual-anchor-x", /^([12]\d|3[0-6])\./);
    expect(
      cottageVisitorCenters["Mochi visitor"].x - cottageVisitorCenters["Mika visitor"].x,
      "cottage visitors should occupy distinct left/right decor targets instead of clustering at the center",
    ).toBeGreaterThan(cottageBox.width * 0.35);

    const mochiVisitor = page.getByRole("button", { name: "Mochi visitor" });
    const labelState = await mochiVisitor.locator("b").evaluate((node) => {
      const styles = getComputedStyle(node);
      return { opacity: Number(styles.opacity), visibility: styles.visibility };
    });
    expect(labelState.opacity).toBe(0);
    expect(labelState.visibility).toBe("hidden");
    const canHover = await page.evaluate(() => window.matchMedia("(hover: hover)").matches);
    if (canHover) {
      await mochiVisitor.hover({ force: true });
      await expect(mochiVisitor.locator("b")).toBeVisible();
      await page.mouse.move(1, 1);
    }
    await mochiVisitor.click({ force: true });
    await expect(mochiVisitor).toHaveClass(/selected/);
    await page.mouse.move(1, 1);
    await mochiVisitor.evaluate((node) => node.blur());
    await page.waitForTimeout(180);
    const selectedLabelState = await mochiVisitor.locator("b").evaluate((node) => {
      const styles = getComputedStyle(node);
      return { opacity: Number(styles.opacity), visibility: styles.visibility };
    });
    expect(selectedLabelState.opacity).toBe(0);
    expect(selectedLabelState.visibility).toBe("hidden");

    await page.getByRole("button", { name: "Tools" }).click();
    await page.getByRole("button", { name: "Camera" }).click();
    await expect.poll(() => mutateBodies.some((body) => body.action === "yard.capturePhoto")).toBe(true);
    const capture = mutateBodies.find((body) => body.action === "yard.capturePhoto");
    expect(capture.payload.visitId).toBe("visit-mochi");
  });

  test("opens in-game HUD screens and places a goodie at free coordinates", async ({ page }) => {
    const snapshot = buildFreePlacementSnapshot();
    const mutateBodies = [];

    await page.route("**/api/player/snapshot", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(snapshot),
      });
    });

    await page.route("**/api/player/mutate", async (route) => {
      mutateBodies.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ snapshot }),
      });
    });

    await page.goto("/");
    await expectAppReady(page);

    await page.getByRole("button", { name: /Yard/ }).click();
    await page.getByRole("button", { name: "Goodies", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Goodies" })).toBeVisible();

    await page.getByRole("button", { name: "Place" }).first().click();
    await expect(page.getByRole("button", { name: "Confirm placement" })).toBeVisible();

    const stage = page.locator(".companion-yard-stage");
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box.x + box.width * 0.68, box.y + box.height * 0.58);
    await page.getByRole("button", { name: "Confirm placement" }).click();

    await expect.poll(() => mutateBodies.some((body) => body.action === "yard.placeGoodie")).toBe(true);
    const placement = mutateBodies.find((body) => body.action === "yard.placeGoodie");
    expect(placement.payload.goodieId).toBe("yarn_mouse");
    expect(placement.payload.x).toBeGreaterThan(62);
    expect(placement.payload.x).toBeLessThan(74);
    expect(placement.payload.y).toBeGreaterThan(52);
    expect(placement.payload.y).toBeLessThan(64);
  });

  test("keeps placement mode when tapping over an existing goodie", async ({ page }) => {
    const snapshot = buildOccupiedPlacementSnapshot();
    const mutateBodies = [];

    await page.route("**/api/player/snapshot", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(snapshot),
      });
    });

    await page.route("**/api/player/mutate", async (route) => {
      mutateBodies.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ snapshot }),
      });
    });

    await page.goto("/");
    await expectAppReady(page);

    await page.getByRole("button", { name: /Yard/ }).click();
    await page.getByRole("button", { name: "Goodies", exact: true }).click();
    const goodiesDialog = page.getByRole("dialog", { name: "Goodies" });
    await goodiesDialog.getByRole("button", { name: "Place", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Confirm placement" })).toBeVisible();

    const stage = page.locator(".companion-yard-stage");
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box.x + box.width * 0.68, box.y + box.height * 0.58);
    await page.getByRole("button", { name: "Confirm placement" }).click();

    await expect.poll(() => mutateBodies.some((body) => body.action === "yard.placeGoodie")).toBe(true);
    expect(mutateBodies.some((body) => body.action === "yard.moveGoodie")).toBe(false);
    const placement = mutateBodies.find((body) => body.action === "yard.placeGoodie");
    expect(placement.payload.goodieId).toBe("yarn_mouse");
    expect(placement.payload.x).toBeGreaterThan(66);
    expect(placement.payload.x).toBeLessThan(70);
    expect(placement.payload.y).toBeGreaterThan(56);
    expect(placement.payload.y).toBeLessThan(60);
  });

  test("keeps visitors and free placement inside mobile playzones across yard backgrounds", async ({ page }) => {
    let snapshot = buildPlayzoneAuditSnapshot("meadow");

    await page.route("**/api/player/snapshot", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(snapshot),
      });
    });

    await page.route("**/api/player/mutate", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ snapshot }),
      });
    });

    for (const [remodel, label] of [
      ["meadow", "Morning Meadow"],
      ["moon_garden", "Moon Garden"],
      ["tea_house", "Tea House"],
    ]) {
      snapshot = buildPlayzoneAuditSnapshot(remodel);
      await page.goto("/");
      await expectAppReady(page);
      if (!await page.locator(".companion-yard-stage").isVisible()) {
        await page.getByRole("button", { name: /Yard/ }).click();
      }
      await expect(page.locator(".companion-yard-stage")).toBeVisible();
      await expect(page.locator(".yard-background-art")).toHaveAttribute("src", new RegExp(`${remodel}`));

      const mikaMotion = await page.getByRole("button", { name: "Mika visitor" }).evaluate((node) => ({
        x: Number(node.dataset.motionX),
        y: Number(node.dataset.motionY),
      }));
      expect(isYardPointInPlayzone(remodel, mikaMotion.x, mikaMotion.y), `${label} active visitor should stay in the playzone`).toBe(true);
      expect(isPointInsideObstacle(mikaMotion, {
        x: (remodel === "moon_garden" ? 45 : 50) - 7,
        y: (remodel === "moon_garden" ? 64 : 62) - 6,
        width: 14,
        height: 12,
      }), `${label} active visitor should be repelled by the blocking goodie`).toBe(false);

      const cushionBox = await page.getByRole("button", { name: /Sun Cushion placed goodie/ }).boundingBox();
      const mochiBox = await page.getByRole("button", { name: "Mochi visitor" }).boundingBox();
      expect(cushionBox, `${label} cushion should render`).not.toBeNull();
      expect(mochiBox, `${label} stationary visitor should render`).not.toBeNull();
      const cushionCenter = {
        x: cushionBox.x + cushionBox.width / 2,
        y: cushionBox.y + cushionBox.height / 2,
      };
      const mochiCenter = {
        x: mochiBox.x + mochiBox.width / 2,
        y: mochiBox.y + mochiBox.height / 2,
      };
      expect(Math.abs(mochiCenter.x - cushionCenter.x), `${label} stationary visitor should stay horizontally on the decor`).toBeLessThan(cushionBox.width * 0.55);
      expect(Math.abs(mochiCenter.y - cushionCenter.y), `${label} stationary visitor should stay visually on the decor`).toBeLessThan(cushionBox.height * 0.75);
    }
  });

  test("clamps free move targets to the playable yard on narrow mobile", async ({ page }) => {
    const snapshot = buildOccupiedPlacementSnapshot();
    const mutateBodies = [];

    await page.route("**/api/player/snapshot", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(snapshot),
      });
    });

    await page.route("**/api/player/mutate", async (route) => {
      mutateBodies.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ snapshot }),
      });
    });

    await page.goto("/");
    await expectAppReady(page);

    await page.getByRole("button", { name: /Yard/ }).click();
    await page.getByRole("button", { name: "Goodies", exact: true }).click();
    const goodiesDialog = page.getByRole("dialog", { name: "Goodies" });
    await goodiesDialog.getByRole("button", { name: "Move", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirm placement" })).toBeVisible();

    const stage = page.locator(".companion-yard-stage");
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.08);
    await page.getByRole("button", { name: "Confirm placement" }).click();

    await expect.poll(() => mutateBodies.some((body) => body.action === "yard.moveGoodie")).toBe(true);
    const move = mutateBodies.find((body) => body.action === "yard.moveGoodie");
    expect(isYardPointInPlayzone("meadow", move.payload.x, move.payload.y)).toBe(true);
  });

  test("keeps mobile standalone HUD and screens readable in dark mode", async ({ page }) => {
    const snapshot = buildHudAuditSnapshot();
    const screens = [
      ["Food", "Food bowls"],
      ["Goodies", "Goodies"],
      ["Shop", "Shop"],
      ["Petbook", "Petbook"],
      ["Album", "Photo album"],
      ["Gifts", "Gift collection"],
      ["Repair goodies", "Repair goodies"],
      ["Remodel yard", "Remodel yard"],
      ["Expansion", "Expansion"],
      ["Daily letter", "Daily letter"],
      ["Companion helper", "Companion helper"],
      ["Settings", "Settings"],
    ];

    await page.addInitScript(() => {
      window.localStorage.setItem("garden_shelf_language", "en");
      window.localStorage.setItem("game_hub_ui_theme", "dark");
    });

    await page.route("**/api/player/snapshot", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(snapshot),
      });
    });

    await page.goto("/");
    await expectAppReady(page);

    await page.getByRole("button", { name: /Yard/ }).click();
    await expect(page.locator(".companion-yard-stage")).toBeVisible();

    const hudMetrics = await page.evaluate(() => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const minSide = (selector) => {
        const values = [...document.querySelectorAll(selector)]
          .filter(visible)
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return Math.min(rect.width, rect.height);
          });
        return values.length ? Math.min(...values) : 0;
      };
      return {
        viewportWidth: window.innerWidth,
        bottomIconMin: minSide(".yard-bottom-dock .yard-hud-icon"),
        compactIconMin: minSide(".yard-corner-actions .yard-hud-icon, .yard-side-tools .yard-hud-icon"),
        compactButtonMin: minSide(".yard-corner-actions .yard-icon-button, .yard-side-tools .yard-icon-button"),
        goodieSizes: Object.fromEntries([...document.querySelectorAll(".yard-placed-goodie")]
          .filter(visible)
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return [el.dataset.goodieId, { width: rect.width, height: rect.height }];
          })),
      };
    });
    expect(hudMetrics.bottomIconMin).toBeGreaterThanOrEqual(38);
    expect(hudMetrics.compactIconMin).toBeGreaterThanOrEqual(38);
    expect(hudMetrics.compactButtonMin).toBeGreaterThanOrEqual(48);
    expect(hudMetrics.goodieSizes.yarn_mouse.width).toBeLessThan(hudMetrics.goodieSizes.cardboard_cottage.width * 0.55);
    expect(hudMetrics.goodieSizes.yarn_mouse.height).toBeLessThan(hudMetrics.goodieSizes.cardboard_cottage.height * 0.55);
    expect(hudMetrics.goodieSizes.cardboard_cottage.width).toBeGreaterThan(hudMetrics.viewportWidth <= 420 ? 140 : 150);
    expect(await contrastRatioFor(page, ".yard-currency-chip .yard-currency-label", ".yard-currency-chip")).toBeGreaterThanOrEqual(4.5);
    const legacyHudBackgrounds = await page.evaluate(() => {
      const selectors = [".yard-currency-chip", ".yard-side-tools", ".yard-bottom-dock", ".yard-activity-pill"];
      return selectors.flatMap((selector) => [...document.querySelectorAll(selector)]
        .map((node) => ({ selector, backgroundImage: getComputedStyle(node).backgroundImage }))
        .filter(({ backgroundImage }) => /companion-yard\/ui|cozy-[\w-]+\.png/.test(backgroundImage)));
    });
    expect(legacyHudBackgrounds).toEqual([]);

    for (const [buttonName, dialogName] of screens) {
      const close = page.getByRole("button", { name: "Close" });
      if (await close.count()) await close.first().click();

      const screenButton = page.getByRole("button", { name: buttonName, exact: true });
      if (!await screenButton.count() || !await screenButton.first().isVisible()) {
        await page.getByRole("button", { name: "Tools", exact: true }).click();
      }
      await screenButton.click();
      await expect(page.getByRole("dialog", { name: dialogName })).toBeVisible();
      const legacyScreenBackgrounds = await page.evaluate(() => {
        const selectors = [".yard-game-screen", ".yard-screen-header", ".yard-shop-row-polished", ".yard-price-chip"];
        return selectors.flatMap((selector) => [...document.querySelectorAll(selector)]
          .map((node) => ({ selector, backgroundImage: getComputedStyle(node).backgroundImage }))
          .filter(({ backgroundImage }) => /companion-yard\/ui|cozy-[\w-]+\.png/.test(backgroundImage)));
      });
      expect(legacyScreenBackgrounds).toEqual([]);

      const layout = await page.evaluate(() => {
        const screen = document.querySelector(".yard-game-screen")?.getBoundingClientRect();
        const dock = document.querySelector(".yard-bottom-dock")?.getBoundingClientRect();
        const smallButtons = [...document.querySelectorAll(".yard-game-screen button")]
          .filter((button) => {
            const rect = button.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
          })
          .map((button) => button.getAttribute("aria-label") || button.textContent.trim());
        return {
          screenBottom: screen?.bottom || 0,
          dockTop: dock?.top || window.innerHeight,
          smallButtons,
        };
      });
      expect(layout.screenBottom).toBeLessThanOrEqual(layout.dockTop);
      expect(layout.smallButtons).toEqual([]);

      if (buttonName === "Shop") {
        await expect(page.locator(".yard-shop-row-polished").first()).toBeVisible();
        await expect(page.locator(".yard-shop-row-polished .yard-price-chip").first()).toBeVisible();
        expect(await page.locator(".yard-price-chip.is-plain .yard-hud-icon").count()).toBe(0);
        const shopLayout = await page.locator(".yard-shop-row-polished").first().evaluate((row) => {
          const copy = row.querySelector(".yard-shop-copy small")?.getBoundingClientRect();
          const price = row.querySelector(".yard-price-chip")?.getBoundingClientRect();
          const action = row.querySelector(".yard-row-actions")?.getBoundingClientRect();
          const thumb = row.querySelector(".yard-shop-thumb")?.getBoundingClientRect();
          return {
            priceText: row.querySelector(".yard-price-chip")?.textContent?.trim() || "",
            copyRight: copy?.right || 0,
            copyBottom: copy?.bottom || 0,
            priceLeft: price?.left || 0,
            priceTop: price?.top || 0,
            priceRight: price?.right || 0,
            actionLeft: action?.left || 0,
            thumbRight: thumb?.right || 0,
            sameRow: Math.abs((price?.top || 0) - (action?.top || 0)) < 12,
          };
        });
        expect(shopLayout.priceText.length).toBeGreaterThan(0);
        expect(await contrastRatioFor(page, ".yard-price-chip b", ".yard-price-chip")).toBeGreaterThanOrEqual(4.5);
        expect(shopLayout.actionLeft).toBeGreaterThanOrEqual(shopLayout.thumbRight);
        if (shopLayout.copyBottom > shopLayout.priceTop + 1) {
          expect(shopLayout.copyRight).toBeLessThanOrEqual(shopLayout.priceLeft + 1);
        }
        if (shopLayout.sameRow) {
          expect(shopLayout.priceRight).toBeLessThanOrEqual(shopLayout.actionLeft + 1);
        }
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: dialogName })).toHaveCount(0);
      }
    }

    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await page.locator(".yard-background-art").click({ position: { x: 16, y: 180 }, force: true });
    await expect(page.locator(".yard-game-screen")).toHaveCount(0);

    await page.getByRole("button", { name: "Goodies", exact: true }).click();
    await page.getByRole("dialog", { name: "Goodies" }).getByRole("button", { name: "Place", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Confirm placement" })).toBeVisible();
    expect(await contrastRatioFor(page, ".yard-placement-dock span", ".yard-placement-dock")).toBeGreaterThanOrEqual(4.5);
  });

  test("localizes active visitor status and keeps bottom dock labels as press tooltips on mobile", async ({ page }) => {
    const snapshot = buildHudAuditSnapshot();
    snapshot.yard.pendingGifts = [];

    await page.addInitScript(() => {
      window.localStorage.setItem("garden_shelf_language", "ru");
      window.localStorage.setItem("game_hub_ui_theme", "dark");
    });

    await page.route("**/api/player/snapshot", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(snapshot),
      });
    });

    await page.goto("/");
    await expectAppReady(page);

    await page.getByRole("button", { name: /Двор|Yard/ }).click();
    const activityPill = page.locator(".yard-activity-pill");
    await expect(activityPill).toContainText("Гостей: 1");
    await expect(activityPill).not.toContainText("{count}");

    const dockItems = await page.evaluate(() => [...document.querySelectorAll(".yard-bottom-dock .yard-icon-button")]
      .map((button) => {
        const rect = button.getBoundingClientRect();
        const icon = button.querySelector(".yard-hud-icon")?.getBoundingClientRect();
        const label = button.querySelector(".yard-icon-label")?.getBoundingClientRect();
        const labelStyle = button.querySelector(".yard-icon-label")
          ? getComputedStyle(button.querySelector(".yard-icon-label"))
          : null;
        return {
          ariaLabel: button.getAttribute("aria-label"),
          tooltip: button.getAttribute("data-tooltip"),
          labelVisible: !!label
            && labelStyle?.display !== "none"
            && labelStyle?.visibility !== "hidden"
            && (label.width || 0) > 2
            && (label.height || 0) > 2,
          iconCentered:
            !!icon
            && Math.abs(((icon.left + icon.right) / 2) - ((rect.left + rect.right) / 2)) <= 3
            && Math.abs(((icon.top + icon.bottom) / 2) - ((rect.top + rect.bottom) / 2)) <= 3,
        };
      }));
    expect(dockItems).toHaveLength(6);
    for (const item of dockItems) {
      expect(item.ariaLabel).toBeTruthy();
      expect(item.tooltip).toBe(item.ariaLabel);
      expect(item.labelVisible).toBe(false);
      expect(item.iconCentered).toBe(true);
    }

    const foodButton = page.locator(".yard-bottom-dock .yard-icon-button").first();
    await foodButton.dispatchEvent("pointerdown");
    await expect(page.locator(".yard-bottom-dock .press-tooltip")).toContainText(/Еда|Food/);
    await foodButton.dispatchEvent("pointerup");
    await expect(page.locator(".yard-bottom-dock .press-tooltip")).toHaveCount(0);
  });
});
