import { test, expect } from '@playwright/test';
import { mountHomePlayerFixture } from './helpers/homePlayerFixture.js';

const gameUrl = 'https://bentoku-nine.vercel.app/**';
// Controlled hosted-app boundary. Real Bentoku gameplay is checked separately
// against its build; these tests cover Hub navigation and transport failures.
const hostedPage = `<!doctype html><html><body><button>Place piece</button><output>0</output><script>
const origin=new URL(document.referrer).origin;
window.addEventListener('message',event=>{
 if(event.origin!==origin||event.source!==parent||event.data?.version!==1)return;
 if(event.data.type==='ccgh:bentoku:connect')parent.postMessage({type:'bentoku:ready',version:1},origin);
 if(event.data.type==='ccgh:bentoku:visibility')document.body.dataset.active=String(event.data.visible);
});
document.querySelector('button').onclick=()=>document.querySelector('output').textContent=String(Number(document.querySelector('output').textContent)+1);
parent.postMessage({type:'bentoku:ready',version:1},origin);
</script></body></html>`;

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('gh_dev_user_id', 'bentoku-host-fixture');
    localStorage.setItem('garden_shelf_language', 'en');
  });
  await mountHomePlayerFixture(page);
});

test('catalogue launches hosted Bentoku in the same app and Home retains its iframe', async ({ page }) => {
  await page.route(gameUrl, route => route.fulfill({ contentType: 'text/html', body: hostedPage }));
  await page.goto('/?tab=bentoku');
  const shell = page.locator('[data-game-shell="bentoku"]');
  await expect(shell).toHaveAttribute('data-status', 'ready');
  await expect(page.locator('iframe[title="Bentoku"]')).toHaveAttribute('src', 'https://bentoku-nine.vercel.app/?embed=ccgh');
  const game = page.frameLocator('iframe[title="Bentoku"]');
  await game.getByRole('button', { name: 'Place piece' }).click();
  await page.getByRole('button', { name: 'All games', exact: true }).click();
  await expect(game.locator('body')).toHaveAttribute('data-active', 'false');
  const card = page.locator('[data-home-game="bentoku"]');
  await expect(card).toHaveAccessibleName('Bentoku');
  await card.click();
  await expect(page.getByTestId('home-catalogue')).toHaveCount(0);
  await expect(game.locator('body')).toHaveAttribute('data-active', 'true');
  await expect(game.locator('output')).toHaveText('1');
});

test('failed loading has a reachable retry and Home exit', async ({ page }) => {
  await page.clock.install();
  await page.route(gameUrl, route => route.abort());
  await page.goto('/?tab=bentoku');
  const shell = page.locator('[data-game-shell="bentoku"]');
  await expect(shell).toBeVisible();
  await page.clock.fastForward(20_001);
  await expect(shell.getByRole('alert')).toBeVisible();
  await page.unroute(gameUrl);
  await page.route(gameUrl, route => route.fulfill({ contentType: 'text/html', body: hostedPage }));
  await shell.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(shell).toHaveAttribute('data-status', 'ready');
  await shell.getByRole('button', { name: 'All games', exact: true }).click();
  await expect(page.getByTestId('home-catalogue')).toBeVisible();
  await page.locator('[data-home-game="garden"]').click();
  await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab', 'garden');
  await expect(page.locator('iframe[title="Bentoku"]')).toHaveCount(0);
});
