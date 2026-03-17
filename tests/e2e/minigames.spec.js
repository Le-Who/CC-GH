import { test, expect } from '@playwright/test';

test.describe('Minigames Navigation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass Welcome Screen onboarding
    await page.addInitScript(() => {
      window.localStorage.setItem('gh_onboarded', 'true');
    });

    await page.goto('/');
    // Register
    const dialog = page.locator('#auth-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('button[data-tab="register"]').click();
    await dialog.locator('#auth-username').fill(`gamer_${Date.now()}`);
    await dialog.locator('#auth-password').fill('pass1234');
    await dialog.locator('#auth-submit').click();
    await expect(dialog).not.toBeVisible();
  });

  test('Navigate between Minigames', async ({ page }) => {
    // Attempt to navigate to Match 3
    await page.getByRole('button', { name: 'Match-3' }).click();

    // Check Match3 Score/Moves labels
    await expect(page.locator('#m3-score')).toBeVisible();
    await expect(page.locator('#m3-moves-label')).toHaveText('Moves');

    // Attempt to navigate to Building Blox
    await page.getByRole('button', { name: 'Blox' }).click();

    // Check Blox Score/Lines labels
    await expect(page.locator('#blox-score')).toBeVisible();
    await expect(page.locator('#blox-lines')).toBeVisible();
    
    // Attempt to navigate to Trivia
    await page.getByRole('button', { name: 'Trivia' }).click();

    // Check Trivia Solo button
    await expect(page.locator('#btn-trivia-solo')).toBeVisible();
  });
});
