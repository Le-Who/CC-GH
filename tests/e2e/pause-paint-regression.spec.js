import { test, expect } from '@playwright/test';
import { expectBloxLayout, pauseBlox } from './helpers/blox-v2.js';
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
  await expectBloxLayout(page);
  const actions=page.locator('[data-hud-region="bloxActions"]');
  const pause=actions.locator('[data-game-pause]');
  await expect(pause).toHaveAccessibleName('Pause');
  const fixed=await test.step('capture corrected Pause and the empty panel reference',()=>expectControlPainted(page,pause,testInfo,'fixed-pause'));
  const metrics=await page.locator('.bx-metric').allTextContents();
  const old=await actions.evaluate(node=>({value:node.style.getPropertyValue('z-index'),priority:node.style.getPropertyPriority('z-index')}));
  let comparisonError;
  try {
    // Recreate the shipped ordering without changing layout, art or pointer input.
    await actions.evaluate(node=>node.style.setProperty('z-index','0','important'));
    await expect(page.locator('.bx-hud')).toHaveCSS('pointer-events','none');
    // The empty panel is identical with either action stacking level: the
    // action region itself has no background and this run has no player input.
    // Reuse that exact crop, preserving both pixel assertions with fewer GPU
    // captures. The matrix still captures independent visible/hidden pairs.
    expect(await page.locator('.bx-metric').allTextContents()).toEqual(metrics);
    const covered=await test.step('capture original covered Pause against the same empty panel',()=>measureControlPaint(page,pause,{hiddenReference:fixed.hidden}));
    await testInfo.attach('old-layer-visible-control',{body:covered.visible,contentType:'image/png'});
    await testInfo.attach('old-layer-hidden-control',{body:covered.hidden,contentType:'image/png'});
    expect(covered.box).toEqual(fixed.box);
    expect(covered.changedPixels,'old hit-testing passes, but the action contributes no discernible pixels').toBeLessThanOrEqual(24);
  } catch (error) {
    comparisonError=error;
    throw error;
  } finally {
    if (!page.isClosed()) {
      try {
        await actions.evaluate((node,style)=>style.value?node.style.setProperty('z-index',style.value,style.priority):node.style.removeProperty('z-index'),old);
      } catch (error) { if (!comparisonError) throw error; }
    }
  }
  expect(await page.locator('.bx-metric').allTextContents()).toEqual(metrics);
  const restored=await test.step('capture restored Pause and confirm it paints again',()=>expectControlPainted(page,pause,testInfo,'restored-pause',{hiddenReference:fixed.hidden}));
  expect(restored.box).toEqual(fixed.box);
  await pauseBlox(page);
});
