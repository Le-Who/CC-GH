import { openHome, selectHomeGame } from './helpers/home.js';
import { test, expect } from '@playwright/test';
import { expectBloxCanvas, expectBloxLayout } from './helpers/blox-v2.js';
import { expectControlPainted, measureControlPaint } from './helpers/control-paint.js';

test.use({ viewport:{width:495,height:772}, deviceScaleFactor:2, isMobile:false, hasTouch:true });

async function startBlox(page, { fullLayout = false } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('gh_dev_user_id',`pause_paint_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    localStorage.setItem('garden_shelf_language','en');
  });
  await page.goto('/');
  await expect(page.locator('.status-dot.ready')).toBeVisible({timeout:15000});
  await selectHomeGame(page, 'blox');
  await page.getByRole('button',{name:/^Start$/}).click();
  if (fullLayout) await expectBloxLayout(page);
  else await expectBloxCanvas(page);
  const actions=page.locator('[data-hud-region="bloxActions"]');
  const pause=actions.locator('[data-game-pause]');
  await expect(pause).toHaveAccessibleName('Pause');
  return { actions, pause };
}

async function coverActions(actions) {
  const original=await actions.evaluate(node => {
    const shell=node.closest('[data-game-shell="blox"]');
    const pause=node.querySelector('[data-game-pause]');
    const hud=shell.querySelector('.bx-hud');
    const rect=pause.getBoundingClientRect();
    const result={
      style:{value:node.style.getPropertyValue('z-index'),priority:node.style.getPropertyPriority('z-index')},
      zIndex:Number(getComputedStyle(node).zIndex),
      hudZIndex:Number(getComputedStyle(hud).zIndex),
      hudPointerEvents:getComputedStyle(hud).pointerEvents,
      box:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
      metrics:[...shell.querySelectorAll('.bx-metric')].map(metric=>metric.textContent),
    };
    node.style.setProperty('z-index','0','important');
    result.coveredZIndex=Number(getComputedStyle(node).zIndex);
    return result;
  });
  expect(original.hudPointerEvents).toBe('none');
  expect(original.coveredZIndex).toBeLessThan(original.hudZIndex);
  return original;
}

async function restoreActions(actions, original) {
  return actions.evaluate((node,style) => {
    if (style.value) node.style.setProperty('z-index',style.value,style.priority);
    else node.style.removeProperty('z-index');
    return Number(getComputedStyle(node).zIndex);
  },original.style);
}

// Each case has its own page and the existing 30s test deadline. A real
// visible/hidden pair remains bounded to 20s and never reuses another test's
// pixels. The matrix separately retains every dialog-action audit.
test('Blox corrected Pause paints within the narrow-window gameplay layout', async ({page},testInfo) => {
  const {pause}=await startBlox(page,{fullLayout:true});
  await test.step('capture corrected Pause and its hidden reference',
    ()=>expectControlPainted(page,pause,testInfo,'fixed-pause'),{timeout:20_000});
});

test('Blox opaque HUD cover defeats paint visibility despite a hittable Pause', async ({page},testInfo) => {
  const {actions,pause}=await startBlox(page);
  const original=await coverActions(actions);
  let comparisonError;
  try {
    const covered=await test.step('capture covered Pause and its hidden reference',
      ()=>measureControlPaint(page,pause),{timeout:20_000});
    await testInfo.attach('old-layer-visible-control',{body:covered.visible,contentType:'image/png'});
    await testInfo.attach('old-layer-hidden-control',{body:covered.hidden,contentType:'image/png'});
    expect(covered.box).toEqual(original.box);
    expect(covered.changedPixels,'old hit-testing passes, but the action contributes no discernible pixels').toBeLessThanOrEqual(24);
    expect(await page.locator('.bx-metric').allTextContents()).toEqual(original.metrics);
  } catch (error) {
    comparisonError=error;
    throw error;
  } finally {
    if (!page.isClosed()) {
      try { await restoreActions(actions,original); }
      catch (error) { if (!comparisonError) throw error; }
    }
  }
});

test('Blox restored Pause paints and opens the paused dialog', async ({page},testInfo) => {
  const {actions,pause}=await startBlox(page);
  const original=await coverActions(actions);
  const restoredZIndex=await restoreActions(actions,original);
  expect(restoredZIndex).toBe(original.zIndex);
  expect(restoredZIndex).toBeGreaterThan(original.hudZIndex);
  const restored=await test.step('capture restored Pause and its hidden reference',
    ()=>expectControlPainted(page,pause,testInfo,'restored-pause'),{timeout:20_000});
  expect(restored.box).toEqual(original.box);
  expect(await page.locator('.bx-metric').allTextContents()).toEqual(original.metrics);
  await test.step('activate the restored Pause control', async () => {
    await pause.click();
    await expect(page.locator('[data-game-shell="blox"]')).toHaveAttribute('data-bx-phase','paused');
    await expect(page.locator('.bottom-tabs')).toHaveCount(0);
    const dialog=page.locator('[data-game-shell="blox"] .bx-dialog[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal','true');
  });
});
