import { test, expect } from '@playwright/test';
import { expectBloxCanvas, expectBloxLayout, pauseBlox } from './helpers/blox-v2.js';
import { expectControlPainted, measureControlPaint } from './helpers/control-paint.js';

test.use({ viewport:{width:495,height:772}, deviceScaleFactor:2, isMobile:false, hasTouch:true });

test('Blox Pause paint regression detects the original non-interactive opaque HUD cover', async ({page},testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('gh_dev_user_id',`pause_paint_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    localStorage.setItem('garden_shelf_language','en');
  });
  await page.goto('/');
  await expect(page.locator('.status-dot.ready')).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:/Blox/}).click();
  await page.getByRole('button',{name:/^Start$/}).click();
  await expectBloxCanvas(page);
  await expectBloxLayout(page);
  const actions=page.locator('[data-hud-region="bloxActions"]');
  const pause=actions.locator('[data-game-pause]');
  await expect(pause).toHaveAccessibleName('Pause');
  const fixed=await expectControlPainted(page,pause,testInfo,'fixed-pause');
  const old=await actions.evaluate(node=>({value:node.style.getPropertyValue('z-index'),priority:node.style.getPropertyPriority('z-index')}));
  try {
    // Recreate the shipped ordering without changing layout, art or pointer input.
    await actions.evaluate(node=>node.style.setProperty('z-index','0','important'));
    await expect(page.locator('.bx-hud')).toHaveCSS('pointer-events','none');
    const covered=await measureControlPaint(page,pause);
    await testInfo.attach('old-layer-visible-control',{body:covered.visible,contentType:'image/png'});
    await testInfo.attach('old-layer-hidden-control',{body:covered.hidden,contentType:'image/png'});
    expect(covered.box).toEqual(fixed.box);
    expect(covered.changedPixels,'old hit-testing passes, but the action contributes no discernible pixels').toBeLessThanOrEqual(24);
  } finally {
    await actions.evaluate((node,style)=>style.value?node.style.setProperty('z-index',style.value,style.priority):node.style.removeProperty('z-index'),old);
  }
  await expectControlPainted(page,pause,testInfo,'restored-pause');
  await pauseBlox(page);
});
