import { test, expect } from "@playwright/test";

test.describe("Telegram-first auth shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("gh_dev_user_id", `auth_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    });
  });

  test("boots with dev auth and does not render retired auth UI", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const snapshotResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/player/snapshot" && response.request().method() === "GET");
    await page.goto("/");
    const snapshot = await snapshotResponse;
    expect(snapshot.ok()).toBe(true);
    expect(await snapshot.json()).toHaveProperty("player");
    // Garden intentionally hides the global title; authenticate against the live shell.
    await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab', 'garden');
    await expect(page.locator('.gs2-stage')).toBeVisible();
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("My Garden")).toBeVisible();
    await expect(page.locator("#auth-dialog")).toHaveCount(0);
    await expect(page.locator("#screen-farm")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});
