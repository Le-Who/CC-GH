import { test, expect } from "@playwright/test";
import { createDefaultPlayer } from "../../game-logic.js";
import { buildSnapshot } from "../../routes/player.js";

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
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: /Yard/ }).click();
    await expect(page.getByText("Cozy Yard")).toBeVisible();
    await expect(page.locator(".yard-background-art")).toHaveAttribute("src", "/custom-yard/backgrounds/meadow-test.webp");
    await expect(page.locator(".yard-visitor")).toHaveCount(2);
    expect(await page.locator(".yard-pet-layer-back .yard-visitor").count()).toBeGreaterThan(0);
    expect(await page.locator(".yard-pet-layer-front .yard-visitor").count()).toBeGreaterThan(0);

    await page.getByRole("button", { name: /^Play$/ }).click();
    await page.getByRole("button", { name: "Mochi visitor" }).click({ force: true });
    await expect(page.locator(".game-play-title")).toContainText("Mochi selected");

    await page.getByRole("button", { name: "Photo" }).click();
    await expect.poll(() => mutateBodies.some((body) => body.action === "yard.capturePhoto")).toBe(true);
    const capture = mutateBodies.find((body) => body.action === "yard.capturePhoto");
    expect(capture.payload.visitId).toBe("visit-mochi");
  });
});
