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

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Game Hub" })).toBeVisible();
    await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Cozy Farm")).toBeVisible();
    await expect(page.locator("#auth-dialog")).toHaveCount(0);
    await expect(page.locator("#screen-farm")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});
