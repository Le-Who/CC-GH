import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('User can register and login successfully', async ({ page }) => {
    // Navigate to the root
    await page.goto('/');

    // Wait for auth dialog
    const dialog = page.locator('#auth-dialog');
    await expect(dialog).toBeVisible();

    // Switch to Register tab
    await dialog.locator('button[data-tab="register"]').click();

    // Fill in registration details
    const uniqueUser = `testuser_${Date.now()}`;
    await dialog.locator('#auth-username').fill(uniqueUser);
    await dialog.locator('#auth-password').fill('pass1234');

    // Submit registration
    await dialog.locator('#auth-submit').click();

    // Ensure the dialog closes (meaning successful registration)
    await expect(dialog).not.toBeVisible();

    // Ensure we see the farm screen or main lobby
    await expect(page.locator('#screen-farm')).toBeVisible();
  });

  test('User can continue as guest', async ({ page }) => {
    await page.goto('/');

    const dialog = page.locator('#auth-dialog');
    await expect(dialog).toBeVisible();

    // Click "Continue as Guest"
    await dialog.locator('#auth-demo-btn').click();

    // Ensure the dialog closes
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('#screen-farm')).toBeVisible();
  });
});
