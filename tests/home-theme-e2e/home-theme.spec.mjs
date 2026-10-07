import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {openHome} from '../e2e/helpers/home.js';
import {mountHomePlayerFixture} from '../e2e/helpers/homePlayerFixture.js';
const OUT='test-results/home-theme';
test.beforeEach(async({page})=>{
 await fs.mkdir(OUT,{recursive:true});
 await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','home_theme_preview');localStorage.setItem('garden_shelf_language','en');if(!localStorage.getItem('game_hub_ui_theme'))localStorage.setItem('game_hub_ui_theme','light');});
 await mountHomePlayerFixture(page);
});
test('Home toggle visibly changes surface and persists across Garden and reload',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');await expect(page.locator('.gs2-stage')).toBeVisible();
 await openHome(page);await page.locator('.home-profile summary').click();
 const surface=()=>page.locator('.home-catalogue').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
 const before=await surface();await page.screenshot({path:`${OUT}/baseline-home-light.png`});
 await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-ui-theme','dark');
 const after=await surface();await page.screenshot({path:`${OUT}/baseline-home-dark.png`});
 await fs.writeFile(`${OUT}/theme-before-after.json`,JSON.stringify({before,after,stored:await page.evaluate(()=>localStorage.getItem('game_hub_ui_theme'))},null,2));
 expect(after.background).not.toBe(before.background);expect(after.color).not.toBe(before.color);
 await page.getByRole('button',{name:'Close Home',exact:true}).click();
 await page.locator('.gs2-settings').click();
 await expect(page.getByRole('button',{name:'Dark theme',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Light theme',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-ui-theme','light');
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.reload();await expect(page.locator('.gs2-stage')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-ui-theme','light');
});
for(const id of ['blox','bubbo','trivia'])test(`capture actual ${id} gameplay`,async({page})=>{
 await page.setViewportSize({width:800,height:600});
 await page.goto(`/?tab=${id}`);
 if(id==='blox'){
  const shell=page.locator('[data-game-shell="blox"]');await expect(shell).toBeVisible();await shell.getByRole('button',{name:'Start',exact:true}).click();
  await expect(page.locator('.bx-keyboard-tray')).toBeVisible();
  const slot=page.locator('.bx-keyboard-slot').first();await slot.click();await page.locator('.bx-keyboard-board').focus();await page.keyboard.press('Enter');
 }else if(id==='bubbo'){
  await page.getByTestId('bb-start').click();await expect(page.getByTestId('bb-fire')).toBeVisible();
 }else{
  await page.getByTestId('trv2-start').click();await expect(page.locator('.trv2-question')).toBeVisible();
 }
 await page.waitForTimeout(600);
 await page.screenshot({path:`${OUT}/${id}-actual-gameplay.png`});
 await fs.writeFile(`${OUT}/${id}-dom.txt`,await page.locator('body').innerText());
});
