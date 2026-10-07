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
const sizes=[[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]];
for (const [width,height] of sizes) test(`Home toggle and Garden persistence ${width}x${height}`,async({browser},info)=>{
 const mobile=width<1100, context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===390?2:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','home_theme_matrix');localStorage.setItem('garden_shelf_language','en');if(!localStorage.getItem('game_hub_ui_theme'))localStorage.setItem('game_hub_ui_theme','light');});
 await mountHomePlayerFixture(page);
 const surface=()=>page.locator('.home-catalogue').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
 const proof={width,height,errors};
 try {
 await page.goto(info.project.use.baseURL+'/');await expect(page.locator('.gs2-stage')).toBeVisible();
 await openHome(page);await page.locator('.home-profile summary').click();
 proof.before=await surface();
 await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-ui-theme','dark');
 proof.after=await surface();
 expect(proof.after.background).not.toBe(proof.before.background);expect(proof.after.color).not.toBe(proof.before.color);
 await page.locator('.home-catalogue').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:`${OUT}/${width}x${height}-home-dark.png`});
 for(const card of await page.locator('[data-home-game]').all()){
  await card.scrollIntoViewIfNeeded();
  expect(await card.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth+1;})).toBe(true);
 }
 await page.getByRole('button',{name:'Close Home',exact:true}).click();
 await page.locator('.gs2-settings').click();
 await expect(page.getByRole('button',{name:'Dark theme',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Light theme',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-ui-theme','light');
 proof.gardenLight=await page.locator('.gs2-dialog').evaluate(el=>getComputedStyle(el).backgroundColor);
 await page.getByRole('button',{name:'Dark theme',exact:true}).click();
 proof.gardenDark=await page.locator('.gs2-dialog').evaluate(el=>getComputedStyle(el).backgroundColor);
 expect(proof.gardenDark).not.toBe(proof.gardenLight);
 await page.screenshot({path:`${OUT}/${width}x${height}-garden-settings-dark.png`});
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.reload();await expect(page.locator('.gs2-stage')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-ui-theme','dark');
 await openHome(page);await page.locator('.home-profile summary').click();await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-ui-theme','light');
 await page.locator('.home-catalogue').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`${OUT}/${width}x${height}-home-light.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
 } finally {await fs.writeFile(`${OUT}/${width}x${height}-theme-proof.json`,JSON.stringify(proof,null,2));await context.close();}
});
for(const id of ['blox','bubbo','trivia'])test(`capture actual ${id} gameplay`,async({page})=>{
 await page.setViewportSize({width:800,height:600});
 await page.goto(`/?tab=${id}`);
 if(id==='blox'){
  const shell=page.locator('[data-game-shell="blox"]');await expect(shell).toBeVisible();await shell.getByRole('button',{name:'Start',exact:true}).click();
  await expect(page.locator('.bx-keyboard-tray')).toBeVisible();
  const slot=page.locator('.bx-keyboard-slot').first();await slot.focus();await page.keyboard.press('Enter');await page.locator('.bx-keyboard-board').focus();await page.keyboard.press('Enter');
 }else if(id==='bubbo'){
  await page.getByTestId('bb-start').click();await expect(page.getByTestId('bb-fire')).toBeVisible();
 }else{
  await page.getByTestId('trv2-start').click();await expect(page.locator('.trv2-question')).toBeVisible();
 }
 await page.waitForTimeout(600);
 await page.screenshot({path:`${OUT}/${id}-actual-gameplay.png`});
 await fs.writeFile(`${OUT}/${id}-dom.txt`,await page.locator('body').innerText());
});
